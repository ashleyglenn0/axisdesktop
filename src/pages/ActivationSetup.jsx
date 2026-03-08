import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Button, Badge, Spinner, EmptyState, Input } from "../components/UI";

const STATUS_OPTIONS = ["new", "reviewing", "approved", "rejected"];
const STATUS_COLORS  = {
  new:       { bg: "rgba(224,123,42,0.1)",  color: "#E07B2A" },
  reviewing: { bg: "rgba(28,74,54,0.1)",    color: theme.primary },
  approved:  { bg: "rgba(88,176,108,0.12)", color: "#2d7a46" },
  rejected:  { bg: "rgba(192,57,43,0.1)",   color: "#C0392B" },
};

const STATUS_DESCRIPTIONS = {
  new:       "Landed in queue, not yet reviewed.",
  reviewing: "Actively verifying documents and POC before approval.",
  approved:  "All docs confirmed. Ready to configure and activate.",
  rejected:  "Not moving forward. Reason should be noted below.",
};

// Reviewing checklist — all engagements
const BASE_CHECKLIST = [
  { key: "chk_folder_created",   label: "Client folder confirmed in Google Drive",          note: "Auto-created on activation — verify templates copied correctly" },
  { key: "chk_poc_confirmed",    label: "Client point of contact confirmed",            note: "Name, email, and phone on file below" },
  { key: "chk_proposal_signed",  label: "Signed Proposal in folder",                   note: "Client-specific copy, fully executed" },
  { key: "chk_sow_signed",       label: "Signed SOW in folder",                        note: "Required before activation" },
  { key: "chk_msa_signed",       label: "Signed MSA in folder",                        note: "Required for new client relationships" },
  { key: "chk_intake_complete",  label: "Completed Intake & Scoping Form in folder",   note: "Filled out with client" },
];

const P4_CHECKLIST = [
  { key: "chk_advisory_proposal", label: "Advisory Proposal in folder (P4)",           note: "Replaces standard proposal for advisory engagements" },
];

const CHANGE_ORDER_CHECKLIST = [
  { key: "chk_change_order",     label: "Signed Change Order Policy in folder",        note: "Required if scope changed after SOW was signed" },
];

const getPillarKey = (pillar) => {
  if (!pillar) return "P1";
  const s = String(pillar).toUpperCase();
  if (s.includes("4")) return "P4";
  if (s.includes("3")) return "P3";
  if (s.includes("2")) return "P2";
  return "P1";
};

const getChecklist = (item) => {
  const pillar = getPillarKey(item?.pillar);
  return [
    ...BASE_CHECKLIST,
    ...(pillar === "P4" ? P4_CHECKLIST : []),
    ...(item?.scope_changed ? CHANGE_ORDER_CHECKLIST : []),
  ];
};

// Approval gate — all required checklist items must be checked + POC fields filled
const approvalGate = (item, checklist, poc) => {
  const missing = [];
  getChecklist(item).forEach(({ key, label }) => {
    if (!checklist[key]) missing.push(label);
  });
  if (!poc.name?.trim())  missing.push("POC name");
  if (!poc.email?.trim()) missing.push("POC email");
  if (!poc.phone?.trim()) missing.push("POC phone");
  return missing;
};

export default function ActivationSetup() {
  const { activeUser } = useAuth();
  const navigate = useNavigate();

  const [items,    setItems]    = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [filter,   setFilter]   = useState("all");

  // Reviewing state — local until saved
  const [checklist,      setChecklist]      = useState({});
  const [poc,            setPoc]            = useState({ name: "", email: "", phone: "", role: "", comms_preference: "" });
  const [rejectionNote,  setRejectionNote]  = useState("");
  const [scopeChanged,   setScopeChanged]   = useState(false);
  const [dirty,          setDirty]          = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "event_intake_requests"));
    setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const handleSelect = (item) => {
    setSelected(item);
    setChecklist(item.reviewing_checklist || {});
    setPoc(item.client_poc || { name: "", email: "", phone: "", role: "", comms_preference: "" });
    setRejectionNote(item.rejection_note || "");
    setScopeChanged(item.scope_changed || false);
    setDirty(false);
  };

  const saveReviewing = async () => {
    if (!selected) return;
    setSaving(true);
    await updateDoc(doc(db, "event_intake_requests", selected.id), {
      reviewing_checklist: checklist,
      client_poc:          poc,
      rejection_note:      rejectionNote,
      scope_changed:       scopeChanged,
      last_updated_by:     activeUser,
      last_updated_at:     serverTimestamp(),
    });
    await load();
    setDirty(false);
    setSaving(false);
  };

  const updateStatus = async (item, status) => {
    if (status === "approved") {
      const missing = approvalGate(
        { ...item, scope_changed: scopeChanged },
        checklist, poc
      );
      if (missing.length > 0) {
        alert(`Cannot approve yet. Missing:\n\n• ${missing.join("\n• ")}`);
        return;
      }
    }
    setSaving(true);
    // Save current reviewing data alongside status change
    await updateDoc(doc(db, "event_intake_requests", item.id), {
      status,
      reviewing_checklist: checklist,
      client_poc:          poc,
      rejection_note:      rejectionNote,
      scope_changed:       scopeChanged,
      reviewed_by:         activeUser,
      reviewed_at:         serverTimestamp(),
    });
    await load();
    // Update selected ref
    setSelected(prev => ({ ...prev, status }));
    setDirty(false);
    setSaving(false);
  };

  const toggleCheck = (key) => {
    setChecklist(c => ({ ...c, [key]: !c[key] }));
    setDirty(true);
  };

  const updatePoc = (field, value) => {
    setPoc(p => ({ ...p, [field]: value }));
    setDirty(true);
  };

  const filtered = items.filter(i => filter === "all" || i.status === filter);

  const checkedCount = selected ? getChecklist(selected).filter(({ key }) => checklist[key]).length : 0;
  const totalCount   = selected ? getChecklist(selected).length : 0;
  const missingItems = selected
    ? approvalGate({ ...selected, scope_changed: scopeChanged }, checklist, poc)
    : [];

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh" }}>
      <Spinner size={32} />
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* List */}
      <div style={{ width: 290, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", background: theme.surface, flexShrink: 0 }}>
        <div style={{ padding: "20px 14px 12px", borderBottom: `1px solid ${theme.border}` }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 19, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Activation Queue</h2>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {["all", ...STATUS_OPTIONS].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: filter === f ? theme.primary : "transparent",
                  color: filter === f ? theme.onPrimary : theme.textMuted,
                  border: `1px solid ${filter === f ? theme.primary : theme.border}`,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0
            ? <EmptyState icon="◇" title="No requests" subtitle="Intake requests appear here." />
            : filtered.map(item => {
              const sc = STATUS_COLORS[item.status] || STATUS_COLORS.new;
              return (
                <div key={item.id} onClick={() => handleSelect(item)}
                  style={{
                    padding: "13px 14px", borderBottom: `1px solid ${theme.border}`,
                    cursor: "pointer",
                    background: selected?.id === item.id ? theme.background : theme.surface,
                    borderLeft: selected?.id === item.id ? `3px solid ${theme.primary}` : "3px solid transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, flex: 1, paddingRight: 8 }}>
                      {item.event_name || item.eventName || "Unnamed Event"}
                    </div>
                    <Badge bg={sc.bg} color={sc.color}>{item.status || "new"}</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>{item.client || item.organization || "—"}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>{item.event_date || item.eventDate || "—"}</div>
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
            <EmptyState icon="◇" title="Select an intake request" subtitle="Review, verify documents, and approve to activate." />
          </div>
        ) : (
          <div style={{ maxWidth: 740 }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
              <div>
                <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
                  {selected.event_name || selected.eventName || "Unnamed Event"}
                </h1>
                <div style={{ fontSize: 13, color: theme.textMuted }}>
                  {selected.client || selected.organization || "—"} · {selected.event_date || selected.eventDate || "TBD"} · {selected.pillar || "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {dirty && (
                  <Button variant="outline" size="sm" onClick={saveReviewing} disabled={saving}>
                    {saving ? "Saving…" : "Save Progress"}
                  </Button>
                )}
                {selected.status === "approved" && (
                  <Button onClick={() => navigate(`/activation-config/${selected.id}`)}>
                    Configure Event →
                  </Button>
                )}
              </div>
            </div>

            {/* Status bar */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Status</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {STATUS_OPTIONS.map(s => {
                  const sc = STATUS_COLORS[s] || {};
                  const isActive = selected.status === s;
                  const isApprove = s === "approved";
                  return (
                    <button key={s}
                      onClick={() => updateStatus(selected, s)}
                      disabled={saving}
                      style={{
                        padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        background: isActive ? (sc.color || theme.primary) : "transparent",
                        color: isActive ? "#fff" : theme.textMuted,
                        border: `1.5px solid ${isActive ? (sc.color || theme.primary) : theme.border}`,
                        fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s ease",
                        opacity: isApprove && missingItems.length > 0 && !isActive ? 0.5 : 1,
                      }}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                      {isApprove && missingItems.length > 0 && !isActive && " 🔒"}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted, fontStyle: "italic" }}>
                {STATUS_DESCRIPTIONS[selected.status] || ""}
              </div>
              {selected.reviewed_by && (
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>Last updated by {selected.reviewed_by}</div>
              )}
            </Card>

            {/* Approval gate warning */}
            {missingItems.length > 0 && selected.status !== "approved" && (
              <div style={{ padding: "12px 16px", borderRadius: 8, background: theme.warningSoft, border: `1px solid rgba(224,123,42,0.3)`, marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.warning, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Required before approval ({missingItems.length} remaining)
                </div>
                {missingItems.map(m => (
                  <div key={m} style={{ fontSize: 12, color: theme.warning, display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                    <span>◦</span> {m}
                  </div>
                ))}
              </div>
            )}

            {/* Reviewing checklist */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Document Checklist</div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{checkedCount} of {totalCount} confirmed</div>
                </div>
                {/* Scope change toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: theme.textMuted }}>Scope change occurred?</span>
                  <button
                    onClick={() => { setScopeChanged(v => !v); setDirty(true); }}
                    style={{
                      width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                      background: scopeChanged ? theme.primary : theme.border,
                      position: "relative", transition: "background 0.2s",
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                      position: "absolute", top: 3, left: scopeChanged ? 21 : 3,
                      transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, background: theme.border, borderRadius: 999, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${totalCount ? (checkedCount / totalCount) * 100 : 0}%`, background: theme.secondary, borderRadius: 999, transition: "width 0.3s ease" }} />
              </div>

              {getChecklist({ ...selected, scope_changed: scopeChanged }).map(({ key, label, note }) => (
                <div key={key} onClick={() => toggleCheck(key)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: `1px solid ${theme.border}`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = theme.background}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                    background: checklist[key] ? theme.secondary : "transparent",
                    border: `2px solid ${checklist[key] ? theme.secondary : theme.warning}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s ease",
                  }}>
                    {checklist[key] && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: checklist[key] ? 600 : 400, color: checklist[key] ? theme.text : theme.textMuted }}>
                      {label}
                    </div>
                    {note && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{note}</div>}
                  </div>
                </div>
              ))}

            </Card>

            {/* Client POC */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
                Client Point of Contact <span style={{ color: theme.warning }}>*</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { field: "name",              label: "Full Name",             placeholder: "Jane Smith",              required: true },
                  { field: "email",             label: "Email",                 placeholder: "jane@client.com",         required: true },
                  { field: "phone",             label: "Phone (mobile)",        placeholder: "404-555-0100",            required: true },
                  { field: "role",              label: "Title / Role",          placeholder: "Event Director",          required: false },
                  { field: "comms_preference",  label: "Preferred Comms",       placeholder: "Text, Email, Slack…",     required: false },
                ].map(({ field, label, placeholder, required }) => (
                  <div key={field} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {label} {required && <span style={{ color: theme.warning }}>*</span>}
                    </label>
                    <input
                      value={poc[field] || ""}
                      onChange={e => updatePoc(field, e.target.value)}
                      placeholder={placeholder}
                      style={{ padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${required && !poc[field] ? theme.warning : theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: theme.offWhite, color: theme.text, outline: "none" }}
                    />
                  </div>
                ))}
              </div>
            </Card>

            {/* Event Details */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Event Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[
                  ["Client / Org",       selected.client || selected.organization],
                  ["Event Name",         selected.event_name || selected.eventName],
                  ["Date",               selected.event_date || selected.eventDate],
                  ["Venue",              selected.venue],
                  ["Location",           selected.location || selected.city],
                  ["Attendees",          selected.attendee_count || selected.expectedAttendees],
                  ["Pillar",             selected.pillar],
                  ["Budget",             selected.budget],
                  ["Submitted",          selected.created_at?.toDate?.()?.toLocaleDateString?.() || selected.createdAt?.toDate?.()?.toLocaleDateString?.()],
                ].map(([label, val]) => val ? (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, color: theme.text, fontWeight: 500 }}>{String(val)}</div>
                  </div>
                ) : null)}
              </div>
              {(selected.description || selected.notes || selected.message) && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Notes</div>
                  <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.6 }}>{selected.description || selected.notes || selected.message}</div>
                </div>
              )}
            </Card>

            {/* Rejection note */}
            {selected.status === "rejected" && (
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Rejection Reason</div>
                <textarea
                  value={rejectionNote}
                  onChange={e => { setRejectionNote(e.target.value); setDirty(true); }}
                  placeholder="Why was this rejected? Capacity issue, date conflict, incomplete scope…"
                  rows={3}
                  style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "vertical", color: theme.text, boxSizing: "border-box", background: theme.offWhite }}
                />
                {dirty && (
                  <Button size="sm" variant="outline" onClick={saveReviewing} disabled={saving} style={{ marginTop: 8 }}>
                    {saving ? "Saving…" : "Save Note"}
                  </Button>
                )}
              </Card>
            )}

            {/* Save progress sticky button when dirty */}
            {dirty && selected.status !== "rejected" && (
              <div style={{ position: "sticky", bottom: 20, display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <Button onClick={saveReviewing} disabled={saving}>
                  {saving ? "Saving…" : "Save Progress"}
                </Button>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}