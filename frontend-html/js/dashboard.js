// ============================================================
// dashboard.js
// Executive Dashboard & Recruiter Dossier (Mentor Architecture)
// Enhanced with LocalStorage Persistent State Synchronization
// ============================================================

let globalCandidates = [];
let selectedCandidateId = null;

// Helper: Access persistent cross-page evaluation cache
function getPersistentCache() {
    try {
        return JSON.parse(localStorage.getItem("rc_candidate_scores") || "{}");
    } catch (e) {
        return {};
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadDashboardData();
});


// ============================================================
// 1. Dashboard Data Loading & Aggregation
// ============================================================

async function loadDashboardData() {
    try {
        const response = await api.getCandidates();
        console.log("CANDIDATES API RESPONSE:", response);

        let candidateList = [];
        if (Array.isArray(response)) {
            candidateList = response;
        } else if (Array.isArray(response?.candidates)) {
            candidateList = response.candidates;
        } else if (Array.isArray(response?.data)) {
            candidateList = response.data;
        } else if (Array.isArray(response?.data?.candidates)) {
            candidateList = response.data.candidates;
        }

        globalCandidates = candidateList;
        console.log("FINAL CANDIDATE LIST:", globalCandidates);

        // Fetch active jobs count for KPI Card #2
        let jobsCount = 0;
        try {
            const jobsResponse = await api.getJobs();
            if (Array.isArray(jobsResponse)) {
                jobsCount = jobsResponse.length;
            } else if (Array.isArray(jobsResponse?.jobs)) {
                jobsCount = jobsResponse.jobs.length;
            } else if (Array.isArray(jobsResponse?.data)) {
                jobsCount = jobsResponse.data.length;
            }
        } catch (e) {
            console.warn("Could not fetch jobs count:", e);
        }

        // Render Dashboard Components
        updateDashboardStats(globalCandidates, jobsCount);
        renderRecruitmentPipeline(globalCandidates);
        renderModuleResultsBreakdown(globalCandidates);
        renderMasterCandidatesTable(globalCandidates);

        // Auto-select candidate into mentor's dossier panel
        if (globalCandidates.length > 0) {
            if (!selectedCandidateId || !globalCandidates.some(c => String(c.id ?? c.candidate_id) === String(selectedCandidateId))) {
                inspectCandidateDossier(globalCandidates[0].id ?? globalCandidates[0].candidate_id);
            } else {
                inspectCandidateDossier(selectedCandidateId);
            }
        }

    } catch (error) {
        console.error("Failed to load dashboard data:", error);

        updateElement("stat-total", "0");
        updateElement("stat-jobs", "0");
        updateElement("stat-shortlisted", "0");
        updateElement("stat-pending", "0");

        const tbody = document.getElementById("master-candidates-tbody");
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="padding: 24px; text-align: center; color: #ef4444; font-size: 12px;">
                        Failed to connect to backend database. Verify server is running at http://127.0.0.1:8000.
                    </td>
                </tr>
            `;
        }
    }
}


// ============================================================
// 2. Executive KPI Counts
// ============================================================

function updateDashboardStats(candidates, jobsCount = 0) {
    if (!Array.isArray(candidates)) {
        candidates = [];
    }

    const persistentCache = getPersistentCache();
    const totalCount = candidates.length;
    const shortlistedCount = candidates.filter(c => normalizeStatus(c.status) === "shortlisted").length;
    
    // Accurately calculate candidates awaiting assessment
    const pendingInterviews = candidates.filter(c => {
        const candId = String(c.id ?? c.candidate_id);
        const cached = persistentCache[candId] || {};
        const isVoiceDone = (c.voice_screening_status || "").toUpperCase() === "COMPLETED" || cached.isVoiceDone;
        return !isVoiceDone && normalizeStatus(c.status) !== "rejected";
    }).length;

    updateElement("stat-total", totalCount);
    updateElement("stat-jobs", jobsCount);
    updateElement("stat-shortlisted", shortlistedCount);
    updateElement("stat-pending", pendingInterviews);
}


// ============================================================
// 3. Recruitment Pipeline Funnel (Aligned with ATS Dropdown)
// ============================================================

function renderRecruitmentPipeline(candidates) {
    const container = document.getElementById("pipeline-funnel-container");
    const badge = document.getElementById("pipeline-total-badge");
    const conversionEl = document.getElementById("funnel-conversion");
    if (!container) return;

    const total = candidates.length;
    if (badge) badge.textContent = `${total} Total Applicants`;

    if (total === 0) {
        container.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); padding: 20px 0; text-align: center;">No candidate data available in pipeline</div>`;
        if (conversionEl) conversionEl.textContent = "0%";
        return;
    }

    const persistentCache = getPersistentCache();

    // 1. Shortlisted & Scheduled counts (explicit ATS choices)
    const shortlisted = candidates.filter(c => normalizeStatus(c.status) === "shortlisted").length;
    const scheduled = candidates.filter(c => normalizeStatus(c.status) === "scheduled").length;

    // 2. Candidates who completed Voice or Technical assessment
    const interviewed = candidates.filter(c => {
        const candId = String(c.id ?? c.candidate_id);
        const cached = persistentCache[candId] || {};
        return (c.voice_screening_status || "").toUpperCase() === "COMPLETED" || 
               cached.isVoiceDone || 
               normalizeStatus(c.status) === "interviewed";
    }).length;

    // 3. Rejected count
    const rejected = candidates.filter(c => normalizeStatus(c.status) === "rejected").length;

    // 4. Applied count (candidates remaining in the initial review stage)
    const applied = candidates.filter(c => {
        const s = normalizeStatus(c.status);
        return s === "applied" || s === "processed" || s === "" || (!["shortlisted", "scheduled", "interviewed", "rejected"].includes(s));
    }).length;

    const conversionRate = total > 0 ? Math.round((shortlisted / total) * 100) : 0;
    if (conversionEl) conversionEl.textContent = `${conversionRate}%`;

    // 5 Clean Stages matching Candidate Directory dropdown & Analytics Donut
    const stages = [
        { name: "Applied", count: applied, color: "#3b82f6" },
        { name: "Shortlisted", count: shortlisted, color: "#10b981" },
        { name: "Scheduled", count: scheduled, color: "#6366f1" },
        { name: "Interviewed", count: interviewed, color: "#a855f7" },
        { name: "Rejected", count: rejected, color: "#ef4444" }
    ];

    container.innerHTML = stages.map(st => {
        const pct = total > 0 ? Math.round((st.count / total) * 100) : 0;
        return `
            <div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;">
                    <span style="font-weight: 600; color: var(--text-color);">${st.name}</span>
                    <span style="color: var(--text-muted);">${pct}% (${st.count})</span>
                </div>
                <div style="background: rgba(255, 255, 255, 0.06); height: 8px; border-radius: 6px; overflow: hidden;">
                    <div style="background: ${st.color}; width: ${pct}%; height: 100%; border-radius: 6px; transition: width 0.6s ease;"></div>
                </div>
            </div>
        `;
    }).join("");
}


// ============================================================
// 4. Multi-Module Assessment Breakdown
// ============================================================

function renderModuleResultsBreakdown(candidates) {
    if (!Array.isArray(candidates)) return;

    const persistentCache = getPersistentCache();

    const voiceCompleted = candidates.filter(c => {
        const candId = String(c.id ?? c.candidate_id);
        const cached = persistentCache[candId] || {};
        return (c.voice_screening_status || "").toUpperCase() === "COMPLETED" || cached.isVoiceDone;
    }).length;

    const techEvaluated = candidates.filter(c => {
        const candId = String(c.id ?? c.candidate_id);
        const cached = persistentCache[candId] || {};
        return (Array.isArray(c.interview_notes) && c.interview_notes.length > 0) || 
               cached.techScore !== undefined ||
               normalizeStatus(c.status) === "interviewed" || 
               (c.voice_screening_status || "").toUpperCase() === "COMPLETED";
    }).length;

    const resumeParsed = candidates.length;

    updateElement("metric-voice-count", `${voiceCompleted} Screened`);
    updateElement("metric-tech-count", `${techEvaluated} Evaluated`);
    updateElement("metric-resume-count", `${resumeParsed} Parsed`);
}


// ============================================================
// 5. Master Candidate Directory Table
// ============================================================

function renderMasterCandidatesTable(candidates) {
    const tbody = document.getElementById("master-candidates-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";
    if (!Array.isArray(candidates) || candidates.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">
                    No candidate records found in database.
                </td>
            </tr>
        `;
        return;
    }

    const persistentCache = getPersistentCache();

    candidates.forEach(candidate => {
        const row = document.createElement("tr");
        row.style.borderBottom = "1px solid var(--border-color)";
        row.style.cursor = "pointer";

        const candId = String(candidate.id ?? candidate.candidate_id);
        const cached = persistentCache[candId] || {};
        const name = candidate.name || candidate.full_name || "Unknown Candidate";
        const email = candidate.email || "No email provided";
        const status = normalizeStatus(candidate.status) || "applied";

        // Voice Assessment Status Tag (Reads from LocalStorage cache first)
        const isVoiceDone = (candidate.voice_screening_status || "").toUpperCase() === "COMPLETED" || cached.isVoiceDone;
        const voiceScore = cached.voiceScore !== undefined ? cached.voiceScore : (candidate.voice_score ? Number(candidate.voice_score) : null);

        let voiceBadge = `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700;">Pending</span>`;
        if (voiceScore !== null && voiceScore > 0) {
            const vColor = voiceScore >= 70 ? "#10b981" : "#f59e0b";
            voiceBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: ${vColor}; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700;">${voiceScore}/100</span>`;
        } else if (isVoiceDone) {
            voiceBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700;">Completed</span>`;
        }

        // Technical Simulation Score (Reads from LocalStorage cache first)
        const techScore = extractCandidateScore(candidate);
        const techBadge = techScore > 0
            ? `<strong style="color: ${techScore >= 70 ? '#10b981' : '#f59e0b'}; font-size: 12px;">${techScore}/100</strong>`
            : `<span style="color: var(--text-muted); font-size: 11px;">—</span>`;

        // Inline Category Toggler
        const statusSelectHtml = `
            <select class="action-select" onchange="changeCandidateCategory('${candId}', this.value)" onclick="event.stopPropagation()">
                <option value="applied" ${status === 'applied' || status === 'processed' ? 'selected' : ''}>Applied</option>
                <option value="shortlisted" ${status === 'shortlisted' ? 'selected' : ''}>Shortlisted</option>
                <option value="scheduled" ${status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                <option value="rejected" ${status === 'rejected' ? 'selected' : ''}>Rejected</option>
            </select>
        `;

        row.onclick = () => inspectCandidateDossier(candId);

        row.innerHTML = `
            <td style="padding: 12px 8px; font-size: 12px;">
                <strong style="color: var(--text-color); display: block;">${escapeHtml(name)}</strong>
                <span style="color: var(--text-muted); font-size: 10px;">${escapeHtml(email)}</span>
            </td>
            <td style="padding: 12px 8px;">${voiceBadge}</td>
            <td style="padding: 12px 8px;">${techBadge}</td>
            <td style="padding: 12px 8px;">
                <span style="${getStatusBadgeStyle(status)}">${escapeHtml(status.toUpperCase())}</span>
            </td>
            <td style="padding: 12px 8px; text-align: center;">${statusSelectHtml}</td>
            <td style="padding: 12px 8px; text-align: right;">
                <a href="interview.html?candidate_id=${candId}" class="launch-btn" onclick="event.stopPropagation()">
                    Assess &rarr;
                </a>
            </td>
        `;

        tbody.appendChild(row);
    });
}


// ============================================================
// 6. Mentor's 5-Pillar Recruiter Dossier Panel
// ============================================================

function inspectCandidateDossier(candidateId) {
    selectedCandidateId = candidateId;
    const dossierContainer = document.getElementById("dossier-content");
    const activeTag = document.getElementById("dossier-active-tag");
    if (!dossierContainer) return;

    const candidate = globalCandidates.find(c => String(c.id ?? c.candidate_id) === String(candidateId));
    if (!candidate) return;

    const name = candidate.name || candidate.full_name || "Candidate";
    const status = normalizeStatus(candidate.status) || "applied";
    if (activeTag) activeTag.textContent = name;

    // Field 1: Candidate Score
    const score = extractCandidateScore(candidate);
    const scoreBadgeColor = score >= 75 ? "#10b981" : (score >= 50 ? "#3b82f6" : (score > 0 ? "#f59e0b" : "#64748b"));
    const scoreDisplayText = score > 0 ? `${score}/100` : "0/100 (Unscreened)";

    // Field 2: Match Percentage (computed against core requirements)
    const skills = extractSkillsArray(candidate);
    const requiredSkills = ["python", "fastapi", "mysql", "docker", "rest api", "git"];
    const matchedCount = requiredSkills.filter(req => skills.some(s => s.toLowerCase().includes(req))).length;
    const matchPercentage = Math.min(100, Math.max(20, Math.round((matchedCount / requiredSkills.length) * 100)));

    // Field 3: Missing Skills (Skill Gap Analysis)
    const missingSkills = requiredSkills.filter(req => !skills.some(s => s.toLowerCase().includes(req)));
    const missingSkillsHtml = missingSkills.length > 0
        ? missingSkills.map(s => `<span class="skill-tag-missing">✕ ${s.toUpperCase()}</span>`).join(" ")
        : `<span style="color: #10b981; font-size: 11px; font-weight: 700;">✓ Core competencies satisfied</span>`;

    // Field 4: Interview Questions & Turns Log
    let questionsHtml = "";
    if (Array.isArray(candidate.interview_notes) && candidate.interview_notes.length > 0) {
        questionsHtml = candidate.interview_notes.slice(0, 3).map((n, i) => `
            <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed var(--border-color);">
                <div style="font-size: 11px; font-weight: 700; color: var(--text-color);">Q${i + 1}: ${escapeHtml(n.question || "Technical prompt")}</div>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Score: ${n.score || 70}/100</div>
            </div>
        `).join("");
    } else {
        questionsHtml = `
            <div style="font-size: 11px; color: var(--text-muted); line-height: 1.5;">
                • Q1: Architecture of core projects<br>
                • Q2: RESTful API design & error handling<br>
                • Q3: Database indexing & scaling strategy
            </div>
        `;
    }

    // Field 5: Hiring Recommendation
    let recommendationText = "Recommended for technical progression";
    let recommendationIcon = "✅";
    if (status === "rejected" || (score > 0 && score < 50)) {
        recommendationText = "Under review / Not recommended";
        recommendationIcon = "⚠️";
    } else if (score >= 80 || matchPercentage >= 80) {
        recommendationText = "Highly Recommended";
        recommendationIcon = "🌟";
    } else if (score === 0) {
        recommendationText = "Awaiting interview completion";
        recommendationIcon = "⏳";
    }

    dossierContainer.innerHTML = `
        <div class="mentor-dossier">
            <!-- 1. Candidate Score & 2. Match Percentage -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <div>
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">1. Candidate Score</div>
                    <div style="font-size: 22px; font-weight: 800; color: ${scoreBadgeColor};">${scoreDisplayText}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">2. Match Percentage</div>
                    <div style="font-size: 22px; font-weight: 800; color: #818cf8;">${matchPercentage}%</div>
                </div>
            </div>

            <!-- Match Progress Bar -->
            <div style="background: rgba(255,255,255,0.06); height: 6px; border-radius: 4px; overflow: hidden; margin-bottom: 16px;">
                <div style="background: #818cf8; width: ${matchPercentage}%; height: 100%; border-radius: 4px;"></div>
            </div>

            <!-- 3. Missing Skills -->
            <div style="margin-bottom: 16px;">
                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">3. Missing Skills (Skill Gap)</div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    ${missingSkillsHtml}
                </div>
            </div>

            <!-- 4. Interview Questions -->
            <div style="margin-bottom: 16px;">
                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">4. Interview Questions &amp; Context</div>
                ${questionsHtml}
            </div>

            <!-- 5. Hiring Recommendation -->
            <div style="padding: 10px; border-radius: 6px; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); margin-bottom: 16px;">
                <div style="font-size: 10px; font-weight: 700; color: #10b981; text-transform: uppercase;">5. Hiring Recommendation</div>
                <div style="font-size: 12px; font-weight: 700; color: var(--text-color); margin-top: 3px;">
                    ${recommendationIcon} ${recommendationText}
                </div>
            </div>

            <!-- Direct Status Action Buttons -->
            <div style="display: flex; gap: 6px;">
                <button onclick="changeCandidateCategory('${candidateId}', 'shortlisted')" style="flex: 1; padding: 7px 4px; border: none; border-radius: 4px; background: #10b981; color: #fff; font-size: 11px; font-weight: 700; cursor: pointer;">
                    ✓ Shortlist
                </button>
                <button onclick="changeCandidateCategory('${candidateId}', 'scheduled')" style="flex: 1; padding: 7px 4px; border: none; border-radius: 4px; background: #3b82f6; color: #fff; font-size: 11px; font-weight: 700; cursor: pointer;">
                    📅 Schedule
                </button>
                <button onclick="changeCandidateCategory('${candidateId}', 'rejected')" style="flex: 1; padding: 7px 4px; border: none; border-radius: 4px; background: #dc2626; color: #fff; font-size: 11px; font-weight: 700; cursor: pointer;">
                    ✕ Reject
                </button>
            </div>
        </div>
    `;
}


// ============================================================
// 7. Update Candidate Stage Directly
// ============================================================

async function changeCandidateCategory(candidateId, newStatus) {
    if (!candidateId) return;

    try {
        await api.updateCandidateStatus(candidateId, newStatus);
        
        // Update candidate in local array
        const cand = globalCandidates.find(c => String(c.id ?? c.candidate_id) === String(candidateId));
        if (cand) cand.status = newStatus;

        // Also record status in persistent storage
        try {
            const cache = getPersistentCache();
            const strId = String(candidateId);
            cache[strId] = { ...(cache[strId] || {}), status: newStatus };
            localStorage.setItem("rc_candidate_scores", JSON.stringify(cache));
        } catch (e) {}

        // Refresh UI components immediately
        updateDashboardStats(globalCandidates);
        renderRecruitmentPipeline(globalCandidates);
        renderMasterCandidatesTable(globalCandidates);
        inspectCandidateDossier(candidateId);

    } catch (error) {
        console.error("Failed to update candidate status:", error);
        alert(`Failed to update candidate status: ${error.message || "Server error"}`);
    }
}


// ============================================================
// 8. Helper Functions (LocalStorage Sync Enabled)
// ============================================================

function extractCandidateScore(candidate) {
    if (!candidate) return 0;
    const candId = String(candidate.id ?? candidate.candidate_id);

    // Check persistent cross-page cache first
    try {
        const cache = getPersistentCache();
        if (cache[candId]?.techScore !== undefined && Number(cache[candId].techScore) > 0) {
            return Number(cache[candId].techScore);
        }
        if (cache[candId]?.voiceScore !== undefined && Number(cache[candId].voiceScore) > 0) {
            return Number(cache[candId].voiceScore);
        }
    } catch (e) {}

    // Check backend candidate fields
    if (Array.isArray(candidate.interview_notes) && candidate.interview_notes.length > 0) {
        const scores = candidate.interview_notes.map(n => Number(n.score || 0)).filter(s => s > 0);
        if (scores.length > 0) return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    if (candidate.score !== undefined && candidate.score !== null && Number(candidate.score) > 0) {
        return Number(candidate.score);
    }
    return 0;
}

function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function normalizeStatus(status) {
    if (!status) return "";
    return String(status).trim().toLowerCase().replace(/\s+/g, "_");
}

function extractSkillsArray(candidate) {
    if (!candidate) return [];
    let skills = candidate.skills || candidate.skillset || [];
    if (typeof skills === "string") {
        try { skills = JSON.parse(skills); } catch (e) { skills = skills.split(","); }
    }
    if (!Array.isArray(skills)) return [];
    return skills.map(skill => {
        if (typeof skill === "object" && skill !== null) {
            return skill.name || skill.skill || skill.title || "";
        }
        return String(skill);
    }).map(s => s.trim()).filter(Boolean);
}

function getStatusBadgeStyle(status) {
    const norm = normalizeStatus(status);
    if (norm === "shortlisted") return "background:#d4edda; color:#155724; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700;";
    if (norm === "rejected") return "background:#f8d7da; color:#721c24; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700;";
    if (norm === "scheduled") return "background:#dbeafe; color:#1e40af; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700;";
    return "background:#e2e3e5; color:#383d41; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700;";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.changeCandidateCategory = changeCandidateCategory;
window.inspectCandidateDossier = inspectCandidateDossier;