import { useEffect, useState } from "react";
import {
  collection, getDocs, doc, updateDoc, addDoc, deleteDoc,
  serverTimestamp, query, orderBy,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Button, Badge, Spinner, EmptyState, Input, Textarea, LifecyclePill } from "../components/UI";

// ─── STAGE CONFIG ──────────────────────────────────────────────────────────────
const STAGES = [
  { key: "intake_received",        label: "Intake Received",        short: "Intake" },
  { key: "awaiting_qualification", label: "Awaiting Qualification", short: "Qual" },
  { key: "approved_for_discovery", label: "Approved for Discovery", short: "Discovery" },
  { key: "discovery_complete",     label: "Discovery Complete",     short: "Pricing" },
  { key: "pricing_approved",       label: "Pricing Approved",       short: "Proposal" },
  { key: "proposal_sent",          label: "Proposal Sent",          short: "Closing" },
  { key: "active",                 label: "Active",                 short: "Active" },
  { key: "declined",               label: "Declined",               short: "Declined" },
];

const STAGE_COLORS = {
  intake_received:        { bg: "rgba(224,123,42,0.1)",  color: "#E07B2A" },
  awaiting_qualification: { bg: "rgba(224,123,42,0.1)",  color: "#E07B2A" },
  approved_for_discovery: { bg: "rgba(28,74,54,0.1)",    color: theme.primary },
  discovery_complete:     { bg: "rgba(28,74,54,0.1)",    color: theme.primary },
  pricing_approved:       { bg: "rgba(88,176,108,0.12)", color: "#2d7a46" },
  proposal_sent:          { bg: "rgba(235,199,100,0.2)", color: "#8a6800" },
  active:                 { bg: "rgba(88,176,108,0.15)", color: "#2d7a46" },
  declined:               { bg: "rgba(192,57,43,0.1)",   color: "#C0392B" },
};

const FOUNDERS = ["Ashley", "Mikal"];

const stageIndex = (key) => STAGES.findIndex(s => s.key === key);

// ─── FIELD COMPONENTS ─────────────────────────────────────────────────────────
const Field = ({ label, value, onChange, type = "text", placeholder = "", required = false, options = null, rows = 3 }) => {
  const [foc, setFoc] = useState(false);
  const baseInput = {
    padding: "9px 11px", borderRadius: 8, fontSize: 13,
    border: `1.5px solid ${foc ? theme.primary : (required && !value ? theme.warning : theme.border)}`,
    background: theme.offWhite, color: theme.text, outline: "none",
    fontFamily: "'DM Sans', sans-serif", width: "100%", boxSizing: "border-box",
    transition: "all 0.15s ease",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label} {required && <span style={{ color: theme.warning }}>*</span>}
      </label>
      {options ? (
        <select value={value || ""} onChange={e => onChange(e.target.value)}
          onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
          style={{ ...baseInput, appearance: "none" }}>
          <option value="">— Select —</option>
          {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)}
          onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
          placeholder={placeholder} rows={rows}
          style={{ ...baseInput, resize: "vertical", minHeight: rows * 22 }} />
      ) : (
        <input type={type} value={value || ""} onChange={e => onChange(e.target.value)}
          onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
          placeholder={placeholder}
          style={baseInput} />
      )}
    </div>
  );
};

const TwoCol = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>{children}</div>
);

// ─── STAGE FORMS ──────────────────────────────────────────────────────────────

function QualForm({ data, onChange }) {
  const f = (key) => ({ value: data[key] || "", onChange: (v) => onChange(key, v) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <TwoCol>
        <Field label="Event Type" required {...f("qual_event_type")} placeholder="Conference, Summit, Activation…" />
        <Field label="Estimated Date" type="date" {...f("qual_est_date")} />
      </TwoCol>
      <TwoCol>
        <Field label="Estimated Attendance" {...f("qual_est_attendance")} placeholder="250" />
        <Field label="Budget Signal" {...f("qual_budget_signal")}
          options={["Under $5k","$5k–$15k","$15k–$30k","$30k–$60k","$60k+","Unknown"]} />
      </TwoCol>
      <TwoCol>
        <Field label="Timeline Urgency" {...f("qual_urgency")}
          options={["Immediate (< 30 days)","Near-term (30–60 days)","Standard (60–90 days)","Planning ahead (90+ days)"]} />
        <Field label="Decision Maker Confirmed?" {...f("qual_decision_maker")}
          options={["Yes","No – still working up","Unknown"]} />
      </TwoCol>
      <Field label="Primary Pain Point" type="textarea" rows={2} {...f("qual_pain_point")}
        placeholder="What problem are they trying to solve?" />
      <Field label="Pillar Hypothesis" {...f("qual_pillar_hypothesis")}
        options={[
          { value: "P1", label: "P1 — Event Execution" },
          { value: "P2", label: "P2 — Leadership Training" },
          { value: "P3", label: "P3 — Joint Planning / Co-Execution" },
          { value: "P4", label: "P4 — Infrastructure Advisory" },
        ]} />
      <Field label="Notes" type="textarea" rows={3} {...f("qual_notes")} placeholder="Anything else worth capturing from this conversation…" />
    </div>
  );
}

function DiscoveryForm({ data, onChange }) {
  const f = (key) => ({ value: data[key] || "", onChange: (v) => onChange(key, v) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <TwoCol>
        <Field label="Confirmed Event Date" type="date" required {...f("disc_confirmed_date")} />
        <Field label="Venue" {...f("disc_venue")} placeholder="Venue name" />
      </TwoCol>
      <TwoCol>
        <Field label="City / Location" required {...f("disc_location")} placeholder="Atlanta, GA" />
        <Field label="Confirmed Attendance" required {...f("disc_attendance")} placeholder="300" />
      </TwoCol>
      <TwoCol>
        <Field label="Confirmed Budget" required {...f("disc_budget")} placeholder="$25,000" />
        <Field label="Confirmed Pillar" required {...f("disc_pillar")}
          options={[
            { value: "P1", label: "P1 — Event Execution" },
            { value: "P2", label: "P2 — Leadership Training" },
            { value: "P3", label: "P3 — Joint Planning / Co-Execution" },
            { value: "P4", label: "P4 — Infrastructure Advisory" },
          ]} />
      </TwoCol>
      <Field label="Scope Notes" type="textarea" rows={3} required {...f("disc_scope_notes")}
        placeholder="What specifically do they need from M&M? Staffing, facilitation, full buildout…" />
      <Field label="Stakeholders Involved" type="textarea" rows={2} {...f("disc_stakeholders")}
        placeholder="Who else is in the room? Marketing, executive sponsor, board…" />
      <Field label="Risks or Flags" type="textarea" rows={2} {...f("disc_risks")}
        placeholder="Timeline concerns, unclear scope, competing vendors, budget tension…" />
      <Field label="Notes" type="textarea" rows={2} {...f("disc_notes")} />
    </div>
  );
}

function PricingForm({ data, onChange, matrixViewed, onMatrixOpen }) {
  const f = (key) => ({ value: data[key] || "", onChange: (v) => onChange(key, v) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(235,199,100,0.12)", border: `1px solid ${matrixViewed ? "rgba(88,176,108,0.4)" : "rgba(235,199,100,0.4)"}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: matrixViewed ? "#2d7a46" : "#8a6800", marginBottom: 6 }}>
          {matrixViewed ? "✓ PRICING MATRIX REVIEWED" : "PRICING MATRIX — REQUIRED"}
        </div>
        <div style={{ fontSize: 13, color: theme.text, marginBottom: 10 }}>
          {matrixViewed
            ? "Matrix reviewed. Enter the confirmed tier and price below."
            : "You must open the pricing matrix before entering a tier. This ensures consistent pricing."}
        </div>
        <a
          href="https://docs.google.com/spreadsheets/d/YOUR_PRICING_MATRIX_ID"
          target="_blank"
          rel="noreferrer"
          onClick={onMatrixOpen}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: matrixViewed ? theme.secondary : theme.primary, color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none" }}
        >
          {matrixViewed ? "Open Again ↗" : "Open Pricing Matrix ↗"}
        </a>
      </div>
      <div style={{ opacity: matrixViewed ? 1 : 0.4, pointerEvents: matrixViewed ? "auto" : "none" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TwoCol>
            <Field label="Selected Tier" required {...f("pricing_tier")}
              options={["Tier 0 — Introductory","Tier 1 — Standard","Tier 2 — Premium","Tier 3 — Enterprise","Custom"]} />
            <Field label="Confirmed Price" required {...f("pricing_confirmed_price")} placeholder="$18,500" />
          </TwoCol>
          <TwoCol>
            <Field label="Deposit Amount" {...f("pricing_deposit")} placeholder="$5,000" />
            <Field label="Payment Terms" {...f("pricing_payment_terms")}
              options={["50% deposit / 50% at event","30% deposit / 70% at event","Net 30","Custom"]} />
          </TwoCol>
          <Field label="Pricing Notes" type="textarea" rows={2} {...f("pricing_notes")}
            placeholder="Any concessions, add-ons, or adjustments to standard tier pricing…" />
        </div>
      </div>
    </div>
  );
}

function ProposalForm({ data, onChange, onGenerate, generating }) {
  const f = (key) => ({ value: data[key] || "", onChange: (v) => onChange(key, v) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ padding: "12px 16px", borderRadius: 10, background: theme.successSoft, border: `1px solid rgba(88,176,108,0.3)` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#2d7a46", marginBottom: 4 }}>PROPOSAL GENERATION</div>
        <div style={{ fontSize: 13, color: theme.text, marginBottom: 10 }}>
          Generate a pre-filled proposal doc using all data collected in this pipeline record. Review before sending to PandaDoc.
        </div>
        <Button onClick={onGenerate} disabled={generating} size="sm">
          {generating ? "Generating…" : "Generate Proposal Doc ↓"}
        </Button>
      </div>
      {data.proposal_doc_url && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: theme.offWhite, border: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: theme.text, fontWeight: 600 }}>Proposal doc ready</span>
          <a href={data.proposal_doc_url} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: theme.primary, fontWeight: 700, textDecoration: "none" }}>Open ↗</a>
        </div>
      )}
      <Field label="PandaDoc Link (once sent)" {...f("pandadoc_url")} placeholder="https://app.pandadoc.com/…" />
      <TwoCol>
        <Field label="Sent to Client?" {...f("proposal_sent_to_client")} options={["Yes","No"]} />
        <Field label="Date Sent" type="date" {...f("proposal_sent_date")} />
      </TwoCol>
      <Field label="Notes" type="textarea" rows={2} {...f("proposal_notes")} />
    </div>
  );
}

function ClosingForm({ data, onChange }) {
  const f = (key) => ({ value: data[key] || "", onChange: (v) => onChange(key, v) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Proposal Outcome" required {...f("closing_outcome")}
        options={["Accepted","Declined","Negotiating"]} />
      {data.closing_outcome === "Declined" && (
        <Field label="Decline Reason" type="textarea" rows={2} required {...f("closing_decline_reason")}
          placeholder="Why did they pass? Budget, timing, went with competitor…" />
      )}
      {data.closing_outcome === "Negotiating" && (
        <Field label="Negotiation Notes" type="textarea" rows={2} {...f("closing_negotiation_notes")}
          placeholder="What are they pushing back on? What's the ask?" />
      )}
      {data.closing_outcome === "Accepted" && (
        <>
          <TwoCol>
            <Field label="Agreement Signed Date" type="date" {...f("closing_signed_date")} />
            <Field label="Deposit Received?" required {...f("closing_deposit_received")} options={["Yes","No"]} />
          </TwoCol>
          <Field label="Deposit Amount Received" {...f("closing_deposit_amount")} placeholder="$5,000" />
        </>
      )}
      <Field label="Follow-up Date" type="date" {...f("closing_followup_date")} />
      <Field label="Notes" type="textarea" rows={2} {...f("closing_notes")} />
    </div>
  );
}

// ─── REJECTION MODAL ──────────────────────────────────────────────────────────
function RejectionModal({ activeUser, onConfirm, onCancel, saving }) {
  const [reason, setReason] = useState("");
  const isFounder = FOUNDERS.includes(activeUser);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: theme.surface, borderRadius: 14, padding: 28, width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: theme.danger, marginBottom: 6 }}>
          {isFounder ? "Reject this lead?" : "Request Rejection"}
        </div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
          {isFounder
            ? "This will move the record to Declined. Please add a reason."
            : "You don't have direct rejection authority. Your request will be flagged for Ashley or Mikal to review."}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
            Reason <span style={{ color: theme.warning }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={isFounder
              ? "Why are we declining? Budget mismatch, bad fit, capacity…"
              : "Why should this be rejected? Ashley and Mikal will review this."}
            rows={3}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "none", boxSizing: "border-box", color: theme.text, background: theme.offWhite }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm(reason, isFounder)} disabled={saving || !reason.trim()}>
            {saving ? "Saving…" : isFounder ? "Reject Lead" : "Submit Request"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── STAGE PROGRESS BAR ───────────────────────────────────────────────────────
function StageProgress({ currentStage }) {
  const activeStages = STAGES.filter(s => s.key !== "declined");
  const idx = activeStages.findIndex(s => s.key === currentStage);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 22 }}>
      {activeStages.map((s, i) => {
        const done    = i < idx;
        const current = i === idx;
        const future  = i > idx;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < activeStages.length - 1 ? 1 : "none" }}>
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 64,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: done ? theme.secondary : current ? theme.primary : theme.border,
                color: done || current ? "#fff" : theme.textMuted,
                border: current ? `3px solid ${theme.primaryDark}` : "none",
                transition: "all 0.2s ease",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: current ? theme.primary : done ? theme.secondary : theme.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center", lineHeight: 1.2, whiteSpace: "nowrap" }}>
                {s.short}
              </div>
            </div>
            {i < activeStages.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? theme.secondary : theme.border, marginBottom: 18, transition: "background 0.3s ease" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function Pipeline() {
  const { activeUser } = useAuth();
  const navigate = useNavigate();

  const [items,       setItems]       = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [formData,    setFormData]    = useState({});
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [matrixViewed, setMatrixViewed] = useState(false);
  const [filter,      setFilter]      = useState("active");
  const [dirty,       setDirty]       = useState(false);
  const [showReject,  setShowReject]  = useState(false);
  const [toast,       setToast]       = useState(null);

  // ── Client Portal state ───────────────────────────────────────────────────
  const [invoices,      setInvoices]      = useState([]);
  const [newInvoice,    setNewInvoice]    = useState({ label: "", amount: "", due_date: "", status: "draft" });
  const [addingInvoice, setAddingInvoice] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [branding,      setBranding]      = useState({ logo_url: "", primary_hex: "", secondary_hex: "" });
  const [editBranding,  setEditBranding]  = useState(false);
  const [brandingDraft, setBrandingDraft] = useState({});
  const [savingBrand,   setSavingBrand]   = useState(false);
  const [inviteSent,    setInviteSent]    = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(query(collection(db, "pipeline"), orderBy("created_at", "desc")));
    setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSelect = (item) => {
    setSelected(item);
    setFormData(item.stage_data || {});
    setMatrixViewed(false);
    setDirty(false);
    // Load portal data
    setBranding(item.branding || { logo_url: "", primary_hex: "", secondary_hex: "" });
    setBrandingDraft(item.branding || { logo_url: "", primary_hex: "", secondary_hex: "" });
    setInviteSent(!!item.portal_invite_sent);
    loadInvoices(item.id);
  };

  const loadInvoices = async (clientId) => {
    const snap = await getDocs(collection(db, "pipeline", clientId, "invoices"));
    setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")));
  };

  const addInvoice = async () => {
    if (!newInvoice.label.trim() || !newInvoice.amount) return;
    setSavingInvoice(true);
    await addDoc(collection(db, "pipeline", selected.id, "invoices"), {
      ...newInvoice,
      amount: parseFloat(newInvoice.amount),
      created_at: new Date().toISOString(),
    });
    await loadInvoices(selected.id);
    setNewInvoice({ label: "", amount: "", due_date: "", status: "draft" });
    setAddingInvoice(false);
    setSavingInvoice(false);
  };

  const updateInvoiceStatus = async (invoiceId, status) => {
    await updateDoc(doc(db, "pipeline", selected.id, "invoices", invoiceId), { status });
    setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status } : i));
  };

  const deleteInvoice = async (invoiceId) => {
    await deleteDoc(doc(db, "pipeline", selected.id, "invoices", invoiceId));
    setInvoices(prev => prev.filter(i => i.id !== invoiceId));
  };

  const saveBranding = async () => {
    setSavingBrand(true);
    await updateDoc(doc(db, "pipeline", selected.id), { branding: brandingDraft });
    setBranding(brandingDraft);
    setSelected(prev => ({ ...prev, branding: brandingDraft }));
    setEditBranding(false);
    setSavingBrand(false);
  };

  const sendPortalInvite = async () => {
    if (!selected.contact_email && !selected.email) return;
    const email = selected.contact_email || selected.email;
    setSendingInvite(true);
    await updateDoc(doc(db, "pipeline", selected.id), {
      portal_invite_sent:   true,
      portal_invite_date:   new Date().toISOString(),
      portal_client_id:     selected.id,
      portal_client_email:  email,  // used by client portal auth hook to scope the record
    });
    setInviteSent(true);
    setSelected(prev => ({ ...prev, portal_invite_sent: true }));
    setSendingInvite(false);
    showToast("Invite flagged — send login link to client");
  };



  const updateField = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = async (extraFields = {}) => {
    if (!selected) return;
    setSaving(true);
    const update = {
      stage_data: { ...formData },
      last_updated_by: activeUser,
      last_updated_at: serverTimestamp(),
      ...extraFields,
    };
    await updateDoc(doc(db, "pipeline", selected.id), update);
    await load();
    setDirty(false);
    setSaving(false);
  };

  const advanceStage = async (nextStage) => {
    await save({ stage: nextStage });
    setSelected(prev => ({ ...prev, stage: nextStage }));
    showToast(`Moved to ${STAGES.find(s => s.key === nextStage)?.label}`);
  };

  const claimLead = async () => {
    await save({ claimed_by: activeUser, claimed_at: serverTimestamp(), stage: "awaiting_qualification" });
    setSelected(prev => ({ ...prev, stage: "awaiting_qualification", claimed_by: activeUser }));
    showToast("Lead claimed — qualification form unlocked");
  };

  const handleReject = async (reason, isFounder) => {
    setSaving(true);
    if (isFounder) {
      await updateDoc(doc(db, "pipeline", selected.id), {
        stage: "declined",
        rejection_reason: reason,
        rejected_by: activeUser,
        rejected_at: serverTimestamp(),
        stage_data: { ...formData },
      });
      setSelected(prev => ({ ...prev, stage: "declined" }));
      showToast("Lead declined");
    } else {
      await updateDoc(doc(db, "pipeline", selected.id), {
        rejection_requested: true,
        rejection_request_reason: reason,
        rejection_requested_by: activeUser,
        rejection_requested_at: serverTimestamp(),
      });
      showToast("Rejection request sent to Ashley or Mikal", "warning");
    }
    await load();
    setShowReject(false);
    setSaving(false);
  };

  const sendToActivationQueue = async () => {
    setSaving(true);
    const item = { ...selected, stage_data: formData };
    // Write to event_intake_requests
    const ref = await addDoc(collection(db, "event_intake_requests"), {
      // Core event fields from pipeline
      event_name:      formData.disc_venue
        ? `${item.org_name || item.organization || item.client || ""} — ${formData.qual_event_type || "Event"}`
        : (item.event_name || `${item.org_name || item.organization || ""} — ${formData.qual_event_type || "Event"}`),
      client:          item.org_name || item.organization || item.client || "",
      event_date:      formData.disc_confirmed_date || formData.qual_est_date || "",
      venue:           formData.disc_venue || "",
      location:        formData.disc_location || "",
      attendee_count:  formData.disc_attendance || "",
      pillar:          formData.disc_pillar || formData.qual_pillar_hypothesis || "",
      budget:          formData.disc_budget || "",
      contact_name:    item.contact_name || item.contactName || "",
      contact_email:   item.contact_email || item.email || "",
      // Pricing
      confirmed_price: formData.pricing_confirmed_price || "",
      deposit:         formData.pricing_deposit || "",
      payment_terms:   formData.pricing_payment_terms || "",
      // Proposal
      pandadoc_url:    formData.pandadoc_url || "",
      proposal_doc_url: formData.proposal_doc_url || "",
      // Status
      status:          "new",
      pipeline_id:     selected.id,
      created_at:      serverTimestamp(),
    });
    // Mark pipeline record as sent to activation
    await updateDoc(doc(db, "pipeline", selected.id), {
      stage: "active",
      activation_queue_id: ref.id,
      sent_to_activation_by: activeUser,
      sent_to_activation_at: serverTimestamp(),
      stage_data: { ...formData },
    });
    await load();
    setSelected(prev => ({ ...prev, stage: "active" }));
    setSaving(false);
    showToast("Sent to Activation Queue ✓");
  };

  const generateProposal = async () => {
    setGenerating(true);
    // Build proposal data summary for download
    const item = selected;
    const d = formData;
    const proposalText = [
      `PROPOSAL — ${item.event_name || item.org_name || "Event"}`,
      `Prepared by M&M Operations`,
      ``,
      `CLIENT: ${item.org_name || item.client || ""}`,
      `EVENT DATE: ${d.disc_confirmed_date || d.qual_est_date || "TBD"}`,
      `VENUE: ${d.disc_venue || "TBD"}`,
      `LOCATION: ${d.disc_location || "TBD"}`,
      `ATTENDANCE: ${d.disc_attendance || "TBD"}`,
      `PILLAR: ${d.disc_pillar || d.qual_pillar_hypothesis || "TBD"}`,
      ``,
      `SCOPE`,
      `${d.disc_scope_notes || ""}`,
      ``,
      `INVESTMENT`,
      `Tier: ${d.pricing_tier || ""}`,
      `Total: ${d.pricing_confirmed_price || ""}`,
      `Deposit: ${d.pricing_deposit || ""}`,
      `Payment Terms: ${d.pricing_payment_terms || ""}`,
      ``,
      `NOTES`,
      `${d.pricing_notes || ""}`,
    ].join("\n");

    // Create downloadable txt (placeholder until Google Docs API is wired)
    const blob = new Blob([proposalText], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `Proposal_${(item.org_name || "Client").replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    // Store a placeholder url
    updateField("proposal_doc_url", "#generated");
    setGenerating(false);
    showToast("Proposal downloaded — upload to Drive and add the link below");
  };

  // ── FILTERED LIST ──────────────────────────────────────────────────────────
  const filtered = (() => {
    if (filter === "active") return items.filter(i => !["declined","active","complete"].includes(i.stage));
    if (filter === "active_delivery") return items.filter(i => i.stage === "active");
    if (filter === "declined") return items.filter(i => i.stage === "declined");
    return items;
  })();

  // ── STAGE ACTIONS ──────────────────────────────────────────────────────────
  const renderStageAction = () => {
    if (!selected) return null;
    const stage = selected.stage || "intake_received";
    const isFounder = FOUNDERS.includes(activeUser);

    const rejectBtn = (
      <Button variant="danger" size="sm" onClick={() => setShowReject(true)} disabled={saving}>
        {isFounder ? "Reject" : "Request Rejection"}
      </Button>
    );

    switch (stage) {

      case "intake_received":
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}
            <Button onClick={claimLead} disabled={saving}>
              Claim Lead → Start Qualification
            </Button>
          </div>
        );

      case "awaiting_qualification":
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}
            <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              onClick={() => advanceStage("approved_for_discovery")}
              disabled={saving || !formData.qual_pillar_hypothesis || !formData.qual_pain_point}
            >
              Submit Qual → Approve for Discovery
            </Button>
          </div>
        );

      case "approved_for_discovery":
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}
            <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              onClick={() => advanceStage("discovery_complete")}
              disabled={saving || !formData.disc_confirmed_date || !formData.disc_budget || !formData.disc_pillar || !formData.disc_scope_notes}
            >
              Submit Discovery → Complete
            </Button>
          </div>
        );

      case "discovery_complete":
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}
            <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              onClick={() => advanceStage("pricing_approved")}
              disabled={saving || !matrixViewed || !formData.pricing_tier || !formData.pricing_confirmed_price}
            >
              Confirm Pricing → Approve
            </Button>
          </div>
        );

      case "pricing_approved":
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}
            <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              onClick={() => advanceStage("proposal_sent")}
              disabled={saving || !formData.proposal_sent_to_client}
            >
              Mark Proposal Sent →
            </Button>
          </div>
        );

      case "proposal_sent":
        if (formData.closing_outcome === "Accepted" && formData.closing_deposit_received === "Yes") {
          return (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20, alignItems: "center" }}>
              {rejectBtn}
              <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button onClick={sendToActivationQueue} disabled={saving}
                style={{ background: theme.accent, color: theme.primaryDark }}>
                Send to Activation Queue ✓
              </Button>
            </div>
          );
        }
        if (formData.closing_outcome === "Declined") {
          return (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="danger" onClick={() => advanceStage("declined")} disabled={saving}>
                Mark as Declined
              </Button>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}
            <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        );

      case "active":
        return (
          <div style={{ padding: "16px", borderRadius: 10, background: theme.successSoft, border: `1px solid rgba(88,176,108,0.3)`, marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#2d7a46", marginBottom: 6 }}>In Activation Queue</div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10 }}>This record has been sent to the Activation Queue. Continue managing from there.</div>
            <Button size="sm" onClick={() => navigate("/activation-setup")}>
              Go to Activation Queue →
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  // ── STAGE FORM ─────────────────────────────────────────────────────────────
  const renderStageForm = () => {
    if (!selected) return null;
    const stage = selected.stage || "intake_received";

    const sectionTitle = (title, subtitle) => (
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 3 }}>{subtitle}</div>}
      </div>
    );

    if (stage === "intake_received") {
      return (
        <div style={{ padding: "14px 16px", borderRadius: 10, background: theme.warningSoft, border: `1px solid rgba(224,123,42,0.3)` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.warning, marginBottom: 4 }}>Unclaimed</div>
          <div style={{ fontSize: 13, color: theme.text }}>
            Claim this lead to begin qualification. Only one person should own each lead through the pipeline.
          </div>
          {selected.claimed_by && (
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>Claimed by {selected.claimed_by}</div>
          )}
        </div>
      );
    }

    if (stage === "awaiting_qualification") {
      return <>
        {sectionTitle("Qualification", "Complete this after the discovery call. Required before advancing.")}
        <QualForm data={formData} onChange={updateField} />
      </>;
    }

    if (stage === "approved_for_discovery") {
      return <>
        {sectionTitle("Discovery", "Deeper dive. Lock down the specifics before pricing.")}
        <DiscoveryForm data={formData} onChange={updateField} />
      </>;
    }

    if (stage === "discovery_complete") {
      return <>
        {sectionTitle("Pricing", "Review the pricing matrix, then enter the confirmed tier and price below.")}
        <PricingForm data={formData} onChange={updateField} matrixViewed={matrixViewed} onMatrixOpen={() => setMatrixViewed(true)} />
      </>;
    }

    if (stage === "pricing_approved") {
      return <>
        {sectionTitle("Proposal", "Generate the proposal, send via PandaDoc, then mark as sent.")}
        <ProposalForm data={formData} onChange={updateField} onGenerate={generateProposal} generating={generating} />
      </>;
    }

    if (stage === "proposal_sent") {
      return <>
        {sectionTitle("Closing", "Track the outcome. Once signed and deposit collected, send to Activation Queue.")}
        <ClosingForm data={formData} onChange={updateField} />
      </>;
    }

    if (stage === "declined") {
      return (
        <div style={{ padding: "14px 16px", borderRadius: 10, background: theme.dangerSoft, border: `1px solid rgba(192,57,43,0.2)` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.danger, marginBottom: 4 }}>Declined</div>
          {selected.rejection_reason && (
            <div style={{ fontSize: 13, color: theme.text }}>{selected.rejection_reason}</div>
          )}
          {selected.rejected_by && (
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>By {selected.rejected_by}</div>
          )}
        </div>
      );
    }

    return null;
  };

  // ── LEAD INFO SUMMARY ──────────────────────────────────────────────────────
  const renderLeadInfo = () => {
    if (!selected) return null;
    const fields = [
      ["Org / Client",    selected.org_name || selected.organization || selected.client],
      ["Contact",         selected.contact_name || selected.contactName],
      ["Email",           selected.contact_email || selected.email],
      ["Event Type",      selected.event_type || selected.eventType || formData.qual_event_type],
      ["Claimed By",      selected.claimed_by],
      ["Submitted",       selected.created_at?.toDate?.()?.toLocaleDateString?.() || selected.createdAt?.toDate?.()?.toLocaleDateString?.()],
    ].filter(([, v]) => v);

    if (!fields.length) return null;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 0", borderBottom: `1px solid ${theme.border}`, marginBottom: 20 }}>
        {fields.map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, color: theme.text }}>{String(val)}</div>
          </div>
        ))}
      </div>
    );
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <Spinner size={32} />
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap'); @keyframes spin { to { transform: rotate(360deg); } }"}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px", borderRadius: 10, background: toast.type === "success" ? theme.primary : toast.type === "warning" ? theme.warning : theme.danger, color: "#fff", fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", transition: "all 0.2s ease" }}>
          {toast.msg}
        </div>
      )}

      {/* Reject modal */}
      {showReject && (
        <RejectionModal
          activeUser={activeUser}
          onConfirm={handleReject}
          onCancel={() => setShowReject(false)}
          saving={saving}
        />
      )}

      {/* List panel */}
      <div style={{ width: 290, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", background: theme.surface, flexShrink: 0 }}>
        <div style={{ padding: "20px 14px 12px", borderBottom: `1px solid ${theme.border}` }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 19, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Pipeline</h2>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[
              { key: "active", label: "In Progress" },
              { key: "active_delivery", label: "Active" },
              { key: "declined", label: "Declined" },
              { key: "all", label: "All" },
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
            ? <EmptyState icon="◈" title="No records" subtitle="Pipeline records appear here." />
            : filtered.map(item => {
              const sc = STAGE_COLORS[item.stage] || STAGE_COLORS.intake_received;
              const hasRejReq = item.rejection_requested && item.stage !== "declined";
              return (
                <div key={item.id} onClick={() => handleSelect(item)}
                  style={{ padding: "12px 14px", borderBottom: `1px solid ${theme.border}`, cursor: "pointer", background: selected?.id === item.id ? theme.background : theme.surface, borderLeft: selected?.id === item.id ? `3px solid ${theme.primary}` : `3px solid ${hasRejReq ? theme.danger : "transparent"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, flex: 1, paddingRight: 6 }}>
                      {item.org_name || item.organization || item.event_name || "Unnamed"}
                    </div>
                    <Badge bg={sc.bg} color={sc.color}>{STAGES.find(s => s.key === item.stage)?.short || item.stage}</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>{item.contact_name || item.contactName || "—"}</div>
                  {hasRejReq && (
                    <div style={{ fontSize: 10, color: theme.danger, fontWeight: 700, marginTop: 3 }}>⚠ Rejection requested</div>
                  )}
                </div>
              );
            })
          }
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", background: theme.background }}>
        {!selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <EmptyState icon="◈" title="Select a pipeline record" subtitle="Stage-gated forms and actions will appear here." />
          </div>
        ) : (
          <div style={{ maxWidth: 700 }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
                  {selected.org_name || selected.organization || selected.event_name || "Unnamed Lead"}
                </h1>
                <div style={{ fontSize: 13, color: theme.textMuted }}>
                  {selected.contact_name || selected.contactName || "No contact"} · {STAGES.find(s => s.key === selected.stage)?.label || "Unknown Stage"}
                </div>
              </div>
              <LifecyclePill status={selected.stage} />
            </div>

            {/* Rejection request flag */}
            {selected.rejection_requested && selected.stage !== "declined" && FOUNDERS.includes(activeUser) && (
              <div style={{ padding: "12px 16px", borderRadius: 10, background: theme.dangerSoft, border: `1px solid rgba(192,57,43,0.3)`, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.danger, marginBottom: 4 }}>
                  ⚠ {selected.rejection_requested_by} requested rejection
                </div>
                <div style={{ fontSize: 13, color: theme.text, marginBottom: 10 }}>{selected.rejection_request_reason}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="danger" size="sm" onClick={() => handleReject(selected.rejection_request_reason, true)} disabled={saving}>
                    Approve Rejection
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    await updateDoc(doc(db, "pipeline", selected.id), { rejection_requested: false });
                    await load();
                    setSelected(prev => ({ ...prev, rejection_requested: false }));
                  }} disabled={saving}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            {/* Stage progress */}
            {selected.stage !== "declined" && <StageProgress currentStage={selected.stage || "intake_received"} />}

            {/* Lead info */}
            {renderLeadInfo()}

            {/* Stage form */}
            <Card style={{ marginBottom: 4 }}>
              {renderStageForm()}
              {renderStageAction()}
            </Card>

            {/* ── Client Portal ─────────────────────────────────────────── */}
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Client Portal</div>

              {/* Branding */}
              <Card style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Branding</div>
                  {!editBranding
                    ? <button onClick={() => { setEditBranding(true); setBrandingDraft(branding); }} style={{ fontSize: 11, color: theme.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                    : <div style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" onClick={saveBranding} disabled={savingBrand}>{savingBrand ? "Saving…" : "Save"}</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditBranding(false)}>Cancel</Button>
                      </div>
                  }
                </div>
                {editBranding ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input value={brandingDraft.logo_url || ""} onChange={e => setBrandingDraft(p => ({ ...p, logo_url: e.target.value }))}
                      placeholder="Logo URL (Drive or hosted link)"
                      style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3 }}>Primary Hex</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="color" value={brandingDraft.primary_hex || "#000000"} onChange={e => setBrandingDraft(p => ({ ...p, primary_hex: e.target.value }))}
                            style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${theme.border}`, cursor: "pointer", padding: 2 }} />
                          <input value={brandingDraft.primary_hex || ""} onChange={e => setBrandingDraft(p => ({ ...p, primary_hex: e.target.value }))}
                            placeholder="#000000" style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3 }}>Secondary Hex</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="color" value={brandingDraft.secondary_hex || "#000000"} onChange={e => setBrandingDraft(p => ({ ...p, secondary_hex: e.target.value }))}
                            style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${theme.border}`, cursor: "pointer", padding: 2 }} />
                          <input value={brandingDraft.secondary_hex || ""} onChange={e => setBrandingDraft(p => ({ ...p, secondary_hex: e.target.value }))}
                            placeholder="#000000" style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    {branding.logo_url
                      ? <img src={branding.logo_url} alt="logo" style={{ height: 32, objectFit: "contain", borderRadius: 4 }} onError={e => { e.target.style.display = "none"; }} />
                      : <div style={{ fontSize: 12, color: theme.textMuted }}>No logo set</div>
                    }
                    {branding.primary_hex && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ width: 16, height: 16, borderRadius: 3, background: branding.primary_hex, border: `1px solid ${theme.border}` }} />
                        <span style={{ fontSize: 11, color: theme.textMuted }}>{branding.primary_hex}</span>
                      </div>
                    )}
                    {branding.secondary_hex && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ width: 16, height: 16, borderRadius: 3, background: branding.secondary_hex, border: `1px solid ${theme.border}` }} />
                        <span style={{ fontSize: 11, color: theme.textMuted }}>{branding.secondary_hex}</span>
                      </div>
                    )}
                    {!branding.primary_hex && !branding.secondary_hex && !branding.logo_url && (
                      <div style={{ fontSize: 12, color: theme.textMuted }}>No branding set — click Edit to add</div>
                    )}
                  </div>
                )}
              </Card>

              {/* Invoices */}
              <Card style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Invoices</div>
                  <button onClick={() => setAddingInvoice(v => !v)}
                    style={{ fontSize: 11, fontWeight: 700, color: theme.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    {addingInvoice ? "Cancel" : "+ Add"}
                  </button>
                </div>

                {invoices.length === 0 && !addingInvoice && (
                  <div style={{ fontSize: 12, color: theme.textMuted }}>No invoices yet.</div>
                )}

                {invoices.map(inv => {
                  const statusColors = { draft: theme.textMuted, sent: "#2563eb", paid: "#2d7a46", overdue: theme.danger };
                  return (
                    <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${theme.border}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{inv.label}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted }}>{inv.due_date ? `Due ${inv.due_date}` : "No due date"}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: theme.primary }}>${parseFloat(inv.amount || 0).toLocaleString()}</div>
                      <select value={inv.status} onChange={e => updateInvoiceStatus(inv.id, e.target.value)}
                        style={{ fontSize: 11, fontWeight: 700, color: statusColors[inv.status] || theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 6, padding: "3px 6px", background: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", outline: "none" }}>
                        {["draft","sent","paid","overdue"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                      <button onClick={() => deleteInvoice(inv.id)} style={{ fontSize: 14, color: theme.textMuted, background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>×</button>
                    </div>
                  );
                })}

                {addingInvoice && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    <input value={newInvoice.label} onChange={e => setNewInvoice(p => ({ ...p, label: e.target.value }))}
                      placeholder="Invoice label (e.g. Deposit — RenderATL 2025)"
                      style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="number" value={newInvoice.amount} onChange={e => setNewInvoice(p => ({ ...p, amount: e.target.value }))}
                        placeholder="Amount ($)"
                        style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                      <input type="date" value={newInvoice.due_date} onChange={e => setNewInvoice(p => ({ ...p, due_date: e.target.value }))}
                        style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                    </div>
                    <select value={newInvoice.status} onChange={e => setNewInvoice(p => ({ ...p, status: e.target.value }))}
                      style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }}>
                      {["draft","sent","paid","overdue"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                    <Button size="sm" onClick={addInvoice} disabled={!newInvoice.label.trim() || !newInvoice.amount || savingInvoice}>
                      {savingInvoice ? "Saving…" : "Save Invoice"}
                    </Button>
                  </div>
                )}
              </Card>

              {/* Portal Invite */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 8 }}>Portal Access</div>
                {inviteSent ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 12, color: "#2d7a46", fontWeight: 600 }}>✓ Invite sent</div>
                    {selected.portal_invite_date && (
                      <div style={{ fontSize: 11, color: theme.textMuted }}>{new Date(selected.portal_invite_date).toLocaleDateString()}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Button size="sm" onClick={sendPortalInvite} disabled={sendingInvite || (!selected.contact_email && !selected.email)}>
                      {sendingInvite ? "Sending…" : "Send Portal Invite"}
                    </Button>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      {(!selected.contact_email && !selected.email) ? "No contact email on record" : `Will invite ${selected.contact_email || selected.email}`}
                    </div>
                  </div>
                )}
              </Card>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}