from __future__ import annotations

"""
backend/app/services/interview_service.py
==========================================
Service layer for AI Question Generation and Interactive Interview Simulation
using Google Gemini API grounded in Candidate Resume data with heuristic fallback.
"""

import os
import json
import re
import logging
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# Ensure .env is explicitly read
load_dotenv()

from app.config import get_settings
from app.models.candidate import Candidate
from app.models.job_posting import JobPosting

logger = logging.getLogger(__name__)


def _extract_json(text: str) -> Optional[dict]:
    """Robustly extracts JSON from raw LLM output even if surrounded by markdown."""
    try:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        clean_text = match.group(1).strip() if match else text.strip()
        return json.loads(clean_text)
    except Exception as err:
        logger.error("JSON parsing error: %s | Raw output: %s", err, text)
        return None


def _format_candidate_resume_profile(cand: Optional[Candidate]) -> str:
    """Builds a comprehensive resume context string from Candidate database attributes."""
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


def _call_gemini_llm(prompt: str) -> Optional[str]:
    """Helper function to invoke Google Gemini LLM using the configured API key."""
    settings = get_settings()
    api_key = (getattr(settings, "GEMINI_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")).strip()

    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        logger.info("No active GEMINI_API_KEY found in environment. Triggering heuristic fallback.")
        return None

    try:
        # Modern google.genai Client
        from google import genai
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
        )
        return response.text
    except Exception as exc:
        # Fallback to legacy SDK if google.genai is missing
        try:
            import google.generativeai as legacy_genai
            legacy_genai.configure(api_key=api_key)
            model = legacy_genai.GenerativeModel("gemini-flash-latest")
            res = model.generate_content(prompt)
            return res.text
        except Exception as legacy_exc:
            logger.warning("Gemini Live API call failed: %s | Legacy fallback failed: %s", exc, legacy_exc)
            return None


def generate_interview_questions(
    db: Session,
    job_id: str,
    question_type: str = "Technical Skills",
    candidate_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generates role-specific interview questions grounded in candidate resume details.
    """
    job = db.query(JobPosting).filter(JobPosting.id == job_id).first()
    job_title = job.title if job else "Software Engineer"
    required_skills = job.required_skills if (job and job.required_skills) else ["Problem Solving", "System Architecture"]

    cand = None
    if candidate_id:
        cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()

    resume_dossier = _format_candidate_resume_profile(cand)

    prompt = f"""
You are an expert technical interviewer hiring for the position: "{job_title}".
Job Description/Requirements: {job.description or 'Standard requirements'}
Job Required Skills: {json.dumps(required_skills)}
Question Category Focus: "{question_type}"

--- CANDIDATE RESUME DOSSIER ---
{resume_dossier}
--------------------------------

Generate exactly 3 structured interview questions.
CRITICAL INSTRUCTION: Personalize and ground the questions directly in the candidate's listed projects, past work experience, and claimed skills from their resume dossier, evaluating their readiness for the "{job_title}" role.

Return ONLY valid JSON matching this schema:
{{
  "job_title": "{job_title}",
  "question_type": "{question_type}",
  "questions": [
    {{
      "id": 1,
      "question": "Question referencing specific resume project, tool, or achievement...",
      "category": "{question_type}",
      "type_tag": "Resume Deep Dive",
      "time_estimate": "3-5 min response"
    }},
    {{
      "id": 2,
      "question": "Scenario-based technical question challenging their implementation choices...",
      "category": "{question_type}",
      "type_tag": "Technical Scenario",
      "time_estimate": "4-6 min response"
    }},
    {{
      "id": 3,
      "question": "Question evaluating architecture, trade-offs, or teamwork in their past roles...",
      "category": "{question_type}",
      "type_tag": "Experience & Architecture",
      "time_estimate": "3-5 min response"
    }}
  ]
}}
"""

    llm_output = _call_gemini_llm(prompt)
    if llm_output:
        parsed = _extract_json(llm_output)
        if parsed and "questions" in parsed and len(parsed["questions"]) > 0:
            return {
                "success": True,
                "job_title": job_title,
                "question_type": question_type,
                "questions": parsed["questions"],
                "source": "Gemini AI (Resume Grounded)",
            }

    # Context-aware heuristic fallback
    primary_skill = required_skills[0] if required_skills else "core development"
    return {
        "success": True,
        "job_title": job_title,
        "question_type": question_type,
        "source": "Copilot Heuristic Engine",
        "questions": [
            {
                "id": 1,
                "question": f"In your resume, you highlighted experience with {primary_skill}. Could you walk me through your architecture and key technical challenges in that project?",
                "category": question_type,
                "type_tag": "Resume Deep Dive",
                "time_estimate": "3-5 min response",
            },
            {
                "id": 2,
                "question": f"How would you approach deploying and scaling a production service for the {job_title} role under high-load conditions?",
                "category": question_type,
                "type_tag": "Scenario-based",
                "time_estimate": "4-6 min response",
            },
            {
                "id": 3,
                "question": "Tell me about a time when you had to explain complex technical architecture to non-technical stakeholders. How did you ensure alignment?",
                "category": question_type,
                "type_tag": "Communication & Collaboration",
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
    Simulates a live conversational turn with an AI interviewer, evaluating against candidate resume context.
    """
    cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    candidate_name = cand.name if cand and cand.name else "Candidate"
    resume_dossier = _format_candidate_resume_profile(cand)

    history_str = "\n".join([f"Interviewer: {t.get('ai')}\nCandidate: {t.get('user')}" for t in (history or [])])

    prompt = f"""
You are an interactive AI Technical Interviewer conducting a real-time interview with candidate '{candidate_name}'.

--- CANDIDATE RESUME DOSSIER ---
{resume_dossier}
--------------------------------

Conversation History:
{history_str if history_str else 'Start of interview.'}

Latest response from candidate:
"{user_response}"

Instructions:
1. Ground your evaluation in the candidate's actual resume (verify if their answers align with their claimed projects, tools, and background).
2. Formulate a natural, professional reply (2-3 sentences max).
3. Ask a direct follow-up question digging deeper into their technical implementation, testing, performance metrics, or specific project choices from their resume.

Return ONLY valid JSON matching this schema:
{{
  "reply": "Your conversational interviewer response and follow-up question here",
  "score": 85,
  "feedback": "Concise technical critique of candidate's answer"
}}
"""

    llm_output = _call_gemini_llm(prompt)
    if llm_output:
        parsed = _extract_json(llm_output)
        if parsed and "reply" in parsed:
            return {
                "success": True,
                "candidate_name": candidate_name,
                "ai_response": parsed["reply"],
                "score": parsed.get("score", 85),
                "feedback": parsed.get("feedback", "Good technical context provided."),
            }

    skills = cand.skills if (cand and cand.skills) else ["software engineering"]
    primary = skills[0] if isinstance(skills, list) and skills else "development"
    return {
        "success": True,
        "candidate_name": candidate_name,
        "ai_response": f"Thank you for that context, {candidate_name}. Looking at your experience with {primary}, how did you measure performance benchmarks and ensure system reliability in that project?",
        "score": 80,
        "feedback": "Clear response. Expanding on error recovery and metrics will provide more technical depth.",
    }