/* ============================================================
   frontend-html/js/dashboard.js
   Dashboard Metrics & Recent Candidate Renderer
   ============================================================ */

document.addEventListener("DOMContentLoaded", loadDashboardData);

async function loadDashboardData() {
  const tbody = document.getElementById("recent-tbody");

  try {
    // 1. Fetch Candidate Records
    const candidates = await api.getCandidates();

    // 2. Try fetching aggregated dashboard stats (or fallback to local calculation)
    const stats = await api.getDashboardStats();

    updateDashboardCards(candidates, stats);

    // 3. Render Table
    if (!tbody) return;

    if (!candidates || candidates.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:28px; color:#64748b; font-size:13px;">
            No candidate records found in database.<br>
            <a href="upload.html" style="color:#2563eb; text-decoration:underline; font-weight:600; display:inline-block; margin-top:8px;">
              Upload a resume to get started →
            </a>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = candidates.map(c => {
      const skillsList = extractSkillsArray(c.skills);
      const displaySkills = skillsList.length > 0 
        ? skillsList.slice(0, 4).join(", ") 
        : "N/A";

      const status = (c.status || "processed").toUpperCase();
      const statusClass = getStatusBadgeStyle(status);

      return `
        <tr>
          <td style="font-weight:600; color:#0f172a;">${escapeHtml(c.name || "Unnamed Candidate")}</td>
          <td>${escapeHtml(c.experience_years || "0")} yrs</td>
          <td>${escapeHtml(displaySkills)}</td>
          <td>
            <span class="status-badge" style="${statusClass}">
              ${escapeHtml(status)}
            </span>
          </td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error("Dashboard failed to load:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:24px; color:#dc2626; font-size:13px;">
            ❌ Unable to connect to backend server.<br>
            <span style="font-size:11px; color:#64748b;">
              Ensure FastAPI backend is running at <strong>http://127.0.0.1:8000</strong>
            </span>
          </td>
        </tr>`;
    }
  }
}

function updateDashboardCards(candidates = [], stats = null) {
  const totalElem = document.getElementById("stat-total");
  const uploadsElem = document.getElementById("stat-uploads");
  const expElem = document.getElementById("stat-exp");
  const skillsElem = document.getElementById("stat-skills");

  const totalCount = stats?.total_candidates ?? candidates.length;
  const totalUploads = stats?.total_uploads ?? candidates.length;

  if (totalElem) totalElem.textContent = totalCount;
  if (uploadsElem) uploadsElem.textContent = totalUploads;

  // Calculate Average Experience
  if (expElem) {
    if (stats?.avg_experience !== undefined) {
      expElem.textContent = `${stats.avg_experience} yrs`;
    } else if (candidates.length > 0) {
      const totalExp = candidates.reduce((sum, c) => sum + (parseFloat(c.experience_years) || 0), 0);
      const avg = (totalExp / candidates.length).toFixed(1);
      expElem.textContent = `${avg} yrs`;
    } else {
      expElem.textContent = "0 yrs";
    }
  }

  // Calculate Unique Extracted Skills
  if (skillsElem) {
    if (stats?.total_skills_extracted !== undefined) {
      skillsElem.textContent = stats.total_skills_extracted;
    } else {
      const allSkills = new Set();
      candidates.forEach(c => {
        extractSkillsArray(c.skills).forEach(s => allSkills.add(s.toLowerCase()));
      });
      skillsElem.textContent = allSkills.size;
    }
  }
}

function extractSkillsArray(rawSkills) {
  if (Array.isArray(rawSkills)) return rawSkills;
  if (typeof rawSkills === "string") {
    try {
      const parsed = JSON.parse(rawSkills);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return rawSkills.split(",").map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function getStatusBadgeStyle(status) {
  switch (status.toLowerCase()) {
    case "shortlisted":
      return "background:#dcfce7; color:#166534; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;";
    case "scheduled":
    case "interview scheduled":
      return "background:#fef3c7; color:#92400e; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;";
    case "rejected":
      return "background:#fee2e2; color:#991b1b; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;";
    default:
      return "background:#f1f5f9; color:#475569; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;";
  }
}

function escapeHtml(val) {
  return String(val ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}