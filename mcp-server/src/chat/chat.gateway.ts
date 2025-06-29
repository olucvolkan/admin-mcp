import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService, UserContext } from '../auth/auth.service';
import { ChatRequest, ChatService, ChatStreamUpdate } from './chat.service';

interface AuthenticatedSocket extends Socket {
  userContext?: UserContext;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly authService: AuthService
  ) {}

  async handleConnection(client: AuthenticatedSocket, ...args: any[]) {
    try {
      // Extract session cookie from WebSocket handshake
      const cookies = this.parseCookies(client.handshake.headers.cookie || '');
      const sessionCookieName = this.authService.getSessionCookieName();
      const sessionCookie = cookies[sessionCookieName];

      if (sessionCookie) {
        client.userContext = {
          sessionCookie,
          cookieName: sessionCookieName
        };
        this.logger.log(`WebSocket client connected with session: ${sessionCookieName}`);
      } else {
        this.logger.log('WebSocket client connected without session cookie');
      }

      client.emit('connectionInfo', {
        connected: true,
        hasSession: !!client.userContext,
        sessionCookieName: client.userContext?.cookieName || 'none',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error(`WebSocket connection error: ${error.message}`);
      client.emit('connectionInfo', {
        connected: true,
        hasSession: false,
        error: 'Session extraction failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userContext) {
      this.logger.log(`WebSocket client disconnected (had session: ${client.userContext.cookieName})`);
    } else {
      this.logger.log('WebSocket client disconnected (no session)');
    }
  }

  @SubscribeMessage('chat_query')
  async handleChatQuery(
    @MessageBody() data: { projectId: number; message: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const startTime = Date.now();
    
    try {
      this.logger.log(`WebSocket chat query for project ${data.projectId}: "${data.message}"`);
      
      if (client.userContext) {
        this.logger.debug(`Query with session: ${client.userContext.cookieName}`);
      } else {
        this.logger.debug('Query without session - API will handle authentication');
      }

      const chatRequest: ChatRequest = {
        projectId: data.projectId,
        message: data.message,
        userContext: client.userContext
      };

      // Process query with streaming updates
      await this.chatService.processQueryStream(chatRequest, (update: ChatStreamUpdate) => {
        client.emit('chat_update', update);
      });

    } catch (error) {
      this.logger.error(`WebSocket chat query error: ${error.message}`, error.stack);
      
      client.emit('chat_update', {
        type: 'error',
        message: 'An error occurred while processing your request',
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime,
        error: error.message
      });
    }
  }

  @SubscribeMessage('get_chat_history')
  async handleGetChatHistory(
    @MessageBody() data: { projectId: number; limit?: number },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      this.logger.log(`WebSocket get chat history for project ${data.projectId}`);

      // Extract userId from session if available (optional)
      const userId = client.userContext?.sessionCookie ? 
        client.userContext.sessionCookie.substring(0, 8) : undefined;

      const history = await this.chatService.getChatHistory(
        data.projectId,
        userId,
        data.limit || 20
      );

      client.emit('chat_history', {
        projectId: data.projectId,
        history,
        hasSession: !!client.userContext,
        userId: userId || 'anonymous'
      });

    } catch (error) {
      this.logger.error(`WebSocket get chat history error: ${error.message}`, error.stack);
      
      client.emit('chat_history', {
        projectId: data.projectId,
        history: [],
        error: error.message
      });
    }
  }

  @SubscribeMessage('clear_cache')
  async handleClearCache(
    @MessageBody() data: { projectId: number },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      this.logger.log(`WebSocket clear cache for project ${data.projectId}`);

      // Extract userId from session if available (optional)
      const userId = client.userContext?.sessionCookie ? 
        client.userContext.sessionCookie.substring(0, 8) : undefined;

      await this.chatService.clearUserCache(data.projectId, userId);

      client.emit('cache_cleared', {
        projectId: data.projectId,
        success: true,
        message: `Cache cleared for project ${data.projectId}${userId ? ` and user ${userId}` : ''}`,
        hasSession: !!client.userContext
      });

    } catch (error) {
      this.logger.error(`WebSocket clear cache error: ${error.message}`, error.stack);
      
      client.emit('cache_cleared', {
        projectId: data.projectId,
        success: false,
        error: error.message
      });
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    client.emit('pong', {
      timestamp: new Date().toISOString(),
      hasSession: !!client.userContext,
      sessionCookieName: client.userContext?.cookieName || 'none'
    });
  }

  private parseCookies(cookieString: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    
    if (!cookieString) {
      return cookies;
    }

    cookieString.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
    });

    return cookies;
  }
} 