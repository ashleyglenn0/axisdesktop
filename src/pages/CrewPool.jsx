import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc, serverTimestamp, writeBatch, addDoc, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Badge, Button, SectionHeader, Spinner, EmptyState, Input } from "../components/UI";

// ── Cloud Functions ───────────────────────────────────────────────────────────
const mmFunctions          = getFunctions();
const sendMMPortalInviteFn = httpsCallable(mmFunctions, "sendMMPortalInvite");

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

const CHECKR_DASHBOARD_URL = "https://dashboard.checkr.com";

const DEFAULT_RATE_CARD = {
  hourly: [
    { role: "team_lead",            label: "Team Lead",            rate: 30  },
    { role: "ops_lead",             label: "Ops Lead",             rate: 55  },
    { role: "general_contractor",   label: "General Contractor",   rate: 22  },
    { role: "technical_specialist", label: "Technical Specialist", rate: 28  },
  ],
  flat: [
    {
      role: "engagement_lead",
      label: "Engagement Lead",
      tiers: [
        { label: "Small (< 500) — flat/event",     max: 499,    rate: 1250 },
        { label: "Medium (500–1499) — flat/event", max: 1499,   rate: 2000 },
        { label: "Large (1500+) — flat/day",       max: 999999, rate: 3000 },
      ],
    },
    {
      role: "founder_ops_manager",
      label: "Founder / Ops Manager",
      note: "Same rate as Engagement Lead at every tier. #3 (Ops Manager): Small tier = $55/hr in Ops Lead capacity. Medium = $1,000 flat/event. Large = $2,000 flat/day.",
      tiers: [
        { label: "Small (< 500) — flat/event",     max: 499,    rate: 1250 },
        { label: "Medium (500–1499) — flat/event", max: 1499,   rate: 2000 },
        { label: "Large (1500+) — flat/day",       max: 999999, rate: 3000 },
      ],
    },
  ],
};

const getRateForRole = (rateCard, role, attendeeCount = 0) => {
  const hourly = (rateCard?.hourly || DEFAULT_RATE_CARD.hourly).find(r => r.role === role);
  if (hourly) return { type: "hourly", rate: hourly.rate, label: `$${hourly.rate}/hr` };
  const flat = (rateCard?.flat || DEFAULT_RATE_CARD.flat).find(r => r.role === role);
  if (flat) {
    const tier = flat.tiers.find(t => attendeeCount <= t.max) || flat.tiers[flat.tiers.length - 1];
    return { type: "flat", rate: tier.rate, label: tier.rate > 0 ? `$${tier.rate} flat` : "Rate TBD" };
  }
  return null;
};

const CONTRACTOR_TYPES = [
  { value: "event_contractor", label: "Event Contractor" },
  { value: "mm_staff",         label: "M&M Staff" },
  { value: "volunteer",        label: "Volunteer" },
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
  contractor_type:      p.contractor_type || (p.preference === "Contractor / IC" || p.isContractor ? "event_contractor" : "volunteer"),
  bg_status:            p.bg_status || "not_started",
  bg_cleared_date:      p.bg_cleared_date || null,
  reimbursement_due:    p.contractor_type === "event_contractor" ? (p.reimbursement_due || false) : false,
  reimbursement_amount: p.reimbursement_amount || 29,
  reimbursement_paid:   p.reimbursement_paid || false,
  checkr_invite_sent:   p.checkr_invite_sent || false,
  checkr_invite_date:   p.checkr_invite_date || null,
  ica_url:              p.ica_url || "",
  priority_contractor:  p.priority_contractor || false,
  reliability_score:    p.reliability_score   || null,
  events_completed:     p.events_completed    || 0,
  // Portal / onboarding invite
  portal_invite_sent:   p.portal_invite_sent  || false,
  portal_invite_date:   p.portal_invite_date  || null,
  volunteerProfileId:   p.volunteerProfileId  || p.uid || null,
});

const BG_STATUS = {
  not_started: { label: "Not Started",  color: "#999",    bg: "rgba(150,150,150,0.1)" },
  pending:     { label: "Pending",      color: "#E07B2A", bg: "rgba(224,123,42,0.1)"  },
  cleared:     { label: "Cleared ✓",   color: "#2d7a46", bg: "rgba(45,122,70,0.1)"   },
  not_cleared: { label: "Not Cleared", color: "#8B0000", bg: "rgba(139,0,0,0.1)"     },
};

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
  const [people,        setPeople]        = useState([]);
  const [events,        setEvents]        = useState([]);
  const [selected,      setSelected]      = useState(null);
  const [assignments,   setAssignments]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [search,        setSearch]        = useState("");
  const [filter,        setFilter]        = useState("all");
  const [showAssign,    setShowAssign]    = useState(false);
  const [assignEventId, setAssignEventId] = useState("");
  const [assignRole,    setAssignRole]    = useState("volunteer");
  const [assignHours,   setAssignHours]   = useState("");
  const [assignNote,    setAssignNote]    = useState("");
  const [assignBenchStatus,    setAssignBenchStatus]    = useState("none");
  const [assignEngagementType, setAssignEngagementType] = useState("volunteer");
  const [rateCard,      setRateCard]      = useState(DEFAULT_RATE_CARD);
  const [showRateCard,  setShowRateCard]  = useState(false);
  const [editingRates,  setEditingRates]  = useState(false);
  const [rateCardDraft, setRateCardDraft] = useState(null);
  const [savingRates,   setSavingRates]   = useState(false);
  const [editingBg,     setEditingBg]     = useState(false);
  const [bgStatus,      setBgStatus]      = useState("not_started");
  const [bgDate,        setBgDate]        = useState("");
  const [editingIca,    setEditingIca]    = useState(false);
  const [icaUrl,        setIcaUrl]        = useState("");
  const [editingType,   setEditingType]   = useState(false);
  const [contractorType,setContractorType]= useState("event_contractor");

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [peopleSnap, eventsSnap, rateSnap] = await Promise.all([
      getDocs(collection(db, "talent_pool")),
      getDocs(collection(db, "events")),
      getDocs(collection(db, "mm_rate_card")),
    ]);
    setPeople(peopleSnap.docs.map(d => normPerson({ id: d.id, ...d.data() })));
    setEvents(eventsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    if (!rateSnap.empty) setRateCard(rateSnap.docs[0].data());
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

  const refreshPerson = async (id) => {
    const snap = await getDocs(collection(db, "talent_pool"));
    const refreshed = snap.docs.map(d => normPerson({ id: d.id, ...d.data() }));
    setPeople(refreshed);
    const updated = refreshed.find(p => p.id === id);
    if (updated) setSelected(updated);
  };

  const toggleCheck = async (person, field) => {
    setSaving(true);
    await updateDoc(doc(db, "talent_pool", person.id), { [field]: !person[field] });
    await refreshPerson(person.id);
    setSaving(false);
  };

  const saveBgCheck = async () => {
    if (!selected) return;
    setSaving(true);
    const isCleared         = bgStatus === "cleared";
    const isEventContractor = selected.contractor_type === "event_contractor";
    const reimbFields = isEventContractor && isCleared
      ? { reimbursement_due: true, reimbursement_amount: 29, reimbursement_paid: false }
      : {};
    await updateDoc(doc(db, "talent_pool", selected.id), {
      bg_status:        bgStatus,
      bg_cleared_date:  bgDate || null,
      background_check: isCleared,
      ...reimbFields,
    });
    await refreshPerson(selected.id);
    setEditingBg(false);
    setSaving(false);
  };

  const saveIca = async () => {
    if (!selected) return;
    setSaving(true);
    await updateDoc(doc(db, "talent_pool", selected.id), { ica_url: icaUrl, ic_agreement: !!icaUrl });
    await refreshPerson(selected.id);
    setEditingIca(false);
    setSaving(false);
  };

  const saveContractorType = async () => {
    if (!selected) return;
    setSaving(true);
    await updateDoc(doc(db, "talent_pool", selected.id), {
      contractor_type: contractorType,
      isContractor: contractorType !== "volunteer",
    });
    await refreshPerson(selected.id);
    setEditingType(false);
    setSaving(false);
  };

  const markReimbursementPaid = async () => {
    if (!selected) return;
    setSaving(true);
    await updateDoc(doc(db, "talent_pool", selected.id), {
      reimbursement_paid: true,
      reimbursement_due: false,
    });
    await refreshPerson(selected.id);
    setSaving(false);
  };

  // ── Send onboarding invite via Cloud Function ─────────────────────────────
  const sendOnboardingInvite = async () => {
    if (!selected) return;
    const email = selected.display_email;
    if (!email || email === "—") {
      alert("No email on record for this person.");
      return;
    }
    setSaving(true);
    try {
      await sendMMPortalInviteFn({
        pipelineId:         selected.id,
        onboardingPacketUrl: "https://drive.google.com/your-onboarding-packet-link", // replace with actual Drive link
        deepLink:           "https://axismobile.app.link/onboard",
      });
      await updateDoc(doc(db, "talent_pool", selected.id), {
        portal_invite_sent: true,
        portal_invite_date: new Date().toISOString(),
      });
      await refreshPerson(selected.id);
    } catch (err) {
      console.error("Onboarding invite error:", err);
      alert(`Failed to send invite: ${err.message}`);
    }
    setSaving(false);
  };

  // ── handleAssign — atomic batch, volunteerProfiles sync, no volunteers writes
  const handleAssign = async () => {
    if (!selected || !assignEventId) return;

    // Soft gate — advisory warning, founders/ops leads can override
    const gate = assignmentGate(selected);
    if (gate) {
      const override = window.confirm(`Warning: ${gate}\n\nDo you want to assign anyway?`);
      if (!override) return;
    }

    const event = events.find(e => e.id === assignEventId);
    if (!event) return;

    const hourlyRate = parseRate(selected.display_rate);
    const hours      = parseFloat(assignHours) || 0;
    const estPay     = selected.is_contractor && hourlyRate && hours
      ? hourlyRate * hours
      : null;

    const benchStatus = assignBenchStatus !== "none" ? assignBenchStatus : null;
    const benchEvent  = benchStatus ? assignEventId : null;

    setSaving(true);

    const assignmentPayload = {
      event_id:          assignEventId,
      event_name:        event.name || assignEventId,
      event_date:        event.event_date || null,
      access_code:       event.access_code || null,
      floor_role:        assignRole,
      comp_type:         selected.is_contractor ? "contractor" : "volunteer",
      engagementType:    assignEngagementType,
      benchStatus,
      benchEvent,
      estimated_hours:   hours || null,
      estimated_pay:     estPay,
      hourly_rate:       hourlyRate,
      event_code_sent:   false,
      assignment_status: "confirmed",
      assigned_by:       activeUser,
      assigned_at:       serverTimestamp(),
      note:              assignNote || null,
    };

    const rosterPayload = {
      uid:                 selected.uid || selected.id,
      name:                selected.display_name,
      email:               selected.display_email,
      floor_role:          assignRole,
      comp_type:           selected.is_contractor ? "contractor" : "volunteer",
      isContractor:        selected.is_contractor,
      engagementType:      assignEngagementType,
      benchStatus,
      benchEvent,
      estimated_hours:     hours || null,
      estimated_pay:       estPay,
      ic_agreement_url:    selected.ica_url || null,
      onboarding_complete: selected.onboarding_complete || false,
      background_check:    selected.background_check    || false,
      ic_agreement:        selected.ic_agreement        || false,
      axis_trained:        selected.axis_trained        || false,
      event_code_sent:     false,
      assigned_by:         activeUser,
      assigned_at:         serverTimestamp(),
    };

    // Use writeBatch — all writes succeed or all fail
    const batch = writeBatch(db);

    // talent_pool assignment subcollection
    batch.set(
      doc(db, "talent_pool", selected.id, "assignments", assignEventId),
      assignmentPayload
    );

    // events roster
    batch.set(
      doc(db, "events", assignEventId, "roster", selected.id),
      rosterPayload
    );

    // volunteerProfiles sync by uid — ONLY if uid exists (app access granted)
    // NEVER writes to volunteers collection
    const uid = selected.uid || selected.volunteerProfileId || null;
    if (uid) {
      batch.set(
        doc(db, "volunteerProfiles", uid),
        {
          event_id:       assignEventId,
          event:          event.name || assignEventId,
          engagementType: assignEngagementType,
          benchStatus,
          benchEvent,
          floor_role:     assignRole,
          talentPoolId:   selected.id,
          lastUpdatedBy:  activeUser,
          lastUpdatedAt:  serverTimestamp(),
        },
        { merge: true } // merge so we don't overwrite existing profile data
      );
    }

    // talent_pool root — update last assigned
    batch.update(doc(db, "talent_pool", selected.id), {
      last_assigned_event: assignEventId,
      last_assigned_at:    serverTimestamp(),
    });

    await batch.commit();

    setShowAssign(false);
    setAssignEventId("");
    setAssignRole("volunteer");
    setAssignHours("");
    setAssignNote("");
    setAssignBenchStatus("none");
    setAssignEngagementType("volunteer");
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
    const matchSearch = !search
      || p.display_name.toLowerCase().includes(search.toLowerCase())
      || p.display_email.toLowerCase().includes(search.toLowerCase());
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

  const sendCheckrInvite = async () => {
    if (!selected) return;
    window.open(CHECKR_DASHBOARD_URL, "_blank");
    setSaving(true);
    await updateDoc(doc(db, "talent_pool", selected.id), {
      checkr_invite_sent: true,
      checkr_invite_date: new Date().toISOString().split("T")[0],
      bg_status:          "pending",
      background_check:   false,
    });
    await refreshPerson(selected.id);
    setSaving(false);
  };

  const togglePriorityPlacement = async () => {
    if (!selected) return;
    setSaving(true);
    await updateDoc(doc(db, "talent_pool", selected.id), {
      priority_contractor: !selected.priority_contractor,
    });
    await refreshPerson(selected.id);
    setSaving(false);
  };

  const saveRateCard = async () => {
    if (!rateCardDraft) return;
    setSavingRates(true);
    const snap = await getDocs(collection(db, "mm_rate_card"));
    if (snap.empty) {
      await addDoc(collection(db, "mm_rate_card"), rateCardDraft);
    } else {
      await updateDoc(doc(db, "mm_rate_card", snap.docs[0].id), rateCardDraft);
    }
    setRateCard(rateCardDraft);
    setEditingRates(false);
    setSavingRates(false);
  };

  const availableRoles = FLOOR_ROLES.filter(r => !r.contractorOnly || selected?.is_contractor);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <Spinner size={32} />
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* ── List panel ──────────────────────────────────────────────────────── */}
      <div style={{ width: 290, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", background: theme.surface, flexShrink: 0 }}>
        <div style={{ padding: "20px 14px 12px", borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h2 style={{ margin: "0 0 3px", fontSize: 19, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Talent Pool</h2>
            <button
              onClick={() => { setShowRateCard(v => !v); setEditingRates(false); }}
              style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: showRateCard ? theme.primary : "transparent", color: showRateCard ? "#fff" : theme.textMuted, border: `1px solid ${showRateCard ? theme.primary : theme.border}`, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
            >Rate Card</button>
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>
            {people.length} registered · <span style={{ color: theme.secondary, fontWeight: 700 }}>{people.filter(p => assignmentGate(p) === null).length} ready</span>
          </div>
          <Input inputStyle={{ width: "100%", boxSizing: "border-box" }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap" }}>
            {[["all","All"],["contractor","Contractor"],["volunteer","Volunteer"],["ready","Ready ✓"],["pending","Pending"]].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: "pointer", background: filter === key ? theme.primary : "transparent", color: filter === key ? theme.onPrimary : theme.textMuted, border: `1px solid ${filter === key ? theme.primary : theme.border}`, fontFamily: "'DM Sans', sans-serif" }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0
            ? <EmptyState icon="◎" title="No people found" />
            : filtered.map(person => {
              const status = getStatusLabel(person);
              const sc     = STATUS_COLORS[status] || STATUS_COLORS.pending;
              const ready  = assignmentGate(person) === null;
              return (
                <div key={person.id} onClick={() => handleSelect(person)}
                  style={{ padding: "11px 14px", borderBottom: `1px solid ${theme.border}`, cursor: "pointer", background: selected?.id === person.id ? theme.background : theme.surface, borderLeft: selected?.id === person.id ? `3px solid ${theme.primary}` : "3px solid transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
                        {person.display_name}
                        {ready && <span style={{ color: theme.secondary, marginLeft: 5, fontSize: 11 }}>✓</span>}
                      </div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{person.is_contractor ? "Contractor" : "Volunteer"} · {person.display_city}</div>
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

      {/* ── Rate Card panel ─────────────────────────────────────────────────── */}
      {showRateCard && (
        <div style={{ width: 320, borderRight: `1px solid ${theme.border}`, background: "#fff", overflowY: "auto", padding: "20px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.primary }}>M&M Rate Card</div>
            {!editingRates
              ? <button onClick={() => { setEditingRates(true); setRateCardDraft(JSON.parse(JSON.stringify(rateCard))); }} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: theme.text }}>Edit</button>
              : <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={saveRateCard} disabled={savingRates} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: "none", background: theme.primary, color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>{savingRates ? "Saving…" : "Save"}</button>
                  <button onClick={() => setEditingRates(false)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: theme.textMuted }}>Cancel</button>
                </div>
            }
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Hourly Rates</div>
          {(editingRates ? rateCardDraft : rateCard).hourly?.map((r, i) => (
            <div key={r.role} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: 13, color: theme.text }}>{r.label}</div>
              {editingRates ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, color: theme.textMuted }}>$</span>
                  <input type="number" value={rateCardDraft.hourly[i].rate}
                    onChange={e => { const d = JSON.parse(JSON.stringify(rateCardDraft)); d.hourly[i].rate = parseFloat(e.target.value) || 0; setRateCardDraft(d); }}
                    style={{ width: 60, padding: "4px 6px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none", textAlign: "right" }} />
                  <span style={{ fontSize: 12, color: theme.textMuted }}>/hr</span>
                </div>
              ) : <span style={{ fontSize: 13, fontWeight: 700, color: theme.primary }}>${r.rate}/hr</span>}
            </div>
          ))}
          <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 16, marginBottom: 8 }}>Flat Rate — Tiered by Event Size</div>
          {(editingRates ? rateCardDraft : rateCard).flat?.map((r, ri) => (
            <div key={r.role} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 4 }}>{r.label}</div>
              {r.note && <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 6, fontStyle: "italic" }}>{r.note}</div>}
              {r.tiers.map((t, ti) => (
                <div key={t.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0 6px 10px", borderBottom: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>{t.label}</div>
                  {editingRates ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 12, color: theme.textMuted }}>$</span>
                      <input type="number" value={rateCardDraft.flat[ri].tiers[ti].rate}
                        onChange={e => { const d = JSON.parse(JSON.stringify(rateCardDraft)); d.flat[ri].tiers[ti].rate = parseFloat(e.target.value) || 0; setRateCardDraft(d); }}
                        style={{ width: 70, padding: "4px 6px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none", textAlign: "right" }} />
                    </div>
                  ) : <span style={{ fontSize: 12, fontWeight: 700, color: t.rate > 0 ? theme.primary : theme.textMuted }}>{t.rate > 0 ? `$${t.rate.toLocaleString()}` : "TBD"}</span>}
                </div>
              ))}
            </div>
          ))}
          <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 8, background: theme.background, border: `1px solid ${theme.border}`, fontSize: 11, color: theme.textMuted, lineHeight: 1.6 }}>
            Volunteers are unpaid. Founder flat rates are per event (Small/Medium) or per day (Large).
          </div>
        </div>
      )}

      {/* ── Detail panel ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "26px 28px", background: theme.background }}>
        {!selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <EmptyState icon="◎" title="Select a person" subtitle="View profile, track onboarding, and assign to events." />
          </div>
        ) : (() => {
          const status     = getStatusLabel(selected);
          const sc         = STATUS_COLORS[status] || STATUS_COLORS.pending;
          const gateMsg    = assignmentGate(selected);
          const checklist  = getChecklist(selected.is_contractor);
          const hourlyRate = parseRate(selected.display_rate);

          return (
            <div style={{ maxWidth: 740 }}>

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                    <h1 style={{ margin: 0, fontSize: 23, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>{selected.display_name}</h1>
                    <Badge bg={sc.bg} color={sc.color}>{status}</Badge>
                    <Badge color={selected.is_contractor ? theme.accentDark : theme.secondary}>{selected.is_contractor ? "Contractor" : "Volunteer"}</Badge>
                  </div>
                  <div style={{ fontSize: 13, color: theme.textMuted }}>{selected.display_email} · {selected.display_phone} · {selected.display_city}</div>
                </div>
                {/* Soft gate — button always enabled, warning shown below */}
                <Button onClick={() => setShowAssign(v => !v)} style={{ flexShrink: 0 }}>
                  {showAssign ? "Cancel" : "+ Assign to Event"}
                </Button>
              </div>

              {/* Soft gate warning — advisory only, not a hard block */}
              {gateMsg && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: theme.warningSoft, border: `1px solid rgba(224,123,42,0.3)`, fontSize: 13, color: theme.warning, marginBottom: 18, display: "flex", gap: 8 }}>
                  ⚠ {gateMsg} — founders can still assign with confirmation.
                </div>
              )}

              {/* Assign modal */}
              {showAssign && (
                <Card style={{ marginBottom: 20, border: `2px solid ${theme.primary}` }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.primary, marginBottom: 14 }}>Assign to Event</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Event</div>
                      <select value={assignEventId} onChange={e => setAssignEventId(e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: theme.offWhite, color: theme.text, outline: "none" }}>
                        <option value="">Select event…</option>
                        {events.map(e => <option key={e.id} value={e.id}>{e.name || e.id}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Floor Role</div>
                      <select value={assignRole} onChange={e => setAssignRole(e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: theme.offWhite, color: theme.text, outline: "none" }}>
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

                    {/* Engagement Type */}
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Engagement Type</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[{ value: "volunteer", label: "Volunteer" }, { value: "paid", label: "Paid" }].map(opt => (
                          <button key={opt.value} onClick={() => setAssignEngagementType(opt.value)}
                            style={{ padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: assignEngagementType === opt.value ? theme.primary : "transparent", color: assignEngagementType === opt.value ? "#fff" : theme.primary, border: `1.5px solid ${theme.primary}` }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Bench Status */}
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Pre-Assign Bench Status</div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8 }}>
                        On-Deck: First to be released if gaps appear. Reserve: Standby backup, released only if On-Deck can't cover.
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {[
                          { value: "none",    label: "None (standard)" },
                          { value: "on_deck", label: "On-Deck" },
                          { value: "reserve", label: "Reserve" },
                        ].map(opt => (
                          <button key={opt.value} onClick={() => setAssignBenchStatus(opt.value)}
                            style={{
                              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                              background: assignBenchStatus === opt.value
                                ? (opt.value === "on_deck" ? theme.primary : opt.value === "reserve" ? "#E07B2A" : theme.border)
                                : "transparent",
                              color: assignBenchStatus === opt.value ? "#fff" : theme.textMuted,
                              border: `1.5px solid ${assignBenchStatus === opt.value ? (opt.value === "on_deck" ? theme.primary : opt.value === "reserve" ? "#E07B2A" : theme.border) : theme.border}`,
                            }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
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
                        <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                          {FLOOR_ROLES.find(r => r.value === a.floor_role)?.label || a.floor_role}
                          {a.estimated_pay ? ` · Est. $${Number(a.estimated_pay).toFixed(2)}` : ""}
                          {a.engagementType ? ` · ${a.engagementType === "paid" ? "Paid" : "Volunteer"}` : ""}
                        </div>
                        {a.benchStatus && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: a.benchStatus === "on_deck" ? "rgba(28,74,54,0.1)" : "rgba(224,123,42,0.12)", color: a.benchStatus === "on_deck" ? theme.primary : "#E07B2A", marginBottom: 6, display: "inline-block" }}>
                            {a.benchStatus === "on_deck" ? "On-Deck" : "Reserve"}
                          </span>
                        )}
                        {a.access_code && (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 6, background: theme.primary, marginTop: a.benchStatus ? 6 : 0 }}>
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

              {/* ── App Access / Onboarding Invite ──────────────────────────── */}
              <Card style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>App Access</div>
                {selected.portal_invite_sent ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(45,122,70,0.1)", color: "#2d7a46" }}>✓ Invite Sent</span>
                    {selected.portal_invite_date && (
                      <span style={{ fontSize: 11, color: theme.textMuted }}>
                        {new Date(selected.portal_invite_date).toLocaleDateString()}
                      </span>
                    )}
                    <button onClick={sendOnboardingInvite} disabled={saving} style={{ fontSize: 11, color: theme.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", padding: 0 }}>
                      Resend
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <Button size="sm" onClick={sendOnboardingInvite} disabled={saving || !selected.display_email || selected.display_email === "—"}>
                      {saving ? "Sending…" : "Send Onboarding Invite →"}
                    </Button>
                    <span style={{ fontSize: 11, color: theme.textMuted }}>
                      {selected.display_email && selected.display_email !== "—"
                        ? `Will send to ${selected.display_email}`
                        : "No email on record"}
                    </span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 8 }}>
                  {selected.is_contractor
                    ? "Contractor will see IC Agreement + onboarding packet in Axis Mobile."
                    : "Volunteer will see onboarding packet only in Axis Mobile."}
                </div>
              </Card>

              {/* ── Contractor Type ──────────────────────────────────────────── */}
              <Card style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Engagement Type</div>
                  {!editingType && <Button size="sm" variant="outline" onClick={() => { setEditingType(true); setContractorType(selected.contractor_type); }}>Edit</Button>}
                </div>
                {editingType ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={contractorType} onChange={e => setContractorType(e.target.value)}
                      style={{ padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", flex: 1 }}>
                      {CONTRACTOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <Button size="sm" onClick={saveContractorType} disabled={saving}>{saving ? "…" : "Save"}</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingType(false)}>Cancel</Button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>
                      {CONTRACTOR_TYPES.find(t => t.value === selected.contractor_type)?.label || "Event Contractor"}
                    </span>
                    {selected.contractor_type === "mm_staff" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(15,52,96,0.1)", color: "#0F3460" }}>M&M Internal</span>}
                    {selected.priority_contractor && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(235,199,100,0.2)", color: "#8a6800" }}>⭐ Priority Placement</span>}
                  </div>
                )}
                {selected.contractor_type === "mm_staff" && <div style={{ marginTop: 8, fontSize: 12, color: theme.textMuted }}>M&M covers background check cost for all staff.</div>}
                {selected.contractor_type === "event_contractor" && !selected.priority_contractor && <div style={{ marginTop: 8, fontSize: 12, color: theme.textMuted }}>Volunteers who complete a self-paid background check unlock <strong>priority placement</strong> on paid engagements.</div>}
              </Card>

              {/* ── Background Check ─────────────────────────────────────────── */}
              <Card style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Background Check</div>
                  {!editingBg && <Button size="sm" variant="outline" onClick={() => { setEditingBg(true); setBgStatus(selected.bg_status || "not_started"); setBgDate(selected.bg_cleared_date || ""); }}>Update</Button>}
                </div>
                {editingBg ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, marginBottom: 4 }}>Result</div>
                        <select value={bgStatus} onChange={e => setBgStatus(e.target.value)}
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none" }}>
                          <option value="not_started">Not Started</option>
                          <option value="pending">Pending</option>
                          <option value="cleared">Cleared (Pass)</option>
                          <option value="not_cleared">Not Cleared (Fail)</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, marginBottom: 4 }}>Date Cleared</div>
                        <input type="date" value={bgDate} onChange={e => setBgDate(e.target.value)}
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    </div>
                    {selected.contractor_type === "event_contractor" && <div style={{ fontSize: 12, color: theme.textMuted, padding: "6px 10px", borderRadius: 6, background: theme.background, border: `1px solid ${theme.border}` }}>💳 M&M pays Checkr. Contractor reimburses $29 via Gusto deduction after first shift.</div>}
                    {selected.contractor_type === "mm_staff"         && <div style={{ fontSize: 12, color: theme.textMuted, padding: "6px 10px", borderRadius: 6, background: theme.background, border: `1px solid ${theme.border}` }}>💳 M&M pays Checkr directly for all staff. No reimbursement.</div>}
                    {selected.contractor_type === "volunteer"        && <div style={{ fontSize: 12, color: theme.textMuted, padding: "6px 10px", borderRadius: 6, background: theme.background, border: `1px solid ${theme.border}` }}>💳 M&M pays Checkr. Priority placement earned through performance.</div>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button size="sm" onClick={saveBgCheck} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingBg(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: BG_STATUS[selected.bg_status]?.bg || BG_STATUS.not_started.bg, color: BG_STATUS[selected.bg_status]?.color || BG_STATUS.not_started.color }}>
                        {BG_STATUS[selected.bg_status]?.label || "Not Started"}
                      </span>
                      {selected.bg_cleared_date && <span style={{ fontSize: 11, color: theme.textMuted }}>Cleared: {selected.bg_cleared_date}</span>}
                    </div>
                    {selected.bg_status !== "cleared" && (
                      <div style={{ marginTop: 8 }}>
                        {selected.checkr_invite_sent ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 12, color: theme.textMuted }}>⏳ Check ordered {selected.checkr_invite_date || ""} — awaiting result</span>
                            <button onClick={sendCheckrInvite} disabled={saving} style={{ fontSize: 11, color: theme.primary, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, padding: 0 }}>Open Checkr</button>
                          </div>
                        ) : (
                          <div>
                            <Button size="sm" variant="outline" onClick={sendCheckrInvite} disabled={saving}>Order Background Check</Button>
                            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>
                              {selected.contractor_type === "mm_staff"         && "M&M pays. No reimbursement."}
                              {selected.contractor_type === "event_contractor" && "M&M pays Checkr. Contractor reimburses $29 via Gusto after first shift."}
                              {selected.contractor_type === "volunteer"        && "M&M pays Checkr. Priority placement earned through reliability and ratings."}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {selected.reimbursement_due && !selected.reimbursement_paid && (
                      <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(235,199,100,0.15)", border: "1px solid rgba(235,199,100,0.4)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#8a6800" }}>💰 Reimbursement Due</span>
                          <span style={{ fontSize: 12, color: "#8a6800", marginLeft: 6 }}>${selected.reimbursement_amount} — add to next Gusto payout</span>
                        </div>
                        <Button size="sm" variant="outline" onClick={markReimbursementPaid} disabled={saving}>Mark Paid</Button>
                      </div>
                    )}
                    {selected.reimbursement_paid && <div style={{ marginTop: 8, fontSize: 12, color: "#2d7a46" }}>✓ Reimbursement paid</div>}
                    {selected.contractor_type === "volunteer" && selected.bg_status === "cleared" && (
                      <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: selected.priority_contractor ? "rgba(235,199,100,0.15)" : theme.background, border: `1px solid ${selected.priority_contractor ? "rgba(235,199,100,0.4)" : theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: selected.priority_contractor ? "#8a6800" : theme.textMuted }}>{selected.priority_contractor ? "⭐ Priority Placement Active" : "Priority Placement"}</span>
                          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>Earned through reliability, ratings, and event history</div>
                        </div>
                        <Button size="sm" variant="outline" onClick={togglePriorityPlacement} disabled={saving}>{selected.priority_contractor ? "Remove" : "Award"}</Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* ── ICA / Agreement ──────────────────────────────────────────── */}
              {selected.is_contractor && (
                <Card style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>IC Agreement</div>
                    {!editingIca && <Button size="sm" variant="outline" onClick={() => { setEditingIca(true); setIcaUrl(selected.ica_url || ""); }}>{selected.ic_agreement ? "Edit" : "Add Link"}</Button>}
                  </div>
                  {editingIca ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={icaUrl} onChange={e => setIcaUrl(e.target.value)} placeholder="DocuSeal or Drive URL for signed ICA…"
                        style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                      <Button size="sm" onClick={saveIca} disabled={saving}>{saving ? "…" : "Save"}</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingIca(false)}>Cancel</Button>
                    </div>
                  ) : selected.ic_agreement ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(45,122,70,0.1)", color: "#2d7a46" }}>Signed ✓</span>
                      {selected.ica_url && <a href={selected.ica_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: theme.primary, fontWeight: 700, textDecoration: "none" }}>View ↗</a>}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: theme.textMuted, fontStyle: "italic" }}>No ICA on file — will be collected via DocuSeal in Axis Mobile.</div>
                  )}
                </Card>
              )}

              {/* ── Onboarding Checklist ──────────────────────────────────────── */}
              <Card style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Onboarding Checklist</div>
                {[
                  { key: "onboarding_complete", label: "Onboarding Packet Acknowledged", required: false },
                  { key: "axis_trained",         label: "Axis Trained",                  required: false },
                ].map(({ key, label, required }) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${theme.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, background: selected[key] ? theme.secondary : "transparent", border: `2px solid ${selected[key] ? theme.secondary : required ? theme.warning : theme.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {selected[key] && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 14, color: selected[key] ? theme.text : theme.textMuted, fontWeight: selected[key] ? 600 : 400 }}>{label}</span>
                    </div>
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => toggleCheck(selected, key)}>{selected[key] ? "Undo" : "Mark complete"}</Button>
                  </div>
                ))}
              </Card>

              {/* ── Profile ───────────────────────────────────────────────────── */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Profile</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {[
                    ["Type",           selected.display_type],
                    ["Experience",     selected.display_exp],
                    ["Availability",   selected.display_availability],
                    ["Interests",      selected.display_interests],
                    ["Requested Rate", selected.display_rate],
                    ["M&M Rate",       (() => { const r = getRateForRole(rateCard, selected.floor_role || selected.display_type); return r ? r.label : "See rate card"; })()],
                    ["Entity Type",    selected.display_entity],
                    ["Location",       selected.display_city],
                    ["Instagram",      selected.display_instagram],
                    ["LinkedIn",       selected.display_linkedin],
                    ["Source",         selected.source],
                    ["Submitted",      selected.display_created?.toDate?.()?.toLocaleDateString?.()],
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