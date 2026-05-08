import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import {
  generateEventTheme,
  previewEventTheme,
} from "../utils/generateEventTheme";
import { Card, Button, Badge, Spinner, EmptyState } from "../components/UI";
import IntelligenceTab from "../components/events/IntelligenceTab";

const CHECKLISTS = {
  P1: [
    {
      section: "Pre-Engagement",
      items: [
        { key: "agreement_sent", label: "Agreement sent" },
        { key: "agreement_signed", label: "Agreement signed" },
        { key: "intake_complete", label: "Intake form completed" },
      ],
    },
    {
      section: "Recruiting & Talent",
      items: [
        { key: "recruiting_link_sent", label: "Recruiting app link sent out" },
        { key: "onboarding_complete", label: "Onboarding completed" },
      ],
    },
    {
      section: "Venue & Floor Planning",
      items: [
        {
          key: "venue_poc_confirmed",
          label: "Venue / event ops POC confirmed",
        },
        {
          key: "venue_walkthrough",
          label: "Venue walkthrough completed",
          required: true,
          note: "Staffing cannot begin without this",
        },
        {
          key: "floor_config_complete",
          label: "Floor + zone configuration built in Axis App Setup",
          required: true,
          note: "Required before shifts can be created",
        },
        {
          key: "run_of_show_received",
          label: "Run of show received from client",
        },
        {
          key: "load_in_scoped",
          label: "Load in/out scope confirmed (add-on if applicable)",
        },
      ],
    },
    {
      section: "Event Prep",
      items: [
        { key: "orientations_scheduled", label: "Orientations scheduled" },
        { key: "orientations_complete", label: "Orientations completed" },
        { key: "teamlead_training", label: "Team lead training" },
        { key: "axis_training", label: "Axis app training" },
        { key: "social_media_posted", label: "Social media posting" },
      ],
    },
    {
      section: "Staffing",
      items: [
        { key: "staff_registration", label: "Registration zone staffed" },
        { key: "staff_general_floor", label: "General floor staffed" },
        { key: "staff_vip", label: "VIP / speaker area staffed" },
        { key: "staff_team_leads", label: "Team leads assigned" },
        {
          key: "staff_vendors",
          label: "Vendor contacts confirmed (M&M-owned)",
        },
      ],
    },
    {
      section: "Post-Event",
      items: [
        {
          key: "docs_shared",
          label: "Event docs reviewed & shared with client",
        },
        { key: "survey_sent", label: "Post-event survey sent" },
        { key: "debrief_done", label: "Debrief notes recorded" },
      ],
    },
  ],

  P2: [
    {
      section: "Pre-Engagement",
      items: [
        { key: "agreement_sent", label: "Agreement sent" },
        { key: "agreement_signed", label: "Agreement signed" },
        { key: "intake_complete", label: "Intake form completed" },
      ],
    },
    {
      section: "Curriculum & Facilitation",
      items: [
        {
          key: "curriculum_confirmed",
          label: "Curriculum confirmed with client",
        },
        { key: "facilitator_assigned", label: "Facilitator assigned" },
        { key: "materials_ready", label: "Training materials ready" },
        { key: "session_scheduled", label: "Session(s) scheduled" },
      ],
    },
    {
      section: "Delivery",
      items: [
        { key: "pre_session_brief", label: "Pre-session brief completed" },
        { key: "session_delivered", label: "Session delivered" },
      ],
    },
    {
      section: "Post-Session",
      items: [
        {
          key: "docs_shared",
          label: "Session docs reviewed & shared with client",
        },
        { key: "survey_sent", label: "Participant survey sent" },
        { key: "debrief_done", label: "Internal debrief recorded" },
        { key: "report_sent", label: "Summary report sent to client" },
      ],
    },
  ],

  P3: [
    {
      section: "Pre-Engagement",
      items: [
        { key: "p3_framework_complete", label: "Pillar 3 framework completed" },
        { key: "agreement_sent", label: "Agreement sent" },
        { key: "agreement_signed", label: "Agreement signed" },
        { key: "intake_complete", label: "Intake form completed" },
        {
          key: "coexecution_alignment",
          label: "Co-execution alignment meeting held",
        },
      ],
    },
    {
      section: "Recruiting & Talent",
      items: [
        { key: "recruiting_link_sent", label: "Recruiting app link sent out" },
        { key: "onboarding_complete", label: "Onboarding completed" },
      ],
    },
    {
      section: "Venue & Floor Planning",
      items: [
        {
          key: "venue_poc_confirmed",
          label: "Venue / event ops POC confirmed",
        },
        {
          key: "venue_walkthrough",
          label: "Venue walkthrough completed",
          required: true,
          note: "Staffing cannot begin without this",
        },
        {
          key: "floor_config_complete",
          label: "Floor + zone configuration built in Axis App Setup",
          required: true,
          note: "Required before shifts can be created",
        },
        {
          key: "run_of_show_received",
          label: "Run of show received from client",
        },
        {
          key: "load_in_scoped",
          label: "Load in/out scope confirmed (add-on if applicable)",
        },
      ],
    },
    {
      section: "Event Prep",
      items: [
        { key: "orientations_scheduled", label: "Orientations scheduled" },
        { key: "orientations_complete", label: "Orientations completed" },
        { key: "teamlead_training", label: "Team lead training" },
        { key: "axis_training", label: "Axis app training" },
        { key: "social_media_posted", label: "Social media posting" },
        {
          key: "shared_docs_confirmed",
          label: "Shared docs confirmed with client",
        },
      ],
    },
    {
      section: "Staffing",
      items: [
        { key: "staff_registration", label: "Registration zone staffed" },
        { key: "staff_general_floor", label: "General floor staffed" },
        { key: "staff_vip", label: "VIP / speaker area staffed" },
        { key: "staff_team_leads", label: "Team leads assigned" },
        {
          key: "staff_vendors",
          label: "Vendor contacts confirmed (M&M-owned)",
        },
      ],
    },
    {
      section: "Post-Event",
      items: [
        {
          key: "docs_shared",
          label: "Event docs reviewed & shared with client",
        },
        { key: "survey_sent", label: "Post-event survey sent" },
        { key: "debrief_done", label: "Debrief notes recorded" },
      ],
    },
  ],

  P4: [
    {
      section: "Pre-Engagement",
      items: [
        { key: "agreement_sent", label: "Agreement sent" },
        { key: "agreement_signed", label: "Agreement signed" },
        { key: "intake_complete", label: "Intake form completed" },
      ],
    },
    {
      section: "Discovery",
      items: [
        { key: "diagnostic_scheduled", label: "Diagnostic session scheduled" },
        { key: "diagnostic_complete", label: "Diagnostic session completed" },
        { key: "gap_library_built", label: "Infrastructure gap library built" },
      ],
    },
    {
      section: "Delivery",
      items: [
        {
          key: "docs_shared",
          label: "Deliverable docs reviewed & shared with client",
        },
        { key: "report_drafted", label: "Diagnostic report drafted" },
        { key: "report_delivered", label: "Report delivered to client" },
        { key: "client_review", label: "Client review meeting held" },
      ],
    },
    {
      section: "Post-Engagement",
      items: [
        { key: "followup_scheduled", label: "Follow-up check-in scheduled" },
        { key: "debrief_done", label: "Internal debrief recorded" },
      ],
    },
  ],
};

// Normalize pillar string → key (handles "P1", "p1", "Pillar 1", etc.)
const getPillarKey = (pillar) => {
  if (!pillar) return "P1";
  const s = String(pillar)
    .toUpperCase()
    .replace(/[^P1-4]/g, "");
  if (s === "P1" || s === "1") return "P1";
  if (s === "P2" || s === "2") return "P2";
  if (s === "P3" || s === "3") return "P3";
  if (s === "P4" || s === "4") return "P4";
  return "P1";
};

// ─── Leadership Scoring Engine ────────────────────────────────────────────────
const SCORE_CONFIG = {
  VOLUNTEERED_2_PLUS_YEARS: 30,
  VOLUNTEERED_BEFORE: 20,
  NOT_FIRST_YEAR: 10,
  WANTS_LEADERSHIP: 20,
  WANTS_OPS_LEAD: 10,
  OK_BEING_POC: 10,
  COMFORT_WITH_CONFLICT: 10,
  WANTS_MENTORSHIP: 10,
  HAS_CRITICAL_COMFORT: 10,
  TECH_COMFORTABLE: 5,
  DIRECTING_COMFORT: 5,
  HIGH_ENERGY_COVERAGE: 5,
  EXTENSIVE_MULTI_EVENT: 35,
  ALL_ORIENTATIONS: 20,
  ALL_TRAININGS: 10,
};

// Team Lead: ≥60 score + volunteeredBefore + wantsLeadership + okBeingPOC
// Ops Lead:  ≥90 score + all TL requirements + all three critical comforts + wantsMentorship
const TL_TIERS = {
  CONFIRMED: { min: 90, label: "Confirmed TL", color: "#27ae60" },
  STRONG: { min: 60, label: "Strong Candidate", color: "#3498db" },
  POTENTIAL: { min: 40, label: "Potential Future", color: "#f39c12" },
  NOT_READY: { min: 0, label: "Not Ready", color: "#95a5a6" },
};

const calculateLeadershipScore = (profile, attendance = {}) => {
  let score = 0;
  const breakdown = [];

  const exp = profile.eventExperience || "";
  if (exp.includes("Extensive multi-event")) {
    score += SCORE_CONFIG.EXTENSIVE_MULTI_EVENT;
    breakdown.push({ label: "Extensive multi-event experience", points: 35 });
  } else if (profile.volunteeredYears >= 2 || exp.includes("2+ years")) {
    score += SCORE_CONFIG.VOLUNTEERED_2_PLUS_YEARS;
    breakdown.push({ label: "Volunteered 2+ years", points: 30 });
  } else if (
    profile.volunteeredBefore ||
    exp.includes("1 year") ||
    exp.includes("other events")
  ) {
    score += SCORE_CONFIG.VOLUNTEERED_BEFORE;
    breakdown.push({ label: "Volunteered before", points: 20 });
  } else if (!profile.firstYear) {
    score += SCORE_CONFIG.NOT_FIRST_YEAR;
    breakdown.push({ label: "Not first year", points: 10 });
  }

  if (profile.wantsLeadership) {
    score += SCORE_CONFIG.WANTS_LEADERSHIP;
    breakdown.push({ label: "Wants leadership", points: 20 });
  }
  if (profile.wantsOpsLead) {
    score += SCORE_CONFIG.WANTS_OPS_LEAD;
    breakdown.push({ label: "Interested in Ops Lead", points: 10 });
  }
  if (profile.okBeingPOC) {
    score += SCORE_CONFIG.OK_BEING_POC;
    breakdown.push({ label: "OK being POC", points: 10 });
  }
  if (profile.comfortWithConflict) {
    score += SCORE_CONFIG.COMFORT_WITH_CONFLICT;
    breakdown.push({ label: "Comfortable addressing conflict", points: 10 });
  }
  if (profile.wantsMentorship) {
    score += SCORE_CONFIG.WANTS_MENTORSHIP;
    breakdown.push({ label: "Wants to mentor", points: 10 });
  }

  const cz = profile.comfortZones || [];
  const hasCritical =
    cz.includes("Talking to attendees") &&
    cz.includes("Problem solving / putting out fires");
  const isTech = cz.includes("Tech (devices, check-in, scanners)");
  if (hasCritical) {
    score += SCORE_CONFIG.HAS_CRITICAL_COMFORT;
    breakdown.push({ label: "Critical comfort zones", points: 10 });
  }
  if (isTech) {
    score += SCORE_CONFIG.TECH_COMFORTABLE;
    breakdown.push({ label: "Tech comfortable", points: 5 });
  }
  if (cz.includes("Directing people / giving clear instructions")) {
    score += SCORE_CONFIG.DIRECTING_COMFORT;
    breakdown.push({ label: "Comfortable directing others", points: 5 });
  }
  if (cz.includes("High-energy floor coverage (full shift on feet)")) {
    score += SCORE_CONFIG.HIGH_ENERGY_COVERAGE;
    breakdown.push({ label: "High-energy floor coverage", points: 5 });
  }

  if (
    attendance.orientationsAttended === attendance.totalOrientations &&
    attendance.totalOrientations > 0
  ) {
    score += SCORE_CONFIG.ALL_ORIENTATIONS;
    breakdown.push({ label: "All orientations", points: 20 });
  }
  if (
    attendance.trainingsAttended === attendance.totalTrainings &&
    attendance.totalTrainings > 0
  ) {
    score += SCORE_CONFIG.ALL_TRAININGS;
    breakdown.push({ label: "All trainings", points: 10 });
  }

  // Ops Lead eligibility — requires TL-confirmed level + full critical skill stack + mentorship
  const cz3 =
    cz.includes("Talking to attendees") &&
    cz.includes("Problem solving / putting out fires") &&
    isTech;
  const opsLeadEligible =
    score >= 90 &&
    profile.wantsLeadership &&
    (profile.wantsOpsLead || false) &&
    profile.okBeingPOC &&
    profile.wantsMentorship &&
    (profile.comfortWithConflict || false) &&
    cz3;

  const tlTier =
    Object.values(TL_TIERS).find((t) => score >= t.min) || TL_TIERS.NOT_READY;

  return { score, breakdown, tlTier, opsLeadEligible };
};

function StaffList({
  staffProfiles,
  staffFilter,
  staffExpanded,
  setStaffExpanded,
  promotingSaving,
  promoteRole,
  theme,
}) {
  const filtered = staffProfiles.filter((s) => {
    if (staffFilter === "tl_eligible") return s.score >= 60;
    if (staffFilter === "ops_eligible") return s.opsLeadEligible;
    if (staffFilter === "assigned")
      return s.profile.isTeamLead || s.profile.isOpsLead;
    return true;
  });

  if (filtered.length === 0)
    return (
      <div
        style={{
          fontSize: 13,
          color: theme.textMuted,
          padding: "16px 0",
          textAlign: "center",
        }}
      >
        No matches for this filter.
      </div>
    );

  return filtered.map((s) => {
    const isExpanded = staffExpanded === s.id;
    const tc = s.tlTier.color;
    const currentRole =
      s.profile.floor_role ||
      (s.profile.isOpsLead
        ? "ops_lead"
        : s.profile.isTeamLead
          ? "team_lead"
          : "volunteer");

    return (
      <div
        key={s.id}
        style={{
          borderLeft: `4px solid ${tc}`,
          borderRadius: 10,
          background: theme.background,
          marginBottom: 10,
          overflow: "hidden",
        }}
      >
        <div
          onClick={() => setStaffExpanded(isExpanded ? null : s.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            cursor: "pointer",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>
              {s.profile.name || "Unnamed"}
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 4,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: tc + "22",
                  color: tc,
                }}
              >
                {s.tlTier.label}
              </span>
              {s.opsLeadEligible && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "rgba(15,52,96,0.1)",
                    color: "#0F3460",
                  }}
                >
                  Ops Lead Eligible
                </span>
              )}
              {s.profile.isTeamLead && !s.profile.isOpsLead && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "rgba(88,176,108,0.15)",
                    color: "#2d7a46",
                  }}
                >
                  ⭐ Team Lead
                </span>
              )}
              {s.profile.isOpsLead && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "rgba(235,199,100,0.2)",
                    color: "#8a6800",
                  }}
                >
                  ★ Ops Lead
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: tc,
                lineHeight: 1,
              }}
            >
              {s.score}
            </div>
            <div
              style={{ fontSize: 10, color: theme.textMuted, fontWeight: 600 }}
            >
              pts
            </div>
          </div>
          <div style={{ fontSize: 14, color: theme.textMuted }}>
            {isExpanded ? "▲" : "▼"}
          </div>
        </div>

        {isExpanded && (
          <div
            style={{
              padding: "0 14px 16px",
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <div style={{ marginTop: 14, marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                Score Breakdown
              </div>
              {s.breakdown.map((b, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 0",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <span style={{ fontSize: 13, color: theme.textMuted }}>
                    {b.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: tc }}>
                    +{b.points}
                  </span>
                </div>
              ))}
            </div>
            {s.profile.comfortZones?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: theme.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 8,
                  }}
                >
                  Comfort Zones
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {s.profile.comfortZones.map((z, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 11,
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: theme.border,
                        color: theme.textMuted,
                      }}
                    >
                      {z}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                Attendance
              </div>
              <div style={{ fontSize: 13, color: theme.text }}>
                Orientations: {s.attendance.orientationsAttended}/
                {s.attendance.totalOrientations} &nbsp;·&nbsp; Trainings:{" "}
                {s.attendance.trainingsAttended}/{s.attendance.totalTrainings}
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: theme.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              Assign Role
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { role: "volunteer", label: "Volunteer", show: true },
                {
                  role: "team_lead",
                  label: "⭐ Team Lead",
                  show: s.score >= 60,
                },
                {
                  role: "ops_lead",
                  label: "★ Ops Lead",
                  show: s.opsLeadEligible,
                },
              ]
                .filter((r) => r.show)
                .map(({ role, label }) => (
                  <button
                    key={role}
                    disabled={promotingSaving || currentRole === role}
                    onClick={() => promoteRole(s.id, s.profile.uid, role)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor:
                        promotingSaving || currentRole === role
                          ? "default"
                          : "pointer",
                      background:
                        currentRole === role ? theme.primary : "transparent",
                      color: currentRole === role ? "#fff" : theme.primary,
                      border: `1.5px solid ${theme.primary}`,
                      opacity: promotingSaving ? 0.6 : 1,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {currentRole === role ? `✓ ${label}` : label}
                  </button>
                ))}
            </div>
            {!s.opsLeadEligible && s.score >= 60 && (
              <div
                style={{ fontSize: 11, color: theme.textMuted, marginTop: 8 }}
              >
                Ops Lead requires ≥90 pts + all three critical comfort zones +
                mentorship willingness.
              </div>
            )}
          </div>
        )}
      </div>
    );
  });
}

const FOUNDERS = ["Ashley", "Mikal"];

// ── DATA RETENTION CONFIG ─────────────────────────────────────────────────────
// Change this number when Reba confirms the retention window
const DATA_RETENTION_DAYS = 120;

const isRetentionExpired = (eventDate) => {
  if (!eventDate) return false;
  const event = new Date(eventDate);
  const now = new Date();
  const diffDays = (now - event) / (1000 * 60 * 60 * 24);
  return diffDays >= DATA_RETENTION_DAYS;
};

// What gets anonymized vs deleted per record type
// Update this map when Reba confirms specifics
const ANONYMIZATION_MAP = {
  roster: {
    anonymize: ["name", "email", "phone"],
    delete: ["photo_url", "shirt_size", "emergency_contact", "device_token"],
    keep: ["role", "shift", "zone", "type", "checked_in"],
  },
  check_ins: {
    anonymize: ["name", "userId", "uid"],
    delete: [],
    keep: ["timestamp", "zone", "role", "eventId", "type"],
  },
  check_outs: {
    anonymize: ["name", "userId", "uid"],
    delete: [],
    keep: ["timestamp", "zone", "role", "eventId", "type"],
  },
  incident_reports: {
    anonymize: ["name", "uid"],
    delete: ["allowContact"],
    keep: [
      "category",
      "severity",
      "description",
      "actionTaken",
      "location",
      "zone",
      "status",
      "resolvedBy",
      "resolvedAt",
      "createdAt",
    ],
  },
  volunteerProfiles: {
    anonymize: ["firstName", "lastName", "email", "phone", "uid"],
    delete: ["photo_url", "device_token"],
    keep: ["score", "tlTier", "isTeamLead", "isOpsLead", "zone", "event"],
  },
};

const anonymizeRecord = (data, map) => {
  const result = { ...data };
  (map.delete || []).forEach((f) => delete result[f]);
  (map.anonymize || []).forEach((f) => {
    if (result[f]) result[f] = "[anonymized]";
  });
  return result;
};

const DOC_TYPE_LABELS = {
  proposal:     'Proposal',
  sow:          'Statement of Work',
  msa:          'Master Service Agreement',
  ic_agreement: 'IC Agreement',
  waiver:       'Third-Party Staffing Waiver',
  invoice:      'Invoice',
};
 
const STATUS_COLORS = {
  draft:          { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  pending_review: { color: '#D97706', bg: 'rgba(217,119,6,0.1)'   },
  approved:       { color: '#2d7a46', bg: 'rgba(45,122,70,0.1)'   },
  sent:           { color: '#1C4A36', bg: 'rgba(28,74,54,0.1)'    },
  signed:         { color: '#2d7a46', bg: 'rgba(45,122,70,0.15)'  },
};

export default function EventCommand() {
  const { eventId } = useParams();
  const { activeUser } = useAuth();
  const navigate = useNavigate();
  const isFounder = FOUNDERS.includes(activeUser);

  const [event, setEvent] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checklist, setChecklist] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newDoc, setNewDoc] = useState({ label: "", url: "" });
  const [debrief, setDebrief] = useState("");

  // Staff roster (scored volunteer/contractor profiles)
  const [staffProfiles, setStaffProfiles] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffExpanded, setStaffExpanded] = useState(null);
  const [staffFilter, setStaffFilter] = useState("all"); // all | tl_eligible | ops_eligible | assigned
  const [promotingSaving, setPromotingSaving] = useState(false);

  // Pre-event staff planning
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningProfiles, setPlanningProfiles] = useState([]); // scored volunteer profiles
  const [planningZones, setPlanningZones] = useState([]); // floors/zones from event doc
  const [zoneAssignments, setZoneAssignments] = useState({}); // { zoneId: { tl: uid|null, ops: uid|null, volunteers: [uid] } }
  const [planningFilter, setPlanningFilter] = useState("tl_eligible"); // all | tl_eligible | ops_eligible | assigned
  const [planSaving, setPlanSaving] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);

  // Client staff
  const [clientStaff, setClientStaff] = useState([]);
  const [newClientStaff, setNewClientStaff] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    needs_app_access: false,
  });
  const [clientStaffSaving, setClientStaffSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("checklist"); // checklist | staff | client_staff

  // App Setup
  const [appSetup, setAppSetup] = useState({
    schedule_mode: "self_select", // "self_select" | "managed"
    floors: [], // [{ id, name, zones: [{ id, name }] }]
    event_staff: [],
  });
  const [newFloorName, setNewFloorName] = useState("");
  const [newZoneInputs, setNewZoneInputs] = useState({}); // { floorId: "" }
  const [brandColors, setBrandColors] = useState({
    primary: "",
    accent: "",
    background: "",
  });
  const [themePreview, setThemePreview] = useState(null);
  const [appSetupLoading, setAppSetupLoading] = useState(false);
  const [appSetupSaving, setAppSetupSaving] = useState(false);
  const [appSetupSaved, setAppSetupSaved] = useState(false);
  const [newStaffEntry, setNewStaffEntry] = useState({
    name: "",
    pin: "",
    last4: "",
    pillar: "P1",
  });
  const [customPerms, setCustomPerms] = useState({
    check_in_volunteers: false,
    manage_shifts: false,
    send_alerts: false,
    view_incidents: false,
    view_floor_layout: false,
    manual_check_in: false,
  });

  // Drive docs
  const [driveDocs, setDriveDocs] = useState([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [deliverables, setDeliverables] = useState({
    folder_url: "",
    status: "pending",
    notified_at: null,
  }); // status: pending | ready | notified
  const [editingDeliv, setEditingDeliv] = useState(false);
  const [delivFolderDraft, setDelivFolderDraft] = useState("");
  const [savingDeliv, setSavingDeliv] = useState(false);

  // Shifts
  const [shifts, setShifts] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [newShift, setNewShift] = useState({
    name: "",
    zone: "",
    start_time: "",
    end_time: "",
    capacity: "",
    role_type: "",
    date: "",
  });
  const [shiftSaving, setShiftSaving] = useState(false);

  // Reports
  const [activeReport, setActiveReport] = useState(null);
  const [reportData, setReportData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  // Data deletion requests
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [fulfillingSaving, setFulfillingSaving] = useState(null); // id of request being fulfilled
  const [denyingId, setDenyingId] = useState(null);
  const [denyReason, setDenyReason] = useState("");

  // Document Reconciling
  const [mmDocs, setMmDocs] = useState([]);
  const [mmDocsLoading, setMmDocsLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [snap, rosterSnap, clientStaffSnap] = await Promise.all([
        getDoc(doc(db, "events", eventId)),
        getDocs(collection(db, "events", eventId, "roster")),
        getDocs(collection(db, "events", eventId, "client_staff")),
      ]);
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setEvent(data);
        setChecklist(data.checklist || {});
        setDebrief(data.debrief_notes || "");
        // Auto-load Drive docs if folder exists
        if (data.drive_folder_url) {
          loadDriveDocs(data.drive_folder_url);
        }
        loadMMDocs();
        // Load deliverables
        if (data.deliverables) {
          setDeliverables(data.deliverables);
          setDelivFolderDraft(data.deliverables.folder_url || "");
        }
        // Load any pending deletion requests for this event
        loadDeletionRequests();
      }
      setRoster(rosterSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClientStaff(
        clientStaffSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      );
      setLoading(false);
    };
    load();
  }, [eventId]);

  // Load files from the event's Drive folder
  const loadDriveDocs = async (folderUrl) => {
    setDriveLoading(true);
    try {
      // Extract folder ID from URL
      const match = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (!match) return;
      const folderId = match[1];

      // Need an access token — try silently first (no prompt)
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId || !window.google?.accounts?.oauth2) return;

      const token = await new Promise((resolve) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/drive.readonly",
          prompt: "",
          callback: (r) => resolve(r.error ? null : r.access_token),
        });
        client.requestAccessToken({ prompt: "" });
      });
      if (!token) return;

      const query = encodeURIComponent(
        `'${folderId}' in parents and trashed = false`,
      );
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,webViewLink)&pageSize=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      const files = (data.files || []).filter(
        (f) => f.mimeType !== "application/vnd.google-apps.folder",
      );
      setDriveDocs(files);
    } catch (e) {
      console.warn("Could not load Drive docs:", e);
    }
    setDriveLoading(false);
  };

  const loadMMDocs = async () => {
  if (!eventId) return;
  setMmDocsLoading(true);
  try {
    const snap = await getDocs(
      query(
        collection(db, 'mm_documents'),
        where('eventId', '==', eventId),
        orderBy('createdAt', 'desc')
      )
    );
    setMmDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    console.error('loadMMDocs error:', e);
  }
  setMmDocsLoading(false);
};

  // Load volunteer profiles + attendance for scoring when staff tab opens
  const loadStaffProfiles = async () => {
    if (staffProfiles.length > 0) return; // already loaded
    setStaffLoading(true);
    try {
      const [profilesSnap, attendanceSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "volunteerProfiles"),
            where("event", "==", event.name),
          ),
        ),
        getDocs(collection(db, "teamLeadAttendance")),
      ]);

      const attendanceMap = {};
      attendanceSnap.docs.forEach((d) => {
        attendanceMap[d.id] = d.data();
      });

      const profiles = profilesSnap.docs.map((d) => {
        const profile = d.data();
        const attKey = `${eventId}_${profile.uid}`;
        const attendance = attendanceMap[attKey] || {
          orientationsAttended: 0,
          totalOrientations: 4,
          trainingsAttended: 0,
          totalTrainings: 2,
        };
        const { score, breakdown, tlTier, opsLeadEligible } =
          calculateLeadershipScore(profile, attendance);
        return {
          id: d.id,
          profile,
          attendance,
          score,
          breakdown,
          tlTier,
          opsLeadEligible,
        };
      });

      profiles.sort((a, b) => b.score - a.score);
      setStaffProfiles(profiles);
    } catch (e) {
      console.error("Error loading staff profiles:", e);
    }
    setStaffLoading(false);
  };

  const loadShifts = async () => {
    setShiftsLoading(true);
    const snap = await getDocs(collection(db, "events", eventId, "shifts"));
    setShifts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setShiftsLoading(false);
  };

  // ── REPORTS ENGINE ──────────────────────────────────────────────────────────
  const REPORTS = [
    { key: "checkins", label: "Check-Ins", icon: "✅" },
    { key: "checkouts", label: "Check-Outs", icon: "🚪" },
    { key: "noshows", label: "No Shows", icon: "❌" },
    { key: "roster_vol", label: "Volunteer Roster", icon: "👥" },
    { key: "roster_con", label: "Contractor Roster", icon: "🏷️" },
    { key: "tl_performance", label: "Team Lead Performance", icon: "⭐" },
    { key: "ol_performance", label: "Ops Lead Performance", icon: "🏆" },
    { key: "incidents", label: "Incident Reports", icon: "⚠️" },
    { key: "attendance", label: "Attendance Summary", icon: "📊" },
    { key: "summary", label: "Overall Summary", icon: "📋" },
  ];

  const loadReport = async (key) => {
    setActiveReport(key);
    setReportLoading(true);
    setReportData([]);
    try {
      let rows = [];
      if (key === "checkins") {
        const snap = await getDocs(
          query(collection(db, "check_ins"), where("eventId", "==", eventId)),
        );
        rows = snap.docs.map((d) => {
          const r = d.data();
          return {
            Name: r.name || r.userId || "—",
            Role: r.role || "—",
            "Check-In Time": r.timestamp
              ? new Date(
                  r.timestamp?.toDate ? r.timestamp.toDate() : r.timestamp,
                ).toLocaleString()
              : "—",
            Zone: r.zone || "—",
            Type: r.type || "volunteer",
          };
        });
      } else if (key === "checkouts") {
        const snap = await getDocs(
          query(collection(db, "check_outs"), where("eventId", "==", eventId)),
        );
        rows = snap.docs.map((d) => {
          const r = d.data();
          return {
            Name: r.name || r.userId || "—",
            Role: r.role || "—",
            "Check-Out Time": r.timestamp
              ? new Date(
                  r.timestamp?.toDate ? r.timestamp.toDate() : r.timestamp,
                ).toLocaleString()
              : "—",
            Zone: r.zone || "—",
            Type: r.type || "volunteer",
          };
        });
      } else if (key === "noshows") {
        const [rosterSnap, checkInSnap] = await Promise.all([
          getDocs(collection(db, "events", eventId, "roster")),
          getDocs(
            query(collection(db, "check_ins"), where("eventId", "==", eventId)),
          ),
        ]);
        const checkedInIds = new Set(
          checkInSnap.docs.map((d) => d.data().userId || d.data().uid),
        );
        rows = rosterSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => !checkedInIds.has(r.uid || r.id))
          .map((r) => ({
            Name: r.name || "—",
            Role: r.role || "—",
            Type: r.type || "volunteer",
            Shift: r.shift || "—",
          }));
      } else if (key === "roster_vol") {
        const snap = await getDocs(collection(db, "events", eventId, "roster"));
        rows = snap.docs
          .map((d) => d.data())
          .filter((r) => (r.type || "volunteer") === "volunteer")
          .map((r) => ({
            Name: r.name || "—",
            Role: r.role || "—",
            Shift: r.shift || "—",
            "Check-In": r.checked_in ? "Yes" : "No",
            "T-Shirt": r.shirt_size || "—",
          }));
      } else if (key === "roster_con") {
        const snap = await getDocs(collection(db, "events", eventId, "roster"));
        rows = snap.docs
          .map((d) => d.data())
          .filter((r) => r.type === "contractor")
          .map((r) => ({
            Name: r.name || "—",
            Role: r.role || "—",
            "Engagement Window": r.engagement_window || "—",
            Zone: r.zone || "—",
            Rate: r.rate || "—",
          }));
      } else if (key === "tl_performance") {
        const snap = await getDocs(
          query(
            collection(db, "volunteerProfiles"),
            where("event", "==", eventId),
          ),
        );
        rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => r.isTeamLead && !r.isOpsLead)
          .map((r) => {
            const { score, tlTier } = calculateLeadershipScore(r);
            return {
              Name: r.firstName
                ? `${r.firstName} ${r.lastName || ""}`.trim()
                : "—",
              Zone: r.zone || "—",
              Score: score,
              Tier: tlTier.label,
              "Promoted By": r.promotedBy || "—",
            };
          });
      } else if (key === "ol_performance") {
        const snap = await getDocs(
          query(
            collection(db, "volunteerProfiles"),
            where("event", "==", eventId),
          ),
        );
        rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => r.isOpsLead)
          .map((r) => {
            const { score } = calculateLeadershipScore(r);
            return {
              Name: r.firstName
                ? `${r.firstName} ${r.lastName || ""}`.trim()
                : "—",
              Score: score,
              "Promoted By": r.promotedBy || "—",
              "Promoted At": r.promotedAt
                ? new Date(r.promotedAt).toLocaleString()
                : "—",
            };
          });
      } else if (key === "incidents") {
        const snap = await getDocs(
          query(
            collection(db, "incident_reports"),
            where("event", "==", event.event_nickname || event.name),
          ),
        );
        rows = snap.docs.map((d) => {
          const r = d.data();
          return {
            "Reported By": r.name || "—",
            Role: r.reporterRole || "—",
            Category: r.category || "—",
            Severity: r.severity || "—",
            Zone: r.zone || "—",
            Location: r.location || "—",
            Description: r.description || "—",
            "Action Taken": r.actionTaken || "—",
            Witnesses: r.witnesses || "—",
            Status: r.status || "open",
            "Resolved By": r.resolvedBy || "—",
            "Resolved At": r.resolvedAt
              ? new Date(
                  r.resolvedAt.toDate ? r.resolvedAt.toDate() : r.resolvedAt,
                ).toLocaleString()
              : "—",
            "Allow Contact": r.allowContact ? "Yes" : "No",
            "Filed At": r.createdAt
              ? new Date(
                  r.createdAt.toDate ? r.createdAt.toDate() : r.createdAt,
                ).toLocaleString()
              : "—",
          };
        });
      } else if (key === "attendance") {
        const [rosterSnap, checkInSnap, checkOutSnap] = await Promise.all([
          getDocs(collection(db, "events", eventId, "roster")),
          getDocs(
            query(collection(db, "check_ins"), where("eventId", "==", eventId)),
          ),
          getDocs(
            query(
              collection(db, "check_outs"),
              where("eventId", "==", eventId),
            ),
          ),
        ]);
        const registered = rosterSnap.docs.length;
        const checkedIn = checkInSnap.docs.length;
        const checkedOut = checkOutSnap.docs.length;
        const noShows = registered - checkedIn;
        rows = [
          {
            Metric: "Registered",
            Count: registered,
            "% of Registered": "100%",
          },
          {
            Metric: "Checked In",
            Count: checkedIn,
            "% of Registered":
              registered > 0
                ? `${Math.round((checkedIn / registered) * 100)}%`
                : "—",
          },
          {
            Metric: "Checked Out",
            Count: checkedOut,
            "% of Registered":
              registered > 0
                ? `${Math.round((checkedOut / registered) * 100)}%`
                : "—",
          },
          {
            Metric: "No Shows",
            Count: noShows > 0 ? noShows : 0,
            "% of Registered":
              registered > 0
                ? `${Math.round((Math.max(0, noShows) / registered) * 100)}%`
                : "—",
          },
        ];
      } else if (key === "summary") {
        const [rosterSnap, checkInSnap, checkOutSnap, incidentSnap, shiftSnap] =
          await Promise.all([
            getDocs(collection(db, "events", eventId, "roster")),
            getDocs(
              query(
                collection(db, "check_ins"),
                where("eventId", "==", eventId),
              ),
            ),
            getDocs(
              query(
                collection(db, "check_outs"),
                where("eventId", "==", eventId),
              ),
            ),
            getDocs(
              query(
                collection(db, "incident_reports"),
                where("event", "==", event.event_nickname || event.name),
              ),
            ),
            getDocs(collection(db, "events", eventId, "shifts")),
          ]);
        const rosterData = rosterSnap.docs.map((d) => d.data());
        const volunteers = rosterData.filter(
          (r) => (r.type || "volunteer") === "volunteer",
        ).length;
        const contractors = rosterData.filter(
          (r) => r.type === "contractor",
        ).length;
        rows = [
          {
            Category: "Staff",
            Metric: "Total Rostered",
            Value: rosterSnap.docs.length,
          },
          { Category: "Staff", Metric: "Volunteers", Value: volunteers },
          { Category: "Staff", Metric: "Contractors", Value: contractors },
          {
            Category: "Attendance",
            Metric: "Total Check-Ins",
            Value: checkInSnap.docs.length,
          },
          {
            Category: "Attendance",
            Metric: "Total Check-Outs",
            Value: checkOutSnap.docs.length,
          },
          {
            Category: "Attendance",
            Metric: "No Shows",
            Value: Math.max(
              0,
              rosterSnap.docs.length - checkInSnap.docs.length,
            ),
          },
          {
            Category: "Operations",
            Metric: "Shifts Created",
            Value: shiftSnap.docs.length,
          },
          {
            Category: "Operations",
            Metric: "Incidents Filed",
            Value: incidentSnap.docs.length,
          },
          {
            Category: "Completion",
            Metric: "Checklist Progress",
            Value: `${doneItems}/${totalItems} (${pct}%)`,
          },
        ];
      }
      setReportData(rows);
    } catch (e) {
      console.error("Report error:", e);
      setReportData([]);
    }
    setReportLoading(false);
  };

  const exportPDF = () => {
    if (!reportData.length || !activeReport) return;
    setExportingPDF(true);
    const reportMeta = REPORTS.find((r) => r.key === activeReport);
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "letter",
    });

    // Header
    pdf.setFillColor(28, 74, 54);
    pdf.rect(0, 0, pdf.internal.pageSize.width, 56, "F");
    pdf.setTextColor(201, 160, 48);
    pdf.setFontSize(10);
    pdf.text("MOTION & METHOD  ·  M&M OPERATIONS", 40, 20);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(18);
    pdf.text(
      `${reportMeta?.icon || ""} ${reportMeta?.label || activeReport}`,
      40,
      42,
    );
    pdf.setFontSize(10);
    pdf.text(
      `${event.event_nickname || event.name}  ·  ${event.client}  ·  ${event.event_date || ""}`,
      pdf.internal.pageSize.width - 40,
      42,
      { align: "right" },
    );

    // Table
    const headers = Object.keys(reportData[0]);
    const rows = reportData.map((r) => headers.map((h) => String(r[h] ?? "—")));
    autoTable(pdf, {
      head: [headers],
      body: rows,
      startY: 70,
      styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
      headStyles: {
        fillColor: [28, 74, 54],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [247, 247, 245] },
      margin: { left: 40, right: 40 },
    });

    // Footer
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(
        `Generated ${new Date().toLocaleString()}  ·  Page ${i} of ${pageCount}`,
        40,
        pdf.internal.pageSize.height - 20,
      );
    }

    pdf.save(
      `MM_${activeReport}_${event.event_nickname || event.name}_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
    setExportingPDF(false);
  };

  const loadPlanningData = async () => {
    if (!event?.id) return;
    setPlanningLoading(true);
    try {
      // Load volunteer profiles
      const snap = await getDocs(collection(db, "volunteerProfiles"));
      const profiles = [];
      for (const d of snap.docs) {
        const p = d.data();
        if (!p.uid) continue;
        const { score, breakdown, tlTier, opsLeadEligible } =
          calculateLeadershipScore(p);
        profiles.push({
          uid: p.uid,
          name: p.name || "Unknown",
          profile: p,
          score,
          breakdown,
          tlTier,
          opsLeadEligible,
        });
      }
      profiles.sort((a, b) => b.score - a.score);
      setPlanningProfiles(profiles);

      // Load zones from event doc (floors array) + existing plan
      const eventSnap = await getDoc(doc(db, "events", event.id));
      const eventData = eventSnap.exists() ? eventSnap.data() : {};
      const floors = eventData.floors || [];
      // Flatten floors → zones, carrying floor context
      const flatZones = floors.length
        ? floors.flatMap((fl) =>
            (fl.zones || []).map((z) => ({
              id: `${fl.id}__${z.id}`,
              name: z.name,
              floorId: fl.id,
              floorName: fl.name,
              label: floors.length > 1 ? `${fl.name} › ${z.name}` : z.name,
            })),
          )
        : [
            { id: "zone_a", name: "Zone A", label: "Zone A" },
            { id: "zone_b", name: "Zone B", label: "Zone B" },
            { id: "zone_c", name: "Zone C", label: "Zone C" },
          ];
      setPlanningZones(flatZones);

      // Load existing assignments
      const planSnap = await getDoc(
        doc(db, "events", event.id, "staff_plan", "assignments"),
      );
      if (planSnap.exists()) setZoneAssignments(planSnap.data().zones || {});
      else setZoneAssignments({});
    } catch (e) {
      console.error("loadPlanningData error:", e);
    } finally {
      setPlanningLoading(false);
    }
  };

  const savePlan = async () => {
    if (!event?.id) return;
    setPlanSaving(true);
    try {
      await setDoc(doc(db, "events", event.id, "staff_plan", "assignments"), {
        zones: zoneAssignments,
        updated_at: new Date().toISOString(),
        updated_by: "desktop",
      });
      // Write zone assignments to each volunteer's event_history for Insights
      for (const [zoneId, asgn] of Object.entries(zoneAssignments)) {
        const allUids = [
          ...(asgn.tl ? [{ uid: asgn.tl, role: "team_lead" }] : []),
          ...(asgn.ops ? [{ uid: asgn.ops, role: "ops_lead" }] : []),
          ...(asgn.volunteers || []).map((uid) => ({ uid, role: "volunteer" })),
        ];
        for (const { uid, role } of allUids) {
          await setDoc(
            doc(db, "volunteerProfiles", uid, "event_history", event.id),
            {
              event_id: event.id,
              event_name: event.name || "",
              zone_assigned: zoneId,
              role_assigned: role,
              planned_at: new Date().toISOString(),
            },
            { merge: true },
          );
        }
      }
      setPlanSaved(true);
      setTimeout(() => setPlanSaved(false), 2500);
    } catch (e) {
      console.error("savePlan error:", e);
    } finally {
      setPlanSaving(false);
    }
  };

  const assignToZone = (zoneId, uid, slot) => {
    // slot: "tl" | "ops" | "volunteer"
    setZoneAssignments((prev) => {
      const zone = {
        tl: null,
        ops: null,
        volunteers: [],
        ...(prev[zoneId] || {}),
      };
      if (slot === "tl") zone.tl = zone.tl === uid ? null : uid;
      else if (slot === "ops") zone.ops = zone.ops === uid ? null : uid;
      else {
        const idx = zone.volunteers.indexOf(uid);
        if (idx >= 0) zone.volunteers.splice(idx, 1);
        else zone.volunteers.push(uid);
      }
      return { ...prev, [zoneId]: zone };
    });
  };

  const getAssignedZone = (uid) => {
    for (const [zoneId, asgn] of Object.entries(zoneAssignments)) {
      if (
        asgn.tl === uid ||
        asgn.ops === uid ||
        (asgn.volunteers || []).includes(uid)
      )
        return zoneId;
    }
    return null;
  };

  const loadAppSetup = async () => {
    if (!event?.id) return;
    setAppSetupLoading(true);
    try {
      const snap = await getDoc(doc(db, "events", event.id));
      if (snap.exists()) {
        const d = snap.data();
        setAppSetup({
          schedule_mode: d.schedule_mode || "self_select",
          floors: d.floors || [],
          event_staff: d.event_staff || [],
        });
        if (d.theme) {
          setBrandColors({
            primary: d.theme.primary || "",
            accent: d.theme.accent || "",
            background: d.theme.background || "",
          });
          setThemePreview(d.theme);
        }
      }
    } catch (e) {
      console.error("loadAppSetup:", e);
    } finally {
      setAppSetupLoading(false);
    }
  };

  const saveAppSetup = async () => {
    if (!event?.id) return;
    setAppSetupSaving(true);
    try {
      await updateDoc(doc(db, "events", event.id), {
        schedule_mode: appSetup.schedule_mode,
        floors: appSetup.floors,
        event_staff: appSetup.event_staff,
        ...(themePreview && { theme: themePreview }),
      });
      setAppSetupSaved(true);
      setTimeout(() => setAppSetupSaved(false), 2500);
    } catch (e) {
      console.error("saveAppSetup:", e);
    } finally {
      setAppSetupSaving(false);
    }
  };

  const PILLAR_DEFAULT_PERMS = {
    P1: {
      check_in_volunteers: false,
      manage_shifts: false,
      send_alerts: false,
      view_incidents: false,
      view_floor_layout: false,
      manual_check_in: false,
    },
    P3: {
      check_in_volunteers: true,
      manage_shifts: false,
      send_alerts: false,
      view_incidents: true,
      view_floor_layout: true,
      manual_check_in: true,
    },
    P4: {
      check_in_volunteers: true,
      manage_shifts: true,
      send_alerts: true,
      view_incidents: true,
      view_floor_layout: true,
      manual_check_in: true,
    },
  };

  const addEventStaffEntry = () => {
    if (!newStaffEntry.name.trim() || !newStaffEntry.pin.trim()) return;
    const permissions =
      newStaffEntry.pillar === "Custom"
        ? { ...customPerms }
        : PILLAR_DEFAULT_PERMS[newStaffEntry.pillar] || PILLAR_DEFAULT_PERMS.P1;
    const entry = { ...newStaffEntry, permissions };
    setAppSetup((prev) => ({
      ...prev,
      event_staff: [...prev.event_staff, entry],
    }));
    setNewStaffEntry({ name: "", pin: "", last4: "", pillar: "P1" });
    setCustomPerms({
      check_in_volunteers: false,
      manage_shifts: false,
      send_alerts: false,
      view_incidents: false,
      view_floor_layout: false,
      manual_check_in: false,
    });
  };

  const removeEventStaffEntry = (idx) => {
    setAppSetup((prev) => ({
      ...prev,
      event_staff: prev.event_staff.filter((_, i) => i !== idx),
    }));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "staff") loadStaffProfiles();
    if (tab === "planning") {
      loadPlanningData();
      loadShifts();
    }
    if (tab === "app_setup") loadAppSetup();
    if (tab === "shifts") {
      loadShifts();
      if (!planningZones.length) loadPlanningData();
    }
    if (tab === "reports") {
      setActiveReport(null);
      setReportData([]);
    }
  };

  const addShift = async () => {
    if (!newShift.name.trim() || !newShift.start_time || !newShift.end_time)
      return;
    setShiftSaving(true);
    const ref = await addDoc(collection(db, "events", eventId, "shifts"), {
      ...newShift,
      capacity: parseInt(newShift.capacity) || 0,
      assigned: [], // volunteer names (display)
      assigned_uids: [], // volunteer UIDs (push tokens + reminders)
      sent_reminder: false, // Cloud Function sets true after firing
      published: false, // set true when ready for self-select
      created_by: activeUser,
      created_at: new Date().toISOString(),
    });
    setShifts((prev) => [
      ...prev,
      {
        id: ref.id,
        ...newShift,
        capacity: parseInt(newShift.capacity) || 0,
        assigned: [],
        assigned_uids: [],
      },
    ]);
    setNewShift({
      name: "",
      zone: "",
      start_time: "",
      end_time: "",
      capacity: "",
      role_type: "",
      date: "",
    });
  };

  const deleteShift = async (shiftId) => {
    await deleteDoc(doc(db, "events", eventId, "shifts", shiftId));
    setShifts((prev) => prev.filter((s) => s.id !== shiftId));
  };

  const promoteRole = async (profileId, uid, role) => {
    setPromotingSaving(true);
    try {
      const profileRef = doc(db, "volunteerProfiles", profileId);
      await setDoc(
        profileRef,
        {
          isTeamLead: role === "team_lead" || role === "ops_lead",
          isOpsLead: role === "ops_lead",
          floor_role: role,
          promotedBy: activeUser,
          promotedAt: new Date().toISOString(),
          promotedForEvent: eventId,
        },
        { merge: true },
      );
      // update local state
      setStaffProfiles((prev) =>
        prev.map((s) =>
          s.id === profileId
            ? {
                ...s,
                profile: {
                  ...s.profile,
                  isTeamLead: role !== "volunteer",
                  isOpsLead: role === "ops_lead",
                  floor_role: role,
                },
              }
            : s,
        ),
      );
    } catch (e) {
      console.error(e);
    }
    setPromotingSaving(false);
  };

  const addClientStaff = async () => {
    if (!newClientStaff.name.trim()) return;
    setClientStaffSaving(true);
    try {
      const ref = await addDoc(
        collection(db, "events", eventId, "client_staff"),
        {
          ...newClientStaff,
          added_by: activeUser,
          added_at: new Date().toISOString(),
        },
      );
      setClientStaff((prev) => [...prev, { id: ref.id, ...newClientStaff }]);
      setNewClientStaff({
        name: "",
        title: "",
        email: "",
        phone: "",
        needs_app_access: false,
      });
    } catch (e) {
      console.error(e);
    }
    setClientStaffSaving(false);
  };

  const removeClientStaff = async (id) => {
    await deleteDoc(doc(db, "events", eventId, "client_staff", id));
    setClientStaff((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleAppAccess = async (id, current) => {
    await setDoc(
      doc(db, "events", eventId, "client_staff", id),
      { needs_app_access: !current },
      { merge: true },
    );
    setClientStaff((prev) =>
      prev.map((s) => (s.id === id ? { ...s, needs_app_access: !current } : s)),
    );
  };

  const toggleCheck = async (key) => {
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    setSaving(true);
    await updateDoc(doc(db, "events", eventId), {
      checklist: next,
      [`checklist_log.${key}`]: {
        value: !checklist[key],
        by: activeUser,
        at: new Date().toISOString(),
      },
    });
    setSaving(false);
  };

  const saveDeliverables = async () => {
    if (!delivFolderDraft.trim()) return;
    setSavingDeliv(true);
    const updated = {
      ...deliverables,
      folder_url: delivFolderDraft.trim(),
      status: deliverables.status === "pending" ? "ready" : deliverables.status,
    };
    await updateDoc(doc(db, "events", eventId), { deliverables: updated });
    setDeliverables(updated);
    setEditingDeliv(false);
    setSavingDeliv(false);
  };

  const notifyClientDeliverables = async () => {
    if (!deliverables.folder_url || deliverables.status !== "ready") return;
    const updated = {
      ...deliverables,
      status: "notified",
      notified_at: new Date().toISOString(),
    };
    await updateDoc(doc(db, "events", eventId), { deliverables: updated });
    setDeliverables(updated);
  };

  const addEventDoc = async () => {
    if (!newDoc.label.trim()) return;
    const docs = [
      ...(event.docs || []),
      { ...newDoc, added_by: activeUser, added_at: new Date().toISOString() },
    ];
    setSaving(true);
    await updateDoc(doc(db, "events", eventId), { docs });
    setEvent((e) => ({ ...e, docs }));
    setNewDoc({ label: "", url: "" });
    setSaving(false);
  };

  // ── DATA DELETION ────────────────────────────────────────────────────────────
  const loadDeletionRequests = async () => {
    setDeletionLoading(true);
    const snap = await getDocs(
      query(
        collection(db, "data_deletion_requests"),
        where("eventId", "==", eventId),
      ),
    );
    setDeletionRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setDeletionLoading(false);
  };

  const fulfillRequest = async (request) => {
    setFulfillingSaving(request.id);
    try {
      const uid = request.uid;
      const eventName = event.event_nickname || event.name;
      const batch = writeBatch(db);

      // 1. Anonymize roster entry
      const rosterSnap = await getDocs(
        query(
          collection(db, "events", eventId, "roster"),
          where("uid", "==", uid),
        ),
      );
      rosterSnap.docs.forEach((d) => {
        batch.update(
          d.ref,
          anonymizeRecord(d.data(), ANONYMIZATION_MAP.roster),
        );
      });

      // 2. Anonymize check-ins
      const ciSnap = await getDocs(
        query(
          collection(db, "check_ins"),
          where("eventId", "==", eventId),
          where("uid", "==", uid),
        ),
      );
      ciSnap.docs.forEach((d) => {
        batch.update(
          d.ref,
          anonymizeRecord(d.data(), ANONYMIZATION_MAP.check_ins),
        );
      });

      // 3. Anonymize check-outs
      const coSnap = await getDocs(
        query(
          collection(db, "check_outs"),
          where("eventId", "==", eventId),
          where("uid", "==", uid),
        ),
      );
      coSnap.docs.forEach((d) => {
        batch.update(
          d.ref,
          anonymizeRecord(d.data(), ANONYMIZATION_MAP.check_outs),
        );
      });

      // 4. Anonymize incident reports
      const irSnap = await getDocs(
        query(
          collection(db, "incident_reports"),
          where("event", "==", eventName),
          where("uid", "==", uid),
        ),
      );
      irSnap.docs.forEach((d) => {
        batch.update(
          d.ref,
          anonymizeRecord(d.data(), ANONYMIZATION_MAP.incident_reports),
        );
      });

      // 5. Anonymize volunteer profile
      const vpRef = doc(db, "volunteerProfiles", uid);
      const vpSnap = await getDoc(vpRef);
      if (vpSnap.exists()) {
        batch.update(
          vpRef,
          anonymizeRecord(vpSnap.data(), ANONYMIZATION_MAP.volunteerProfiles),
        );
      }

      // 6. Mark request fulfilled
      batch.update(doc(db, "data_deletion_requests", request.id), {
        status: "fulfilled",
        fulfilledBy: activeUser,
        fulfilledAt: new Date().toISOString(),
        retentionNote: `Data anonymized per M&M ${DATA_RETENTION_DAYS}-day retention policy. Aggregate records preserved.`,
      });

      await batch.commit();
      setDeletionRequests((prev) =>
        prev.map((r) =>
          r.id === request.id
            ? {
                ...r,
                status: "fulfilled",
                fulfilledBy: activeUser,
                fulfilledAt: new Date().toISOString(),
              }
            : r,
        ),
      );
    } catch (e) {
      console.error("Fulfillment error:", e);
    }
    setFulfillingSaving(null);
  };

  const denyRequest = async (requestId) => {
    if (!denyReason.trim()) return;
    await updateDoc(doc(db, "data_deletion_requests", requestId), {
      status: "denied",
      deniedBy: activeUser,
      deniedAt: new Date().toISOString(),
      denyReason: denyReason.trim(),
    });
    setDeletionRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, status: "denied", denyReason: denyReason.trim() }
          : r,
      ),
    );
    setDenyingId(null);
    setDenyReason("");
  };

  const runScheduledAnonymization = async () => {
    if (!isRetentionExpired(event.event_date)) return;
    // Auto-anonymize all records for this event past retention window
    // This would be better as a Cloud Function in production
    // For now surfaces as a manual trigger for founders
    const batch = writeBatch(db);
    const rSnap = await getDocs(collection(db, "events", eventId, "roster"));
    rSnap.docs.forEach((d) =>
      batch.update(d.ref, anonymizeRecord(d.data(), ANONYMIZATION_MAP.roster)),
    );
    const ciSnap = await getDocs(
      query(collection(db, "check_ins"), where("eventId", "==", eventId)),
    );
    ciSnap.docs.forEach((d) =>
      batch.update(
        d.ref,
        anonymizeRecord(d.data(), ANONYMIZATION_MAP.check_ins),
      ),
    );
    const coSnap = await getDocs(
      query(collection(db, "check_outs"), where("eventId", "==", eventId)),
    );
    coSnap.docs.forEach((d) =>
      batch.update(
        d.ref,
        anonymizeRecord(d.data(), ANONYMIZATION_MAP.check_outs),
      ),
    );
    await batch.commit();
    alert("Event data anonymized. Aggregate records preserved.");
  };

  const saveDebrief = async () => {
    setSaving(true);
    await updateDoc(doc(db, "events", eventId), { debrief_notes: debrief });
    setSaving(false);
  };

  const handleDeleteEvent = async () => {
    setDeleting(true);
    const batch = writeBatch(db);
    for (const sub of ["roster", "client_staff"]) {
      const snap = await getDocs(collection(db, "events", eventId, sub));
      snap.docs.forEach((d) => batch.delete(d.ref));
    }
    batch.delete(doc(db, "events", eventId));
    await batch.commit();
    navigate("/events");
  };

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
        }}
      >
        <Spinner size={32} />
      </div>
    );
  if (!event)
    return (
      <div style={{ padding: 32 }}>
        <EmptyState icon="◇" title="Event not found" />
      </div>
    );

  const pillarKey = getPillarKey(event.pillar);
  const CHECKLIST = CHECKLISTS[pillarKey];
  const totalItems = CHECKLIST.reduce((a, s) => a + s.items.length, 0);
  const doneItems = Object.values(checklist).filter(Boolean).length;
  const pct = Math.round((doneItems / totalItems) * 100);

  const evtTheme = event.theme || {};
  const primaryColor = evtTheme.primary || theme.primary;
  const accentColor = evtTheme.accent || theme.accent;

  return (
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif",
        minHeight: "100vh",
        background: theme.background,
      }}
    >
      <style>
        {
          "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"
        }
      </style>

      {/* Event header band */}
      <div
        style={{
          background: primaryColor,
          padding: "24px 36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {event.logo_url && (
            <img
              src={event.logo_url}
              alt="logo"
              style={{
                height: 40,
                borderRadius: 6,
                background: "#fff",
                padding: "2px 6px",
              }}
            />
          )}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: accentColor,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              Event Command
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 700,
                color: "#fff",
                fontFamily: "'Playfair Display', serif",
                letterSpacing: "-0.02em",
              }}
            >
              {event.name}
            </h1>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.65)",
                marginTop: 3,
              }}
            >
              {event.client} · {event.event_date || "Date TBD"} ·{" "}
              {event.venue || event.location}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {event.access_code && (
            <div
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.5)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Access Code
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: accentColor,
                  fontFamily: "monospace",
                }}
              >
                {event.access_code}
              </div>
            </div>
          )}
          <Badge color={accentColor} bg="rgba(255,255,255,0.12)">
            {event.pillar || "P3"}
          </Badge>
          {isFounder && (
            <button
              onClick={() => setShowDeleteModal(true)}
              title="Delete event"
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                padding: "6px 12px",
                cursor: "pointer",
                color: "rgba(255,255,255,0.7)",
                fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
              }}
            >
              🗑️ Delete
            </button>
          )}
          <button onClick={() => navigate(`/documents?event_id=${eventId}`)}>
              Generate Docs
          </button>
        </div>
      </div>

      {/* Delete confirm modal */}
      {showDeleteModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 32,
              maxWidth: 420,
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>🗑️</div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: "#8B0000",
                marginBottom: 8,
              }}
            >
              Delete This Event?
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: theme.primary,
                marginBottom: 4,
              }}
            >
              {event.event_nickname || event.name}
            </div>
            <div
              style={{ fontSize: 13, color: theme.textMuted, marginBottom: 20 }}
            >
              {event.client} · {event.event_date || "No date"}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#8B0000",
                background: "#FFF5F5",
                border: "1px solid #ffcccc",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 24,
                lineHeight: 1.6,
              }}
            >
              This will permanently delete this event and all associated roster
              and staff data. This cannot be undone.
            </div>
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{
                  padding: "9px 20px",
                  borderRadius: 8,
                  border: `1.5px solid ${theme.border}`,
                  background: "#fff",
                  color: theme.text,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEvent}
                disabled={deleting}
                style={{
                  padding: "9px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#8B0000",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? "Deleting…" : "Yes, Delete Event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div
        style={{
          background: "#fff",
          padding: "14px 36px",
          borderBottom: `1px solid ${theme.border}`,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            flex: 1,
            height: 8,
            background: theme.border,
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: primaryColor,
              borderRadius: 999,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: theme.primary,
            whiteSpace: "nowrap",
          }}
        >
          {doneItems} / {totalItems} complete ({pct}%)
        </div>
        {saving && (
          <div style={{ fontSize: 12, color: theme.textMuted }}>Saving…</div>
        )}
      </div>

      <div
        style={{
          padding: "28px 36px",
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 24,
        }}
      >
        {/* Left column */}
        <div>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
            {[
              { key: "checklist", label: "Checklist" },
              { key: "shifts", label: "Shifts" },
              { key: "staff", label: `Staff Roster` },
              { key: "client_staff", label: "Client Staff" },
              { key: "app_setup", label: "⚙️ App Setup" },
              { key: "planning", label: "🗂 Staff Planning" },
              { key: "reports", label: "Reports" },
              { key: "intelligence", label: "📊 Intelligence" }
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background:
                    activeTab === t.key ? primaryColor : "transparent",
                  color: activeTab === t.key ? "#fff" : theme.textMuted,
                  border: `1.5px solid ${activeTab === t.key ? primaryColor : theme.border}`,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.15s",
                }}
              >
                {t.label}
                {t.key === "shifts" && shifts.length > 0 && (
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>
                    ({shifts.length})
                  </span>
                )}
                {t.key === "staff" && staffProfiles.length > 0 && (
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>
                    ({staffProfiles.length})
                  </span>
                )}
                {t.key === "client_staff" && clientStaff.length > 0 && (
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>
                    ({clientStaff.length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── CHECKLIST TAB ── */}
          {activeTab === "checklist" && (
            <>
              {/* Roster summary */}
              <Card style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: theme.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 14,
                  }}
                >
                  Event Roster{" "}
                  <span style={{ fontWeight: 400 }}>({roster.length})</span>
                </div>
                {roster.length === 0 ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: theme.textMuted,
                      padding: "4px 0",
                    }}
                  >
                    No one assigned yet. Use the Talent Pool to assign staff.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr
                          style={{ borderBottom: `2px solid ${theme.border}` }}
                        >
                          {(() => {
                            const uncleared = roster.filter(
                              (r) => !r.isContractor && !r.background_check,
                            );
                            if (event?.has_minors && uncleared.length > 0)
                              return (
                                <tr>
                                  <td
                                    colSpan={6}
                                    style={{ padding: "8px 0 12px" }}
                                  >
                                    <div
                                      style={{
                                        padding: "8px 12px",
                                        borderRadius: 8,
                                        background: "rgba(139,0,0,0.06)",
                                        border: "1px solid rgba(139,0,0,0.2)",
                                        fontSize: 12,
                                        color: "#8B0000",
                                        fontWeight: 600,
                                      }}
                                    >
                                      🚫 Minors present — {uncleared.length}{" "}
                                      volunteer
                                      {uncleared.length !== 1 ? "s" : ""} on
                                      this roster have not cleared a background
                                      check. Do not place on floor until
                                      resolved.
                                    </div>
                                  </td>
                                </tr>
                              );
                            if (event?.allow_unverified && uncleared.length > 0)
                              return (
                                <tr>
                                  <td
                                    colSpan={6}
                                    style={{ padding: "8px 0 12px" }}
                                  >
                                    <div
                                      style={{
                                        padding: "8px 12px",
                                        borderRadius: 8,
                                        background: "rgba(224,123,42,0.07)",
                                        border:
                                          "1px solid rgba(224,123,42,0.25)",
                                        fontSize: 12,
                                        color: "#E07B2A",
                                        fontWeight: 600,
                                      }}
                                    >
                                      ⚠ Unverified volunteers permitted for this
                                      event — {uncleared.length} uncleared.
                                      Assign to low-risk roles only
                                      (registration, wayfinding, crowd flow).
                                    </div>
                                  </td>
                                </tr>
                              );
                            if (
                              !event?.allow_unverified &&
                              !event?.has_minors &&
                              uncleared.length > 0
                            )
                              return (
                                <tr>
                                  <td
                                    colSpan={6}
                                    style={{ padding: "8px 0 12px" }}
                                  >
                                    <div
                                      style={{
                                        padding: "8px 12px",
                                        borderRadius: 8,
                                        background: "rgba(139,0,0,0.06)",
                                        border: "1px solid rgba(139,0,0,0.2)",
                                        fontSize: 12,
                                        color: "#8B0000",
                                        fontWeight: 600,
                                      }}
                                    >
                                      ⚠ {uncleared.length} uncleared volunteer
                                      {uncleared.length !== 1 ? "s" : ""} on
                                      roster — background check not completed.
                                      Review before event day.
                                    </div>
                                  </td>
                                </tr>
                              );
                            return null;
                          })()}
                          {[
                            "Name",
                            "Role",
                            "Type",
                            "Est. Pay",
                            "Code Sent",
                            "Onboarded",
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "6px 12px 8px 0",
                                textAlign: "left",
                                fontSize: 11,
                                fontWeight: 700,
                                color: theme.textMuted,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {roster.map((r) => {
                          const roleLabels = {
                            volunteer: "Volunteer",
                            team_lead: "Team Lead",
                            ops_lead: "Ops Lead",
                            ops_manager: "Ops Manager",
                            engagement_lead: "Engagement Lead",
                          };
                          const hasMinorRisk =
                            event?.has_minors &&
                            !r.isContractor &&
                            !r.background_check;
                          const hasUnclearedRisk =
                            !event?.allow_unverified &&
                            !r.isContractor &&
                            !r.background_check;
                          const rowWarning = hasMinorRisk || hasUnclearedRisk;
                          return (
                            <tr
                              key={r.id}
                              style={{
                                borderBottom: `1px solid ${theme.border}`,
                                background: hasMinorRisk
                                  ? "rgba(139,0,0,0.04)"
                                  : hasUnclearedRisk
                                    ? "rgba(224,123,42,0.04)"
                                    : "transparent",
                              }}
                            >
                              <td
                                style={{
                                  padding: "9px 12px 9px 0",
                                  fontWeight: 600,
                                  color: theme.text,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {r.name}
                                {hasMinorRisk && (
                                  <span
                                    title="Minors present — background check not cleared"
                                    style={{
                                      marginLeft: 6,
                                      fontSize: 12,
                                      color: "#8B0000",
                                    }}
                                  >
                                    ⚠
                                  </span>
                                )}
                                {hasUnclearedRisk && !hasMinorRisk && (
                                  <span
                                    title="Background check not cleared"
                                    style={{
                                      marginLeft: 6,
                                      fontSize: 12,
                                      color: "#E07B2A",
                                    }}
                                  >
                                    ○
                                  </span>
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "9px 12px 9px 0",
                                  color: theme.textMuted,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {roleLabels[r.floor_role] ||
                                  r.floor_role ||
                                  "—"}
                              </td>
                              <td style={{ padding: "9px 12px 9px 0" }}>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: r.isContractor
                                      ? "rgba(201,160,48,0.12)"
                                      : "rgba(88,176,108,0.12)",
                                    color: r.isContractor
                                      ? theme.accentDark
                                      : "#2d7a46",
                                  }}
                                >
                                  {r.isContractor ? "Contractor" : "Volunteer"}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "9px 12px 9px 0",
                                  color: theme.text,
                                }}
                              >
                                {r.estimated_pay
                                  ? `$${Number(r.estimated_pay).toFixed(2)}`
                                  : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "9px 12px 9px 0",
                                  fontSize: 14,
                                }}
                              >
                                {r.event_code_sent ? (
                                  <span style={{ color: theme.secondary }}>
                                    ✓
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "9px 12px 9px 0",
                                  fontSize: 14,
                                }}
                              >
                                {r.onboarding_complete ? (
                                  <span style={{ color: theme.secondary }}>
                                    ✓
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Checklist sections */}
              {CHECKLIST.map(({ section, items }) => (
                <Card key={section} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: theme.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: 12,
                    }}
                  >
                    {section}
                  </div>
                  {items.map((item) => {
                    const { key, label } = item;
                    const done = !!checklist[key];
                    return (
                      <div
                        key={key}
                        onClick={() => toggleCheck(key)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 0",
                          borderBottom: `1px solid ${theme.border}`,
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = theme.background)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            flexShrink: 0,
                            border: `2px solid ${done ? primaryColor : theme.borderStrong}`,
                            background: done ? primaryColor : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {done && (
                            <span
                              style={{
                                color: "#fff",
                                fontSize: 12,
                                lineHeight: 1,
                              }}
                            >
                              ✓
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: done ? 600 : 400,
                            color: done ? theme.text : theme.textMuted,
                          }}
                        >
                          {label}
                        </span>
                        {item.required && !done && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#e74c3c",
                              marginLeft: 8,
                              background: "#e74c3c11",
                              padding: "1px 6px",
                              borderRadius: 999,
                            }}
                          >
                            Required
                          </span>
                        )}
                        {done && checklist[`${key}_by`] && (
                          <span
                            style={{
                              fontSize: 11,
                              color: theme.textMuted,
                              marginLeft: "auto",
                            }}
                          >
                            by {checklist[`${key}_by`]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </Card>
              ))}
            </>
          )}

          {/* ── STAFF ROSTER TAB ── */}
          {activeTab === "staff" && (
            <Card>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 14,
                }}
              >
                Leadership Scoring — Volunteer Profiles
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  marginBottom: 14,
                  lineHeight: 1.6,
                }}
              >
                Scores are calculated from volunteer profiles. TL eligible ≥60
                pts. Ops Lead eligible requires ≥90 pts + full skill stack.
                Promotions write back to the volunteer profile and flip the app
                dashboard.
              </div>

              {/* Filter tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginBottom: 16,
                  flexWrap: "wrap",
                }}
              >
                {[
                  { key: "all", label: "All" },
                  { key: "tl_eligible", label: "TL Eligible" },
                  { key: "ops_eligible", label: "Ops Lead Eligible" },
                  { key: "assigned", label: "Assigned" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setStaffFilter(f.key)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      background:
                        staffFilter === f.key ? theme.primary : "transparent",
                      color: staffFilter === f.key ? "#fff" : theme.textMuted,
                      border: `1.5px solid ${staffFilter === f.key ? theme.primary : theme.border}`,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {staffLoading ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    padding: 32,
                  }}
                >
                  <Spinner size={24} />
                </div>
              ) : staffProfiles.length === 0 ? (
                <EmptyState
                  icon="◎"
                  title="No volunteer profiles yet"
                  subtitle="Profiles appear once volunteers complete their profile in the app."
                />
              ) : (
                <StaffList
                  staffProfiles={staffProfiles}
                  staffFilter={staffFilter}
                  staffExpanded={staffExpanded}
                  setStaffExpanded={setStaffExpanded}
                  promotingSaving={promotingSaving}
                  promoteRole={promoteRole}
                  theme={theme}
                />
              )}
            </Card>
          )}

          {/* ── CLIENT STAFF TAB ── */}
          {activeTab === "client_staff" && (
            <Card>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                }}
              >
                Client Staff
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  marginBottom: 16,
                  lineHeight: 1.6,
                }}
              >
                Staff from the client's organization involved in this event.
                Toggle app access for anyone who will need to use Axis on the
                day-of.
              </div>

              {/* Existing client staff */}
              {clientStaff.length === 0 ? (
                <div
                  style={{
                    fontSize: 13,
                    color: theme.textMuted,
                    marginBottom: 20,
                  }}
                >
                  No client staff added yet.
                </div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  {clientStaff.map((cs) => (
                    <div
                      key={cs.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 0",
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: theme.text,
                          }}
                        >
                          {cs.name}
                        </div>
                        <div style={{ fontSize: 12, color: theme.textMuted }}>
                          {cs.title}
                          {cs.title && cs.email ? " · " : ""}
                          {cs.email}
                          {cs.phone ? " · " + cs.phone : ""}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <button
                          onClick={() =>
                            toggleAppAccess(cs.id, cs.needs_app_access)
                          }
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            background: cs.needs_app_access
                              ? "rgba(88,176,108,0.15)"
                              : theme.background,
                            color: cs.needs_app_access
                              ? "#2d7a46"
                              : theme.textMuted,
                            border: `1.5px solid ${cs.needs_app_access ? "#2d7a46" : theme.border}`,
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {cs.needs_app_access
                            ? "✓ App Access"
                            : "No App Access"}
                        </button>
                        <button
                          onClick={() => removeClientStaff(cs.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 16,
                            color: theme.textMuted,
                            padding: "2px 4px",
                          }}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new client staff */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 10,
                }}
              >
                Add Client Staff
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {[
                  { key: "name", placeholder: "Full name *", required: true },
                  { key: "title", placeholder: "Title / Role" },
                  { key: "email", placeholder: "Email" },
                  { key: "phone", placeholder: "Phone" },
                ].map(({ key, placeholder }) => (
                  <input
                    key={key}
                    value={newClientStaff[key]}
                    onChange={(e) =>
                      setNewClientStaff((p) => ({
                        ...p,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder={placeholder}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      fontSize: 12,
                      fontFamily: "'DM Sans', sans-serif",
                      outline: "none",
                      color: theme.text,
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <input
                  type="checkbox"
                  id="app_access"
                  checked={newClientStaff.needs_app_access}
                  onChange={(e) =>
                    setNewClientStaff((p) => ({
                      ...p,
                      needs_app_access: e.target.checked,
                    }))
                  }
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <label
                  htmlFor="app_access"
                  style={{ fontSize: 13, color: theme.text, cursor: "pointer" }}
                >
                  Needs Axis app access for this event
                </label>
              </div>
              <Button
                size="sm"
                onClick={addClientStaff}
                disabled={!newClientStaff.name.trim() || clientStaffSaving}
              >
                {clientStaffSaving ? "Adding…" : "Add Staff Member"}
              </Button>
            </Card>
          )}

          {/* ── SHIFTS TAB ── */}
          {activeTab === "shifts" && (
            <Card>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: theme.text,
                  marginBottom: 4,
                }}
              >
                Volunteer Shifts
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  marginBottom: 20,
                  lineHeight: 1.6,
                }}
              >
                Build shifts for volunteers to select from. Contractors see
                their Engagement Windows separately — they don't use this
                selector.
              </div>

              {/* Existing shifts */}
              {shiftsLoading && (
                <div
                  style={{
                    fontSize: 13,
                    color: theme.textMuted,
                    marginBottom: 16,
                  }}
                >
                  Loading shifts…
                </div>
              )}
              {!shiftsLoading && shifts.length === 0 && (
                <div
                  style={{
                    fontSize: 13,
                    color: theme.textMuted,
                    marginBottom: 20,
                    padding: "16px 0",
                    textAlign: "center",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  No shifts created yet. Build your first shift below.
                </div>
              )}
              {shifts.map((shift) => {
                const filled = (shift.assigned || []).length;
                const cap = shift.capacity || 0;
                const pctFill =
                  cap > 0 ? Math.min(100, Math.round((filled / cap) * 100)) : 0;
                const statusC =
                  filled >= cap && cap > 0
                    ? "#27ae60"
                    : filled > 0
                      ? "#f39c12"
                      : "#e74c3c";
                const statusL =
                  filled >= cap && cap > 0
                    ? "Full"
                    : filled > 0
                      ? `${filled}/${cap} filled`
                      : "Unfilled";
                return (
                  <div
                    key={shift.id}
                    style={{
                      padding: "14px 0",
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: theme.text,
                            marginBottom: 2,
                          }}
                        >
                          {shift.name}
                        </div>
                        <div style={{ fontSize: 12, color: theme.textMuted }}>
                          {shift.start_time} – {shift.end_time}
                          {shift.zone
                            ? ` · ${planningZones.find((z) => z.id === shift.zone)?.name || shift.zone}`
                            : ""}
                          {shift.role_type ? ` · ${shift.role_type}` : ""}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: statusC,
                            background: statusC + "22",
                            padding: "3px 8px",
                            borderRadius: 999,
                          }}
                        >
                          {statusL}
                        </span>
                        {isFounder && (
                          <button
                            onClick={() => deleteShift(shift.id)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 14,
                              color: theme.textMuted,
                              padding: "2px 4px",
                            }}
                            title="Delete shift"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Fill bar */}
                    {cap > 0 && (
                      <div
                        style={{
                          height: 5,
                          background: theme.border,
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pctFill}%`,
                            background: statusC,
                            borderRadius: 999,
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                    )}
                    {/* Assigned names */}
                    {(shift.assigned || []).length > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        {shift.assigned.map((name, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: 11,
                              background: theme.background,
                              border: `1px solid ${theme.border}`,
                              borderRadius: 999,
                              padding: "2px 8px",
                              color: theme.text,
                            }}
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* New shift builder */}
              <div style={{ marginTop: 20 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: theme.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 12,
                  }}
                >
                  Create New Shift
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  {[
                    {
                      key: "name",
                      placeholder: "Shift name *  (e.g. Morning Ingress)",
                    },
                    {
                      key: "start_time",
                      placeholder: "Start time *  (e.g. 8:00 AM)",
                    },
                    {
                      key: "end_time",
                      placeholder: "End time *  (e.g. 12:00 PM)",
                    },
                    {
                      key: "capacity",
                      placeholder: "Volunteer capacity  (e.g. 8)",
                    },
                    {
                      key: "role_type",
                      placeholder: "Role type  (e.g. Badge Scanner)",
                    },
                    { key: "date", placeholder: "Date  (e.g. 2025-06-12)" },
                  ].map(({ key, placeholder }) => (
                    <input
                      key={key}
                      value={newShift[key]}
                      onChange={(e) =>
                        setNewShift((p) => ({ ...p, [key]: e.target.value }))
                      }
                      placeholder={placeholder}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: `1px solid ${theme.border}`,
                        fontSize: 12,
                        fontFamily: "'DM Sans', sans-serif",
                        outline: "none",
                        color: theme.text,
                        background: "#fff",
                      }}
                    />
                  ))}
                  {/* Zone dropdown — pulls from staff plan zones */}
                  <select
                    value={newShift.zone}
                    onChange={(e) =>
                      setNewShift((p) => ({ ...p, zone: e.target.value }))
                    }
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      fontSize: 12,
                      fontFamily: "'DM Sans', sans-serif",
                      outline: "none",
                      color: newShift.zone ? theme.text : theme.textMuted,
                      background: "#fff",
                    }}
                  >
                    <option value="">Zone / Area (select one)</option>
                    {planningZones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.label || z.name}
                      </option>
                    ))}
                    <option value="unzoned">General / No specific zone</option>
                  </select>
                </div>
                <Button
                  size="sm"
                  onClick={addShift}
                  disabled={
                    !newShift.name.trim() ||
                    !newShift.start_time ||
                    !newShift.end_time ||
                    shiftSaving
                  }
                >
                  {shiftSaving ? "Saving…" : "+ Create Shift"}
                </Button>
              </div>
            </Card>
          )}

          {/* ── APP SETUP TAB ── */}
          {activeTab === "app_setup" && (
            <div>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 15, fontWeight: 700, color: theme.text }}
                  >
                    App Setup
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: theme.textMuted,
                      marginTop: 2,
                    }}
                  >
                    Configure how this event runs in the Axis mobile app.
                  </div>
                </div>
                <button
                  onClick={saveAppSetup}
                  disabled={appSetupSaving}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    border: "none",
                    background: appSetupSaved ? "#27ae60" : primaryColor,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    minWidth: 110,
                  }}
                >
                  {appSetupSaving
                    ? "Saving…"
                    : appSetupSaved
                      ? "✓ Saved"
                      : "Save Setup"}
                </button>
              </div>

              {appSetupLoading ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 0",
                    color: theme.textMuted,
                  }}
                >
                  Loading…
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 16 }}
                >
                  {/* Scheduling Mode */}
                  <Card>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: theme.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 4,
                      }}
                    >
                      Scheduling Mode
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: theme.textMuted,
                        marginBottom: 14,
                        lineHeight: 1.6,
                      }}
                    >
                      Controls how volunteers interact with shifts in the mobile
                      app.
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      {[
                        {
                          value: "self_select",
                          label: "Volunteer Self-Select",
                          desc: "Volunteers see open shifts and claim their own",
                        },
                        {
                          value: "managed",
                          label: "M&M Managed",
                          desc: "Volunteers see only their assigned shift, no picker",
                        },
                      ].map((opt) => (
                        <div
                          key={opt.value}
                          onClick={() =>
                            setAppSetup((p) => ({
                              ...p,
                              schedule_mode: opt.value,
                            }))
                          }
                          style={{
                            flex: 1,
                            padding: "14px 16px",
                            borderRadius: 10,
                            cursor: "pointer",
                            border: `2px solid ${appSetup.schedule_mode === opt.value ? primaryColor : theme.border}`,
                            background:
                              appSetup.schedule_mode === opt.value
                                ? `${primaryColor}0d`
                                : "#fff",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 4,
                            }}
                          >
                            <div
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                border: `2px solid ${primaryColor}`,
                                background:
                                  appSetup.schedule_mode === opt.value
                                    ? primaryColor
                                    : "transparent",
                                flexShrink: 0,
                              }}
                            />
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: theme.text,
                              }}
                            >
                              {opt.label}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: theme.textMuted,
                              paddingLeft: 22,
                            }}
                          >
                            {opt.desc}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Floor & Zone Configuration */}
                  <Card>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: theme.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 4,
                      }}
                    >
                      Floor & Zone Configuration
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: theme.textMuted,
                        marginBottom: 6,
                        lineHeight: 1.6,
                      }}
                    >
                      Build your venue layout. Add floors first, then zones
                      within each floor. This must be completed before shifts
                      can be created.
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#e07b2a",
                        background: "#e07b2a11",
                        padding: "8px 12px",
                        borderRadius: 8,
                        marginBottom: 16,
                      }}
                    >
                      ⚠ Venue walkthrough must be completed before configuring
                      floors. See checklist.
                    </div>

                    {/* Existing floors */}
                    {(appSetup.floors || []).length === 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: theme.textMuted,
                          fontStyle: "italic",
                          marginBottom: 16,
                        }}
                      >
                        No floors configured yet.
                      </div>
                    ) : (
                      <div
                        style={{
                          marginBottom: 16,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        {(appSetup.floors || []).map((floor, fi) => (
                          <div
                            key={floor.id}
                            style={{
                              background: theme.background,
                              borderRadius: 10,
                              padding: "12px 14px",
                              border: `1px solid ${theme.border}`,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: 10,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: theme.text,
                                }}
                              >
                                🏢 {floor.name}
                              </div>
                              <button
                                onClick={() =>
                                  setAppSetup((prev) => ({
                                    ...prev,
                                    floors: prev.floors.filter(
                                      (_, i) => i !== fi,
                                    ),
                                  }))
                                }
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: 16,
                                  color: theme.textMuted,
                                }}
                              >
                                ×
                              </button>
                            </div>

                            {/* Zones on this floor */}
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 6,
                                marginBottom: 10,
                              }}
                            >
                              {(floor.zones || []).map((zone, zi) => (
                                <div
                                  key={zone.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    background: `${primaryColor}12`,
                                    border: `1px solid ${primaryColor}33`,
                                    borderRadius: 999,
                                    padding: "3px 10px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 12,
                                      color: primaryColor,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {zone.name}
                                  </span>
                                  <button
                                    onClick={() =>
                                      setAppSetup((prev) => ({
                                        ...prev,
                                        floors: prev.floors.map((fl, i) =>
                                          i !== fi
                                            ? fl
                                            : {
                                                ...fl,
                                                zones: fl.zones.filter(
                                                  (_, j) => j !== zi,
                                                ),
                                              },
                                        ),
                                      }))
                                    }
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      fontSize: 13,
                                      color: theme.textMuted,
                                      padding: "0 0 0 2px",
                                      lineHeight: 1,
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              {!(floor.zones || []).length && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: theme.textMuted,
                                    fontStyle: "italic",
                                  }}
                                >
                                  No zones yet
                                </span>
                              )}
                            </div>

                            {/* Add zone to this floor */}
                            <div style={{ display: "flex", gap: 6 }}>
                              <input
                                value={newZoneInputs[floor.id] || ""}
                                onChange={(e) =>
                                  setNewZoneInputs((prev) => ({
                                    ...prev,
                                    [floor.id]: e.target.value,
                                  }))
                                }
                                placeholder="Zone name (e.g. Registration)"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const name = (
                                      newZoneInputs[floor.id] || ""
                                    ).trim();
                                    if (!name) return;
                                    const zoneId = name
                                      .toLowerCase()
                                      .replace(/\s+/g, "_");
                                    setAppSetup((prev) => ({
                                      ...prev,
                                      floors: prev.floors.map((fl, i) =>
                                        i !== fi
                                          ? fl
                                          : {
                                              ...fl,
                                              zones: [
                                                ...(fl.zones || []),
                                                { id: zoneId, name },
                                              ],
                                            },
                                      ),
                                    }));
                                    setNewZoneInputs((prev) => ({
                                      ...prev,
                                      [floor.id]: "",
                                    }));
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  padding: "6px 10px",
                                  borderRadius: 6,
                                  border: `1px solid ${theme.border}`,
                                  fontSize: 12,
                                  fontFamily: "'DM Sans', sans-serif",
                                  outline: "none",
                                  color: theme.text,
                                }}
                              />
                              <button
                                onClick={() => {
                                  const name = (
                                    newZoneInputs[floor.id] || ""
                                  ).trim();
                                  if (!name) return;
                                  const zoneId = name
                                    .toLowerCase()
                                    .replace(/\s+/g, "_");
                                  setAppSetup((prev) => ({
                                    ...prev,
                                    floors: prev.floors.map((fl, i) =>
                                      i !== fi
                                        ? fl
                                        : {
                                            ...fl,
                                            zones: [
                                              ...(fl.zones || []),
                                              { id: zoneId, name },
                                            ],
                                          },
                                    ),
                                  }));
                                  setNewZoneInputs((prev) => ({
                                    ...prev,
                                    [floor.id]: "",
                                  }));
                                }}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 6,
                                  background: primaryColor,
                                  color: "#fff",
                                  border: "none",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  fontFamily: "'DM Sans', sans-serif",
                                }}
                              >
                                + Zone
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add floor */}
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: theme.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 8,
                      }}
                    >
                      Add Floor
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={newFloorName}
                        onChange={(e) => setNewFloorName(e.target.value)}
                        placeholder="Floor name (e.g. Floor 1, Rooftop, Main Level)"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const name = newFloorName.trim();
                            if (!name) return;
                            const id = `floor_${Date.now()}`;
                            setAppSetup((prev) => ({
                              ...prev,
                              floors: [
                                ...(prev.floors || []),
                                { id, name, zones: [] },
                              ],
                            }));
                            setNewFloorName("");
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: `1px solid ${theme.border}`,
                          fontSize: 12,
                          fontFamily: "'DM Sans', sans-serif",
                          outline: "none",
                          color: theme.text,
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const name = newFloorName.trim();
                          if (!name) return;
                          const id = `floor_${Date.now()}`;
                          setAppSetup((prev) => ({
                            ...prev,
                            floors: [
                              ...(prev.floors || []),
                              { id, name, zones: [] },
                            ],
                          }));
                          setNewFloorName("");
                        }}
                      >
                        + Add Floor
                      </Button>
                    </div>
                  </Card>

                  {/* Brand & App Theme */}
                  <Card>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: theme.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 4,
                      }}
                    >
                      Brand & App Theme
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: theme.textMuted,
                        marginBottom: 16,
                        lineHeight: 1.6,
                      }}
                    >
                      Enter your brand colors. Axis will auto-generate the full
                      color system for the mobile app — text, borders, surfaces,
                      and tints are derived automatically.
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 12,
                        marginBottom: 16,
                      }}
                    >
                      {[
                        {
                          key: "primary",
                          label: "Primary Color",
                          placeholder: "#1C4A36",
                          required: true,
                        },
                        {
                          key: "accent",
                          label: "Accent Color",
                          placeholder: "#EBC764 (optional)",
                        },
                        {
                          key: "background",
                          label: "Background Color",
                          placeholder: "#F7F4EA (optional)",
                        },
                      ].map(({ key, label, placeholder, required }) => (
                        <div key={key}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: theme.textMuted,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              marginBottom: 6,
                            }}
                          >
                            {label}
                            {required && " *"}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            {brandColors[key] &&
                              /^#[0-9A-Fa-f]{6}$/.test(brandColors[key]) && (
                                <div
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    background: brandColors[key],
                                    border: `1px solid ${theme.border}`,
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                            <input
                              type="text"
                              value={brandColors[key]}
                              onChange={(e) => {
                                const val = e.target.value;
                                const next = { ...brandColors, [key]: val };
                                setBrandColors(next);
                                const preview = previewEventTheme(next);
                                setThemePreview(preview);
                              }}
                              placeholder={placeholder}
                              style={{
                                flex: 1,
                                padding: "8px 10px",
                                borderRadius: 6,
                                border: `1px solid ${theme.border}`,
                                fontSize: 13,
                                fontFamily: "monospace",
                                outline: "none",
                                color: theme.text,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Preview */}
                    {themePreview && (
                      <div
                        style={{
                          borderRadius: 10,
                          overflow: "hidden",
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        <div
                          style={{
                            padding: "14px 16px",
                            background: themePreview.primary,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: themePreview.accent || "#fff",
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                opacity: 0.8,
                              }}
                            >
                              EVENT THEME PREVIEW
                            </div>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: themePreview.onPrimary || "#fff",
                                marginTop: 2,
                              }}
                            >
                              {event?.event_nickname ||
                                event?.name ||
                                "Event Name"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            {[
                              themePreview.primary,
                              themePreview.accent,
                              themePreview.secondary,
                              themePreview.background,
                            ].map((c, i) => (
                              <div
                                key={i}
                                title={c}
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 4,
                                  background: c,
                                  border: "1px solid rgba(255,255,255,0.3)",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        <div
                          style={{
                            padding: "12px 16px",
                            background: themePreview.background,
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              color: themePreview.text,
                              fontWeight: 600,
                            }}
                          >
                            Text
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: themePreview.textMuted,
                            }}
                          >
                            Muted
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "3px 10px",
                              borderRadius: 999,
                              background:
                                themePreview.softPrimary ||
                                `${themePreview.primary}15`,
                              color: themePreview.primary,
                              fontWeight: 700,
                            }}
                          >
                            Chip
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "3px 10px",
                              borderRadius: 999,
                              background: themePreview.primary,
                              color: themePreview.onPrimary || "#fff",
                              fontWeight: 700,
                            }}
                          >
                            Button
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: themePreview.textMuted,
                              marginLeft: "auto",
                            }}
                          >
                            {Object.keys(themePreview).length} tokens generated
                            ✓
                          </span>
                        </div>
                      </div>
                    )}

                    {!themePreview && brandColors.primary && (
                      <div
                        style={{
                          fontSize: 12,
                          color: theme.danger,
                          marginTop: 8,
                        }}
                      >
                        Enter a valid hex color (e.g. #1C4A36) to generate the
                        theme.
                      </div>
                    )}
                  </Card>

                  {/* Event Staff Credentials */}
                  <Card>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: theme.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 4,
                      }}
                    >
                      Event Staff Credentials
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: theme.textMuted,
                        marginBottom: 16,
                        lineHeight: 1.6,
                      }}
                    >
                      PIN credentials for client-side event staff (P1–P4). These
                      gate access to specific app features based on pillar
                      level.
                    </div>

                    {/* Pillar reference */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 6,
                        marginBottom: 16,
                      }}
                    >
                      {[
                        {
                          p: "P1",
                          label: "Observer",
                          desc: "View roster only",
                          color: "#95a5a6",
                        },
                        {
                          p: "P3",
                          label: "Floor Staff",
                          desc: "Check-in + view shifts",
                          color: "#3498db",
                        },
                        {
                          p: "P4",
                          label: "Event Lead",
                          desc: "Full access incl. alerts",
                          color: "#27ae60",
                        },
                      ].map(({ p, label, desc, color }) => (
                        <div
                          key={p}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: color + "15",
                            border: `1px solid ${color}44`,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 800, color }}>
                            {p}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: theme.text,
                              marginTop: 2,
                            }}
                          >
                            {label}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: theme.textMuted,
                              marginTop: 1,
                            }}
                          >
                            {desc}
                          </div>
                        </div>
                      ))}
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: theme.background,
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          P2 = custom — set per person
                        </div>
                      </div>
                    </div>

                    {/* Existing staff */}
                    {appSetup.event_staff.length === 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: theme.textMuted,
                          marginBottom: 16,
                          fontStyle: "italic",
                        }}
                      >
                        No event staff added yet.
                      </div>
                    ) : (
                      <div style={{ marginBottom: 16 }}>
                        {appSetup.event_staff.map((s, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "10px 0",
                              borderBottom: `1px solid ${theme.border}`,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: theme.text,
                                }}
                              >
                                {s.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: theme.textMuted,
                                  marginBottom: 4,
                                }}
                              >
                                PIN: {s.pin}
                                {s.last4 ? ` · Last 4: ${s.last4}` : ""} ·{" "}
                                {s.pillar}
                              </div>
                              {s.permissions && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 4,
                                  }}
                                >
                                  {Object.entries(s.permissions)
                                    .filter(([, v]) => v)
                                    .map(([k]) => (
                                      <span
                                        key={k}
                                        style={{
                                          fontSize: 10,
                                          padding: "1px 6px",
                                          borderRadius: 999,
                                          background: `${primaryColor}12`,
                                          color: primaryColor,
                                          fontWeight: 600,
                                        }}
                                      >
                                        {k.replace(/_/g, " ")}
                                      </span>
                                    ))}
                                  {!Object.values(s.permissions).some(
                                    Boolean,
                                  ) && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        color: theme.textMuted,
                                        fontStyle: "italic",
                                      }}
                                    >
                                      View only
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background:
                                  s.pillar === "P4"
                                    ? "#27ae6022"
                                    : s.pillar === "P3"
                                      ? "#3498db22"
                                      : s.pillar === "Custom"
                                        ? `${primaryColor}18`
                                        : "#95a5a622",
                                color:
                                  s.pillar === "P4"
                                    ? "#27ae60"
                                    : s.pillar === "P3"
                                      ? "#3498db"
                                      : s.pillar === "Custom"
                                        ? primaryColor
                                        : "#95a5a6",
                              }}
                            >
                              {s.pillar}
                            </span>
                            <button
                              onClick={() => removeEventStaffEntry(idx)}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 16,
                                color: theme.textMuted,
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new staff */}
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: theme.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 10,
                      }}
                    >
                      Add Staff Member
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 1fr 1fr",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      {[
                        { key: "name", placeholder: "Full name *" },
                        { key: "pin", placeholder: "PIN *" },
                        { key: "last4", placeholder: "Last 4 phone (P4)" },
                      ].map(({ key, placeholder }) => (
                        <input
                          key={key}
                          value={newStaffEntry[key]}
                          onChange={(e) =>
                            setNewStaffEntry((p) => ({
                              ...p,
                              [key]: e.target.value,
                            }))
                          }
                          placeholder={placeholder}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 6,
                            border: `1px solid ${theme.border}`,
                            fontSize: 12,
                            fontFamily: "'DM Sans', sans-serif",
                            outline: "none",
                            color: theme.text,
                          }}
                        />
                      ))}
                      <select
                        value={newStaffEntry.pillar}
                        onChange={(e) =>
                          setNewStaffEntry((p) => ({
                            ...p,
                            pillar: e.target.value,
                          }))
                        }
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: `1px solid ${theme.border}`,
                          fontSize: 12,
                          fontFamily: "'DM Sans', sans-serif",
                          outline: "none",
                          color: theme.text,
                        }}
                      >
                        <option value="P1">P1 — Observer</option>
                        <option value="P3">P3 — Floor Staff</option>
                        <option value="P4">P4 — Event Lead</option>
                        <option value="Custom">Custom — Set manually</option>
                      </select>
                    </div>

                    {/* Custom permission toggles — shown only when Custom pillar selected */}
                    {newStaffEntry.pillar === "Custom" && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: "14px 16px",
                          borderRadius: 10,
                          background: theme.background,
                          border: `1.5px solid ${primaryColor}44`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: primaryColor,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            marginBottom: 10,
                          }}
                        >
                          Custom Permissions
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 0,
                          }}
                        >
                          {[
                            ["check_in_volunteers", "Check in volunteers"],
                            ["manual_check_in", "Manual check-in override"],
                            ["view_floor_layout", "View floor layout"],
                            ["view_incidents", "View incident reports"],
                            ["manage_shifts", "Manage shifts"],
                            ["send_alerts", "Send alerts"],
                          ].map(([key, label]) => (
                            <div
                              key={key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "7px 8px",
                                borderBottom: `1px solid ${theme.border}`,
                              }}
                            >
                              <span style={{ fontSize: 12, color: theme.text }}>
                                {label}
                              </span>
                              <div
                                onClick={() =>
                                  setCustomPerms((p) => ({
                                    ...p,
                                    [key]: !p[key],
                                  }))
                                }
                                style={{
                                  width: 36,
                                  height: 20,
                                  borderRadius: 999,
                                  cursor: "pointer",
                                  background: customPerms[key]
                                    ? primaryColor
                                    : theme.border,
                                  position: "relative",
                                  transition: "background 0.2s",
                                  flexShrink: 0,
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 3,
                                    left: customPerms[key] ? 18 : 3,
                                    width: 14,
                                    height: 14,
                                    borderRadius: "50%",
                                    background: "#fff",
                                    transition: "left 0.2s",
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={addEventStaffEntry}
                      disabled={
                        !newStaffEntry.name.trim() || !newStaffEntry.pin.trim()
                      }
                    >
                      + Add Staff Member
                    </Button>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* ── STAFF PLANNING TAB ── */}
          {activeTab === "planning" &&
            (() => {
              const tc = (score) => {
                if (score >= 90) return "#27ae60";
                if (score >= 60) return "#3498db";
                if (score >= 40) return "#f39c12";
                return "#95a5a6";
              };

              const filteredPlanners = planningProfiles.filter((s) => {
                if (planningFilter === "tl_eligible") return s.score >= 60;
                if (planningFilter === "ops_eligible") return s.opsLeadEligible;
                if (planningFilter === "assigned")
                  return getAssignedZone(s.uid) !== null;
                return true;
              });

              return (
                <div>
                  {/* Header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: theme.text,
                        }}
                      >
                        Pre-Event Staff Planning
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: theme.textMuted,
                          marginTop: 2,
                        }}
                      >
                        Assign team leads and ops leads to zones before the
                        event. Assignments feed directly into Axis Insights.
                      </div>
                    </div>
                    <button
                      onClick={savePlan}
                      disabled={planSaving}
                      style={{
                        padding: "8px 20px",
                        borderRadius: 8,
                        border: "none",
                        background: planSaved ? "#27ae60" : primaryColor,
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                        minWidth: 110,
                      }}
                    >
                      {planSaving
                        ? "Saving…"
                        : planSaved
                          ? "✓ Saved"
                          : "Save Plan"}
                    </button>
                  </div>

                  {planningLoading ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "60px 0",
                        color: theme.textMuted,
                      }}
                    >
                      Loading crew profiles…
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 20,
                      }}
                    >
                      {/* LEFT: Volunteer roster */}
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: theme.textMuted,
                            marginBottom: 10,
                          }}
                        >
                          Candidate Roster — {filteredPlanners.length} shown
                        </div>

                        {/* Filter pills */}
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            marginBottom: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          {[
                            { key: "all", label: "All" },
                            { key: "tl_eligible", label: "TL Eligible" },
                            { key: "ops_eligible", label: "Ops Eligible" },
                            { key: "assigned", label: "Assigned" },
                          ].map((f) => (
                            <button
                              key={f.key}
                              onClick={() => setPlanningFilter(f.key)}
                              style={{
                                padding: "5px 12px",
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                                fontFamily: "'DM Sans', sans-serif",
                                background:
                                  planningFilter === f.key
                                    ? primaryColor
                                    : "transparent",
                                color:
                                  planningFilter === f.key
                                    ? "#fff"
                                    : theme.textMuted,
                                border: `1.5px solid ${planningFilter === f.key ? primaryColor : theme.border}`,
                              }}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>

                        {/* Candidate cards */}
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            maxHeight: 580,
                            overflowY: "auto",
                            paddingRight: 4,
                          }}
                        >
                          {filteredPlanners.length === 0 && (
                            <div
                              style={{
                                textAlign: "center",
                                padding: "32px 0",
                                color: theme.textMuted,
                                fontSize: 13,
                              }}
                            >
                              No candidates match this filter.
                            </div>
                          )}
                          {filteredPlanners.map((s) => {
                            const assignedZone = getAssignedZone(s.uid);
                            const assignedZoneLabel = assignedZone
                              ? planningZones.find((z) => z.id === assignedZone)
                                  ?.label || assignedZone
                              : null;
                            return (
                              <div
                                key={s.uid}
                                style={{
                                  background: "#fff",
                                  borderRadius: 10,
                                  padding: "12px 14px",
                                  border: `1.5px solid ${assignedZone ? primaryColor : theme.border}`,
                                  boxShadow: assignedZone
                                    ? `0 0 0 3px ${primaryColor}18`
                                    : "0 1px 4px rgba(0,0,0,0.05)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    marginBottom: 6,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      fontSize: 13,
                                      color: theme.text,
                                    }}
                                  >
                                    {s.name}
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 6,
                                      alignItems: "center",
                                    }}
                                  >
                                    {s.opsLeadEligible && (
                                      <span
                                        style={{
                                          fontSize: 10,
                                          fontWeight: 700,
                                          padding: "2px 7px",
                                          borderRadius: 999,
                                          background: "rgba(15,52,96,0.1)",
                                          color: "#0F3460",
                                        }}
                                      >
                                        Ops Eligible
                                      </span>
                                    )}
                                    <span
                                      style={{
                                        fontSize: 20,
                                        fontWeight: 800,
                                        color: tc(s.score),
                                        lineHeight: 1,
                                      }}
                                    >
                                      {s.score}
                                    </span>
                                  </div>
                                </div>

                                {/* Score breakdown chips */}
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 4,
                                    marginBottom: 8,
                                  }}
                                >
                                  {s.breakdown.map((b, i) => (
                                    <span
                                      key={i}
                                      style={{
                                        fontSize: 10,
                                        padding: "2px 7px",
                                        borderRadius: 999,
                                        background: `${primaryColor}12`,
                                        color: primaryColor,
                                        fontWeight: 600,
                                      }}
                                    >
                                      +{b.points} {b.label}
                                    </span>
                                  ))}
                                </div>

                                {/* Assigned badge */}
                                {assignedZoneLabel && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: primaryColor,
                                      fontWeight: 700,
                                      marginBottom: 6,
                                    }}
                                  >
                                    📍 Assigned to {assignedZoneLabel}
                                  </div>
                                )}

                                {/* Assign buttons */}
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {planningZones.map((zone) => {
                                    const asgn = zoneAssignments[zone.id] || {};
                                    const isTL = asgn.tl === s.uid;
                                    const isOps = asgn.ops === s.uid;
                                    const isVol = (
                                      asgn.volunteers || []
                                    ).includes(s.uid);
                                    return (
                                      <div
                                        key={zone.id}
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 3,
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: 10,
                                            color: theme.textMuted,
                                            fontWeight: 700,
                                            textAlign: "center",
                                          }}
                                        >
                                          {zone.name}
                                        </div>
                                        <div
                                          style={{ display: "flex", gap: 3 }}
                                        >
                                          {s.score >= 60 && (
                                            <button
                                              onClick={() =>
                                                assignToZone(
                                                  zone.id,
                                                  s.uid,
                                                  "tl",
                                                )
                                              }
                                              style={{
                                                padding: "3px 8px",
                                                borderRadius: 6,
                                                fontSize: 10,
                                                fontWeight: 700,
                                                cursor: "pointer",
                                                border: `1.5px solid ${isTL ? "#27ae60" : theme.border}`,
                                                background: isTL
                                                  ? "#27ae60"
                                                  : "#fff",
                                                color: isTL
                                                  ? "#fff"
                                                  : theme.textMuted,
                                                fontFamily:
                                                  "'DM Sans', sans-serif",
                                              }}
                                            >
                                              TL
                                            </button>
                                          )}
                                          {s.opsLeadEligible && (
                                            <button
                                              onClick={() =>
                                                assignToZone(
                                                  zone.id,
                                                  s.uid,
                                                  "ops",
                                                )
                                              }
                                              style={{
                                                padding: "3px 8px",
                                                borderRadius: 6,
                                                fontSize: 10,
                                                fontWeight: 700,
                                                cursor: "pointer",
                                                border: `1.5px solid ${isOps ? "#0F3460" : theme.border}`,
                                                background: isOps
                                                  ? "#0F3460"
                                                  : "#fff",
                                                color: isOps
                                                  ? "#fff"
                                                  : theme.textMuted,
                                                fontFamily:
                                                  "'DM Sans', sans-serif",
                                              }}
                                            >
                                              Ops
                                            </button>
                                          )}
                                          <button
                                            onClick={() =>
                                              assignToZone(
                                                zone.id,
                                                s.uid,
                                                "volunteer",
                                              )
                                            }
                                            style={{
                                              padding: "3px 8px",
                                              borderRadius: 6,
                                              fontSize: 10,
                                              fontWeight: 700,
                                              cursor: "pointer",
                                              border: `1.5px solid ${isVol ? primaryColor : theme.border}`,
                                              background: isVol
                                                ? `${primaryColor}15`
                                                : "#fff",
                                              color: isVol
                                                ? primaryColor
                                                : theme.textMuted,
                                              fontFamily:
                                                "'DM Sans', sans-serif",
                                            }}
                                          >
                                            Vol
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* RIGHT: Zone breakdown */}
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: theme.textMuted,
                            marginBottom: 10,
                          }}
                        >
                          Zone Assignments
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          {planningZones.map((zone) => {
                            const asgn = zoneAssignments[zone.id] || {};
                            const tlProfile = asgn.tl
                              ? planningProfiles.find((p) => p.uid === asgn.tl)
                              : null;
                            const opsProfile = asgn.ops
                              ? planningProfiles.find((p) => p.uid === asgn.ops)
                              : null;
                            const volProfiles = (asgn.volunteers || [])
                              .map((uid) =>
                                planningProfiles.find((p) => p.uid === uid),
                              )
                              .filter(Boolean);
                            const filled =
                              (tlProfile ? 1 : 0) +
                              (opsProfile ? 1 : 0) +
                              volProfiles.length;
                            return (
                              <div
                                key={zone.id}
                                style={{
                                  background: "#fff",
                                  borderRadius: 12,
                                  padding: "14px 16px",
                                  border: `1.5px solid ${filled > 0 ? primaryColor + "44" : theme.border}`,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    marginBottom: 10,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      fontSize: 13,
                                      color: theme.text,
                                    }}
                                  >
                                    {zone.label || zone.name}
                                  </div>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color:
                                        filled > 0
                                          ? primaryColor
                                          : theme.textMuted,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {filled} assigned
                                  </span>
                                </div>

                                {/* Ops Lead slot */}
                                <div style={{ marginBottom: 8 }}>
                                  <div
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: "#0F3460",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.06em",
                                      marginBottom: 4,
                                    }}
                                  >
                                    Ops Lead
                                  </div>
                                  {opsProfile ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        background: "rgba(15,52,96,0.06)",
                                        borderRadius: 7,
                                        padding: "6px 10px",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: 12,
                                          fontWeight: 600,
                                          color: "#0F3460",
                                        }}
                                      >
                                        {opsProfile.name}
                                      </span>
                                      <button
                                        onClick={() =>
                                          assignToZone(
                                            zone.id,
                                            opsProfile.uid,
                                            "ops",
                                          )
                                        }
                                        style={{
                                          background: "none",
                                          border: "none",
                                          color: "#c0392b",
                                          cursor: "pointer",
                                          fontSize: 14,
                                        }}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: theme.textMuted,
                                        fontStyle: "italic",
                                        padding: "6px 0",
                                      }}
                                    >
                                      Not assigned
                                    </div>
                                  )}
                                </div>

                                {/* Team Lead slot */}
                                <div style={{ marginBottom: 8 }}>
                                  <div
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: "#27ae60",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.06em",
                                      marginBottom: 4,
                                    }}
                                  >
                                    Team Lead
                                  </div>
                                  {tlProfile ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        background: "rgba(39,174,96,0.08)",
                                        borderRadius: 7,
                                        padding: "6px 10px",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: 12,
                                          fontWeight: 600,
                                          color: "#27ae60",
                                        }}
                                      >
                                        {tlProfile.name}
                                      </span>
                                      <button
                                        onClick={() =>
                                          assignToZone(
                                            zone.id,
                                            tlProfile.uid,
                                            "tl",
                                          )
                                        }
                                        style={{
                                          background: "none",
                                          border: "none",
                                          color: "#c0392b",
                                          cursor: "pointer",
                                          fontSize: 14,
                                        }}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: theme.textMuted,
                                        fontStyle: "italic",
                                        padding: "6px 0",
                                      }}
                                    >
                                      Not assigned
                                    </div>
                                  )}
                                </div>

                                {/* Volunteers */}
                                <div style={{ marginBottom: 10 }}>
                                  <div
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: theme.textMuted,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.06em",
                                      marginBottom: 4,
                                    }}
                                  >
                                    Volunteers ({volProfiles.length})
                                  </div>
                                  {volProfiles.length === 0 ? (
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: theme.textMuted,
                                        fontStyle: "italic",
                                      }}
                                    >
                                      None assigned
                                    </div>
                                  ) : (
                                    volProfiles.map((vp) => (
                                      <div
                                        key={vp.uid}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          padding: "4px 8px",
                                          borderRadius: 6,
                                          background: `${primaryColor}08`,
                                          marginBottom: 3,
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: 12,
                                            color: theme.text,
                                          }}
                                        >
                                          {vp.name}
                                        </span>
                                        <button
                                          onClick={() =>
                                            assignToZone(
                                              zone.id,
                                              vp.uid,
                                              "volunteer",
                                            )
                                          }
                                          style={{
                                            background: "none",
                                            border: "none",
                                            color: "#c0392b",
                                            cursor: "pointer",
                                            fontSize: 14,
                                          }}
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>

                                {/* Shift coverage for this zone */}
                                {(() => {
                                  const zoneShifts = shifts.filter(
                                    (s) => s.zone === zone.id,
                                  );
                                  if (!zoneShifts.length)
                                    return (
                                      <div
                                        style={{
                                          paddingTop: 10,
                                          borderTop: `1px solid ${theme.border}`,
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: theme.textMuted,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.06em",
                                            marginBottom: 4,
                                          }}
                                        >
                                          Shifts
                                        </div>
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color: theme.textMuted,
                                            fontStyle: "italic",
                                          }}
                                        >
                                          No shifts assigned to this zone yet.
                                        </div>
                                      </div>
                                    );
                                  return (
                                    <div
                                      style={{
                                        paddingTop: 10,
                                        borderTop: `1px solid ${theme.border}`,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: 10,
                                          fontWeight: 700,
                                          color: theme.textMuted,
                                          textTransform: "uppercase",
                                          letterSpacing: "0.06em",
                                          marginBottom: 6,
                                        }}
                                      >
                                        Shifts ({zoneShifts.length})
                                      </div>
                                      {zoneShifts.map((shift) => {
                                        const filled = (shift.assigned || [])
                                          .length;
                                        const cap = shift.capacity || 0;
                                        const pct =
                                          cap > 0
                                            ? Math.min(
                                                100,
                                                Math.round(
                                                  (filled / cap) * 100,
                                                ),
                                              )
                                            : 0;
                                        const sc =
                                          filled >= cap && cap > 0
                                            ? "#27ae60"
                                            : filled > 0
                                              ? "#f39c12"
                                              : "#e74c3c";
                                        const warn =
                                          cap > 0 && filled < cap * 0.5;
                                        return (
                                          <div
                                            key={shift.id}
                                            style={{ marginBottom: 8 }}
                                          >
                                            <div
                                              style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                marginBottom: 3,
                                              }}
                                            >
                                              <div>
                                                <span
                                                  style={{
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    color: theme.text,
                                                  }}
                                                >
                                                  {shift.name}
                                                </span>
                                                <span
                                                  style={{
                                                    fontSize: 11,
                                                    color: theme.textMuted,
                                                    marginLeft: 6,
                                                  }}
                                                >
                                                  {shift.start_time} –{" "}
                                                  {shift.end_time}
                                                </span>
                                              </div>
                                              <div
                                                style={{
                                                  display: "flex",
                                                  alignItems: "center",
                                                  gap: 5,
                                                }}
                                              >
                                                {warn && (
                                                  <span
                                                    style={{ fontSize: 14 }}
                                                    title="Understaffed"
                                                  >
                                                    ⚠️
                                                  </span>
                                                )}
                                                <span
                                                  style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    color: sc,
                                                  }}
                                                >
                                                  {cap > 0
                                                    ? `${filled}/${cap}`
                                                    : `${filled} claimed`}
                                                </span>
                                              </div>
                                            </div>
                                            {cap > 0 && (
                                              <div
                                                style={{
                                                  height: 4,
                                                  background: theme.border,
                                                  borderRadius: 999,
                                                  overflow: "hidden",
                                                }}
                                              >
                                                <div
                                                  style={{
                                                    height: "100%",
                                                    width: `${pct}%`,
                                                    background: sc,
                                                    borderRadius: 999,
                                                  }}
                                                />
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

          {/* ── INTELLIGENCE TAB ── */}
          {activeTab === "intelligence" && (
            <IntelligenceTab event={event} eventId={eventId} />
          )}
          {/* ── REPORTS TAB ── */}
          {activeTab === "reports" && (
            <div>
              {/* Report selector grid */}
              {!activeReport && (
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      color: theme.textMuted,
                      marginBottom: 20,
                      lineHeight: 1.6,
                    }}
                  >
                    Select a report to generate. All reports are scoped to this
                    event. Use Export PDF to save for client deliverables or
                    your records.
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {REPORTS.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => loadReport(r.key)}
                        style={{
                          padding: "16px 18px",
                          borderRadius: 10,
                          border: `1.5px solid ${theme.border}`,
                          background: "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "'DM Sans', sans-serif",
                          transition: "all 0.15s",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = primaryColor;
                          e.currentTarget.style.boxShadow =
                            "0 2px 12px rgba(28,74,54,0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = theme.border;
                          e.currentTarget.style.boxShadow =
                            "0 1px 4px rgba(0,0,0,0.04)";
                        }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 6 }}>
                          {r.icon}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: theme.text,
                          }}
                        >
                          {r.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Report view */}
              {activeReport && (
                <Card>
                  {/* Report header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <button
                        onClick={() => {
                          setActiveReport(null);
                          setReportData([]);
                        }}
                        style={{
                          background: "none",
                          border: `1.5px solid ${theme.border}`,
                          borderRadius: 8,
                          padding: "5px 10px",
                          cursor: "pointer",
                          fontSize: 12,
                          color: theme.textMuted,
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        ← Back
                      </button>
                      <div>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: theme.text,
                          }}
                        >
                          {REPORTS.find((r) => r.key === activeReport)?.icon}{" "}
                          {REPORTS.find((r) => r.key === activeReport)?.label}
                        </div>
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          {event.event_nickname || event.name} · {event.client}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={exportPDF}
                      disabled={!reportData.length || exportingPDF}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "none",
                        background: reportData.length
                          ? primaryColor
                          : theme.border,
                        color: reportData.length ? "#fff" : theme.textMuted,
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: reportData.length ? "pointer" : "not-allowed",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {exportingPDF ? "Exporting…" : "⬇ Export PDF"}
                    </button>
                  </div>

                  {/* Loading */}
                  {reportLoading && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "40px 0",
                      }}
                    >
                      <Spinner size={24} />
                    </div>
                  )}

                  {/* Empty */}
                  {!reportLoading && reportData.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px 0",
                        color: theme.textMuted,
                        fontSize: 13,
                      }}
                    >
                      No data found for this report.
                    </div>
                  )}

                  {/* Data table */}
                  {!reportLoading && reportData.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: theme.textMuted,
                          marginBottom: 10,
                        }}
                      >
                        {reportData.length} record
                        {reportData.length !== 1 ? "s" : ""}
                      </div>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 12,
                        }}
                      >
                        <thead>
                          <tr style={{ background: primaryColor }}>
                            {Object.keys(reportData[0]).map((h) => (
                              <th
                                key={h}
                                style={{
                                  padding: "8px 12px",
                                  textAlign: "left",
                                  color: "#fff",
                                  fontWeight: 700,
                                  fontSize: 11,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.map((row, i) => (
                            <tr
                              key={i}
                              style={{
                                background: i % 2 === 0 ? "#fff" : "#f7f7f5",
                                borderBottom: `1px solid ${theme.border}`,
                              }}
                            >
                              {Object.values(row).map((val, j) => (
                                <td
                                  key={j}
                                  style={{
                                    padding: "8px 12px",
                                    color: theme.text,
                                    verticalAlign: "top",
                                  }}
                                >
                                  {String(val ?? "—")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div>
          {/* Event info card */}
          <Card style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: theme.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 12,
              }}
            >
              Event Details
            </div>
            {[
              ["Client", event.client],
              ["Date", event.event_date],
              ["Venue", event.venue],
              ["Location", event.location],
              ["Pillar", event.pillar],
              ["Status", event.status],
            ].map(([label, val]) =>
              val ? (
                <div
                  key={label}
                  style={{
                    padding: "7px 0",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: theme.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{ fontSize: 13, color: theme.text, fontWeight: 500 }}
                  >
                    {val}
                  </div>
                </div>
              ) : null,
            )}
          </Card>

          {/* Coverage Summary */}
          {shifts.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 12,
                }}
              >
                Floor Coverage
              </div>
              {(() => {
                // Group shifts by zone
                const zones = {};
                shifts.forEach((s) => {
                  const zone = s.zone || "General";
                  if (!zones[zone])
                    zones[zone] = { filled: 0, capacity: 0, shifts: 0 };
                  zones[zone].filled += (s.assigned || []).length;
                  zones[zone].capacity += s.capacity || 0;
                  zones[zone].shifts += 1;
                });
                return Object.entries(zones).map(([zone, data]) => {
                  const pct =
                    data.capacity > 0
                      ? Math.min(
                          100,
                          Math.round((data.filled / data.capacity) * 100),
                        )
                      : 0;
                  const color =
                    pct >= 80 ? "#27ae60" : pct >= 40 ? "#f39c12" : "#e74c3c";
                  const label =
                    pct >= 80
                      ? "Covered"
                      : pct >= 40
                        ? "Partial"
                        : "Needs Staff";
                  return (
                    <div key={zone} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 4,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: theme.text,
                          }}
                        >
                          {zone}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{ fontSize: 11, color: theme.textMuted }}
                          >
                            {data.filled}/{data.capacity}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color,
                              background: color + "22",
                              padding: "2px 6px",
                              borderRadius: 999,
                            }}
                          >
                            {label}
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          height: 5,
                          background: theme.border,
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: color,
                            borderRadius: 999,
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </Card>
          )}

          {/* Theme swatch */}
          <Card style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: theme.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              Event Theme
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[evtTheme.primary, evtTheme.secondary, evtTheme.accent]
                .filter(Boolean)
                .map((c) => (
                  <div
                    key={c}
                    style={{
                      flex: 1,
                      height: 28,
                      borderRadius: 6,
                      background: c,
                    }}
                    title={c}
                  />
                ))}
            </div>
          </Card>

          {/* Docs */}
          <Card style={{ marginBottom: 16 }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      Docs & Files
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {event.drive_folder_url && (
        <a href={event.drive_folder_url} target="_blank" rel="noreferrer"
          style={{ fontSize: 11, fontWeight: 700, color: primaryColor, textDecoration: 'none' }}>
          📁 Open Folder ↗
        </a>
      )}
      <button
        onClick={() => navigate(`/documents?event_id=${eventId}`)}
        style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
          background: primaryColor, color: '#fff', border: 'none', cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}>
        + Generate Docs
      </button>
    </div>
  </div>
 
   {/* /* ── Generated docs from mm_documents ── * /  */}
  {mmDocsLoading && (
    <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>Loading generated docs…</div>
  )}
  {!mmDocsLoading && mmDocs.length > 0 && (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        Generated Documents ({mmDocs.length})
      </div>
      {mmDocs.map(d => {
        const statusCfg = STATUS_COLORS[d.status] || STATUS_COLORS.draft;
        const statusLabel = {
          draft: 'Draft', pending_review: 'Pending Review',
          approved: '✓ Approved', sent: 'Sent', signed: '✓ Signed',
        }[d.status] || 'Draft';
        return (
          <div key={d.id} style={{ padding: '8px 0', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13 }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={d.url} target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: primaryColor, fontWeight: 600, textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {DOC_TYPE_LABELS[d.docType] || d.docType} ↗
              </a>
              <div style={{ fontSize: 10, color: theme.textMuted }}>
                by {d.generatedBy}
                {d.approvedBy ? ` · Approved by ${d.approvedBy}` : ''}
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
              background: statusCfg.bg, color: statusCfg.color, whiteSpace: 'nowrap',
            }}>
              {statusLabel}
            </span>
          </div>
        );
      })}
    </div>
  )}
 
  {/* /* ── Drive docs ── * /  */}
  {driveLoading && (
    <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>Loading Drive docs…</div>
  )}
  {!driveLoading && driveDocs.length > 0 && (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        From Drive Folder ({driveDocs.length})
      </div>
      {driveDocs.map(f => (
        <div key={f.id} style={{ padding: '6px 0', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>
            {f.mimeType?.includes('document') ? '📄' : f.mimeType?.includes('spreadsheet') ? '📊' : f.mimeType?.includes('pdf') ? '📋' : '📎'}
          </span>
          <a href={f.webViewLink} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: primaryColor, fontWeight: 600, textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {f.name}
          </a>
        </div>
      ))}
    </div>
  )}
 
   {/* /* ── Manual links ── * /  */}
  {(event.docs || []).length > 0 && (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        Manual Links
      </div>
      {(event.docs || []).map((d, i) => (
        <div key={i} style={{ padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
          {d.url
            ? <a href={d.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: primaryColor, fontWeight: 600, textDecoration: 'none' }}>{d.label}</a>
            : <div style={{ fontSize: 12, color: theme.text }}>{d.label}</div>
          }
        </div>
      ))}
    </div>
  )}
 
  {/* /* ── Add manual doc ── * /  */}
  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
    <input value={newDoc.label} onChange={e => setNewDoc(d => ({ ...d, label: e.target.value }))}
      placeholder="Add a link label" style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: 'none', color: theme.text }} />
    <input value={newDoc.url} onChange={e => setNewDoc(d => ({ ...d, url: e.target.value }))}
      placeholder="URL (optional)" style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: 'none', color: theme.text }} />
    <Button size="sm" variant="outline" onClick={addEventDoc} disabled={!newDoc.label.trim() || saving}>Add Link</Button>
  </div>
</Card>

          {/* Deliverables */}
          <Card style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: theme.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Client Deliverables
                </div>
                <div
                  style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}
                >
                  Final completed docs for the client. Link to the Deliverables
                  subfolder in their Drive client folder.
                </div>
              </div>
              {/* Status badge */}
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background:
                    deliverables.status === "notified"
                      ? "#e6f4ec"
                      : deliverables.status === "ready"
                        ? "#fff8e6"
                        : theme.background,
                  color:
                    deliverables.status === "notified"
                      ? "#2d7a46"
                      : deliverables.status === "ready"
                        ? "#8a6800"
                        : theme.textMuted,
                  border: `1px solid ${deliverables.status === "notified" ? "#b6dfc4" : deliverables.status === "ready" ? "#f0d080" : theme.border}`,
                  whiteSpace: "nowrap",
                }}
              >
                {deliverables.status === "notified"
                  ? "✓ Client Notified"
                  : deliverables.status === "ready"
                    ? "Ready to Send"
                    : "Pending"}
              </div>
            </div>

            {/* Folder link */}
            {deliverables.folder_url && !editingDeliv ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <a
                  href={deliverables.folder_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: theme.primary,
                    textDecoration: "none",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  📁 Deliverables Folder ↗
                </a>
                <button
                  onClick={() => {
                    setEditingDeliv(true);
                    setDelivFolderDraft(deliverables.folder_url);
                  }}
                  style={{
                    fontSize: 11,
                    color: theme.textMuted,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Edit
                </button>
              </div>
            ) : editingDeliv ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                <input
                  value={delivFolderDraft}
                  onChange={(e) => setDelivFolderDraft(e.target.value)}
                  placeholder="Paste Drive Deliverables folder URL…"
                  style={{
                    padding: "7px 10px",
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    fontSize: 12,
                    fontFamily: "'DM Sans', sans-serif",
                    outline: "none",
                    color: theme.text,
                  }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <Button
                    size="sm"
                    onClick={saveDeliverables}
                    disabled={!delivFolderDraft.trim() || savingDeliv}
                  >
                    {savingDeliv ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingDeliv(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={() => setEditingDeliv(true)}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: theme.primary,
                    background: "none",
                    border: `1px dashed ${theme.border}`,
                    borderRadius: 6,
                    padding: "8px 12px",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  + Link Deliverables Folder
                </button>
              </div>
            )}

            {/* Notify button */}
            <div
              style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}
            >
              {deliverables.status === "notified" ? (
                <div
                  style={{ fontSize: 11, color: "#2d7a46", fontWeight: 600 }}
                >
                  ✓ Client notified{" "}
                  {deliverables.notified_at
                    ? new Date(deliverables.notified_at).toLocaleDateString()
                    : ""}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Button
                    size="sm"
                    onClick={notifyClientDeliverables}
                    disabled={
                      !deliverables.folder_url ||
                      deliverables.status !== "ready"
                    }
                    style={{
                      opacity:
                        !deliverables.folder_url ||
                        deliverables.status !== "ready"
                          ? 0.4
                          : 1,
                    }}
                  >
                    Notify Client
                  </Button>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>
                    {!deliverables.folder_url
                      ? "Add folder link first"
                      : deliverables.status === "pending"
                        ? "Save folder link to enable"
                        : "Ready — notify when all docs are in the folder"}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Debrief notes */}
          <Card>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: theme.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              Debrief Notes
            </div>
            <textarea
              value={debrief}
              onChange={(e) => setDebrief(e.target.value)}
              placeholder="Post-event notes, lessons learned…"
              rows={5}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: 8,
                border: `1.5px solid ${theme.border}`,
                fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                outline: "none",
                resize: "vertical",
                color: theme.text,
                boxSizing: "border-box",
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={saveDebrief}
              disabled={saving}
              style={{ marginTop: 8 }}
            >
              Save Notes
            </Button>
          </Card>

          {/* Data Requests — founders only */}
          {isFounder && (
            <Card style={{ marginTop: 16, border: "1.5px solid #ffcccc" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#8B0000",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Data Requests
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {isRetentionExpired(event.event_date) && (
                    <button
                      onClick={runScheduledAnonymization}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "#8B0000",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      ⚡ Anonymize All
                    </button>
                  )}
                  <span style={{ fontSize: 10, color: theme.textMuted }}>
                    Retention: {DATA_RETENTION_DAYS}d
                    {isRetentionExpired(event.event_date) ? " — ⚠ Expired" : ""}
                  </span>
                </div>
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: theme.textMuted,
                  marginBottom: 12,
                  lineHeight: 1.6,
                }}
              >
                Fulfilling a request anonymizes PII across roster, check-ins,
                check-outs, incidents, and volunteer profiles. Aggregate records
                are preserved per retention policy.
              </div>

              {deletionLoading && (
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  Loading…
                </div>
              )}

              {!deletionLoading && deletionRequests.length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: theme.textMuted,
                    padding: "10px 0",
                  }}
                >
                  No pending requests.
                </div>
              )}

              {deletionRequests.map((req) => (
                <div
                  key={req.id}
                  style={{
                    padding: "12px 0",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 4,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: theme.text,
                        }}
                      >
                        {req.name || req.uid}
                      </div>
                      <div style={{ fontSize: 11, color: theme.textMuted }}>
                        {req.requestType || "Full anonymization"} ·{" "}
                        {req.submittedAt
                          ? new Date(req.submittedAt).toLocaleDateString()
                          : "—"}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background:
                          req.status === "fulfilled"
                            ? "#e8f5e9"
                            : req.status === "denied"
                              ? "#fff5f5"
                              : "#fff8e7",
                        color:
                          req.status === "fulfilled"
                            ? "#2d7a46"
                            : req.status === "denied"
                              ? "#8B0000"
                              : "#8a6800",
                      }}
                    >
                      {req.status || "pending"}
                    </span>
                  </div>

                  {req.reason && (
                    <div
                      style={{
                        fontSize: 11,
                        color: theme.textMuted,
                        marginBottom: 8,
                        fontStyle: "italic",
                      }}
                    >
                      "{req.reason}"
                    </div>
                  )}

                  {/* Fulfilled / denied notes */}
                  {req.status === "fulfilled" && (
                    <div style={{ fontSize: 11, color: "#2d7a46" }}>
                      Fulfilled by {req.fulfilledBy} ·{" "}
                      {req.fulfilledAt
                        ? new Date(req.fulfilledAt).toLocaleDateString()
                        : ""}
                    </div>
                  )}
                  {req.status === "denied" && (
                    <div style={{ fontSize: 11, color: "#8B0000" }}>
                      Denied by {req.deniedBy} — {req.denyReason}
                    </div>
                  )}

                  {/* Deny input */}
                  {denyingId === req.id && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                      <input
                        value={denyReason}
                        onChange={(e) => setDenyReason(e.target.value)}
                        placeholder="Reason for denial…"
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: `1px solid ${theme.border}`,
                          fontSize: 12,
                          fontFamily: "'DM Sans', sans-serif",
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={() => denyRequest(req.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: "#8B0000",
                          color: "#fff",
                          border: "none",
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => {
                          setDenyingId(null);
                          setDenyReason("");
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: theme.background,
                          color: theme.textMuted,
                          border: `1px solid ${theme.border}`,
                          fontSize: 11,
                          cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Action buttons — only for pending */}
                  {(!req.status || req.status === "pending") &&
                    denyingId !== req.id && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => fulfillRequest(req)}
                          disabled={fulfillingSaving === req.id}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 6,
                            background: theme.primary,
                            color: "#fff",
                            border: "none",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                            opacity: fulfillingSaving === req.id ? 0.6 : 1,
                          }}
                        >
                          {fulfillingSaving === req.id
                            ? "Processing…"
                            : "✓ Fulfill"}
                        </button>
                        <button
                          onClick={() => setDenyingId(req.id)}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 6,
                            background: "#fff",
                            color: "#8B0000",
                            border: "1px solid #ffcccc",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          ✗ Deny
                        </button>
                      </div>
                    )}
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
