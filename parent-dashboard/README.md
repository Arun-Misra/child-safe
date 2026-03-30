# Parent Dashboard Web App

Standalone web app for parents to view recent activity captured by the extension.

## What it does
- Receives activity events from the extension over WebSocket at `ws://localhost:8787/ws` (primary)
- Also supports HTTP ingest at `POST /api/activity` (fallback)
- Stores data in memory on the local machine
- Shows the most recent 15 activities in a browser dashboard

## Run

```powershell
cd C:\Users\kanha\Downloads\child-safe\parent-dashboard
npm install
npm start
```

Open:

```text
http://localhost:8787
```

## Connect with extension
The extension background script now streams events to:

```text
ws://localhost:8787/ws
```

If WebSocket is unavailable, it falls back to:

```text
http://localhost:8787/api/activity
```

Keep this server running while the child browses so parents can see live updates.

## API
- `GET /api/health` health + count
- `POST /api/activity` add one activity
- `GET /api/activities?limit=15` get recent activities
- `POST /api/clear` clear all data

## WebSocket messages
- Client -> server:
	- `{"type":"activity","payload":{...activity}}`
- Server -> client:
	- `{"type":"hello","count":number}` on connect
	- `{"type":"activity:new","payload":{...activity},"total":number}` on new item
	- `{"type":"activities:cleared"}` after clear

## Notes
- Data is in-memory only for now (resets when server restarts).
- Next step: connect to a real database for persistence.
