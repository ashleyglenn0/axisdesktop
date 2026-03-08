import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Button, Badge, Spinner, EmptyState, Input } from "../components/UI";

const norm = (lead) => ({
  ...lead,
  display_name:     lead.orgName     || lead.org_name     || lead.company || lead.name || "Unnamed",
  display_contact:  lead.contactName || lead.contact_name || lead.contact || "—",
  display_email:    lead.email       || lead.contact_email || "—",
  display_phone:    lead.phone       || lead.contact_phone || "—",
  display_event:    lead.eventType   || lead.event_type   || lead.event_name || "—",
  display_date:     lead.start_date  || lead.event_date   || lead.eventDate  || "—",
  display_budget:   lead.budgetSignal|| lead.budget       || "—",
  display_attendees:lead.estimated_attendees || lead.attendee_count || lead.attendees || "—",
  display_message:  lead.message     || lead.notes        || "—",
  display_source:   lead.source      || "—",
  display_created:  lead.createdAt   || lead.created_at   || null,
});

export default function Leads() {
  const { activeUser } = useAuth();
  const navigate = useNavigate();

  const [leads,    setLeads]    = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState("new");
  const [toast,    setToast]    = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "sales_leads"));
    setLeads(snap.docs.map(d => norm({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const moveToPipeline = async (lead) => {
    setSaving(true);
    const ref = await addDoc(collection(db, "pipeline"), {
      org_name:      lead.display_name,
      organization:  lead.display_name,
      contact_name:  lead.display_contact,
      contact_email: lead.display_email,
      phone:         lead.display_phone,
      event_name:    lead.display_event,
      event_type:    lead.display_event,
      budget:        lead.display_budget,
      attendees:     lead.display_attendees,
      message:       lead.display_message,
      source:        lead.display_source,
      stage:         "awaiting_qualification",
      stage_data:    {},
      claimed_by:    activeUser,
      claimed_at:    serverTimestamp(),
      sales_lead_id: lead.id,
      created_at:    serverTimestamp(),
    });
    await updateDoc(doc(db, "sales_leads", lead.id), {
      pipeline_id:              ref.id,
      moved_to_pipeline_by:     activeUser,
      moved_to_pipeline_at:     serverTimestamp(),
      status:                   "in_pipeline",
    });
    await load();
    setSaving(false);
    showToast(`${lead.display_name} moved to Pipeline`);
    setTimeout(() => navigate("/pipeline"), 1200);
  };

  const filtered = leads.filter(l => {
    const matchFilter =
      filter === "all" ||
      (filter === "new"         && l.status !== "in_pipeline") ||
      (filter === "in_pipeline" && l.status === "in_pipeline");
    const matchSearch = !search || [l.display_name, l.display_contact, l.display_email]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    return matchFilter && matchSearch;
  });

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh" }}>
      <Spinner size={32} />
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px", borderRadius: 10, background: theme.primary, color: "#fff", fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}

      {/* List */}
      <div style={{ width: 300, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", background: theme.surface, flexShrink: 0 }}>
        <div style={{ padding: "20px 14px 12px", borderBottom: `1px solid ${theme.border}` }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 19, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Leads Inbox</h2>
          <Input inputStyle={{ width: "100%", boxSizing: "border-box", fontSize: 13 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
            {[
              { key: "new",         label: "New" },
              { key: "in_pipeline", label: "In Pipeline" },
              { key: "all",         label: "All" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer", background: filter === f.key ? theme.primary : "transparent", color: filter === f.key ? theme.onPrimary : theme.textMuted, border: `1px solid ${filter === f.key ? theme.primary : theme.border}`, fontFamily: "'DM Sans', sans-serif" }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0
            ? <EmptyState icon="◈" title="No leads" subtitle="New leads from the website and app appear here." />
            : filtered.map(lead => {
              const inPipeline = lead.status === "in_pipeline";
              return (
                <div key={lead.id} onClick={() => setSelected(lead)}
                  style={{ padding: "12px 14px", borderBottom: `1px solid ${theme.border}`, cursor: "pointer", background: selected?.id === lead.id ? theme.background : theme.surface, borderLeft: selected?.id === lead.id ? `3px solid ${theme.primary}` : `3px solid ${inPipeline ? theme.secondary : "transparent"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, flex: 1, paddingRight: 6 }}>{lead.display_name}</div>
                    {inPipeline
                      ? <Badge bg={theme.successSoft} color={theme.secondary}>In Pipeline</Badge>
                      : <Badge bg={theme.warningSoft} color={theme.warning}>New</Badge>
                    }
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>{lead.display_contact}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>{lead.display_event}</div>
                </div>
              );
            })
          }
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: "26px 28px", background: theme.background }}>
        {!selected ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%" }}>
            <EmptyState icon="◈" title="Select a lead" subtitle="Review and move to Pipeline when ready to work it." />
          </div>
        ) : (
          <div style={{ maxWidth: 640 }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
              <div>
                <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
                  {selected.display_name}
                </h1>
                <div style={{ fontSize: 13, color: theme.textMuted }}>
                  {selected.display_contact} · {selected.display_email}
                </div>
              </div>
              {selected.status === "in_pipeline" && (
                <Button variant="outline" onClick={() => navigate("/pipeline")}>
                  View in Pipeline →
                </Button>
              )}
            </div>

            {/* In pipeline notice */}
            {selected.status === "in_pipeline" && (
              <div style={{ padding: "12px 16px", borderRadius: 10, background: theme.successSoft, border: `1px solid rgba(88,176,108,0.3)`, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#2d7a46", marginBottom: 2 }}>Already in Pipeline</div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  Moved by {selected.moved_to_pipeline_by || "someone on the team"}. Manage it from the Pipeline page.
                </div>
              </div>
            )}

            {/* Lead details */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Lead Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[
                  ["Event Type",  selected.display_event],
                  ["Event Date",  selected.display_date],
                  ["Budget",      selected.display_budget],
                  ["Attendees",   selected.display_attendees],
                  ["Phone",       selected.display_phone],
                  ["Source",      selected.display_source],
                  ["Submitted",   selected.display_created?.toDate?.()?.toLocaleDateString?.()],
                ].map(([label, val]) => val && val !== "—" ? (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, color: theme.text, fontWeight: 500 }}>{String(val)}</div>
                  </div>
                ) : null)}
              </div>
              {selected.display_message && selected.display_message !== "—" && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Message / Notes</div>
                  <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.6 }}>{selected.display_message}</div>
                </div>
              )}
            </Card>

            {/* CTA */}
            {selected.status !== "in_pipeline" && (
              <div style={{ padding: "18px 20px", borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.primary, marginBottom: 3 }}>Ready to work this lead?</div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>Claiming it will create a Pipeline record assigned to you and move you directly to the qualification stage.</div>
                </div>
                <Button onClick={() => moveToPipeline(selected)} disabled={saving} style={{ flexShrink: 0 }}>
                  {saving ? "Moving…" : "Claim & Move →"}
                </Button>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}