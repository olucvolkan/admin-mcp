import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { UserContext } from '../auth/auth.service';
import { CacheService } from '../cache/cache.service';
import { Endpoint } from '../entities/endpoint.entity';
import { RequestParameter } from '../entities/request-parameter.entity';
import { ResponseMessage } from '../entities/response-message.entity';
import { ExecutorService } from '../executor/executor.service';
import { FormatterService } from '../formatter/formatter.service';
import { PlannerService } from '../planner/planner.service';

export interface ChatRequest {
  projectId: number;
  message: string;
  authToken?: string; // Keep for backward compatibility
  userId?: string; // Add userId for cache management (optional)
  userContext?: UserContext; // Add user context for session forwarding
}

export interface ChatResponse {
  success: boolean;
  message: string;
  data?: any;
  formattedResponse?: string;
  visualResponse?: any; // VisualResponse from visual-response system
  transformationResult?: any; // Transformation metadata
  cacheKey?: string; // Add cache key to response
  relevantContext?: Array<{
    query: string;
    data: any;
    timestamp: number;
  }>;
  executionDetails?: {
    planSteps: number;
    executionTime: number;
    stepsExecuted: number;
    retryCount?: number;
    finalQuery?: string;
    cacheHit?: boolean;
    earlyTermination?: boolean;
    terminationReason?: string;
  };
  error?: string;
}

export interface ChatStreamUpdate {
  type: 'planning' | 'executing' | 'step_completed' | 'formatting' | 'completed' | 'error';
  step?: number;
  totalSteps?: number;
  message: string;
  data?: any;
  timestamp: string;
  executionTime?: number;
  progress?: number; // 0-100
}

export interface ChatHistoryItem {
  id: string;
  query: string;
  response: ChatResponse;
  timestamp: number;
  userId?: string;
  executionTime: number;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly openai: OpenAI;

  constructor(
    private plannerService: PlannerService,
    private executorService: ExecutorService,
    private cacheService: CacheService,
    private formatterService: FormatterService,
    @InjectRepository(Endpoint) private endpointRepository: Repository<Endpoint>,
    @InjectRepository(RequestParameter) private requestParameterRepository: Repository<RequestParameter>,
    @InjectRepository(ResponseMessage) private responseMessageRepository: Repository<ResponseMessage>,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  async processQuery(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      // Check for relevant cached context first
      const relevantContext = this.cacheService.findRelevantContext(
        request.projectId,
        request.message,
        request.userId
      );

      if (relevantContext.length > 0) {
        this.logger.log(`Found ${relevantContext.length} relevant cached contexts for query`);
      }

      const response = await this.processQueryWithRetry(request, startTime, 0, relevantContext);
      
      // Store successful response in cache
      if (response.success && response.data) {
        const cacheKey = this.cacheService.storeResponseData(
          request.projectId,
          request.message,
          response.data,
          response.executionDetails?.executionTime || 0,
          'chat-query', // endpoint identifier
          request.userId
        );
        
        response.cacheKey = cacheKey;
        response.relevantContext = relevantContext.map(ctx => ({
          query: ctx.query,
          data: ctx.data,
          timestamp: ctx.timestamp
        }));
      }

      return response;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Query processing failed: ${error.message}`, error.stack);

      return {
        success: false,
        message: this.getErrorMessage(error),
        executionDetails: {
          planSteps: 0,
          executionTime: totalTime,
          stepsExecuted: 0
        },
        error: error.message
      };
    }
  }

  async processQueryStream(
    request: ChatRequest,
    updateCallback: (update: ChatStreamUpdate) => void
  ): Promise<void> {
    const startTime = Date.now();
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Send initial planning update
      updateCallback({
        type: 'planning',
        message: 'Analyzing your request...',
        timestamp: new Date().toISOString(),
        progress: 10,
      });

      // Check for relevant cached context first
      const relevantContext = this.cacheService.findRelevantContext(
        request.projectId,
        request.message,
        request.userId
      );

      if (relevantContext.length > 0) {
        updateCallback({
          type: 'planning',
          message: `Found ${relevantContext.length} relevant context from previous conversations`,
          timestamp: new Date().toISOString(),
          progress: 20,
        });
      }

      // Stream the query processing
      await this.processQueryWithRetryStream(
        request,
        startTime,
        0,
        relevantContext,
        updateCallback,
        sessionId
      );

    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Query processing failed: ${error.message}`, error.stack);

      updateCallback({
        type: 'error',
        message: this.getErrorMessage(error),
        timestamp: new Date().toISOString(),
        executionTime: totalTime,
        data: { error: error.message },
      });
    }
  }

  private async processQueryWithRetryStream(
    request: ChatRequest,
    startTime: number,
    retryCount: number = 0,
    relevantContext: any[] = [],
    updateCallback: (update: ChatStreamUpdate) => void,
    sessionId: string
  ): Promise<void> {
    const maxRetries = 2;

    try {
      updateCallback({
        type: 'planning',
        message: `Creating execution plan... (attempt ${retryCount + 1})`,
        timestamp: new Date().toISOString(),
        progress: 30,
      });

      // Step 1: Create execution plan using LLM with context
      const plan = await this.plannerService.createPlan(request.projectId, request.message, relevantContext);

      updateCallback({
        type: 'planning',
        message: `Plan created with ${plan.steps.length} steps`,
        timestamp: new Date().toISOString(),
        progress: 40,
        totalSteps: plan.steps.length,
      });

      // Step 2: Execute the plan with streaming updates
      const executionResult = await this.executorService.executePlan(
        request.projectId,
        plan,
        request.userContext,
        request.message
      );

      // Simulate step completion updates for now
      for (let i = 0; i < plan.steps.length; i++) {
        updateCallback({
          type: 'step_completed',
          step: i + 1,
          totalSteps: plan.steps.length,
          message: `Completed step ${i + 1}: ${plan.steps[i].endpoint}`,
          timestamp: new Date().toISOString(),
          progress: 40 + ((i + 1) / plan.steps.length) * 40, // 40-80%
        });
      }

      const totalTime = Date.now() - startTime;

      if (executionResult.success) {
        updateCallback({
          type: 'formatting',
          message: 'Formatting response...',
          timestamp: new Date().toISOString(),
          progress: 85,
        });

        // Format response using LLM
        const formattedResponse = await this.formatSuccessResponse(
          executionResult.finalResult,
          request.message,
          plan.steps.length,
          executionResult.steps.length,
          totalTime,
          retryCount,
          executionResult
        );

        // Store successful response in cache
        if (formattedResponse.data) {
          const cacheKey = this.cacheService.storeResponseData(
            request.projectId,
            request.message,
            formattedResponse.data,
            totalTime,
            'chat-query',
            request.userId
          );
          formattedResponse.cacheKey = cacheKey;
        }

        // Store in chat history
        this.storeChatHistory(sessionId, request, formattedResponse);

        updateCallback({
          type: 'completed',
          message: formattedResponse.message,
          data: {
            summary: formattedResponse.message,
            formattedData: formattedResponse.formattedResponse,
            visualResponse: formattedResponse.visualResponse,
            transformationResult: formattedResponse.transformationResult,
            rawData: formattedResponse.data // Raw data for debugging if needed
          },
          timestamp: new Date().toISOString(),
          progress: 100,
          executionTime: totalTime,
        });

        this.logger.log(`Query completed successfully in ${totalTime}ms`);
      } else {
        // Execution failed - analyze error and potentially retry
        if (retryCount < maxRetries) {
          updateCallback({
            type: 'error',
            message: `Execution failed, analyzing error for retry... (attempt ${retryCount + 1})`,
            timestamp: new Date().toISOString(),
            progress: 60,
          });

          const errorAnalysis = await this.analyzeErrorWithLLM(
            request.message,
            executionResult.error || 'Unknown execution error',
            plan,
            executionResult.steps
          );

          if (errorAnalysis.shouldRetry && errorAnalysis.correctedQuery) {
            updateCallback({
              type: 'planning',
              message: `Retrying with corrected query: "${errorAnalysis.correctedQuery}"`,
              timestamp: new Date().toISOString(),
              progress: 20,
            });

            const correctedRequest = {
              ...request,
              message: errorAnalysis.correctedQuery
            };

            return await this.processQueryWithRetryStream(
              correctedRequest,
              startTime,
              retryCount + 1,
              relevantContext,
              updateCallback,
              sessionId
            );
          }
        }

        // No retry or max retries reached
        updateCallback({
          type: 'error',
          message: this.getErrorMessage(executionResult.error || 'Execution failed'),
          timestamp: new Date().toISOString(),
          executionTime: totalTime,
          data: { error: executionResult.error },
        });
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Query processing failed: ${error.message}`, error.stack);

      updateCallback({
        type: 'error',
        message: this.getErrorMessage(error),
        timestamp: new Date().toISOString(),
        executionTime: totalTime,
        data: { error: error.message },
      });
    }
  }

  private async processQueryWithRetry(
    request: ChatRequest, 
    startTime: number, 
    retryCount: number = 0,
    relevantContext: any[] = []
  ): Promise<ChatResponse> {
    const maxRetries = 2;

    try {
      this.logger.log(`Processing query for project ${request.projectId}: "${request.message}" (attempt ${retryCount + 1})`);

      // Step 1: Create execution plan using LLM with context
      const plan = await this.plannerService.createPlan(request.projectId, request.message, relevantContext);

      this.logger.debug(`Plan created with ${plan.steps.length} steps`);

      // Step 2: Execute the plan
      const executionResult = await this.executorService.executePlan(
        request.projectId,
        plan,
        request.userContext,
        request.message
      );

      const totalTime = Date.now() - startTime;

      console.log(executionResult);
      if (executionResult.success) {
        // Success - format response using LLM
        const response = await this.formatSuccessResponse(
          executionResult.finalResult,
          request.message,
          plan.steps.length,
          executionResult.steps.length,
          totalTime,
          retryCount,
          executionResult // Pass full execution result for early termination info
        );

        // Add early termination information to logs
        if (executionResult.earlyTermination) {
          this.logger.log(`🎯 Early termination: ${executionResult.terminationReason}`);
        }

        this.logger.log(`Query completed successfully in ${totalTime}ms`);
        this.logger.log(`Final response data: ${this.truncateData(executionResult.finalResult)}`);
        return response;

      } else {
        // Execution failed - analyze error and potentially retry
        if (retryCount < maxRetries) {
          this.logger.warn(`Query execution failed (attempt ${retryCount + 1}): ${executionResult.error}`);
          
          const errorAnalysis = await this.analyzeErrorWithLLM(
            request.message,
            executionResult.error || 'Unknown execution error',
            plan,
            executionResult.steps
          );

          if (errorAnalysis.shouldRetry && errorAnalysis.correctedQuery) {
            this.logger.log(`LLM suggests retry with corrected query: "${errorAnalysis.correctedQuery}"`);
            
            // Update database metadata based on error analysis
            await this.updateMetadataFromError(
              request.projectId,
              executionResult.error || 'Unknown execution error',
              plan,
              errorAnalysis
            );
            
            // Retry with corrected query
            const correctedRequest = {
              ...request,
              message: errorAnalysis.correctedQuery
            };

            return await this.processQueryWithRetry(correctedRequest, startTime, retryCount + 1, relevantContext);
          }
        }

        // No retry or max retries reached
        this.logger.warn(`Query execution failed: ${executionResult.error}`);

        return {
          success: false,
          message: executionResult.error || 'Failed to execute the request',
          executionDetails: {
            planSteps: plan.steps.length,
            executionTime: Date.now() - startTime,
            stepsExecuted: executionResult.steps.length
          },
          error: executionResult.error
        };
      }

    } catch (error) {
      // Planning or other error occurred
      if (retryCount < maxRetries) {
        this.logger.warn(`Query processing error (attempt ${retryCount + 1}): ${error.message}`);
        
        const errorAnalysis = await this.analyzeErrorWithLLM(
          request.message,
          error.message,
          null,
          []
        );

        if (errorAnalysis.shouldRetry && errorAnalysis.correctedQuery) {
          this.logger.log(`LLM suggests retry with corrected query: "${errorAnalysis.correctedQuery}"`);
          
          // Retry with corrected query
          const correctedRequest = {
            ...request,
            message: errorAnalysis.correctedQuery
          };

          return await this.processQueryWithRetry(correctedRequest, startTime, retryCount + 1, relevantContext);
        }
      }

      // Re-throw the error to be handled by the main try-catch
      throw error;
    }
  }

  private async updateMetadataFromError(
    projectId: number,
    errorMessage: string,
    plan: any,
    errorAnalysis: any
  ): Promise<void> {
    try {
      this.logger.log(`Updating metadata based on error analysis for project ${projectId}`);

      // Parse error message to extract actionable information
      const metadataUpdates = await this.extractMetadataUpdates(errorMessage, plan, errorAnalysis);

      if (metadataUpdates.missingParameters && metadataUpdates.missingParameters.length > 0) {
        await this.addMissingParameters(projectId, metadataUpdates.missingParameters);
      }

      if (metadataUpdates.parameterCorrections && metadataUpdates.parameterCorrections.length > 0) {
        await this.correctParameters(projectId, metadataUpdates.parameterCorrections);
      }

      if (metadataUpdates.errorMessages && metadataUpdates.errorMessages.length > 0) {
        await this.addErrorMessages(projectId, metadataUpdates.errorMessages);
      }

      this.logger.log(`Metadata updates completed for project ${projectId}`);

    } catch (error) {
      this.logger.warn(`Failed to update metadata from error: ${error.message}`);
    }
  }

  private async extractMetadataUpdates(
    errorMessage: string,
    plan: any,
    errorAnalysis: any
  ): Promise<{
    missingParameters?: Array<{
      endpointPath: string;
      method: string;
      parameterName: string;
      parameterType: string;
      isRequired: boolean;
      location: string;
    }>;
    parameterCorrections?: Array<{
      endpointPath: string;
      method: string;
      oldParameterName: string;
      newParameterName: string;
    }>;
    errorMessages?: Array<{
      endpointPath: string;
      method: string;
      statusCode: number;
      message: string;
      suggestion: string;
    }>;
  }> {
    try {
      const prompt = `You are an API metadata analyzer. Based on the error message and execution plan, extract actionable database updates.

Error Message: "${errorMessage}"

Execution Plan: ${JSON.stringify(plan, null, 2)}

Error Analysis: ${JSON.stringify(errorAnalysis, null, 2)}

Common error patterns and their solutions:
1. "Missing required parameter X" → Add X as required parameter to endpoint
2. "Parameter Y not found" → Add Y as parameter or correct parameter name
3. "photoUrls is required" → Add photoUrls as required array parameter
4. "Invalid parameter Z" → Mark Z as optional or correct its type
5. "Authentication failed" → Add authentication requirements

Extract metadata updates in JSON format:
{
  "missingParameters": [
    {
      "endpointPath": "/pet",
      "method": "POST",
      "parameterName": "photoUrls",
      "parameterType": "array",
      "isRequired": true,
      "location": "body"
    }
  ],
  "parameterCorrections": [
    {
      "endpointPath": "/users",
      "method": "GET", 
      "oldParameterName": "username",
      "newParameterName": "name"
    }
  ],
  "errorMessages": [
    {
      "endpointPath": "/pet",
      "method": "POST",
      "statusCode": 400,
      "message": "Missing required parameter: photoUrls",
      "suggestion": "Please provide photoUrls as an array of image URLs"
    }
  ]
}

Only extract updates that are clearly indicated by the error. Return empty arrays if no clear updates are needed.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an API metadata analyzer. Extract actionable database updates from error messages. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 800
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from LLM');
      }

      try {
        return JSON.parse(content);
      } catch (parseError) {
        this.logger.warn(`Failed to parse metadata updates: ${content}`);
        return {};
      }

    } catch (error) {
      this.logger.warn(`Failed to extract metadata updates: ${error.message}`);
      return {};
    }
  }

  private async addMissingParameters(
    projectId: number,
    missingParameters: Array<{
      endpointPath: string;
      method: string;
      parameterName: string;
      parameterType: string;
      isRequired: boolean;
      location: string;
    }>
  ): Promise<void> {
    for (const param of missingParameters) {
      try {
        // Find the endpoint
        const endpoint = await this.endpointRepository.findOne({
          where: {
            project: { id: projectId },
            path: param.endpointPath,
            method: param.method.toUpperCase()
          }
        });

        if (!endpoint) {
          this.logger.warn(`Endpoint not found: ${param.method} ${param.endpointPath}`);
          continue;
        }

        // Check if parameter already exists
        const existingParam = await this.requestParameterRepository.findOne({
          where: {
            endpoint: { id: endpoint.id },
            name: param.parameterName
          }
        });

        if (existingParam) {
          // Update existing parameter
          existingParam.required = param.isRequired;
          existingParam.type = param.parameterType;
          existingParam.in = param.location;
          await this.requestParameterRepository.save(existingParam);
          this.logger.log(`Updated parameter: ${param.parameterName} for ${param.method} ${param.endpointPath}`);
        } else {
          // Create new parameter
          const newParam = this.requestParameterRepository.create({
            endpointId: endpoint.id,
            name: param.parameterName,
            type: param.parameterType,
            required: param.isRequired,
            in: param.location,
            description: `Auto-added from error analysis: ${param.parameterName} is required`
          });

          await this.requestParameterRepository.save(newParam);
          this.logger.log(`Added missing parameter: ${param.parameterName} for ${param.method} ${param.endpointPath}`);
        }

      } catch (error) {
        this.logger.error(`Failed to add parameter ${param.parameterName}: ${error.message}`);
      }
    }
  }

  private async correctParameters(
    projectId: number,
    corrections: Array<{
      endpointPath: string;
      method: string;
      oldParameterName: string;
      newParameterName: string;
    }>
  ): Promise<void> {
    for (const correction of corrections) {
      try {
        const endpoint = await this.endpointRepository.findOne({
          where: {
            project: { id: projectId },
            path: correction.endpointPath,
            method: correction.method.toUpperCase()
          }
        });

        if (!endpoint) continue;

        const param = await this.requestParameterRepository.findOne({
          where: {
            endpoint: { id: endpoint.id },
            name: correction.oldParameterName
          }
        });

        if (param) {
          param.name = correction.newParameterName;
          await this.requestParameterRepository.save(param);
          this.logger.log(`Corrected parameter name: ${correction.oldParameterName} → ${correction.newParameterName}`);
        }

      } catch (error) {
        this.logger.error(`Failed to correct parameter: ${error.message}`);
      }
    }
  }

  private async addErrorMessages(
    projectId: number,
    errorMessages: Array<{
      endpointPath: string;
      method: string;
      statusCode: number;
      message: string;
      suggestion: string;
    }>
  ): Promise<void> {
    for (const errorMsg of errorMessages) {
      try {
        const endpoint = await this.endpointRepository.findOne({
          where: {
            project: { id: projectId },
            path: errorMsg.endpointPath,
            method: errorMsg.method.toUpperCase()
          }
        });

        if (!endpoint) continue;

        // Check if error message already exists
        const existingMsg = await this.responseMessageRepository.findOne({
          where: {
            endpoint: { id: endpoint.id },
            statusCode: errorMsg.statusCode
          }
        });

        if (!existingMsg) {
          const newErrorMsg = this.responseMessageRepository.create({
            endpoint,
            statusCode: errorMsg.statusCode,
            message: errorMsg.message,
            suggestion: errorMsg.suggestion
          });

          await this.responseMessageRepository.save(newErrorMsg);
          this.logger.log(`Added error message for ${errorMsg.method} ${errorMsg.endpointPath} (${errorMsg.statusCode})`);
        }

      } catch (error) {
        this.logger.error(`Failed to add error message: ${error.message}`);
      }
    }
  }

  private async analyzeErrorWithLLM(
    originalQuery: string,
    errorMessage: string,
    plan: any,
    executionSteps: any[]
  ): Promise<{
    shouldRetry: boolean;
    correctedQuery?: string;
    analysis: string;
  }> {
    try {
      const prompt = `You are an expert API troubleshooter. Analyze this error and determine if we should retry with a corrected query.

Original User Query: "${originalQuery}"

Error Message: "${errorMessage}"

${plan ? `Execution Plan: ${JSON.stringify(plan, null, 2)}` : 'No execution plan available'}

${executionSteps.length > 0 ? `Execution Steps: ${JSON.stringify(executionSteps, null, 2)}` : 'No execution steps available'}

Common issues and solutions:
1. Parameter mismatch - user might use different parameter names
2. Missing required parameters - user might not provide all needed info
3. Wrong endpoint - user query might need different API endpoint
4. Data format issues - user might expect different data format
5. Authentication issues - might need different auth approach

Analyze the error and respond in JSON format:
{
  "shouldRetry": boolean,
  "correctedQuery": "corrected query if retry recommended, null otherwise",
  "analysis": "brief explanation of the issue and solution"
}

Only suggest retry if you can identify a clear correction to the user's query that would likely succeed.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert API troubleshooter. Analyze errors and suggest corrections when possible. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from LLM');
      }

      try {
        const analysis = JSON.parse(content);
        this.logger.debug(`Error analysis: ${JSON.stringify(analysis)}`);
        return analysis;
      } catch (parseError) {
        this.logger.warn(`Failed to parse LLM error analysis: ${content}`);
        return {
          shouldRetry: false,
          analysis: 'Failed to analyze error'
        };
      }

    } catch (error) {
      this.logger.warn(`Error analysis with LLM failed: ${error.message}`);
      return {
        shouldRetry: false,
        analysis: 'Error analysis unavailable'
      };
    }
  }

  private async formatSuccessResponse(
    finalResult: any,
    originalQuery: string,
    planSteps: number,
    executedSteps: number,
    executionTime: number,
    retryCount: number = 0,
    executionResult: any
  ): Promise<ChatResponse> {
    try {
      // Extract endpoint information from the last executed step for VisualResponse
      let endpoint: string | undefined;
      let method: string = 'GET';
      
      if (executionResult.steps && executionResult.steps.length > 0) {
        const lastStep = executionResult.steps[executionResult.steps.length - 1];
        if (lastStep.endpoint) {
          endpoint = lastStep.endpoint;
          method = lastStep.method || 'GET';
        }
      }

      // Use FormatterService to format the response in a user-friendly way
      const formattedResponse = await this.formatterService.formatApiResponse(
        finalResult, 
        originalQuery, 
        endpoint, 
        method
      );

      // Prepare execution details with early termination info
      const executionDetails = {
        planSteps,
        executionTime,
        stepsExecuted: executedSteps,
        retryCount,
        finalQuery: originalQuery,
        earlyTermination: executionResult.earlyTermination || false,
        terminationReason: executionResult.terminationReason
      };

      // Add early termination message to the response if applicable
      let message = formattedResponse.summary;
      if (executionResult.earlyTermination) {
        message = `✅ ${message} (Completed efficiently after ${executedSteps} of ${planSteps} planned steps)`;
      }

      return {
        success: true,
        message,
        data: finalResult,
        formattedResponse: formattedResponse.formattedData,
        visualResponse: formattedResponse.visualResponse,
        transformationResult: formattedResponse.transformationResult,
        executionDetails
      };

    } catch (error) {
      this.logger.warn(`Failed to format response with FormatterService: ${error.message}`);
      
      // Fallback to simple formatting
      let message: string;
      if (finalResult) {
        if (Array.isArray(finalResult)) {
          if (finalResult.length === 0) {
            message = "🔍 I found no results for your request.";
          } else if (finalResult.length === 1) {
            message = "✅ I found 1 result for your request.";
          } else {
            message = `✅ I found ${finalResult.length} results for your request.`;
          }
        } else if (typeof finalResult === 'object') {
          if (finalResult.id) {
            message = `✅ I retrieved the requested information (ID: ${finalResult.id}).`;
          } else {
            message = "✅ I successfully retrieved the requested information.";
          }
        } else {
          message = `✅ Here's the result: ${finalResult}`;
        }
      } else {
        message = "✅ I successfully completed your request.";
      }

      // Add early termination message to fallback response
      if (executionResult.earlyTermination) {
        message = `${message} (Completed efficiently after ${executedSteps} of ${planSteps} planned steps)`;
      }

      // Create fallback formatted data
      const fallbackFormatted = this.createFallbackFormattedData(finalResult);

      return {
        success: true,
        message,
        data: finalResult,
        formattedResponse: fallbackFormatted,
        executionDetails: {
          planSteps,
          executionTime,
          stepsExecuted: executedSteps,
          retryCount,
          finalQuery: originalQuery,
          earlyTermination: executionResult.earlyTermination || false,
          terminationReason: executionResult.terminationReason
        }
      };
    }
  }

  private createFallbackFormattedData(data: any): string {
    if (!data) {
      return "ℹ️ No data was returned from the API.";
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return "📋 No items found.";
      }
      
      let formatted = `## 📋 Results (${data.length})\n\n`;
      
      if (data.length <= 5) {
        data.forEach((item, index) => {
          formatted += `### Item ${index + 1}\n`;
          formatted += this.formatObjectForDisplay(item);
          formatted += '\n';
        });
      } else {
        formatted += `### Summary\n`;
        formatted += `- **Total Items:** ${data.length}\n\n`;
        formatted += `### Sample Items\n`;
        data.slice(0, 3).forEach((item, index) => {
          formatted += `**Item ${index + 1}:** ${this.getItemSummary(item)}\n`;
        });
        formatted += `\n*... and ${data.length - 3} more items*`;
      }
      
      return formatted;
    } else if (typeof data === 'object') {
      let formatted = `## 📄 Result\n\n`;
      formatted += this.formatObjectForDisplay(data);
      return formatted;
    } else {
      return `## ✅ Result\n\n**Value:** ${data}`;
    }
  }

  private formatObjectForDisplay(obj: any): string {
    let result = '';
    Object.entries(obj).forEach(([key, value]) => {
      const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
      if (typeof value === 'object' && value !== null) {
        result += `- **${formattedKey}:** ${JSON.stringify(value)}\n`;
      } else {
        result += `- **${formattedKey}:** ${value}\n`;
      }
    });
    return result;
  }

  private getItemSummary(item: any): string {
    if (item.name) return item.name;
    if (item.title) return item.title;
    if (item.id) return `ID: ${item.id}`;
    if (item.email) return item.email;
    return 'Item';
  }

  private getErrorMessage(error: any): string {
    if (error.message?.includes('OpenAI')) {
      return "I'm having trouble understanding your request. Please try rephrasing it.";
    }

    if (error.message?.includes('Project') && error.message?.includes('not found')) {
      return "The specified project was not found. Please check the project ID.";
    }

    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return "Authentication is required for this request. Please provide valid credentials.";
    }

    if (error.message?.includes('plan')) {
      return "I couldn't create a plan for your request. Please try being more specific.";
    }

    return "I encountered an error while processing your request. Please try again.";
  }

  // Helper method for testing different types of queries
  async testQuery(projectId: number, queries: string[]): Promise<Array<{ query: string; result: ChatResponse }>> {
    const results: Array<{ query: string; result: ChatResponse }> = [];

    for (const query of queries) {
      try {
        const result = await this.processQuery({
          projectId,
          message: query,
        });
        results.push({ query, result });
      } catch (error) {
        results.push({
          query,
          result: {
            success: false,
            message: error.message,
            error: error.message
          }
        });
      }
    }

    return results;
  }

  private truncateData(data: any): string {
    try {
      if (data === null || data === undefined) {
        return 'null';
      }

      const jsonString = JSON.stringify(data);
      
      // If data is small, return as is
      if (jsonString.length <= 300) {
        return jsonString;
      }
      
      // If it's an array, show count and summary
      if (Array.isArray(data)) {
        return `[Array with ${data.length} items] Preview: ${jsonString.substring(0, 200)}...`;
      }
      
      // If it's an object, show summary
      if (typeof data === 'object') {
        const keys = Object.keys(data);
        return `{Object with ${keys.length} keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}} Preview: ${jsonString.substring(0, 200)}...`;
      }
      
      // For primitives, truncate if too long
      return jsonString.substring(0, 300) + '...';
      
    } catch (error) {
      return `[Error serializing data: ${error.message}]`;
    }
  }

  private storeChatHistory(sessionId: string, request: ChatRequest, response: ChatResponse): void {
    // Store chat history in cache service
    const historyItem: ChatHistoryItem = {
      id: sessionId,
      query: request.message,
      response,
      timestamp: Date.now(),
      userId: request.userId,
      executionTime: response.executionDetails?.executionTime || 0,
    };

    this.cacheService.storeChatHistory(request.projectId, historyItem, request.userId);
  }

  async getChatHistory(projectId: number, userId?: string, limit: number = 20): Promise<ChatHistoryItem[]> {
    return this.cacheService.getChatHistory(projectId, userId, limit);
  }

  async clearUserCache(projectId: number, userId?: string): Promise<void> {
    this.cacheService.clearUserCache(projectId, userId);
  }
}