"""
backend/app/routes/candidate.py
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import candidate_service
from app.schemas.candidate import (
    CandidateResponse, CandidateListItem, DashboardStats, AnalyticsResponse,
)
from app.utils.exceptions import CandidateNotFoundError

# Do NOT add prefix="/candidates" here if your path decorator below already uses "/candidates"
router = APIRouter(tags=["Candidates"])


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


@router.get("/dashboard/stats", response_model=DashboardStats)
def dashboard_stats(db: Session = Depends(get_db)):
    return candidate_service.get_dashboard_stats(db)


@router.get("/analytics", response_model=AnalyticsResponse)
def analytics(db: Session = Depends(get_db)):
    return candidate_service.get_analytics(db)