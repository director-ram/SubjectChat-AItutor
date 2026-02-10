# SubjectChat

A web-based AI tutor chatbot for multiple subjects featuring personalization through study-pattern modeling, next-question suggestions, and subject-wise chat history.

## 🚀 Features

- **Multi-Subject AI Tutoring**: Specialized system prompts for Math, Physics, Chemistry, History, and Writing.
- **Smart Recommendations**: Suggests the next practice question based on your current level and subject.
- **Persistent History**: Chat history is saved to a PostgreSQL database, allowing you to resume sessions or review notes later.
- **Feedback Loop**: Rate AI responses (thumbs up/down) to help improve the tutoring model.
- **Privacy-First (Local LLM)**: Full support for local inference via LM Studio or Ollama (Llama 3.2 support).
- **Responsive UI**: Modern React interface with real-time feedback and generation animations.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, CSS3.
- **Backend**: FastAPI (Python 3.10+), SQLAlchemy (ORM), Pydantic Settings.
- **Data**: PostgreSQL (Primary DB), Redis (Caching/Sessions).
- **Infrastructure**: Docker Compose.

---

## 🏗️ Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Python 3.10+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/)

### 1. Start Infrastructure

Launch the database and cache services:

```powershell
docker compose up -d
```

### 2. Configure Environment

Copy the example environment files and adjust if necessary:

**Backend (`apps/api/`):**
```powershell
cp apps/api/.env.example apps/api/.env
```

**Frontend (`apps/web/`):**
```powershell
cp apps/web/.env.example apps/web/.env
```

### 3. Start the Backend API

```powershell
cd apps/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
*The API will be available at [http://localhost:8000](http://localhost:8000) (Docs: [/docs](/docs))*

### 4. Start the Frontend Web App

```powershell
cd apps/web
npm install
npm run dev
```
*The web app will be available at [http://localhost:5173](http://localhost:5173)*

---

## 🧠 LLM Configuration

SubjectChat supports two modes:

### Local LLM (Recommended)
Run **Llama 3.2** locally via an OpenAI-compatible server like **LM Studio**:
1. Open LM Studio and load a Llama 3.2 GGUF model.
2. Start the Local Server (usually `http://localhost:1234`).
3. Set `OPENAI_BASE_URL=http://localhost:1234/v1` in `apps/api/.env`.

### Stub Mode
If no `OPENAI_BASE_URL` is provided, the API will enter **Stub Mode**, returning helpful placeholders so you can still test the UI and database features without an LLM.

## 📂 Project Structure

- `apps/web`: React + TypeScript frontend (Vite).
- `apps/api`: FastAPI backend with SQLAlchemy models.
- `docs/`: Technical documents, architecture plans, and setup guides.
- `docker-compose.yml`: Infrastructure definition (Postgres, Redis).

