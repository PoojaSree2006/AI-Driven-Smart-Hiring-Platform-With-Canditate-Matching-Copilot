"""
backend/app/main.py
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, engine
from app.routes import upload, candidate, job_posting

settings = get_settings()

# Initialize DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

# Global CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route registration — verify candidate.router is explicitly registered here
app.include_router(upload.router)
app.include_router(candidate.router)
app.include_router(job_posting.router)


@app.get("/")
def root():
    return {"status": "ok", "app": settings.APP_NAME}