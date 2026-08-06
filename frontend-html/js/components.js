/* ==============================
   components.js
   Small reusable render helpers — equivalent to React's
   components/SkillTag.jsx and components/StatusBadge.jsx.
   Plain functions returning HTML strings, used across pages.
   ============================== */

// Prevents extracted resume text (candidate names, skills, etc.) from
// being interpreted as HTML if it happens to contain special characters.
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function skillTagHTML(skill) {
  return `<span class="skill-tag">${escapeHtml(skill)}</span>`;
}

function skillTagsHTML(skills, limit) {
  const list = limit ? (skills || []).slice(0, limit) : (skills || []);
  return list.map(skillTagHTML).join("");
}

function statusBadgeHTML(status) {
  const safe = status || "processed";
  return `<span class="status-badge status-${escapeHtml(safe)}">${escapeHtml(safe)}</span>`;
}