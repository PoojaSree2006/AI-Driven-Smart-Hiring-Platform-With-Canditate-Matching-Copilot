/* ============================================================
   frontend-html/js/interview.js
   Interview Copilot & ATS Management Handler
   ============================================================ */

let isInterviewActive = false;
let activeCandidateId = null;
let activeCandidateName = "Candidate";
let chatHistory = [];
let candidatesList = [];
let currentQuestion = "";
let questionNumber = 1;
let totalQuestions = 5;
let answerScores = [];
let interviewCompleted = false;
let finalInterviewScore = 0;
let isInterviewerView = false;

// ============================================================
// Question Types Configuration (SIMPLIFIED)
// ============================================================
const QUESTION_TYPES = [
    { value: 'technical', label: 'Technical Skills' },
    { value: 'behavioral', label: 'Behavioral' },
    { value: 'scenario', label: 'Scenario Based' },
    { value: 'aptitude', label: 'Aptitude' },
    { value: 'coding', label: 'Coding' }
];

// ============================================================
// Utility: Escape HTML
// ============================================================
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================================================
// Get Example Answer for Questions
// ============================================================
function getExampleAnswer(questionText) {
  if (questionText.toLowerCase().includes('introduce') || 
      questionText.toLowerCase().includes('background') ||
      questionText.toLowerCase().includes('yourself')) {
    return `\n\n💡 Example: "I have 3 years of experience as a Full Stack Developer using Python, FastAPI, and React. I've built several web applications and worked with databases like PostgreSQL and MongoDB. I'm passionate about creating scalable solutions and learning new technologies."`;
  }
  
  if (questionText.toLowerCase().includes('api') || questionText.toLowerCase().includes('rest')) {
    return `\n\n💡 Example: "I designed REST APIs using FastAPI with Pydantic models for validation. I used Axios on the frontend to make HTTP requests, implemented JWT authentication, and used CORS middleware for secure cross-origin requests. Each endpoint was tested using Postman."`;
  }
  
  if (questionText.toLowerCase().includes('error') || questionText.toLowerCase().includes('invalid')) {
    return `\n\n💡 Example: "I implemented comprehensive error handling with try-catch blocks, Pydantic validation for input data, custom exception handlers returning appropriate HTTP status codes, and centralized error logging for debugging and monitoring."`;
  }
  
  if (questionText.toLowerCase().includes('scalability') || questionText.toLowerCase().includes('performance')) {
    return `\n\n💡 Example: "I would implement horizontal scaling using Kubernetes, add Redis caching for frequently accessed data, optimize database queries with proper indexing, use a load balancer for traffic distribution, and implement monitoring with Prometheus and Grafana."`;
  }
  
  return "";
}

// ============================================================
// Question-Specific Answer Validation
// ============================================================
function validateAnswerRelevance(answerText, questionText) {
  const lowerAnswer = answerText.toLowerCase();
  const lowerQuestion = questionText.toLowerCase();
  
  // Extract key concepts from the question
  const questionConcepts = [];
  
  // API Design questions
  if (lowerQuestion.includes('api') || lowerQuestion.includes('rest')) {
    questionConcepts.push(
      'api',
      'rest',
      'endpoint',
      'route',
      'http',
      'method',
      'get',
      'post',
      'put',
      'delete',
      'fastapi',
      'axios',
      'fetch',
      'request',
      'response'
    );

    if (
      lowerQuestion.includes('frontend') ||
      lowerQuestion.includes('backend')
    ) {
      questionConcepts.push(
        'frontend',
        'backend',
        'client',
        'server'
      );
    }
  }
  
  // Database questions
  if (
    lowerQuestion.includes('database') ||
    lowerQuestion.includes('sql') ||
    lowerQuestion.includes('schema')
  ) {
    questionConcepts.push(
      'database',
      'sql',
      'schema',
      'table',
      'query',
      'index',
      'foreign key',
      'relationship',
      'normalization',
      'postgresql',
      'mysql',
      'mongodb'
    );
  }
  
  // Error Handling questions
  if (
    lowerQuestion.includes('error') ||
    lowerQuestion.includes('invalid') ||
    lowerQuestion.includes('exception')
  ) {
    questionConcepts.push(
      'error',
      'exception',
      'validation',
      'try',
      'catch',
      'handle',
      'status code',
      '400',
      '500',
      'input',
      'pydantic',
      'logging'
    );
  }
  
  // Scalability questions
  if (
    lowerQuestion.includes('scalability') ||
    lowerQuestion.includes('performance')
  ) {
    questionConcepts.push(
      'scalability',
      'performance',
      'load',
      'scale',
      'cache',
      'index',
      'optimization',
      'horizontal',
      'vertical',
      'kubernetes',
      'redis',
      'load balancer'
    );
  }
  
  // System Design questions
  if (
    lowerQuestion.includes('design') ||
    lowerQuestion.includes('architecture')
  ) {
    questionConcepts.push(
      'design',
      'architecture',
      'component',
      'service',
      'database',
      'cache',
      'load balancer',
      'microservices'
    );
  }
  
  // Check if answer contains at least 1 concept from the question
  let matchedConcepts = 0;

  questionConcepts.forEach(concept => {
    if (lowerAnswer.includes(concept)) {
      matchedConcepts++;
    }
  });
  
  // Check if answer is completely off-topic
  if (questionConcepts.length > 0 && matchedConcepts === 0) {
    
    const isBehavioralStory =
      lowerAnswer.includes('pressure') || 
      lowerAnswer.includes('team') || 
      lowerAnswer.includes('gathered') ||
      lowerAnswer.includes('communicate') ||
      lowerAnswer.includes('collaboration') ||
      lowerAnswer.includes('conflict') ||
      lowerAnswer.includes('resolve');
    
    if (
      isBehavioralStory &&
      !lowerQuestion.includes('behavioral') &&
      !lowerQuestion.includes('pressure') &&
      !lowerQuestion.includes('conflict')
    ) {
      return {
        valid: false,
        reason: "⚠️ Your answer seems to be a behavioral story, but the question is about technical implementation.\n\nPlease focus on the technical aspects of the question. Include specific details about:\n• Technologies and tools used\n• Implementation approach\n• Code structure and design\n• Technical decisions made"
      };
    }
    
    const isSystemDesignAnswer =
      lowerAnswer.includes('microservices') || 
      lowerAnswer.includes('architecture') ||
      lowerAnswer.includes('load balancer') ||
      lowerAnswer.includes('kubernetes') ||
      lowerAnswer.includes('docker');
    
    if (
      isSystemDesignAnswer &&
      !lowerQuestion.includes('design') &&
      !lowerQuestion.includes('architecture') &&
      !lowerQuestion.includes('scalability')
    ) {
      return {
        valid: false,
        reason: "⚠️ Your answer discusses system design concepts, but the question is about a specific technical implementation.\n\nPlease focus on answering the actual question asked. Include specific details about your implementation approach."
      };
    }
    
    return {
      valid: false,
      reason: `⚠️ Your answer doesn't seem to address the specific question.\n\nThe question asks about: "${questionText}"\n\nPlease provide a relevant technical answer that directly addresses this question.`
    };
  }
  
  // API questions
  if (lowerQuestion.includes('api') && matchedConcepts < 2) {
    return {
      valid: false,
      reason: "⚠️ The question is about REST APIs. Please include details about:\n• API endpoints and routes\n• HTTP methods (GET, POST, PUT, DELETE)\n• Request/Response handling\n• Authentication/Authorization\n• Error handling in APIs"
    };
  }
  
  // Error Handling questions
  if (lowerQuestion.includes('error') && matchedConcepts < 2) {
    return {
      valid: false,
      reason: "⚠️ The question is about error handling and invalid input. Please include details about:\n• How you validate input\n• Error handling mechanisms (try/catch)\n• Status codes and error responses\n• Logging and monitoring errors\n• User-friendly error messages"
    };
  }
  
  // Scalability questions
  if (
    (
      lowerQuestion.includes('scalability') ||
      lowerQuestion.includes('performance')
    ) &&
    matchedConcepts < 2
  ) {
    return {
      valid: false,
      reason: "⚠️ The question is about scalability and performance. Please include details about:\n• Scaling strategies (horizontal/vertical)\n• Caching mechanisms\n• Database optimization\n• Load balancing\n• Performance monitoring and optimization"
    };
  }
  
  // Check answer length
  const wordCount = answerText.split(/\s+/).length;

  if (
    lowerQuestion.includes('design') ||
    lowerQuestion.includes('architecture') ||
    lowerQuestion.includes('scalability')
  ) {
    if (wordCount < 20) {
      return {
        valid: false,
        reason: `⚠️ This is a complex design question. Please provide a more detailed answer (at least 20 words, you provided ${wordCount}).\n\nInclude specific details about your design decisions, technologies, and implementation approach.`
      };
    }
  }
  
  return { valid: true };
}

// ============================================================
// Technical Answer Validation (STRICT)
// ============================================================
function validateTechnicalAnswer(answerText, questionText) {
  const lowerAnswer = answerText.toLowerCase();
  const words = answerText.split(/\s+/);
  const wordCount = words.length;
  
  // 1. Check for gibberish
  const cleanText = answerText.replace(/\s/g, '');

  if (cleanText.length > 10) {
    let maxConsecutiveConsonants = 0;
    let currentConsecutive = 0;

    const consonants = 'bcdfghjklmnpqrstvwxyz';

    for (let char of cleanText.toLowerCase()) {
      if (consonants.includes(char)) {
        currentConsecutive++;
        maxConsecutiveConsonants =
          Math.max(maxConsecutiveConsonants, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }

    if (maxConsecutiveConsonants > 8) {
      return {
        valid: false,
        reason: "Your answer appears to contain random text. Please provide a meaningful technical response."
      };
    }
  }
  
  // 2. Check for meaningful content
  const vowelCount =
    (cleanText.match(/[aeiou]/gi) || []).length;

  if (cleanText.length > 5 && vowelCount === 0) {
    return {
      valid: false,
      reason: "Your answer doesn't appear to contain meaningful words. Please provide a proper technical response."
    };
  }
  
  // 3. Check minimum word count
  if (wordCount < 10) {
    return {
      valid: false,
      reason: `Please provide a more detailed answer. Your response should be at least 10 words (${wordCount} words provided).`
    };
  }
  
  // 4. Check for technical keywords
  const techKeywords = [
    'java',
    'python',
    'javascript',
    'typescript',
    'c++',
    'c#',
    'ruby',
    'go',
    'rust',
    'react',
    'angular',
    'vue',
    'node',
    'express',
    'django',
    'flask',
    'fastapi',
    'spring',
    'html',
    'css',
    'rest',
    'api',
    'graphql',
    'websocket',
    'http',
    'json',
    'xml',
    'sql',
    'mysql',
    'postgresql',
    'mongodb',
    'redis',
    'oracle',
    'database',
    'schema',
    'table',
    'query',
    'index',
    'join',
    'transaction',
    'acid',
    'nosql',
    'foreign key',
    'docker',
    'kubernetes',
    'aws',
    'azure',
    'gcp',
    'ci/cd',
    'jenkins',
    'git',
    'github',
    'microservices',
    'monolithic',
    'serverless',
    'event-driven',
    'message queue',
    'rabbitmq',
    'kafka',
    'load balancer',
    'cache',
    'cdn',
    'authentication',
    'authorization',
    'jwt',
    'oauth',
    'ssl',
    'tls',
    'encryption',
    'hashing',
    'salt',
    'csrf',
    'xss',
    'sql injection',
    'unit test',
    'integration test',
    'e2e',
    'jest',
    'pytest',
    'junit',
    'mock',
    'stub',
    'algorithm',
    'data structure',
    'oop',
    'functional',
    'design pattern',
    'solid',
    'agile',
    'scrum',
    'kanban',
    'monitoring',
    'logging',
    'deployment',
    'frontend',
    'backend',
    'fullstack',
    'server',
    'client',
    'database',
    'llm',
    'ai',
    'machine learning',
    'deep learning',
    'nlp',
    'neural network',
    'architecture',
    'scalability',
    'reliability',
    'availability',
    'consistency',
    'partition',
    'replication',
    'sharding',
    'caching',
    'load balancing',
    'software',
    'development',
    'programming',
    'framework',
    'library',
    'tool',
    'experience',
    'years',
    'worked',
    'project',
    'team',
    'collaboration',
    'graduate',
    'degree',
    'computer science',
    'engineering',
    'information technology',
    'developer',
    'engineer',
    'programmer',
    'coder',
    'fullstack',
    'devops',
    'axios',
    'fetch',
    'endpoint',
    'route',
    'postman'
  ];
  
  let keywordCount = 0;

  techKeywords.forEach(keyword => {
    if (lowerAnswer.includes(keyword)) {
      keywordCount++;
    }
  });
  
  // Introduction question
  const isIntroductionQuestion =
    questionText.toLowerCase().includes('introduce') || 
    questionText.toLowerCase().includes('background') ||
    questionText.toLowerCase().includes('yourself');
  
  if (isIntroductionQuestion && keywordCount < 2) {
    return {
      valid: false,
      reason: `Please introduce yourself with relevant technical experience. Include details about:\n• Technologies you've worked with\n• Your programming languages\n• Projects you've built\n• Your technical background`
    };
  }
  
  if (isIntroductionQuestion) {
    const hasTechnicalContext =
      lowerAnswer.includes('experience') || 
      lowerAnswer.includes('worked') || 
      lowerAnswer.includes('development') || 
      lowerAnswer.includes('programming') ||
      lowerAnswer.includes('project') ||
      lowerAnswer.includes('software') ||
      lowerAnswer.includes('engineer') ||
      lowerAnswer.includes('developer') ||
      lowerAnswer.includes('tech') ||
      lowerAnswer.includes('build') ||
      lowerAnswer.includes('create') ||
      lowerAnswer.includes('design') ||
      lowerAnswer.includes('implement');
    
    if (!hasTechnicalContext) {
      return {
        valid: false,
        reason: "Please provide a proper technical introduction. Include information about:\n• Your technical skills and experience\n• Programming languages you know\n• Projects you've worked on\n• Your educational background in tech"
      };
    }
  }
  
  // 5. Check answer relevance
  const relevanceCheck =
    validateAnswerRelevance(answerText, questionText);

  if (!relevanceCheck.valid) {
    return relevanceCheck;
  }
  
  // 6. Other technical questions
  const technicalQuestionIndicators = [
    'technical',
    'database',
    'api',
    'rest',
    'backend',
    'design',
    'architecture',
    'error',
    'security',
    'authentication',
    'test',
    'deploy',
    'framework',
    'library',
    'tool',
    'language',
    'system',
    'algorithm',
    'data structure',
    'cloud',
    'devops',
    'scalability',
    'code',
    'program',
    'develop',
    'build'
  ];
  
  const isTechnicalQuestion =
    technicalQuestionIndicators.some(indicator =>
      questionText.toLowerCase().includes(indicator)
    );
  
  if (isTechnicalQuestion && keywordCount < 1) {
    return {
      valid: false,
      reason: "Your answer lacks technical content. Please include specific technical terms related to the question."
    };
  }
  
  return { valid: true };
}

// ============================================================
// Frontend Scoring Function
// ============================================================
function calculateAnswerScore(answerText, questionText) {
  let score = 0;
  const words = answerText.split(/\s+/).length;
  
  // 1. Length-based scoring
  if (words >= 60) score += 35;
  else if (words >= 45) score += 30;
  else if (words >= 30) score += 25;
  else if (words >= 20) score += 20;
  else if (words >= 15) score += 10;
  else if (words >= 10) score += 5;
  
  // 2. Technical keyword detection
  const techKeywords = [
    'java',
    'python',
    'javascript',
    'typescript',
    'c++',
    'c#',
    'ruby',
    'go',
    'rust',
    'react',
    'angular',
    'vue',
    'node',
    'express',
    'django',
    'flask',
    'fastapi',
    'spring',
    'html',
    'css',
    'rest',
    'api',
    'graphql',
    'websocket',
    'http',
    'json',
    'xml',
    'sql',
    'mysql',
    'postgresql',
    'mongodb',
    'redis',
    'oracle',
    'database',
    'schema',
    'table',
    'query',
    'index',
    'join',
    'transaction',
    'acid',
    'nosql',
    'foreign key',
    'docker',
    'kubernetes',
    'aws',
    'azure',
    'gcp',
    'ci/cd',
    'jenkins',
    'git',
    'github',
    'microservices',
    'monolithic',
    'serverless',
    'event-driven',
    'message queue',
    'rabbitmq',
    'kafka',
    'load balancer',
    'cache',
    'cdn',
    'authentication',
    'authorization',
    'jwt',
    'oauth',
    'ssl',
    'tls',
    'encryption',
    'hashing',
    'salt',
    'csrf',
    'xss',
    'sql injection',
    'unit test',
    'integration test',
    'e2e',
    'jest',
    'pytest',
    'junit',
    'mock',
    'stub',
    'algorithm',
    'data structure',
    'oop',
    'functional',
    'design pattern',
    'solid',
    'agile',
    'scrum',
    'kanban',
    'monitoring',
    'logging',
    'deployment',
    'llm',
    'ai',
    'machine learning',
    'deep learning',
    'nlp',
    'architecture',
    'scalability',
    'reliability',
    'availability',
    'consistency',
    'axios',
    'fetch',
    'postman',
    'endpoint',
    'pydantic'
  ];
  
  let keywordCount = 0;
  const lowerAnswer = answerText.toLowerCase();

  techKeywords.forEach(keyword => {
    if (lowerAnswer.includes(keyword)) {
      keywordCount++;
    }
  });
  
  const keywordScore = Math.min(keywordCount * 3, 35);
  score += keywordScore;
  
  // 3. Sentence structure
  const sentences = answerText.match(/[.!?]+/g);
  const sentenceCount = sentences ? sentences.length : 0;

  if (sentenceCount >= 5) score += 15;
  else if (sentenceCount >= 3) score += 10;
  else if (sentenceCount >= 2) score += 5;
  
  // 4. Technical depth
  let depthScore = 0;

  const depthIndicators = [
    'because',
    'therefore',
    'however',
    'although',
    'specifically',
    'for example',
    'such as',
    'including',
    'implement',
    'designed', 
    'developed',
    'created',
    'built',
    'challenge',
    'solution', 
    'approach',
    'method',
    'strategy',
    'efficient',
    'performance', 
    'scalability',
    'reliability',
    'architecture',
    'design',
    'implemented',
    'organized',
    'configured',
    'tested',
    'deployed'
  ];
  
  depthIndicators.forEach(indicator => {
    if (lowerAnswer.includes(indicator)) {
      depthScore += 2;
    }
  });

  score += Math.min(depthScore, 15);
  
  return Math.min(score, 100);
}

// ============================================================
// Get AI Recommendation
// ============================================================
function getAIRecommendation(score) {
  if (score >= 80) {
    return {
      status: 'Shortlist',
      recommendation: 'Strong candidate! Highly recommended for shortlisting.',
      reason: 'Demonstrated excellent technical knowledge, clear communication, and strong problem-solving skills.',
      icon: '✅',
      action: 'Shortlist'
    };
  } else if (score >= 60) {
    return {
      status: 'Shortlist',
      recommendation: 'Good candidate. Consider for shortlisting.',
      reason: 'Showed solid technical foundation and good communication skills. Has potential.',
      icon: '📌',
      action: 'Shortlist'
    };
  } else if (score >= 40) {
    return {
      status: 'Schedule',
      recommendation: 'Average performance. Consider scheduling another round.',
      reason: 'Has some technical knowledge but needs improvement in certain areas.',
      icon: '🔄',
      action: 'Schedule'
    };
  } else {
    return {
      status: 'Reject',
      recommendation: 'Not recommended at this time.',
      reason: 'Technical knowledge and communication skills need significant improvement.',
      icon: '🚫',
      action: 'Reject'
    };
  }
}

// ============================================================
// DOM Content Loaded
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  resetInterviewControls();
  loadOptions();
  populateQuestionTypes();

  document
    .getElementById("generate-btn")
    ?.addEventListener("click", generateQuestions);

  document
    .getElementById("start-interview-btn")
    ?.addEventListener("click", startInterview);

  document
    .getElementById("end-interview-btn")
    ?.addEventListener("click", endInterview);

  document
    .getElementById("send-msg-btn")
    ?.addEventListener("click", sendChatMessage);

  // ATS Button Event Listeners
  document
    .getElementById("schedule-btn")
    ?.addEventListener("click", () => {
      updateCandidatePipelineStatus('Scheduled');
    });

  document
    .getElementById("shortlist-btn")
    ?.addEventListener("click", () => {
      updateCandidatePipelineStatus('Shortlisted');
    });

  document
    .getElementById("reject-btn")
    ?.addEventListener("click", () => {
      updateCandidatePipelineStatus('Rejected');
    });

  const input = document.getElementById("chat-input");

  input?.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && isInterviewActive) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  document
    .getElementById("candidate-select")
    ?.addEventListener("change", (e) => {

      const selectedId = e.target.value;

      if (selectedId) {
        activeCandidateId = selectedId;

        const cand = candidatesList.find(
          c => String(c.id) === String(selectedId)
        );

        activeCandidateName =
          cand?.name || "Candidate";

        const header =
          document.getElementById("sim-candidate-header");

        if (header && !isInterviewActive) {
          header.textContent =
            `Candidate: ${activeCandidateName} (Ready to start)`;
        }

        updateAtsButtons(cand?.status);
      }
    });
});

// ============================================================
// Populate Question Types Dropdown
// ============================================================
function populateQuestionTypes() {
  const typeSelect =
    document.getElementById("type-select");

  if (!typeSelect) return;
  
  typeSelect.innerHTML =
    QUESTION_TYPES.map(type =>
      `<option value="${type.value}">${type.label}</option>`
    ).join('');
}

// ============================================================
// Update ATS Buttons based on status
// ============================================================
function updateAtsButtons(status) {
  const scheduleBtn =
    document.getElementById("schedule-btn");

  const shortlistBtn =
    document.getElementById("shortlist-btn");

  const rejectBtn =
    document.getElementById("reject-btn");
  
  [scheduleBtn, shortlistBtn, rejectBtn].forEach(btn => {
    if (btn) {
      btn.style.opacity = "0.6";
      btn.style.border = "1px solid #ddd";
    }
  });
  
  if (status === 'Scheduled') {
    if (scheduleBtn) {
      scheduleBtn.style.opacity = "1";
      scheduleBtn.style.border = "2px solid #3b82f6";
      scheduleBtn.style.backgroundColor = "#eff6ff";
    }
  } else if (status === 'Shortlisted') {
    if (shortlistBtn) {
      shortlistBtn.style.opacity = "1";
      shortlistBtn.style.border = "2px solid #22c55e";
      shortlistBtn.style.backgroundColor = "#f0fdf4";
    }
  } else if (status === 'Rejected') {
    if (rejectBtn) {
      rejectBtn.style.opacity = "1";
      rejectBtn.style.border = "2px solid #ef4444";
      rejectBtn.style.backgroundColor = "#fef2f2";
    }
  }
}

// ============================================================
// State Reset Helper
// ============================================================
function resetInterviewControls() {
  isInterviewActive = false;
  interviewCompleted = false;
  finalInterviewScore = 0;
  
  const startBtn =
    document.getElementById("start-interview-btn");

  if (startBtn) {
    startBtn.disabled = false;
  }

  const endBtn =
    document.getElementById("end-interview-btn");

  if (endBtn) {
    endBtn.disabled = true;
    endBtn.style.color = "var(--text-muted)";
    endBtn.style.cursor = "not-allowed";
  }

  const chatInput =
    document.getElementById("chat-input");

  if (chatInput) {
    chatInput.disabled = true;
    chatInput.value = "";
    chatInput.placeholder = "Type your response...";
  }

  const sendBtn =
    document.getElementById("send-msg-btn");

  if (sendBtn) {
    sendBtn.disabled = true;
  }

  const sessionBadge =
    document.getElementById("session-badge");

  if (sessionBadge) {
    sessionBadge.textContent = "No Active Session";
    sessionBadge.style.backgroundColor = "var(--bg-subtle)";
    sessionBadge.style.color = "var(--text-muted)";
  }

  const candSelect =
    document.getElementById("candidate-select");

  if (candSelect) {
    candSelect.disabled = false;
  }
  
  const panel =
    document.getElementById("interviewer-panel");

  if (panel) {
    panel.style.display = 'none';
  }
}

// ============================================================
// Initial Options Load
// ============================================================
async function loadOptions() {

  try {
    const jobs = await api.getJobs();

    console.log(
      "Jobs received from backend:",
      jobs
    );

    const jobSelect =
      document.getElementById("job-select");

    if (jobSelect) {

      if (!jobs || jobs.length === 0) {

        jobSelect.innerHTML =
          `<option value="">No jobs found</option>`;

      } else {

        jobSelect.innerHTML =
          `<option value="">-- Select job position --</option>` +
          jobs.map(job => `
            <option value="${job.id}">
              ${escapeHtml(job.title || "Untitled Job")}
            </option>
          `).join("");
      }
    }

  } catch (err) {

    console.error(
      "Failed to load job postings:",
      err
    );

    const jobSelect =
      document.getElementById("job-select");

    if (jobSelect) {
      jobSelect.innerHTML =
        `<option value="">Failed to load job positions</option>`;
    }
  }

  try {

    const candidates =
      await api.getCandidates();

    console.log(
      "Candidates received from backend:",
      candidates
    );

    candidatesList = candidates || [];

    const candSelect =
      document.getElementById("candidate-select");

    if (candSelect) {

      if (!candidates || candidates.length === 0) {

        candSelect.innerHTML =
          `<option value="">No candidates found</option>`;

      } else {

        candSelect.innerHTML =
          `<option value="">-- Select candidate --</option>` +
          candidates.map(candidate => `
            <option value="${candidate.id}">
              ${escapeHtml(candidate.name || "Candidate")}
            </option>
          `).join("");
      }
    }

    renderAtsCards(candidatesList);

  } catch (err) {

    console.error(
      "Failed to load candidates:",
      err
    );

    const candSelect =
      document.getElementById("candidate-select");

    if (candSelect) {
      candSelect.innerHTML =
        `<option value="">Failed to load candidates</option>`;
    }
  }
}

// ============================================================
// Question Generator
// ============================================================
async function generateQuestions() {

  const jobId =
    document.getElementById("job-select")?.value;

  const questionType =
    document.getElementById("type-select")?.value ||
    "technical";

  const container =
    document.getElementById("questions-container");

  if (!jobId || !container) {
    alert("Please select a job position first.");
    return;
  }

  const typeLabel =
    QUESTION_TYPES.find(
      t => t.value === questionType
    )?.label || questionType;
  
  container.innerHTML =
    `<p style="font-size:12px; color:var(--text-muted); padding:12px;">
      ⚡ Generating ${typeLabel} questions...
    </p>`;

  try {

    const jobs =
      await api.getJobs();

    const job =
      jobs.find(
        j => String(j.id) === String(jobId)
      );

    const jobTitle =
      job?.title || "Software Developer";
    
    const fallbackQuestions =
      getFallbackQuestions(
        questionType,
        jobTitle
      );
    
    let questions = [];

    try {

      const response =
        await fetch(
          'YOUR_GOOGLE_STUDIO_API_ENDPOINT',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer YOUR_API_KEY'
            },
            body: JSON.stringify({
              prompt:
                `Generate 5 ${questionType} interview questions for a ${jobTitle} position.`,
              temperature: 0.7,
              max_tokens: 500
            })
          }
        );

      const data =
        await response.json();

      if (data.questions) {
        questions = data.questions;
      }

    } catch (apiError) {

      console.log(
        "Using fallback questions"
      );

      questions = fallbackQuestions;
    }

    if (!questions || !questions.length) {
      questions = fallbackQuestions;
    }

    container.innerHTML =
      questions.map((q, idx) => {

        const qText =
          q.question ||
          q.text ||
          q.content ||
          "Interview question";

        const cleanQuestion =
          qText
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .trim();
      
        return `
          <div class="question-card">
            <div class="q-number">${idx + 1}</div>
            <div class="q-body">
              <div class="q-text">
                ${escapeHtml(cleanQuestion)}
              </div>
            </div>
          </div>
        `;
      }).join("");

  } catch (err) {

    console.error(
      "Failed to generate questions:",
      err
    );

    const jobTitle =
      document.getElementById("job-select")
        ?.options?.[
          document.getElementById("job-select")
            .selectedIndex
        ]?.text ||
      "Software Developer";

    const fallbackQuestions =
      getFallbackQuestions(
        questionType,
        jobTitle
      );
    
    container.innerHTML =
      fallbackQuestions.map((q, idx) => {

        const qText =
          q.question ||
          q.text ||
          q.content ||
          "Interview question";

        const cleanQuestion =
          qText
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .trim();
      
        return `
          <div class="question-card">
            <div class="q-number">${idx + 1}</div>
            <div class="q-body">
              <div class="q-text">
                ${escapeHtml(cleanQuestion)}
              </div>
            </div>
          </div>
        `;
      }).join("");
  }
}

// ============================================================
// Fallback Questions by Type
// ============================================================
function getFallbackQuestions(type, jobTitle) {

  const questions = {

    technical: [
      {
        question:
          `What are the key technical skills required for a ${jobTitle} role?`
      },
      {
        question:
          "Explain the difference between synchronous and asynchronous programming."
      },
      {
        question:
          "What is your approach to debugging complex technical issues?"
      },
      {
        question:
          "How do you stay updated with new technologies and frameworks?"
      },
      {
        question:
          "Describe a technical challenge you faced and how you solved it."
      }
    ],

    behavioral: [
      {
        question:
          `Describe a time you had to work under pressure as a ${jobTitle}. How did you handle it?`
      },
      {
        question:
          "Tell me about a conflict you had with a team member and how you resolved it."
      },
      {
        question:
          "Describe a situation where you went above and beyond for a project."
      },
      {
        question:
          "How do you handle constructive criticism and feedback?"
      },
      {
        question:
          "Tell me about a time you failed and what you learned from it."
      }
    ],

    scenario: [
      {
        question:
          `You are working on a ${jobTitle} project and the deadline is approaching. How do you prioritize tasks?`
      },
      {
        question:
          "A critical bug is found in production. Describe your approach to fixing it."
      },
      {
        question:
          "Your team disagrees on a technical approach. How do you handle the situation?"
      },
      {
        question:
          "A stakeholder requests a new feature mid-sprint. What do you do?"
      },
      {
        question:
          "You discover a security vulnerability in your application. What steps do you take?"
      }
    ],

    aptitude: [
      {
        question:
          "If you have 8 balls and one is heavier than the rest, how do you find the heavier ball in 2 weighings?"
      },
      {
        question:
          "What is the next number in the sequence: 2, 6, 12, 20, 30, ___?"
      },
      {
        question:
          "A train travels at 60 km/h and covers a distance of 180 km. How long does it take?"
      },
      {
        question:
          "If 5 people can paint 5 houses in 5 days, how long will it take 10 people to paint 10 houses?"
      },
      {
        question:
          "What is the angle between the hour and minute hands at 3:15?"
      }
    ],

    coding: [
      {
        question:
          "Write a function to reverse a linked list."
      },
      {
        question:
          "Implement a binary search algorithm."
      },
      {
        question:
          "Write a function to check if a string is a palindrome."
      },
      {
        question:
          "Implement a queue using two stacks."
      },
      {
        question:
          "Write a function to find the intersection of two arrays."
      }
    ]
  };

  return questions[type] || questions.technical;
}

// ============================================================
// Explicit Start Interview
// ============================================================
function startInterview() {

  const candSelect =
    document.getElementById("candidate-select");

  const candidateId =
    candSelect?.value;

  if (!candidateId) {
    alert(
      "Please select a candidate from the dropdown first."
    );
    return;
  }

  activeCandidateId = candidateId;

  const cand =
    candidatesList.find(
      c => String(c.id) === String(candidateId)
    );

  activeCandidateName =
    cand?.name || "Candidate";

  isInterviewActive = true;
  interviewCompleted = false;
  finalInterviewScore = 0;
  chatHistory = [];

  currentQuestion =
    "Could you briefly introduce your technical background?";

  questionNumber = 1;
  totalQuestions = 5;
  answerScores = [];

  if (candSelect) {
    candSelect.disabled = true;
  }

  const startBtn =
    document.getElementById("start-interview-btn");

  if (startBtn) {
    startBtn.disabled = true;
  }

  const endBtn =
    document.getElementById("end-interview-btn");

  if (endBtn) {
    endBtn.disabled = false;
    endBtn.style.color = "#ef4444";
    endBtn.style.cursor = "pointer";
  }

  const sessionBadge =
    document.getElementById("session-badge");

  if (sessionBadge) {
    sessionBadge.textContent = "Active Session";
    sessionBadge.style.backgroundColor =
      "var(--primary-light)";
    sessionBadge.style.color =
      "var(--primary-color)";
  }

  const header =
    document.getElementById("sim-candidate-header");

  if (header) {
    header.textContent =
      `Candidate: ${activeCandidateName}`;
  }

  const chatInput =
    document.getElementById("chat-input");

  const sendBtn =
    document.getElementById("send-msg-btn");

  if (chatInput) {
    chatInput.disabled = false;
    chatInput.placeholder =
      "Type candidate response or answer notes...";
    chatInput.focus();
  }

  if (sendBtn) {
    sendBtn.disabled = false;
  }

  const chatBox =
    document.getElementById("chat-box");

  if (chatBox) {
    chatBox.innerHTML = "";
  }

  appendMsg(
    "ai",
    `Hello ${activeCandidateName}, I'm your AI interviewer today. Let's begin the interview simulation.\n\n📝 ${currentQuestion}`
  );
}

// ============================================================
// Explicit End Interview
// ============================================================
function endInterview() {

  if (!isInterviewActive) return;

  isInterviewActive = false;
  interviewCompleted = true;

  const startBtn =
    document.getElementById("start-interview-btn");

  if (startBtn) {
    startBtn.disabled = false;
  }

  const candSelect =
    document.getElementById("candidate-select");

  if (candSelect) {
    candSelect.disabled = false;
  }

  const endBtn =
    document.getElementById("end-interview-btn");

  if (endBtn) {
    endBtn.disabled = true;
    endBtn.style.color = "var(--text-muted)";
    endBtn.style.cursor = "not-allowed";
  }

  const chatInput =
    document.getElementById("chat-input");

  const sendBtn =
    document.getElementById("send-msg-btn");

  if (chatInput) {
    chatInput.disabled = true;
    chatInput.value = "";
    chatInput.placeholder =
      "Interview concluded. Select a candidate and click Start to begin.";
  }

  if (sendBtn) {
    sendBtn.disabled = true;
  }

  const sessionBadge =
    document.getElementById("session-badge");

  if (sessionBadge) {
    sessionBadge.textContent =
      "Session Concluded";

    sessionBadge.style.backgroundColor =
      "var(--bg-subtle)";

    sessionBadge.style.color =
      "var(--text-muted)";
  }

  if (answerScores.length > 0) {

    finalInterviewScore =
      answerScores.reduce(
        (sum, score) => sum + score,
        0
      ) / answerScores.length;

    displayFinalScoreToCandidate(
      finalInterviewScore
    );

    displayInterviewerRecommendation(
      finalInterviewScore
    );

  } else {

    appendMsg(
      "ai",
      `🏁 The interview session with ${activeCandidateName} has ended and conversation logs are synced to ATS.`
    );
  }
}

// ============================================================
// Display Final Score to Candidate
// ============================================================
function displayFinalScoreToCandidate(finalScore) {

  let scoreMessage =
    `🏁 **Interview Completed!**\n\n`;

  scoreMessage +=
    `📊 **Final Score: ${Math.round(finalScore)}/100**\n`;

  scoreMessage +=
    `📝 Questions Answered: ${answerScores.length}/${totalQuestions}\n\n`;
  
  if (answerScores.length > 0) {

    scoreMessage +=
      `**Score Breakdown:**\n`;

    answerScores.forEach(
      (score, index) => {

        const questionText =
          chatHistory[index]?.question ||
          `Question ${index + 1}`;

        const shortQuestion =
          questionText.length > 50
            ? questionText.substring(0, 50) + "..."
            : questionText;

        let emoji =
          score >= 70
            ? "✅"
            : score >= 40
              ? "⚠️"
              : "❌";

        scoreMessage +=
          `${emoji} Q${index + 1}: ${Math.round(score)}/100 - ${shortQuestion}\n`;
      }
    );
  }
  
  scoreMessage +=
    `\n📌 Your interview has been completed. The hiring team will review your responses and get back to you shortly.`;

  appendMsg(
    "ai",
    scoreMessage
  );
}

// ============================================================
// Display Interviewer Recommendation
// ============================================================
function displayInterviewerRecommendation(finalScore) {

  const recommendation =
    getAIRecommendation(finalScore);
  
  let panelHtml = `
    <div style="background: #f8fafc; border: 2px solid #3b82f6; border-radius: 8px; padding: 16px; margin: 12px 0;">
      <h4 style="margin: 0 0 8px 0; color: #1e293b;">📋 Interviewer Assessment</h4>
      <div style="font-size: 14px; color: #334155;">
        <p style="margin: 4px 0;"><strong>Candidate:</strong> ${activeCandidateName}</p>
        <p style="margin: 4px 0;"><strong>Final Score:</strong> ${Math.round(finalScore)}/100</p>
        <p style="margin: 4px 0;"><strong>Questions Answered:</strong> ${answerScores.length}/${totalQuestions}</p>
        <hr style="border: 1px solid #e2e8f0; margin: 8px 0;">
        <p style="margin: 4px 0; font-weight: bold; color: #1e293b;">${recommendation.icon} Recommendation: ${recommendation.recommendation}</p>
        <p style="margin: 4px 0; color: #475569;">📌 ${recommendation.reason}</p>
        <hr style="border: 1px solid #e2e8f0; margin: 8px 0;">
        <p style="margin: 4px 0; font-size: 12px; color: #64748b;">💡 Suggested Action: ${recommendation.action}</p>
        <div style="margin-top: 8px;">
          <span style="display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; background: ${finalScore >= 60 ? '#dcfce7' : finalScore >= 40 ? '#fef3c7' : '#fee2e2'}; color: ${finalScore >= 60 ? '#166534' : finalScore >= 40 ? '#92400e' : '#991b1b'};">
            ${finalScore >= 60 ? '✅ Proceed to Shortlist' : finalScore >= 40 ? '📅 Schedule Follow-up' : '❌ Reject'}
          </span>
        </div>
      </div>
    </div>
  `;
  
  const panel =
    document.getElementById("interviewer-panel");

  if (panel) {
    panel.innerHTML = panelHtml;
    panel.style.display = 'block';
  }
  
  highlightRecommendedButton(
    recommendation.status
  );
}

// ============================================================
// Highlight Recommended Button
// ============================================================
function highlightRecommendedButton(recommendedStatus) {

  const scheduleBtn =
    document.getElementById("schedule-btn");

  const shortlistBtn =
    document.getElementById("shortlist-btn");

  const rejectBtn =
    document.getElementById("reject-btn");
  
  [
    scheduleBtn,
    shortlistBtn,
    rejectBtn
  ].forEach(btn => {

    if (btn) {
      btn.style.opacity = "0.6";
      btn.style.border = "1px solid #ddd";
      btn.style.transform = "scale(1)";
    }
  });
  
  let recommendedBtn = null;

  if (recommendedStatus === 'Shortlist') {
    recommendedBtn = shortlistBtn;
  } else if (recommendedStatus === 'Schedule') {
    recommendedBtn = scheduleBtn;
  } else if (recommendedStatus === 'Reject') {
    recommendedBtn = rejectBtn;
  }
  
  if (recommendedBtn) {

    recommendedBtn.style.opacity = "1";
    recommendedBtn.style.border =
      "3px solid #3b82f6";

    recommendedBtn.style.transform =
      "scale(1.05)";

    recommendedBtn.style.boxShadow =
      "0 4px 12px rgba(59, 130, 246, 0.3)";
  }
}

// ============================================================
// Display Current Score
// ============================================================
function displayCurrentScore() {

  if (answerScores.length === 0) {

    appendMsg(
      "ai",
      "📊 You haven't answered any questions yet. Please provide answers to get scored."
    );

    return;
  }
  
  const currentAverage =
    answerScores.reduce(
      (sum, score) => sum + score,
      0
    ) / answerScores.length;

  let scoreMessage =
    `📊 **Current Progress Score: ${Math.round(currentAverage)}/100**\n`;

  scoreMessage +=
    `📝 Questions Answered: ${answerScores.length}/${totalQuestions}\n\n`;
  
  scoreMessage +=
    `**Your scores so far:**\n`;

  answerScores.forEach(
    (score, index) => {

      const questionText =
        chatHistory[index]?.question ||
        `Question ${index + 1}`;

      const shortQuestion =
        questionText.length > 40
          ? questionText.substring(0, 40) + "..."
          : questionText;

      let emoji =
        score >= 70
          ? "✅"
          : score >= 40
            ? "⚠️"
            : "❌";

      scoreMessage +=
        `${emoji} Q${index + 1}: ${Math.round(score)}/100\n`;
    }
  );
  
  let rating = "";

  if (currentAverage >= 80) {
    rating =
      "🌟 Excellent performance so far! Keep it up!";
  } else if (currentAverage >= 60) {
    rating =
      "👍 Good performance. Keep going!";
  } else if (currentAverage >= 40) {
    rating =
      "📚 Average performance. Try to provide more technical details in your answers.";
  } else {
    rating =
      "📖 Your answers need more technical depth. Focus on explaining your thought process clearly.";
  }
  
  scoreMessage +=
    `\n${rating}`;
  
  appendMsg(
    "ai",
    scoreMessage
  );
}

// ============================================================
// Chat Simulation
// ============================================================
async function sendChatMessage() {

  const input =
    document.getElementById("chat-input");

  if (
    !input ||
    !input.value.trim() ||
    !isInterviewActive ||
    !activeCandidateId
  ) {
    return;
  }

  const userText =
    input.value.trim();

  // Check if user is asking for score
  const lowerText =
    userText.toLowerCase();

  const words =
    lowerText.split(/\s+/);

  const isScoreQuestion = (
    words.length <= 8 &&
    (
      lowerText.includes('what is my score') ||
      lowerText.includes('what\'s my score') ||
      lowerText.includes('show my score') ||
      lowerText.includes('my score') ||
      lowerText.includes('my grade') ||
      lowerText.includes('my rating') ||
      lowerText.includes('how am i doing') ||
      lowerText.includes('how am i performing') ||
      lowerText.includes('what is my grade') ||
      lowerText.includes('what\'s my grade') ||
      lowerText.includes('what is my rating') ||
      lowerText.includes('what\'s my rating') ||
      lowerText.includes('show progress') ||
      lowerText.includes('current score') ||
      lowerText.includes('progress report') ||
      lowerText === 'score' ||
      lowerText === 'grade' ||
      lowerText === 'rating'
    )
  );
  
  if (isScoreQuestion) {

    displayCurrentScore();

    input.value = "";
    input.disabled = false;

    document
      .getElementById("send-msg-btn")
      ?.removeAttribute("disabled");

    input.focus();

    return;
  }

  // Validate technical answer
  const validation =
    validateTechnicalAnswer(
      userText,
      currentQuestion
    );
  
  if (!validation.valid) {

    const example =
      getExampleAnswer(currentQuestion);

    appendMsg(
      "ai",
      `${validation.reason}${example}\n\n📝 ${currentQuestion}`
    );

    input.disabled = false;

    document
      .getElementById("send-msg-btn")
      ?.removeAttribute("disabled");

    input.focus();

    return;
  }

  // Calculate score
  const frontendScore =
    calculateAnswerScore(
      userText,
      currentQuestion
    );
  
  appendMsg(
    "user",
    userText
  );

  input.value = "";
  input.disabled = true;

  document
    .getElementById("send-msg-btn")
    ?.setAttribute("disabled", "true");

  const answeredQuestion =
    currentQuestion;

  const answeredQuestionNumber =
    questionNumber;

  try {

    const simFn =
      api.simulateInterviewTurn ||
      api.simulateInterviewChat;

    const data =
      await simFn(
        activeCandidateId,
        userText,
        chatHistory,
        answeredQuestion,
        answeredQuestionNumber,
        totalQuestions
      );

    console.log(
      "Interview response:",
      data
    );

    let reply =
      data?.ai_response ||
      data?.reply ||
      "Please provide more details about your answer.";

    let finalAnswerScore =
      frontendScore;

    if (
      data?.answer_score &&
      data.answer_score > 0
    ) {
      finalAnswerScore =
        data.answer_score;
    }

    chatHistory.push({
      user: userText,
      ai: reply,
      question: answeredQuestion,
      question_number:
        answeredQuestionNumber,
      score: finalAnswerScore,
      is_valid:
        data?.is_valid !== false
    });

    answerScores.push(
      finalAnswerScore
    );

    if (
      data?.needs_retry === true ||
      data?.is_valid === false
    ) {

      currentQuestion =
        data?.current_question ||
        answeredQuestion;

      console.log(
        "Invalid answer. Same question:",
        currentQuestion
      );
      
      answerScores.pop();
      chatHistory.pop();
      
      if (!reply.includes(currentQuestion)) {

        reply +=
          `\n\n🔄 Let's try that again.\n\n📝 ${currentQuestion}`;
      }

      appendMsg(
        "ai",
        reply
      );

    } else {

      questionNumber++;

      let newQuestion =
        data?.next_question?.trim();

      if (
        !newQuestion ||
        newQuestion.toLowerCase() ===
          answeredQuestion.toLowerCase()
      ) {

        const fallbackQuestions = [
          "How did you design and connect the REST APIs between your frontend and FastAPI backend?",
          "How did you handle errors and invalid input in your application?",
          "How would you improve the scalability and performance of your recruitment system?",
          "How did you test the different components of your application?",
          "How did you implement authentication and security in your project?"
        ];

        newQuestion =
          fallbackQuestions[
            (questionNumber - 2) %
            fallbackQuestions.length
          ];
      }

      currentQuestion =
        newQuestion;

      console.log(
        "NEW QUESTION:",
        currentQuestion
      );

      const aiReplyHasQuestion =
        reply.includes(currentQuestion) ||
        reply.includes('📝') ||
        reply.toLowerCase().includes('next question');

      if (
        !aiReplyHasQuestion &&
        questionNumber <= totalQuestions
      ) {

        if (
          reply.includes(
            'move to the next question'
          ) &&
          !reply.includes(currentQuestion)
        ) {

          appendMsg(
            "ai",
            reply
          );

          appendMsg(
            "ai",
            `📝 ${currentQuestion}`
          );

        } else {

          appendMsg(
            "ai",
            reply
          );

          appendMsg(
            "ai",
            `📝 ${currentQuestion}`
          );
        }

      } else {

        appendMsg(
          "ai",
          reply
        );
      }

      // ========================================================
      // Interview Completed After All 5 Questions
      // ========================================================
      if (questionNumber > totalQuestions) {

        isInterviewActive = false;
        interviewCompleted = true;

        finalInterviewScore =
          answerScores.reduce(
            (sum, score) => sum + score,
            0
          ) / answerScores.length;
        
        displayFinalScoreToCandidate(
          finalInterviewScore
        );

        displayInterviewerRecommendation(
          finalInterviewScore
        );

        // ========================================================
        // Mark Interview Assistant as PENDING
        // This is NOT Voice Screening.
        // ========================================================
        try {

          const finalResultResponse =
            await fetch(
              "http://127.0.0.1:8000/interview/final-result",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body: JSON.stringify({
                  candidate_id:
                    activeCandidateId,

                  final_score:
                    Math.round(
                      finalInterviewScore
                    )
                })
              }
            );

          const finalResultData =
            await finalResultResponse.json();

          if (!finalResultResponse.ok) {

            console.error(
              "Failed to save Interview Assistant final result:",
              finalResultData
            );

          } else {

            console.log(
              "Interview Assistant final result saved:",
              finalResultData
            );

            const candidate =
              candidatesList.find(
                c =>
                  String(c.id) ===
                  String(activeCandidateId)
              );

            if (candidate) {

              candidate.status =
                "pending";

              renderAtsCards(
                candidatesList
              );
            }
          }

        } catch (finalResultError) {

          console.error(
            "Error saving Interview Assistant final result:",
            finalResultError
          );
        }

        input.disabled = true;

        document
          .getElementById("send-msg-btn")
          ?.setAttribute(
            "disabled",
            "true"
          );
         
        const sessionBadge =
          document.getElementById(
            "session-badge"
          );

        if (sessionBadge) {

          sessionBadge.textContent =
            "Interview Completed";

          sessionBadge.style.backgroundColor =
            "var(--bg-subtle)";

          sessionBadge.style.color =
            "var(--text-muted)";
        }

        const endBtn =
          document.getElementById(
            "end-interview-btn"
          );

        if (endBtn) {

          endBtn.disabled = true;

          endBtn.style.color =
            "var(--text-muted)";

          endBtn.style.cursor =
            "not-allowed";
        }

        return;
      }
    }

  } catch (err) {

    console.error(
      "Simulation error:",
      err
    );

    appendMsg(
      "ai",
      "I couldn't process that response. Please try answering the current question again."
    );

  } finally {

    if (isInterviewActive) {

      input.disabled = false;

      document
        .getElementById("send-msg-btn")
        ?.removeAttribute("disabled");

      input.focus();
    }
  }
}

// ============================================================
// Append Chat Message
// ============================================================
function appendMsg(sender, text) {

  const chatBox =
    document.getElementById("chat-box");

  if (!chatBox) return;

  const bubble =
    document.createElement("div");

  bubble.className =
    `chat-msg ${sender}`;

  bubble.style.whiteSpace =
    "pre-wrap";

  bubble.textContent =
    text;

  chatBox.appendChild(
    bubble
  );

  chatBox.scrollTop =
    chatBox.scrollHeight;
}

// ============================================================
// ATS Status Updates
// ============================================================
function renderAtsCards(candidates) {

  const container =
    document.getElementById(
      "ats-candidates-container"
    );

  if (!container) return;

  if (
    !candidates ||
    candidates.length === 0
  ) {

    container.innerHTML =
      `<span style="font-size:12px; color:var(--text-muted);">
        No candidates in ATS pipeline
      </span>`;

    return;
  }

  container.innerHTML =
    candidates
      .slice(0, 2)
      .map(c => {

        const initials =
          (c.name || "C")
            .split(" ")
            .map(n => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();

        const statusText =
          c.status || "In review";

        let statusColor =
          "#6b7280";

        if (
          statusText.toLowerCase() ===
          'shortlisted'
        ) {
          statusColor =
            "#22c55e";

        } else if (
          statusText.toLowerCase() ===
          'scheduled'
        ) {
          statusColor =
            "#3b82f6";

        } else if (
          statusText.toLowerCase() ===
          'rejected'
        ) {
          statusColor =
            "#ef4444";
        }

        return `
          <div class="ats-card">
            <div class="ats-avatar">
              ${escapeHtml(initials)}
            </div>

            <div>
              <strong
                class="ats-name"
                style="font-size:13px; display:block;">
                ${escapeHtml(
                  c.name || 'Candidate'
                )}
              </strong>

              <span
                style="font-size:11px; color:${statusColor};">
                ${escapeHtml(statusText)}
              </span>
            </div>
          </div>
        `;

      })
      .join("");
}

// ============================================================
// Update Candidate Pipeline Status
// ============================================================
async function updateCandidatePipelineStatus(newStatus) {

  const targetId =
    activeCandidateId ||
    document.getElementById(
      "candidate-select"
    )?.value;

  if (!targetId) {

    alert(
      "Please select a candidate first."
    );

    return;
  }

  let confirmMessage =
    `Are you sure you want to mark ${activeCandidateName} as "${newStatus}"?`;
   
  if (
    interviewCompleted &&
    finalInterviewScore > 0
  ) {

    const recommendation =
      getAIRecommendation(
        finalInterviewScore
      );

    confirmMessage +=
      `\n\n📊 Final Score: ${Math.round(finalInterviewScore)}/100`;

    confirmMessage +=
      `\n🤖 AI Recommendation: ${recommendation.recommendation}`;

    confirmMessage +=
      `\n\n⚠️ This will update the candidate's status in the ATS system.`;
  }
   
  if (!confirm(confirmMessage)) {
    return;
  }
 
  try {

    await api.updateCandidateStatus(
      targetId,
      newStatus
    );

    const cand =
      candidatesList.find(
        c =>
          String(c.id) ===
          String(targetId)
      );

    if (cand) {

      cand.status =
        newStatus;

      renderAtsCards(
        candidatesList
      );
    }

    updateAtsButtons(
      newStatus
    );

    alert(
      `✅ Candidate ${activeCandidateName} has been ${newStatus}!`
    );

  } catch (err) {

    alert(
      "❌ Failed to update status: " +
      (err.message || "Server error")
    );
  }
}

window.updateCandidatePipelineStatus =
  updateCandidatePipelineStatus;