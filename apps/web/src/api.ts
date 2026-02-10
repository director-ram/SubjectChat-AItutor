const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

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

export interface NextQuestionResponse {
  question_text: string;
  rationale: string;
  subject_id: string;
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

export async function getNextQuestion(subjectId: string): Promise<NextQuestionResponse> {
  const res = await fetch(`${API_BASE}/api/recommendation/next-question?subject_id=${encodeURIComponent(subjectId)}`);
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export interface FeedbackRequest {
  message_index: number;
  rating: number; // -1 = thumbs down, 0 = neutral, 1 = thumbs up
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

export async function saveConversation(req: SaveConversationRequest): Promise<SaveConversationResponse> {
  const res = await fetch(`${API_BASE}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export async function deleteConversation(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversations/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
}

