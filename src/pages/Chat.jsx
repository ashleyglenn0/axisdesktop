import { useEffect, useState, useRef } from "react";
import {
  collection, getDocs, addDoc, onSnapshot, query,
  orderBy, serverTimestamp, doc, updateDoc, where, limit,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Spinner } from "../components/UI";

const MM_USERS = ["Ashley", "Mikal", "Shanell"];

// ── Helpers ───────────────────────────────────────────────────────────────────
const initials = (name = "") => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
const timeStr  = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const Avatar = ({ name, size = 32, bg = theme.primary }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%", background: bg,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: size * 0.35, fontWeight: 700, color: "#fff", flexShrink: 0,
    fontFamily: "'DM Sans', sans-serif",
  }}>{initials(name)}</div>
);

const DocCard = ({ doc: d }) => (
  <a href={d.url} target="_blank" rel="noreferrer" style={{
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "6px 12px", borderRadius: 8, marginTop: 6,
    background: "rgba(28,74,54,0.06)", border: "1px solid rgba(28,74,54,0.15)",
    textDecoration: "none", maxWidth: 280,
  }}>
    <span style={{ fontSize: 16 }}>📄</span>
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.primary, lineHeight: 1.2 }}>{d.name}</div>
      <div style={{ fontSize: 10, color: theme.textMuted }}>Click to open in Drive</div>
    </div>
  </a>
);

export default function Chat() {
  const { activeUser } = useAuth();

  // ── Conversations ─────────────────────────────────────────────────────────
  const [conversations,    setConversations]    = useState([]);
  const [activeConvo,      setActiveConvo]      = useState(null);
  const [convoLoading,     setConvoLoading]     = useState(true);
  const [showNewConvo,     setShowNewConvo]     = useState(false);
  const [newConvoName,     setNewConvoName]     = useState("");
  const [newConvoClient,   setNewConvoClient]   = useState("");
  const [creatingConvo,    setCreatingConvo]    = useState(false);

  // ── Messages ──────────────────────────────────────────────────────────────
  const [messages,         setMessages]         = useState([]);
  const [msgLoading,       setMsgLoading]       = useState(false);
  const [input,            setInput]            = useState("");
  const [sending,          setSending]          = useState(false);

  // ── Doc picker ────────────────────────────────────────────────────────────
  const [showDocPicker,    setShowDocPicker]    = useState(false);
  const [libraryDocs,      setLibraryDocs]      = useState([]);
  const [docSearch,        setDocSearch]        = useState("");
  const [docsLoading,      setDocsLoading]      = useState(false);
  const [attachedDoc,      setAttachedDoc]      = useState(null);

  const bottomRef   = useRef(null);
  const unsubRef    = useRef(null);
  const inputRef    = useRef(null);
  // ── Guard against double-create on fast remount ───────────────────────────
  const loadingRef  = useRef(false);

  // ── Load conversations ────────────────────────────────────────────────────
  useEffect(() => {
    // Prevent duplicate execution if effect fires twice (React StrictMode / remount)
    if (loadingRef.current) return;
    loadingRef.current = true;

    const load = async () => {
      setConvoLoading(true);
      const snap = await getDocs(collection(db, "chat_conversations"));
      let convos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // ── Dedup: only create M&M Team thread if none exists (query-first, no race) ──
      const internalThreads = convos.filter(c => c.type === "internal");

      if (internalThreads.length === 0) {
        // Double-check with a direct query before writing (handles concurrent mounts)
        const checkSnap = await getDocs(
          query(collection(db, "chat_conversations"), where("type", "==", "internal"), limit(1))
        );
        if (checkSnap.empty) {
          const ref = await addDoc(collection(db, "chat_conversations"), {
            name:            "M&M Team",
            client_name:     "Internal",
            type:            "internal",
            created_by:      "system",
            created_at:      serverTimestamp(),
            last_message:    null,
            last_message_at: null,
            last_sender:     null,
          });
          convos = [{ id: ref.id, name: "M&M Team", client_name: "Internal", type: "internal" }, ...convos];
        } else {
          // Thread exists in Firestore but wasn't in our initial snap — add it
          convos = [{ id: checkSnap.docs[0].id, ...checkSnap.docs[0].data() }, ...convos];
        }
      } else if (internalThreads.length > 1) {
        // ── Dedup: multiple internal threads exist — keep only the oldest, hide the rest ──
        // Sort by created_at ascending, keep first
        const sorted = [...internalThreads].sort(
          (a, b) => (a.created_at?.seconds || 0) - (b.created_at?.seconds || 0)
        );
        const keepId = sorted[0].id;
        convos = convos.filter(c => c.type !== "internal" || c.id === keepId);
      }

      // Internal thread always pinned first, then client threads by recency
      const internal = convos.filter(c => c.type === "internal");
      const clients  = convos.filter(c => c.type !== "internal")
        .sort((a, b) => (b.last_message_at?.seconds || 0) - (a.last_message_at?.seconds || 0));

      // ── Dedup client threads: one thread per client_id ────────────────────
      // Client portal may have created threads with the same client_id — collapse them
      const seen = new Set();
      const dedupedClients = clients.filter(c => {
        const key = c.client_id || c.id; // use client_id if present, else fall back to thread id
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setConversations([...internal, ...dedupedClients]);
      setConvoLoading(false);
    };
    load();
  }, []);

  // ── Subscribe to messages when convo changes ──────────────────────────────
  useEffect(() => {
    if (unsubRef.current) unsubRef.current();
    if (!activeConvo) return;
    setMsgLoading(true);
    const q = query(
      collection(db, "chat_conversations", activeConvo.id, "messages"),
      orderBy("created_at", "asc")
    );
    unsubRef.current = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setMsgLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    return () => unsubRef.current?.();
  }, [activeConvo?.id]);

  // ── Load library docs for picker ──────────────────────────────────────────
  const openDocPicker = async () => {
    setShowDocPicker(true);
    if (libraryDocs.length > 0) return;
    setDocsLoading(true);
    const [aSnap, dSnap] = await Promise.all([
      getDocs(collection(db, "library_agreements")),
      getDocs(collection(db, "library_documents")),
    ]);
    const all = [
      ...aSnap.docs.map(d => ({ id: d.id, type: "agreement", ...d.data() })),
      ...dSnap.docs.map(d => ({ id: d.id, type: "document",  ...d.data() })),
    ].filter(d => d.url);
    setLibraryDocs(all);
    setDocsLoading(false);
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if ((!input.trim() && !attachedDoc) || !activeConvo || sending) return;
    setSending(true);
    const msg = {
      text:           input.trim() || null,
      sender:         activeUser,
      sender_type:    "mm",
      created_at:     serverTimestamp(),
      doc_attachment: attachedDoc || null,
    };
    await addDoc(
      collection(db, "chat_conversations", activeConvo.id, "messages"),
      msg
    );
    await updateDoc(doc(db, "chat_conversations", activeConvo.id), {
      last_message:    input.trim() || `📄 ${attachedDoc?.name}`,
      last_message_at: serverTimestamp(),
      last_sender:     activeUser,
    });
    setConversations(prev => {
      const updated = prev.map(c =>
        c.id === activeConvo.id
          ? { ...c, last_message: input.trim() || `📄 ${attachedDoc?.name}`, last_sender: activeUser }
          : c
      );
      const internal = updated.filter(c => c.type === "internal");
      const clients  = updated.filter(c => c.type !== "internal")
        .sort((a, b) => (b.last_message_at?.seconds || 0) - (a.last_message_at?.seconds || 0));
      return [...internal, ...clients];
    });
    setInput("");
    setAttachedDoc(null);
    setShowDocPicker(false);
    setSending(false);
    inputRef.current?.focus();
  };

  // ── Create conversation ───────────────────────────────────────────────────
  const createConvo = async () => {
    if (!newConvoName.trim()) return;
    setCreatingConvo(true);
    const ref = await addDoc(collection(db, "chat_conversations"), {
      name:            newConvoName.trim(),
      client_name:     newConvoClient.trim() || newConvoName.trim(),
      created_by:      activeUser,
      created_at:      serverTimestamp(),
      last_message:    null,
      last_message_at: null,
      last_sender:     null,
      type:            "client",
    });
    const newC = {
      id:          ref.id,
      name:        newConvoName.trim(),
      client_name: newConvoClient.trim() || newConvoName.trim(),
      type:        "client",
    };
    setConversations(prev => {
      const internal = prev.filter(c => c.type === "internal");
      const clients  = [newC, ...prev.filter(c => c.type !== "internal")];
      return [...internal, ...clients];
    });
    setActiveConvo(newC);
    setShowNewConvo(false);
    setNewConvoName("");
    setNewConvoClient("");
    setCreatingConvo(false);
  };

  const filteredDocs = libraryDocs.filter(d =>
    !docSearch || d.name.toLowerCase().includes(docSearch.toLowerCase())
  );

  const inputStyle = {
    padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`,
    fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
    color: theme.text, background: "#fff", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* ── Conversation list ─────────────────────────────────────────────── */}
      <div style={{ width: 280, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", background: theme.surface, flexShrink: 0 }}>
        <div style={{ padding: "20px 14px 12px", borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Chat</h2>
            <button onClick={() => setShowNewConvo(v => !v)} style={{
              width: 28, height: 28, borderRadius: "50%", background: theme.primary,
              border: "none", cursor: "pointer", fontSize: 18, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
            }}>+</button>
          </div>

          {showNewConvo && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px", borderRadius: 8, background: theme.background, border: `1px solid ${theme.border}`, marginBottom: 8 }}>
              <input value={newConvoName} onChange={e => setNewConvoName(e.target.value)}
                placeholder="Conversation name *" style={{ ...inputStyle, fontSize: 12 }} />
              <input value={newConvoClient} onChange={e => setNewConvoClient(e.target.value)}
                placeholder="Client name (if different)" style={{ ...inputStyle, fontSize: 12 }} />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={createConvo} disabled={!newConvoName.trim() || creatingConvo} style={{
                  flex: 1, padding: "6px 0", borderRadius: 6, background: theme.primary, color: "#fff",
                  border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                }}>{creatingConvo ? "Creating…" : "Create"}</button>
                <button onClick={() => setShowNewConvo(false)} style={{
                  padding: "6px 10px", borderRadius: 6, background: "none", border: `1px solid ${theme.border}`,
                  fontSize: 12, cursor: "pointer", color: theme.textMuted, fontFamily: "'DM Sans', sans-serif",
                }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Conversation items */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {convoLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner size={20} /></div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: "20px 14px", fontSize: 12, color: theme.textMuted }}>No conversations yet. Create one above.</div>
          ) : (() => {
            const internal = conversations.filter(c => c.type === "internal");
            const clients  = conversations.filter(c => c.type !== "internal");
            const ConvoItem = (c) => (
              <div key={c.id} onClick={() => setActiveConvo(c)}
                style={{
                  padding: "12px 14px", borderBottom: `1px solid ${theme.border}`, cursor: "pointer",
                  background: activeConvo?.id === c.id ? theme.background : theme.surface,
                  borderLeft: activeConvo?.id === c.id ? `3px solid ${theme.primary}` : "3px solid transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar
                    name={c.client_name || c.name}
                    size={34}
                    bg={c.type === "internal" ? theme.primary : theme.secondary}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.name}
                      </div>
                      {c.type === "internal" && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 999, background: "rgba(28,74,54,0.1)", color: theme.primary, flexShrink: 0 }}>INTERNAL</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                      {c.last_message
                        ? <>{c.last_sender && <span style={{ fontWeight: 600 }}>{c.last_sender.split(" ")[0]}: </span>}{c.last_message}</>
                        : <span style={{ fontStyle: "italic" }}>No messages yet</span>
                      }
                    </div>
                  </div>
                  {c.last_message_at && (
                    <div style={{ fontSize: 10, color: theme.textMuted, flexShrink: 0 }}>{timeStr(c.last_message_at)}</div>
                  )}
                </div>
              </div>
            );
            return (
              <>
                {internal.map(c => ConvoItem(c))}
                {clients.length > 0 && (
                  <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${theme.border}`, background: theme.background }}>
                    Clients
                  </div>
                )}
                {clients.map(c => ConvoItem(c))}
              </>
            );
          })()}
        </div>
      </div>

      {/* ── Message thread ────────────────────────────────────────────────── */}
      {!activeConvo ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: theme.background }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 6 }}>Select a conversation</div>
            <div style={{ fontSize: 13, color: theme.textMuted }}>or create a new one to get started</div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: theme.background, minWidth: 0 }}>

          {/* Thread header */}
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${theme.border}`, background: "#fff", display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={activeConvo.client_name || activeConvo.name} size={38} bg={activeConvo.type === "internal" ? theme.primary : theme.secondary} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: theme.primary }}>{activeConvo.name}</div>
              {activeConvo.client_name && activeConvo.client_name !== activeConvo.name && (
                <div style={{ fontSize: 12, color: theme.textMuted }}>{activeConvo.client_name}</div>
              )}
            </div>
            <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
              background: activeConvo.type === "internal" ? "rgba(28,74,54,0.1)" : theme.background,
              color: activeConvo.type === "internal" ? theme.primary : theme.textMuted,
              border: `1px solid ${activeConvo.type === "internal" ? "rgba(28,74,54,0.2)" : theme.border}` }}>
              {activeConvo.type === "internal" ? "M&M Internal" : "Client thread"}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            {msgLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 13, color: theme.textMuted }}>No messages yet — start the conversation.</div>
              </div>
            ) : messages.map(msg => {
              const isMM = msg.sender_type === "mm";
              const isMe = msg.sender === activeUser;
              const senderBg = isMM ? theme.primary : theme.secondary;
              return (
                <div key={msg.id} style={{ display: "flex", gap: 10, flexDirection: isMM ? "row-reverse" : "row", alignItems: "flex-end" }}>
                  <Avatar name={msg.sender || "Client"} size={28} bg={senderBg} />
                  <div style={{ maxWidth: "68%", display: "flex", flexDirection: "column", alignItems: isMM ? "flex-end" : "flex-start" }}>
                    <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3, display: "flex", gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>{isMe ? "You" : msg.sender}</span>
                      <span>{timeStr(msg.created_at)}</span>
                    </div>
                    {msg.text && (
                      <div style={{
                        padding: "9px 13px", borderRadius: isMM ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        background: isMM ? theme.primary : "#fff",
                        border: isMM ? "none" : `1px solid ${theme.border}`,
                        color: isMM ? "#fff" : theme.text,
                        fontSize: 13, lineHeight: 1.5,
                      }}>{msg.text}</div>
                    )}
                    {msg.doc_attachment && <DocCard doc={msg.doc_attachment} />}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Doc picker */}
          {showDocPicker && (
            <div style={{ borderTop: `1px solid ${theme.border}`, background: "#fff", padding: "12px 16px", maxHeight: 240, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Attach from Library</div>
                <button onClick={() => setShowDocPicker(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: theme.textMuted }}>×</button>
              </div>
              <input value={docSearch} onChange={e => setDocSearch(e.target.value)}
                placeholder="Search documents…"
                style={{ ...inputStyle, fontSize: 12, marginBottom: 8 }} />
              <div style={{ overflowY: "auto", flex: 1 }}>
                {docsLoading ? <div style={{ fontSize: 12, color: theme.textMuted }}>Loading…</div>
                : filteredDocs.length === 0 ? <div style={{ fontSize: 12, color: theme.textMuted, fontStyle: "italic" }}>No docs with URLs yet — add links in the Library first.</div>
                : filteredDocs.map(d => (
                  <div key={d.id} onClick={() => { setAttachedDoc({ name: d.name, url: d.url, category: d.category }); setShowDocPicker(false); }}
                    style={{ padding: "7px 8px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}
                    onMouseEnter={e => e.currentTarget.style.background = theme.background}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ fontSize: 14 }}>📄</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{d.name}</div>
                      <div style={{ fontSize: 10, color: theme.textMuted }}>{d.category}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attached doc preview */}
          {attachedDoc && (
            <div style={{ padding: "8px 24px", borderTop: `1px solid ${theme.border}`, background: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>📄</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.primary, flex: 1 }}>{attachedDoc.name}</span>
              <button onClick={() => setAttachedDoc(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: theme.textMuted }}>×</button>
            </div>
          )}

          {/* Compose */}
          <div style={{ padding: "12px 24px", borderTop: `1px solid ${theme.border}`, background: "#fff", display: "flex", gap: 10, alignItems: "flex-end" }}>
            <button onClick={openDocPicker} title="Attach from Library"
              style={{ padding: "9px 11px", borderRadius: 8, border: `1.5px solid ${theme.border}`, background: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0, color: theme.textMuted }}
            >📎</button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              rows={1}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${theme.border}`,
                fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "none",
                color: theme.text, lineHeight: 1.5, maxHeight: 120, overflowY: "auto",
              }}
            />
            <button onClick={sendMessage} disabled={(!input.trim() && !attachedDoc) || sending}
              style={{
                padding: "9px 18px", borderRadius: 10, background: theme.primary, color: "#fff",
                border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", flexShrink: 0,
                opacity: (!input.trim() && !attachedDoc) || sending ? 0.5 : 1,
              }}
            >{sending ? "…" : "Send"}</button>
          </div>
        </div>
      )}
    </div>
  );
}