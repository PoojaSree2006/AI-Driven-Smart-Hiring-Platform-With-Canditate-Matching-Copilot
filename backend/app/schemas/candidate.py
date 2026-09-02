"""
schemas/candidate.py
=====================
Pydantic schemas for validation and API request/response modeling.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ======================================================================
# Shared building blocks
# ======================================================================

class EducationItem(BaseModel):
    degree: Optional[str] = None
    institution: Optional[str] = None
    year: Optional[str] = None


class ExperienceItem(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    duration: Optional[str] = None
    description: Optional[str] = None


class ProjectItem(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    technologies: list[str] = Field(default_factory=list)


class InternshipItem(BaseModel):
    role: Optional[str] = None
    company: Optional[str] = None
    duration: Optional[str] = None
    description: Optional[str] = None
    technologies: list[str] = Field(default_factory=list)


class TrainingItem(BaseModel):
    title: Optional[str] = None
    issuer_or_platform: Optional[str] = None
    year: Optional[str] = None


# ======================================================================
# Candidate Schemas
# ======================================================================

class CandidateBase(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
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
    internships: list[InternshipItem] = Field(default_factory=list)
    trainings: list[TrainingItem] = Field(default_factory=list)


class CandidateCreate(CandidateBase):
    resume_filename: Optional[str] = None
    resume_file_path: Optional[str] = None
    extracted_json_path: Optional[str] = None
    raw_text: Optional[str] = None
    status: str = "processed"
    voice_screening_status: str = "NOT COMPLETED"


class CandidateResponse(CandidateBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: Optional[str] = "processed"
    voice_screening_status: Optional[str] = "NOT COMPLETED"
    resume_filename: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CandidateListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    experience_years: Optional[str] = None
    skills: list[str] = Field(default_factory=list)
    status: Optional[str] = "processed"
    voice_screening_status: Optional[str] = "NOT COMPLETED"
    created_at: datetime


# ======================================================================
# Upload Response Schemas
# ======================================================================

class UploadResponse(BaseModel):
    success: bool
    candidate: CandidateResponse
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    detail: Optional[str] = None


# ======================================================================
# Dashboard / Analytics Schemas
# ======================================================================

class DashboardStats(BaseModel):
    total_candidates: int
    total_uploads: int
    average_experience: float
    total_skills_extracted: int


class SkillFrequency(BaseModel):
    skill: str
    count: int


class EducationDistribution(BaseModel):
    degree_level: str
    count: int


class ExperienceDistribution(BaseModel):
    range_label: str
    count: int


class AnalyticsResponse(BaseModel):
    top_skills: list[SkillFrequency]
    education_distribution: list[EducationDistribution]
    experience_distribution: list[ExperienceDistribution]