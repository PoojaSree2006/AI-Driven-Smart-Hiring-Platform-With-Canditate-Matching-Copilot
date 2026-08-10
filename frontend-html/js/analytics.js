/* ============================================================
   js/analytics.js
   Dynamic Chart.js rendering for Candidate Analytics
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  const loadingEl = document.getElementById("analytics-loading");
  const gridEl = document.getElementById("analytics-grid");

  try {
    const data = await api.getAnalytics();

    if (loadingEl) loadingEl.style.display = "none";
    if (gridEl) gridEl.style.display = "grid";

    renderSkillsChart(data.top_skills || []);
    renderEducationChart(data.education_distribution || []);
    renderExperienceChart(data.experience_distribution || []);
  } catch (err) {
    console.error("Analytics Error:", err);
    if (loadingEl) {
      loadingEl.textContent = "Failed to load analytics data. Ensure your backend is running.";
      loadingEl.style.color = "#ef4444";
    }
  }
});

function renderSkillsChart(skillsData) {
  const ctx = document.getElementById("skills-chart")?.getContext("2d");
  if (!ctx) return;

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: skillsData.map(s => s.skill),
      datasets: [{
        label: "Candidates",
        data: skillsData.map(s => s.count),
        backgroundColor: "#2563eb",
        borderRadius: 6,
        barThickness: 18
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, font: { size: 11 } },
          grid: { color: "#f1f5f9" }
        },
        y: {
          ticks: { font: { size: 11, weight: "600" } },
          grid: { display: false }
        }
      }
    }
  });
}

function renderEducationChart(eduData) {
  const ctx = document.getElementById("edu-chart")?.getContext("2d");
  if (!ctx) return;

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: eduData.map(e => e.degree_level),
      datasets: [{
        data: eduData.map(e => e.count),
        backgroundColor: [
          "#2563eb", // Primary Blue
          "#38bdf8", // Light Blue
          "#818cf8", // Indigo
          "#cbd5e1"  // Gray
        ],
        borderWidth: 2,
        borderColor: "#ffffff"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: { font: { size: 11, family: "sans-serif" }, boxWidth: 12 }
        }
      },
      cutout: "65%"
    }
  });
}

function renderExperienceChart(expData) {
  const ctx = document.getElementById("exp-chart")?.getContext("2d");
  if (!ctx) return;

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: expData.map(e => e.range_label),
      datasets: [{
        label: "Candidates",
        data: expData.map(e => e.count),
        backgroundColor: "#3b82f6",
        borderRadius: 6,
        maxBarThickness: 45
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { size: 11 } },
          grid: { color: "#f1f5f9" }
        }
      }
    }
  });
}