import { useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc, writeBatch } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { theme } from "../theme";
import { Card, Badge, Spinner, EmptyState } from "../components/UI";

const FOUNDERS = ["Ashley", "Mikal"];

const PILLAR_COLORS = {
  P1: { bg: "rgba(28,74,54,0.1)",    color: theme.primary },
  P2: { bg: "rgba(235,199,100,0.2)", color: "#8a6800" },
  P3: { bg: "rgba(88,176,108,0.12)", color: "#2d7a46" },
  P4: { bg: "rgba(15,52,96,0.1)",    color: "#0F3460" },
};

const getPillarKey = (pillar) => {
  if (!pillar) return "P1";
  const s = String(pillar).toUpperCase();
  if (s.includes("4")) return "P4";
  if (s.includes("3")) return "P3";
  if (s.includes("2")) return "P2";
  return "P1";
};

// Delete event + all subcollections (roster, client_staff)
const deleteEvent = async (eventId) => {
  const batch = writeBatch(db);
  for (const sub of ["roster", "client_staff"]) {
    const snap = await getDocs(collection(db, "events", eventId, sub));
    snap.docs.forEach(d => batch.delete(d.ref));
  }
  batch.delete(doc(db, "events", eventId));
  await batch.commit();
};

function DeleteModal({ event, onConfirm, onCancel, deleting }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: 32, maxWidth: 420, width: "90%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)", fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>🗑️</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#8B0000", marginBottom: 8 }}>
          Delete Event?
        </div>
        <div style={{ fontSize: 14, color: theme.text, marginBottom: 6 }}>
          You're about to permanently delete:
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: theme.primary, marginBottom: 4 }}>
          {event.event_nickname || event.name}
        </div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 20 }}>
          {event.client} · {event.event_date || "No date"}
        </div>
        <div style={{
          fontSize: 12, color: "#8B0000", background: "#FFF5F5", border: "1px solid #ffcccc",
          borderRadius: 8, padding: "10px 14px", marginBottom: 24, lineHeight: 1.6,
        }}>
          This will delete the event and all associated roster and staff data. This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={deleting} style={{
            padding: "9px 20px", borderRadius: 8, border: `1.5px solid ${theme.border}`,
            background: "#fff", color: theme.text, fontWeight: 600, fontSize: 13,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting} style={{
            padding: "9px 20px", borderRadius: 8, border: "none",
            background: "#8B0000", color: "#fff", fontWeight: 700, fontSize: 13,
            cursor: deleting ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif",
            opacity: deleting ? 0.7 : 1,
          }}>
            {deleting ? "Deleting…" : "Yes, Delete Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Events() {
  const navigate   = useNavigate();
  const activeUser = sessionStorage.getItem("axis_name") || "";
  const isFounder  = FOUNDERS.includes(activeUser);

  const [events,       setEvents]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filter,       setFilter]       = useState("active");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "events"));
    setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteEvent(deleteTarget.id);
    setEvents(prev => prev.filter(e => e.id !== deleteTarget.id));
    setDeleting(false);
    setDeleteTarget(null);
  };

  const filtered = events.filter(e =>
    filter === "all" || (e.status || "active") === filter
  );

  const statusColor = (status) => ({
    active:   { bg: theme.successSoft,  color: "#2d7a46" },
    delivery: { bg: theme.successSoft,  color: "#2d7a46" },
    complete: { bg: theme.border,       color: theme.textMuted },
  }[status] || { bg: theme.warningSoft, color: theme.warning });

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh" }}>
      <Spinner size={32} />
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'DM Sans', sans-serif", maxWidth: 900 }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {deleteTarget && (
        <DeleteModal
          event={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Events</h1>
          <div style={{ fontSize: 13, color: theme.textMuted }}>{filtered.length} event{filtered.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { key: "active",   label: "Active" },
            { key: "complete", label: "Complete" },
            { key: "all",      label: "All" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", background: filter === f.key ? theme.primary : "transparent", color: filter === f.key ? theme.onPrimary : theme.textMuted, border: `1px solid ${filter === f.key ? theme.primary : theme.border}`, fontFamily: "'DM Sans', sans-serif" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="◇" title="No events" subtitle="Events appear here once activated from the Activation Queue." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filtered.map(event => {
            const pillar = getPillarKey(event.pillar);
            const pc     = PILLAR_COLORS[pillar];
            const sc     = statusColor(event.status);
            return (
              <Card key={event.id} style={{ cursor: "pointer", position: "relative" }}>
                {/* Color bar */}
                <div style={{ height: 4, borderRadius: "8px 8px 0 0", background: event.theme?.primary || theme.primary, margin: "-20px -22px 16px", marginBottom: 16 }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ flex: 1, paddingRight: 8 }} onClick={() => navigate(`/event/${event.id}`)}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif", marginBottom: 2 }}>
                      {event.event_nickname || event.name || "Unnamed Event"}
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>{event.client}</div>
                  </div>
                  <Badge bg={sc.bg} color={sc.color}>{event.status || "active"}</Badge>
                </div>

                <div onClick={() => navigate(`/event/${event.id}`)}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    <Badge bg={pc.bg} color={pc.color}>{pillar}</Badge>
                    {event.access_code && (
                      <Badge bg={theme.background} color={theme.textMuted}>{event.access_code}</Badge>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      ["Date",      event.event_date],
                      ["Venue",     event.venue],
                      ["Location",  event.location],
                      ["Attendees", event.attendee_count],
                    ].filter(([, v]) => v).map(([label, val]) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>{label}</div>
                        <div style={{ fontSize: 12, color: theme.text }}>{String(val)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>
                    Activated by {event.activated_by || "—"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {isFounder && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(event); }}
                        title="Delete event"
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 14, color: theme.textMuted, padding: "2px 4px",
                          opacity: 0.6, transition: "opacity 0.15s",
                        }}
                        onMouseEnter={e => e.target.style.opacity = 1}
                        onMouseLeave={e => e.target.style.opacity = 0.6}
                      >🗑️</button>
                    )}
                    <div onClick={() => navigate(`/event/${event.id}`)} style={{ fontSize: 12, fontWeight: 700, color: theme.primary, cursor: "pointer" }}>
                      Open Command →
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}