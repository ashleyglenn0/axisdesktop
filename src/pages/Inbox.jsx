import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc, doc, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { theme } from "../theme";
import { Card, Button, Spinner } from "../components/UI";

const TABS = [
  { key: "change_requests", label: "Change Requests" },
  { key: "feedback",        label: "Feedback" },
];

const STATUS_COLORS = {
  pending:  { bg: "#fff8e6", text: "#8a6800", border: "#f0d080" },
  approved: { bg: "#e6f4ec", text: "#2d7a46", border: "#b6dfc4" },
  declined: { bg: "#fdecea", text: "#c0392b", border: "#f5b7b1" },
  reviewed: { bg: "#e8f0fe", text: "#2563eb", border: "#bfdbfe" },
};

export default function Inbox() {
  const [activeTab,    setActiveTab]    = useState("change_requests");
  const [loading,      setLoading]      = useState(true);
  const [items,        setItems]        = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [notes,        setNotes]        = useState("");
  const [saving,       setSaving]       = useState(false);

  useEffect(() => { load(); }, [activeTab]);

  const load = async () => {
    setLoading(true);
    setSelected(null);
    const snap = await getDocs(query(collection(db, activeTab), orderBy("created_at", "desc")));
    setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const handleSelect = (item) => {
    setSelected(item);
    setNotes(item.internal_notes || "");
  };

  const updateStatus = async (status) => {
    if (!selected) return;
    setSaving(true);
    await updateDoc(doc(db, activeTab, selected.id), {
      status,
      internal_notes: notes,
      resolved_at: new Date().toISOString(),
    });
    setSelected(prev => ({ ...prev, status, internal_notes: notes }));
    setItems(prev => prev.map(i => i.id === selected.id ? { ...i, status, internal_notes: notes } : i));
    setSaving(false);
  };

  const saveNotes = async () => {
    if (!selected) return;
    setSaving(true);
    await updateDoc(doc(db, activeTab, selected.id), { internal_notes: notes });
    setSelected(prev => ({ ...prev, internal_notes: notes }));
    setItems(prev => prev.map(i => i.id === selected.id ? { ...i, internal_notes: notes } : i));
    setSaving(false);
  };

  const pendingCount = items.filter(i => i.status === "pending").length;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* Left list */}
      <div style={{ width: 300, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", background: theme.surface, flexShrink: 0 }}>
        <div style={{ padding: "20px 14px 12px", borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Inbox</h2>
            {pendingCount > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: theme.danger, color: "#fff" }}>{pendingCount}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: activeTab === t.key ? theme.primary : "transparent",
                  color: activeTab === t.key ? "#fff" : theme.textMuted,
                  border: `1px solid ${activeTab === t.key ? theme.primary : theme.border}`,
                  fontFamily: "'DM Sans', sans-serif" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner size={24} /></div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 13, color: theme.textMuted }}>Nothing here yet.</div>
            </div>
          ) : items.map(item => {
            const sc = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
            return (
              <div key={item.id} onClick={() => handleSelect(item)}
                style={{ padding: "12px 14px", borderBottom: `1px solid ${theme.border}`, cursor: "pointer",
                  background: selected?.id === item.id ? theme.background : theme.surface,
                  borderLeft: selected?.id === item.id ? `3px solid ${theme.primary}` : "3px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, flex: 1, paddingRight: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.client_name || item.org_name || "Unknown Client"}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {item.status || "pending"}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.event_name || item.subject || "—"}
                </div>
                <div style={{ fontSize: 10, color: theme.textMuted }}>
                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", background: theme.background }}>
        {!selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: theme.textMuted, fontSize: 13 }}>
            Select an item to review
          </div>
        ) : (
          <div style={{ maxWidth: 680 }}>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
                  {selected.client_name || selected.org_name || "Unknown Client"}
                </h2>
                {(() => {
                  const sc = STATUS_COLORS[selected.status] || STATUS_COLORS.pending;
                  return (
                    <div style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                      {selected.status || "pending"}
                    </div>
                  );
                })()}
              </div>
              <div style={{ fontSize: 13, color: theme.textMuted }}>
                {selected.event_name || selected.subject || "—"} · {selected.created_at ? new Date(selected.created_at).toLocaleDateString() : "—"}
              </div>
            </div>

            {/* Submission content */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                {activeTab === "change_requests" ? "Change Request Details" : "Feedback"}
              </div>

              {activeTab === "change_requests" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {selected.change_type && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", marginBottom: 2 }}>Type</div>
                      <div style={{ fontSize: 13, color: theme.text }}>{selected.change_type}</div>
                    </div>
                  )}
                  {selected.description && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", marginBottom: 2 }}>Description</div>
                      <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.6 }}>{selected.description}</div>
                    </div>
                  )}
                  {selected.requested_by && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", marginBottom: 2 }}>Requested By</div>
                      <div style={{ fontSize: 13, color: theme.text }}>{selected.requested_by}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {selected.rating && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", marginBottom: 2 }}>Rating</div>
                      <div style={{ fontSize: 20 }}>{"★".repeat(selected.rating)}{"☆".repeat(5 - selected.rating)}</div>
                    </div>
                  )}
                  {selected.message && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", marginBottom: 2 }}>Message</div>
                      <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.6 }}>{selected.message}</div>
                    </div>
                  )}
                  {selected.nps_score !== undefined && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", marginBottom: 2 }}>NPS Score</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: selected.nps_score >= 9 ? "#2d7a46" : selected.nps_score >= 7 ? "#E07B2A" : theme.danger }}>{selected.nps_score}/10</div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Internal notes */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Internal Notes</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Add internal notes, decisions, SOW update reminders…"
                style={{ width: "100%", minHeight: 80, padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "vertical", boxSizing: "border-box", color: theme.text }} />
              <Button size="sm" variant="outline" onClick={saveNotes} disabled={saving} style={{ marginTop: 8 }}>
                {saving ? "Saving…" : "Save Notes"}
              </Button>
            </Card>

            {/* Actions */}
            {activeTab === "change_requests" ? (
              <Card>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Decision</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button onClick={() => updateStatus("approved")} disabled={saving || selected.status === "approved"}>
                    ✓ Approve
                  </Button>
                  <Button variant="danger" onClick={() => updateStatus("declined")} disabled={saving || selected.status === "declined"}>
                    ✗ Decline
                  </Button>
                  <Button variant="outline" onClick={() => updateStatus("pending")} disabled={saving || selected.status === "pending"}>
                    Reset to Pending
                  </Button>
                </div>
                {selected.status === "approved" && (
                  <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#e6f4ec", border: "1px solid #b6dfc4", fontSize: 12, color: "#2d7a46", fontWeight: 600 }}>
                    ✓ Approved — remember to update the SOW to reflect this change.
                  </div>
                )}
              </Card>
            ) : (
              <Card>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Mark As</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button onClick={() => updateStatus("reviewed")} disabled={saving || selected.status === "reviewed"}>
                    Mark Reviewed
                  </Button>
                  <Button variant="outline" onClick={() => updateStatus("pending")} disabled={saving || selected.status === "pending"}>
                    Reset to Pending
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}