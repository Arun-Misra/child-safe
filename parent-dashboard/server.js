const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');

const PORT = process.env.PORT || 8787;
const MAX_ITEMS = 1000;
const DB_FILE = path.join(__dirname, 'activities.json');
const ANALYSIS_FILE = path.join(__dirname, 'analysis.json'); // 🆕 Where the AI profile lives

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

let activities = [];
let aiActivityBuffer = []; // The bucket that collects URLs for Ollama

// --- 1. LOAD DATABASE ON STARTUP ---
if (fs.existsSync(DB_FILE)) { 
    try {
        const rawData = fs.readFileSync(DB_FILE, 'utf8');
        activities = JSON.parse(rawData);
        console.log(`📂 DATABASE LOADED: ${activities.length} saved activities found.`);
    } catch (err) {
        console.error("⚠️ Error reading database file:", err);
    }
}

// --- 2. SAVE FUNCTIONS ---
function saveDatabase() {
    fs.writeFile(DB_FILE, JSON.stringify(activities, null, 2), (err) => {
        if (err) console.error("⚠️ Failed to save activities:", err);
    });
}

function saveAnalysis(analysisData) {
    fs.writeFile(ANALYSIS_FILE, JSON.stringify(analysisData, null, 2), (err) => {
        if (err) console.error("⚠️ Failed to save analysis:", err);
        else console.log("💾 analysis.json perfectly updated!");
    });
}

function broadcast(messageObj) {
  const payload = JSON.stringify(messageObj);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

// --- 3. WEBSOCKET CONTROLLER ---
wss.on('connection', (socket) => {
  console.log("🟢 Dashboard connected.");
  socket.send(JSON.stringify({ type: 'activity:history', payload: activities }));

  socket.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

    if (msg && msg.type === 'activity' && msg.payload && msg.payload.url) {
      const payload = msg.payload;
      const activity = {
        title: String(payload.title || ''),
        url: String(payload.url || ''),
        search: String(payload.search || ''),
        timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now()
      };

      activities.unshift(activity);
      if (activities.length > MAX_ITEMS) activities = activities.slice(0, MAX_ITEMS);
      
      saveDatabase();
      socket.send(JSON.stringify({ type: 'ack', ok: true }));
      broadcast({ type: 'activity:new', payload: activity, total: activities.length });

      aiActivityBuffer.push(activity);
      console.log(`🪣 Added item to AI bucket. Current size: ${aiActivityBuffer.length}`);
    }
  });
});

// --- 4. EXPRESS ROUTES ---
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, count: activities.length }));

app.post('/api/activity', (req, res) => {
  const { title = '', url = '', search = '', timestamp } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  const activity = {
    title: String(title || ''), url: String(url || ''), search: String(search || ''),
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
  };

  activities.unshift(activity);
  if (activities.length > MAX_ITEMS) activities = activities.slice(0, MAX_ITEMS);
  
  saveDatabase();
  broadcast({ type: 'activity:new', payload: activity, total: activities.length });

  aiActivityBuffer.push(activity);
  console.log(`🪣 (HTTP) Added to Batch. Current size: ${aiActivityBuffer.length}`);

  return res.json({ ok: true });
});

app.get('/api/activities', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit || '15', 10), 1), 100);
  res.json({ activities: activities.slice(0, limit), total: activities.length });
});

// 🆕 NEW ROUTE: For the frontend to grab the latest AI profile!
app.get('/api/analysis', (req, res) => {
    if (fs.existsSync(ANALYSIS_FILE)) {
        res.sendFile(ANALYSIS_FILE);
    } else {
        res.json({ message: "No analysis generated yet." });
    }
});

app.post('/api/clear', (req, res) => {
  activities = [];
  saveDatabase();
  broadcast({ type: 'activities:cleared' });
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 🧠 THE BATCH ANALYZER (Powered by Ollama)
// ==========================================
const BUFFER_TIMER_MINUTES = 0.5; // Testing interval
const MIN_ITEMS_TO_PROCESS = 3;

setInterval(async () => {
    if (aiActivityBuffer.length < MIN_ITEMS_TO_PROCESS) return;

    console.log(`\n=================================================`);
    console.log(`🚨 BATCH TIMER: Sending ${aiActivityBuffer.length} items to Ollama (Phi-4)...`);

    // 1. Grab items and empty the bucket so it can keep filling up independently
    const itemsToProcess = [...aiActivityBuffer];
    aiActivityBuffer = []; 

    // 2. Format the logs into a clean text list for the AI to read
    const logList = itemsToProcess.map(item => `- ${item.search || item.title}`).join('\n');

    // 3. The Strict JSON Prompt
const promptText = `
You are an expert child psychologist and digital behavior analyst. Your job is to analyze a child's recent web browsing logs and generate a deeply insightful, natural-feeling psychological profile in JSON format.

LOGS TO ANALYZE:
${logList}

ANALYSIS GUIDELINES:
1. Be highly descriptive and empathetic. Use rich emotional descriptors in the "emotions" arrays (e.g., "curiosity", "learning_interest", "engagement", "frustration", "entertainment", "focus").
2. Group related searches into logical "activity_clusters". Look for progressions (e.g., moving from a broad topic to a specific one) and note them in the "signals".
3. Identify deeper "behavioral_patterns" based on the logs (e.g., "technical_maturity", "focus_vs_distraction", "structured_learning").
4. Keep the "recommendations_for_parents" supportive, actionable, and natural.

You MUST output ONLY valid JSON. Do not include markdown formatting or conversational text. Use this EXACT structure:

{
  "session_summary": {
    "overall_sentiment": "string (e.g., positive, neutral, frustrated)",
    "dominant_emotions": ["string", "string"],
    "risk_level": "low|medium|high",
    "confidence": 0.0
  },
  "activity_clusters": [
    {
      "cluster": "string (e.g., ai_tools_exploration, learning_math)",
      "entries": ["exact searches from the logs"],
      "intent": "string",
      "sentiment": "string",
      "emotions": ["string"],
      "risk_level": "low|medium|high",
      "signals": ["string explaining the behavioral signal"]
    }
  ],
  "behavioral_patterns": {
    "learning_pattern": {
      "description": "string",
      "evidence": ["string"],
      "score": 0.0
    },
    "technical_maturity": {
      "description": "string",
      "evidence": ["string"],
      "score": 0.0
    }
  },
  "risk_analysis": {
    "flags": ["string"],
    "concerns": ["string"],
    "protective_signals": ["string"]
  },
  "recommendations_for_parents": {
    "summary": "string",
    "actions": ["string"],
    "opportunities": ["string"]
  }
}
`;

    try {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'phi4-mini:3.8b', // MAKE SURE THIS MATCHES YOUR OLLAMA MODEL NAME
                prompt: promptText,
                stream: false,
                format: "json", // 🔥 THIS FORCES OLLAMA TO RETURN PURE JSON!
                options: { temperature: 0.2 }
            })
        });

        if (!response.ok) throw new Error("Ollama API failed");

        const data = await response.json();
        const jsonProfile = JSON.parse(data.response); // Parse the string into a real object
        
        console.log("✨ Phi-4 Successfully Generated JSON Profile!");
        
        // Save it to the file so the frontend can read it
        saveAnalysis(jsonProfile);

    } catch (e) {
        console.error("❌ Ollama Analysis Failed. Make sure Ollama is running and the JSON is valid.", e.message);
        // Put the items back in the buffer to try again next time
        aiActivityBuffer = [...itemsToProcess, ...aiActivityBuffer]; 
    }

    console.log(`=================================================\n`);

}, BUFFER_TIMER_MINUTES * 60 * 1000);

server.listen(PORT, () => {
  console.log(`🚀 Unified Backend running at http://localhost:${PORT}`);
});