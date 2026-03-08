import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, deleteDoc, addDoc, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Button, Badge, Spinner, EmptyState } from "../components/UI";

const CHECKLISTS = {
  P1: [
    {
      section: "Pre-Engagement",
      items: [
        { key: "agreement_sent",   label: "Agreement sent" },
        { key: "agreement_signed", label: "Agreement signed" },
        { key: "intake_complete",  label: "Intake form completed" },
      ],
    },
    {
      section: "Recruiting & Talent",
      items: [
        { key: "recruiting_link_sent", label: "Recruiting app link sent out" },
        { key: "onboarding_complete",  label: "Onboarding completed" },
      ],
    },
    {
      section: "Event Prep",
      items: [
        { key: "orientations_scheduled", label: "Orientations scheduled" },
        { key: "orientations_complete",  label: "Orientations completed" },
        { key: "teamlead_training",      label: "Team lead training" },
        { key: "axis_training",          label: "Axis app training" },
        { key: "social_media_posted",    label: "Social media posting" },
      ],
    },
    {
      section: "Staffing",
      items: [
        { key: "staff_registration",  label: "Registration zone staffed" },
        { key: "staff_general_floor", label: "General floor staffed" },
        { key: "staff_vip",           label: "VIP / speaker area staffed" },
        { key: "staff_team_leads",    label: "Team leads assigned" },
        { key: "staff_vendors",       label: "Vendor contacts confirmed (M&M-owned)" },
      ],
    },
    {
      section: "Post-Event",
      items: [
        { key: "docs_shared",  label: "Event docs reviewed & shared with client" },
        { key: "survey_sent",  label: "Post-event survey sent" },
        { key: "debrief_done", label: "Debrief notes recorded" },
      ],
    },
  ],

  P2: [
    {
      section: "Pre-Engagement",
      items: [
        { key: "agreement_sent",   label: "Agreement sent" },
        { key: "agreement_signed", label: "Agreement signed" },
        { key: "intake_complete",  label: "Intake form completed" },
      ],
    },
    {
      section: "Curriculum & Facilitation",
      items: [
        { key: "curriculum_confirmed",  label: "Curriculum confirmed with client" },
        { key: "facilitator_assigned",  label: "Facilitator assigned" },
        { key: "materials_ready",       label: "Training materials ready" },
        { key: "session_scheduled",     label: "Session(s) scheduled" },
      ],
    },
    {
      section: "Delivery",
      items: [
        { key: "pre_session_brief",  label: "Pre-session brief completed" },
        { key: "session_delivered",  label: "Session delivered" },
      ],
    },
    {
      section: "Post-Session",
      items: [
        { key: "docs_shared",    label: "Session docs reviewed & shared with client" },
        { key: "survey_sent",    label: "Participant survey sent" },
        { key: "debrief_done",   label: "Internal debrief recorded" },
        { key: "report_sent",    label: "Summary report sent to client" },
      ],
    },
  ],

  P3: [
    {
      section: "Pre-Engagement",
      items: [
        { key: "p3_framework_complete",  label: "Pillar 3 framework completed" },
        { key: "agreement_sent",         label: "Agreement sent" },
        { key: "agreement_signed",       label: "Agreement signed" },
        { key: "intake_complete",        label: "Intake form completed" },
        { key: "coexecution_alignment",  label: "Co-execution alignment meeting held" },
      ],
    },
    {
      section: "Recruiting & Talent",
      items: [
        { key: "recruiting_link_sent", label: "Recruiting app link sent out" },
        { key: "onboarding_complete",  label: "Onboarding completed" },
      ],
    },
    {
      section: "Event Prep",
      items: [
        { key: "orientations_scheduled", label: "Orientations scheduled" },
        { key: "orientations_complete",  label: "Orientations completed" },
        { key: "teamlead_training",      label: "Team lead training" },
        { key: "axis_training",          label: "Axis app training" },
        { key: "social_media_posted",    label: "Social media posting" },
        { key: "shared_docs_confirmed",  label: "Shared docs confirmed with client" },
      ],
    },
    {
      section: "Staffing",
      items: [
        { key: "staff_registration",  label: "Registration zone staffed" },
        { key: "staff_general_floor", label: "General floor staffed" },
        { key: "staff_vip",           label: "VIP / speaker area staffed" },
        { key: "staff_team_leads",    label: "Team leads assigned" },
        { key: "staff_vendors",       label: "Vendor contacts confirmed (M&M-owned)" },
      ],
    },
    {
      section: "Post-Event",
      items: [
        { key: "docs_shared",  label: "Event docs reviewed & shared with client" },
        { key: "survey_sent",  label: "Post-event survey sent" },
        { key: "debrief_done", label: "Debrief notes recorded" },
      ],
    },
  ],

  P4: [
    {
      section: "Pre-Engagement",
      items: [
        { key: "agreement_sent",   label: "Agreement sent" },
        { key: "agreement_signed", label: "Agreement signed" },
        { key: "intake_complete",  label: "Intake form completed" },
      ],
    },
    {
      section: "Discovery",
      items: [
        { key: "diagnostic_scheduled", label: "Diagnostic session scheduled" },
        { key: "diagnostic_complete",  label: "Diagnostic session completed" },
        { key: "gap_library_built",    label: "Infrastructure gap library built" },
      ],
    },
    {
      section: "Delivery",
      items: [
        { key: "docs_shared",      label: "Deliverable docs reviewed & shared with client" },
        { key: "report_drafted",   label: "Diagnostic report drafted" },
        { key: "report_delivered", label: "Report delivered to client" },
        { key: "client_review",    label: "Client review meeting held" },
      ],
    },
    {
      section: "Post-Engagement",
      items: [
        { key: "followup_scheduled", label: "Follow-up check-in scheduled" },
        { key: "debrief_done",       label: "Internal debrief recorded" },
      ],
    },
  ],
};

// Normalize pillar string → key (handles "P1", "p1", "Pillar 1", etc.)
const getPillarKey = (pillar) => {
  if (!pillar) return "P1";
  const s = String(pillar).toUpperCase().replace(/[^P1-4]/g, "");
  if (s === "P1" || s === "1") return "P1";
  if (s === "P2" || s === "2") return "P2";
  if (s === "P3" || s === "3") return "P3";
  if (s === "P4" || s === "4") return "P4";
  return "P1";
};

// ─── Leadership Scoring Engine ────────────────────────────────────────────────
const SCORE_CONFIG = {
  VOLUNTEERED_2_PLUS_YEARS: 30,
  VOLUNTEERED_BEFORE:       20,
  NOT_FIRST_YEAR:           10,
  WANTS_LEADERSHIP:         20,
  OK_BEING_POC:             10,
  WANTS_MENTORSHIP:         10,
  HAS_CRITICAL_COMFORT:     10,
  TECH_COMFORTABLE:          5,
  ALL_ORIENTATIONS:         20,
  ALL_TRAININGS:            10,
};

// Team Lead: ≥60 score + volunteeredBefore + wantsLeadership + okBeingPOC
// Ops Lead:  ≥90 score + all TL requirements + all three critical comforts + wantsMentorship
const TL_TIERS = {
  CONFIRMED: { min: 90,  label: "Confirmed TL",     color: "#27ae60" },
  STRONG:    { min: 60,  label: "Strong Candidate",  color: "#3498db" },
  POTENTIAL: { min: 40,  label: "Potential Future",  color: "#f39c12" },
  NOT_READY: { min: 0,   label: "Not Ready",         color: "#95a5a6" },
};

const calculateLeadershipScore = (profile, attendance = {}) => {
  let score = 0;
  const breakdown = [];

  if (profile.volunteeredYears >= 2) {
    score += SCORE_CONFIG.VOLUNTEERED_2_PLUS_YEARS;
    breakdown.push({ label: "Volunteered 2+ years", points: 30 });
  } else if (profile.volunteeredBefore) {
    score += SCORE_CONFIG.VOLUNTEERED_BEFORE;
    breakdown.push({ label: "Volunteered before", points: 20 });
  } else if (!profile.firstYear) {
    score += SCORE_CONFIG.NOT_FIRST_YEAR;
    breakdown.push({ label: "Not first year", points: 10 });
  }

  if (profile.wantsLeadership) { score += SCORE_CONFIG.WANTS_LEADERSHIP; breakdown.push({ label: "Wants leadership", points: 20 }); }
  if (profile.okBeingPOC)      { score += SCORE_CONFIG.OK_BEING_POC;      breakdown.push({ label: "OK being POC",      points: 10 }); }
  if (profile.wantsMentorship) { score += SCORE_CONFIG.WANTS_MENTORSHIP;  breakdown.push({ label: "Wants to mentor",   points: 10 }); }

  const cz = profile.comfortZones || [];
  const hasCritical = cz.includes("Talking to attendees") && cz.includes("Problem solving / putting out fires");
  const isTech      = cz.includes("Tech (devices, check-in, scanners)");
  if (hasCritical) { score += SCORE_CONFIG.HAS_CRITICAL_COMFORT; breakdown.push({ label: "Critical comfort zones", points: 10 }); }
  if (isTech)      { score += SCORE_CONFIG.TECH_COMFORTABLE;      breakdown.push({ label: "Tech comfortable",       points:  5 }); }

  if (attendance.orientationsAttended === attendance.totalOrientations && attendance.totalOrientations > 0) {
    score += SCORE_CONFIG.ALL_ORIENTATIONS; breakdown.push({ label: "All orientations", points: 20 });
  }
  if (attendance.trainingsAttended === attendance.totalTrainings && attendance.totalTrainings > 0) {
    score += SCORE_CONFIG.ALL_TRAININGS; breakdown.push({ label: "All trainings", points: 10 });
  }

  // Ops Lead eligibility — requires TL-confirmed level + full critical skill stack + mentorship
  const cz3 = cz.includes("Talking to attendees") && cz.includes("Problem solving / putting out fires") && isTech;
  const opsLeadEligible = score >= 90 && profile.wantsLeadership && profile.okBeingPOC && profile.wantsMentorship && cz3;

  const tlTier = Object.values(TL_TIERS).find(t => score >= t.min) || TL_TIERS.NOT_READY;

  return { score, breakdown, tlTier, opsLeadEligible };
};

function StaffList({ staffProfiles, staffFilter, staffExpanded, setStaffExpanded, promotingSaving, promoteRole, theme }) {
  const filtered = staffProfiles.filter(s => {
    if (staffFilter === "tl_eligible")  return s.score >= 60;
    if (staffFilter === "ops_eligible") return s.opsLeadEligible;
    if (staffFilter === "assigned")     return s.profile.isTeamLead || s.profile.isOpsLead;
    return true;
  });

  if (filtered.length === 0) return (
    <div style={{ fontSize: 13, color: theme.textMuted, padding: "16px 0", textAlign: "center" }}>No matches for this filter.</div>
  );

  return filtered.map(s => {
    const isExpanded  = staffExpanded === s.id;
    const tc          = s.tlTier.color;
    const currentRole = s.profile.floor_role || (s.profile.isOpsLead ? "ops_lead" : s.profile.isTeamLead ? "team_lead" : "volunteer");

    return (
      <div key={s.id} style={{ borderLeft: `4px solid ${tc}`, borderRadius: 10, background: theme.background, marginBottom: 10, overflow: "hidden" }}>
        <div onClick={() => setStaffExpanded(isExpanded ? null : s.id)}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{s.profile.name || "Unnamed"}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: tc + "22", color: tc }}>{s.tlTier.label}</span>
              {s.opsLeadEligible && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(15,52,96,0.1)", color: "#0F3460" }}>Ops Lead Eligible</span>}
              {s.profile.isTeamLead && !s.profile.isOpsLead && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(88,176,108,0.15)", color: "#2d7a46" }}>⭐ Team Lead</span>}
              {s.profile.isOpsLead && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(235,199,100,0.2)", color: "#8a6800" }}>★ Ops Lead</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: tc, lineHeight: 1 }}>{s.score}</div>
            <div style={{ fontSize: 10, color: theme.textMuted, fontWeight: 600 }}>pts</div>
          </div>
          <div style={{ fontSize: 14, color: theme.textMuted }}>{isExpanded ? "▲" : "▼"}</div>
        </div>

        {isExpanded && (
          <div style={{ padding: "0 14px 16px", borderTop: `1px solid ${theme.border}` }}>
            <div style={{ marginTop: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Score Breakdown</div>
              {s.breakdown.map((b, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${theme.border}` }}>
                  <span style={{ fontSize: 13, color: theme.textMuted }}>{b.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: tc }}>+{b.points}</span>
                </div>
              ))}
            </div>
            {s.profile.comfortZones?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Comfort Zones</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {s.profile.comfortZones.map((z, i) => (
                    <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: theme.border, color: theme.textMuted }}>{z}</span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Attendance</div>
              <div style={{ fontSize: 13, color: theme.text }}>
                Orientations: {s.attendance.orientationsAttended}/{s.attendance.totalOrientations} &nbsp;·&nbsp;
                Trainings: {s.attendance.trainingsAttended}/{s.attendance.totalTrainings}
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Assign Role</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { role: "volunteer", label: "Volunteer",    show: true },
                { role: "team_lead", label: "⭐ Team Lead", show: s.score >= 60 },
                { role: "ops_lead",  label: "★ Ops Lead",   show: s.opsLeadEligible },
              ].filter(r => r.show).map(({ role, label }) => (
                <button key={role}
                  disabled={promotingSaving || currentRole === role}
                  onClick={() => promoteRole(s.id, s.profile.uid, role)}
                  style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                    cursor: promotingSaving || currentRole === role ? "default" : "pointer",
                    background: currentRole === role ? theme.primary : "transparent",
                    color: currentRole === role ? "#fff" : theme.primary,
                    border: `1.5px solid ${theme.primary}`,
                    opacity: promotingSaving ? 0.6 : 1,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >{currentRole === role ? `✓ ${label}` : label}</button>
              ))}
            </div>
            {!s.opsLeadEligible && s.score >= 60 && (
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 8 }}>
                Ops Lead requires ≥90 pts + all three critical comfort zones + mentorship willingness.
              </div>
            )}
          </div>
        )}
      </div>
    );
  });
}

export default function EventCommand() {
  const { eventId } = useParams();
  const { activeUser } = useAuth();
  const navigate = useNavigate();

  const [event,   setEvent]   = useState(null);
  const [roster,  setRoster]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [checklist, setChecklist] = useState({});
  const [newDoc,    setNewDoc]    = useState({ label: "", url: "" });
  const [debrief,   setDebrief]   = useState("");

  // Staff roster (scored volunteer/contractor profiles)
  const [staffProfiles,  setStaffProfiles]  = useState([]);
  const [staffLoading,   setStaffLoading]   = useState(false);
  const [staffExpanded,  setStaffExpanded]  = useState(null);
  const [staffFilter,    setStaffFilter]    = useState("all"); // all | tl_eligible | ops_eligible | assigned
  const [promotingSaving, setPromotingSaving] = useState(false);

  // Client staff
  const [clientStaff,    setClientStaff]    = useState([]);
  const [newClientStaff, setNewClientStaff] = useState({ name: "", title: "", email: "", phone: "", needs_app_access: false });
  const [clientStaffSaving, setClientStaffSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("checklist"); // checklist | staff | client_staff

  // Drive docs
  const [driveDocs,     setDriveDocs]     = useState([]);
  const [driveLoading,  setDriveLoading]  = useState(false);

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
      }
      setRoster(rosterSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setClientStaff(clientStaffSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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

      const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,webViewLink)&pageSize=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      const files = (data.files || []).filter(f => f.mimeType !== "application/vnd.google-apps.folder");
      setDriveDocs(files);
    } catch (e) {
      console.warn("Could not load Drive docs:", e);
    }
    setDriveLoading(false);
  };

  // Load volunteer profiles + attendance for scoring when staff tab opens
  const loadStaffProfiles = async () => {
    if (staffProfiles.length > 0) return; // already loaded
    setStaffLoading(true);
    try {
      const [profilesSnap, attendanceSnap] = await Promise.all([
        getDocs(query(collection(db, "volunteerProfiles"), where("event", "==", eventId))),
        getDocs(collection(db, "teamLeadAttendance")),
      ]);

      const attendanceMap = {};
      attendanceSnap.docs.forEach(d => { attendanceMap[d.id] = d.data(); });

      const profiles = profilesSnap.docs.map(d => {
        const profile = d.data();
        const attKey  = `${eventId}_${profile.uid}`;
        const attendance = attendanceMap[attKey] || { orientationsAttended: 0, totalOrientations: 4, trainingsAttended: 0, totalTrainings: 2 };
        const { score, breakdown, tlTier, opsLeadEligible } = calculateLeadershipScore(profile, attendance);
        return { id: d.id, profile, attendance, score, breakdown, tlTier, opsLeadEligible };
      });

      profiles.sort((a, b) => b.score - a.score);
      setStaffProfiles(profiles);
    } catch (e) {
      console.error("Error loading staff profiles:", e);
    }
    setStaffLoading(false);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "staff") loadStaffProfiles();
  };

  const promoteRole = async (profileId, uid, role) => {
    setPromotingSaving(true);
    try {
      const profileRef = doc(db, "volunteerProfiles", profileId);
      await setDoc(profileRef, {
        isTeamLead:  role === "team_lead" || role === "ops_lead",
        isOpsLead:   role === "ops_lead",
        floor_role:  role,
        promotedBy:  activeUser,
        promotedAt:  new Date().toISOString(),
        promotedForEvent: eventId,
      }, { merge: true });
      // update local state
      setStaffProfiles(prev => prev.map(s =>
        s.id === profileId ? { ...s, profile: { ...s.profile, isTeamLead: role !== "volunteer", isOpsLead: role === "ops_lead", floor_role: role } } : s
      ));
    } catch (e) { console.error(e); }
    setPromotingSaving(false);
  };

  const addClientStaff = async () => {
    if (!newClientStaff.name.trim()) return;
    setClientStaffSaving(true);
    try {
      const ref = await addDoc(collection(db, "events", eventId, "client_staff"), {
        ...newClientStaff,
        added_by: activeUser,
        added_at: new Date().toISOString(),
      });
      setClientStaff(prev => [...prev, { id: ref.id, ...newClientStaff }]);
      setNewClientStaff({ name: "", title: "", email: "", phone: "", needs_app_access: false });
    } catch (e) { console.error(e); }
    setClientStaffSaving(false);
  };

  const removeClientStaff = async (id) => {
    await deleteDoc(doc(db, "events", eventId, "client_staff", id));
    setClientStaff(prev => prev.filter(s => s.id !== id));
  };

  const toggleAppAccess = async (id, current) => {
    await setDoc(doc(db, "events", eventId, "client_staff", id), { needs_app_access: !current }, { merge: true });
    setClientStaff(prev => prev.map(s => s.id === id ? { ...s, needs_app_access: !current } : s));
  };

  const toggleCheck = async (key) => {
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    setSaving(true);
    await updateDoc(doc(db, "events", eventId), {
      checklist: next,
      [`checklist_log.${key}`]: { value: !checklist[key], by: activeUser, at: new Date().toISOString() },
    });
    setSaving(false);
  };

  const addEventDoc = async () => {
    if (!newDoc.label.trim()) return;
    const docs = [...(event.docs || []), { ...newDoc, added_by: activeUser, added_at: new Date().toISOString() }];
    setSaving(true);
    await updateDoc(doc(db, "events", eventId), { docs });
    setEvent(e => ({ ...e, docs }));
    setNewDoc({ label: "", url: "" });
    setSaving(false);
  };

  const saveDebrief = async () => {
    setSaving(true);
    await updateDoc(doc(db, "events", eventId), { debrief_notes: debrief });
    setSaving(false);
  };

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh" }}><Spinner size={32} /></div>;
  if (!event)  return <div style={{ padding: 32 }}><EmptyState icon="◇" title="Event not found" /></div>;

  const pillarKey    = getPillarKey(event.pillar);
  const CHECKLIST    = CHECKLISTS[pillarKey];
  const totalItems   = CHECKLIST.reduce((a, s) => a + s.items.length, 0);
  const doneItems    = Object.values(checklist).filter(Boolean).length;
  const pct          = Math.round((doneItems / totalItems) * 100);

  const evtTheme = event.theme || {};
  const primaryColor = evtTheme.primary || theme.primary;
  const accentColor  = evtTheme.accent  || theme.accent;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: theme.background }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* Event header band */}
      <div style={{ background: primaryColor, padding: "24px 36px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {event.logo_url && <img src={event.logo_url} alt="logo" style={{ height: 40, borderRadius: 6, background: "#fff", padding: "2px 6px" }} />}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>
              Event Command
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display', serif", letterSpacing: "-0.02em" }}>
              {event.name}
            </h1>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
              {event.client} · {event.event_date || "Date TBD"} · {event.venue || event.location}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {event.access_code && (
            <div style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Access Code</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: accentColor, fontFamily: "monospace" }}>{event.access_code}</div>
            </div>
          )}
          <Badge color={accentColor} bg="rgba(255,255,255,0.12)">{event.pillar || "P3"}</Badge>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: "#fff", padding: "14px 36px", borderBottom: `1px solid ${theme.border}`, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1, height: 8, background: theme.border, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: primaryColor, borderRadius: 999, transition: "width 0.3s ease" }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.primary, whiteSpace: "nowrap" }}>
          {doneItems} / {totalItems} complete ({pct}%)
        </div>
        {saving && <div style={{ fontSize: 12, color: theme.textMuted }}>Saving…</div>}
      </div>

      <div style={{ padding: "28px 36px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>

        {/* Left column */}
        <div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
            {[
              { key: "checklist",    label: "Checklist" },
              { key: "staff",        label: `Staff Roster` },
              { key: "client_staff", label: "Client Staff" },
            ].map(t => (
              <button key={t.key} onClick={() => handleTabChange(t.key)} style={{
                padding: "7px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: activeTab === t.key ? primaryColor : "transparent",
                color: activeTab === t.key ? "#fff" : theme.textMuted,
                border: `1.5px solid ${activeTab === t.key ? primaryColor : theme.border}`,
                fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
              }}>
                {t.label}
                {t.key === "staff" && staffProfiles.length > 0 && <span style={{ marginLeft: 6, opacity: 0.7 }}>({staffProfiles.length})</span>}
                {t.key === "client_staff" && clientStaff.length > 0 && <span style={{ marginLeft: 6, opacity: 0.7 }}>({clientStaff.length})</span>}
              </button>
            ))}
          </div>

          {/* ── CHECKLIST TAB ── */}
          {activeTab === "checklist" && <>

            {/* Roster summary */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
                Event Roster <span style={{ fontWeight: 400 }}>({roster.length})</span>
              </div>
              {roster.length === 0 ? (
                <div style={{ fontSize: 13, color: theme.textMuted, padding: "4px 0" }}>No one assigned yet. Use the Talent Pool to assign staff.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                        {["Name","Role","Type","Est. Pay","Code Sent","Onboarded"].map(h => (
                          <th key={h} style={{ padding: "6px 12px 8px 0", textAlign: "left", fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map(r => {
                        const roleLabels = { volunteer: "Volunteer", team_lead: "Team Lead", ops_lead: "Ops Lead", ops_manager: "Ops Manager", engagement_lead: "Engagement Lead" };
                        return (
                          <tr key={r.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: "9px 12px 9px 0", fontWeight: 600, color: theme.text, whiteSpace: "nowrap" }}>{r.name}</td>
                            <td style={{ padding: "9px 12px 9px 0", color: theme.textMuted, whiteSpace: "nowrap" }}>{roleLabels[r.floor_role] || r.floor_role || "—"}</td>
                            <td style={{ padding: "9px 12px 9px 0" }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                                background: r.isContractor ? "rgba(201,160,48,0.12)" : "rgba(88,176,108,0.12)",
                                color: r.isContractor ? theme.accentDark : "#2d7a46",
                              }}>
                                {r.isContractor ? "Contractor" : "Volunteer"}
                              </span>
                            </td>
                            <td style={{ padding: "9px 12px 9px 0", color: theme.text }}>{r.estimated_pay ? `$${Number(r.estimated_pay).toFixed(2)}` : "—"}</td>
                            <td style={{ padding: "9px 12px 9px 0", fontSize: 14 }}>{r.event_code_sent ? <span style={{ color: theme.secondary }}>✓</span> : "—"}</td>
                            <td style={{ padding: "9px 12px 9px 0", fontSize: 14 }}>{r.onboarding_complete ? <span style={{ color: theme.secondary }}>✓</span> : "—"}</td>
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
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
                  {section}
                </div>
                {items.map(({ key, label }) => {
                  const done = !!checklist[key];
                  return (
                    <div
                      key={key}
                      onClick={() => toggleCheck(key)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                        borderBottom: `1px solid ${theme.border}`, cursor: "pointer",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = theme.background}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: `2px solid ${done ? primaryColor : theme.borderStrong}`,
                        background: done ? primaryColor : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s ease",
                      }}>
                        {done && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{
                        fontSize: 14, fontWeight: done ? 600 : 400,
                        color: done ? theme.text : theme.textMuted,
                      }}>{label}</span>
                      {done && checklist[`${key}_by`] && (
                        <span style={{ fontSize: 11, color: theme.textMuted, marginLeft: "auto" }}>by {checklist[`${key}_by`]}</span>
                      )}
                    </div>
                  );
                })}
              </Card>
            ))}
          </>}

          {/* ── STAFF ROSTER TAB ── */}
          {activeTab === "staff" && (
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
                Leadership Scoring — Volunteer Profiles
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 14, lineHeight: 1.6 }}>
                Scores are calculated from volunteer profiles. TL eligible ≥60 pts. Ops Lead eligible requires ≥90 pts + full skill stack. Promotions write back to the volunteer profile and flip the app dashboard.
              </div>

              {/* Filter tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                {[
                  { key: "all",          label: "All" },
                  { key: "tl_eligible",  label: "TL Eligible" },
                  { key: "ops_eligible", label: "Ops Lead Eligible" },
                  { key: "assigned",     label: "Assigned" },
                ].map(f => (
                  <button key={f.key} onClick={() => setStaffFilter(f.key)} style={{
                    padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: staffFilter === f.key ? theme.primary : "transparent",
                    color: staffFilter === f.key ? "#fff" : theme.textMuted,
                    border: `1.5px solid ${staffFilter === f.key ? theme.primary : theme.border}`,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>{f.label}</button>
                ))}
              </div>

              {staffLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner size={24} /></div>
              ) : staffProfiles.length === 0 ? (
                <EmptyState icon="◎" title="No volunteer profiles yet" subtitle="Profiles appear once volunteers complete their profile in the app." />
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
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                Client Staff
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
                Staff from the client's organization involved in this event. Toggle app access for anyone who will need to use Axis on the day-of.
              </div>

              {/* Existing client staff */}
              {clientStaff.length === 0 ? (
                <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 20 }}>No client staff added yet.</div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  {clientStaff.map(cs => (
                    <div key={cs.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${theme.border}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{cs.name}</div>
                        <div style={{ fontSize: 12, color: theme.textMuted }}>{cs.title}{cs.title && cs.email ? " · " : ""}{cs.email}{cs.phone ? " · " + cs.phone : ""}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          onClick={() => toggleAppAccess(cs.id, cs.needs_app_access)}
                          style={{
                            padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                            background: cs.needs_app_access ? "rgba(88,176,108,0.15)" : theme.background,
                            color: cs.needs_app_access ? "#2d7a46" : theme.textMuted,
                            border: `1.5px solid ${cs.needs_app_access ? "#2d7a46" : theme.border}`,
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >{cs.needs_app_access ? "✓ App Access" : "No App Access"}</button>
                        <button
                          onClick={() => removeClientStaff(cs.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: theme.textMuted, padding: "2px 4px" }}
                          title="Remove"
                        >×</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new client staff */}
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Add Client Staff</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                {[
                  { key: "name",  placeholder: "Full name *", required: true },
                  { key: "title", placeholder: "Title / Role" },
                  { key: "email", placeholder: "Email" },
                  { key: "phone", placeholder: "Phone" },
                ].map(({ key, placeholder }) => (
                  <input key={key}
                    value={newClientStaff[key]}
                    onChange={e => setNewClientStaff(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none", color: theme.text }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  id="app_access"
                  checked={newClientStaff.needs_app_access}
                  onChange={e => setNewClientStaff(p => ({ ...p, needs_app_access: e.target.checked }))}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <label htmlFor="app_access" style={{ fontSize: 13, color: theme.text, cursor: "pointer" }}>
                  Needs Axis app access for this event
                </label>
              </div>
              <Button size="sm" onClick={addClientStaff} disabled={!newClientStaff.name.trim() || clientStaffSaving}>
                {clientStaffSaving ? "Adding…" : "Add Staff Member"}
              </Button>
            </Card>
          )}

        </div>{/* end left column */}

        {/* Right column */}
        <div>
          {/* Event info card */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Event Details</div>
            {[
              ["Client",    event.client],
              ["Date",      event.event_date],
              ["Venue",     event.venue],
              ["Location",  event.location],
              ["Pillar",    event.pillar],
              ["Status",    event.status],
            ].map(([label, val]) => val ? (
              <div key={label} style={{ padding: "7px 0", borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                <div style={{ fontSize: 13, color: theme.text, fontWeight: 500 }}>{val}</div>
              </div>
            ) : null)}
          </Card>

          {/* Theme swatch */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Event Theme</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[evtTheme.primary, evtTheme.secondary, evtTheme.accent].filter(Boolean).map(c => (
                <div key={c} style={{ flex: 1, height: 28, borderRadius: 6, background: c }} title={c} />
              ))}
            </div>
          </Card>

          {/* Docs */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Docs & Files</div>
              {event.drive_folder_url && (
                <a href={event.drive_folder_url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, fontWeight: 700, color: primaryColor, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                  📁 Open Folder ↗
                </a>
              )}
            </div>

            {/* Drive docs — auto-loaded from event folder */}
            {driveLoading && (
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>Loading docs from Drive…</div>
            )}
            {!driveLoading && driveDocs.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  From Drive Folder ({driveDocs.length})
                </div>
                {driveDocs.map(f => (
                  <div key={f.id} style={{ padding: "6px 0", borderBottom: `1px solid ${theme.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13 }}>
                      {f.mimeType?.includes("document") ? "📄" :
                       f.mimeType?.includes("spreadsheet") ? "📊" :
                       f.mimeType?.includes("presentation") ? "📊" :
                       f.mimeType?.includes("pdf") ? "📋" : "📎"}
                    </span>
                    <a href={f.webViewLink} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: primaryColor, fontWeight: 600, textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name}
                    </a>
                  </div>
                ))}
              </div>
            )}
            {!driveLoading && driveDocs.length === 0 && event.drive_folder_url && (
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10 }}>
                No files in Drive folder yet.{" "}
                <button onClick={() => loadDriveDocs(event.drive_folder_url)}
                  style={{ background: "none", border: "none", color: primaryColor, cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}>
                  Refresh ↺
                </button>
              </div>
            )}

            {/* Manually added docs */}
            {(event.docs || []).length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Manual Links</div>
                {(event.docs || []).map((d, i) => (
                  <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${theme.border}` }}>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: primaryColor, fontWeight: 600, textDecoration: "none" }}>{d.label}</a>
                    ) : (
                      <div style={{ fontSize: 12, color: theme.text }}>{d.label}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add manual doc */}
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <input value={newDoc.label} onChange={e => setNewDoc(d => ({ ...d, label: e.target.value }))} placeholder="Add a link label" style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none", color: theme.text }} />
              <input value={newDoc.url}   onChange={e => setNewDoc(d => ({ ...d, url: e.target.value }))}   placeholder="URL (optional)" style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none", color: theme.text }} />
              <Button size="sm" variant="outline" onClick={addEventDoc} disabled={!newDoc.label.trim() || saving}>Add Link</Button>
            </div>
          </Card>

          {/* Debrief notes */}
          <Card>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Debrief Notes</div>
            <textarea
              value={debrief} onChange={e => setDebrief(e.target.value)}
              placeholder="Post-event notes, lessons learned…"
              rows={5}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${theme.border}`, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "vertical", color: theme.text, boxSizing: "border-box" }}
            />
            <Button size="sm" variant="outline" onClick={saveDebrief} disabled={saving} style={{ marginTop: 8 }}>Save Notes</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}