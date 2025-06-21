from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List

class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    endpoints: List["Endpoint"] = Relationship(back_populates="project")

class Endpoint(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id")
    path: str
    method: str
    summary: Optional[str] = None
    project: Optional[Project] = Relationship(back_populates="endpoints")
    request_parameters: List["RequestParameter"] = Relationship(back_populates="endpoint")
    response_fields: List["ResponseField"] = Relationship(back_populates="endpoint")

class RequestParameter(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    endpoint_id: int = Field(foreign_key="endpoint.id")
    name: str
    location: str
    endpoint: Optional[Endpoint] = Relationship(back_populates="request_parameters")

class ResponseField(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    endpoint_id: int = Field(foreign_key="endpoint.id")
    status_code: str
    name: str
    endpoint: Optional[Endpoint] = Relationship(back_populates="response_fields")

class ResponseMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    endpoint_id: int = Field(foreign_key="endpoint.id")
    message: str
    endpoint: Optional[Endpoint] = Relationship()
