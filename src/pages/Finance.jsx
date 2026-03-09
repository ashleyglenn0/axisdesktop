import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { theme } from "../theme";
import { Card, Spinner } from "../components/UI";

// ── Swap these out when accounts are live ─────────────────────────────────────
const LINKS = {
  stripe:  { url: "", label: "Stripe Dashboard",  note: "Payment collection — add URL when Stripe is set up" },
  gusto:   { url: "", label: "Gusto Dashboard",   note: "Contractor payouts — add URL when Gusto is set up" },
  wave:    { url: "", label: "Wave Dashboard",    note: "Accounting — add URL when Wave is set up" },
};

const PLATFORM_COLORS = {
  stripe: { bg: "rgba(99,91,255,0.08)", color: "#635BFF", border: "rgba(99,91,255,0.2)" },
  gusto:  { bg: "rgba(244,95,66,0.08)", color: "#F45F42", border: "rgba(244,95,66,0.2)" },
  wave:   { bg: "rgba(0,160,130,0.08)", color: "#00A082", border: "rgba(0,160,130,0.2)" },
};

const PLATFORM_ICONS = { stripe: "💳", gusto: "💸", wave: "📊" };

function PlatformCard({ id, data }) {
  const pc = PLATFORM_COLORS[id];
  return (
    <div style={{
      padding: "20px 24px", borderRadius: 12,
      border: `1.5px solid ${pc.border}`, background: pc.bg,
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>{PLATFORM_ICONS[id]}</span>
          <div style={{ fontSize: 15, fontWeight: 700, color: pc.color }}>{data.label}</div>
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted }}>{data.note}</div>
      </div>
      {data.url ? (
        <a href={data.url} target="_blank" rel="noreferrer" style={{
          padding: "8px 18px", borderRadius: 8, background: pc.color, color: "#fff",
          fontWeight: 700, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap",
          fontFamily: "'DM Sans', sans-serif",
        }}>Open ↗</a>
      ) : (
        <span style={{
          padding: "8px 18px", borderRadius: 8, background: theme.border,
          color: theme.textMuted, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
        }}>URL Pending</span>
      )}
    </div>
  );
}

export default function Finance() {
  const [events,          setEvents]          = useState([]);
  const [selectedEvent,   setSelectedEvent]   = useState("");
  const [contractors,     setContractors]     = useState([]);
  const [loadingPayout,   setLoadingPayout]   = useState(false);
  const [eventsLoading,   setEventsLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "events"));
      const evts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(e => e.status !== "archived")
        .sort((a, b) => (b.event_date || "").localeCompare(a.event_date || ""));
      setEvents(evts);
      setEventsLoading(false);
    };
    load();
  }, []);

  const loadContractors = async (eventId) => {
    setSelectedEvent(eventId);
    if (!eventId) { setContractors([]); return; }
    setLoadingPayout(true);
    const snap = await getDocs(collection(db, "events", eventId, "roster"));
    const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setContractors(all.filter(r => r.type === "contractor"));
    setLoadingPayout(false);
  };

  const totalPayout = contractors.reduce((sum, c) => {
    const rate = parseFloat(String(c.rate || "0").replace(/[^0-9.]/g, "")) || 0;
    return sum + rate;
  }, 0);

  const selectedEventName = events.find(e => e.id === selectedEvent)?.event_nickname
    || events.find(e => e.id === selectedEvent)?.name || "";

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'DM Sans', sans-serif", maxWidth: 900 }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Finance</h1>
        <div style={{ fontSize: 13, color: theme.textMuted }}>Payments, payouts, and accounting</div>
      </div>

      {/* ── Platform Links ─────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Platforms</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 36 }}>
        {Object.entries(LINKS).map(([id, data]) => (
          <PlatformCard key={id} id={id} data={data} />
        ))}
      </div>

      {/* ── Contractor Payout Summary ──────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Contractor Payout Summary</div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
          Select an event to see which contractors need to be paid and their agreed rates. Use this as your reference before processing payouts in Gusto.
        </div>

        {/* Event selector */}
        {eventsLoading ? <Spinner size={20} /> : (
          <select
            value={selectedEvent}
            onChange={e => loadContractors(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${theme.border}`,
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
              color: theme.text, background: "#fff", marginBottom: 20, width: "100%",
              maxWidth: 400,
            }}
          >
            <option value="">— Select an event —</option>
            {events.map(e => (
              <option key={e.id} value={e.id}>
                {e.event_nickname || e.name} {e.event_date ? `· ${e.event_date}` : ""}
              </option>
            ))}
          </select>
        )}

        {/* Payout table */}
        {loadingPayout && <Spinner size={20} />}
        {!loadingPayout && selectedEvent && contractors.length === 0 && (
          <div style={{ fontSize: 13, color: theme.textMuted, padding: "12px 0" }}>
            No contractors on the roster for this event.
          </div>
        )}
        {!loadingPayout && contractors.length > 0 && (
          <>
            {/* Summary bar */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px", borderRadius: 8, background: theme.background,
              border: `1px solid ${theme.border}`, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: theme.textMuted }}>
                <span style={{ fontWeight: 700, color: theme.text }}>{contractors.length}</span> contractor{contractors.length !== 1 ? "s" : ""} · {selectedEventName}
              </div>
              <div>
                <span style={{ fontSize: 11, color: theme.textMuted, marginRight: 6 }}>Est. Total Payout</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: theme.primary }}>
                  {totalPayout > 0 ? `$${totalPayout.toLocaleString()}` : "—"}
                </span>
              </div>
            </div>

            {/* Contractor rows */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                  {["Name", "Role", "Engagement Window", "Rate", "Status"].map(h => (
                    <th key={h} style={{ padding: "6px 12px 8px 0", textAlign: "left", fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contractors.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${theme.border}`, background: i % 2 === 0 ? "#fff" : theme.background }}>
                    <td style={{ padding: "10px 12px 10px 0", fontWeight: 600, color: theme.text }}>{c.name || "—"}</td>
                    <td style={{ padding: "10px 12px 10px 0", color: theme.textMuted }}>{c.role || "—"}</td>
                    <td style={{ padding: "10px 12px 10px 0", color: theme.textMuted, fontSize: 12 }}>{c.engagement_window || "—"}</td>
                    <td style={{ padding: "10px 12px 10px 0", fontWeight: 700, color: c.rate ? theme.primary : theme.textMuted }}>
                      {c.rate || <span style={{ fontStyle: "italic", fontWeight: 400 }}>Not set</span>}
                    </td>
                    <td style={{ padding: "10px 12px 10px 0" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                        background: c.checked_in ? "rgba(45,122,70,0.1)" : "rgba(150,150,150,0.1)",
                        color: c.checked_in ? "#2d7a46" : theme.textMuted,
                      }}>{c.checked_in ? "Checked In" : "Not Checked In"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Gusto CTA */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                Ready to process? Open Gusto and use this list as your reference.
              </div>
              {LINKS.gusto.url ? (
                <a href={LINKS.gusto.url} target="_blank" rel="noreferrer" style={{
                  padding: "8px 16px", borderRadius: 8, background: "#F45F42", color: "#fff",
                  fontWeight: 700, fontSize: 12, textDecoration: "none", fontFamily: "'DM Sans', sans-serif",
                }}>Open Gusto ↗</a>
              ) : (
                <span style={{ fontSize: 12, color: theme.textMuted, fontStyle: "italic" }}>Gusto URL pending</span>
              )}
            </div>
          </>
        )}
      </Card>

      {/* ── Quick Links ────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Quick Actions</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {[
          { label: "Create Payment Link",   icon: "🔗", platform: "stripe",  action: "Create a Stripe payment link to send to a client for deposit or balance." },
          { label: "Send Invoice",          icon: "📄", platform: "wave",    action: "Generate and send a client invoice from Wave." },
          { label: "Add Contractor",        icon: "➕", platform: "gusto",   action: "Onboard a new contractor in Gusto for direct deposit." },
          { label: "View Reports",          icon: "📊", platform: "wave",    action: "Pull financial reports and P&L from Wave." },
        ].map(item => {
          const pc  = PLATFORM_COLORS[item.platform];
          const url = LINKS[item.platform]?.url;
          return (
            <div key={item.label} style={{
              padding: "16px", borderRadius: 10, border: `1px solid ${theme.border}`,
              background: "#fff", display: "flex", flexDirection: "column", gap: 6,
            }}>
              <div style={{ fontSize: 18 }}>{item.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{item.label}</div>
              <div style={{ fontSize: 11, color: theme.textMuted, flex: 1 }}>{item.action}</div>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" style={{
                  fontSize: 11, fontWeight: 700, color: pc.color, textDecoration: "none", marginTop: 4,
                }}>Open {item.platform.charAt(0).toUpperCase() + item.platform.slice(1)} ↗</a>
              ) : (
                <span style={{ fontSize: 11, color: theme.textMuted, fontStyle: "italic", marginTop: 4 }}>
                  URL pending
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}