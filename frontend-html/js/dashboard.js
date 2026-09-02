// ============================================================
// dashboard.js
// Dashboard + Voice Screening
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    loadDashboardData();
    initializeVoiceScreening();
});


// ============================================================
// Dashboard Data
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

        console.log("FINAL CANDIDATE LIST:", candidateList);

        updateDashboardStats(candidateList);

        renderRecentCandidates(candidateList);

        populateVoiceCandidateDropdown(candidateList);

        populateVoiceJobPositionDropdown();

    } catch (error) {

        console.error(
            "Failed to load dashboard data:",
            error
        );

        updateElement("stat-total", "0");
        updateElement("stat-uploads", "0");
        updateElement("stat-processed", "0");
        updateElement("stat-shortlisted", "0");
        updateElement("stat-rejected", "0");

        const tableBody =
            document.getElementById("recent-tbody");

        if (tableBody) {

            tableBody.innerHTML = "";
        }

        const candidateSelect =
            document.getElementById("voice-candidate");

        if (candidateSelect) {

            candidateSelect.innerHTML = `
                <option value="">
                    No candidates available
                </option>
            `;
        }

        const jobPositionSelect =
            document.getElementById("voice-job-position");

        if (jobPositionSelect) {

            jobPositionSelect.innerHTML = `
                <option value="">
                    Unable to load job positions
                </option>
            `;
        }
    }
}


// ============================================================
// Dashboard Statistics
// ============================================================

function updateDashboardStats(candidates) {

    if (!Array.isArray(candidates)) {
        candidates = [];
    }

    const totalCount =
        candidates.length;

    const totalUploads =
        candidates.length;

    const processedCount =
        candidates.filter(candidate => {

            const status =
                normalizeStatus(candidate.status);

            return status === "processed";

        }).length;

    const shortlistedCount =
        candidates.filter(candidate => {

            return (
                normalizeStatus(candidate.status) ===
                "shortlisted"
            );

        }).length;

    const rejectedCount =
        candidates.filter(candidate => {

            return (
                normalizeStatus(candidate.status) ===
                "rejected"
            );

        }).length;


    updateElement(
        "stat-total",
        totalCount
    );

    updateElement(
        "stat-uploads",
        totalUploads
    );

    updateElement(
        "stat-processed",
        processedCount
    );

    updateElement(
        "stat-shortlisted",
        shortlistedCount
    );

    updateElement(
        "stat-rejected",
        rejectedCount
    );


    console.log(
        "FINAL DASHBOARD COUNTS:",
        {
            totalCandidates: totalCount,
            totalUploads: totalUploads,
            processed: processedCount,
            shortlisted: shortlistedCount,
            rejected: rejectedCount
        }
    );
}


// ============================================================
// Recent Candidates
// ============================================================

function renderRecentCandidates(candidates) {

    const tableBody =
        document.getElementById("recent-tbody");

    if (!tableBody) {

        console.warn(
            "recent-tbody element not found."
        );

        return;
    }


    tableBody.innerHTML = "";


    if (
        !Array.isArray(candidates) ||
        candidates.length === 0
    ) {

        return;
    }


    const recentCandidates =
        candidates.slice(-5).reverse();


    recentCandidates.forEach(candidate => {

        const row =
            document.createElement("tr");


        const name =
            candidate.name ||
            candidate.full_name ||
            candidate.fullName ||
            candidate.candidate_name ||
            "Unknown Candidate";


        const experience =
            candidate.experience_years ??
            candidate.experience ??
            candidate.years_of_experience ??
            0;


        const skills =
            extractSkillsArray(candidate);


        const skillText =
            skills.length > 0
                ? skills.slice(0, 4).join(", ")
                : "No skills available";


        const status =
            normalizeStatus(candidate.status) ||
            "processed";


        row.innerHTML = `

            <td>
                ${escapeHtml(name)}
            </td>

            <td>
                ${escapeHtml(String(experience))} yrs
            </td>

            <td>
                ${escapeHtml(skillText)}
            </td>

            <td>

                <span style="${getStatusBadgeStyle(status)}">

                    ${escapeHtml(
                        status.toUpperCase()
                    )}

                </span>

            </td>
        `;


        tableBody.appendChild(row);
    });
}


// ============================================================
// Candidate Dropdown
// ============================================================

function populateVoiceCandidateDropdown(candidates) {

    const select =
        document.getElementById(
            "voice-candidate"
        );


    if (!select) {

        console.warn(
            "voice-candidate dropdown not found."
        );

        return;
    }


    select.innerHTML = `
        <option value="">
            Select Candidate
        </option>
    `;


    if (
        !Array.isArray(candidates) ||
        candidates.length === 0
    ) {

        select.innerHTML = `
            <option value="">
                No candidates available
            </option>
        `;

        return;
    }


    candidates.forEach(candidate => {

        const candidateId =
            candidate.id ??
            candidate.candidate_id ??
            candidate.candidateId;


        const candidateName =
            candidate.name ||
            candidate.full_name ||
            candidate.fullName ||
            candidate.candidate_name ||
            "Unknown Candidate";


        if (
            candidateId === undefined ||
            candidateId === null ||
            candidateId === ""
        ) {

            return;
        }


        const option =
            document.createElement("option");


        option.value =
            candidateId;


        option.textContent =
            candidateName;


        select.appendChild(option);
    });


    console.log(
        "VOICE CANDIDATE DROPDOWN UPDATED."
    );
}


// ============================================================
// Job Position Dropdown
// ============================================================

async function populateVoiceJobPositionDropdown() {

    const select =
        document.getElementById(
            "voice-job-position"
        );


    if (!select) {

        console.warn(
            "voice-job-position dropdown not found."
        );

        return;
    }


    select.innerHTML = `
        <option value="">
            Select Job Position
        </option>
    `;


    try {

        const jobs =
            await api.getJobs();

        let jobList = [];


        if (Array.isArray(jobs)) {

            jobList = jobs;

        } else if (Array.isArray(jobs?.jobs)) {

            jobList = jobs.jobs;

        } else if (Array.isArray(jobs?.data)) {

            jobList = jobs.data;

        } else if (Array.isArray(jobs?.data?.jobs)) {

            jobList = jobs.data.jobs;
        }


        if (!jobList.length) {

            select.innerHTML = `
                <option value="">
                    No job positions available
                </option>
            `;

            return;
        }


        jobList.forEach(job => {

            const jobId =
                job.id ??
                job.job_id ??
                job.jobId;


            const jobTitle =
                job.title ||
                job.job_title ||
                job.position ||
                job.position_title ||
                job.name ||
                "";


            if (!jobTitle) {

                return;
            }


            const option =
                document.createElement("option");


            option.value =
                jobId ?? jobTitle;


            option.textContent =
                jobTitle;


            option.dataset.jobPosition =
                jobTitle;


            select.appendChild(option);
        });


        console.log(
            "VOICE JOB POSITION DROPDOWN UPDATED:",
            jobList
        );

    } catch (error) {

        console.error(
            "Failed to load job positions:",
            error
        );

        select.innerHTML = `
            <option value="">
                Unable to load job positions
            </option>
        `;
    }
}


// ============================================================
// Voice Screening State
// ============================================================

let voiceRecognition = null;

let isVoiceScreening = false;

let isListening = false;

let interviewStopped = false;

let voiceCandidateId = null;

let voiceCandidateName = "";

let voiceQuestions = [];

let voiceQuestionIndex = 0;

let voiceCurrentQuestion = "";

let voiceQuestionNumber = 1;

let voiceTotalQuestions = 5;

let voiceHistory = [];

let voiceScores = [];

let voiceFinalTranscript = "";

let voiceInterimTranscript = "";


// ============================================================
// RECORDING DURATION TIMER
// ============================================================

let speechTimerInterval = null;

let speechStartTime = null;


// ============================================================
// Store speaking duration for every question
// ============================================================

let voiceQuestionDurations = [];


// Start Recording Timer
function startSpeechTimer() {

    const timerElement =
        document.getElementById("speech-timer");

    if (!timerElement) {
        return;
    }

    clearInterval(speechTimerInterval);

    speechStartTime = Date.now();

    timerElement.style.display = "block";

    timerElement.textContent =
        "Recording Duration: 00:00";

    speechTimerInterval = setInterval(() => {

        if (!speechStartTime) {
            return;
        }

        const elapsedSeconds =
            Math.floor(
                (Date.now() - speechStartTime) / 1000
            );

        const minutes =
            Math.floor(elapsedSeconds / 60);

        const seconds =
            elapsedSeconds % 60;

        timerElement.textContent =
            `Recording Duration: ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    }, 1000);
}


// ============================================================
// Get current recording duration
// ============================================================

function getCurrentSpeechDuration() {

    if (!speechStartTime) {
        return 0;
    }

    return Math.max(
        0,
        Math.floor(
            (Date.now() - speechStartTime) / 1000
        )
    );
}


// ============================================================
// Save duration for current question
// ============================================================

function saveCurrentQuestionDuration() {

    if (!speechStartTime) {
        return;
    }

    const duration =
        getCurrentSpeechDuration();

    const questionIndex =
        voiceQuestionNumber - 1;

    voiceQuestionDurations[questionIndex] =
        duration;

    console.log(
        "QUESTION SPEAKING DURATION:",
        {
            question:
                voiceQuestionNumber,

            durationSeconds:
                duration,

            durationFormatted:
                formatSpeechDuration(duration)
        }
    );
}


// ============================================================
// Format seconds as MM:SS
// ============================================================

function formatSpeechDuration(totalSeconds) {

    totalSeconds =
        Number(totalSeconds) || 0;

    const minutes =
        Math.floor(totalSeconds / 60);

    const seconds =
        totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}


// ============================================================
// Stop Recording Timer
// ============================================================

function stopSpeechTimer() {

    saveCurrentQuestionDuration();

    clearInterval(speechTimerInterval);

    speechTimerInterval = null;
}


// Reset Recording Timer
function resetSpeechTimer() {

    clearInterval(speechTimerInterval);

    speechTimerInterval = null;

    speechStartTime = null;

    const timerElement =
        document.getElementById("speech-timer");

    if (timerElement) {

        timerElement.textContent =
            "Recording Duration: 00:00";

        timerElement.style.display =
            "none";
    }
}


// ============================================================
// Reset all question durations
// ============================================================

function resetVoiceQuestionDurations() {

    voiceQuestionDurations = [];
}


// ============================================================
// Display question-wise speaking duration
// ============================================================

function generateQuestionDurationHtml() {

    let totalSeconds = 0;

    let html = `

        <div style="
            margin-top:15px;
            padding:12px;
            border:1px solid #ddd;
            border-radius:6px;
        ">

            <strong>
                Speaking Duration for Each Question:
            </strong>

            <div style="
                margin-top:10px;
            ">
    `;


    for (
        let i = 0;
        i < voiceTotalQuestions;
        i++
    ) {

        const duration =
            Number(
                voiceQuestionDurations[i] || 0
            );

        totalSeconds +=
            duration;


        html += `

            <div style="
                margin-bottom:8px;
                padding:8px;
                border:1px solid #ddd;
                border-radius:5px;
            ">

                <strong>
                    Question ${i + 1}:
                </strong>

                <span>
                    ${formatSpeechDuration(duration)}
                </span>

            </div>
        `;
    }


    html += `

            </div>

            <div style="
                margin-top:12px;
                padding:10px;
                border:1px solid #ccc;
                border-radius:5px;
                font-weight:700;
            ">

                Total Speaking Time:
                ${formatSpeechDuration(totalSeconds)}

            </div>

        </div>
    `;


    return html;
}


// ============================================================
// Initialize Voice Screening
// ============================================================

function initializeVoiceScreening() {

    const startScreeningButton =
        document.getElementById(
            "start-voice-screening"
        );


    const startSpeakingButton =
        document.getElementById(
            "start-speaking"
        );


    const stopSpeakingButton =
        document.getElementById(
            "stop-speaking"
        );


    const submitAnswerButton =
        document.getElementById(
            "submit-voice-answer"
        );


    const shortlistButton =
        document.getElementById(
            "shortlist-candidate"
        );


    const rejectButton =
        document.getElementById(
            "reject-candidate"
        );


    const nextQuestionButton =
        document.getElementById(
            "next-voice-question"
        );


    const stopInterviewButton =
        document.getElementById(
            "stop-voice-interview"
        );


    if (startScreeningButton) {

        startScreeningButton.type = "button";

        startScreeningButton.addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                console.log(
                    "START VOICE SCREENING BUTTON CLICKED"
                );

                startVoiceScreening(event);
            }
        );
    }


    if (startSpeakingButton) {

        startSpeakingButton.addEventListener(
            "click",
            startVoiceRecognition
        );
    }


    if (stopSpeakingButton) {

        stopSpeakingButton.addEventListener(
            "click",
            stopVoiceRecognition
        );
    }


    if (submitAnswerButton) {

        submitAnswerButton.addEventListener(
            "click",
            submitVoiceAnswer
        );
    }


    if (nextQuestionButton) {

        nextQuestionButton.addEventListener(
            "click",
            skipToNextQuestion
        );
    }


    if (stopInterviewButton) {

        stopInterviewButton.addEventListener(
            "click",
            stopVoiceInterview
        );

        stopInterviewButton.style.display =
            "none";

        stopInterviewButton.disabled =
            false;
    }


    if (shortlistButton) {

        shortlistButton.addEventListener(
            "click",
            () =>
                updateVoiceCandidateStatus(
                    "shortlisted"
                )
        );
    }


    if (rejectButton) {

        rejectButton.addEventListener(
            "click",
            () =>
                updateVoiceCandidateStatus(
                    "rejected"
                )
        );
    }


    initializeSpeechRecognition();
}


// ============================================================
// Start Voice Screening
// ============================================================

async function startVoiceScreening(event) {

    if (event) {

        event.preventDefault();
    }


    const candidateSelect =
        document.getElementById(
            "voice-candidate"
        );


    if (!candidateSelect) {

        alert(
            "Candidate selection is not available."
        );

        return;
    }


    const candidateId =
        candidateSelect.value;


    console.log(
        "SELECTED VOICE CANDIDATE ID:",
        candidateId
    );


    if (!candidateId) {

        alert(
            "Please select a candidate first."
        );

        return;
    }


    // ========================================================
    // Selected Job Position
    // ========================================================

    const jobPositionSelect =
        document.getElementById(
            "voice-job-position"
        );


    if (!jobPositionSelect) {

        alert(
            "Job position selection is not available."
        );

        return;
    }


    const selectedJobOption =
        jobPositionSelect.options[
            jobPositionSelect.selectedIndex
        ];


    const jobPosition =
        selectedJobOption?.dataset?.jobPosition ||
        selectedJobOption?.textContent?.trim() ||
        "";


    if (!jobPosition) {

        alert(
            "Please select a job position first."
        );

        return;
    }


    console.log(
        "SELECTED VOICE JOB POSITION:",
        jobPosition
    );


    try {

        setVoiceStatus(
            "Generating interview questions..."
        );


        const startButton =
            document.getElementById(
                "start-voice-screening"
            );


        if (startButton) {

            startButton.disabled =
                true;

            startButton.textContent =
                "Generating Questions...";
        }


        voiceCandidateId =
            candidateId;

        voiceQuestions = [];

        voiceQuestionIndex = 0;

        voiceQuestionNumber = 1;

        voiceTotalQuestions = 5;

        voiceHistory = [];

        voiceScores = [];

        voiceFinalTranscript = "";

        voiceInterimTranscript = "";

        voiceCurrentQuestion = "";

        isVoiceScreening = true;

        interviewStopped = false;

        resetVoiceQuestionDurations();

        resetSpeechTimer();


        const candidate =
            await api.getCandidateById(
                candidateId
            );


        console.log(
            "SELECTED CANDIDATE:",
            candidate
        );


        voiceCandidateName =
            candidate?.name ||
            candidate?.full_name ||
            candidate?.fullName ||
            "Candidate";


        console.log(
            "GENERATING QUESTIONS FOR CANDIDATE:",
            candidateId,
            "JOB POSITION:",
            jobPosition
        );


        const response =
            await api.generateInterviewQuestions(
                "",
                "Technical Skills",
                candidateId,
                jobPosition
            );


        console.log(
            "Voice interview questions response:",
            response
        );


        voiceQuestions =
            extractInterviewQuestions(
                response
            );


        console.log(
            "EXTRACTED VOICE QUESTIONS:",
            voiceQuestions
        );


        if (
            !voiceQuestions.length
        ) {

            throw new Error(
                "No interview questions were generated."
            );
        }


        voiceQuestions =
            voiceQuestions.slice(0, 5);


        voiceTotalQuestions =
            voiceQuestions.length;


        const interviewArea =
            document.getElementById(
                "voice-interview-area"
            );


        if (interviewArea) {

            interviewArea.style.display =
                "block";
        }


        const stopInterviewButton =
            document.getElementById(
                "stop-voice-interview"
            );


        if (stopInterviewButton) {

            stopInterviewButton.style.display =
                "inline-block";

            stopInterviewButton.disabled =
                false;

            stopInterviewButton.textContent =
                "⏹ Stop Interview";
        }


        const scoreArea =
            document.getElementById(
                "voice-score-area"
            );


        if (scoreArea) {

            scoreArea.style.display =
                "none";
        }


        const finalDecision =
            document.getElementById(
                "voice-final-decision"
            );


        if (finalDecision) {

            finalDecision.style.display =
                "none";
        }


        const feedback =
            document.getElementById(
                "voice-feedback"
            );


        if (feedback) {

            feedback.innerHTML =
                "";
        }


        const aiResponse =
            document.getElementById(
                "voice-ai-response"
            );


        if (aiResponse) {

            aiResponse.style.display =
                "none";
        }


        showVoiceQuestion(0);


        setVoiceStatus(
            "Interview started. Click Start Speaking to answer."
        );


    } catch (error) {

        console.error(
            "Voice screening failed:",
            error
        );


        isVoiceScreening =
            false;

        interviewStopped =
            true;

        resetSpeechTimer();


        const stopInterviewButton =
            document.getElementById(
                "stop-voice-interview"
            );


        if (stopInterviewButton) {

            stopInterviewButton.style.display =
                "none";
        }


        setVoiceStatus(
            error.message ||
            "Unable to start voice screening."
        );


        alert(
            error.message ||
            "Unable to start voice screening."
        );


    } finally {

        const startButton =
            document.getElementById(
                "start-voice-screening"
            );


        if (startButton) {

            startButton.disabled =
                false;

            startButton.textContent =
                "Start Voice Screening";
        }
    }
}


// ============================================================
// Extract Interview Questions
// ============================================================

function extractInterviewQuestions(response) {

    let questions = [];


    if (!response) {

        return [];
    }


    if (Array.isArray(response)) {

        questions =
            response;

    } else if (
        Array.isArray(
            response.questions
        )
    ) {

        questions =
            response.questions;

    } else if (
        response.data &&
        Array.isArray(
            response.data.questions
        )
    ) {

        questions =
            response.data.questions;

    } else if (
        response.result &&
        Array.isArray(
            response.result.questions
        )
    ) {

        questions =
            response.result.questions;

    } else if (
        response.question
    ) {

        questions =
            [response];
    }


    return questions
        .map(item => {

            if (
                typeof item ===
                "string"
            ) {

                return item.trim();
            }


            if (
                item &&
                typeof item ===
                "object"
            ) {

                return (
                    item.question ||
                    item.text ||
                    item.question_text ||
                    ""
                ).trim();
            }


            return "";
        })
        .filter(Boolean);
}


// ============================================================
// Show Voice Question
// ============================================================

function showVoiceQuestion(index) {

    if (
        interviewStopped ||
        !isVoiceScreening
    ) {

        return;
    }


    if (
        index < 0 ||
        index >= voiceQuestions.length
    ) {

        return;
    }


    voiceQuestionIndex =
        index;

    voiceQuestionNumber =
        index + 1;

    voiceCurrentQuestion =
        voiceQuestions[index];


    const questionElement =
        document.getElementById(
            "voice-question"
        );


    if (questionElement) {

        questionElement.textContent =
            voiceCurrentQuestion;
    }


    const questionNumberElement =
        document.getElementById(
            "voice-question-number"
        );


    if (questionNumberElement) {

        questionNumberElement.textContent =
            voiceQuestionNumber;
    }


    const totalQuestionsElement =
        document.getElementById(
            "voice-total-questions"
        );


    if (totalQuestionsElement) {

        totalQuestionsElement.textContent =
            voiceTotalQuestions;
    }


    const answerElement =
        document.getElementById(
            "voice-answer"
        );


    if (answerElement) {

        answerElement.value =
            "";
    }


    voiceFinalTranscript =
        "";

    voiceInterimTranscript =
        "";


    resetSpeechTimer();


    const nextButton =
        document.getElementById(
            "next-voice-question"
        );


    if (nextButton) {

        nextButton.style.display =
            "inline-block";

        nextButton.disabled =
            false;

        nextButton.textContent =
            "Next Question";
    }


    const stopInterviewButton =
        document.getElementById(
            "stop-voice-interview"
        );


    if (stopInterviewButton) {

        stopInterviewButton.style.display =
            "inline-block";

        stopInterviewButton.disabled =
            false;

        stopInterviewButton.textContent =
            "⏹ Stop Interview";
    }


    const submitButton =
        document.getElementById(
            "submit-voice-answer"
        );


    if (submitButton) {

        submitButton.style.display =
            "inline-block";

        submitButton.disabled =
            false;

        submitButton.textContent =
            "Submit Answer";
    }


    const scoreArea =
        document.getElementById(
            "voice-score-area"
        );


    if (scoreArea) {

        scoreArea.style.display =
            "none";
    }


    const feedback =
        document.getElementById(
            "voice-feedback"
        );


    if (feedback) {

        feedback.innerHTML =
            "";
    }


    setVoiceStatus(
        `Question ${voiceQuestionNumber} of ${voiceTotalQuestions}`
    );
}


// ============================================================
// Speech Recognition
// ============================================================

function initializeSpeechRecognition() {

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;


    if (!SpeechRecognition) {

        console.warn(
            "Speech Recognition is not supported by this browser."
        );


        setVoiceStatus(
            "Speech recognition is not supported. Please use Google Chrome."
        );


        return;
    }


    voiceRecognition =
        new SpeechRecognition();


    voiceRecognition.continuous =
        true;

    voiceRecognition.interimResults =
        true;

    voiceRecognition.lang =
        "en-US";


    voiceRecognition.onstart =
        () => {

            isListening =
                true;

            startSpeechTimer();


            const startButton =
                document.getElementById(
                    "start-speaking"
                );


            const stopButton =
                document.getElementById(
                    "stop-speaking"
                );


            if (startButton) {

                startButton.disabled =
                    true;
            }


            if (stopButton) {

                stopButton.disabled =
                    false;
            }


            setVoiceStatus(
                "Listening... Speak your answer."
            );
        };


    voiceRecognition.onresult =
        event => {

            let finalText =
                "";

            let interimText =
                "";


            for (
                let i =
                    event.resultIndex;
                i <
                event.results.length;
                i++
            ) {

                const transcript =
                    event.results[i][0]
                        .transcript;


                if (
                    event.results[i]
                        .isFinal
                ) {

                    finalText +=
                        transcript + " ";

                } else {

                    interimText +=
                        transcript;
                }
            }


            if (finalText) {

                voiceFinalTranscript +=
                    finalText;
            }


            voiceInterimTranscript =
                interimText;


            const answerElement =
                document.getElementById(
                    "voice-answer"
                );


            if (answerElement) {

                answerElement.value =
                    (
                        voiceFinalTranscript +
                        voiceInterimTranscript
                    ).trim();
            }
        };


    voiceRecognition.onerror =
        event => {

            console.error(
                "Speech recognition error:",
                event.error
            );


            if (
                event.error ===
                "not-allowed"
            ) {

                setVoiceStatus(
                    "Microphone permission was denied."
                );

            } else if (
                event.error ===
                "no-speech"
            ) {

                setVoiceStatus(
                    "No speech detected. Please try again."
                );

            } else {

                setVoiceStatus(
                    "Speech recognition error: " +
                    event.error
                );
            }


            isListening =
                false;

            stopSpeechTimer();
        };


    voiceRecognition.onend =
        () => {

            isListening =
                false;

            stopSpeechTimer();


            const startButton =
                document.getElementById(
                    "start-speaking"
                );


            const stopButton =
                document.getElementById(
                    "stop-speaking"
                );


            if (startButton) {

                startButton.disabled =
                    interviewStopped;
            }


            if (stopButton) {

                stopButton.disabled =
                    true;
            }


            if (
                isVoiceScreening &&
                !interviewStopped
            ) {

                setVoiceStatus(
                    "Recording stopped. Review your answer and click Submit Answer."
                );
            }
        };
}


// ============================================================
// Start Speaking
// ============================================================

function startVoiceRecognition() {

    if (interviewStopped) {

        return;
    }


    if (!isVoiceScreening) {

        alert(
            "Please start the voice screening first."
        );

        return;
    }


    if (!voiceRecognition) {

        alert(
            "Speech recognition is not supported by your browser. Please use Google Chrome."
        );

        return;
    }


    if (!voiceCurrentQuestion) {

        alert(
            "Please start the voice screening first."
        );

        return;
    }


    if (isListening) {

        return;
    }


    voiceFinalTranscript =
        "";

    voiceInterimTranscript =
        "";


    const answerElement =
        document.getElementById(
            "voice-answer"
        );


    if (answerElement) {

        answerElement.value =
            "";
    }


    resetSpeechTimer();


    try {

        voiceRecognition.start();

    } catch (error) {

        console.warn(
            "Speech recognition could not start:",
            error
        );
    }
}


// ============================================================
// Stop Speaking
// ============================================================

function stopVoiceRecognition() {

    if (
        voiceRecognition &&
        isListening
    ) {

        voiceRecognition.stop();
    }


    isListening =
        false;

    stopSpeechTimer();


    const answerElement =
        document.getElementById(
            "voice-answer"
        );


    if (answerElement) {

        answerElement.value =
            (
                voiceFinalTranscript +
                voiceInterimTranscript
            ).trim();
    }


    if (
        isVoiceScreening &&
        !interviewStopped
    ) {

        setVoiceStatus(
            "Recording stopped. Click Submit Answer."
        );
    }
}


// ============================================================
// Submit Voice Answer
// ============================================================

async function submitVoiceAnswer() {

    if (
        interviewStopped ||
        !isVoiceScreening
    ) {

        return;
    }


    if (!voiceCandidateId) {

        alert(
            "Please select a candidate and start the voice screening."
        );

        return;
    }


    if (!voiceCurrentQuestion) {

        alert(
            "No interview question is currently active."
        );

        return;
    }


    const answerElement =
        document.getElementById(
            "voice-answer"
        );


    const answer =
        answerElement
            ? answerElement.value.trim()
            : "";


    if (!answer) {

        alert(
            "Please provide an answer before submitting."
        );

        return;
    }


    const submitButton =
        document.getElementById(
            "submit-voice-answer"
        );


    const nextButton =
        document.getElementById(
            "next-voice-question"
        );


    try {

        if (submitButton) {

            submitButton.disabled =
                true;

            submitButton.textContent =
                "Evaluating...";
        }


        if (nextButton) {

            nextButton.disabled =
                true;
        }


        setVoiceStatus(
            "AI is evaluating your answer..."
        );


        if (
            voiceRecognition &&
            isListening
        ) {

            voiceRecognition.stop();
        }


        stopSpeechTimer();


        const response =
            await api.simulateInterviewTurn(
                voiceCandidateId,
                answer,
                voiceHistory,
                voiceCurrentQuestion,
                voiceQuestionNumber,
                voiceTotalQuestions
            );


        console.log(
            "Voice interview evaluation:",
            response
        );


        const score =
            extractAnswerScore(
                response
            );


        const isValid =
            response?.is_valid !== false &&
            response?.needs_retry !== true &&
            response?.retry_current_question !== true;


        if (!isValid) {

            showVoiceFeedback(
                response,
                0
            );


            setVoiceStatus(
                "Answer not accepted. Please answer the current question again."
            );


            if (nextButton) {

                nextButton.disabled =
                    false;
            }


            if (submitButton) {

                submitButton.disabled =
                    false;

                submitButton.textContent =
                    "Submit Answer";
            }


            return;
        }


        voiceScores.push(
            score
        );


        voiceHistory.push({

            question:
                voiceCurrentQuestion,

            ai:
                response?.ai_response ||
                "",

            user:
                answer,

            score:
                score,

            speaking_duration_seconds:
                voiceQuestionDurations[
                    voiceQuestionNumber - 1
                ] || 0,

            speaking_duration:
                formatSpeechDuration(
                    voiceQuestionDurations[
                        voiceQuestionNumber - 1
                    ] || 0
                )
        });


        showVoiceFeedback(
            response,
            score
        );


        if (
            voiceQuestionNumber >=
            voiceTotalQuestions
        ) {

            await finishVoiceInterview();

            return;
        }


        // ====================================================
        // REQUIRED CHANGE:
        // Always use the job-position-specific questions
        // already generated at the beginning of the interview.
        // Do NOT replace them with response.next_question.
        // ====================================================

        const nextIndex =
            voiceQuestionIndex + 1;


        if (
            nextIndex <
            voiceTotalQuestions
        ) {

            showVoiceQuestion(
                nextIndex
            );

        }


    } catch (error) {

        console.error(
            "Voice answer submission failed:",
            error
        );


        setVoiceStatus(
            error.message ||
            "Unable to evaluate answer."
        );


        alert(
            error.message ||
            "Unable to evaluate answer."
        );


    } finally {

        if (
            submitButton &&
            isVoiceScreening &&
            !interviewStopped
        ) {

            submitButton.disabled =
                false;

            submitButton.textContent =
                "Submit Answer";
        }


        if (
            nextButton &&
            isVoiceScreening &&
            !interviewStopped
        ) {

            nextButton.disabled =
                false;
        }
    }
}


// ============================================================
// NEXT QUESTION / SKIP
// ============================================================

async function skipToNextQuestion() {

    if (
        interviewStopped ||
        !isVoiceScreening
    ) {

        return;
    }


    if (
        voiceQuestionNumber >=
        voiceTotalQuestions
    ) {

        return;
    }


    const nextButton =
        document.getElementById(
            "next-voice-question"
        );


    if (nextButton) {

        nextButton.disabled =
            true;
    }


    stopSpeechTimer();


    voiceScores.push(0);


    voiceHistory.push({

        question:
            voiceCurrentQuestion,

        ai:
            "Question skipped by candidate.",

        user:
            "I don't know",

        score:
            0,

        speaking_duration_seconds:
            voiceQuestionDurations[
                voiceQuestionNumber - 1
            ] || 0,

        speaking_duration:
            formatSpeechDuration(
                voiceQuestionDurations[
                    voiceQuestionNumber - 1
                ] || 0
            )
    });


    const nextIndex =
        voiceQuestionIndex + 1;


    if (
        nextIndex <
        voiceTotalQuestions
    ) {

        showVoiceQuestion(
            nextIndex
        );


        setVoiceStatus(
            `Question ${nextIndex + 1} of ${voiceTotalQuestions}`
        );

    } else {

        await finishVoiceInterview();
    }
}


// ============================================================
// STOP ENTIRE INTERVIEW
// ============================================================

async function stopVoiceInterview() {

    if (
        !isVoiceScreening ||
        interviewStopped
    ) {

        return;
    }


    const confirmed =
        confirm(
            "Are you sure you want to stop the entire interview? No more questions will be asked."
        );


    if (!confirmed) {

        return;
    }


    interviewStopped =
        true;

    isVoiceScreening =
        false;


    if (
        voiceRecognition &&
        isListening
    ) {

        voiceRecognition.stop();
    }


    isListening =
        false;

    stopSpeechTimer();


    const startSpeakingButton =
        document.getElementById(
            "start-speaking"
        );


    const stopSpeakingButton =
        document.getElementById(
            "stop-speaking"
        );


    const submitButton =
        document.getElementById(
            "submit-voice-answer"
        );


    const nextButton =
        document.getElementById(
            "next-voice-question"
        );


    const stopButton =
        document.getElementById(
            "stop-voice-interview"
        );


    if (startSpeakingButton) {

        startSpeakingButton.disabled =
            true;
    }


    if (stopSpeakingButton) {

        stopSpeakingButton.disabled =
            true;
    }


    if (submitButton) {

        submitButton.disabled =
            true;

        submitButton.style.display =
            "none";
    }


    if (nextButton) {

        nextButton.disabled =
            true;

        nextButton.style.display =
            "none";
    }


    if (stopButton) {

        stopButton.disabled =
            true;

        stopButton.style.display =
            "none";
    }


    const finalScore =
        calculateFinalScore();


    const finalFeedback =
        generateStopFeedback(
            finalScore
        );


    const finalDecision =
        getInterviewDecision(
            finalScore
        );


    const scoreElement =
        document.getElementById(
            "voice-score"
        );


    if (scoreElement) {

        scoreElement.textContent =
            `${finalScore}/100`;
    }


    const scoreArea =
        document.getElementById(
            "voice-score-area"
        );


    if (scoreArea) {

        scoreArea.style.display =
            "block";
    }


    const feedbackElement =
        document.getElementById(
            "voice-feedback"
        );


    const aiResponseElement =
        document.getElementById(
            "voice-ai-response"
        );


    if (aiResponseElement) {

        aiResponseElement.style.display =
            "block";
    }


    if (feedbackElement) {

        feedbackElement.innerHTML = `

            <div>

                <strong>
                    Interview Feedback:
                </strong>

                <p>
                    ${escapeHtml(finalFeedback)}
                </p>

            </div>

            <div>

                <strong>
                    Final Result:
                </strong>

                <p>
                    ${escapeHtml(finalDecision)}
                </p>

            </div>

            <div>

                <strong>
                    Questions Completed:
                </strong>

                <p>
                    ${voiceScores.length} of ${voiceTotalQuestions}
                </p>

            </div>

            ${generateQuestionDurationHtml()}
        `;
    }


    if (aiResponseElement) {

        aiResponseElement.innerHTML = `

            <div style="font-weight:700; margin-bottom:8px;">
                INTERVIEW STOPPED
            </div>

            <div>
                The candidate stopped the overall interview.
            </div>

        `;
    }


    const finalDecisionElement =
        document.getElementById(
            "voice-final-decision"
        );


    if (finalDecisionElement) {

        finalDecisionElement.style.display =
            "block";
    }


    setVoiceStatus(
        `Interview stopped at Question ${voiceQuestionNumber} of ${voiceTotalQuestions}. Final Score: ${finalScore}/100`
    );


    console.log(
        "VOICE INTERVIEW STOPPED:",
        {
            candidate:
                voiceCandidateName,

            questionNumber:
                voiceQuestionNumber,

            questionsCompleted:
                voiceScores.length,

            scores:
                voiceScores,

            questionDurations:
                voiceQuestionDurations,

            finalScore:
                finalScore
        }
    );


    try {

        if (
            typeof api.stopInterview ===
            "function"
        ) {

            await api.stopInterview(
                voiceCandidateId,
                voiceScores,
                voiceQuestionNumber,
                voiceHistory
            );
        }

    } catch (error) {

        console.warn(
            "Interview stop endpoint unavailable:",
            error
        );
    }
}


// ============================================================
// Extract Answer Score
// ============================================================

function extractAnswerScore(response) {

    let score =
        response?.answer_score ??
        response?.score ??
        response?.evaluation?.score ??
        0;


    score =
        Number(score);


    if (
        Number.isNaN(score)
    ) {

        score =
            0;
    }


    if (score < 0) {

        score =
            0;
    }


    if (score > 100) {

        score =
            100;
    }


    return Math.round(score);
}


// ============================================================
// Extract Feedback
// ============================================================

function extractFeedback(response) {

    if (!response) {

        return "No feedback available.";
    }


    return (
        response.feedback ||
        response.evaluation?.feedback ||
        response.message ||
        "Answer evaluated successfully."
    );
}


// ============================================================
// Extract Next Question
// ============================================================

function extractNextQuestion(response) {

    if (!response) {

        return "";
    }


    const question =
        response.next_question ||
        response.nextQuestion ||
        response.evaluation?.next_question ||
        response.evaluation?.nextQuestion ||
        "";


    if (
        typeof question ===
            "string" &&
        question.trim()
    ) {

        return question.trim();
    }


    return "";
}


// ============================================================
// Show Voice Feedback
// ============================================================

function showVoiceFeedback(
    response,
    score
) {

    const feedbackElement =
        document.getElementById(
            "voice-feedback"
        );


    const aiResponseElement =
        document.getElementById(
            "voice-ai-response"
        );


    const scoreElement =
        document.getElementById(
            "voice-score"
        );


    const scoreArea =
        document.getElementById(
            "voice-score-area"
        );


    if (aiResponseElement) {

        aiResponseElement.style.display =
            "block";

        aiResponseElement.textContent =
            response?.ai_response ||
            "Thank you for your answer.";
    }


    const feedback =
        extractFeedback(
            response
        );


    const strengths =
        response?.strengths ||
        response?.evaluation?.strengths ||
        "";


    const technical =
        response?.technical ||
        response?.evaluation?.technical ||
        "";


    const communication =
        response?.communication ||
        response?.evaluation?.communication ||
        "";


    const improvements =
        response?.improvements ||
        response?.evaluation?.improvements ||
        "";


    if (feedbackElement) {

        let html = `

            <div>

                <strong>
                    Feedback:
                </strong>

                <p>
                    ${escapeHtml(
                        String(feedback)
                    )}
                </p>

            </div>
        `;


        if (strengths) {

            html += `

                <div>

                    <strong>
                        Strengths:
                    </strong>

                    <p>
                        ${escapeHtml(
                            String(strengths)
                        )}
                    </p>

                </div>
            `;
        }


        if (technical) {

            html += `

                <div>

                    <strong>
                        Technical:
                    </strong>

                    <p>
                        ${escapeHtml(
                            String(technical)
                        )}
                    </p>

                </div>
            `;
        }


        if (communication) {

            html += `

                <div>

                    <strong>
                        Communication:
                    </strong>

                    <p>
                        ${escapeHtml(
                            String(communication)
                        )}
                    </p>

                </div>
            `;
        }


        if (improvements) {

            html += `

                <div>

                    <strong>
                        Improvements:
                    </strong>

                    <p>
                        ${escapeHtml(
                            String(improvements)
                        )}
                    </p>

                </div>
            `;
        }


        feedbackElement.innerHTML =
            html;
    }


    if (scoreElement) {

        scoreElement.textContent =
            `${score}/100`;
    }


    if (scoreArea) {

        scoreArea.style.display =
            "block";
    }
}


// ============================================================
// Finish Voice Interview
// ============================================================

async function finishVoiceInterview() {

    if (speechStartTime) {

        saveCurrentQuestionDuration();
    }

    stopSpeechTimer();


    isVoiceScreening =
        false;

    interviewStopped =
        false;


    if (
        voiceRecognition &&
        isListening
    ) {

        try {

            voiceRecognition.stop();

        } catch (error) {

            console.warn(
                "Speech recognition already stopped."
            );
        }
    }


    isListening =
        false;


    const finalScore =
        calculateFinalScore();


    const finalFeedback =
        generateFinalFeedback(
            finalScore
        );


    const finalDecision =
        getInterviewDecision(
            finalScore
        );


    let totalSpeakingSeconds =
        0;


    for (
        let i = 0;
        i < voiceTotalQuestions;
        i++
    ) {

        totalSpeakingSeconds +=
            Number(
                voiceQuestionDurations[i] || 0
            );
    }


    const totalSpeakingTime =
        formatSpeechDuration(
            totalSpeakingSeconds
        );


    const finalScoreElement =
        document.getElementById(
            "voice-final-score"
        );


    if (finalScoreElement) {

        finalScoreElement.textContent =
            `${finalScore}/100`;
    }


    const scoreElement =
        document.getElementById(
            "voice-score"
        );


    if (scoreElement) {

        scoreElement.textContent =
            `${finalScore}/100`;
    }


    const scoreArea =
        document.getElementById(
            "voice-score-area"
        );


    if (scoreArea) {

        scoreArea.style.display =
            "block";
    }


    const feedbackElement =
        document.getElementById(
            "voice-feedback"
        );


    if (feedbackElement) {

        feedbackElement.innerHTML = `

            <div style="
                margin-top:15px;
                padding:12px;
                border:1px solid #ddd;
                border-radius:6px;
            ">

                <strong>
                    Interview Feedback
                </strong>

                <p>
                    ${escapeHtml(
                        finalFeedback.summary
                    )}
                </p>

            </div>


            <div style="
                margin-top:12px;
                padding:12px;
                border:1px solid #ddd;
                border-radius:6px;
            ">

                <strong>
                    Strengths
                </strong>

                <p>
                    ${escapeHtml(
                        finalFeedback.strengths
                    )}
                </p>

            </div>


            <div style="
                margin-top:12px;
                padding:12px;
                border:1px solid #ddd;
                border-radius:6px;
            ">

                <strong>
                    Areas for Improvement
                </strong>

                <p>
                    ${escapeHtml(
                        finalFeedback.improvements
                    )}
                </p>

            </div>


            <div style="
                margin-top:12px;
                padding:12px;
                border:1px solid #ddd;
                border-radius:6px;
            ">

                <strong>
                    Final Result
                </strong>

                <p>
                    ${escapeHtml(
                        finalDecision
                    )}

                </p>

            </div>


            <div style="
                margin-top:12px;
                padding:12px;
                border:1px solid #ddd;
                border-radius:6px;
            ">

                <strong>
                    Final Interview Score
                </strong>

                <p>
                    ${finalScore}/100
                </p>

            </div>


            <div style="
                margin-top:12px;
                padding:12px;
                border:1px solid #ddd;
                border-radius:6px;
            ">

                <strong>
                    Questions Completed
                </strong>

                <p>
                    ${voiceScores.length}
                    of
                    ${voiceTotalQuestions}
                </p>

            </div>


            <div style="
                margin-top:15px;
                padding:12px;
                border:1px solid #ddd;
                border-radius:6px;
            ">

                <strong>
                    Speaking Duration for Each Question:
                </strong>

                <div style="
                    margin-top:10px;
                ">
        `;


        for (
            let i = 0;
            i < voiceTotalQuestions;
            i++
        ) {

            const duration =
                Number(
                    voiceQuestionDurations[i] || 0
                );


            feedbackElement.innerHTML += `

                <div style="
                    margin-bottom:8px;
                    padding:8px;
                    border:1px solid #ddd;
                    border-radius:5px;
                ">

                    <strong>
                        Question ${i + 1}:
                    </strong>

                    <span>
                        ${formatSpeechDuration(
                            duration
                        )}
                    </span>

                </div>
            `;
        }


        feedbackElement.innerHTML += `

                </div>


                <div style="
                    margin-top:12px;
                    padding:10px;
                    border:1px solid #ccc;
                    border-radius:5px;
                    font-weight:700;
                ">

                    Total Speaking Time:
                    ${totalSpeakingTime}

                </div>

            </div>
        `;
    }


    const aiResponseElement =
        document.getElementById(
            "voice-ai-response"
        );


    if (aiResponseElement) {

        aiResponseElement.style.display =
            "block";

        aiResponseElement.innerHTML = `

            <div style="
                font-weight:700;
                margin-bottom:8px;
            ">

                INTERVIEW COMPLETED

            </div>

            <div>

                The voice screening has been completed successfully.

            </div>

        `;
    }


    const decisionElement =
        document.getElementById(
            "voice-final-decision"
        );


    if (decisionElement) {

        decisionElement.style.display =
            "block";
    }


    const nextButton =
        document.getElementById(
            "next-voice-question"
        );


    const submitButton =
        document.getElementById(
            "submit-voice-answer"
        );


    const stopButton =
        document.getElementById(
            "stop-voice-interview"
        );


    if (nextButton) {

        nextButton.disabled =
            true;

        nextButton.style.display =
            "none";
    }


    if (submitButton) {

        submitButton.disabled =
            true;

        submitButton.style.display =
            "none";
    }


    if (stopButton) {

        stopButton.disabled =
            true;

        stopButton.style.display =
            "none";
    }


    const startSpeakingButton =
        document.getElementById(
            "start-speaking"
        );


    const stopSpeakingButton =
        document.getElementById(
            "stop-speaking"
        );


    if (startSpeakingButton) {

        startSpeakingButton.disabled =
            true;
    }


    if (stopSpeakingButton) {

        stopSpeakingButton.disabled =
            true;
    }


    setVoiceStatus(
        `Voice interview completed. Final Score: ${finalScore}/100`
    );


    console.log(
        "VOICE INTERVIEW FINAL SCORE:",
        finalScore
    );


    console.log(
        "VOICE QUESTION DURATIONS:",
        voiceQuestionDurations
    );


    console.log(
        "VOICE TOTAL SPEAKING TIME:",
        totalSpeakingTime
    );


    try {

        if (
            typeof api.stopInterview ===
            "function"
        ) {

            await api.stopInterview(
                voiceCandidateId,
                voiceScores,
                voiceTotalQuestions,
                voiceHistory
            );
        }

    } catch (error) {

        console.warn(
            "Final interview endpoint unavailable:",
            error
        );
    }
}


// ============================================================
// Calculate Final Score
// ============================================================

function calculateFinalScore() {

    if (
        !voiceScores.length
    ) {

        return 0;
    }


    const total =
        voiceScores.reduce(
            (
                sum,
                score
            ) =>
                sum +
                Number(score || 0),
            0
        );


    return Math.round(
        total /
        voiceScores.length
    );
}


// ============================================================
// Stop Feedback
// ============================================================

function generateStopFeedback(score) {

    if (score >= 85) {

        return (
            "The interview was stopped early, but the candidate demonstrated excellent technical performance in the questions completed."
        );
    }


    if (score >= 70) {

        return (
            "The interview was stopped early. The candidate demonstrated good technical knowledge in the questions completed."
        );
    }


    if (score >= 50) {

        return (
            "The interview was stopped early. The candidate demonstrated some relevant technical knowledge but has areas that need improvement."
        );
    }


    return (
        "The interview was stopped early and the completed answers indicate that the candidate needs significant improvement in technical knowledge."
    );
}


// ============================================================
// Final Feedback
// ============================================================

function generateFinalFeedback(score) {

    if (score >= 85) {

        return {
            summary:
                "Excellent interview performance. The candidate demonstrated strong technical knowledge, clear communication, and good problem-solving ability.",

            strengths:
                "Strong technical understanding, clear communication, confident responses, and good ability to explain technical concepts.",

            improvements:
                "Continue improving advanced technical knowledge and provide more real-world examples to make answers even stronger."
        };
    }


    if (score >= 70) {

        return {
            summary:
                "Good interview performance. The candidate demonstrated solid technical understanding with some areas that could be improved.",

            strengths:
                "Good understanding of technical concepts and relevant programming skills. The candidate was able to provide technically relevant answers.",

            improvements:
                "Provide more detailed explanations, include practical examples, and improve the depth and completeness of technical answers."
        };
    }


    if (score >= 50) {

        return {
            summary:
                "Average interview performance. The candidate showed some relevant technical knowledge but needs improvement in technical depth and communication.",

            strengths:
                "The candidate demonstrated basic understanding of relevant technical concepts and was able to answer some questions appropriately.",

            improvements:
                "Improve technical depth, provide complete answers, explain concepts with examples, and work on communication clarity."
        };
    }


    return {
        summary:
            "The interview performance needs significant improvement. The candidate should strengthen technical knowledge and provide more complete answers.",

        strengths:
            "The candidate demonstrated some basic awareness of the technical topics discussed.",

        improvements:
            "Strengthen core technical knowledge, provide complete and technically detailed answers, use practical examples, and improve communication confidence."
    };
}


// ============================================================
// Interview Decision
// ============================================================

function getInterviewDecision(score) {

    if (score >= 70) {

        return "Recommended for Shortlisting";
    }


    if (score >= 50) {

        return "Needs Further Review";
    }


    return "Not Recommended";
}


// ============================================================
// Update Candidate Status
// ============================================================

async function updateVoiceCandidateStatus(
    status
) {

    if (!voiceCandidateId) {

        alert(
            "Please select a candidate first."
        );

        return;
    }


    try {

        const statusButton =
            status === "shortlisted"

                ? document.getElementById(
                    "shortlist-candidate"
                )

                : document.getElementById(
                    "reject-candidate"
                );


        if (statusButton) {

            statusButton.disabled =
                true;
        }


        await api.updateCandidateStatus(
            voiceCandidateId,
            status
        );


        setVoiceStatus(
            `Candidate marked as ${status}.`
        );


        alert(
            `Candidate successfully marked as ${status}.`
        );


        await loadDashboardData();


    } catch (error) {

        console.error(
            "Failed to update candidate status:",
            error
        );


        alert(
            error.message ||
            "Failed to update candidate status."
        );


        const statusButton =
            status === "shortlisted"

                ? document.getElementById(
                    "shortlist-candidate"
                )

                : document.getElementById(
                    "reject-candidate"
                );


        if (statusButton) {

            statusButton.disabled =
                false;
        }
    }
}


// ============================================================
// Voice Status
// ============================================================

function setVoiceStatus(message) {

    const statusElement =
        document.getElementById(
            "speech-status"
        );


    if (statusElement) {

        statusElement.textContent =
            message;
    }
}


// ============================================================
// Generic DOM Helper
// ============================================================

function updateElement(
    id,
    value
) {

    const element =
        document.getElementById(id);


    if (element) {

        element.textContent =
            value;
    }
}


// ============================================================
// Normalize Status
// ============================================================

function normalizeStatus(status) {

    if (!status) {

        return "";
    }


    return String(status)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}


// ============================================================
// Extract Skills
// ============================================================

function extractSkillsArray(candidate) {

    if (!candidate) {

        return [];
    }


    let skills =
        candidate.skills ||
        candidate.skillset ||
        candidate.skill_set ||
        [];


    if (
        typeof skills ===
        "string"
    ) {

        try {

            const parsed =
                JSON.parse(skills);


            if (
                Array.isArray(parsed)
            ) {

                skills =
                    parsed;
            }

        } catch (error) {

            skills =
                skills
                    .split(",")
                    .map(
                        skill =>
                            skill.trim()
                    )
                    .filter(Boolean);
        }
    }


    if (
        !Array.isArray(skills)
    ) {

        return [];
    }


    return skills
        .map(skill => {

            if (
                typeof skill ===
                    "object" &&
                skill !== null
            ) {

                return (
                    skill.name ||
                    skill.skill ||
                    skill.title ||
                    ""
                );
            }


            return String(skill);
        })
        .map(
            skill =>
                skill.trim()
        )
        .filter(Boolean);
}


// ============================================================
// Status Badge
// ============================================================

function getStatusBadgeStyle(
    status
) {

    const normalized =
        normalizeStatus(status);


    if (
        normalized ===
        "shortlisted"
    ) {

        return `
            background:#d4edda;
            color:#155724;
            padding:4px 8px;
            border-radius:4px;
            font-size:12px;
        `;
    }


    if (
        normalized ===
        "rejected"
    ) {

        return `
            background:#f8d7da;
            color:#721c24;
            padding:4px 8px;
            border-radius:4px;
            font-size:12px;
        `;
    }


    if (
        normalized ===
        "processed"
    ) {

        return `
            background:#d1ecf1;
            color:#0c5460;
            padding:4px 8px;
            border-radius:4px;
            font-size:12px;
        `;
    }


    return `
        background:#e2e3e5;
        color:#383d41;
        padding:4px 8px;
        border-radius:4px;
        font-size:12px;
    `;
}


// ============================================================
// Escape HTML
// ============================================================

function escapeHtml(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}