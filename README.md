# MCP Server

This project is a minimal NestJS server using Fastify. It exposes two endpoints:

- `POST /upload-openapi` to upload an OpenAPI file.
- `POST /chat` to echo back the provided message.

Swagger documentation is available at `/api-docs` when running the server.

## Development

```bash
cd mcp-server
npm install
npm run start:dev
```
