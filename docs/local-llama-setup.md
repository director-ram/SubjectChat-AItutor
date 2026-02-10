# Local Llama 3.2 Setup (Windows)

This project can run fully locally using a free/open-source model (Llama 3.2) served via an **OpenAI-compatible** endpoint.

---

## Option A (recommended): LM Studio

1) Install LM Studio.
2) Download a Llama 3.2 Instruct model (3B recommended for RTX 4050 6GB).
   - Pick a GGUF quant like Q4.
3) Start the **Local Server** in LM Studio and enable the **OpenAI-compatible** API.
   - Default is usually: `http://localhost:1234/v1`

Configure your `.env` (copy from `.env.example`):
- `OPENAI_BASE_URL=http://localhost:1234/v1`
- `OPENAI_MODEL=<model name shown by LM Studio>`
- `OPENAI_API_KEY=` (LM Studio typically doesn’t require a key)

---

## Option B: Ollama (if you prefer)

1) Install Ollama for Windows.
2) Pull the model:
- `ollama pull llama3.2`

If you run an OpenAI-compatible gateway in front of Ollama, set `OPENAI_BASE_URL` to that gateway’s `/v1` URL and `OPENAI_MODEL` to `llama3.2`.

---

## Quick verification

With the API running, test:
- `GET /health`
- `POST /api/chat`

If `OPENAI_BASE_URL` is not set, the API returns a helpful **stub mode** response.
