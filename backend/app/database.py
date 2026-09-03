"""
database.py
===========
SQLAlchemy engine, session, and declarative base setup.
Fully compatible with MySQL (PyMySQL) and SQLite fallback.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from typing import Generator

from app.config import get_settings

settings = get_settings()

db_url = settings.DATABASE_URL
is_sqlite = db_url.startswith("sqlite")

# Configure engine arguments conditionally based on DB dialect
engine_kwargs = {
    "echo": settings.DEBUG,
}

if is_sqlite:
    # SQLite requires check_same_thread=False for multi-threaded FastAPI calls
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # Connection pooling parameters suitable for MySQL
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 3600

engine = create_engine(db_url, **engine_kwargs)

# ------------------------------------------------------------------
# Session factory
# ------------------------------------------------------------------
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# ------------------------------------------------------------------
# Declarative base
# ------------------------------------------------------------------
Base = declarative_base()


def get_db() -> Generator:
    """
    FastAPI dependency that yields a database session per request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()