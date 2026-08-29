import { useState } from "react";
import { Guide, GUIDES } from "./PricingGuide";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { theme } from "../../theme";
import { DISCOUNT_TIERS, getDiscountTier, isDiscountAuthorized, DISCOUNT_REASON_MIN_LENGTH } from "./discountPolicy";

const STEPS = ["CIMI Diagnostic", "Phase & Band", "Retainer Scope", "Hybrid?", "Summary"];

const CIMI_CATS = [
  { id: "workforce_model", label: "Workforce Model", guide: "Does the client have a defined staffing structure, role clarity, and chain of command?" },
  { id: "recruitment_pipeline", label: "Recruitment Pipeline", guide: "Can the client reliably source, screen, and onboard volunteers at scale?" },
  { id: "volunteer_engagement", label: "Volunteer Engagement", guide: "Does the client have structured communication, engagement, and retention practices?" },
  { id: "accountability", label: "Accountability Framework", guide: "Are there documented standards, performance expectations, and enforcement protocols?" },
  { id: "platform_systems", label: "Platform & Systems", guide: "What tools does the client use? Are they configured correctly and actually used?" },
  { id: "leadership_capability", label: "Leadership Capability", guide: "Does the client have trained, capable Team Leads and Ops Leads?" },
  { id: "founder_dependency", label: "Founder Dependency", guide: "Can the org operate without the founder in the room? How deep does the dependency run?" },
];

// min/max added — previously only a display string ("rate"), so the typed Monthly Rate was
// never actually checked against the band's documented range.
const BANDS = [
  { id: "band1", label: "Band 1", rate: "$3,000–5,000 / mo", min: 3000, max: 5000, cimiRange: "< 2.4", profile: "Foundational", desc: "Building from scratch. High M&M involvement. Full infrastructure design." },
  { id: "band2", label: "Band 2", rate: "$4,000–6,000 / mo", min: 4000, max: 6000, cimiRange: "2.5–3.4", profile: "Structural Gaps", desc: "Fixing the gaps. System documentation, role definition, pipeline build." },
  { id: "band3", label: "Band 3", rate: "$6,000–8,000 / mo", min: 6000, max: 8000, cimiRange: "3.5–4.4", profile: "Maturing", desc: "Optimization and leadership. Scaling what works. Reducing founder dependency." },
  { id: "band4", label: "Band 4", rate: "$8,000–10,000 / mo", min: 8000, max: 10000, cimiRange: "4.5–5.0", profile: "Embedded Partner", desc: "Strategic partnership. High-level advisory. Minimal hands-on build work." },
];

const DIAGNOSTIC_FEE_RANGE = { min: 2500, max: 5000 };

const P4_TIERS = [
  { id: "full_service", label: "Full Service", desc: "Axis + Framework + M&M team on the ground" },
  { id: "hybrid", label: "Hybrid", desc: "Axis + Framework + M&M oversight, client staff executes" },
  { id: "self_operated", label: "Self-Operated", desc: "Axis + Framework only — client runs independently" },
];

function getBandFromCIMI(avg) {
  const n = parseFloat(avg);
  if (n < 2.4) return "band1";
  if (n < 3.5) return "band2";
  if (n < 4.5) return "band3";
  return "band4";
}

function getPhaseFromCIMI(avg) {
  const n = parseFloat(avg);
  if (n < 2.4) return "Phase 1 — Diagnostic & Discovery";
  if (n < 3.5) return "Phase 2 — System Architecture";
  if (n < 4.5) return "Phase 3 — Optimization";
  return "Ongoing Retainer";
}

function getMaturityFromCIMI(avg) {
  const n = parseFloat(avg);
  if (n < 2.4) return "Foundational";
  if (n < 3.5) return "Structural Gaps";
  if (n < 4.5) return "Maturing";
  return "Embedded Partner";
}

// event: the selected event/pipeline record
// hybridExecutionResult: the completed, already-logged Tier Engine run for the execution
//   component of a Hybrid engagement (passed down from Pricing.jsx). When present, this
//   engagement IS hybrid — no manual toggle, no manual price entry. When absent, this is a
//   standalone Pillar 4 advisory engagement.
// hybridGroupId: shared id linking this entry's pricing_log record to the Tier Engine
//   record referenced by hybridExecutionResult.
export default function AdvisoryEngine({ event, operator, pipelineId, hybridExecutionResult, hybridGroupId, onComplete, onBack }) {
  const [step, setStep] = useState(0);
  const isHybrid = !!hybridExecutionResult;

  // CIMI
  const [cimiInputs, setCimiInputs] = useState({});
  const cimiScored = CIMI_CATS.every(c => cimiInputs[c.id] !== undefined);
  const cimiTotal = Object.values(cimiInputs).reduce((s, v) => s + (parseInt(v) || 0), 0);
  const cimiAvg = cimiScored ? (cimiTotal / CIMI_CATS.length).toFixed(1) : null;
  const recommendedBandId = cimiAvg ? getBandFromCIMI(cimiAvg) : null;
  const recommendedPhase = cimiAvg ? getPhaseFromCIMI(cimiAvg) : null;
  const maturityBand = cimiAvg ? getMaturityFromCIMI(cimiAvg) : null;

  // Band
  const [selectedBandId, setSelectedBandId] = useState(null);
  const [monthlyRate, setMonthlyRate] = useState("");
  const [diagnosticFee, setDiagnosticFee] = useState("");
  const [p4Tier, setP4Tier] = useState("full_service");
  const [phaseOverride, setPhaseOverride] = useState("");

  // Discount (shared policy — see discountPolicy.js)
  const [discountType, setDiscountType] = useState("none");
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAuthorizer, setDiscountAuthorizer] = useState("");
  const [discountAuthorizer2, setDiscountAuthorizer2] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  const selectedBand = BANDS.find(b => b.id === selectedBandId);
  const monthly = parseFloat(monthlyRate) || 0;
  const diagnosticApplies = selectedBandId === "band1" || selectedBandId === "band2";
  const diagnostic = diagnosticApplies ? (parseFloat(diagnosticFee) || 0) : 0;

  const discountTier = getDiscountTier(discountType);
  const actualDiscount = Math.min(discountPct / 100, discountTier.max);
  // Discount now actually reduces the billed rate — previously it was captured for the
  // record but never applied to monthlyRate, so the "final" number and the discount %
  // shown could silently disagree.
  const monthlyFinal = Math.round(monthly * (1 - actualDiscount));
  const discountAmount = monthly - monthlyFinal;
  const discountCheck = isDiscountAuthorized(discountType, discountAuthorizer, discountAuthorizer2, discountReason);

  const monthlyInRange = !selectedBand || (monthly >= selectedBand.min && monthly <= selectedBand.max);
  // Discount is authorized to bring the final rate down, but not below the band's own
  // floor — mirrors TierEngine's Floor Check. "Fix the scope, not the floor."
  const bandFloorCheck = !selectedBand || monthlyFinal >= selectedBand.min;

  const canSubmit = cimiScored && selectedBandId && monthlyRate && monthlyInRange && bandFloorCheck && discountCheck;

  const handleSubmit = async () => {
    const run = {
      event_id: event.id,
      event_name: event.name,
      client: event.client || "",
      operator,
      pillar: isHybrid ? "HYBRID" : "P4",
      engine: "advisory",
      cimi_scored: true,
      cimi_inputs: cimiInputs,
      cimi_avg: parseFloat(cimiAvg),
      maturity_band: maturityBand,
      recommended_phase: recommendedPhase,
      phase_confirmed: phaseOverride || recommendedPhase,
      retainer_band: selectedBandId,
      retainer_band_label: selectedBand?.label,
      monthly_rate_base: monthly,
      monthly_rate: monthlyFinal,
      diagnostic_fee: diagnostic,
      p4_tier: p4Tier,
      is_hybrid: isHybrid,
      hybrid_pillar: isHybrid ? hybridExecutionResult.pillar : null,
      hybrid_price: isHybrid ? hybridExecutionResult.final_price : null,
      hybrid_tier_log_id: isHybrid ? (hybridExecutionResult.id || null) : null,
      hybrid_group_id: hybridGroupId || null,
      discount_type: discountType,
      discount_pct: actualDiscount * 100,
      discount_amount: discountAmount,
      discount_authorizer: discountAuthorizer || null,
      discount_authorizer_2: discountTier.authorizers === 2 ? (discountAuthorizer2 || null) : null,
      discount_reason: discountReason || null,
      status: "pending",
      created_at: serverTimestamp(),
      revision: false,
      pipeline_id: pipelineId || null,
    };
    try {
      await addDoc(collection(db, "pricing_log"), run);
      onComplete();
    } catch (e) {
      console.error(e);
      alert("Error saving quote. Check console.");
    }
  };

  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← Back</button>
      <ContextBar event={event} isHybrid={isHybrid} />
      <StepBar steps={STEPS} current={step} />

      {step === 0 && (
        <StepCard title="CIMI Diagnostic" sub="Score each category 1–5 based on your discovery conversation. Do not score from assumptions — all 7 categories must be scored to proceed.">
          {GUIDES.cimiDiagnostic}
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,160,60,0.08)", border: "1px solid rgba(255,160,60,0.25)", fontSize: 12, color: theme.onSurface + "90", marginBottom: 16 }}>
            CIMI requires a real discovery conversation with the client. If you haven't completed one, stop here and schedule it first.
          </div>
          {GUIDES.cimiCategories}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {CIMI_CATS.map(c => (
              <div key={c.id} style={{ padding: "12px 14px", borderRadius: 8, background: theme.surface, border: `1px solid ${theme.primaryDark}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.onSurface }}>{c.label}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setCimiInputs(p => ({ ...p, [c.id]: n }))}
                        style={{
                          width: 32, height: 32, borderRadius: 6,
                          border: `1px solid ${cimiInputs[c.id] === n ? theme.accent : theme.primaryDark}`,
                          background: cimiInputs[c.id] === n ? theme.accent : "transparent",
                          color: cimiInputs[c.id] === n ? theme.primary : theme.onSurface + "80",
                          fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                        }}>{n}</button>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: theme.onSurface + "60" }}>{c.guide}</div>
              </div>
            ))}
          </div>

          {cimiScored && (
            <div style={{ padding: "14px 16px", borderRadius: 8, background: theme.accent + "10", border: `1px solid ${theme.accent + "30"}`, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <Stat label="CIMI Average" value={cimiAvg} />
                <Stat label="Maturity Band" value={maturityBand} />
                <Stat label="Recommended Phase" value={recommendedPhase} />
                <Stat label="Recommended Retainer" value={BANDS.find(b => b.id === recommendedBandId)?.label} />
              </div>
            </div>
          )}

          <NavRow onNext={() => setStep(1)} nextDisabled={!cimiScored} />
        </StepCard>
      )}

      {step === 1 && (
        <StepCard title="Phase & Band" sub="Confirm the engagement phase and select the retainer band. The recommendation is driven by the CIMI score — override only if scope discussion warrants it.">
          <div style={{ padding: "12px 16px", borderRadius: 8, background: theme.surface, border: `1px solid ${theme.primaryDark}`, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>CIMI Recommendation</div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
              <div><span style={{ color: theme.onSurface + "60" }}>CIMI: </span><strong style={{ color: theme.accent }}>{cimiAvg}</strong></div>
              <div><span style={{ color: theme.onSurface + "60" }}>Band: </span><strong style={{ color: theme.onSurface }}>{maturityBand}</strong></div>
              <div><span style={{ color: theme.onSurface + "60" }}>Phase: </span><strong style={{ color: theme.onSurface }}>{recommendedPhase}</strong></div>
            </div>
          </div>

          <Field label="Confirmed Phase">
            <input value={phaseOverride || recommendedPhase}
              onChange={e => setPhaseOverride(e.target.value)}
              style={inputStyle} />
          </Field>

          {GUIDES.retainerBand}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {BANDS.map(b => {
              const isRec = b.id === recommendedBandId;
              const isSel = selectedBandId === b.id;
              return (
                <div key={b.id} onClick={() => setSelectedBandId(b.id)} style={{
                  padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                  border: `${isSel ? "2px" : "1px"} solid ${isSel ? theme.accent : isRec ? theme.accent + "40" : theme.primaryDark}`,
                  background: isSel ? theme.accent + "10" : theme.surface, transition: "all 0.15s",
                  position: "relative",
                }}>
                  {isRec && (
                    <span style={{ position: "absolute", top: 10, right: 12, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: theme.accent + "25", color: theme.accent }}>
                      Recommended
                    </span>
                  )}
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 2, border: `2px solid ${isSel ? theme.accent : theme.onSurface + "40"}`, background: isSel ? theme.accent : "transparent" }} />
                    <div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: theme.onSurface }}>{b.label}</span>
                        <span style={{ fontSize: 13, color: theme.accent, fontWeight: 600 }}>{b.rate}</span>
                        <span style={{ fontSize: 11, color: theme.onSurface + "60" }}>CIMI {b.cimiRange} — {b.profile}</span>
                      </div>
                      <div style={{ fontSize: 12, color: theme.onSurface + "70" }}>{b.desc}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <NavRow onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!selectedBandId} />
        </StepCard>
      )}

      {step === 2 && (
        <StepCard title="Retainer Scope" sub="Enter the confirmed monthly rate, diagnostic fee if applicable, and P4 engagement tier.">
          <Field label={`Monthly Retainer Rate ($)${selectedBand ? ` — ${selectedBand.label} range: $${selectedBand.min.toLocaleString()}–$${selectedBand.max.toLocaleString()}` : ""}`} required>
            <input type="number" value={monthlyRate} onChange={e => setMonthlyRate(e.target.value)} style={inputStyle} placeholder="e.g. 4500" />
            {monthlyRate && !monthlyInRange && (
              <div style={{ fontSize: 11, color: "#e07070", marginTop: 4 }}>
                ${monthly.toLocaleString()} is outside {selectedBand?.label}'s documented range (${selectedBand?.min.toLocaleString()}–${selectedBand?.max.toLocaleString()}). Adjust the rate or pick a different band.
              </div>
            )}
          </Field>

          {diagnosticApplies && (
            <>
              <Field label={`Diagnostic Fee ($) — Phase 1 only (typical range $${DIAGNOSTIC_FEE_RANGE.min.toLocaleString()}–$${DIAGNOSTIC_FEE_RANGE.max.toLocaleString()})`}>
                <input type="number" value={diagnosticFee} onChange={e => setDiagnosticFee(e.target.value)} style={inputStyle} placeholder="2500–5000" />
              </Field>
              <div style={{ fontSize: 12, color: theme.onSurface + "60", marginBottom: 14, padding: "8px 12px", borderRadius: 6, background: theme.primaryDark + "40" }}>
                Diagnostic fee is a one-time charge in addition to the monthly retainer. It is not credited toward the retainer, and is not affected by any discount below.
              </div>
            </>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.onSurface + "80", marginBottom: 8 }}>P4 Engagement Tier</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {P4_TIERS.map(t => (
                <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${p4Tier === t.id ? theme.accent + "60" : theme.primaryDark}`,
                  background: p4Tier === t.id ? theme.accent + "08" : theme.surface }}>
                  <input type="radio" name="p4tier" value={t.id} checked={p4Tier === t.id} onChange={() => setP4Tier(t.id)} style={{ accentColor: theme.accent }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.onSurface }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: theme.onSurface + "60" }}>{t.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <NavRow onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!monthlyRate || !monthlyInRange} />
        </StepCard>
      )}

      {step === 3 && (
        <StepCard title="Hybrid Execution" sub={isHybrid
          ? "Execution pricing was pulled directly from a completed Tier Engine run. Advisory and execution remain separate line items — never blended."
          : "This is a standalone Pillar 4 advisory engagement — no execution component attached."}>
          {isHybrid ? (
            <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(100,180,255,0.3)" }}>
              <div style={{ padding: "10px 14px", background: "rgba(100,180,255,0.1)", fontSize: 12, fontWeight: 700, color: "#6ab4ff", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Execution Component ({hybridExecutionResult.pillar}) — Pulled from Tier Engine, Read-Only
              </div>
              {[
                ["Tier", hybridExecutionResult.tier],
                ["Execution Price", `$${(hybridExecutionResult.final_price || 0).toLocaleString()}`],
                ["Logged By", hybridExecutionResult.operator],
              ].map(([label, val], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", background: i % 2 === 0 ? theme.surface : theme.primaryDark + "30", fontSize: 13, color: theme.onSurface + "90" }}>
                  <span>{label}</span><span style={{ fontWeight: 600, color: theme.onSurface }}>{val}</span>
                </div>
              ))}
              <div style={{ padding: "8px 14px", fontSize: 11, color: theme.onSurface + "50", background: theme.surface }}>
                This number can't be edited here — it's the actual logged Tier Engine result (id: {hybridExecutionResult.id || "unknown"}). To change it, go back and re-run the Tier Engine.
              </div>
            </div>
          ) : (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: theme.primaryDark + "40", fontSize: 12, color: theme.onSurface + "70" }}>
              No execution component attached. To create a hybrid engagement, select "Hybrid" as the pillar before starting the engine — that runs the Tier Engine for the execution piece first and brings you here with the numbers already filled in. There's no way to manually attach execution pricing from inside the Advisory Engine anymore — it always has to come from a real, logged Tier Engine run.
            </div>
          )}
          <NavRow onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </StepCard>
      )}

      {step === 4 && (
        <StepCard title="Summary" sub="Review the complete advisory engagement package before submitting.">
          {/* Advisory summary */}
          <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.primaryDark}`, marginBottom: 16 }}>
            <div style={{ padding: "10px 14px", background: theme.accent + "15", fontSize: 12, fontWeight: 700, color: theme.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Advisory Retainer
            </div>
            {[
              ["CIMI Score", cimiAvg],
              ["Maturity Band", maturityBand],
              ["Phase", phaseOverride || recommendedPhase],
              ["Retainer Band", selectedBand?.label + " — " + selectedBand?.rate],
              ["Monthly Rate (before discount)", `$${monthly.toLocaleString()}`],
              actualDiscount > 0 && ["Discount", `-$${discountAmount.toLocaleString()} (${(actualDiscount * 100).toFixed(0)}% ${discountTier.label})`],
              ["Monthly Rate (final)", `$${monthlyFinal.toLocaleString()}`],
              diagnostic > 0 && ["Diagnostic Fee (one-time, not discounted)", `$${diagnostic.toLocaleString()}`],
              ["P4 Tier", P4_TIERS.find(t => t.id === p4Tier)?.label],
            ].filter(Boolean).map(([label, val], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", background: i % 2 === 0 ? theme.surface : theme.primaryDark + "30", fontSize: 13, color: theme.onSurface + "90" }}>
                <span>{label}</span><span style={{ fontWeight: label === "Monthly Rate (final)" ? 700 : 600, color: theme.onSurface }}>{val}</span>
              </div>
            ))}
          </div>

          {isHybrid && (
            <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(100,180,255,0.3)", marginBottom: 16 }}>
              <div style={{ padding: "10px 14px", background: "rgba(100,180,255,0.1)", fontSize: 12, fontWeight: 700, color: "#6ab4ff", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Execution Component ({hybridExecutionResult.pillar}) — Separate Line Item
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", background: theme.surface, fontSize: 13, color: theme.onSurface + "90" }}>
                <span>Execution Price</span><span style={{ fontWeight: 700, color: theme.onSurface }}>${(hybridExecutionResult.final_price || 0).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Discount */}
          <div style={{ padding: "16px", borderRadius: 8, background: theme.surface, border: `1px solid ${theme.primaryDark}`, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.onSurface + "80", marginBottom: 10 }}>Discount (optional)</div>
            <Field label="Discount Type">
              <select value={discountType} onChange={e => setDiscountType(e.target.value)} style={inputStyle}>
                {DISCOUNT_TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            {discountType !== "none" && (
              <>
                <Field label={`Discount % (max ${(discountTier.max * 100).toFixed(0)}%)`}>
                  <input type="number" value={discountPct} min={0} max={discountTier.max * 100}
                    onChange={e => setDiscountPct(Math.min(e.target.value, discountTier.max * 100))} style={inputStyle} />
                </Field>
                <Field label={discountTier.authorizers === 2 ? "Authorizing Founder #1" : "Authorizing Name"} required>
                  <input value={discountAuthorizer} onChange={e => setDiscountAuthorizer(e.target.value)} style={inputStyle} placeholder={discountTier.id === "ops" ? "Shanell Jefferson (or a Founder)" : "Ashley Glenn or Mikal Driver"} />
                </Field>
                {discountTier.authorizers === 2 && (
                  <Field label="Authorizing Founder #2 (must be the other Founder)" required>
                    <input value={discountAuthorizer2} onChange={e => setDiscountAuthorizer2(e.target.value)} style={inputStyle} placeholder="The other Founder" />
                  </Field>
                )}
                <Field label={`Reason for Discount (minimum ${DISCOUNT_REASON_MIN_LENGTH} characters)`} required>
                  <textarea value={discountReason} onChange={e => setDiscountReason(e.target.value)}
                    style={{ ...inputStyle, height: 60, resize: "vertical" }}
                    placeholder="Why is this discount warranted? e.g. budget constraint, competitive situation, strategic relationship..." />
                </Field>
              </>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ValidationBadge ok={monthlyInRange} label={monthlyInRange ? `Retainer Range Check: OK — within ${selectedBand?.label}` : "Retainer Range Check: FAIL — base rate is outside the selected band's range"} />
            <ValidationBadge ok={bandFloorCheck} label={bandFloorCheck ? "Discounted Rate Floor Check: OK" : `Discounted Rate Floor Check: FAIL — final rate is below ${selectedBand?.label}'s $${selectedBand?.min.toLocaleString()} floor`} />
            <ValidationBadge ok={discountCheck} label={discountCheck ? "Discount Check: OK" : "Discount Check: authorization required"} />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setStep(3)} style={secondaryBtnStyle}>← Back</button>
            <button onClick={handleSubmit} disabled={!canSubmit}
              style={{
                flex: 1, padding: "12px", borderRadius: 8, border: "none",
                cursor: canSubmit ? "pointer" : "not-allowed",
                background: canSubmit ? theme.accent : 'rgba(150,150,150,0.15)',
                color: canSubmit ? theme.primary : 'rgba(150,150,150,0.5)',
                fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              }}>
              {canSubmit ? "Submit & Log Quote →" : "Complete all required fields"}
            </button>
          </div>
        </StepCard>
      )}
    </div>
  );
}

// ─── Shared ────────────────────────────────────────────────────────
function ContextBar({ event, isHybrid }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 8, background: theme.surface, border: `1px solid ${theme.primaryDark}`, marginBottom: 20, fontSize: 13 }}>
      <span style={{ fontWeight: 700, color: theme.onSurface }}>{event?.name}</span>
      {event?.client && <span style={{ color: theme.onSurface + "60" }}>{event.client}</span>}
      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(180,100,255,0.15)", color: "#c080ff" }}>Advisory Engine</span>
      {isHybrid && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(100,180,255,0.15)", color: "#6ab4ff" }}>Hybrid</span>}
    </div>
  );
}

function StepBar({ steps, current }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 24, borderRadius: 8, overflow: "hidden", border: `1px solid ${theme.primaryDark}` }}>
      {steps.map((s, i) => (
        <div key={s} style={{
          flex: 1, padding: "8px 4px", textAlign: "center", fontSize: 11, fontWeight: 600,
          background: i === current ? theme.accent : i < current ? theme.accent + "30" : theme.surface,
          color: i === current ? theme.primary : i < current ? theme.accent : theme.onSurface + "50",
          borderRight: i < steps.length - 1 ? `1px solid ${theme.primaryDark}` : "none",
          transition: "all 0.2s",
        }}>{i < current ? "✓ " : ""}{s}</div>
      ))}
    </div>
  );
}

function StepCard({ title, sub, children }) {
  return (
    <div style={{ background: theme.surface, borderRadius: 12, border: `1px solid ${theme.primaryDark}`, padding: "24px 28px" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: theme.onSurface }}>{title}</h2>
        {sub && <p style={{ margin: "4px 0 0", fontSize: 12, color: theme.onSurface + "70" }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.onSurface + "80", marginBottom: 6 }}>
        {label}{required && <span style={{ color: theme.accent, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: theme.onSurface + "60", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: theme.onSurface }}>{value}</div>
    </div>
  );
}

function ValidationBadge({ ok, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6,
      background: ok ? "rgba(100,200,100,0.08)" : "rgba(255,80,80,0.08)",
      border: `1px solid ${ok ? "rgba(100,200,100,0.3)" : "rgba(255,80,80,0.3)"}`,
      fontSize: 12, color: ok ? "#6dbf6d" : "#e07070", fontWeight: 600,
    }}>
      <span>{ok ? "✓" : "✗"}</span> {label}
    </div>
  );
}

function NavRow({ onBack, onNext, nextDisabled }) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
      {onBack && <button onClick={onBack} style={secondaryBtnStyle}>← Back</button>}
      {onNext && (
        <button onClick={onNext} disabled={nextDisabled}
          style={{
            flex: 1, padding: "11px", borderRadius: 8, border: "none",
            cursor: nextDisabled ? "not-allowed" : "pointer",
            background: nextDisabled ? 'rgba(150,150,150,0.15)' : theme.accent,
            color: nextDisabled ? 'rgba(150,150,150,0.5)' : theme.primary,
            fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
          }}>Continue →</button>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${theme.primaryDark}`, background: theme.surface,
  color: theme.onSurface, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
  boxSizing: "border-box", outline: "none",
};

const backBtnStyle = {
  background: "transparent", border: "none", cursor: "pointer",
  fontSize: 12, color: theme.accent, fontWeight: 600, padding: "0 0 16px",
  fontFamily: "'DM Sans', sans-serif",
};

const secondaryBtnStyle = {
  padding: "11px 20px", borderRadius: 8, border: `1px solid ${theme.primaryDark}`,
  background: "transparent", color: theme.onSurface + "80",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
};