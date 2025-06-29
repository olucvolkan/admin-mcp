import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { Endpoint } from '../entities/endpoint.entity';
import { FieldLink } from '../entities/field-link.entity';
import { Project } from '../entities/project.entity';
import { RequestParameter } from '../entities/request-parameter.entity';
import { ResponseField } from '../entities/response-field.entity';

export interface PlanStep {
  endpoint: string;
  params: Record<string, any>;
}

export interface ExecutionPlan {
  steps: PlanStep[];
}

export interface ApiMetadata {
  endpoints: Array<{
    id: number;
    path: string;
    method: string;
    summary: string;
    promptText?: string; // AI generated description
    keywords?: string[]; // Keywords for lexical matching
    intentPatterns?: string[]; // Intent patterns for matching
    embeddingVector?: number[]; // Embedding for semantic search
    parameters: Array<{
      name: string;
      in: string;
      type: string;
      required: boolean;
      description: string;
    }>;
  }>;
  fieldLinks: Array<{
    fromEndpoint: string;
    fromField: string;
    toEndpoint: string;
    toParam: string;
    description: string;
  }>;
}

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);
  private readonly openai: OpenAI;
  private metadataCache = new Map<number, ApiMetadata>();

  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(Endpoint)
    private endpointRepo: Repository<Endpoint>,
    @InjectRepository(RequestParameter)
    private parameterRepo: Repository<RequestParameter>,
    @InjectRepository(ResponseField)
    private responseFieldRepo: Repository<ResponseField>,
    @InjectRepository(FieldLink)
    private fieldLinkRepo: Repository<FieldLink>,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  async createPlan(projectId: number, userQuery: string, relevantContext: any[] = []): Promise<ExecutionPlan> {
    try {
      this.logger.log(`Creating plan for project ${projectId}: "${userQuery}"`);

      // Load API metadata (with caching)
      const metadata = await this.loadApiMetadata(projectId);
      
      // Perform intent resolution to find best matching endpoints
      const matchedEndpoints = await this.resolveIntent(userQuery, metadata.endpoints);
      
      // Create filtered metadata with top matching endpoints
      const filteredMetadata: ApiMetadata = {
        ...metadata,
        endpoints: matchedEndpoints.slice(0, 10) // Limit to top 10 matches
      };
      
      // Construct LLM prompt with relevant context and matched endpoints
      const prompt = await this.buildPrompt(userQuery, filteredMetadata, relevantContext);
      
      // Get plan from LLM
      const planJson = await this.callLLM(prompt);
      
      // Validate and parse plan
      const plan = this.validatePlan(planJson, metadata);
      
      this.logger.log(`Generated plan with ${plan.steps.length} steps using ${matchedEndpoints.length} matched endpoints`);
      return plan;

    } catch (error) {
      this.logger.error(`Error creating plan: ${error.message}`, error.stack);
      throw new Error(`Failed to create execution plan: ${error.message}`);
    }
  }

  private async loadApiMetadata(projectId: number): Promise<ApiMetadata> {
    // Check cache first
    if (this.metadataCache.has(projectId)) {
      this.logger.debug(`Using cached metadata for project ${projectId}`);
      return this.metadataCache.get(projectId)!;
    }

    this.logger.debug(`Loading metadata for project ${projectId}`);

    // Load endpoints with parameters and AI analysis data
    const endpoints = await this.endpointRepo.find({
      where: { projectId },
      relations: ['requestParameters'],
      order: { path: 'ASC' }
    });

    // Load field links
    const fieldLinks = await this.fieldLinkRepo.find({
      relations: ['fromField', 'fromField.endpoint', 'toEndpoint']
    });

    // Transform to metadata format
    const metadata: ApiMetadata = {
      endpoints: endpoints.map(endpoint => ({
        id: endpoint.id,
        path: endpoint.path,
        method: endpoint.method,
        summary: endpoint.summary || `${endpoint.method} ${endpoint.path}`,
        promptText: (endpoint as any).promptText,
        keywords: (endpoint as any).keywords ? JSON.parse((endpoint as any).keywords) : [],
        intentPatterns: (endpoint as any).intentPatterns ? JSON.parse((endpoint as any).intentPatterns) : [],
        embeddingVector: (endpoint as any).embeddingVector ? JSON.parse((endpoint as any).embeddingVector) : [],
        parameters: (endpoint.requestParameters || []).map(param => ({
          name: param.name,
          in: param.in,
          type: param.type || 'string',
          required: param.required,
          description: param.description || ''
        }))
      })),
      fieldLinks: fieldLinks
        .filter(link => link.fromField?.endpoint?.projectId === projectId)
        .map(link => ({
          fromEndpoint: `${link.fromField.endpoint.method} ${link.fromField.endpoint.path}`,
          fromField: link.fromField.jsonPath,
          toEndpoint: `${link.toEndpoint.method} ${link.toEndpoint.path}`,
          toParam: link.toParamName,
          description: link.description || ''
        }))
    };

    // Cache it
    this.metadataCache.set(projectId, metadata);
    return metadata;
  }

  private async buildPrompt(userQuery: string, metadata: ApiMetadata, relevantContext: any[] = []): Promise<string> {
    const endpointsList = metadata.endpoints
      .slice(0, 15) // Limit to prevent token overflow
      .map(ep => 
        `${ep.method} ${ep.path} - ${ep.summary}` +
        (ep.parameters.length > 0 
          ? `. Params: ${ep.parameters.map(p => `${p.name}(${p.in}${p.required ? ', required' : ''})`).join(', ')}`
          : ''
        )
      )
      .join('\n');

    const fieldLinksList = metadata.fieldLinks
      .slice(0, 10) // Limit field links
      .map(link => `${link.fromField} from "${link.fromEndpoint}" → ${link.toParam} in "${link.toEndpoint}"`)
      .join('\n');

    // Build context section from relevant cached data
    const contextSection = relevantContext.length > 0 
      ? `\nRelevant Context from Previous Queries:
${relevantContext.map((ctx, index) => 
  `${index + 1}. Query: "${ctx.query}"
   Result: ${JSON.stringify(ctx.data).slice(0, 200)}${JSON.stringify(ctx.data).length > 200 ? '...' : ''}
   Endpoint: ${ctx.endpoint}`
).join('\n\n')}

Use this context to understand what data might already be available or what the user might be referring to.
` : '';

    return `You are an intelligent API planner that translates user requests into structured API call sequences.

User Query: "${userQuery}"
${contextSection}
Available API Endpoints:
${endpointsList}

${fieldLinksList ? `Field Relationships (for chaining calls):
${fieldLinksList}

` : ''}Instructions:
1. Analyze the user's request and identify the most appropriate endpoint(s)
2. For queries like "get all users", "list users", "show users" - use GET endpoints that retrieve user data
3. For queries like "get all products", "list products" - use GET endpoints that retrieve product data
4. Always create at least one step in your plan
5. Output ONLY valid JSON in this exact format:
{
  "steps": [
    {
      "endpoint": "<METHOD> <PATH>",
      "params": {
        "<param_name>": "<value_or_reference>"
      }
    }
  ]
}

6. For multi-step plans, reference previous results using JSONPath: "$.steps[0].response.fieldName"
7. Use actual values from the user query for parameters when available
8. If no required parameters are needed, use empty params object: "params": {}
9. Ensure all required parameters are included
10. DO NOT include any explanatory text, only the JSON plan
11. ALWAYS provide a valid JSON response with at least one step

Examples:
- "Get all users" → {"steps": [{"endpoint": "GET /users", "params": {}}]}
- "Find user john" → {"steps": [{"endpoint": "GET /users/{username}", "params": {"username": "john"}}]}

Plan:`;
  }

  private async callLLM(prompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a precise API planner. Output only valid JSON plans, no explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent output
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      this.logger.debug(`LLM Response: ${content}`);
      return content;

    } catch (error) {
      this.logger.error(`LLM API call failed: ${error.message}`);
      throw new Error(`Failed to get plan from LLM: ${error.message}`);
    }
  }

  private validatePlan(planJson: string, metadata: ApiMetadata): ExecutionPlan {
    let plan: ExecutionPlan;

    this.logger.debug(`Validating plan JSON: ${planJson}`);

    // First try to extract JSON from response (in case LLM added extra text)
    const jsonMatch = planJson.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : planJson;

    // Parse JSON
    try {
      plan = JSON.parse(cleanJson);
    } catch (error) {
      this.logger.error(`JSON parse failed for: ${cleanJson}`);
      throw new Error(`Invalid JSON in plan: ${error.message}. Raw response: ${planJson}`);
    }

    // Validate structure
    if (!plan.steps || !Array.isArray(plan.steps)) {
      this.logger.error(`Plan structure invalid:`, plan);
      throw new Error('Plan must have a "steps" array');
    }

    if (plan.steps.length === 0) {
      this.logger.error('Plan has no steps, creating fallback plan');
      // Try to create a fallback plan for simple queries
      plan = this.createFallbackPlan(metadata);
    }

    // Validate each step
    const endpointMap = new Map(
      metadata.endpoints.map(ep => [`${ep.method} ${ep.path}`, ep])
    );

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      
      if (!step.endpoint || typeof step.endpoint !== 'string') {
        throw new Error(`Step ${i + 1}: endpoint must be a string`);
      }

      if (!step.params || typeof step.params !== 'object') {
        throw new Error(`Step ${i + 1}: params must be an object`);
      }

      // Validate endpoint exists
      const endpoint = endpointMap.get(step.endpoint);
      if (!endpoint) {
        throw new Error(`Step ${i + 1}: Unknown endpoint "${step.endpoint}"`);
      }

      // Validate required parameters
      const requiredParams = endpoint.parameters.filter(p => p.required);
      for (const requiredParam of requiredParams) {
        if (!(requiredParam.name in step.params)) {
          throw new Error(`Step ${i + 1}: Missing required parameter "${requiredParam.name}"`);
        }
      }
    }

    this.logger.debug('Plan validation successful');
    return plan;
  }

  private createFallbackPlan(metadata: ApiMetadata): ExecutionPlan {
    this.logger.debug('Creating fallback plan');
    
    // Look for common GET endpoints that might be useful
    const getEndpoints = metadata.endpoints.filter(ep => 
      ep.method === 'GET' && 
      !ep.path.includes('{') && // No path parameters
      ep.parameters.filter(p => p.required).length === 0 // No required parameters
    );

    if (getEndpoints.length > 0) {
      // Use the first suitable endpoint
      const endpoint = getEndpoints[0];
      this.logger.debug(`Using fallback endpoint: ${endpoint.method} ${endpoint.path}`);
      
      return {
        steps: [{
          endpoint: `${endpoint.method} ${endpoint.path}`,
          params: {}
        }]
      };
    }

    // If no suitable GET endpoint, try any endpoint without required params
    const simpleEndpoints = metadata.endpoints.filter(ep => 
      ep.parameters.filter(p => p.required).length === 0
    );

    if (simpleEndpoints.length > 0) {
      const endpoint = simpleEndpoints[0];
      this.logger.debug(`Using simple fallback endpoint: ${endpoint.method} ${endpoint.path}`);
      
      return {
        steps: [{
          endpoint: `${endpoint.method} ${endpoint.path}`,
          params: {}
        }]
      };
    }

    // Last resort: throw error
    throw new Error('No suitable endpoints found for fallback plan. Please check your query and available endpoints.');
  }

  /**
   * Resolve user intent by finding best matching endpoints using semantic and lexical similarity
   */
  private async resolveIntent(userQuery: string, endpoints: ApiMetadata['endpoints']): Promise<ApiMetadata['endpoints']> {
    this.logger.debug(`Resolving intent for query: "${userQuery}"`);

    // Generate embedding for user query
    const queryEmbedding = await this.generateQueryEmbedding(userQuery);

    // Score all endpoints
    const scoredEndpoints = endpoints.map(endpoint => {
      let score = 0;
      let matchReasons: string[] = [];

      // 1. Semantic similarity using embeddings
      if (queryEmbedding && endpoint.embeddingVector && endpoint.embeddingVector.length > 0) {
        const semanticScore = this.calculateCosineSimilarity(queryEmbedding, endpoint.embeddingVector);
        score += semanticScore * 0.4; // 40% weight for semantic similarity
        if (semanticScore > 0.7) {
          matchReasons.push(`high semantic similarity (${semanticScore.toFixed(2)})`);
        }
      }

      // 2. Lexical matching with keywords
      if (endpoint.keywords && endpoint.keywords.length > 0) {
        const keywordScore = this.calculateKeywordSimilarity(userQuery, endpoint.keywords);
        score += keywordScore * 0.3; // 30% weight for keyword matching
        if (keywordScore > 0.5) {
          matchReasons.push(`keyword match (${keywordScore.toFixed(2)})`);
        }
      }

      // 3. Intent pattern matching
      if (endpoint.intentPatterns && endpoint.intentPatterns.length > 0) {
        const intentScore = this.calculateIntentSimilarity(userQuery, endpoint.intentPatterns);
        score += intentScore * 0.3; // 30% weight for intent patterns
        if (intentScore > 0.6) {
          matchReasons.push(`intent pattern match (${intentScore.toFixed(2)})`);
        }
      }

      // Boost score if endpoint has good AI-generated description
      if (endpoint.promptText && endpoint.promptText.length > 20) {
        score += 0.1; // Small boost for well-documented endpoints
      }

      if (score > 0.3) {
        this.logger.debug(`Endpoint ${endpoint.method} ${endpoint.path}: score=${score.toFixed(2)}, reasons=[${matchReasons.join(', ')}]`);
      }

      return { ...endpoint, matchScore: score, matchReasons };
    });

    // Sort by score and return top matches
    const sortedEndpoints = scoredEndpoints
      .filter(ep => ep.matchScore > 0.2) // Minimum threshold
      .sort((a, b) => b.matchScore - a.matchScore);

    this.logger.debug(`Found ${sortedEndpoints.length} matching endpoints above threshold`);

    if (sortedEndpoints.length === 0) {
      this.logger.warn('No endpoints matched above threshold, returning all endpoints');
      return endpoints; // Return all if no good matches
    }

    return sortedEndpoints;
  }

  /**
   * Generate embedding for user query
   */
  private async generateQueryEmbedding(query: string): Promise<number[] | null> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: query
      });

      return response.data[0].embedding;

    } catch (error) {
      this.logger.warn(`Failed to generate query embedding: ${error.message}`);
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Calculate keyword similarity score
   */
  private calculateKeywordSimilarity(query: string, keywords: string[]): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const keywordMatches = keywords.filter(keyword => 
      queryWords.some(word => 
        word.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(word)
      )
    );

    return keywords.length > 0 ? keywordMatches.length / keywords.length : 0;
  }

  /**
   * Calculate intent pattern similarity score
   */
  private calculateIntentSimilarity(query: string, intentPatterns: string[]): number {
    const queryLower = query.toLowerCase();
    let bestScore = 0;

    for (const pattern of intentPatterns) {
      const patternLower = pattern.toLowerCase();
      
      // Check for exact substring match
      if (queryLower.includes(patternLower) || patternLower.includes(queryLower)) {
        bestScore = Math.max(bestScore, 0.9);
      }
      
      // Check for word overlap
      const queryWords = queryLower.split(/\s+/);
      const patternWords = patternLower.split(/\s+/);
      const commonWords = queryWords.filter(word => patternWords.includes(word));
      
      if (commonWords.length > 0) {
        const overlapScore = commonWords.length / Math.max(queryWords.length, patternWords.length);
        bestScore = Math.max(bestScore, overlapScore * 0.7);
      }
    }

    return bestScore;
  }

  // Clear cache when needed (for spec updates)
  clearCache(projectId?: number): void {
    if (projectId) {
      this.metadataCache.delete(projectId);
      this.logger.debug(`Cleared cache for project ${projectId}`);
    } else {
      this.metadataCache.clear();
      this.logger.debug('Cleared all metadata cache');
    }
  }
} 