"""
models/candidate.py
====================
SQLAlchemy ORM model for the `candidates` table.

Why this exists:
-----------------
This defines the actual database schema for storing parsed resume data.
List-type fields (skills, education, projects, experience, certifications)
are stored as JSON columns rather than separate normalized tables —
this is a deliberate tradeoff explained below.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, JSON, Text
from sqlalchemy.dialects.mysql import CHAR

from app.database import Base


def generate_uuid() -> str:
    """
    Generates a UUID4 string for use as a primary key.

    We store UUIDs as CHAR(36) strings rather than MySQL's native
    BINARY(16) UUID storage, trading a small amount of storage/index
    efficiency for something that's human-readable in logs, easy to
    pass directly into URLs (GET /candidate/{id}), and requires no
    custom SQLAlchemy type conversion.
    """
    return str(uuid.uuid4())


class Candidate(Base):
    """
    Represents a single candidate profile extracted from an uploaded resume.

    Design notes:
    -------------
    - `id` is a UUID (not an auto-increment int) per the project's
      requirement to "Use UUIDs" — this also means IDs are safe to
      expose in URLs/APIs without leaking how many candidates exist
      or allowing enumeration attacks.

    - Structured list fields (skills, education, projects, experience,
      certifications) are stored as JSON columns instead of separate
      related tables (e.g. a `skills` table with a foreign key).
      This is a deliberate simplicity tradeoff for this project's scope:
        Pros: matches the extractor's output shape 1:1, no joins needed
              to render a candidate profile, faster to build and query.
        Cons: can't efficiently query "all candidates with skill=Python"
              at the SQL level (would need JSON_CONTAINS in raw MySQL,
              or querying pattern-matching on the JSON text).
      If analytics/search-by-skill becomes a heavy feature later, these
      should be normalized into proper related tables. For now, the
      Analytics page charts are computed by loading candidates and
      aggregating in Python (see services/ later), which is fine at
      this project's expected scale (hundreds, not millions, of rows).

    - `resume_file_path` and `extracted_json_path` are stored so that
      DELETE /candidate/{id} can clean up the actual files on disk,
      not just the DB row (per the spec's delete requirements).
    """

    __tablename__ = "candidates"

    # --- Primary Key ---
    id = Column(CHAR(36), primary_key=True, default=generate_uuid, index=True)

    # --- Core Extracted Fields ---
    name = Column(String(255), nullable=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    location = Column(String(255), nullable=True)
    linkedin = Column(String(500), nullable=True)
    github = Column(String(500), nullable=True)

    # --- Derived / Summary Fields (used by Dashboard + Analytics) ---
    # Stored as a float (years) so it can be averaged directly in SQL/Python
    # without re-parsing strings like "5 years" every time the dashboard loads.
    experience_years = Column(String(50), nullable=True)  # e.g. "5" or "5+"

    # --- Structured List Fields (stored as JSON) ---
    skills = Column(JSON, nullable=True, default=list)
    education = Column(JSON, nullable=True, default=list)
    projects = Column(JSON, nullable=True, default=list)
    experience = Column(JSON, nullable=True, default=list)
    certifications = Column(JSON, nullable=True, default=list)

    # --- Raw Text (kept for debugging / re-extraction without re-upload) ---
    raw_text = Column(Text, nullable=True)

    # --- File References (needed for DELETE to clean up disk files) ---
    resume_filename = Column(String(500), nullable=True)
    resume_file_path = Column(String(1000), nullable=True)
    extracted_json_path = Column(String(1000), nullable=True)

    # --- Status (surfaces in "Recently Processed Candidates" table) ---
    status = Column(String(50), default="processed")  # processed | failed | processing

    # --- Timestamps ---
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Candidate id={self.id} name={self.name!r} email={self.email!r}>"