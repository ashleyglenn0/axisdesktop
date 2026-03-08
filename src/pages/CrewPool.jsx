import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Badge, Button, SectionHeader, Spinner, EmptyState, Input } from "../components/UI";

const STATUS_COLORS = {
  pending:    { bg: "rgba(224,123,42,0.1)",  color: "#E07B2A" },
  onboarding: { bg: "rgba(28,74,54,0.1)",    color: theme.primary },
  active:     { bg: "rgba(88,176,108,0.12)", color: "#2d7a46" },
};

const FLOOR_ROLES = [
  { value: "volunteer",       label: "Volunteer / Floor Help" },
  { value: "team_lead",       label: "Team Lead" },
  { value: "ops_lead",        label: "Ops Lead",        contractorOnly: true },
  { value: "ops_manager",     label: "Ops Manager" },
  { value: "engagement_lead", label: "Engagement Lead" },
];

const normPerson = (p) => ({
  ...p,
  display_name:         p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unnamed",
  display_email:        p.email || "—",
  display_phone:        p.phone || "—",
  display_city:         p.city && p.state ? `${p.city}, ${p.state}` : p.city || p.state || "—",
  display_type:         p.preference || p.role || p.position || "—",
  display_exp:          p.expLevel || p.experience || "—",
  display_availability: p.availability || "—",
  display_interests:    p.interests || "—",
  display_rate:         p.rateExpectation || "—",
  display_entity:       p.entityType || "—",
  display_why:          p.whyMM || p.bio || "—",
  display_instagram:    p.instagram !== "N/A" ? p.instagram : null,
  display_linkedin:     p.linkedin  !== "N/A" ? p.linkedin  : null,
  display_created:      p.createdAt || p.created_at || null,
  is_contractor:        p.preference === "Contractor / IC" || p.isContractor === true,
});

const parseRate = (rateStr) => {
  if (!rateStr || rateStr === "N/A" || rateStr === "—") return null;
  const nums = rateStr.match(/\d+/g);
  if (!nums) return null;
  const vals = nums.map(Number);
  return vals.length === 1 ? vals[0] : Math.round((vals[0] + vals[vals.length - 1]) / 2);
};

const getChecklist = (isContractor) => [
  { key: "background_check",    label: "Background Check",  required: true },
  ...(isContractor ? [{ key: "ic_agreement", label: "IC Agreement", required: true }] : []),
  { key: "onboarding_complete", label: "Onboarding",        required: false },
  { key: "axis_trained",        label: "Axis Trained",      required: false },
];

const assignmentGate = (person) => {
  if (!person.background_check) return "Background check must be completed before assigning.";
  if (person.is_contractor && !person.ic_agreement) return "IC agreement must be completed before assigning a contractor.";
  return null;
};

export default function CrewPool() {
  const { activeUser } = useAuth();
  const [people,       setPeople]       = useState([]);
  const [events,       setEvents]       = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [assignments,  setAssignments]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState("");
  const [filter,       setFilter]       = useState("all");
  const [showAssign,   setShowAssign]   = useState(false);
  const [assignEventId,setAssignEventId]= useState("");
  const [assignRole,   setAssignRole]   = useState("volunteer");
  const [assignHours,  setAssignHours]  = useState("");
  const [assignNote,   setAssignNote]   = useState("");

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [peopleSnap, eventsSnap] = await Promise.all([
      getDocs(collection(db, "talent_pool")),
      getDocs(collection(db, "events")),
    ]);
    setPeople(peopleSnap.docs.map(d => normPerson({ id: d.id, ...d.data() })));
    setEvents(eventsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const loadAssignments = async (person) => {
    const snap = await getDocs(collection(db, "talent_pool", person.id, "assignments"));
    setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handleSelect = async (person) => {
    setSelected(person);
    setShowAssign(false);
    await loadAssignments(person);
  };

  const toggleCheck = async (person, field) => {
    setSaving(true);
    const next = !person[field];
    await updateDoc(doc(db, "talent_pool", person.id), { [field]: next });
    const snap = await getDocs(collection(db, "talent_pool"));
    const refreshed = snap.docs.map(d => normPerson({ id: d.id, ...d.data() }));
    setPeople(refreshed);
    const updated = refreshed.find(p => p.id === person.id);
    if (updated) setSelected(updated);
    setSaving(false);
  };

  const handleAssign = async () => {
    if (!selected || !assignEventId) return;
    const gate = assignmentGate(selected);
    if (gate) { alert(gate); return; }

    const event = events.find(e => e.id === assignEventId);
    if (!event) return;

    const hourlyRate = parseRate(selected.display_rate);
    const hours      = parseFloat(assignHours) || 0;
    const estPay     = selected.is_contractor && hourlyRate && hours ? hourlyRate * hours : null;

    setSaving(true);

    // Write to talent_pool/{id}/assignments/{eventId}
    await setDoc(doc(db, "talent_pool", selected.id, "assignments", assignEventId), {
      event_id:          assignEventId,
      event_name:        event.name || assignEventId,
      event_date:        event.event_date || null,
      access_code:       event.access_code || null,
      floor_role:        assignRole,
      comp_type:         selected.is_contractor ? "contractor" : "volunteer",
      estimated_hours:   hours || null,
      estimated_pay:     estPay,
      hourly_rate:       hourlyRate,
      event_code_sent:   false,
      assignment_status: "confirmed",
      assigned_by:       activeUser,
      assigned_at:       serverTimestamp(),
      note:              assignNote || null,
    });

    // Write to events/{eventId}/roster/{personId}
    await setDoc(doc(db, "events", assignEventId, "roster", selected.id), {
      uid:               selected.id,
      name:              selected.display_name,
      email:             selected.display_email,
      floor_role:        assignRole,
      comp_type:         selected.is_contractor ? "contractor" : "volunteer",
      isContractor:      selected.is_contractor,
      estimated_hours:   hours || null,
      estimated_pay:     estPay,
      ic_agreement_url:  selected.ic_agreement_url || null,
      onboarding_complete: selected.onboarding_complete || false,
      background_check:    selected.background_check    || false,
      ic_agreement:        selected.ic_agreement        || false,
      axis_trained:        selected.axis_trained        || false,
      event_code_sent:   false,
      assigned_by:       activeUser,
      assigned_at:       serverTimestamp(),
    });

    setShowAssign(false);
    setAssignEventId(""); setAssignRole("volunteer"); setAssignHours(""); setAssignNote("");
    await loadAssignments(selected);
    setSaving(false);
  };

  const markCodeSent = async (a) => {
    setSaving(true);
    await updateDoc(doc(db, "talent_pool", selected.id, "assignments", a.event_id), { event_code_sent: true });
    await updateDoc(doc(db, "events", a.event_id, "roster", selected.id), { event_code_sent: true });
    await loadAssignments(selected);
    setSaving(false);
  };

  const removeAssignment = async (a) => {
    if (!confirm(`Remove ${selected.display_name} from ${a.event_name}?`)) return;
    setSaving(true);
    await deleteDoc(doc(db, "talent_pool", selected.id, "assignments", a.event_id));
    await deleteDoc(doc(db, "events", a.event_id, "roster", selected.id));
    await loadAssignments(selected);
    setSaving(false);
  };

  const filtered = people.filter(p => {
    const matchSearch = !search || p.display_name.toLowerCase().includes(search.toLowerCase()) || p.display_email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all"
      || (filter === "contractor" && p.is_contractor)
      || (filter === "volunteer"  && !p.is_contractor)
      || (filter === "ready"      && assignmentGate(p) === null)
      || (filter === "pending"    && !p.background_check);
    return matchSearch && matchFilter;
  });

  const getStatusLabel = (p) => {
    if (p.onboarding_complete && p.axis_trained) return "active";
    if (p.background_check)                      return "onboarding";
    return "pending";
  };

  const availableRoles = FLOOR_ROLES.filter(r => !r.contractorOnly || selected?.is_contractor);

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh" }}><Spinner size={32} /></div>;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* List */}
      <div style={{ width: 290, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", background: theme.surface, flexShrink: 0 }}>
        <div style={{ padding: "20px 14px 12px", borderBottom: `1px solid ${theme.border}` }}>
          <h2 style={{ margin: "0 0 3px", fontSize: 19, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Talent Pool</h2>
          <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>
            {people.length} registered · <span style={{ color: theme.secondary, fontWeight: 700 }}>{people.filter(p => assignmentGate(p) === null).length} ready</span>
          </div>
          <Input inputStyle={{ width: "100%", boxSizing: "border-box" }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap" }}>
            {[["all","All"],["contractor","Contractor"],["volunteer","Volunteer"],["ready","Ready ✓"],["pending","Pending"]].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: "pointer",
                  background: filter === key ? theme.primary : "transparent",
                  color: filter === key ? theme.onPrimary : theme.textMuted,
                  border: `1px solid ${filter === key ? theme.primary : theme.border}`,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0
            ? <EmptyState icon="◎" title="No people found" />
            : filtered.map(person => {
              const status = getStatusLabel(person);
              const sc = STATUS_COLORS[status] || STATUS_COLORS.pending;
              const ready = assignmentGate(person) === null;
              return (
                <div key={person.id} onClick={() => handleSelect(person)}
                  style={{
                    padding: "11px 14px", borderBottom: `1px solid ${theme.border}`, cursor: "pointer",
                    background: selected?.id === person.id ? theme.background : theme.surface,
                    borderLeft: selected?.id === person.id ? `3px solid ${theme.primary}` : "3px solid transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
                        {person.display_name}
                        {ready && <span style={{ color: theme.secondary, marginLeft: 5, fontSize: 11 }}>✓</span>}
                      </div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                        {person.is_contractor ? "Contractor" : "Volunteer"} · {person.display_city}
                      </div>
                    </div>
                    <Badge bg={sc.bg} color={sc.color}>{status}</Badge>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    {getChecklist(person.is_contractor).map(({ key, label }) => (
                      <div key={key} title={label} style={{ width: 7, height: 7, borderRadius: "50%", background: person[key] ? theme.secondary : theme.border }} />
                    ))}
                  </div>
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
            <EmptyState icon="◎" title="Select a person" subtitle="View profile, track onboarding, and assign to events." />
          </div>
        ) : (() => {
          const status   = getStatusLabel(selected);
          const sc       = STATUS_COLORS[status] || STATUS_COLORS.pending;
          const gateMsg  = assignmentGate(selected);
          const checklist = getChecklist(selected.is_contractor);
          const hourlyRate = parseRate(selected.display_rate);

          return (
            <div style={{ maxWidth: 740 }}>

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                    <h1 style={{ margin: 0, fontSize: 23, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>{selected.display_name}</h1>
                    <Badge bg={sc.bg} color={sc.color}>{status}</Badge>
                    <Badge color={selected.is_contractor ? theme.accentDark : theme.secondary}>
                      {selected.is_contractor ? "Contractor" : "Volunteer"}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 13, color: theme.textMuted }}>{selected.display_email} · {selected.display_phone} · {selected.display_city}</div>
                </div>
                <Button onClick={() => setShowAssign(v => !v)} disabled={!!gateMsg} title={gateMsg || ""} style={{ flexShrink: 0 }}>
                  {showAssign ? "Cancel" : "+ Assign to Event"}
                </Button>
              </div>

              {/* Gate warning */}
              {gateMsg && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: theme.warningSoft, border: `1px solid rgba(224,123,42,0.3)`, fontSize: 13, color: theme.warning, marginBottom: 18, display: "flex", gap: 8 }}>
                  ⚠ {gateMsg}
                </div>
              )}

              {/* Assign modal */}
              {showAssign && (
                <Card style={{ marginBottom: 20, border: `2px solid ${theme.primary}` }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.primary, marginBottom: 14 }}>Assign to Event</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Event</div>
                      <select value={assignEventId} onChange={e => setAssignEventId(e.target.value)}
                        style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: theme.offWhite, color: theme.text, outline: "none" }}>
                        <option value="">Select event…</option>
                        {events.map(e => <option key={e.id} value={e.id}>{e.name || e.id}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Floor Role</div>
                      <select value={assignRole} onChange={e => setAssignRole(e.target.value)}
                        style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: theme.offWhite, color: theme.text, outline: "none" }}>
                        {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    {selected.is_contractor && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Estimated Hours</div>
                        <input type="number" min="0" step="0.5" value={assignHours} onChange={e => setAssignHours(e.target.value)} placeholder="e.g. 8"
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: theme.offWhite, color: theme.text, outline: "none", boxSizing: "border-box" }} />
                        {assignHours && hourlyRate && (
                          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                            Est. pay: <strong style={{ color: theme.primary }}>${(hourlyRate * parseFloat(assignHours)).toFixed(2)}</strong> @ ${hourlyRate}/hr
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Note (optional)</div>
                      <input value={assignNote} onChange={e => setAssignNote(e.target.value)} placeholder="Any notes…"
                        style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: theme.offWhite, color: theme.text, outline: "none", boxSizing: "border-box" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button onClick={handleAssign} disabled={!assignEventId || saving}>{saving ? "Saving…" : "Confirm Assignment"}</Button>
                    <Button variant="ghost" onClick={() => setShowAssign(false)}>Cancel</Button>
                  </div>
                </Card>
              )}

              {/* Assignments */}
              {assignments.length > 0 && (
                <Card style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Event Assignments</div>
                  {assignments.map(a => (
                    <div key={a.event_id} style={{ padding: "12px 0", borderBottom: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 2 }}>{a.event_name}</div>
                        <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>
                          {FLOOR_ROLES.find(r => r.value === a.floor_role)?.label || a.floor_role}
                          {a.estimated_pay ? ` · Est. $${Number(a.estimated_pay).toFixed(2)}` : ""}
                        </div>
                        {a.access_code && (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 6, background: theme.primary }}>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Event Code</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: theme.accent, fontFamily: "monospace", letterSpacing: "0.08em" }}>{a.access_code}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        {!a.event_code_sent
                          ? <Button size="sm" variant="outline" onClick={() => markCodeSent(a)} disabled={saving}>Mark code sent</Button>
                          : <Badge color={theme.secondary}>Code sent ✓</Badge>
                        }
                        <button onClick={() => removeAssignment(a)} style={{ fontSize: 11, color: theme.danger, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </Card>
              )}

              {/* Onboarding checklist */}
              <Card style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Onboarding Checklist</div>
                {checklist.map(({ key, label, required }) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${theme.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        background: selected[key] ? theme.secondary : "transparent",
                        border: `2px solid ${selected[key] ? theme.secondary : required ? theme.warning : theme.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {selected[key] && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 14, color: selected[key] ? theme.text : theme.textMuted, fontWeight: selected[key] ? 600 : 400 }}>
                        {label}
                        {required && !selected[key] && <span style={{ fontSize: 10, color: theme.warning, marginLeft: 6, fontWeight: 700 }}>REQUIRED</span>}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => toggleCheck(selected, key)}>
                      {selected[key] ? "Undo" : "Mark complete"}
                    </Button>
                  </div>
                ))}
              </Card>

              {/* Profile */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Profile</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {[
                    ["Type",         selected.display_type],
                    ["Experience",   selected.display_exp],
                    ["Availability", selected.display_availability],
                    ["Interests",    selected.display_interests],
                    ["Rate",         selected.display_rate],
                    ["Entity Type",  selected.display_entity],
                    ["Location",     selected.display_city],
                    ["Instagram",    selected.display_instagram],
                    ["LinkedIn",     selected.display_linkedin],
                    ["Source",       selected.source],
                    ["Submitted",    selected.display_created?.toDate?.()?.toLocaleDateString?.()],
                  ].map(([label, val]) => val ? (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 13, color: theme.text }}>{String(val)}</div>
                    </div>
                  ) : null)}
                </div>
                {selected.display_why && selected.display_why !== "—" && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
                    <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Why M&M</div>
                    <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.6 }}>{selected.display_why}</div>
                  </div>
                )}
              </Card>

            </div>
          );
        })()}
      </div>
    </div>
  );
}