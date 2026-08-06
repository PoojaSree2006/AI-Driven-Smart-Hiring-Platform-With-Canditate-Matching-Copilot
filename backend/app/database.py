"""
database.py
===========
SQLAlchemy engine, session, and declarative base setup for MySQL.

Why this exists:
-----------------
This is the single place where we configure how the app talks to MySQL.
Models (models/candidate.py) import `Base` from here to define tables.
Routes/services get a DB session via the `get_db()` dependency, which
guarantees the session is always closed after the request finishes —
even if an exception is raised mid-request.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from typing import Generator

from app.config import get_settings

settings = get_settings()

# ------------------------------------------------------------------
# Engine
# ------------------------------------------------------------------
# pool_pre_ping=True checks that a pooled connection is still alive
# before handing it to a request. MySQL connections get silently
# dropped by the server after a period of inactivity (`wait_timeout`,
# default 8 hours but often shorter on local/dev setups); without this,
# the first request after an idle period would fail with
# "MySQL server has gone away" instead of transparently reconnecting.
#
# pool_recycle=3600 proactively recycles connections older than an hour,
# as a second safety net against the same stale-connection problem.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=settings.DEBUG,  # log SQL statements when DEBUG=True, useful while developing
)

# ------------------------------------------------------------------
# Session factory
# ------------------------------------------------------------------
# autocommit=False / autoflush=False are the standard SQLAlchemy defaults
# for web apps: we want explicit control over when data is committed,
# rather than it happening implicitly mid-query.
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# ------------------------------------------------------------------
# Declarative base
# ------------------------------------------------------------------
# All ORM models (e.g. Candidate) will inherit from this Base.
Base = declarative_base()


def get_db() -> Generator:
    """
    FastAPI dependency that yields a database session per request.

    Usage in a route:
        @router.get("/candidates")
        def list_candidates(db: Session = Depends(get_db)):
            ...

    The try/finally ensures the session is closed after the request
    completes, regardless of whether it succeeded or raised an exception.
    This prevents connection leaks under load.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()