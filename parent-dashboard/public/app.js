const PAGE_SIZE = 15;
let currentLimit = PAGE_SIZE;
const rowsEl = document.getElementById('rows');
const emptyEl = document.getElementById('empty');
const metaEl = document.getElementById('metaText');
const refreshBtn = document.getElementById('refreshBtn');
const clearBtn = document.getElementById('clearBtn');
const loadMoreBtn = document.getElementById('loadMoreBtn');
let ws;
let wsRetryTimer = null;

// Load the blocked list from local storage
const blockedDomains = new Set(JSON.parse(localStorage.getItem('savedBlockedSites')) || []);

refreshBtn.addEventListener('click', () => {
    currentLimit = PAGE_SIZE;
    loadActivities();
    fetchAIAnalysis(); // 🧠 Fetch new AI insights on refresh
});
clearBtn.addEventListener('click', clearActivities);
loadMoreBtn.addEventListener('click', () => {
    currentLimit += PAGE_SIZE;
    loadActivities();
});

// Initialize
connectWs();
renderBlockedSites();
loadActivities(); 
fetchAIAnalysis(); // 🧠 Fetch AI insights on initial load

// --- MASTER CONTROL LOGIC ---

function getDomainName(fullUrl) {
    try { return new URL(fullUrl).hostname; } catch(e) { return fullUrl; }
}

function sendWsCommand(type, domain) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: type, domain: domain }));
    } else {
        alert("Not connected to extension! Wait a second and try again.");
    }
}

function unblockDomain(domain) {
    blockedDomains.delete(domain);
    localStorage.setItem('savedBlockedSites', JSON.stringify([...blockedDomains]));
    sendWsCommand("UNBLOCK", domain);
    renderBlockedSites(); 
    loadActivities();
}

function blockDomain(domain) {
    blockedDomains.add(domain);
    localStorage.setItem('savedBlockedSites', JSON.stringify([...blockedDomains]));
    sendWsCommand("BLOCK", domain);
    renderBlockedSites();
    loadActivities();
}

function renderBlockedSites() {
    const section = document.getElementById('blockedSitesSection');
    const list = document.getElementById('blockedSitesList');
    list.innerHTML = '';

    if (blockedDomains.size === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    
    blockedDomains.forEach(domain => {
        const pill = document.createElement('span');
        pill.style.cssText = "background: #b42318; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);";
        pill.innerHTML = `
            ${domain}
            <button class="unblock-pill-btn" data-domain="${domain}" style="background: none; border: none; color: #ffcccc; cursor: pointer; padding: 0; font-weight: bold; font-size: 14px; line-height: 1;">&times;</button>
        `;
        list.appendChild(pill);
    });

    document.querySelectorAll('.unblock-pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            unblockDomain(e.target.getAttribute('data-domain'));
        });
    });
}

// --- CORE DATA LOGIC ---

async function loadActivities() {
    try {
        console.log("Fetching logs from server...");
        const res = await fetch(`/api/activities?limit=${currentLimit}`);
        const data = await res.json();
        const activities = Array.isArray(data.activities) ? data.activities : [];

        rowsEl.innerHTML = '';

        if (activities.length === 0) {
            emptyEl.hidden = false;
            metaEl.textContent = 'Showing 0 activities';
            loadMoreBtn.style.display = 'none';
            return;
        }

        emptyEl.hidden = true;

        activities.forEach((item, index) => {
            const domain = getDomainName(item.url);
            const isBlocked = blockedDomains.has(domain);
            const btnClass = isBlocked ? "unblock-btn" : "block-btn";
            const btnText = isBlocked ? "Unblock" : "Block";

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${formatTime(item.timestamp)}</td>
                <td>${escapeHtml(item.title || 'Unknown Page')}</td>
                <td class="url">${escapeHtml(item.url || '')}</td>
                <td class="search">${escapeHtml(item.search || '-')}</td>
                <td>
                    <button class="action-btn toggle-block-btn ${btnClass}" data-domain="${domain}">${btnText}</button>
                </td>
            `;
            rowsEl.appendChild(tr);
        });

        const total = Number.isFinite(data.total) ? data.total : activities.length;
        metaEl.textContent = `Showing ${activities.length} of ${total} recent activities`;
        loadMoreBtn.style.display = activities.length < total ? 'inline-block' : 'none';
    } catch (err) {
        metaEl.textContent = 'Failed to load data. Ensure server is running.';
        loadMoreBtn.style.display = 'none';
    }
}

async function clearActivities() {
    if (!window.confirm('Clear all activity?')) return;
    await fetch('/api/clear', { method: 'POST' });
    currentLimit = PAGE_SIZE;
    loadActivities();
}

function connectWs() {
    try {
        ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);

        ws.onopen = () => {
            console.log("🟢 WebSocket Connected! Force refreshing data...");
            loadActivities();
        };

        ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }

            if (msg.type === 'activity:new' || msg.type === 'activities:cleared' || msg.type === 'hello') {
                loadActivities();
            }
        };

        ws.onclose = scheduleWsReconnect;
        ws.onerror = scheduleWsReconnect;
    } catch (e) {
        scheduleWsReconnect();
    }
}

function scheduleWsReconnect() {
    if (wsRetryTimer) return;
    wsRetryTimer = setTimeout(() => {
        wsRetryTimer = null;
        connectWs();
    }, 3000);
}

function formatTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Poll every 10 seconds for table updates
setInterval(loadActivities, 10000);
// 🧠 Poll every 30 seconds for new AI Insights
setInterval(fetchAIAnalysis, 30000);

// --- 🧠 NEW: AI DASHBOARD LOGIC ---
async function fetchAIAnalysis() {
    try {
        const response = await fetch('/api/analysis');
        
        // Handle case where file might not exist yet
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            return;
        }

        const data = await response.json();

        if (data.message) {
            console.log("Waiting for first AI analysis...");
            return;
        }

        // 1. Update Timestamp
        document.getElementById('ai-last-updated').innerText = "Last Updated: " + new Date().toLocaleTimeString();

        // 2. Update Risk Level (with color coding!)
        const riskEl = document.getElementById('ui-risk');
        const risk = (data.session_summary?.risk_level || 'low').toLowerCase();
        riskEl.innerText = risk.toUpperCase();
        if (risk === 'low') riskEl.style.color = '#a6e3a1'; 
        else if (risk === 'medium') riskEl.style.color = '#f9e2af'; 
        else riskEl.style.color = '#f38ba8'; 

        // 3. Update Sentiment & Emotions
        document.getElementById('ui-sentiment').innerText = data.session_summary?.overall_sentiment || '-';
        document.getElementById('ui-emotions').innerText = (data.session_summary?.dominant_emotions || []).join(', ') || '-';

        // 4. Update Parent Recommendations
        document.getElementById('ui-summary').innerText = `"${data.recommendations_for_parents?.summary || 'Gathering insights...'}"`;
        
        const actionsList = document.getElementById('ui-actions');
        const actions = data.recommendations_for_parents?.actions || [];
        if (actions.length > 0) {
            actionsList.innerHTML = actions.map(action => `<li style="margin-bottom: 8px;">${action}</li>`).join('');
        } else {
            actionsList.innerHTML = '<li>Keep an eye on the dashboard for updates.</li>';
        }

    } catch (error) {
        console.error("Failed to load AI Analysis:", error);
    }
}