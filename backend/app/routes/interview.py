from __future__ import annotations

"""
backend/app/routes/interview.py

Voice Screening & AI Technical Simulation:
- Job position can be selected
- Exactly 5 technical/career questions
- Questions are dynamically generated with Gemini using parsed candidate skills & profile
- Candidate answers are evaluated via Gemini
- Each answer gets a score and adaptive follow-up
- Next Question skips the current question
- Stop Interview completely stops the interview
- Score is calculated from completed answers
- Final score is calculated after 5 questions
- Final feedback is provided based on interview performance
"""

import os
import json
import logging
import random
from typing import List, Dict, Optional, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import get_settings
from app.models.candidate import Candidate


logger = logging.getLogger(__name__)

router = APIRouter(tags=["Interview Assistant & ATS"])


# ============================================================
# Google Gemini SDK
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


# ============================================================
# Request Models
# ============================================================

class QuestionRequest(BaseModel):
    job_id: Optional[str] = None
    candidate_id: Optional[str] = None
    question_type: str = "Technical Career"
    job_position: Optional[str] = None
    candidate_skills: Optional[List[str]] = None


class SimulationMessage(BaseModel):
    candidate_id: str
    user_response: str
    current_question: Optional[str] = None
    question_number: int = 1
    total_questions: int = 5
    target_role: Optional[str] = None
    candidate_skills: Optional[List[str]] = None
    history: List[Dict[str, Any]] = Field(default_factory=list)


class StopInterviewRequest(BaseModel):
    candidate_id: str
    question_number: int = 1
    total_questions: int = 5
    scores: List[float] = Field(default_factory=list)


class FinalResultRequest(BaseModel):
    candidate_id: str
    final_score: float = 0


class StatusUpdate(BaseModel):
    status: str


# ============================================================
# Generic Technical / Career Questions (Fallback)
# ============================================================

TECHNICAL_CAREER_QUESTIONS = [
    {
        "id": 1,
        "question": (
            "Can you explain one of your technical projects in detail, "
            "including the technologies you used, your role, and the "
            "main technical challenge you solved?"
        ),
        "type": "Technical - Project Experience",
        "estimated_time": "3-5 min response",
    },
    {
        "id": 2,
        "question": (
            "How did you design the database structure for your project, "
            "and why did you choose that particular database and design approach?"
        ),
        "type": "Technical - Database",
        "estimated_time": "3-5 min response",
    },
    {
        "id": 3,
        "question": (
            "How did you design and connect the REST APIs between your "
            "frontend and backend? Explain how data was sent, received, "
            "validated, and handled when an error occurred."
        ),
        "type": "Technical - API Development",
        "estimated_time": "3-5 min response",
    },
    {
        "id": 4,
        "question": (
            "How would you improve the scalability and performance of a "
            "real-world application? Explain the technical approaches "
            "you would use and why."
        ),
        "type": "Technical - Performance",
        "estimated_time": "3-5 min response",
    },
    {
        "id": 5,
        "question": (
            "What are your strongest technical skills, and how do you "
            "plan to improve your technical knowledge and career skills "
            "over the next few years?"
        ),
        "type": "Technical - Career",
        "estimated_time": "3-5 min response",
    },
]


# ============================================================
# POSITION-SPECIFIC QUESTION BANK (Fallback only if Gemini fails)
# ============================================================

POSITION_QUESTION_BANK = {
    "python developer": [
        {
            "id": 1,
            "question": (
                "How does object-oriented programming work in Python, "
                "and how have you applied classes, inheritance, or "
                "polymorphism in a Python project?"
            ),
            "type": "Python - OOP",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 2,
            "question": (
                "How do you handle exceptions in Python applications, "
                "and how would you design reliable error handling for "
                "a production Python service?"
            ),
            "type": "Python - Exception Handling",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 3,
            "question": (
                "If you were developing a REST API using FastAPI or Django, "
                "how would you validate incoming data, structure the API, "
                "and handle authentication and errors?"
            ),
            "type": "Python - REST API",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 4,
            "question": (
                "How would you improve the performance of a Python application "
                "that becomes slow when processing a large amount of data?"
            ),
            "type": "Python - Performance",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 5,
            "question": (
                "Describe a Python project you have worked on and explain "
                "the most difficult Python-specific problem you solved."
            ),
            "type": "Python - Project",
            "estimated_time": "3-5 min response",
        },
    ],
    "java developer": [
        {
            "id": 1,
            "question": (
                "Explain the main principles of object-oriented programming "
                "in Java and describe how you have applied them in a Java project."
            ),
            "type": "Java - OOP",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 2,
            "question": (
                "How do Java Collections such as List, Set, and Map differ, "
                "and how would you choose the appropriate collection for "
                "a real-world application?"
            ),
            "type": "Java - Collections",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 3,
            "question": (
                "How does exception handling work in Java, and when would "
                "you use checked exceptions versus unchecked exceptions?"
            ),
            "type": "Java - Exception Handling",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 4,
            "question": (
                "How would you design a REST API using Spring Boot, including "
                "request validation, service layers, database access, and "
                "error handling?"
            ),
            "type": "Java - Spring Boot",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 5,
            "question": (
                "Explain a Java project you have worked on and describe "
                "the most challenging technical problem you solved in it."
            ),
            "type": "Java - Project",
            "estimated_time": "3-5 min response",
        },
    ],
    "frontend developer": [
        {
            "id": 1,
            "question": (
                "How do HTML semantic elements improve the structure and "
                "accessibility of a frontend application?"
            ),
            "type": "Frontend - HTML",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 2,
            "question": (
                "How does CSS responsive design work, and how would you "
                "create a web page that works correctly on mobile, tablet, "
                "and desktop screens?"
            ),
            "type": "Frontend - CSS",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 3,
            "question": (
                "Explain how JavaScript handles asynchronous operations, "
                "and how you would use promises or async/await when "
                "calling a REST API from a frontend application."
            ),
            "type": "Frontend - JavaScript",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 4,
            "question": (
                "How would you improve the performance of a frontend application "
                "that has slow page loading and unnecessary API requests?"
            ),
            "type": "Frontend - Performance",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 5,
            "question": (
                "Describe a frontend project you have developed and explain "
                "how you handled API integration, user interaction, and "
                "frontend validation."
            ),
            "type": "Frontend - Project",
            "estimated_time": "3-5 min response",
        },
    ],
    "react developer": [
        {
            "id": 1,
            "question": (
                "Explain React components and props, and describe how "
                "you would divide a large React application into reusable components."
            ),
            "type": "React - Components",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 2,
            "question": (
                "What is React state, and how would you use hooks such as "
                "useState and useEffect in a real-world application?"
            ),
            "type": "React - Hooks",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 3,
            "question": (
                "How would you fetch data from a REST API in React and "
                "handle loading states, errors, and successful responses?"
            ),
            "type": "React - API Integration",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 4,
            "question": (
                "How would you optimize a React application when unnecessary "
                "component re-renders are causing performance problems?"
            ),
            "type": "React - Performance",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 5,
            "question": (
                "Describe a React project you have developed and explain "
                "the most challenging feature you implemented."
            ),
            "type": "React - Project",
            "estimated_time": "3-5 min response",
        },
    ],
    "backend developer": [
        {
            "id": 1,
            "question": (
                "How would you design a RESTful backend API for a real-world "
                "application, including routes, request validation, and responses?"
            ),
            "type": "Backend - REST API",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 2,
            "question": (
                "How would you design the database layer for a backend "
                "application and decide between relational and non-relational databases?"
            ),
            "type": "Backend - Database",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 3,
            "question": (
                "How would you implement authentication and authorization "
                "in a backend API and protect sensitive endpoints?"
            ),
            "type": "Backend - Security",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 4,
            "question": (
                "How would you improve the scalability and performance of "
                "a backend service handling a large number of requests?"
            ),
            "type": "Backend - Scalability",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 5,
            "question": (
                "Describe a backend project you have developed and explain "
                "the most difficult server-side problem you solved."
            ),
            "type": "Backend - Project",
            "estimated_time": "3-5 min response",
        },
    ],
    "data scientist": [
        {
            "id": 1,
            "question": (
                "How would you clean and preprocess a real-world dataset "
                "before using it to train a machine learning model?"
            ),
            "type": "Data Science - Preprocessing",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 2,
            "question": (
                "Explain the difference between supervised and unsupervised "
                "learning and give practical examples of when you would use each."
            ),
            "type": "Data Science - Machine Learning",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 3,
            "question": (
                "How would you detect and handle overfitting in a machine "
                "learning model?"
            ),
            "type": "Data Science - Model Evaluation",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 4,
            "question": (
                "How would you select useful features for a machine learning "
                "model and determine whether a feature is contributing useful information?"
            ),
            "type": "Data Science - Feature Engineering",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 5,
            "question": (
                "Describe a machine learning or data science project you have "
                "worked on and explain how you evaluated the final model."
            ),
            "type": "Data Science - Project",
            "estimated_time": "3-5 min response",
        },
    ],
    "devops engineer": [
        {
            "id": 1,
            "question": (
                "Explain how a CI/CD pipeline works and describe the stages "
                "you would include for automatically testing and deploying an application."
            ),
            "type": "DevOps - CI/CD",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 2,
            "question": (
                "How does Docker help with application deployment, and what "
                "would you include in a Dockerfile for a production application?"
            ),
            "type": "DevOps - Docker",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 3,
            "question": (
                "What problem does Kubernetes solve, and how would you use "
                "deployments, services, and scaling in a Kubernetes environment?"
            ),
            "type": "DevOps - Kubernetes",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 4,
            "question": (
                "How would you monitor a production application and detect "
                "performance or availability problems before they affect users?"
            ),
            "type": "DevOps - Monitoring",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 5,
            "question": (
                "Describe a DevOps or deployment project you have worked on "
                "and explain a difficult infrastructure problem you solved."
            ),
            "type": "DevOps - Project",
            "estimated_time": "3-5 min response",
        },
    ],
    "sql developer": [
        {
            "id": 1,
            "question": (
                "Explain the difference between INNER JOIN, LEFT JOIN, and "
                "RIGHT JOIN and describe when you would use each in SQL."
            ),
            "type": "SQL - Joins",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 2,
            "question": (
                "How do database indexes improve query performance, and "
                "what are the disadvantages of creating too many indexes?"
            ),
            "type": "SQL - Indexes",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 3,
            "question": (
                "Explain database normalization and describe how you would "
                "design tables to reduce unnecessary data duplication."
            ),
            "type": "SQL - Normalization",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 4,
            "question": (
                "How would you troubleshoot and optimize a SQL query that "
                "takes several seconds to execute on a large database?"
            ),
            "type": "SQL - Query Optimization",
            "estimated_time": "3-5 min response",
        },
        {
            "id": 5,
            "question": (
                "Describe a database project you have worked on and explain "
                "a difficult SQL or database design problem you solved."
            ),
            "type": "SQL - Project",
            "estimated_time": "3-5 min response",
        },
    ],
}


# ============================================================
# Helper Functions & Parsers
# ============================================================

def normalize_job_position(job_position: str) -> str:
    return " ".join(job_position.strip().lower().split())


def extract_skills_list(candidate_skills_raw: Any) -> List[str]:
    if not candidate_skills_raw:
        return []
    if isinstance(candidate_skills_raw, list):
        skills = []
        for item in candidate_skills_raw:
            if isinstance(item, dict):
                skills.append(item.get("name") or item.get("skill") or "")
            else:
                skills.append(str(item))
        return [s.strip() for s in skills if s.strip()]
    if isinstance(candidate_skills_raw, str):
        try:
            parsed = json.loads(candidate_skills_raw)
            return extract_skills_list(parsed)
        except Exception:
            return [s.strip() for s in candidate_skills_raw.split(",") if s.strip()]
    return []


def get_position_question_bank(job_position: str) -> Optional[List[Dict[str, Any]]]:
    position = normalize_job_position(job_position)

    if position in POSITION_QUESTION_BANK:
        return POSITION_QUESTION_BANK[position]

    aliases = {
        "python": "python developer",
        "python programmer": "python developer",
        "python development": "python developer",
        "java": "java developer",
        "java programmer": "java developer",
        "java development": "java developer",
        "frontend": "frontend developer",
        "front end developer": "frontend developer",
        "front-end developer": "frontend developer",
        "react": "react developer",
        "react.js developer": "react developer",
        "backend": "backend developer",
        "back end developer": "backend developer",
        "back-end developer": "backend developer",
        "data scientist": "data scientist",
        "data science": "data scientist",
        "devops": "devops engineer",
        "dev ops engineer": "devops engineer",
        "sql": "sql developer",
        "sql programmer": "sql developer",
    }

    if position in aliases:
        return POSITION_QUESTION_BANK.get(aliases[position])

    if "python" in position:
        return POSITION_QUESTION_BANK["python developer"]
    if "java" in position:
        return POSITION_QUESTION_BANK["java developer"]
    if "react" in position:
        return POSITION_QUESTION_BANK["react developer"]
    if "frontend" in position or "front end" in position or "front-end" in position:
        return POSITION_QUESTION_BANK["frontend developer"]
    if "backend" in position or "back end" in position or "back-end" in position:
        return POSITION_QUESTION_BANK["backend developer"]
    if "data scientist" in position or "data science" in position:
        return POSITION_QUESTION_BANK["data scientist"]
    if "devops" in position:
        return POSITION_QUESTION_BANK["devops engineer"]
    if "sql" in position:
        return POSITION_QUESTION_BANK["sql developer"]

    return None


def call_gemini_or_fallback(prompt: str) -> Optional[str]:
    settings = get_settings()
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""

    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        return None

    try:
        if USE_NEW_SDK is True:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-1.5-flash",
                contents=prompt,
            )
            return response.text.strip() if response and response.text else None

        elif USE_NEW_SDK is False:
            genai_legacy.configure(api_key=api_key)
            model = genai_legacy.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            return response.text.strip() if response and response.text else None

    except Exception as e:
        logger.warning("Gemini API error: %s. Using fallback.", e)
        return None

    return None


def clean_json_response(raw_text: str) -> str:
    cleaned = raw_text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```JSON"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def normalize_question(question: str) -> str:
    return " ".join(question.strip().lower().split())


def questions_are_unique(questions: List[Dict[str, Any]]) -> bool:
    seen = set()
    for item in questions:
        question = normalize_question(str(item.get("question", "")))
        if not question or question in seen:
            return False
        seen.add(question)
    return True


# ============================================================
# Generate Questions via Gemini (Profile & Skills Driven)
# ============================================================

@router.post("/interview/generate-questions")
def generate_interview_questions(
    req: QuestionRequest,
    db: Session = Depends(get_db),
):
    candidate = None
    if req.candidate_id:
        candidate = db.query(Candidate).filter(Candidate.id == req.candidate_id).first()
        if candidate:
            candidate.voice_screening_status = "NOT COMPLETED"
            db.commit()
            db.refresh(candidate)

    candidate_name = candidate.name if candidate and candidate.name else "Candidate"
    parsed_skills = extract_skills_list(candidate.skills if candidate else None)
    if not parsed_skills and req.candidate_skills:
        parsed_skills = req.candidate_skills

    job_position = req.job_position.strip() if req.job_position else "General Technical Role"
    skills_context = ", ".join(parsed_skills) if parsed_skills else "Full Stack Development, APIs, Databases"
    experience_context = getattr(candidate, "experience", None) or getattr(candidate, "summary", None) or "Software Professional"
    session_seed = random.randint(1000, 99999)

    # 1. Primary Generation: Contextual Gemini Prompt
    prompt = f"""
You are an expert technical interviewer and systems architect.

Candidate Profile:
- Candidate Name: {candidate_name}
- Candidate Parsed Resume Skills: {skills_context}
- Professional Context: {experience_context}
- Selected Job Position: {job_position}
- Randomization Session Seed: {session_seed}

IMPORTANT:
1. Generate EXACTLY 5 DIFFERENT technical interview questions specifically customized for this candidate applying for {job_position}.
2. Bridge the candidate's verified skills ({skills_context}) with real-world requirements of a {job_position}.
3. DO NOT use generic questions that could be asked to every software developer (e.g. 'Tell me about yourself', 'What are your strengths').
4. The 5 questions must cover:
   - Question 1: System architecture or practical project design using their verified skills.
   - Question 2: Deep technical concepts, language internals, or performance optimization.
   - Question 3: API design, data validation, or database schema modeling.
   - Question 4: Difficult debugging in production, crisis resolution, or scalability bottlenecks.
   - Question 5: Engineering best practices, automated testing, or production security readiness.
5. Every question must be completely unique, fresh, and not repeat previous sessions.

Return ONLY valid JSON.
Format:
[
    {{
        "id": 1,
        "question": "Architecture question connecting {skills_context} with {job_position}",
        "type": "Architecture & Projects",
        "estimated_time": "3-5 min response"
    }},
    {{
        "id": 2,
        "question": "Deep technical question related to their tools and language",
        "type": "Technical Depth",
        "estimated_time": "3-5 min response"
    }},
    {{
        "id": 3,
        "question": "API development or database design question",
        "type": "APIs & Databases",
        "estimated_time": "3-5 min response"
    }},
    {{
        "id": 4,
        "question": "Debugging or scalability problem solving scenario",
        "type": "Problem Solving & Scaling",
        "estimated_time": "3-5 min response"
    }},
    {{
        "id": 5,
        "question": "Production readiness, testing, or security question",
        "type": "Production Engineering",
        "estimated_time": "3-5 min response"
    }}
]
"""

    ai_raw = call_gemini_or_fallback(prompt)

    if ai_raw:
        try:
            cleaned = clean_json_response(ai_raw)
            questions = json.loads(cleaned)

            if isinstance(questions, list):
                valid_questions = []
                for index, item in enumerate(questions[:5]):
                    if not isinstance(item, dict):
                        continue
                    question_text = str(item.get("question", "")).strip()
                    if not question_text:
                        continue
                    valid_questions.append({
                        "id": index + 1,
                        "question": question_text,
                        "type": item.get("type", "Technical"),
                        "estimated_time": item.get("estimated_time", "3-5 min response"),
                    })

                if len(valid_questions) == 5 and questions_are_unique(valid_questions):
                    return {
                        "success": True,
                        "candidate_name": candidate_name,
                        "job_position": job_position,
                        "candidate_skills": parsed_skills,
                        "questions": valid_questions,
                        "total_questions": 5,
                        "source": "Gemini AI (Profile-Tailored)",
                    }
        except Exception as e:
            logger.warning("Gemini question parsing failed: %s. Using fallback.", e)

    # 2. Secondary Fallback: Randomized Position Bank
    normalized_position = normalize_job_position(job_position)
    position_questions = get_position_question_bank(normalized_position)

    if position_questions:
        shuffled_pool = random.sample(position_questions, min(len(position_questions), 5))
        return {
            "success": True,
            "candidate_name": candidate_name,
            "job_position": job_position,
            "candidate_skills": parsed_skills,
            "questions": [
                {
                    "id": index + 1,
                    "question": item["question"],
                    "type": item["type"],
                    "estimated_time": item["estimated_time"],
                }
                for index, item in enumerate(shuffled_pool)
            ],
            "total_questions": 5,
            "source": "Position-Specific Bank (Shuffled Fallback)",
        }

    # 3. Tertiary Fallback: Generic Bank
    shuffled_generic = random.sample(TECHNICAL_CAREER_QUESTIONS, min(len(TECHNICAL_CAREER_QUESTIONS), 5))
    return {
        "success": True,
        "candidate_name": candidate_name,
        "job_position": job_position,
        "candidate_skills": parsed_skills,
        "questions": [
            {
                "id": index + 1,
                "question": item["question"],
                "type": item["type"],
                "estimated_time": item["estimated_time"],
            }
            for index, item in enumerate(shuffled_generic)
        ],
        "total_questions": 5,
        "source": "Copilot Engine (Fallback)",
    }


# ============================================================
# Used Question Tracking & Helpers
# ============================================================

def get_used_questions(history: List[Dict[str, Any]], current_question: str) -> set:
    used = set()
    for item in history:
        if not isinstance(item, dict):
            continue
        for q_val in [item.get("question"), item.get("current_question")]:
            if isinstance(q_val, str):
                normalized = q_val.strip().lower()
                if normalized:
                    used.add(normalized)
    if current_question:
        used.add(current_question.strip().lower())
    return used


def find_next_question(current_question: str, history: List[Dict[str, Any]]) -> str:
    used = get_used_questions(history, current_question)
    for item in TECHNICAL_CAREER_QUESTIONS:
        question = item["question"]
        if question.lower() not in used:
            return question
    return ""


def generate_next_position_question(
    candidate_name: str,
    candidate_skills: Any,
    current_question: str,
    history: List[Dict[str, Any]],
    question_number: int,
    target_role: str = "Software Engineer",
) -> str:
    used_questions = []
    for item in history:
        if not isinstance(item, dict):
            continue
        q = item.get("question") or item.get("current_question") or ""
        if q:
            used_questions.append(str(q).strip())

    if current_question:
        used_questions.append(current_question.strip())

    used_text = "\n".join(f"- {q}" for q in used_questions)

    prompt = f"""
You are conducting a technical interview for a {target_role} position.

Candidate:
{candidate_name}

Candidate Skills:
{candidate_skills}

Current Interview Question:
{current_question}

Questions already asked:
{used_text}

The interview is currently moving to question {question_number} of 5.

Generate ONE new technical interview question.

The new question MUST:
- Be different from every question already asked.
- Be relevant to the candidate's technical skills ({candidate_skills}) and the role ({target_role}).
- Continue naturally from the current interview.
- Focus on practical work, architecture, APIs, databases, testing, performance, or deployment.
- Avoid generic greetings.
- Do not repeat an earlier question.
- Do not include an answer.
- Return ONLY the question text.
"""

    ai_raw = call_gemini_or_fallback(prompt)
    if ai_raw:
        question = clean_json_response(ai_raw).strip().strip('"')
        if question and question.lower() not in {item.lower() for item in used_questions}:
            return question

    return ""


def calculate_fallback_score(answer: str, current_question: str, candidate_skills: Any) -> float:
    text = answer.lower()
    words = text.split()
    word_count = len(words)

    if word_count < 5:
        score = 30
    elif word_count < 10:
        score = 45
    elif word_count < 20:
        score = 60
    elif word_count < 35:
        score = 72
    elif word_count < 50:
        score = 82
    else:
        score = 88

    technical_keywords = [
        "python", "java", "javascript", "fastapi", "api", "rest", "database",
        "mysql", "sql", "backend", "frontend", "html", "css", "react",
        "authentication", "authorization", "security", "testing", "deployment",
        "performance", "scalability", "optimization", "algorithm", "architecture",
        "validation", "exception", "cloud", "git", "github", "docker", "aws",
        "azure", "machine learning", "ai", "model"
    ]

    matches = sum(1 for keyword in technical_keywords if keyword in text)
    score += min(matches * 2, 10)

    if isinstance(candidate_skills, list):
        for skill in candidate_skills:
            if isinstance(skill, dict):
                skill_name = str(skill.get("name", "")).lower()
            else:
                skill_name = str(skill).lower()
            if skill_name and skill_name in text:
                score += 2

    return round(max(0, min(100, score)), 2)


def generate_overall_feedback(
    scores: List[float],
    history: List[Dict[str, Any]],
    candidate_name: str,
) -> Dict[str, Any]:
    valid_scores = []
    for score in scores:
        try:
            value = float(score)
            valid_scores.append(max(0, min(100, value)))
        except (ValueError, TypeError):
            continue

    final_score = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else 0

    history_text = ""
    for item in history:
        if not isinstance(item, dict):
            continue
        history_text += (
            f"\nQuestion: {item.get('question', '')}"
            f"\nAnswer: {item.get('user', '')}"
            f"\nScore: {item.get('score', 0)}"
            f"\nFeedback: {item.get('feedback', '')}\n"
        )

    prompt = f"""
You are a senior technical interviewer.

Candidate:
{candidate_name}

Interview Score:
{final_score}/100

Number of evaluated answers:
{len(valid_scores)}

Interview Details:
{history_text}

Provide an overall professional interview evaluation.
Return ONLY valid JSON.

Format:
{{
    "overall_feedback": "Professional overall interview feedback.",
    "strengths": [
        "Strength 1",
        "Strength 2"
    ],
    "areas_to_improve": [
        "Area 1",
        "Area 2"
    ],
    "career_advice": [
        "Career advice 1",
        "Career advice 2"
    ]
}}
"""

    ai_raw = call_gemini_or_fallback(prompt)
    if ai_raw:
        try:
            result = json.loads(clean_json_response(ai_raw))
            if isinstance(result, dict):
                return {
                    "overall_feedback": result.get("overall_feedback", ""),
                    "strengths": result.get("strengths", []),
                    "areas_to_improve": result.get("areas_to_improve", []),
                    "career_advice": result.get("career_advice", []),
                }
        except Exception as e:
            logger.warning("Overall feedback parsing failed: %s", e)

    if final_score >= 85:
        overall_feedback = "Excellent interview performance with strong technical depth."
        strengths = ["Strong technical understanding.", "Good problem solving."]
        areas_to_improve = ["Continue learning advanced system architecture."]
        career_advice = ["Work on advanced production systems."]
    elif final_score >= 70:
        overall_feedback = "Good interview performance with solid foundations."
        strengths = ["Solid foundation.", "Relevant technical answers."]
        areas_to_improve = ["Deepen knowledge in system trade-offs."]
        career_advice = ["Build more scalable projects."]
    elif final_score >= 50:
        overall_feedback = "The candidate showed basic technical understanding with room for improvement."
        strengths = ["Attempted technical questions."]
        areas_to_improve = ["Strengthen core engineering concepts."]
        career_advice = ["Practice technical coding and design."]
    else:
        overall_feedback = "Significant improvement is recommended in foundational technical concepts."
        strengths = ["Completed session."]
        areas_to_improve = ["Core programming and database knowledge."]
        career_advice = ["Follow structured programming roadmaps."]

    return {
        "overall_feedback": overall_feedback,
        "strengths": strengths,
        "areas_to_improve": areas_to_improve,
        "career_advice": career_advice,
    }


# ============================================================
# Dynamic Interview Simulation Turn (Evaluates & Follows Up)
# ============================================================

@router.post("/interview/simulate")
def simulate_interview_turn(
    msg: SimulationMessage,
    db: Session = Depends(get_db),
):
    candidate = db.query(Candidate).filter(Candidate.id == msg.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    candidate_name = candidate.name or "Candidate"
    answer = (msg.user_response or "").strip()
    current_question = (msg.current_question or "Please answer the selected technical interview question.").strip()
    question_number = max(1, min(msg.question_number, 5))
    total_questions = 5

    parsed_skills = extract_skills_list(candidate.skills)
    if not parsed_skills and msg.candidate_skills:
        parsed_skills = msg.candidate_skills

    skills_context = ", ".join(parsed_skills) if parsed_skills else "General Software Development"
    target_role = msg.target_role or "Software Engineer"
    is_final_turn = (question_number >= total_questions)

    if not answer:
        return {
            "success": True,
            "candidate_name": candidate_name,
            "ai_response": "Please provide an answer to the question.",
            "current_question": current_question,
            "next_question": "",
            "question_number": question_number,
            "total_questions": total_questions,
            "is_valid": False,
            "needs_retry": True,
            "completed": False,
            "answer_score": 0,
            "score": 0,
            "feedback": "No answer was provided.",
            "strengths": [],
            "technical": "No technical answer was provided.",
            "communication": "No response was provided.",
            "improvements": ["Provide a complete technical answer."],
        }

    if len(answer.split()) < 3:
        return {
            "success": True,
            "candidate_name": candidate_name,
            "ai_response": "Please provide more details about your answer.",
            "current_question": current_question,
            "next_question": "",
            "question_number": question_number,
            "total_questions": total_questions,
            "is_valid": False,
            "needs_retry": True,
            "completed": False,
            "answer_score": 0,
            "score": 0,
            "feedback": "The answer was too short to evaluate.",
            "strengths": [],
            "technical": "Not enough technical information.",
            "communication": "The answer needs more explanation.",
            "improvements": [
                "Explain your answer in more detail.",
                "Mention the technologies used.",
                "Give a practical example.",
            ],
        }

    history_text = "\n".join(
        [
            f"Question: {item.get('question', '')}\nAnswer: {item.get('user', '')}"
            for item in msg.history if isinstance(item, dict)
        ]
    )

    if is_final_turn:
        next_q_directive = "Do not generate a next question because this is the final question. Set next_question to empty string."
    else:
        next_q_directive = f"Generate an adaptive next Question {question_number + 1} that probes their verified skills ({skills_context}) or tests an adjacent system trade-off for a {target_role}."

    prompt = f"""
You are an expert technical interviewer evaluating a {target_role}.

Candidate:
{candidate_name}

Candidate Skills:
{skills_context}

Question:
{current_question}

Question Number:
{question_number} of {total_questions}

Previous Interview:
{history_text}

Candidate's Latest Answer:
{answer}

Task:
1. Score the answer from 0 to 100 on technical correctness, depth, relevance, and communication.
2. Provide a 1-sentence technical critique of their response.
3. {next_q_directive}

Return ONLY valid JSON.
Format:
{{
    "ai_response": "Short acknowledgement or critique of their answer.",
    "answer_score": 80,
    "feedback": "Overall answer evaluation.",
    "strengths": [
        "Strength 1",
        "Strength 2"
    ],
    "technical": "Technical assessment.",
    "communication": "Communication assessment.",
    "improvements": [
        "Improvement 1"
    ],
    "next_question": "",
    "is_valid": true,
    "needs_retry": false
}}
"""

    ai_raw = call_gemini_or_fallback(prompt)

    if ai_raw:
        try:
            result = json.loads(clean_json_response(ai_raw))
            if isinstance(result, dict):
                is_valid = bool(result.get("is_valid", True))

                if not is_valid:
                    return {
                        "success": True,
                        "candidate_name": candidate_name,
                        "ai_response": result.get("ai_response", "Please provide a more complete answer."),
                        "current_question": current_question,
                        "next_question": "",
                        "question_number": question_number,
                        "total_questions": total_questions,
                        "is_valid": False,
                        "needs_retry": True,
                        "completed": False,
                        "answer_score": 0,
                        "score": 0,
                        "feedback": result.get("feedback", "The answer was not sufficient."),
                        "strengths": result.get("strengths", []),
                        "technical": result.get("technical", "Not enough technical information."),
                        "communication": result.get("communication", "The response needs more explanation."),
                        "improvements": result.get("improvements", ["Provide a complete answer."]),
                    }

                try:
                    score = float(result.get("answer_score", result.get("score", 0)))
                except (ValueError, TypeError):
                    score = 0

                score = max(0, min(100, score))
                completed = is_final_turn

                if completed:
                    candidate.voice_screening_status = "COMPLETED"
                    db.commit()
                    db.refresh(candidate)

                next_q = "" if completed else str(result.get("next_question", "")).strip()

                if not next_q and not completed:
                    next_q = generate_next_position_question(
                        candidate_name=candidate_name,
                        candidate_skills=skills_context,
                        current_question=current_question,
                        history=msg.history,
                        question_number=question_number + 1,
                        target_role=target_role,
                    )

                return {
                    "success": True,
                    "candidate_name": candidate_name,
                    "ai_response": result.get("ai_response", "Thank you for your answer."),
                    "current_question": current_question,
                    "next_question": next_q,
                    "question_number": question_number,
                    "total_questions": total_questions,
                    "is_valid": True,
                    "needs_retry": False,
                    "completed": completed,
                    "answer_score": round(score, 2),
                    "score": round(score, 2),
                    "feedback": result.get("feedback", "Answer evaluated successfully."),
                    "strengths": result.get("strengths", []),
                    "technical": result.get("technical", ""),
                    "communication": result.get("communication", ""),
                    "improvements": result.get("improvements", []),
                }
        except Exception as e:
            logger.warning("Gemini evaluation parsing failed: %s", e)

    # Local Fallback Evaluation
    score = calculate_fallback_score(answer, current_question, candidate.skills)
    completed = is_final_turn

    if completed:
        candidate.voice_screening_status = "COMPLETED"
        db.commit()
        db.refresh(candidate)

    next_question = (
        ""
        if completed
        else generate_next_position_question(
            candidate_name=candidate_name,
            candidate_skills=skills_context,
            current_question=current_question,
            history=msg.history,
            question_number=question_number + 1,
            target_role=target_role,
        )
    )

    if not next_question and not completed:
        next_question = find_next_question(current_question, msg.history)

    feedback = "Good technical answer with relevant practical information." if score >= 70 else "The answer is relevant but needs more technical depth."

    return {
        "success": True,
        "candidate_name": candidate_name,
        "ai_response": "Thank you for your answer.",
        "current_question": current_question,
        "next_question": next_question,
        "question_number": question_number,
        "total_questions": total_questions,
        "is_valid": True,
        "needs_retry": False,
        "completed": completed,
        "answer_score": score,
        "score": score,
        "feedback": feedback,
        "strengths": ["Attempted to answer the question."],
        "technical": "The answer contains relevant technical information.",
        "communication": "The response is understandable, but could be more structured.",
        "improvements": ["Explain the technical approach step by step."],
    }


# ============================================================
# STOP INTERVIEW
# ============================================================

@router.post("/interview/stop")
def stop_interview(
    req: StopInterviewRequest,
    db: Session = Depends(get_db),
):
    candidate = db.query(Candidate).filter(Candidate.id == req.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    candidate.voice_screening_status = "NOT COMPLETED"

    valid_scores = []
    for score in req.scores:
        try:
            val = float(score)
            valid_scores.append(max(0, min(100, val)))
        except (ValueError, TypeError):
            continue

    final_score = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else 0
    stopped_at_question = max(1, min(req.question_number, 5))
    answered_questions = len(valid_scores)

    feedback = generate_overall_feedback(valid_scores, [], candidate.name or "Candidate")
    decision = "Recommended for Shortlisting" if final_score >= 70 else ("Needs Further Review" if final_score >= 50 else "Not Recommended")

    db.commit()
    db.refresh(candidate)

    return {
        "success": True,
        "candidate_id": candidate.id,
        "candidate_name": candidate.name or "Candidate",
        "interview_stopped": True,
        "stopped_at_question": stopped_at_question,
        "answered_questions": answered_questions,
        "total_questions": 5,
        "scores": valid_scores,
        "final_score": final_score,
        "score": final_score,
        "decision": decision,
        "overall_feedback": feedback["overall_feedback"],
        "strengths": feedback["strengths"],
        "areas_to_improve": feedback["areas_to_improve"],
        "career_advice": feedback["career_advice"],
        "voice_screening_status": candidate.voice_screening_status,
        "message": f"Interview stopped at question {stopped_at_question}. Final score: {final_score}/100.",
    }


# ============================================================
# FINAL INTERVIEW RESULT
# ============================================================

@router.post("/interview/final-result")
def final_interview_result(
    req: FinalResultRequest,
    db: Session = Depends(get_db),
):
    candidate = db.query(Candidate).filter(Candidate.id == req.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    final_score = max(0, min(100, float(req.final_score)))
    valid_scores = [final_score]

    candidate.status = "pending"
    db.commit()
    db.refresh(candidate)

    feedback = generate_overall_feedback(valid_scores, [], candidate.name or "Candidate")
    decision = "Recommended for Shortlisting" if final_score >= 70 else ("Needs Further Review" if final_score >= 50 else "Not Recommended")

    return {
        "success": True,
        "candidate_id": candidate.id,
        "candidate_name": candidate.name or "Candidate",
        "interview_completed": True,
        "total_questions": 5,
        "answered_questions": len(valid_scores),
        "scores": valid_scores,
        "final_score": final_score,
        "score": final_score,
        "decision": decision,
        "overall_feedback": feedback["overall_feedback"],
        "strengths": feedback["strengths"],
        "areas_to_improve": feedback["areas_to_improve"],
        "career_advice": feedback["career_advice"],
        "voice_screening_status": candidate.voice_screening_status,
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
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    candidate.status = body.status
    db.commit()
    db.refresh(candidate)

    return {
        "success": True,
        "candidate_id": candidate.id,
        "new_status": candidate.status,
    }