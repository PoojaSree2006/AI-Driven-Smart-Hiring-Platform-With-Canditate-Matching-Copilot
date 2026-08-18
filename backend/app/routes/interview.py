from __future__ import annotations

"""
backend/app/routes/interview.py
================================
Router for AI Interview Question Generation, Interactive Simulation, and ATS Workflows.
Fully personalized using candidate resume profiles (skills, projects, experience).
Supports Gemini AI integration (gemini-flash-latest) with automatic heuristic fallback.
"""

import os
import json
import re
import logging
from typing import List, Dict, Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import get_settings
from app.models.candidate import Candidate
from app.models.job_posting import JobPosting 

logger = logging.getLogger(__name__)

# Import Google GenAI SDK with fallback handling
try:
    from google import genai
    USE_NEW_SDK = True
except ImportError:
    try:
        import google.generativeai as genai_legacy
        USE_NEW_SDK = False
    except ImportError:
        USE_NEW_SDK = None

router = APIRouter(tags=["Interview Assistant & ATS"])


class QuestionRequest(BaseModel):
    job_id: str
    candidate_id: Optional[str] = None
    question_type: str = "Technical Skills"


class SimulationMessage(BaseModel):
    candidate_id: str
    user_response: str
    history: List[Dict[str, Any]] = []


class StatusUpdate(BaseModel):
    status: str


def _extract_json(text: str) -> Optional[Any]:
    """Robustly extracts JSON from raw LLM output even if wrapped in markdown code fences."""
    try:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        clean_text = match.group(1).strip() if match else text.strip()
        return json.loads(clean_text)
    except Exception as err:
        logger.warning("JSON parsing failed: %s | Raw output: %s", err, text)
        return None


def call_gemini_or_fallback(prompt: str) -> Optional[str]:
    """Invokes Gemini if a valid API key exists; otherwise signals fallback."""
    settings = get_settings()
    api_key = (getattr(settings, "GEMINI_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")).strip()

    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        logger.info("No active GEMINI_API_KEY configured. Using fallback engine.")
        return None

    try:
        if USE_NEW_SDK is True:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=prompt,
            )
            return response.text.strip() if response and response.text else None
        elif USE_NEW_SDK is False:
            genai_legacy.configure(api_key=api_key)
            model = genai_legacy.GenerativeModel("gemini-flash-latest")
            response = model.generate_content(prompt)
            return response.text.strip() if response and response.text else None
    except Exception as e:
        logger.warning("Gemini API call encountered an error: %s. Using fallback engine.", e)
        return None

    return None


def _format_candidate_resume_profile(cand: Optional[Candidate]) -> str:
    """Builds a comprehensive resume context string from Candidate database columns."""
    if not cand:
        return "No specific candidate resume attached (General Profile)."

    skills = cand.skills if isinstance(cand.skills, list) else []
    projects = cand.projects if isinstance(cand.projects, list) else []
    experience = cand.experience if isinstance(cand.experience, list) else []
    certifications = cand.certifications if isinstance(cand.certifications, list) else []
    education = cand.education if isinstance(cand.education, list) else []

    profile_parts = [
        f"Candidate Name: {cand.name or 'Candidate'}",
        f"Experience Level: {cand.experience_years or 0} years",
        f"Extracted Skills: {', '.join([str(s) for s in skills]) if skills else 'Not specified'}",
        f"Key Projects: {json.dumps(projects) if projects else 'Not specified'}",
        f"Work Experience History: {json.dumps(experience) if experience else 'Not specified'}",
        f"Education: {json.dumps(education) if education else 'Not specified'}",
        f"Certifications: {json.dumps(certifications) if certifications else 'Not specified'}",
    ]

    if cand.raw_text:
        snippet = cand.raw_text[:1200].replace("\n", " ")
        profile_parts.append(f"Resume Text Excerpt: {snippet}")

    return "\n".join(profile_parts)


@router.post("/interview/generate-questions")
def generate_interview_questions(req: QuestionRequest, db: Session = Depends(get_db)):
    job = db.query(JobPosting).filter(JobPosting.id == req.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found")

    cand = None
    if req.candidate_id:
        cand = db.query(Candidate).filter(Candidate.id == req.candidate_id).first()

    resume_profile = _format_candidate_resume_profile(cand)
    req_skills = [s.get("name") if isinstance(s, dict) else str(s) for s in (job.required_skills or [])]

    # Personalized Gemini Prompt using candidate resume details
    prompt = f"""
You are a senior technical interviewer hiring for the position: "{job.title}".
Job Description/Requirements: {job.description or 'Standard requirements'}
Required Job Skills: {', '.join(req_skills)}.

--- CANDIDATE RESUME DOSSIER ---
{resume_profile}
--------------------------------

Generate exactly 3 deep, structured interview questions for category '{req.question_type}'.
CRITICAL REQUIREMENT: Personalize the questions directly to the candidate's listed projects, past work experience, and claimed skills in their resume, evaluating how well they fit the "{job.title}" requirements.

Return strictly a valid JSON array matching this exact format:
[
  {{"id": 1, "question": "Question referencing specific resume project/skill...", "type": "{req.question_type} • Project Deep Dive", "estimated_time": "3-5 min response"}},
  {{"id": 2, "question": "Question challenging their technical architecture choices...", "type": "{req.question_type} • Technical Scenario", "estimated_time": "4-6 min response"}},
  {{"id": 3, "question": "Question assessing teamwork, trade-offs, or leadership in past roles...", "type": "Behavioral • Experience", "estimated_time": "2-4 min response"}}
]
"""

    ai_raw = call_gemini_or_fallback(prompt)
    if ai_raw:
        parsed_questions = _extract_json(ai_raw)
        if parsed_questions and isinstance(parsed_questions, list) and len(parsed_questions) > 0:
            return {
                "success": True,
                "job_title": job.title,
                "questions": parsed_questions,
                "source": "Gemini AI (Resume Grounded)",
            }

    # Context-aware fallback
    cand_name = cand.name if cand else "Candidate"
    skills = cand.skills if (cand and cand.skills) else req_skills
    primary_skill = skills[0] if (isinstance(skills, list) and skills) else "Software Engineering"

    questions = [
        {
            "id": 1,
            "question": f"In your resume, you highlighted experience with {primary_skill}. Could you walk me through your architecture and key technical challenges in that project?",
            "type": f"{req.question_type} • Resume Deep Dive",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 2,
            "question": f"How does your past background prepare you for deploying services in a high-scale {job.title} environment?",
            "type": f"{req.question_type} • Scenario-based",
            "estimated_time": "4-6 min response",
        },
        {
            "id": 3,
            "question": "Can you describe a challenging engineering trade-off you had to negotiate with team members on a past project from your resume?",
            "type": "Behavioral • Collaboration",
            "estimated_time": "2-4 min response",
        },
    ]

    return {"success": True, "job_title": job.title, "questions": questions, "source": "Copilot Heuristic"}


@router.post("/interview/simulate")
def simulate_interview_turn(msg: SimulationMessage, db: Session = Depends(get_db)):
    cand = db.query(Candidate).filter(Candidate.id == msg.candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    cand_name = cand.name or "Candidate"
    resume_profile = _format_candidate_resume_profile(cand)

    history_str = "\n".join([f"Interviewer: {t.get('ai')}\nCandidate: {t.get('user')}" for t in msg.history])
    
    prompt = f"""
You are an expert technical interviewer conducting an interactive simulation with candidate "{cand_name}".

--- CANDIDATE RESUME DOSSIER ---
{resume_profile}
--------------------------------

Interview History so far:
{history_str if history_str else 'Start of interview.'}

Candidate's Latest Response:
"{msg.user_response}"

Instructions:
1. Ground your evaluation in the candidate's actual resume (verify if their answers align with their claimed projects, tools, and background).
2. Formulate a natural, professional reply (2-3 sentences max).
3. Ask a direct follow-up question digging deeper into their technical implementation, testing, performance metrics, or specific project choices from their resume.
"""

    ai_reply = call_gemini_or_fallback(prompt)
    if not ai_reply:
        skills = cand.skills if cand.skills else ["software development"]
        primary = skills[0] if isinstance(skills, list) and skills else "development"
        ai_reply = f"Thank you for that context, {cand_name}. Looking at your experience with {primary}, how did you measure performance benchmarks and ensure maintainability in that project?"

    return {"success": True, "candidate_name": cand_name, "ai_response": ai_reply}


@router.patch("/candidates/{candidate_id}/status")
def update_candidate_status(candidate_id: str, body: StatusUpdate, db: Session = Depends(get_db)):
    cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    cand.status = body.status
    db.commit()
    db.refresh(cand)
    return {"success": True, "candidate_id": cand.id, "new_status": cand.status}