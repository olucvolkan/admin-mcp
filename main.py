from fastapi import FastAPI, UploadFile, File, HTTPException
from sqlmodel import SQLModel, Session, create_engine, select
from prance import ResolvingParser
from typing import List
import json

from models import Project, Endpoint, RequestParameter, ResponseField, ResponseMessage
from database import get_session, engine

app = FastAPI()

# create tables
SQLModel.metadata.create_all(engine)

@app.post("/upload-openapi")
async def upload_openapi(file: UploadFile = File(...)):
    content = await file.read()
    try:
        parser = ResolvingParser(spec_string=content.decode())
        spec = parser.specification
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    project = Project(name=file.filename)
    with Session(engine) as session:
        session.add(project)
        session.commit()
        session.refresh(project)

        paths = spec.get("paths", {})
        for path, methods in paths.items():
            for method, details in methods.items():
                endpoint = Endpoint(project_id=project.id, path=path, method=method.upper(), summary=details.get("summary"))
                session.add(endpoint)
                session.commit()
                session.refresh(endpoint)

                params = details.get("parameters", [])
                if "requestBody" in details:
                    content_schema = details["requestBody"].get("content", {}).get("application/json", {}).get("schema", {})
                    if "$ref" in content_schema:
                        # simple ref resolution
                        ref = content_schema["$ref"].split("/")[-1]
                        content_schema = spec.get("components", {}).get("schemas", {}).get(ref, {})
                    for prop, schema in content_schema.get("properties", {}).items():
                        params.append({"name": prop, "in": "body", "schema": schema})

                for param in params:
                    rp = RequestParameter(endpoint_id=endpoint.id, name=param.get("name"), location=param.get("in"))
                    session.add(rp)

                responses = details.get("responses", {})
                for status, resp in responses.items():
                    content = resp.get("content", {}).get("application/json", {})
                    schema = content.get("schema", {})
                    if "$ref" in schema:
                        ref = schema["$ref"].split("/")[-1]
                        schema = spec.get("components", {}).get("schemas", {}).get(ref, {})
                    if schema.get("type") == "object":
                        for prop in schema.get("properties", {}).keys():
                            rf = ResponseField(endpoint_id=endpoint.id, status_code=status, name=prop)
                            session.add(rf)
        session.commit()

    return {"project_id": project.id}

@app.post("/chat")
async def chat(message: str):
    return {"response": f"You said: {message}"}

