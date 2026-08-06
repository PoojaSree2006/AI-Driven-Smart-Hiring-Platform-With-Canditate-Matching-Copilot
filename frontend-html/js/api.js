/* ==============================
   api.js
   MODIFIED — Milestone 2: added job posting + matching/skill-gap methods.
   Everything from Milestone 1 (upload, candidates, dashboard, analytics)
   is unchanged.
   ============================== */

const API_BASE_URL = "http://localhost:8000";

async function handleResponse(res) {
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  if (!res.ok) {
    const message = (data && data.detail) || `Request failed with status ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

const api = {
  // ---------- Milestone 1: unchanged ----------
  uploadResume(file) {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`${API_BASE_URL}/upload`, { method: "POST", body: formData }).then(handleResponse);
  },

  uploadMultipleResumes(files) {
    const formData = new FormData();

    for (const file of files) {
      formData.append("files", file);
    }

    return fetch(`${API_BASE_URL}/upload-multiple`, {
      method: "POST",
      body: formData,
    }).then(handleResponse);
  },
  getCandidates(search) {
    const url = new URL(`${API_BASE_URL}/candidates`);
    if (search) url.searchParams.set("search", search);
    return fetch(url).then(handleResponse);
  },

  getCandidate(id) {
    return fetch(`${API_BASE_URL}/candidate/${id}`).then(handleResponse);
  },

  deleteCandidate(id) {
    return fetch(`${API_BASE_URL}/candidate/${id}`, { method: "DELETE" }).then(handleResponse);
  },

  getDashboardStats() {
    return fetch(`${API_BASE_URL}/dashboard/stats`).then(handleResponse);
  },

  getAnalytics() {
    return fetch(`${API_BASE_URL}/analytics`).then(handleResponse);
  },

  // ---------- Milestone 2: NEW ----------
  createJob(payload) {
    return fetch(`${API_BASE_URL}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handleResponse);
  },

  getJobs() {
    return fetch(`${API_BASE_URL}/jobs`).then(handleResponse);
  },

  getJob(id) {
    return fetch(`${API_BASE_URL}/job/${id}`).then(handleResponse);
  },

  deleteJob(id) {
    return fetch(`${API_BASE_URL}/job/${id}`, { method: "DELETE" }).then(handleResponse);
  },

  matchCandidates(jobId) {
    return fetch(`${API_BASE_URL}/candidates/match/${jobId}`).then(handleResponse);
  },

  getSkillGap(candidateId, jobId) {
    return fetch(`${API_BASE_URL}/candidate/${candidateId}/skill-gap/${jobId}`).then(handleResponse);
  },
};