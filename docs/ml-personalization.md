# ML Personalization Plan — Study Pattern + Next Question

**Date:** 2026-01-31

This document defines how we model a learner’s study behavior and generate the “Next Question” suggestion shown above the chat input.

---

## 1) What we’re predicting

### Primary output (MVP)
- A single suggested question:
  - `questionText`
  - `difficulty`
  - `skillTags` (e.g., algebra.factorization)
  - `rationale` (human-readable; shown in UI)

### Secondary outputs (later)
- Top 3 suggestions
- “Suggested next topic” and “Suggested review topic”

---

## 2) Data we log (minimum)

From each chat session:
- SubjectId
- Timestamped messages
- User actions: requested hint, requested solution, asked to practice, etc.
- Lightweight labels (derived or explicit):
  - correct/incorrect (if the user answered)
  - confusion signals (e.g., “I don’t understand”, repeated follow-ups)
  - difficulty estimate (heuristic first)

Privacy note: avoid storing raw content in analytics logs by default; store content in chat history only.

---

## 3) MVP Recommendation (rule-based + explainable)

Start with a deterministic policy:
- Track recent skill tags inferred from the conversation.
- If user struggles on a skill (many clarifications / incorrect / hint), suggest an easier practice question on same skill.
- If user succeeds (correct / short follow-up), suggest slightly harder or next prerequisite skill.

Implementation approach:
- Use the LLM (default local: **Llama 3.2 Instruct (3B)**) to produce a structured JSON “session summary” after each assistant response:
  - `skillTags`, `difficulty`, `masteryDelta`, `suggestedNextQuestion`
- Store `skill_events` and `recommendations`.

This gets you working personalization without any training.

---

## 4) Phase 1.5 (light ML)

When you have enough events per subject:
- Train a simple model per subject:
  - Logistic regression / gradient boosting on features like time, skill tag frequency, hint usage
  - Predict probability of mastery / next best skill

This is fast, cheap, and very explainable.

---

## 5) Phase 2 (Transformers + fine-tuning)

### What to fine-tune
Do NOT try to train a GPT-class model from scratch.

Do fine-tune:
- A smaller open-source transformer (via LoRA/PEFT) for:
  - tutoring style
  - structured outputs (skill tags, difficulty, next question)
  - consistent subject formatting

Keep the main “long answer” response on a hosted GPT-class model if needed.

### Training data sources
- High-quality conversations (human-reviewed)
- Thumbs-up messages
- Curated Q/A pairs per subject

### Evaluation
- Golden set per subject: 200–500 prompts
- Metrics:
  - hallucination rate
  - correctness (manual or rubric scoring)
  - adherence to output schema
  - safety refusals correctness

---

## 6) Serving architecture

Online serving:
- `/api/recommendation/next-question`
  - reads recent `skill_events` and conversation context
  - outputs suggestion + rationale

Offline jobs:
- Nightly job updates `subject_progress` and recommendation policy parameters

---

## 7) UI behavior

- Suggestion banner appears above composer.
- Clicking inserts question into input.
- User can dismiss; store dismissal for personalization.
