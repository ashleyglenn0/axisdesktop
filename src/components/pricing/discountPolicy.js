// src/components/pricing/discountPolicy.js
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for discount authorization, shared by TierEngine and
// AdvisoryEngine. Previously each engine had its own separate "Standard/Strategic"
// discount block — same shape, duplicated, no policy of who can authorize what.
//
// Policy (as of this build):
//   Ops Discretion    — up to 5%,  one name (Senior Ops or either Founder)
//   Founder (single)  — up to 10%, one Founder alone
//   Founder (dual)    — up to 15%, BOTH Founders required (two distinct names)
// ─────────────────────────────────────────────────────────────────────────────

export const DISCOUNT_TIERS = [
  { id: "none",           label: "No discount",                                          max: 0,    authorizers: 0 },
  { id: "ops",             label: "Ops Discretion (≤5%) — Senior Ops or either Founder",  max: 0.05, authorizers: 1 },
  { id: "single_founder",  label: "Founder (≤10%) — either Founder alone",                max: 0.10, authorizers: 1 },
  { id: "dual_founder",    label: "Founder (≤15% max) — BOTH Founders required",          max: 0.15, authorizers: 2 },
];

export function getDiscountTier(id) {
  return DISCOUNT_TIERS.find(t => t.id === id) || DISCOUNT_TIERS[0];
}

// Any discount requires a reason, regardless of tier — a name on the record proves who
// approved it, not why. Kept short on purpose (this isn't the 20-char tier-override bar);
// enough to be a real answer to "why did we discount this," not a placeholder word.
export const DISCOUNT_REASON_MIN_LENGTH = 10;

// Shared validity check: is the discount properly authorized for submission?
// - "none": always valid (nothing to authorize)
// - 1-authorizer tiers: authorizer1 must be filled
// - 2-authorizer tiers (dual_founder): both authorizer1 and authorizer2 must be filled
//   AND must not be the same name (guards against someone typing one Founder's name twice)
// - any tier above "none": a reason of at least DISCOUNT_REASON_MIN_LENGTH characters is required
export function isDiscountAuthorized(discountType, authorizer1, authorizer2, reason) {
  const tier = getDiscountTier(discountType);
  if (tier.id === "none") return true;
  if (!authorizer1 || authorizer1.trim().length === 0) return false;
  if (!reason || reason.trim().length < DISCOUNT_REASON_MIN_LENGTH) return false;
  if (tier.authorizers < 2) return true;
  if (!authorizer2 || authorizer2.trim().length === 0) return false;
  return authorizer1.trim().toLowerCase() !== authorizer2.trim().toLowerCase();
}