// ─────────────────────────────────────────────────────────────────────────────
// DocumentGenerator.jsx — Motion & Method LLC
// Route: /documents
// Added: doc status layer, internal review routing, existing doc loading,
//        Sign & Send gated behind approval, Approve button for founders
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, storage } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import {
  SignAndSendButton,
  SigningStatusBadge,
} from "../components/DocuSealSigning";
import {
  generateMSA,
  generateProposal,
  generateSOW,
  generateICAgreement,
  generateWaiver,
  generateOptionsummary,
} from "../utils/generateMMDocs";

const FOUNDERS = ["Ashley", "Mikal", "Ashley Glenn", "Mikal Driver"];
const ALL_OPERATORS = ["Ashley Glenn", "Mikal Driver", "Shanell Jefferson"];

const DOC_SUITE = [
  {
    key: "proposal",
    label: "Proposal",
    icon: "◈",
    signable: true,
    founderOnly: true,
    contextType: "both",
  },
  {
    key: "sow",
    label: "Statement of Work",
    icon: "◎",
    signable: true,
    founderOnly: true,
    contextType: "both",
  },
  {
    key: "msa",
    label: "Master Service Agreement",
    icon: "⊞",
    signable: true,
    founderOnly: true,
    contextType: "both",
  },
  {
    key: "ic_agreement",
    label: "IC Agreement",
    icon: "✍",
    signable: true,
    founderOnly: false,
    contextType: "event",
  },
  {
    key: "waiver",
    label: "Third-Party Staffing Waiver",
    icon: "⚠",
    signable: true,
    founderOnly: true,
    contextType: "event",
  },
  {
    key: "invoice",
    label: "Invoice",
    icon: "$",
    signable: false,
    founderOnly: false,
    contextType: "both",
  },
  {
    key: "options_summary",
    label: "Engagement Options Summary",
    icon: "◐",
    signable: false,
    founderOnly: false,
    contextType: "both",
  },
];

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  draft: {
    label: "Draft",
    color: "#6B7280",
    bg: "rgba(107,114,128,0.1)",
    border: "rgba(107,114,128,0.25)",
  },
  pending_review: {
    label: "Pending Review",
    color: "#D97706",
    bg: "rgba(217,119,6,0.1)",
    border: "rgba(217,119,6,0.3)",
  },
  approved: {
    label: "✓ Approved",
    color: "#2d7a46",
    bg: "rgba(45,122,70,0.1)",
    border: "rgba(45,122,70,0.3)",
  },
  sent: {
    label: "Sent for Signing",
    color: "#1C4A36",
    bg: "rgba(28,74,54,0.1)",
    border: "rgba(28,74,54,0.3)",
  },
  signed: {
    label: "✓ Fully Signed",
    color: "#2d7a46",
    bg: "rgba(45,122,70,0.15)",
    border: "rgba(45,122,70,0.4)",
  },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 999,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Storage path helper — structured by client + event ───────────────────────
function buildStoragePath(clientName, eventId, filename) {
  const safeClient = (clientName || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `clients/${safeClient}/events/${eventId}/documents/${safeFilename(filename)}`;
}

function safeFilename(str) {
  return (str || "").replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function DocumentGenerator() {
  const { activeUser } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedEventId = searchParams.get("event_id");
  const isFounder = FOUNDERS.some((f) =>
    (activeUser || "").includes(f.split(" ")[0]),
  );

  // Context selection
  const [contextMode, setContextMode] = useState("event");
  const [events, setEvents] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [selectedContext, setSelectedContext] = useState(null);
  const [pricingLog, setPricingLog] = useState(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // Operator
  const [operator, setOperator] = useState(activeUser || "Ashley Glenn");

  // Document state
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [generating, setGenerating] = useState(false);
  // generatedDocs: { docType: { id, url, filename, status, reviewers, ... } }
  const [generatedDocs, setGeneratedDocs] = useState({});
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [error, setError] = useState("");
  const [approvingDoc, setApprovingDoc] = useState(null);
  const [sharingDoc, setSharingDoc] = useState(null);

  // IC Agreement
  const [contractors, setContractors] = useState([]);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [contractorEmail, setContractorEmail] = useState("");

  // Form fields
  const [form, setForm] = useState({
    clientContact: "",
    clientEmail: "",
    depositPct: "50%",
    depositAmount: "",
    balanceDueDays: "30",
    midPayment: "",
    midMilestone: "",
    finalBalance: "",
    msaRef: "",
    keyChallenge: "",
    successDef: "",
    engagementRationale: "",
    vriNote: "",
    wrrNote: "",
    contractorName: "",
    contractorEmail: "",
    scopeNotes: "",
    contractorType: "",
    estimatedHours: "",
  });

  // Load events and engagements
  useEffect(() => {
    const loadAll = async () => {
      const [evtSnap, pipeSnap] = await Promise.all([
        getDocs(collection(db, "events")),
        getDocs(collection(db, "pipeline")),
      ]);
      const evtList = evtSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.name)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setEvents(evtList);
      setEngagements(
        pipeSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((e) => e.event_name || e.org_name)
          .sort((a, b) =>
            (a.event_name || "").localeCompare(b.event_name || ""),
          ),
      );
      if (preselectedEventId) {
        const match = evtList.find((e) => e.id === preselectedEventId);
        if (match) {
          setContextMode("event");
          setSelectedContext(match);
        }
      }
    };
    loadAll();
  }, [preselectedEventId]);

  // Load pricing log, contractors, AND existing doc records when context changes
  useEffect(() => {
    if (!selectedContext) return;
    const load = async () => {
      setLoadingContext(true);
      setLoadingDocs(true);
      setPricingLog(null);
      setGeneratedDocs({});

      // Load pricing log
      try {
        const q =
          contextMode === "event"
            ? query(
                collection(db, "pricing_log"),
                where("event_id", "==", selectedContext.id),
                orderBy("created_at", "desc"),
                limit(1),
              )
            : query(
                collection(db, "pricing_log"),
                where("pipeline_id", "==", selectedContext.id),
                orderBy("created_at", "desc"),
                limit(1),
              );
        const snap = await getDocs(q);
        if (!snap.empty)
          setPricingLog({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch (e) {
        console.error("pricing_log load error:", e);
      }

      // Load existing mm_documents for this context — most recent per docType
      try {
        const docsSnap = await getDocs(
          query(
            collection(db, "mm_documents"),
            where("contextId", "==", selectedContext.id),
            orderBy("createdAt", "desc"),
          ),
        );
        const byType = {};
        docsSnap.docs.forEach((d) => {
          const data = { id: d.id, ...d.data() };
          // Keep only the most recent per docType
          if (!byType[data.docType]) byType[data.docType] = data;
        });
        setGeneratedDocs(byType);
      } catch (e) {
        console.error("mm_documents load error:", e);
      }

      // Load contractors
      try {
        const poolSnap = await getDocs(collection(db, "talent_pool"));
        const poolContractors = poolSnap.docs
          .map(d => ({
            id:              d.id,
            uid:             d.data().uid || d.id, // doc ID is the uid
            ...d.data(),
          }))
          .filter(d => !!d.contractor_type);
 
        if (poolContractors.length === 0) {
          setContractors([]);
        } else {
          // Cross-reference volunteerProfiles for name + ic_agreement_signed
          const profileMap = {};
          const profileSnap = await getDocs(collection(db, "volunteerProfiles"));
          profileSnap.docs.forEach(d => {
            const data = d.data();
            // profile doc ID = uid, or uid field
            const key = data.uid || d.id;
            if (key) profileMap[key] = data;
          });
 
          const merged = poolContractors.map(contractor => {
            const profile = profileMap[contractor.uid] || {};
            const name =
              contractor.name ||
              (profile.first_name && profile.last_name
                ? `${profile.first_name} ${profile.last_name}`
                : profile.name || "");
            return {
              id:                  contractor.id,
              uid:                 contractor.uid,
              name,
              email:               contractor.email || profile.email || "",
              contractor_type:     contractor.contractor_type,
              ic_agreement_signed: !!profile.ic_agreement_signed,
            };
          }).filter(c => c.name);
 
          setContractors(merged);
        }
      } catch (e) {
        console.error("contractor load error:", e);
      }

      setLoadingContext(false);
      setLoadingDocs(false);
    };
    load();
  }, [selectedContext, contextMode]);

  useEffect(() => {
    if (!selectedContractor) return;
    setForm((p) => ({
      ...p,
      contractorName:  selectedContractor.name             || "",
      contractorEmail: selectedContractor.email            || "",
      // Auto-populate role from talent_pool record — M&M can override
      contractorType:  selectedContractor.contractor_type  || p.contractorType || "",
    }));
    setContractorEmail(selectedContractor.email || "");
  }, [selectedContractor]);

  const f = (key) => (val) => setForm((p) => ({ ...p, [key]: val }));
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const contextName =
    selectedContext?.name ||
    selectedContext?.event_name ||
    selectedContext?.org_name ||
    "";

  // ── Generate ─────────────────────────────────────────────────────────────────
  async function handleGenerate(docType) {
    if (!selectedContext) {
      setError("Select an event or engagement first.");
      return;
    }
    setGenerating(true);
    setError("");
    setSelectedDoc(docType);

    try {
      const functions = getFunctions();
      const saveDoc = httpsCallable(functions, "saveMMDocRecord");

      let blob, filename;

      if (docType === "msa") {
        ({ blob, filename } = await generateMSA({
          client: contextName,
          event: selectedContext,
          operator,
          today,
        }));
      } else if (docType === "proposal") {
        ({ blob, filename } = await generateProposal({
          client: contextName,
          event: selectedContext,
          pricingLog,
          operator,
          form,
          today,
        }));
      } else if (docType === "sow") {
        ({ blob, filename } = await generateSOW({
          client: contextName,
          event: selectedContext,
          pricingLog,
          operator,
          form,
          today,
        }));
      } else if (docType === "ic_agreement") {
        if (!form.contractorName) {
          setError("Select a contractor first.");
          setGenerating(false);
          return;
        }
        if (!form.contractorType) {
          setError("Select a contractor role before generating the ICA.");
          setGenerating(false);
          return;
        }
        ({ blob, filename } = await generateICAgreement({
          contractorName:  form.contractorName,
          contractorType:  form.contractorType,
          eventName:       selectedContext?.name                                    || "",
          eventDate:       selectedContext?.start_date || selectedContext?.event_date || "TBD",
          eventVenue:      selectedContext?.venue      || selectedContext?.location   || "TBD",
          estimatedHours:  form.estimatedHours                                      || "",
          operator,
          today,
        }));
      } else if (docType === "waiver") {
        ({ blob, filename } = await generateWaiver({
          client: contextName,
          event: selectedContext,
          operator,
          today,
        }));
      } else if (docType === "options_summary") {
        if (!pricingLog) {
          setError(
            "No pricing engine run found. Run the Pricing Engine first.",
          );
          setGenerating(false);
          return;
        }
        ({ blob, filename } = await generateOptionsummary({
          client: contextName,
          event: selectedContext,
          pricingLog,
          operator,
          today,
        }));
      } else {
        setError(`Document type "${docType}" not yet implemented.`);
        setGenerating(false);
        return;
      }

      // ── Structured storage path: clients/{client}/events/{eventId}/documents/{file} ──
      const clientName = selectedContext?.client || contextName;
      const storagePath = buildStoragePath(
        clientName,
        selectedContext.id,
        filename,
      );
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, blob);
      const url = await getDownloadURL(fileRef);

      // Save Firestore record with status: 'draft'
      const counterpartyEmail =
        docType === "ic_agreement"
          ? contractorEmail || form.contractorEmail
          : form.clientEmail || "";
      const counterpartyName =
        docType === "ic_agreement"
          ? form.contractorName
          : form.clientContact || contextName;
      const counterpartyUid =
        docType === "ic_agreement" ? selectedContractor?.uid || null : null;

      const result = await saveDoc({
        filename,
        url,
        storagePath,
        docType,
        contextId: selectedContext.id,
        contextName,
        operatorName: operator,
        eventId: contextMode === "event" ? selectedContext.id : null,
        engagementId: contextMode === "engagement" ? selectedContext.id : null,
        pipelineId: contextMode === "engagement" ? selectedContext.id : null, // ADD
        counterpartyName,
        counterpartyEmail,
        counterpartyUid,
      });

      // Write proposal_doc_id back to pipeline record so Pipeline.jsx gate clears
      if (docType === "proposal" && contextMode === "engagement") {
        await updateDoc(doc(db, "pipeline", selectedContext.id), {
          proposal_doc_id: result.data.documentId,
          proposal_doc_url: url,
        });
      }

      setGeneratedDocs((p) => ({
        ...p,
        [docType]: {
          id: result.data.documentId,
          url,
          filename,
          name: filename,
          docType,
          storagePath,
          status: "draft",
          counterpartyEmail,
          counterpartyName,
          counterpartyUid,
          eventId: contextMode === "event" ? selectedContext.id : null,
          engagementId:
            contextMode === "engagement" ? selectedContext.id : null,
          contextName,
          generatedBy: operator,
        },
      }));
    } catch (err) {
      console.error("Generate error:", err);
      setError(err.message || "Generation failed. Check console.");
    }
    setGenerating(false);
  }

  // ── Share for internal review ─────────────────────────────────────────────
  async function handleShareForReview(docType) {
    const generated = generatedDocs[docType];
    if (!generated?.id) return;
    setSharingDoc(docType);
    try {
      const functions = getFunctions();
      const shareForReview = httpsCallable(functions, "shareMMDocForReview");
      await shareForReview({ documentId: generated.id, sharedBy: operator });
      setGeneratedDocs((p) => ({
        ...p,
        [docType]: { ...p[docType], status: "pending_review" },
      }));
    } catch (err) {
      console.error("Share error:", err);
      setError("Could not share for review. Check console.");
    }
    setSharingDoc(null);
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  async function handleApprove(docType) {
    const generated = generatedDocs[docType];
    if (!generated?.id) return;
    setApprovingDoc(docType);
    try {
      const functions = getFunctions();
      const approveDoc = httpsCallable(functions, "approveMMDoc");
      await approveDoc({ documentId: generated.id, approvedBy: operator });
      setGeneratedDocs((p) => ({
        ...p,
        [docType]: { ...p[docType], status: "approved", approvedBy: operator },
      }));
    } catch (err) {
      console.error("Approve error:", err);
      setError("Could not approve. Check console.");
    }
    setApprovingDoc(null);
  }

  // ── Regen — clears local state so Generate button reappears ──────────────
  function handleRegen(docType) {
    setGeneratedDocs((p) => {
      const next = { ...p };
      delete next[docType];
      return next;
    });
  }

  const canOperatorSign = (docDef) => {
    const name = operator.toLowerCase();
    const isFounderOp = name.includes("ashley") || name.includes("mikal");
    if (docDef.founderOnly && !isFounderOp) return false;
    if (name.includes("shanell") && docDef.key !== "ic_agreement") return false;
    return true;
  };

  // Reviewer list label for a doc
  const reviewerLabel = (doc) => {
    if (!doc?.reviewers?.length) return null;
    return `Needs review by: ${doc.reviewers.join(" or ")}`;
  };

  // Can the current operator approve this doc?
  const canApprove = (generated) => {
    if (!generated || !isFounder) return false;
    return (
      generated.status === "pending_review" || generated.status === "draft"
    );
  };

  return (
    <div
      style={{
        padding: "32px 36px",
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <style>
        {
          "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"
        }
      </style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: theme.accent,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          M&M Operations
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 26,
                fontWeight: 700,
                color: theme.primary,
                fontFamily: "'Playfair Display', serif",
              }}
            >
              Document Generator
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: theme.textMuted,
              }}
            >
              Generate, review, approve, and send M&M engagement documents
            </p>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: theme.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              Signing Operator
            </div>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              style={selectStyle}
            >
              {ALL_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(192,57,43,0.08)",
            border: "1px solid rgba(192,57,43,0.25)",
            fontSize: 12,
            color: "#C0392B",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}
      >
        {/* ── Left: Context Selector ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Mode toggle */}
          <div
            style={{
              display: "flex",
              gap: 4,
              background: theme.background,
              borderRadius: 10,
              padding: 4,
              border: `1px solid ${theme.border}`,
            }}
          >
            {[
              { key: "event", label: "Events" },
              { key: "engagement", label: "Pipeline" },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => {
                  setContextMode(m.key);
                  setSelectedContext(null);
                  setPricingLog(null);
                  setGeneratedDocs({});
                }}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  borderRadius: 7,
                  border: "none",
                  cursor: "pointer",
                  background:
                    contextMode === m.key ? theme.primary : "transparent",
                  color: contextMode === m.key ? "#fff" : theme.textMuted,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.15s",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Context list */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderBottom: `1px solid ${theme.border}`,
                background: theme.background,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {contextMode === "event" ? "Select Event" : "Select Engagement"}
              </div>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {(contextMode === "event" ? events : engagements).map((item) => {
                const label =
                  item.name || item.event_name || item.org_name || "Unnamed";
                const sublabel =
                  item.client || item.org_name || item.event_date || "";
                const isSelected = selectedContext?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedContext(item)}
                    style={{
                      padding: "10px 14px",
                      cursor: "pointer",
                      background: isSelected ? `${theme.primary}10` : "#fff",
                      borderLeft: isSelected
                        ? `3px solid ${theme.primary}`
                        : "3px solid transparent",
                      borderBottom: `1px solid ${theme.border}`,
                      transition: "all 0.1s",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? theme.primary : theme.text,
                      }}
                    >
                      {label}
                    </div>
                    {sublabel && label !== sublabel && (
                      <div
                        style={{
                          fontSize: 11,
                          color: theme.textMuted,
                          marginTop: 1,
                        }}
                      >
                        {sublabel}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pricing log status */}
          {selectedContext && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: pricingLog
                  ? "rgba(45,122,70,0.06)"
                  : "rgba(235,199,100,0.1)",
                border: `1px solid ${pricingLog ? "rgba(45,122,70,0.2)" : "rgba(235,199,100,0.3)"}`,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: pricingLog ? "#2d7a46" : "#8a6800",
                  marginBottom: pricingLog ? 6 : 0,
                }}
              >
                {pricingLog
                  ? "✓ Pricing Engine Run Found"
                  : "⚠ No Pricing Run Found"}
              </div>
              {pricingLog && (
                <div
                  style={{
                    fontSize: 11,
                    color: theme.textMuted,
                    lineHeight: 1.6,
                  }}
                >
                  {pricingLog.tier} · Client Total: $
                  {Number(
                    pricingLog.client_total || pricingLog.final_price || 0,
                  ).toLocaleString()}
                  {pricingLog.reserve_amount > 0 &&
                    ` · Reserve: $${Number(pricingLog.reserve_amount).toLocaleString()}`}
                  <br />
                  VRI: {pricingLog.vri_band || "—"} · WRR:{" "}
                  {pricingLog.wrr_band || "—"}
                </div>
              )}
              {!pricingLog && (
                <div
                  style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}
                >
                  Fee fields will be blank. Run the Pricing Engine first.
                </div>
              )}
            </div>
          )}

          {/* Doc status legend */}
          {selectedContext && Object.keys(generatedDocs).length > 0 && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: "#fff",
                border: `1px solid ${theme.border}`,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                Suite Status
              </div>
              {DOC_SUITE.map((d) => {
                const g = generatedDocs[d.key];
                if (!g) return null;
                return (
                  <div
                    key={d.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "4px 0",
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    <span style={{ fontSize: 12, color: theme.text }}>
                      {d.label}
                    </span>
                    <StatusBadge status={g.status || "draft"} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: Document Suite ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!selectedContext ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 300,
                color: theme.textMuted,
                fontSize: 13,
              }}
            >
              Select an event or engagement to generate documents
            </div>
          ) : (
            <>
              {/* Context banner */}
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: theme.primary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.accent,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 2,
                    }}
                  >
                    {contextMode === "event" ? "Event" : "Engagement"}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#fff",
                      fontFamily: "'Playfair Display', serif",
                    }}
                  >
                    {contextName}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                  {today}
                </div>
              </div>

              {/* Engagement detail form */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "10px 16px",
                    borderBottom: `1px solid ${theme.border}`,
                    background: theme.background,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Engagement Details
                  </div>
                </div>
                <div
                  style={{
                    padding: "16px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <Field label="Client Contact (Name, Title)" span={2}>
                    <input
                      value={form.clientContact}
                      onChange={(e) => f("clientContact")(e.target.value)}
                      placeholder="Jane Smith, Head of Events"
                      style={inputStyle}
                    />
                  </Field>
                  <Field
                    label="Client Email (for DocuSeal signing request)"
                    span={2}
                  >
                    <input
                      value={form.clientEmail}
                      onChange={(e) => f("clientEmail")(e.target.value)}
                      placeholder="jane@render.com"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Deposit %">
                    <select
                      value={form.depositPct}
                      onChange={(e) => f("depositPct")(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="30%">30%</option>
                      <option value="50%">50%</option>
                    </select>
                  </Field>
                  <Field label="Deposit Amount ($)">
                    <input
                      value={form.depositAmount}
                      onChange={(e) => f("depositAmount")(e.target.value)}
                      placeholder="e.g. 27,500"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Final Balance Due (days before event)">
                    <input
                      value={form.balanceDueDays}
                      onChange={(e) => f("balanceDueDays")(e.target.value)}
                      placeholder="30"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="MSA Reference Date">
                    <input
                      value={form.msaRef}
                      onChange={(e) => f("msaRef")(e.target.value)}
                      placeholder="Leave blank for Standalone SOW"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Engagement-Specific Scope Notes" span={2}>
                    <textarea
                      value={form.scopeNotes}
                      onChange={(e) => f("scopeNotes")(e.target.value)}
                      placeholder="Document any scope variations, third-party arrangements, or engagement-specific context that should appear in the SOW..."
                      rows={4}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </Field>
                </div>
                <div
                  style={{
                    padding: "0 16px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: theme.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      paddingTop: 4,
                      borderTop: `1px solid ${theme.border}`,
                    }}
                  >
                    Proposal Narrative (required for Proposal generation)
                  </div>
                  <Field label="Key Operational Challenge" span={2}>
                    <textarea
                      value={form.keyChallenge}
                      onChange={(e) => f("keyChallenge")(e.target.value)}
                      placeholder="1-2 sentences in the client's language..."
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </Field>
                  <Field label="What Success Looks Like" span={2}>
                    <textarea
                      value={form.successDef}
                      onChange={(e) => f("successDef")(e.target.value)}
                      placeholder="Their definition from discovery..."
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </Field>
                  <Field label="Engagement Rationale" span={2}>
                    <textarea
                      value={form.engagementRationale}
                      onChange={(e) => f("engagementRationale")(e.target.value)}
                      placeholder="2-3 sentences on why this structure is right..."
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </Field>
                </div>
              </div>

              {/* IC Agreement — Contractor */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "10px 16px",
                    borderBottom: `1px solid ${theme.border}`,
                    background: theme.background,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    IC Agreement — Contractor Details
                  </div>
                </div>
                <div
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {/* Contractor selector */}
                  <Field label="Select Contractor">
                    <select
                      value={selectedContractor?.uid || ""}
                      onChange={(e) =>
                        setSelectedContractor(
                          contractors.find(
                            (c) => (c.uid || c.id) === e.target.value
                          ) || null
                        )
                      }
                      style={inputStyle}
                    >
                      <option value="">— Select a contractor —</option>
                      {contractors.map((c) => (
                        <option key={c.uid || c.id} value={c.uid || c.id}>
                          {c.name} {c.ic_agreement_signed ? "✓" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
 
                  {/* Role / contractor type — auto-populated, overridable */}
                  <Field label="Contractor Role">
                    <select
                      value={form.contractorType || ""}
                      onChange={(e) => f("contractorType")(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">— Select role —</option>
                      <option value="general_contractor">General Contractor ($22/hr)</option>
                      <option value="technical_specialist">Technical Specialist ($28/hr)</option>
                      <option value="team_lead">Team Lead ($30/hr)</option>
                      <option value="ops_lead">Ops Lead ($55/hr)</option>
                    </select>
                  </Field>
 
                  {/* Estimated hours — optional */}
                  <Field label="Estimated Hours (optional)">
                    <input
                      value={form.estimatedHours || ""}
                      onChange={(e) => f("estimatedHours")(e.target.value)}
                      placeholder="e.g. 16 — leave blank if not yet confirmed"
                      style={inputStyle}
                    />
                  </Field>
 
                  {/* Event details confirmation — pulled from selected event */}
                  {selectedContext && (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "rgba(28,74,54,0.05)",
                        border: "1px solid rgba(28,74,54,0.15)",
                        fontSize: 11,
                        color: "#1C4A36",
                        lineHeight: 1.7,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>
                        Event details pulled from record:
                      </div>
                      <div>📅 {selectedContext.start_date || selectedContext.event_date || "Date TBD"}</div>
                      <div>📍 {selectedContext.venue || selectedContext.location || "Venue TBD"}</div>
                    </div>
                  )}
 
                  {/* Email confirmation / warning */}
                  {selectedContractor && contractorEmail ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#2d7a46",
                        fontWeight: 600,
                        padding: "4px 0",
                      }}
                    >
                      ✉ Signing request will be sent to: {contractorEmail}
                    </div>
                  ) : selectedContractor && !contractorEmail ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#C0392B",
                        fontWeight: 600,
                        padding: "4px 0",
                      }}
                    >
                      ⚠ No email on file for this contractor. Add one to their talent pool record before sending.
                    </div>
                  ) : null}
 
                  {/* Already signed notice */}
                  {selectedContractor?.ic_agreement_signed && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#2d7a46",
                        fontWeight: 700,
                        padding: "4px 0",
                      }}
                    >
                      ✓ IC Agreement already signed for a previous engagement — a new one is required for {selectedContext?.name || "this event"}.
                    </div>
                  )}
                </div>
              </div>

              {/* ── Document Suite ── */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "10px 16px",
                    borderBottom: `1px solid ${theme.border}`,
                    background: theme.background,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Document Suite
                    {loadingDocs && (
                      <span
                        style={{ marginLeft: 8, fontWeight: 400, fontSize: 10 }}
                      >
                        Loading…
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ padding: "8px 0" }}>
                  {DOC_SUITE.map((docDef) => {
                    const generated = generatedDocs[docDef.key];
                    const canSign = canOperatorSign(docDef);
                    const isGenerating =
                      generating && selectedDoc === docDef.key;
                    const status = generated?.status || null;
                    const reviewer = generated
                      ? reviewerLabel(generated)
                      : null;

                    return (
                      <div
                        key={docDef.key}
                        style={{
                          padding: "14px 16px",
                          borderBottom: `1px solid ${theme.border}`,
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        {/* Doc label + reviewer hint */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            flex: 1,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 16,
                              color: theme.primary,
                              marginTop: 1,
                            }}
                          >
                            {docDef.icon}
                          </span>
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: theme.text,
                              }}
                            >
                              {docDef.label}
                            </div>
                            {docDef.founderOnly && !generated && (
                              <div
                                style={{ fontSize: 10, color: theme.textMuted }}
                              >
                                Founder only
                              </div>
                            )}
                            {reviewer &&
                              status !== "approved" &&
                              status !== "sent" &&
                              status !== "signed" && (
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: "#D97706",
                                    marginTop: 2,
                                  }}
                                >
                                  {reviewer}
                                </div>
                              )}
                            {generated?.approvedBy && (
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "#2d7a46",
                                  marginTop: 2,
                                }}
                              >
                                Approved by {generated.approvedBy}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexShrink: 0,
                            flexWrap: "wrap",
                            justifyContent: "flex-end",
                          }}
                        >
                          {/* Status badge */}
                          {generated && <StatusBadge status={status} />}

                          {/* Download */}
                          {generated?.url && (
                            <a
                              href={generated.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: theme.primary,
                                textDecoration: "none",
                              }}
                            >
                              ↓ Download
                            </a>
                          )}

                          {/* Share for Review — available on draft, before approval */}
                          {generated && status === "draft" && (
                            <button
                              onClick={() => handleShareForReview(docDef.key)}
                              disabled={sharingDoc === docDef.key}
                              style={{
                                padding: "5px 10px",
                                borderRadius: 6,
                                border: `1px solid ${theme.primary}`,
                                background: "transparent",
                                color: theme.primary,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                                fontFamily: "'DM Sans', sans-serif",
                                opacity: sharingDoc === docDef.key ? 0.6 : 1,
                              }}
                            >
                              {sharingDoc === docDef.key
                                ? "Sharing…"
                                : "↗ Share for Review"}
                            </button>
                          )}

                          {/* Approve — founders only, on draft or pending_review */}
                          {generated && canApprove(generated) && (
                            <button
                              onClick={() => handleApprove(docDef.key)}
                              disabled={approvingDoc === docDef.key}
                              style={{
                                padding: "5px 10px",
                                borderRadius: 6,
                                border: "none",
                                background: "#2d7a46",
                                color: "#fff",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                                fontFamily: "'DM Sans', sans-serif",
                                opacity: approvingDoc === docDef.key ? 0.6 : 1,
                              }}
                            >
                              {approvingDoc === docDef.key
                                ? "Approving…"
                                : "✓ Approve"}
                            </button>
                          )}

                          {/* Sign & Send — ONLY when approved */}
                          {generated &&
                            docDef.signable &&
                            canSign &&
                            status === "approved" && (
                              <SignAndSendButton
                                document={generated}
                                operator={operator}
                                onComplete={() =>
                                  setGeneratedDocs((p) => ({
                                    ...p,
                                    [docDef.key]: {
                                      ...p[docDef.key],
                                      status: "sent",
                                      mmSigned: true,
                                    },
                                  }))
                                }
                              />
                            )}

                          {/* Regen */}
                          {generated && (
                            <button
                              onClick={() => handleRegen(docDef.key)}
                              style={{
                                padding: "5px 10px",
                                borderRadius: 6,
                                border: `1px solid ${theme.border}`,
                                background: "transparent",
                                color: theme.textMuted,
                                fontSize: 11,
                                cursor: "pointer",
                                fontFamily: "'DM Sans', sans-serif",
                              }}
                            >
                              ↺ Regen
                            </button>
                          )}

                          {/* Generate — only when no doc exists */}
                          {!generated && (
                            <button
                              onClick={() => handleGenerate(docDef.key)}
                              disabled={
                                isGenerating || generating || !selectedContext
                              }
                              style={{
                                padding: "7px 14px",
                                borderRadius: 8,
                                border: "none",
                                cursor: "pointer",
                                background: isGenerating
                                  ? theme.background
                                  : theme.primary,
                                color: isGenerating ? theme.textMuted : "#fff",
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: "'DM Sans', sans-serif",
                                opacity: generating && !isGenerating ? 0.5 : 1,
                                transition: "all 0.15s",
                              }}
                            >
                              {isGenerating ? "Generating..." : "Generate"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span === 2 ? "1 / -1" : undefined }}>
      <label
        style={{
          display: "block",
          fontSize: 10,
          fontWeight: 700,
          color: "#6B7280",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1.5px solid #E5E7EB",
  background: "#F9FAFB",
  color: "#1A1A1A",
  fontSize: 12,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle = {
  ...inputStyle,
  appearance: "none",
  cursor: "pointer",
};
