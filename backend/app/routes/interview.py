from __future__ import annotations

"""
backend/app/routes/interview.py
================================
Router for AI Interview Question Generation, Interactive Simulation,
and ATS Workflows.

Supports Gemini AI integration with automatic local fallback
when no key is set.
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


# ============================================================
# Google GenAI SDK
# ============================================================

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


# ============================================================
# Request Models
# ============================================================

class QuestionRequest(BaseModel):
    job_id: str
    candidate_id: Optional[str] = None
    question_type: str = "Technical Skills"


class SimulationMessage(BaseModel):
    candidate_id: str
    user_response: str
    current_question: Optional[str] = None
    question_number: int = 1
    total_questions: int = 5
    history: List[Dict[str, Any]] = []


class StatusUpdate(BaseModel):
    status: str


# ============================================================
# Gemini Helper
# ============================================================

def call_gemini_or_fallback(prompt: str) -> Optional[str]:
    """
    Invokes Gemini if a valid API key exists.
    Otherwise returns None so that the local fallback engine is used.
    """

    settings = get_settings()

    api_key = (
        settings.GEMINI_API_KEY.strip()
        if settings.GEMINI_API_KEY
        else ""
    )

    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        return None

    try:

        # New Google GenAI SDK
        if USE_NEW_SDK is True:

            client = genai.Client(api_key=api_key)

            response = client.models.generate_content(
                model="gemini-1.5-flash",
                contents=prompt,
            )

            return (
                response.text.strip()
                if response and response.text
                else None
            )

        # Legacy Google Generative AI SDK
        elif USE_NEW_SDK is False:

            genai_legacy.configure(api_key=api_key)

            model = genai_legacy.GenerativeModel(
                "gemini-1.5-flash"
            )

            response = model.generate_content(prompt)

            return (
                response.text.strip()
                if response and response.text
                else None
            )

    except Exception as e:

        logger.warning(
            "Gemini API call encountered an error: %s. "
            "Using fallback engine.",
            e,
        )

        return None

    return None


# ============================================================
# Generate Interview Questions
# ============================================================

@router.post("/interview/generate-questions")
def generate_interview_questions(
    req: QuestionRequest,
    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # Find job
    # --------------------------------------------------------

    job = (
        db.query(JobPosting)
        .filter(JobPosting.id == req.job_id)
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job posting not found",
        )

    # --------------------------------------------------------
    # Candidate information
    # --------------------------------------------------------

    candidate_info = ""
    candidate_skills = []

    if req.candidate_id:

        cand = (
            db.query(Candidate)
            .filter(Candidate.id == req.candidate_id)
            .first()
        )

        if cand:

            candidate_skills = cand.skills or []

            candidate_info = (
                f"Candidate Name: {cand.name}\n"
                f"Extracted Skills: {candidate_skills}"
            )

    # --------------------------------------------------------
    # Required skills
    # --------------------------------------------------------

    req_skills = [
        s.get("name") if isinstance(s, dict) else str(s)
        for s in (job.required_skills or [])
    ]

    primary_skill = (
        req_skills[0]
        if req_skills
        else "Software Engineering"
    )

    secondary_skill = (
        req_skills[1]
        if len(req_skills) > 1
        else "System Architecture"
    )

    # --------------------------------------------------------
    # Gemini prompt
    # --------------------------------------------------------

    prompt = f"""
You are an expert AI technical interviewer for the role '{job.title}'.

Required Skills:
{', '.join(req_skills)}

{candidate_info}

Generate exactly 3 structured interview questions
for category '{req.question_type}'.

Return strictly a valid JSON array matching this exact format:

[
  {{
    "id": 1,
    "question": "Question text here",
    "type": "Technical - Scenario-based",
    "estimated_time": "3-5 min response"
  }},
  {{
    "id": 2,
    "question": "Question text here",
    "type": "Technical - Deep Dive",
    "estimated_time": "4-6 min response"
  }},
  {{
    "id": 3,
    "question": "Question text here",
    "type": "Behavioral - Communication",
    "estimated_time": "2-4 min response"
  }}
]
"""

    # --------------------------------------------------------
    # Try Gemini
    # --------------------------------------------------------

    ai_raw = call_gemini_or_fallback(prompt)

    if ai_raw:

        try:

            cleaned = (
                ai_raw
                .replace("```json", "")
                .replace("```", "")
                .strip()
            )

            questions = json.loads(cleaned)

            return {
                "success": True,
                "job_title": job.title,
                "questions": questions,
                "source": "Gemini AI",
            }

        except Exception:
            pass

    # ========================================================
    # Intelligent Fallback
    # ========================================================

    if (
        "Technical" in req.question_type
        or req.question_type == "Technical Skills"
    ):

        questions = [

            {
                "id": 1,
                "question": (
                    f"Describe a project where you applied "
                    f"{primary_skill} to optimize system performance. "
                    f"What techniques did you use and what was the outcome?"
                ),
                "type": "Technical • Experience-based",
                "estimated_time": "3-5 min response",
            },

            {
                "id": 2,
                "question": (
                    f"How would you approach deploying a service "
                    f"for the {job.title} position in a production "
                    f"environment with {secondary_skill}? "
                    f"What considerations would you take into account?"
                ),
                "type": "Technical • Scenario-based",
                "estimated_time": "4-6 min response",
            },

            {
                "id": 3,
                "question": (
                    "Tell me about a time when you had to explain "
                    "complex technical concepts to non-technical "
                    "stakeholders. How did you ensure they understood?"
                ),
                "type": "Behavioral • Communication",
                "estimated_time": "2-4 min response",
            },
        ]

    else:

        questions = [

            {
                "id": 1,
                "question": (
                    f"Describe a challenging bug or deployment failure "
                    f"you encountered while using {primary_skill}. "
                    f"How did you resolve it under pressure?"
                ),
                "type": "Behavioral • Problem Solving",
                "estimated_time": "4-5 min response",
            },

            {
                "id": 2,
                "question": (
                    "How do you evaluate engineering trade-offs "
                    "between rapid feature delivery and long-term "
                    "codebase maintainability?"
                ),
                "type": "Behavioral • Decision Making",
                "estimated_time": "3-5 min response",
            },

            {
                "id": 3,
                "question": (
                    "Tell me about a time you received critical "
                    "feedback on your code or design during a review. "
                    "How did you handle it?"
                ),
                "type": "Behavioral • Collaboration",
                "estimated_time": "2-3 min response",
            },
        ]

    return {
        "success": True,
        "job_title": job.title,
        "questions": questions,
        "source": "Copilot Engine",
    }


# ============================================================
# AI Interview Simulation
# ============================================================

@router.post("/interview/simulate")
def simulate_interview_turn(
    msg: SimulationMessage,
    db: Session = Depends(get_db),
):
    """
    AI Interview Simulation.

    Rules:
    - Reject greetings / acknowledgements.
    - Evaluate meaningful answers using Gemini.
    - Repeat the current question only when the answer is invalid.
    - Move to a NEW question when the answer is valid.
    - Return an answer score for each valid answer.
    - Return a final score after the last question.
    """

    # --------------------------------------------------------
    # Find candidate
    # --------------------------------------------------------

    cand = (
        db.query(Candidate)
        .filter(Candidate.id == msg.candidate_id)
        .first()
    )

    if not cand:

        raise HTTPException(
            status_code=404,
            detail="Candidate not found",
        )

    cand_name = cand.name or "Candidate"

    user_text = msg.user_response.strip()
    normalized_text = user_text.lower()

    current_question = (
        msg.current_question
        or "Could you briefly introduce your technical background?"
    )

    # --------------------------------------------------------
    # Invalid answers
    # --------------------------------------------------------

    invalid_answers = {
        "hi",
        "hello",
        "hey",
        "ok",
        "okay",
        "yes",
        "yeah",
        "yep",
        "no",
        "nope",
        "sure",
        "fine",
        "good",
        "thanks",
        "thank you",
        "hmm",
        "hmmm",
    }

    # --------------------------------------------------------
    # Empty answer
    # --------------------------------------------------------

    if not normalized_text:

        return {
            "success": True,
            "candidate_name": cand_name,
            "ai_response": (
                f"Please provide an answer, {cand_name}. "
                f"Could you answer: '{current_question}'?"
            ),
            "current_question": current_question,
            "next_question": current_question,
            "question_number": msg.question_number,
            "total_questions": msg.total_questions,
            "is_valid": False,
            "needs_retry": True,
            "answer_score": 0,
            "feedback": "No answer was provided.",
        }

    # --------------------------------------------------------
    # Simple acknowledgement
    # --------------------------------------------------------

    if normalized_text in invalid_answers:

        return {
            "success": True,
            "candidate_name": cand_name,
            "ai_response": (
                f"Please provide a complete answer, {cand_name}. "
                f"Could you answer the question: "
                f"'{current_question}'?"
            ),
            "current_question": current_question,
            "next_question": current_question,
            "question_number": msg.question_number,
            "total_questions": msg.total_questions,
            "is_valid": False,
            "needs_retry": True,
            "answer_score": 0,
            "feedback": (
                "The response was only an acknowledgement."
            ),
        }

    # --------------------------------------------------------
    # Very short answer
    # --------------------------------------------------------

    if len(normalized_text.split()) < 3:

        return {
            "success": True,
            "candidate_name": cand_name,
            "ai_response": (
                f"Please provide a little more detail, {cand_name}. "
                f"Your current question is: '{current_question}'"
            ),
            "current_question": current_question,
            "next_question": current_question,
            "question_number": msg.question_number,
            "total_questions": msg.total_questions,
            "is_valid": False,
            "needs_retry": True,
            "answer_score": 0,
            "feedback": (
                "The answer was too short to evaluate."
            ),
        }

    # ========================================================
    # Conversation history
    # ========================================================

    history_str = "\n".join(
        [
            f"Interviewer: {t.get('ai', '')}\n"
            f"Candidate: {t.get('user', '')}"
            for t in msg.history
        ]
    )

    # ========================================================
    # Gemini evaluation prompt
    # ========================================================

    prompt = f"""
You are an expert AI Technical Interviewer.

Candidate:
{cand_name}

Candidate Skills:
{cand.skills}

Question Number:
{msg.question_number} of {msg.total_questions}

CURRENT INTERVIEW QUESTION:
{current_question}

CONVERSATION HISTORY:
{history_str}

LATEST CANDIDATE ANSWER:
{msg.user_response}

Your job is to evaluate the candidate's LATEST ANSWER
against the CURRENT INTERVIEW QUESTION.

IMPORTANT INTERVIEW RULES:

1. First determine whether the candidate actually answered
   the CURRENT INTERVIEW QUESTION.

2. A response such as:
   "hi", "hello", "ok", "okay", "yes", "sure"
   is NOT a valid answer.

3. A meaningful technical answer should be considered VALID
   even if it is not perfect.

4. If the answer is VALID:
   - is_valid = true
   - needs_retry = false
   - give a score from 0 to 100
   - briefly acknowledge the answer
   - generate ONE COMPLETELY NEW interview question
   - the new question MUST NOT repeat the current question
   - the new question should explore a DIFFERENT technical area
   - do NOT ask "Could you provide more technical detail?"
   - do NOT ask the same question again

5. If the answer is INVALID:
   - is_valid = false
   - needs_retry = true
   - answer_score = 0
   - ask the SAME current question again
   - do not generate a new question

6. Evaluate valid answers using:
   - Relevance
   - Technical correctness
   - Completeness
   - Clarity
   - Practical understanding

7. The next question should preferably explore another area such as:
   - architecture
   - database
   - API design
   - authentication
   - error handling
   - scalability
   - testing
   - deployment
   - performance
   - security
   - project decisions

8. NEVER repeat a question that already appears
   in the conversation history.

Return ONLY valid JSON in exactly this format:

{{
    "ai_response": "Short acknowledgement of the answer.",
    "answer_score": 85,
    "feedback": "Short technical evaluation.",
    "is_valid": true,
    "needs_retry": false,
    "next_question": "A completely new interview question."
}}

For an invalid answer:

{{
    "ai_response": "Please provide a complete answer to the current question.",
    "answer_score": 0,
    "feedback": "The answer was not sufficient.",
    "is_valid": false,
    "needs_retry": true,
    "next_question": "{current_question}"
}}
"""

    # ========================================================
    # Call Gemini
    # ========================================================

    ai_raw = call_gemini_or_fallback(prompt)

    if ai_raw:

        try:

            cleaned = (
                ai_raw
                .replace("```json", "")
                .replace("```", "")
                .strip()
            )

            result = json.loads(cleaned)

            # ------------------------------------------------
            # Score
            # ------------------------------------------------

            score = result.get(
                "answer_score",
                0,
            )

            try:
                score = float(score)

            except (ValueError, TypeError):
                score = 0

            score = max(
                0,
                min(100, score),
            )

            # ------------------------------------------------
            # Validity
            # ------------------------------------------------

            is_valid = bool(
                result.get(
                    "is_valid",
                    False,
                )
            )

            if not is_valid:
                score = 0

            # ------------------------------------------------
            # Next question
            # ------------------------------------------------

            next_question = result.get(
                "next_question",
                current_question,
            )

            if not isinstance(next_question, str):
                next_question = current_question

            next_question = next_question.strip()

            # =================================================
            # Prevent repeated question
            # =================================================

            if is_valid:

                fallback_questions = [
                    "How did you design the database structure for your project, and why did you choose that approach?",
                    "How did you design and connect the REST APIs between your frontend and FastAPI backend?",
                    "How did you handle errors and invalid input in your application?",
                    "How would you improve the scalability and performance of your recruitment system?",
                    "How did you test the different components of your application?",
                ]

                used_questions = {
                    str(item.get("question", ""))
                    .strip()
                    .lower()
                    for item in msg.history
                    if item.get("question")
                }

                used_questions.add(
                    current_question
                    .strip()
                    .lower()
                )

                # --------------------------------------------
                # If Gemini generated an invalid/repeated
                # question, select a safe fallback question.
                # --------------------------------------------

                if (
                    not next_question
                    or next_question.lower()
                    == current_question.lower()
                    or next_question.lower()
                    in used_questions
                ):

                    next_question = None

                    for question in fallback_questions:

                        if (
                            question.strip().lower()
                            not in used_questions
                        ):

                            next_question = question
                            break

                    # If every fallback question was used,
                    # create one more safe question.
                    if not next_question:

                        next_question = (
                            "How did you implement "
                            "authentication and security "
                            "in your project?"
                        )

            else:

                # Invalid answer:
                # repeat the SAME question.
                next_question = current_question

            # =================================================
            # AI Response
            # =================================================

            if is_valid:

                ai_response = result.get(
                    "ai_response",
                    "Thank you for your answer.",
                )

                ai_response = (
                    f"{ai_response} "
                    f"Let's move to the next question: "
                    f"{next_question}"
                )

            else:

                ai_response = result.get(
                    "ai_response",
                    (
                        "Please answer the current question: "
                        f"{current_question}"
                    ),
                )

            # =================================================
            # Final response
            # =================================================

            return {
                "success": True,
                "candidate_name": cand_name,
                "ai_response": ai_response,
                "current_question": current_question,
                "next_question": next_question,
                "question_number": msg.question_number,
                "total_questions": msg.total_questions,
                "is_valid": is_valid,
                "needs_retry": not is_valid,
                "answer_score": round(score, 2),
                "feedback": result.get(
                    "feedback",
                    "",
                ),
            }

        except Exception as e:

            logger.warning(
                "Failed to parse Gemini interview response: %s",
                e,
            )

    # ========================================================
    # Gemini unavailable fallback
    # ========================================================

    fallback_questions = [
        "How did you design the database structure for your project, and why did you choose that approach?",
        "How did you design and connect the REST APIs between your frontend and FastAPI backend?",
        "How did you handle errors and invalid input in your application?",
        "How would you improve the scalability and performance of your recruitment system?",
        "How did you test the different components of your application?",
    ]

    # --------------------------------------------------------
    # Find unused fallback question
    # --------------------------------------------------------

    used_questions = {
        str(item.get("question", ""))
        .strip()
        .lower()
        for item in msg.history
        if item.get("question")
    }

    used_questions.add(
        current_question
        .strip()
        .lower()
    )

    next_question = None

    for question in fallback_questions:

        if question.strip().lower() not in used_questions:

            next_question = question
            break

    # --------------------------------------------------------
    # If all fallback questions are used
    # --------------------------------------------------------

    if not next_question:

        next_question = (
            "How did you implement authentication "
            "and security in your project?"
        )

    # --------------------------------------------------------
    # Gemini unavailable response
    # --------------------------------------------------------

    return {
        "success": True,
        "candidate_name": cand_name,
        "ai_response": (
            f"Thank you for your answer, {cand_name}. "
            f"Let's move to the next question: "
            f"{next_question}"
        ),
        "current_question": current_question,
        "next_question": next_question,
        "question_number": msg.question_number,
        "total_questions": msg.total_questions,
        "is_valid": True,
        "needs_retry": False,
        "answer_score": 0,
        "feedback": (
            "Gemini evaluation was unavailable. "
            "The answer was accepted but not scored."
        ),
    }


# ============================================================
# Update Candidate Status
# ============================================================

@router.patch("/candidates/{candidate_id}/status")
def update_candidate_status(
    candidate_id: str,
    body: StatusUpdate,
    db: Session = Depends(get_db),
):

    cand = (
        db.query(Candidate)
        .filter(Candidate.id == candidate_id)
        .first()
    )

    if not cand:

        raise HTTPException(
            status_code=404,
            detail="Candidate not found",
        )

    cand.status = body.status

    db.commit()
    db.refresh(cand)

    return {
        "success": True,
        "candidate_id": cand.id,
        "new_status": cand.status,
    }