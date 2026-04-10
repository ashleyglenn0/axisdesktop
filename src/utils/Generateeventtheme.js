/**
 * generateEventTheme.js
 *
 * Given up to 3 brand colors (primary, accent, background),
 * generates a full Axis-compatible theme object ready to write
 * to events/{id}.theme in Firestore.
 *
 * The mobile app merges this over AXIS_THEME, so only the keys
 * that differ from AXIS_THEME need to be present — but we write
 * all of them for clarity and forwards-compatibility.
 */

import tinycolor from "tinycolor2";

/**
 * Determines whether white or black text has better contrast on a given bg.
 */
function bestTextColor(bgHex) {
  const tc = tinycolor(bgHex);
  return tc.isLight() ? "#1A1A1A" : "#FFFFFF";
}

/**
 * Derives a muted version of the text color — lightened toward background.
 */
function mutedText(textHex, bgHex) {
  const blended = tinycolor.mix(textHex, bgHex, 45);
  return blended.toHexString();
}

/**
 * Generates a secondary color from primary:
 * - If primary is dark, lighten + desaturate slightly
 * - If primary is light, darken slightly
 */
function deriveSecondary(primaryHex) {
  const tc = tinycolor(primaryHex);
  if (tc.isDark()) {
    return tc.clone().lighten(20).desaturate(10).toHexString();
  }
  return tc.clone().darken(15).toHexString();
}

/**
 * Derives a soft surface color — very light tint of background,
 * or pure white if background is already light.
 */
function deriveSurface(bgHex) {
  const tc = tinycolor(bgHex);
  if (tc.isLight() && tc.getLuminance() > 0.9) return "#FFFFFF";
  return tinycolor.mix(bgHex, "#FFFFFF", 80).toHexString();
}

/**
 * Main export — generates a full theme object from 2-3 colors.
 *
 * @param {string} primary    — Required. Main brand color.
 * @param {string} accent     — Optional. Highlight/CTA color. Derived if omitted.
 * @param {string} background — Optional. Page background. Defaults to light tint of primary.
 * @returns {object}          — Full theme object compatible with Axis mobile EVENT_THEMES shape.
 */
export function generateEventTheme({ primary, accent, background }) {
  if (!primary || !tinycolor(primary).isValid()) {
    throw new Error("A valid primary color is required.");
  }

  const pri = tinycolor(primary);

  // ── Derive missing colors ────────────────────────────────────────────────

  // Background: if not provided, use a very light tint of primary
  const bg = background && tinycolor(background).isValid()
    ? background
    : pri.clone().lighten(55).desaturate(30).toHexString();

  // Accent: if not provided, derive a warm complementary tone
  const acc = accent && tinycolor(accent).isValid()
    ? accent
    : tinycolor({ h: (pri.toHsv().h + 150) % 360, s: 0.6, v: 0.9 }).toHexString();

  const secondary   = deriveSecondary(primary);
  const surface     = deriveSurface(bg);
  const text        = bestTextColor(bg);
  const textMuted   = mutedText(text, bg);
  const onPrimary   = bestTextColor(primary);
  const accentDark  = tinycolor(acc).clone().darken(15).toHexString();

  // Borders — primary at low opacity
  const border      = `rgba(${pri.toRgb().r},${pri.toRgb().g},${pri.toRgb().b},0.14)`;
  const borderStrong = `rgba(${pri.toRgb().r},${pri.toRgb().g},${pri.toRgb().b},0.28)`;

  // Soft backgrounds for status chips
  const softPrimary = `rgba(${pri.toRgb().r},${pri.toRgb().g},${pri.toRgb().b},0.08)`;
  const softAccent  = `rgba(${tinycolor(acc).toRgb().r},${tinycolor(acc).toRgb().g},${tinycolor(acc).toRgb().b},0.18)`;

  // Semantic colors — fixed, not event-branded
  const danger       = "#C0392B";
  const dangerSoft   = "rgba(192,57,43,0.1)";
  const warning      = "#E07B2A";
  const warningSoft  = "rgba(224,123,42,0.1)";
  const success      = "#58B06C";
  const successSoft  = "rgba(88,176,108,0.12)";

  return {
    // Brand
    primary,
    primaryDark:  pri.clone().darken(10).toHexString(),
    secondary,
    accent:       acc,
    accentDark,

    // Backgrounds
    background:   bg,
    surface,

    // Text
    text,
    textMuted,
    onPrimary,

    // Borders
    border,
    borderStrong,

    // Soft tints
    softPrimary,
    softAccent,

    // Semantic (fixed)
    danger,
    dangerSoft,
    warning,
    warningSoft,
    success,
    successSoft,
  };
}

/**
 * Returns a preview-friendly version of the theme for display in the UI.
 * Same as generateEventTheme but catches errors and returns null on invalid input.
 */
export function previewEventTheme({ primary, accent, background }) {
  try {
    if (!primary || primary.length < 4) return null;
    return generateEventTheme({ primary, accent, background });
  } catch {
    return null;
  }
}