// src/components/events/IntelligenceTab.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Engagement Intelligence Report — historical data entry + gap analysis + PDF export
// Drops into EventCommand as a new tab. Data saves to events/{eventId}/intelligence_data
// Check-in data auto-pulled from top-level check_ins collection via event name match
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import {
  collection, doc, getDoc, getDocs, setDoc, query, where
} from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "../../firebase";
import { theme } from "../../theme";

// ─── Industry Benchmarks (research-backed) ───────────────────────────────────
const BENCHMARKS = {
  staffing_ratio: 75,           // 1 staff per 75 attendees (tech conference standard)
  healthy_dropoff_max: 0.20,    // 20% max acceptable drop-off
  healthy_dropoff_label: "10–20%",
  recruitment_window_ideal: 180, // days — 6 months out
  recruitment_window_warn: 90,   // days — under 90 is compressed
  orientation_window_ideal: 60,  // days before event
  buffer_recruitment: 0.20,      // recruit 15–20% more than needed
  sources: [
    "Event Staffing Agency Calculator (Premier Staff, 2025)",
    "Volunteer Recruitment Strategy Best Practices (Eventeny, 2025)",
    "Nonprofit Volunteer Management Best Practices (SignUpGenius, 2026)",
    "How to Determine the Proper Size for an Event Team (Everwall, 2023)",
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => n?.toLocaleString() ?? "—";
const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const daysBetween = (a, b) => {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
};

const EMPTY_YEAR = {
  year: "",
  engagement_date: "",
  orientation_date: "",
  event_date: "",
  applications: "",
  confirmed: "",
  day_of_show: "",
  leadership_score: "",
  leadership_notes: "",
  operational_gaps: "",
};

// ─── Gap Analysis Engine ──────────────────────────────────────────────────────
function analyzeYear(row, attendees) {
  const apps = parseInt(row.applications) || 0;
  const shown = parseInt(row.day_of_show) || 0;
  const dropoff = apps > 0 ? (apps - shown) / apps : null;
  const attn = parseInt(attendees) || 0;
  const staffingNeed = attn > 0 ? Math.ceil(attn / BENCHMARKS.staffing_ratio) : null;
  const staffingGap = staffingNeed !== null ? staffingNeed - shown : null;
  const engToEvent = daysBetween(row.engagement_date, row.event_date);
  const oriToEvent = daysBetween(row.orientation_date, row.event_date);
  const timelineCompressed = engToEvent !== null && engToEvent < BENCHMARKS.recruitment_window_warn;
  const oriCompressed = oriToEvent !== null && oriToEvent < BENCHMARKS.orientation_window_ideal;
  const lScore = parseInt(row.leadership_score) || null;

  return {
    dropoff,
    dropoffExcessive: dropoff !== null && dropoff > BENCHMARKS.healthy_dropoff_max,
    staffingNeed,
    staffingGap,
    understaffed: staffingGap !== null && staffingGap > 0,
    engToEvent,
    oriToEvent,
    timelineCompressed,
    oriCompressed,
    lScore,
    leadershipWeak: lScore !== null && lScore <= 2,
  };
}

// ─── Color helpers ────────────────────────────────────────────────────────────
const GAP_RED    = "#C0392B";
const GAP_YELLOW = "#8a6800";
const GAP_GREEN  = "#2d7a46";
const GAP_SOFT   = (c) => c + "14";

function GapBadge({ ok, warn, label }) {
  const color = ok ? GAP_GREEN : warn ? GAP_YELLOW : GAP_RED;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: GAP_SOFT(color), color, border: `1px solid ${color}44`,
      whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function MetricRow({ label, value, sub, badge }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "9px 0", borderBottom: `1px solid ${theme.border}`,
    }}>
      <div>
        <div style={{ fontSize: 13, color: theme.text, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {value && <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{value}</span>}
        {badge}
      </div>
    </div>
  );
}

// ─── PDF Generator ────────────────────────────────────────────────────────────
function generatePDF({ event, historicalData, checkInData, attendees }) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = pdf.internal.pageSize.width;
  const H = pdf.internal.pageSize.height;
  const GREEN = [28, 74, 54];
  const GOLD  = [201, 160, 48];
  const LIGHT = [247, 244, 234];

  // ── Cover header ──
  pdf.setFillColor(...GREEN);
  pdf.rect(0, 0, W, 110, "F");

  pdf.setFillColor(...GOLD);
  pdf.rect(0, 110, W, 4, "F");

  pdf.setTextColor(...GOLD);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.text("MOTION & METHOD  |  ENGAGEMENT INTELLIGENCE REPORT", 40, 30);

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(22);
  pdf.setFont("helvetica", "bold");
  pdf.text(event.name || "Event Intelligence Report", 40, 62);

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(220, 220, 200);
  pdf.text(
    `${event.client || ""}  |  Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    40, 82
  );

  pdf.setFontSize(9);
  pdf.setTextColor(180, 180, 160);
  pdf.text("CONFIDENTIAL - PREPARED BY M&M OPERATIONS FOR CLIENT REVIEW", 40, 100);

  let y = 130;

  // ── Helper: section heading ──
  const sectionHead = (title, desc) => {
    if (y > H - 100) { pdf.addPage(); y = 50; }
    pdf.setFillColor(...GREEN);
    pdf.rect(40, y, W - 80, 28, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text(title, 52, y + 18);
    y += 36;
    if (desc) {
      pdf.setTextColor(80, 80, 80);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      const lines = pdf.splitTextToSize(desc, W - 80);
      pdf.text(lines, 40, y);
      y += lines.length * 12 + 6;
    }
  };

  const kv = (label, val, color) => {
    if (y > H - 60) { pdf.addPage(); y = 50; }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);
    pdf.text(label.toUpperCase(), 40, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...(color || [30, 30, 30]));
    pdf.text(String(val ?? "—"), 200, y);
    y += 16;
  };

  // ── Section 1: Engagement Overview ──
  sectionHead("01  ENGAGEMENT OVERVIEW");
  kv("Event", event.name || "—");
  kv("Client", event.client || "—");
  kv("Location", event.location || "—");
  kv("Projected Attendance", fmt(parseInt(attendees)));
  kv("Years of Data", `${historicalData.length} year(s)`);
  kv("M&M Role", "Operations Management - Volunteer Recruitment, Staffing & Floor Execution");
  y += 10;

  // ── Section 2: Application & Recruitment Analysis ──
  sectionHead(
    "02  APPLICATION & RECRUITMENT ANALYSIS",
    "Year-over-year breakdown of application volume, confirmed crew, and day-of show rate. Industry benchmark: healthy drop-off is 10-20%. Above 20% indicates a systemic engagement gap."
  );

  const tableRows = historicalData.map((row) => {
    const apps = parseInt(row.applications) || 0;
    const conf = parseInt(row.confirmed) || 0;
    const shown = parseInt(row.day_of_show) || 0;
    const drop = apps > 0 ? `${Math.round(((apps - shown) / apps) * 100)}%` : "—";
    const flag = apps > 0 && (apps - shown) / apps > BENCHMARKS.healthy_dropoff_max ? "EXCESSIVE" : "OK";
    return [row.year || "—", fmt(apps), fmt(conf), fmt(shown), drop, flag];
  });

  autoTable(pdf, {
    head: [["Year", "Applications", "Confirmed", "Day-Of Show", "Drop-Off Rate", "Status"]],
    body: tableRows,
    startY: y,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      4: { fontStyle: "bold" },
      5: { fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        if (data.cell.raw?.includes("EXCESSIVE")) {
          data.cell.styles.textColor = [192, 57, 43];
        } else {
          data.cell.styles.textColor = [45, 122, 70];
        }
      }
    },
    margin: { left: 40, right: 40 },
  });
  y = pdf.lastAutoTable.finalY + 20;

  // Benchmark callout — recruitment
  pdf.setFillColor(...LIGHT);
  pdf.roundedRect(40, y, W - 80, 30, 4, 4, "F");
  pdf.setTextColor(...GREEN);
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "bold");
  pdf.text("INDUSTRY BENCHMARK", 52, y + 10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(60, 60, 60);
  pdf.text(
    pdf.splitTextToSize(
      `Healthy drop-off: ${BENCHMARKS.healthy_dropoff_label}  |  Recruitment buffer: +15-20% above target  |  Source: Premier Staff, Eventeny, SignUpGenius (2025-2026)`,
      W - 110
    ),
    52, y + 20
  );
  y += 44;

  // ── Section 3: Timeline Analysis — new landscape page for breathing room ──
  pdf.addPage("letter", "landscape");
  const LW = pdf.internal.pageSize.width;
  let ly = 50;

  // Section header on landscape page
  pdf.setFillColor(...GREEN);
  pdf.rect(40, ly, LW - 80, 28, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("03  TIMELINE ANALYSIS", 52, ly + 18);
  ly += 36;

  pdf.setTextColor(80, 80, 80);
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  const tlDesc = "Optimal recruitment begins 6 months before event. First orientation should be 60+ days out to allow attrition recovery. Compressed timelines directly correlate with elevated drop-off.";
  const tlLines = pdf.splitTextToSize(tlDesc, LW - 80);
  pdf.text(tlLines, 40, ly);
  ly += tlLines.length * 12 + 8;

  const timelineRows = historicalData.map((row) => {
    const engToEvt = daysBetween(row.engagement_date, row.event_date);
    const oriToEvt = daysBetween(row.orientation_date, row.event_date);
    const flag = engToEvt !== null && engToEvt < BENCHMARKS.recruitment_window_warn ? "COMPRESSED" : "Within Range";
    return [
      row.year || "—",
      row.engagement_date ? `${row.engagement_date}\n(${engToEvt !== null ? engToEvt + "d to event" : "—"})` : "—",
      row.orientation_date ? `${row.orientation_date}\n(${oriToEvt !== null ? oriToEvt + "d to event" : "—"})` : "—",
      row.event_date || "—",
      flag,
    ];
  });

  // Landscape usable width: 792 - 80 margins = 712pt
  autoTable(pdf, {
    head: [["Year", "Engagement Start", "First Orientation", "Event Date", "Status"]],
    body: timelineRows,
    startY: ly,
    tableWidth: 712,
    styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak" },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 50 },   // Year
      1: { cellWidth: 175 },  // Engagement Start
      2: { cellWidth: 175 },  // First Orientation
      3: { cellWidth: 175 },  // Event Date
      4: { cellWidth: 137 },  // Status — fills remaining space
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = data.cell.raw === "COMPRESSED"
          ? [192, 57, 43]
          : [45, 122, 70];
      }
    },
    margin: { left: 40, right: 40 },
  });
  ly = pdf.lastAutoTable.finalY + 14;

  // Benchmark callout on landscape page
  pdf.setFillColor(...LIGHT);
  pdf.roundedRect(40, ly, LW - 80, 30, 4, 4, "F");
  pdf.setTextColor(...GREEN);
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "bold");
  pdf.text("INDUSTRY BENCHMARK", 52, ly + 10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(60, 60, 60);
  pdf.text(
    "Ideal engagement start: 6 months (180 days) before event  |  First orientation: minimum 60 days before  |  Source: Eventeny (2025)",
    52, ly + 21
  );

  // Back to portrait for remaining sections
  pdf.addPage("letter", "portrait");
  y = 50;

  // Benchmark callout
  pdf.setFillColor(...LIGHT);
  pdf.roundedRect(40, y, W - 80, 36, 4, 4, "F");
  pdf.setTextColor(...GREEN);
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  pdf.text("INDUSTRY BENCHMARK", 52, y + 12);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(60, 60, 60);
  pdf.text(
    "Ideal engagement start: 6 months (180 days) before event  |  First orientation: minimum 60 days before  |  Source: Eventeny (2025)",
    52, y + 24
  );
  y += 50;

  // ── Section 4: Leadership Engagement Index ──
  if (y > H - 120) { pdf.addPage(); y = 50; }
  sectionHead(
    "04  LEADERSHIP ENGAGEMENT INDEX",
    "Leadership presence and responsiveness directly impact crew performance, no-show recovery, and day-of operational outcomes. Scored 1-5 by M&M based on observed engagement across the planning cycle."
  );

  const leaderRows = historicalData.map((row) => {
    const score = parseInt(row.leadership_score) || 0;
    const label =
      score >= 4 ? "Strong" :
      score === 3 ? "Adequate" :
      score >= 1 ? "Weak" : "Not Scored";
    return [
      row.year || "—",
      score > 0 ? `${score} / 5` : "—",
      label,
      row.leadership_notes || "—",
    ];
  });

  autoTable(pdf, {
    head: [["Year", "Score", "Rating", "Observed Notes"]],
    body: leaderRows,
    startY: y,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: { 3: { cellWidth: 220 } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        data.cell.styles.fontStyle = "bold";
        if (data.cell.raw === "Weak") data.cell.styles.textColor = [192, 57, 43];
        else if (data.cell.raw === "Adequate") data.cell.styles.textColor = [138, 104, 0];
        else if (data.cell.raw === "Strong") data.cell.styles.textColor = [45, 122, 70];
      }
    },
    margin: { left: 40, right: 40 },
  });
  y = pdf.lastAutoTable.finalY + 20;

  // ── Section 5: Operational Gap Summary ──
  if (y > H - 140) { pdf.addPage(); y = 50; }
  sectionHead(
    "05  OPERATIONAL GAP SUMMARY",
    "Documented gaps from each engagement cycle and their operational impact. These are patterns, not anomalies - and patterns have solutions."
  );

  const gapRows = historicalData
    .filter(r => r.operational_gaps)
    .map(r => [r.year || "—", r.operational_gaps]);

  if (gapRows.length > 0) {
    autoTable(pdf, {
      head: [["Year", "Documented Gaps & Operational Impact"]],
      body: gapRows,
      startY: y,
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 1: { cellWidth: 380 } },
      margin: { left: 40, right: 40 },
    });
    y = pdf.lastAutoTable.finalY + 20;
  } else {
    pdf.setFontSize(10);
    pdf.setTextColor(120, 120, 120);
    pdf.text("No operational gap notes recorded.", 40, y);
    y += 20;
  }

  // ── Section 6: Last Year Check-In Data ──
  if (checkInData.length > 0) {
    if (y > H - 120) { pdf.addPage(); y = 50; }
    sectionHead(
      "06  CHECK-IN DATA - MOST RECENT YEAR",
      "Actual check-in records from the most recent engagement. This data is pulled directly from Axis and represents ground truth for day-of show rate."
    );

    const ciRows = checkInData.slice(0, 50).map(r => [
      `${r.first_name || ""} ${r.last_name || ""}`.trim() || "—",
      r.role || "—",
      r.status || "—",
      r.timestamp
        ? new Date(r.timestamp?.toDate ? r.timestamp.toDate() : r.timestamp)
            .toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "—",
    ]);

    autoTable(pdf, {
      head: [["Name", "Role", "Status", "Check-In Time"]],
      body: ciRows,
      startY: y,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: LIGHT },
      margin: { left: 40, right: 40 },
    });
    y = pdf.lastAutoTable.finalY + 16;

    if (checkInData.length > 50) {
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`Showing first 50 of ${checkInData.length} records.`, 40, y);
      y += 14;
    }
  }

  // ── Section 7: Staffing Requirements vs Actuals ──
  if (y > H - 140) { pdf.addPage(); y = 50; }
  sectionHead(
    "07  STAFFING REQUIREMENTS VS ACTUALS",
    `Industry standard for tech conferences: 1 operations staff per ${BENCHMARKS.staffing_ratio} attendees. The gap between what was needed and what showed is the measurable cost of the current approach.`
  );

  const attInt = parseInt(attendees) || 0;
  const reqStaff = attInt > 0 ? Math.ceil(attInt / BENCHMARKS.staffing_ratio) : 0;
  const staffRows = historicalData.map(row => {
    const shown = parseInt(row.day_of_show) || 0;
    const gap = reqStaff > 0 ? reqStaff - shown : 0;
    return [
      row.year || "—",
      fmt(attInt),
      fmt(reqStaff),
      fmt(shown),
      gap > 0 ? `${fmt(gap)} short` : "Covered",
      gap > 0 ? "UNDERSTAFFED" : "OK",
    ];
  });

  autoTable(pdf, {
    head: [["Year", "Projected Attendees", "Staff Required", "Day-Of Show", "Gap", "Status"]],
    body: staffRows,
    startY: y,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        data.cell.styles.fontStyle = "bold";
        if (data.cell.raw?.includes("UNDER")) data.cell.styles.textColor = [192, 57, 43];
        else data.cell.styles.textColor = [45, 122, 70];
      }
    },
    margin: { left: 40, right: 40 },
  });
  y = pdf.lastAutoTable.finalY + 20;

  // ── Section 8: Forward Recommendation ──
  if (y > H - 180) { pdf.addPage(); y = 50; }
  sectionHead("08  WHAT CHANGES WITH M&M PROPERLY ENGAGED");

  const recommendations = [
    ["Recruitment Timeline", "Engagement begins 6 months out. Applications open 4 months out. Confirmations locked 8 weeks before event date."],
    ["Drop-Off Science Applied", "Target pool sized at 120-130% of need. Structured engagement cadence through orientation, check-in, confirmation, and reminder stages keeps confirmed crew engaged through event day."],
    ["Staffing Coverage", `For ${fmt(attInt)} projected attendees, M&M targets ${fmt(reqStaff)} floor staff minimum - with a ${Math.round(BENCHMARKS.buffer_recruitment * 100)}% recruitment buffer built in.`],
    ["Leadership Accountability", "Named point of contact with decision authority confirmed at engagement start. Weekly check-in cadence through event date. Day-of presence required."],
    ["System of Record", "Every application, confirmation, check-in, and incident logged in Axis. Post-event intelligence report generated automatically. No more guessing what happened."],
  ];

  recommendations.forEach(([title, body]) => {
    if (y > H - 80) { pdf.addPage(); y = 50; }
    pdf.setFillColor(...LIGHT);
    pdf.roundedRect(40, y, W - 80, 44, 4, 4, "F");
    pdf.setFillColor(...GREEN);
    pdf.roundedRect(40, y, 4, 44, 2, 2, "F");
    pdf.setTextColor(...GREEN);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.text(title, 52, y + 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(60, 60, 60);
    const lines = pdf.splitTextToSize(body, W - 100);
    pdf.text(lines, 52, y + 26);
    y += 52;
  });

  // ── Footer on all pages ──
  const pageCount = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFillColor(...GREEN);
    pdf.rect(0, H - 28, W, 28, "F");
    pdf.setTextColor(...GOLD);
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.text("MOTION & METHOD OPERATIONS  |  CONFIDENTIAL", 40, H - 12);
    pdf.setTextColor(200, 200, 180);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Page ${i} of ${pageCount}  |  Generated ${new Date().toLocaleDateString()}`, W - 40, H - 12, { align: "right" });
  }

  pdf.save(`MM_Intelligence_${(event.name || "Event").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function IntelligenceTab({ event, eventId }) {
  const [historicalData, setHistoricalData] = useState([{ ...EMPTY_YEAR }]);
  const [checkInData, setCheckInData]       = useState([]);
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [saved, setSaved]                   = useState(false);
  const [exporting, setExporting]           = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const attendees = event?.attendee_count || "";

  // Load saved intelligence data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "events", eventId, "intelligence_data", "history"));
        if (snap.exists()) {
          const data = snap.data();
          if (data.years?.length > 0) setHistoricalData(data.years);
        }
      } catch (e) {
        console.error("Intelligence load error:", e);
      }
      setLoading(false);
    };
    load();
  }, [eventId]);

  // Auto-pull check-in data
  useEffect(() => {
    const pullCheckIns = async () => {
      if (!event?.name) return;
      setCheckInLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, "check_ins"), where("event", "==", event.name))
        );
        setCheckInData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Check-in pull error:", e);
      }
      setCheckInLoading(false);
    };
    pullCheckIns();
  }, [event?.name]);

  const updateRow = (idx, field, value) => {
    setHistoricalData(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addYear = () => setHistoricalData(prev => [...prev, { ...EMPTY_YEAR }]);

  const removeYear = (idx) => {
    if (historicalData.length <= 1) return;
    setHistoricalData(prev => prev.filter((_, i) => i !== idx));
  };

  const saveData = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "events", eventId, "intelligence_data", "history"), {
        years: historicalData,
        updated_at: new Date().toISOString(),
        event_name: event.name,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error("Save error:", e);
    }
    setSaving(false);
  };

  const handleExport = () => {
    setExporting(true);
    try {
      generatePDF({ event, historicalData, checkInData, attendees });
    } catch (e) {
      console.error("PDF error:", e);
      alert("Error generating PDF. Check console.");
    }
    setExporting(false);
  };

  // Aggregate stats across all years for the summary bar
  const totalApps  = historicalData.reduce((s, r) => s + (parseInt(r.applications) || 0), 0);
  const totalShown = historicalData.reduce((s, r) => s + (parseInt(r.day_of_show) || 0), 0);
  const avgDropoff = totalApps > 0 ? ((totalApps - totalShown) / totalApps) : null;
  const attnInt    = parseInt(attendees) || 0;
  const staffNeed  = attnInt > 0 ? Math.ceil(attnInt / BENCHMARKS.staffing_ratio) : null;

  if (loading) return (
    <div style={{ padding: "40px 0", textAlign: "center", color: theme.textMuted, fontSize: 13 }}>
      Loading intelligence data…
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header bar */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        padding: "18px 20px", borderRadius: 12,
        background: theme.primary, gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: theme.accent, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
            Engagement Intelligence
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display', serif", marginBottom: 4 }}>
            {event.name}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            {historicalData.length} year{historicalData.length !== 1 ? "s" : ""} of data
            {checkInLoading ? " · Loading check-ins…" : checkInData.length > 0 ? ` · ${checkInData.length} check-in records (last year)` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={saveData}
            disabled={saving}
            style={{
              padding: "9px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              background: saved ? GAP_GREEN : "rgba(255,255,255,0.15)",
              color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
            }}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save Data"}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || historicalData.every(r => !r.year)}
            style={{
              padding: "9px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              background: theme.accent, color: theme.primary,
              fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            }}>
            {exporting ? "Generating…" : "⬇ Export PDF Report"}
          </button>
        </div>
      </div>

      {/* Summary stats bar */}
      {totalApps > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
        }}>
          {[
            {
              label: "Total Applications",
              value: fmt(totalApps),
              sub: `across ${historicalData.length} year${historicalData.length !== 1 ? "s" : ""}`,
              ok: true,
            },
            {
              label: "Total Day-Of Show",
              value: fmt(totalShown),
              sub: pct(totalShown, totalApps) + " of applicants",
              ok: null,
            },
            {
              label: "Avg Drop-Off Rate",
              value: avgDropoff !== null ? `${Math.round(avgDropoff * 100)}%` : "—",
              sub: `Benchmark: ${BENCHMARKS.healthy_dropoff_label}`,
              ok: avgDropoff !== null && avgDropoff <= BENCHMARKS.healthy_dropoff_max,
              warn: false,
              bad: avgDropoff !== null && avgDropoff > BENCHMARKS.healthy_dropoff_max,
            },
            {
              label: "Staff Required (Current Year)",
              value: staffNeed ? fmt(staffNeed) : "—",
              sub: attendees ? `1 per ${BENCHMARKS.staffing_ratio} of ${fmt(attnInt)} attendees` : "Enter attendee count in event",
              ok: null,
            },
          ].map((stat, i) => (
            <div key={i} style={{
              padding: "14px 16px", borderRadius: 10, background: "#fff",
              border: `1.5px solid ${stat.bad ? GAP_RED + "44" : theme.border}`,
              background: stat.bad ? GAP_SOFT(GAP_RED) : "#fff",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.bad ? GAP_RED : theme.primary, lineHeight: 1, marginBottom: 3 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Historical data entry */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${theme.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: theme.background,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>Historical Data Entry</div>
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
              Enter year-by-year data. Most recent year first. Check-in data for the most recent year is auto-pulled from Axis.
            </div>
          </div>
          <button onClick={addYear} style={{
            padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${theme.primary}`,
            background: "transparent", color: theme.primary, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>
            + Add Year
          </button>
        </div>

        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>
          {historicalData.map((row, idx) => {
            const analysis = analyzeYear(row, attendees);
            return (
              <div key={idx} style={{
                borderRadius: 10, border: `1.5px solid ${theme.border}`,
                overflow: "hidden",
              }}>
                {/* Year header */}
                <div style={{
                  padding: "10px 16px", background: theme.primary,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                    {row.year ? `Year ${row.year}` : `Year ${idx + 1} — enter year below`}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {analysis.dropoff !== null && (
                      <GapBadge
                        ok={!analysis.dropoffExcessive}
                        label={`${Math.round(analysis.dropoff * 100)}% drop-off`}
                      />
                    )}
                    {analysis.timelineCompressed && (
                      <GapBadge ok={false} label="Timeline compressed" />
                    )}
                    {historicalData.length > 1 && (
                      <button onClick={() => removeYear(idx)} style={{
                        background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer",
                        color: "#fff", fontSize: 12, borderRadius: 6, padding: "3px 8px",
                        fontFamily: "'DM Sans', sans-serif",
                      }}>Remove</button>
                    )}
                  </div>
                </div>

                <div style={{ padding: "16px" }}>
                  {/* Row 1: year + dates */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <FieldInput label="Year *" placeholder="e.g. 2024"
                      value={row.year} onChange={v => updateRow(idx, "year", v)} />
                    <FieldInput label="Engagement Date" placeholder="YYYY-MM-DD" type="date"
                      value={row.engagement_date} onChange={v => updateRow(idx, "engagement_date", v)} />
                    <FieldInput label="First Orientation" placeholder="YYYY-MM-DD" type="date"
                      value={row.orientation_date} onChange={v => updateRow(idx, "orientation_date", v)} />
                    <FieldInput label="Event Date" placeholder="YYYY-MM-DD" type="date"
                      value={row.event_date} onChange={v => updateRow(idx, "event_date", v)} />
                  </div>

                  {/* Row 2: numbers */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <FieldInput label="Applications Received" placeholder="e.g. 350" type="number"
                      value={row.applications} onChange={v => updateRow(idx, "applications", v)} />
                    <FieldInput label="Confirmed / Onboarded" placeholder="e.g. 80" type="number"
                      value={row.confirmed} onChange={v => updateRow(idx, "confirmed", v)} />
                    <FieldInput label="Day-Of Show Count" placeholder="e.g. 55" type="number"
                      value={row.day_of_show} onChange={v => updateRow(idx, "day_of_show", v)} />
                    <div>
                      <label style={labelStyle}>Leadership Score (1–5)</label>
                      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => updateRow(idx, "leadership_score", String(n))}
                            style={{
                              flex: 1, padding: "7px 0", borderRadius: 6, cursor: "pointer",
                              border: `1px solid ${parseInt(row.leadership_score) === n ? theme.primary : theme.border}`,
                              background: parseInt(row.leadership_score) === n ? theme.primary : "#fff",
                              color: parseInt(row.leadership_score) === n ? "#fff" : theme.textMuted,
                              fontSize: 12, fontWeight: 700, transition: "all 0.1s",
                              fontFamily: "'DM Sans', sans-serif",
                            }}>{n}</button>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 4 }}>
                        {row.leadership_score === "1" ? "No engagement" :
                         row.leadership_score === "2" ? "Minimal" :
                         row.leadership_score === "3" ? "Adequate" :
                         row.leadership_score === "4" ? "Active" :
                         row.leadership_score === "5" ? "Exemplary" : "Not scored"}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: text fields */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Leadership Notes</label>
                      <textarea value={row.leadership_notes}
                        onChange={e => updateRow(idx, "leadership_notes", e.target.value)}
                        placeholder="Point of contact authority level, responsiveness, day-of presence…"
                        rows={3} style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Operational Gaps & Impact</label>
                      <textarea value={row.operational_gaps}
                        onChange={e => updateRow(idx, "operational_gaps", e.target.value)}
                        placeholder="Coverage scrambles, zone failures, no-show impact, what it cost them operationally…"
                        rows={3} style={textareaStyle} />
                    </div>
                  </div>

                  {/* Gap analysis inline */}
                  {(analysis.dropoff !== null || analysis.engToEvent !== null) && (
                    <div style={{
                      marginTop: 12, padding: "12px 14px", borderRadius: 8,
                      background: theme.background, border: `1px solid ${theme.border}`,
                      display: "flex", gap: 20, flexWrap: "wrap",
                    }}>
                      {analysis.dropoff !== null && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Drop-Off Rate</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: analysis.dropoffExcessive ? GAP_RED : GAP_GREEN }}>
                            {Math.round(analysis.dropoff * 100)}%
                          </div>
                          <div style={{ fontSize: 10, color: theme.textMuted }}>
                            Benchmark: {BENCHMARKS.healthy_dropoff_label}
                          </div>
                        </div>
                      )}
                      {analysis.engToEvent !== null && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Engagement → Event</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: analysis.timelineCompressed ? GAP_RED : GAP_GREEN }}>
                            {analysis.engToEvent}d
                          </div>
                          <div style={{ fontSize: 10, color: theme.textMuted }}>Ideal: 180d</div>
                        </div>
                      )}
                      {analysis.oriToEvent !== null && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Orientation → Event</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: analysis.oriCompressed ? GAP_YELLOW : GAP_GREEN }}>
                            {analysis.oriToEvent}d
                          </div>
                          <div style={{ fontSize: 10, color: theme.textMuted }}>Ideal: 60d+</div>
                        </div>
                      )}
                      {analysis.staffingNeed !== null && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Staffing Gap</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: analysis.understaffed ? GAP_RED : GAP_GREEN }}>
                            {analysis.understaffed ? `-${analysis.staffingGap}` : "Covered"}
                          </div>
                          <div style={{ fontSize: 10, color: theme.textMuted }}>
                            Need {fmt(analysis.staffingNeed)}, had {fmt(parseInt(row.day_of_show) || 0)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Check-in data preview */}
      {checkInData.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
          <div style={{
            padding: "12px 20px", borderBottom: `1px solid ${theme.border}`,
            background: theme.background, display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
                Axis Check-In Data — Most Recent Year
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                {checkInData.length} records auto-pulled from Axis · Included in PDF export
              </div>
            </div>
          </div>
          <div style={{ padding: "0", maxHeight: 240, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0 }}>
                <tr style={{ background: theme.primary }}>
                  {["Name", "Role", "Status", "Check-In Time"].map(h => (
                    <th key={h} style={{
                      padding: "8px 14px", textAlign: "left", color: "#fff",
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checkInData.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : theme.background, borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: "7px 14px", color: theme.text, fontWeight: 600 }}>
                      {`${r.first_name || ""} ${r.last_name || ""}`.trim() || "—"}
                    </td>
                    <td style={{ padding: "7px 14px", color: theme.textMuted }}>{r.role || "—"}</td>
                    <td style={{ padding: "7px 14px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        background: r.status === "Checked In" ? "rgba(45,122,70,0.1)" : theme.background,
                        color: r.status === "Checked In" ? GAP_GREEN : theme.textMuted,
                      }}>{r.status || "—"}</span>
                    </td>
                    <td style={{ padding: "7px 14px", color: theme.textMuted, fontSize: 11 }}>
                      {r.timestamp
                        ? new Date(r.timestamp?.toDate ? r.timestamp.toDate() : r.timestamp)
                            .toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Benchmarks reference */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${theme.border}`, background: theme.background }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>Industry Benchmarks</div>
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>Research-backed standards used for gap analysis and PDF report</div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <MetricRow
            label="Staffing ratio — tech conference"
            value="1 : 75 attendees"
            sub="General ops/guest services floor coverage"
            badge={<GapBadge ok label="Industry standard" />}
          />
          <MetricRow
            label="Acceptable drop-off rate"
            value="10–20%"
            sub="Plan for 10–20% attrition; recruit accordingly"
            badge={<GapBadge ok label="Benchmark range" />}
          />
          <MetricRow
            label="Ideal recruitment start"
            value="180 days out"
            sub="6 months: define needs, develop job descriptions"
            badge={<GapBadge ok label="Best practice" />}
          />
          <MetricRow
            label="First orientation window"
            value="60+ days out"
            sub="Enough lead time to absorb attrition before event"
            badge={<GapBadge ok label="Best practice" />}
          />
          <MetricRow
            label="Recruitment buffer"
            value="+15–20% over target"
            sub="If you need 100, recruit 115–120"
            badge={<GapBadge ok label="Best practice" />}
          />
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: theme.background, fontSize: 10, color: theme.textMuted, lineHeight: 1.6 }}>
            <strong>Sources:</strong> {BENCHMARKS.sources.join("  ·  ")}
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Small shared sub-components ─────────────────────────────────────────────
function FieldInput({ label, placeholder, value, onChange, type = "text" }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 10, fontWeight: 700,
  color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5,
};

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: "1.5px solid #E5E7EB", background: "#F9FAFB",
  color: "#1A1A1A", fontSize: 12, fontFamily: "'DM Sans', sans-serif",
  outline: "none", boxSizing: "border-box",
};

const textareaStyle = {
  ...inputStyle,
  resize: "vertical", minHeight: 72, lineHeight: 1.5,
};