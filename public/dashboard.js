
const logoutBtn = document.getElementById('logoutBtn');
const welcomeText = document.getElementById('welcomeText');
const profileName = document.getElementById('profileName');
const profileEmail = document.getElementById('profileEmail');
const profileOrganization = document.getElementById('profileOrganization');

const token = localStorage.getItem('scheduler_token');
const userRaw = localStorage.getItem('scheduler_user');

if (!token || !userRaw) {
  window.location.href = '/login.html';
} else {
  const user = JSON.parse(userRaw);
  welcomeText.textContent = `Բարի գալուստ, ${user.full_name}`;
  profileName.textContent = user.full_name || '-';
  profileEmail.textContent = user.email || '-';
  profileOrganization.textContent = user.organization_name || 'Նշված չէ';
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('scheduler_token');
  localStorage.removeItem('scheduler_user');
  window.location.href = '/login.html';
});
