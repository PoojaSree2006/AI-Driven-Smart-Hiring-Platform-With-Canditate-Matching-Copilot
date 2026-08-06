# AI Recruitment & Talent Management Copilot

An AI-powered recruitment platform that automates resume parsing, candidate profiling, job matching, hiring score calculation, and skill gap analysis. The system helps recruiters efficiently manage candidates and make data-driven hiring decisions.

---

## Features

### Resume Parsing & Candidate Profiling
- Upload single or multiple resumes (PDF, DOCX)
- Extract candidate details automatically
- Generate structured candidate profiles
- Manage and search candidates
- Resume upload history

### Analytics Dashboard
- Candidate statistics
- Top skills analysis
- Education distribution
- Experience distribution

### Matching & Skill Analysis
- Job posting management
- Candidate-job matching
- Hiring score calculation
- Skill gap analysis
- Candidate ranking

---

## Tech Stack

**Frontend**
- HTML5
- CSS3
- JavaScript
- Chart.js

**Backend**
- FastAPI
- Python

**Database**
- SQLite
- SQLAlchemy ORM

**Resume Processing**
- PyMuPDF
- python-docx
- Pydantic

---

## Project Structure

```
AI-Recruitment-Copilot/
│
├── backend/
│   ├── app/
│   ├── uploads/
│   └── requirements.txt
│
├── frontend-html/
│   ├── css/
│   ├── js/
│   └── *.html
│
└── README.md
```

---

## Installation

### Clone the repository

```bash
git clone https://github.com/PoojaSree2006/AI-Recruitment-Copilot.git
```

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at:

```
http://localhost:8000
```

### Frontend

```bash
cd frontend-html
python -m http.server 5500
```

Open:

```
http://localhost:5500
```

---

## Modules

- Dashboard
- Resume Upload
- Candidate Management
- Analytics
- Job Management
- Candidate Matching
- Skill Gap Analysis

---

## Future Enhancements

- AI Interview Question Generation
- Resume Ranking
- Email Notifications
- Interview Scheduling
- Authentication & Authorization

---

## Team

Developed as part of the **AI Recruitment & Talent Management Copilot** project.

---

## License

This project is intended for educational purposes.
