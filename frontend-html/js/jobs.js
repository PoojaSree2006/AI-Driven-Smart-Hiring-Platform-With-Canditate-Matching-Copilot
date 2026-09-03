let skillsDraft = {};

document.addEventListener("DOMContentLoaded", () => {
  loadJobs();

  document.getElementById("add-skill-btn").addEventListener("click", () => {
    const nameInput = document.getElementById("skill-input");
    const levelSelect = document.getElementById("level-select");
    const skill = nameInput.value.trim().toLowerCase();

    if (skill) {
      skillsDraft[skill] = levelSelect.value;
      nameInput.value = "";
      renderSkillsDraft();
    }
  });

  document.getElementById("job-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("title-input").value.trim();
  const location = document.getElementById("location-input").value.trim();

  if (!title) {
    alert("Job title is required");
    return;
  }

  try {
    const jobData = {
      title: title,
      description: "Job posting created from frontend",
      location: location || null,
      min_experience: "0",
      required_skills: skillsDraft
    };

    console.log("Sending job data:", jobData);

    const result = await api.createJob(jobData);

    console.log("Job created successfully:", result);

    document.getElementById("job-form").reset();
    skillsDraft = {};
    renderSkillsDraft();

    await loadJobs();

    alert("Job posting created successfully!");
  } catch (err) {
    console.error("Failed to create job:", err);
    alert("Failed to create job: " + (err.message || err));
  }
});
});

function renderSkillsDraft() {
  const container = document.getElementById("skills-draft");
  container.innerHTML = Object.entries(skillsDraft).map(([s, l]) => `
    <span class="skill-tag">${s} (${l}) <b onclick="removeDraft('${s}')" style="cursor:pointer; margin-left:4px;">×</b></span>
  `).join("");
}

function removeDraft(skill) {
  delete skillsDraft[skill];
  renderSkillsDraft();
}

async function loadJobs() {
  try {
    const jobs = await api.getJobs();
    const tbody = document.getElementById("jobs-tbody");
    tbody.innerHTML = "";

    if (!jobs || jobs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No job postings available.</td></tr>`;
      return;
    }

    jobs.forEach((j) => {
      const skillsHtml = Object.keys(j.required_skills || {}).map(s => `<span class="skill-tag">${s}</span>`).join("");
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${escapeHtml(j.title)}</strong></td>
        <td>${escapeHtml(j.location || 'N/A')}</td>
        <td>${skillsHtml}</td>
        <td><button onclick="deleteJob('${j.id}')" style="border:none; background:none; cursor:pointer; color:#94a3b8;">🗑</button></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("Error loading jobs:", err);
  }
}

async function deleteJob(id) {
  if (!confirm("Delete this job posting?")) return;
  try {
    await api.deleteJob(id);
    loadJobs();
  } catch (err) {
    alert("Failed to delete job: " + (err.message || err));
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}