# Schuaz — Voice Input Addendum

Companion to the [Mobile App Addendum](Mobile%20App%20Addendum.md). Scopes two additions to Ask (and, for the input half, Search): a microphone/voice-to-text input — tap a mic icon, speak, get the transcribed text in the input, ready to search or ask — and, for Ask specifically, having the answer spoken back.

## 1. The approach: record audio, transcribe server-side — not on-device speech recognition

Two real options exist, and the choice matters for cross-platform consistency:

- **Browser/OS speech recognition** (`SpeechRecognition`/`webkitSpeechRecognition`, or a native Capacitor plugin like `@capacitor-community/speech-recognition`): notoriously inconsistent — spotty-to-absent on iOS Safari/WKWebView, different behavior per Android WebView version, and a native plugin would only work inside the Capacitor app, not in a browser tab. Two divergent code paths for the same feature, with the browser path being the least reliable one.
- **Record audio, transcribe server-side** (the recommendation): `MediaRecorder`, a standard Web API, captures a short audio clip — this already works identically in a browser tab, the Capacitor Android WebView, and (later) the Capacitor iOS WebView, no platform branching needed. The clip gets POSTed to a new route that transcribes it via the `ai` package's `transcribe()` function, routed through the same Vercel AI Gateway already used for vision detection (`lib/vision/detect.ts`) and Ask (`lib/ask/ask.ts`) — no new external service to provision (checked: this isn't a new marketplace integration, it's the same already-provisioned Gateway handling one more model type), just a new call.

This mirrors the app's own established pattern of pushing platform-specific complexity out of the client and into a thin, consistent server call wherever a web API can do the capture step identically everywhere (same reasoning `/api/v1/weather` and `/api/v1/barcode/lookup` already follow).

## 2. What gets built

- **`/api/v1/voice/transcribe`** (new route) — authenticated (session cookie, same as every other route), accepts the recorded audio as a POST body, calls `transcribe({ model: "openai/whisper-1", audio })` (exact model id to confirm against the Gateway's current catalog at build time — same primary/fallback-pair precedent as vision/Ask if the first choice proves unreliable), returns `{ text }`. Bounded like every other upstream call in this app (a timeout, a clear error state) — same shape as `/api/v1/weather`'s own AbortController pattern.
- **A shared `VoiceInputButton` component** — owns the record/transcribe lifecycle (idle → recording → transcribing → done/error) and nothing else; the caller decides what to do with the resulting text. `MediaRecorder` capture, POST to the route above, then hands the transcript back via an `onTranscript(text)` callback.
- **Wired into two places**:
  - `components/search-bar.tsx` — a single shared component already used across ~10 pages (Dashboard, Search, Tasks, Notes, Favorites, Trash, Tags, Locations, Wardrobe), so adding the mic here gives voice search everywhere the search bar already lives, in one change.
  - The Ask input (`components/ask-fab.tsx`, and its Finance-scoped sibling `finance-ai-card.tsx`) — same button, appended next to the existing text input.
- **Populates the input, does not auto-submit.** The transcript lands in the existing text field exactly as if typed — the user still taps Search/Send themselves. This matters most for Ask, where a mis-transcription auto-submitted could trigger a wrong tool call before anyone had a chance to notice; letting the existing input stay the single source of truth (glance-and-confirm, effectively) costs nothing and avoids that.

## 3. Voice output — Ask's answer spoken back

Server-side TTS, same reasoning as transcription above (consistent voice quality everywhere vs. the browser's own `speechSynthesis`, which would sound different — or be missing entirely — depending on OS/browser). The `ai` package's `generateSpeech()` is the direct counterpart to `transcribe()`, through the same Gateway.

A real gift here: Ask's own system prompt (`lib/ask/ask.ts`) already mandates "plain prose only... write it the way you'd say it out loud" — a constraint that exists today because the answer renders in a plain-text chat bubble, not a markdown viewer. That's exactly what TTS wants too, so the answer text needs zero changes to become spoken-friendly; the new work is entirely the synthesis + playback plumbing, not the answer generation itself.

- **`/api/v1/voice/speak`** (new route) — authenticated, takes the answer `text`, calls `generateSpeech({ model: "openai/tts-1", text, voice: "alloy" })` (exact model/voice to confirm at build time), returns the audio.
- **When it plays**: auto-play the answer's audio only when the *question* came in via voice (the mic button from §2) — a real hands-free loop, speak in, hear back. A typed question stays purely text-in-text-out by default, so Ask doesn't start talking unprompted every time someone types a quick question in a quiet room. A manual "play this answer" button (available regardless of how the question was asked) is a reasonable later add, not needed for v1.
- **Cost stays low on its own**: TTS pricing scales with text length, and Ask's system prompt already keeps answers "short and direct... at most one sentence of relevant context" for reasons unrelated to this feature — that constraint happens to cap TTS cost per answer too.

## 4. Permissions

- **Web**: `navigator.mediaDevices.getUserMedia({ audio: true })` — same "only ever requested from a real button tap, never on page load" posture this app's own Web Push permission flow already documents (`hooks/use-push-notifications.ts`'s comment), for the same reason (a page-load permission prompt is the pattern most likely to get reflexively denied).
- **Android** (docs/Mobile App Addendum.md's native shell): add `RECORD_AUDIO` to `AndroidManifest.xml`, same pattern as the existing `CAMERA`/`ACCESS_FINE_LOCATION` entries added for the capture/location flows — no Capacitor plugin needed, since `MediaRecorder`/`getUserMedia` already work in the WebView the same way camera capture already does.
- **iOS** (once Phase 4 starts): `NSMicrophoneUsageDescription` in `Info.plist` — noted here so it isn't missed when that phase begins, not something to act on now.

## 5. Dictation into Notes (reopened)

§6's original open question below called this "a search/ask input, not a dictation tool." Reopened on request: `components/note-editor.tsx`'s toolbar (editable mode only, so create/edit only — not the read view) gets the same `VoiceInputButton`, wired to `editor.chain().insertContent(...)` instead of `onTranscript` populating a text field — it inserts the transcript at the current cursor position as one real ProseMirror transaction, so it lands exactly where typing would have and the toolbar's own Undo reverts a bad dictation like any other edit. `components/note-assistant-bar.tsx`'s own prompt input (talk *to* the note's AI assistant, not into the note itself) gets the same button too, same "populates the field, never auto-submits" convention as everywhere else in this doc.

## 6. Open questions

- Exact transcription/speech model ids to use from the Gateway's catalog (OpenAI's `whisper-1`/`tts-1` are the known-good defaults; confirm availability/pricing at build time via `gateway.getAvailableModels()`).
- Language: default to auto-detect (no language hint) rather than hardcoding `en` — simplest default, revisit only if transcription quality turns out to need it.
- Max recording length (a sane cap, e.g. 30–60s, both for cost and because most uses here are a search/ask input, not a dictation tool — §5's Notes dictation is the one deliberate exception, and shares the same cap for now rather than getting its own longer one).
- Voice choice for TTS — `alloy` as a neutral default, or worth letting the user pick one of OpenAI's other built-in voices from Settings? Not blocking for v1 either way.
