"""
services/candidate_service.py
==============================
Pipeline execution and ORM persistence with safe JSON array defaults.
"""

import json
import re
import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.candidate import Candidate
from app.services.parser import parse_resume
from app.services.extractor import extract_candidate_info
from app.utils.exceptions import InvalidFileError, CandidateNotFoundError

settings = get_settings()


def parse_experience_years(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)", str(value))
    return float(match.group(1)) if match else None


def validate_upload_file(file: UploadFile) -> None:
    extension = Path(file.filename or "").suffix.lower()
    if extension not in settings.ALLOWED_EXTENSIONS:
        raise InvalidFileError(f"Unsupported file type '{extension}'. Only PDF and DOCX are allowed.")
    if file.size is not None and file.size > settings.max_file_size_bytes:
        raise InvalidFileError(f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_MB}MB.")


def save_uploaded_file(file: UploadFile) -> Path:
    extension = Path(file.filename or "").suffix.lower()
    unique_name = f"{uuid.uuid4()}{extension}"
    destination = settings.UPLOAD_DIR / unique_name
    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return destination


def save_extracted_json(candidate_id: str, data: dict) -> Path:
    destination = settings.EXTRACTED_DATA_DIR / f"{candidate_id}.json"
    with destination.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    return destination


def process_resume_upload(file: UploadFile, db: Session) -> Candidate:
    validate_upload_file(file)
    saved_path = save_uploaded_file(file)

    try:
        raw_text = parse_resume(saved_path)
        structured_data = extract_candidate_info(raw_text)
    except Exception:
        saved_path.unlink(missing_ok=True)
        raise

    email = structured_data.get("email")
    phone = structured_data.get("phone")

    existing_candidate = None
    if email:
        existing_candidate = db.query(Candidate).filter(Candidate.email == email).first()
    elif phone:
        existing_candidate = db.query(Candidate).filter(Candidate.phone == phone).first()

    if existing_candidate:
        saved_path.unlink(missing_ok=True)
        return existing_candidate

    candidate_id = str(uuid.uuid4())
    json_path = save_extracted_json(candidate_id, structured_data)

    candidate = Candidate(
        id=candidate_id,
        name=structured_data.get("name"),
        email=email,
        phone=phone,
        location=structured_data.get("location"),
        linkedin=structured_data.get("linkedin"),
        github=structured_data.get("github"),
        experience_years=structured_data.get("experience_years"),
        skills=structured_data.get("skills") or [],
        education=structured_data.get("education") or [],
        experience=structured_data.get("experience") or [],
        projects=structured_data.get("projects") or [],
        certifications=structured_data.get("certifications") or [],
        internships=structured_data.get("internships") or [],
        trainings=structured_data.get("trainings") or [],
        raw_text=raw_text,
        resume_filename=file.filename,
        resume_file_path=str(saved_path),
        extracted_json_path=str(json_path),
        status="processed",
    )

    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def _sanitize_candidate(c: Candidate) -> Candidate:
    """Ensures list columns never evaluate to None during serialization."""
    if c.skills is None: c.skills = []
    if c.education is None: c.education = []
    if c.experience is None: c.experience = []
    if c.projects is None: c.projects = []
    if c.certifications is None: c.certifications = []
    if c.internships is None: c.internships = []
    if c.trainings is None: c.trainings = []
    return c


def get_all_candidates(db: Session) -> list[Candidate]:
    candidates = db.query(Candidate).order_by(Candidate.created_at.desc()).all()
    return [_sanitize_candidate(c) for c in candidates]


def get_candidate_by_id(db: Session, candidate_id: str) -> Candidate:
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise CandidateNotFoundError(f"Candidate with id '{candidate_id}' not found.")
    return _sanitize_candidate(candidate)


def delete_candidate(db: Session, candidate_id: str) -> None:
    candidate = get_candidate_by_id(db, candidate_id)
    if candidate.resume_file_path:
        Path(candidate.resume_file_path).unlink(missing_ok=True)
    if candidate.extracted_json_path:
        Path(candidate.extracted_json_path).unlink(missing_ok=True)
    db.delete(candidate)
    db.commit()


def search_candidates(db: Session, query: str) -> list[Candidate]:
    like_pattern = f"%{query}%"
    candidates = (
        db.query(Candidate)
        .filter((Candidate.name.ilike(like_pattern)) | (Candidate.email.ilike(like_pattern)))
        .order_by(Candidate.created_at.desc())
        .all()
    )
    return [_sanitize_candidate(c) for c in candidates]


def get_dashboard_stats(db: Session) -> dict:
    candidates = get_all_candidates(db)
    total = len(candidates)
    exp_values = [parse_experience_years(c.experience_years) for c in candidates if parse_experience_years(c.experience_years) is not None]
    total_skills = sum(len(c.skills or []) for c in candidates)

    return {
        "total_candidates": total,
        "total_uploads": total,
        "average_experience": round(sum(exp_values) / len(exp_values), 1) if exp_values else 0.0,
        "total_skills_extracted": total_skills,
    }


def get_analytics(db: Session) -> dict:
    candidates = get_all_candidates(db)

    skill_counts: dict[str, int] = {}
    for c in candidates:
        for skill in (c.skills or []):
            skill_counts[skill] = skill_counts.get(skill, 0) + 1
    top_skills = sorted([{"skill": k, "count": v} for k, v in skill_counts.items()], key=lambda x: x["count"], reverse=True)[:10]

    edu_counts: dict[str, int] = {}
    for c in candidates:
        for edu in (c.education or []):
            degree = (edu.get("degree") or "Unknown").strip() if isinstance(edu, dict) else "Unknown"
            level = "Bachelor's" if "bachelor" in degree.lower() or "b." in degree.lower() else \
                    "Master's" if "master" in degree.lower() or "m." in degree.lower() else \
                    "PhD" if "phd" in degree.lower() or "ph.d" in degree.lower() else "Other"
            edu_counts[level] = edu_counts.get(level, 0) + 1
    education_distribution = [{"degree_level": k, "count": v} for k, v in edu_counts.items()]

    buckets = {"0-2 years": 0, "3-5 years": 0, "6-10 years": 0, "10+ years": 0}
    for c in candidates:
        years = parse_experience_years(c.experience_years)
        if years is None:
            continue
        if years <= 2:
            buckets["0-2 years"] += 1
        elif years <= 5:
            buckets["3-5 years"] += 1
        elif years <= 10:
            buckets["6-10 years"] += 1
        else:
            buckets["10+ years"] += 1
    experience_distribution = [{"range_label": k, "count": v} for k, v in buckets.items()]

    return {
        "top_skills": top_skills,
        "education_distribution": education_distribution,
        "experience_distribution": experience_distribution,
    }