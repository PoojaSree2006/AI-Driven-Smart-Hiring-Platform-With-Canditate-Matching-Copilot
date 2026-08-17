from __future__ import annotations

"""
backend/app/routes/interview.py
================================
Router for AI Interview Question Generation, Interactive Simulation, and ATS Workflows.
Supports Gemini AI integration with automatic local fallback when no key is set.
"""

import os
import json
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


def call_gemini_or_fallback(prompt: str) -> Optional[str]:
    """Invokes Gemini if a valid API key exists; otherwise signals to fallback."""
    settings = get_settings()
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""

    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        return None

    try:
        if USE_NEW_SDK is True:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-1.5-flash',
                contents=prompt,
            )
            return response.text.strip() if response and response.text else None
        elif USE_NEW_SDK is False:
            genai_legacy.configure(api_key=api_key)
            model = genai_legacy.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(prompt)
            return response.text.strip() if response and response.text else None
    except Exception as e:
        logger.warning("Gemini API call encountered an error: %s. Using fallback engine.", e)
        return None

    return None


@router.post("/interview/generate-questions")
def generate_interview_questions(req: QuestionRequest, db: Session = Depends(get_db)):
    job = db.query(JobPosting).filter(JobPosting.id == req.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found")

    candidate_info = ""
    candidate_skills = []
    if req.candidate_id:
        cand = db.query(Candidate).filter(Candidate.id == req.candidate_id).first()
        if cand:
            candidate_skills = cand.skills or []
            candidate_info = f"Candidate Name: {cand.name}\nExtracted Skills: {candidate_skills}"

    req_skills = [s.get("name") if isinstance(s, dict) else str(s) for s in (job.required_skills or [])]
    primary_skill = req_skills[0] if req_skills else "Software Engineering"
    secondary_skill = req_skills[1] if len(req_skills) > 1 else "System Architecture"

    # Attempt Gemini Generation
    prompt = f"""
You are an expert AI technical interviewer for the role '{job.title}'.
Required Skills: {', '.join(req_skills)}.
{candidate_info}
Generate exactly 3 structured interview questions for category '{req.question_type}'.

Return strictly a valid JSON array matching this exact format:
[
  {{"id": 1, "question": "Question text here", "type": "Technical - Scenario-based", "estimated_time": "3-5 min response"}},
  {{"id": 2, "question": "Question text here", "type": "Technical - Deep Dive", "estimated_time": "4-6 min response"}},
  {{"id": 3, "question": "Question text here", "type": "Behavioral - Communication", "estimated_time": "2-4 min response"}}
]
"""
    
    ai_raw = call_gemini_or_fallback(prompt)
    if ai_raw:
        try:
            cleaned = ai_raw.replace("```json", "").replace("```", "").strip()
            questions = json.loads(cleaned)
            return {"success": True, "job_title": job.title, "questions": questions, "source": "Gemini AI"}
        except Exception:
            pass

    # Intelligent Heuristic Fallback
    if "Technical" in req.question_type or req.question_type == "Technical Skills":
        questions = [
            {
                "id": 1,
                "question": f"Describe a project where you applied {primary_skill} to optimize system performance. What techniques did you use and what was the outcome?",
                "type": f"Technical • Experience-based",
                "estimated_time": "3-5 min response",
            },
            {
                "id": 2,
                "question": f"How would you approach deploying a service for the {job.title} position in a production environment with {secondary_skill}? What considerations would you take into account?",
                "type": "Technical • Scenario-based",
                "estimated_time": "4-6 min response",
            },
            {
                "id": 3,
                "question": "Tell me about a time when you had to explain complex technical concepts to non-technical stakeholders. How did you ensure they understood?",
                "type": "Behavioral • Communication",
                "estimated_time": "2-4 min response",
            },
        ]
    else:
        questions = [
            {
                "id": 1,
                "question": f"Describe a challenging bug or deployment failure you encountered while using {primary_skill}. How did you resolve it under pressure?",
                "type": "Behavioral • Problem Solving",
                "estimated_time": "4-5 min response",
            },
            {
                "id": 2,
                "question": "How do you evaluate engineering trade-offs between rapid feature delivery and long-term codebase maintainability?",
                "type": "Behavioral • Decision Making",
                "estimated_time": "3-5 min response",
            },
            {
                "id": 3,
                "question": "Tell me about a time you received critical feedback on your code or design during a review. How did you handle it?",
                "type": "Behavioral • Collaboration",
                "estimated_time": "2-3 min response",
            },
        ]

    return {"success": True, "job_title": job.title, "questions": questions, "source": "Copilot Engine"}


@router.post("/interview/simulate")
def simulate_interview_turn(msg: SimulationMessage, db: Session = Depends(get_db)):
    cand = db.query(Candidate).filter(Candidate.id == msg.candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    user_text = msg.user_response.strip().lower()
    cand_name = cand.name or "Candidate"

    # Attempt Gemini response
    history_str = "\n".join([f"Interviewer: {t.get('ai')}\nCandidate: {t.get('user')}" for t in msg.history])
    prompt = f"""
You are an AI Interviewer conducting a live interview simulation with {cand_name} (Skills: {cand.skills}).
Conversation History:
{history_str}

Candidate Response: "{msg.user_response}"

Provide a concise, encouraging conversational reply followed by a relevant technical follow-up question (2-3 sentences max).
"""
    
    ai_reply = call_gemini_or_fallback(prompt)
    if not ai_reply:
        if "hello" in user_text or "start" in user_text or not msg.history:
            ai_reply = f"Hello {cand_name}, I'm your AI interviewer today. Let's start with a technical question about your core experience and projects."
        elif len(user_text) < 20:
            ai_reply = f"Thank you, {cand_name}. Could you elaborate further with specific technical implementation details or architectures you used?"
        else:
            ai_reply = "Great! Can you describe your approach to monitoring system performance in production and how you handle failures or drift?"

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