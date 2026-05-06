// src/components/pricing/PricingGuide.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Contextual guidance callouts for the pricing engine flows.
// Lightweight — just a styled callout with an icon and message.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { theme } from "../../theme";

// ── Main callout component ────────────────────────────────────────────────────
export function Guide({ type = "info", title, children, collapsible = false }) {
  const [open, setOpen] = useState(true);

  const colors = {
    info:    { bg: "rgba(100,180,255,0.07)", border: "rgba(100,180,255,0.25)", icon: "◈", iconColor: "#6ab4ff", titleColor: "#4a9fd4" },
    warn:    { bg: "rgba(235,199,100,0.08)", border: "rgba(235,199,100,0.3)",  icon: "◇", iconColor: "#d4a800", titleColor: "#a07d00" },
    rule:    { bg: "rgba(255,100,100,0.06)", border: "rgba(255,100,100,0.25)", icon: "◉", iconColor: "#e07070", titleColor: "#b85555" },
    tip:     { bg: "rgba(100,200,100,0.06)", border: "rgba(100,200,100,0.25)", icon: "◎", iconColor: "#6dbf6d", titleColor: "#4a9a4a" },
  };
  const c = colors[type] || colors.info;

  if (collapsible && !open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        display: "flex", alignItems: "center", gap: 6, padding: "6px 0",
        background: "none", border: "none", cursor: "pointer",
        fontSize: 11, color: theme.onSurface + "50", fontFamily: "'DM Sans', sans-serif",
        marginBottom: 12,
      }}>
        <span style={{ color: c.iconColor }}>{c.icon}</span>
        {title} <span style={{ opacity: 0.6 }}>— tap to expand</span>
      </button>
    );
  }

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 8, marginBottom: 16,
      background: c.bg, border: `1px solid ${c.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1 }}>
          <span style={{ fontSize: 14, color: c.iconColor, flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
          <div>
            {title && (
              <div style={{ fontSize: 11, fontWeight: 700, color: c.titleColor, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                {title}
              </div>
            )}
            <div style={{ fontSize: 12, color: theme.onSurface + "85", lineHeight: 1.6 }}>
              {children}
            </div>
          </div>
        </div>
        {collapsible && (
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 14, color: theme.onSurface + "40", padding: 0, flexShrink: 0,
          }}>×</button>
        )}
      </div>
    </div>
  );
}

// ── Pre-written guides for each engine step ───────────────────────────────────

export const GUIDES = {

  // Tier Engine
  intake: (
    <Guide type="info" title="Intake" collapsible>
      Attendee count drives tier selection — this is the most important number you enter. Tier 0 (≤175) is M&M staff only, still quoted but lower floor. Tier 1 (176–299) is a standard small engagement. Tier 2 (300–599) is mid-size. Tier 3 (600+) is large or enterprise. If the client hasn't confirmed attendance yet, use the discovery call estimate and flag it in notes. Do not guess — an under-counted attendance number produces an under-priced proposal. Location surfaces government/civic and public safety escalator flags downstream.
    </Guide>
  ),

  introductory: (
    <Guide type="tip" title="Introductory pricing">
      If a client can't meet the tier floor and M&M has a strategic reason to engage anyway, introductory pricing is available as a Founder-authorized discount — not a floor override. The floor stays. The discount brings the final price down. This requires a strategic discount authorization (≤15%, Founder only) with documented rationale. Never quote below floor without going through the discount flow.
    </Guide>
  ),

  vri: (
    <Guide type="warn" title="Volunteer Risk Index — what you're scoring">
      VRI measures the <strong>likelihood</strong> of volunteer shortfall. Score based on what you know from the discovery call — not what you hope is true. A low CIMI client (Foundational) almost always has elevated VRI. If you haven't had a discovery conversation, stop and schedule one first.
    </Guide>
  ),

  wrr: (
    <Guide type="rule" title="Workforce Reliability Risk — consequence, not likelihood">
      WRR measures what happens <strong>if</strong> staffing fails — not whether it will. A small private event with no sponsors scores low even if volunteers are unreliable. A VIP government event scores high even if the team is solid. Score the consequence, not the team.
    </Guide>
  ),

  labor: (
    <Guide type="tip" title="Labor rates">
      Default rates are set from the contractor rate sheet. Override only if this engagement uses non-standard rates — if you do, note why in the pricing notes. Contingency staff are only activated from the labor reserve, not budgeted as planned spend.
    </Guide>
  ),

  tier: (
    <Guide type="rule" title="Tier override — Founder authorization required" collapsible>
      The auto-selected tier is based on volunteer count. Override only when the auto-selected tier genuinely misrepresents the scope — not to get a number the client prefers. Every override is permanently logged with your name and rationale. If the price seems too high, adjust scope or run a discount — don't override the tier.
    </Guide>
  ),

  cimi: (
    <Guide type="warn" title="CIMI — optional for P1/P2/P3, but important">
      A low CIMI client taking a Pillar 1 execution engagement is your highest risk situation — M&M is executing for an organization with foundational gaps. Scoring CIMI adds a modifier to the complexity score that protects your margin. If you have discovery data, score it. If you're skipping because you haven't done discovery yet, that's the real problem.
    </Guide>
  ),

  addons: (
    <Guide type="info" title="Add-ons and escalators" collapsible>
      Add-ons are scoped services — only select what's actually in scope. Escalators apply automatically for government, public safety, and timeline conditions — check that the auto-flags match the engagement. Remember: escalators <strong>compound</strong>. 1.20× × 1.20× = 1.44×, not 1.40×.
    </Guide>
  ),

  summary: (
    <Guide type="rule" title="Before you submit">
      Floor Check and Discount Check must both show OK. If Floor Check fails, fix the scope — the floor is not negotiable. If you applied a discount, the authorizing Founder's name is required. Once submitted, this run is permanently logged and cannot be edited.
    </Guide>
  ),

  // Advisory Engine
  cimiDiagnostic: (
    <Guide type="rule" title="CIMI requires a real discovery conversation">
      Do not score CIMI from assumptions, prior knowledge, or what a client tells you about themselves in a sales call. Each category must be scored from a structured diagnostic session. If you haven't had one, close this tab and schedule it first. An invalid CIMI score produces an invalid retainer recommendation — and you'll be on the hook for that scope mismatch.
    </Guide>
  ),

  cimiCategories: (
    <Guide type="info" title="Scoring guidance — 1 is broken, 5 is excellent" collapsible>
      <strong>1</strong> — Does not exist or is completely broken. <strong>2</strong> — Exists but inconsistent or undocumented. <strong>3</strong> — Functional but not scalable. <strong>4</strong> — Solid with minor gaps. <strong>5</strong> — Mature, documented, and consistently executed. When in doubt, score lower — it's better to scope conservatively and expand than to undersell the engagement and underdeliver.
    </Guide>
  ),

  retainerBand: (
    <Guide type="warn" title="Band selection" collapsible>
      The recommended band is driven by the CIMI score. Override only if the scope conversation revealed something the score doesn't capture — for example, a client who scores Maturing but is about to scale 3× and needs Band 4 support. Document your reasoning in notes. Never select a lower band to make the price more attractive — that's how M&M undersells advisory work.
    </Guide>
  ),

  hybrid: (
    <Guide type="rule" title="Hybrid pricing — two independent line items" collapsible>
      Advisory retainer and execution pricing are never blended, never discounted against each other, and never presented as a combined total without both components broken out. They are two independent engagements running simultaneously. The client is buying both — price both at full value.
    </Guide>
  ),

  // Pipeline bridge
  pipelineReturn: (
    <Guide type="tip" title="You're back from the Pricing Engine">
      The engine run results are loaded below. Review the output — if anything looks off, go back and run the engine again before confirming. Once you confirm, these numbers gate the advance to Proposal.
    </Guide>
  ),
};