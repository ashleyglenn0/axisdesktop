import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Spinner } from "../components/UI";

const FOUNDERS      = ["Ashley", "Mikal"];
const REVENUE_ACCESS = ["Ashley", "Mikal"]; // Shanell excluded from revenue cards

// ── Mini chart helpers ────────────────────────────────────────────────────────
const Bar = ({ pct, color = theme.primary, height = 8 }) => (
  <div style={{ width: "100%", height, borderRadius: 999, background: theme.border, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, pct || 0)}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.4s ease" }} />
  </div>
);

const StatCard = ({ label, value, sub, color, icon }) => (
  <div style={{ padding: "18px 20px", borderRadius: 12, background: "#fff", border: `1px solid ${theme.border}` }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
    </div>
    <div style={{ fontSize: 26, fontWeight: 700, color: color || theme.primary, marginBottom: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: theme.textMuted }}>{sub}</div>}
  </div>
);

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, marginTop: 28 }}>{children}</div>
);

export default function Analytics() {
  const { activeUser } = useAuth();
  const canSeeRevenue = REVENUE_ACCESS.includes(activeUser);

  const [loading,   setLoading]   = useState(true);
  const [events,    setEvents]    = useState([]);
  const [checkIns,  setCheckIns]  = useState([]);
  const [checkOuts, setCheckOuts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [roster,    setRoster]    = useState([]); // flattened across all events

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [evSnap, ciSnap, coSnap, irSnap] = await Promise.all([
      getDocs(collection(db, "events")),
      getDocs(collection(db, "check_ins")),
      getDocs(collection(db, "check_outs")),
      getDocs(collection(db, "incident_reports")),
    ]);

    const evts = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setEvents(evts);
    setCheckIns(ciSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setCheckOuts(coSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setIncidents(irSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    // Load rosters for all events
    const rosterSnaps = await Promise.all(evts.map(e => getDocs(collection(db, "events", e.id, "roster"))));
    const allRoster = rosterSnaps.flatMap((snap, i) =>
      snap.docs.map(d => ({ ...d.data(), eventId: evts[i].id, eventName: evts[i].event_nickname || evts[i].name }))
    );
    setRoster(allRoster);
    setLoading(false);
  };

  // ── Derived metrics ───────────────────────────────────────────────────────
  const totalEvents    = events.length;
  const activeEvents   = events.filter(e => e.status === "active").length;
  const totalCheckIns  = checkIns.length;
  const totalRostered  = roster.length;
  const overallAttRate = totalRostered > 0 ? Math.round((totalCheckIns / totalRostered) * 100) : 0;
  const totalIncidents = incidents.length;
  const openIncidents  = incidents.filter(i => i.status !== "resolved" && i.status !== "closed").length;

  const totalRevenue   = events.reduce((sum, e) => {
    const v = parseFloat(String(e.confirmed_price || "0").replace(/[^0-9.]/g, "")) || 0;
    return sum + v;
  }, 0);

  // Per-event attendance
  const perEventStats = events.map(e => {
    const rostered  = roster.filter(r => r.eventId === e.id).length;
    const checkedIn = checkIns.filter(c => c.eventId === e.id).length;
    const rate      = rostered > 0 ? Math.round((checkedIn / rostered) * 100) : 0;
    const price     = parseFloat(String(e.confirmed_price || "0").replace(/[^0-9.]/g, "")) || 0;
    const evtIncidents = incidents.filter(i => i.event === (e.event_nickname || e.name)).length;
    return { ...e, rostered, checkedIn, rate, price, evtIncidents };
  }).filter(e => e.rostered > 0)
    .sort((a, b) => b.rate - a.rate);

  // Volunteer leaderboard — by events completed
  const volunteerMap = {};
  roster.filter(r => !r.isContractor).forEach(r => {
    const key = r.uid || r.name;
    if (!key) return;
    if (!volunteerMap[key]) volunteerMap[key] = { name: r.name || key, events: 0, checkedIn: 0 };
    volunteerMap[key].events++;
    if (checkIns.find(c => c.uid === r.uid && c.eventId === r.eventId)) volunteerMap[key].checkedIn++;
  });
  const volunteerBoard = Object.values(volunteerMap)
    .map(v => ({ ...v, reliability: v.events > 0 ? Math.round((v.checkedIn / v.events) * 100) : 0 }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 8);

  // Incident breakdown by category
  const incidentByCategory = incidents.reduce((acc, i) => {
    const cat = i.category || "Uncategorized";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const incidentCats = Object.entries(incidentByCategory).sort((a, b) => b[1] - a[1]);

  // Check-in timing (early / on-time / late buckets — rough approximation)
  const avgCheckInsBefore  = checkIns.filter(c => c.early).length;
  const avgCheckInsOnTime  = checkIns.filter(c => !c.early && !c.late).length;
  const avgCheckInsLate    = checkIns.filter(c => c.late).length;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <Spinner size={32} />
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'DM Sans', sans-serif", maxWidth: 1100 }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Analytics</h1>
        <div style={{ fontSize: 13, color: theme.textMuted }}>Cross-event performance · Internal only</div>
      </div>

      {/* ── Top stats ───────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 8 }}>
        <StatCard label="Total Events"       value={totalEvents}           sub={`${activeEvents} active`}          icon="◉" />
        <StatCard label="Total Check-ins"    value={totalCheckIns}         sub={`${overallAttRate}% avg attendance`} icon="✓" color="#2d7a46" />
        <StatCard label="Total Rostered"     value={totalRostered}         sub="across all events"                  icon="◎" />
        <StatCard label="Open Incidents"     value={openIncidents}         sub={`${totalIncidents} total`}          icon="⚠" color={openIncidents > 0 ? "#E07B2A" : "#2d7a46"} />
        {canSeeRevenue && (
          <StatCard label="Total Revenue"    value={totalRevenue > 0 ? `$${totalRevenue.toLocaleString()}` : "—"} sub="confirmed engagements" icon="💰" color={theme.primary} />
        )}
      </div>

      {/* ── Per-event attendance ─────────────────────────────────────────── */}
      <SectionLabel>Attendance by Event</SectionLabel>
      <Card style={{ marginBottom: 4 }}>
        {perEventStats.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.textMuted, padding: "8px 0" }}>No event attendance data yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                {["Event", "Rostered", "Checked In", "Attendance Rate", "Incidents", canSeeRevenue && "Revenue"].filter(Boolean).map(h => (
                  <th key={h} style={{ padding: "6px 12px 8px 0", textAlign: "left", fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perEventStats.map((e, i) => (
                <tr key={e.id} style={{ borderBottom: `1px solid ${theme.border}`, background: i % 2 === 0 ? "#fff" : theme.background }}>
                  <td style={{ padding: "10px 12px 10px 0", fontWeight: 600, color: theme.text }}>{e.event_nickname || e.name}</td>
                  <td style={{ padding: "10px 12px 10px 0", color: theme.textMuted }}>{e.rostered}</td>
                  <td style={{ padding: "10px 12px 10px 0", color: theme.text }}>{e.checkedIn}</td>
                  <td style={{ padding: "10px 12px 10px 0", minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Bar pct={e.rate} color={e.rate >= 80 ? "#2d7a46" : e.rate >= 60 ? "#E07B2A" : "#8B0000"} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: theme.text, minWidth: 36 }}>{e.rate}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px 10px 0" }}>
                    <span style={{ fontSize: 12, fontWeight: e.evtIncidents > 0 ? 700 : 400, color: e.evtIncidents > 0 ? "#E07B2A" : theme.textMuted }}>
                      {e.evtIncidents || "—"}
                    </span>
                  </td>
                  {canSeeRevenue && (
                    <td style={{ padding: "10px 12px 10px 0", fontWeight: 600, color: e.price > 0 ? theme.primary : theme.textMuted }}>
                      {e.price > 0 ? `$${e.price.toLocaleString()}` : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 4 }}>

        {/* ── Volunteer Leaderboard ──────────────────────────────────────── */}
        <div>
          <SectionLabel>Volunteer Leaderboard</SectionLabel>
          <Card>
            {volunteerBoard.length === 0 ? (
              <div style={{ fontSize: 13, color: theme.textMuted }}>No volunteer data yet.</div>
            ) : volunteerBoard.map((v, i) => (
              <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < volunteerBoard.length - 1 ? `1px solid ${theme.border}` : "none" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: i < 3 ? theme.accent : theme.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: i < 3 ? "#8a6800" : theme.textMuted, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 3 }}>{v.name}</div>
                  <Bar pct={v.reliability} color={v.reliability >= 80 ? "#2d7a46" : "#E07B2A"} height={6} />
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.primary }}>{v.events} events</div>
                  <div style={{ fontSize: 10, color: theme.textMuted }}>{v.reliability}% reliable</div>
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* ── Incident Breakdown ─────────────────────────────────────────── */}
        <div>
          <SectionLabel>Incidents by Category</SectionLabel>
          <Card>
            {incidentCats.length === 0 ? (
              <div style={{ fontSize: 13, color: theme.textMuted }}>No incidents recorded yet.</div>
            ) : incidentCats.map(([cat, count], i) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < incidentCats.length - 1 ? `1px solid ${theme.border}` : "none" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: theme.text }}>{cat}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.primary }}>{count}</span>
                  </div>
                  <Bar pct={(count / totalIncidents) * 100} color={theme.primary} height={6} />
                </div>
              </div>
            ))}
            {totalIncidents > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: theme.textMuted }}>Open</span>
                <span style={{ fontWeight: 700, color: openIncidents > 0 ? "#E07B2A" : "#2d7a46" }}>{openIncidents} of {totalIncidents}</span>
              </div>
            )}
          </Card>

          {/* ── Revenue Breakdown — founders only ─────────────────────────── */}
          {canSeeRevenue && (
            <>
              <SectionLabel>Revenue by Event</SectionLabel>
              <Card>
                {perEventStats.filter(e => e.price > 0).length === 0 ? (
                  <div style={{ fontSize: 13, color: theme.textMuted }}>No confirmed revenue yet.</div>
                ) : perEventStats.filter(e => e.price > 0).map((e, i, arr) => (
                  <div key={e.id} style={{ padding: "9px 0", borderBottom: i < arr.length - 1 ? `1px solid ${theme.border}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: theme.text }}>{e.event_nickname || e.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: theme.primary }}>${e.price.toLocaleString()}</span>
                    </div>
                    <Bar pct={(e.price / totalRevenue) * 100} color={theme.accent} height={6} />
                  </div>
                ))}
                {totalRevenue > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: theme.textMuted, fontWeight: 600 }}>Total</span>
                    <span style={{ fontWeight: 700, color: theme.primary }}>${totalRevenue.toLocaleString()}</span>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {/* ── Axis Insights Premium ─────────────────────────────────────────── */}
      <SectionLabel>Axis Insights — Premium</SectionLabel>
      <div style={{
        borderRadius: 14,
        background: "linear-gradient(135deg, #0F2A1E 0%, #1C4A36 60%, #2d6e52 100%)",
        padding: "28px 32px",
        position: "relative",
        overflow: "hidden",
        marginBottom: 40,
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 220, height: 220, borderRadius: "50%", background: "rgba(235,199,100,0.07)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, right: 80, width: 160, height: 160, borderRadius: "50%", background: "rgba(235,199,100,0.04)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 28, position: "relative" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>\u2726</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#EBC764", letterSpacing: "-0.01em", fontFamily: "'Playfair Display', serif" }}>Axis Insights</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(235,199,100,0.2)", color: "#EBC764", letterSpacing: "0.08em" }}>PREMIUM</span>
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.65, marginBottom: 18, maxWidth: 500 }}>
              AI-generated post-event intelligence built from your real Axis data. Coverage gap analysis by zone, check-in surge detection, volunteer performance scoring, and a branded debrief report delivered to the client.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
              {["Coverage gap analysis", "Check-in surge windows", "Volunteer reliability scores", "Predictive staffing recommendations", "Branded PDF client deliverable"].map(f => (
                <span key={f} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.15)" }}>{f}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => alert("Axis Insights is coming soon. This feature will be available as a premium add-on.")}
                style={{ padding: "11px 22px", borderRadius: 8, border: "none", background: "#EBC764", color: "#0F2A1E", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 2px 12px rgba(235,199,100,0.3)", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f0d070"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#EBC764"; e.currentTarget.style.transform = "translateY(0)"; }}
              >Generate Insights Report</button>
              <button
                onClick={() => alert("Contact M&M Operations to add Axis Insights to your engagement.")}
                style={{ padding: "11px 22px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "rgba(255,255,255,0.85)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >Learn More</button>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, minWidth: 170 }}>
            {[
              { label: "Coverage Gaps",     value: "\u2014", sub: "zones analyzed" },
              { label: "Peak Check-In",     value: "\u2014", sub: "surge window" },
              { label: "Reliability Score", value: "\u2014", sub: "crew average" },
            ].map(stat => (
              <div key={stat.label} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{stat.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#EBC764", lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}