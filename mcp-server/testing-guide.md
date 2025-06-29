# MCP Server MVP - Testing Guide

## 🚀 Quick Start

This guide provides step-by-step instructions for testing all features of the MCP Server MVP.

## 🧪 Complete Testing Workflow

### Prerequisites
1. Server running on `http://localhost:3000`
2. PostgreSQL database configured
3. OpenAI API key set in environment

## 🔧 Step 1: Start the Server

```bash
# Start in development mode
npm run start:dev

# Or start in production mode
npm run start:prod
```

## 📚 Step 2: Parse OpenAPI Specification

### Method A: Parse Sample OpenAPI (for quick testing)
```bash
# Parse the built-in sample OpenAPI spec
curl -X POST http://localhost:3000/parse-sample-openapi \
  -H "Content-Type: application/json" | jq '.'

# Expected response:
{
  "status": "success",
  "projectId": 1,
  "endpointsCount": 20,
  "parametersCount": 45,
  "message": "OpenAPI spec parsed and stored successfully"
}
```

### Method B: Upload Custom OpenAPI File (alternative)
```bash
# Upload your own OpenAPI JSON file
curl -X POST http://localhost:3000/upload-openapi \
  -F "file=@your-openapi.json" | jq '.'
```

## 📊 Step 3: Verify Data Import

### Check Projects
```bash
curl -X GET http://localhost:3000/projects | jq '.'

# Expected response:
{
  "projects": [
    {
      "id": 1,
      "name": "Swagger Petstore - OpenAPI 3.0",
      "version": "1.0.11",
      "baseUrl": "https://petstore3.swagger.io/api/v3",
      "description": "This is a sample Pet Store Server...",
      "createdAt": "2024-01-20T10:30:00.000Z",
      "endpointsCount": 20
    }
  ]
}
```

### Check Specific Project Details
```bash
curl -X GET http://localhost:3000/projects/1 | jq '.'

# Expected response includes endpoints, parameters, etc.
```

## 🤖 Step 4: Test Natural Language Queries

### Simple Single-Step Query
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Find all available pets"
  }' | jq '.'

# Expected response:
{
  "success": true,
  "message": "I found 3 results for your request.",
  "data": [
    {
      "id": 1,
      "name": "doggie",
      "status": "available",
      "category": { "id": 1, "name": "Dogs" }
    }
  ],
  "executionDetails": {
    "planSteps": 1,
    "executionTime": 1250,
    "stepsExecuted": 1
  }
}
```

### Multi-Step Query with Parameter Chaining
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Get user with username user1 and then show their orders"
  }' | jq '.'

# This will:
# 1. Call GET /user/{username} with username=user1
# 2. Extract user ID from response
# 3. Call GET /orders with userId from step 1
```

### Query with Authentication
```bash
# Using Bearer token
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token_here" \
  -d '{
    "projectId": 1,
    "message": "Get my profile information"
  }' | jq '.'
```

## 📋 Step 5: Test Different Query Types

### User Management Queries
```bash
# Get user info
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Get user information for username test_user"
  }' | jq '.'

# Create new user
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Create a new user with username newuser, firstName John, lastName Doe, email john@example.com"
  }' | jq '.'
```

### Pet Store Queries
```bash
# Find pets by status
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Find pets with status sold"
  }' | jq '.'

# Get specific pet
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Get pet with ID 1"
  }' | jq '.'

# Add new pet
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Add a new pet named Buddy with category Dogs and status available"
  }' | jq '.'
```

### Store/Order Queries
```bash
# Get inventory
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Get store inventory status"
  }' | jq '.'

# Place order
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Place an order for pet ID 1 with quantity 2"
  }' | jq '.'

# Get order details
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Get order details for order ID 1"
  }' | jq '.'
```

## 🔄 Step 6: Test Complex Multi-Step Workflows

### Workflow 1: User Creation + Order Placement
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Create a user named Alice Smith with email alice@example.com, then place an order for pet ID 5"
  }' | jq '.'

# Expected execution plan:
# Step 1: POST /user (create user)
# Step 2: POST /store/order (use user ID from step 1)
```

### Workflow 2: Search + Filter + Details
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Find available pets, then get detailed information for the first one"
  }' | jq '.'

# Expected execution plan:
# Step 1: GET /pet/findByStatus?status=available
# Step 2: GET /pet/{petId} (use ID from first pet in step 1)
```

## 🧪 Step 7: Batch Testing

### Test Multiple Queries at Once
```bash
curl -X POST http://localhost:3000/chat/1/test \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      "Find all available pets",
      "Get user with username test_user",
      "Get store inventory",
      "Find pets with status sold",
      "Get pet with ID 1"
    ]
  }' | jq '.'

# Expected response includes summary:
{
  "projectId": 1,
  "results": [...],
  "summary": {
    "total": 5,
    "successful": 4,
    "failed": 1,
    "averageExecutionTime": 1150
  }
}
```

## 📖 Step 8: Get Example Queries

### Get Predefined Examples
```bash
curl -X GET http://localhost:3000/chat/examples/1 | jq '.'

# Returns categorized example queries for testing
{
  "projectId": 1,
  "examples": [
    {
      "category": "User Operations",
      "description": "Queries related to user management",
      "queries": [
        "Get user information for username user1",
        "Create a new user with username newuser and email test@example.com"
      ]
    }
  ]
}
```

## 🚨 Step 9: Error Testing

### Test Invalid Queries
```bash
# Query with non-existent endpoint
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Get spaceship information"
  }' | jq '.'

# Expected error response:
{
  "success": false,
  "message": "I couldn't create a plan for your request. Please try being more specific.",
  "executionDetails": {
    "planSteps": 0,
    "executionTime": 500,
    "stepsExecuted": 0
  },
  "error": "No matching endpoints found for the query"
}
```

### Test Authentication Errors
```bash
# Query requiring auth without token
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Delete user with username test_user"
  }' | jq '.'

# Expected error (if endpoint requires auth):
{
  "success": false,
  "message": "Authentication required - please log in",
  "executionDetails": {
    "planSteps": 1,
    "executionTime": 800,
    "stepsExecuted": 0
  }
}
```

## 🔍 Step 10: Debugging & Monitoring

### Check Server Logs
```bash
# Monitor server logs for detailed execution info
tail -f logs/application.log

# Or if using PM2:
pm2 logs mcp-server
```

### Performance Testing
```bash
# Time multiple requests
time curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Find all available pets"
  }' | jq '.'

# Load testing with Apache Bench
ab -n 100 -c 10 -T 'application/json' -p query.json http://localhost:3000/chat
```

## ✅ Expected Results Checklist

- [ ] ✅ OpenAPI parsing works and populates database
- [ ] ✅ Simple queries generate correct execution plans
- [ ] ✅ Multi-step queries with parameter chaining work
- [ ] ✅ Authentication headers are properly forwarded
- [ ] ✅ Error responses are user-friendly
- [ ] ✅ Response times are reasonable (< 5 seconds for simple queries)
- [ ] ✅ Batch testing shows success/failure statistics
- [ ] ✅ Database contains proper relationships and metadata

## 🐛 Common Issues & Solutions

### Issue: "OpenAI API key not found"
**Solution**: Set `OPENAI_API_KEY` in your `.env` file

### Issue: "Database connection failed"
**Solution**: Check `DATABASE_URL` in `.env` and ensure PostgreSQL is running

### Issue: "No matching endpoints found"
**Solution**: Verify OpenAPI spec was parsed correctly and contains the expected endpoints

### Issue: "Parameter interpolation failed"
**Solution**: Check that field links are properly defined in the database

### Issue: "Request timeout"
**Solution**: Increase timeout in HttpModule configuration or check external API availability

---

## 🎯 Pro Testing Tips

1. **Start Simple**: Begin with single-step queries before testing complex workflows
2. **Check Logs**: Always monitor server logs for detailed error information
3. **Use jq**: Format JSON responses with `| jq '.'` for better readability
4. **Test Edge Cases**: Try queries with missing parameters, invalid data, etc.
5. **Performance Monitoring**: Track execution times and optimize slow queries
6. **Authentication Testing**: Test both authenticated and unauthenticated scenarios

Happy Testing! 🚀 