"""
config.py
=========
Centralized application configuration.

Why this exists:
-----------------
Instead of scattering `os.getenv()` calls (and their default-value bugs)
across services and routes, we load all environment-driven settings
into a single validated `Settings` object using pydantic-settings.

This gives us:
- Type validation at startup (fail fast if something is misconfigured)
- Autocomplete/IDE support wherever settings are used
- A single source of truth for paths, limits, and DB config
"""

from pathlib import Path
from functools import lru_cache
from typing import Tuple
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


# ------------------------------------------------------------------
# Base directory of the backend app (used to build absolute paths).
# This file lives at: backend/app/config.py
# BASE_DIR resolves to: backend/
# ------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """
    Application-wide settings, loaded from environment variables
    (and falling back to the defaults below if not set in .env).
    """

    # --- App Metadata ---
    APP_NAME: str = "AI Recruitment Copilot API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # --- Server ---
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # --- MySQL Database ---
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "recruitment_copilot"

    # --- File Storage Paths ---
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    EXTRACTED_DATA_DIR: Path = BASE_DIR / "extracted_data"

    # --- Upload Validation Rules ---
    MAX_FILE_SIZE_MB: int = 10
    ALLOWED_EXTENSIONS: Tuple[str, ...] = (".pdf", ".docx")

    CORS_ORIGINS: list[str] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]

    @property
    def DATABASE_URL(self) -> str:
        """
        Builds the SQLAlchemy connection URL for MySQL via PyMySQL.

        We use SQLAlchemy's URL.create() instead of an f-string so that
        special characters in DB_PASSWORD (e.g. @, #, /, %) are correctly
        percent-encoded. Hand-building this string with an f-string is a
        common source of "connection refused" bugs that are actually
        just malformed URLs.
        """
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
        """Convert MB limit to bytes for direct comparison against file size."""
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR.parent / ".env"),  # .env at project root
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """
    Returns a cached Settings instance.

    Using lru_cache means the .env file is read and validated only once
    per process, and the same Settings object is reused everywhere via
    dependency injection (FastAPI's Depends(get_settings)).
    """
    settings = Settings()

    # Ensure required directories exist at startup, not on first request.
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    settings.EXTRACTED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    return settings