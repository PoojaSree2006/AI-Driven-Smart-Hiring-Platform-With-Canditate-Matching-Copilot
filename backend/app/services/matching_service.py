"""
services/matching_service.py
==============================
NEW FILE — Milestone 2.

Business logic for:
  - Candidate Matching: ranking all candidates against a job posting's
    required skills, producing a match percentage.
  - Skill Gap Analysis: per-skill breakdown for one candidate against
    one job posting, plus a generated text recommendation.

Kept as pure functions operating on already-loaded ORM objects, so this
is easy to unit test independently of the route layer (consistent with
how services/candidate_service.py is structured).
"""

from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.job_posting import JobPosting
from app.utils.exceptions import CandidateNotFoundError, JobPostingNotFoundError


def _normalize(skill: str) -> str:
    """Case-insensitive comparison key, so 'python' matches 'Python'."""
    return skill.strip().lower()


def compute_match(candidate_skills: list[str], required_skills: dict[str, str]) -> dict:
    """
    Compares a candidate's skill list against a job's required skills dict.

    Returns:
        {
            "matched_skills": [...],
            "missing_skills": [...],
            "match_percentage": float (0-100, rounded to 1 decimal)
        }

    Match percentage is a simple coverage ratio: how many of the job's
    required skills the candidate has, out of the total required. This
    is intentionally simple and explainable (a recruiter can verify it
    by counting) rather than a weighted/ML-based score, which is out of
    scope for this milestone but could be layered in later (e.g. weighting
    "Required" skills higher than "Preferred" ones).
    """
    if not required_skills:
        return {"matched_skills": [], "missing_skills": [], "match_percentage": 0.0}

    candidate_set = {_normalize(s) for s in (candidate_skills or [])}
    required_names = list(required_skills.keys())

    matched = [s for s in required_names if _normalize(s) in candidate_set]
    missing = [s for s in required_names if _normalize(s) not in candidate_set]

    percentage = round((len(matched) / len(required_names)) * 100, 1)

    return {
        "matched_skills": matched,
        "missing_skills": missing,
        "match_percentage": percentage,
    }


def get_job_posting(db: Session, job_id: str) -> JobPosting:
    job = db.query(JobPosting).filter(JobPosting.id == job_id).first()
    if not job:
        raise JobPostingNotFoundError(f"Job posting with id '{job_id}' not found.")
    return job


def rank_candidates_for_job(db: Session, job_id: str) -> list[dict]:
    """
    Returns every candidate scored and ranked against the given job
    posting's required skills, highest match_percentage first.
    Powers GET /candidates/match/{job_id}.
    """
    job = get_job_posting(db, job_id)
    candidates = db.query(Candidate).all()

    results = []
    for candidate in candidates:
        match = compute_match(candidate.skills or [], job.required_skills or {})
        results.append({
            "id": candidate.id,
            "name": candidate.name,
            **match,
        })

    results.sort(key=lambda r: r["match_percentage"], reverse=True)
    return results


def generate_recommendation(gaps: list[dict], job_title: str) -> str:
    """
    Produces a short, human-readable recommendation string summarizing
    the candidate's biggest skill gaps for this role.

    Kept as straightforward template logic (no LLM call) — deterministic,
    fast, and dependency-free, consistent with the rest of the project's
    regex/heuristic-based extraction approach rather than reaching for an
    external AI API for something this templated.
    """
    missing = [g["skill"] for g in gaps if g["status"] == "gap"]

    if not missing:
        return f"Strong match for {job_title} — all required skills are present."

    if len(missing) == 1:
        return (
            f"Close match for {job_title}. Missing only '{missing[0]}'. "
            f"Consider targeted upskilling or certification in this area."
        )

    listed = ", ".join(missing[:-1]) + f", and {missing[-1]}" if len(missing) > 1 else missing[0]
    return (
        f"Candidate shows relevant foundational skills but needs development in "
        f"{listed} to be fully aligned with {job_title}. "
        f"Estimated upskilling time will vary by candidate's learning pace."
    )


def get_skill_gap(db: Session, candidate_id: str, job_id: str) -> dict:
    """
    Compares one candidate's skills against one job posting's required
    skills, skill by skill, and generates a recommendation.
    Powers GET /candidate/{candidate_id}/skill-gap/{job_id}.
    """
    job = get_job_posting(db, job_id)
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise CandidateNotFoundError(f"Candidate with id '{candidate_id}' not found.")

    candidate_set = {_normalize(s) for s in (candidate.skills or [])}

    gaps = []
    for skill, required_level in (job.required_skills or {}).items():
        has_skill = _normalize(skill) in candidate_set
        gaps.append({
            "skill": skill,
            "required_level": required_level,
            "candidate_level": "Detected" if has_skill else "Not Detected",
            "status": "matched" if has_skill else "gap",
        })

    recommendation = generate_recommendation(gaps, job.title)

    return {
        "candidate_id": candidate.id,
        "candidate_name": candidate.name,
        "job_id": job.id,
        "job_title": job.title,
        "gaps": gaps,
        "recommendation": recommendation,
    }