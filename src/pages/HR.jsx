// ─────────────────────────────────────────────────────────────────────────────
// HR.jsx — Motion & Method LLC
// Route: /hr
// Sections: Contractor Records, Onboarding, SOPs, Org Chart, Compliance
// Collections: volunteerProfiles (read), hr_contractors (HR layer), hr_sops
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
  collection, getDocs, doc, getDoc, setDoc, updateDoc, addDoc,
  deleteDoc, query, orderBy, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Spinner } from "../components/UI";

const FOUNDERS     = ["Ashley", "Mikal"];
const CREW_TIERS   = ["Active Roster", "Priority Crew", "Team Lead Pipeline", "Inactive"];
const SOP_CATS     = ["Operations", "Finance", "HR", "Client Management", "Safety", "Technology"];
const ONBOARD_STEPS = [
  { key: "ic_signed",      label: "IC Agreement Signed (DocuSeal)" },
  { key: "gusto_added",    label: "Added to Gusto"                 },
  { key: "axis_access",    label: "Axis Mobile Access Granted"     },
  { key: "briefing_done",  label: "Onboarding Briefing Completed"  },
  { key: "w9_collected",   label: "W-9 Collected"                  },
];

// ─── Shared UI ────────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function StatusPill({ label, color, bg }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
      background: bg, color, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#1A1A1A",
  fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
};

const labelStyle = {
  display: "block", fontSize: 10, fontWeight: 700, color: "#6B7280",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5,
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACTOR RECORDS
// ─────────────────────────────────────────────────────────────────────────────

function ContractorRecords({ isFounder }) {
  const [contractors, setContractors] = useState([]);
  const [hrData,      setHrData]      = useState({});   // uid → hr_contractors doc
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState(null);
  const [hrDraft,     setHrDraft]     = useState({});
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState("");
  const [tierFilter,  setTierFilter]  = useState("all");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      // Pull base profiles from volunteerProfiles
      const profSnap = await getDocs(
        query(collection(db, "volunteerProfiles"), where("isContractor", "==", true))
      );
      const profiles = profSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Pull HR layer
      const hrSnap = await getDocs(collection(db, "hr_contractors"));
      const hr = {};
      hrSnap.docs.forEach(d => { hr[d.data().uid || d.id] = { id: d.id, ...d.data() }; });

      setContractors(profiles);
      setHrData(hr);
    } catch (e) { console.error("Contractor load error:", e); }
    setLoading(false);
  };

  const selectContractor = (c) => {
    setSelected(c);
    const hr = hrData[c.uid || c.id] || {};
    setHrDraft({
      tier:          hr.tier          || "Active Roster",
      gusto_status:  hr.gusto_status  || "not_added",
      notes:         hr.notes         || "",
      onboarding:    hr.onboarding    || {},
      emergency_contact: hr.emergency_contact || "",
      start_date:    hr.start_date    || "",
    });
  };

  const saveHR = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const uid     = selected.uid || selected.id;
      const hrRef   = hrData[uid];
      const payload = {
        ...hrDraft,
        uid,
        name:      selected.name || selected.first_name + " " + selected.last_name || "",
        updatedAt: serverTimestamp(),
      };
      if (hrRef?.id) {
        await updateDoc(doc(db, "hr_contractors", hrRef.id), payload);
      } else {
        const newRef = await addDoc(collection(db, "hr_contractors"), { ...payload, createdAt: serverTimestamp() });
        setHrData(prev => ({ ...prev, [uid]: { id: newRef.id, ...payload } }));
      }
      setHrData(prev => ({ ...prev, [uid]: { ...(prev[uid] || {}), ...payload } }));
    } catch (e) { console.error("HR save error:", e); }
    setSaving(false);
  };

  const toggleOnboardStep = (key) => {
    setHrDraft(prev => ({
      ...prev,
      onboarding: { ...prev.onboarding, [key]: !prev.onboarding?.[key] },
    }));
  };

  const filtered = contractors.filter(c => {
    const name = (c.name || `${c.first_name || ""} ${c.last_name || ""}`).toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const hr = hrData[c.uid || c.id];
    const matchTier = tierFilter === "all" || (hr?.tier || "Active Roster") === tierFilter;
    return matchSearch && matchTier;
  });

  const tierColor = (tier) => ({
    "Active Roster":       { color: "#2d7a46", bg: "rgba(45,122,70,0.1)"   },
    "Priority Crew":       { color: "#1C4A36", bg: "rgba(28,74,54,0.12)"   },
    "Team Lead Pipeline":  { color: "#D97706", bg: "rgba(217,119,6,0.1)"   },
    "Inactive":            { color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  }[tier] || { color: theme.textMuted, bg: theme.border });

  const gustoColor = (s) => ({
    added:     { color: "#2d7a46", bg: "rgba(45,122,70,0.1)",  label: "In Gusto"    },
    not_added: { color: "#D97706", bg: "rgba(217,119,6,0.1)",  label: "Not in Gusto" },
    pending:   { color: "#2563EB", bg: "rgba(37,99,235,0.08)", label: "Pending"      },
  }[s] || { color: theme.textMuted, bg: theme.border, label: s });

  if (loading) return <Spinner size={24} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, minHeight: 500 }}>
      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contractors…"
          style={{ ...inputStyle, marginBottom: 4 }}
        />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
          {["all", ...CREW_TIERS].map(t => (
            <button key={t} onClick={() => setTierFilter(t)} style={{
              padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: "pointer",
              background: tierFilter === t ? theme.primary : "transparent",
              color: tierFilter === t ? "#fff" : theme.textMuted,
              border: `1px solid ${tierFilter === t ? theme.primary : theme.border}`,
              fontFamily: "'DM Sans', sans-serif",
            }}>{t === "all" ? "All" : t}</button>
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: theme.textMuted, textAlign: "center" }}>No contractors found.</div>
          ) : filtered.map(c => {
            const hr   = hrData[c.uid || c.id] || {};
            const tc   = tierColor(hr.tier || "Active Roster");
            const name = c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unnamed";
            const steps = ONBOARD_STEPS.filter(s => hr.onboarding?.[s.key]).length;
            return (
              <div key={c.id} onClick={() => selectContractor(c)} style={{
                padding: "12px 14px", borderBottom: `1px solid ${theme.border}`, cursor: "pointer",
                background: selected?.id === c.id ? `${theme.primary}10` : "#fff",
                borderLeft: selected?.id === c.id ? `3px solid ${theme.primary}` : "3px solid transparent",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{name}</div>
                  <StatusPill label={hr.tier || "Active Roster"} color={tc.color} bg={tc.bg} />
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted }}>
                  {c.role || c.primary_role || "Crew"} · {steps}/{ONBOARD_STEPS.length} onboarded
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: theme.textMuted, textAlign: "center" }}>{filtered.length} contractor{filtered.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Detail */}
      {!selected ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: theme.textMuted, fontSize: 13 }}>
          Select a contractor to view their HR record
        </div>
      ) : (() => {
        const hr    = hrData[selected.uid || selected.id] || {};
        const name  = selected.name || `${selected.first_name || ""} ${selected.last_name || ""}`.trim();
        const gc    = gustoColor(hrDraft.gusto_status);
        const onboardComplete = ONBOARD_STEPS.every(s => hrDraft.onboarding?.[s.key]);

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>{name}</h2>
                <div style={{ fontSize: 13, color: theme.textMuted }}>{selected.role || selected.primary_role || "Crew Member"}</div>
              </div>
              {isFounder && (
                <button onClick={saveHR} disabled={saving} style={{
                  padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: theme.primary, color: "#fff", fontSize: 12, fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.6 : 1,
                }}>{saving ? "Saving…" : "Save HR Record"}</button>
              )}
            </div>

            {/* Profile info from volunteerProfiles (read-only) */}
            <Card>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Profile (from Axis)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  ["Email",       selected.email || selected.contact_email || "—"],
                  ["Phone",       selected.phone || selected.phoneNumber || "—"],
                  ["City",        selected.city || selected.location || "—"],
                  ["Events Done", selected.events_completed || selected.eventCount || "—"],
                  ["Axis UID",    selected.uid || selected.id],
                  ["IC Signed",   selected.ic_agreement_signed ? "✓ Yes" : "Not yet"],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13, color: theme.text }}>{String(val)}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* HR layer — editable */}
            <Card>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>HR Record</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Crew Tier</label>
                  <select value={hrDraft.tier || "Active Roster"} onChange={e => setHrDraft(p => ({ ...p, tier: e.target.value }))}
                    disabled={!isFounder} style={inputStyle}>
                    {CREW_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Gusto Status</label>
                  <select value={hrDraft.gusto_status || "not_added"} onChange={e => setHrDraft(p => ({ ...p, gusto_status: e.target.value }))}
                    disabled={!isFounder} style={{ ...inputStyle, color: gc.color }}>
                    <option value="not_added">Not Added</option>
                    <option value="pending">Pending</option>
                    <option value="added">In Gusto</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input type="date" value={hrDraft.start_date || ""} onChange={e => setHrDraft(p => ({ ...p, start_date: e.target.value }))}
                    disabled={!isFounder} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Emergency Contact</label>
                  <input value={hrDraft.emergency_contact || ""} onChange={e => setHrDraft(p => ({ ...p, emergency_contact: e.target.value }))}
                    placeholder="Name — Phone" disabled={!isFounder} style={inputStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Notes (internal only)</label>
                  <textarea value={hrDraft.notes || ""} onChange={e => setHrDraft(p => ({ ...p, notes: e.target.value }))}
                    rows={3} placeholder="Performance notes, flags, context…" disabled={!isFounder}
                    style={{ ...inputStyle, resize: "vertical" }} />
                </div>
              </div>
            </Card>

            {/* Onboarding checklist */}
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Onboarding Checklist</div>
                {onboardComplete
                  ? <StatusPill label="✓ Complete" color="#2d7a46" bg="rgba(45,122,70,0.1)" />
                  : <StatusPill label="In Progress" color="#D97706" bg="rgba(217,119,6,0.1)" />
                }
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ONBOARD_STEPS.map(step => {
                  const done = !!hrDraft.onboarding?.[step.key];
                  return (
                    <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        onClick={() => isFounder && toggleOnboardStep(step.key)}
                        style={{
                          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                          border: `2px solid ${done ? theme.primary : theme.border}`,
                          background: done ? theme.primary : "#fff",
                          cursor: isFounder ? "pointer" : "default",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {done && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
                      </button>
                      <span style={{ fontSize: 13, color: done ? theme.text : theme.textMuted, fontWeight: done ? 600 : 400 }}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: theme.textMuted }}>
                {ONBOARD_STEPS.filter(s => hrDraft.onboarding?.[s.key]).length} of {ONBOARD_STEPS.length} steps complete
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SOPs
// ─────────────────────────────────────────────────────────────────────────────

function SOPs({ isFounder, activeUser }) {
  const [sops,        setSops]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [adding,      setAdding]      = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [catFilter,   setCatFilter]   = useState("all");
  const [draft, setDraft] = useState({
    title: "", category: "Operations", version: "1.0",
    owner: "", drive_url: "", summary: "",
  });

  useEffect(() => { loadSOPs(); }, []);

  const loadSOPs = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "hr_sops"), orderBy("category")));
      setSops(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("SOP load error:", e); }
    setLoading(false);
  };

  const saveSOP = async () => {
    if (!draft.title || !draft.drive_url) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "hr_sops"), {
        ...draft,
        createdBy: activeUser,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await loadSOPs();
      setAdding(false);
      setDraft({ title: "", category: "Operations", version: "1.0", owner: "", drive_url: "", summary: "" });
    } catch (e) { console.error("SOP save error:", e); }
    setSaving(false);
  };

  const deleteSOP = async (id) => {
    await deleteDoc(doc(db, "hr_sops", id));
    setSops(prev => prev.filter(s => s.id !== id));
  };

  const CAT_COLORS = {
    "Operations":        { color: "#1C4A36", bg: "rgba(28,74,54,0.1)"    },
    "Finance":           { color: "#2563EB", bg: "rgba(37,99,235,0.08)"  },
    "HR":                { color: "#D97706", bg: "rgba(217,119,6,0.1)"   },
    "Client Management": { color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
    "Safety":            { color: "#C0392B", bg: "rgba(192,57,43,0.08)"  },
    "Technology":        { color: "#0891B2", bg: "rgba(8,145,178,0.08)"  },
  };

  const filtered = catFilter === "all" ? sops : sops.filter(s => s.category === catFilter);

  if (loading) return <Spinner size={24} />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {["all", ...SOP_CATS].map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{
              padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: catFilter === c ? theme.primary : "transparent",
              color: catFilter === c ? "#fff" : theme.textMuted,
              border: `1px solid ${catFilter === c ? theme.primary : theme.border}`,
              fontFamily: "'DM Sans', sans-serif",
            }}>{c === "all" ? "All" : c}</button>
          ))}
        </div>
        {isFounder && (
          <button onClick={() => setAdding(v => !v)} style={{
            padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: theme.primary, color: "#fff", fontSize: 12, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
          }}>{adding ? "Cancel" : "+ Add SOP"}</button>
        )}
      </div>

      {/* Add form */}
      {adding && isFounder && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 12 }}>New SOP</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Title *</label>
              <input value={draft.title} onChange={e => setDraft(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Event Day Check-In Protocol" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={draft.category} onChange={e => setDraft(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
                {SOP_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Version</label>
              <input value={draft.version} onChange={e => setDraft(p => ({ ...p, version: e.target.value }))}
                placeholder="1.0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Owner</label>
              <input value={draft.owner} onChange={e => setDraft(p => ({ ...p, owner: e.target.value }))}
                placeholder="Ashley, Mikal, Shanell…" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Google Drive URL *</label>
              <input value={draft.drive_url} onChange={e => setDraft(p => ({ ...p, drive_url: e.target.value }))}
                placeholder="https://docs.google.com/…" style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Summary (optional)</label>
              <textarea value={draft.summary} onChange={e => setDraft(p => ({ ...p, summary: e.target.value }))}
                rows={2} placeholder="One or two sentences about what this SOP covers…"
                style={{ ...inputStyle, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveSOP} disabled={saving || !draft.title || !draft.drive_url} style={{
              padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              background: theme.primary, color: "#fff", fontSize: 12, fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              opacity: saving || !draft.title || !draft.drive_url ? 0.5 : 1,
            }}>{saving ? "Saving…" : "Save SOP"}</button>
            <button onClick={() => setAdding(false)} style={{
              padding: "7px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, cursor: "pointer",
              background: "transparent", color: theme.textMuted, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
            }}>Cancel</button>
          </div>
        </Card>
      )}

      {/* SOP list */}
      {filtered.length === 0 ? (
        <Card>
          <div style={{ fontSize: 13, color: theme.textMuted, padding: "20px 0", textAlign: "center" }}>
            No SOPs yet. {isFounder ? "Add your first one above." : "SOPs will appear here once added by a founder."}
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(sop => {
            const cc = CAT_COLORS[sop.category] || { color: theme.textMuted, bg: theme.border };
            return (
              <Card key={sop.id}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{sop.title}</div>
                      <StatusPill label={sop.category} color={cc.color} bg={cc.bg} />
                      <span style={{ fontSize: 10, color: theme.textMuted }}>v{sop.version}</span>
                    </div>
                    {sop.summary && <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>{sop.summary}</div>}
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      Owner: {sop.owner || "—"} · Updated: {sop.updatedAt?.toDate?.()?.toLocaleDateString?.() || "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <a href={sop.drive_url} target="_blank" rel="noreferrer" style={{
                      padding: "6px 14px", borderRadius: 7, background: theme.primary, color: "#fff",
                      fontSize: 11, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap",
                    }}>Open in Drive ↗</a>
                    {isFounder && (
                      <button onClick={() => deleteSOP(sop.id)} style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: theme.textMuted, fontSize: 16, padding: "0 4px",
                      }}>×</button>
                    )}
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

// ─────────────────────────────────────────────────────────────────────────────
// ORG CHART
// ─────────────────────────────────────────────────────────────────────────────

function OrgChart() {
  const nodes = [
    {
      tier: "Leadership",
      people: [
        { name: "Ashley Glenn",  title: "Co-Founder · Motion & Method LLC", note: "Technology, Client Relations, Operations" },
        { name: "Mikal Driver",  title: "Co-Founder · Motion & Method LLC", note: "Operations, Strategy, Business Development" },
      ],
    },
    {
      tier: "Senior Operations",
      people: [
        { name: "Shanell Jefferson", title: "Senior Operations Manager", note: "Event Ops, Contractor Management, Onboarding" },
      ],
    },
    {
      tier: "Crew — Team Lead Pipeline",
      people: null,
      note: "Team Leads are promoted from Priority Crew. Manage shift lanes and crew check-in on event day.",
      dynamic: true,
      tier_key: "Team Lead Pipeline",
    },
    {
      tier: "Crew — Priority Crew",
      people: null,
      note: "Returning crew with strong event history. First call for staffing.",
      dynamic: true,
      tier_key: "Priority Crew",
    },
    {
      tier: "Crew — Active Roster",
      people: null,
      note: "Active contractors available for assignment.",
      dynamic: true,
      tier_key: "Active Roster",
    },
  ];

  const TIER_COLORS = {
    "Leadership":             { color: "#1C4A36", border: "rgba(28,74,54,0.35)",   bg: "rgba(28,74,54,0.07)"   },
    "Senior Operations":      { color: "#D97706", border: "rgba(217,119,6,0.3)",   bg: "rgba(217,119,6,0.06)"  },
    "Crew — Team Lead Pipeline": { color: "#7C3AED", border: "rgba(124,58,237,0.25)", bg: "rgba(124,58,237,0.05)" },
    "Crew — Priority Crew":   { color: "#2563EB", border: "rgba(37,99,235,0.25)",  bg: "rgba(37,99,235,0.05)"  },
    "Crew — Active Roster":   { color: "#2d7a46", border: "rgba(45,122,70,0.25)",  bg: "rgba(45,122,70,0.05)"  },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {nodes.map((node, i) => {
        const tc = TIER_COLORS[node.tier] || { color: theme.textMuted, border: theme.border, bg: theme.background };
        return (
          <div key={node.tier}>
            {/* Connector line */}
            {i > 0 && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                <div style={{ width: 2, height: 16, background: theme.border }} />
              </div>
            )}
            <div style={{ padding: "16px 20px", borderRadius: 12, border: `1.5px solid ${tc.border}`, background: tc.bg }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: tc.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                {node.tier}
              </div>
              {node.people && (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {node.people.map(p => (
                    <div key={p.name} style={{ minWidth: 200 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: tc.color, fontWeight: 600, marginBottom: 2 }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted }}>{p.note}</div>
                    </div>
                  ))}
                </div>
              )}
              {node.dynamic && (
                <div style={{ fontSize: 12, color: theme.textMuted, fontStyle: "italic" }}>
                  {node.note} — See Contractor Records for current roster.
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: theme.textMuted, textAlign: "center", marginTop: 4 }}>
        Org chart reflects current M&M structure. Updates automatically as crew tiers are managed in Contractor Records.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE TRACKER
// ─────────────────────────────────────────────────────────────────────────────

function ComplianceTracker({ isFounder }) {
  const [events,       setEvents]       = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [compliance,   setCompliance]   = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);

  // 90-day items (staffing forms, venue access, floor layouts)
  // 30-day items (remaining required forms)
  const NINETY_DAY = [
    { key: "staffing_forms",    label: "Staffing Forms Submitted"         },
    { key: "venue_access",      label: "Venue Access Confirmed"           },
    { key: "floor_layouts",     label: "Floor Layouts Received"           },
    { key: "scope_locked",      label: "Scope of Work Locked"             },
    { key: "insurance_coi",     label: "COI / Insurance Docs Received"    },
  ];
  const THIRTY_DAY = [
    { key: "final_headcount",   label: "Final Headcount Confirmed"        },
    { key: "shift_schedule",    label: "Shift Schedule Published"         },
    { key: "contractor_ics",    label: "All IC Agreements Signed"         },
    { key: "client_invoice",    label: "Invoice Sent & Deposit Collected" },
    { key: "emergency_plan",    label: "Emergency Plan Distributed"       },
  ];

  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "events"));
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(e => e.status !== "archived")
        .sort((a, b) => (b.event_date || "").localeCompare(a.event_date || "")));
      setLoading(false);
    };
    load();
  }, []);

  const loadCompliance = async (event) => {
    setSelected(event);
    setCompliance(null);
    try {
      const snap = await getDoc(doc(db, "event_compliance", event.id));
      setCompliance(snap.exists() ? snap.data() : { ninety_day: {}, thirty_day: {}, notes: "" });
    } catch (e) {
      setCompliance({ ninety_day: {}, thirty_day: {}, notes: "" });
    }
  };

  const toggle = (bucket, key) => {
    setCompliance(prev => ({
      ...prev,
      [bucket]: { ...prev[bucket], [key]: !prev[bucket]?.[key] },
    }));
  };

  const save = async () => {
    if (!selected || !compliance) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "event_compliance", selected.id), {
        ...compliance,
        eventId:   selected.id,
        eventName: selected.event_nickname || selected.name || "",
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) { console.error("Compliance save error:", e); }
    setSaving(false);
  };

  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const ChecklistSection = ({ title, deadline, items, bucket, color }) => {
    const done  = items.filter(i => compliance?.[bucket]?.[i.key]).length;
    const total = items.length;
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color }}>{title}</div>
            <div style={{ fontSize: 11, color: theme.textMuted }}>{deadline}</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: done === total ? "#2d7a46" : theme.textMuted }}>
            {done}/{total}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {items.map(item => {
            const checked = !!compliance?.[bucket]?.[item.key];
            return (
              <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => isFounder && toggle(bucket, item.key)}
                  style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: `2px solid ${checked ? theme.primary : theme.border}`,
                    background: checked ? theme.primary : "#fff",
                    cursor: isFounder ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {checked && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                </button>
                <span style={{ fontSize: 13, color: checked ? theme.text : theme.textMuted, fontWeight: checked ? 600 : 400 }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) return <Spinner size={24} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20 }}>
      {/* Event list */}
      <div>
        <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${theme.border}`, background: theme.background }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Select Event</div>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {events.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: theme.textMuted }}>No events found.</div>
            ) : events.map(e => {
              const days = daysUntil(e.event_date);
              const isSelected = selected?.id === e.id;
              const urgent = days !== null && days <= 30 && days >= 0;
              return (
                <div key={e.id} onClick={() => loadCompliance(e)} style={{
                  padding: "11px 14px", borderBottom: `1px solid ${theme.border}`, cursor: "pointer",
                  background: isSelected ? `${theme.primary}10` : "#fff",
                  borderLeft: isSelected ? `3px solid ${theme.primary}` : `3px solid ${urgent ? "#C0392B" : "transparent"}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{e.event_nickname || e.name}</div>
                  <div style={{ fontSize: 11, color: urgent ? "#C0392B" : theme.textMuted }}>
                    {e.event_date || "No date"}{days !== null && days >= 0 ? ` · ${days}d away` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Compliance detail */}
      {!selected ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: theme.textMuted, fontSize: 13 }}>
          Select an event to manage compliance
        </div>
      ) : !compliance ? (
        <Spinner size={20} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
                {selected.event_nickname || selected.name}
              </h2>
              <div style={{ fontSize: 12, color: theme.textMuted }}>{selected.event_date || "No date set"}</div>
            </div>
            {isFounder && (
              <button onClick={save} disabled={saving} style={{
                padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: theme.primary, color: "#fff", fontSize: 12, fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.6 : 1,
              }}>{saving ? "Saving…" : "Save"}</button>
            )}
          </div>

          <Card>
            <ChecklistSection
              title="90-Day Checklist"
              deadline="Required 90 days before event — staffing, venue, scope"
              items={NINETY_DAY}
              bucket="ninety_day"
              color="#D97706"
            />
            <ChecklistSection
              title="30-Day Checklist"
              deadline="Required 30 days before event — final confirmations"
              items={THIRTY_DAY}
              bucket="thirty_day"
              color="#C0392B"
            />
            <div>
              <label style={labelStyle}>Compliance Notes</label>
              <textarea
                value={compliance.notes || ""}
                onChange={e => setCompliance(prev => ({ ...prev, notes: e.target.value }))}
                rows={3} placeholder="Flags, open items, client pushback…"
                disabled={!isFounder}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING VIEW
// ─────────────────────────────────────────────────────────────────────────────

function OnboardingView({ isFounder }) {
  const [contractors, setContractors] = useState([]);
  const [hrData,      setHrData]      = useState({});
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState("incomplete"); // all | incomplete | complete

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [profSnap, hrSnap] = await Promise.all([
          getDocs(query(collection(db, "volunteerProfiles"), where("isContractor", "==", true))),
          getDocs(collection(db, "hr_contractors")),
        ]);
        const hr = {};
        hrSnap.docs.forEach(d => { hr[d.data().uid || d.id] = { id: d.id, ...d.data() }; });
        setContractors(profSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setHrData(hr);
      } catch (e) { console.error("Onboarding load error:", e); }
      setLoading(false);
    };
    load();
  }, []);

  const getProgress = (c) => {
    const hr = hrData[c.uid || c.id] || {};
    const done = ONBOARD_STEPS.filter(s => hr.onboarding?.[s.key]).length;
    return { done, total: ONBOARD_STEPS.length, complete: done === ONBOARD_STEPS.length, hr };
  };

  const filtered = contractors.filter(c => {
    const { complete } = getProgress(c);
    if (filter === "complete")   return complete;
    if (filter === "incomplete") return !complete;
    return true;
  }).sort((a, b) => {
    const pa = getProgress(a).done, pb = getProgress(b).done;
    return pb - pa; // most progress first
  });

  const totalComplete   = contractors.filter(c => getProgress(c).complete).length;
  const totalIncomplete = contractors.length - totalComplete;

  if (loading) return <Spinner size={24} />;

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total Contractors", value: contractors.length, color: theme.primary },
          { label: "Fully Onboarded",   value: totalComplete,      color: "#2d7a46"     },
          { label: "In Progress",       value: totalIncomplete,    color: "#D97706"     },
        ].map(s => (
          <div key={s.label} style={{ padding: "14px 18px", borderRadius: 10, background: "#fff", border: `1px solid ${theme.border}`, flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[
          { key: "incomplete", label: "Needs Attention" },
          { key: "complete",   label: "Complete"        },
          { key: "all",        label: "All"             },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
            background: filter === f.key ? theme.primary : "transparent",
            color: filter === f.key ? "#fff" : theme.textMuted,
            border: `1px solid ${filter === f.key ? theme.primary : theme.border}`,
            fontFamily: "'DM Sans', sans-serif",
          }}>{f.label}</button>
        ))}
      </div>

      {/* Contractor onboarding cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 ? (
          <Card>
            <div style={{ fontSize: 13, color: theme.textMuted, textAlign: "center", padding: "20px 0" }}>
              No contractors in this category.
            </div>
          </Card>
        ) : filtered.map(c => {
          const { done, total, complete, hr } = getProgress(c);
          const name = c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unnamed";
          const pct  = Math.round((done / total) * 100);
          return (
            <Card key={c.id}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{name}</div>
                    {complete
                      ? <StatusPill label="✓ Complete" color="#2d7a46" bg="rgba(45,122,70,0.1)" />
                      : <StatusPill label="In Progress" color="#D97706" bg="rgba(217,119,6,0.1)" />
                    }
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>
                    {c.role || "Crew"} · {hr.tier || "Active Roster"} · Gusto: {hr.gusto_status === "added" ? "✓ Added" : hr.gusto_status === "pending" ? "Pending" : "Not Added"}
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 5, borderRadius: 999, background: theme.border, marginBottom: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: complete ? "#2d7a46" : theme.primary, borderRadius: 999, transition: "width 0.3s" }} />
                  </div>
                  {/* Step pills */}
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {ONBOARD_STEPS.map(step => {
                      const done = !!hr.onboarding?.[step.key];
                      return (
                        <span key={step.key} style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                          background: done ? "rgba(45,122,70,0.1)" : "rgba(107,114,128,0.08)",
                          color: done ? "#2d7a46" : theme.textMuted,
                          border: `1px solid ${done ? "rgba(45,122,70,0.25)" : theme.border}`,
                        }}>{done ? "✓ " : ""}{step.label}</span>
                      );
                    })}
                  </div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: complete ? "#2d7a46" : theme.primary, textAlign: "right", flexShrink: 0 }}>
                  {done}/{total}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const HR_TABS = [
  { key: "contractors", label: "Contractor Records" },
  { key: "onboarding",  label: "Onboarding"         },
  { key: "sops",        label: "SOPs"               },
  { key: "org",         label: "Org Chart"          },
  { key: "compliance",  label: "Compliance"         },
];

export default function HR() {
  const { activeUser } = useAuth();
  const isFounder  = FOUNDERS.some(f => (activeUser || "").includes(f));
  const [activeTab, setActiveTab] = useState("contractors");

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'DM Sans', sans-serif", maxWidth: 1100 }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
          People & Operations
        </h1>
        <div style={{ fontSize: 13, color: theme.textMuted }}>
          Contractor records, onboarding, SOPs, org structure, and compliance
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${theme.border}` }}>
        {HR_TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
            background: activeTab === t.key ? "#fff" : "transparent",
            color: activeTab === t.key ? theme.primary : theme.textMuted,
            fontSize: 13, fontWeight: activeTab === t.key ? 700 : 500,
            fontFamily: "'DM Sans', sans-serif",
            borderBottom: activeTab === t.key ? `2px solid ${theme.primary}` : "2px solid transparent",
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === "contractors" && <ContractorRecords isFounder={isFounder} />}
      {activeTab === "onboarding"  && <OnboardingView isFounder={isFounder} />}
      {activeTab === "sops"        && <SOPs isFounder={isFounder} activeUser={activeUser} />}
      {activeTab === "org"         && <OrgChart />}
      {activeTab === "compliance"  && <ComplianceTracker isFounder={isFounder} />}
    </div>
  );
}