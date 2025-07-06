# Visual Response Transformation System

## Overview

The Visual Response Transformation System converts raw API responses into a consistent, client-friendly format called `VisualResponse`. This system implements the Backend-for-Frontend pattern, ensuring all endpoints return standardized data structures that can be rendered uniformly by client applications.

## Features

- **Server-Side Transformation**: Raw JSON responses are converted to consistent VisualResponse format
- **Multiple UI Layouts**: Supports 'card', 'table', 'detail', and 'list' layouts
- **Template-Based Mapping**: Each endpoint can have custom transformation templates
- **Auto-Generation**: Automatically generates templates from sample responses
- **JSONPath Support**: Flexible path expressions for data extraction
- **Fallback Handling**: Graceful degradation when templates are missing

## VisualResponse Schema

```typescript
interface VisualResponse {
  layout: 'card' | 'table' | 'detail' | 'list';
  title?: string;
  items?: VisualItem[];        // For card/list/detail layouts
  columns?: ColumnDef[];       // For table layout
  rows?: RowData[];           // For table layout
  errorMessage?: string;
}

interface VisualItem {
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  metadata?: Record<string, any>;
}
```

## Usage

### 1. Chat Endpoints

The system is automatically integrated into chat endpoints. When you make chat requests, the response now includes:

```json
{
  "success": true,
  "message": "Found 2 radio stations",
  "data": { /* raw data */ },
  "formattedResponse": "# Radio Stations...", // Markdown format
  "visualResponse": {
    "layout": "card",
    "title": "Radio Stations",
    "items": [
      {
        "title": "Show Radyo 2",
        "subtitle": "Created on Jul 1, 2025",
        "imageUrl": "https://...",
        "linkUrl": "https://www.showradyo.com.tr"
      }
    ]
  },
  "transformationResult": {
    "success": true,
    "usedFallback": false,
    "templateUsed": "custom"
  }
}
```

### 2. Testing Transformations

Use the `/visual-response/test` endpoint to test transformations:

```bash
curl -X POST http://localhost:3000/visual-response/test \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "data": [
        {
          "name": "Show Radyo 2",
          "stream_link": "https://www.showradyo.com.tr",
          "logo": { "url": "https://example.com/logo.jpg" },
          "created_at": "2025-07-01T12:26:41.000000Z"
        }
      ]
    },
    "endpoint": "/api/radyo/stations",
    "method": "GET"
  }'
```

### 3. Managing Templates

#### Get All Templates
```bash
GET /visual-response/templates
```

#### Get Specific Template
```bash
GET /visual-response/templates/{endpoint}/{method}
# Example: GET /visual-response/templates/%2Fapi%2Fusers/GET
```

#### Set/Update Template
```bash
PUT /visual-response/templates/{endpoint}/{method}
Content-Type: application/json

{
  "layout": "card",
  "title": "Users",
  "mappings": {
    "items": "$.data",
    "title": "$.name",
    "subtitle": "$.email",
    "imageUrl": "$.avatar"
  }
}
```

#### Auto-Generate Template
```bash
POST /visual-response/generate-template
Content-Type: application/json

{
  "endpoint": "/api/users",
  "method": "GET",
  "sampleResponse": {
    "data": [
      {"id": 1, "name": "John", "email": "john@example.com"}
    ]
  }
}
```

## Template Examples

### Card Layout (for visual items with images)
```json
{
  "layout": "card",
  "title": "Radio Stations",
  "mappings": {
    "items": "$.data.data",
    "title": "$.name",
    "subtitle": {
      "type": "jsonpath",
      "value": "$.created_at",
      "format": "date"
    },
    "imageUrl": "$.logo.url",
    "linkUrl": "$.stream_link"
  }
}
```

### Table Layout (for structured data)
```json
{
  "layout": "table",
  "title": "Users",
  "mappings": {
    "items": "$.data",
    "columns": [
      {"field": "id", "header": "ID", "path": "$.id", "type": "number"},
      {"field": "name", "header": "Name", "path": "$.name", "type": "string"},
      {"field": "email", "header": "Email", "path": "$.email", "type": "string"}
    ]
  }
}
```

### List Layout (for simple items)
```json
{
  "layout": "list",
  "title": "Tasks",
  "mappings": {
    "items": "$.tasks",
    "title": "$.title",
    "subtitle": "$.status"
  }
}
```

### Detail Layout (for single item details)
```json
{
  "layout": "detail",
  "title": "User Profile",
  "mappings": {
    "items": "$",
    "title": "$.name",
    "description": "$.bio"
  }
}
```

## JSONPath Expressions

The system supports JSONPath expressions for flexible data extraction:

- `$.field` - Direct field access
- `$.nested.field` - Nested field access  
- `$.array[0]` - Array index access
- `$.array[*]` - Array wildcard
- `$.data.items` - Complex path navigation

### Formatting Support

You can apply formatting to extracted values:

```json
{
  "type": "jsonpath",
  "value": "$.created_at",
  "format": "date"  // Formats as "Jan 1, 2025"
}
```

Supported formats:
- `date` - Format dates
- `currency` - Format numbers as currency
- `uppercase/lowercase/capitalize` - Text formatting

### Function Expressions

Combine multiple fields using functions:

```json
{
  "type": "function",
  "value": "concat($.first_name, \" \", $.last_name)"
}
```

## Auto-Generation Logic

The system automatically analyzes response structures to generate appropriate templates:

1. **Array Detection**: If response contains arrays, chooses list/card/table layout
2. **Image Detection**: If items have image-like fields, uses card layout
3. **Field Count**: Multiple fields → table layout, few fields → list layout
4. **Single Object**: Uses detail layout for comprehensive display

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/visual-response/test` | POST | Test transformation of sample data |
| `/visual-response/test-template` | POST | Test specific template against data |
| `/visual-response/templates` | GET | Get all templates |
| `/visual-response/templates/{endpoint}/{method}` | GET | Get specific template |
| `/visual-response/templates/{endpoint}/{method}` | PUT | Set/update template |
| `/visual-response/templates/{endpoint}/{method}` | DELETE | Delete template |
| `/visual-response/generate-template` | POST | Auto-generate template |
| `/visual-response/validate` | POST | Validate VisualResponse structure |
| `/visual-response/examples` | GET | Get example templates |
| `/visual-response/stats` | GET | Get transformation statistics |

## Integration with Chat System

The VisualResponse system is automatically integrated with the chat functionality:

1. When processing chat queries, the system extracts endpoint information from execution results
2. Applies appropriate templates to transform the final response data
3. Returns both markdown-formatted text (for backward compatibility) and VisualResponse structure
4. Clients can choose to render either format based on their capabilities

## Error Handling

The system provides multiple fallback levels:

1. **Template Fallback**: If template application fails, uses template's fallback configuration
2. **Auto-Generation**: If no template exists, auto-generates one from response structure
3. **Basic Fallback**: If all else fails, creates simple list/detail view
4. **Error Response**: Returns error information with raw data for debugging

## Best Practices

1. **Template Design**: Create templates that focus on the most important information first
2. **Field Selection**: Don't expose sensitive or irrelevant fields in VisualResponse
3. **Performance**: Keep templates simple; complex transformations can impact response time
4. **Testing**: Use the test endpoints to validate templates before deployment
5. **Fallbacks**: Always configure appropriate fallback layouts in templates

## Client-Side Usage

Clients should handle VisualResponse based on the layout type:

```javascript
function renderVisualResponse(visualResponse) {
  switch (visualResponse.layout) {
    case 'card':
      return renderCards(visualResponse.items);
    case 'table':
      return renderTable(visualResponse.columns, visualResponse.rows);
    case 'list':
      return renderList(visualResponse.items);
    case 'detail':
      return renderDetail(visualResponse.items[0]);
  }
}
```

This ensures consistent, beautiful UI rendering across all API responses while maintaining the flexibility to customize presentation per endpoint. 