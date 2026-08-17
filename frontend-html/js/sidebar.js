/* ==============================
   js/sidebar.js
   Dynamic Sidebar Renderer
   ============================== */

const NAV_LINKS = [
  { id: "dashboard", href: "dashboard.html", label: "Dashboard" },
  { id: "upload", href: "upload.html", label: "Resume Upload" },
  { id: "jobs", href: "jobs.html", label: "Job Postings" },
  { id: "matching", href: "matching.html", label: "Matching & Skill Analysis" },
  { id: "interview", href: "interview.html", label: "Interview Assistant" },
  { id: "analytics", href: "analytics.html", label: "Analytics" }
];

function renderSidebar(activeId) {
  const mount = document.getElementById("sidebar");
  if (!mount) return;

  const links = NAV_LINKS.map(link => `
    <a href="${link.href}" class="nav-link ${link.id === activeId ? "active" : ""}">
      <span>${link.label}</span>
    </a>
  `).join("");

  mount.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="logo-badge">AI</div>
        <div class="brand-name">Smart Hiring<br>Copilot</div>
      </div>
      <nav class="sidebar-nav">
        ${links}
      </nav>
      <div class="sidebar-footer">
        <span>Light mode</span>
      </div>
    </aside>
  `;
}