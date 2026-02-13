const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

// --- Subjects (from GET /api/subjects) ---
export interface Subject {
  id: string;
  name: string;
  description: string;
  conversation_count?: number;
  is_custom?: boolean;
}

export async function fetchSubjects(): Promise<Subject[]> {
  const res = await fetch(`${API_BASE}/api/subjects`);
  if (!res.ok) throw new Error("Failed to load subjects");
  const data = await res.json();
  return data.subjects;
}

export interface CreateCustomSubjectRequest {
  name: string;
  description?: string;
  teaching_style?: string;
}

export async function createCustomSubject(body: CreateCustomSubjectRequest): Promise<Subject> {
  const res = await fetch(`${API_BASE}/api/subjects/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create subject");
  }
  const data = await res.json();
  return { id: data.id, name: data.name, description: data.description || "", is_custom: true };
}

export async function deleteCustomSubject(subjectId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/subjects/${encodeURIComponent(subjectId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete subject");
}

// --- Chat (POST /api/chat - backend with subject_id) ---
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  subject_id: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  assistant: ChatMessage;
  model: string;
  stub: boolean;
}

export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

/**
 * Stream chat response via SSE. Calls onChunk for each content delta; resolves when stream ends.
 */
export async function sendChatStream(
  req: ChatRequest,
  onChunk: (chunk: string) => void
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const obj = JSON.parse(data) as { content?: string };
            if (typeof obj.content === "string") onChunk(obj.content);
          } catch {
            // ignore parse errors
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// --- Next question recommendation ---
export interface NextQuestionResponse {
  question_text: string;
  rationale: string;
  subject_id: string;
  stub: boolean;
}

export async function getNextQuestion(subjectId: string): Promise<NextQuestionResponse> {
  const res = await fetch(
    `${API_BASE}/api/recommendation/next-question?subject_id=${encodeURIComponent(subjectId)}`
  );
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

// --- Feedback ---
export interface FeedbackRequest {
  message_index: number;
  rating: number;
  subject_id: string;
  message_content: string;
  user_question?: string;
}

export interface FeedbackResponse {
  ok: boolean;
  message: string;
  feedback_id?: number;
}

export async function sendFeedback(req: FeedbackRequest): Promise<FeedbackResponse> {
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

// --- Conversations (history) ---
export interface ConversationSummary {
  id: number;
  subject_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationDetail {
  id: number;
  subject_id: string;
  title: string;
  created_at: string;
  messages: ChatMessage[];
}

export interface SaveConversationRequest {
  subject_id: string;
  title: string;
  messages: ChatMessage[];
}

export interface SaveConversationResponse {
  id: number;
  message: string;
}

export async function getConversations(subjectId?: string): Promise<ConversationSummary[]> {
  const url = subjectId
    ? `${API_BASE}/api/conversations?subject_id=${encodeURIComponent(subjectId)}`
    : `${API_BASE}/api/conversations`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export async function getConversation(id: number): Promise<ConversationDetail> {
  const res = await fetch(`${API_BASE}/api/conversations/${id}`);
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export async function saveConversation(
  req: SaveConversationRequest
): Promise<SaveConversationResponse> {
  const res = await fetch(`${API_BASE}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export async function deleteConversation(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
}

// --- Profile notes (LLM-structured notes per subject) ---
export interface SubjectNotes {
  subject_id: string;
  subject_name: string;
  notes: string;
}

/** Fetch LLM-generated notes for all subjects (or one if subjectId is passed). */
export async function getProfileNotes(subjectId?: string): Promise<SubjectNotes[]> {
  const url = subjectId
    ? `${API_BASE}/api/profile/notes?subject_id=${encodeURIComponent(subjectId)}`
    : `${API_BASE}/api/profile/notes`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}
