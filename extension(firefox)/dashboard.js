let allActivities = [];
let filteredActivities = [];
let renderedCount = 0;
const pageSize = 25;

const api = (typeof browser !== 'undefined') ? browser : chrome;

const rowsEl = document.getElementById('activityRows');
const emptyEl = document.getElementById('emptyState');
const summaryEl = document.getElementById('summaryText');
const searchInputEl = document.getElementById('searchInput');
const loadMoreBtnEl = document.getElementById('loadMoreBtn');
const refreshBtnEl = document.getElementById('refreshBtn');
const clearBtnEl = document.getElementById('clearBtn');
const exportBtnEl = document.getElementById('exportBtn');

document.addEventListener('DOMContentLoaded', () => {
  loadActivities();

  searchInputEl.addEventListener('input', onSearchChange);
  loadMoreBtnEl.addEventListener('click', renderNextPage);
  refreshBtnEl.addEventListener('click', loadActivities);
  clearBtnEl.addEventListener('click', clearAllActivities);
  exportBtnEl.addEventListener('click', exportCsv);
});

function loadActivities() {
  getActivities((activities) => {
    allActivities = activities;
    applyFilter(searchInputEl.value);
  });
}

function onSearchChange() {
  applyFilter(searchInputEl.value);
}

function applyFilter(rawTerm) {
  const term = (rawTerm || '').trim().toLowerCase();

  if (!term) {
    filteredActivities = allActivities.slice();
  } else {
    filteredActivities = allActivities.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const url = (item.url || '').toLowerCase();
      const search = (item.search || '').toLowerCase();
      return title.includes(term) || url.includes(term) || search.includes(term);
    });
  }

  renderedCount = 0;
  rowsEl.innerHTML = '';
  renderNextPage();
}

function renderNextPage() {
  const end = Math.min(renderedCount + pageSize, filteredActivities.length);

  for (let i = renderedCount; i < end; i++) {
    const item = filteredActivities[i];
    const tr = document.createElement('tr');

    tr.innerHTML = [
      `<td>${i + 1}</td>`,
      `<td>${escapeHtml(item.title || 'Unknown Page')}</td>`,
      `<td class="url">${escapeHtml(item.url || '')}</td>`,
      `<td class="search">${escapeHtml(item.search || '-')}</td>`
    ].join('');

    rowsEl.appendChild(tr);
  }

  renderedCount = end;
  updateUiState();
}

function updateUiState() {
  const hasAny = filteredActivities.length > 0;
  emptyEl.style.display = hasAny ? 'none' : 'block';

  if (!hasAny) {
    summaryEl.textContent = `No activities match your current filter.`;
  } else {
    summaryEl.textContent = `Showing ${renderedCount} of ${filteredActivities.length} activities (${allActivities.length} total stored).`;
  }

  loadMoreBtnEl.style.display = (renderedCount < filteredActivities.length) ? 'inline-block' : 'none';
}

function clearAllActivities() {
  const ok = window.confirm('Clear all saved activities from this browser?');
  if (!ok) return;

  setActivities([], () => {
    allActivities = [];
    applyFilter(searchInputEl.value);
  });
}

function exportCsv() {
  const rows = [
    ['index', 'title', 'url', 'search']
  ];

  filteredActivities.forEach((item, idx) => {
    rows.push([
      String(idx + 1),
      item.title || '',
      item.url || '',
      item.search || ''
    ]);
  });

  const csvText = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'family_web_monitor_activities.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function getActivities(onDone) {
  if (api.storage && api.storage.local && api.storage.local.get.length === 1) {
    api.storage.local.get({ activities: [] }).then((result) => {
      onDone(Array.isArray(result.activities) ? result.activities : []);
    }).catch(() => onDone([]));
    return;
  }

  api.storage.local.get({ activities: [] }, (result) => {
    onDone(Array.isArray(result.activities) ? result.activities : []);
  });
}

function setActivities(activities, onDone) {
  if (api.storage && api.storage.local && api.storage.local.set.length === 1) {
    api.storage.local.set({ activities }).then(onDone).catch(onDone);
    return;
  }

  api.storage.local.set({ activities }, onDone);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function csvEscape(value) {
  const v = String(value || '');
  if (/[",\n]/.test(v)) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}
