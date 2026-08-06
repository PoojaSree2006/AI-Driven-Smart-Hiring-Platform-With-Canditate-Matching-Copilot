# Recruitment Copilot — Static Frontend (HTML/CSS/JS)

This replaces the React + Vite frontend with plain HTML, CSS, and vanilla
JavaScript. It talks to the same FastAPI backend on `http://localhost:8000` —
**no backend API changes required.**

## Why a local server (not double-clicking the HTML file)

Opening `index.html` directly via `file://` will cause the browser to send
`Origin: null` on API requests, which the backend's CORS policy will reject.
Serve the folder over `http://localhost` instead — any of these work:

**Option A — Python (already installed, since you have it for the backend):**
```powershell
cd frontend-html
python -m http.server 5500
```
Then open http://localhost:5500

**Option B — VS Code "Live Server" extension:**
Right-click `index.html` → "Open with Live Server" (defaults to port 5500).

## One required backend change: CORS origin

Add `http://localhost:5500` (and `http://127.0.0.1:5500`) to `CORS_ORIGINS`
in `backend/app/config.py`:

```python
CORS_ORIGINS: list[str] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]
```

Restart the backend after this change.

## Folder structure

```
frontend-html/
├── index.html          Dashboard
├── upload.html          Resume Upload
├── candidates.html      Candidates
├── analytics.html       Analytics
├── jobs.html             Job Postings (placeholder)
├── settings.html         Settings (placeholder)
├── css/
│   └── style.css        All shared styles (replaces Tailwind)
└── js/
    ├── api.js            fetch-based API client (replaces Axios)
    ├── sidebar.js         Reusable sidebar nav (replaces Sidebar.jsx)
    ├── components.js      Skill tag / status badge helpers
    ├── dashboard.js        Dashboard page logic
    ├── upload.js           Upload page logic
    ├── candidates.js       Candidates page logic
    └── analytics.js        Analytics page logic (Chart.js via CDN)
```

## Running everything together

1. Start MySQL (if not already running as a service)
2. Start the backend: `cd backend && .\venv\Scripts\Activate.ps1 && uvicorn app.main:app --reload`
3. Serve the frontend: `cd frontend-html && python -m http.server 5500`
4. Open http://localhost:5500