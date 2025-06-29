# Project Overview

MCP Server is a NestJS-based system that:
- Parses OpenAPI specs
- Stores API metadata in a database
- Generates multi-step API chaining plans
- Exposes a chat endpoint for embedding in admin panels

## General Architecture

- **Modular Architecture**: Encapsulate the API in modules.
- **Core Module**: Contains core NestJS artifacts like global filters, middleware, guards, and interceptors.
- **Shared Module**: For services and utilities shared between modules.
- **Testing**: Uses the standard Jest framework.

---

## Module Guidelines (`src/modules/**/*.*`)

- **Domain-Oriented Modules**: One module per main domain/route.
- **Controllers**:
    - One primary controller for the main route.
    - Additional controllers for secondary routes.
- **Data Handling**:
    - `models` folder for data types.
    - DTOs with `class-validator` for input validation.
    - Simple declared types for outputs.
- **Services & Persistence**:
    - `services` module for business logic and persistence.
    - TypeORM entities for data persistence.
    - One service per entity.
    - Use PostgreSQL as the database.

---

## Core Module Guidelines (`src/core/**/*.*`)

- **Global Filters**: For exception handling.
- **Global Middlewares**: For request management.
- **Guards**: For permission management.
- **Interceptors**: For request/response management.

---

## Shared Module Guidelines (`src/shared/**/*.*`)

- **Utilities**: Reusable utility functions.
- **Shared Business Logic**: Logic that is shared across different modules.

---

## Testing Guidelines (`**/*.spec.ts`)

- **Framework**: Use the standard Jest framework.
- **Coverage**:
    - Write unit tests for each controller and service.
    - Write end-to-end tests for each API module.
- **Smoke Tests**: Add an `admin/test` method to each controller as a smoke test.
