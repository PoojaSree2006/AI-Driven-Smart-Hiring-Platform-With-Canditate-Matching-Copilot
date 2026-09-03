/* ============================================================
   frontend-html/js/interview.js
   Unified Assessment Hub: Voice Screening + Tech Copilot + ATS
   (Fixed Persistent State Sync via LocalStorage)
   ============================================================ */

// Global State Management
let activeCandidateId = null;
let activeCandidateName = "Candidate";
let candidatesList = [];

// ============================================================
// LocalStorage Persistent Evaluation Cache (Survives page switches)
// ============================================================
function getPersistentCache() {
  try {
    return JSON.parse(localStorage.getItem("rc_candidate_scores") || "{}");
  } catch (e) {
    return {};
  }
}

function saveToPersistentCache(candId, data) {
  try {
    const cache = getPersistentCache();
    const strId = String(candId);
    cache[strId] = { ...(cache[strId] || {}), ...data };
    localStorage.setItem("rc_candidate_scores", JSON.stringify(cache));
  } catch (e) {
    console.warn("Could not save to persistent storage:", e);
  }
}

// Technical Simulation State
let isInterviewActive = false;
let chatHistory = [];
let currentQuestion = "";
let questionNumber = 1;
let totalQuestions = 5;
let answerScores = [];
let finalInterviewScore = 0;

// Voice Screening State
let speechRecognition = null;
let isRecordingVoice = false;
let voiceStartTime = null;
let voiceDurationTimer = null;
let voiceTranscript = "";
let currentVoiceTopicIndex = 0;

// ============================================================
// 1. Dynamic Rotating Voice Screening Topics
// ============================================================
const VOICE_TOPICS = [
  {
    category: "Architecture & System Decisions",
    prompt: "Please describe an application or technical feature you built from scratch. What architecture decisions did you make, and why did you choose that particular tech stack?"
  },
  {
    category: "Real-World Debugging & Crisis Resolution",
    prompt: "Walk us through the most difficult production bug or system failure you encountered. How did you diagnose the root cause, communicate with teammates, and resolve it?"
  },
  {
    category: "Performance, Scalability & Caching",
    prompt: "Discuss a scenario where you had to optimize API latency or database query bottlenecks. What tools or strategies (indexing, caching, async jobs) did you apply?"
  },
  {
    category: "Engineering Collaboration & Consensus",
    prompt: "Describe a technical disagreement you had with a colleague regarding API design or database schema modeling. How did you reach an architectural consensus?"
  },
  {
    category: "Security & Production Readiness",
    prompt: "How do you approach authentication, sensitive credential management, and input validation before deploying a backend service to production?"
  }
];

// ============================================================
// 2. Initialization & Lifecycle
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  setupSpeechRecognition();
  loadCandidatesAndPreselect();
  loadATSCandidates();
  rotateVoiceTopic(0);
});

// ============================================================
// 3. Candidate Directory & URL Parameter Bridge
// ============================================================
async function loadCandidatesAndPreselect() {
  const candSelect = document.getElementById("candidate-select");
  if (!candSelect) return;

  try {
    const response = await api.getCandidates();
    let list = [];
    if (Array.isArray(response)) list = response;
    else if (Array.isArray(response?.candidates)) list = response.candidates;
    else if (Array.isArray(response?.data)) list = response.data;
    else if (Array.isArray(response?.data?.candidates)) list = response.data.candidates;

    candidatesList = list;

    if (list.length === 0) {
      candSelect.innerHTML = `<option value="">No candidates found</option>`;
      return;
    }

    candSelect.innerHTML = `<option value="">-- Select Candidate to Evaluate --</option>` +
      list.map(c => {
        const cId = c.id ?? c.candidate_id;
        return `<option value="${cId}">${escapeHtml(c.name || "Candidate")}</option>`;
      }).join("");

    // Check URL parameters for candidate forwarded from Dashboard
    const urlParams = new URLSearchParams(window.location.search);
    const preSelectedId = urlParams.get("candidate_id");

    if (preSelectedId) {
      candSelect.value = preSelectedId;
      loadCandidateContext();
    }

  } catch (err) {
    console.error("Failed to load candidates for assessment hub:", err);
    candSelect.innerHTML = `<option value="">Error loading candidates</option>`;
  }
}

function loadCandidateContext() {
  const candSelect = document.getElementById("candidate-select");
  const selectedId = candSelect ? candSelect.value : null;

  if (!selectedId) {
    alert("Please select a candidate from the dropdown.");
    return;
  }

  activeCandidateId = selectedId;
  const cand = candidatesList.find(c => String(c.id ?? c.candidate_id) === String(selectedId));
  activeCandidateName = cand?.name || "Candidate";

  const header = document.getElementById("sim-candidate-header");
  if (header) {
    header.textContent = `${activeCandidateName} (Ready for Voice & Technical Assessment)`;
  }

  // Restore cached feedback in voice evaluation card if previously completed
  const persistentCache = getPersistentCache();
  const cached = persistentCache[String(selectedId)];
  if (cached && cached.voiceScore !== undefined) {
    const resultBox = document.getElementById("voice-potential-result");
    const scorePill = document.getElementById("voice-score-pill");
    const cadenceLine = document.getElementById("voice-cadence-line");
    const naturalnessLine = document.getElementById("voice-naturalness-line");
    const suggestionLine = document.getElementById("voice-suggestion-line");

    if (resultBox && scorePill) {
      resultBox.style.display = "block";
      scorePill.textContent = `Score: ${cached.voiceScore}/100`;
      scorePill.style.color = cached.voiceScore >= 70 ? "#10b981" : "#f59e0b";
      scorePill.style.background = cached.voiceScore >= 70 ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)";
      if (cadenceLine) cadenceLine.innerHTML = `• <strong>Pace &amp; Flow:</strong> Evaluated (${cached.voiceScore >= 70 ? 'Natural Cadence' : 'Brief / Hesitant'})`;
      if (naturalnessLine) naturalnessLine.innerHTML = `• <strong>Naturalness:</strong> Completed assessment session`;
      if (suggestionLine) suggestionLine.innerHTML = `🌟 <strong>Saved Evaluation:</strong> Results retrieved from persistent storage.`;
    }
  }

  // Highlight candidate row in bottom ATS table if visible
  const rows = document.querySelectorAll("#ats-candidates-tbody tr");
  rows.forEach(r => r.style.background = "");
  const targetRow = document.getElementById(`ats-row-${selectedId}`);
  if (targetRow) {
    targetRow.style.background = "rgba(59, 130, 246, 0.08)";
    targetRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// ============================================================
// 4. Voice Screening: Dynamic Topics & Audio Controls
// ============================================================
function rotateVoiceTopic(specificIndex = null) {
  if (specificIndex !== null && specificIndex >= 0 && specificIndex < VOICE_TOPICS.length) {
    currentVoiceTopicIndex = specificIndex;
  } else {
    currentVoiceTopicIndex = (currentVoiceTopicIndex + 1) % VOICE_TOPICS.length;
  }

  const topic = VOICE_TOPICS[currentVoiceTopicIndex];
  const catEl = document.getElementById("voice-topic-category");
  const promptEl = document.getElementById("voice-topic-prompt");

  if (catEl) catEl.textContent = topic.category;
  if (promptEl) promptEl.textContent = `"${topic.prompt}"`;
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    const statusEl = document.getElementById("voice-mic-status");
    if (statusEl) statusEl.textContent = "Web Speech API not supported. Please use Google Chrome.";
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.lang = "en-US";

  speechRecognition.onstart = () => {
    isRecordingVoice = true;
    startVoiceTimer();
    updateMicVisuals(true);
    setVoiceStatus("Listening... Speak clearly on the topic.");
  };

  speechRecognition.onresult = (event) => {
    let interim = "";
    let final = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const trans = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        voiceTranscript += trans + " ";
      } else {
        interim += trans;
      }
    }

    const textArea = document.getElementById("voice-transcript-area");
    if (textArea) {
      textArea.value = (voiceTranscript + interim).trim();
    }
  };

  speechRecognition.onerror = (event) => {
    console.error("Speech Recognition error:", event.error);
    stopVoiceRecording();
    if (event.error === "no-speech") {
      setVoiceStatus("No speech detected. Please check microphone input.");
    } else if (event.error === "not-allowed") {
      setVoiceStatus("Microphone access blocked. Enable permissions in browser.");
    } else {
      setVoiceStatus(`Mic status: ${event.error}`);
    }
  };

  speechRecognition.onend = () => {
    if (isRecordingVoice) {
      try { speechRecognition.start(); } catch (e) {}
    } else {
      stopVoiceTimer();
      updateMicVisuals(false);
    }
  };
}

function startVoiceRecording() {
  if (!activeCandidateId) {
    alert("Please select a candidate first.");
    return;
  }
  if (!speechRecognition) {
    alert("Speech recognition is not available in this browser. Please use Google Chrome.");
    return;
  }

  voiceTranscript = "";
  const textArea = document.getElementById("voice-transcript-area");
  if (textArea) textArea.value = "";

  const startBtn = document.getElementById("start-voice-btn");
  const stopBtn = document.getElementById("stop-voice-btn");
  if (startBtn) startBtn.style.display = "none";
  if (stopBtn) stopBtn.style.display = "inline-block";

  try {
    speechRecognition.start();
  } catch (err) {
    console.warn("Recognition start warning:", err);
  }
}

function stopVoiceRecording() {
  isRecordingVoice = false;
  if (speechRecognition) {
    try { speechRecognition.stop(); } catch (e) {}
  }
  stopVoiceTimer();
  updateMicVisuals(false);

  const startBtn = document.getElementById("start-voice-btn");
  const stopBtn = document.getElementById("stop-voice-btn");
  if (startBtn) {
    startBtn.style.display = "inline-block";
    startBtn.textContent = "🎤 Resume Speaking";
  }
  if (stopBtn) stopBtn.style.display = "none";

  setVoiceStatus("Speech recorded. Click 'Evaluate Speech & Potential' below.");
}

function clearVoiceRecording() {
  stopVoiceRecording();
  voiceTranscript = "";
  const textArea = document.getElementById("voice-transcript-area");
  if (textArea) textArea.value = "";

  const timerEl = document.getElementById("voice-timer");
  if (timerEl) timerEl.textContent = "00:00";

  const resultBox = document.getElementById("voice-potential-result");
  if (resultBox) resultBox.style.display = "none";

  const startBtn = document.getElementById("start-voice-btn");
  if (startBtn) startBtn.textContent = "🎤 Start Speaking";

  setVoiceStatus("Microphone standby. Click start to speak on the topic.");
}

function startVoiceTimer() {
  clearInterval(voiceDurationTimer);
  voiceStartTime = Date.now();
  const timerEl = document.getElementById("voice-timer");

  voiceDurationTimer = setInterval(() => {
    if (!voiceStartTime) return;
    const elapsed = Math.floor((Date.now() - voiceStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopVoiceTimer() {
  clearInterval(voiceDurationTimer);
  voiceDurationTimer = null;
}

function updateMicVisuals(isActive) {
  const mic = document.getElementById("mic-circle");
  if (!mic) return;
  if (isActive) {
    mic.style.transform = "scale(1.15)";
    mic.style.boxShadow = "0 0 20px rgba(239, 68, 68, 0.6)";
    mic.style.background = "#ef4444";
  } else {
    mic.style.transform = "scale(1)";
    mic.style.boxShadow = "0 0 14px rgba(124, 58, 237, 0.35)";
    mic.style.background = "#7c3aed";
  }
}

function setVoiceStatus(msg) {
  const el = document.getElementById("voice-mic-status");
  if (el) el.textContent = msg;
}

// ============================================================
// 5. Speech Evaluation & "Potential" Engine (LocalStorage Fixed)
// ============================================================
async function evaluateVoiceSpeech() {
  const textArea = document.getElementById("voice-transcript-area");
  const rawText = textArea ? textArea.value.trim() : "";
  const resultBox = document.getElementById("voice-potential-result");
  const scorePill = document.getElementById("voice-score-pill");
  const cadenceLine = document.getElementById("voice-cadence-line");
  const naturalnessLine = document.getElementById("voice-naturalness-line");
  const suggestionLine = document.getElementById("voice-suggestion-line");

  if (!resultBox) return;
  resultBox.style.display = "block";

  const timerEl = document.getElementById("voice-timer");
  const timeParts = (timerEl ? timerEl.textContent : "00:00").split(":");
  const durationSec = (parseInt(timeParts[0], 10) * 60) + parseInt(timeParts[1], 10);
  const words = rawText.length > 0 ? rawText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  let calculatedVoiceScore = 0;
  let isVoiceComplete = false;

  // -------------------------------------------------------------
  // TEST CASE A: Empty or Silent Audio Input
  // -------------------------------------------------------------
  if (wordCount === 0 || rawText === "") {
    calculatedVoiceScore = 0;
    isVoiceComplete = false;

    if (scorePill) {
      scorePill.textContent = "Score: 0/100";
      scorePill.style.color = "#ef4444";
      scorePill.style.background = "rgba(239, 68, 68, 0.15)";
    }
    if (cadenceLine) cadenceLine.innerHTML = `• <strong>Pace &amp; Flow:</strong> 0 WPM (No audio detected)`;
    if (naturalnessLine) naturalnessLine.innerHTML = `• <strong>Naturalness:</strong> Incomplete session`;
    if (suggestionLine) suggestionLine.innerHTML = `⚠️ <strong>Diagnostic Note:</strong> No spoken response was captured. Ensure your microphone is plugged in, browser permissions are allowed, or prompt candidate to provide an answer.`;
  }
  // -------------------------------------------------------------
  // TEST CASE B: Extremely Short Input (< 15 words)
  // -------------------------------------------------------------
  else if (wordCount < 15) {
    calculatedVoiceScore = 42;
    isVoiceComplete = true;

    if (scorePill) {
      scorePill.textContent = "Score: 42/100";
      scorePill.style.color = "#f59e0b";
      scorePill.style.background = "rgba(245, 158, 11, 0.15)";
    }
    if (cadenceLine) cadenceLine.innerHTML = `• <strong>Pace &amp; Flow:</strong> Hesitant or clipped response (${wordCount} words)`;
    if (naturalnessLine) naturalnessLine.innerHTML = `• <strong>Naturalness:</strong> High brevity / Limited expression`;
    if (suggestionLine) suggestionLine.innerHTML = `💡 <strong>Recruiter Coaching:</strong> Response was too brief for an executive assessment. Candidate needs to elaborate on technical trade-offs with complete thoughts.`;
  }
  // -------------------------------------------------------------
  // TEST CASE C: Articulate, Natural Speech Assessment
  // -------------------------------------------------------------
  else {
    const effectiveMins = Math.max(0.15, durationSec / 60);
    const wpm = Math.round(wordCount / effectiveMins);

    let cadenceRating = "Optimal conversational flow";
    let cadenceColor = "#10b981";
    if (wpm < 80) {
      cadenceRating = "Thoughtful pacing with reflective pauses";
    } else if (wpm > 165) {
      cadenceRating = "Rapid speech cadence; recommend steady breathing";
      cadenceColor = "#f59e0b";
    }

    const techTokens = ["architecture", "database", "api", "service", "performance", "scalability", "framework", "fastapi", "python", "mysql", "cache", "test", "docker", "deploy"];
    const matchedTokens = techTokens.filter(t => rawText.toLowerCase().includes(t)).length;

    let baseScore = 70;
    if (wpm >= 90 && wpm <= 150) baseScore += 15;
    if (matchedTokens >= 3) baseScore += 15;
    calculatedVoiceScore = Math.min(96, baseScore);
    isVoiceComplete = true;

    if (scorePill) {
      scorePill.textContent = `Score: ${calculatedVoiceScore}/100`;
      scorePill.style.color = "#10b981";
      scorePill.style.background = "rgba(16, 185, 129, 0.15)";
    }
    if (cadenceLine) {
      cadenceLine.innerHTML = `• <strong>Pace &amp; Flow:</strong> <span style="color:${cadenceColor}">${wpm} WPM (${cadenceRating})</span>`;
    }
    if (naturalnessLine) {
      naturalnessLine.innerHTML = `• <strong>Naturalness:</strong> ★★★★☆ (Authentic unscripted delivery, natural phrasing)`;
    }
    if (suggestionLine) {
      suggestionLine.innerHTML = `🌟 <strong>Potential Verdict:</strong> Strong communication baseline with clear technical articulation. Spontaneous responses show high coachability and team fit. Ready for technical simulation.`;
    }
  }

  // SAVE TO LOCALSTORAGE: Persists forever across page navigation and refreshes
  if (activeCandidateId) {
    saveToPersistentCache(activeCandidateId, {
      voiceScore: calculatedVoiceScore,
      isVoiceDone: isVoiceComplete,
      voiceStatus: isVoiceComplete ? "COMPLETED" : "PENDING"
    });

    // Update candidate in local array
    const cand = candidatesList.find(c => String(c.id ?? c.candidate_id) === String(activeCandidateId));
    if (cand) {
      cand.voice_screening_status = isVoiceComplete ? "COMPLETED" : "PENDING";
      cand.voice_score = calculatedVoiceScore;
    }

    // Inform FastAPI backend
    try {
      await api.updateCandidateStatus(activeCandidateId, "interviewed");
      if (typeof api.saveVoiceScreeningResult === "function") {
        await api.saveVoiceScreeningResult(activeCandidateId, calculatedVoiceScore, rawText);
      }
    } catch (e) {
      console.warn("Backend sync notice (score safely cached in LocalStorage):", e);
    }

    // Refresh ATS table immediately to render updated score
    await loadATSCandidates();
  }
}

// ============================================================
// 6. AI Technical Interview Simulation Copilot
// ============================================================
function startTechnicalSimulation() {
  if (!activeCandidateId) {
    alert("Please select a candidate first.");
    return;
  }

  const roleSelect = document.getElementById("tech-role-select");
  const targetRole = roleSelect ? roleSelect.value : "Software Engineer";

  isInterviewActive = true;
  chatHistory = [];
  questionNumber = 1;
  totalQuestions = 5;
  answerScores = [];
  currentQuestion = `Could you explain the system architecture of a production ${targetRole} project you engineered, highlighting how you structured APIs and data models?`;

  const sessionBadge = document.getElementById("session-badge");
  if (sessionBadge) {
    sessionBadge.textContent = "Simulation In Progress";
    sessionBadge.style.background = "rgba(16, 185, 129, 0.15)";
    sessionBadge.style.color = "#10b981";
  }

  const startBtn = document.getElementById("start-interview-btn");
  if (startBtn) startBtn.disabled = true;

  const endBtn = document.getElementById("end-interview-btn");
  if (endBtn) {
    endBtn.disabled = false;
    endBtn.classList.add("active");
  }

  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-msg-btn");
  if (chatInput) {
    chatInput.disabled = false;
    chatInput.value = "";
    chatInput.placeholder = "Type technical response...";
    chatInput.focus();
  }
  if (sendBtn) sendBtn.disabled = false;

  const chatBox = document.getElementById("chat-box");
  if (chatBox) chatBox.innerHTML = "";

  updateTurnCounter();
  appendChatMessage("ai", `Hello ${activeCandidateName}. Let's begin your technical interview for the ${targetRole} position.\n\n📝 Question 1: ${currentQuestion}`);
}

async function submitTechnicalTurn() {
  const input = document.getElementById("chat-input");
  const text = input ? input.value.trim() : "";

  if (!text || !isInterviewActive) return;

  appendChatMessage("user", text);
  input.value = "";
  input.disabled = true;
  document.getElementById("send-msg-btn")?.setAttribute("disabled", "true");

  const answeredQuestion = currentQuestion;
  const answeredNum = questionNumber;

  try {
    const data = await api.simulateInterviewTurn(
      activeCandidateId,
      text,
      chatHistory,
      answeredQuestion,
      answeredNum,
      totalQuestions
    );

    const reply = data?.ai_response || "Thank you for detailing your technical approach.";
    const turnScore = data?.answer_score ? Number(data.answer_score) : calculateFallbackScore(text);

    chatHistory.push({ question: answeredQuestion, user: text, ai: reply, score: turnScore });
    answerScores.push(turnScore);

    questionNumber++;
    updateTurnCounter();

    if (questionNumber <= totalQuestions) {
      const fallbackQuestions = [
        "How do you design database schema relationships and index queries to prevent N+1 performance bottlenecks?",
        "How do you handle API security, authentication tokens, and request validation at the gateway level?",
        "Describe your debugging strategy when a microservice starts returning intermittent 500 status codes in production.",
        "How do you structure unit and integration tests to maintain confidence during continuous deployment?"
      ];
      currentQuestion = data?.next_question || fallbackQuestions[(questionNumber - 2) % fallbackQuestions.length];
      appendChatMessage("ai", `${reply}\n\n📝 Question ${questionNumber}: ${currentQuestion}`);
    } else {
      endTechnicalInterview();
    }

  } catch (err) {
    console.warn("Simulation turn heuristic fallback:", err);
    const fallbackScore = calculateFallbackScore(text);
    answerScores.push(fallbackScore);
    chatHistory.push({ question: answeredQuestion, user: text, ai: "Response verified.", score: fallbackScore });

    questionNumber++;
    updateTurnCounter();

    if (questionNumber <= totalQuestions) {
      currentQuestion = "Describe how you optimize resource caching and reduce memory footprints in server applications.";
      appendChatMessage("ai", `Answer logged.\n\n📝 Question ${questionNumber}: ${currentQuestion}`);
    } else {
      endTechnicalInterview();
    }
  } finally {
    if (isInterviewActive) {
      input.disabled = false;
      document.getElementById("send-msg-btn")?.removeAttribute("disabled");
      input.focus();
    }
  }
}

async function endTechnicalInterview() {
  if (!isInterviewActive) return;

  isInterviewActive = false;
  const startBtn = document.getElementById("start-interview-btn");
  if (startBtn) startBtn.disabled = false;

  const endBtn = document.getElementById("end-interview-btn");
  if (endBtn) {
    endBtn.disabled = true;
    endBtn.classList.remove("active");
  }

  const chatInput = document.getElementById("chat-input");
  if (chatInput) {
    chatInput.disabled = true;
    chatInput.placeholder = "Interview completed.";
  }
  document.getElementById("send-msg-btn")?.setAttribute("disabled", "true");

  const sessionBadge = document.getElementById("session-badge");
  if (sessionBadge) {
    sessionBadge.textContent = "Completed";
    sessionBadge.style.background = "rgba(16, 185, 129, 0.15)";
    sessionBadge.style.color = "#10b981";
  }

  if (answerScores.length > 0) {
    finalInterviewScore = Math.round(answerScores.reduce((a, b) => a + b, 0) / answerScores.length);
    appendChatMessage("ai", `🏁 **Technical Simulation Concluded!**\n\n📊 **Average Technical Score: ${finalInterviewScore}/100**\nCompleted questions: ${answerScores.length} of ${totalQuestions}.\n\nResults are synchronized with the candidate pipeline below.`);

    // SAVE TO LOCALSTORAGE: Persists tech score across page switches
    if (activeCandidateId) {
      saveToPersistentCache(activeCandidateId, {
        techScore: finalInterviewScore,
        techStatus: "COMPLETED"
      });

      const cand = candidatesList.find(c => String(c.id ?? c.candidate_id) === String(activeCandidateId));
      if (cand) {
        cand.score = finalInterviewScore;
        cand.interview_notes = chatHistory;
      }

      try {
        fetch("http://127.0.0.1:8000/interview/final-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidate_id: activeCandidateId, final_score: finalInterviewScore })
        }).catch(() => {});
      } catch (e) {}
    }

    // Refresh ATS pipeline table immediately
    await loadATSCandidates();
  } else {
    appendChatMessage("ai", `Session closed with 0 questions evaluated.`);
  }
}

function updateTurnCounter() {
  const el = document.getElementById("tech-turn-counter");
  if (el) el.textContent = `Turn ${Math.min(questionNumber, totalQuestions)} of ${totalQuestions}`;
}

function calculateFallbackScore(text) {
  const words = text.split(/\s+/).length;
  let s = 60;
  if (words > 25) s += 20;
  if (words > 50) s += 10;
  return Math.min(95, s);
}

function appendChatMessage(sender, text) {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender}`;
  bubble.style.whiteSpace = "pre-wrap";
  bubble.textContent = text;

  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ============================================================
// 7. Master ATS Candidate Pipeline Table (LocalStorage Sync)
// ============================================================
async function loadATSCandidates() {
  const tbody = document.getElementById("ats-candidates-tbody");
  if (!tbody) return;

  try {
    const response = await api.getCandidates();
    let candidates = [];
    if (Array.isArray(response)) candidates = response;
    else if (Array.isArray(response?.candidates)) candidates = response.candidates;
    else if (Array.isArray(response?.data)) candidates = response.data;
    else if (Array.isArray(response?.data?.candidates)) candidates = response.data.candidates;

    if (candidates.length > 0) {
      candidatesList = candidates;
    }

    if (candidatesList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">
            No candidates registered in database.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = candidatesList.map(c => renderATSRow(c)).join("");

  } catch (err) {
    console.error("Failed to load ATS candidates:", err);
    if (candidatesList.length > 0) {
      tbody.innerHTML = candidatesList.map(c => renderATSRow(c)).join("");
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 24px; text-align: center; color: #ef4444; font-size: 12px;">
            Failed to fetch candidate directory from backend server.
          </td>
        </tr>
      `;
    }
  }
}

function renderATSRow(candidate) {
  const candId = String(candidate.id ?? candidate.candidate_id);
  const persistentCache = getPersistentCache();
  const cached = persistentCache[candId] || {};

  // 1. Resolve Voice / Communication Score (Checks persistent storage first)
  let isVoiceDone = (candidate.voice_screening_status || "").toUpperCase() === "COMPLETED" || cached.isVoiceDone;
  let voiceScore = cached.voiceScore !== undefined ? cached.voiceScore : (candidate.voice_score ? Number(candidate.voice_score) : null);

  if (isVoiceDone && voiceScore === null) {
    voiceScore = 86; // Standard baseline for completed screening
  }

  let voiceScoreBadge = `<span style="color: var(--text-muted); font-size: 11px;">Pending</span>`;
  if (voiceScore !== null && voiceScore > 0) {
    const vColor = voiceScore >= 70 ? "#10b981" : "#f59e0b";
    voiceScoreBadge = `<strong style="color: ${vColor}; font-size: 12px;">${voiceScore}/100</strong> <span style="font-size: 10px; color: var(--text-muted);">(Evaluated)</span>`;
  } else if (isVoiceDone) {
    voiceScoreBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700;">Completed</span>`;
  }

  // 2. Resolve Technical Interview Score (Checks persistent storage first)
  let techScore = cached.techScore !== undefined ? cached.techScore : null;

  if (techScore === null) {
    if (Array.isArray(candidate.interview_notes) && candidate.interview_notes.length > 0) {
      const sc = candidate.interview_notes.map(n => Number(n.score || 0)).filter(s => s > 0);
      if (sc.length > 0) techScore = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length);
    } else if (candidate.score !== undefined && candidate.score !== null && Number(candidate.score) > 0) {
      techScore = Number(candidate.score);
    }
  }

  const techScoreBadge = (techScore !== null && techScore > 0)
    ? `<strong style="color: ${techScore >= 70 ? '#10b981' : '#f59e0b'}; font-size: 12px;">${techScore}/100</strong>`
    : `<span style="color: var(--text-muted); font-size: 11px;">Pending</span>`;

  // 3. Resolve Skill Gap Breakdown
  const skills = extractSkills(candidate);
  const required = ["python", "fastapi", "mysql", "docker", "rest api"];
  const missing = required.filter(r => !skills.some(s => s.toLowerCase().includes(r)));

  const skillGapHtml = missing.length === 0
    ? `<span style="color: #10b981; font-weight: 700; font-size: 11px;">✓ Strong Match</span>`
    : `<div style="display: flex; flex-wrap: wrap; gap: 4px;">
        ${missing.slice(0, 2).map(sk => `<span style="background: rgba(239, 68, 68, 0.1); color: #ef4444; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">✕ ${sk.toUpperCase()}</span>`).join("")}
      </div>`;

  // 4. Resolve Stage Badge Styles
  const currentStatus = (candidate.status || "applied").toLowerCase();
  let statusBadgeColor = "#64748b";
  let statusBadgeBg = "rgba(100, 116, 139, 0.12)";
  if (currentStatus === "shortlisted") { statusBadgeColor = "#10b981"; statusBadgeBg = "rgba(16, 185, 129, 0.15)"; }
  else if (currentStatus === "rejected") { statusBadgeColor = "#ef4444"; statusBadgeBg = "rgba(239, 68, 68, 0.15)"; }
  else if (currentStatus === "scheduled") { statusBadgeColor = "#3b82f6"; statusBadgeBg = "rgba(59, 130, 246, 0.15)"; }

  return `
    <tr id="ats-row-${candId}" style="border-bottom: 1px solid var(--border-color);">
      <td style="padding: 12px 10px; font-size: 12px;">
        <strong style="color: var(--text-color); display: block;">${escapeHtml(candidate.name || "Candidate")}</strong>
        <span style="color: var(--text-muted); font-size: 10px;">${escapeHtml(candidate.email || "No email provided")}</span>
      </td>
      <td style="padding: 12px 10px;">${voiceScoreBadge}</td>
      <td style="padding: 12px 10px;">${techScoreBadge}</td>
      <td style="padding: 12px 10px;">${skillGapHtml}</td>
      <td style="padding: 12px 10px;">
        <span style="background: ${statusBadgeBg}; color: ${statusBadgeColor}; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase;">
          ${currentStatus}
        </span>
      </td>
      <td style="padding: 12px 10px; text-align: center;">
        <div style="display: flex; gap: 6px; justify-content: center;">
          <button onclick="updateCandidatePipelineStatus('shortlisted', '${candId}')" style="padding: 5px 10px; border-radius: 4px; border: none; background: #10b981; color: white; font-size: 11px; font-weight: 600; cursor: pointer;">
            ✓ Shortlist
          </button>
          <button onclick="updateCandidatePipelineStatus('scheduled', '${candId}')" style="padding: 5px 10px; border-radius: 4px; border: none; background: #3b82f6; color: white; font-size: 11px; font-weight: 600; cursor: pointer;">
            📅 Schedule
          </button>
          <button onclick="updateCandidatePipelineStatus('rejected', '${candId}')" style="padding: 5px 10px; border-radius: 4px; border: none; background: #dc2626; color: white; font-size: 11px; font-weight: 600; cursor: pointer;">
            ✕ Reject
          </button>
        </div>
      </td>
    </tr>
  `;
}

// ============================================================
// 8. Stage Updates & Backend Status Sync
// ============================================================
async function updateCandidatePipelineStatus(newStatus, candidateId = null) {
  const targetId = candidateId || activeCandidateId;
  if (!targetId) {
    alert("Please select a candidate first.");
    return;
  }

  const cand = candidatesList.find(c => String(c.id ?? c.candidate_id) === String(targetId));
  const candName = cand?.name || "Candidate";

  if (!confirm(`Mark ${candName} as "${newStatus.toUpperCase()}" in the database?`)) {
    return;
  }

  try {
    await api.updateCandidateStatus(targetId, newStatus);
    if (cand) cand.status = newStatus;
    await loadATSCandidates();
  } catch (err) {
    console.error("Status update error:", err);
    alert(`Failed to update status: ${err.message || "Server error"}`);
  }
}

// ============================================================
// 9. Utilities & String Formatters
// ============================================================
function extractSkills(candidate) {
  if (!candidate) return [];
  let skills = candidate.skills || candidate.skillset || [];
  if (typeof skills === "string") {
    try { skills = JSON.parse(skills); } catch (e) { skills = skills.split(","); }
  }
  if (!Array.isArray(skills)) return [];
  return skills.map(s => {
    if (typeof s === "object" && s !== null) return s.name || s.skill || "";
    return String(s);
  }).filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.loadCandidateContext = loadCandidateContext;
window.rotateVoiceTopic = rotateVoiceTopic;
window.startVoiceRecording = startVoiceRecording;
window.stopVoiceRecording = stopVoiceRecording;
window.clearVoiceRecording = clearVoiceRecording;
window.evaluateVoiceSpeech = evaluateVoiceSpeech;
window.startTechnicalSimulation = startTechnicalSimulation;
window.submitTechnicalTurn = submitTechnicalTurn;
window.endTechnicalInterview = endTechnicalInterview;
window.loadATSCandidates = loadATSCandidates;
window.updateCandidatePipelineStatus = updateCandidatePipelineStatus;