# MCP Server MVP

This project provides a simple FastAPI server that can parse an OpenAPI document and exposes two endpoints:

- **POST `/upload-openapi`** – upload and parse an OpenAPI file and store its data in a PostgreSQL database.
- **POST `/chat`** – simple echo endpoint returning `"You said: {message}"`.

## Setup

1. Install requirements:

```bash
pip install -r requirements.txt
```

2. Configure a PostgreSQL database and set the `DATABASE_URL` environment variable if different from the default `postgresql://user:password@localhost:5432/mcp`.

3. Initialize the database tables:

```bash
alembic upgrade head
```

4. Start the development server:

```bash
uvicorn main:app --reload
```

## Example Usage

Upload an OpenAPI file:

```bash
curl -F "file=@openapi.yaml" http://localhost:8000/upload-openapi
```

Test chat endpoint:

```bash
curl -X POST -H "Content-Type: application/json" -d '{"message":"Merhaba"}' http://localhost:8000/chat
```
