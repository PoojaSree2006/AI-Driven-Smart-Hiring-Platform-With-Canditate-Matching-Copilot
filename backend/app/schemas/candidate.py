"""
schemas/candidate.py
=====================
Pydantic schemas for request/response validation and serialization.

Why this exists:
-----------------
SQLAlchemy models (models/candidate.py) define the DATABASE shape.
Pydantic schemas define the API shape — what goes in and out over HTTP.
Keeping these separate (rather than exposing the ORM model directly)
lets us:
  - Control exactly which fields are exposed to the frontend
  - Validate incoming data independently of DB constraints
  - Add computed/derived fields (e.g. skill_count) without touching the DB
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ======================================================================
# Shared building blocks
# ======================================================================

class EducationItem(BaseModel):
    """
    A single education entry.

    Kept loose (all fields optional strings) because resume formatting
    varies wildly — we'd rather capture a partial match than reject/drop
    an education entry because one sub-field wasn't found.
    """
    degree: Optional[str] = None
    institution: Optional[str] = None
    year: Optional[str] = None


class ExperienceItem(BaseModel):
    """A single work experience entry."""
    title: Optional[str] = None
    company: Optional[str] = None
    duration: Optional[str] = None
    description: Optional[str] = None


class ProjectItem(BaseModel):
    """A single project entry."""
    name: Optional[str] = None
    description: Optional[str] = None
    technologies: list[str] = Field(default_factory=list)


# ======================================================================
# Candidate Schemas
# ======================================================================

class CandidateBase(BaseModel):
    """
    Fields common to creating and reading a candidate.
    This is the "structured JSON" shape described in the project spec
    (Step 7), extended slightly with location/linkedin/github/skills etc.
    """
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    experience_years: Optional[str] = None

    skills: list[str] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)


class CandidateCreate(CandidateBase):
    """
    Schema used internally when a service constructs a new Candidate
    row after parsing/extraction. Not exposed directly as an API input
    schema since candidates are only ever created via file upload
    (see UploadResponse below), not raw JSON POST.
    """
    resume_filename: Optional[str] = None
    resume_file_path: Optional[str] = None
    extracted_json_path: Optional[str] = None
    raw_text: Optional[str] = None
    status: str = "processed"


class CandidateResponse(CandidateBase):
    """
    Full candidate representation returned by GET /candidate/{id}
    and GET /candidates.
    """
    model_config = ConfigDict(from_attributes=True)  # allows `.model_validate(orm_obj)`

    id: str
    status: str
    resume_filename: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @property
    def skill_count(self) -> int:
        """Convenience count used by Dashboard's 'Total Skills Extracted' stat."""
        return len(self.skills)


class CandidateListItem(BaseModel):
    id: str
    name: str | None
    email: str |None
    phone: str |None
    location: str |None
    skills: list[str] = []
    experience_years: str |None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
    
# ======================================================================
# Upload Response Schemas
# ======================================================================

class UploadResponse(BaseModel):
    """
    Response shape for POST /upload, matching the spec:
        { success: true, candidate: {} }
    """
    success: bool
    candidate: CandidateResponse
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard error response shape for consistent frontend error handling."""
    success: bool = False
    error: str
    detail: Optional[str] = None


# ======================================================================
# Dashboard / Analytics Schemas
# ======================================================================

class DashboardStats(BaseModel):
    """Response shape for the Dashboard page's summary cards."""
    total_candidates: int
    total_uploads: int
    average_experience: float
    total_skills_extracted: int


class SkillFrequency(BaseModel):
    """One entry in the 'Top Skills' analytics chart."""
    skill: str
    count: int


class EducationDistribution(BaseModel):
    """One entry in the 'Education Distribution' analytics chart."""
    degree_level: str
    count: int


class ExperienceDistribution(BaseModel):
    """One entry in the 'Experience Distribution' analytics chart."""
    range_label: str  # e.g. "0-2 years", "3-5 years"
    count: int


class AnalyticsResponse(BaseModel):
    """Combined response for GET /analytics (all three charts in one call)."""
    top_skills: list[SkillFrequency]
    education_distribution: list[EducationDistribution]
    experience_distribution: list[ExperienceDistribution]