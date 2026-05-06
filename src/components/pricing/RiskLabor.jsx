// src/components/pricing/RiskLabor.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Full VRI + WRR + Labor Projection + Reserve Calculator
// Mirrors MM_Pricing_Engine_V3.xlsx tabs exactly.
// Called as Step 1 in TierEngine (between Intake and Tier).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { Guide, GUIDES } from "./PricingGuide";
import { theme } from "../../theme";

// ── VRI Factors ───────────────────────────────────────────────────────────────
// Each factor scores 0, 2, or 5 based on selected risk level.
const VRI_FACTORS = [
  {
    group: "Community Strength",
    factors: [
      { id: "vri_db_size",      label: "Existing volunteer database size",       options: [{ label: "Large / established", score: 0 }, { label: "Moderate", score: 2 }, { label: "Small / new", score: 5 }] },
      { id: "vri_turnout",      label: "Historical turnout reliability",          options: [{ label: "High — consistent shows", score: 0 }, { label: "Moderate", score: 2 }, { label: "Low / unknown", score: 5 }] },
      { id: "vri_brand_loyalty",label: "Brand loyalty / cultural alignment",      options: [{ label: "Strong brand pull", score: 0 }, { label: "Moderate", score: 2 }, { label: "Low / no brand recognition", score: 5 }] },
    ],
  },
  {
    group: "Recruitment Conditions",
    factors: [
      { id: "vri_rec_timeline", label: "Recruitment timeline length",             options: [{ label: "60+ days", score: 0 }, { label: "30–60 days", score: 2 }, { label: "Under 30 days", score: 5 }] },
      { id: "vri_competing",    label: "Competing events in market",              options: [{ label: "No competition", score: 0 }, { label: "Some competition", score: 2 }, { label: "Heavy competition", score: 5 }] },
      { id: "vri_incentive",    label: "Incentive attractiveness",                options: [{ label: "Strong incentive package", score: 0 }, { label: "Moderate", score: 2 }, { label: "Low / no incentive", score: 5 }] },
    ],
  },
  {
    group: "Role Complexity",
    factors: [
      { id: "vri_skill_req",    label: "Technical skill requirement",             options: [{ label: "Low — general staff", score: 0 }, { label: "Moderate", score: 2 }, { label: "High — specialized roles", score: 5 }] },
      { id: "vri_shift_intensity",label: "Shift intensity (length / demand)",     options: [{ label: "Standard shifts", score: 0 }, { label: "Moderate", score: 2 }, { label: "Long / demanding shifts", score: 5 }] },
      { id: "vri_role_crit",    label: "Role criticality",                        options: [{ label: "Low — backup coverage exists", score: 0 }, { label: "Moderate", score: 2 }, { label: "High — no backup for this role", score: 5 }] },
    ],
  },
  {
    group: "Environmental",
    factors: [
      { id: "vri_venue_access",  label: "Venue accessibility",                    options: [{ label: "Easy — central, transit-friendly", score: 0 }, { label: "Moderate", score: 2 }, { label: "Difficult — remote or complex access", score: 5 }] },
      { id: "vri_multi_loc",     label: "Multi-location coordination",            options: [{ label: "Single venue", score: 0 }, { label: "2 locations", score: 2 }, { label: "3+ locations", score: 5 }] },
      { id: "vri_volatility",    label: "Historical volunteer volatility",         options: [{ label: "Low — reliable history", score: 0 }, { label: "Moderate", score: 2 }, { label: "High / first-time event", score: 5 }] },
    ],
  },
];

// ── WRR Factors ───────────────────────────────────────────────────────────────
// Each factor scores 0, 3, or 6 based on consequence level.
const WRR_FACTORS = [
  { id: "wrr_revenue",    label: "Revenue dependency",           desc: "Financial loss if staffing fails",         options: [{ label: "Low — no direct revenue tie", score: 0 }, { label: "Moderate — some revenue at risk", score: 3 }, { label: "High — event revenue depends on staffing", score: 6 }] },
  { id: "wrr_sponsor",    label: "Sponsor / partner exposure",   desc: "Sponsor visibility or contractual obligations", options: [{ label: "Low — no sponsors present", score: 0 }, { label: "Moderate — sponsors present", score: 3 }, { label: "High — major sponsor obligations", score: 6 }] },
  { id: "wrr_vip",        label: "VIP / government presence",    desc: "Dignitaries, officials, or elevated-access attendees", options: [{ label: "None", score: 0 }, { label: "Some VIPs", score: 3 }, { label: "High-profile or government", score: 6 }] },
  { id: "wrr_safety",     label: "Safety exposure",              desc: "Crowd control, access points, sensitive areas", options: [{ label: "Low — standard public event", score: 0 }, { label: "Moderate", score: 3 }, { label: "High — crowd safety critical", score: 6 }] },
  { id: "wrr_tech",       label: "Technical dependency",         desc: "Registration, badge scan, AV, systems", options: [{ label: "Low — minimal tech", score: 0 }, { label: "Moderate — some systems", score: 3 }, { label: "High — tech failure = event failure", score: 6 }] },
  { id: "wrr_media",      label: "Media visibility / PR risk",   desc: "Press, social media, public scrutiny", options: [{ label: "Low — private or niche event", score: 0 }, { label: "Moderate — some coverage expected", score: 3 }, { label: "High — major press or broadcast", score: 6 }] },
  { id: "wrr_brand",      label: "Brand damage potential",       desc: "M&M + partner reputation at stake", options: [{ label: "Low", score: 0 }, { label: "Moderate", score: 3 }, { label: "High — flagship or public-facing event", score: 6 }] },
  { id: "wrr_legal",      label: "Legal / compliance exposure",  desc: "Permits, insurance requirements, liability", options: [{ label: "Low — standard compliance", score: 0 }, { label: "Moderate", score: 3 }, { label: "High — significant legal exposure", score: 6 }] },
];

// ── Scoring helpers ────────────────────────────────────────────────────────────
function getVRIBand(score) {
  if (score <= 15) return { band: "Low Risk",      level: "LOW",  reserve: "Level 1", color: "#6dbf6d" };
  if (score <= 30) return { band: "Moderate Risk", level: "MOD",  reserve: "Level 1–2", color: "#d4a800" };
  if (score <= 45) return { band: "Elevated Risk", level: "ELEV", reserve: "Level 2–3", color: "#e07b2a" };
  return                  { band: "High Risk",     level: "HIGH", reserve: "Level 3 — full reserve", color: "#e07070" };
}

function getWRRBand(score) {
  if (score <= 6)  return { band: "Low Consequence",      level: "LOW",  reserve: "Level 1", color: "#6dbf6d" };
  if (score <= 18) return { band: "Moderate Consequence", level: "MOD",  reserve: "Level 1–2", color: "#d4a800" };
  if (score <= 30) return { band: "High Consequence",     level: "HIGH", reserve: "Level 2–3", color: "#e07b2a" };
  return                  { band: "Critical Consequence", level: "CRIT", reserve: "Level 3 — full reserve", color: "#e07070" };
}

function getReserveLevel(vriLevel, wrrLevel) {
  if (vriLevel === "LOW"  && wrrLevel === "LOW")  return { level: 1, pct: 0,    label: "No reserve required" };
  if (vriLevel === "LOW"  && wrrLevel === "MOD")  return { level: 1, pct: 0.10, label: "Level 1 — 10% reserve" };
  if (vriLevel === "MOD"  && wrrLevel === "LOW")  return { level: 1, pct: 0.10, label: "Level 1 — 10% reserve" };
  if (vriLevel === "MOD"  && wrrLevel === "MOD")  return { level: 2, pct: 0.15, label: "Level 2 — 15% reserve" };
  if (vriLevel === "ELEV" || wrrLevel === "HIGH") return { level: 2, pct: 0.15, label: "Level 2 — 15% reserve" };
  if (vriLevel === "HIGH" || wrrLevel === "CRIT") return { level: 3, pct: 0.20, label: "Level 3 — 20% full reserve" };
  return { level: 2, pct: 0.15, label: "Level 2 — 15% reserve" };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function RiskLabor({ intake, onComplete, onBack }) {
  // ── VRI state ──────────────────────────────────────────────────────────────
  const [vri, setVri] = useState({});

  // ── WRR state ──────────────────────────────────────────────────────────────
  const [wrr, setWrr] = useState({});

  // ── Labor Projection state ─────────────────────────────────────────────────
  const volunteerCount = parseInt(intake?.volunteer_count) || Math.ceil((parseInt(intake?.attendee_count) || 0) / 6);
  const [laborInputs, setLaborInputs] = useState({
    volunteer_count:     String(volunteerCount),
    event_days:          "1",
    hours_per_day:       "8",
    team_lead_rate:      "20",
    ops_manager_rate:    "25",
    contingency_rate:    "17",
    tech_specialist_rate:"28",
    needs_tech_coverage: "No",
    admin_buffer_pct:    "15",
  });

  // ── Computed scores ────────────────────────────────────────────────────────
  const allVriFactors = VRI_FACTORS.flatMap(g => g.factors);
  const allWrrFactors = WRR_FACTORS;

  const vriScore = allVriFactors.reduce((s, f) => {
    const sel = vri[f.id];
    if (sel === undefined) return s;
    return s + (f.options[sel]?.score || 0);
  }, 0);

  const wrrScore = allWrrFactors.reduce((s, f) => {
    const sel = wrr[f.id];
    if (sel === undefined) return s;
    return s + (f.options[sel]?.score || 0);
  }, 0);

  const vriBand = getVRIBand(vriScore);
  const wrrBand = getWRRBand(wrrScore);
  const reserveLevel = getReserveLevel(vriBand.level, wrrBand.level);

  const vCount     = parseInt(laborInputs.volunteer_count) || 0;
  const eDays      = parseInt(laborInputs.event_days) || 1;
  const hPerDay    = parseInt(laborInputs.hours_per_day) || 8;
  const tlRate     = parseFloat(laborInputs.team_lead_rate) || 20;
  const omRate     = parseFloat(laborInputs.ops_manager_rate) || 25;
  const ctRate     = parseFloat(laborInputs.contingency_rate) || 17;
  const tsRate     = parseFloat(laborInputs.tech_specialist_rate) || 28;
  const bufferPct  = parseFloat(laborInputs.admin_buffer_pct) / 100 || 0.15;
  const needsTech  = laborInputs.needs_tech_coverage === "Yes";

  // Team leads: 1 per 20 volunteers
  const teamLeadCount   = Math.max(1, Math.ceil(vCount / 20));
  // Ops managers: 1 per 150 attendees
  const opsManagerCount = Math.max(1, Math.ceil((parseInt(intake?.attendee_count) || 0) / 150));
  // Backup headcount: ~30% of volunteer count
  const backupCount     = Math.max(2, Math.ceil(vCount * 0.30));
  const techCount       = needsTech ? Math.max(1, Math.ceil(vCount / 30)) : 0;

  const tlCost     = teamLeadCount   * tlRate * hPerDay * eDays;
  const omCost     = opsManagerCount * omRate * hPerDay * eDays;
  const plannedSubtotal = tlCost + omCost;

  const ctCost     = backupCount * ctRate * hPerDay * eDays;
  const tsCost     = techCount   * tsRate * hPerDay * eDays;
  const contingencySubtotal = ctCost + tsCost;

  const laborBeforeBuffer = plannedSubtotal + contingencySubtotal;
  const bufferAmount      = Math.round(laborBeforeBuffer * bufferPct);
  const projectedLaborCost = Math.round(laborBeforeBuffer + bufferAmount);

  const reserveAmount = Math.round(contingencySubtotal * (reserveLevel.pct || 0));

  // ── Validation ─────────────────────────────────────────────────────────────
  const vriComplete = allVriFactors.every(f => vri[f.id] !== undefined);
  const wrrComplete = allWrrFactors.every(f => wrr[f.id] !== undefined);
  const canContinue = vriComplete && wrrComplete;

  // ── Handler ────────────────────────────────────────────────────────────────
  const handleContinue = () => {
    onComplete({
      // VRI
      vri_inputs: vri,
      vri_score: vriScore,
      vri_band: vriBand.band,
      vri_level: vriBand.level,
      // WRR
      wrr_inputs: wrr,
      wrr_score: wrrScore,
      wrr_band: wrrBand.band,
      wrr_level: wrrBand.level,
      // Reserve
      reserve_level: reserveLevel.level,
      reserve_pct: reserveLevel.pct,
      reserve_amount: reserveAmount,
      reserve_label: reserveLevel.label,
      // Labor
      labor_inputs: laborInputs,
      team_lead_count: teamLeadCount,
      ops_manager_count: opsManagerCount,
      backup_count: backupCount,
      tech_count: techCount,
      planned_labor_subtotal: plannedSubtotal,
      contingency_subtotal: contingencySubtotal,
      projected_labor_cost: projectedLaborCost,
    });
  };

  const vriPct = Math.round((vriScore / 60) * 100);
  const wrrPct = Math.round((wrrScore / 48) * 100);

  return (
    <div>
      {/* VRI Section */}
      <SectionHeader
        title="Volunteer Risk Index (VRI)"
        sub="Scores the likelihood of volunteer shortfall. Based on community strength, recruitment conditions, role complexity, and environmental factors."
        score={vriScore}
        maxScore={60}
        band={vriBand.band}
        bandColor={vriBand.color}
        complete={vriComplete}
        pct={vriPct}
      />

      {GUIDES.vri}
      {VRI_FACTORS.map(group => (
        <FactorGroup key={group.group} group={group.group}>
          {group.factors.map(f => (
            <FactorRow
              key={f.id}
              factor={f}
              selected={vri[f.id]}
              onChange={idx => setVri(p => ({ ...p, [f.id]: idx }))}
            />
          ))}
        </FactorGroup>
      ))}

      {vriComplete && (
        <ScoreSummary
          label="VRI Score"
          score={vriScore}
          max={60}
          band={vriBand.band}
          color={vriBand.color}
          detail={`Reserve impact: ${vriBand.reserve}`}
        />
      )}

      <Divider />

      {/* WRR Section */}
      <SectionHeader
        title="Workforce Reliability Risk (WRR)"
        sub="Scores the consequence if the workforce underperforms — not the likelihood. Revenue exposure, VIP risk, brand damage, legal exposure."
        score={wrrScore}
        maxScore={48}
        band={wrrBand.band}
        bandColor={wrrBand.color}
        complete={wrrComplete}
        pct={wrrPct}
      />

      {GUIDES.wrr}
      <FactorGroup group="Consequence Factors">
        {WRR_FACTORS.map(f => (
          <FactorRow
            key={f.id}
            factor={f}
            selected={wrr[f.id]}
            onChange={idx => setWrr(p => ({ ...p, [f.id]: idx }))}
            showDesc
          />
        ))}
      </FactorGroup>

      {wrrComplete && (
        <ScoreSummary
          label="WRR Score"
          score={wrrScore}
          max={48}
          band={wrrBand.band}
          color={wrrBand.color}
          detail={`Reserve impact: ${wrrBand.reserve}`}
        />
      )}

      <Divider />

      {/* Combined Reserve */}
      {vriComplete && wrrComplete && (
        <>
          <div style={{ padding: "16px 18px", borderRadius: 10, marginBottom: 24,
            border: `1px solid ${reserveLevel.level === 3 ? "rgba(255,100,100,0.4)" : reserveLevel.level === 2 ? "rgba(255,160,60,0.4)" : "rgba(100,200,100,0.4)"}`,
            background: reserveLevel.level === 3 ? "rgba(255,100,100,0.06)" : reserveLevel.level === 2 ? "rgba(255,160,60,0.06)" : "rgba(100,200,100,0.06)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: theme.onSurface + "70", marginBottom: 10 }}>
              Combined Reserve Determination
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <Stat label="VRI Band" value={vriBand.band} color={vriBand.color} />
              <Stat label="WRR Band" value={wrrBand.band} color={wrrBand.color} />
              <Stat label="Reserve Level" value={`Level ${reserveLevel.level}`} color={reserveLevel.level === 3 ? "#e07070" : reserveLevel.level === 2 ? "#d4a800" : "#6dbf6d"} />
              <Stat label="Reserve Rate" value={reserveLevel.pct === 0 ? "None required" : `${(reserveLevel.pct * 100).toFixed(0)}%`} />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: theme.onSurface + "70" }}>
              {reserveLevel.label} — Unused reserve reconciled post-event. M&M retains 15% as risk allocation fee.
            </div>
          </div>
        </>
      )}

      {/* Labor Projection */}
      <SectionHeader
        title="Labor Projection"
        sub="Auto-calculated from volunteer count and event parameters. Override rates only if this engagement warrants non-default rates — document the reason in notes."
        noScore
      />

      {GUIDES.labor}
      <div style={{ background: theme.surface, borderRadius: 10, border: `1px solid ${theme.primaryDark}`, padding: "18px 20px", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <LaborField label="Volunteer Count" value={laborInputs.volunteer_count}
            onChange={v => setLaborInputs(p => ({ ...p, volunteer_count: v }))} type="number"
            hint={`Auto-estimated from attendee count (÷6) if not entered`} />
          <LaborField label="Event Days" value={laborInputs.event_days}
            onChange={v => setLaborInputs(p => ({ ...p, event_days: v }))} type="number" />
          <LaborField label="Hours Per Day" value={laborInputs.hours_per_day}
            onChange={v => setLaborInputs(p => ({ ...p, hours_per_day: v }))} type="number" />
          <LaborField label="Admin Buffer %" value={laborInputs.admin_buffer_pct}
            onChange={v => setLaborInputs(p => ({ ...p, admin_buffer_pct: v }))} type="number" />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: theme.onSurface + "60", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          Rate Overrides (defaults shown)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <LaborField label="Team Lead Rate ($/hr)" value={laborInputs.team_lead_rate}
            onChange={v => setLaborInputs(p => ({ ...p, team_lead_rate: v }))} type="number" />
          <LaborField label="Ops Manager Rate ($/hr)" value={laborInputs.ops_manager_rate}
            onChange={v => setLaborInputs(p => ({ ...p, ops_manager_rate: v }))} type="number" />
          <LaborField label="Contingency Staff Rate ($/hr)" value={laborInputs.contingency_rate}
            onChange={v => setLaborInputs(p => ({ ...p, contingency_rate: v }))} type="number" />
          <LaborField label="Tech Specialist Rate ($/hr)" value={laborInputs.tech_specialist_rate}
            onChange={v => setLaborInputs(p => ({ ...p, tech_specialist_rate: v }))} type="number" />
        </div>

        <LaborField label="Technical Coverage Needed?" value={laborInputs.needs_tech_coverage}
          onChange={v => setLaborInputs(p => ({ ...p, needs_tech_coverage: v }))}
          type="select" options={["No", "Yes"]} />
      </div>

      {/* Labor output */}
      <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.primaryDark}`, marginBottom: 24 }}>
        <div style={{ padding: "10px 14px", background: theme.accent + "15", fontSize: 11, fontWeight: 700, color: theme.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Labor Projection Output
        </div>
        {[
          ["Team Leads",          `${teamLeadCount} × $${tlRate}/hr × ${hPerDay}hr × ${eDays}d`, `$${Math.round(tlCost).toLocaleString()}`],
          ["Ops Managers",        `${opsManagerCount} × $${omRate}/hr × ${hPerDay}hr × ${eDays}d`, `$${Math.round(omCost).toLocaleString()}`],
          ["Planned Subtotal",    "",                  `$${Math.round(plannedSubtotal).toLocaleString()}`, true],
          ["Contingency Staff",   `${backupCount} × $${ctRate}/hr × ${hPerDay}hr × ${eDays}d`, `$${Math.round(ctCost).toLocaleString()}`],
          needsTech && ["Tech Specialists",  `${techCount} × $${tsRate}/hr × ${hPerDay}hr × ${eDays}d`, `$${Math.round(tsCost).toLocaleString()}`],
          ["Contingency Subtotal","",                  `$${Math.round(contingencySubtotal).toLocaleString()}`, true],
          ["Admin Buffer",        `${laborInputs.admin_buffer_pct}%`,            `$${bufferAmount.toLocaleString()}`],
        ].filter(Boolean).map(([label, formula, val, bold], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px",
            background: i % 2 === 0 ? theme.surface : theme.primaryDark + "30", fontSize: 13 }}>
            <div>
              <span style={{ color: theme.onSurface, fontWeight: bold ? 700 : 400 }}>{label}</span>
              {formula && <span style={{ fontSize: 11, color: theme.onSurface + "50", marginLeft: 8 }}>{formula}</span>}
            </div>
            <span style={{ fontWeight: bold ? 700 : 400, color: bold ? theme.onSurface : theme.onSurface + "80" }}>{val}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px",
          background: theme.accent + "15", fontSize: 14, fontWeight: 700 }}>
          <span style={{ color: theme.onSurface }}>Projected Labor Cost</span>
          <span style={{ color: theme.accent }}>${projectedLaborCost.toLocaleString()}</span>
        </div>
        {reserveAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px",
            background: "rgba(255,160,60,0.08)", fontSize: 13, borderTop: `1px solid ${theme.primaryDark}` }}>
            <span style={{ color: theme.onSurface + "80" }}>Labor Reserve ({(reserveLevel.pct * 100).toFixed(0)}%)</span>
            <span style={{ fontWeight: 700, color: "#d4a800" }}>${reserveAmount.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={secondaryBtnStyle}>← Back</button>
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          style={{
            flex: 1, padding: "11px", borderRadius: 8, border: "none",
            cursor: canContinue ? "pointer" : "not-allowed",
            background: canContinue ? theme.accent : 'rgba(150,150,150,0.15)',
            color: canContinue ? theme.primary : 'rgba(150,150,150,0.5)',
            fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
          }}>
          {canContinue ? "Continue to Tier →" : `Complete all factors to continue (${Object.keys(vri).length + Object.keys(wrr).length} / ${allVriFactors.length + allWrrFactors.length})`}
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SectionHeader({ title, sub, score, maxScore, band, bandColor, complete, pct, noScore }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.onSurface }}>{title}</h2>
        {!noScore && complete && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
            background: bandColor + "20", color: bandColor }}>
            {score}/{maxScore} — {band}
          </span>
        )}
        {!noScore && !complete && (
          <span style={{ fontSize: 11, color: theme.onSurface + "50" }}>Score all factors to proceed</span>
        )}
      </div>
      {!noScore && (
        <div style={{ height: 4, borderRadius: 2, background: theme.primaryDark, marginBottom: 8, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 2, background: bandColor || theme.accent,
            width: `${pct || 0}%`, transition: "width 0.3s ease" }} />
        </div>
      )}
      <p style={{ margin: 0, fontSize: 12, color: theme.onSurface + "60" }}>{sub}</p>
    </div>
  );
}

function FactorGroup({ group, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.onSurface + "50", textTransform: "uppercase",
        letterSpacing: "0.1em", marginBottom: 8, paddingBottom: 4,
        borderBottom: `1px solid ${theme.primaryDark}` }}>
        {group}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function FactorRow({ factor, selected, onChange, showDesc }) {
  return (
    <div style={{ background: theme.surface, borderRadius: 8, border: `1px solid ${selected !== undefined ? theme.accent + "40" : theme.primaryDark}`,
      padding: "10px 12px", transition: "border-color 0.15s" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: theme.onSurface, marginBottom: showDesc && factor.desc ? 2 : 8 }}>
        {factor.label}
      </div>
      {showDesc && factor.desc && (
        <div style={{ fontSize: 11, color: theme.onSurface + "55", marginBottom: 8 }}>{factor.desc}</div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {factor.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            style={{
              flex: 1, minWidth: 120, padding: "7px 10px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${selected === i ? theme.accent : theme.primaryDark}`,
              background: selected === i ? theme.accent + "15" : "transparent",
              color: selected === i ? theme.accent : theme.onSurface + "70",
              fontSize: 11, fontWeight: selected === i ? 700 : 400,
              fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s", textAlign: "left",
              lineHeight: 1.3,
            }}>
            <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, marginRight: 4 }}>
              +{opt.score}
            </span>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreSummary({ label, score, max, band, color, detail }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 8,
      background: color + "12", border: `1px solid ${color + "40"}`, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: theme.onSurface + "60", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color }}>{score}<span style={{ fontSize: 13, color: theme.onSurface + "50" }}>/{max}</span></div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color }}>{band}</div>
          <div style={{ fontSize: 12, color: theme.onSurface + "60" }}>{detail}</div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.onSurface + "55", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || theme.onSurface }}>{value}</div>
    </div>
  );
}

function LaborField({ label, value, onChange, type, options, hint }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.onSurface + "70", marginBottom: 4 }}>{label}</div>
      {type === "select" ? (
        <select value={value} onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, appearance: "none" }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type || "text"} value={value} onChange={e => onChange(e.target.value)}
          style={inputStyle} />
      )}
      {hint && <div style={{ fontSize: 10, color: theme.onSurface + "45", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: `1px solid ${theme.primaryDark}`, margin: "24px 0" }} />;
}

const inputStyle = {
  width: "100%", padding: "8px 11px", borderRadius: 7,
  border: `1px solid ${theme.primaryDark}`, background: theme.surface,
  color: theme.onSurface, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
  boxSizing: "border-box", outline: "none",
};

const secondaryBtnStyle = {
  padding: "11px 20px", borderRadius: 8, border: `1px solid ${theme.primaryDark}`,
  background: "transparent", color: theme.onSurface + "80",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
};