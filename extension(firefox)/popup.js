let allActivities = [];
let currentIndex = 0;
const itemsPerPage = 10;

// When the popup is opened, fetch the data
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get({ activities: [] }, (result) => {
    allActivities = result.activities || [];

    if (allActivities.length === 0) {
      document.getElementById('noData').style.display = 'block';
      document.getElementById('loadMore').style.display = 'none';
    } else {
      renderItems();
    }
  });

  // Attach click event to the Load More button
  document.getElementById('loadMore').addEventListener('click', renderItems);

  // Open the full dashboard in a new tab.
  document.getElementById('openDashboard').addEventListener('click', () => {
    const dashboardUrl = (typeof browser !== 'undefined' && browser.runtime)
      ? browser.runtime.getURL('dashboard.html')
      : chrome.runtime.getURL('dashboard.html');

    window.open(dashboardUrl, '_blank');
  });
});

// Function to draw the next 10 items
function renderItems() {
  const listDiv = document.getElementById('activityList');
  const endIndex = Math.min(currentIndex + itemsPerPage, allActivities.length);
  
  for (let i = currentIndex; i < endIndex; i++) {
    const item = allActivities[i];
    const div = document.createElement('div');
    div.className = 'activity';
    
    // Highlight searches in red with a magnifying glass
    let searchHtml = item.search ? `<div class="search">🔍 Searched: "${escapeHtml(item.search)}"</div>` : '';
    
    div.innerHTML = `
      <div class="title">${escapeHtml(item.title || 'Unknown Page')}</div>
      <div class="url">${escapeHtml(item.url)}</div>
      ${searchHtml}
    `;
    listDiv.appendChild(div);
  }
  
  currentIndex = endIndex; // Update our position in the array
  
  // Hide the "Load More" button if we've reached the end of the history
  if (currentIndex >= allActivities.length) {
    document.getElementById('loadMore').style.display = 'none';
  } else {
    document.getElementById('loadMore').style.display = 'block';
  }
}

// Simple HTML-escape to prevent breaking the popup layout
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
