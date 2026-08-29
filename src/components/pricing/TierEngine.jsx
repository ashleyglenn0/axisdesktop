import { useState, useEffect } from "react";
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { theme } from "../../theme";
import RiskLabor from "./RiskLabor";
import { Guide, GUIDES } from "./PricingGuide";
import { DISCOUNT_TIERS, getDiscountTier, isDiscountAuthorized, DISCOUNT_REASON_MIN_LENGTH } from "./discountPolicy";

const STEP_LABELS = { intake: "Intake", risk_labor: "Risk & Labor", tier: "Tier", cimi: "CIMI", addons: "Add-Ons", summary: "Summary" };

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

// Flat-rate pricing for P2/P3 — matches MM_TierEngine_QuickRef_v2.1 "Pillar 2 & 3 Pricing" table.
const P2_PRICING = { L1: 6000, L2: 12000 };
const P3_PRICING = { P1: 15000, P2: 25000 };

// Introductory Pricing — pre-launch phase only. Sunsets automatically after INTRO_CLIENT_LIMIT
// real (Active/Closed) clients.
const INTRO_CLIENT_LIMIT = 10;
const INTRO_TIER_PCT = { "Tier 0": 20, "Tier 1": 18, "Tier 2": 16, "Tier 3": 15 };
const INTRO_DEFAULT_PCT = 15;
const INTRO_PACKAGING_BONUS = 2;
const INTRO_MAX_PCT = 20;
const INTRO_MIN_PCT = 10;

function getIntroSuggestedPct(tierLabel, addOnCount) {
  let pct = INTRO_TIER_PCT[tierLabel] ?? INTRO_DEFAULT_PCT;
  if (addOnCount >= 2) pct += INTRO_PACKAGING_BONUS;
  return Math.min(pct, INTRO_MAX_PCT);
}

function getTier(count) {
  const n = parseInt(count) || 0;
  if (n <= 175) return { tier: "Tier 0", floor: 7000,  anchor: 9000,  note: "M&M staff only — internal crew, no volunteer recruitment" };
  if (n <= 299) return { tier: "Tier 1", floor: 15000, anchor: 20000, note: "Small external engagement — standard crew deployment" };
  if (n <= 599) return { tier: "Tier 2", floor: 30000, anchor: 35000, note: "Mid-size engagement — elevated complexity, full crew" };
  return           { tier: "Tier 3", floor: 55000, anchor: 65000, note: "Large / enterprise — full deployment, multi-zone" };
}

// P2 pricing — hybrid model per Ashley's decision: flat curriculum rate (L1/L2) stays the
// base, banded headcount adjustments layer on top for group size, and a per-head overage
// rate kicks in for very large cohorts where banding alone doesn't scale sensibly.
// These are proposed starting numbers, not pulled from an existing doc — tune freely.
const P2_INCLUDED_HEADCOUNT = 15; // covered by the flat rate at either level, no adjustment
const P2_HEADCOUNT_BANDS = [
  { max: 15,       pct: 0,    label: "1–15 — included in flat rate" },
  { max: 30,       pct: 0.25, label: "16–30 — +25%" },
  { max: 50,       pct: 0.50, label: "31–50 — +50%" },
  { max: Infinity, pct: 0.50, label: "51+ — +50% plus per-head overage" },
];
const P2_OVERAGE_PER_HEAD = 150; // applied to each person beyond 50, on top of the +50% band

function getP2HeadcountBand(n) {
  return P2_HEADCOUNT_BANDS.find(b => n <= b.max) || P2_HEADCOUNT_BANDS[P2_HEADCOUNT_BANDS.length - 1];
}

function getP2Price(level, headcountRaw) {
  const base = P2_PRICING[level] ?? P2_PRICING.L1;
  const n = Math.max(0, parseInt(headcountRaw) || 0);
  const band = getP2HeadcountBand(n);
  let price = Math.round(base * (1 + band.pct));
  const overageHeads = n > 50 ? n - 50 : 0;
  if (overageHeads > 0) price += overageHeads * P2_OVERAGE_PER_HEAD;
  return { price, band, overageHeads };
}

function getBaseForPillar(pillar, intake) {
  if (pillar === "P2") {
    const level = intake.p2_level || "L1";
    const { price, band, overageHeads } = getP2Price(level, intake.p2_headcount);
    const n = Math.max(0, parseInt(intake.p2_headcount) || 0);
    return {
      tier: `Pillar 2 — ${level}`,
      floor: price,
      anchor: price,
      note: `${level === "L2" ? "Leadership & Decision Systems" : "Operational Foundations"} — priced for ${n || 0} leaders/employees (${band.label}${overageHeads > 0 ? `, +${overageHeads} over 50 at $${P2_OVERAGE_PER_HEAD}/head` : ""}). No live event — Risk & Labor is skipped for standalone P2.`,
    };
  }
  if (pillar === "P3") {
    const tierLevel = intake.p3_tier || "P1";
    const price = P3_PRICING[tierLevel] ?? P3_PRICING.P1;
    return {
      tier: `Pillar 3 — ${tierLevel}`,
      floor: price,
      anchor: price,
      note: tierLevel === "P2"
        ? "Joint planning at elevated complexity. Base rate — complexity multiplier applies on top."
        : "Joint planning at standard complexity. Base rate — complexity multiplier applies on top.",
    };
  }
  return getTier(intake.attendee_count);
}

function getComplexityAdj(score) {
  if (score <= 5)  return { pct: 0,    label: "No adjustment" };
  if (score <= 12) return { pct: 0.15, label: "+15%" };
  if (score <= 20) return { pct: 0.30, label: "+30%" };
  return               { pct: 0.45, label: "+45%" };
}

function getCimiModifier(avg) {
  if (avg >= 4.0) return 0;
  if (avg >= 3.0) return 2;
  if (avg >= 2.0) return 4;
  return 6;
}

function calcEscalators(selected) {
  return selected.reduce((acc, id) => {
    const e = ESCALATORS.find(x => x.id === id);
    return e ? acc * e.mult : acc;
  }, 1);
}

// event: the selected event/pipeline record
// initialPillar: pillar chosen in Pricing.jsx's PillarConfigurator — was previously ignored
//   entirely; intake.pillar silently fell back to event?.pillar regardless of what the
//   operator picked on the previous screen. Now honored as the primary source.
// hybridMode: true when this Tier Engine run is the execution component of a Hybrid
//   engagement (Pricing.jsx routes here first for Hybrid before Advisory Engine).
// hybridGroupId: shared id linking this run's pricing_log entry to the Advisory Engine
//   entry that will follow it, so the two can be queried/traced together later.
// onHybridComplete: called instead of onComplete when hybridMode is true — hands the full
//   logged run object up to Pricing.jsx, which then opens Advisory Engine pre-filled with it.
export default function TierEngine({ event, operator, pipelineId, initialPillar, hybridMode, hybridGroupId, onComplete, onHybridComplete, onBack }) {
  const [intake, setIntake] = useState({
    attendee_count: event?.attendee_count || "",
    location: event?.location || "",
    pillar: initialPillar || event?.pillar || "P1",
    p2_level: "L1",
    p2_headcount: "",
    p3_tier: "P1",
  });

  // Standalone P2 (Leadership Training, no paired live event) skips Risk & Labor entirely —
  // that step exists to price live-event volunteer/staffing risk, which doesn't apply to a
  // training-only engagement. P1 and P3 both involve a real event on the ground, so they
  // keep the full flow. (There's no "P2 as an add-on to P1" path yet — that's part of the
  // future package/bundle redesign, not built here — so for now P2 is always this case.)
  const p2Standalone = intake.pillar === "P2";
  const STEP_KEYS = p2Standalone
    ? ["intake", "tier", "cimi", "addons", "summary"]
    : ["intake", "risk_labor", "tier", "cimi", "addons", "summary"];
  const STEPS = STEP_KEYS.map(k => STEP_LABELS[k]);

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEP_KEYS[Math.min(stepIdx, STEP_KEYS.length - 1)];
  const goToKey = (key) => {
    const idx = STEP_KEYS.indexOf(key);
    setStepIdx(idx >= 0 ? idx : 0);
  };
  const nextStep = () => setStepIdx(i => Math.min(i + 1, STEP_KEYS.length - 1));
  const prevStep = () => setStepIdx(i => Math.max(i - 1, 0));

  const [riskLaborData, setRiskLaborData] = useState(null);
  const [laborIncluded, setLaborIncluded] = useState(true);

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

  const [complexity, setComplexity] = useState({});
  const complexityApplies = intake.pillar !== "P2"; // event-complexity questions (venue, VIP, timeline) don't apply to training-only P2
  const complexityScore = complexityApplies ? Object.values(complexity).filter(Boolean).length * 3 : 0;
  const cimiScore = scoreCIMI ? getCimiModifier(parseFloat(cimiAvg)) : 0;
  const totalComplexityScore = complexityScore + cimiScore;
  const complexityAdj = getComplexityAdj(totalComplexityScore);

  const autoTier = getBaseForPillar(intake.pillar, intake);
  const [overrideTier, setOverrideTier] = useState(null);
  const [overrideFounder, setOverrideFounder] = useState("");
  const [overrideRationale, setOverrideRationale] = useState("");
  const activeTier = overrideTier || autoTier;
  const overrideValid = !overrideTier || (overrideFounder.trim().length > 0 && overrideRationale.trim().length >= 20);
  const isAttendeeTiered = intake.pillar === "P1";

  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [selectedEscalators, setSelectedEscalators] = useState([]);
  const addOnTotal = selectedAddOns.reduce((s, id) => {
    const a = ADD_ONS.find(x => x.id === id);
    return s + (a?.price || 0);
  }, 0);
  const escalatorMult = calcEscalators(selectedEscalators);

  // ── Pillar 2 as an add-on to a Pillar 1 engagement ─────────────────
  // Only offered when the base pillar is P1. Uses the same hybrid headcount pricing model
  // as standalone P2, but folds straight into this same quote/log entry as a line item —
  // no separate CIMI/Risk & Labor run needed, since Risk & Labor already ran for the P1
  // component of this same engagement.
  const [p2AddOnEnabled, setP2AddOnEnabled] = useState(false);
  const [p2AddOnLevel, setP2AddOnLevel] = useState("L1");
  const [p2AddOnHeadcount, setP2AddOnHeadcount] = useState("");
  const p2AddOnAvailable = intake.pillar === "P1";
  const p2AddOnActive = p2AddOnAvailable && p2AddOnEnabled;
  const p2AddOn = p2AddOnActive ? getP2Price(p2AddOnLevel, p2AddOnHeadcount) : null;
  const p2AddOnPrice = p2AddOn?.price || 0;
  const p2AddOnValid = !p2AddOnActive || !!p2AddOnHeadcount;

  // ── Introductory Pricing ──────────────────────────────────────────
  const [realClientCount, setRealClientCount] = useState(null);
  const [loadingClientCount, setLoadingClientCount] = useState(true);

  useEffect(() => {
    const fetchClientCount = async () => {
      try {
        const snap = await getDocs(collection(db, "pricing_log"));
        const closedStatuses = ["active", "closed"];
        const clients = new Set();
        snap.docs.forEach(d => {
          const data = d.data();
          const status = String(data.status || "").toLowerCase();
          if (closedStatuses.includes(status) && data.client) {
            clients.add(data.client);
          }
        });
        setRealClientCount(clients.size);
      } catch (e) {
        console.error("Failed to fetch client count for intro pricing eligibility:", e);
        setRealClientCount(null);
      } finally {
        setLoadingClientCount(false);
      }
    };
    fetchClientCount();
  }, []);

  const introEligible = !loadingClientCount && realClientCount !== null && realClientCount < INTRO_CLIENT_LIMIT;
  const [introPricingEnabled, setIntroPricingEnabled] = useState(false);
  const [introPctOverride, setIntroPctOverride] = useState(null);
  const suggestedIntroPct = getIntroSuggestedPct(activeTier.tier, selectedAddOns.length);
  const introActive = introPricingEnabled && introEligible;
  const effectiveIntroPct = introActive ? (introPctOverride ?? suggestedIntroPct) : 0;

  // ── Discount (shared policy — see discountPolicy.js) ──────────────
  // Mutually exclusive with Introductory Pricing.
  const [discountType, setDiscountType] = useState("none");
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAuthorizer, setDiscountAuthorizer] = useState("");
  const [discountAuthorizer2, setDiscountAuthorizer2] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const discountTier = getDiscountTier(discountType);

  // ─── Calc chain ───────────────────────────────────────────────────
  const base = activeTier.anchor;
  const withComplexity = Math.round(base * (1 + complexityAdj.pct));
  const withEscalators = Math.round(withComplexity * escalatorMult);
  const withAddOns = withEscalators + addOnTotal + p2AddOnPrice;
  const maxDiscount = introActive ? 0 : discountTier.max;
  const actualDiscount = introActive ? (effectiveIntroPct / 100) : Math.min(discountPct / 100, maxDiscount);
  const discountAmount = Math.round(withAddOns * actualDiscount);

  const clientTotal = Math.round(withAddOns * (1 - actualDiscount));

  const reserveAmount = laborIncluded ? (riskLaborData?.reserve_amount || 0) : 0;
  const reserveLabel  = laborIncluded ? (riskLaborData?.reserve_label || "") : "";
  const grossEngagementValue = clientTotal + reserveAmount;
  const finalPrice = clientTotal;

  const floorCheck    = finalPrice >= activeTier.floor;
  const discountCheck = introActive || isDiscountAuthorized(discountType, discountAuthorizer, discountAuthorizer2, discountReason);
  const canSubmit     = floorCheck && discountCheck && overrideValid && p2AddOnValid;

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
      p2_level:              intake.pillar === "P2" ? intake.p2_level : null,
      p2_headcount:          intake.pillar === "P2" ? (parseInt(intake.p2_headcount) || 0) : null,
      p3_tier:               intake.pillar === "P3" ? intake.p3_tier : null,
      complexity_inputs:     complexityApplies ? complexity : null,
      complexity_score:      totalComplexityScore,
      complexity_adj:        complexityAdj.label,
      cimi_scored:           scoreCIMI,
      cimi_avg:              scoreCIMI ? parseFloat(cimiAvg) : null,
      cimi_modifier_applied: cimiScore,
      add_ons:               selectedAddOns,
      add_on_total:          addOnTotal,
      p2_addon_applied:      p2AddOnActive,
      p2_addon_level:        p2AddOnActive ? p2AddOnLevel : null,
      p2_addon_headcount:    p2AddOnActive ? (parseInt(p2AddOnHeadcount) || 0) : null,
      p2_addon_price:        p2AddOnPrice,
      escalators:            selectedEscalators,
      escalator_mult:        escalatorMult,
      intro_pricing_applied: introActive,
      intro_pricing_pct:     introActive ? effectiveIntroPct : null,
      real_client_count_at_quote: realClientCount,
      discount_type:         introActive ? "none" : discountType,
      discount_pct:          actualDiscount * 100,
      discount_amount:       discountAmount,
      discount_authorizer:   introActive ? null : (discountAuthorizer || null),
      discount_authorizer_2: (!introActive && discountTier.authorizers === 2) ? (discountAuthorizer2 || null) : null,
      discount_reason:       introActive ? null : (discountReason || null),
      vri_score:             riskLaborData?.vri_score ?? null,
      vri_band:              riskLaborData?.vri_band ?? null,
      wrr_score:             riskLaborData?.wrr_score ?? null,
      wrr_band:              riskLaborData?.wrr_band ?? null,
      labor_included:        p2Standalone ? false : laborIncluded,
      reserve_level:         (!p2Standalone && laborIncluded) ? (riskLaborData?.reserve_level ?? null) : null,
      reserve_amount:        reserveAmount,
      reserve_label:         reserveLabel || null,
      projected_labor_cost:  (!p2Standalone && laborIncluded) ? (riskLaborData?.projected_labor_cost ?? null) : null,
      base_anchor:           base,
      client_total:          clientTotal,
      final_price:           finalPrice,
      gross_engagement_value: grossEngagementValue,
      floor_check:           floorCheck ? "OK" : "FAIL",
      status:                "pending",
      created_at:            serverTimestamp(),
      revision:              false,
      pipeline_id:           pipelineId || null,
      hybrid_group_id:       hybridGroupId || null,
    };
    try {
      const docRef = await addDoc(collection(db, "pricing_log"), run);
      const logged = { ...run, id: docRef.id };
      if (hybridMode && onHybridComplete) {
        onHybridComplete(logged);
      } else {
        onComplete();
      }
    } catch (e) {
      console.error(e);
      alert("Error saving quote. Check console.");
    }
  };

  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← Back</button>
      <ContextBar event={event} pillar={intake.pillar} hybridMode={hybridMode} />
      <StepBar steps={STEPS} current={stepIdx} />

      {step === "intake" && (
        <StepCard title="Intake" sub="Enter event details. Fields pre-filled from the event record — confirm they're correct.">
          {GUIDES.intake}
          {hybridMode && (
            <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, background: "rgba(180,100,255,0.08)", border: "1px solid rgba(180,100,255,0.25)", fontSize: 12, color: theme.onSurface + "90" }}>
              This is the execution component of a Hybrid engagement. Once submitted, you'll continue straight to the Advisory Engine with this pricing already attached — no retyping.
            </div>
          )}
          {intake.pillar !== "P2" && (
            <>
              <Field label="Attendee Count" required>
                <input type="number" value={intake.attendee_count}
                  onChange={e => setIntake(p => ({ ...p, attendee_count: e.target.value }))}
                  style={inputStyle} placeholder="e.g. 500" />
              </Field>
              {intake.pillar === "P1" && intake.attendee_count && (() => {
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
            </>
          )}
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
            <>
              <Field label="Training Level">
                <select value={intake.p2_level} onChange={e => setIntake(p => ({ ...p, p2_level: e.target.value }))} style={inputStyle}>
                  <option value="L1">L1 — Operational Foundations (${P2_PRICING.L1.toLocaleString()})</option>
                  <option value="L2">L2 — Leadership & Decision Systems (${P2_PRICING.L2.toLocaleString()})</option>
                </select>
              </Field>
              <Field label="Number of Leaders / Employees" required>
                <input type="number" value={intake.p2_headcount}
                  onChange={e => setIntake(p => ({ ...p, p2_headcount: e.target.value }))}
                  style={inputStyle} placeholder="e.g. 25" />
              </Field>
              {intake.p2_headcount && (() => {
                const { price, band, overageHeads } = getP2Price(intake.p2_level, intake.p2_headcount);
                return (
                  <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 4,
                    background: theme.accent + "10", border: `1px solid ${theme.accent + "30"}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, marginBottom: 2 }}>
                      ${price.toLocaleString()} — {band.label}{overageHeads > 0 ? ` (+${overageHeads} over 50 at $${P2_OVERAGE_PER_HEAD}/head)` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: theme.onSurface + "70" }}>
                      No live event — this engagement skips Risk & Labor entirely.
                    </div>
                  </div>
                );
              })()}
            </>
          )}
          {intake.pillar === "P3" && (
            <Field label="Co-Execution Tier">
              <select value={intake.p3_tier} onChange={e => setIntake(p => ({ ...p, p3_tier: e.target.value }))} style={inputStyle}>
                <option value="P1">P1 — Standard (${P3_PRICING.P1.toLocaleString()} base + complexity)</option>
                <option value="P2">P2 — Elevated (${P3_PRICING.P2.toLocaleString()} base + complexity)</option>
              </select>
            </Field>
          )}
          <NavRow onNext={nextStep} nextDisabled={p2Standalone ? (!intake.p2_headcount || !intake.location) : (!intake.attendee_count || !intake.location)} />
        </StepCard>
      )}

      {step === "risk_labor" && (
        <StepCard title="Risk and Labor" sub="Score all VRI and WRR factors before proceeding. These drive the labor reserve and feed into the final price.">
          <RiskLabor
            intake={intake}
            initial={riskLaborData}
            onComplete={(data) => { setRiskLaborData(data); nextStep(); }}
            onBack={prevStep}
          />
        </StepCard>
      )}

      {step === "tier" && (
        <StepCard title="Tier" sub={isAttendeeTiered
          ? "Tier is auto-selected from attendee count. Override requires Founder name and written rationale."
          : "Base rate is set by the pillar/level selected in Intake. No attendee-count tiering applies to this pillar."}>
          {GUIDES.tier}
          <div style={{
            padding: "16px 18px", borderRadius: 10, marginBottom: 16,
            background: theme.surface, border: `2px solid ${theme.accent + "60"}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              {isAttendeeTiered ? "Auto-Selected Tier" : "Base Rate"}
            </div>
            <div style={{ display: "flex", gap: 24, marginBottom: 10 }}>
              <Stat label="Tier" value={autoTier.tier} />
              <Stat label="Floor" value={`$${autoTier.floor.toLocaleString()}`} />
              <Stat label="Base Anchor" value={`$${autoTier.anchor.toLocaleString()}`} />
              {isAttendeeTiered && <Stat label="Attendees" value={intake.attendee_count} />}
            </div>
            {autoTier.note && (
              <div style={{ fontSize: 12, color: theme.onSurface + "70", paddingTop: 8, borderTop: `1px solid ${theme.primaryDark}` }}>
                <strong style={{ color: theme.accent }}>{isAttendeeTiered ? "Why this tier:" : "Note:"}</strong> {autoTier.note}
                {isAttendeeTiered && (
                  <>
                    {" "}Tier is driven by attendee count —
                    {parseInt(intake.attendee_count) <= 175 ? " ≤175 attendees = Tier 0." :
                     parseInt(intake.attendee_count) <= 299 ? " 176–299 attendees = Tier 1." :
                     parseInt(intake.attendee_count) <= 599 ? " 300–599 attendees = Tier 2." :
                     " 600+ attendees = Tier 3."}
                    {" "}If this doesn't match the engagement scope, use the override below.
                  </>
                )}
              </div>
            )}
          </div>

          {complexityApplies && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.onSurface + "80" }}>Complexity Factors</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.accent }}>
                  {complexityScore} pts — {complexityAdj.label}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                {COMPLEXITY_QUESTIONS.map(q => (
                  <label key={q.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
                    borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${complexity[q.id] ? theme.accent + "60" : theme.primaryDark}`,
                    background: complexity[q.id] ? theme.accent + "08" : theme.surface,
                  }}>
                    <input type="checkbox" checked={!!complexity[q.id]}
                      onChange={e => setComplexity(p => ({ ...p, [q.id]: e.target.checked }))}
                      style={{ accentColor: theme.accent, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme.onSurface }}>{q.label} <span style={{ fontWeight: 400, color: theme.onSurface + "50" }}>(+3)</span></div>
                      <div style={{ fontSize: 11, color: theme.onSurface + "60" }}>{q.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 11, color: theme.onSurface + "50" }}>
                Each factor checked adds 3 points. {scoreCIMI ? `CIMI is also contributing +${cimiScore} on top.` : "CIMI (next step) can add up to +6 more if scored."} 0–5 total = no adjustment, 6–12 = +15%, 13–20 = +30%, 21+ = +45%.
              </div>
            </div>
          )}

          {isAttendeeTiered && (
            <>
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
            </>
          )}
          <NavRow onBack={prevStep} onNext={nextStep} nextDisabled={!overrideValid} />
        </StepCard>
      )}

      {step === "cimi" && (
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
                  {" · "}
                  Complexity modifier: <strong style={{ color: theme.accent }}>+{getCimiModifier(parseFloat(cimiAvg))}</strong>
                </div>
              </div>
            </div>
          )}

          {!scoreCIMI && (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: theme.primaryDark + "40", fontSize: 12, color: theme.onSurface + "70", marginBottom: 16 }}>
              Skipping CIMI. Note: a low CIMI client in a Pillar 1 execution is your highest risk engagement. Score when you have discovery data.
            </div>
          )}
          <NavRow onBack={prevStep} onNext={nextStep} />
        </StepCard>
      )}

      {step === "addons" && (
        <StepCard title="Add-Ons & Escalators" sub="Select applicable add-ons. Escalators compound — confirm each applies before selecting.">
          {p2AddOnAvailable && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: theme.onSurface + "90", margin: "0 0 10px" }}>Pillar 2 Add-On — Leadership Training</h3>
              <div style={{
                padding: "14px 16px", borderRadius: 10, marginBottom: 20,
                background: p2AddOnEnabled ? theme.accent + "08" : theme.surface,
                border: `1px solid ${p2AddOnEnabled ? theme.accent + "40" : theme.primaryDark}`,
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: p2AddOnEnabled ? 14 : 0 }}>
                  <input type="checkbox" checked={p2AddOnEnabled} onChange={e => setP2AddOnEnabled(e.target.checked)} style={{ accentColor: theme.accent }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.onSurface }}>Attach Leadership Training to this engagement</span>
                </label>
                {p2AddOnEnabled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontSize: 12, color: theme.onSurface + "60" }}>
                      Priced the same way standalone P2 is — flat curriculum rate plus headcount bands. No separate Risk & Labor or CIMI run needed; that's already covered by this engagement's Pillar 1 component.
                    </div>
                    <Field label="Training Level">
                      <select value={p2AddOnLevel} onChange={e => setP2AddOnLevel(e.target.value)} style={inputStyle}>
                        <option value="L1">L1 — Operational Foundations (${P2_PRICING.L1.toLocaleString()})</option>
                        <option value="L2">L2 — Leadership & Decision Systems (${P2_PRICING.L2.toLocaleString()})</option>
                      </select>
                    </Field>
                    <Field label="Number of Leaders / Employees" required>
                      <input type="number" value={p2AddOnHeadcount}
                        onChange={e => setP2AddOnHeadcount(e.target.value)}
                        style={inputStyle} placeholder="e.g. 25" />
                    </Field>
                    {p2AddOnHeadcount && p2AddOn && (
                      <div style={{ padding: "10px 14px", borderRadius: 8, background: theme.accent + "10", border: `1px solid ${theme.accent + "30"}` }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: theme.accent }}>
                          +${p2AddOn.price.toLocaleString()} — {p2AddOn.band.label}{p2AddOn.overageHeads > 0 ? ` (+${p2AddOn.overageHeads} over 50 at $${P2_OVERAGE_PER_HEAD}/head)` : ""}
                        </div>
                      </div>
                    )}
                    {!p2AddOnValid && (
                      <ValidationBadge ok={false} label="Headcount required to attach this add-on" />
                    )}
                  </div>
                )}
              </div>
            </>
          )}

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
          <NavRow onBack={prevStep} onNext={nextStep} nextDisabled={!p2AddOnValid} />
        </StepCard>
      )}

      {step === "summary" && (
        <StepCard title="Final Summary" sub="Review all checks before submitting. Floor Check and Discount Check must both pass.">
          {GUIDES.summary}

          {!p2Standalone && (
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
          )}

          <div style={{
            padding: "14px 16px", borderRadius: 10, marginBottom: 20,
            background: introActive ? theme.accent + "08" : theme.primaryDark + "40",
            border: `1px solid ${introActive ? theme.accent + "40" : theme.primaryDark}`,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: introPricingEnabled && introEligible ? 12 : 0 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: introActive ? theme.accent : theme.onSurface + "60", marginBottom: 4 }}>
                  Introductory Pricing
                </div>
                <div style={{ fontSize: 12, color: theme.onSurface + "70" }}>
                  {loadingClientCount
                    ? "Checking eligibility..."
                    : !introEligible
                      ? realClientCount === null
                        ? "Couldn't confirm client count — intro pricing disabled until this resolves."
                        : `Intro pricing window closed — ${INTRO_CLIENT_LIMIT} real clients already onboarded.`
                      : `Pre-launch rate, separate from Standard/Strategic discounts. Client ${realClientCount + 1} of ${INTRO_CLIENT_LIMIT} before this window closes.`}
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: introEligible ? "pointer" : "not-allowed", flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: theme.onSurface + "70" }}>
                  {introPricingEnabled ? "On" : "Off"}
                </span>
                <div
                  onClick={() => introEligible && setIntroPricingEnabled(p => !p)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, transition: "all 0.2s",
                    cursor: introEligible ? "pointer" : "not-allowed",
                    opacity: introEligible ? 1 : 0.4,
                    background: introPricingEnabled ? theme.accent : theme.primaryDark,
                    position: "relative",
                  }}>
                  <div style={{
                    position: "absolute", top: 3, left: introPricingEnabled ? 21 : 3,
                    width: 16, height: 16, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }} />
                </div>
              </label>
            </div>

            {introPricingEnabled && introEligible && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Field label={`Intro % (suggested ${suggestedIntroPct}% for ${activeTier.tier}${selectedAddOns.length >= 2 ? " + packaging" : ""})`}>
                  <input type="number" min={INTRO_MIN_PCT} max={INTRO_MAX_PCT}
                    value={introPctOverride ?? suggestedIntroPct}
                    onChange={e => setIntroPctOverride(Math.min(INTRO_MAX_PCT, Math.max(INTRO_MIN_PCT, parseInt(e.target.value) || INTRO_MIN_PCT)))}
                    style={{ ...inputStyle, width: 100 }} />
                </Field>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20, borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.primaryDark}` }}>
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
              p2AddOnActive && p2AddOnPrice > 0 && { label: "Pillar 2 Add-On", sub: `Leadership Training — ${p2AddOnLevel} — ${p2AddOnHeadcount || 0} leaders`, value: `+$${p2AddOnPrice.toLocaleString()}` },
              actualDiscount > 0 && {
                label: introActive ? "Introductory Pricing" : "Discount",
                sub: introActive ? `${effectiveIntroPct}% intro rate` : `${(actualDiscount * 100).toFixed(0)}% ${discountTier.label}`,
                value: `-$${discountAmount.toLocaleString()}`,
                negative: true,
              },
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

          {!p2Standalone && !laborIncluded && (
            <div style={{
              padding: "12px 14px", borderRadius: 8, marginBottom: 20,
              background: "rgba(255,160,60,0.08)", border: "1px solid rgba(255,160,60,0.3)",
              fontSize: 12, color: theme.onSurface + "90",
            }}>
              <strong style={{ color: "#e09030" }}>⚠ Third-Party Staffing Waiver required.</strong>{" "}
              Labor reserve excluded. Generate the waiver from the Document Generator before this engagement is activated. M&M's liability for workforce outcomes is limited to M&M-managed roles only.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            <ValidationBadge ok={floorCheck}
              label={floorCheck
                ? `Floor Check: OK — $${clientTotal.toLocaleString()} ≥ $${activeTier.floor.toLocaleString()} floor`
                : `Floor Check: FAIL — $${clientTotal.toLocaleString()} is below $${activeTier.floor.toLocaleString()} floor. Fix the scope.`} />
            <ValidationBadge ok={discountCheck}
              label={discountCheck ? "Discount Check: OK" : "Discount Check: authorization required"} />
            {overrideTier && (
              <ValidationBadge ok={overrideValid}
                label={overrideValid ? "Override: Validated" : "Override: Incomplete — Founder name and rationale required"} />
            )}
          </div>

          {introActive ? (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: theme.primaryDark + "40", fontSize: 12, color: theme.onSurface + "70", marginBottom: 20 }}>
              Discounts are unavailable while Introductory Pricing is active. Turn off Introductory Pricing above to apply a discount instead.
            </div>
          ) : (
            <>
              {GUIDES.introductory}
              <div style={{ padding: "16px", borderRadius: 8, background: theme.surface, border: `1px solid ${theme.primaryDark}`, marginBottom: 20 }}>
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
                        onChange={e => setDiscountPct(Math.min(e.target.value, discountTier.max * 100))}
                        style={inputStyle} />
                    </Field>
                    <Field label={discountTier.authorizers === 2 ? "Authorizing Founder #1" : "Authorizing Name"} required>
                      <input value={discountAuthorizer} onChange={e => setDiscountAuthorizer(e.target.value)}
                        style={inputStyle} placeholder={discountTier.id === "ops" ? "Shanell Jefferson (or a Founder)" : "Ashley Glenn or Mikal Driver"} />
                    </Field>
                    {discountTier.authorizers === 2 && (
                      <Field label="Authorizing Founder #2 (must be the other Founder)" required>
                        <input value={discountAuthorizer2} onChange={e => setDiscountAuthorizer2(e.target.value)}
                          style={inputStyle} placeholder="The other Founder" />
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
            </>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={prevStep} style={secondaryBtnStyle}>← Back</button>
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
              {canSubmit
                ? (hybridMode ? "Confirm Execution Pricing → Continue to Advisory" : "Submit & Log Quote →")
                : "Complete all checks to submit"}
            </button>
          </div>
        </StepCard>
      )}
    </div>
  );
}

// ─── Shared sub-components ─────────────────────────────────────────
function ContextBar({ event, pillar, hybridMode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 8, background: theme.surface, border: `1px solid ${theme.primaryDark}`, marginBottom: 20, fontSize: 13 }}>
      <span style={{ fontWeight: 700, color: theme.onSurface }}>{event?.name}</span>
      {event?.client && <span style={{ color: theme.onSurface + "60" }}>{event.client}</span>}
      {pillar && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: theme.accent + "20", color: theme.accent }}>Pillar {pillar.replace("P", "")}</span>}
      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(100,180,255,0.15)", color: "#6ab4ff" }}>Tier Engine</span>
      {hybridMode && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(180,100,255,0.15)", color: "#c080ff" }}>Hybrid — Execution Component</span>}
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