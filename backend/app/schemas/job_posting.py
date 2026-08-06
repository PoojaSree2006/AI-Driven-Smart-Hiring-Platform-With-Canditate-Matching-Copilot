"""
schemas/job_posting.py
========================
NEW FILE — Milestone 2.

Pydantic schemas for:
  - Job posting CRUD (JobPostingCreate / JobPostingResponse)
  - Candidate Matching results (CandidateMatchItem)
  - Skill Gap Analysis results (SkillGapItem / SkillGapResponse)
"""

from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, ConfigDict, Field


# ======================================================================
# Job Posting Schemas
# ======================================================================

class JobPostingBase(BaseModel):
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    min_experience: Optional[str] = None
    # e.g. {"TensorFlow": "Advanced", "Kubernetes": "Preferred"}
    required_skills: dict[str, str] = Field(default_factory=dict)


class JobPostingCreate(JobPostingBase):
    pass


class JobPostingResponse(JobPostingBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime


# ======================================================================
# Candidate Matching Schemas
# ======================================================================

class CandidateMatchItem(BaseModel):
    """
    One row in the ranked 'Candidate Matching' table
    (GET /candidates/match/{job_id}).
    """
    id: str
    name: Optional[str] = None
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    match_percentage: float


# ======================================================================
# Skill Gap Analysis Schemas
# ======================================================================

# NOTE on candidate_level:
# The resume extractor (services/extractor.py) currently detects skill
# *presence* only — it does not infer proficiency from resume text. So
# candidate_level is a simplified two-state signal for now:
#   "Detected"     — skill appears in the candidate's extracted skills list
#   "Not Detected" — skill does not appear at all
# This is flagged clearly in the API response and UI rather than faking
# precision (e.g. inventing "Advanced" vs "Intermediate" for the candidate
# side) that the extraction pipeline doesn't actually support yet.
SkillStatus = Literal["matched", "gap"]


class SkillGapItem(BaseModel):
    skill: str
    required_level: str          # from the job posting, e.g. "Advanced"
    candidate_level: str         # "Detected" | "Not Detected"
    status: SkillStatus


class SkillGapResponse(BaseModel):
    candidate_id: str
    candidate_name: Optional[str] = None
    job_id: str
    job_title: str
    gaps: list[SkillGapItem]
    recommendation: str