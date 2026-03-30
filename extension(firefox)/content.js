// --- 1. The Search Extractor (Updated for YouTube & standard searches) ---
function getSearchQuery() {
const urlParams = new URLSearchParams(window.location.search);
  
  // 1. The "Big Net" - Most sites use one of these 5 keys
  const commonKeys = ['q', 'search_query', 's', 'query', 'term', 'k'];
  
  for (let key of commonKeys) {
    const val = urlParams.get(key);
    if (val && val.trim().length > 0) return val.trim();
  }

  // 2. The "Path" Fallback - Some sites use /search/your-topic
  const pathParts = window.location.pathname.split('/');
  const searchIndex = pathParts.findIndex(p => p.toLowerCase() === 'search');
  if (searchIndex !== -1 && pathParts[searchIndex + 1]) {
    return decodeURIComponent(pathParts[searchIndex + 1]).replace(/-/g, ' ');
  }

  return null;
}

// --- 2. Advanced AI Chat Tracking (ChatGPT, Gemini, etc.) ---
let currentInputText = "";
let activeInputBox = null;

// A. Listen to EVERY keystroke in any text box or editable area
document.addEventListener('input', (event) => {
  const target = event.target;
  
  // Catch standard textareas (ChatGPT) OR editable divs (Gemini)
  if (target.tagName === 'TEXTAREA' || target.isContentEditable) {
    activeInputBox = target;
    // Extract the text depending on the type of box
    currentInputText = target.value || target.innerText || target.textContent || ""; 
  }
}, true);

// Helper function to send the captured AI prompt
function captureAndSend() {
  const textToLog = currentInputText.trim();
  if (textToLog.length > 0) {
    sendLog(textToLog);
    currentInputText = ""; // Clear our memory so we don't send duplicates
  }
}

// B. Trigger 1: Pressing the 'Enter' Key
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && currentInputText) {
    captureAndSend();
  }
}, true);

// C. Trigger 2: Clicking the 'Send' Button with a Mouse
document.addEventListener('click', (event) => {
  // Check if they clicked a button (or an icon inside a button)
  let clickedButton = event.target.closest('button') || event.target.closest('[role="button"]');
  
  if (clickedButton && currentInputText && activeInputBox) {
    // If they clicked a button, wait a tiny fraction of a second (100ms)
    setTimeout(() => {
       // Check if the chat box is now empty (meaning the message actually sent)
       let textAfterClick = activeInputBox.value || activeInputBox.innerText || activeInputBox.textContent || "";
       
       if (textAfterClick.trim() === "") {
           captureAndSend();
       }
    }, 100);
  }
}, true);


// --- 3. The Data Packager (Updated for Firefox) ---
function sendLog(searchedText) {
  const metaDesc = document.querySelector('meta[name="description"]');
  const cleanedUrl = getCleanTrackedUrl(window.location.href);
  const pageData = {
    url: cleanedUrl,
    title: document.title,
    description: metaDesc ? metaDesc.content : "No description",
    search: searchedText
  };

  // 🦊 Changed to 'browser.runtime' for native Firefox support
  browser.runtime.sendMessage({ type: "PAGE_LOADED", data: pageData }).catch(() => {
    // Fails silently if the background script is momentarily asleep
  });
}

function getCleanTrackedUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isGoogle = host.includes('google.');
    const isSearchPath = parsed.pathname === '/search';

    if (isGoogle && isSearchPath) {
      const q = parsed.searchParams.get('q') || '';
      const shortQ = q.length > 120 ? q.slice(0, 120) + '...' : q;
      return `https://${parsed.hostname}/search?q=${encodeURIComponent(shortQ)}`;
    }

    return rawUrl;
  } catch (e) {
    return rawUrl;
  }
}


// --- 4. Initialization & THE SPA FIX (The Ghost Watcher) ---

// Function to track a standard page load
function trackCurrentPage() {
  const query = getSearchQuery();
  sendLog(query); // Will send the query if it exists, or null if it doesn't
}

// Give the page 1 second to fully render its title before sending the initial load
setTimeout(trackCurrentPage, 1000);

// YouTube and modern apps change URLs without reloading. 
// This watches the website's code and fires whenever the URL magically shifts.
let lastUrl = window.location.href;

new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log("🔄 URL changed detected:", currentUrl);
    
    // Wait a brief moment for the new page title to load, then track it!
    setTimeout(trackCurrentPage, 1000);
  }
}).observe(document.body, { childList: true, subtree: true });