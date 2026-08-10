"""
services/matching_service.py
==============================
Includes skills extracted from core skills, projects, AND internships
in candidate-job matching and skill gap analysis.
"""

import re
from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.job_posting import JobPosting
from app.utils.exceptions import CandidateNotFoundError, JobPostingNotFoundError

SKILL_WEIGHTS = {
    "required": 1.0,
    "advanced": 1.0,
    "intermediate": 0.75,
    "preferred": 0.5,
    "basic": 0.5,
}


def _normalize(skill: str) -> str:
    return skill.strip().lower() if skill else ""


def _parse_years(exp_str: str | None) -> float:
    if not exp_str:
        return 0.0
    match = re.search(r"(\d+(?:\.\d+)?)", str(exp_str))
    return float(match.group(1)) if match else 0.0


def extract_all_candidate_skills(candidate: Candidate) -> set[str]:
    """Combines core skills, project tech, and internship tech."""
    skills = {_normalize(s) for s in (candidate.skills or []) if s}

    for proj in (candidate.projects or []):
        if isinstance(proj, dict):
            for tech in proj.get("technologies", []):
                if tech:
                    skills.add(_normalize(tech))

    for intern in (candidate.internships or []):
        if isinstance(intern, dict):
            for tech in intern.get("technologies", []):
                if tech:
                    skills.add(_normalize(tech))

    return skills


def get_job_posting(db: Session, job_id: str) -> JobPosting:
    job = db.query(JobPosting).filter(JobPosting.id == job_id).first()
    if not job:
        raise JobPostingNotFoundError(f"Job posting with id '{job_id}' not found.")
    return job


def compute_weighted_match(candidate: Candidate, job: JobPosting) -> dict:
    candidate_skills = extract_all_candidate_skills(candidate)
    required_skills = job.required_skills if isinstance(job.required_skills, dict) else {}

    matched_skills = []
    missing_skills = []

    if not required_skills:
        skill_score = 100.0
    else:
        total_possible = 0.0
        earned_points = 0.0

        for skill, level in required_skills.items():
            norm_skill = _normalize(skill)
            if not norm_skill:
                continue

            weight = SKILL_WEIGHTS.get(str(level).lower(), 0.75)
            total_possible += weight

            if norm_skill in candidate_skills:
                earned_points += weight
                matched_skills.append(skill)
            else:
                missing_skills.append(skill)

        skill_score = (earned_points / total_possible) * 100.0 if total_possible > 0 else 0.0

    cand_exp = _parse_years(candidate.experience_years)
    job_min_exp = _parse_years(job.min_experience)

    if job_min_exp == 0.0 or cand_exp >= job_min_exp:
        exp_score = 100.0
    else:
        exp_score = (cand_exp / job_min_exp) * 100.0

    overall_score = round((skill_score * 0.75) + (exp_score * 0.25), 1)

    return {
        "candidate_id": str(candidate.id),
        "name": candidate.name or "Candidate",
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "skill_score": round(skill_score, 1),
        "experience_score": round(exp_score, 1),
        "candidate_exp_years": cand_exp,
        "required_min_exp": job_min_exp,
        "match_percentage": overall_score,
    }


def rank_candidates_for_job(db: Session, job_id: str) -> list[dict]:
    job = get_job_posting(db, job_id)
    candidates = db.query(Candidate).all()
    results = [compute_weighted_match(c, job) for c in candidates]
    results.sort(key=lambda x: x["match_percentage"], reverse=True)
    return results


def generate_recommendation(gaps: list[dict], job_title: str) -> str:
    missing = [g["skill"] for g in gaps if g["status"] == "gap"]

    if not missing:
        return f"Strong match for {job_title} — all required skills are detected across experience and internships."

    if len(missing) == 1:
        return f"Close match for {job_title}. Missing only '{missing[0]}'. Consider targeted upskilling or training."

    listed = ", ".join(missing[:-1]) + f", and {missing[-1]}"
    return f"Candidate shows relevant foundational skills but needs development in {listed} to fully align with {job_title}."


def get_skill_gap(db: Session, candidate_id: str, job_id: str) -> dict:
    job = get_job_posting(db, job_id)
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()

    if not candidate:
        raise CandidateNotFoundError(f"Candidate with id '{candidate_id}' not found.")

    candidate_skills = extract_all_candidate_skills(candidate)
    required_skills = job.required_skills if isinstance(job.required_skills, dict) else {}

    gaps = []
    for skill, required_level in required_skills.items():
        norm_skill = _normalize(skill)
        has_skill = norm_skill in candidate_skills

        gaps.append({
            "skill": skill,
            "required_level": str(required_level) if required_level else "Required",
            "candidate_level": "Detected" if has_skill else "Not Detected",
            "status": "matched" if has_skill else "gap",
        })

    recommendation = generate_recommendation(gaps, job.title)

    return {
        "candidate_id": str(candidate.id),
        "candidate_name": candidate.name or "Candidate",
        "job_id": str(job.id),
        "job_title": job.title,
        "gaps": gaps,
        "recommendation": recommendation,
    }