# SubjectChat — Next Steps (from roadmap & TRD)

**Updated from:** product-architecture-plan.md, TRD.md, ml-personalization.md

---

## Done so far

- **Phase 0 MVP:** Subject picker, chat UI, `/api/chat`, stub + single provider (OpenAI-compatible).
- **Phase 1 (partial):** Persistent history (Postgres), feedback logging, conversations CRUD, **profile notes (LLM per subject)** — see below.
- **UX:** Change subject, save chat, history sidebar, Profile & Notes, next-question suggestion, thumbs up/down, sticky nav bar, streaming chat, Hint/Explain/Practice quick actions.

### Profile notes (Phase 1 — LLM-structured notes per subject)

- **Where:** Profile view → “Notes by subject”. Backend: `GET /api/profile/notes`.
- **What it does:** For each subject that has at least one saved conversation, the backend uses the LLM to turn recent chat history into structured notes (Key topics, Progress summary, Areas to review, Suggested next steps).
- **Current state:** Implemented end-to-end; notes are generated on demand when you open Profile. **Fully developing** in this sprint: per-subject regenerate, markdown rendering, refresh-all, and clearer loading/error states.

---

## Next steps (in priority order)

### 1. ~~Streaming chat responses (Phase 1)~~ ✅ Done

### 2. ~~Hint / Explain / Practice quick actions~~ ✅ Done

- **Why:** Product plan lists “Hint / Explain / Practice quick actions” on the chat page.
- **What:** Add 3 buttons above or near the composer that prefill or tag the request (e.g. “Give me a hint”, “Explain step by step”, “Give me a practice problem”). Can be implemented as suggested prefixes or a small prompt template sent with the message.

### 3. ~~Basic moderation (Phase 1 — safety)~~ ✅ Done

- Lightweight blocklist in `app/moderation.py`; chat and chat/stream refuse disallowed content and return a safe message.

### 4. Subject config as JSON (maintainability)

- **Why:** Product plan and TRD say subject configs should be versioned JSON.
- **What:** Move subject definitions from code to `subjects/<subjectId>.json` (name, description, teaching_style, constraints). Backend loads these at startup or on first use; keep fallback to current in-code defaults.

### 5. Rate limiting (Phase 1 — TRD)

- **Why:** TRD requires rate limiting per IP/user.
- **What:** Add middleware (e.g. Redis or in-memory) to limit requests per IP (and per user when auth exists). Return 429 when exceeded.

### 6. Markdown + math in messages (UX)

- **Why:** Product plan: “Output format: markdown with math support (KaTeX in UI later)”.
- **What:** Render assistant messages with `react-markdown`; add `rehype-katex` (and KaTeX CSS) for LaTeX math. Sanitize HTML for safety.

### 7. Export chat (later)

- **Why:** Product plan: “Export a chat to PDF/text (later)”.
- **What:** Add “Export” on a conversation or in Profile to download as text or PDF.

### 8. PWA (Phase 2)

- **Why:** Roadmap: installable, offline-first static assets.
- **What:** Add Vite PWA plugin, manifest, service worker; cache static assets; optional push notifications.

### 9. Personalization (Phase 1.5 — ml-personalization.md)

- **Why:** TRD and ML plan: explainable “next question” and study patterns.
- **What:** Log skill-relevant events; use LLM to produce session summary (skill tags, difficulty, suggested next question); store in DB. Recommendation endpoint uses this for richer suggestions.

---

## Suggested order for this sprint

1. ~~Streaming chat~~ ✅  
2. ~~Hint / Explain / Practice~~ ✅  
3. ~~**Fully develop profile notes (Phase 1)**~~ ✅ — Markdown rendering, Refresh all, Regenerate per subject, loading & error states.  
4. ~~**Basic moderation**~~ ✅  
5. Subject JSON config, rate limiting, markdown/math in chat.
