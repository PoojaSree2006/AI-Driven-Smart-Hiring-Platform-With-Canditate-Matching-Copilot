/* ============================================================
   frontend-html/js/api.js
   Centralized API Integration & Communication Module
   AI Recruitment Copilot
   ============================================================ */

const API_BASE_URL = "http://127.0.0.1:8000";

/**
 * Core Network Fetch Wrapper with Response Parsing & Global Error Handling
 * @param {string} endpoint - The relative endpoint path (e.g. "/candidates")
 * @param {object} options - Fetch options object (method, headers, body, etc.)
 * @returns {Promise<any>}
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  
  const defaultHeaders = {
    "Accept": "application/json",
  };

  if (options.body && !(options.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData && (errorData.detail || errorData.message)) {
          errorMessage = errorData.detail || errorData.message;
        }
      } catch (e) {
        // Response was not JSON
      }
      throw new Error(errorMessage);
    }

    // Handle empty 204 No Content responses
    if (response.status === 204) {
      return { success: true };
    }

    return await response.json();
  } catch (error) {
    console.error(`[API Call Failed] ${config.method || 'GET'} ${url}:`, error.message || error);
    throw error;
  }
}

const api = {
  // ==========================================================
  // 1. CANDIDATE MANAGEMENT ENDPOINTS
  // ==========================================================

  /**
   * Retrieves all candidate records stored in the database.
   * @returns {Promise<Array>} List of candidate objects
   */
  async getCandidates() {
    try {
      return await apiFetch("/candidates");
    } catch (err) {
      console.error("api.getCandidates failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves full profile details for a specific candidate.
   * @param {number|string} candidateId 
   * @returns {Promise<object>} Candidate profile details
   */
  async getCandidateById(candidateId) {
    if (!candidateId) throw new Error("candidateId is required for getCandidateById");
    try {
      return await apiFetch(`/candidate/${candidateId}`);
    } catch (err) {
      console.error(`api.getCandidateById failed for ID ${candidateId}:`, err);
      throw err;
    }
  },

  /**
   * Updates a candidate's status in the hiring pipeline.
   * @param {number|string} candidateId 
   * @param {string} status - New status (e.g., 'SHORTLISTED', 'SCHEDULED', 'REJECTED')
   * @returns {Promise<object>} Updated candidate record
   */
  async updateCandidateStatus(candidateId, status) {
    if (!candidateId || !status) {
      throw new Error("Both candidateId and status are required for updateCandidateStatus");
    }
    try {
      return await apiFetch(`/candidates/${candidateId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: status })
      });
    } catch (err) {
      console.error(`api.updateCandidateStatus failed for ID ${candidateId}:`, err);
      throw err;
    }
  },

  /**
   * Updates or appends interview notes for a candidate.
   * @param {number|string} candidateId 
   * @param {string} notes 
   * @returns {Promise<object>}
   */
  async updateCandidateNotes(candidateId, notes) {
    if (!candidateId) throw new Error("candidateId is required for updateCandidateNotes");
    try {
      return await apiFetch(`/candidates/${candidateId}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ interview_notes: notes })
      });
    } catch (err) {
      console.error(`api.updateCandidateNotes failed for ID ${candidateId}:`, err);
      throw err;
    }
  },

  /**
   * Deletes a candidate record from the database.
   * @param {number|string} candidateId 
   * @returns {Promise<object>}
   */
  async deleteCandidate(candidateId) {
    if (!candidateId) throw new Error("candidateId is required for deleteCandidate");
    try {
      return await apiFetch(`/candidate/${candidateId}`, {
        method: "DELETE"
      });
    } catch (err) {
      console.error(`api.deleteCandidate failed for ID ${candidateId}:`, err);
      throw err;
    }
  },

  // ==========================================================
  // 2. RESUME UPLOAD & PARSING ENDPOINTS
  // ==========================================================

  /**
   * Uploads a resume file (.pdf or .docx) for server-side parsing.
   * @param {File} file 
   * @returns {Promise<object>} Parsed candidate data
   */
  async uploadResume(file) {
    if (!file) throw new Error("File object is required for uploadResume");
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      return await apiFetch("/upload", {
        method: "POST",
        body: formData
      });
    } catch (err) {
      console.error("api.uploadResume failed:", err);
      throw err;
    }
  },

  // ==========================================================
  // 3. DASHBOARD & METRICS ENDPOINTS
  // ==========================================================

  /**
   * Retrieves aggregated statistics for dashboard summary widgets.
   * @returns {Promise<object|null>} Stats payload or null if unavailable
   */
  async getDashboardStats() {
    try {
      return await apiFetch("/dashboard/stats");
    } catch (err) {
      console.warn("api.getDashboardStats unavailable; fallback mode active:", err);
      return null;
    }
  },

  // ==========================================================
  // 4. JOB POSTINGS & SKILL MATCHING ENDPOINTS
  // ==========================================================

  /**
   * Retrieves all active job descriptions and postings.
   * @returns {Promise<Array>} List of job objects
   */
  async getJobs() {
    try {
      return await apiFetch("/jobs");
    } catch (err) {
      console.error("api.getJobs failed:", err);
      return [];
    }
  },
    /**
   * Creates a new job posting.
   */
  async createJob(jobData) {
    if (!jobData || !jobData.title) {
      throw new Error("Job title is required");
    }

    try {
      return await apiFetch("/jobs", {
        method: "POST",
        body: JSON.stringify(jobData)
      });
    } catch (err) {
      console.error("api.createJob failed:", err);
      throw err;
    }
  },

  /**
   * Deletes a job posting.
   */
  async deleteJob(jobId) {
    if (!jobId) {
      throw new Error("jobId is required for deleteJob");
    }

    try {
      return await apiFetch(`/job/${jobId}`, {
        method: "DELETE"
      });
    } catch (err) {
      console.error(`api.deleteJob failed for Job ID ${jobId}:`, err);
      throw err;
    }
  },

  /**
   * Retrieves a specific job posting by ID.
   * @param {number|string} jobId 
   * @returns {Promise<object>}
   */
  async getJobById(jobId) {
    if (!jobId) throw new Error("jobId is required for getJobById");
    try {
      return await apiFetch(`/job/${jobId}`);
    } catch (err) {
      console.error(`api.getJobById failed for ID ${jobId}:`, err);
      throw err;
    }
  },
  

  /**
   * Computes match fit scores between all candidates and a designated Job ID.
   * @param {number|string} jobId 
   * @returns {Promise<Array>} Candidates sorted by match score
   */
  async matchCandidates(jobId) {
    if (!jobId) throw new Error("jobId is required for matchCandidates");
    try {
      return await apiFetch(`/matching/${jobId}`);
    } catch (err) {
      console.error(`api.matchCandidates failed for Job ID ${jobId}:`, err);
      throw err;
    }
  },

  // ==========================================================
  // 5. AI INTERVIEW ASSISTANT ENDPOINTS
  // ==========================================================

  /**
   * Generates tailored interview questions using Gemini API.
   * @param {number|string} jobId 
   * @param {string} [questionType="Technical Skills"] 
   * @param {number|string|null} [candidateId=null] 
   * @returns {Promise<object>} Generated questions payload
   */
  async generateInterviewQuestions(jobId, questionType = "Technical Skills", candidateId = null) {
    try {
      return await apiFetch("/interview/generate-questions", {
        method: "POST",
        body: JSON.stringify({
          job_id: jobId,
          candidate_id: candidateId,
          question_type: questionType
        })
      });
    } catch (err) {
      console.error("api.generateInterviewQuestions failed:", err);
      throw err;
    }
  },

  /**
   * Submits user response to AI and receives evaluation and follow-up prompts.
   * @param {number|string} candidateId 
   * @param {string} userResponse 
   * @param {Array} [history=[]] 
   * @returns {Promise<object>} Evaluation and reply turn
   */
   async simulateInterviewTurn(
  candidateId,
  userResponse,
  history = [],
  currentQuestion = "",
  questionNumber = 1,
  totalQuestions = 5
) {
  try {
    return await apiFetch("/interview/simulate", {
      method: "POST",
      body: JSON.stringify({
        candidate_id: candidateId,
        user_response: userResponse,
        current_question: currentQuestion,
        question_number: questionNumber,
        total_questions: totalQuestions,
        history: history
      })
    });
  } catch (err) {
    console.error("api.simulateInterviewTurn failed:", err);
    throw err;
  }
},
  // ==========================================================
// 6. ANALYTICS ENDPOINT
// ==========================================================

/**
 * Retrieves analytics data for the recruitment dashboard.
 * @returns {Promise<object>} Analytics payload
 */
async getAnalytics() {
    try {
        return await apiFetch("/analytics");
    } catch (err) {
        console.error("api.getAnalytics failed:", err);
        throw err;
    }
},
  // ==========================================================
  // 7. HEALTH & SYSTEM DIAGNOSTICS
  // ==========================================================

  /**
   * Checks backend system connectivity and health status.
   * @returns {Promise<boolean>} True if server responds successfully
   */
  async checkHealth() {
    try {
      const res = await apiFetch("/");
      return !!res;
    } catch {
      return false;
    }
  }
};