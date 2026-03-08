import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { theme } from "../theme";
import { Card, Badge, Spinner, EmptyState } from "../components/UI";

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

export default function Events() {
  const navigate = useNavigate();
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("active");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "events"));
    setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
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
              <Card key={event.id} onClick={() => navigate(`/event/${event.id}`)} style={{ cursor: "pointer" }}>
                {/* Color bar */}
                <div style={{ height: 4, borderRadius: "8px 8px 0 0", background: event.theme?.primary || theme.primary, margin: "-20px -22px 16px", marginBottom: 16 }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ flex: 1, paddingRight: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif", marginBottom: 2 }}>
                      {event.event_nickname || event.name || "Unnamed Event"}
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>{event.client}</div>
                  </div>
                  <Badge bg={sc.bg} color={sc.color}>{event.status || "active"}</Badge>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  <Badge bg={pc.bg} color={pc.color}>{pillar}</Badge>
                  {event.access_code && (
                    <Badge bg={theme.background} color={theme.textMuted}>{event.access_code}</Badge>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    ["Date",     event.event_date],
                    ["Venue",    event.venue],
                    ["Location", event.location],
                    ["Attendees",event.attendee_count],
                  ].filter(([, v]) => v).map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>{label}</div>
                      <div style={{ fontSize: 12, color: theme.text }}>{String(val)}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>
                    Activated by {event.activated_by || "—"}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.primary }}>
                    Open Command →
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