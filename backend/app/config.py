from __future__ import annotations

"""
config.py
=========
Centralized application configuration.
Fully compatible with Python 3.8, Pydantic v2, local dev, and Vercel serverless.
"""

import os
import tempfile
from pathlib import Path
from functools import lru_cache
from typing import Tuple, List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

# ------------------------------------------------------------------
# Base directory of the backend app.
# ------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent

# Detect if running in serverless / Vercel cloud environment
IS_VERCEL = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))


class Settings(BaseSettings):
    """
    Application-wide settings, loaded from environment variables
    with safe defaults for local and cloud serverless runs.
    """

    # --- App Metadata ---
    APP_NAME: str = "AI Recruitment Copilot API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # --- Server ---
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # --- Direct Database URL override (e.g. Supabase, Aiven, or SQLite) ---
    DATABASE_URL_OVERRIDE: Optional[str] = None

    # --- MySQL Database Defaults ---
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = "root"
    DB_NAME: str = "recruitment_copilot"

    # --- API Keys & External Integrations ---
    GEMINI_API_KEY: str = ""

    # --- File Storage Paths ---
    # On Vercel, only /tmp is writeable; locally, use backend/ subdirectories
    UPLOAD_DIR: Path = Path(tempfile.gettempdir()) / "uploads" if IS_VERCEL else BASE_DIR / "uploads"
    EXTRACTED_DATA_DIR: Path = Path(tempfile.gettempdir()) / "extracted_data" if IS_VERCEL else BASE_DIR / "extracted_data"

    # --- Upload Validation Rules ---
    MAX_FILE_SIZE_MB: int = 10
    ALLOWED_EXTENSIONS: Tuple[str, ...] = (".pdf", ".docx")

    # --- CORS Configuration ---
    CORS_ORIGINS: List[str] = [
        "http://localhost",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "*",
    ]

    @property
    def DATABASE_URL(self) -> str:
        """
        Returns connection string:
        1. Direct environment variable DATABASE_URL if explicitly set.
        2. SQLite fallback if on Vercel without a cloud MySQL host.
        3. MySQL via PyMySQL for local development.
        """
        raw_url = os.getenv("DATABASE_URL") or self.DATABASE_URL_OVERRIDE
        if raw_url:
            return raw_url

        # Prevent Vercel from crashing trying to reach non-existent localhost MySQL
        if IS_VERCEL and (self.DB_HOST in ("localhost", "127.0.0.1")):
            sqlite_path = Path(tempfile.gettempdir()) / "recruitment_copilot.db"
            return f"sqlite:///{sqlite_path}"

        return URL.create(
            drivername="mysql+pymysql",
            username=self.DB_USER,
            password=self.DB_PASSWORD,
            host=self.DB_HOST,
            port=self.DB_PORT,
            database=self.DB_NAME,
            query={"charset": "utf8mb4"},
        ).render_as_string(hide_password=False)

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    model_config = SettingsConfigDict(
        env_file=[
            str(BASE_DIR.parent / ".env"),
            str(BASE_DIR / ".env"),
        ],
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()

    # Safely ensure writeable folders exist without throwing Read-only OS errors
    try:
        settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        settings.EXTRACTED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

    return settings