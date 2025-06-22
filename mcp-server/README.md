 Database Structure Guideline – MCP Server

1. Purpose & Overview

Our database must robustly support:
	•	OpenAPI parsing: capturing endpoints, params, response fields
	•	API chaining: tracking how outputs map to inputs
	•	Error reasoning: capturing potential error messages

We model:
	•	Endpoints
	•	Parameters & response fields
	•	Field-to-endpoint links
	•	Response messages

⸻

🌐 2. Core Tables & Relations

Project
	•	Stores API metadata context
	•	Fields: id, name, version, createdAt

Endpoint
	•	Represents each API (e.g. GET /orders)
	•	Foreign key to Project
	•	Fields: id, projectId, path, method, summary

RequestParameter
	•	Endpoint input params: path, query, header, body
	•	FK to Endpoint
	•	Fields: id, endpointId, name, in, type, required, description

ResponseField
	•	JSON response body fields, captured via JSONPath
	•	FK to Endpoint
	•	Fields: id, endpointId, jsonPath, type, description

FieldLink
	•	Links a ResponseField to another Endpoint’s RequestParameter
	•	Supports multi-step chaining
	•	Fields: id, fromFieldId, toEndpointId, toParamName, relationType, description

ResponseMessage
	•	Captures expected responses for each endpoint (400, 200, etc.)
	•	FK to Endpoint
	•	Fields: id, endpointId, statusCode, message, description, suggestion

⸻

📐 3. Schema Design Best Practices
	•	Normalization: Separate entities logically for maintainability and clarity  ￼ ￼ ￼ ￼
	•	Naming conventions:
	•	Table names plural (endpoints, response_fields)
	•	Fields snake_case (json_path) or camelCase
	•	Relationships:
	•	One-to-many: Project→Endpoint, Endpoint→RequestParameter/ResponseField/ResponseMessage
	•	FieldLink models many-to-many semantics via separate table
	•	Use ERD visual diagrams: to illustrate model relationships  ￼

⸻

🛠 4. Evolution & Migration Strategy
	•	Adopt evolutionary database design: allow schema iteration aligned to MVP phases  ￼
	•	Use migration tools (TypeORM/Prisma) to version schema changes
	•	Document schema changes and reason in README

Project "1" ── "n" Endpoint
Endpoint "1" ── "n" RequestParameter
Endpoint "1" ── "n" ResponseField
Endpoint "1" ── "n" ResponseMessage
ResponseField "1" ── "n" FieldLink ── "1" Endpoint (target)


📣 6. Data Flow in MCP Server
	1.	Load OpenAPI → create Project record
	2.	Extract each endpoint → insert into Endpoint
	3.	Parse params and response schemas → fill RequestParameter & ResponseField
	4.	Derive FieldLink relationships (e.g. via *_id conventions)
	5.	Log response messages (e.g. HTTP 400) into ResponseMessage

This schema ensures:
	•	Complete metadata record for endpoints
	•	Automated parameter chaining logic via FieldLink
	•	Clear structure for error handling
	•	Scalable and documented relational model
