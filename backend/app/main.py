from __future__ import annotations

"""
backend/app/main.py
===================
FastAPI Main Application Entry Point with CORS Middleware
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import upload, candidate, job_posting, interview

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
)

# Robust CORS Configuration for all Localhost Ports
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
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
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