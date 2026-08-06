/* ==============================
   dashboard.js
   Equivalent to React pages/Dashboard.jsx.
   Fetches /dashboard/stats and renders the 4 stat cards.
   ============================== */

document.addEventListener("DOMContentLoaded", async () => {
  renderSidebar("dashboard");

  const grid = document.getElementById("stats-grid");
  const errorBox = document.getElementById("dashboard-error");

  try {
    const stats = await api.getDashboardStats();

    grid.innerHTML = `
      <div class="card">
        <div class="stat-card-header">
          <span class="stat-label">Total Candidates</span>
          <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </div>
        <div class="stat-value">${stats.total_candidates}</div>
      </div>
      <div class="card">
        <div class="stat-card-header">
          <span class="stat-label">Total Uploads</span>
          <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="stat-value">${stats.total_uploads}</div>
      </div>
      <div class="card">
        <div class="stat-card-header">
          <span class="stat-label">Average Experience</span>
          <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="stat-value">${stats.average_experience} yrs</div>
      </div>
      <div class="card">
        <div class="stat-card-header">
          <span class="stat-label">Total Skills Extracted</span>
          <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.9 6.3L21 9.3l-4.5 4.4L17.8 21 12 17.8 6.2 21l1.3-7.3L3 9.3l6.1-1z"/></svg>
        </div>
        <div class="stat-value">${stats.total_skills_extracted}</div>
      </div>
    `;
  } catch (err) {
    errorBox.textContent = "Failed to load dashboard stats.";
    errorBox.style.display = "block";
  }
});