from __future__ import annotations

"""
backend/app/routes/interview.py

Voice Screening:
- Job position can be selected
- Exactly 5 technical/career questions
- Questions are generated based on selected job position
- Candidate answers are evaluated
- Each answer gets a score
- Next Question skips the current question
- Stop Interview completely stops the interview
- Score is calculated from completed answers
- Final score is calculated after 5 questions
- Final feedback is provided based on interview performance
"""

import os
import json
import logging
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


class SimulationMessage(BaseModel):
    candidate_id: str
    user_response: str
    current_question: Optional[str] = None
    question_number: int = 1
    total_questions: int = 5
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
# Generic Technical / Career Questions
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
# POSITION-SPECIFIC QUESTION BANK
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
# Position Normalization
# ============================================================

def normalize_job_position(job_position: str) -> str:

    position = (
        job_position
        .strip()
        .lower()
    )

    position = " ".join(
        position.split()
    )

    return position


# ============================================================
# Get Position-Specific Questions
# ============================================================

def get_position_question_bank(
    job_position: str,
) -> Optional[List[Dict[str, Any]]]:

    position = normalize_job_position(
        job_position
    )

    if position in POSITION_QUESTION_BANK:

        return POSITION_QUESTION_BANK[
            position
        ]

    # --------------------------------------------------------
    # Match common variations
    # --------------------------------------------------------

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

        key = aliases[position]

        return POSITION_QUESTION_BANK.get(
            key
        )

    # --------------------------------------------------------
    # Partial matching
    # --------------------------------------------------------

    if "python" in position:
        return POSITION_QUESTION_BANK[
            "python developer"
        ]

    if "java" in position:
        return POSITION_QUESTION_BANK[
            "java developer"
        ]

    if "react" in position:
        return POSITION_QUESTION_BANK[
            "react developer"
        ]

    if (
        "frontend" in position
        or "front end" in position
        or "front-end" in position
    ):
        return POSITION_QUESTION_BANK[
            "frontend developer"
        ]

    if (
        "backend" in position
        or "back end" in position
        or "back-end" in position
    ):
        return POSITION_QUESTION_BANK[
            "backend developer"
        ]

    if (
        "data scientist" in position
        or "data science" in position
    ):
        return POSITION_QUESTION_BANK[
            "data scientist"
        ]

    if "devops" in position:
        return POSITION_QUESTION_BANK[
            "devops engineer"
        ]

    if "sql" in position:
        return POSITION_QUESTION_BANK[
            "sql developer"
        ]

    return None


# ============================================================
# Gemini Helper
# ============================================================

def call_gemini_or_fallback(prompt: str) -> Optional[str]:

    settings = get_settings()

    api_key = (
        settings.GEMINI_API_KEY.strip()
        if settings.GEMINI_API_KEY
        else ""
    )

    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        return None

    try:

        # ----------------------------------------------------
        # New SDK
        # ----------------------------------------------------

        if USE_NEW_SDK is True:

            client = genai.Client(
                api_key=api_key
            )

            response = client.models.generate_content(
                model="gemini-1.5-flash",
                contents=prompt,
            )

            return (
                response.text.strip()
                if response and response.text
                else None
            )

        # ----------------------------------------------------
        # Legacy SDK
        # ----------------------------------------------------

        elif USE_NEW_SDK is False:

            genai_legacy.configure(
                api_key=api_key
            )

            model = genai_legacy.GenerativeModel(
                "gemini-1.5-flash"
            )

            response = model.generate_content(
                prompt
            )

            return (
                response.text.strip()
                if response and response.text
                else None
            )

    except Exception as e:

        logger.warning(
            "Gemini API error: %s. Using fallback.",
            e
        )

        return None

    return None


# ============================================================
# JSON Cleaner
# ============================================================

def clean_json_response(raw_text: str) -> str:

    cleaned = raw_text.strip()

    cleaned = cleaned.replace(
        "```json",
        ""
    )

    cleaned = cleaned.replace(
        "```JSON",
        ""
    )

    cleaned = cleaned.replace(
        "```",
        ""
    )

    return cleaned.strip()


# ============================================================
# Question Duplicate Checker
# ============================================================

def normalize_question(question: str) -> str:

    return " ".join(
        question
        .strip()
        .lower()
        .split()
    )


def questions_are_unique(
    questions: List[Dict[str, Any]]
) -> bool:

    seen = set()

    for item in questions:

        question = normalize_question(
            str(
                item.get(
                    "question",
                    ""
                )
            )
        )

        if not question:
            return False

        if question in seen:
            return False

        seen.add(question)

    return True


# ============================================================
# Generate Questions
# ============================================================

@router.post("/interview/generate-questions")
def generate_interview_questions(
    req: QuestionRequest,
    db: Session = Depends(get_db),
):

    candidate = None

    # --------------------------------------------------------
    # Get candidate if supplied
    # --------------------------------------------------------

    if req.candidate_id:

        candidate = (
            db.query(Candidate)
            .filter(
                Candidate.id == req.candidate_id
            )
            .first()
        )

        if not candidate:

            raise HTTPException(
                status_code=404,
                detail="Candidate not found",
            )

        # ----------------------------------------------------
        # Start a new Voice Screening
        # ----------------------------------------------------

        candidate.voice_screening_status = "NOT COMPLETED"

        db.commit()

        db.refresh(candidate)

    # --------------------------------------------------------
    # Candidate information
    # --------------------------------------------------------

    candidate_name = (
        candidate.name
        if candidate
        else "Candidate"
    )

    candidate_skills = (
        candidate.skills
        if candidate
        else []
    )

    # --------------------------------------------------------
    # Selected Job Position
    # --------------------------------------------------------

    job_position = (
        req.job_position.strip()
        if req.job_position
        else "General Technical Role"
    )

    normalized_position = normalize_job_position(
        job_position
    )

    candidate_info = f"""
Candidate Name:
{candidate_name}

Candidate Skills:
{candidate_skills}

Selected Job Position:
{job_position}
"""

    # ========================================================
    # CHECK POSITION-SPECIFIC QUESTION BANK FIRST
    # ========================================================

    position_questions = get_position_question_bank(
        normalized_position
    )

    if position_questions:

        return {
            "success": True,
            "candidate_name": candidate_name,
            "job_position": job_position,
            "questions": [
                {
                    "id": index + 1,
                    "question": item["question"],
                    "type": item["type"],
                    "estimated_time": item["estimated_time"],
                }
                for index, item in enumerate(
                    position_questions[:5]
                )
            ],
            "total_questions": 5,
            "source": "Position-Specific Question Bank",
        }

    # ========================================================
    # Gemini Prompt For Other Job Positions
    # ========================================================

    prompt = f"""
You are an expert technical interviewer.

{candidate_info}

The selected job position is:

{job_position}

IMPORTANT:
The selected job position is the PRIMARY requirement for generating
the interview questions.

Generate exactly 5 DIFFERENT technical interview questions specifically
for the selected job position.

The questions MUST be strongly related to the exact selected job title.

DO NOT use generic questions that could be asked to every software
developer.

DO NOT use the same question structure repeatedly.

DO NOT generate generic questions about:
- generic technical projects
- generic databases
- generic REST APIs
- generic scalability
- generic career plans

unless those subjects are specifically important to the selected role.

The questions must test technologies, responsibilities, tools,
technical concepts, practical work, debugging, architecture,
testing, deployment, problem solving, or other responsibilities
specific to:

{job_position}

Candidate skills should be considered when appropriate, but the
selected job position MUST remain the main focus.

Every question must be different from the other questions.

Return ONLY valid JSON.

Use exactly this format:

[
    {{
        "id": 1,
        "question": "Question specifically related to {job_position}",
        "type": "Technical",
        "estimated_time": "3-5 min response"
    }},
    {{
        "id": 2,
        "question": "Different question specifically related to {job_position}",
        "type": "Technical",
        "estimated_time": "3-5 min response"
    }},
    {{
        "id": 3,
        "question": "Different question specifically related to {job_position}",
        "type": "Technical",
        "estimated_time": "3-5 min response"
    }},
    {{
        "id": 4,
        "question": "Different question specifically related to {job_position}",
        "type": "Technical",
        "estimated_time": "3-5 min response"
    }},
    {{
        "id": 5,
        "question": "Different question specifically related to {job_position}",
        "type": "Technical",
        "estimated_time": "3-5 min response"
    }}
]
"""

    # ========================================================
    # Try Gemini
    # ========================================================

    ai_raw = call_gemini_or_fallback(
        prompt
    )

    if ai_raw:

        try:

            cleaned = clean_json_response(
                ai_raw
            )

            questions = json.loads(
                cleaned
            )

            if isinstance(
                questions,
                list
            ):

                valid_questions = []

                for index, item in enumerate(
                    questions[:5]
                ):

                    if not isinstance(
                        item,
                        dict
                    ):
                        continue

                    question_text = str(
                        item.get(
                            "question",
                            ""
                        )
                    ).strip()

                    if not question_text:
                        continue

                    valid_questions.append(
                        {
                            "id": index + 1,
                            "question": question_text,
                            "type": item.get(
                                "type",
                                "Technical"
                            ),
                            "estimated_time": item.get(
                                "estimated_time",
                                "3-5 min response"
                            ),
                        }
                    )

                if (
                    len(valid_questions) == 5
                    and questions_are_unique(
                        valid_questions
                    )
                ):

                    return {
                        "success": True,
                        "candidate_name": candidate_name,
                        "job_position": job_position,
                        "questions": valid_questions,
                        "total_questions": 5,
                        "source": "Gemini AI",
                    }

        except Exception as e:

            logger.warning(
                "Gemini question parsing failed: %s",
                e
            )

    # ========================================================
    # Position-Specific Fallback Questions
    # ========================================================

    fallback_questions = [

        {
            "id": 1,
            "question": (
                f"What are the most important technical concepts "
                f"required for a {job_position}, and how would you "
                f"apply them in a real-world project?"
            ),
            "type": "Technical - Role Knowledge",
            "estimated_time": "3-5 min response",
        },

        {
            "id": 2,
            "question": (
                f"What tools, technologies, or frameworks would you "
                f"normally use as a {job_position}, and why would you "
                f"choose them?"
            ),
            "type": "Technical - Technologies",
            "estimated_time": "3-5 min response",
        },

        {
            "id": 3,
            "question": (
                f"Describe a difficult technical problem that could "
                f"occur in a {job_position} role and explain how you "
                f"would investigate and solve it."
            ),
            "type": "Technical - Problem Solving",
            "estimated_time": "3-5 min response",
        },

        {
            "id": 4,
            "question": (
                f"How would you test, debug, and improve the reliability "
                f"of a system or solution developed for a {job_position} role?"
            ),
            "type": "Technical - Testing and Reliability",
            "estimated_time": "3-5 min response",
        },

        {
            "id": 5,
            "question": (
                f"Describe a project or practical task relevant to the "
                f"{job_position} role and explain the technical decisions "
                f"you would make to complete it successfully."
            ),
            "type": "Technical - Practical Experience",
            "estimated_time": "3-5 min response",
        },

    ]

    return {
        "success": True,
        "candidate_name": candidate_name,
        "job_position": job_position,
        "questions": fallback_questions,
        "total_questions": 5,
        "source": "Copilot Engine",
    }


# ============================================================
# Get Used Questions
# ============================================================

def get_used_questions(
    history: List[Dict[str, Any]],
    current_question: str,
) -> set:

    used = set()

    for item in history:

        if not isinstance(
            item,
            dict
        ):
            continue

        possible_questions = [
            item.get("question"),
            item.get("current_question"),
        ]

        for question in possible_questions:

            if isinstance(
                question,
                str
            ):

                question = (
                    question
                    .strip()
                    .lower()
                )

                if question:
                    used.add(question)

    if current_question:

        used.add(
            current_question
            .strip()
            .lower()
        )

    return used


# ============================================================
# Fallback Next Question
# ============================================================

def find_next_question(
    current_question: str,
    history: List[Dict[str, Any]],
) -> str:

    used = get_used_questions(
        history,
        current_question
    )

    for item in TECHNICAL_CAREER_QUESTIONS:

        question = item["question"]

        if question.lower() not in used:

            return question

    return ""


# ============================================================
# Generate Position-Specific Next Question
# ============================================================

def generate_next_position_question(
    candidate_name: str,
    candidate_skills: Any,
    current_question: str,
    history: List[Dict[str, Any]],
    question_number: int,
) -> str:

    used_questions = []

    for item in history:

        if not isinstance(
            item,
            dict
        ):
            continue

        question = (
            item.get("question")
            or item.get("current_question")
            or ""
        )

        if question:

            used_questions.append(
                str(question).strip()
            )

    if current_question:

        used_questions.append(
            current_question.strip()
        )

    used_text = "\n".join(
        f"- {question}"
        for question in used_questions
    )

    prompt = f"""
You are conducting a technical interview.

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
- Be relevant to the candidate's technical skills.
- Continue naturally from the current interview.
- Focus on technical knowledge, practical experience,
  architecture, APIs, databases, testing, performance,
  deployment, or other technical areas.
- Avoid generic greetings.
- Do not ask "Tell me about yourself."
- Do not repeat an earlier question.
- Do not include an answer.
- Return ONLY the question text.

Use the current question and previous questions to infer
the candidate's selected technical role and keep the new
question relevant to that role.
"""

    ai_raw = call_gemini_or_fallback(
        prompt
    )

    if ai_raw:

        question = (
            clean_json_response(
                ai_raw
            )
            .strip()
            .strip('"')
        )

        if (
            question
            and question.lower()
            not in {
                item.lower()
                for item in used_questions
            }
        ):

            return question

    return ""


# ============================================================
# Fallback Score
# ============================================================

def calculate_fallback_score(
    answer: str,
    current_question: str,
    candidate_skills: Any,
) -> float:

    text = answer.lower()

    words = text.split()

    word_count = len(words)

    # --------------------------------------------------------
    # Base score
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # Technical keywords
    # --------------------------------------------------------

    technical_keywords = [

        "python",
        "java",
        "javascript",
        "fastapi",
        "api",
        "rest",
        "database",
        "mysql",
        "sql",
        "backend",
        "frontend",
        "html",
        "css",
        "react",
        "authentication",
        "authorization",
        "security",
        "testing",
        "deployment",
        "performance",
        "scalability",
        "optimization",
        "algorithm",
        "architecture",
        "validation",
        "exception",
        "cloud",
        "git",
        "github",
        "docker",
        "aws",
        "azure",
        "machine learning",
        "ai",
        "model",

    ]

    matches = sum(
        1
        for keyword in technical_keywords
        if keyword in text
    )

    score += min(
        matches * 2,
        10
    )

    # --------------------------------------------------------
    # Candidate skill match
    # --------------------------------------------------------

    if isinstance(
        candidate_skills,
        list
    ):

        for skill in candidate_skills:

            if isinstance(
                skill,
                dict
            ):

                skill_name = str(
                    skill.get(
                        "name",
                        ""
                    )
                ).lower()

            else:

                skill_name = str(
                    skill
                ).lower()

            if (
                skill_name
                and skill_name in text
            ):

                score += 2

    return round(
        max(
            0,
            min(
                100,
                score
            )
        ),
        2
    )


# ============================================================
# Generate Overall Interview Feedback
# ============================================================

def generate_overall_feedback(
    scores: List[float],
    history: List[Dict[str, Any]],
    candidate_name: str,
) -> Dict[str, Any]:

    valid_scores = []

    for score in scores:

        try:

            value = float(score)

            value = max(
                0,
                min(
                    100,
                    value
                )
            )

            valid_scores.append(value)

        except (
            ValueError,
            TypeError,
        ):

            continue

    if valid_scores:

        final_score = round(
            sum(valid_scores) / len(valid_scores),
            2
        )

    else:

        final_score = 0

    # ========================================================
    # Try Gemini for overall feedback
    # ========================================================

    history_text = ""

    for item in history:

        if not isinstance(item, dict):
            continue

        history_text += (
            f"\nQuestion: {item.get('question', '')}"
            f"\nAnswer: {item.get('user', '')}"
            f"\nScore: {item.get('score', 0)}"
            f"\nFeedback: {item.get('feedback', '')}"
            f"\n"
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

If the candidate performed very well:
- Clearly mention their strengths.
- Mention their technical capability.
- Give positive professional feedback.
- Suggest how they can continue improving.

If the candidate performed at an average level:
- Mention what they did well.
- Identify technical areas that need improvement.
- Give practical suggestions.

If the candidate performed poorly:
- Clearly explain the weak areas.
- Suggest what technical concepts they should improve.
- Recommend practical ways to improve.
- Keep the feedback constructive and professional.

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

            result = json.loads(
                clean_json_response(
                    ai_raw
                )
            )

            if isinstance(
                result,
                dict
            ):

                return {
                    "overall_feedback": result.get(
                        "overall_feedback",
                        ""
                    ),
                    "strengths": result.get(
                        "strengths",
                        []
                    ),
                    "areas_to_improve": result.get(
                        "areas_to_improve",
                        []
                    ),
                    "career_advice": result.get(
                        "career_advice",
                        []
                    ),
                }

        except Exception as e:

            logger.warning(
                "Overall feedback parsing failed: %s",
                e
            )

    # ========================================================
    # Local fallback feedback
    # ========================================================

    if final_score >= 85:

        overall_feedback = (
            "Excellent interview performance. "
            "The candidate demonstrated strong technical "
            "knowledge, practical understanding, and good "
            "communication. The candidate appears well "
            "prepared for technical responsibilities."
        )

        strengths = [
            "Strong technical understanding.",
            "Good practical problem-solving ability.",
            "Clear and relevant answers.",
            "Good potential for technical roles.",
        ]

        areas_to_improve = [
            "Continue learning advanced concepts.",
            "Keep building real-world project experience.",
        ]

        career_advice = [
            "Work on advanced projects to strengthen your portfolio.",
            "Continue improving system design and problem-solving skills.",
        ]

    elif final_score >= 70:

        overall_feedback = (
            "Good interview performance. "
            "The candidate demonstrated a solid technical "
            "foundation and was able to explain relevant "
            "technical concepts. Some areas can be improved "
            "with deeper practical experience."
        )

        strengths = [
            "Good technical foundation.",
            "Relevant technical knowledge.",
            "Able to explain practical concepts.",
        ]

        areas_to_improve = [
            "Improve technical depth.",
            "Practice explaining solutions step by step.",
            "Gain more real-world project experience.",
        ]

        career_advice = [
            "Build more practical projects.",
            "Practice technical interview questions regularly.",
        ]

    elif final_score >= 50:

        overall_feedback = (
            "The candidate showed basic technical understanding "
            "but needs more depth and confidence in several areas. "
            "More hands-on practice and stronger technical "
            "explanations would improve interview performance."
        )

        strengths = [
            "Attempted the technical questions.",
            "Shows basic technical understanding.",
        ]

        areas_to_improve = [
            "Strengthen core technical concepts.",
            "Provide more detailed technical explanations.",
            "Practice explaining project decisions.",
            "Improve problem-solving confidence.",
        ]

        career_advice = [
            "Practice coding and technical problems regularly.",
            "Build at least a few complete real-world projects.",
            "Review database, API, backend, and system design concepts.",
        ]

    else:

        overall_feedback = (
            "The interview performance indicates that the candidate "
            "needs significant improvement in technical knowledge "
            "and communication of technical concepts. More structured "
            "learning and practical project experience are recommended."
        )

        strengths = [
            "Made an attempt to answer the questions.",
        ]

        areas_to_improve = [
            "Improve core programming concepts.",
            "Strengthen database and API knowledge.",
            "Practice technical problem solving.",
            "Provide clearer and more complete answers.",
        ]

        career_advice = [
            "Follow a structured technical learning plan.",
            "Practice programming every day.",
            "Build practical projects using your main technologies.",
            "Take mock technical interviews before applying for jobs.",
        ]

    return {
        "overall_feedback": overall_feedback,
        "strengths": strengths,
        "areas_to_improve": areas_to_improve,
        "career_advice": career_advice,
    }


# ============================================================
# Interview Simulation
# ============================================================

@router.post("/interview/simulate")
def simulate_interview_turn(
    msg: SimulationMessage,
    db: Session = Depends(get_db),
):

    # ========================================================
    # Find Candidate
    # ========================================================

    candidate = (
        db.query(Candidate)
        .filter(
            Candidate.id == msg.candidate_id
        )
        .first()
    )

    if not candidate:

        raise HTTPException(
            status_code=404,
            detail="Candidate not found",
        )

    candidate_name = (
        candidate.name
        or "Candidate"
    )

    answer = (
        msg.user_response
        or ""
    ).strip()

    # ========================================================
    # IMPORTANT:
    # Use the question supplied by the frontend.
    #
    # The frontend already received the complete 5-question
    # position-specific interview at the beginning.
    #
    # DO NOT replace it with a generic question.
    # ========================================================

    current_question = (
        msg.current_question
        or ""
    ).strip()

    if not current_question:

        current_question = (
            "Please answer the selected technical interview question."
        )

    question_number = max(
        1,
        min(
            msg.question_number,
            5
        )
    )

    total_questions = 5

    # ========================================================
    # Empty answer
    # ========================================================

    if not answer:

        return {
            "success": True,
            "candidate_name": candidate_name,
            "ai_response": (
                "Please provide an answer to the question."
            ),
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
            "improvements": [
                "Provide a complete technical answer."
            ],
        }

    # ========================================================
    # Very short answers
    # ========================================================

    if len(answer.split()) < 3:

        return {
            "success": True,
            "candidate_name": candidate_name,
            "ai_response": (
                "Please provide more details about your answer."
            ),
            "current_question": current_question,
            "next_question": "",
            "question_number": question_number,
            "total_questions": total_questions,
            "is_valid": False,
            "needs_retry": True,
            "completed": False,
            "answer_score": 0,
            "score": 0,
            "feedback": (
                "The answer was too short to evaluate."
            ),
            "strengths": [],
            "technical": (
                "Not enough technical information."
            ),
            "communication": (
                "The answer needs more explanation."
            ),
            "improvements": [
                "Explain your answer in more detail.",
                "Mention the technologies used.",
                "Give a practical example.",
            ],
        }

    # ========================================================
    # Conversation history
    # ========================================================

    history_text = "\n".join(

        [
            (
                f"Question: {item.get('question', '')}\n"
                f"Answer: {item.get('user', '')}"
            )

            for item in msg.history

            if isinstance(
                item,
                dict
            )
        ]
    )

    # ========================================================
    # Gemini Evaluation
    # ========================================================

    prompt = f"""
You are an expert technical interviewer.

Candidate:
{candidate_name}

Candidate Skills:
{candidate.skills}

Question:
{current_question}

Question Number:
{question_number} of {total_questions}

Previous Interview:
{history_text}

Candidate's Latest Answer:
{answer}

Evaluate ONLY the latest answer.

DO NOT generate a new interview question.

DO NOT change the current question.

Score the answer from 0 to 100.

Consider:

- Technical correctness
- Relevance
- Completeness
- Practical understanding
- Problem solving
- Communication
- Clarity

A meaningful answer should be accepted even if it is not perfect.

If the answer is valid:

is_valid = true
needs_retry = false

If the answer is invalid:

is_valid = false
needs_retry = true
answer_score = 0

For a valid answer provide:

- score
- feedback
- strengths
- technical assessment
- communication assessment
- improvements

Do NOT ask another question inside the feedback.

Return ONLY JSON.

Format:

{{
    "ai_response": "Short acknowledgement.",
    "answer_score": 80,
    "feedback": "Overall answer evaluation.",
    "strengths": [
        "Strength 1",
        "Strength 2"
    ],
    "technical": "Technical assessment.",
    "communication": "Communication assessment.",
    "improvements": [
        "Improvement 1",
        "Improvement 2"
    ],
    "is_valid": true,
    "needs_retry": false
}}
"""

    ai_raw = call_gemini_or_fallback(
        prompt
    )

    # ========================================================
    # Gemini Result
    # ========================================================

    if ai_raw:

        try:

            result = json.loads(
                clean_json_response(
                    ai_raw
                )
            )

            if isinstance(
                result,
                dict
            ):

                is_valid = bool(
                    result.get(
                        "is_valid",
                        True
                    )
                )

                if not is_valid:

                    return {
                        "success": True,
                        "candidate_name": candidate_name,
                        "ai_response": (
                            result.get(
                                "ai_response",
                                "Please provide a more complete answer."
                            )
                        ),
                        "current_question": current_question,
                        "next_question": "",
                        "question_number": question_number,
                        "total_questions": total_questions,
                        "is_valid": False,
                        "needs_retry": True,
                        "completed": False,
                        "answer_score": 0,
                        "score": 0,
                        "feedback": result.get(
                            "feedback",
                            "The answer was not sufficient."
                        ),
                        "strengths": result.get(
                            "strengths",
                            []
                        ),
                        "technical": result.get(
                            "technical",
                            "Not enough technical information."
                        ),
                        "communication": result.get(
                            "communication",
                            "The response needs more explanation."
                        ),
                        "improvements": result.get(
                            "improvements",
                            [
                                "Provide a complete answer."
                            ]
                        ),
                    }

                # ------------------------------------------------
                # Score
                # ------------------------------------------------

                try:

                    score = float(
                        result.get(
                            "answer_score",
                            result.get(
                                "score",
                                0
                            )
                        )
                    )

                except (
                    ValueError,
                    TypeError,
                ):

                    score = 0

                score = max(
                    0,
                    min(
                        100,
                        score
                    )
                )

                # ------------------------------------------------
                # Completed
                # ------------------------------------------------

                completed = (
                    question_number >= 5
                )

                # ------------------------------------------------
                # Mark Voice Screening Completed
                # ------------------------------------------------

                if completed:

                    candidate.voice_screening_status = "COMPLETED"

                    db.commit()

                    db.refresh(candidate)

                # ------------------------------------------------
                # IMPORTANT:
                # Never generate a replacement question here.
                #
                # The frontend already has the 5 position-specific
                # questions generated at interview start.
                # ------------------------------------------------

                return {
                    "success": True,
                    "candidate_name": candidate_name,
                    "ai_response": result.get(
                        "ai_response",
                        "Thank you for your answer."
                    ),
                    "current_question": current_question,
                    "next_question": "",
                    "question_number": question_number,
                    "total_questions": total_questions,
                    "is_valid": True,
                    "needs_retry": False,
                    "completed": completed,
                    "answer_score": round(
                        score,
                        2
                    ),
                    "score": round(
                        score,
                        2
                    ),
                    "feedback": result.get(
                        "feedback",
                        "Answer evaluated successfully."
                    ),
                    "strengths": result.get(
                        "strengths",
                        []
                    ),
                    "technical": result.get(
                        "technical",
                        ""
                    ),
                    "communication": result.get(
                        "communication",
                        ""
                    ),
                    "improvements": result.get(
                        "improvements",
                        []
                    ),
                }

        except Exception as e:

            logger.warning(
                "Gemini evaluation parsing failed: %s",
                e
            )

    # ========================================================
    # Local Fallback
    # ========================================================

    score = calculate_fallback_score(
        answer,
        current_question,
        candidate.skills
    )

    completed = (
        question_number >= 5
    )

    # --------------------------------------------------------
    # Mark Voice Screening Completed
    # --------------------------------------------------------

    if completed:

        candidate.voice_screening_status = "COMPLETED"

        db.commit()

        db.refresh(candidate)

    # --------------------------------------------------------
    # NO NEXT QUESTION GENERATED HERE
    # --------------------------------------------------------

    next_question = ""

    if score >= 85:

        feedback = (
            "Excellent technical answer with strong "
            "practical understanding."
        )

    elif score >= 70:

        feedback = (
            "Good technical answer with relevant "
            "practical information."
        )

    elif score >= 50:

        feedback = (
            "The answer is relevant but needs "
            "more technical depth."
        )

    else:

        feedback = (
            "The answer needs more technical "
            "explanation and practical details."
        )

    strengths = []

    if len(answer.split()) >= 20:

        strengths.append(
            "Provided a detailed response."
        )

    else:

        strengths.append(
            "Attempted to answer the question."
        )

    if any(
        keyword in answer.lower()
        for keyword in [
            "python",
            "java",
            "api",
            "database",
            "sql",
            "fastapi",
            "backend",
            "frontend",
            "testing",
            "security",
            "performance",
            "scalability",
        ]
    ):

        strengths.append(
            "Mentioned relevant technical concepts."
        )

    return {
        "success": True,
        "candidate_name": candidate_name,
        "ai_response": (
            "Thank you for your answer."
        ),
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
        "strengths": strengths,
        "technical": (
            "The answer contains relevant "
            "technical information."
        ),
        "communication": (
            "The response is understandable, "
            "but could be more structured."
        ),
        "improvements": [
            "Explain the technical approach step by step.",
            "Include a practical example where possible.",
        ],
    }


# ============================================================
# STOP INTERVIEW
# ============================================================

@router.post("/interview/stop")
def stop_interview(
    req: StopInterviewRequest,
    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # Verify candidate
    # --------------------------------------------------------

    candidate = (
        db.query(Candidate)
        .filter(
            Candidate.id == req.candidate_id
        )
        .first()
    )

    if not candidate:

        raise HTTPException(
            status_code=404,
            detail="Candidate not found",
        )

    # --------------------------------------------------------
    # Voice Screening was NOT completed
    # --------------------------------------------------------

    candidate.voice_screening_status = "NOT COMPLETED"

    # --------------------------------------------------------
    # Calculate completed answer scores
    # --------------------------------------------------------

    valid_scores = []

    for score in req.scores:

        try:

            value = float(score)

            value = max(
                0,
                min(
                    100,
                    value
                )
            )

            valid_scores.append(
                value
            )

        except (
            ValueError,
            TypeError,
        ):

            continue

    # --------------------------------------------------------
    # Final score
    # --------------------------------------------------------

    if valid_scores:

        final_score = round(
            sum(valid_scores)
            / len(valid_scores),
            2
        )

    else:

        final_score = 0

    # --------------------------------------------------------
    # Determine stopped question
    # --------------------------------------------------------

    stopped_at_question = max(
        1,
        min(
            req.question_number,
            5
        )
    )

    answered_questions = len(
        valid_scores
    )

    # ========================================================
    # Generate Overall Feedback
    # ========================================================

    feedback = generate_overall_feedback(
        valid_scores,
        [],
        candidate.name or "Candidate"
    )

    # --------------------------------------------------------
    # Final decision
    # --------------------------------------------------------

    if final_score >= 70:

        decision = (
            "Recommended for Shortlisting"
        )

    elif final_score >= 50:

        decision = (
            "Needs Further Review"
        )

    elif answered_questions > 0:

        decision = (
            "Not Recommended"
        )

    else:

        decision = (
            "Interview Stopped Before Evaluation"
        )

    # --------------------------------------------------------
    # Save stopped status
    # --------------------------------------------------------

    db.commit()

    db.refresh(candidate)

    # --------------------------------------------------------
    # Response
    # --------------------------------------------------------

    return {

        "success": True,

        "candidate_id": candidate.id,

        "candidate_name": (
            candidate.name
            or "Candidate"
        ),

        "interview_stopped": True,

        "stopped_at_question": (
            stopped_at_question
        ),

        "answered_questions": (
            answered_questions
        ),

        "total_questions": 5,

        "scores": valid_scores,

        "final_score": final_score,

        "score": final_score,

        "decision": decision,

        "overall_feedback": feedback[
            "overall_feedback"
        ],

        "strengths": feedback[
            "strengths"
        ],

        "areas_to_improve": feedback[
            "areas_to_improve"
        ],

        "career_advice": feedback[
            "career_advice"
        ],

        "voice_screening_status": candidate.voice_screening_status,

        "message": (
            f"Interview stopped at question "
            f"{stopped_at_question}. "
            f"Final score based on "
            f"{answered_questions} completed answer(s): "
            f"{final_score}/100."
        ),

    }


# ============================================================
# FINAL INTERVIEW RESULT
# ============================================================

@router.post("/interview/final-result")
def final_interview_result(
    req: FinalResultRequest,
    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # Verify candidate
    # --------------------------------------------------------

    candidate = (
        db.query(Candidate)
        .filter(
            Candidate.id == req.candidate_id
        )
        .first()
    )

    if not candidate:

        raise HTTPException(
            status_code=404,
            detail="Candidate not found",
        )

    # --------------------------------------------------------
    # Final score from Interview Assistant
    # --------------------------------------------------------

    final_score = max(
        0,
        min(
            100,
            float(req.final_score)
        )
    )

    valid_scores = [
        final_score
    ]

    # --------------------------------------------------------
    # Interview Assistant completed
    # --------------------------------------------------------

    candidate.status = "pending"

    db.commit()

    db.refresh(candidate)

    # --------------------------------------------------------
    # Overall feedback
    # --------------------------------------------------------

    feedback = generate_overall_feedback(
        valid_scores,
        [],
        candidate.name or "Candidate"
    )

    # --------------------------------------------------------
    # Decision
    # --------------------------------------------------------

    if final_score >= 70:

        decision = (
            "Recommended for Shortlisting"
        )

    elif final_score >= 50:

        decision = (
            "Needs Further Review"
        )

    else:

        decision = (
            "Not Recommended"
        )

    # --------------------------------------------------------
    # Final response
    # --------------------------------------------------------

    return {

        "success": True,

        "candidate_id": candidate.id,

        "candidate_name": (
            candidate.name
            or "Candidate"
        ),

        "interview_completed": True,

        "total_questions": 5,

        "answered_questions": len(
            valid_scores
        ),

        "scores": valid_scores,

        "final_score": final_score,

        "score": final_score,

        "decision": decision,

        "overall_feedback": feedback[
            "overall_feedback"
        ],

        "strengths": feedback[
            "strengths"
        ],

        "areas_to_improve": feedback[
            "areas_to_improve"
        ],

        "career_advice": feedback[
            "career_advice"
        ],

        "voice_screening_status": candidate.voice_screening_status,

    }


# ============================================================
# Update Candidate Status
# ============================================================

@router.patch(
    "/candidates/{candidate_id}/status"
)
def update_candidate_status(
    candidate_id: str,
    body: StatusUpdate,
    db: Session = Depends(get_db),
):

    candidate = (
        db.query(Candidate)
        .filter(
            Candidate.id == candidate_id
        )
        .first()
    )

    if not candidate:

        raise HTTPException(
            status_code=404,
            detail="Candidate not found",
        )

    candidate.status = body.status

    db.commit()

    db.refresh(candidate)

    return {

        "success": True,

        "candidate_id": candidate.id,

        "new_status": candidate.status,

    }