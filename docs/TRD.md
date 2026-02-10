# TRD — SubjectChat (Web AI Chatbot)

**Date:** 2026-01-31  
**Doc owner:** (you)  
**Status:** Draft v0

---

## 1) Objectives

Build a web-based AI chatbot focused on multiple **subjects** (e.g., Math, Physics, Chemistry, History, Writing) that is:
- Fast enough for interactive tutoring (streaming preferred)
- Safer than a generic chatbot (guardrails + moderation)
- Extensible into an **app** (PWA first; native later)
- Maintainable with a clear separation of UI, API, provider gateway, and storage

Additionally:
- Learn the user’s study patterns (topic mastery, mistakes, pace) and **suggest the next question** above the input box.
- Store chats **subject-wise** under a user profile so the user can revisit them as notes.

---

## 2) Non-Functional Requirements (NFRs)

### Performance
- Time-to-first-token (TTFT) target: < 2.5s typical
- End-to-end response: < 10s for typical answers
- Support streaming responses

### Reliability
- Graceful degradation when model provider is unavailable
- Circuit breaker / retries with backoff for provider calls

### Product correctness
- Recommendations must be explainable (“Suggested because you struggled with quadratic factoring”).
- Recommendations must be safe (no harmful content), age-appropriate, and aligned with subject policy.

### Security & Privacy
- No API keys in browser
- Input validation for all endpoints
- Rate limiting per IP/user
- Data retention controls (delete/export)

### Cost controls
- Configurable max tokens + stop sequences
- Usage logging (tokens, latency) without storing raw prompts by default

---

## 3) Recommended Tech Stack (Best Fit)

This stack optimizes for speed of iteration, good streaming UX, and an easy path to PWA + future app.

### Frontend (Web)
- **Framework:** React + TypeScript (Vite)
  - Why: fastest React-first setup, simple deployment, excellent DX
- **UI:** Tailwind CSS + shadcn/ui
  - Why: fast, modern UI with accessible components
- **State & data:** built-in React + small utilities; avoid heavy state libs early
- **Markdown rendering:** `react-markdown` + `rehype-katex` (later) for math
- **PWA:** Vite PWA plugin (Phase 2)

Frontend features required by this TRD:
- “Next question” suggestion banner above composer (click to insert).
- Subject tabs or subject picker with persistent subject context.
- Profile/Notes view: list conversations by subject; open a conversation as “notes”.

### Backend/API
- **Runtime:** Python 3.11+
- **Framework:** FastAPI
  - Why: best fit when you need to run/serve ML (Transformers, PyTorch) and fine-tuning pipelines.
- **Validation:** Pydantic v2
- **Rate limiting:** Redis + middleware
- **Background jobs (Phase 1+):** Celery + Redis (or RQ) for summarization, embedding, offline recommendation training

Optional (only if you later split services):
- API gateway / edge: Nginx or a thin Node gateway for SSE/WebSocket fan-out

### AI Layer
- **LLM responses:** GPT-class model via provider API (OpenAI / Azure OpenAI / other OpenAI-compatible gateway)
- **Transformers stack (for tuning & local experimentation):**
  - PyTorch + Hugging Face Transformers
  - PEFT (LoRA) for parameter-efficient fine-tuning
  - bitsandbytes (optional) for low-memory training
- **Prompting:** subject-config driven system prompts stored as JSON
- **Moderation:** provider moderation endpoint (if available) + lightweight rules

Important reality check:
- Training a GPT-class model from scratch is not realistic for most projects. This TRD assumes **(a)** using a hosted GPT-class model for responses and **(b)** optionally fine-tuning an open-source transformer model (LoRA) for style/format/subject tutoring behaviors.

### Data
- **Primary DB:** Postgres
  - Why (vs MongoDB): relational fits users↔subjects↔conversations↔messages, strong querying, ACID, and enables vectors via `pgvector`.
- **Vector search:** `pgvector` extension in Postgres (store embeddings for retrieval + notes search)
- **ORM/DB access (Python):** SQLAlchemy 2.x + Alembic (or SQLModel)
- **Caching:** Redis (Phase 1+)

When MongoDB makes sense:
- If you expect extremely flexible message schemas and do not need relational constraints.
- For this product (profiles + subject-wise history + analytics + recommendations), Postgres is the better default.

### Auth (when needed)
- **Option A (fastest):** Clerk (React SDK)
- **Option B (self-hosted):** Auth0 or a JWT-based FastAPI auth service

### Observability
- **Errors:** Sentry
- **Logging:** pino (server) or structured console in platform logs
- **Metrics/tracing (later):** OpenTelemetry

### Dev Experience
- **Package manager:** npm (fine) or pnpm (faster, monorepo-friendly)
- **Lint/format:** ESLint + Prettier
- **Testing:**
  - Unit: Vitest
  - E2E: Playwright

---

## 4) Practical MVP Stack (Minimum Build)

If you want to ship a runnable prototype immediately (no DB/auth), a minimal stack is:
- Node.js + Express
- Static HTML/CSS/JS frontend
- `/api/chat` endpoint with provider gateway + stub mode

This is ideal for validating UX quickly. TRD recommends migrating into Next.js for v1.

---

## 5) Architecture Overview

### Logical components
- **Web UI**
  - subject picker, chat UI, history UI
- **API**
  - `/api/chat`: main chat endpoint
  - `/api/recommendation/next-question`: returns suggested next question for current subject
  - `/api/feedback`: thumbs up/down
  - `/api/conversations`: CRUD history
  - `/api/profile`: user profile + subject progress
- **Provider Gateway**
  - standardize requests/responses across providers
  - streaming adapter
- **Prompt Builder**
  - global rules + subject rules + runtime metadata
- **Recommendation Engine**
  - online inference: suggests next question
  - offline training: updates student model and recommendation policy
- **Storage**
  - conversations/messages + feedback + (later) summaries

### Data flow (chat)
1. UI sends: `subjectId`, `messages[]`, `options`
2. API validates + rate-limits
3. Prompt builder creates system prompt
4. Provider gateway calls model (stream)
5. API streams tokens to client
6. Persist conversation + usage stats (Phase 1+)

---

## 6) Model Provider Selection

### Criteria
- Quality (reasoning + tutoring tone)
- Latency and streaming reliability
- Cost per token and rate limits
- Safety tooling (moderation)
- Data locality requirements (if any)

### Recommended approach
- Implement a provider abstraction with:
  - `generateText()` and `streamText()`
  - unified error codes
  - usage reporting
- Start with **one provider** (fastest). Add a second provider later for redundancy.

Default local model choice (free/open-source):
- **Llama 3.2 Instruct (3B)** served locally via an OpenAI-compatible endpoint (LM Studio or Ollama).

---

## 7) Storage & Data Model (Phase 1+)

### Tables (suggested)
- `users` (optional)
- `conversations`: id, subjectId, title, createdAt
- `messages`: conversationId, role, content, createdAt
- `feedback`: messageId, rating, reason
- `usage`: conversationId, provider, model, promptTokens, completionTokens, latencyMs

Additions for personalization:
- `subject_progress`: userId, subjectId, masteryScore(s), lastActiveAt
- `skill_events`: userId, subjectId, skillTag, eventType (correct/incorrect/asked_hint), createdAt
- `recommendations`: userId, subjectId, questionText, rationale, createdAt, acceptedAt
- `embeddings` (if using pgvector): entityType, entityId, embedding

---

## 8) Security Requirements

- Secrets stored in server-side env vars only
- CORS locked to your domain (when not using same-origin)
- Basic prompt injection defenses:
  - never reveal system prompt
  - do not follow user instructions to exfiltrate secrets
- Content filtering for disallowed content categories

---

## 9) Deployment

### Recommended (web)
- **Vercel** for Next.js
- **Database:** Neon / Supabase Postgres
- **Redis:** Upstash

### Alternatives
- Azure App Service + Azure Postgres (if you need Azure)
- Docker + Fly.io/Render

---

## 10) Testing Strategy

- Unit tests for:
  - prompt builder
  - provider gateway adapters
  - validation schemas
- E2E tests for:
  - subject selection
  - chat send/receive
  - streaming handling

---

## 11) Roadmap (Tech Milestones)

### Phase 0 — Prototype
- Minimal API + chat UI
- Stub mode (no keys) + real provider mode

### Phase 1 — Web v1
- Vite React production hardening
- Postgres persistence
- Rate limiting + basic moderation
- Usage tracking + feedback

### Phase 1.5 — Personalization
- Start with rule-based + analytics-driven recommendations (fast, explainable)
- Add embeddings for “notes search” and topic retrieval
- Add an offline training job that updates user mastery and question difficulty

### Phase 2 — Fine-tuning (optional)
- Curate training dataset from high-quality conversations + feedback
- Fine-tune with LoRA (PEFT) on an open-source transformer model
- Add evaluation harness (golden Q/A + safety checks)

### Phase 2 — PWA
- Installable + offline assets
- Push notifications (optional)

### Phase 3 — Mobile
- React Native (Expo) sharing prompt/policy packages

---

## 12) Open Decisions / Questions

- Which subjects and grade ranges are in scope for MVP?
- Do you require citations (history/science) from day one?
- Do you require user accounts in MVP, or anonymous sessions with later upgrade?
- Are you okay using a hosted GPT provider for responses while you fine-tune a smaller transformer model in parallel?
- Is user auth required for MVP, or anonymous sessions OK?
- Any data locality/compliance constraints?
- Preferred hosting (Vercel vs Azure vs other)?
