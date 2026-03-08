import { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { theme } from "../theme";
import { Card, Badge, LifecyclePill, SectionHeader, Spinner, EmptyState } from "../components/UI";

const STAGES = ["intake_received","awaiting_qualification","approved_for_discovery","discovery_complete","track_assigned","pricing_approved","proposal_sent","active","delivery","complete"];

function StatCard({ label, value, sub, accent }) {
  return (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color: accent || theme.primary, fontFamily: "'Playfair Display', serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const { activeUser } = useAuth();
  const navigate = useNavigate();
  const [leads,   setLeads]   = useState([]);
  const [talent,  setTalent]  = useState(0);
  const [events,  setEvents]  = useState([]);
  const [intake,  setIntake]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [leadsSnap, talentSnap, eventsSnap, intakeSnap] = await Promise.all([
          getDocs(collection(db, "sales_leads")),
          getDocs(collection(db, "talent_pool")),
          getDocs(collection(db, "events")),
          getDocs(collection(db, "event_intake_requests")),
        ]);
        setLeads(leadsSnap.docs.map(d => {
          const raw = { id: d.id, ...d.data() };
          return { ...raw,
            display_name:    raw.orgName || raw.org_name || raw.company || raw.name || "Unnamed",
            display_contact: raw.contactName || raw.contact_name || raw.contact || "—",
          };
        }));
        setTalent(talentSnap.size);
        setEvents(eventsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setIntake(intakeSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const activeLeads  = leads.filter(l => !["complete","declined"].includes(l.status));
  const hotLeads     = leads.filter(l => ["proposal_sent","pricing_approved","track_assigned"].includes(l.status));
  const pendingIntake = intake.filter(i => i.status === "new" || i.status === "reviewing");
  const activeEvents  = events.filter(e => e.status === "active" || e.status === "delivery");

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <Spinner size={32} />
    </div>
  );

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');"}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
          Good session,
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif", letterSpacing: "-0.02em" }}>
          {activeUser}
        </h1>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 14, marginBottom: 32, flexWrap: "wrap" }}>
        <StatCard label="Active Leads"   value={activeLeads.length}   sub="in pipeline" />
        <StatCard label="Hot Leads"      value={hotLeads.length}      sub="proposal stage or beyond" accent={theme.accentDark} />
        <StatCard label="Talent Pool"    value={talent}               sub="registered" />
        <StatCard label="Active Events"  value={activeEvents.length}  sub="in delivery" accent={theme.secondary} />
        <StatCard label="Intake Queue"   value={pendingIntake.length} sub="awaiting review" accent={pendingIntake.length > 0 ? theme.warning : theme.textMuted} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Recent leads */}
        <Card>
          <SectionHeader title="Recent Leads" subtitle="Latest pipeline activity"
            action={<button onClick={() => navigate("/leads")} style={{ fontSize: 12, color: theme.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>View all →</button>}
          />
          {leads.length === 0
            ? <EmptyState icon="◈" title="No leads yet" subtitle="Submit a sales inquiry to get started." />
            : leads.slice(0, 5).map(lead => (
              <div key={lead.id} onClick={() => navigate(`/leads?id=${lead.id}`)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${theme.border}`, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = theme.background}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{lead.display_name}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>{lead.display_contact}</div>
                </div>
                <LifecyclePill status={lead.status} />
              </div>
            ))
          }
        </Card>

        {/* Active events */}
        <Card>
          <SectionHeader title="Active Events" subtitle="Events in delivery"
            action={<button onClick={() => navigate("/activation-setup")} style={{ fontSize: 12, color: theme.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Activation queue →</button>}
          />
          {activeEvents.length === 0
            ? <EmptyState icon="◇" title="No active events" subtitle="Approve an intake to activate an event." />
            : activeEvents.map(evt => (
              <div key={evt.id} onClick={() => navigate(`/event/${evt.id}`)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${theme.border}`, cursor: "pointer" }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{evt.name || evt.id}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>{evt.client || "—"}</div>
                </div>
                <Badge color={theme.secondary}>{evt.pillar || "P1"}</Badge>
              </div>
            ))
          }
        </Card>

        {/* Intake queue preview */}
        {pendingIntake.length > 0 && (
          <Card style={{ gridColumn: "span 2" }}>
            <SectionHeader title="Intake Queue" subtitle={`${pendingIntake.length} request${pendingIntake.length !== 1 ? "s" : ""} awaiting review`}
              action={<button onClick={() => navigate("/activation-setup")} style={{ fontSize: 12, color: theme.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Review all →</button>}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {pendingIntake.slice(0, 3).map(item => (
                <div key={item.id} onClick={() => navigate("/activation-setup")}
                  style={{ padding: "12px 14px", borderRadius: 8, border: `1.5px solid ${theme.border}`, cursor: "pointer", background: theme.background }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 4 }}>{item.event_name || item.eventName || "Unnamed Event"}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>{item.client || item.organization || "—"}</div>
                  <div style={{ marginTop: 8 }}>
                    <Badge color={theme.warning}>{item.status || "new"}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}