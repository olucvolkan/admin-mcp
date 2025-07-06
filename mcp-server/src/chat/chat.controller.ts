import { Body, Controller, Delete, Get, Logger, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthGuard } from '../auth/auth.guard';
import { ChatHistoryItem, ChatRequest, ChatResponse, ChatService } from './chat.service';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Post()
  async processQuery(
    @Body() body: { projectId: number; message: string },
    @Req() request: FastifyRequest
  ): Promise<ChatResponse> {
    const chatRequest: ChatRequest = {
      projectId: body.projectId,
      message: body.message,
      userContext: request.userContext
    };

    this.logger.log(`Processing query for project ${body.projectId}: "${body.message}"`);
    
    if (request.userContext?.authType === 'bearer') {
      this.logger.debug('Request with Bearer token authentication');
    } else if (request.userContext?.authType === 'session') {
      this.logger.debug(`Request with session cookie: ${request.userContext.cookieName}`);
    } else {
      this.logger.debug('Request without authentication - API will handle authentication');
    }

    return this.chatService.processQuery(chatRequest);
  }

  @Get('search/:projectId')
  async searchCachedResponses(
    @Param('projectId') projectId: number,
    @Req() request: FastifyRequest
  ): Promise<ChatHistoryItem[]> {
    this.logger.log(`Searching cached responses for project ${projectId}`);
    
    // Extract userId from session/token if available (optional)
    const userId = request.userContext?.authType === 'session' && request.userContext.sessionCookie ? 
      request.userContext.sessionCookie.substring(0, 8) : 
      request.userContext?.authType === 'bearer' && request.userContext.bearerToken ?
      request.userContext.bearerToken.substring(0, 8) : undefined;
    
    return this.chatService.getChatHistory(projectId, userId);
  }

  @Get('session/:projectId')
  async getUserSessionData(
    @Param('projectId') projectId: number,
    @Req() request: FastifyRequest
  ): Promise<{ sessionInfo: any; chatHistory: ChatHistoryItem[] }> {
    this.logger.log(`Getting session data for project ${projectId}`);

    // Extract userId from session/token if available (optional)
    const userId = request.userContext?.authType === 'session' && request.userContext.sessionCookie ? 
      request.userContext.sessionCookie.substring(0, 8) : 
      request.userContext?.authType === 'bearer' && request.userContext.bearerToken ?
      request.userContext.bearerToken.substring(0, 8) : undefined;

    const chatHistory = await this.chatService.getChatHistory(projectId, userId, 10);
    
    return {
      sessionInfo: {
        hasSession: request.userContext?.authType !== 'none',
        authType: request.userContext?.authType || 'none',
        sessionCookieName: request.userContext?.cookieName || 'none',
        hasBearerToken: request.userContext?.authType === 'bearer',
        userId: userId || 'anonymous'
      },
      chatHistory
    };
  }

  @Delete('cache/:projectId')
  async clearProjectCache(
    @Param('projectId') projectId: number,
    @Req() request: FastifyRequest
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Clearing cache for project ${projectId}`);

    // Extract userId from session/token if available (optional)
    const userId = request.userContext?.authType === 'session' && request.userContext.sessionCookie ? 
      request.userContext.sessionCookie.substring(0, 8) : 
      request.userContext?.authType === 'bearer' && request.userContext.bearerToken ?
      request.userContext.bearerToken.substring(0, 8) : undefined;

    await this.chatService.clearUserCache(projectId, userId);
    
    return {
      success: true,
      message: `Cache cleared for project ${projectId}${userId ? ` and user ${userId}` : ''}`
    };
  }

  @Get('cache/stats/:projectId')
  async getCacheStats(
    @Param('projectId') projectId: number,
    @Req() request: FastifyRequest
  ): Promise<any> {
    this.logger.log(`Getting cache stats for project ${projectId}`);

    // Extract userId from session/token if available (optional)
    const userId = request.userContext?.authType === 'session' && request.userContext.sessionCookie ? 
      request.userContext.sessionCookie.substring(0, 8) : 
      request.userContext?.authType === 'bearer' && request.userContext.bearerToken ?
      request.userContext.bearerToken.substring(0, 8) : undefined;

    const chatHistory = await this.chatService.getChatHistory(projectId, userId);
    
    return {
      projectId,
      userId: userId || 'anonymous',
      totalQueries: chatHistory.length,
      lastQuery: chatHistory[0]?.timestamp || null,
      hasSession: request.userContext?.authType !== 'none',
      authType: request.userContext?.authType || 'none'
    };
  }

  @Post(':projectId/test')
  async testQueries(
    @Param('projectId') projectId: number,
    @Body() body: { queries: string[] },
    @Req() request: FastifyRequest
  ): Promise<Array<{ query: string; result: ChatResponse }>> {
    this.logger.log(`Testing ${body.queries.length} queries for project ${projectId}`);
    
    if (request.userContext?.authType === 'bearer') {
      this.logger.debug('Test queries with Bearer token authentication');
    } else if (request.userContext?.authType === 'session') {
      this.logger.debug(`Test queries with session cookie: ${request.userContext.cookieName}`);
    } else {
      this.logger.debug('Test queries without authentication');
    }

    return this.chatService.testQuery(projectId, body.queries);
  }
} 