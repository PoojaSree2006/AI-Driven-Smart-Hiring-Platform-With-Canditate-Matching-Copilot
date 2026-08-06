"""
routes/job_posting.py
=======================
NEW FILE — Milestone 2.

CRUD endpoints for job postings, plus the two matching endpoints
(candidate ranking and skill gap analysis) that depend on a job posting.

Following the existing project convention: routes stay thin and only
call services (candidate_service.py's pattern), never touch the ORM
or business logic directly.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.job_posting import JobPosting
from app.schemas.job_posting import (
    JobPostingCreate, JobPostingResponse, CandidateMatchItem, SkillGapResponse,
)
from app.services import matching_service
from app.utils.exceptions import CandidateNotFoundError, JobPostingNotFoundError

router = APIRouter(tags=["Job Postings & Matching"])


@router.post("/jobs", response_model=JobPostingResponse)
def create_job_posting(payload: JobPostingCreate, db: Session = Depends(get_db)):
    job = JobPosting(
        id=str(uuid.uuid4()),
        title=payload.title,
        description=payload.description,
        location=payload.location,
        min_experience=payload.min_experience,
        required_skills=payload.required_skills,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return JobPostingResponse.model_validate(job)


@router.get("/jobs", response_model=list[JobPostingResponse])
def list_job_postings(db: Session = Depends(get_db)):
    jobs = db.query(JobPosting).order_by(JobPosting.created_at.desc()).all()
    return [JobPostingResponse.model_validate(j) for j in jobs]


@router.get("/job/{job_id}", response_model=JobPostingResponse)
def get_job_posting(job_id: str, db: Session = Depends(get_db)):
    try:
        job = matching_service.get_job_posting(db, job_id)
        return JobPostingResponse.model_validate(job)
    except JobPostingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/job/{job_id}")
def delete_job_posting(job_id: str, db: Session = Depends(get_db)):
    try:
        job = matching_service.get_job_posting(db, job_id)
        db.delete(job)
        db.commit()
        return {"success": True, "message": "Job posting deleted successfully."}
    except JobPostingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/candidates/match/{job_id}", response_model=list[CandidateMatchItem])
def match_candidates_for_job(job_id: str, db: Session = Depends(get_db)):
    """Returns every candidate ranked by match % against this job posting."""
    try:
        results = matching_service.rank_candidates_for_job(db, job_id)
        return [CandidateMatchItem(**r) for r in results]
    except JobPostingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/candidate/{candidate_id}/skill-gap/{job_id}", response_model=SkillGapResponse)
def candidate_skill_gap(candidate_id: str, job_id: str, db: Session = Depends(get_db)):
    """Returns per-skill gap breakdown + recommendation for one candidate/job pair."""
    try:
        result = matching_service.get_skill_gap(db, candidate_id, job_id)
        return SkillGapResponse(**result)
    except (CandidateNotFoundError, JobPostingNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))