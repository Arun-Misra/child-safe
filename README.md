# Child Safe - Complete Setup and Run Guide

This guide covers the full process from fresh setup to running everything end-to-end.

## 1. What this project includes

- Firefox browser extension: captures browsing activity.
- Parent Dashboard (`parent-dashboard`): receives activity, stores it, and shows it in a web UI.
- Voice Companion (`voice`): Gemini Live voice chat server.
- Optional local analysis engine (Ollama): generates `analysis.json` for richer context.

## 2. Prerequisites

Install these first:

- Node.js 18+ (Node 20 recommended)
- npm (comes with Node)
- Firefox (for loading the extension)
- Google Gemini API key (for voice)
- Ollama (automatic local sentimental analysis)

## 3. Project structure

- `extension(firefox)/` - Firefox extension files (`manifest.json`, background, popup)
- `parent-dashboard/` - Dashboard backend + frontend (port 8787)
- `voice/` - Voice backend + frontend (port 3000)

## 4. Install dependencies

From project root:

```powershell
cd C:\Users\kanha\Downloads\child-safe

cd parent-dashboard
npm install

cd ..\voice
npm install
```

## 5. Configure environment for voice

Create file: `voice/.env`

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
ENABLE_FUNCTION_TOOLS=false
```

Notes:

- Keep `ENABLE_FUNCTION_TOOLS=false` for stable mode.
- If you want tool-calling later, set it to `true` and test.

## 6. Start Parent Dashboard

Open terminal 1:

```powershell
cd C:\Users\kanha\Downloads\child-safe\parent-dashboard
npm start
```

Expected:

- `http://localhost:8787` opens dashboard UI
- WebSocket endpoint is `ws://localhost:8787/ws`

## 7.Start Ollama for AI analysis

The dashboard tries to call Ollama at `http://localhost:11434` using model `phi4-mini:3.8b`.

If you want this feature:

```powershell
ollama pull phi4-mini:3.8b
ollama run phi4-mini:3.8b
```

If Ollama is not running, dashboard still works (analysis generation will fail and retry).

## 8. Start Voice service

Open terminal 2:

```powershell
cd C:\Users\kanha\Downloads\child-safe\voice
npm start
```

Expected:

- Voice UI at `http://localhost:3000`

## 9. Load Firefox extension

1. Open Firefox.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select: `C:\Users\kanha\Downloads\child-safe\extension(firefox)\manifest.json`
5. Browse normal websites to generate activity.

## 10. End-to-end run order (important)

Always run in this order:

1. Start `parent-dashboard`
2. Start `voice`
3. Load/reload Firefox extension
4. Browse pages and open dashboard to verify activity
5. Open voice page and test mic interaction

## 11. How to verify everything is working

- Dashboard health:

```text
http://localhost:8787/api/health
```

- Dashboard UI:

```text
http://localhost:8787
```

- Voice UI:

```text
http://localhost:3000
```

- Activity file updates:
  - `parent-dashboard/activities.json`

- Analysis file updates (if Ollama active):
  - `parent-dashboard/analysis.json`

## 12. Common issues and fixes

### A) `EADDRINUSE` (port already in use)

Close the process using that port, then restart.

Check port usage:

```powershell
netstat -ano | findstr :3000
netstat -ano | findstr :8787
```

Kill process by PID:

```powershell
taskkill /PID <PID> /F
```

### B) Extension not sending data

- Reload extension in `about:debugging`
- Make sure dashboard is running first
- Browse non-`about:*` pages

### C) Voice disconnects / reconnect loops

- Keep `ENABLE_FUNCTION_TOOLS=false` in `voice/.env`
- Restart voice server after changing `.env`

### D) No `analysis.json`

- Start Ollama and ensure model name matches `phi4-mini:3.8b`
- Keep browsing until enough items are collected

## 13. Daily quick start

Use two terminals:

Terminal 1:

```powershell
cd C:\Users\kanha\Downloads\child-safe\parent-dashboard
npm start
```

Terminal 2:

```powershell
cd C:\Users\kanha\Downloads\child-safe\voice
npm start
```

Then reload extension in Firefox and open:

- `http://localhost:8787`
- `http://localhost:3000`