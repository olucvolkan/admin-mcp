# MCP Server MVP - Natural Language to API Orchestration

## 🚀 Overview

The MCP (Model Context Protocol) Server MVP is a sophisticated NestJS service that transforms natural language queries into executable API call sequences. It uses Large Language Models (LLMs) to understand user intent and automatically orchestrates multi-step API workflows.

## 🏗️ Architecture

### Core Components

1. **Planner Engine** - Uses GPT-4 to convert natural language to structured API execution plans
2. **Executor Engine** - Executes planned API calls with parameter interpolation and error handling
3. **Metadata Query Flow** - Efficient caching and retrieval of OpenAPI specifications
4. **Authentication Handling** - JWT/Bearer token management for secure API calls
5. **Error Handling** - Intelligent error mapping and user-friendly messaging

### Database Schema

```
Project ──┐
          │
          ├── Endpoint ──┬── RequestParameter
          │              ├── ResponseField ──┐
          │              └── ResponseMessage │
          │                                  │
          └── FieldLink ─────────────────────┘
```

## 🔧 Setup & Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- OpenAI API Key

### Installation

```bash
# Clone and install dependencies
git clone <repository>
cd mcp-server
npm install --legacy-peer-deps

# Setup environment variables
cp .env.example .env
# Edit .env with your database URL and OpenAI API key

# Run database migrations
npm run start:dev  # This will auto-sync the database schema

# Start the server
npm run start:dev
```

### Environment Variables

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/mcp_database

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Application Configuration
NODE_ENV=development
PORT=3000
```

## 📚 API Endpoints

### OpenAPI Management

#### Upload and Parse OpenAPI Specification
```bash
POST /upload-openapi
Content-Type: multipart/form-data

# Upload OpenAPI JSON/YAML file
curl -X POST http://localhost:3000/upload-openapi \
  -F "file=@swagger.json"
```

#### Parse Sample OpenAPI (for testing)
```bash
POST /parse-sample-openapi

curl -X POST http://localhost:3000/parse-sample-openapi
```

#### Get Project Information
```bash
GET /projects

curl -X GET http://localhost:3000/projects
```

### Natural Language Chat Interface

#### Process Natural Language Query
```bash
POST /chat
Content-Type: application/json
Authorization: Bearer <token> (optional)

{
  "projectId": 1,
  "message": "Get user information for username 'john_doe'"
}
```

#### Example Queries
```bash
# Simple single-step query
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Find all available pets"
  }'

# Multi-step query with chaining
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Get user john_doe and show me his orders"
  }'

# Query with authentication
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{
    "projectId": 1,
    "message": "Create a new user with email test@example.com"
  }'
```

#### Test Multiple Queries
```bash
POST /chat/:projectId/test

curl -X POST http://localhost:3000/chat/1/test \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      "Get all users",
      "Find pets with status available",
      "Get inventory status"
    ]
  }'
```

#### Get Example Queries
```bash
GET /chat/examples/:projectId

curl -X GET http://localhost:3000/chat/examples/1
```

## 🤖 How It Works

### 1. Natural Language Processing
When you send a query like "Get user john_doe and show me his orders", the system:

1. **Loads API Metadata**: Retrieves all available endpoints for the project
2. **Constructs LLM Prompt**: Creates a structured prompt with available endpoints and field relationships
3. **Generates Execution Plan**: LLM creates a JSON plan with step-by-step API calls
4. **Validates Plan**: Ensures all endpoints exist and required parameters are provided

### 2. Execution Plan Structure
```json
{
  "steps": [
    {
      "endpoint": "GET /users/{username}",
      "params": {
        "username": "john_doe"
      }
    },
    {
      "endpoint": "GET /orders",
      "params": {
        "userId": "$.steps[0].response.id"
      }
    }
  ]
}
```

### 3. Step-by-Step Execution
- **Step 1**: Calls `GET /users/john_doe`
- **Parameter Interpolation**: Extracts `id` from Step 1 response
- **Step 2**: Calls `GET /orders?userId=<extracted_id>`
- **Result**: Returns final result with execution details

## 📝 Example Usage Scenarios

### Scenario 1: E-commerce API
```bash
# Query: "Show me all products in the Electronics category"
POST /chat
{
  "projectId": 1,
  "message": "Show me all products in the Electronics category"
}

# Generated Plan:
{
  "steps": [
    {
      "endpoint": "GET /products",
      "params": {
        "category": "Electronics"
      }
    }
  ]
}
```

### Scenario 2: User Management with Chaining
```bash
# Query: "Get user profile for email user@example.com and show their recent orders"
POST /chat
{
  "projectId": 1,
  "message": "Get user profile for email user@example.com and show their recent orders"
}

# Generated Plan:
{
  "steps": [
    {
      "endpoint": "GET /users",
      "params": {
        "email": "user@example.com"
      }
    },
    {
      "endpoint": "GET /orders",
      "params": {
        "userId": "$.steps[0].response.id",
        "limit": "10"
      }
    }
  ]
}
```

### Scenario 3: Complex Multi-Step Workflow
```bash
# Query: "Create a new user named John Smith with email john@example.com, then create an order for product ID 123"
POST /chat
{
  "projectId": 1,
  "message": "Create a new user named John Smith with email john@example.com, then create an order for product ID 123"
}

# Generated Plan:
{
  "steps": [
    {
      "endpoint": "POST /users",
      "params": {
        "name": "John Smith",
        "email": "john@example.com"
      }
    },
    {
      "endpoint": "POST /orders",
      "params": {
        "userId": "$.steps[0].response.id",
        "productId": "123",
        "quantity": "1"
      }
    }
  ]
}
```

## 🔒 Authentication

The system supports various authentication methods:

### JWT Bearer Tokens
```bash
curl -X POST http://localhost:3000/chat \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"projectId": 1, "message": "Get my profile"}'
```

### API Keys
Configured per project in the database:
```sql
UPDATE projects SET auth_type = 'api_key', auth_header = 'X-API-Key' WHERE id = 1;
```

## 🛠️ Development

### Running Tests
```bash
npm run test
npm run test:e2e
```

### Building for Production
```bash
npm run build
npm run start:prod
```

### Database Migrations
```bash
# Generate migration
npm run typeorm migration:generate -- -n MigrationName

# Run migrations
npm run typeorm migration:run
```

## 📊 Monitoring & Debugging

### Execution Details
Each chat response includes execution details:
```json
{
  "success": true,
  "message": "I found 5 results for your request.",
  "data": [...],
  "executionDetails": {
    "planSteps": 2,
    "executionTime": 1250,
    "stepsExecuted": 2
  }
}
```

### Error Handling
The system provides intelligent error mapping:
- **401 Unauthorized**: "Authentication required - please log in"
- **404 Not Found**: "Resource not found"
- **500 Server Error**: "Server error - please try again later"

### Logging
Comprehensive logging at different levels:
```bash
# View logs
npm run start:dev

# Production logging
LOG_LEVEL=error npm run start:prod
```

## 🔧 Advanced Configuration

### Custom Error Messages
Add custom error messages to the `response_messages` table:
```sql
INSERT INTO response_messages (endpoint_id, status_code, message, suggestion)
VALUES (1, 404, 'User not found', 'Check the username and try again');
```

### Field Linking
Define relationships between endpoints:
```sql
INSERT INTO field_links (from_field_id, to_endpoint_id, to_param_name, relation_type)
VALUES (1, 2, 'userId', 'direct');
```

## 🚀 Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Configure PostgreSQL connection
- [ ] Set `synchronize: false` in TypeORM config
- [ ] Configure proper logging
- [ ] Set up SSL certificates
- [ ] Configure CORS properly
- [ ] Set up monitoring (Sentry, DataDog, etc.)

## 📈 Performance Optimization

### Caching Strategy
- **Metadata Caching**: API specifications cached in memory
- **LLM Response Caching**: Common query patterns cached
- **Database Connection Pooling**: Optimized connection management

### Rate Limiting
```bash
# Configure rate limiting
npm install @nestjs/throttler
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [OpenAI](https://openai.com/) for GPT-4 API
- [NestJS](https://nestjs.com/) for the robust framework
- [TypeORM](https://typeorm.io/) for database management
- [Swagger](https://swagger.io/) for API documentation standards
