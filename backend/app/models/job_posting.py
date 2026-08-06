"""
models/job_posting.py
=======================
NEW FILE — Milestone 2.

SQLAlchemy ORM model for job postings, used by Candidate Matching and
Skill Gap Analysis.

Design notes:
-------------
- `required_skills` is stored as JSON: { "TensorFlow": "Advanced",
  "Kubernetes": "Preferred", "AWS SageMaker": "Required" } — this mirrors
  the same JSON-column pattern already used on Candidate (models/candidate.py)
  for skills/education/etc., so no new storage pattern is introduced.
- Kept intentionally simple (one table, no separate skill-requirement
  rows) for the same reason Candidate's list fields are JSON rather than
  normalized: this project's scale doesn't need relational skill queries,
  and it keeps matching_service.py's logic straightforward (load the dict,
  compare directly against candidate.skills).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, JSON
from sqlalchemy.dialects.mysql import CHAR

from app.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class JobPosting(Base):
    """Represents a job posting used as the basis for candidate matching."""

    __tablename__ = "job_postings"

    id = Column(CHAR(36), primary_key=True, default=generate_uuid, index=True)

    title = Column(String(255), nullable=False)
    description = Column(String(2000), nullable=True)
    location = Column(String(255), nullable=True)

    # e.g. "3" (years) — stored as string for the same reason as
    # Candidate.experience_years (tolerates "3+", "Fresher", etc.)
    min_experience = Column(String(50), nullable=True)

    # { "SkillName": "Required" | "Preferred" | "Advanced" | "Intermediate" | "Basic" }
    required_skills = Column(JSON, nullable=False, default=dict)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<JobPosting id={self.id} title={self.title!r}>"