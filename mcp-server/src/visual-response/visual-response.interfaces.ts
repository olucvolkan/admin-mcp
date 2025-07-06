export type LayoutType = 'card' | 'table' | 'detail' | 'list';

export interface VisualResponse {
  layout: LayoutType;
  title?: string;              // Optional overall title for the content set
  items?: VisualItem[];        // List of items (for 'card', 'list', or 'detail' with single-item)
  columns?: ColumnDef[];       // Column definitions (for 'table' layout)
  rows?: RowData[];            // Row entries (for 'table' layout, an array of data objects per row)
  errorMessage?: string;       // Optional error or notice (e.g., if transformation had issues)
}

export interface VisualItem {
  title: string;               // Primary text or label for the item
  subtitle?: string;           // Secondary text (e.g. subheading, date, etc.)
  description?: string;        // Longer description or detail (used in 'detail' layout or verbose lists)
  imageUrl?: string;           // URL of an image (used in 'card' layout) 
  linkUrl?: string;            // Click-through link for the item (if applicable)
  metadata?: Record<string, any>; // Additional fields for specific layouts or metadata
}

export interface ColumnDef {
  field: string;              // Key for the data field (matching keys in rows)
  header: string;             // Human-readable column header
  type?: 'string' | 'number' | 'date' | 'boolean' | 'url' | 'image'; // Data type for rendering hints
}

export interface RowData {
  [key: string]: any;         // Each row is an object with keys matching column fields
}

// Template interfaces for mapping configuration
export interface MappingTemplate {
  layout: LayoutType;
  title?: string | MappingExpression;
  mappings?: {
    items?: string | MappingExpression;    // JSONPath to the list of items in input
    title?: string | MappingExpression;    // Path or expression for item title
    subtitle?: string | MappingExpression; // Path or expression for item subtitle
    description?: string | MappingExpression; // Path or expression for item description
    imageUrl?: string | MappingExpression; // Path or expression for image URL
    linkUrl?: string | MappingExpression;  // Path or expression for link URL
    columns?: ColumnMapping[];             // For table layout
  };
  fallback?: {
    layout: LayoutType;
    message?: string;
  };
}

export interface ColumnMapping {
  field: string;
  header: string;
  path: string | MappingExpression;
  type?: ColumnDef['type'];
}

export interface MappingExpression {
  type: 'jsonpath' | 'function' | 'static';
  value: string;
  format?: string; // For date formatting, etc.
}

// Template store interface
export interface TemplateStore {
  getTemplate(endpoint: string, method: string): Promise<MappingTemplate | null>;
  setTemplate(endpoint: string, method: string, template: MappingTemplate): Promise<void>;
  generateTemplate(endpoint: string, method: string, openApiSpec: any, sampleResponse: any): Promise<MappingTemplate>;
}

// Response for the visual transformation
export interface TransformationResult {
  success: boolean;
  visualResponse?: VisualResponse;
  error?: string;
  usedFallback?: boolean;
  templateUsed?: string;
} 