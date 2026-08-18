/* ============================================================
   frontend-html/js/interview.js
   Interview Copilot & ATS Management Handler
   ============================================================ */

let isInterviewActive = false;
let activeCandidateId = null;
let activeCandidateName = "Candidate";
let chatHistory = [];
let candidatesList = [];

document.addEventListener("DOMContentLoaded", () => {
  resetInterviewControls();
  loadOptions();

  // Button Event Listeners
  document.getElementById("generate-btn")?.addEventListener("click", generateQuestions);
  document.getElementById("start-interview-btn")?.addEventListener("click", startInterview);
  document.getElementById("end-interview-btn")?.addEventListener("click", endInterview);
  document.getElementById("send-msg-btn")?.addEventListener("click", sendChatMessage);

  // Send message on Enter key only when active
  const input = document.getElementById("chat-input");
  input?.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && isInterviewActive) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Keep both candidate selectors in sync
  document.getElementById("gen-candidate-select")?.addEventListener("change", (e) => {
    const selectedId = e.target.value;
    const simSelect = document.getElementById("candidate-select");
    if (simSelect && !isInterviewActive) {
      simSelect.value = selectedId;
    }
    updateActiveCandidate(selectedId);
  });

  document.getElementById("candidate-select")?.addEventListener("change", (e) => {
    const selectedId = e.target.value;
    const genSelect = document.getElementById("gen-candidate-select");
    if (genSelect) {
      genSelect.value = selectedId;
    }
    updateActiveCandidate(selectedId);
  });
});

function updateActiveCandidate(selectedId) {
  if (selectedId) {
    activeCandidateId = selectedId;
    const cand = candidatesList.find(c => String(c.id) === String(selectedId));
    activeCandidateName = cand?.name || "Candidate";
    
    const header = document.getElementById("sim-candidate-header");
    if (header && !isInterviewActive) {
      header.textContent = `Candidate: ${activeCandidateName} (Ready to start)`;
    }
  }
}

function resetInterviewControls() {
  isInterviewActive = false;
  
  const startBtn = document.getElementById("start-interview-btn");
  if (startBtn) startBtn.disabled = false;

  const endBtn = document.getElementById("end-interview-btn");
  if (endBtn) {
    endBtn.disabled = true;
    endBtn.className = "btn-danger-outline";
  }

  const chatInput = document.getElementById("chat-input");
  if (chatInput) {
    chatInput.disabled = true;
    chatInput.value = "";
    chatInput.placeholder = "Type your response...";
  }

  const sendBtn = document.getElementById("send-msg-btn");
  if (sendBtn) sendBtn.disabled = true;

  const sessionBadge = document.getElementById("session-badge");
  if (sessionBadge) {
    sessionBadge.textContent = "No Active Session";
    sessionBadge.style.backgroundColor = "var(--bg-subtle)";
    sessionBadge.style.color = "var(--text-muted)";
  }

  const candSelect = document.getElementById("candidate-select");
  if (candSelect) candSelect.disabled = false;
}

async function loadOptions() {
  try {
    // 1. Load Job Postings
    const jobs = await (api.getJobs ? api.getJobs() : api.getJobPostings());
    const jobSelect = document.getElementById("job-select");
    if (jobSelect) {
      jobSelect.innerHTML = (!jobs || jobs.length === 0)
        ? `<option value="">No jobs found</option>`
        : jobs.map(j => `<option value="${j.id}">${escapeHtml(j.title || 'Untitled Job')}</option>`).join("");
    }

    // 2. Load Candidates & Populate Both Dropdowns
    const candidates = await api.getCandidates();
    candidatesList = candidates || [];
    
    const candidateOptions = (!candidates || candidates.length === 0)
      ? `<option value="">No candidates found</option>`
      : `<option value="">-- Select candidate profile --</option>` + 
        candidates.map(c => `<option value="${c.id}">${escapeHtml(c.name || 'Candidate')}</option>`).join("");

    const genCandSelect = document.getElementById("gen-candidate-select");
    if (genCandSelect) genCandSelect.innerHTML = candidateOptions;

    const simCandSelect = document.getElementById("candidate-select");
    if (simCandSelect) simCandSelect.innerHTML = candidateOptions;

    // 3. Render ATS Cards
    renderAtsCards(candidatesList);
  } catch (err) {
    console.error("Failed to load initial data:", err);
  }
}

// ============================================================
// Resume-Grounded Question Generator
// ============================================================
async function generateQuestions() {
  const jobId = document.getElementById("job-select")?.value;
  const questionType = document.getElementById("type-select")?.value || "Technical Skills";
  const genCandidateId = document.getElementById("gen-candidate-select")?.value;
  const candidateId = genCandidateId || activeCandidateId || null;
  const container = document.getElementById("questions-container");

  if (!jobId || !container) {
    alert("Please select a job position first.");
    return;
  }

  const matchedCand = candidatesList.find(c => String(c.id) === String(candidateId));
  const candName = matchedCand?.name || activeCandidateName;
  const candidateLabel = candidateId && candName !== "Candidate" 
    ? ` for ${escapeHtml(candName)} (Resume Context)` 
    : "";

  container.innerHTML = `<p style="font-size:12px; color:var(--text-muted); padding:12px;">⚡ Generating questions${candidateLabel} with AI Copilot...</p>`;

  try {
    const fetchFn = api.generateInterviewQuestions || api.generateQuestions;
    const data = await fetchFn(jobId, questionType, candidateId);
    const questions = data.questions || [];

    if (!questions.length) {
      container.innerHTML = `<p style="font-size:12px; color:var(--text-muted); padding:12px;">No questions generated.</p>`;
      return;
    }

    container.innerHTML = questions.map((q, idx) => {
      const qText = q.question || q.text || "Interview question";
      const qType = q.type || q.category || questionType;
      const timeEst = q.estimated_time || q.time_estimate || "3-5 min response";

      return `
        <div class="question-card">
          <div class="q-number">${idx + 1}</div>
          <div class="q-body">
            <div class="q-text">${escapeHtml(qText)}</div>
            <div class="q-meta">${escapeHtml(qType)} &bull; ${escapeHtml(timeEst)}</div>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = `<p style="font-size:12px; color:#ef4444; padding:12px;">Failed to generate questions: ${escapeHtml(err.message || "Error")}</p>`;
  }
}

// ============================================================
// Resume-Grounded Start Interview
// ============================================================
function startInterview() {
  const candSelect = document.getElementById("candidate-select");
  const candidateId = candSelect?.value;

  if (!candidateId) {
    alert("Please select a candidate from the dropdown first.");
    return;
  }

  activeCandidateId = candidateId;
  const cand = candidatesList.find(c => String(c.id) === String(candidateId));
  activeCandidateName = cand?.name || "Candidate";

  isInterviewActive = true;
  chatHistory = [];

  if (candSelect) candSelect.disabled = true;
  const startBtn = document.getElementById("start-interview-btn");
  if (startBtn) startBtn.disabled = true;

  const endBtn = document.getElementById("end-interview-btn");
  if (endBtn) {
    endBtn.disabled = false;
    endBtn.className = "btn-danger-outline active";
  }

  const sessionBadge = document.getElementById("session-badge");
  if (sessionBadge) {
    sessionBadge.textContent = "Active Session";
    sessionBadge.style.backgroundColor = "var(--primary-light)";
    sessionBadge.style.color = "var(--primary-color)";
  }

  const header = document.getElementById("sim-candidate-header");
  if (header) {
    header.textContent = `Candidate: ${activeCandidateName}`;
  }

  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-msg-btn");
  if (chatInput) {
    chatInput.disabled = false;
    chatInput.placeholder = "Type your response...";
    chatInput.focus();
  }
  if (sendBtn) sendBtn.disabled = false;

  const chatBox = document.getElementById("chat-box");
  if (chatBox) chatBox.innerHTML = "";

  const skillsPreview = (cand && Array.isArray(cand.skills) && cand.skills.length > 0)
    ? ` I see your background in ${cand.skills.slice(0, 3).join(", ")}.`
    : "";

  appendMsg("ai", `Hello ${activeCandidateName}, I'm your AI technical interviewer today.${skillsPreview} Let's begin: could you introduce yourself and walk me through the most technically complex project listed on your resume?`);
}

// ============================================================
// End Interview
// ============================================================
function endInterview() {
  if (!isInterviewActive) return;

  isInterviewActive = false;

  const startBtn = document.getElementById("start-interview-btn");
  if (startBtn) startBtn.disabled = false;

  const candSelect = document.getElementById("candidate-select");
  if (candSelect) candSelect.disabled = false;

  const endBtn = document.getElementById("end-interview-btn");
  if (endBtn) {
    endBtn.disabled = true;
    endBtn.className = "btn-danger-outline";
  }

  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-msg-btn");
  if (chatInput) {
    chatInput.disabled = true;
    chatInput.value = "";
    chatInput.placeholder = "Interview concluded. Select a candidate and click Start to begin.";
  }
  if (sendBtn) sendBtn.disabled = true;

  const sessionBadge = document.getElementById("session-badge");
  if (sessionBadge) {
    sessionBadge.textContent = "Session Concluded";
    sessionBadge.style.backgroundColor = "var(--bg-subtle)";
    sessionBadge.style.color = "var(--text-muted)";
  }

  appendMsg("ai", `🏁 The interview session with ${activeCandidateName} has ended and conversation logs are synced to ATS.`);
}

// ============================================================
// Chat Simulation
// ============================================================
async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  if (!input || !input.value.trim() || !isInterviewActive || !activeCandidateId) return;

  const userText = input.value.trim();
  appendMsg("user", userText);
  input.value = "";
  input.disabled = true;
  document.getElementById("send-msg-btn")?.setAttribute("disabled", "true");

  try {
    const simFn = api.simulateInterviewTurn || api.simulateInterviewChat;
    const data = await simFn(activeCandidateId, userText, chatHistory);
    const reply = data?.ai_response || data?.reply || "Thank you for the answer. Can you tell me more about how you handle scale and edge cases?";

    appendMsg("ai", reply);
    chatHistory.push({ user: userText, ai: reply });
  } catch (err) {
    console.error("Simulation error:", err);
    appendMsg("ai", "Thank you for your response. How would you handle continuous monitoring and testing in that architecture?");
  } finally {
    if (isInterviewActive) {
      input.disabled = false;
      document.getElementById("send-msg-btn")?.removeAttribute("disabled");
      input.focus();
    }
  }
}

function appendMsg(sender, text) {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;

  const bubble = document.createElement("div");
  bubble.className = `chat-msg ${sender}`;
  bubble.textContent = text;

  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ============================================================
// ATS Status Updates
// ============================================================
function renderAtsCards(candidates) {
  const container = document.getElementById("ats-candidates-container");
  if (!container) return;

  if (!candidates || candidates.length === 0) {
    container.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">No candidates in ATS pipeline</span>`;
    return;
  }

  container.innerHTML = candidates.slice(0, 2).map(c => {
    const initials = (c.name || "C").split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    const statusText = c.status ? (c.status.charAt(0).toUpperCase() + c.status.slice(1).toLowerCase()) : "In review";

    return `
      <div class="ats-card">
        <div class="ats-avatar">${escapeHtml(initials)}</div>
        <div>
          <strong class="ats-name" style="font-size:13px; display:block;">${escapeHtml(c.name || 'Candidate')}</strong>
          <span style="font-size:11px; color:var(--text-muted);">${escapeHtml(statusText)}</span>
        </div>
      </div>
    `;
  }).join("");
}

async function updateCandidatePipelineStatus(newStatus) {
  const targetId = activeCandidateId || document.getElementById("candidate-select")?.value;
  if (!targetId) {
    alert("Please select a candidate first.");
    return;
  }

  try {
    await api.updateCandidateStatus(targetId, newStatus);
    const cand = candidatesList.find(c => String(c.id) === String(targetId));
    if (cand) cand.status = newStatus;
    renderAtsCards(candidatesList);
    alert(`Candidate status updated to: ${newStatus}`);
  } catch (err) {
    alert("Failed to update status: " + (err.message || "Server error"));
  }
}

window.updateCandidatePipelineStatus = updateCandidatePipelineStatus;

function escapeHtml(val) {
  return String(val ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}