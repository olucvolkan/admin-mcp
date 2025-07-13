import { io, Socket } from 'socket.io-client';
import {
  MCPChatConfig,
  ChatMessage,
  ChatUpdate,
  WebSocketEvents,
  MCPError,
  EventHandlers,
  UserContext
} from '../types';
import { EventEmitter } from '../utils/EventEmitter';
import { Logger } from '../utils/Logger';

/**
 * MCP Chat Client - Handles WebSocket communication with MCP Server
 */
export class MCPChatClient extends EventEmitter {
  private socket: Socket | null = null;
  private config: Required<MCPChatConfig>;
  private logger: Logger;
  private connectionAttempts: number = 0;
  private isConnecting: boolean = false;
  private messageHistory: ChatMessage[] = [];
  private userContext: UserContext | null = null;

  constructor(config: MCPChatConfig) {
    super();
    
    // Set default configuration
    this.config = {
      serverUrl: config.serverUrl,
      token: config.token || '',
      theme: config.theme || 'auto',
      autoConnect: config.autoConnect !== false,
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectInterval: config.reconnectInterval || 3000,
      debug: config.debug || false,
      customStyles: config.customStyles || {},
      onMessage: config.onMessage || (() => {}),
      onUpdate: config.onUpdate || (() => {}),
      onError: config.onError || (() => {}),
      onConnect: config.onConnect || (() => {}),
      onDisconnect: config.onDisconnect || (() => {})
    };

    this.logger = new Logger('MCPChatClient', this.config.debug);
    
    if (this.config.autoConnect) {
      this.connect();
    }
  }

  /**
   * Connect to the MCP Server via WebSocket
   */
  public async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected()) {
      this.logger.warn('Already connected or connecting');
      return;
    }

    this.isConnecting = true;
    this.logger.info('Connecting to MCP Server:', this.config.serverUrl);

    try {
      this.socket = io(this.config.serverUrl, {
        auth: {
          token: this.config.token
        },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: this.config.reconnectAttempts,
        reconnectionDelay: this.config.reconnectInterval
      });

      this.setupEventListeners();
      
    } catch (error) {
      this.isConnecting = false;
      const mcpError = this.createError('CONNECTION_FAILED', error as Error);
      this.handleError(mcpError);
      throw mcpError;
    }
  }

  /**
   * Disconnect from the MCP Server
   */
  public disconnect(): void {
    if (this.socket) {
      this.logger.info('Disconnecting from MCP Server');
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
    this.connectionAttempts = 0;
  }

  /**
   * Check if client is connected
   */
  public isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Send a chat message to the server
   */
  public async sendMessage(message: string): Promise<string> {
    if (!this.isConnected()) {
      throw this.createError('NOT_CONNECTED', new Error('Client is not connected to server'));
    }

    const messageId = this.generateMessageId();
    const chatMessage: ChatMessage = {
      id: messageId,
      type: 'user',
      content: message,
      timestamp: new Date()
    };

    // Add to message history
    this.messageHistory.push(chatMessage);
    this.emit('message', chatMessage);
    this.config.onMessage(chatMessage);

    // Send to server
    this.socket!.emit('chat_message', {
      message,
      token: this.config.token,
      messageId
    });

    this.logger.debug('Message sent:', { messageId, message });
    return messageId;
  }

  /**
   * Get message history
   */
  public getMessageHistory(): ChatMessage[] {
    return [...this.messageHistory];
  }

  /**
   * Clear message history
   */
  public clearHistory(): void {
    this.messageHistory = [];
    this.emit('historyCleared');
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<MCPChatConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.setDebug(this.config.debug);
  }

  /**
   * Set user context
   */
  public setUserContext(context: UserContext): void {
    this.userContext = context;
    if (this.socket) {
      this.socket.emit('user_context', context);
    }
  }

  /**
   * Get current user context
   */
  public getUserContext(): UserContext | null {
    return this.userContext;
  }

  /**
   * Setup WebSocket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.isConnecting = false;
      this.connectionAttempts = 0;
      this.logger.info('Connected to MCP Server');
      
      // Send user context if available
      if (this.userContext) {
        this.socket!.emit('user_context', this.userContext);
      }
      
      this.emit('connect');
      this.config.onConnect();
    });

    this.socket.on('disconnect', (reason) => {
      this.logger.info('Disconnected from MCP Server:', reason);
      this.emit('disconnect', reason);
      this.config.onDisconnect();
    });

    this.socket.on('connect_error', (error) => {
      this.isConnecting = false;
      this.connectionAttempts++;
      const mcpError = this.createError('CONNECTION_ERROR', error);
      this.logger.error('Connection error:', error);
      this.handleError(mcpError);
    });

    // Chat events
    this.socket.on('chat_update', (data: ChatUpdate) => {
      this.logger.debug('Chat update received:', data);
      this.emit('update', data);
      this.config.onUpdate(data);
    });

    this.socket.on('chat_completed', (data: { messageId: string; finalMessage: ChatMessage }) => {
      this.logger.debug('Chat completed:', data);
      
      // Add assistant message to history
      this.messageHistory.push(data.finalMessage);
      
      this.emit('message', data.finalMessage);
      this.emit('completed', data);
      this.config.onMessage(data.finalMessage);
    });

    // Error events
    this.socket.on('error', (error: any) => {
      const mcpError = this.createError('SERVER_ERROR', error);
      this.handleError(mcpError);
    });

    // Custom MCP events
    this.socket.on('mcp_error', (error: any) => {
      const mcpError = this.createError('MCP_ERROR', error);
      this.handleError(mcpError);
    });
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: MCPError): void {
    this.logger.error('MCP Error:', error);
    this.emit('error', error);
    this.config.onError(error);
  }

  /**
   * Create a standardized MCP error
   */
  private createError(code: string, originalError: Error | any): MCPError {
    const error = new Error(originalError.message || 'Unknown error') as MCPError;
    error.name = 'MCPError';
    error.code = code;
    error.details = originalError;
    error.timestamp = new Date();
    return error;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}