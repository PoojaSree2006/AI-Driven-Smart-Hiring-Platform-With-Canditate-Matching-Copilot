/* ==============================
   matching.js
   NEW FILE — Milestone 2.
   Powers the "Candidate Matching" and "Skill Gap Analysis" panels
   added to candidates.html. Independent of candidates.js (Milestone 1
   candidate list/search/delete logic is untouched).
   ============================== */

let currentJobId = null;

document.addEventListener("DOMContentLoaded", async () => {
  await loadJobDropdown();

  document.getElementById("match-job-select").addEventListener("change", (e) => {
    currentJobId = e.target.value || null;
    document.getElementById("skill-gap-panel").style.display = "none";
    if (currentJobId) {
      loadMatches(currentJobId);
    } else {
      document.getElementById("match-tbody").innerHTML =
        `<tr class="empty-row"><td colspan="4">Select a job posting to see ranked candidates.</td></tr>`;
    }
  });
});

async function loadJobDropdown() {
  const select = document.getElementById("match-job-select");
  try {
    const jobs = await api.getJobs();
    if (jobs.length === 0) {
      select.innerHTML = `<option value="">No job postings yet — create one first</option>`;
      return;
    }
    select.innerHTML =
      `<option value="">Select a job position…</option>` +
      jobs.map((j) => `<option value="${j.id}">${escapeHtml(j.title)}</option>`).join("");
  } catch (err) {
    select.innerHTML = `<option value="">Failed to load job postings</option>`;
  }
}

async function loadMatches(jobId) {
  const tbody = document.getElementById("match-tbody");
  tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Loading matches…</td></tr>`;

  try {
    const matches = await api.matchCandidates(jobId);

    if (matches.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No candidates to match against yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = matches.map((m) => `
      <tr>
        <td class="primary">${escapeHtml(m.name) || "—"}</td>
        <td>${skillTagsHTML(m.matched_skills, 4)}</td>
        <td>
          <span style="font-weight:600; color:${matchColor(m.match_percentage)};">
            ${m.match_percentage}%
          </span>
        </td>
        <td>
          <button class="btn-primary" style="padding:6px 12px; font-size:12px;" onclick="loadSkillGap('${m.id}')">
            View Skill Gap
          </button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Failed to load matches.</td></tr>`;
  }
}

function matchColor(pct) {
  if (pct >= 80) return "#15803d";   // green
  if (pct >= 50) return "#b45309";   // amber
  return "#b91c1c";                  // red
}

async function loadSkillGap(candidateId) {
  if (!currentJobId) return;

  const panel = document.getElementById("skill-gap-panel");
  panel.style.display = "block";
  document.getElementById("skill-gap-body").innerHTML = `<span class="loading-text">Loading…</span>`;

  try {
    const result = await api.getSkillGap(candidateId, currentJobId);
    renderSkillGap(result);
  } catch (err) {
    document.getElementById("skill-gap-body").innerHTML =
      `<p class="error-text">Failed to load skill gap: ${escapeHtml(err.message)}</p>`;
  }
}

function renderSkillGap(result) {
  document.getElementById("skill-gap-title").textContent =
    `Skill Gap: ${result.candidate_name || "Candidate"} → ${result.job_title}`;

  const rows = result.gaps.map((g) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--gray-100);">
      <span style="font-size:14px; color:var(--gray-800);">${escapeHtml(g.skill)}</span>
      <span style="font-size:12px; color:var(--gray-500);">Required: ${escapeHtml(g.required_level)}</span>
      <span class="status-badge ${g.status === "matched" ? "status-processed" : "status-failed"}">
        ${g.status === "matched" ? "Detected" : "Not Detected"}
      </span>
    </div>
  `).join("");

  document.getElementById("skill-gap-body").innerHTML = `
    <div style="margin-bottom:12px;">${rows}</div>
    <div class="card" style="background: var(--brand-50); border-color: var(--brand-100);">
      <strong style="font-size:13px; color:var(--brand-700);">Recommendation</strong>
      <p style="font-size:14px; color:var(--gray-800); margin:6px 0 0 0;">${escapeHtml(result.recommendation)}</p>
    </div>
  `;
}