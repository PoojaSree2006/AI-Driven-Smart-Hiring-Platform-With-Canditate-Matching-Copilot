/* ============================================================
   js/matching.js
   Dynamic candidate matching, skill gap visualization,
   and report export engine.
   ============================================================ */

let currentJobId = null;
let activeSkillGapData = null; // Caches current candidate gap data for report export

document.addEventListener("DOMContentLoaded", async () => {
  await loadJobs();

  const select = document.getElementById("job-select");
  if (select) {
    select.addEventListener("change", (e) => {
      currentJobId = e.target.value;
      if (currentJobId) loadMatches(currentJobId);
    });
  }

  const exportBtn = document.getElementById("export-report-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", downloadSkillGapReport);
  }
});

async function loadJobs() {
  try {
    const jobs = await api.getJobs();
    const select = document.getElementById("job-select");

    if (!select) return;

    if (!jobs || jobs.length === 0) {
      select.innerHTML = `<option value="">No job positions found</option>`;
      return;
    }

    select.innerHTML = jobs
      .map((j) => `<option value="${j.id}">${escapeHtml(j.title)}</option>`)
      .join("");

    currentJobId = jobs[0].id;
    await loadMatches(currentJobId);
  } catch (err) {
    console.error("Error loading jobs:", err);
  }
}

async function loadMatches(jobId) {
  try {
    const matches = await api.matchCandidates(jobId);
    const container = document.getElementById("match-list");

    if (!container) return;
    container.innerHTML = "";

    if (!matches || matches.length === 0) {
      container.innerHTML = `<p style="font-size:12px; color:#94a3b8; text-align:center;">No candidates available to rank.</p>`;
      return;
    }

    matches.forEach((m, index) => {
      const skillsHtml = (m.matched_skills || [])
        .map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`)
        .join("");

      // Support varied backend property naming conventions
      const matchPct = m.match_percentage ?? m.match_score ?? m.score ?? 0;
      const skillScore = m.skill_score ?? matchPct;
      const expScore = m.experience_score ?? 100;
      const candExp = m.candidate_exp_years ?? m.experience_years ?? 0;
      const reqExp = m.required_min_exp ?? 0;

      const badgeClass = matchPct >= 70 ? "badge-high" : "badge-mid";
      const candId = m.candidate_id || m.id;

      const card = document.createElement("div");
      card.className = `match-card ${index === 0 ? "selected" : ""}`;
      card.style.cursor = "pointer";
      card.onclick = () => loadSkillGap(candId, jobId, m.name, card, m);

      card.innerHTML = `
        <div style="flex:1;">
          <strong style="font-size: 14px;">${escapeHtml(m.name || "Candidate")}</strong>
          <div style="margin-top: 4px;">${skillsHtml || '<span style="font-size:11px; color:#94a3b8;">No skills matched</span>'}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
            <span>Skill Score: <strong>${skillScore}%</strong></span> &bull; 
            <span>Exp Score: <strong>${expScore}%</strong> (${candExp} / ${reqExp} yrs req)</span>
          </div>
        </div>
        <div class="match-badge ${badgeClass}">
          <span>${matchPct}%</span>
          <span style="font-size: 8px;">MATCH</span>
        </div>
      `;
      container.appendChild(card);
    });

    if (matches.length > 0) {
      const first = matches[0];
      await loadSkillGap(first.candidate_id || first.id, jobId, first.name, null, first);
    }
  } catch (err) {
    console.error("Error loading matches:", err);
  }
}

async function loadSkillGap(candidateId, jobId, candidateName, cardElement, matchObj = null) {
  if (cardElement) {
    document.querySelectorAll(".match-card").forEach((c) => c.classList.remove("selected"));
    cardElement.classList.add("selected");
  }

  const labelElem = document.getElementById("gap-candidate-lbl");
  if (labelElem) {
    labelElem.textContent = `Candidate: ${candidateName || "Candidate"}`;
  }

  try {
    let gapData = null;

    // Check if dedicated API endpoint exists, otherwise build fallback gap object
    if (typeof api.getSkillGap === "function") {
      gapData = await api.getSkillGap(candidateId, jobId);
    } else {
      gapData = buildFallbackSkillGapData(candidateName, matchObj);
    }

    activeSkillGapData = gapData; // Cache for report generator

    const container = document.getElementById("gap-skills-list");
    if (!container) return;
    container.innerHTML = "";

    const gaps = gapData.gaps || [];
    if (gaps.length === 0) {
      container.innerHTML = `<p style="font-size:12px; color:#94a3b8;">No skill requirements defined for this job position.</p>`;
    }

    gaps.forEach((g) => {
      const isMatched = g.status === "matched";
      const barColor = isMatched ? "#22c55e" : "#ef4444";
      const statusText = isMatched ? "Detected" : "Gap";
      const statusBg = isMatched ? "#dcfce7" : "#fee2e2";
      const statusColor = isMatched ? "#15803d" : "#b91c1c";

      const item = document.createElement("div");
      item.style.marginBottom = "16px";
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 6px;">
          <div>
            <strong style="font-size: 13px;">${escapeHtml(g.skill)}</strong>
            <span style="display:inline-block; margin-left:8px; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700; background:${statusBg}; color:${statusColor};">
              ${statusText}
            </span>
          </div>
          <span style="color: #64748b; font-size: 11px;">
            Candidate: <b>${escapeHtml(g.candidate_level)}</b> &nbsp;&bull;&nbsp; Required: <span style="color: #2563eb; font-weight:600;">${escapeHtml(g.required_level)}</span>
          </span>
        </div>
        <div style="height: 8px; background-color: #f1f5f9; border-radius: 4px; overflow: hidden;">
          <div style="width: ${isMatched ? "100%" : "15%"}; height: 100%; background-color: ${barColor}; transition: width 0.3s ease;"></div>
        </div>
      `;
      container.appendChild(item);
    });

    // Render recommendation box
    const recBox = document.getElementById("recommendation-box");
    const recText = document.getElementById("recommendation-text");
    if (recBox && recText) {
      recBox.style.display = "block";
      recText.textContent = gapData.recommendation || "No specific recommendations generated.";
    }

    // Show Export Report Button
    const exportBtn = document.getElementById("export-report-btn");
    if (exportBtn) {
      exportBtn.style.display = "inline-block";
    }
  } catch (err) {
    console.error("Error loading skill gap:", err);
  }
}

function buildFallbackSkillGapData(candidateName, matchObj) {
  if (!matchObj) {
    return {
      candidate_name: candidateName || "Candidate",
      job_title: "Position",
      gaps: [],
      recommendation: "Evaluation complete."
    };
  }

  const matched = matchObj.matched_skills || [];
  const missing = matchObj.missing_skills || [];

  const gaps = [
    ...matched.map((s) => ({
      skill: s,
      status: "matched",
      candidate_level: "Proficient",
      required_level: "Required"
    })),
    ...missing.map((s) => ({
      skill: s,
      status: "missing",
      candidate_level: "Not Detected",
      required_level: "Required"
    }))
  ];

  const rec = missing.length > 0
    ? `Recommend targeted upskilling in: ${missing.join(", ")}.`
    : "Strong candidate match with 100% required skill coverage.";

  return {
    candidate_name: candidateName || matchObj.name || "Candidate",
    job_title: "Position",
    gaps: gaps,
    recommendation: rec
  };
}

function downloadSkillGapReport() {
  if (!activeSkillGapData) {
    alert("No skill gap analysis available to export.");
    return;
  }

  const d = activeSkillGapData;
  const timestamp = new Date().toLocaleDateString();

  let reportText = `==================================================\n`;
  reportText += `       AI RECRUITMENT COPILOT - SKILL GAP REPORT\n`;
  reportText += `==================================================\n\n`;
  reportText += `Date Generated: ${timestamp}\n`;
  reportText += `Candidate Name: ${d.candidate_name || "Candidate"}\n`;
  reportText += `Target Position: ${d.job_title || "Position"}\n\n`;
  reportText += `--------------------------------------------------\n`;
  reportText += `SKILL EVALUATION BREAKDOWN\n`;
  reportText += `--------------------------------------------------\n`;

  (d.gaps || []).forEach((g, i) => {
    reportText += `${i + 1}. Skill: ${g.skill}\n`;
    reportText += `   - Candidate Status: ${g.candidate_level}\n`;
    reportText += `   - Required Level  : ${g.required_level}\n`;
    reportText += `   - Gap Outcome     : ${g.status.toUpperCase()}\n\n`;
  });

  reportText += `--------------------------------------------------\n`;
  reportText += `RECOMMENDATIONS & UPSKILLING PLAN\n`;
  reportText += `--------------------------------------------------\n`;
  reportText += `${d.recommendation || "None"}\n\n`;
  reportText += `==================================================\n`;

  const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Skill_Gap_Report_${(d.candidate_name || "Candidate").replace(/\s+/g, "_")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}