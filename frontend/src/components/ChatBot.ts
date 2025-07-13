import { MCPChatClient } from '../client/MCPChatClient';
import { VisualResponseRenderer } from './VisualResponseRenderer';
import {
  MCPChatConfig,
  ChatMessage,
  ChatUpdate,
  VisualResponse,
  ThemeConfig
} from '../types';

/**
 * ChatBot - Main chat component that integrates client and renderer
 */
export class ChatBot {
  private client: MCPChatClient;
  private renderer: VisualResponseRenderer;
  private container: HTMLElement;
  private chatContainer: HTMLElement;
  private inputContainer: HTMLElement;
  private messageInput: HTMLInputElement;
  private sendButton: HTMLButtonElement;
  private messagesContainer: HTMLElement;
  private isTyping: boolean = false;
  private config: MCPChatConfig;

  constructor(config: MCPChatConfig) {
    this.config = config;
    this.client = new MCPChatClient(config);
    this.container = document.createElement('div');
    this.renderer = new VisualResponseRenderer(this.container, config.theme);
    
    this.initializeUI();
    this.setupEventListeners();
  }

  /**
   * Mount the chat bot to a DOM element
   */
  public mount(targetElement: HTMLElement): void {
    targetElement.appendChild(this.container);
    this.messageInput.focus();
  }

  /**
   * Unmount the chat bot
   */
  public unmount(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.client.disconnect();
  }

  /**
   * Send a message programmatically
   */
  public async sendMessage(message: string): Promise<void> {
    if (!message.trim()) return;
    
    try {
      await this.client.sendMessage(message);
      this.messageInput.value = '';
      this.updateSendButton();
    } catch (error) {
      this.showError('Failed to send message. Please try again.');
    }
  }

  /**
   * Clear chat history
   */
  public clearHistory(): void {
    this.client.clearHistory();
    this.messagesContainer.innerHTML = '';
  }

  /**
   * Set theme
   */
  public setTheme(theme: 'light' | 'dark'): void {
    this.renderer.setTheme(theme);
    this.container.setAttribute('data-theme', theme);
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<MCPChatConfig>): void {
    this.config = { ...this.config, ...updates };
    this.client.updateConfig(updates);
    
    if (updates.theme) {
      this.setTheme(updates.theme);
    }
    
    if (updates.customStyles) {
      this.renderer.setCustomStyles(updates.customStyles);
    }
  }

  /**
   * Get connection status
   */
  public isConnected(): boolean {
    return this.client.isConnected();
  }

  /**
   * Initialize the UI structure
   */
  private initializeUI(): void {
    this.container.className = 'mcp-chatbot';
    this.container.setAttribute('data-theme', this.config.theme || 'light');

    // Create chat container
    this.chatContainer = document.createElement('div');
    this.chatContainer.className = 'mcp-chat-container';

    // Create header
    const header = this.createHeader();
    this.chatContainer.appendChild(header);

    // Create messages container
    this.messagesContainer = document.createElement('div');
    this.messagesContainer.className = 'mcp-messages-container';
    this.chatContainer.appendChild(this.messagesContainer);

    // Create input container
    this.inputContainer = this.createInputContainer();
    this.chatContainer.appendChild(this.inputContainer);

    this.container.appendChild(this.chatContainer);

    // Add styles
    this.addStyles();
  }

  /**
   * Create chat header
   */
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'mcp-chat-header';

    const title = document.createElement('h3');
    title.className = 'mcp-chat-title';
    title.textContent = 'MCP Assistant';
    header.appendChild(title);

    const status = document.createElement('div');
    status.className = 'mcp-chat-status';
    status.textContent = 'Connecting...';
    header.appendChild(status);

    return header;
  }

  /**
   * Create input container
   */
  private createInputContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'mcp-input-container';

    // Create input
    this.messageInput = document.createElement('input');
    this.messageInput.type = 'text';
    this.messageInput.className = 'mcp-message-input';
    this.messageInput.placeholder = 'Type your message...';
    this.messageInput.disabled = true;

    // Create send button
    this.sendButton = document.createElement('button');
    this.sendButton.className = 'mcp-send-button';
    this.sendButton.textContent = 'Send';
    this.sendButton.disabled = true;

    container.appendChild(this.messageInput);
    container.appendChild(this.sendButton);

    return container;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Client events
    this.client.on('connect', () => {
      this.updateStatus('Connected', 'connected');
      this.messageInput.disabled = false;
      this.updateSendButton();
    });

    this.client.on('disconnect', () => {
      this.updateStatus('Disconnected', 'disconnected');
      this.messageInput.disabled = true;
      this.sendButton.disabled = true;
    });

    this.client.on('error', (error) => {
      this.showError(error.message);
      this.updateStatus('Error', 'error');
    });

    this.client.on('message', (message: ChatMessage) => {
      this.addMessage(message);
    });

    this.client.on('update', (update: ChatUpdate) => {
      this.handleChatUpdate(update);
    });

    // Input events
    this.messageInput.addEventListener('input', () => {
      this.updateSendButton();
    });

    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });

    this.sendButton.addEventListener('click', () => {
      this.handleSendMessage();
    });

    // Custom events from renderer
    this.container.addEventListener('mcp-action', (e: CustomEvent) => {
      this.handleCustomAction(e.detail.action, e.detail.data);
    });

    this.container.addEventListener('mcp-sort', (e: CustomEvent) => {
      this.handleSort(e.detail.columnKey);
    });
  }

  /**
   * Handle send message
   */
  private async handleSendMessage(): Promise<void> {
    const message = this.messageInput.value.trim();
    if (!message || !this.client.isConnected()) return;

    await this.sendMessage(message);
  }

  /**
   * Add message to chat
   */
  private addMessage(message: ChatMessage): void {
    const messageElement = document.createElement('div');
    messageElement.className = `mcp-message mcp-message-${message.type}`;
    messageElement.setAttribute('data-message-id', message.id);

    // Message header
    const header = document.createElement('div');
    header.className = 'mcp-message-header';
    
    const sender = document.createElement('span');
    sender.className = 'mcp-message-sender';
    sender.textContent = message.type === 'user' ? 'You' : 'Assistant';
    header.appendChild(sender);

    const timestamp = document.createElement('span');
    timestamp.className = 'mcp-message-timestamp';
    timestamp.textContent = this.formatTimestamp(message.timestamp);
    header.appendChild(timestamp);

    messageElement.appendChild(header);

    // Message content
    const content = document.createElement('div');
    content.className = 'mcp-message-content';
    content.textContent = message.content;
    messageElement.appendChild(content);

    // Visual responses
    if (message.visuals && message.visuals.length > 0) {
      const visualsContainer = document.createElement('div');
      visualsContainer.className = 'mcp-message-visuals';
      
      message.visuals.forEach(visual => {
        const visualElement = this.renderer.render(visual);
        visualsContainer.appendChild(visualElement);
      });
      
      messageElement.appendChild(visualsContainer);
    }

    this.messagesContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  /**
   * Handle chat updates (progress, partial responses)
   */
  private handleChatUpdate(update: ChatUpdate): void {
    const existingMessage = this.messagesContainer.querySelector(`[data-message-id="${update.messageId}"]`);
    
    if (update.type === 'progress') {
      this.showProgress(update.progress);
    } else if (update.type === 'partial' && update.content) {
      if (existingMessage) {
        const content = existingMessage.querySelector('.mcp-message-content');
        if (content) {
          content.textContent = update.content;
        }
      }
    } else if (update.type === 'completed') {
      this.hideProgress();
    }
  }

  /**
   * Show progress indicator
   */
  private showProgress(progress?: { current: number; total: number; description?: string }): void {
    let progressElement = this.messagesContainer.querySelector('.mcp-progress') as HTMLElement;
    
    if (!progressElement) {
      progressElement = document.createElement('div');
      progressElement.className = 'mcp-progress';
      this.messagesContainer.appendChild(progressElement);
    }

    if (progress) {
      const percentage = Math.round((progress.current / progress.total) * 100);
      progressElement.innerHTML = `
        <div class="mcp-progress-bar">
          <div class="mcp-progress-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="mcp-progress-text">
          ${progress.description || 'Processing...'} (${progress.current}/${progress.total})
        </div>
      `;
    } else {
      progressElement.innerHTML = '<div class="mcp-progress-spinner"></div><div class="mcp-progress-text">Processing...</div>';
    }

    this.scrollToBottom();
  }

  /**
   * Hide progress indicator
   */
  private hideProgress(): void {
    const progressElement = this.messagesContainer.querySelector('.mcp-progress');
    if (progressElement) {
      progressElement.remove();
    }
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    const errorElement = document.createElement('div');
    errorElement.className = 'mcp-error-message';
    errorElement.textContent = message;
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (errorElement.parentNode) {
        errorElement.parentNode.removeChild(errorElement);
      }
    }, 5000);

    this.messagesContainer.appendChild(errorElement);
    this.scrollToBottom();
  }

  /**
   * Update status indicator
   */
  private updateStatus(text: string, status: 'connected' | 'disconnected' | 'error'): void {
    const statusElement = this.chatContainer.querySelector('.mcp-chat-status') as HTMLElement;
    if (statusElement) {
      statusElement.textContent = text;
      statusElement.className = `mcp-chat-status mcp-status-${status}`;
    }
  }

  /**
   * Update send button state
   */
  private updateSendButton(): void {
    const hasText = this.messageInput.value.trim().length > 0;
    const isConnected = this.client.isConnected();
    this.sendButton.disabled = !hasText || !isConnected;
  }

  /**
   * Handle custom actions from visual components
   */
  private handleCustomAction(action: string, data?: any): void {
    // Emit custom event that parent application can handle
    const event = new CustomEvent('mcp-custom-action', {
      detail: { action, data },
      bubbles: true
    });
    this.container.dispatchEvent(event);
  }

  /**
   * Handle sort action
   */
  private handleSort(columnKey: string): void {
    // Emit sort event that parent application can handle
    const event = new CustomEvent('mcp-sort-action', {
      detail: { columnKey },
      bubbles: true
    });
    this.container.dispatchEvent(event);
  }

  /**
   * Scroll to bottom of messages
   */
  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Format timestamp
   */
  private formatTimestamp(timestamp: Date): string {
    return timestamp.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Add component styles
   */
  private addStyles(): void {
    const styleId = 'mcp-chatbot-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = this.getCSSStyles();
    document.head.appendChild(style);
  }

  /**
   * Get CSS styles for the chat bot
   */
  private getCSSStyles(): string {
    return `
      .mcp-chatbot {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--mcp-bg, #f9fafb);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }

      .mcp-chat-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 400px;
        max-height: 600px;
      }

      .mcp-chat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: var(--mcp-surface, #fff);
        border-bottom: 1px solid var(--mcp-border, #e1e5e9);
      }

      .mcp-chat-title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--mcp-text, #1f2937);
      }

      .mcp-chat-status {
        font-size: 0.875rem;
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        font-weight: 500;
      }

      .mcp-status-connected {
        background: #dcfce7;
        color: #166534;
      }

      .mcp-status-disconnected {
        background: #fef2f2;
        color: #991b1b;
      }

      .mcp-status-error {
        background: #fef2f2;
        color: #991b1b;
      }

      .mcp-messages-container {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        background: var(--mcp-bg, #f9fafb);
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .mcp-message {
        max-width: 85%;
        word-wrap: break-word;
      }

      .mcp-message-user {
        align-self: flex-end;
      }

      .mcp-message-assistant {
        align-self: flex-start;
      }

      .mcp-message-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
      }

      .mcp-message-sender {
        font-weight: 600;
        font-size: 0.875rem;
        color: var(--mcp-text-secondary, #6b7280);
      }

      .mcp-message-timestamp {
        font-size: 0.75rem;
        color: var(--mcp-text-secondary, #6b7280);
      }

      .mcp-message-content {
        background: var(--mcp-surface, #fff);
        padding: 0.75rem 1rem;
        border-radius: 12px;
        border: 1px solid var(--mcp-border, #e1e5e9);
        color: var(--mcp-text, #1f2937);
        line-height: 1.5;
      }

      .mcp-message-user .mcp-message-content {
        background: var(--mcp-primary, #3b82f6);
        color: white;
        border-color: var(--mcp-primary, #3b82f6);
      }

      .mcp-message-visuals {
        margin-top: 0.5rem;
      }

      .mcp-input-container {
        display: flex;
        gap: 0.5rem;
        padding: 1rem;
        background: var(--mcp-surface, #fff);
        border-top: 1px solid var(--mcp-border, #e1e5e9);
      }

      .mcp-message-input {
        flex: 1;
        padding: 0.75rem 1rem;
        border: 1px solid var(--mcp-border, #e1e5e9);
        border-radius: 8px;
        font-size: 0.875rem;
        background: var(--mcp-bg, #f9fafb);
        color: var(--mcp-text, #1f2937);
        outline: none;
        transition: border-color 0.2s;
      }

      .mcp-message-input:focus {
        border-color: var(--mcp-primary, #3b82f6);
        background: var(--mcp-surface, #fff);
      }

      .mcp-message-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .mcp-send-button {
        padding: 0.75rem 1.5rem;
        background: var(--mcp-primary, #3b82f6);
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .mcp-send-button:hover:not(:disabled) {
        background: var(--mcp-primary-hover, #2563eb);
      }

      .mcp-send-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .mcp-progress {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1rem;
        background: var(--mcp-surface, #fff);
        border: 1px solid var(--mcp-border, #e1e5e9);
        border-radius: 8px;
        align-self: flex-start;
        max-width: 85%;
      }

      .mcp-progress-bar {
        width: 100%;
        height: 8px;
        background: var(--mcp-bg, #f9fafb);
        border-radius: 4px;
        overflow: hidden;
      }

      .mcp-progress-fill {
        height: 100%;
        background: var(--mcp-primary, #3b82f6);
        transition: width 0.3s ease;
      }

      .mcp-progress-text {
        font-size: 0.875rem;
        color: var(--mcp-text-secondary, #6b7280);
      }

      .mcp-progress-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--mcp-border, #e1e5e9);
        border-top: 2px solid var(--mcp-primary, #3b82f6);
        border-radius: 50%;
        animation: mcp-spin 1s linear infinite;
      }

      @keyframes mcp-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      .mcp-error-message {
        background: #fef2f2;
        color: #991b1b;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        border: 1px solid #fecaca;
        font-size: 0.875rem;
        align-self: center;
        max-width: 85%;
      }

      /* Dark theme overrides */
      [data-theme="dark"] .mcp-chatbot {
        --mcp-bg: #111827;
        --mcp-surface: #1f2937;
        --mcp-text: #f9fafb;
        --mcp-text-secondary: #9ca3af;
        --mcp-border: #374151;
        --mcp-primary: #60a5fa;
        --mcp-primary-hover: #3b82f6;
      }

      [data-theme="dark"] .mcp-status-connected {
        background: #064e3b;
        color: #6ee7b7;
      }

      [data-theme="dark"] .mcp-status-disconnected,
      [data-theme="dark"] .mcp-status-error {
        background: #7f1d1d;
        color: #fca5a5;
      }

      [data-theme="dark"] .mcp-error-message {
        background: #7f1d1d;
        color: #fca5a5;
        border-color: #991b1b;
      }
    `;
  }
}