import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  fetchSubjects,
  sendChatStream,
  getNextQuestion,
  sendFeedback,
  getConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  getProfileNotes,
  createCustomSubject,
  deleteCustomSubject,
  type Subject,
  type ChatMessage,
  type ConversationSummary,
  type SubjectNotes,
} from "./api";
import "./styles.css";

type View = "picker" | "chat" | "profile";

interface MessageWithMeta extends ChatMessage {
  timestamp: Date;
  feedback?: number;
}

export const App: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);

  const [view, setView] = useState<View>("picker");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedSubjectName, setSelectedSubjectName] = useState<string>("");

  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);

  const [profileNotes, setProfileNotes] = useState<SubjectNotes[]>([]);
  const [profileNotesLoading, setProfileNotesLoading] = useState(false);
  const [regeneratingSubjectId, setRegeneratingSubjectId] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<Record<string, string>>({});
  const [allConversations, setAllConversations] = useState<ConversationSummary[]>([]);

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customTeachingStyle, setCustomTeachingStyle] = useState("");
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load subjects on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSubjectsLoading(true);
      try {
        const data = await fetchSubjects();
        if (!cancelled) setSubjects(data);
      } catch {
        if (!cancelled) setSubjects([]);
      } finally {
        if (!cancelled) setSubjectsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When in chat view, load history for subject and next question
  useEffect(() => {
    if (view !== "chat" || !selectedSubjectId) return;
    if (showHistory) {
      getConversations(selectedSubjectId).then(setHistory).catch(() => setHistory([]));
    }
    getNextQuestion(selectedSubjectId).then((r) => setNextQuestion(r.question_text)).catch(() => setNextQuestion(null));
  }, [view, selectedSubjectId, showHistory]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  const handleSelectSubject = (subject: Subject) => {
    setSelectedSubjectId(subject.id);
    setSelectedSubjectName(subject.name);
    setMessages([]);
    setNextQuestion(null);
    setCurrentConversationId(null);
    setView("chat");
  };

  const handleChangeSubject = () => {
    setSelectedSubjectId(null);
    setSelectedSubjectName("");
    setMessages([]);
    setNextQuestion(null);
    setShowHistory(false);
    setCurrentConversationId(null);
    setView("picker");
  };

  const loadHistory = () => {
    if (!selectedSubjectId) return;
    getConversations(selectedSubjectId).then(setHistory).catch(() => setHistory([]));
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedSubjectId || loading) return;

    const userMsg: MessageWithMeta = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    const newMessages: MessageWithMeta[] = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const assistantMsg: MessageWithMeta = {
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      await sendChatStream(
        {
          subject_id: selectedSubjectId,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        },
        (chunk) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant")
              next[next.length - 1] = { ...last, content: last.content + chunk };
            return next;
          });
        }
      );
      getNextQuestion(selectedSubjectId).then((r) => setNextQuestion(r.question_text)).catch(() => {});
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant")
          next[next.length - 1] = {
            ...last,
            content: last.content || "Failed to get response. Check that the API is running.",
          };
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (messageIndex: number, rating: number) => {
    if (!selectedSubjectId) return;
    const message = messages[messageIndex];
    const userQuestion = messageIndex > 0 ? messages[messageIndex - 1]?.content : undefined;
    try {
      await sendFeedback({
        message_index: messageIndex,
        rating,
        subject_id: selectedSubjectId,
        message_content: message.content,
        user_question: userQuestion,
      });
      setMessages((prev) =>
        prev.map((m, i) => (i === messageIndex ? { ...m, feedback: rating } : m))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveConversation = async () => {
    if (!selectedSubjectId || messages.length === 0) return;
    const firstContent = messages[0]?.content || "";
    const title = firstContent.slice(0, 50) + (firstContent.length > 50 ? "..." : "");
    try {
      const res = await saveConversation({
        subject_id: selectedSubjectId,
        title,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      setCurrentConversationId(res.id);
      alert("Conversation saved!");
      loadHistory();
    } catch (err) {
      console.error(err);
      alert("Failed to save conversation.");
    }
  };

  const handleLoadConversation = async (id: number) => {
    try {
      const conv = await getConversation(id);
      setMessages(
        conv.messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: new Date(),
        }))
      );
      setCurrentConversationId(id);
      setShowHistory(false);
    } catch (err) {
      console.error(err);
      alert("Failed to load conversation.");
    }
  };

  const handleDeleteConversation = async (id: number) => {
    if (!confirm("Delete this conversation?")) return;
    try {
      await deleteConversation(id);
      loadHistory();
      setAllConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) {
        setMessages([]);
        setCurrentConversationId(null);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete conversation.");
    }
  };

  const handleUseNextQuestion = () => {
    if (nextQuestion) setInput(nextQuestion);
  };

  const openProfile = () => {
    setView("profile");
    setNotesError({});
    setProfileNotesLoading(true);
    getProfileNotes()
      .then(setProfileNotes)
      .catch(() => setProfileNotes([]))
      .finally(() => setProfileNotesLoading(false));
    getConversations()
      .then(setAllConversations)
      .catch(() => setAllConversations([]));
  };

  const handleRefreshAllNotes = () => {
    setNotesError({});
    setProfileNotesLoading(true);
    getProfileNotes()
      .then(setProfileNotes)
      .catch(() => setProfileNotes([]))
      .finally(() => setProfileNotesLoading(false));
  };

  const handleCreateCustomSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = customName.trim();
    if (!name) {
      setCustomError("Name is required");
      return;
    }
    setCustomError(null);
    setCustomSubmitting(true);
    try {
      const created = await createCustomSubject({
        name,
        description: customDescription.trim() || undefined,
        teaching_style: customTeachingStyle.trim() || undefined,
      });
      setShowCustomModal(false);
      setCustomName("");
      setCustomDescription("");
      setCustomTeachingStyle("");
      setSelectedSubjectId(created.id);
      setSelectedSubjectName(created.name);
      setMessages([]);
      setNextQuestion(null);
      setCurrentConversationId(null);
      setView("chat");
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : "Failed to create subject");
    } finally {
      setCustomSubmitting(false);
    }
  };

  const handleDeleteCustomSubject = async (subjectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this subject? Its saved conversations will also be deleted.")) return;
    try {
      await deleteCustomSubject(subjectId);
      const updated = await fetchSubjects();
      setSubjects(updated);
      if (selectedSubjectId === subjectId) {
        setSelectedSubjectId(null);
        setSelectedSubjectName("");
        setView("picker");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleRegenerateNotes = (subjectId: string) => {
    setRegeneratingSubjectId(subjectId);
    setNotesError((e) => ({ ...e, [subjectId]: "" }));
    getProfileNotes(subjectId)
      .then((data) => {
        setProfileNotes((prev) => {
          const rest = prev.filter((n) => n.subject_id !== subjectId);
          return data.length ? [...rest, data[0]] : rest;
        });
      })
      .catch((err) =>
        setNotesError((e) => ({ ...e, [subjectId]: err instanceof Error ? err.message : "Failed to generate notes" }))
      )
      .finally(() => setRegeneratingSubjectId(null));
  };

  // --- Picker view ---
  if (view === "picker") {
    return (
      <div className="app-root app-picker">
        <header className="app-header">
          <h1>SubjectChat</h1>
          <p className="subtitle">AI tutoring for multiple subjects. Pick a subject or create a custom one.</p>
        </header>
        <main className="picker-main">
          {subjectsLoading && <p className="muted">Loading subjects…</p>}
          <div className="picker-subjects">
            {subjects.map((s) => (
              <div
                key={s.id}
                className="picker-subject-row"
                onClick={() => handleSelectSubject(s)}
              >
                <div className="picker-subject-btn">
                  <span className="picker-subject-name">{s.name}</span>
                  <span className="picker-subject-desc">{s.description}</span>
                </div>
                {s.is_custom && (
                  <button
                    type="button"
                    className="picker-subject-delete"
                    onClick={(e) => handleDeleteCustomSubject(s.id, e)}
                    title="Delete subject"
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="picker-subject-btn picker-custom-trigger"
              onClick={() => setShowCustomModal(true)}
            >
              <span className="picker-subject-name">+ Custom subject</span>
              <span className="picker-subject-desc">Create your own subject and save it for future use.</span>
            </button>
          </div>
        </main>

        {showCustomModal && (
          <div className="modal-overlay" onClick={() => !customSubmitting && setShowCustomModal(false)}>
            <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
              <h3>New custom subject</h3>
              <p className="muted small">Add a subject to use in chat. It will be saved and appear in Profile & Notes when you have saved conversations.</p>
              <form onSubmit={handleCreateCustomSubject}>
                {customError && <p className="notes-error">{customError}</p>}
                <div className="field">
                  <label>Subject name *</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Linear Algebra"
                    required
                  />
                </div>
                <div className="field">
                  <label>Description (optional)</label>
                  <textarea
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    placeholder="What topics or level?"
                    rows={2}
                  />
                </div>
                <div className="field">
                  <label>Teaching style (optional)</label>
                  <textarea
                    value={customTeachingStyle}
                    onChange={(e) => setCustomTeachingStyle(e.target.value)}
                    placeholder="e.g. Many examples, step by step"
                    rows={2}
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCustomModal(false)} disabled={customSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={customSubmitting}>
                    {customSubmitting ? "Creating…" : "Create & open chat"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Profile view ---
  if (view === "profile") {
    return (
      <div className="app-root app-profile">
        <header className="app-header app-header-bar">
          <h2>Profile & Notes</h2>
          <button type="button" className="btn btn-secondary" onClick={() => setView("chat")}>
            Back to Chat
          </button>
        </header>
        <main className="profile-main">
          <section className="profile-section">
            <h3>Notes by subject</h3>
            <p className="muted small">
              Structured notes generated by the LLM from your chat history for each subject (Phase 1).
            </p>
            <div className="profile-notes-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRefreshAllNotes}
                disabled={profileNotesLoading}
              >
                {profileNotesLoading ? "Loading…" : "Refresh all notes"}
              </button>
            </div>
            {!profileNotesLoading && profileNotes.length === 0 && (
              <p className="muted">No notes yet. Save conversations in a subject, then refresh notes.</p>
            )}
            {profileNotes.map((n) => (
              <div key={n.subject_id} className="notes-card">
                <div className="notes-card-header">
                  <h4 className="notes-subject">{n.subject_name}</h4>
                  <button
                    type="button"
                    className="btn quick-action-btn"
                    onClick={() => handleRegenerateNotes(n.subject_id)}
                    disabled={regeneratingSubjectId === n.subject_id}
                  >
                    {regeneratingSubjectId === n.subject_id ? "Generating…" : "Regenerate"}
                  </button>
                </div>
                {notesError[n.subject_id] && (
                  <p className="notes-error">{notesError[n.subject_id]}</p>
                )}
                <div className="notes-content">
                  <ReactMarkdown>{n.notes}</ReactMarkdown>
                </div>
              </div>
            ))}
          </section>
          <section className="profile-section">
            <h3>All conversations</h3>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                getConversations().then(setAllConversations).catch(() => setAllConversations([]))
              }
            >
              Load all
            </button>
            {allConversations.length === 0 && (
              <p className="muted">No saved conversations yet.</p>
            )}
            <div className="conversations-grid">
              {allConversations.map((conv) => (
                <div key={conv.id} className="conv-card">
                  <div className="conv-card-header">
                    <span className="conv-badge">{conv.subject_id}</span>
                    <button
                      type="button"
                      className="btn btn-danger small"
                      onClick={() => handleDeleteConversation(conv.id)}
                    >
                      Delete
                    </button>
                  </div>
                  <h4 className="conv-title">{conv.title}</h4>
                  <p className="conv-meta">
                    {conv.message_count} messages · {new Date(conv.updated_at).toLocaleDateString()}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary full"
                    onClick={() => {
                      handleLoadConversation(conv.id);
                      setView("chat");
                      setSelectedSubjectId(conv.subject_id);
                      const subj = subjects.find((s) => s.id === conv.subject_id);
                      setSelectedSubjectName(subj?.name ?? conv.subject_id);
                    }}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // --- Chat view ---
  return (
    <div className="app-root app-chat">
      <header className="app-header app-header-bar">
        <div className="header-left">
          <h2>SubjectChat — {selectedSubjectName}</h2>
          <button type="button" className="btn btn-secondary" onClick={handleChangeSubject}>
            Change subject
          </button>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setShowHistory((h) => !h);
              if (!showHistory) loadHistory();
            }}
          >
            {showHistory ? "Hide" : "Show"} history
          </button>
          {messages.length > 0 && (
            <button type="button" className="btn btn-save" onClick={handleSaveConversation}>
              Save chat
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={openProfile}>
            Profile
          </button>
        </div>
      </header>

      <div className="chat-layout">
        {showHistory && (
          <aside className="history-sidebar">
            <h3>Past conversations</h3>
            {history.length === 0 && <p className="muted small">No saved conversations yet.</p>}
            {history.map((conv) => (
              <div
                key={conv.id}
                className={`history-item ${currentConversationId === conv.id ? "active" : ""}`}
                onClick={() => handleLoadConversation(conv.id)}
              >
                <div className="history-item-title">{conv.title}</div>
                <div className="history-item-meta">
                  <span>{conv.message_count} msgs</span>
                  <button
                    type="button"
                    className="btn btn-danger small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(conv.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </aside>
        )}

        <div className="chat-area">
          <div className="messages-wrap">
            {messages.length === 0 && (
              <div className="empty-state">
                <p>Ask a {selectedSubjectName} question to start.</p>
              </div>
            )}
            {messages.map((m, i) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={i}
                  className={`message-row ${isUser ? "user" : "assistant"}`}
                >
                  <div className="message-avatar">{isUser ? "You" : "Tutor"}</div>
                  <div className="message-bubble">
                    <div className="message-content">{m.content}</div>
                    <div className="message-meta">
                      <span>{m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {!isUser && (
                        <div className="feedback-btns">
                          <button
                            type="button"
                            className={m.feedback === 1 ? "active" : ""}
                            onClick={() => handleFeedback(i, 1)}
                            title="Helpful"
                          >
                            👍
                          </button>
                          <button
                            type="button"
                            className={m.feedback === -1 ? "active" : ""}
                            onClick={() => handleFeedback(i, -1)}
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
              <div className="message-row assistant">
                <div className="message-avatar">Tutor</div>
                <div className="message-bubble">
                  <div className="typing-dots">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {nextQuestion && (
            <div className="next-question-bar" onClick={handleUseNextQuestion}>
              <span className="next-q-icon">💡</span>
              <span className="next-q-text">{nextQuestion}</span>
              <span className="next-q-hint">Click to use</span>
            </div>
          )}

          <div className="quick-actions">
            <span className="quick-actions-label">Quick actions:</span>
            <button
              type="button"
              className="btn quick-action-btn"
              onClick={() => setInput((prev) => prev + (prev ? " " : "") + "Give me a hint (don't give the full answer yet).")}
            >
              Hint
            </button>
            <button
              type="button"
              className="btn quick-action-btn"
              onClick={() => setInput((prev) => prev + (prev ? " " : "") + "Explain this step by step.")}
            >
              Explain
            </button>
            <button
              type="button"
              className="btn quick-action-btn"
              onClick={() => setInput((prev) => prev + (prev ? " " : "") + "Give me a practice problem on this topic.")}
            >
              Practice
            </button>
          </div>

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
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
              disabled={loading}
            />
            <button type="submit" className="btn btn-send" disabled={loading || !input.trim()}>
              {loading ? "…" : "Send"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
