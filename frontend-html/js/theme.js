function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  updateToggleLabel();
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateToggleLabel();
}

function updateToggleLabel() {
  const toggleBtn = document.getElementById('theme-toggle');
  if (!toggleBtn) return;

  const isDark = document.body.classList.contains('dark-mode');
  toggleBtn.innerHTML = isDark ? '☀️ Light mode' : '🌙 Dark mode';
}

document.addEventListener('DOMContentLoaded', initTheme);
