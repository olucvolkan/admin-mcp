from sqlmodel import create_engine, Session
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://user:password@localhost:5432/mcp")

engine = create_engine(DATABASE_URL, echo=True)

def get_session():
    with Session(engine) as session:
        yield session
