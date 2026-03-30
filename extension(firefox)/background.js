let ws;
let reconnectTimer = null;

function connectWebSocket() {
  try {
    console.log("⏳ Attempting to connect to WebSocket...");
    ws = new WebSocket("ws://localhost:8787/ws");

    ws.onopen = () => {
      console.log("🟢 WebSocket Connected Successfully!");
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    // 🎧 Listen for remote commands from your server!
    ws.onmessage = async (event) => {
      try {
        const command = JSON.parse(event.data);

        // Handle a BLOCK command
        if (command.type === "BLOCK" && command.domain) {
          if (!blockedDomains.includes(command.domain)) {
            blockedDomains.push(command.domain);
            await browser.storage.local.set({ blockedSites: blockedDomains });
            console.log("🛑 Remote Command: BLOCKED ->", command.domain);
            
            // 💥 NEW: Actively hunt down and close any open tabs for this domain
            closeTabsWithDomain(command.domain);
          }
        }

        // Handle an UNBLOCK command
        if (command.type === "UNBLOCK" && command.domain) {
          blockedDomains = blockedDomains.filter(domain => domain !== command.domain);
          await browser.storage.local.set({ blockedSites: blockedDomains });
          console.log("✅ Remote Command: UNBLOCKED ->", command.domain);
        }
      } catch (error) {
        console.error("⚠️ Failed to read incoming server command:", error);
      }
    };

    ws.onclose = (event) => {
      console.log(`🔴 WebSocket Closed (Code: ${event.code}). Reconnecting...`);
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error("⚠️ WebSocket Error:", error);
      scheduleReconnect();
    };
  } catch (e) {
    console.error("💥 Critical WebSocket Setup Error:", e);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, 3000);
}

function sendWsActivity(activity) {
  if (!ws || ws.readyState !== 1) { // 1 means OPEN
    console.log("🚫 WebSocket not ready. Falling back to HTTP...");
    connectWebSocket();
    return false;
  }

  try {
    const payload = JSON.stringify({ type: "activity", payload: activity });
    ws.send(payload);
    console.log("⬆️ Data sent over WebSocket:", activity.search || activity.title);
    return true;
  } catch (e) {
    console.error("❌ Failed to send over WebSocket:", e);
    return false;
  }
}

connectWebSocket();

// --- THE FIREFOX FIX: A secure, instant async save function ---
async function saveActivitySecurely(activity) {
  try {
    const data = await browser.storage.local.get({ activities: [] });
    const logs = Array.isArray(data.activities) ? data.activities : [];
    
    logs.unshift(activity);
    if (logs.length > 1000) logs.pop();
    
    await browser.storage.local.set({ activities: logs });
    console.log("🦊 Firefox Saved:", activity.search || activity.title || "Page visit");
    
  } catch (error) {
    console.error("❌ Firefox Save Error:", error);
  }
}

// 💥 NEW: THE TAB KILLER
// Searches all open tabs and closes them instantly if they match the blocked domain
async function closeTabsWithDomain(domain) {
  try {
    const tabs = await browser.tabs.query({}); // Grab every open tab
    for (const tab of tabs) {
      if (tab.url) {
        const tabUrl = new URL(tab.url);
        // If the tab is sitting on the blocked site, close it!
        if (tabUrl.hostname.includes(domain)) {
          await browser.tabs.remove(tab.id);
          console.log(`💥 Terminated active tab: ${tab.url}`);
        }
      }
    }
  } catch (error) {
    console.error("Failed to close tabs:", error);
  }
}

// --- The streamlined message listener ---
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Handle incoming tracked activity
  if (message && message.type === "PAGE_LOADED" && message.data) {
    const activity = {
      ...message.data,
      timestamp: Date.now()
    };

    saveActivitySecurely(activity);
    const sent = sendWsActivity(activity);

    if (!sent) {
      fetch("http://localhost:8787/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activity)
      }).catch(() => {});
    }
  }

  // 2. Handle the "Block this site" command from the local extension popup
  if (message && message.type === "BLOCK_SITE") {
    if (!blockedDomains.includes(message.domain)) {
      blockedDomains.push(message.domain);
      browser.storage.local.set({ blockedSites: blockedDomains });
      console.log("🚫 Added to Blocklist:", message.domain);
      
      // 💥 Actively close it if the parent blocked it from the popup instead of the server
      closeTabsWithDomain(message.domain);
    }
  }
});

// ==========================================
// 🛑 THE BOUNCER: WEB REQUEST BLOCKER 🛑
// ==========================================
let blockedDomains = [];

// 1. Load the saved blocklist from memory when the extension starts
browser.storage.local.get({ blockedSites: [] }).then((result) => {
  blockedDomains = result.blockedSites || [];
});

// 2. Intercept every web request before it loads
browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    try {
      const url = new URL(details.url);
      const isBlocked = blockedDomains.some(domain => url.hostname.includes(domain));
      
      if (isBlocked) {
        console.log("🛑 Blocked access to:", url.hostname);
        return { cancel: true }; 
      }
    } catch (e) { /* Ignore invalid URLs */ }
  },
  { urls: ["<all_urls>"] }, // Listen to all web traffic
  ["blocking"]              // Tell Firefox we have the power to cancel the request
);