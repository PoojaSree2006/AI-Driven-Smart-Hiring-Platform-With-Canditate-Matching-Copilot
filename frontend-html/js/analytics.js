/* ============================================================
   frontend-html/js/analytics.js
   Synchronized Visual Intelligence Engine
   Fully Aligned with Voice Screening, Tech Simulation & Database Jobs
   ============================================================ */

const chartInstances = {};

function getPersistentCache() {
  try {
    return JSON.parse(localStorage.getItem("rc_candidate_scores") || "{}");
  } catch (e) {
    return {};
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadAnalyticsData();
});

async function loadAnalyticsData() {
  const loadingEl = document.getElementById("analytics-loading");
  const gridEl = document.getElementById("analytics-grid");

  try {
    let candidates = [];
    try {
      const candResponse = await api.getCandidates();
      if (Array.isArray(candResponse)) candidates = candResponse;
      else if (Array.isArray(candResponse?.candidates)) candidates = candResponse.candidates;
      else if (Array.isArray(candResponse?.data)) candidates = candResponse.data;
      else if (Array.isArray(candResponse?.data?.candidates)) candidates = candResponse.data.candidates;
    } catch (candErr) {
      console.warn("Could not fetch candidate records:", candErr);
    }

    let jobs = [];
    try {
      const jobResponse = await api.getJobs();
      if (Array.isArray(jobResponse)) jobs = jobResponse;
      else if (Array.isArray(jobResponse?.jobs)) jobs = jobResponse.jobs;
      else if (Array.isArray(jobResponse?.data)) jobs = jobResponse.data;
    } catch (jobErr) {
      console.warn("Could not fetch job postings:", jobErr);
    }

    let rawAnalytics = {};
    try {
      if (typeof api.getAnalytics === "function") {
        rawAnalytics = await api.getAnalytics();
      }
    } catch (e) {
      console.warn("api.getAnalytics notice:", e);
    }

    if (loadingEl) loadingEl.style.display = "none";
    if (gridEl) gridEl.style.display = "block";

    // Reconcile candidates with live persistent evaluation session
    const synchronizedCandidates = synchronizeCandidateMetrics(candidates);

    // Render Analytics Views
    updateAnalyticsKPIs(synchronizedCandidates);
    renderPipelineDonutChart(synchronizedCandidates);
    renderSkillGapsChart(synchronizedCandidates, jobs);
    renderDualScoreChart(synchronizedCandidates);
    renderTopSkillsDensityChart(synchronizedCandidates, rawAnalytics?.top_skills || []);
    renderCandidateLeaderboard(synchronizedCandidates);

  } catch (err) {
    console.error("Analytics Sync Error:", err);
    if (loadingEl) {
      loadingEl.textContent = "Failed to load database analytics. Ensure backend server is running.";
      loadingEl.style.color = "#ef4444";
    }
  }
}

// ============================================================
// Data Reconciler: Merges DB with LocalStorage Evaluation Session
// ============================================================
function synchronizeCandidateMetrics(candidates) {
  const persistentCache = getPersistentCache();

  return candidates.map(c => {
    const candId = String(c.id ?? c.candidate_id);
    const cached = persistentCache[candId] || {};

    // 1. Voice Assessment Sync
    const isVoiceDone = (c.voice_screening_status || "").toUpperCase() === "COMPLETED" || Boolean(cached.isVoiceDone);
    const voiceScore = cached.voiceScore !== undefined 
      ? Number(cached.voiceScore) 
      : (c.voice_score ? Number(c.voice_score) : (isVoiceDone ? 86 : 0));

    // 2. Technical Copilot Sync
    let techScore = 0;
    if (cached.techScore !== undefined && Number(cached.techScore) > 0) {
      techScore = Number(cached.techScore);
    } else if (Array.isArray(c.interview_notes) && c.interview_notes.length > 0) {
      const sc = c.interview_notes.map(n => Number(n.score || 0)).filter(s => s > 0);
      if (sc.length > 0) techScore = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length);
    } else if (c.score !== undefined && c.score !== null && Number(c.score) > 0) {
      techScore = Number(c.score);
    }

    // 3. Composite Hiring Score (60% Tech + 40% Voice)
    const compositeScore = (techScore > 0 || voiceScore > 0)
      ? Math.round((techScore * 0.6) + (voiceScore * 0.4))
      : 0;

    return {
      ...c,
      id: candId,
      isVoiceDone,
      voiceScore,
      techScore,
      compositeScore,
      status: cached.status || c.status || "applied"
    };
  });
}

// ============================================================
// 1. Top KPI Pulse Cards
// ============================================================
function updateAnalyticsKPIs(candidates) {
  const total = candidates.length;
  const shortlisted = candidates.filter(c => normalizeStatus(c.status) === "shortlisted").length;
  const voiceScreened = candidates.filter(c => c.isVoiceDone).length;

  const evaluatedCandidates = candidates.filter(c => c.compositeScore > 0);
  const avgScore = evaluatedCandidates.length > 0
    ? Math.round(evaluatedCandidates.reduce((sum, c) => sum + c.compositeScore, 0) / evaluatedCandidates.length)
    : 0;

  const conversionRate = total > 0 ? Math.round((shortlisted / total) * 100) : 0;

  setText("kpi-total-candidates", total);
  setText("kpi-avg-score", `${avgScore}%`);
  setText("kpi-voice-ratio", voiceScreened);
  setText("kpi-conversion-rate", `${conversionRate}%`);
}

// ============================================================
// 2. Pipeline Velocity Donut Chart
// ============================================================
function renderPipelineDonutChart(candidates) {
  const ctx = document.getElementById("pipeline-donut-chart")?.getContext("2d");
  if (!ctx) return;

  if (chartInstances["pipelineDonut"]) {
    chartInstances["pipelineDonut"].destroy();
  }

  const total = candidates.length;
  const applied = candidates.filter(c => ["applied", "processed"].includes(normalizeStatus(c.status))).length || (total > 0 ? 1 : 0);
  const shortlisted = candidates.filter(c => normalizeStatus(c.status) === "shortlisted").length;
  const scheduled = candidates.filter(c => normalizeStatus(c.status) === "scheduled").length;
  const interviewed = candidates.filter(c => c.isVoiceDone || normalizeStatus(c.status) === "interviewed").length;
  const rejected = candidates.filter(c => normalizeStatus(c.status) === "rejected").length;

  chartInstances["pipelineDonut"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Applied", "Shortlisted", "Scheduled", "Interviewed", "Rejected"],
      datasets: [{
        data: [applied, shortlisted, scheduled, interviewed, rejected],
        backgroundColor: [
          "#3b82f6",
          "#10b981",
          "#818cf8",
          "#a855f7",
          "#f43f5e"
        ],
        borderWidth: 2,
        borderColor: "var(--card-bg, #ffffff)",
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            font: { size: 11, family: "sans-serif", weight: "600" },
            boxWidth: 12,
            padding: 12
          }
        }
      },
      cutout: "68%"
    }
  });
}

// ============================================================
// 3. Candidate Skill Gap Deficit Analysis (Matched with Live Jobs)
// ============================================================
function renderSkillGapsChart(candidates, jobs = []) {
  const ctx = document.getElementById("skill-gaps-chart")?.getContext("2d");
  if (!ctx) return;

  if (chartInstances["skillGaps"]) {
    chartInstances["skillGaps"].destroy();
  }

  let targetCompetencies = new Set();
  jobs.forEach(job => {
    let req = job.required_skills || job.skills || [];
    if (typeof req === "string") {
      try { req = JSON.parse(req); } catch (e) { req = req.split(","); }
    }
    if (Array.isArray(req)) {
      req.forEach(s => {
        const clean = String(s).trim().toLowerCase();
        if (clean) targetCompetencies.add(clean);
      });
    }
  });

  if (targetCompetencies.size === 0) {
    ["python", "fastapi", "mysql", "docker", "rest api", "git"].forEach(s => targetCompetencies.add(s));
  }

  const coreCompetencies = Array.from(targetCompetencies).slice(0, 8);
  const gapCounts = {};
  coreCompetencies.forEach(skill => gapCounts[skill.toUpperCase()] = 0);

  candidates.forEach(candidate => {
    const candidateSkills = extractSkillsArray(candidate).map(s => s.toLowerCase());
    coreCompetencies.forEach(comp => {
      if (!candidateSkills.some(cs => cs.includes(comp))) {
        gapCounts[comp.toUpperCase()]++;
      }
    });
  });

  const sortedSkills = Object.keys(gapCounts).sort((a, b) => gapCounts[b] - gapCounts[a]);

  chartInstances["skillGaps"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sortedSkills,
      datasets: [{
        label: "Candidates Lacking Skill",
        data: sortedSkills.map(k => gapCounts[k]),
        backgroundColor: [
          "#ef4444",
          "#f97316",
          "#f59e0b",
          "#eab308",
          "#84cc16",
          "#06b6d4",
          "#8b5cf6",
          "#ec4899"
        ],
        borderRadius: 6,
        maxBarThickness: 32
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
          ticks: { font: { size: 10, weight: "600" } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { size: 10 } },
          grid: { color: "rgba(148, 163, 184, 0.15)" }
        }
      }
    }
  });
}

// ============================================================
// 4. Voice vs. Technical Competence
// ============================================================
function renderDualScoreChart(candidates) {
  const ctx = document.getElementById("dual-score-chart")?.getContext("2d");
  if (!ctx) return;

  if (chartInstances["dualScore"]) {
    chartInstances["dualScore"].destroy();
  }

  const sampleCandidates = candidates.slice(0, 6);
  if (sampleCandidates.length === 0) return;

  const labels = sampleCandidates.map(c => (c.name || "Candidate").split(" ")[0]);
  const voiceScores = sampleCandidates.map(c => c.voiceScore);
  const techScores = sampleCandidates.map(c => c.techScore);

  chartInstances["dualScore"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Voice & Communication Score",
          data: voiceScores,
          backgroundColor: "#818cf8",
          borderRadius: 5,
          barPercentage: 0.7,
          categoryPercentage: 0.6
        },
        {
          label: "Technical Copilot Score",
          data: techScores,
          backgroundColor: "#10b981",
          borderRadius: 5,
          barPercentage: 0.7,
          categoryPercentage: 0.6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: { font: { size: 11, weight: "600" }, boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              return val === 0 
                ? `${context.dataset.label}: Unscreened (0/100)` 
                : `${context.dataset.label}: ${val}/100`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { stepSize: 20, font: { size: 10 } },
          grid: { color: "rgba(148, 163, 184, 0.15)" }
        }
      }
    }
  });
}

// ============================================================
// 5. Talent Market Skill Density Chart
// ============================================================
function renderTopSkillsDensityChart(candidates, apiSkills) {
  const ctx = document.getElementById("top-skills-chart")?.getContext("2d");
  if (!ctx) return;

  if (chartInstances["topSkills"]) {
    chartInstances["topSkills"].destroy();
  }

  let skillFrequencies = {};

  if (apiSkills && apiSkills.length > 0) {
    apiSkills.forEach(item => {
      skillFrequencies[item.skill] = item.count;
    });
  } else {
    candidates.forEach(candidate => {
      const skills = extractSkillsArray(candidate);
      skills.forEach(s => {
        const clean = s.trim();
        if (clean) skillFrequencies[clean] = (skillFrequencies[clean] || 0) + 1;
      });
    });
  }

  if (Object.keys(skillFrequencies).length === 0) {
    skillFrequencies = { Python: 8, FastAPI: 6, MySQL: 7, React: 5, Git: 9, "REST API": 7 };
  }

  const sorted = Object.entries(skillFrequencies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  chartInstances["topSkills"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map(s => s[0]),
      datasets: [{
        label: "Qualified Candidates",
        data: sorted.map(s => s[1]),
        backgroundColor: "#7c3aed",
        borderRadius: 5,
        barThickness: 16
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
          ticks: { precision: 0, font: { size: 10 } },
          grid: { color: "rgba(148, 163, 184, 0.15)" }
        },
        y: {
          ticks: { font: { size: 11, weight: "600" } },
          grid: { display: false }
        }
      }
    }
  });
}

// ============================================================
// 6. Mentor's Leaderboard (5-Column Clean Layout)
// ============================================================
function renderCandidateLeaderboard(candidates) {
  const tbody = document.getElementById("leaderboard-tbody");
  if (!tbody) return;

  if (!Array.isArray(candidates) || candidates.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">
          No candidates in pool to rank.
        </td>
      </tr>
    `;
    return;
  }

  // Sort candidates by Composite Score descending
  const ranked = [...candidates].sort((a, b) => b.compositeScore - a.compositeScore);

  tbody.innerHTML = ranked.map((c, index) => {
    const name = c.name || c.full_name || "Candidate";
    const email = c.email || "No email";
    const status = normalizeStatus(c.status) || "applied";

    let rankBadge = `<span style="font-weight: 800; font-size: 12px; color: var(--text-muted);">#${index + 1}</span>`;
    if (c.compositeScore > 0) {
      if (index === 0) rankBadge = `<span style="font-size: 14px;">🥇</span> <strong style="color: #f59e0b;">#1</strong>`;
      else if (index === 1) rankBadge = `<span style="font-size: 14px;">🥈</span> <strong style="color: #64748b;">#2</strong>`;
      else if (index === 2) rankBadge = `<span style="font-size: 14px;">🥉</span> <strong style="color: #b45309;">#3</strong>`;
    }

    const scoreColor = c.compositeScore >= 80 ? "#10b981" : (c.compositeScore >= 50 ? "#3b82f6" : "#64748b");
    const scoreText = c.compositeScore > 0 ? `${c.compositeScore}/100` : "0/100 (Unscreened)";

    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 12px 8px;">${rankBadge}</td>
        <td style="padding: 12px 8px;">
          <strong style="color: var(--text-color); display: block;">${escapeHtml(name)}</strong>
          <span style="color: var(--text-muted); font-size: 10px;">${escapeHtml(email)}</span>
        </td>
        <td style="padding: 12px 8px;">
          <strong style="color: ${scoreColor}; font-size: 13px;">${scoreText}</strong>
          <span style="font-size: 10px; color: var(--text-muted); display: block;">
            Voice: ${c.voiceScore}/100 | Tech: ${c.techScore}/100
          </span>
        </td>
        <td style="padding: 12px 8px;">
          <span style="${getStatusBadgeStyle(status)}">${escapeHtml(status.toUpperCase())}</span>
        </td>
        <td style="padding: 12px 8px; text-align: right;">
          <a href="dashboard.html" style="text-decoration: none; padding: 4px 10px; border-radius: 4px; background: rgba(59, 130, 246, 0.12); color: #3b82f6; font-size: 11px; font-weight: 700;">
            Inspect &rarr;
          </a>
        </td>
      </tr>
    `;
  }).join("");
}

// ============================================================
// 7. Helpers & Utilities
// ============================================================
function extractSkillsArray(candidate) {
  if (!candidate) return [];
  let skills = candidate.skills || candidate.skillset || [];
  if (typeof skills === "string") {
    try { skills = JSON.parse(skills); } catch (e) { skills = skills.split(","); }
  }
  if (!Array.isArray(skills)) return [];
  return skills.map(s => typeof s === "object" && s !== null ? (s.name || s.skill || "") : String(s)).filter(Boolean);
}

function normalizeStatus(status) {
  if (!status) return "";
  return String(status).trim().toLowerCase().replace(/\s+/g, "_");
}

function getStatusBadgeStyle(status) {
  const norm = normalizeStatus(status);
  if (norm === "shortlisted") return "background:#d4edda; color:#155724; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700;";
  if (norm === "rejected") return "background:#f8d7da; color:#721c24; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700;";
  if (norm === "scheduled") return "background:#dbeafe; color:#1e40af; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700;";
  return "background:#e2e3e5; color:#383d41; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700;";
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.loadAnalyticsData = loadAnalyticsData;