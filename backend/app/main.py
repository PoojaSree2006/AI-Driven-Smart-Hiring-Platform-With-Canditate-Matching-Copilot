from __future__ import annotations

"""
backend/app/main.py
===================
FastAPI Main Application Entry Point with CORS Middleware and DB Initialization.
"""

import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure 'backend' directory is always in sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings
from app.database import engine, Base
from app.models import candidate as candidate_model, job_posting as job_model
from app.routes import upload, candidate, job_posting, interview

settings = get_settings()

# Auto-create all database tables on startup (works for MySQL and SQLite fallback)
try:
    Base.metadata.create_all(bind=engine)
except Exception as exc:
    print(f"[Database Initialization Warning] Could not auto-create tables: {exc}")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
)

# Robust CORS Configuration: Allow all localhost, 127.0.0.1 ports, and any Vercel domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|.*\.vercel\.app)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(upload.router)
app.include_router(candidate.router)
app.include_router(job_posting.router)
app.include_router(interview.router)


@app.get("/")
def root():
    return {"message": "AI Driven Smart Hiring Platform API is running"}