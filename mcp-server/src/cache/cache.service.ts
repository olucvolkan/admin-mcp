import { Injectable, Logger } from '@nestjs/common';
import NodeCache from 'node-cache';

export interface CachedResponseData {
  projectId: number;
  query: string;
  data: any;
  timestamp: number;
  executionTime: number;
  endpoint: string;
}

export interface ChatHistoryItem {
  id: string;
  query: string;
  response: any;
  timestamp: number;
  userId?: string;
  executionTime: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly cache: NodeCache;
  private readonly userSessionCache: NodeCache;
  private readonly chatHistoryCache: NodeCache;

  constructor() {
    // Response data cache - TTL 1 hour
    this.cache = new NodeCache({
      stdTTL: 3600, // 1 hour
      checkperiod: 600, // Check for expired keys every 10 minutes
      useClones: false
    });

    // User session cache - TTL 30 minutes
    this.userSessionCache = new NodeCache({
      stdTTL: 1800, // 30 minutes
      checkperiod: 300, // Check every 5 minutes
      useClones: false
    });

    // Chat history cache - TTL 24 hours
    this.chatHistoryCache = new NodeCache({
      stdTTL: 86400, // 24 hours
      checkperiod: 3600, // Check every hour
      useClones: false
    });

    this.logger.log('Cache service initialized');
  }

  /**
   * Store final response data for future reference
   */
  storeResponseData(
    projectId: number,
    query: string,
    data: any,
    executionTime: number,
    endpoint: string,
    userId?: string
  ): string {
    const cacheKey = this.generateCacheKey(projectId, query, userId);
    
    const cachedData: CachedResponseData = {
      projectId,
      query,
      data,
      timestamp: Date.now(),
      executionTime,
      endpoint
    };

    this.cache.set(cacheKey, cachedData);
    
    // Also store in user session for easy retrieval
    if (userId) {
      this.addToUserSession(userId, cacheKey, query);
    }

    this.logger.log(`Cached response data for query: "${query}" (key: ${cacheKey})`);
    return cacheKey;
  }

  /**
   * Retrieve cached response data
   */
  getResponseData(cacheKey: string): CachedResponseData | null {
    const data = this.cache.get<CachedResponseData>(cacheKey);
    
    if (data) {
      this.logger.debug(`Cache hit for key: ${cacheKey}`);
      return data;
    }

    this.logger.debug(`Cache miss for key: ${cacheKey}`);
    return null;
  }

  /**
   * Search for cached data by query pattern
   */
  searchCachedData(
    projectId: number,
    queryPattern: string,
    userId?: string
  ): CachedResponseData[] {
    const allKeys = this.cache.keys();
    const results: CachedResponseData[] = [];

    for (const key of allKeys) {
      const data = this.cache.get<CachedResponseData>(key);
      
      if (data && data.projectId === projectId) {
        // Check if query matches pattern (case insensitive)
        if (this.queryMatches(data.query, queryPattern)) {
          results.push(data);
        }
      }
    }

    this.logger.debug(`Found ${results.length} cached results for pattern: "${queryPattern}"`);
    return results.sort((a, b) => b.timestamp - a.timestamp); // Most recent first
  }

  /**
   * Get user's recent queries and their cached data
   */
  getUserSessionData(userId: string): Array<{
    cacheKey: string;
    query: string;
    data?: CachedResponseData;
  }> {
    const sessionData = this.userSessionCache.get<Array<{
      cacheKey: string;
      query: string;
      timestamp: number;
    }>>(userId);

    if (!sessionData) {
      return [];
    }

    return sessionData.map(session => {
      const cachedData = this.getResponseData(session.cacheKey);
      return {
        cacheKey: session.cacheKey,
        query: session.query,
        data: cachedData || undefined // Convert null to undefined
      };
    }).filter(item => item.data !== undefined); // Filter out expired cache entries
  }

  /**
   * Find relevant cached data for context in new queries
   */
  findRelevantContext(
    projectId: number,
    currentQuery: string,
    userId?: string
  ): CachedResponseData[] {
    const keywords = this.extractKeywords(currentQuery);
    const relevantData: CachedResponseData[] = [];

    // First, check user's recent session data
    if (userId) {
      const userSession = this.getUserSessionData(userId);
      for (const session of userSession) {
        if (session.data && this.hasRelevantKeywords(session.data.query, keywords)) {
          relevantData.push(session.data);
        }
      }
    }

    // Then, search all cached data for the project
    const allKeys = this.cache.keys();
    for (const key of allKeys) {
      const data = this.cache.get<CachedResponseData>(key);
      
      if (data && data.projectId === projectId) {
        if (this.hasRelevantKeywords(data.query, keywords)) {
          // Avoid duplicates from user session
          if (!relevantData.some(item => item.timestamp === data.timestamp)) {
            relevantData.push(data);
          }
        }
      }
    }

    // Sort by relevance score and recency
    return relevantData
      .map(data => ({
        ...data,
        relevanceScore: this.calculateRelevanceScore(data.query, currentQuery)
      }))
      .sort((a, b) => {
        // First by relevance score, then by recency
        if (a.relevanceScore !== b.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        return b.timestamp - a.timestamp;
      })
      .slice(0, 5); // Return top 5 most relevant
  }

  /**
   * Clear cache for a specific project
   */
  clearProjectCache(projectId: number): void {
    const allKeys = this.cache.keys();
    let clearedCount = 0;

    for (const key of allKeys) {
      const data = this.cache.get<CachedResponseData>(key);
      if (data && data.projectId === projectId) {
        this.cache.del(key);
        clearedCount++;
      }
    }

    this.logger.log(`Cleared ${clearedCount} cache entries for project ${projectId}`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    responseDataCount: number;
    userSessionCount: number;
    memoryUsage: {
      responseData: number;
      userSessions: number;
    };
  } {
    return {
      responseDataCount: this.cache.keys().length,
      userSessionCount: this.userSessionCache.keys().length,
      memoryUsage: {
        responseData: (this.cache as any).getStats?.()?.vsize || 0,
        userSessions: (this.userSessionCache as any).getStats?.()?.vsize || 0
      }
    };
  }

  // Private helper methods
  private generateCacheKey(projectId: number, query: string, userId?: string): string {
    const queryHash = Buffer.from(query.toLowerCase()).toString('base64').slice(0, 10);
    const userPart = userId ? `_${userId.slice(0, 8)}` : '';
    return `p${projectId}_${queryHash}${userPart}_${Date.now()}`;
  }

  private addToUserSession(userId: string, cacheKey: string, query: string): void {
    let sessionData = this.userSessionCache.get<Array<{
      cacheKey: string;
      query: string;
      timestamp: number;
    }>>(userId) || [];

    // Add new entry
    sessionData.unshift({
      cacheKey,
      query,
      timestamp: Date.now()
    });

    // Keep only last 20 queries per user
    sessionData = sessionData.slice(0, 20);

    this.userSessionCache.set(userId, sessionData);
  }

  private queryMatches(cachedQuery: string, pattern: string): boolean {
    const normalizedCached = cachedQuery.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();

    // Exact match
    if (normalizedCached.includes(normalizedPattern)) {
      return true;
    }

    // Keyword matching
    const patternWords = normalizedPattern.split(/\s+/);
    const cachedWords = normalizedCached.split(/\s+/);

    return patternWords.some(word => 
      cachedWords.some(cachedWord => 
        cachedWord.includes(word) || word.includes(cachedWord)
      )
    );
  }

  private extractKeywords(query: string): string[] {
    // Remove common words and extract meaningful keywords
    const commonWords = ['get', 'find', 'show', 'list', 'create', 'update', 'delete', 'the', 'a', 'an', 'and', 'or', 'with', 'for', 'of', 'in', 'on', 'at', 'to', 'from'];
    
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.includes(word))
      .slice(0, 5); // Take first 5 meaningful keywords
  }

  private hasRelevantKeywords(cachedQuery: string, keywords: string[]): boolean {
    const cachedLower = cachedQuery.toLowerCase();
    return keywords.some(keyword => cachedLower.includes(keyword));
  }

  private calculateRelevanceScore(cachedQuery: string, currentQuery: string): number {
    const cachedKeywords = this.extractKeywords(cachedQuery);
    const currentKeywords = this.extractKeywords(currentQuery);

    let score = 0;
    
    // Exact keyword matches
    for (const keyword of currentKeywords) {
      if (cachedKeywords.includes(keyword)) {
        score += 2;
      }
    }

    // Partial matches
    for (const keyword of currentKeywords) {
      for (const cachedKeyword of cachedKeywords) {
        if (keyword.includes(cachedKeyword) || cachedKeyword.includes(keyword)) {
          score += 1;
        }
      }
    }

    return score;
  }

  /**
   * Store chat history for a user session
   */
  storeChatHistory(projectId: number, historyItem: ChatHistoryItem, userId?: string): void {
    const historyKey = this.generateHistoryKey(projectId, userId);
    
    let history = this.chatHistoryCache.get<ChatHistoryItem[]>(historyKey) || [];
    
    // Add new item to the beginning
    history.unshift(historyItem);
    
    // Keep only last 100 items per project/user
    history = history.slice(0, 100);
    
    this.chatHistoryCache.set(historyKey, history);
    
    this.logger.debug(`Stored chat history item for project ${projectId}, user: ${userId || 'anonymous'}`);
  }

  /**
   * Get chat history for a project and user
   */
  getChatHistory(projectId: number, userId?: string, limit: number = 20): ChatHistoryItem[] {
    const historyKey = this.generateHistoryKey(projectId, userId);
    const history = this.chatHistoryCache.get<ChatHistoryItem[]>(historyKey) || [];
    
    return history.slice(0, limit);
  }

  /**
   * Clear user cache including chat history
   */
  clearUserCache(projectId: number, userId?: string): void {
    if (userId) {
      // Clear user session cache
      this.userSessionCache.del(userId);
      
      // Clear user-specific chat history
      const historyKey = this.generateHistoryKey(projectId, userId);
      this.chatHistoryCache.del(historyKey);
      
      this.logger.log(`Cleared cache for user ${userId} in project ${projectId}`);
    } else {
      // Clear all chat history for the project
      const allHistoryKeys = this.chatHistoryCache.keys();
      const projectHistoryKeys = allHistoryKeys.filter(key => key.startsWith(`hist_p${projectId}_`));
      
      for (const key of projectHistoryKeys) {
        this.chatHistoryCache.del(key);
      }
      
      this.logger.log(`Cleared all chat history for project ${projectId}`);
    }
  }

  private generateHistoryKey(projectId: number, userId?: string): string {
    return userId ? `hist_p${projectId}_u${userId}` : `hist_p${projectId}_anon`;
  }
} 