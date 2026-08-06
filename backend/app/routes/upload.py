"""
routes/upload.py
==================
POST /upload — thin route layer, delegates all logic to candidate_service.
"""

from typing import List
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import candidate_service
from app.schemas.candidate import UploadResponse, CandidateResponse
from app.utils.exceptions import InvalidFileError, ResumeParsingError, ExtractionError

router = APIRouter(tags=["Upload"])


@router.post("/upload", response_model=UploadResponse)
def upload_resume(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        candidate = candidate_service.process_resume_upload(file, db)
        return UploadResponse(
            success=True,
            candidate=CandidateResponse.model_validate(candidate),
        )
    except InvalidFileError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ResumeParsingError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {exc}")

@router.post("/upload-multiple")
def upload_multiple(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    uploaded = []
    failed = []
    for file in files:
        try:
            candidate = candidate_service.process_resume_upload(file, db)
            uploaded.append({
                "id": candidate.id,
                "name": candidate.name,
                "filename": file.filename
            })
        except Exception as e:
            failed.append({
                "filename": file.filename,
                "error": str(e)
            })
    return {
        "success": True,
        "uploaded": uploaded,
        "failed": failed,
        "total_uploaded": len(uploaded),
        "total_failed": len(failed)
    }