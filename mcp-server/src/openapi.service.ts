import SwaggerParser from '@apidevtools/swagger-parser';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { Endpoint } from './entities/endpoint.entity';
import { FieldLink } from './entities/field-link.entity';
import { Project } from './entities/project.entity';
import { RequestParameter } from './entities/request-parameter.entity';
import { ResponseField } from './entities/response-field.entity';
import { ResponseMessage } from './entities/response-message.entity';

interface EndpointAnalysis {
  promptText: string;
  keywords: string[];
  intentPatterns: string[];
  embeddingVector?: number[];
}

@Injectable()
export class OpenapiService {
  private readonly logger = new Logger(OpenapiService.name);
  private readonly openai: OpenAI;

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
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  async parseAndStore(filePath: string): Promise<{ projectId: number; endpointsCount: number }> {
    try {
      this.logger.log(`Starting to parse OpenAPI file: ${filePath}`);
      
      // Parse OpenAPI specification
      const apiSpec = await SwaggerParser.dereference(filePath);
      
      // Create Project record
      const project = await this.createProjectFromSpec(apiSpec);
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

  async createProject(name: string, apiSpec: any): Promise<{ projectId: number; endpointsCount: number }> {
    try {
      this.logger.log(`Creating project "${name}" from JSON specification`);
      
      // Validate the spec
      if (!apiSpec || typeof apiSpec !== 'object') {
        throw new Error('Invalid API specification provided');
      }

      // Ensure we have the proper structure
      if (!apiSpec.info) {
        apiSpec.info = { title: name, version: '1.0.0' };
      } else {
        apiSpec.info.title = name; // Override with provided name
      }
      
      // Create Project record
      const project = await this.createProjectFromSpec(apiSpec);
      this.logger.log(`Created project: ${project.name} (ID: ${project.id})`);
      
      // Parse and store endpoints
      const endpointsCount = await this.parseEndpoints(apiSpec, project.id);
      this.logger.log(`Processed ${endpointsCount} endpoints`);
      
      // Create field links for API chaining
      await this.createFieldLinks();
      this.logger.log(`Created field links for API chaining`);
      
      return { projectId: project.id, endpointsCount };
    } catch (error) {
      this.logger.error(`Error creating project: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async createProjectFromSpec(apiSpec: any): Promise<Project> {
    // Extract base URL from servers section
    let baseUrl = '';
    let domain = '';
    let serverDescription = '';
    
    if (apiSpec.servers && apiSpec.servers.length > 0) {
      // Use the first server URL as base URL
      const firstServer = apiSpec.servers[0];
      baseUrl = firstServer.url || '';
      serverDescription = firstServer.description || '';
      
      // Extract domain from URL
      if (baseUrl) {
        try {
          if (baseUrl.startsWith('http')) {
            const url = new URL(baseUrl);
            domain = url.hostname;
          } else if (baseUrl.includes('://')) {
            const url = new URL(baseUrl);
            domain = url.hostname;
          } else if (baseUrl.startsWith('/')) {
            // Relative path - extract from known patterns
            if (apiSpec.info?.title?.includes('Swagger Petstore')) {
              domain = 'petstore3.swagger.io';
              baseUrl = `https://${domain}${baseUrl}`;
            }
          }
        } catch (error) {
          this.logger.warn(`Could not extract domain from URL: ${baseUrl}`);
        }
      }
      
      // Handle different URL formats
      if (baseUrl.startsWith('/')) {
        // Relative path - common in OpenAPI specs
        // For well-known APIs like Swagger Petstore, use the correct base
        if (apiSpec.info?.title?.includes('Swagger Petstore')) {
          baseUrl = `https://petstore3.swagger.io${baseUrl}`;
          domain = 'petstore3.swagger.io';
          this.logger.log(`Swagger Petstore detected, using base URL: ${baseUrl}`);
        } else {
          baseUrl = `{serverUrl}${baseUrl}`;
          this.logger.warn(`Relative server URL found: ${baseUrl}. You'll need to provide the base domain when making requests.`);
        }
      } else if (baseUrl.startsWith('http')) {
        // Full URL - ready to use
        this.logger.log(`Full server URL found: ${baseUrl}`);
      } else {
        // Handle server variables if present
        if (firstServer.variables) {
          baseUrl = this.resolveServerVariables(baseUrl, firstServer.variables);
          // Try to extract domain again after variable resolution
          try {
            if (baseUrl.startsWith('http')) {
              const url = new URL(baseUrl);
              domain = url.hostname;
            }
          } catch (error) {
            this.logger.warn(`Could not extract domain after variable resolution: ${baseUrl}`);
          }
        }
      }
      
      // Log all available servers
      if (apiSpec.servers.length > 1) {
        this.logger.log(`Multiple servers found (${apiSpec.servers.length}). Available servers:`);
        apiSpec.servers.forEach((server: any, index: number) => {
          this.logger.log(`  ${index + 1}. ${server.url} - ${server.description || 'No description'}`);
        });
      }
    } else {
      this.logger.warn('No servers section found in OpenAPI spec. Base URL will be empty.');
    }

    const projectData = {
      name: apiSpec.info?.title || 'Untitled OpenAPI Project',
      version: apiSpec.info?.version || '1.0.0',
      baseUrl: baseUrl,
      domain: domain,
      description: apiSpec.info?.description || serverDescription,
    };
    
    this.logger.log(`Creating project "${projectData.name}" with domain: ${domain} and base URL: ${baseUrl}`);
    return await this.projectRepo.save(projectData);
  }

  private resolveServerVariables(urlTemplate: string, variables: any): string {
    let resolvedUrl = urlTemplate;
    
    for (const [varName, varConfig] of Object.entries(variables)) {
      const placeholder = `{${varName}}`;
      const defaultValue = (varConfig as any).default || '';
      
      if (resolvedUrl.includes(placeholder)) {
        resolvedUrl = resolvedUrl.replace(placeholder, defaultValue);
        this.logger.debug(`Resolved server variable ${varName} = ${defaultValue}`);
      }
    }
    
    return resolvedUrl;
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
    // First, create basic endpoint without AI analysis
    const basicEndpoint = await this.endpointRepo.save({
      projectId,
      path,
      method: method.toUpperCase(),
      summary: operation.summary || operation.description || `${method.toUpperCase()} ${path}`,
    });

    this.logger.debug(`Created endpoint: ${method.toUpperCase()} ${path} (ID: ${basicEndpoint.id})`);

    // Parse request parameters first (needed for AI analysis)
    await this.parseRequestParameters(basicEndpoint.id, operation.parameters || []);

    // Parse request body parameters
    if (operation.requestBody) {
      await this.parseRequestBody(basicEndpoint.id, operation.requestBody);
    }

    // Parse response fields
    await this.parseResponses(basicEndpoint.id, operation.responses || {});

    // Now perform AI analysis with complete endpoint data
    await this.performEndpointAnalysis(basicEndpoint.id, path, method, operation);
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

  /**
   * Perform AI analysis on an endpoint to generate natural language descriptions
   */
  private async performEndpointAnalysis(endpointId: number, path: string, method: string, operation: any): Promise<void> {
    try {
      // Get complete endpoint data with parameters
      const endpoint = await this.endpointRepo.findOne({
        where: { id: endpointId },
        relations: ['requestParameters', 'responseFields']
      });

      if (!endpoint) {
        this.logger.warn(`Endpoint ${endpointId} not found for analysis`);
        return;
      }

      // Generate AI analysis
      const analysis = await this.generateEndpointAnalysis(endpoint, operation);

      // Get embedding vector for semantic search
      const embeddingVector = await this.generateEmbedding(analysis.promptText);

      // Update endpoint with AI analysis
      await this.endpointRepo.update(endpointId, {
        promptText: analysis.promptText,
        keywords: JSON.stringify(analysis.keywords),
        intentPatterns: JSON.stringify(analysis.intentPatterns),
        embeddingVector: JSON.stringify(embeddingVector)
      });

      this.logger.debug(`AI analysis completed for endpoint: ${method.toUpperCase()} ${path}`);

    } catch (error) {
      this.logger.error(`Failed to analyze endpoint ${endpointId}: ${error.message}`);
      // Continue processing other endpoints even if one fails
    }
  }

  /**
   * Generate natural language analysis for an endpoint using AI
   */
  private async generateEndpointAnalysis(endpoint: Endpoint, operation: any): Promise<EndpointAnalysis> {
    const prompt = this.buildAnalysisPrompt(endpoint, operation);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an API documentation expert. Generate clear, natural language descriptions for API endpoints that help users understand what each endpoint does and when to use it.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 800
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      return this.parseAnalysisResponse(content, endpoint);

    } catch (error) {
      this.logger.warn(`AI analysis failed for endpoint ${endpoint.id}: ${error.message}`);
      return this.generateFallbackAnalysis(endpoint, operation);
    }
  }

  /**
   * Build prompt for AI analysis
   */
  private buildAnalysisPrompt(endpoint: Endpoint, operation: any): string {
    const parameters = endpoint.requestParameters || [];
    const responseFields = endpoint.responseFields || [];

    return `Analyze this API endpoint and provide a structured analysis:

ENDPOINT DETAILS:
- Method: ${endpoint.method}
- Path: ${endpoint.path}
- Summary: ${endpoint.summary || 'No summary provided'}
- Description: ${operation.description || 'No description provided'}

PARAMETERS:
${parameters.map(p => `- ${p.name} (${p.in}, ${p.type}${p.required ? ', required' : ''}): ${p.description || 'No description'}`).join('\n')}

RESPONSE FIELDS:
${responseFields.map(f => `- ${f.jsonPath} (${f.type}): ${f.description || 'No description'}`).join('\n')}

Please provide your analysis in this exact format:

PROMPT_TEXT:
[Write a single, clear sentence describing what this endpoint does and when to use it. Focus on the business purpose, not technical details.]

KEYWORDS:
[List relevant keywords that users might search for, separated by commas. Include both technical terms and business terms.]

INTENT_PATTERNS:
[List common ways users might express their intent to use this endpoint, separated by commas. Use natural language patterns like "get all users", "create new order", etc.]

Example:
PROMPT_TEXT:
Retrieves a list of all active users in the system with their basic profile information.

KEYWORDS:
users, list, get users, all users, user list, profile, active users

INTENT_PATTERNS:
show me all users, get user list, list all users, display users, find all users, retrieve users`;
  }

  /**
   * Parse AI response into structured analysis
   */
  private parseAnalysisResponse(content: string, endpoint: Endpoint): EndpointAnalysis {
    const promptTextMatch = content.match(/PROMPT_TEXT:\s*([^\n]+)/);
    const keywordsMatch = content.match(/KEYWORDS:\s*([^\n]+)/);
    const intentPatternsMatch = content.match(/INTENT_PATTERNS:\s*([^\n]+)/);

    const promptText = promptTextMatch?.[1]?.trim() || 
      `${endpoint.method} ${endpoint.path} - ${endpoint.summary || 'API endpoint'}`;

    const keywords = keywordsMatch?.[1]?.split(',').map(k => k.trim()).filter(k => k) || 
      [endpoint.method.toLowerCase(), ...endpoint.path.split('/').filter(p => p && !p.startsWith('{'))];

    const intentPatterns = intentPatternsMatch?.[1]?.split(',').map(p => p.trim()).filter(p => p) || 
      [`${endpoint.method.toLowerCase()} ${endpoint.path}`, `use ${endpoint.path}`];

    return {
      promptText,
      keywords,
      intentPatterns
    };
  }

  /**
   * Generate embedding vector for semantic search
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      });

      return response.data[0].embedding;

    } catch (error) {
      this.logger.warn(`Failed to generate embedding: ${error.message}`);
      // Return zero vector as fallback
      return new Array(1536).fill(0);
    }
  }

  /**
   * Generate fallback analysis when AI fails
   */
  private generateFallbackAnalysis(endpoint: Endpoint, operation: any): EndpointAnalysis {
    const methodAction = {
      'GET': 'retrieves',
      'POST': 'creates',
      'PUT': 'updates',
      'DELETE': 'deletes',
      'PATCH': 'modifies'
    };

    const action = methodAction[endpoint.method] || 'processes';
    const resource = endpoint.path.split('/').filter(p => p && !p.startsWith('{')).pop() || 'data';

    const promptText = `${action} ${resource} ${endpoint.method === 'GET' ? 'from' : 'in'} the system`;

    const keywords = [
      endpoint.method.toLowerCase(),
      resource,
      action,
      ...endpoint.path.split('/').filter(p => p && !p.startsWith('{'))
    ];

    const intentPatterns = [
      `${action} ${resource}`,
      `${endpoint.method.toLowerCase()} ${resource}`,
      `${action} ${endpoint.path.replace(/\{[^}]+\}/g, 'item')}`
    ];

    return {
      promptText,
      keywords,
      intentPatterns
    };
  }
}
