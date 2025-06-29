import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosResponse } from 'axios';
import * as JSONPath from 'jsonpath';
import OpenAI from 'openai';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { AuthService, UserContext } from '../auth/auth.service';
import { Endpoint } from '../entities/endpoint.entity';
import { Project } from '../entities/project.entity';
import { ResponseMessage } from '../entities/response-message.entity';
import { ExecutionPlan, PlanStep } from '../planner/planner.service';

export interface StepResult {
  stepIndex: number;
  endpoint: string;
  success: boolean;
  statusCode?: number;
  response?: any;
  error?: string;
  executionTime: number;
  satisfiesUserRequest?: boolean;
}

export interface ExecutionResult {
  success: boolean;
  steps: StepResult[];
  finalResult?: any;
  error?: string;
  totalTime: number;
  earlyTermination?: boolean;
  terminationReason?: string;
}

@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(Endpoint)
    private endpointRepo: Repository<Endpoint>,
    @InjectRepository(ResponseMessage)
    private responseMessageRepo: Repository<ResponseMessage>,
    private httpService: HttpService,
    private authService: AuthService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  async executePlan(
    projectId: number, 
    plan: ExecutionPlan, 
    userContext?: UserContext,
    userMessage?: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];

    try {
      this.logger.log(`Executing plan with ${plan.steps.length} steps for project ${projectId}`);
      
  

      // Get project base URL
      const project = await this.projectRepo.findOne({ where: { id: projectId } });
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const baseUrl = this.resolveBaseUrl(project.baseUrl);

      // Execute steps sequentially
      for (let i = 0; i < plan.steps.length; i++) {
        const stepStartTime = Date.now();
        const step = plan.steps[i];

        try {
          this.logger.log(`Executing step ${i + 1}: ${step.endpoint}`);
          this.logger.debug(`Request parameters: ${JSON.stringify(step.params)}`);

          // Interpolate parameters using previous results
          const interpolatedParams = this.interpolateParameters(step.params, stepResults);
          this.logger.debug(`Interpolated parameters: ${JSON.stringify(interpolatedParams)}`);

          // Execute the API call
          const result = await this.executeStep(
            step,
            interpolatedParams,
            baseUrl,
            userContext,
            projectId
          );

          const stepResult: StepResult = {
            stepIndex: i,
            endpoint: step.endpoint,
            success: true,
            statusCode: result.status,
            response: result.data,
            executionTime: Date.now() - stepStartTime
          };

          stepResults.push(stepResult);
          
          // Log API response (truncate if too large)
          const responsePreview = this.truncateResponse(result.data);
          this.logger.log(`Step ${i + 1} completed successfully (${result.status}) - Response: ${responsePreview}`);
          
          // Log detailed response in debug mode
          this.logger.debug(`Step ${i + 1} full response:`, JSON.stringify(result.data, null, 2));

          // Check if current response satisfies user's request using LLM
          if (userMessage && i < plan.steps.length - 1) {
            const satisfiesRequest = await this.checkIfResponseSatisfiesRequest(
              userMessage,
              result.data,
              step.endpoint,
              i + 1,
              plan.steps.length
            );

            stepResult.satisfiesUserRequest = satisfiesRequest;

            if (satisfiesRequest) {
              this.logger.log(`🎯 Step ${i + 1} response satisfies user request. Terminating execution early.`);
              
              return {
                success: true,
                steps: stepResults,
                finalResult: result.data,
                totalTime: Date.now() - startTime,
                earlyTermination: true,
                terminationReason: `User request satisfied after step ${i + 1} of ${plan.steps.length}`
              };
            }
          }

        } catch (error) {
          const stepResult: StepResult = {
            stepIndex: i,
            endpoint: step.endpoint,
            success: false,
            error: error.message,
            statusCode: error.response?.status,
            executionTime: Date.now() - stepStartTime
          };

          stepResults.push(stepResult);

          // Handle error - get user-friendly message
          const errorMessage = await this.handleStepError(error, step.endpoint, projectId);
          
          this.logger.error(`Step ${i + 1} failed: ${errorMessage}`);

          // Abort execution on error
          return {
            success: false,
            steps: stepResults,
            error: errorMessage,
            totalTime: Date.now() - startTime
          };
        }
      }

      // All steps completed successfully
      const finalResult = stepResults[stepResults.length - 1]?.response;

      return {
        success: true,
        steps: stepResults,
        finalResult,
        totalTime: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error(`Plan execution failed: ${error.message}`, error.stack);

      return {
        success: false,
        steps: stepResults,
        error: error.message,
        totalTime: Date.now() - startTime
      };
    }
  }

  private resolveBaseUrl(baseUrl: string): string {
    if (!baseUrl) {
      throw new Error('Project base URL is not configured');
    }

    // Handle relative URLs
    if (baseUrl.startsWith('{serverUrl}')) {
      throw new Error('Base URL contains unresolved server variable. Please configure the actual server URL.');
    }

    if (baseUrl.startsWith('/')) {
      throw new Error('Relative base URL found. Please provide the full server URL.');
    }

    // Special handling for Swagger Petstore - add missing /api/v3 path
    if (baseUrl.includes('petstore3.swagger.io') && !baseUrl.includes('/api/v3')) {
      baseUrl = baseUrl.replace('petstore3.swagger.io/', 'petstore3.swagger.io/api/v3');
      this.logger.log(`Adjusted Swagger Petstore base URL to: ${baseUrl}`);
    }

    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  private interpolateParameters(
    params: Record<string, any>,
    previousResults: StepResult[]
  ): Record<string, any> {
    const interpolated: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('$.')) {
        // JSONPath reference
        try {
          const resolvedValue = this.resolveJSONPath(value, previousResults);
          interpolated[key] = resolvedValue;
          this.logger.debug(`Interpolated ${key}: ${value} → ${resolvedValue}`);
        } catch (error) {
          this.logger.warn(`Failed to resolve JSONPath ${value}: ${error.message}`);
          interpolated[key] = value; // Keep original if resolution fails
        }
      } else {
        interpolated[key] = value;
      }
    }

    return interpolated;
  }

  private resolveJSONPath(jsonPath: string, previousResults: StepResult[]): any {
    // Convert our results to a structure that JSONPath can query
    const dataContext = {
      steps: previousResults.map(result => ({
        response: result.response,
        statusCode: result.statusCode
      }))
    };

    const results = JSONPath.query(dataContext, jsonPath);
    
    if (results.length === 0) {
      throw new Error(`JSONPath ${jsonPath} returned no results`);
    }

    if (results.length === 1) {
      return results[0];
    }

    // Multiple results - return array
    return results;
  }

  private async executeStep(
    step: PlanStep,
    params: Record<string, any>,
    baseUrl: string,
    userContext?: UserContext,
    projectId?: number
  ): Promise<AxiosResponse> {
    // Parse endpoint
    const [method, path] = step.endpoint.split(' ', 2);
    if (!method || !path) {
      throw new Error(`Invalid endpoint format: ${step.endpoint}`);
    }

    // Get endpoint metadata for parameter mapping
    const endpoint = await this.endpointRepo.findOne({
      where: { 
        projectId: projectId!, 
        method: method.toUpperCase(), 
        path 
      },
      relations: ['requestParameters']
    });

    if (!endpoint) {
      throw new Error(`Endpoint not found: ${step.endpoint}`);
    }

    // Build URL with path parameters
    let url = `${baseUrl}${path}`;
    const queryParams: Record<string, any> = {};
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication
    if (userContext) {
      const authHeaders = this.authService.createAuthHeaders(userContext);
      Object.assign(headers, authHeaders);
    }

    // Categorize parameters
    let requestBody: any = null;
    const bodyParams: Record<string, any> = {};

    for (const [paramName, paramValue] of Object.entries(params)) {
      const paramDef = endpoint.requestParameters?.find(p => p.name === paramName);
      
      if (!paramDef) {
        this.logger.warn(`Unknown parameter ${paramName} for ${step.endpoint}`);
        continue;
      }

      switch (paramDef.in) {
        case 'path':
          url = url.replace(`{${paramName}}`, encodeURIComponent(String(paramValue)));
          break;
        case 'query':
          queryParams[paramName] = paramValue;
          break;
        case 'header':
          headers[paramName] = String(paramValue);
          break;
        case 'body':
          bodyParams[paramName] = paramValue;
          break;
      }
    }

    // Prepare request body for POST/PUT/PATCH requests
    if (Object.keys(bodyParams).length > 0) {
      requestBody = bodyParams;
    }

    // Make HTTP request with retry logic
    return await this.makeHttpRequest(method.toUpperCase(), url, queryParams, headers, requestBody);
  }

  private async makeHttpRequest(
    method: string,
    url: string,
    queryParams: Record<string, any>,
    headers: Record<string, string>,
    data?: any,
    retries = 1
  ): Promise<AxiosResponse> {
    const config: any = {
      method: method.toLowerCase(),
      url,
      headers,
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      timeout: 30000, // 30 second timeout
    };

    // Add data for POST, PUT, PATCH requests
    if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
      config.data = data;
    }

    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const fullUrl = Object.keys(queryParams).length > 0 
          ? `${url}?${new URLSearchParams(queryParams).toString()}`
          : url;
        
        // Detailed request logging
        this.logger.log(`🚀 HTTP ${method} ${fullUrl} (attempt ${attempt + 1})`);
        this.logger.log(`📋 Request Headers: ${JSON.stringify(headers, null, 2)}`);
        
        if (Object.keys(queryParams).length > 0) {
          this.logger.log(`🔍 Query Parameters: ${JSON.stringify(queryParams, null, 2)}`);
        }
        
        if (config.data) {
          this.logger.log(`📦 Request Body: ${JSON.stringify(config.data, null, 2)}`);
        }
        
        if (!config.data && Object.keys(queryParams).length === 0) {
          this.logger.log(`ℹ️  No parameters sent with this request`);
        }
        
        const response = await firstValueFrom(
          this.httpService.request(config)
        );

        return response;

      } catch (error) {
        lastError = error;
        
        if (attempt < retries && this.isRetriableError(error)) {
          this.logger.warn(`Request failed, retrying... (${error.message})`);
          await this.delay(1000 * (attempt + 1)); // Exponential backoff
          continue;
        }
        
        break;
      }
    }

    throw lastError;
  }

  private isRetriableError(error: any): boolean {
    // Retry on network errors or 5xx server errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    const status = error.response?.status;
    return status >= 500;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async handleStepError(
    error: any,
    endpoint: string,
    projectId: number
  ): Promise<string> {
    const statusCode = error.response?.status;
    const responseBody = error.response?.data;

    // Try to find a matching response message
    if (statusCode) {
      const responseMessage = await this.responseMessageRepo.findOne({
        where: [
          // Specific endpoint + status code
          { 
            endpoint: { path: endpoint.split(' ')[1], method: endpoint.split(' ')[0] },
            statusCode 
          },
          // Generic status code for any endpoint in project
          { 
            endpoint: { projectId },
            statusCode 
          }
        ],
        relations: ['endpoint']
      });

      if (responseMessage) {
        return responseMessage.message;
      }
    }

    // Generate generic error message
    if (statusCode) {
      const statusMessages: Record<number, string> = {
        400: 'Bad request - please check your parameters',
        401: 'Authentication required - please log in',
        403: 'Permission denied - you don\'t have access to this resource',
        404: 'Resource not found',
        422: 'Invalid data provided',
        429: 'Too many requests - please try again later',
        500: 'Server error - please try again later',
        502: 'Service temporarily unavailable',
        503: 'Service temporarily unavailable',
      };

      return statusMessages[statusCode] || `Request failed with status ${statusCode}`;
    }

    // Network or other errors
    if (error.code === 'ETIMEDOUT') {
      return 'Request timed out - please try again';
    }

    if (error.code === 'ECONNREFUSED') {
      return 'Unable to connect to the API service';
    }

    return `Request failed: ${error.message}`;
  }

  private truncateResponse(data: any): string {
    try {
      const jsonString = JSON.stringify(data);
      
      // If response is small, return as is
      if (jsonString.length <= 200) {
        return jsonString;
      }
      
      // If it's an array, show count and first item
      if (Array.isArray(data)) {
        const firstItem = data.length > 0 ? JSON.stringify(data[0]) : '{}';
        const preview = firstItem.length > 100 ? firstItem.substring(0, 100) + '...' : firstItem;
        return `[${data.length} items] First: ${preview}`;
      }
      
      // If it's an object, show key-value pairs summary
      if (typeof data === 'object' && data !== null) {
        const keys = Object.keys(data);
        const keyCount = keys.length;
        const firstKeys = keys.slice(0, 3).map(key => {
          const value = data[key];
          const valueStr = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
          return `${key}: ${valueStr.length > 30 ? valueStr.substring(0, 30) + '...' : valueStr}`;
        }).join(', ');
        
        return `{${keyCount} keys} ${firstKeys}${keyCount > 3 ? ', ...' : ''}`;
      }
      
      // For other types, truncate string representation
      return jsonString.substring(0, 200) + '...';
      
    } catch (error) {
      return `[Error serializing response: ${error.message}]`;
    }
  }

  private async checkIfResponseSatisfiesRequest(
    userMessage: string,
    stepResponse: any,
    endpoint: string,
    currentStep: number,
    totalSteps: number
  ): Promise<boolean> {
    try {
      const prompt = `You are an intelligent API response analyzer. Your job is to determine if the current API response contains enough information to satisfy the user's request.

User's Original Request: "${userMessage}"

Current API Response (Step ${currentStep} of ${totalSteps}):
Endpoint: ${endpoint}
Response: ${JSON.stringify(stepResponse).slice(0, 1500)}${JSON.stringify(stepResponse).length > 1500 ? '...' : ''}

Analysis Instructions:
1. Carefully read the user's request and understand what they're looking for
2. Examine the API response to see if it contains the requested information
3. Consider if this response fully answers the user's question or if additional steps are needed
4. Return "YES" if the response satisfies the user's request completely
5. Return "NO" if more API calls are needed to fulfill the request

Examples:
- User asks "Find all available pets" → Response has list of available pets → YES
- User asks "Get user john_doe and show his orders" → Response only has user info, no orders → NO
- User asks "Get inventory status" → Response has complete inventory data → YES

Your Response (YES or NO only):`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a precise API response analyzer. Respond with only YES or NO.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 10,
      });

      const result = response.choices[0]?.message?.content?.trim().toUpperCase();
      const satisfies = result === 'YES';

      this.logger.debug(`LLM analysis for step ${currentStep}: "${result}" (satisfies: ${satisfies})`);
      
      return satisfies;

    } catch (error) {
      this.logger.warn(`Failed to analyze response satisfaction: ${error.message}`);
      return false; // Continue execution if analysis fails
    }
  }
} 