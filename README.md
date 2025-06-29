# MCP Server

This project is a minimal NestJS server using Fastify. It exposes endpoints to parse OpenAPI files and resolve user intents:

- `POST /upload-openapi` uploads and parses an OpenAPI document. Each endpoint in the spec is stored together with a generated prompt.
- `POST /chat` resolves a natural language message to the most relevant stored endpoint and returns its information.

Swagger documentation is available at `/api-docs` when running the server.

## Development

```bash
cd mcp-server
npm install
npm run start:dev
```
