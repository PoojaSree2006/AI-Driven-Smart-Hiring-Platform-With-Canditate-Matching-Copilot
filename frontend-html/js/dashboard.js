document.addEventListener("DOMContentLoaded", () => {
  loadStats();
  loadRecentCandidates();
});

async function loadStats() {
  try {
    const stats = await api.getDashboardStats();
    document.getElementById("stat-total").textContent = stats.total_candidates || 0;
    document.getElementById("stat-uploads").textContent = stats.total_uploads || 0;
    document.getElementById("stat-exp").textContent = (stats.average_experience || 0) + " yrs";
    document.getElementById("stat-skills").textContent = stats.total_skills_extracted || 0;
  } catch (err) {
    console.error("Dashboard stats error:", err);
  }
}

async function loadRecentCandidates() {
  try {
    const candidates = await api.getCandidates();
    const tbody = document.getElementById("recent-tbody");
    tbody.innerHTML = "";

    if (!candidates || candidates.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No candidates found.</td></tr>`;
      return;
    }

    candidates.slice(0, 5).forEach((c) => {
      const skillsHtml = (c.skills || []).map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("");
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <strong>${escapeHtml(c.name || 'Unnamed')}</strong><br>
          <span style="font-size:11px; color:#94a3b8;">${escapeHtml(c.email || '')}</span>
        </td>
        <td>${c.experience_years ? escapeHtml(c.experience_years) + ' yrs' : 'N/A'}</td>
        <td>${skillsHtml}</td>
        <td><span class="status-pill"><span class="status-dot"></span>Processed</span></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("Dashboard table error:", err);
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