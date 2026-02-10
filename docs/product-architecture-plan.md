# Web-based AI Subject Chatbot — Product & Architecture Plan

**Date:** 2026-01-31  
**Project name (working):** SubjectChat  
**Primary goal:** A web-based AI chat bot that teaches/explains multiple school subjects, with a roadmap to become an installable app (PWA first, native later if needed).

---

## 1) Problem & Goals

### Problem
Learners often need fast, interactive explanations tailored to their level, but generic chatbots can hallucinate, fail to adapt to a subject’s pedagogy (math vs history), and provide no structure or progress.

### Goals
- Provide high-quality, level-appropriate help for multiple **subjects**.
- Encourage learning (not just answers): step-by-step reasoning, guided hints, practice.
- Provide **safe** and **age-appropriate** behavior.
- Keep cost predictable and latency acceptable.
- Build web-first but **architect for app** (PWA/offline-ready assets, push notifications later, native wrapper optional).

### Non-goals (initial MVP)
- Full LMS replacement (grades, full courses, classroom roster).
- Real-time voice tutoring.
- Offline model inference.

### Success metrics
- Activation: % of users who complete first subject chat.
- Helpfulness: thumbs up/down per answer.
- Retention: 7-day return rate.
- Safety: moderation hit rate and resolution time.
- Cost: average tokens/user/day.

---

## 2) Users & Use Cases

### Primary users
- Students (middle school → college) needing explanations and practice.

### Secondary users
- Teachers/tutors generating examples and practice sets.

### Core use cases
- Pick a subject → ask a question → get explanation + examples.
- Ask for hints instead of full solutions.
- Ask for practice problems + solutions on request.
- Save chat history per subject.
- Export a chat to PDF/text (later).

---

## 3) Subject Model

### Subjects (initial)
Start with 3–5 subjects to validate patterns:
- Math
- Physics
- Chemistry
- History
- English / Writing

### Subject configuration
Each subject defines:
- Teaching style rules (e.g., math uses steps + checks)
- Allowed tools (calculator/plotter later)
- Citation requirements (especially history/science)
- “Don’t do” constraints (e.g., no full essay writing for exams if policy requires)

Store subject configs as versioned JSON files:
- `subjects/<subjectId>.json`

---

## 4) UX / Product Requirements

### Core screens (web)
- Landing page: value prop + subject picker
- Chat page:
  - Subject header + level selector (optional MVP)
  - Message list
  - Composer (multi-line) + send
  - “Hint / Explain / Practice” quick actions
  - Feedback (thumbs up/down)
- History:
  - List conversations by subject
  - Rename/delete

### Chat behavior requirements
- Streaming responses (nice-to-have early; required later)
- Acknowledge uncertainty; ask clarifying questions
- Prefer hints + explanation before giving final answers
- When the user asks for “just the answer,” subject policy decides whether to comply

### Accessibility
- Keyboard-only navigation
- High contrast mode
- Screen-reader friendly message structure

---

## 5) System Architecture (Web-first, App-ready)

### High-level
- **Frontend:** Web UI (later PWA)
- **Backend:** API server (auth, rate limit, model gateway)
- **Model Provider:** pluggable (OpenAI-compatible first)
- **Storage:** optional MVP (in-memory), then SQLite/Postgres

### Recommended early structure
- One repo, simple server, static UI
- Later split into `apps/web`, `apps/api`, `packages/shared`

### Key backend components
- **Chat API**: `POST /api/chat`
  - input: subjectId, messages, metadata
  - output: assistant message (+ optional sources)
- **Provider gateway**
  - translate internal request → provider request
  - unify response schema
- **Prompt builder**
  - subject system prompt
  - safety policies
  - optional retrieval/citations prompt

---

## 6) Data, Storage, and Memory

### Data types
- Users (optional MVP)
- Conversations
- Messages
- Subject config versions
- Feedback events

### Memory strategy
- MVP: send only last N messages
- V1: conversation summarization + pinned facts
- Future: per-subject knowledge / progress model

---

## 7) Safety, Privacy, and Compliance

### Safety
- Basic moderation layer (provider moderation endpoint or lightweight rules)
- Subject-level policies (e.g., for writing assistance)
- Refuse disallowed requests; offer safe alternatives

### Privacy
- Minimize data stored by default
- Provide delete/export
- Avoid logging raw message content in production by default

### Secrets
- Use `.env` for API keys
- Never ship keys to frontend

---

## 8) Model Strategy

### Providers
- Default: OpenAI-compatible Chat Completions
- Later: multiple providers (Azure OpenAI, local gateway)

### Default free/open-source model (local)
- **Llama 3.2 Instruct (3B)** running locally on the developer machine.
- Served via an **OpenAI-compatible endpoint** (LM Studio recommended on Windows).
- This keeps early development free while preserving a provider-agnostic API design.

Local setup reference:
- See [local-llama-setup.md](local-llama-setup.md)

### Prompt strategy
- System prompt = global + subject config
- Developer messages for formatting constraints (if applicable)
- Output format: markdown with math support (KaTeX in UI later)

### Cost controls
- Limit max tokens
- Rate limit per IP/user
- Cache repeated subject instructions

---

## 9) Roadmap

### Phase 0 — MVP (1–3 days)
- Web UI: subject picker + chat
- Backend API: `/api/chat`
- Provider: stub or single provider
- No auth; in-memory state only

### Phase 1 — Web v1 (1–2 weeks)
- Persistent history (SQLite)
- Feedback logging
- Streaming responses
- Basic moderation

### Phase 2 — PWA (1–2 weeks)
- Installable
- Offline-first static assets
- Push notifications (optional)

### Phase 3 — App (later)
- React Native / Flutter wrapper if needed
- Native capabilities: push, sharing, biometrics, etc.

---

## 10) Open Decisions (fill as you learn)
- Which age/grade range first?
- Subject policies for “give me the answer” requests
- Do we need citations for science/history in MVP?
- Auth: anonymous vs email vs OAuth
- Storage: SQLite vs Postgres
