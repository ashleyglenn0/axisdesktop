import { useState } from "react";
import { theme } from "../theme";

export const Badge = ({ children, color, bg }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    padding: "3px 10px", borderRadius: 999,
    fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
    background: bg || `${color || theme.primary}18`,
    color: color || theme.primary,
    border: `1px solid ${color || theme.primary}30`,
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: "nowrap",
  }}>{children}</span>
);

export const Button = ({ children, variant = "primary", size = "md", style = {}, disabled, ...props }) => {
  const [hov, setHov] = useState(false);
  const isPrimary  = variant === "primary";
  const isGhost    = variant === "ghost";
  const isDanger   = variant === "danger";
  const isOutline  = variant === "outline";

  const bg = isPrimary ? (hov ? theme.primaryDark : theme.primary)
           : isDanger  ? (hov ? "#a93226" : theme.danger)
           : isGhost   ? (hov ? "rgba(28,74,54,0.07)" : "transparent")
           : isOutline ? (hov ? "rgba(28,74,54,0.05)" : "transparent")
           : "transparent";

  const color = isPrimary || isDanger ? theme.onPrimary : theme.primary;
  const border = isOutline ? `1.5px solid ${theme.borderStrong}`
               : isGhost   ? "none"
               : "none";

  const pad = size === "sm" ? "7px 14px" : size === "lg" ? "14px 24px" : "10px 18px";
  const fs  = size === "sm" ? 12 : size === "lg" ? 15 : 13;

  return (
    <button
      {...props}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: bg, color, border, padding: pad, borderRadius: 8,
        fontSize: fs, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.02em",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s ease",
        display: "inline-flex", alignItems: "center", gap: 6,
        ...style,
      }}
    >{children}</button>
  );
};

export const Card = ({ children, style = {}, onClick, padded = true }) => {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => onClick && setHov(true)}
      onMouseLeave={() => onClick && setHov(false)}
      style={{
        background: theme.surface,
        border: `1px solid ${hov ? theme.borderStrong : theme.border}`,
        borderRadius: 12,
        padding: padded ? "20px 22px" : 0,
        boxShadow: hov ? "0 8px 32px rgba(17,24,39,0.1)" : "0 2px 8px rgba(17,24,39,0.05)",
        transform: hov && onClick ? "translateY(-1px)" : "none",
        transition: "all 0.18s ease",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >{children}</div>
  );
};

export const Input = ({ label, style = {}, inputStyle = {}, ...props }) => {
  const [foc, setFoc] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</label>}
      <input
        {...props}
        onFocus={() => setFoc(true)}
        onBlur={() => setFoc(false)}
        style={{
          padding: "10px 12px", borderRadius: 8, fontSize: 14,
          border: `1.5px solid ${foc ? theme.primary : theme.border}`,
          background: theme.offWhite, color: theme.text, outline: "none",
          fontFamily: "'DM Sans', sans-serif",
          boxShadow: foc ? `0 0 0 3px rgba(28,74,54,0.08)` : "none",
          transition: "all 0.15s ease",
          ...inputStyle,
        }}
      />
    </div>
  );
};

export const Textarea = ({ label, style = {}, ...props }) => {
  const [foc, setFoc] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</label>}
      <textarea
        {...props}
        onFocus={() => setFoc(true)}
        onBlur={() => setFoc(false)}
        style={{
          padding: "10px 12px", borderRadius: 8, fontSize: 14,
          border: `1.5px solid ${foc ? theme.primary : theme.border}`,
          background: theme.offWhite, color: theme.text, outline: "none",
          fontFamily: "'DM Sans', sans-serif", resize: "vertical", minHeight: 80,
          boxShadow: foc ? `0 0 0 3px rgba(28,74,54,0.08)` : "none",
          transition: "all 0.15s ease",
        }}
      />
    </div>
  );
};

export const Spinner = ({ size = 20 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%",
    border: `2px solid ${theme.border}`,
    borderTopColor: theme.primary,
    animation: "spin 0.7s linear infinite",
  }} />
);

export const EmptyState = ({ icon = "◆", title, subtitle }) => (
  <div style={{ textAlign: "center", padding: "48px 24px" }}>
    <div style={{ fontSize: 28, marginBottom: 12, color: theme.border }}>{icon}</div>
    <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, marginBottom: 6 }}>{title}</div>
    {subtitle && <div style={{ fontSize: 13, color: theme.textMuted }}>{subtitle}</div>}
  </div>
);

export const SectionHeader = ({ title, subtitle, action }) => (
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
    <div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif", letterSpacing: "-0.02em" }}>{title}</h2>
      {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.textMuted }}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const LifecyclePill = ({ status }) => {
  const colors = {
    intake_received:         { bg: "rgba(224,123,42,0.1)",  color: "#E07B2A" },
    awaiting_qualification:  { bg: "rgba(224,123,42,0.1)",  color: "#E07B2A" },
    approved_for_discovery:  { bg: "rgba(28,74,54,0.1)",    color: theme.primary },
    discovery_complete:      { bg: "rgba(28,74,54,0.1)",    color: theme.primary },
    track_assigned:          { bg: "rgba(88,176,108,0.12)", color: "#2d7a46" },
    pricing_approved:        { bg: "rgba(88,176,108,0.12)", color: "#2d7a46" },
    proposal_sent:           { bg: "rgba(235,199,100,0.2)", color: "#8a6800" },
    active:                  { bg: "rgba(88,176,108,0.15)", color: "#2d7a46" },
    delivery:                { bg: "rgba(88,176,108,0.15)", color: "#2d7a46" },
    complete:                { bg: "rgba(28,74,54,0.08)",   color: theme.textMuted },
    declined:                { bg: theme.dangerSoft,         color: theme.danger },
  };
  const s = String(status || "").toLowerCase();
  const c = colors[s] || { bg: theme.border, color: theme.textMuted };
  const label = s.replaceAll("_", " ").replace(/\b\w/g, l => l.toUpperCase());
  return <Badge bg={c.bg} color={c.color}>{label}</Badge>;
};
