from typing import Optional
from sqlmodel import SQLModel

class ChatRequest(SQLModel):
    message: str

class ChatResponse(SQLModel):
    response: str
