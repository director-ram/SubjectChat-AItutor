import { useState, useRef, useEffect } from "react";
import {
  sendChat,
  getNextQuestion,
  sendFeedback,
  getConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  type ChatMessage,
  type ConversationSummary,
} from "./api";
import "./App.css";

const SUBJECTS = ["Math", "Physics", "Chemistry", "History", "Writing"];

interface MessageWithMeta extends ChatMessage {
  timestamp: Date;
  feedback?: number; // -1, 0, 1
}

function App() {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "profile">("chat");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Smooth scroll with delay for better readability
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        const container = messagesEndRef.current.parentElement;
        if (container) {
          const targetScroll = container.scrollHeight;
          const startScroll = container.scrollTop;
          const distance = targetScroll - startScroll - container.clientHeight;
          
          if (distance > 0) {
            const duration = 800; // Smooth 800ms scroll
            const startTime = performance.now();
            
            const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
            
            const animateScroll = (currentTime: number) => {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easing = easeOutCubic(progress);
              
              container.scrollTop = startScroll + distance * easing;
              
              if (progress < 1) {
                requestAnimationFrame(animateScroll);
              }
            };
            
            requestAnimationFrame(animateScroll);
          }
        }
      }
    };
    
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (selectedSubject && showHistory) {
      loadHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject, showHistory]);

  useEffect(() => {
    // Auto-resize textarea based on content
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 120; // Max 5-6 lines
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + "px";
    }
  }, [input]);

  const loadHistory = async () => {
    if (!selectedSubject) return;
    try {
      const conversations = await getConversations(selectedSubject);
      setHistory(conversations);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubjectChange = (subj: string) => {
    setSelectedSubject(subj);
    setMessages([]);
    setNextQuestion(null);
    setView("chat");
    setShowHistory(false);
    setCurrentConversationId(null);
    fetchNextQuestion(subj);
  };

  const fetchNextQuestion = async (subj: string) => {
    try {
      const res = await getNextQuestion(subj);
      setNextQuestion(res.question_text);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedSubject || loading) return;

    const userMsg: MessageWithMeta = { role: "user", content: input.trim(), timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await sendChat({
        subject_id: selectedSubject,
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
      });
      const assistantMsg: MessageWithMeta = { ...res.assistant, timestamp: new Date() };
      setMessages([...newMessages, assistantMsg]);
      fetchNextQuestion(selectedSubject);
    } catch (err) {
      console.error(err);
      alert("Failed to get response. Check that the API is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (messageIndex: number, rating: number) => {
    if (!selectedSubject) return;
    const message = messages[messageIndex];
    const userQuestion = messageIndex > 0 ? messages[messageIndex - 1]?.content : undefined;
    
    try {
      await sendFeedback({
        message_index: messageIndex,
        rating,
        subject_id: selectedSubject,
        message_content: message.content,
        user_question: userQuestion,
      });
      setMessages(prev => prev.map((m, i) => i === messageIndex ? { ...m, feedback: rating } : m));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveConversation = async () => {
    if (!selectedSubject || messages.length === 0) return;
    const title = messages[0]?.content.slice(0, 50) + (messages[0]?.content.length > 50 ? "..." : "");
    try {
      const res = await saveConversation({
        subject_id: selectedSubject,
        title,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });
      setCurrentConversationId(res.id);
      alert("Conversation saved!");
      loadHistory();
    } catch (err) {
      console.error(err);
      alert("Failed to save conversation");
    }
  };

  const handleLoadConversation = async (id: number) => {
    try {
      const conv = await getConversation(id);
      setMessages(conv.messages.map(m => ({ ...m, timestamp: new Date() })));
      setCurrentConversationId(id);
      setShowHistory(false);
    } catch (err) {
      console.error(err);
      alert("Failed to load conversation");
    }
  };

  const handleDeleteConversation = async (id: number) => {
    if (!confirm("Delete this conversation?")) return;
    try {
      await deleteConversation(id);
      loadHistory();
      if (currentConversationId === id) {
        setMessages([]);
        setCurrentConversationId(null);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete conversation");
    }
  };

  const handleUseNextQuestion = () => {
    if (nextQuestion) {
      setInput(nextQuestion);
    }
  };

  if (!selectedSubject) {
    return (
      <div style={{ padding: "2rem", maxWidth: "600px", margin: "auto" }}>
        <h1 style={{ marginBottom: "1rem" }}>SubjectChat</h1>
        <p style={{ marginBottom: "1.5rem", color: "#64748b" }}>
          AI tutoring for multiple subjects. Pick a subject to start.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {SUBJECTS.map((s) => (
            <button
              key={s}
              onClick={() => handleSubjectChange(s)}
              style={{ padding: "1rem", fontSize: "1.1rem" }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (view === "profile") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <header style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)", color: "white", padding: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}>
          <h2 style={{ margin: 0 }}>Profile & Notes</h2>
          <button
            onClick={() => {
              setView("chat");
              if (selectedSubject) loadHistory();
            }}
            style={{ background: "#334155" }}
          >
            Back to Chat
          </button>
        </header>
        <div style={{ flex: 1, padding: "2rem", overflowY: "auto", background: "#f8fafc" }}>
          <h3 style={{ marginTop: 0 }}>All Conversations</h3>
          <button
            onClick={async () => {
              try {
                const allConvs = await getConversations();
                setHistory(allConvs);
              } catch (err) {
                console.error(err);
              }
            }}
            style={{ marginBottom: "1rem" }}
          >
            Load All Conversations
          </button>
          {history.length === 0 && (
            <p style={{ color: "#64748b" }}>No saved conversations yet. Start chatting and save your conversations!</p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
            {history.map((conv) => (
              <div
                key={conv.id}
                style={{
                  background: "white",
                  borderRadius: "8px",
                  padding: "1.25rem",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.75rem" }}>
                  <span style={{ background: "#dbeafe", color: "#1e40af", padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600 }}>
                    {conv.subject_id}
                  </span>
                  <button
                    onClick={() => handleDeleteConversation(conv.id)}
                    style={{ background: "#ef4444", padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                  >
                    Delete
                  </button>
                </div>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem", lineHeight: 1.4 }}>{conv.title}</h4>
                <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.75rem" }}>
                  {conv.message_count} messages • {new Date(conv.updated_at).toLocaleDateString()}
                </div>
                <button
                  onClick={() => {
                    handleLoadConversation(conv.id);
                    setView("chat");
                  }}
                  style={{ width: "100%", background: "#3b82f6", padding: "0.5rem" }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)", color: "white", padding: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>SubjectChat — {selectedSubject}</h2>
          <button
            onClick={() => setSelectedSubject(null)}
            style={{ background: "#334155", fontSize: "0.9rem" }}
          >
            Change Subject
          </button>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            style={{ background: "#334155", fontSize: "0.9rem" }}
          >
            {showHistory ? "Hide" : "Show"} History
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleSaveConversation}
              style={{ background: "#059669", fontSize: "0.9rem" }}
            >
              💾 Save
            </button>
          )}
          <button
            onClick={() => setView("profile")}
            style={{ background: "#334155", fontSize: "0.9rem" }}
          >
            Profile
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {showHistory && (
          <div style={{ width: "300px", borderRight: "1px solid #cbd5e1", background: "white", overflowY: "auto", padding: "1rem" }}>
            <h3 style={{ marginTop: 0, fontSize: "1rem", marginBottom: "1rem" }}>Past Conversations</h3>
            {history.length === 0 && (
              <p style={{ color: "#64748b", fontSize: "0.9rem" }}>No saved conversations yet.</p>
            )}
            {history.map((conv) => (
              <div
                key={conv.id}
                style={{
                  padding: "0.75rem",
                  marginBottom: "0.5rem",
                  background: currentConversationId === conv.id ? "#dbeafe" : "#f8fafc",
                  borderRadius: "6px",
                  cursor: "pointer",
                  border: "1px solid #e2e8f0",
                }}
                onClick={() => handleLoadConversation(conv.id)}
              >
                <div style={{ fontSize: "0.9rem", fontWeight: 500, marginBottom: "0.25rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {conv.title}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{conv.message_count} msgs</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(conv.id);
                    }}
                    style={{
                      background: "#ef4444",
                      padding: "0.15rem 0.4rem",
                      fontSize: "0.7rem",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", background: "linear-gradient(to bottom, #f8fafc 0%, #f1f5f9 100%)", scrollBehavior: "smooth", scrollPaddingTop: "20px" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: "4rem", color: "#64748b" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>💬</div>
            <p style={{ fontSize: "1.1rem" }}>Ask a {selectedSubject} question to start</p>
          </div>
        )}
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          const time = m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                marginBottom: "1.5rem",
                flexDirection: isUser ? "row-reverse" : "row",
                gap: "0.75rem",
                animation: "slideIn 0.3s ease-out",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: isUser ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "1.2rem",
                }}
              >
                {isUser ? "👤" : "🤖"}
              </div>
              <div style={{ maxWidth: "70%" }}>
                <div
                  style={{
                    background: isUser 
                      ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" 
                      : "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                    color: isUser ? "white" : "#1e293b",
                    padding: "1rem",
                    borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    boxShadow: isUser 
                      ? "0 2px 8px rgba(59, 130, 246, 0.25)" 
                      : "0 2px 12px rgba(0, 0, 0, 0.08)",
                    border: isUser ? "none" : "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{m.content}</div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginTop: "0.5rem",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                  }}
                >
                  <span>{time}</span>
                  {!isUser && (
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <button
                        onClick={() => handleFeedback(i, 1)}
                        style={{
                          background: m.feedback === 1 ? "#22c55e" : "#e2e8f0",
                          color: m.feedback === 1 ? "white" : "#64748b",
                          border: "none",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                        }}
                        title="Helpful"
                      >
                        👍
                      </button>
                      <button
                        onClick={() => handleFeedback(i, -1)}
                        style={{
                          background: m.feedback === -1 ? "#ef4444" : "#e2e8f0",
                          color: m.feedback === -1 ? "white" : "#64748b",
                          border: "none",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                        }}
                        title="Not helpful"
                      >
                        👎
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {loading && (
          <div
            style={{
              display: "flex",
              marginBottom: "1.5rem",
              gap: "0.75rem",
              animation: "slideIn 0.3s ease-out",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: "1.2rem",
              }}
            >
              🤖
            </div>
            <div style={{ maxWidth: "70%" }}>
              <div
                style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                  color: "#1e293b",
                  padding: "1rem",
                  borderRadius: "18px 18px 18px 4px",
                  boxShadow: "0 2px 12px rgba(0, 0, 0, 0.08)",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div className="dot-flashing">
                  <div></div>
                  <div></div>
                  <div></div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", background: "linear-gradient(to top, #ffffff 0%, #f8fafc 100%)", padding: "0.75rem", boxShadow: "0 -2px 12px rgba(0,0,0,0.04)" }}>
        {nextQuestion && (
          <div
            style={{
              background: "linear-gradient(135deg, #fef3c7 0%, #fef9e7 100%)",
              padding: "0.6rem 0.85rem",
              borderRadius: "10px",
              marginBottom: "0.6rem",
              cursor: "pointer",
              border: "1px solid #fde68a",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: "0 2px 8px rgba(252, 211, 77, 0.15)",
            }}
            onClick={handleUseNextQuestion}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(252, 211, 77, 0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(252, 211, 77, 0.15)";
            }}
          >
            <span style={{ fontSize: "1.2rem" }}>💡</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "0.85rem", color: "#92400e", fontWeight: 500 }}>{nextQuestion}</span>
            </div>
            <span style={{ fontSize: "0.75rem", color: "#92400e", opacity: 0.7 }}>Click to use</span>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a question..."
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              padding: "0.75rem",
              borderRadius: "12px",
              border: "2px solid #e2e8f0",
              fontSize: "0.95rem",
              fontFamily: "inherit",
              outline: "none",
              transition: "border-color 0.2s",
              minHeight: "44px",
              maxHeight: "120px",
              overflowY: "auto",
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = "#3b82f6"}
            onBlur={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: loading || !input.trim() ? "#cbd5e1" : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              border: "none",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
              transition: "all 0.2s",
              boxShadow: loading || !input.trim() ? "none" : "0 2px 8px rgba(59, 130, 246, 0.3)",
            }}
            onMouseEnter={(e) => {
              if (!loading && input.trim()) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = loading || !input.trim() ? "none" : "0 2px 8px rgba(59, 130, 246, 0.3)";
            }}
            title={loading ? "Sending..." : "Send message (Enter)"}
          >
            {loading ? (
              <span style={{ color: "white", fontSize: "1.2rem" }}>⏳</span>
            ) : (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: "rotate(45deg)", marginLeft: "2px", marginBottom: "2px" }}
              >
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
