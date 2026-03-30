import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Revert back to the 2.5 native model or use 3.1
const GEMINI_LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
const GEMINI_LIVE_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
let enableFunctionTools = process.env.ENABLE_FUNCTION_TOOLS === 'true';

if (!GEMINI_API_KEY) {
    console.error('🚨 GEMINI_API_KEY is not set in .env!');
    process.exit(1);
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// We attach our WebSocketServer to a plain http.Server so Express and WS share port 3000
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

console.log(`\n🚀 Server starting on http://localhost:3000`);
console.log(`🤖 Using Gemini model: ${GEMINI_LIVE_MODEL}\n`);

// ─── Handle each browser client that connects ─────────────────────────────────
wss.on('connection', (browserWs) => {
    console.log('✅ Browser client connected');

    // ── 1. Open a fresh connection to the Gemini Live API for this client ──
    const geminiWs = new WebSocket(GEMINI_LIVE_URL);

    // ── 2. Send Gemini setup message as soon as the connection opens ────────
    geminiWs.on('open', () => {
        console.log('🔗 Connected to Gemini Live API');

        const setup = {
            setup: {
                model: GEMINI_LIVE_MODEL,
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: 'Charon' 
                            }
                        }
                    }
                },
                realtimeInputConfig: {
                    automaticActivityDetection: {
                        disabled: false,
                        prefixPaddingMs: 20,
                        silenceDurationMs: 150 // Keep this fast!
                    }
                },
                systemInstruction: {
                    parts: [{
                        text: enableFunctionTools
                            ? "You are a warm, supportive, and fun voice companion for a child. You have access to several tools. Use 'check_child_status' to get emotional state and behavioral intent. Use 'get_recent_web_activity' to see the exact pages they are looking at right now so you can converse about their exact interests. Use 'get_parental_guidelines' to check rules you should gently reinforce. Be proactive in using these tools to provide a highly personalized, context-aware experience. Keep responses concise and natural."
                            : "You are a warm, supportive, and fun voice companion for a child. Keep responses concise and natural. Ask context questions when needed, and guide the child gently."
                    }]
                }
            }
        };

        if (enableFunctionTools) {
            setup.setup.tools = [{
                functionDeclarations: [
                    {
                        name: 'check_child_status',
                        description: "Checks the parent dashboard to get the child's current emotional state and recent web activity intent.",
                        parameters: { type: 'OBJECT', properties: {} }
                    },
                    {
                        name: 'get_recent_web_activity',
                        description: 'Gets a list of the last few tabs or searches the child has open right now, so you can converse about their exact interests.',
                        parameters: { type: 'OBJECT', properties: {} }
                    },
                    {
                        name: 'get_parental_guidelines',
                        description: 'Fetches current screen time and content rules set by parents.',
                        parameters: { type: 'OBJECT', properties: {} }
                    }
                ]
            }];
        }

        geminiWs.send(JSON.stringify(setup));
        console.log(enableFunctionTools
            ? '📤 Sent setup message with Function Calling enabled!'
            : '📤 Sent setup message in safe mode (tools disabled).');
    });

    // ── 3. Relay messages from Gemini back to the browser ──────────────────
// ── 3. Relay messages from Gemini back to the browser ──────────────────
    geminiWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());

            // A. Setup complete — notify browser the session is ready
            if (msg.setupComplete) {
                console.log('✅ Gemini setup complete — session ready');
                browserWs.send(JSON.stringify({ type: 'ready' }));
                return;
            }

            // ⚡ THE FIX: Catch the Tool Call! (It lives at the root of the message)
            if (msg.toolCall) {
                if (!enableFunctionTools) {
                    return;
                }
                const functionCalls = msg.toolCall.functionCalls;
                if (functionCalls && functionCalls.length > 0) {
                    const call = functionCalls[0];
                    let contextString = "No context available.";
                    
                    if (call.name === 'check_child_status') {
                        console.log(`🛠️ AI activated tool: Checking Dashboard for context...`);
                        contextString = "The child is just browsing normally.";
                        try {
                            const ANALYSIS_FILE = path.join(__dirname, '../parent-dashboard/analysis.json');
                            if (fs.existsSync(ANALYSIS_FILE)) {
                                const analysis = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf8'));
                                const emotions = analysis.session_summary?.dominant_emotions?.join(', ') || 'neutral';
                                const intent = analysis.activity_clusters?.[0]?.intent || 'exploring the web';
                                contextString = `The child is feeling [${emotions}] and actively [${intent}].`;
                            }
                        } catch (err) {
                            console.error("⚠️ Error reading analysis.json:", err.message);
                        }
                    } else if (call.name === 'get_recent_web_activity') {
                        console.log(`🛠️ AI activated tool: Getting recent activity...`);
                        contextString = "No recent activity found.";
                        try {
                            const ACTIVITY_FILE = path.join(__dirname, '../parent-dashboard/activities.json');
                            if (fs.existsSync(ACTIVITY_FILE)) {
                                const activities = JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8'));
                                const recent = activities.slice(0, 3).map(a => a.title || a.search || a.url).join(" | ");
                                contextString = `Recent items viewed: ${recent}`;
                            }
                        } catch (err) {
                            console.error("⚠️ Error reading activities.json:", err.message);
                        }
                    } else if (call.name === 'get_parental_guidelines') {
                        console.log(`🛠️ AI activated tool: Getting parental guidelines...`);
                        contextString = "Guideline 1: Be encouraging and kind. Guideline 2: Guide them towards educational content if they seem unengaged. Guideline 3: Gently remind them to take breaks every 30 minutes. Guideline 4: If they view anything unsafe, kindly redirect their attention.";
                    }

                    // Send the tool response instantly back to Gemini
                    const toolResponseMsg = {
                        toolResponse: {
                            functionResponses: [{
                                id: call.id,
                                name: call.name,
                                response: {
                                    result: { info: contextString }
                                }
                            }]
                        }
                    };
                    geminiWs.send(JSON.stringify(toolResponseMsg));
                    console.log(`✅ Sent dashboard context to AI: "${contextString}"`);
                }
                return; // We handled the tool call, no need to process further
            }

            // B. Server content containing audio chunks
            if (msg.serverContent) {
                const { modelTurn, interrupted, turnComplete } = msg.serverContent;

                // B1. Barge-in / interruption
                if (interrupted) {
                    console.log('⚡ Barge-in detected — telling browser to stop playback');
                    if (browserWs.readyState === WebSocket.OPEN) {
                        browserWs.send(JSON.stringify({ type: 'interrupt' }));
                    }
                    return;
                }

                // B2. Audio data parts and Text Transcripts
                if (modelTurn?.parts) {
                    for (const part of modelTurn.parts) {
                        // Forward Audio
                        if (part.inlineData?.mimeType?.startsWith('audio/')) {
                            const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
                            if (browserWs.readyState === WebSocket.OPEN) {
                                browserWs.send(audioBuffer); 
                            }
                        }
                        // Forward Text Transcript
                        if (part.text) {
                            console.log(`💬 AI transcript: "${part.text.substring(0, 60)}..."`);
                            if (browserWs.readyState === WebSocket.OPEN) {
                                browserWs.send(JSON.stringify({ type: 'transcript', text: part.text, role: 'ai' }));
                            }
                        }
                    }
                }

                // B3. Turn complete
                if (turnComplete) {
                    if (browserWs.readyState === WebSocket.OPEN) {
                        browserWs.send(JSON.stringify({ type: 'turnComplete' }));
                    }
                }
            }

            // C. User transcript (input_transcription)
            if (msg.inputTranscription?.text) {
                if (browserWs.readyState === WebSocket.OPEN) {
                    browserWs.send(JSON.stringify({ type: 'transcript', text: msg.inputTranscription.text, role: 'user' }));
                }
            }

        } catch (e) {
            // Gemini sometimes sends binary frames — ignore them here
        }
    });

    geminiWs.on('error', (err) => {
        console.error('❌ Gemini WebSocket error:', err.message);
        if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(JSON.stringify({ type: 'error', message: err.message }));
        }
    });

    geminiWs.on('close', (code, reason) => {
        console.log(`🔌 Gemini WS closed: ${code} — ${reason}`);
        if (code === 1008 && enableFunctionTools) {
            enableFunctionTools = false;
            console.warn('⚠️ Gemini rejected current operations. Falling back to safe mode (no function tools) for next session.');
        }
        if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.close();
        }
    });

    // ── 4. Relay audio chunks from browser → Gemini ────────────────────────
    browserWs.on('message', (data, isBinary) => {
        if (geminiWs.readyState !== WebSocket.OPEN) return;

        if (isBinary) {
            // Raw PCM Int16 audio from the browser's AudioWorklet
            // Wrap in Gemini's realtime_input protocol message format
            const base64Audio = data.toString('base64');
            const realtimeMsg = {
                realtime_input: {
                    media_chunks: [{
                        mime_type: 'audio/pcm',   // 16-bit PCM, 16kHz, mono, little-endian
                        data: base64Audio
                    }]
                }
            };
            geminiWs.send(JSON.stringify(realtimeMsg));
        } else {
            // JSON control messages from browser (e.g. end-of-turn signal)
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'endTurn') {
                    // Gemini Live API uses camelCase JSON — clientContent / turnComplete (NOT snake_case).
                    // Sending the correct field name forces Gemini to generate its response immediately
                    // without waiting for a silence timeout, eliminating latency between turns.
                    geminiWs.send(JSON.stringify({ clientContent: { turnComplete: true } }));
                    console.log('📤 Sent turnComplete to Gemini — AI will respond now');
                }
            } catch (e) { /* ignore malformed */ }
        }
    });

    // ── 5. Cleanup when browser disconnects ────────────────────────────────
    browserWs.on('close', () => {
        console.log('👋 Browser client disconnected — closing Gemini session');
        if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.close();
        }
    });

    browserWs.on('error', (err) => {
        console.error('❌ Browser WebSocket error:', err.message);
    });
});

server.listen(3000, () => {
    console.log('🎙️  Voice AI is live at http://localhost:3000\n');
});
