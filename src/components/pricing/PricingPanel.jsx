// src/components/pricing/PipelinePricingPanel.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the old PricingForm in Pipeline's discovery_complete stage.
// 1. Shows a "Run Pricing Engine" button that routes to /pricing?pipeline_id=X&return_to=pipeline
// 2. On return, detects the most recent pricing_log entry for this pipeline_id
// 3. Shows the engine output for operator review
// 4. Operator confirms (with optional edits) → writes pricing fields to stage_data
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../../firebase";

// theme imported inline since this lives in Pipeline's light theme context
const t = {
  primary:    "#1B4332",
  accent:     "#EBC764",
  border:     "#E5E7EB",
  text:       "#1A1A1A",
  textMuted:  "#6B7280",
  surface:    "#FFFFFF",
  offWhite:   "#F9FAFB",
  success:    "#2d7a46",
  successSoft:"rgba(88,176,108,0.08)",
  warn:       "#8a6800",
  warnSoft:   "rgba(235,199,100,0.12)",
};

export default function PipelinePricingPanel({ pipelineId, data, onChange }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justReturned = searchParams.get("priced") === "1";

  const [latestRun, setLatestRun] = useState(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Local editable state — pre-filled from engine run, operator can adjust
  const [editPrice, setEditPrice]         = useState(data.pricing_confirmed_price || "");
  const [editTier, setEditTier]           = useState(data.pricing_tier || "");
  const [editDeposit, setEditDeposit]     = useState(data.pricing_deposit || "");
  const [editTerms, setEditTerms]         = useState(data.pricing_payment_terms || "");
  const [editNotes, setEditNotes]         = useState(data.pricing_notes || "");

  const hasConfirmedPrice = !!data.pricing_confirmed_price;

  // Load latest engine run for this pipeline on mount / on return
  useEffect(() => {
    if (!pipelineId) return;
    const fetchRun = async () => {
      setLoadingRun(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, "pricing_log"),
            where("pipeline_id", "==", pipelineId)
          )
        );
        if (!snap.empty) {
          // Sort in JS to avoid requiring a composite Firestore index
          const runs = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
              const at = a.created_at?.toDate?.()?.getTime?.() || 0;
              const bt = b.created_at?.toDate?.()?.getTime?.() || 0;
              return bt - at;
            });
          const run = runs[0];
          setLatestRun(run);
          // Pre-fill editable fields from run if not already confirmed
          if (!data.pricing_confirmed_price) {
            setEditPrice(String(run.final_price || ""));
            setEditTier(run.tier || "");
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingRun(false);
      }
    };
    fetchRun();
  }, [pipelineId, justReturned, loadingRun]);

  const handleRunEngine = () => {
    navigate(`/pricing?pipeline_id=${pipelineId}&return_to=pipeline`);
  };

  const handleConfirm = () => {
    if (!editPrice) return;
    onChange("pricing_confirmed_price", editPrice);
    onChange("pricing_tier", editTier);
    onChange("pricing_deposit", editDeposit);
    onChange("pricing_payment_terms", editTerms);
    onChange("pricing_notes", editNotes);
    if (latestRun?.reserve_amount) {
      onChange("pricing_labor_reserve", String(latestRun.reserve_amount));
    }
    setConfirmed(true);
  };

  const TIER_OPTIONS = ["Tier 0", "Tier 1", "Tier 2", "Tier 3"];
  const TERMS_OPTIONS = ["50% deposit / 50% at event", "30% deposit / 70% at event", "Net 30", "Custom"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Run Engine CTA */}
      <div style={{
        padding: "16px 18px", borderRadius: 10,
        background: hasConfirmedPrice ? t.successSoft : t.warnSoft,
        border: `1px solid ${hasConfirmedPrice ? "rgba(88,176,108,0.3)" : "rgba(235,199,100,0.4)"}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: hasConfirmedPrice ? t.success : t.warn, marginBottom: 4 }}>
          {hasConfirmedPrice ? "✓ PRICING CONFIRMED" : "PRICING ENGINE — REQUIRED"}
        </div>
        <div style={{ fontSize: 13, color: t.text, marginBottom: 12 }}>
          {hasConfirmedPrice
            ? "Pricing has been confirmed for this engagement. Run the engine again to generate a revised quote."
            : "Run the Pricing Engine to generate a defensible quote for this engagement. You'll confirm the numbers here before advancing."}
        </div>
        <button
          onClick={handleRunEngine}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 8, cursor: "pointer",
            background: hasConfirmedPrice ? t.primary : t.accent,
            color: hasConfirmedPrice ? "#fff" : t.primary,
            border: "none", fontSize: 12, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
          }}>
          {hasConfirmedPrice ? "Run Engine Again ↗" : "Run Pricing Engine ↗"}
        </button>
      </div>

      {/* Latest engine run result */}
      {loadingRun && (
        <div style={{ fontSize: 12, color: t.textMuted, padding: "8px 0" }}>Loading latest engine run...</div>
      )}

      {latestRun && !loadingRun && (
        <div style={{ borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden" }}>
          <div style={{
            padding: "10px 14px", background: t.offWhite,
            borderBottom: `1px solid ${t.border}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
              Latest Engine Run
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 11, color: t.textMuted }}>
                {latestRun.created_at?.toDate?.()?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {" · "}Operator: {latestRun.operator}
              </div>
              <button onClick={() => { setLoadingRun(true); setLatestRun(null); }}
                style={{ fontSize: 11, color: t.primary, fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
                Refresh ↺
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
            {[
              ["Tier", latestRun.tier + (latestRun.tier_override ? " (override)" : "")],
              ["Final Price", `$${latestRun.final_price?.toLocaleString()}`],
              ["Floor Check", latestRun.floor_check],
              ["VRI Band", latestRun.vri_band || "—"],
              ["WRR Band", latestRun.wrr_band || "—"],
              ["Labor Reserve", latestRun.reserve_amount > 0 ? `$${latestRun.reserve_amount?.toLocaleString()} (${latestRun.reserve_label})` : "None required"],
              ["Complexity", latestRun.complexity_adj],
              ["Add-Ons", latestRun.add_on_total > 0 ? `$${latestRun.add_on_total?.toLocaleString()}` : "None"],
              ["CIMI", latestRun.cimi_scored ? `${latestRun.cimi_avg} avg` : "Not scored"],
            ].map(([label, val], i) => (
              <div key={i} style={{
                padding: "10px 14px",
                background: i % 2 === 0 ? t.surface : t.offWhite,
                borderBottom: i < 6 ? `1px solid ${t.border}` : "none",
                borderRight: (i + 1) % 3 !== 0 ? `1px solid ${t.border}` : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: label === "Floor Check" ? (val === "OK" ? t.success : "#C0392B") : t.text,
                }}>{val || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual confirm form */}
      {(latestRun || hasConfirmedPrice) && (
        <div style={{ borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: t.offWhite, borderBottom: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
              {hasConfirmedPrice ? "Confirmed Pricing" : "Confirm Pricing"}
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
              Review the engine output above. Edit any field if needed, then confirm to advance.
            </div>
          </div>
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <PricingField label="Selected Tier" required>
                <select value={editTier} onChange={e => setEditTier(e.target.value)} style={selectStyle}>
                  <option value="">— Select —</option>
                  {TIER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </PricingField>
              <PricingField label="Confirmed Price" required>
                <input value={editPrice} onChange={e => setEditPrice(e.target.value)}
                  placeholder="$18,500" style={inputStyle} />
              </PricingField>
              <PricingField label="Deposit Amount">
                <input value={editDeposit} onChange={e => setEditDeposit(e.target.value)}
                  placeholder="$5,000" style={inputStyle} />
              </PricingField>
              <PricingField label="Payment Terms">
                <select value={editTerms} onChange={e => setEditTerms(e.target.value)} style={selectStyle}>
                  <option value="">— Select —</option>
                  {TERMS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </PricingField>
            </div>
            <PricingField label="Pricing Notes">
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                placeholder="Any concessions, add-ons, or adjustments..."
                rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} />
            </PricingField>

            {!hasConfirmedPrice || !confirmed ? (
              <button
                onClick={handleConfirm}
                disabled={!editPrice || !editTier}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: "none", cursor: editPrice && editTier ? "pointer" : "not-allowed",
                  background: editPrice && editTier ? t.primary : "rgba(150,150,150,0.12)",
                  color: editPrice && editTier ? "#fff" : "rgba(150,150,150,0.5)",
                  fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                  alignSelf: "flex-start",
                }}>
                Confirm Pricing ✓
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.success }}>✓ Pricing confirmed</div>
                <button onClick={() => setConfirmed(false)}
                  style={{ fontSize: 11, color: t.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!latestRun && !loadingRun && !hasConfirmedPrice && (
        <div style={{ fontSize: 12, color: t.textMuted, padding: "8px 0" }}>
          No engine runs yet for this engagement. Run the Pricing Engine above to generate a quote.
        </div>
      )}
    </div>
  );
}

function PricingField({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}{required && <span style={{ color: "#E07B2A", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  padding: "9px 11px", borderRadius: 8, fontSize: 13,
  border: "1.5px solid #E5E7EB", background: "#F9FAFB",
  color: "#1A1A1A", outline: "none", fontFamily: "'DM Sans', sans-serif",
  width: "100%", boxSizing: "border-box",
};

const selectStyle = {
  ...inputStyle, appearance: "none",
};