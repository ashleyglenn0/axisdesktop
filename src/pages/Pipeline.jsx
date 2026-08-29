import { useEffect, useState, useCallback } from "react";
import {
  collection, getDocs, doc, updateDoc, addDoc, deleteDoc,
  serverTimestamp, query, orderBy, where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Button, Badge, Spinner, EmptyState } from "../components/UI";
import PipelinePricingPanel from "../components/pricing/PricingPanel";

const functions = getFunctions();
const sendMMPortalInviteFn = httpsCallable(functions, "sendMMPortalInvite");

// ─── STAGE CONFIG ─────────────────────────────────────────────────────────────
const STAGES = [
  { key: "intake_received",        label: "Intake Received",        short: "Intake"    },
  { key: "awaiting_qualification", label: "Awaiting Qualification", short: "Qual"      },
  { key: "approved_for_discovery", label: "Approved for Discovery", short: "Discovery" },
  { key: "discovery_complete",     label: "Discovery Complete",     short: "Pricing"   },
  { key: "pricing_approved",       label: "Pricing Approved",       short: "Proposal"  },
  { key: "proposal_sent",          label: "Proposal Sent",          short: "Closing"   },
  { key: "active",                 label: "Active",                 short: "Active"    },
  { key: "declined",               label: "Declined",               short: "Declined"  },
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
          placeholder={placeholder} style={baseInput} />
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
      <Field label="Notes" type="textarea" rows={3} {...f("qual_notes")} placeholder="Anything else worth capturing…" />
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
        placeholder="What specifically do they need from M&M?" />
      <Field label="Stakeholders Involved" type="textarea" rows={2} {...f("disc_stakeholders")}
        placeholder="Who else is in the room?" />
      <Field label="Risks or Flags" type="textarea" rows={2} {...f("disc_risks")}
        placeholder="Timeline concerns, unclear scope, competing vendors…" />
      <Field label="Notes" type="textarea" rows={2} {...f("disc_notes")} />
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
          placeholder="Why did they pass?" />
      )}
      {data.closing_outcome === "Negotiating" && (
        <Field label="Negotiation Notes" type="textarea" rows={2} {...f("closing_negotiation_notes")}
          placeholder="What are they pushing back on?" />
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

// ─── DOC SIGNING STATUS ───────────────────────────────────────────────────────
// Reads mm_documents to check if MSA or SOW is fully signed for this pipeline record
// DocSigningStatus — updated to gate on proposal + msa + sow all signed
const REQUIRED_DOCS = [
  { type: "proposal", label: "Proposal" },
  { type: "msa",      label: "Master Service Agreement" },
  { type: "sow",      label: "Statement of Work" },
];

function DocSigningStatus({ pipelineId, onStatusChange }) {
  const [docMap,  setDocMap]  = useState({}); // docType → doc record
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pipelineId) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, "mm_documents"),
            where("pipelineId", "==", pipelineId),
            where("docType", "in", ["proposal", "msa", "sow"])
          )
        );
        // Most recent per type wins
        const map = {};
        snap.docs.forEach(d => {
          const data = { id: d.id, ...d.data() };
          if (!map[data.docType] || data.createdAt > map[data.docType].createdAt) {
            map[data.docType] = data;
          }
        });
        setDocMap(map);
        const allSigned = REQUIRED_DOCS.every(r => map[r.type]?.bothSigned === true);
        onStatusChange?.(allSigned);
      } catch (e) {
        console.error("DocSigningStatus load error:", e);
      }
      setLoading(false);
    };
    load();
  }, [pipelineId]);

  if (loading) return <div style={{ fontSize: 12, color: theme.textMuted }}>Checking document status…</div>;

  const allSigned = REQUIRED_DOCS.every(r => docMap[r.type]?.bothSigned === true);

  return (
    <div style={{
      padding: "14px 16px", borderRadius: 10, marginBottom: 16,
      background: allSigned ? "rgba(88,176,108,0.08)" : "rgba(224,123,42,0.08)",
      border: `1px solid ${allSigned ? "rgba(88,176,108,0.35)" : "rgba(224,123,42,0.35)"}`,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: allSigned ? "#2d7a46" : "#E07B2A", marginBottom: 10 }}>
        {allSigned ? "✓ All Documents Signed — Ready to Activate" : "All Three Documents Must Be Signed Before Activation"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {REQUIRED_DOCS.map(({ type, label }) => {
          const d = docMap[type];
          const signed  = d?.bothSigned === true;
          const pending = d && !signed && d.counterpartyEmbedSrc;
          const noDoc   = !d;

          return (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700,
                background: signed ? "#2d7a46" : "rgba(0,0,0,0.08)",
                color: signed ? "#fff" : theme.textMuted,
              }}>
                {signed ? "✓" : "–"}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: signed ? "#2d7a46" : theme.text }}>{label}</span>
                <span style={{ fontSize: 11, color: theme.textMuted, marginLeft: 8 }}>
                  {signed
                    ? `Signed ${d.signedAt?.toDate?.()?.toLocaleDateString?.() || ""}`
                    : pending
                      ? "Awaiting client signature"
                      : noDoc
                        ? "Not generated yet"
                        : "Generated — not yet sent for signature"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {!allSigned && (
        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 10 }}>
          Generate missing documents in the Document Generator. Once sent to the client portal and signed by both parties, this gate will clear automatically.
        </div>
      )}
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
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            placeholder={isFounder ? "Why are we declining?" : "Why should this be rejected?"}
            rows={3}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "none", boxSizing: "border-box", color: theme.text, background: theme.offWhite }} />
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
        const done = i < idx, current = i === idx;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < activeStages.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 64 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: done ? theme.secondary : current ? theme.primary : theme.border,
                color: done || current ? "#fff" : theme.textMuted,
                border: current ? `3px solid ${theme.primaryDark}` : "none",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: current ? theme.primary : done ? theme.secondary : theme.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center", lineHeight: 1.2, whiteSpace: "nowrap" }}>
                {s.short}
              </div>
            </div>
            {i < activeStages.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? theme.secondary : theme.border, marginBottom: 18 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Pipeline() {
  const { activeUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const justPriced  = searchParams.get("priced") === "1";
  const highlightId = searchParams.get("highlight");

  const [items,        setItems]        = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [formData,     setFormData]     = useState({});
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [filter,       setFilter]       = useState("active");
  const [dirty,        setDirty]        = useState(false);
  const [showReject,   setShowReject]   = useState(false);
  const [toast,        setToast]        = useState(null);
  const [docsSigned,   setDocsSigned]   = useState(false); // from DocSigningStatus

  // Portal / invoice state
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

  useEffect(() => {
    if (highlightId && items.length > 0) {
      const match = items.find(i => i.id === highlightId);
      if (match) {
        handleSelect(match);
        // Clear the highlight param once used. Without this, every subsequent load()
        // (which runs after every save/reject/activation-send and creates a NEW items
        // array reference) re-triggers this effect and calls handleSelect again — which
        // resets formData back to the last-saved stage_data, silently discarding any
        // edits made since. That's the "can't type, it keeps resetting" symptom.
        const next = new URLSearchParams(searchParams);
        next.delete("highlight");
        setSearchParams(next, { replace: true });
      }
    }
  }, [highlightId, items]);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(query(collection(db, "pipeline"), orderBy("created_at", "desc")));
    setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSelect = (item) => {
    setSelected(item);
    setFormData(item.stage_data || {});
    setDirty(false);
    setDocsSigned(false);
    setBranding(item.branding || { logo_url: "", primary_hex: "", secondary_hex: "" });
    setBrandingDraft(item.branding || { logo_url: "", primary_hex: "", secondary_hex: "" });
    setInviteSent(!!item.portal_invite_sent);
    loadInvoices(item.id);
  };

  const loadInvoices = async (clientId) => {
    const snap = await getDocs(collection(db, "pipeline", clientId, "invoices"));
    setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")));
  };

  const updateField = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = async (extraFields = {}) => {
    if (!selected) return;
    setSaving(true);
    await updateDoc(doc(db, "pipeline", selected.id), {
      stage_data:      { ...formData },
      last_updated_by: activeUser,
      last_updated_at: serverTimestamp(),
      ...extraFields,
    });
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
        stage: "declined", rejection_reason: reason,
        rejected_by: activeUser, rejected_at: serverTimestamp(),
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

  // ── Portal invite via Cloud Function ────────────────────────────────────────
  const sendPortalInvite = async () => {
    if (!selected) return;
    const email = selected.contact_email || selected.email;
    if (!email) { showToast("No contact email on record", "error"); return; }

    setSendingInvite(true);
    try {
      await sendMMPortalInviteFn({ pipelineId: selected.id });
      setInviteSent(true);
      setSelected(prev => ({ ...prev, portal_invite_sent: true }));
      showToast(`Portal invite sent to ${email}`);
    } catch (err) {
      console.error("sendMMPortalInvite error:", err);
      showToast(`Invite failed: ${err.message}`, "error");
    }
    setSendingInvite(false);
  };

  // ── Send to Activation Queue ─────────────────────────────────────────────────
  const sendToActivationQueue = async () => {
    setSaving(true);
    const item = { ...selected, stage_data: formData };
    const ref = await addDoc(collection(db, "event_intake_requests"), {
      event_name:      item.event_name || `${item.org_name || item.organization || ""} — ${formData.qual_event_type || "Event"}`,
      client:          item.org_name || item.organization || item.client || "",
      event_date:      formData.disc_confirmed_date || formData.qual_est_date || "",
      venue:           formData.disc_venue || "",
      location:        formData.disc_location || "",
      attendee_count:  formData.disc_attendance || "",
      pillar:          formData.disc_pillar || formData.qual_pillar_hypothesis || "",
      budget:          formData.disc_budget || "",
      contact_name:    item.contact_name || item.contactName || "",
      contact_email:   item.contact_email || item.email || "",
      confirmed_price: formData.pricing_confirmed_price || "",
      deposit:         formData.pricing_deposit || "",
      payment_terms:   formData.pricing_payment_terms || "",
      status:          "new",
      pipeline_id:     selected.id,
      created_at:      serverTimestamp(),
    });
    await updateDoc(doc(db, "pipeline", selected.id), {
      stage: "active",
      activation_queue_id:   ref.id,
      sent_to_activation_by: activeUser,
      sent_to_activation_at: serverTimestamp(),
      stage_data: { ...formData },
    });
    await load();
    setSelected(prev => ({ ...prev, stage: "active" }));
    setSaving(false);
    showToast("Sent to Activation Queue ✓");
  };

  // Invoice helpers (unchanged)
  const addInvoice = async () => {
    if (!newInvoice.label.trim() || !newInvoice.amount) return;
    setSavingInvoice(true);
    await addDoc(collection(db, "pipeline", selected.id, "invoices"), {
      ...newInvoice, amount: parseFloat(newInvoice.amount), created_at: new Date().toISOString(),
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

  // ── FILTERED LIST ──────────────────────────────────────────────────────────
  const filtered = (() => {
    if (filter === "active")          return items.filter(i => !["declined","active","complete"].includes(i.stage));
    if (filter === "active_delivery") return items.filter(i => i.stage === "active");
    if (filter === "declined")        return items.filter(i => i.stage === "declined");
    return items;
  })();

  // ── STAGE ACTIONS ──────────────────────────────────────────────────────────
  const renderStageAction = () => {
    if (!selected) return null;
    const stage     = selected.stage || "intake_received";
    const isFounder = FOUNDERS.includes(activeUser);

    const rejectBtn = (
      <Button variant="danger" size="sm" onClick={() => setShowReject(true)} disabled={saving}>
        {isFounder ? "Reject" : "Request Rejection"}
      </Button>
    );

    const saveBtn = (
      <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || !dirty}>
        {saving ? "Saving…" : "Save"}
      </Button>
    );

    switch (stage) {
      case "intake_received":
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}
            <Button onClick={claimLead} disabled={saving}>Claim Lead → Start Qualification</Button>
          </div>
        );

      case "awaiting_qualification":
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}{saveBtn}
            <Button onClick={() => advanceStage("approved_for_discovery")}
              disabled={saving || !formData.qual_pillar_hypothesis || !formData.qual_pain_point}>
              Submit Qual → Approve for Discovery
            </Button>
          </div>
        );

      case "approved_for_discovery":
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}{saveBtn}
            <Button onClick={() => advanceStage("discovery_complete")}
              disabled={saving || !formData.disc_confirmed_date || !formData.disc_budget || !formData.disc_pillar || !formData.disc_scope_notes}>
              Submit Discovery → Complete
            </Button>
          </div>
        );

      case "discovery_complete": {
        // Previously required pricing_tier + pricing_confirmed_price specifically —
        // Tier Engine fields only. A pure P4 engagement never sets those (it confirms
        // pricing_retainer_band + pricing_monthly_rate instead), so this would have
        // permanently blocked any P4-only lead from ever advancing past this stage.
        // Now accepts either confirmation as valid — execution, retainer, or both.
        const executionConfirmed = !!formData.pricing_tier && !!formData.pricing_confirmed_price;
        const retainerConfirmed  = !!formData.pricing_retainer_band && !!formData.pricing_monthly_rate;
        const pricingConfirmed   = executionConfirmed || retainerConfirmed;
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}{saveBtn}
            <Button onClick={() => advanceStage("pricing_approved")}
              disabled={saving || !pricingConfirmed}>
              Confirm Pricing → Approve
            </Button>
          </div>
        );
      }

      // ── PROPOSAL STAGE — refactored ─────────────────────────────────────
      case "pricing_approved": {
        const hasProposal   = !!selected.proposal_doc_id;
        const hasInvite     = !!selected.portal_invite_sent;
        const canAdvance    = hasProposal && hasInvite;

        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20, flexWrap: "wrap" }}>
            {rejectBtn}{saveBtn}
            <Button
              onClick={() => advanceStage("proposal_sent")}
              disabled={saving || !canAdvance}
              title={!hasProposal ? "Generate proposal first" : !hasInvite ? "Send portal invite first" : ""}
            >
              Advance to Closing →
            </Button>
          </div>
        );
      }

      // ── CLOSING STAGE ───────────────────────────────────────────────────
      case "proposal_sent": {
        if (formData.closing_outcome === "Declined") {
          return (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              {saveBtn}
              <Button variant="danger" onClick={() => advanceStage("declined")} disabled={saving}>
                Mark as Declined
              </Button>
            </div>
          );
        }
        if (formData.closing_outcome === "Accepted" && formData.closing_deposit_received === "Yes") {
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
              {/* Doc signing status — gates activation */}
              <DocSigningStatus
                pipelineId={selected.id}
                onStatusChange={setDocsSigned}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                {rejectBtn}{saveBtn}
                <Button
                  onClick={sendToActivationQueue}
                  disabled={saving || !docsSigned}
                  style={docsSigned ? { background: theme.accent, color: theme.primaryDark } : {}}
                  title={!docsSigned ? "MSA or SOW must be signed before activating" : ""}
                >
                  {docsSigned ? "Send to Activation Queue ✓" : "Awaiting Signed MSA / SOW…"}
                </Button>
              </div>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            {rejectBtn}{saveBtn}
          </div>
        );
      }

      case "active":
        return (
          <div style={{ padding: "16px", borderRadius: 10, background: theme.successSoft, border: `1px solid rgba(88,176,108,0.3)`, marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#2d7a46", marginBottom: 6 }}>In Activation Queue</div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10 }}>This record has been sent to the Activation Queue. Continue managing from there.</div>
            <Button size="sm" onClick={() => navigate("/activation-setup")}>Go to Activation Queue →</Button>
          </div>
        );

      default: return null;
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
          <div style={{ fontSize: 13, color: theme.text }}>Claim this lead to begin qualification.</div>
          {selected.claimed_by && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>Claimed by {selected.claimed_by}</div>}
        </div>
      );
    }
    if (stage === "awaiting_qualification") return <>{sectionTitle("Qualification", "Complete after discovery call. Required before advancing.")}<QualForm data={formData} onChange={updateField} /></>;
    if (stage === "approved_for_discovery") return <>{sectionTitle("Discovery", "Lock down specifics before pricing.")}<DiscoveryForm data={formData} onChange={updateField} /></>;

    if (stage === "discovery_complete") {
      return <>
        {sectionTitle("Pricing", "Run the Pricing Engine, then confirm the output below.")}
        {justPriced && (
          <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, background: "rgba(100,200,100,0.08)", border: "1px solid rgba(100,200,100,0.3)", fontSize: 12, fontWeight: 600, color: "#2d7a46" }}>
            ✓ Engine run complete — review and confirm the numbers below.
          </div>
        )}
        <PipelinePricingPanel pipelineId={selected?.id} data={formData} onChange={updateField} />
      </>;
    }

    // ── PROPOSAL STAGE — refactored, no PandaDoc ──────────────────────────
    if (stage === "pricing_approved") {
      const hasProposal = !!selected.proposal_doc_id;
      const hasInvite   = !!selected.portal_invite_sent;
      const email       = selected.contact_email || selected.email;

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {sectionTitle("Proposal & Portal Invite", "Generate the proposal, invite the client to the portal, then advance to closing.")}

          {/* Step 1 — Generate Proposal */}
          <div style={{
            padding: "16px", borderRadius: 10,
            background: hasProposal ? "rgba(88,176,108,0.08)" : theme.offWhite,
            border: `1px solid ${hasProposal ? "rgba(88,176,108,0.35)" : theme.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasProposal ? 0 : 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: hasProposal ? "#2d7a46" : theme.text }}>
                  {hasProposal ? "✓ Proposal Generated" : "Step 1 — Generate Proposal"}
                </div>
                {!hasProposal && (
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 3 }}>
                    Opens the Document Generator with this pipeline record pre-loaded.
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant={hasProposal ? "outline" : "primary"}
                onClick={() => navigate(`/document-generator?pipelineId=${selected.id}&docType=proposal`)}
              >
                {hasProposal ? "View / Regenerate ↗" : "Go to Document Generator →"}
              </Button>
            </div>
            {hasProposal && selected.proposal_doc_url && (
              <a href={selected.proposal_doc_url} target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: theme.primary, fontWeight: 600, textDecoration: "none" }}>
                Open proposal ↗
              </a>
            )}
          </div>

          {/* Step 2 — Portal Invite */}
          <div style={{
            padding: "16px", borderRadius: 10,
            background: hasInvite ? "rgba(88,176,108,0.08)" : hasProposal ? theme.offWhite : "rgba(0,0,0,0.03)",
            border: `1px solid ${hasInvite ? "rgba(88,176,108,0.35)" : theme.border}`,
            opacity: hasProposal ? 1 : 0.5,
            pointerEvents: hasProposal ? "auto" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: hasInvite ? "#2d7a46" : theme.text }}>
                  {hasInvite ? "✓ Portal Invite Sent" : "Step 2 — Send Portal Invite"}
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 3 }}>
                  {hasInvite
                    ? `Invited ${email} on ${selected.portal_invite_date ? new Date(selected.portal_invite_date).toLocaleDateString() : "record"}.`
                    : email
                      ? `Will send to ${email}`
                      : "No contact email on record — add one to the lead before inviting."}
                </div>
              </div>
              {!hasInvite && (
                <Button
                  size="sm"
                  onClick={sendPortalInvite}
                  disabled={sendingInvite || !email}
                >
                  {sendingInvite ? "Sending…" : "Send Invite →"}
                </Button>
              )}
            </div>
          </div>

          {/* Gate status */}
          {(!hasProposal || !hasInvite) && (
            <div style={{ fontSize: 12, color: theme.textMuted, padding: "8px 12px", borderRadius: 8, background: "rgba(224,123,42,0.06)", border: "1px solid rgba(224,123,42,0.2)" }}>
              {!hasProposal
                ? "Generate the proposal first, then send the portal invite to unlock closing."
                : "Send the portal invite to unlock closing."}
            </div>
          )}
        </div>
      );
    }

    if (stage === "proposal_sent") return <>{sectionTitle("Closing", "Track the outcome. Activation requires deposit received and signed MSA/SOW.")}<ClosingForm data={formData} onChange={updateField} /></>;

    if (stage === "declined") {
      return (
        <div style={{ padding: "14px 16px", borderRadius: 10, background: theme.dangerSoft, border: `1px solid rgba(192,57,43,0.2)` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.danger, marginBottom: 4 }}>Declined</div>
          {selected.rejection_reason && <div style={{ fontSize: 13, color: theme.text }}>{selected.rejection_reason}</div>}
          {selected.rejected_by && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>By {selected.rejected_by}</div>}
        </div>
      );
    }
    return null;
  };

  // ── LEAD INFO SUMMARY ──────────────────────────────────────────────────────
  const renderLeadInfo = () => {
    if (!selected) return null;
    const fields = [
      ["Org / Client",  selected.org_name || selected.organization || selected.client],
      ["Contact",       selected.contact_name || selected.contactName],
      ["Email",         selected.contact_email || selected.email],
      ["Event Type",    selected.event_type || selected.eventType || formData.qual_event_type],
      ["Claimed By",    selected.claimed_by],
      ["Submitted",     selected.created_at?.toDate?.()?.toLocaleDateString?.() || selected.createdAt?.toDate?.()?.toLocaleDateString?.()],
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
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px", borderRadius: 10, background: toast.type === "success" ? theme.primary : toast.type === "warning" ? theme.warning : theme.danger, color: "#fff", fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
          {toast.msg}
        </div>
      )}

      {showReject && <RejectionModal activeUser={activeUser} onConfirm={handleReject} onCancel={() => setShowReject(false)} saving={saving} />}

      {/* List panel */}
      <div style={{ width: 290, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", background: theme.surface, flexShrink: 0 }}>
        <div style={{ padding: "20px 14px 12px", borderBottom: `1px solid ${theme.border}` }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 19, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Pipeline</h2>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[
              { key: "active",          label: "In Progress" },
              { key: "active_delivery", label: "Active" },
              { key: "declined",        label: "Declined" },
              { key: "all",             label: "All" },
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
                  {hasRejReq && <div style={{ fontSize: 10, color: theme.danger, fontWeight: 700, marginTop: 3 }}>⚠ Rejection requested</div>}
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
            </div>

            {/* Rejection request flag */}
            {selected.rejection_requested && selected.stage !== "declined" && FOUNDERS.includes(activeUser) && (
              <div style={{ padding: "12px 16px", borderRadius: 10, background: theme.dangerSoft, border: `1px solid rgba(192,57,43,0.3)`, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.danger, marginBottom: 4 }}>⚠ {selected.rejection_requested_by} requested rejection</div>
                <div style={{ fontSize: 13, color: theme.text, marginBottom: 10 }}>{selected.rejection_request_reason}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="danger" size="sm" onClick={() => handleReject(selected.rejection_request_reason, true)} disabled={saving}>Approve Rejection</Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    await updateDoc(doc(db, "pipeline", selected.id), { rejection_requested: false });
                    await load();
                    setSelected(prev => ({ ...prev, rejection_requested: false }));
                  }} disabled={saving}>Dismiss</Button>
                </div>
              </div>
            )}

            {selected.stage !== "declined" && <StageProgress currentStage={selected.stage || "intake_received"} />}
            {renderLeadInfo()}

            <Card style={{ marginBottom: 4 }}>
              {renderStageForm()}
              {renderStageAction()}
            </Card>

            {/* ── Client Portal section ──────────────────────────────────── */}
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
                      placeholder="Logo URL" style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      {["primary_hex","secondary_hex"].map(key => (
                        <div key={key} style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3 }}>{key === "primary_hex" ? "Primary" : "Secondary"} Hex</div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input type="color" value={brandingDraft[key] || "#000000"} onChange={e => setBrandingDraft(p => ({ ...p, [key]: e.target.value }))}
                              style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${theme.border}`, cursor: "pointer", padding: 2 }} />
                            <input value={brandingDraft[key] || ""} onChange={e => setBrandingDraft(p => ({ ...p, [key]: e.target.value }))}
                              placeholder="#000000" style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    {branding.logo_url
                      ? <img src={branding.logo_url} alt="logo" style={{ height: 32, objectFit: "contain", borderRadius: 4 }} onError={e => { e.target.style.display = "none"; }} />
                      : <div style={{ fontSize: 12, color: theme.textMuted }}>No logo set</div>
                    }
                    {["primary_hex","secondary_hex"].map(key => branding[key] && (
                      <div key={key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ width: 16, height: 16, borderRadius: 3, background: branding[key], border: `1px solid ${theme.border}` }} />
                        <span style={{ fontSize: 11, color: theme.textMuted }}>{branding[key]}</span>
                      </div>
                    ))}
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
                  <button onClick={() => setAddingInvoice(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: theme.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    {addingInvoice ? "Cancel" : "+ Add"}
                  </button>
                </div>
                {invoices.length === 0 && !addingInvoice && <div style={{ fontSize: 12, color: theme.textMuted }}>No invoices yet.</div>}
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
                      placeholder="Invoice label (e.g. Deposit — Render ATL 2026)"
                      style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="number" value={newInvoice.amount} onChange={e => setNewInvoice(p => ({ ...p, amount: e.target.value }))}
                        placeholder="Amount ($)" style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
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

              {/* Portal access status (read-only here — invite button lives in proposal stage) */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 8 }}>Portal Access</div>
                {inviteSent ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 12, color: "#2d7a46", fontWeight: 600 }}>✓ Invite sent</div>
                    {selected.portal_invite_date && (
                      <div style={{ fontSize: 11, color: theme.textMuted }}>{new Date(selected.portal_invite_date).toLocaleDateString()}</div>
                    )}
                    <div style={{ fontSize: 11, color: theme.textMuted }}>· {selected.portal_client_email}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: theme.textMuted }}>
                    Invite will be sent from the Proposal stage once a proposal has been generated.
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