"""
services/extractor.py
=======================
Responsible for STEP 6 and STEP 7 of the pipeline:
  - Extracting structured fields (name, email, phone, skills, etc.)
    from raw resume text using regex + heuristics
  - Assembling the final structured JSON shape

Why regex/heuristics instead of spaCy (or an LLM) by default:
----------------------------------------------------------------
Resumes are semi-structured text with huge format variance, but common
fields (email, phone, LinkedIn/GitHub URLs) follow strict, well-known
patterns that regex handles reliably and fast, with zero external model
dependency. Free-text fields (name, skills, education) use heuristics
based on common resume conventions (section headers, line position,
capitalization patterns). This trades some accuracy on unusual resume
formats for something fast, dependency-light, and fully deterministic
(same input always produces same output — useful for debugging).

If your team wants smarter free-text extraction later, spaCy's NER
(PERSON, ORG, GPE entities) can be layered in as a fallback specifically
for name/location detection when the regex/heuristic approach fails —
the functions below are structured so that swap is a small, local change.
"""

import re
from typing import Optional

from app.utils.exceptions import ExtractionError


# ======================================================================
# Reference data used by heuristic matchers
# ======================================================================

# A deliberately broad but common technical/professional skills list.
# The extractor looks for these as whole-word, case-insensitive matches
# inside the resume text. This list can be extended freely without
# touching any extraction logic.
KNOWN_SKILLS = [
    # Programming languages
    "Python", "Java", "JavaScript", "TypeScript", "C++", "C#", "Go", "Rust",
    "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R", "MATLAB",
    # Web / Frontend
    "React", "Angular", "Vue", "Next.js", "HTML", "CSS", "Tailwind CSS",
    "Redux", "jQuery", "Bootstrap",
    # Backend / Frameworks
    "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring Boot",
    "ASP.NET", "Ruby on Rails", "Laravel",
    # Data / ML
    "Machine Learning", "Deep Learning", "Data Analysis", "Data Science",
    "TensorFlow", "PyTorch", "Keras", "scikit-learn", "Pandas", "NumPy",
    "NLP", "Computer Vision", "Data Visualization",
    # Databases
    "SQL", "MySQL", "PostgreSQL", "MongoDB", "SQLite", "Redis",
    "Oracle", "Cassandra", "DynamoDB",
    # Cloud / DevOps
    "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Jenkins", "CI/CD",
    "Terraform", "Ansible", "Linux", "Git", "GitHub", "GitLab",
    # Project Management / Soft Skills (spec explicitly lists "Project Management")
    "Project Management", "Agile", "Scrum", "JIRA", "Leadership",
    "Communication", "Team Management",
    # Other common tools
    "REST API", "GraphQL", "Microservices", "Excel", "Power BI", "Tableau",
]

# Common degree keywords used to detect education lines.
DEGREE_KEYWORDS = [
    "Bachelor", "Master", "PhD", "Ph.D.", "B.Sc", "M.Sc", "BSc", "MSc",
    "B.Tech", "M.Tech", "BTech", "MTech", "MBA", "BBA", "B.E.", "M.E.",
    "Associate Degree", "Diploma", "B.A.", "M.A.", "BA ", "MA ",
]

# Resume section headers, used to slice raw text into logical blocks.
SECTION_HEADERS = {
    "experience": ["experience", "work experience", "employment history", "professional experience"],
    "education": ["education", "academic background", "qualifications"],
    "skills": ["skills", "technical skills", "core competencies"],
    "projects": ["projects", "personal projects", "academic projects"],
    "certifications": ["certifications", "certificates", "licenses"],
}
IGNORE_LOCATION_WORDS = [
    "college",
    "campus",
    "university",
    "institute",
    "department",
    "cgpa",
    "b.tech",
    "m.tech",
    "computer science",
    "data analytics",
    "machine learning",
    "artificial intelligence",
    "python",
    "sql",
    "skills",
    "education",
    "experience",
    "projects",
]

# ======================================================================
# Section splitting
# ======================================================================

def _split_into_sections(text: str) -> dict[str, str]:
    """
    Splits raw resume text into named sections based on common headers.

    Returns a dict like:
        {"experience": "...text under Experience header...", "education": "...", ...}

    Why this matters:
    ------------------
    Searching for "Python" or a degree keyword ANYWHERE in the resume
    risks false positives (e.g. a job description that mentions "Python"
    in passing counts fine, but a "Bachelor" mentioned in a cover letter
    line shouldn't be double-counted as two education entries). Slicing
    into sections first makes each downstream extractor's job narrower
    and more accurate.
    """
    lines = text.split("\n")
    # Build a reverse lookup: normalized header text -> section key
    header_lookup = {}
    for section_key, headers in SECTION_HEADERS.items():
        for header in headers:
            header_lookup[header.lower()] = section_key

    sections: dict[str, list[str]] = {key: [] for key in SECTION_HEADERS}
    current_section: Optional[str] = None

    for line in lines:
        stripped = line.strip()
        normalized = stripped.lower().rstrip(":")

        # A line counts as a section header if it's short (headers are
        # rarely full sentences) and matches a known header phrase.
        if len(normalized) < 40 and normalized in header_lookup:
            current_section = header_lookup[normalized]
            continue

        if current_section:
            sections[current_section].append(stripped)

    return {key: "\n".join(value) for key, value in sections.items()}


# ======================================================================
# Individual field extractors
# ======================================================================

def extract_email(text: str) -> Optional[str]:
    """Extracts the first valid-looking email address from the text."""
    match = re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text)
    return match.group(0) if match else None


def extract_phone(text: str) -> Optional[str]:
    """
    Extracts a phone number, tolerant of common formats:
    (555) 123-4567, 555-123-4567, +1 555 123 4567, 5551234567, etc.
    """
    pattern = r"(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"
    match = re.search(pattern, text)
    return match.group(0).strip() if match else None


def extract_linkedin(text: str) -> Optional[str]:
    """Extracts a LinkedIn profile URL, normalizing to include https://."""
    match = re.search(r"(https?://)?(www\.)?linkedin\.com/in/[A-Za-z0-9\-_%]+/?", text, re.IGNORECASE)
    if not match:
        return None
    url = match.group(0)
    if not url.startswith("http"):
        url = "https://" + url
    return url.rstrip("/")


def extract_github(text: str) -> Optional[str]:
    """
    Extracts a GitHub profile URL.

    Excludes github.com/<user>/<repo> style links by only matching
    profile-root URLs (github.com/username with nothing after it),
    to avoid mistaking a linked project repo for the candidate's profile.
    """
    match = re.search(r"(https?://)?(www\.)?github\.com/([A-Za-z0-9\-_]+)/?(?![A-Za-z0-9\-_/])", text, re.IGNORECASE)
    if not match:
        return None
    url = match.group(0)
    if not url.startswith("http"):
        url = "https://" + url
    return url.rstrip("/")


def extract_name(text: str) -> Optional[str]:
    """
    Heuristic: a resume's candidate name is almost always the first
    non-empty line, and is short (2-4 words), title-cased, and doesn't
    contain digits, @ symbols, or common header words.

    This is intentionally simple rather than using NER — the "name is
    the first line" convention holds for the vast majority of resume
    templates, including the one in the reference UI screenshot.
    """
    lines = [line.strip() for line in text.split("\n") if line.strip()]

    for line in lines[:5]:  # only check the first few lines
        if _looks_like_name(line):
            return line

    return None


def _looks_like_name(line: str) -> bool:
    """Helper: checks whether a line plausibly contains a person's name."""
    if not (2 <= len(line.split()) <= 4):
        return False
    if any(char.isdigit() for char in line):
        return False
    if "@" in line or "http" in line.lower():
        return False
    # Reject lines that are clearly section headers or contact info labels
    reject_words = {"resume", "cv", "curriculum", "vitae", "phone", "email", "address"}
    if any(word in line.lower() for word in reject_words):
        return False
    # A real name is mostly alphabetic characters (allowing spaces, periods, hyphens)
    letters_ratio = sum(char.isalpha() or char.isspace() for char in line) / max(len(line), 1)
    return letters_ratio > 0.8


def extract_location(text: str) -> Optional[str]:
    """
    Extract the candidate's location from the contact section while
    avoiding education, skills and project lines.
    """

    lines = [line.strip() for line in text.split("\n")[:15] if line.strip()]

    for line in lines:

        lower = line.lower()

        # Skip obvious non-location lines
        if any(word in lower for word in IGNORE_LOCATION_WORDS):
            continue

        # Skip URLs
        if "http" in lower or "linkedin" in lower or "github" in lower:
            continue

        # Skip emails
        if "@" in line:
            continue

        # Skip phone numbers
        if re.search(r"\d{10}", line.replace(" ", "").replace("-", "")):
            continue

        # Match "City, State"
        match = re.search(
            r"\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*),\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)\b",
            line,
        )

        if match:
            return match.group(0)

    return None


def extract_skills(text: str, sections: dict[str, str]) -> list[str]:
    """
    Matches known skills (whole-word, case-insensitive) against the
    dedicated Skills section if found, otherwise falls back to
    scanning the full resume text.
    """
    search_text = sections.get("skills") or text
    found: list[str] = []

    for skill in KNOWN_SKILLS:
        # \b word boundaries prevent partial matches (e.g. "Java" matching
        # inside "JavaScript"). re.escape handles skills with special
        # regex characters like "C++" or "C#".
        pattern = r"\b" + re.escape(skill) + r"\b"
        if re.search(pattern, search_text, re.IGNORECASE):
            found.append(skill)

    return found


def extract_certifications(sections: dict[str, str]) -> list[str]:
    """
    Extracts certification entries as a list of non-empty lines from
    the Certifications section. Kept simple (line-per-entry) since
    certifications are almost always listed one-per-line.
    """
    cert_text = sections.get("certifications", "")
    if not cert_text:
        return []

    lines = [line.strip("•-  \t") for line in cert_text.split("\n")]
    return [line for line in lines if line and len(line) > 3]


def extract_education(sections: dict[str, str]) -> list[dict]:
    """
    Extracts education entries from the Education section.

    Each line containing a degree keyword becomes one education entry.
    We attempt to pull a 4-digit year (graduation year) from the same
    line if present. Institution is taken as remaining text on the line,
    which is imperfect but works well for the common
    "Bachelor of Science, XYZ University, 2020" format.
    """
    edu_text = sections.get("education", "")
    if not edu_text:
        return []

    entries = []
    year_pattern = r"\b(19|20)\d{2}\b"

    for line in edu_text.split("\n"):
        line = line.strip("•-  \t")
        if not line:
            continue
        if any(keyword.lower() in line.lower() for keyword in DEGREE_KEYWORDS):
            year_match = re.search(year_pattern, line)
            year = year_match.group(0) if year_match else None

            # Remove the year from the line before treating the rest as
            # "degree, institution" text, then split on common delimiters.
            cleaned = re.sub(year_pattern, "", line).strip(" ,-")
            parts = re.split(r",|\||-{1,2}\s", cleaned)
            degree = parts[0].strip() if parts else cleaned
            institution = parts[1].strip() if len(parts) > 1 else None

            entries.append({
                "degree": degree or None,
                "institution": institution,
                "year": year,
            })

    return entries


def extract_experience(sections: dict[str, str]) -> list[dict]:
    """
    Extracts work experience entries from the Experience section.

    Heuristic: a new experience entry starts at a line containing a
    date range (e.g. "Jan 2020 - Present", "2019 - 2021"). Everything
    between one date-range line and the next is treated as belonging
    to that entry, with the first non-date line assumed to be the
    "Title, Company" line and the rest as description.
    """
    exp_text = sections.get("experience", "")
    if not exp_text:
        return []

    date_range_pattern = (
        r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?\d{4}|\d{4})"
        r"\s?[-–—to]{1,4}\s?"
        r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?\d{4}|\d{4}|Present|Current)"
    )

    lines = [line.strip("•-  \t") for line in exp_text.split("\n") if line.strip()]
    entries = []
    current_entry: Optional[dict] = None

    for line in lines:
        date_match = re.search(date_range_pattern, line, re.IGNORECASE)

        if date_match:
            # Start a new experience entry
            if current_entry:
                entries.append(current_entry)

            duration = date_match.group(0)
            # The rest of the line (minus the date) is likely "Title, Company"
            title_company = line.replace(duration, "").strip(" ,-|")
            title_parts = re.split(r",|\|", title_company)

            current_entry = {
                "title": title_parts[0].strip() if title_parts and title_parts[0].strip() else None,
                "company": title_parts[1].strip() if len(title_parts) > 1 else None,
                "duration": duration.strip(),
                "description": "",
            }
        elif current_entry:
            # Accumulate description lines under the current entry
            current_entry["description"] = (current_entry["description"] + " " + line).strip()

    if current_entry:
        entries.append(current_entry)

    return entries


def extract_projects(sections: dict[str, str]) -> list[dict]:
    """
    Extracts project entries from the Projects section.

    Heuristic: each non-indented, title-like line starts a new project;
    subsequent lines are its description, from which we also mine any
    known technology names (reusing KNOWN_SKILLS) mentioned.
    """
    proj_text = sections.get("projects", "")
    if not proj_text:
        return []

    lines = [line.strip("•-  \t") for line in proj_text.split("\n") if line.strip()]
    entries = []
    current_entry: Optional[dict] = None

    for line in lines:
        # A short line (<12 words) with no lowercase-starting sentence
        # structure is likely a project title rather than a description bullet.
        is_title_like = len(line.split()) <= 12 and not line.endswith(".")

        if is_title_like and (current_entry is None or _looks_like_new_project_title(line)):
            if current_entry:
                entries.append(current_entry)
            current_entry = {"name": line, "description": "", "technologies": []}
        elif current_entry:
            current_entry["description"] = (current_entry["description"] + " " + line).strip()

    if current_entry:
        entries.append(current_entry)

    # Mine technology mentions out of each project's own description
    for entry in entries:
        combined = entry["name"] + " " + entry["description"]
        entry["technologies"] = [
            skill for skill in KNOWN_SKILLS
            if re.search(r"\b" + re.escape(skill) + r"\b", combined, re.IGNORECASE)
        ]

    return entries


def _looks_like_new_project_title(line: str) -> bool:
    """Helper: a rough signal that a line starts a new project block."""
    # Titles often start with a capital letter and aren't full sentences.
    return line[:1].isupper() and not line[:1].islower()


def extract_experience_years(sections: dict[str, str], full_text: str) -> Optional[str]:
    """
    Attempts to find an explicit "X years of experience" statement
    anywhere in the resume (often in a summary/objective section).
    Falls back to None if not found — the frontend/analytics layer
    should treat missing experience as "unknown", not zero.
    """
    match = re.search(r"(\d+)\+?\s*years?\s*(of)?\s*experience", full_text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


# ======================================================================
# Main entry point
# ======================================================================

def extract_candidate_info(raw_text: str) -> dict:
    """
    Runs the full extraction pipeline over raw resume text and returns
    the structured JSON shape described in the project spec (Step 7).

    This is the single function that services/parser.py's output feeds
    into, and that routes/upload.py calls after parsing.
    """
    try:
        sections = _split_into_sections(raw_text)

        return {
            "name": extract_name(raw_text),
            "email": extract_email(raw_text),
            "phone": extract_phone(raw_text),
            "location": extract_location(raw_text),
            "linkedin": extract_linkedin(raw_text),
            "github": extract_github(raw_text),
            "experience_years": extract_experience_years(sections, raw_text),
            "skills": extract_skills(raw_text, sections),
            "education": extract_education(sections),
            "experience": extract_experience(sections),
            "projects": extract_projects(sections),
            "certifications": extract_certifications(sections),
        }

    except Exception as exc:
        # Any unexpected failure in extraction shouldn't crash the whole
        # upload — but we DO want to know about it, so we wrap it in our
        # domain exception rather than silently returning an empty dict.
        raise ExtractionError(f"Failed to extract candidate information: {exc}") from exc