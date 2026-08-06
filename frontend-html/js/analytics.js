/* ==============================
   analytics.js
   Equivalent to React pages/Analytics.jsx.
   Uses Chart.js (loaded via CDN in analytics.html) instead of recharts,
   since recharts is a React-specific library with no vanilla-JS equivalent.
   ============================== */

const CHART_COLORS = ["#4f46e5", "#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe"];

document.addEventListener("DOMContentLoaded", async () => {
  renderSidebar("analytics");

  try {
    const data = await api.getAnalytics();
    const data = await api.getAnalytics();
    console.log("Analytics Data:", data);
    console.log("Chart:", typeof Chart);
    document.getElementById("analytics-loading").style.display = "none";
    document.getElementById("analytics-content").style.display = "grid";
    renderTopSkillsChart(data.top_skills);
    renderEducationChart(data.education_distribution);
    renderExperienceChart(data.experience_distribution);
  } catch (err) {
    document.getElementById("analytics-loading").textContent = "Failed to load analytics.";
  }
});

function renderTopSkillsChart(topSkills) {
  const ctx = document.getElementById("top-skills-chart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: topSkills.map((s) => s.skill),
      datasets: [{
        data: topSkills.map((s) => s.count),
        backgroundColor: "#4f46e5",
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { display: false } },
    },
  });
}

function renderEducationChart(educationDistribution) {
  const ctx = document.getElementById("education-chart").getContext("2d");
  new Chart(ctx, {
    type: "pie",
    data: {
      labels: educationDistribution.map((e) => e.degree_level),
      datasets: [{
        data: educationDistribution.map((e) => e.count),
        backgroundColor: CHART_COLORS,
      }],
    },
    options: {
      plugins: { legend: { position: "bottom" } },
    },
  });
}

function renderExperienceChart(experienceDistribution) {
  const ctx = document.getElementById("experience-chart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: experienceDistribution.map((e) => e.range_label),
      datasets: [{
        data: experienceDistribution.map((e) => e.count),
        backgroundColor: "#6366f1",
        borderRadius: 4,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}