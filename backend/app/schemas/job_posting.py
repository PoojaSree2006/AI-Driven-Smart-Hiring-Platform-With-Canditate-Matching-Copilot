"""
schemas/job_posting.py
========================
Pydantic schemas for Job Posting CRUD, Candidate Matching, and Skill Gap Analysis.
"""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


class JobPostingBase(BaseModel):
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    min_experience: Optional[str] = None
    required_skills: dict[str, str] = Field(default_factory=dict)


class JobPostingCreate(JobPostingBase):
    pass


class JobPostingResponse(JobPostingBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime


class CandidateMatchItem(BaseModel):
    candidate_id: str
    name: Optional[str] = None
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    skill_score: float = 0.0
    experience_score: float = 0.0
    candidate_exp_years: float = 0.0
    required_min_exp: float = 0.0
    match_percentage: float = 0.0


SkillStatus = Literal["matched", "gap"]


class SkillGapItem(BaseModel):
    skill: str
    required_level: str
    candidate_level: str
    status: SkillStatus


class SkillGapResponse(BaseModel):
    candidate_id: str
    candidate_name: Optional[str] = None
    job_id: str
    job_title: str
    gaps: list[SkillGapItem] = Field(default_factory=list)
    recommendation: str