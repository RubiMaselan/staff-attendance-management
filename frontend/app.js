const API = 'http://localhost:3000/api';

function getToken() { return localStorage.getItem('token'); }
function getUser() { return JSON.parse(localStorage.getItem('user') || 'null'); }

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  globalThis.location.href = 'index.html';
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken(),
      ...opts.headers
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) { logout(); return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function statusBadge(s) {
  const map = {
    present: '✅ Present', late: '🕐 Late', absent: '❌ Absent',
    'half-day': '⏰ Half-day', pending: '⏳ Pending',
    approved: '✅ Approved', rejected: '❌ Rejected'
  };
  return `<span class="badge badge-${s?.replace(' ','-') || 'absent'}">${map[s] || s || '—'}</span>`;
}

function typeBadge(t) {
  return `<span class="badge badge-${t}">${t || '—'}</span>`;
}

function formatTime(t) { return t ? t.slice(0,5) : '—'; }
function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showAlert(id, msg, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const DOT_MAP = { present: '🟢', late: '🟡', absent: '🔴', 'half-day': '🔵' };

function renderDayCell(d, month, year, statusMap, today) {
  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const status = statusMap[dateStr] || '';
  const isToday = dateStr === today;
  const isFuture = dateStr > today;
  const isWeekend = [0,6].includes(new Date(`${dateStr}T00:00:00`).getDay());
  const hasStatus = status && !isFuture;

  const cls = [
    'cal-day',
    hasStatus ? status : '',
    isToday ? 'today' : '',
    isWeekend && !status ? 'weekend' : ''
  ].filter(Boolean).join(' ');

  const title = hasStatus ? `${dateStr}: ${status}` : dateStr;
  const dot = DOT_MAP[status] || '';

  return `<div class="${cls}" title="${title}">
    <span class="cal-day-num">${d}</span>
    ${hasStatus ? `<span class="cal-dot">${dot}</span>` : ''}
  </div>`;
}

function renderCalendar(containerId, year, month, records) {
  const statusMap = Object.fromEntries(records.map(r => [r.date, r.status]));
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const dayNames = DAYS.map(d => `<div class="cal-day-name">${d}</div>`).join('');
  const emptyCells = '<div class="cal-day empty"></div>'.repeat(firstDay);

  let dayCells = '';
  for (let d = 1; d <= daysInMonth; d++) {
    dayCells += renderDayCell(d, month, year, statusMap, today);
  }

  document.getElementById(containerId).innerHTML = `
    <div class="cal-grid">${dayNames}${emptyCells}${dayCells}</div>
    <div class="cal-legend">
      <div class="legend-item"><div class="legend-dot present"></div>Present</div>
      <div class="legend-item"><div class="legend-dot late"></div>Late</div>
      <div class="legend-item"><div class="legend-dot absent"></div>Absent</div>
      <div class="legend-item"><div class="legend-dot half-day"></div>Half-day</div>
    </div>`;
}
