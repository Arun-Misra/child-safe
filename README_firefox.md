# Load & Test (Firefox)

Steps to load the extension temporarily in Firefox and test the popup:

1. Open Firefox.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on** and select the `manifest.json` file inside the folder: `C:\Users\kanha\Downloads\child-safe\manifest.json`.
4. The extension should appear in your toolbar. If not, open the menu → Customize Toolbar to add it.
5. Visit some pages (e.g., https://www.google.com), perform searches or navigate — this will generate activity entries.
6. Click the extension icon to open the popup; the popup shows the 10 newest activities. Click **Load More Activities** to fetch more.
7. Click **Open Full Dashboard** in the popup to open the parent dashboard tab.

Dashboard features:
- Search by page title, URL, or search text.
- Load activities in larger pages.
- Refresh to reload current storage.
- Clear all saved activities.
- Export filtered activity list as CSV.

Inspecting and clearing storage:
- To inspect stored data open the extension's background page via `about:debugging` and click **Inspect** for the add-on, then in the Console run:

  ```js
  // View activities
  browser.storage.local.get('activities').then(console.log);

  // Clear activities
  browser.storage.local.set({ activities: [] }).then(() => console.log('cleared'));
  ```

Notes:
- This build uses Manifest V2 (`manifest.json`) for Firefox compatibility (event background page). If you want a cross-browser MV3 build (Chrome MV3 + Firefox), I can create a separate MV3-compatible bundle and add a small `browser` polyfill.
- Parent dashboard live sync now uses WebSocket at `ws://localhost:8787/ws` (with HTTP fallback).

If activities still do not appear:
1. Go back to `about:debugging#/runtime/this-firefox`.
2. Click **Reload** on the temporary add-on (required after file changes).
3. Open a normal web page (not `about:*` or extension pages), then refresh it once.
4. In the add-on **Inspect** console, run:

  ```js
  browser.storage.local.get('activities').then((x) => console.log('activities:', x.activities || []));
  ```

5. If the array is empty, inspect the page console and check for extension errors under `about:debugging`.

WebSocket check:
1. Start the parent dashboard server first.
2. Reload the extension in `about:debugging`.
3. Browse a page and check dashboard updates within a few seconds.
