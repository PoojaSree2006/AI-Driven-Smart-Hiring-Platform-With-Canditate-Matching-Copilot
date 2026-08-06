/* ==============================
   candidates.js
   Handles search, table render,
   view modal and delete.
   ============================== */

let searchDebounceTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  renderSidebar("candidates");

  document.getElementById("search-input").addEventListener("input", (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      loadCandidates(e.target.value);
    }, 300);
  });

  document.getElementById("modal-close").addEventListener("click", closeModal);

  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });

  loadCandidates();
});

async function loadCandidates(search = "") {
  const tbody = document.getElementById("candidates-tbody");

  try {
    const candidates = await api.getCandidates(search);
    renderTable(candidates);
  } catch (err) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">Failed to load candidates.</td>
      </tr>
    `;
  }
}

function renderTable(candidates) {
  const tbody = document.getElementById("candidates-tbody");

  if (!candidates || candidates.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">No candidates found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = candidates.map(c => `
    <tr>
      <td class="primary">${escapeHtml(c.name) || "—"}</td>

      <td>${escapeHtml(c.email) || "—"}</td>

      <td>
        ${c.experience_years
          ? escapeHtml(c.experience_years) + " yrs"
          : "—"}
      </td>

      <td>
        ${skillTagsHTML(c.skills || [], 3)}
      </td>

      <td>${escapeHtml(c.location) || "—"}</td>

      <td>
        <div style="display:flex;justify-content:flex-end;gap:8px;">

          <button
            class="action-btn view"
            onclick="viewCandidate('${c.id}')"
            title="View">

            <svg viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor"
                 stroke-width="2">

              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>

          </button>

          <button
            class="action-btn danger"
            onclick="deleteCandidateRow('${c.id}')"
            title="Delete">

            <svg viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor"
                 stroke-width="2">

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

  if (!confirm("Delete this candidate permanently?"))
    return;

  try {
    await api.deleteCandidate(id);

    loadCandidates(document.getElementById("search-input").value);

  } catch (err) {

    alert("Failed to delete candidate.\n\n" + err.message);

  }
}

async function viewCandidate(id) {

  try {

    const candidate = await api.getCandidate(id);

    renderModal(candidate);

    document
      .getElementById("modal-overlay")
      .classList.add("open");

  } catch (err) {

    alert("Failed to load candidate.");

  }
}

function renderModal(candidate) {

  document.getElementById("modal-title").textContent =
    candidate.name || "Candidate";

  let educationHtml = "";

  if (candidate.education && candidate.education.length > 0) {

    educationHtml = `
      <div style="margin-top:18px;">
        <strong>Education</strong>

        ${candidate.education.map(e => `
          <p style="margin:6px 0;">
            <b>${escapeHtml(e.degree || "")}</b>

            ${e.institution
              ? " - " + escapeHtml(e.institution)
              : ""}

            ${e.year
              ? " (" + escapeHtml(e.year) + ")"
              : ""}
          </p>
        `).join("")}

      </div>
    `;
  }

  document.getElementById("modal-body").innerHTML = `

    <dl class="info-grid">

      <dt>Email</dt>
      <dd>${escapeHtml(candidate.email) || "—"}</dd>

      <dt>Phone</dt>
      <dd>${escapeHtml(candidate.phone) || "—"}</dd>

      <dt>Location</dt>
      <dd>${escapeHtml(candidate.location) || "—"}</dd>

      <dt>Experience</dt>
      <dd>${candidate.experience_years
            ? escapeHtml(candidate.experience_years) + " yrs"
            : "—"}</dd>

      <dt>LinkedIn</dt>
      <dd>
        ${candidate.linkedin
          ? `<a href="${candidate.linkedin}" target="_blank">${candidate.linkedin}</a>`
          : "—"}
      </dd>

      <dt>GitHub</dt>
      <dd>
        ${candidate.github
          ? `<a href="${candidate.github}" target="_blank">${candidate.github}</a>`
          : "—"}
      </dd>

    </dl>

    <div style="margin-top:20px;">
      <strong>Skills</strong>

      <div style="margin-top:10px;">
        ${skillTagsHTML(candidate.skills || [])}
      </div>
    </div>

    ${educationHtml}

  `;
}

function closeModal() {
  document
    .getElementById("modal-overlay")
    .classList.remove("open");
}