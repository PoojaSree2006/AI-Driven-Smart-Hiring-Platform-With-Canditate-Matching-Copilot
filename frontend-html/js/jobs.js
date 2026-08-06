/* ==============================
   jobs.js
   NEW FILE — Milestone 2.
   Replaces the Milestone 1 placeholder. Handles creating job postings
   (with required skills + proficiency levels) and listing/deleting them.
   ============================== */

let requiredSkillsDraft = {}; // { skillName: level } built up as the user adds rows

document.addEventListener("DOMContentLoaded", () => {
  renderSidebar("jobs");
  loadJobs();

  document.getElementById("add-skill-btn").addEventListener("click", addSkillRow);
  document.getElementById("job-form").addEventListener("submit", handleCreateJob);
});

function addSkillRow() {
  const nameInput = document.getElementById("skill-name-input");
  const levelSelect = document.getElementById("skill-level-select");
  const name = nameInput.value.trim();
  if (!name) return;

  requiredSkillsDraft[name] = levelSelect.value;
  nameInput.value = "";
  renderSkillsDraft();
}

function removeSkillDraft(name) {
  delete requiredSkillsDraft[name];
  renderSkillsDraft();
}

function renderSkillsDraft() {
  const container = document.getElementById("skills-draft-list");
  const entries = Object.entries(requiredSkillsDraft);

  if (entries.length === 0) {
    container.innerHTML = `<span class="loading-text">No skills added yet.</span>`;
    return;
  }

  container.innerHTML = entries.map(([skill, level]) => `
    <span class="skill-tag" style="display:inline-flex; align-items:center; gap:6px;">
      ${escapeHtml(skill)} — ${escapeHtml(level)}
      <button type="button" onclick="removeSkillDraft('${escapeHtml(skill)}')" style="border:none;background:none;cursor:pointer;color:inherit;">×</button>
    </span>
  `).join("");
}

async function handleCreateJob(e) {
  e.preventDefault();

  const title = document.getElementById("job-title-input").value.trim();
  const location = document.getElementById("job-location-input").value.trim();
  const minExperience = document.getElementById("job-experience-input").value.trim();
  const description = document.getElementById("job-description-input").value.trim();
  const errorBox = document.getElementById("job-form-error");
  errorBox.style.display = "none";

  if (!title) {
    errorBox.textContent = "Job title is required.";
    errorBox.style.display = "block";
    return;
  }
  if (Object.keys(requiredSkillsDraft).length === 0) {
    errorBox.textContent = "Add at least one required skill.";
    errorBox.style.display = "block";
    return;
  }

  try {
    await api.createJob({
      title,
      location: location || null,
      min_experience: minExperience || null,
      description: description || null,
      required_skills: requiredSkillsDraft,
    });

    // Reset form
    document.getElementById("job-form").reset();
    requiredSkillsDraft = {};
    renderSkillsDraft();

    loadJobs();
  } catch (err) {
    errorBox.textContent = err.message || "Failed to create job posting.";
    errorBox.style.display = "block";
  }
}

async function loadJobs() {
  const tbody = document.getElementById("jobs-tbody");
  try {
    const jobs = await api.getJobs();
    if (jobs.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No job postings yet. Create one above.</td></tr>`;
      return;
    }
    tbody.innerHTML = jobs.map((j) => `
      <tr>
        <td class="primary">${escapeHtml(j.title)}</td>
        <td>${escapeHtml(j.location) || "—"}</td>
        <td>${Object.keys(j.required_skills || {}).map(skillTagHTML).join("")}</td>
        <td>
          <button class="action-btn danger" onclick="deleteJobRow('${j.id}')" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Failed to load job postings.</td></tr>`;
  }
}

async function deleteJobRow(id) {
  if (!confirm("Delete this job posting?")) return;
  try {
    await api.deleteJob(id);
    loadJobs();
  } catch (err) {
    alert("Failed to delete job posting: " + err.message);
  }
}