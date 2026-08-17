from __future__ import annotations

"""
backend/app/services/interview_service.py
==========================================
Service layer for AI Question Generation and Interactive Interview Simulation
using Google Gemini API with heuristic fallback generation.
"""

import json
import logging
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.candidate import Candidate
from app.models.job_posting import JobPosting

logger = logging.getLogger(__name__)


def _call_gemini_llm(prompt: str) -> Optional[str]:
    """Helper function to invoke Google Gemini LLM using the configured API key."""
    settings = get_settings()
    api_key = settings.GEMINI_API_KEY.strip()

    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        logger.info("No active GEMINI_API_KEY detected. Using fallback heuristic generator.")
        return None

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        return response.text
    except Exception as exc:
        logger.warning("Gemini LLM invocation failed: %s. Using heuristic generator.", exc)
        return None


def generate_interview_questions(
    db: Session,
    job_id: str,
    question_type: str = "Technical Skills",
    candidate_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generates role-specific interview questions based on job requirements and candidate profile.
    """
    job = db.query(JobPosting).filter(JobPosting.id == job_id).first()
    job_title = job.title if job else "Software Engineer"
    required_skills = job.required_skills if (job and job.required_skills) else ["Problem Solving", "System Architecture"]

    candidate_name = "Candidate"
    candidate_skills = []
    if candidate_id:
        cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if cand:
            candidate_name = cand.name or "Candidate"
            candidate_skills = cand.skills if isinstance(cand.skills, list) else []

    # Attempt Live LLM Generation
    prompt = f"""
You are an expert technical interviewer for a hiring team.
Target Job Title: {job_title}
Target Skills: {json.dumps(required_skills)}
Candidate Name: {candidate_name}
Candidate Background Skills: {json.dumps(candidate_skills)}
Question Category Focus: {question_type}

Generate exactly 3 structured interview questions tailored specifically to this role.
Return ONLY valid JSON matching this schema:
{{
  "job_title": "{job_title}",
  "question_type": "{question_type}",
  "questions": [
    {{
      "id": 1,
      "question": "Question text here...",
      "category": "Technical",
      "type_tag": "Scenario-based",
      "time_estimate": "3-5 min response"
    }}
  ]
}}
"""

    llm_output = _call_gemini_llm(prompt)
    if llm_output:
        try:
            clean_json = llm_output.strip()
            if clean_json.startswith("```json"):
                clean_json = clean_json[7:]
            if clean_json.startswith("```"):
                clean_json = clean_json[3:]
            if clean_json.endswith("```"):
                clean_json = clean_json[:-3]
            parsed = json.loads(clean_json.strip())
            return parsed
        except Exception:
            pass

    # Heuristic Fallback
    return {
        "job_title": job_title,
        "question_type": question_type,
        "questions": [
            {
                "id": 1,
                "question": f"Describe a project where you applied {required_skills[0] if required_skills else 'core skills'} to optimize system performance. What techniques did you use and what was the outcome?",
                "category": "Technical",
                "type_tag": "Experience-based",
                "time_estimate": "3-5 min response",
            },
            {
                "id": 2,
                "question": f"How would you approach deploying and scaling a production service for the {job_title} role under high-load conditions?",
                "category": "Technical",
                "type_tag": "Scenario-based",
                "time_estimate": "4-6 min response",
            },
            {
                "id": 3,
                "question": "Tell me about a time when you had to explain complex technical architecture to non-technical stakeholders. How did you ensure alignment?",
                "category": "Behavioral",
                "type_tag": "Communication",
                "time_estimate": "2-4 min response",
            },
        ],
    }


def simulate_interview_turn(
    db: Session,
    candidate_id: str,
    user_response: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Simulates a live conversational turn with an AI interviewer.
    """
    cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    candidate_name = cand.name if cand and cand.name else "Candidate"

    prompt = f"""
You are an interactive AI Technical Interviewer conducting a real-time interview with candidate '{candidate_name}'.
Conversation History:
{json.dumps(history or [])}

Latest response from candidate:
"{user_response}"

Evaluate the response briefly and provide the next conversational response/follow-up question.
Return ONLY valid JSON matching this schema:
{{
  "reply": "Your conversational interviewer response and follow-up question here",
  "score": 85,
  "feedback": "Concise technical critique of candidate's answer"
}}
"""

    llm_output = _call_gemini_llm(prompt)
    if llm_output:
        try:
            clean_json = llm_output.strip()
            if clean_json.startswith("```json"):
                clean_json = clean_json[7:]
            if clean_json.startswith("```"):
                clean_json = clean_json[3:]
            if clean_json.endswith("```"):
                clean_json = clean_json[:-3]
            return json.loads(clean_json.strip())
        except Exception:
            pass

    # Heuristic Fallback
    return {
        "reply": f"Thank you for sharing that, {candidate_name}. Could you describe how you monitored system reliability and handled edge cases in that implementation?",
        "score": 80,
        "feedback": "Clear explanation with good technical context. Expanding on error handling would enhance depth.",
    }