/* ============================================================
   js/upload.js
   Handles drag & drop resume uploads, triggers live candidate
   processing, and populates recent candidates with modal viewing.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  setupUploadEvents();
  loadCandidates();

  const exportBtn = document.getElementById("export-csv");
  if (exportBtn) {
    exportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      exportCandidatesCSV();
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
});

function setupUploadEvents() {
  const browseBtn = document.getElementById("browse-btn");
  const fileInput = document.getElementById("file-input");
  const dropzone = document.getElementById("dropzone");

  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => handleUpload(e.target.files));
  }

  if (dropzone) {
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#2563eb";
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.style.borderColor = "#cbd5e1";
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#cbd5e1";
      if (e.dataTransfer.files.length) {
        handleUpload(e.dataTransfer.files);
      }
    });
  }
}

async function handleUpload(files) {
  if (!files.length) return;

  const validFiles = Array.from(files).filter(file => {
    const ext = file.name.split(".").pop().toLowerCase();
    return ext === "pdf" || ext === "docx";
  });

  if (!validFiles.length) {
    alert("Please upload PDF or DOCX files.");
    return;
  }

  try {
    let result;
    if (validFiles.length === 1) {
      result = await api.uploadResume(validFiles[0]);
    } else {
      result = await api.uploadMultipleResumes(validFiles);
    }

    const candidate = result.candidate || (result.uploaded && result.uploaded[0]) || result;
    if (candidate) {
      renderRecentExtraction(candidate);
    }

    await loadCandidates();
  } catch (err) {
    alert("Upload failed: " + (err.message || err));
  }
}

function renderRecentExtraction(candidate) {
  const container = document.getElementById("recent-extraction-container");
  if (!container || !candidate) return;

  const skillsHtml = (candidate.skills || [])
    .map(skill => `<span class="skill-tag">${escapeHtml(skill)}</span>`)
    .join("");

  let internshipSummary = "";
  if (candidate.internships && candidate.internships.length > 0) {
    const firstIntern = candidate.internships[0];
    internshipSummary = `
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e2e8f0; font-size: 11px;">
        <span style="color: #2563eb; font-weight: 600;">Internship Detected:</span>
        <strong style="color: #0f172a;">${escapeHtml(firstIntern.role || 'Intern')}</strong>
        ${firstIntern.company ? 'at ' + escapeHtml(firstIntern.company) : ''}
      </div>
    `;
  }

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 12px;">
      <div>
        <span style="color: #94a3b8;">Name</span><br>
        <strong>${escapeHtml(candidate.name || 'Not detected')}</strong><br>
        <span style="color: #94a3b8; margin-top: 4px; display:inline-block;">Phone</span><br>
        <span>${escapeHtml(candidate.phone || 'Not detected')}</span>
      </div>
      <div>
        <span style="color: #94a3b8;">Email</span><br>
        <span>${escapeHtml(candidate.email || 'Not detected')}</span><br>
        <span style="color: #94a3b8; margin-top: 4px; display:inline-block;">Experience</span><br>
        <strong>${candidate.experience_years ? escapeHtml(candidate.experience_years) + ' yrs' : 'Not detected'}</strong>
      </div>
    </div>
    <div>
      ${skillsHtml || '<span style="font-size:11px; color:#94a3b8;">No skills detected</span>'}
    </div>
    ${internshipSummary}
  `;
}

async function loadCandidates() {
  try {
    const candidates = await api.getCandidates();
    const tbody = document.getElementById("candidates-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const candidateList = Array.isArray(candidates) ? candidates : [];
    const count = candidateList.length;

    const processedEl = document.getElementById("stat-processed");
    const createdEl = document.getElementById("stat-created");

    if (processedEl) processedEl.textContent = count;
    if (createdEl) createdEl.textContent = count;

    if (count === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No candidates processed yet.</td></tr>`;
      return;
    }

    renderRecentExtraction(candidateList[0]);

    candidateList.forEach((c) => {
      const skillsHtml = (c.skills || []).map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("");
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <strong style="cursor:pointer; color:#2563eb;" onclick="viewCandidate('${c.id}')">${escapeHtml(c.name || 'Unnamed')}</strong><br>
          <span style="font-size:11px; color:#94a3b8;">${escapeHtml(c.email || '—')}</span>
        </td>
        <td>${c.experience_years ? escapeHtml(c.experience_years) + ' yrs' : 'N/A'}</td>
        <td>${skillsHtml || '—'}</td>
        <td><span class="status-pill"><span class="status-dot"></span>Processed</span></td>
        <td>
          <button onclick="deleteCandidate('${c.id}')" style="border:none; background:none; cursor:pointer; color:#94a3b8;" title="Delete Candidate">
            🗑
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("Error loading candidates:", err);
  }
}

async function viewCandidate(id) {
  try {
    const candidate = await api.getCandidate(id);
    renderModal(candidate);
    const overlay = document.getElementById("modal-overlay");
    if (overlay) overlay.style.display = "flex";
  } catch (err) {
    alert("Failed to load candidate details: " + (err.message || err));
  }
}

function renderModal(candidate) {
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");

  if (modalTitle) modalTitle.textContent = candidate.name || "Candidate Profile";
  if (!modalBody) return;

  let internshipsHtml = "";
  if (candidate.internships && candidate.internships.length > 0) {
    internshipsHtml = `
      <div style="margin-top:16px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
        <strong style="font-size:13px; color:#2563eb;">💼 Internships & Industrial Training</strong>
        <div style="margin-top:6px;">
          ${candidate.internships.map(i => `
            <div style="margin-bottom:8px; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
              <p style="margin:0; font-size:13px; font-weight:600; color:#0f172a;">
                ${escapeHtml(i.role || "Intern")} ${i.company ? "at " + escapeHtml(i.company) : ""}
              </p>
              ${i.duration ? `<small style="color:#64748b; display:block;">${escapeHtml(i.duration)}</small>` : ""}
              ${i.description ? `<p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">${escapeHtml(i.description)}</p>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  modalBody.innerHTML = `
    <div style="font-size:13px; color:#0f172a; margin-bottom:12px;">
      <p style="margin:4px 0;"><strong>Email:</strong> ${escapeHtml(candidate.email || '—')}</p>
      <p style="margin:4px 0;"><strong>Phone:</strong> ${escapeHtml(candidate.phone || '—')}</p>
      <p style="margin:4px 0;"><strong>Experience:</strong> ${candidate.experience_years ? escapeHtml(candidate.experience_years) + ' yrs' : '—'}</p>
    </div>
    <div>
      <strong style="font-size:13px;">Extracted Skills</strong><br>
      ${(candidate.skills || []).map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("")}
    </div>
    ${internshipsHtml}
  `;
}

function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  if (overlay) overlay.style.display = "none";
}

async function deleteCandidate(id) {
  if (!confirm("Delete this candidate permanently?")) return;
  try {
    await api.deleteCandidate(id);
    await loadCandidates();
  } catch (err) {
    alert("Failed to delete candidate: " + (err.message || err));
  }
}

function exportCandidatesCSV() {
  api.getCandidates().then(candidates => {
    if (!candidates || !candidates.length) {
      alert("No candidates to export.");
      return;
    }

    let csv = "Name,Email,Phone,Experience,Skills\n";
    candidates.forEach(c => {
      const skills = (c.skills || []).join("; ");
      csv += `"${c.name || ''}","${c.email || ''}","${c.phone || ''}","${c.experience_years || ''}","${skills}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "candidates_export.csv";
    a.click();
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}