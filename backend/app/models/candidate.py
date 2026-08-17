from __future__ import annotations

"""
models/candidate.py
====================
SQLAlchemy ORM model for the `candidates` table.
Includes fields for skills, education, experience, projects, certifications,
internships, trainings, and interview simulation logs stored as JSON columns.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, JSON, Text
from sqlalchemy.dialects.mysql import CHAR

from app.database import Base


def generate_uuid() -> str:
    """Generates a UUID4 string for use as a primary key."""
    return str(uuid.uuid4())


class Candidate(Base):
    """Represents a single candidate profile extracted from an uploaded resume."""

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

    # --- Derived / Summary Fields ---
    experience_years = Column(String(50), nullable=True)  # e.g. "5" or "5+"

    # --- Structured List Fields (stored as JSON) ---
    skills = Column(JSON, nullable=True, default=list)
    education = Column(JSON, nullable=True, default=list)
    projects = Column(JSON, nullable=True, default=list)
    experience = Column(JSON, nullable=True, default=list)
    certifications = Column(JSON, nullable=True, default=list)
    internships = Column(JSON, nullable=True, default=list)
    trainings = Column(JSON, nullable=True, default=list)

    # --- Raw Text ---
    raw_text = Column(Text, nullable=True)

    # --- File References ---
    resume_filename = Column(String(500), nullable=True)
    resume_file_path = Column(String(1000), nullable=True)
    extracted_json_path = Column(String(1000), nullable=True)

    # --- Milestone 3 Extensions: Status & Interview Logs ---
    status = Column(String(50), default="processed")  # e.g. "processed", "scheduled", "shortlisted", "rejected"
    interview_notes = Column(JSON, nullable=True, default=list)

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