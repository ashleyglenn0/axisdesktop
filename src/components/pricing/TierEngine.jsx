import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { theme } from "../../theme";
import RiskLabor from "./RiskLabor";
import { Guide, GUIDES } from "./PricingGuide";

const STEPS = ["Intake", "Risk & Labor", "Tier", "CIMI", "Add-Ons", "Summary"];

const COMPLEXITY_QUESTIONS = [
  { id: "multi_zone", label: "Multi-zone floor layout", desc: "Event requires 3+ distinct operational zones with separate staffing" },
  { id: "vip_presence", label: "VIP or elevated-access presence", desc: "Event includes VIPs, speakers, or areas requiring credentialed access control" },
  { id: "public_facing", label: "Large public-facing component", desc: "Open registration or walk-up attendance with unpredictable crowd behavior" },
  { id: "multi_day", label: "Multi-day event", desc: "Event spans 2 or more operational days requiring shift continuity" },
  { id: "tight_timeline", label: "Tight planning timeline", desc: "Less than 60 days from engagement to event date" },
  { id: "new_venue", label: "New or unfamiliar venue", desc: "M&M has not operated at this venue before" },
  { id: "high_stakes", label: "High-stakes consequence", desc: "Operational failure would cause significant brand damage, safety risk, or revenue loss" },
];

const ADD_ONS = [
  { id: "vol_rec_low",    label: "Volunteer Recruitment",    level: "Low",      price: 6000 },
  { id: "vol_rec_med",    label: "Volunteer Recruitment",    level: "Medium",   price: 12000 },
  { id: "vol_rec_high",   label: "Volunteer Recruitment",    level: "High",     price: 18000 },
  { id: "app_rev_low",    label: "Application Review",       level: "Low",      price: 3000 },
  { id: "app_rev_high",   label: "Application Review",       level: "High",     price: 7000 },
  { id: "multi_loc_std",  label: "Multi-Location Coverage",  level: "Standard", price: 12000 },
  { id: "multi_loc_exp",  label: "Multi-Location Coverage",  level: "Expanded", price: 20000 },
  { id: "platform_std",   label: "Enhanced Platform (Axis)", level: "Standard", price: 8000 },
  { id: "platform_adv",   label: "Enhanced Platform (Axis)", level: "Advanced", price: 15000 },
  { id: "p4_infra",       label: "P4 Infrastructure",        level: "V1",       price: 5000 },
];

const ESCALATORS = [
  { id: "gov_civic",      label: "Government / Civic event",  mult: 1.20 },
  { id: "pub_safety_med", label: "Public Safety — Medium",    mult: 1.20 },
  { id: "pub_safety_high",label: "Public Safety — High",      mult: 1.35 },
  { id: "timeline_comp",  label: "Timeline Compression",      mult: 1.20 },
];

function getTier(count) {
  const n = parseInt(count) || 0;
  if (n <= 175) return { tier: "Tier 0", floor: 7000,  anchor: 9000,  note: "M&M staff only — internal crew, no volunteer recruitment" };
  if (n <= 299) return { tier: "Tier 1", floor: 15000, anchor: 20000, note: "Small external engagement — standard crew deployment" };
  if (n <= 599) return { tier: "Tier 2", floor: 30000, anchor: 35000, note: "Mid-size engagement — elevated complexity, full crew" };
  return           { tier: "Tier 3", floor: 55000, anchor: 65000, note: "Large / enterprise — full deployment, multi-zone" };
}

function getComplexityAdj(score) {
  if (score <= 5)  return { pct: 0,    label: "No adjustment" };
  if (score <= 12) return { pct: 0.15, label: "+15%" };
  if (score <= 20) return { pct: 0.30, label: "+30%" };
  return               { pct: 0.45, label: "+45%" };
}

function calcEscalators(selected) {
  return selected.reduce((acc, id) => {
    const e = ESCALATORS.find(x => x.id === id);
    return e ? acc * e.mult : acc;
  }, 1);
}

export default function TierEngine({ event, operator, pipelineId, onComplete, onBack }) {
  const [step, setStep] = useState(0);

  // Intake
  const [intake, setIntake] = useState({
    attendee_count: event?.attendee_count || "",
    location: event?.location || "",
    pillar: event?.pillar || "P1",
    p2_level: "L1",
    p3_tier: "P1",
  });

  // Risk & Labor
  const [riskLaborData, setRiskLaborData] = useState(null);

  // Labor reserve toggle
  const [laborIncluded, setLaborIncluded] = useState(true);

  // Complexity
  const [complexity, setComplexity] = useState({});
  const complexityScore = Object.values(complexity).filter(Boolean).length * 3;
  const cimiScore = parseInt(intake.cimi_score) || 0;
  const totalComplexityScore = complexityScore + cimiScore;
  const complexityAdj = getComplexityAdj(totalComplexityScore);

  // Tier
  const autoTier = getTier(intake.attendee_count);
  const [overrideTier, setOverrideTier] = useState(null);
  const [overrideFounder, setOverrideFounder] = useState("");
  const [overrideRationale, setOverrideRationale] = useState("");
  const activeTier = overrideTier || autoTier;
  const overrideValid = !overrideTier || (overrideFounder.trim().length > 0 && overrideRationale.trim().length >= 20);

  // CIMI
  const [scoreCIMI, setScoreCIMI] = useState(false);
  const [cimiInputs, setCimiInputs] = useState({});
  const CIMI_CATS = [
    { id: "workforce_model",       label: "Workforce Model" },
    { id: "recruitment_pipeline",  label: "Recruitment Pipeline" },
    { id: "volunteer_engagement",  label: "Volunteer Engagement" },
    { id: "accountability",        label: "Accountability Framework" },
    { id: "platform_systems",      label: "Platform & Systems" },
    { id: "leadership_capability", label: "Leadership Capability" },
    { id: "founder_dependency",    label: "Founder Dependency" },
  ];
  const cimiTotal = Object.values(cimiInputs).reduce((s, v) => s + (parseInt(v) || 0), 0);
  const cimiAvg = CIMI_CATS.length > 0 ? (cimiTotal / CIMI_CATS.length).toFixed(1) : 0;

  // Add-Ons & Escalators
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [selectedEscalators, setSelectedEscalators] = useState([]);
  const addOnTotal = selectedAddOns.reduce((s, id) => {
    const a = ADD_ONS.find(x => x.id === id);
    return s + (a?.price || 0);
  }, 0);
  const escalatorMult = calcEscalators(selectedEscalators);

  // Discount
  const [discountType, setDiscountType] = useState("none");
  const [discountPct, setDiscountPct] = useState(0);
  const [discountFounder, setDiscountFounder] = useState("");
  const [discountRationale, setDiscountRationale] = useState("");

  // ─── Calc chain ───────────────────────────────────────────────────
  const base = activeTier.anchor;
  const withComplexity = Math.round(base * (1 + complexityAdj.pct));
  const withEscalators = Math.round(withComplexity * escalatorMult);
  const withAddOns = withEscalators + addOnTotal;
  const maxDiscount = discountType === "strategic" ? 0.15 : discountType === "standard" ? 0.10 : 0;
  const actualDiscount = Math.min(discountPct / 100, maxDiscount);
  const discountAmount = Math.round(withAddOns * actualDiscount);

  // Client-facing total (what the client sees — no reserve)
  const clientTotal = Math.round(withAddOns * (1 - actualDiscount));

  // Labor reserve — only added if toggle is on
  const reserveAmount = laborIncluded ? (riskLaborData?.reserve_amount || 0) : 0;
  const reserveLabel  = laborIncluded ? (riskLaborData?.reserve_label || "") : "";

  // M&M gross engagement value (internal — client total + reserve)
  const grossEngagementValue = clientTotal + reserveAmount;

  // Final price saved to Firestore = client-facing total
  const finalPrice = clientTotal;

  const floorCheck    = finalPrice >= activeTier.floor;
  const discountCheck = discountType === "none" || discountFounder.trim().length > 0;
  const canSubmit     = floorCheck && discountCheck && overrideValid;

  const toggleAddOn = (id) => {
    const group = ADD_ONS.find(x => x.id === id)?.label;
    setSelectedAddOns(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      const withoutGroup = prev.filter(x => ADD_ONS.find(a => a.id === x)?.label !== group);
      return [...withoutGroup, id];
    });
  };

  const handleSubmit = async () => {
    const run = {
      event_id:              event.id,
      event_name:            event.name,
      client:                event.client || "",
      operator,
      pillar:                intake.pillar,
      engine:                "tier",
      tier:                  activeTier.tier,
      tier_override:         !!overrideTier,
      override_founder:      overrideFounder || null,
      override_rationale:    overrideRationale || null,
      attendee_count:        intake.attendee_count,
      complexity_score:      totalComplexityScore,
      complexity_adj:        complexityAdj.label,
      cimi_scored:           scoreCIMI,
      cimi_avg:              scoreCIMI ? parseFloat(cimiAvg) : null,
      add_ons:               selectedAddOns,
      add_on_total:          addOnTotal,
      escalators:            selectedEscalators,
      escalator_mult:        escalatorMult,
      discount_type:         discountType,
      discount_pct:          actualDiscount * 100,
      discount_amount:       discountAmount,
      discount_founder:      discountFounder || null,
      // Risk & Labor
      vri_score:             riskLaborData?.vri_score,
      vri_band:              riskLaborData?.vri_band,
      wrr_score:             riskLaborData?.wrr_score,
      wrr_band:              riskLaborData?.wrr_band,
      labor_included:        laborIncluded,
      reserve_level:         laborIncluded ? riskLaborData?.reserve_level : null,
      reserve_amount:        reserveAmount,
      reserve_label:         reserveLabel || null,
      projected_labor_cost:  laborIncluded ? riskLaborData?.projected_labor_cost : null,
      // Totals
      base_anchor:           base,
      client_total:          clientTotal,       // what the client sees
      final_price:           finalPrice,        // = client_total (for pipeline compatibility)
      gross_engagement_value: grossEngagementValue, // client_total + reserve (M&M internal)
      floor_check:           floorCheck ? "OK" : "FAIL",
      status:                "pending",
      created_at:            serverTimestamp(),
      revision:              false,
      pipeline_id:           pipelineId || null,
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
      <ContextBar event={event} pillar={intake.pillar} />
      <StepBar steps={STEPS} current={step} />

      {/* ── Step 0: Intake ── */}
      {step === 0 && (
        <StepCard title="Intake" sub="Enter event details. Fields pre-filled from the event record — confirm they're correct.">
          {GUIDES.intake}
          <Field label="Attendee Count" required>
            <input type="number" value={intake.attendee_count}
              onChange={e => setIntake(p => ({ ...p, attendee_count: e.target.value }))}
              style={inputStyle} placeholder="e.g. 500" />
          </Field>
          {intake.attendee_count && (() => {
            const preview = getTier(intake.attendee_count);
            return (
              <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 4,
                background: theme.accent + "10", border: `1px solid ${theme.accent + "30"}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, marginBottom: 2 }}>
                  {preview.tier} — {parseInt(intake.attendee_count).toLocaleString()} attendees
                </div>
                <div style={{ fontSize: 12, color: theme.onSurface + "70" }}>
                  {preview.note} · Floor ${preview.floor.toLocaleString()} · Anchor ${preview.anchor.toLocaleString()}
                </div>
              </div>
            );
          })()}
          <Field label="Location" required>
            <input value={intake.location}
              onChange={e => setIntake(p => ({ ...p, location: e.target.value }))}
              style={inputStyle} placeholder="City, State" />
          </Field>
          <Field label="Pillar">
            <select value={intake.pillar} onChange={e => setIntake(p => ({ ...p, pillar: e.target.value }))} style={inputStyle}>
              <option value="P1">Pillar 1 — Event Execution</option>
              <option value="P2">Pillar 2 — Leadership Training</option>
              <option value="P3">Pillar 3 — Co-Execution</option>
            </select>
          </Field>
          {intake.pillar === "P2" && (
            <Field label="Training Level">
              <select value={intake.p2_level} onChange={e => setIntake(p => ({ ...p, p2_level: e.target.value }))} style={inputStyle}>
                <option value="L1">L1 — Operational Foundations ($6,000)</option>
                <option value="L2">L2 — Leadership & Decision Systems ($12,000)</option>
              </select>
            </Field>
          )}
          {intake.pillar === "P3" && (
            <Field label="Co-Execution Tier">
              <select value={intake.p3_tier} onChange={e => setIntake(p => ({ ...p, p3_tier: e.target.value }))} style={inputStyle}>
                <option value="P1">P1 — Standard ($15,000 base + complexity)</option>
                <option value="P2">P2 — Elevated ($25,000 base + complexity)</option>
              </select>
            </Field>
          )}
          <NavRow onNext={() => setStep(1)} nextDisabled={!intake.attendee_count || !intake.location} />
        </StepCard>
      )}

      {/* ── Step 1: Risk & Labor ── */}
      {step === 1 && (
        <StepCard title="Risk and Labor" sub="Score all VRI and WRR factors before proceeding. These drive the labor reserve and feed into the final price.">
          <RiskLabor
            intake={intake}
            onComplete={(data) => { setRiskLaborData(data); setStep(2); }}
            onBack={() => setStep(0)}
          />
        </StepCard>
      )}

      {/* ── Step 2: Tier ── */}
      {step === 2 && (
        <StepCard title="Tier" sub="Tier is auto-selected from attendee count. Override requires Founder name and written rationale.">
          {GUIDES.tier}
          <div style={{
            padding: "16px 18px", borderRadius: 10, marginBottom: 16,
            background: theme.surface, border: `2px solid ${theme.accent + "60"}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              Auto-Selected Tier
            </div>
            <div style={{ display: "flex", gap: 24, marginBottom: 10 }}>
              <Stat label="Tier" value={autoTier.tier} />
              <Stat label="Floor" value={`$${autoTier.floor.toLocaleString()}`} />
              <Stat label="Base Anchor" value={`$${autoTier.anchor.toLocaleString()}`} />
              <Stat label="Attendees" value={intake.attendee_count} />
            </div>
            {autoTier.note && (
              <div style={{ fontSize: 12, color: theme.onSurface + "70", paddingTop: 8, borderTop: `1px solid ${theme.primaryDark}` }}>
                <strong style={{ color: theme.accent }}>Why this tier:</strong> {autoTier.note}. Tier is driven by attendee count —
                {parseInt(intake.attendee_count) <= 175 ? " ≤175 attendees = Tier 0." :
                 parseInt(intake.attendee_count) <= 299 ? " 176–299 attendees = Tier 1." :
                 parseInt(intake.attendee_count) <= 599 ? " 300–599 attendees = Tier 2." :
                 " 600+ attendees = Tier 3."}
                {" "}If this doesn't match the engagement scope, use the override below.
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: theme.onSurface }}>
              <input type="checkbox" checked={!!overrideTier}
                onChange={e => { if (!e.target.checked) setOverrideTier(null); else setOverrideTier(autoTier); }}
                style={{ accentColor: theme.accent }} />
              Override tier (Founder authorization required)
            </label>
          </div>

          {overrideTier && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px", borderRadius: 8, background: "rgba(255,60,60,0.05)", border: "1px solid rgba(255,60,60,0.2)", marginBottom: 16 }}>
              <Field label="Override to Tier" required>
                <select value={overrideTier.tier} onChange={e => {
                  const tiers = {
                    "Tier 0": { tier: "Tier 0", floor: 7000,  anchor: 9000 },
                    "Tier 1": { tier: "Tier 1", floor: 15000, anchor: 20000 },
                    "Tier 2": { tier: "Tier 2", floor: 30000, anchor: 35000 },
                    "Tier 3": { tier: "Tier 3", floor: 55000, anchor: 65000 },
                  };
                  setOverrideTier(tiers[e.target.value]);
                }} style={inputStyle}>
                  <option value="Tier 0">Tier 0 — ≤175 attendees — Floor $7,000</option>
                  <option value="Tier 1">Tier 1 — 176–299 attendees — Floor $15,000</option>
                  <option value="Tier 2">Tier 2 — 300–599 attendees — Floor $30,000</option>
                  <option value="Tier 3">Tier 3 — 600+ attendees — Floor $55,000</option>
                </select>
              </Field>
              <Field label="Founder Name" required>
                <input value={overrideFounder} onChange={e => setOverrideFounder(e.target.value)}
                  style={inputStyle} placeholder="Ashley Glenn or Mikal Driver" />
              </Field>
              <Field label="Override Rationale (minimum 20 characters)" required>
                <textarea value={overrideRationale} onChange={e => setOverrideRationale(e.target.value)}
                  style={{ ...inputStyle, height: 80, resize: "vertical" }}
                  placeholder="Explain why the auto-selected tier does not reflect the true scope of this engagement..." />
              </Field>
              {overrideValid
                ? <ValidationBadge ok label="Override validated" />
                : <ValidationBadge ok={false} label="Founder name and rationale (20+ chars) required" />
              }
            </div>
          )}
          <NavRow onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!overrideValid} />
        </StepCard>
      )}

      {/* ── Step 3: CIMI ── */}
      {step === 3 && (
        <StepCard title="CIMI — Optional" sub="Client Infrastructure Maturity Index. Recommended for all engagements — required for Pillar 4.">
          {GUIDES.cimi}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: theme.onSurface, marginBottom: 16 }}>
            <input type="checkbox" checked={scoreCIMI} onChange={e => setScoreCIMI(e.target.checked)} style={{ accentColor: theme.accent }} />
            Score CIMI for this engagement
          </label>

          {scoreCIMI && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {CIMI_CATS.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: theme.surface, border: `1px solid ${theme.primaryDark}` }}>
                  <span style={{ flex: 1, fontSize: 13, color: theme.onSurface }}>{c.label}</span>
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
              ))}
              <div style={{ padding: "12px 14px", borderRadius: 8, background: theme.accent + "10", border: `1px solid ${theme.accent + "30"}`, marginTop: 4 }}>
                <div style={{ fontSize: 12, color: theme.onSurface + "80" }}>
                  CIMI Average: <strong style={{ color: theme.accent }}>{cimiAvg}</strong>
                  {" · "}
                  {parseFloat(cimiAvg) < 2.4 ? "Foundational" : parseFloat(cimiAvg) < 3.5 ? "Structural Gaps / Maturing" : parseFloat(cimiAvg) < 4.5 ? "Maturing" : "Embedded Partner"}
                </div>
              </div>
            </div>
          )}

          {!scoreCIMI && (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: theme.primaryDark + "40", fontSize: 12, color: theme.onSurface + "70", marginBottom: 16 }}>
              Skipping CIMI. Note: a low CIMI client in a Pillar 1 execution is your highest risk engagement. Score when you have discovery data.
            </div>
          )}
          <NavRow onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </StepCard>
      )}

      {/* ── Step 4: Add-Ons & Escalators ── */}
      {step === 4 && (
        <StepCard title="Add-Ons & Escalators" sub="Select applicable add-ons. Escalators compound — confirm each applies before selecting.">
          <h3 style={{ fontSize: 13, fontWeight: 700, color: theme.onSurface + "90", margin: "0 0 10px" }}>Add-Ons</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {ADD_ONS.map(a => (
              <label key={a.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                borderRadius: 8, cursor: "pointer",
                border: `1px solid ${selectedAddOns.includes(a.id) ? theme.accent + "60" : theme.primaryDark}`,
                background: selectedAddOns.includes(a.id) ? theme.accent + "08" : theme.surface,
                transition: "all 0.15s",
              }}>
                <input type="checkbox" checked={selectedAddOns.includes(a.id)} onChange={() => toggleAddOn(a.id)} style={{ accentColor: theme.accent }} />
                <span style={{ flex: 1, fontSize: 13, color: theme.onSurface }}>{a.label} — {a.level}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.accent }}>${a.price.toLocaleString()}</span>
              </label>
            ))}
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 700, color: theme.onSurface + "90", margin: "0 0 10px" }}>Escalators</h3>
          <div style={{ fontSize: 12, color: theme.onSurface + "60", marginBottom: 10 }}>Multipliers compound — they do not add. 1.20× × 1.20× = 1.44×</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {ESCALATORS.map(e => (
              <label key={e.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                borderRadius: 8, cursor: "pointer",
                border: `1px solid ${selectedEscalators.includes(e.id) ? "rgba(255,100,100,0.4)" : theme.primaryDark}`,
                background: selectedEscalators.includes(e.id) ? "rgba(255,100,100,0.06)" : theme.surface,
                transition: "all 0.15s",
              }}>
                <input type="checkbox" checked={selectedEscalators.includes(e.id)}
                  onChange={() => setSelectedEscalators(p => p.includes(e.id) ? p.filter(x => x !== e.id) : [...p, e.id])}
                  style={{ accentColor: theme.accent }} />
                <span style={{ flex: 1, fontSize: 13, color: theme.onSurface }}>{e.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e07070" }}>{e.mult}×</span>
              </label>
            ))}
          </div>

          {escalatorMult > 1 && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.2)", fontSize: 12, color: theme.onSurface + "90", marginBottom: 16 }}>
              Combined escalator: <strong>{escalatorMult.toFixed(4)}×</strong>
            </div>
          )}
          <NavRow onBack={() => setStep(3)} onNext={() => setStep(5)} />
        </StepCard>
      )}

      {/* ── Step 5: Summary ── */}
      {step === 5 && (
        <StepCard title="Final Summary" sub="Review all checks before submitting. Floor Check and Discount Check must both pass.">
          {GUIDES.summary}

          {/* ── Labor Reserve Toggle ── */}
          <div style={{
            padding: "14px 16px", borderRadius: 10, marginBottom: 20,
            background: laborIncluded ? theme.accent + "08" : theme.primaryDark + "40",
            border: `1px solid ${laborIncluded ? theme.accent + "40" : theme.primaryDark}`,
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: laborIncluded ? theme.accent : theme.onSurface + "60", marginBottom: 4 }}>
                Labor Reserve
              </div>
              <div style={{ fontSize: 12, color: theme.onSurface + "70" }}>
                {laborIncluded
                  ? riskLaborData?.reserve_amount > 0
                    ? `${riskLaborData.reserve_label} — $${riskLaborData.reserve_amount.toLocaleString()} added to M&M gross value (not billed to client)`
                    : "No reserve required based on VRI/WRR scoring"
                  : "Labor reserve excluded — client is sourcing their own workforce. Generate a Third-Party Staffing Waiver."}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.onSurface + "70" }}>
                {laborIncluded ? "Included" : "Excluded"}
              </span>
              <div
                onClick={() => setLaborIncluded(p => !p)}
                style={{
                  width: 40, height: 22, borderRadius: 11, cursor: "pointer", transition: "all 0.2s",
                  background: laborIncluded ? theme.accent : theme.primaryDark,
                  position: "relative",
                }}>
                <div style={{
                  position: "absolute", top: 3, left: laborIncluded ? 21 : 3,
                  width: 16, height: 16, borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }} />
              </div>
            </label>
          </div>

          {/* ── Price Breakdown ── */}
          <div style={{ marginBottom: 20, borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.primaryDark}` }}>

            {/* Client-facing section header */}
            <div style={{ padding: "8px 16px", background: theme.primaryDark + "60", borderBottom: `1px solid ${theme.primaryDark}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: theme.onSurface + "60", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Client-Facing Breakdown
              </span>
            </div>

            {[
              { label: "Base Anchor", sub: activeTier.tier, value: `$${base.toLocaleString()}` },
              complexityAdj.pct > 0 && { label: "Complexity Adjustment", sub: complexityAdj.label, value: `$${withComplexity.toLocaleString()}` },
              escalatorMult > 1 && { label: "Escalators", sub: `${escalatorMult.toFixed(4)}×`, value: `$${withEscalators.toLocaleString()}` },
              addOnTotal > 0 && { label: "Add-Ons", sub: selectedAddOns.map(id => ADD_ONS.find(a => a.id === id)?.label).filter(Boolean).join(", "), value: `+$${addOnTotal.toLocaleString()}` },
              actualDiscount > 0 && { label: "Discount", sub: `${(actualDiscount * 100).toFixed(0)}% ${discountType}`, value: `-$${discountAmount.toLocaleString()}`, negative: true },
            ].filter(Boolean).map((row, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 16px",
                background: i % 2 === 0 ? theme.surface : theme.primaryDark + "30",
                borderBottom: `1px solid ${theme.primaryDark}`,
              }}>
                <div>
                  <div style={{ fontSize: 13, color: theme.onSurface + "90" }}>{row.label}</div>
                  {row.sub && <div style={{ fontSize: 11, color: theme.onSurface + "50", marginTop: 1 }}>{row.sub}</div>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: row.negative ? "#e07070" : theme.onSurface + "90" }}>{row.value}</span>
              </div>
            ))}

            {/* Client Total */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 16px", background: theme.accent + "15",
              borderBottom: laborIncluded && reserveAmount > 0 ? `2px solid ${theme.primaryDark}` : "none",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: theme.onSurface }}>Client Total</div>
                <div style={{ fontSize: 11, color: theme.onSurface + "60", marginTop: 1 }}>This is what the client sees on the proposal</div>
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: theme.accent }}>${clientTotal.toLocaleString()}</span>
            </div>

            {/* M&M Internal section — only shown if labor is included and reserve > 0 */}
            {laborIncluded && reserveAmount > 0 && (
              <>
                <div style={{ padding: "8px 16px", background: theme.primaryDark + "60", borderBottom: `1px solid ${theme.primaryDark}` }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: theme.onSurface + "60", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    M&M Internal — Not Billed to Client
                  </span>
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 16px", background: theme.surface,
                  borderBottom: `1px solid ${theme.primaryDark}`,
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: theme.onSurface + "90" }}>Labor Reserve</div>
                    {reserveLabel && <div style={{ fontSize: 11, color: theme.onSurface + "50", marginTop: 1 }}>{reserveLabel}</div>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.onSurface + "90" }}>+${reserveAmount.toLocaleString()}</span>
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 16px", background: "rgba(100,180,255,0.08)",
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: theme.onSurface }}>M&M Gross Engagement Value</div>
                    <div style={{ fontSize: 11, color: theme.onSurface + "60", marginTop: 1 }}>Client total + labor reserve — internal tracking only</div>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#6ab4ff" }}>${grossEngagementValue.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>

          {/* Waiver notice when labor excluded */}
          {!laborIncluded && (
            <div style={{
              padding: "12px 14px", borderRadius: 8, marginBottom: 20,
              background: "rgba(255,160,60,0.08)", border: "1px solid rgba(255,160,60,0.3)",
              fontSize: 12, color: theme.onSurface + "90",
            }}>
              <strong style={{ color: "#e09030" }}>⚠ Third-Party Staffing Waiver required.</strong>{" "}
              Labor reserve excluded. Generate the waiver from the Document Generator before this engagement is activated. M&M's liability for workforce outcomes is limited to M&M-managed roles only.
            </div>
          )}

          {/* Validation checks */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            <ValidationBadge ok={floorCheck}
              label={floorCheck
                ? `Floor Check: OK — $${clientTotal.toLocaleString()} ≥ $${activeTier.floor.toLocaleString()} floor`
                : `Floor Check: FAIL — $${clientTotal.toLocaleString()} is below $${activeTier.floor.toLocaleString()} floor. Fix the scope.`} />
            <ValidationBadge ok={discountCheck}
              label={discountCheck ? "Discount Check: OK" : "Discount Check: Founder name required for discount"} />
            {overrideTier && (
              <ValidationBadge ok={overrideValid}
                label={overrideValid ? "Override: Validated" : "Override: Incomplete — Founder name and rationale required"} />
            )}
          </div>

          {/* Discount */}
          {GUIDES.introductory}
          <div style={{ padding: "16px", borderRadius: 8, background: theme.surface, border: `1px solid ${theme.primaryDark}`, marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.onSurface + "80", marginBottom: 10 }}>Discount (optional)</div>
            <Field label="Discount Type">
              <select value={discountType} onChange={e => setDiscountType(e.target.value)} style={inputStyle}>
                <option value="none">No discount</option>
                <option value="standard">Standard (≤10%) — Founder review</option>
                <option value="strategic">Strategic (≤15%) — Founder only</option>
              </select>
            </Field>
            {discountType !== "none" && (
              <>
                <Field label={`Discount % (max ${discountType === "strategic" ? "15" : "10"}%)`}>
                  <input type="number" value={discountPct} min={0} max={discountType === "strategic" ? 15 : 10}
                    onChange={e => setDiscountPct(Math.min(e.target.value, discountType === "strategic" ? 15 : 10))}
                    style={inputStyle} />
                </Field>
                <Field label="Authorizing Founder" required>
                  <input value={discountFounder} onChange={e => setDiscountFounder(e.target.value)}
                    style={inputStyle} placeholder="Ashley Glenn or Mikal Driver" />
                </Field>
                {discountType === "strategic" && (
                  <Field label="Rationale">
                    <textarea value={discountRationale} onChange={e => setDiscountRationale(e.target.value)}
                      style={{ ...inputStyle, height: 60, resize: "vertical" }} placeholder="Why is a strategic discount warranted?" />
                  </Field>
                )}
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(4)} style={secondaryBtnStyle}>← Back</button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                flex: 1, padding: "12px", borderRadius: 8, border: "none",
                cursor: canSubmit ? "pointer" : "not-allowed",
                background: canSubmit ? theme.accent : 'rgba(150,150,150,0.15)',
                color: canSubmit ? theme.primary : 'rgba(150,150,150,0.5)',
                fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              }}>
              {canSubmit ? "Submit & Log Quote →" : "Complete all checks to submit"}
            </button>
          </div>
        </StepCard>
      )}
    </div>
  );
}

// ─── Shared sub-components ─────────────────────────────────────────
function ContextBar({ event, pillar }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 8, background: theme.surface, border: `1px solid ${theme.primaryDark}`, marginBottom: 20, fontSize: 13 }}>
      <span style={{ fontWeight: 700, color: theme.onSurface }}>{event?.name}</span>
      {event?.client && <span style={{ color: theme.onSurface + "60" }}>{event.client}</span>}
      {pillar && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: theme.accent + "20", color: theme.accent }}>Pillar {pillar.replace("P", "")}</span>}
      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(100,180,255,0.15)", color: "#6ab4ff" }}>Tier Engine</span>
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
      <div style={{ fontSize: 15, fontWeight: 700, color: theme.onSurface }}>{value}</div>
    </div>
  );
}

function ValidationBadge({ ok, label }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6,
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