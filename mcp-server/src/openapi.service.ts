import SwaggerParser from '@apidevtools/swagger-parser';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Endpoint } from './entities/endpoint.entity';
import { FieldLink } from './entities/field-link.entity';
import { Project } from './entities/project.entity';
import { RequestParameter } from './entities/request-parameter.entity';
import { ResponseField } from './entities/response-field.entity';
import { ResponseMessage } from './entities/response-message.entity';
import OpenAI from 'openai';
import { findBestMatch } from 'string-similarity';

@Injectable()
export class OpenapiService {
  private readonly logger = new Logger(OpenapiService.name);
  private openai: OpenAI | null;

  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(Endpoint)
    private endpointRepo: Repository<Endpoint>,
    @InjectRepository(RequestParameter)
    private requestParameterRepo: Repository<RequestParameter>,
    @InjectRepository(ResponseField)
    private responseFieldRepo: Repository<ResponseField>,
    @InjectRepository(ResponseMessage)
    private responseMessageRepo: Repository<ResponseMessage>,
    @InjectRepository(FieldLink)
    private fieldLinkRepo: Repository<FieldLink>,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async parseAndStore(filePath: string): Promise<{ projectId: number; endpointsCount: number }> {
    try {
      this.logger.log(`Starting to parse OpenAPI file: ${filePath}`);
      
      // Parse OpenAPI specification
      const apiSpec = await SwaggerParser.dereference(filePath);
      
      // Create Project record
      const project = await this.createProject(apiSpec);
      this.logger.log(`Created project: ${project.name} (ID: ${project.id})`);
      
      // Parse and store endpoints
      const endpointsCount = await this.parseEndpoints(apiSpec, project.id);
      this.logger.log(`Processed ${endpointsCount} endpoints`);
      
      // Create field links for API chaining
      await this.createFieldLinks();
      this.logger.log(`Created field links for API chaining`);
      
      return { projectId: project.id, endpointsCount };
    } catch (error) {
      this.logger.error(`Error parsing OpenAPI file: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async createProject(apiSpec: any): Promise<Project> {
    const projectData = {
      name: apiSpec.info?.title || 'Untitled OpenAPI Project',
      version: apiSpec.info?.version || '1.0.0',
    };
    
    return await this.projectRepo.save(projectData);
  }

  private async parseEndpoints(apiSpec: any, projectId: number): Promise<number> {
    const paths = apiSpec.paths || {};
    let endpointsCount = 0;

    for (const [path, pathItem] of Object.entries(paths)) {
      const methods = pathItem as Record<string, any>;
      
      for (const [method, operation] of Object.entries(methods)) {
        if (this.isHttpMethod(method)) {
          await this.createEndpoint(projectId, path, method, operation);
          endpointsCount++;
        }
      }
    }

    return endpointsCount;
  }

  private async createEndpoint(projectId: number, path: string, method: string, operation: any): Promise<void> {
    const prompt = await this.generateEndpointPrompt(path, method, operation);
    // Create endpoint
    const endpoint = await this.endpointRepo.save({
      projectId,
      path,
      method: method.toUpperCase(),
      summary: operation.summary || operation.description || `${method.toUpperCase()} ${path}`,
      prompt,
    });

    this.logger.debug(`Created endpoint: ${method.toUpperCase()} ${path} (ID: ${endpoint.id})`);

    // Parse request parameters
    await this.parseRequestParameters(endpoint.id, operation.parameters || []);

    // Parse request body parameters
    if (operation.requestBody) {
      await this.parseRequestBody(endpoint.id, operation.requestBody);
    }

    // Parse response fields
    await this.parseResponses(endpoint.id, operation.responses || {});
  }

  private async parseRequestParameters(endpointId: number, parameters: any[]): Promise<void> {
    for (const param of parameters) {
      const requestParam = {
        endpointId,
        name: param.name || 'unnamed',
        in: param.in || 'query', // path, query, header, body
        type: this.getParameterType(param.schema),
        required: param.required || false,
        description: param.description || '',
      };

      await this.requestParameterRepo.save(requestParam);
      this.logger.debug(`Created request parameter: ${requestParam.name} (${requestParam.in})`);
    }
  }

  private async parseRequestBody(endpointId: number, requestBody: any): Promise<void> {
    const content = requestBody.content || {};
    
    for (const [mediaType, mediaTypeObject] of Object.entries(content)) {
      if (mediaType.includes('json')) {
        const schema = (mediaTypeObject as any).schema;
        if (schema) {
          await this.parseSchemaAsRequestParams(endpointId, schema, 'body');
        }
      }
    }
  }

  private async parseSchemaAsRequestParams(endpointId: number, schema: any, location: string, prefix = ''): Promise<void> {
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const fullName = prefix ? `${prefix}.${propName}` : propName;
        const requestParam = {
          endpointId,
          name: fullName,
          in: location,
          type: this.getParameterType(propSchema),
          required: schema.required?.includes(propName) || false,
          description: (propSchema as any).description || '',
        };

        await this.requestParameterRepo.save(requestParam);
        
        // Recursive parsing for nested objects
        if ((propSchema as any).properties) {
          await this.parseSchemaAsRequestParams(endpointId, propSchema, location, fullName);
        }
      }
    }
  }

  private async parseResponses(endpointId: number, responses: any): Promise<void> {
    for (const [statusCode, response] of Object.entries(responses)) {
      // Create response message
      await this.createResponseMessage(endpointId, statusCode, response as any);
      
      // Parse response content/schema
      const content = (response as any).content || {};
      for (const [mediaType, mediaTypeObject] of Object.entries(content)) {
        if (mediaType.includes('json')) {
          const schema = (mediaTypeObject as any).schema;
          if (schema) {
            await this.parseResponseSchema(endpointId, schema);
          }
        }
      }
    }
  }

  private async createResponseMessage(endpointId: number, statusCode: string, response: any): Promise<void> {
    const statusCodeNum = statusCode === 'default' ? 0 : parseInt(statusCode);
    
    const responseMessage = {
      endpointId,
      statusCode: statusCodeNum,
      message: response.description || `HTTP ${statusCode}`,
      description: response.description || '',
      suggestion: this.generateSuggestion(statusCodeNum, response.description),
    };

    await this.responseMessageRepo.save(responseMessage);
    this.logger.debug(`Created response message: ${statusCode} - ${responseMessage.message}`);
  }

  private async parseResponseSchema(endpointId: number, schema: any, jsonPath = '$'): Promise<void> {
    if (schema.type === 'object' && schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const fieldJsonPath = `${jsonPath}.${propName}`;
        
        const responseField = {
          endpointId,
          jsonPath: fieldJsonPath,
          type: this.getParameterType(propSchema),
          description: (propSchema as any).description || '',
        };

        await this.responseFieldRepo.save(responseField);
        this.logger.debug(`Created response field: ${fieldJsonPath}`);
        
        // Recursive parsing for nested objects
        if ((propSchema as any).properties) {
          await this.parseResponseSchema(endpointId, propSchema, fieldJsonPath);
        }
      }
    } else if (schema.type === 'array' && schema.items) {
      // Handle array responses
      const arrayPath = `${jsonPath}[*]`;
      if (schema.items.properties) {
        await this.parseResponseSchema(endpointId, schema.items, arrayPath);
      } else {
        const responseField = {
          endpointId,
          jsonPath: arrayPath,
          type: this.getParameterType(schema.items),
          description: schema.description || 'Array item',
        };
        await this.responseFieldRepo.save(responseField);
      }
    } else {
      // Simple field
      const responseField = {
        endpointId,
        jsonPath,
        type: this.getParameterType(schema),
        description: schema.description || '',
      };
      await this.responseFieldRepo.save(responseField);
    }
  }

  private async createFieldLinks(): Promise<void> {
    // Find potential field links based on naming conventions
    const responseFields = await this.responseFieldRepo.find({
      relations: ['endpoint'],
    });
    
    const requestParams = await this.requestParameterRepo.find({
      relations: ['endpoint'],
    });

    for (const responseField of responseFields) {
      // Look for ID fields that might link to other endpoints
      if (responseField.jsonPath.toLowerCase().includes('id')) {
        const idFieldName = this.extractFieldName(responseField.jsonPath);
        
        // Find endpoints that might use this ID
        for (const requestParam of requestParams) {
          if (this.isLinkableField(idFieldName, requestParam.name)) {
            const fieldLink = {
              fromFieldId: responseField.id,
              toEndpointId: requestParam.endpointId,
              toParamName: requestParam.name,
              relationType: 'id_reference',
              description: `${responseField.jsonPath} can be used as ${requestParam.name} in ${requestParam.endpoint.method} ${requestParam.endpoint.path}`,
            };

            await this.fieldLinkRepo.save(fieldLink);
            this.logger.debug(`Created field link: ${responseField.jsonPath} -> ${requestParam.name}`);
          }
        }
      }
    }
  }

  private isHttpMethod(method: string): boolean {
    return ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method.toLowerCase());
  }

  private getParameterType(schema: any): string {
    if (!schema) return 'unknown';
    
    if (schema.type) {
      if (schema.format) {
        return `${schema.type}(${schema.format})`;
      }
      return schema.type;
    }
    
    if (schema.$ref) {
      return schema.$ref.split('/').pop() || 'reference';
    }
    
    return 'unknown';
  }

  private async generateEndpointPrompt(path: string, method: string, operation: any): Promise<string> {
    const summary = operation.summary || operation.description || `${method.toUpperCase()} ${path}`;
    const params = (operation.parameters || [])
      .map((p: any) => `${p.name} in ${p.in}`)
      .join(', ');
    const base = `${method.toUpperCase()} ${path} - ${summary}` + (params ? ` (params: ${params})` : '');

    if (!this.openai) {
      return base;
    }

    try {
      const messages = [
        { role: 'system', content: 'You generate concise natural language descriptions of API endpoints.' },
        { role: 'user', content: `Describe the purpose of this endpoint in one sentence: ${base}` },
      ];
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.2,
        max_tokens: 60,
      });
      return completion.choices[0].message.content.trim();
    } catch (err: any) {
      this.logger.error(`OpenAI prompt generation failed for ${method.toUpperCase()} ${path}: ${err.message}`);
      return base;
    }
  }

  async findBestEndpoint(message: string): Promise<Endpoint | null> {
    const endpoints = await this.endpointRepo.find();
    if (endpoints.length === 0) return null;

    const prompts = endpoints.map((e) => e.prompt || e.summary || `${e.method} ${e.path}`);
    const { bestMatchIndex } = findBestMatch(message, prompts);
    return endpoints[bestMatchIndex] || null;
  }

  private generateSuggestion(statusCode: number, description: string): string {
    const suggestions: Record<number, string> = {
      400: 'Check request parameters and ensure all required fields are provided',
      401: 'Verify authentication credentials and token validity',
      403: 'Check user permissions and authorization',
      404: 'Verify the resource ID exists and the endpoint path is correct',
      422: 'Validate input data format and business rules',
      500: 'Check server logs and contact system administrator',
    };

    return suggestions[statusCode] || `Handle ${statusCode} response appropriately`;
  }

  private extractFieldName(jsonPath: string): string {
    const parts = jsonPath.split('.');
    return parts[parts.length - 1].replace(/\[.*\]/, '');
  }

  private isLinkableField(responseFieldName: string, requestParamName: string): boolean {
    const responseField = responseFieldName.toLowerCase();
    const requestParam = requestParamName.toLowerCase();
    
    // Check for exact matches or similar patterns
    if (responseField === requestParam) return true;
    if (responseField.includes('id') && requestParam.includes('id')) {
      // Check if they refer to the same entity (e.g., petId -> petId, userId -> id)
      const responseEntity = responseField.replace('id', '');
      const requestEntity = requestParam.replace('id', '');
      return responseEntity === requestEntity || responseEntity === '' || requestEntity === '';
    }
    
    return false;
  }
}
