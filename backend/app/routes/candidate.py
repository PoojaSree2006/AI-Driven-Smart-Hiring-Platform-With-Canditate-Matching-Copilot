from __future__ import annotations

"""
backend/app/routes/candidate.py
=================================
Routes for Candidate Management, Dashboard Stats, Skill Matching, and Analytics.
"""

import json
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import candidate_service
from app.models.candidate import Candidate
from app.models.job_posting import JobPosting
from app.schemas.candidate import (
    CandidateResponse, CandidateListItem, DashboardStats, AnalyticsResponse,
)
from app.utils.exceptions import CandidateNotFoundError

router = APIRouter(tags=["Candidates"])


# ======================================================================
# Candidate Management Endpoints
# ======================================================================

@router.get("/candidates", response_model=list[CandidateListItem])
@router.get("/candidates/", response_model=list[CandidateListItem])
def list_candidates(search: str | None = Query(default=None), db: Session = Depends(get_db)):
    candidates = candidate_service.search_candidates(db, search) if search else candidate_service.get_all_candidates(db)
    return [CandidateListItem.model_validate(c) for c in candidates]


@router.get("/candidate/{candidate_id}", response_model=CandidateResponse)
def get_candidate(candidate_id: str, db: Session = Depends(get_db)):
    try:
        candidate = candidate_service.get_candidate_by_id(db, candidate_id)
        return CandidateResponse.model_validate(candidate)
    except CandidateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/candidate/{candidate_id}")
def remove_candidate(candidate_id: str, db: Session = Depends(get_db)):
    try:
        candidate_service.delete_candidate(db, candidate_id)
        return {"success": True, "message": "Candidate deleted successfully."}
    except CandidateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/candidates/{candidate_id}/status")
def update_candidate_status(
    candidate_id: str,
    status_data: dict = Body(...),
    db: Session = Depends(get_db)
):
    """Updates candidate pipeline status (e.g., Shortlisted, Interview Scheduled, Rejected)."""
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail=f"Candidate with ID '{candidate_id}' not found.")
    
    new_status = status_data.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Missing 'status' field in request body.")
    
    candidate.status = new_status
    db.commit()
    db.refresh(candidate)
    return {"success": True, "candidate_id": candidate.id, "status": candidate.status}


# ======================================================================
# Matching & Skill Analysis Endpoint
# ======================================================================

@router.get("/matching/{job_id}")
def match_candidates_for_job(job_id: str, db: Session = Depends(get_db)):
    """
    Computes skill match percentage and missing skill gaps for all candidates
    against a designated Job Posting ID.
    """
    job = db.query(JobPosting).filter(JobPosting.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job posting '{job_id}' not found.")

    # 1. Parse Required Job Skills
    job_skills_raw = job.required_skills or []
    if isinstance(job_skills_raw, str):
        try:
            job_skills_list = json.loads(job_skills_raw)
        except Exception:
            job_skills_list = [s.strip() for s in job_skills_raw.split(",") if s.strip()]
    else:
        job_skills_list = list(job_skills_raw)

    job_skills_set = set(s.lower() for s in job_skills_list)

    # 2. Fetch Candidates and Calculate Match Scores
    candidates = db.query(Candidate).all()
    results = []

    for c in candidates:
        cand_skills_raw = c.skills or []
        if isinstance(cand_skills_raw, str):
            try:
                cand_skills_list = json.loads(cand_skills_raw)
            except Exception:
                cand_skills_list = [s.strip() for s in cand_skills_raw.split(",") if s.strip()]
        else:
            cand_skills_list = list(cand_skills_raw)

        cand_skills_map = {s.lower(): s for s in cand_skills_list}
        cand_skills_set = set(cand_skills_map.keys())

        # Set Overlap Calculations
        matched_lower = job_skills_set.intersection(cand_skills_set)
        missing_lower = job_skills_set - cand_skills_set

        matched_skills = [cand_skills_map[s] for s in matched_lower if s in cand_skills_map]
        missing_skills = [s for s in job_skills_list if s.lower() in missing_lower]

        total_required = max(len(job_skills_set), 1)
        score = round((len(matched_lower) / total_required) * 100)

        results.append({
            "candidate_id": c.id,
            "name": c.name or "Unnamed Candidate",
            "email": c.email or "",
            "experience_years": c.experience_years or "0",
            "match_score": score,
            "matched_skills": matched_skills,
            "missing_skills": missing_skills
        })

    # Sort descending by match score
    return sorted(results, key=lambda x: x["match_score"], reverse=True)


# ======================================================================
# Dashboard & Analytics Endpoints
# ======================================================================

@router.get("/dashboard/stats", response_model=DashboardStats)
def dashboard_stats(db: Session = Depends(get_db)):
    return candidate_service.get_dashboard_stats(db)


@router.get("/analytics", response_model=AnalyticsResponse)
def analytics(db: Session = Depends(get_db)):
    return candidate_service.get_analytics(db)
