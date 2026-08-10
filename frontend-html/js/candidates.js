/* ==============================
   js/candidates.js
   Handles candidate list view, search, delete, and detail modal.
   Renders internships, certifications, work history, and education.
   ============================== */

let searchDebounceTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  renderSidebar("candidates");

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        loadCandidates(e.target.value.trim());
      }, 300);
    });
  }

  const closeBtn = document.getElementById("modal-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  const overlay = document.getElementById("modal-overlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") closeModal();
    });
  }

  loadCandidates();
});

async function loadCandidates(search = "") {
  const tbody = document.getElementById("candidates-tbody");
  if (!tbody) return;

  try {
    const candidates = await api.getCandidates(search);
    renderTable(candidates);
  } catch (err) {
    console.error("Error loading candidates:", err);
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">Failed to load candidates. Please check backend server.</td>
      </tr>
    `;
  }
}

function renderTable(candidates) {
  const tbody = document.getElementById("candidates-tbody");
  if (!tbody) return;

  if (!candidates || candidates.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">No candidates found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = candidates.map(c => `
    <tr>
      <td class="primary">
        <strong>${escapeHtml(c.name) || "—"}</strong>
      </td>

      <td>${escapeHtml(c.email) || "—"}</td>

      <td>
        ${c.experience_years ? escapeHtml(c.experience_years) + " yrs" : "—"}
      </td>

      <td>
        ${skillTagsHTML(c.skills || [], 3)}
      </td>

      <td style="text-align:right;">
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button class="action-btn view" onclick="viewCandidate('${c.id}')" title="View Candidate Profile">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>

          <button class="action-btn danger" onclick="deleteCandidateRow('${c.id}')" title="Delete Candidate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function deleteCandidateRow(id) {
  if (!confirm("Delete this candidate permanently?")) return;

  try {
    await api.deleteCandidate(id);
    const currentSearch = document.getElementById("search-input")?.value.trim() || "";
    loadCandidates(currentSearch);
  } catch (err) {
    alert("Failed to delete candidate: " + (err.message || err));
  }
}

async function viewCandidate(id) {
  try {
    const candidate = await api.getCandidate(id);
    renderModal(candidate);

    const overlay = document.getElementById("modal-overlay");
    if (overlay) {
      overlay.classList.add("open");
    }
  } catch (err) {
    alert("Failed to load candidate details: " + (err.message || err));
  }
}

function renderModal(candidate) {
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");

  if (modalTitle) {
    modalTitle.textContent = candidate.name || "Candidate Profile";
  }

  if (!modalBody) return;

  // Work History
  let experienceHtml = "";
  if (candidate.experience && candidate.experience.length > 0) {
    experienceHtml = `
      <div style="margin-top:16px;">
        <strong style="font-size:13px; color:var(--text-main);">Work Experience</strong>
        <div style="margin-top:6px;">
          ${candidate.experience.map(exp => `
            <div style="margin-bottom:8px;">
              <p style="margin:0; font-size:13px; font-weight:600; color:var(--text-main);">
                ${escapeHtml(exp.title || "Role")} ${exp.company ? "at " + escapeHtml(exp.company) : ""}
              </p>
              ${exp.duration ? `<small style="color:var(--text-muted);">${escapeHtml(exp.duration)}</small>` : ""}
              ${exp.description ? `<p style="margin:2px 0 0 0; font-size:12px; color:var(--text-muted);">${escapeHtml(exp.description)}</p>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  // Internships Display Block
  let internshipsHtml = "";
  if (candidate.internships && candidate.internships.length > 0) {
    internshipsHtml = `
      <div style="margin-top:16px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
        <strong style="font-size:13px; color:var(--primary-color);">💼 Internships & Industrial Training</strong>
        <div style="margin-top:6px;">
          ${candidate.internships.map(i => `
            <div style="margin-bottom:8px; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
              <p style="margin:0; font-size:13px; font-weight:600; color:var(--text-main);">
                ${escapeHtml(i.role || "Intern")} ${i.company ? "at " + escapeHtml(i.company) : ""}
              </p>

              ${i.duration ? `<small style="color:var(--text-muted); display:block;">${escapeHtml(i.duration)}</small>` : ""}

              ${i.description ? `<p style="margin:4px 0 0 0; font-size:12px; color:var(--text-muted);">${escapeHtml(i.description)}</p>` : ""}

              ${i.technologies && i.technologies.length > 0 ? `
                <div style="margin-top:4px;">
                  ${i.technologies.map(t => `<span class="skill-tag" style="font-size:10px;">${escapeHtml(t)}</span>`).join("")}
                </div>
              ` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  // Education
  let educationHtml = "";
  if (candidate.education && candidate.education.length > 0) {
    educationHtml = `
      <div style="margin-top:16px;">
        <strong style="font-size:13px; color:var(--text-main);">Education</strong>
        <div style="margin-top:6px;">
          ${candidate.education.map(e => `
            <p style="margin:2px 0; font-size:12px; color:var(--text-muted);">
              <b>${escapeHtml(e.degree || "Degree")}</b> ${e.institution ? "— " + escapeHtml(e.institution) : ""} ${e.year ? "(" + escapeHtml(e.year) + ")" : ""}
            </p>
          `).join("")}
        </div>
      </div>
    `;
  }

  // Trainings & Certifications
  let trainingsHtml = "";
  if (candidate.trainings && candidate.trainings.length > 0) {
    trainingsHtml = `
      <div style="margin-top:16px;">
        <strong style="font-size:13px; color:var(--text-main);">Certifications & Professional Courses</strong>
        <div style="margin-top:6px;">
          ${candidate.trainings.map(t => `
            <p style="margin:2px 0; font-size:12px; color:var(--text-muted);">
              &bull; <b>${escapeHtml(t.title || "Certification")}</b> ${t.issuer_or_platform ? "— " + escapeHtml(t.issuer_or_platform) : ""} ${t.year ? "(" + escapeHtml(t.year) + ")" : ""}
            </p>
          `).join("")}
        </div>
      </div>
    `;
  }

  modalBody.innerHTML = `
    <dl class="info-grid">
      <dt>Email</dt>
      <dd>${candidate.email ? `<a href="mailto:${escapeHtml(candidate.email)}">${escapeHtml(candidate.email)}</a>` : "—"}</dd>

      <dt>Phone</dt>
      <dd>${escapeHtml(candidate.phone) || "—"}</dd>

      <dt>Location</dt>
      <dd>${escapeHtml(candidate.location) || "—"}</dd>

      <dt>Experience</dt>
      <dd>${candidate.experience_years ? escapeHtml(candidate.experience_years) + " yrs" : "—"}</dd>

      <dt>LinkedIn</dt>
      <dd>${candidate.linkedin ? `<a href="${escapeHtml(candidate.linkedin)}" target="_blank" rel="noopener">${escapeHtml(candidate.linkedin)}</a>` : "—"}</dd>

      <dt>GitHub</dt>
      <dd>${candidate.github ? `<a href="${escapeHtml(candidate.github)}" target="_blank" rel="noopener">${escapeHtml(candidate.github)}</a>` : "—"}</dd>
    </dl>

    <div style="margin-top:16px;">
      <strong style="font-size:13px; color:var(--text-main);">Extracted Skills</strong>
      <div style="margin-top:8px;">
        ${candidate.skills && candidate.skills.length > 0 ? skillTagsHTML(candidate.skills) : '<span style="color:var(--text-muted); font-size:12px;">No skills detected</span>'}
      </div>
    </div>

    ${experienceHtml}
    ${internshipsHtml}
    ${educationHtml}
    ${trainingsHtml}
  `;
}

function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  if (overlay) {
    overlay.classList.remove("open");
  }
}