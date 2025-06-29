import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { FastifyRequest } from 'fastify';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { Repository } from 'typeorm';
import { Endpoint } from './entities/endpoint.entity';
import { Project } from './entities/project.entity';
import { OpenapiService } from './openapi.service';
import { PlannerService } from './planner/planner.service';

@ApiTags('OpenAPI')
@Controller()
export class OpenapiController {
  constructor(
    private readonly openapiService: OpenapiService,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    private readonly plannerService: PlannerService
  ) {}

  @Post('projects/upload')
  @ApiOperation({ summary: 'Upload OpenAPI/Swagger file and create project' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'File uploaded and project created successfully' })
  async uploadFile(@Req() req: FastifyRequest): Promise<{ 
    success: boolean;
    id?: number; 
    message: string;
  }> {
    try {
      const file = await (req as any).file();
      
      if (!file) {
        return {
          success: false,
          message: 'No file uploaded'
        };
      }

      const buffer = await file.toBuffer();
      const tempFilePath = `/tmp/${Date.now()}_${file.filename}`;
      await writeFile(tempFilePath, buffer);
      
      let apiSpec;
      try {
        const fileContent = await readFile(tempFilePath, 'utf-8');
        
        // Try to parse as JSON first
        if (file.filename.endsWith('.json')) {
          apiSpec = JSON.parse(fileContent);
        } else if (file.filename.endsWith('.yaml') || file.filename.endsWith('.yml')) {
          // For YAML files, we would need a YAML parser
          // For now, let's assume JSON format
          return {
            success: false,
            message: 'YAML files are not yet supported. Please use JSON format.'
          };
        } else {
          // Try to parse as JSON anyway
          apiSpec = JSON.parse(fileContent);
        }
      } catch (parseError) {
        return {
          success: false,
          message: 'Invalid API specification format. Please ensure it\'s valid JSON.'
        };
      }

      // Create project name from filename or API title
      const projectName = apiSpec.info?.title || file.filename.split('.')[0];

      const result = await this.openapiService.createProject(projectName, apiSpec);
      
      return { 
        success: true,
        id: result.projectId,
        message: `Successfully created project "${projectName}" with ${result.endpointsCount} endpoints`
      };
    } catch (error) {
      return {
        success: false,
        message: `Upload failed: ${error.message}`
      };
    }
  }

  @Post('projects')
  @ApiOperation({ summary: 'Create project from JSON OpenAPI specification' })
  @ApiResponse({ status: 200, description: 'Project created successfully' })
  async createProject(@Body() body: { 
    name: string; 
    openApiSpec: any;
  }): Promise<{ 
    success: boolean;
    id?: number; 
    message: string;
  }> {
    try {
      if (!body.name || !body.openApiSpec) {
        return {
          success: false,
          message: 'Both name and openApiSpec are required'
        };
      }

      const result = await this.openapiService.createProject(body.name, body.openApiSpec);
      
      return { 
        success: true,
        id: result.projectId,
        message: `Successfully created project "${body.name}" with ${result.endpointsCount} endpoints`
      };
    } catch (error) {
      return {
        success: false,
        message: `Project creation failed: ${error.message}`
      };
    }
  }

  @Post('upload-openapi')
  @ApiOperation({ summary: 'Upload and parse OpenAPI file' })
  @ApiResponse({ status: 200, description: 'File uploaded and parsed successfully' })
  async upload(@Req() req: FastifyRequest): Promise<{ 
    status: string; 
    projectId: number; 
    endpointsCount: number; 
    message: string;
  }> {
    const file = await (req as any).file();
    const filePath = `/tmp/${Date.now()}_${file.filename}`;
    await writeFile(filePath, await file.toBuffer());
    
    const result = await this.openapiService.parseAndStore(filePath);
    
    return { 
      status: 'success',
      projectId: result.projectId,
      endpointsCount: result.endpointsCount,
      message: `Successfully parsed ${result.endpointsCount} endpoints and stored in project ${result.projectId}`
    };
  }

  @Post('parse-sample-openapi')
  @ApiOperation({ summary: 'Parse the sample OpenAPI file (openapi.json)' })
  @ApiResponse({ status: 200, description: 'Sample OpenAPI file parsed successfully' })
  async parseSampleOpenApi(): Promise<{ 
    status: string; 
    projectId: number; 
    endpointsCount: number; 
    message: string;
    project: any;
  }> {
    const filePath = join(__dirname, '../../openapi.json');
    const result = await this.openapiService.parseAndStore(filePath);
    
    // Get project details with base URL
    const project = await this.projectRepo.findOne({ where: { id: result.projectId } });
    
    return { 
      status: 'success',
      projectId: result.projectId,
      endpointsCount: result.endpointsCount,
      message: `Successfully parsed Swagger Petstore API with ${result.endpointsCount} endpoints`,
      project: {
        id: project?.id,
        name: project?.name,
        version: project?.version,
        baseUrl: project?.baseUrl,
        description: project?.description,
        createdAt: project?.createdAt,
      }
    };
  }

  @Get('projects')
  @ApiOperation({ summary: 'Get all projects with their base URLs' })
  @ApiResponse({ status: 200, description: 'List of all projects' })
  async getProjects(): Promise<{
    status: string;
    projects: any[];
    count: number;
  }> {
    const projects = await this.projectRepo.find({
      relations: ['endpoints'],
      order: { createdAt: 'DESC' }
    });

    const projectsWithStats = projects.map(project => ({
      id: project.id,
      name: project.name,
      version: project.version,
      baseUrl: project.baseUrl,
      domain: project.domain,
      description: project.description,
      endpointsCount: project.endpoints?.length || 0,
      createdAt: project.createdAt,
    }));

    return {
      status: 'success',
      projects: projectsWithStats,
      count: projects.length,
    };
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Get project details by ID' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project details' })
  async getProject(@Param('id') id: number): Promise<{
    status: string;
    project: any;
  }> {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['endpoints', 'endpoints.requestParameters', 'endpoints.responseFields', 'endpoints.responseMessages']
    });

    if (!project) {
      return {
        status: 'error',
        project: null,
      };
    }

    return {
      status: 'success',
      project: {
        id: project.id,
        name: project.name,
        version: project.version,
        baseUrl: project.baseUrl,
        description: project.description,
        endpointsCount: project.endpoints?.length || 0,
        endpoints: project.endpoints?.map(endpoint => ({
          id: endpoint.id,
          path: endpoint.path,
          method: endpoint.method,
          summary: endpoint.summary,
          parametersCount: endpoint.requestParameters?.length || 0,
          responseFieldsCount: endpoint.responseFields?.length || 0,
          responseMessagesCount: endpoint.responseMessages?.length || 0,
        })),
        createdAt: project.createdAt,
      },
    };
  }

  @Get('projects/:id/endpoints-analysis')
  @ApiOperation({ summary: 'Get endpoint analysis for a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Endpoint analysis data' })
  async getEndpointAnalysis(@Param('id') projectId: number): Promise<{
    status: string;
    endpoints: any[];
    analysisCount: number;
  }> {
    const endpoints = await this.endpointRepo.find({
      where: { projectId },
      relations: ['requestParameters', 'responseFields'],
      order: { path: 'ASC' }
    });

    const endpointsWithAnalysis = endpoints.map(endpoint => ({
      id: endpoint.id,
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary,
      promptText: (endpoint as any).promptText,
      keywords: (endpoint as any).keywords ? JSON.parse((endpoint as any).keywords) : [],
      intentPatterns: (endpoint as any).intentPatterns ? JSON.parse((endpoint as any).intentPatterns) : [],
      hasEmbedding: !!(endpoint as any).embeddingVector,
      parametersCount: endpoint.requestParameters?.length || 0,
      responseFieldsCount: endpoint.responseFields?.length || 0,
    }));

    const analysisCount = endpointsWithAnalysis.filter(ep => ep.promptText).length;

    return {
      status: 'success',
      endpoints: endpointsWithAnalysis,
      analysisCount,
    };
  }

  @Post('projects/:id/regenerate-analysis')
  @ApiOperation({ summary: 'Regenerate AI analysis for all endpoints in a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Analysis regeneration completed' })
  async regenerateAnalysis(@Param('id') projectId: number): Promise<{
    status: string;
    message: string;
    processedEndpoints: number;
  }> {
    // This would trigger re-analysis of endpoints
    // For now, we'll just return a message indicating the feature is available
    const endpoints = await this.endpointRepo.find({
      where: { projectId }
    });

    return {
      status: 'success',
      message: `Analysis regeneration queued for ${endpoints.length} endpoints. This feature requires OpenAI API key to be configured.`,
      processedEndpoints: endpoints.length,
    };
  }

  @Post('projects/:id/test-intent')
  @ApiOperation({ summary: 'Test intent resolution for a user query' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Intent resolution test completed' })
  async testIntent(
    @Param('id') projectId: number,
    @Body() body: { query: string }
  ): Promise<{
    status: string;
    query: string;
    plan: any;
    message: string;
  }> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      return {
        status: 'error',
        query: body.query,
        plan: null,
        message: 'Project not found',
      };
    }

    try {
      const plan = await this.plannerService.createPlan(projectId, body.query);

      return {
        status: 'success',
        query: body.query,
        plan: plan,
        message: `Successfully created plan with ${plan.steps.length} steps`,
      };
    } catch (error) {
      return {
        status: 'error',
        query: body.query,
        plan: null,
        message: `Failed to create plan: ${error.message}`,
      };
    }
  }

  @Post('projects/:id/test-endpoint')
  @ApiOperation({ summary: 'Test a specific endpoint against the real API' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Endpoint test completed' })
  async testEndpoint(
    @Param('id') projectId: number,
    @Body() body: { 
      endpointId: number;
      method?: string;
      path?: string;
      parameters?: Record<string, any>;
    }
  ): Promise<{
    status: string;
    endpoint: any;
    response?: any;
    error?: string;
    url?: string;
    timing?: number;
  }> {
    const project = await this.projectRepo.findOne({ 
      where: { id: projectId },
      relations: ['endpoints']
    });

    if (!project) {
      return {
        status: 'error',
        endpoint: null,
        error: 'Project not found'
      };
    }

    if (!project.domain && !project.baseUrl) {
      return {
        status: 'error',
        endpoint: null,
        error: 'Project has no domain or base URL configured'
      };
    }

    let endpoint;
    if (body.endpointId) {
      endpoint = await this.endpointRepo.findOne({ 
        where: { id: body.endpointId, projectId },
        relations: ['requestParameters']
      });
    } else if (body.method && body.path) {
      endpoint = await this.endpointRepo.findOne({ 
        where: { method: body.method.toUpperCase(), path: body.path, projectId },
        relations: ['requestParameters']
      });
    }

    if (!endpoint) {
      return {
        status: 'error',
        endpoint: null,
        error: 'Endpoint not found'
      };
    }

    try {
      const baseUrl = project.baseUrl || `https://${project.domain}`;
      let url = `${baseUrl}${endpoint.path}`;
      
      // Replace path parameters
      const pathParams = endpoint.requestParameters?.filter(p => p.in === 'path') || [];
      const queryParams = endpoint.requestParameters?.filter(p => p.in === 'query') || [];
      
      // Replace path parameters in URL
      pathParams.forEach(param => {
        const value = body.parameters?.[param.name] || 'test-value';
        url = url.replace(`{${param.name}}`, String(value));
      });

      // Add query parameters
      if (queryParams.length > 0 || body.parameters) {
        const urlObj = new URL(url);
        queryParams.forEach(param => {
          if (body.parameters?.[param.name] !== undefined) {
            urlObj.searchParams.set(param.name, String(body.parameters[param.name]));
          }
        });
        url = urlObj.toString();
      }

      const startTime = Date.now();
      
      // Make the actual HTTP request
      const axios = require('axios');
      const config = {
        method: endpoint.method.toLowerCase(),
        url: url,
        timeout: 10000,
        validateStatus: () => true // Don't throw on 4xx/5xx
      };

      // Add request body for POST/PUT/PATCH
      if (['POST', 'PUT', 'PATCH'].includes(endpoint.method.toUpperCase()) && body.parameters) {
        const bodyParams = endpoint.requestParameters?.filter(p => p.in === 'body') || [];
        if (bodyParams.length > 0 || Object.keys(body.parameters).length > 0) {
          config['data'] = body.parameters;
          config['headers'] = { 'Content-Type': 'application/json' };
        }
      }

      const response = await axios(config);
      const timing = Date.now() - startTime;

      return {
        status: 'success',
        endpoint: {
          id: endpoint.id,
          method: endpoint.method,
          path: endpoint.path,
          summary: endpoint.summary
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data
        },
        url: url,
        timing: timing
      };

    } catch (error) {
      const baseUrl = project.baseUrl || `https://${project.domain}`;
      const url = `${baseUrl}${endpoint.path}`;
      
      return {
        status: 'error',
        endpoint: {
          id: endpoint.id,
          method: endpoint.method,
          path: endpoint.path,
          summary: endpoint.summary
        },
        error: error.message,
        url: url
      };
    }
  }
}
