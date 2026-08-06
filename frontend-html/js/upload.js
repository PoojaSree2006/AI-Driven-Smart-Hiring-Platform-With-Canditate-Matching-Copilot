/* ==============================
   upload.js
   Supports:
   - Single Resume Upload
   - Multiple Resume Upload
   - Drag & Drop
   - Progress Bar
   - Recently Processed Candidates (loaded from backend)
   ============================== */

let recentCandidates = [];

document.addEventListener("DOMContentLoaded", () => {

  renderSidebar("upload");

  // Load previously parsed resumes from database
  loadRecentCandidates();

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("browse-btn");

  browseBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-active");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("drag-active");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-active");

    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

});

async function handleFiles(files) {

  document.getElementById("upload-error").style.display = "none";

  setProgress(5);

  const progressInterval = setInterval(() => {

    let current = parseInt(document.getElementById("progress-pct").textContent) || 0;

    if (current < 90) {
      current += 5;
      setProgress(current);
    }

  }, 200);

  try {

    let response;

    if (files.length === 1) {

      response = await api.uploadResume(files[0]);

      showFileInfo(files[0], "Processed");

      renderExtractedInfo(response.candidate);

    } else {

      response = await api.uploadMultipleResumes(files);

      document.getElementById("file-info").style.display = "flex";

      document.getElementById("file-info").innerHTML = `
        <div>
          <p class="file-info-name">
            ${response.total_uploaded} Resume(s) Uploaded
          </p>

          <p class="file-info-meta">
            ${response.total_failed} Failed
          </p>
        </div>
      `;

      document.getElementById("extracted-info").style.display = "none";

      alert(`${response.total_uploaded} resumes uploaded successfully.`);
    }

    clearInterval(progressInterval);

    setProgress(100);

    // Reload recent candidates from database
    await loadRecentCandidates();

  } catch (err) {

    clearInterval(progressInterval);

    showFileInfo(files[0], "Failed");

    const errorBox = document.getElementById("upload-error");

    errorBox.textContent = err.message || "Upload failed.";

    errorBox.style.display = "block";

  }

}

function setProgress(percent) {

  document.getElementById("progress-fill").style.width = percent + "%";

  document.getElementById("progress-pct").textContent = percent + "%";

}

function showFileInfo(file, status) {

  const box = document.getElementById("file-info");

  box.style.display = "flex";

  box.innerHTML = `

    <svg viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2">

      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>

      <polyline points="14 2 14 8 20 8"/>

    </svg>

    <div>

      <p class="file-info-name">
        ${escapeHtml(file.name)}
      </p>

      <p class="file-info-meta">
        ${status} · ${(file.size / (1024 * 1024)).toFixed(2)} MB
      </p>

    </div>

  `;

}

function renderExtractedInfo(candidate) {

  const box = document.getElementById("extracted-info");

  box.style.display = "block";

  box.innerHTML = `

    <h3>Extracted Information</h3>

    <dl class="info-grid">

      <dt>Name:</dt>
      <dd>${escapeHtml(candidate.name) || "—"}</dd>

      <dt>Email:</dt>
      <dd>${escapeHtml(candidate.email) || "—"}</dd>

      <dt>Phone:</dt>
      <dd>${escapeHtml(candidate.phone) || "—"}</dd>

      <dt>Location:</dt>
      <dd>${escapeHtml(candidate.location) || "—"}</dd>

      <dt>Experience:</dt>
      <dd>${candidate.experience_years ? escapeHtml(candidate.experience_years) + " years" : "—"}</dd>

    </dl>

    <span class="skills-label">
      Skills:
    </span>

    <div>
      ${skillTagsHTML(candidate.skills)}
    </div>

  `;

}

// ===============================
// Loads ALL previously parsed resumes
// ===============================
async function loadRecentCandidates() {

  try {

    const candidates = await api.getCandidates();

    // newest first
    candidates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // display latest 10 (change to candidates.length if you want ALL)
    recentCandidates = candidates.slice(0, 10);

    renderRecentTable();

  } catch (err) {

    console.error(err);

  }

}

function renderRecentTable() {

  const tbody = document.getElementById("recent-tbody");

  if (!recentCandidates || recentCandidates.length === 0) {

    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">No candidates processed yet.</td>
      </tr>
    `;

    return;

  }

  tbody.innerHTML = recentCandidates.map(c => `

    <tr>

      <td class="primary">
        ${escapeHtml(c.name) || "—"}
      </td>

      <td>
        ${escapeHtml(c.email) || "—"}
      </td>

      <td>
        ${c.experience_years ? escapeHtml(c.experience_years) + " years" : "—"}
      </td>

      <td>
        ${skillTagsHTML(c.skills || [], 3)}
      </td>

      <td>
        ${statusBadgeHTML(c.status)}
      </td>

    </tr>

  `).join("");

}