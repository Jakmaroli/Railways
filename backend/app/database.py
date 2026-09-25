import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

ENV = os.getenv("ENV", "development").lower()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./railsync.db")

# In production, require PostgreSQL
if ENV == "production":
    if not DATABASE_URL or DATABASE_URL.startswith("sqlite"):
        raise RuntimeError(
            "CRITICAL SECURITY CONFIGURATION ERROR: PostgreSQL is required in production. "
            "SQLite is not permitted for production deployments. Configure DATABASE_URL."
        )

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)



class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
