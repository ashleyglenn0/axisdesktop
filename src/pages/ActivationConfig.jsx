import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Button, Input, SectionHeader, Spinner } from "../components/UI";
import { getDriveAccessToken, createEventDriveFolder } from "../utils/driveUtils";

const genCode = (name) => {
  const base = (name || "EVENT").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const num  = String(Math.floor(Math.random() * 900) + 100);
  return base + num;
};

export default function ActivationConfig() {
  const { intakeId } = useParams();
  const { activeUser } = useAuth();
  const navigate = useNavigate();

  const [intake,  setIntake]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [done,        setDone]        = useState(false);
  const [driveStatus, setDriveStatus] = useState("idle"); // idle | authorizing | creating | done | error
  const [driveUrl,    setDriveUrl]    = useState("");

  const [config, setConfig] = useState({
    theme_primary:   "#1C4A36",
    theme_secondary: "#58B06C",
    theme_accent:    "#EBC764",
    logo_url:        "",
    access_code:     "",
    event_nickname:  "",
    has_minors:      false,
    allow_unverified: false,
  });

  const cf = (key) => (val) => setConfig(c => ({ ...c, [key]: val }));

  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, "event_intake_requests", intakeId));
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setIntake(d);
        // Auto-generate code and nickname from event name
        const name = d.event_name || d.eventName || "";
        setConfig(c => ({
          ...c,
          access_code:    genCode(name),
          event_nickname: name.split(" ").slice(0, 2).join(" "),
        }));
      }
      setLoading(false);
    };
    load();
  }, [intakeId]);

  const save = async () => {
    if (!intake) return;
    setSaving(true);

    const baseName = (intake.event_name || intake.eventName || intake.client || intake.organization || intakeId)
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const eventId = `${baseName}_${Date.now().toString(36)}`;

    // ── Step 1: Google Drive folder creation ──────────────────────────────
    let driveFolderUrl = intake.drive_folder_url || "";
    try {
      setDriveStatus("authorizing");
      const accessToken = await getDriveAccessToken();

      setDriveStatus("creating");
      driveFolderUrl = await createEventDriveFolder({
        clientName:  intake.client || intake.organization || "",
        eventName:   intake.event_name || intake.eventName || "",
        eventDate:   intake.event_date || intake.eventDate || "",
        pillar:      intake.pillar || "",
        accessToken,
      });
      setDriveUrl(driveFolderUrl);
      setDriveStatus("done");
    } catch (err) {
      console.error("Drive folder creation failed:", err);
      setDriveStatus("error");
      // Non-blocking — we still activate the event, just without the Drive folder
    }

    // ── Step 2: Write event to Firestore ──────────────────────────────────
    await setDoc(doc(db, "events", eventId), {
      id:               eventId,
      name:             intake.event_name || intake.eventName || "",
      event_nickname:   config.event_nickname || "",
      client:           intake.client || intake.organization || intake.clientName || "",
      event_date:       intake.event_date || intake.eventDate || "",
      venue:            intake.venue || "",
      location:         intake.location || intake.city || "",
      pillar:           intake.pillar || "",
      attendee_count:   intake.attendee_count || intake.expectedAttendees || "",
      confirmed_price:  intake.confirmed_price || "",
      pandadoc_url:     intake.pandadoc_url || "",
      contact_name:     intake.contact_name || intake.contactName || "",
      contact_email:    intake.contact_email || intake.email || "",
      client_poc:       intake.client_poc || null,
      drive_folder_url: driveFolderUrl || "",
      pipeline_id:      intake.pipeline_id || null,
      status:           "active",
      intake_id:        intakeId,
      theme: {
        primary:   config.theme_primary,
        secondary: config.theme_secondary,
        accent:    config.theme_accent,
      },
      logo_url:     config.logo_url || "",
      access_code:  config.access_code,
      activated_by: activeUser,
      activated_at: serverTimestamp(),
    }, { merge: true });

    await updateDoc(doc(db, "event_intake_requests", intakeId), {
      status: "activated", activated_event_id: eventId,
    });

    setSaving(false);
    setDone(true);
    setTimeout(() => navigate(`/event/${eventId}`), 1800);
  };

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh" }}><Spinner size={32} /></div>;

  const eventName = intake?.event_name || intake?.eventName || "Event";

  return (
    <div style={{ padding: "32px 36px", maxWidth: 660, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 20, padding: 0 }}>
        ← Back to Activation Queue
      </button>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Event Setup</div>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
          {eventName}
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: theme.textMuted }}>
          {intake?.client || intake?.organization} · {intake?.pillar || "—"} · {intake?.event_date || intake?.eventDate || "TBD"}
        </p>
      </div>

      {/* Event identity */}
      <Card style={{ marginBottom: 20 }}>
        <SectionHeader title="Event Identity" subtitle="How this event is labeled internally and in the Axis app" />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input
            label="Event Nickname (internal shortname)"
            value={config.event_nickname}
            onChange={e => cf("event_nickname")(e.target.value)}
            placeholder="e.g. TQC Spring Reset"
          />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
              Volunteer Access Code
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={config.access_code}
                onChange={e => cf("access_code")(e.target.value)}
                placeholder="e.g. TQCSPRING25"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 14, border: `1.5px solid ${theme.border}`, background: theme.offWhite, color: theme.text, outline: "none", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.08em", fontWeight: 700 }}
              />
              <button
                onClick={() => cf("access_code")(genCode(eventName))}
                style={{ padding: "10px 14px", borderRadius: 8, background: theme.background, border: `1.5px solid ${theme.border}`, fontSize: 12, fontWeight: 600, cursor: "pointer", color: theme.primary, fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}
              >
                Re-generate ↺
              </button>
            </div>
            {config.access_code && (
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>
                Crew and volunteers enter this code in the Axis app to join the event.
              </div>
            )}
          </div>
          <Input
            label="Client Logo URL (optional)"
            value={config.logo_url}
            onChange={e => cf("logo_url")(e.target.value)}
            placeholder="https://… paste a hosted image URL"
          />
          {config.logo_url && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, background: theme.background, border: `1px solid ${theme.border}` }}>
              <img src={config.logo_url} alt="logo preview" style={{ height: 36, objectFit: "contain", borderRadius: 4 }} onError={e => { e.target.style.display = "none"; }} />
              <span style={{ fontSize: 12, color: theme.textMuted }}>Logo preview</span>
            </div>
          )}
        </div>
      </Card>

      {/* Theme */}
      <Card style={{ marginBottom: 20 }}>
        <SectionHeader title="Event Theme" subtitle="Brand colors for the Axis mobile app for this event" />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { key: "theme_primary",   label: "Primary Color" },
            { key: "theme_secondary", label: "Secondary Color" },
            { key: "theme_accent",    label: "Accent Color" },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="color" value={config[key]}
                onChange={e => cf(key)(e.target.value)}
                style={{ width: 40, height: 40, borderRadius: 8, border: `1.5px solid ${theme.border}`, padding: 2, cursor: "pointer" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, color: theme.text, fontFamily: "monospace" }}>{config[key]}</div>
              </div>
            </div>
          ))}
        </div>
        {/* Live preview */}
        <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 10, background: config.theme_primary, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: config.theme_secondary, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: config.theme_accent }}>{config.event_nickname || eventName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>Axis App Preview</div>
          </div>
          {config.access_code && (
            <div style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 999, background: config.theme_accent, fontSize: 11, fontWeight: 700, color: config.theme_primary, letterSpacing: "0.08em" }}>
              {config.access_code}
            </div>
          )}
        </div>
      </Card>

      {/* Minors Flag */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 3 }}>Minors Present at Event</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>
              If enabled, uncleared volunteers on the roster will be flagged before event day. Background checks required for all floor staff.
            </div>
          </div>
          <button
            onClick={() => {
              const next = !config.has_minors;
              cf("has_minors")(next);
              if (next) cf("allow_unverified")(false); // minors overrides unverified
            }}
            style={{
              width: 44, height: 24, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0,
              background: config.has_minors ? theme.primary : theme.border,
              position: "relative", transition: "background 0.2s",
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 3, transition: "left 0.2s",
              left: config.has_minors ? 23 : 3,
            }} />
          </button>
        </div>
        {config.has_minors && (
          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(139,0,0,0.06)", border: "1px solid rgba(139,0,0,0.15)", fontSize: 12, color: "#8B0000", fontWeight: 600 }}>
            ⚠ Minors flag active — uncleared roster members will be flagged in Event Command.
          </div>
        )}
      </Card>

      {/* Unverified Volunteers */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 3 }}>Allow Unverified Volunteers</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>
              Permits volunteers without a cleared background check to work this event. Limit to low-risk roles only — registration, wayfinding, crowd flow. Cannot be enabled alongside Minors Present.
            </div>
          </div>
          <button
            onClick={() => {
              if (config.has_minors) return; // block if minors flag is on
              cf("allow_unverified")(!config.allow_unverified);
            }}
            title={config.has_minors ? "Cannot allow unverified volunteers at events with minors present" : ""}
            style={{
              width: 44, height: 24, borderRadius: 999, border: "none", flexShrink: 0,
              cursor: config.has_minors ? "not-allowed" : "pointer",
              background: config.has_minors ? theme.border : config.allow_unverified ? "#E07B2A" : theme.border,
              position: "relative", transition: "background 0.2s",
              opacity: config.has_minors ? 0.4 : 1,
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 3, transition: "left 0.2s",
              left: config.allow_unverified && !config.has_minors ? 23 : 3,
            }} />
          </button>
        </div>
        {config.has_minors && (
          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(139,0,0,0.06)", border: "1px solid rgba(139,0,0,0.15)", fontSize: 12, color: "#8B0000", fontWeight: 600 }}>
            🚫 Cannot allow unverified volunteers — Minors Present is enabled.
          </div>
        )}
        {config.allow_unverified && !config.has_minors && (
          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(224,123,42,0.08)", border: "1px solid rgba(224,123,42,0.25)", fontSize: 12, color: "#E07B2A", fontWeight: 600 }}>
            ⚠ Unverified volunteers permitted — assign to low-risk roles only. This decision is logged.
          </div>
        )}
      </Card>

      {/* Event summary pulled from pipeline */}
      {intake && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Event Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              ["Venue",       intake.venue],
              ["Location",    intake.location || intake.city],
              ["Attendance",  intake.attendee_count || intake.expectedAttendees],
              ["Investment",  intake.confirmed_price],
              ["POC",         intake.client_poc?.name],
              ["POC Email",   intake.client_poc?.email],
              ["Drive Folder", intake.drive_folder_url ? "Linked ✓" : null],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: theme.text }}>{String(val)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Drive status indicator */}
      {driveStatus !== "idle" && (
        <div style={{
          marginBottom: 16, padding: "12px 16px", borderRadius: 10,
          background: driveStatus === "error" ? "#FFF3F3" : driveStatus === "done" ? "#F0F9F4" : "#FFFBF0",
          border: `1px solid ${driveStatus === "error" ? "#FFCCCC" : driveStatus === "done" ? "#C3E6CB" : "#FFE8A0"}`,
          fontSize: 13, color: driveStatus === "error" ? "#C0392B" : driveStatus === "done" ? "#1C4A36" : "#7D5A00",
        }}>
          {driveStatus === "authorizing" && "🔑 Authorizing Google Drive access…"}
          {driveStatus === "creating"    && "📁 Creating client folder and copying templates…"}
          {driveStatus === "done"        && (
            <span>✓ Drive folder created — <a href={driveUrl} target="_blank" rel="noreferrer" style={{ color: "#1C4A36", fontWeight: 600 }}>Open in Drive</a></span>
          )}
          {driveStatus === "error"       && "⚠ Drive folder creation failed — event will still activate. Add the folder manually in Event Command."}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <Button onClick={save} disabled={saving || done || !config.access_code} size="lg">
          {done ? "✓ Event Activated!" : saving ? (
            driveStatus === "authorizing" ? "Authorizing Drive…" :
            driveStatus === "creating"   ? "Creating Folder…" :
            "Activating…"
          ) : "Activate Event →"}
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
      </div>
      {!config.access_code && (
        <div style={{ fontSize: 12, color: theme.warning, marginTop: 8 }}>An access code is required before activating.</div>
      )}
    </div>
  );
}