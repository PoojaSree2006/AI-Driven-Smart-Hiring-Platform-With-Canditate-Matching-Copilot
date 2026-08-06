"""
utils/exceptions.py
=====================
Custom domain exceptions used across services.

MODIFIED — Milestone 2: added JobPostingNotFoundError.
Everything else is unchanged from Milestone 1.
"""


class RecruitmentCopilotError(Exception):
    """Base exception for all domain-specific errors in this app."""
    pass


class InvalidFileError(RecruitmentCopilotError):
    """Raised when an uploaded file fails validation (type, size, etc.)."""
    pass


class ResumeParsingError(RecruitmentCopilotError):
    """Raised when a resume file cannot be read or contains no usable text."""
    pass


class ExtractionError(RecruitmentCopilotError):
    """Raised when structured field extraction from raw text fails unexpectedly."""
    pass


class CandidateNotFoundError(RecruitmentCopilotError):
    """Raised when a candidate ID does not exist in the database."""
    pass


class JobPostingNotFoundError(RecruitmentCopilotError):
    """NEW — Milestone 2. Raised when a job posting ID does not exist."""
    pass