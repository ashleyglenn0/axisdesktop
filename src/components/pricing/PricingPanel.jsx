// src/components/pricing/PipelinePricingPanel.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the old PricingForm in Pipeline's discovery_complete stage.
// 1. Shows a "Run Pricing Engine" button that routes to /pricing?pipeline_id=X&return_to=pipeline
// 2. On return, detects the most recent Tier Engine run AND the most recent Advisory
//    Engine run for this pipeline_id — an engagement can have either or both (Hybrid).
// 3. Shows each engine's output for operator review, in its own section.
// 4. Operator confirms each independently (with optional edits) → writes pricing fields
//    to stage_data. Execution and retainer pricing are always separate fields, never
//    blended into one number — consistent with the "never blended" rule everywhere else.
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

  const [latestTierRun, setLatestTierRun]         = useState(null);
  const [latestAdvisoryRun, setLatestAdvisoryRun] = useState(null);
  const [loadingRun, setLoadingRun]               = useState(false);
  const [confirmedExecution, setConfirmedExecution] = useState(false);
  const [confirmedRetainer, setConfirmedRetainer]   = useState(false);

  // Local editable state — Tier Engine (execution) side
  const [editPrice, setEditPrice]     = useState(data.pricing_confirmed_price || "");
  const [editTier, setEditTier]       = useState(data.pricing_tier || "");
  const [editDeposit, setEditDeposit] = useState(data.pricing_deposit || "");
  const [editTerms, setEditTerms]     = useState(data.pricing_payment_terms || "");

  // Local editable state — Advisory Engine (retainer) side
  const [editRetainerBand, setEditRetainerBand] = useState(data.pricing_retainer_band || "");
  const [editMonthlyRate, setEditMonthlyRate]   = useState(data.pricing_monthly_rate || "");
  const [editDiagnosticFee, setEditDiagnosticFee] = useState(data.pricing_diagnostic_fee || "");

  // Shared
  const [editNotes, setEditNotes] = useState(data.pricing_notes || "");

  const hasConfirmedExecution = !!data.pricing_confirmed_price;
  const hasConfirmedRetainer  = !!data.pricing_monthly_rate;
  const hasAnyConfirmed = hasConfirmedExecution || hasConfirmedRetainer;

  // Fetch the latest Tier Engine run AND the latest Advisory Engine run for this
  // pipeline — an engagement can have either, or both (Hybrid: Tier logs the execution
  // component, Advisory logs the retainer, always as two separate pricing_log entries).
  // Defined outside the effect so the Refresh button can call it directly, instead of
  // trying to trigger a re-fetch by poking state the effect happens to depend on.
  const fetchRun = async () => {
    if (!pipelineId) return;
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
        // Most recent of each engine type — never assume "newest overall" is the right
        // one to display, since a Hybrid flow logs Advisory after Tier and the two are
        // not interchangeable (different fields entirely).
        const tierRun     = runs.find(r => r.engine === "tier") || null;
        const advisoryRun = runs.find(r => r.engine === "advisory") || null;
        setLatestTierRun(tierRun);
        setLatestAdvisoryRun(advisoryRun);

        if (tierRun && !data.pricing_confirmed_price) {
          setEditPrice(String(tierRun.final_price || ""));
          setEditTier(tierRun.tier || "");
        }
        if (advisoryRun && !data.pricing_monthly_rate) {
          setEditRetainerBand(advisoryRun.retainer_band_label || "");
          setEditMonthlyRate(String(advisoryRun.monthly_rate || ""));
          setEditDiagnosticFee(String(advisoryRun.diagnostic_fee || ""));
        }
      } else {
        setLatestTierRun(null);
        setLatestAdvisoryRun(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRun(false);
    }
  };

  // Load latest engine runs for this pipeline on mount / on return.
  // IMPORTANT: loadingRun must NOT be a dependency here. The effect itself sets
  // loadingRun (true at the start of fetchRun, false in its finally block) — having
  // it in the dependency array meant every state change the effect caused re-triggered
  // the effect, which caused another state change, forever. That's the infinite loop:
  // set loadingRun(true) → deps changed → effect refires → fetch → set loadingRun(false)
  // → deps changed → effect refires → fetch → ... endlessly hitting Firestore and
  // re-rendering the whole panel, which is why typing anywhere near it was unusable.
  useEffect(() => {
    fetchRun();
  }, [pipelineId, justReturned]);

  const handleRunEngine = () => {
    navigate(`/pricing?pipeline_id=${pipelineId}&return_to=pipeline`);
  };

  const handleConfirmExecution = () => {
    if (!editPrice) return;
    onChange("pricing_confirmed_price", editPrice);
    onChange("pricing_tier", editTier);
    onChange("pricing_deposit", editDeposit);
    onChange("pricing_payment_terms", editTerms);
    onChange("pricing_notes", editNotes);
    if (latestTierRun?.reserve_amount) {
      onChange("pricing_labor_reserve", String(latestTierRun.reserve_amount));
    }
    setConfirmedExecution(true);
  };

  const handleConfirmRetainer = () => {
    if (!editMonthlyRate) return;
    onChange("pricing_retainer_band", editRetainerBand);
    onChange("pricing_monthly_rate", editMonthlyRate);
    onChange("pricing_diagnostic_fee", editDiagnosticFee);
    onChange("pricing_notes", editNotes);
    setConfirmedRetainer(true);
  };

  const TIER_OPTIONS = ["Tier 0", "Tier 1", "Tier 2", "Tier 3"];
  const TERMS_OPTIONS = ["50% deposit / 50% at event", "30% deposit / 70% at event", "Net 30", "Custom"];

  const showTierSection     = !!latestTierRun || hasConfirmedExecution;
  const showAdvisorySection = !!latestAdvisoryRun || hasConfirmedRetainer;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Run Engine CTA */}
      <div style={{
        padding: "16px 18px", borderRadius: 10,
        background: hasAnyConfirmed ? t.successSoft : t.warnSoft,
        border: `1px solid ${hasAnyConfirmed ? "rgba(88,176,108,0.3)" : "rgba(235,199,100,0.4)"}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: hasAnyConfirmed ? t.success : t.warn, marginBottom: 4 }}>
          {hasAnyConfirmed ? "✓ PRICING CONFIRMED" : "PRICING ENGINE — REQUIRED"}
        </div>
        <div style={{ fontSize: 13, color: t.text, marginBottom: 12 }}>
          {hasAnyConfirmed
            ? "Pricing has been confirmed for this engagement. Run the engine again to generate a revised quote."
            : "Run the Pricing Engine to generate a defensible quote for this engagement. You'll confirm the numbers here before advancing."}
        </div>
        <button
          onClick={handleRunEngine}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 8, cursor: "pointer",
            background: hasAnyConfirmed ? t.primary : t.accent,
            color: hasAnyConfirmed ? "#fff" : t.primary,
            border: "none", fontSize: 12, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
          }}>
          {hasAnyConfirmed ? "Run Engine Again ↗" : "Run Pricing Engine ↗"}
        </button>
      </div>

      {loadingRun && (
        <div style={{ fontSize: 12, color: t.textMuted, padding: "8px 0" }}>Loading latest engine runs...</div>
      )}

      {/* ── Tier Engine (execution) section ─────────────────────────────── */}
      {showTierSection && !loadingRun && (
        <>
          {latestTierRun && (
            <div style={{ borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden" }}>
              <div style={{
                padding: "10px 14px", background: t.offWhite,
                borderBottom: `1px solid ${t.border}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
                  Latest Tier Engine Run — {latestTierRun.pillar}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 11, color: t.textMuted }}>
                    {latestTierRun.created_at?.toDate?.()?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}Operator: {latestTierRun.operator}
                  </div>
                  <button onClick={fetchRun}
                    style={{ fontSize: 11, color: t.primary, fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
                    Refresh ↺
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
                {[
                  ["Tier", latestTierRun.tier + (latestTierRun.tier_override ? " (override)" : "")],
                  ["Final Price", `$${latestTierRun.final_price?.toLocaleString()}`],
                  ["Floor Check", latestTierRun.floor_check],
                  ["VRI Band", latestTierRun.vri_band || "—"],
                  ["WRR Band", latestTierRun.wrr_band || "—"],
                  ["Labor Reserve", latestTierRun.reserve_amount > 0 ? `$${latestTierRun.reserve_amount?.toLocaleString()} (${latestTierRun.reserve_label})` : "None required"],
                  ["Complexity", latestTierRun.complexity_adj],
                  ["Add-Ons", latestTierRun.add_on_total > 0 ? `$${latestTierRun.add_on_total?.toLocaleString()}` : "None"],
                  ["CIMI", latestTierRun.cimi_scored ? `${latestTierRun.cimi_avg} avg` : "Not scored"],
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

          <div style={{ borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: t.offWhite, borderBottom: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
                {hasConfirmedExecution ? "Confirmed Execution Pricing" : "Confirm Execution Pricing"}
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                Review the Tier Engine output above. Edit any field if needed, then confirm to advance.
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

              {!hasConfirmedExecution || !confirmedExecution ? (
                <button
                  onClick={handleConfirmExecution}
                  disabled={!editPrice || !editTier}
                  style={{
                    padding: "10px 20px", borderRadius: 8, border: "none", cursor: editPrice && editTier ? "pointer" : "not-allowed",
                    background: editPrice && editTier ? t.primary : "rgba(150,150,150,0.12)",
                    color: editPrice && editTier ? "#fff" : "rgba(150,150,150,0.5)",
                    fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                    alignSelf: "flex-start",
                  }}>
                  Confirm Execution Pricing ✓
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.success }}>✓ Execution pricing confirmed</div>
                  <button onClick={() => setConfirmedExecution(false)}
                    style={{ fontSize: 11, color: t.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Advisory Engine (retainer) section ──────────────────────────── */}
      {showAdvisorySection && !loadingRun && (
        <>
          {latestAdvisoryRun && (
            <div style={{ borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden" }}>
              <div style={{
                padding: "10px 14px", background: t.offWhite,
                borderBottom: `1px solid ${t.border}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
                  Latest Advisory Engine Run{latestAdvisoryRun.is_hybrid ? " — Hybrid" : " — P4"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 11, color: t.textMuted }}>
                    {latestAdvisoryRun.created_at?.toDate?.()?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}Operator: {latestAdvisoryRun.operator}
                  </div>
                  <button onClick={fetchRun}
                    style={{ fontSize: 11, color: t.primary, fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
                    Refresh ↺
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
                {[
                  ["CIMI Avg", latestAdvisoryRun.cimi_avg],
                  ["Maturity Band", latestAdvisoryRun.maturity_band],
                  ["Phase", latestAdvisoryRun.phase_confirmed],
                  ["Retainer Band", latestAdvisoryRun.retainer_band_label],
                  ["Monthly Rate", latestAdvisoryRun.monthly_rate ? `$${latestAdvisoryRun.monthly_rate?.toLocaleString()}` : "—"],
                  ["Diagnostic Fee", latestAdvisoryRun.diagnostic_fee > 0 ? `$${latestAdvisoryRun.diagnostic_fee?.toLocaleString()}` : "None"],
                  ["P4 Tier", latestAdvisoryRun.p4_tier],
                  latestAdvisoryRun.is_hybrid
                    ? ["Hybrid Execution", `${latestAdvisoryRun.hybrid_pillar} — $${latestAdvisoryRun.hybrid_price?.toLocaleString()}`]
                    : ["Hybrid", "No"],
                ].filter(Boolean).map(([label, val], i) => (
                  <div key={i} style={{
                    padding: "10px 14px",
                    background: i % 2 === 0 ? t.surface : t.offWhite,
                    borderBottom: i < 6 ? `1px solid ${t.border}` : "none",
                    borderRight: (i + 1) % 3 !== 0 ? `1px solid ${t.border}` : "none",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{val || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: t.offWhite, borderBottom: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
                {hasConfirmedRetainer ? "Confirmed Retainer Pricing" : "Confirm Retainer Pricing"}
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                Review the Advisory Engine output above. Edit any field if needed, then confirm to advance. Kept as a separate line item from execution pricing — never blended.
              </div>
            </div>
            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <PricingField label="Retainer Band">
                  <input value={editRetainerBand} onChange={e => setEditRetainerBand(e.target.value)}
                    placeholder="Band 2" style={inputStyle} />
                </PricingField>
                <PricingField label="Monthly Rate" required>
                  <input value={editMonthlyRate} onChange={e => setEditMonthlyRate(e.target.value)}
                    placeholder="$4,500" style={inputStyle} />
                </PricingField>
                <PricingField label="Diagnostic Fee (one-time, if applicable)">
                  <input value={editDiagnosticFee} onChange={e => setEditDiagnosticFee(e.target.value)}
                    placeholder="$3,000" style={inputStyle} />
                </PricingField>
              </div>

              {!hasConfirmedRetainer || !confirmedRetainer ? (
                <button
                  onClick={handleConfirmRetainer}
                  disabled={!editMonthlyRate}
                  style={{
                    padding: "10px 20px", borderRadius: 8, border: "none", cursor: editMonthlyRate ? "pointer" : "not-allowed",
                    background: editMonthlyRate ? t.primary : "rgba(150,150,150,0.12)",
                    color: editMonthlyRate ? "#fff" : "rgba(150,150,150,0.5)",
                    fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                    alignSelf: "flex-start",
                  }}>
                  Confirm Retainer Pricing ✓
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.success }}>✓ Retainer pricing confirmed</div>
                  <button onClick={() => setConfirmedRetainer(false)}
                    style={{ fontSize: 11, color: t.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Shared notes — applies to whichever section(s) are present */}
      {(showTierSection || showAdvisorySection) && !loadingRun && (
        <div style={{ borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px" }}>
            <PricingField label="Pricing Notes">
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                placeholder="Any concessions, add-ons, or adjustments..."
                rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} />
            </PricingField>
          </div>
        </div>
      )}

      {!latestTierRun && !latestAdvisoryRun && !loadingRun && !hasAnyConfirmed && (
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