/**
 * MCP Chat SDK - Core Types and Interfaces
 */

// WebSocket Message Types
export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  visuals?: VisualResponse[];
}

export interface ChatUpdate {
  messageId: string;
  type: 'progress' | 'partial' | 'completed' | 'error';
  content?: string;
  visuals?: VisualResponse[];
  progress?: {
    current: number;
    total: number;
    description?: string;
  };
}

// WebSocket Event Types
export interface WebSocketEvents {
  chat_message: (data: { message: string; token?: string }) => void;
  chat_update: (data: ChatUpdate) => void;
  chat_completed: (data: { messageId: string; finalMessage: ChatMessage }) => void;
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
}

// Visual Response Types
export interface VisualResponse {
  type: 'card' | 'table' | 'detail' | 'list' | 'chart';
  layout?: 'card' | 'table' | 'detail' | 'list';
  items?: VisualItem[];
  columns?: ColumnDef[];
  rows?: RowData[];
  data?: any;
}

export interface VisualItem {
  type: 'card' | 'detail';
  title?: string;
  subtitle?: string;
  description?: string;
  image?: string;
  fields?: Record<string, any>;
  actions?: ActionButton[];
  metadata?: Record<string, any>;
}

export interface ColumnDef {
  key: string;
  title: string;
  type?: 'text' | 'number' | 'date' | 'boolean' | 'url' | 'image';
  sortable?: boolean;
  width?: string;
}

export interface RowData {
  [key: string]: any;
}

export interface ActionButton {
  label: string;
  type?: 'primary' | 'secondary' | 'danger';
  url?: string;
  action?: string;
  data?: any;
}

// Chat Client Configuration
export interface MCPChatConfig {
  serverUrl: string;
  token?: string;
  theme?: 'light' | 'dark' | 'auto';
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  debug?: boolean;
  customStyles?: Record<string, string>;
  onMessage?: (message: ChatMessage) => void;
  onUpdate?: (update: ChatUpdate) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

// User Context
export interface UserContext {
  id: string;
  name?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  metadata?: Record<string, any>;
}

// API Response Types
export interface APIResponse {
  text: string;
  visuals?: VisualResponse[];
  metadata?: {
    executionTime?: number;
    apiCalls?: number;
    sources?: string[];
  };
}

// Error Types
export interface MCPError extends Error {
  code?: string;
  details?: any;
  timestamp: Date;
}

// Theme Types
export interface ThemeConfig {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  typography: {
    fontFamily: string;
    fontSize: {
      small: string;
      medium: string;
      large: string;
    };
  };
  spacing: {
    small: string;
    medium: string;
    large: string;
  };
  borderRadius: string;
  shadows: {
    small: string;
    medium: string;
    large: string;
  };
}

// Event Handlers
export interface EventHandlers {
  onMessageSent?: (message: string) => void;
  onMessageReceived?: (message: ChatMessage) => void;
  onProgressUpdate?: (update: ChatUpdate) => void;
  onError?: (error: MCPError) => void;
  onConnectionChange?: (connected: boolean) => void;
  onThemeChange?: (theme: 'light' | 'dark') => void;
}