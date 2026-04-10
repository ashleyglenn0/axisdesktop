import { useState, useEffect, useCallback } from "react";
import {
  collection, query, where, onSnapshot, getDocs,
  doc, getDoc, updateDoc, serverTimestamp, addDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { theme } from "../theme";

// ─── THEME TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg:           theme.background   || "#F7F6F2",
  primary:      theme.primary      || "#1C4A36",
  primaryDark:  theme.primaryDark  || "#163829",
  accent:       theme.accent       || "#EBC764",
  surface:      "#FFFFFF",
  surfaceAlt:   "#F4F3EF",
  border:       "#E4E2DA",
  text:         "#1A1A18",
  textMuted:    "#7A7870",
  textLight:    "#B0AEA6",
  green:        "#1C4A36",
  gold:         "#EBC764",
  red:          "#C84B31",
  blue:         "#2E5FA3",
  pending:      "#F5A623",
  approved:     "#2E7D32",
  denied:       "#C62828",
};

const STATUS_PILL = {
  pending:  { bg: "#FEF3CD", color: "#B8860B", label: "Pending" },
  approved: { bg: "#E8F5E9", color: "#2E7D32", label: "Approved" },
  denied:   { bg: "#FDECEA", color: "#C62828", label: "Denied" },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}
function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch { return iso; }
}
function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}
function weeksUntil(iso) {
  try {
    const ms = new Date(iso) - new Date();
    return ms / (1000 * 60 * 60 * 24 * 7);
  } catch { return 999; }
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function Pill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.pending;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>{s.label}</span>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`,
      padding: 24, ...style
    }}>
      {children}
    </div>
  );
}

function EmptyState({ icon, message }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: T.textMuted }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{message}</div>
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: T.surfaceAlt, borderRadius: 10, padding: 4, width: "fit-content" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
          fontSize: 13, fontWeight: 600, transition: "all 0.15s",
          background: active === t.id ? T.surface : "transparent",
          color: active === t.id ? T.primary : T.textMuted,
          boxShadow: active === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

// ─── APPROVAL MODAL ───────────────────────────────────────────────────────────
function ApprovalModal({ request, shiftDetails, onClose, onApprove, onDeny }) {
  const [note, setNote] = useState("");
  const tooClose = request?.eventDate && weeksUntil(request.eventDate) <= 2;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: T.surface, borderRadius: 16, padding: 32, width: 520,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)", border: `1px solid ${T.border}`,
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>Shift Drop Request</div>
            <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{request?.event}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: T.textMuted }}>×</button>
        </div>

        {/* Volunteer info */}
        <div style={{ background: T.surfaceAlt, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Volunteer</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{request?.volunteerName || request?.uid}</div>
          {request?.reason && (
            <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>"{request.reason}"</div>
          )}
        </div>

        {/* Shifts to drop */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Shifts Requested to Drop</div>
          {shiftDetails.length === 0 ? (
            <div style={{ fontSize: 13, color: T.textMuted }}>Loading shift details…</div>
          ) : shiftDetails.map(s => (
            <div key={s.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", background: T.surfaceAlt, borderRadius: 8, marginBottom: 6,
              border: `1px solid ${T.border}`,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{s.name || s.role || "Unnamed Shift"}</div>
                <div style={{ fontSize: 12, color: T.textMuted }}>{s.zone || ""} · {formatTime(s.start_time)} – {formatTime(s.end_time)}</div>
              </div>
              <div style={{ fontSize: 12, color: T.textMuted }}>{formatDate(s.date || s.start_time)}</div>
            </div>
          ))}
        </div>

        {/* Auto-deny warning */}
        {tooClose && (
          <div style={{
            background: "#FEF3CD", border: `1px solid #F5A623`, borderRadius: 8,
            padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#92650A",
          }}>
            ⚠️ This event is within 2 weeks. Per M&M policy, shift drops are auto-denied at this threshold. Manual override required to approve.
          </div>
        )}

        {/* Note */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>Internal note (optional)</div>
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note for your records…"
            style={{
              width: "100%", minHeight: 72, borderRadius: 8, border: `1px solid ${T.border}`,
              padding: "10px 12px", fontSize: 13, color: T.text, resize: "vertical",
              fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box",
              background: T.surfaceAlt, outline: "none",
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "10px 20px", borderRadius: 8, border: `1px solid ${T.border}`,
            background: "transparent", color: T.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={() => onDeny(request, note)} style={{
            padding: "10px 20px", borderRadius: 8, border: "none",
            background: "#FDECEA", color: T.denied, fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>Deny</button>
          <button onClick={() => onApprove(request, note)} style={{
            padding: "10px 20px", borderRadius: 8, border: "none",
            background: T.primary, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>Approve Drop</button>
        </div>
      </div>
    </div>
  );
}

// ─── ADD CREW EVENT MODAL ─────────────────────────────────────────────────────
function AddCrewEventModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    title: "", event: "mm", date: "", start_time: "", end_time: "",
    location: "", notes: "", required: false,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title || !form.date) return;
    await onSave(form);
    onClose();
  };

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
    fontSize: 13, color: T.text, background: T.surfaceAlt, fontFamily: "'DM Sans', sans-serif",
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: T.surface, borderRadius: 16, padding: 32, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", border: `1px solid ${T.border}` }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 24 }}>Add M&M Crew Event</div>

        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={labelStyle}>Event Title</label>
            <input style={inputStyle} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Pre-Event Team Briefing" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" style={inputStyle} value={form.date} onChange={e => set("date", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Linked Event</label>
              <input style={inputStyle} value={form.event} onChange={e => set("event", e.target.value)} placeholder="mm (general) or event name" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input type="time" style={inputStyle} value={form.start_time} onChange={e => set("start_time", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <input type="time" style={inputStyle} value={form.end_time} onChange={e => set("end_time", e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Location</label>
            <input style={inputStyle} value={form.location} onChange={e => set("location", e.target.value)} placeholder="Room, address, or virtual link" />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Anything the crew needs to know…" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="required" checked={form.required} onChange={e => set("required", e.target.checked)} style={{ width: 16, height: 16, accentColor: T.primary }} />
            <label htmlFor="required" style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Mandatory attendance</label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: T.primary, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save Event</button>
        </div>
      </div>
    </div>
  );
}

// ─── GLOBAL VIEW — TABLE ──────────────────────────────────────────────────────
function GlobalTableView({ events, shifts }) {
  const [filterEvent, setFilterEvent] = useState("all");
  const eventNames = ["all", ...new Set(shifts.map(s => s.eventName).filter(Boolean))];

  const filtered = filterEvent === "all" ? shifts : shifts.filter(s => s.eventName === filterEvent);
  const sorted = [...filtered].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {eventNames.map(e => (
          <button key={e} onClick={() => setFilterEvent(e)} style={{
            padding: "6px 14px", borderRadius: 20, border: `1px solid ${filterEvent === e ? T.primary : T.border}`,
            background: filterEvent === e ? T.primary : "transparent",
            color: filterEvent === e ? "#fff" : T.textMuted,
            fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: e === "all" ? "none" : undefined,
          }}>{e === "all" ? "All Events" : e}</button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon="📅" message="No shifts found. Create shifts inside an event via EventCommand." />
      ) : (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.surfaceAlt }}>
                {["Event", "Shift", "Zone / Role", "Date", "Time", "Capacity", "Filled"].map(h => (
                  <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const cap = s.capacity ?? s.max_signups ?? "—";
                const filled = s.signedUp ?? s.volunteers?.length ?? 0;
                const pct = typeof cap === "number" ? filled / cap : null;
                const capColor = pct === null ? T.textMuted : pct >= 1 ? T.red : pct >= 0.8 ? T.pending : T.approved;
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? T.surface : T.surfaceAlt }}>
                    <td style={{ padding: "11px 14px", color: T.textMuted }}>{s.eventName}</td>
                    <td style={{ padding: "11px 14px", fontWeight: 600, color: T.text }}>{s.name || s.role || "—"}</td>
                    <td style={{ padding: "11px 14px", color: T.textMuted }}>{s.zone || "—"}</td>
                    <td style={{ padding: "11px 14px", color: T.textMuted }}>{formatDate(s.date || s.start_time)}</td>
                    <td style={{ padding: "11px 14px", color: T.textMuted }}>{formatTime(s.start_time)} – {formatTime(s.end_time)}</td>
                    <td style={{ padding: "11px 14px", color: T.textMuted }}>{cap}</td>
                    <td style={{ padding: "11px 14px", fontWeight: 700, color: capColor }}>{filled}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── GLOBAL VIEW — CALENDAR ───────────────────────────────────────────────────
function GlobalCalendarView({ shifts }) {
  const byDate = {};
  shifts.forEach(s => {
    const d = (s.date || s.start_time || "").slice(0, 10);
    if (!d) return;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(s);
  });
  const dates = Object.keys(byDate).sort();

  if (dates.length === 0) return <EmptyState icon="📅" message="No shifts with dates found." />;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {dates.map(d => (
        <div key={d}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: T.primary, textTransform: "uppercase",
            letterSpacing: "0.1em", marginBottom: 8, paddingBottom: 6,
            borderBottom: `2px solid ${T.accent}`, display: "inline-block",
          }}>
            {new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {byDate[d].map(s => {
              const cap = s.capacity ?? s.max_signups ?? null;
              const filled = s.signedUp ?? s.volunteers?.length ?? 0;
              const pct = cap ? filled / cap : null;
              const barColor = pct === null ? T.textLight : pct >= 1 ? T.red : pct >= 0.8 ? T.pending : T.approved;
              return (
                <div key={s.id} style={{
                  background: T.surface, borderRadius: 10, padding: "12px 14px",
                  border: `1px solid ${T.border}`, position: "relative", overflow: "hidden",
                }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: `${pct ? Math.min(pct * 100, 100) : 0}%`, height: 3, background: barColor, transition: "width 0.3s" }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{s.name || s.role || "Shift"}</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{s.eventName} · {s.zone || "No zone"}</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{formatTime(s.start_time)} – {formatTime(s.end_time)}</div>
                  {cap !== null && (
                    <div style={{ fontSize: 11, marginTop: 6, color: barColor, fontWeight: 600 }}>{filled} / {cap} filled</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── APPROVALS QUEUE ──────────────────────────────────────────────────────────
function ApprovalsQueue({ requests, onSelect }) {
  const pending = requests.filter(r => r.status === "pending");
  const resolved = requests.filter(r => r.status !== "pending");

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Card>
        <SectionHeader
          title="Pending Approvals"
          subtitle={`${pending.length} request${pending.length !== 1 ? "s" : ""} awaiting review`}
        />
        {pending.length === 0 ? (
          <EmptyState icon="✅" message="No pending shift drop requests." />
        ) : pending.map(r => (
          <div key={r.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 16px", border: `1px solid ${T.border}`, borderRadius: 10,
            marginBottom: 8, background: T.surfaceAlt, cursor: "pointer",
            transition: "border-color 0.15s",
          }}
            onClick={() => onSelect(r)}
            onMouseEnter={e => e.currentTarget.style.borderColor = T.primary}
            onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{r.volunteerName || r.uid}</div>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                {r.event} · {r.shifts_to_drop?.length || 0} shift{r.shifts_to_drop?.length !== 1 ? "s" : ""} · {formatDateTime(r.timestamp)}
              </div>
              {r.reason && <div style={{ fontSize: 12, color: T.textMuted, fontStyle: "italic", marginTop: 2 }}>"{r.reason}"</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Pill status="pending" />
              <span style={{ fontSize: 18, color: T.textMuted }}>›</span>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <SectionHeader title="Resolved" subtitle="Recently approved or denied requests" />
        {resolved.length === 0 ? (
          <EmptyState icon="📋" message="No resolved requests yet." />
        ) : resolved.slice(0, 10).map(r => (
          <div key={r.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", border: `1px solid ${T.border}`, borderRadius: 10,
            marginBottom: 6, background: T.surface,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{r.volunteerName || r.uid}</div>
              <div style={{ fontSize: 12, color: T.textMuted }}>{r.event} · {formatDateTime(r.timestamp)}</div>
            </div>
            <Pill status={r.status} />
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── CONTRACTOR WINDOWS ───────────────────────────────────────────────────────
function ContractorWindows({ windows, onApprove, onDeny }) {
  const pending = windows.filter(w => w.status === "pending");
  const resolved = windows.filter(w => w.status !== "pending");

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Card>
        <SectionHeader
          title="Engagement Window Requests"
          subtitle="Contractors requesting availability for upcoming events"
        />
        {pending.length === 0 ? (
          <EmptyState icon="🗓" message="No pending contractor window requests." />
        ) : pending.map(w => (
          <div key={w.id} style={{
            padding: "16px", border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 10, background: T.surfaceAlt,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{w.contractorName || w.uid}</div>
                <div style={{ fontSize: 12, color: T.textMuted }}>{w.event} · Submitted {formatDateTime(w.timestamp)}</div>
              </div>
              <Pill status="pending" />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {(w.dates || []).map((d, i) => (
                <span key={i} style={{
                  padding: "4px 12px", background: T.surface, borderRadius: 20,
                  fontSize: 12, color: T.text, border: `1px solid ${T.border}`, fontWeight: 600,
                }}>{formatDate(d)}</span>
              ))}
              {w.start && w.end && (
                <span style={{
                  padding: "4px 12px", background: T.surface, borderRadius: 20,
                  fontSize: 12, color: T.text, border: `1px solid ${T.border}`,
                }}>{formatTime(w.start)} – {formatTime(w.end)}</span>
              )}
            </div>
            {w.notes && <div style={{ fontSize: 12, color: T.textMuted, fontStyle: "italic", marginBottom: 12 }}>"{w.notes}"</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onDeny(w)} style={{
                padding: "8px 16px", borderRadius: 8, border: "none", background: "#FDECEA",
                color: T.denied, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>Deny</button>
              <button onClick={() => onApprove(w)} style={{
                padding: "8px 16px", borderRadius: 8, border: "none", background: T.primary,
                color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>Approve Window</button>
            </div>
          </div>
        ))}
      </Card>

      {resolved.length > 0 && (
        <Card>
          <SectionHeader title="Resolved Windows" />
          {resolved.slice(0, 8).map(w => (
            <div key={w.id} style={{
              display: "flex", justifyContent: "space-between", padding: "10px 14px",
              border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 6, background: T.surface,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{w.contractorName || w.uid}</div>
                <div style={{ fontSize: 12, color: T.textMuted }}>{w.event} · {formatDateTime(w.timestamp)}</div>
              </div>
              <Pill status={w.status} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─── M&M CREW EVENTS ─────────────────────────────────────────────────────────
function CrewEvents({ crewEvents, onAdd }) {
  const sorted = [...crewEvents].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Card>
        <SectionHeader
          title="M&M Internal Events"
          subtitle="Team briefings, training sessions, and all-hands — event: 'mm' or event-specific"
          action={
            <button onClick={onAdd} style={{
              padding: "9px 18px", borderRadius: 8, border: "none",
              background: T.primary, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>+ Add Event</button>
          }
        />
        {sorted.length === 0 ? (
          <EmptyState icon="📌" message="No M&M crew events yet. Add one to get started." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {sorted.map(e => (
              <div key={e.id} style={{
                background: T.surfaceAlt, borderRadius: 10, padding: "16px",
                border: `1px solid ${T.border}`, borderLeft: `4px solid ${e.required ? T.red : T.accent}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{e.title}</div>
                  {e.required && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.red, background: "#FDECEA", padding: "2px 8px", borderRadius: 10, textTransform: "uppercase" }}>Required</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.textMuted }}>{e.event === "mm" ? "All M&M Staff" : e.event}</div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
                  {formatDate(e.date)} · {e.start_time && formatTime(e.start_time)}{e.end_time ? ` – ${formatTime(e.end_time)}` : ""}
                </div>
                {e.location && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>📍 {e.location}</div>}
                {e.notes && <div style={{ fontSize: 12, color: T.textMuted, fontStyle: "italic", marginTop: 6 }}>{e.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── ADD PROGRAM ITEM MODAL ───────────────────────────────────────────────────
function AddProgramItemModal({ type, onClose, onSave }) {
  const isConference = type === "conference";
  const [form, setForm] = useState({
    title: "", date: "", start_time: "", end_time: "", location: "",
    description: "", speaker: "", type: isConference ? "talk" : "kickoff",
    audience: isConference ? "public" : "crew",
    requiresSignup: false, capacity: "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title) return;
    const payload = { ...form };
    if (!isConference && !form.requiresSignup) delete payload.capacity;
    if (!isConference) { delete payload.speaker; }
    if (isConference) { delete payload.requiresSignup; delete payload.capacity; }
    await onSave(payload);
    onClose();
  };

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
    fontSize: 13, color: T.text, background: T.surfaceAlt, fontFamily: "'DM Sans', sans-serif",
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase",
    letterSpacing: "0.08em", marginBottom: 5, display: "block",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: T.surface, borderRadius: 16, padding: 32, width: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", border: `1px solid ${T.border}`, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 4 }}>
          {isConference ? "Add Conference Item" : "Add Volunteer Event"}
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 24 }}>
          {isConference ? "Talks, panels, activations, evening events" : "Kickoff, orientation, appreciation, social events"}
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={form.title} onChange={e => set("title", e.target.value)} placeholder={isConference ? "e.g. Opening Keynote" : "e.g. Volunteer Kickoff"} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={form.type} onChange={e => set("type", e.target.value)}>
                {isConference
                  ? ["talk", "panel", "keynote", "activation", "workshop", "social", "other"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)
                  : ["kickoff", "orientation", "training", "appreciation", "social", "other"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)
                }
              </select>
            </div>
            <div>
              <label style={labelStyle}>Audience</label>
              <select style={inputStyle} value={form.audience} onChange={e => set("audience", e.target.value)}>
                <option value="public">Public</option>
                <option value="crew">Crew Only</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" style={inputStyle} value={form.date} onChange={e => set("date", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Start</label>
              <input type="time" style={inputStyle} value={form.start_time} onChange={e => set("start_time", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>End</label>
              <input type="time" style={inputStyle} value={form.end_time} onChange={e => set("end_time", e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Location / Room</label>
            <input style={inputStyle} value={form.location} onChange={e => set("location", e.target.value)} placeholder="Stage A, Main Hall, etc." />
          </div>

          {isConference && (
            <div>
              <label style={labelStyle}>Speaker / Host</label>
              <input style={inputStyle} value={form.speaker} onChange={e => set("speaker", e.target.value)} placeholder="Name or TBD" />
            </div>
          )}

          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Brief description…" />
          </div>

          {!isConference && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: form.requiresSignup ? 10 : 0 }}>
                <input type="checkbox" id="requiresSignup" checked={form.requiresSignup} onChange={e => set("requiresSignup", e.target.checked)} style={{ width: 16, height: 16, accentColor: T.primary }} />
                <label htmlFor="requiresSignup" style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Requires sign-up</label>
              </div>
              {form.requiresSignup && (
                <div>
                  <label style={labelStyle}>Capacity</label>
                  <input type="number" style={inputStyle} value={form.capacity} onChange={e => set("capacity", e.target.value)} placeholder="Max attendees" />
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: T.primary, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function ScheduleManager() {
  const [mainTab, setMainTab] = useState("global");
  const [globalViewTab, setGlobalViewTab] = useState("calendar");
  const [events, setEvents] = useState([]);
  const [allShifts, setAllShifts] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [contractorWindows, setContractorWindows] = useState([]);
  const [crewEvents, setCrewEvents] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [shiftDetails, setShiftDetails] = useState([]);
  const [showAddCrewEvent, setShowAddCrewEvent] = useState(false);
  const [loading, setLoading] = useState(true);

  // Event Programming state
  const [programmingEvent, setProgrammingEvent] = useState("");
  const [conferenceItems, setConferenceItems] = useState([]);
  const [volunteerProgramItems, setVolunteerProgramItems] = useState([]);
  const [showAddProgramItem, setShowAddProgramItem] = useState(null);
  const [programmingViewTab, setProgrammingViewTab] = useState("conference");

  // ── Load events ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "events"), snap => {
      const evts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEvents(evts);
    });
    return unsub;
  }, []);

  // ── Load all shifts across events ──
  useEffect(() => {
    if (events.length === 0) return;
    const unsubList = [];
    const shiftMap = {};

    events.forEach(evt => {
      const unsub = onSnapshot(
        collection(db, "events", evt.id, "shifts"),
        snap => {
          shiftMap[evt.id] = snap.docs.map(d => ({
            id: d.id, ...d.data(),
            eventId: evt.id,
            eventName: evt.name || evt.event || evt.id,
          }));
          setAllShifts(Object.values(shiftMap).flat());
          setLoading(false);
        }
      );
      unsubList.push(unsub);
    });

    return () => unsubList.forEach(u => u());
  }, [events]);

  // ── Load change requests ──
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "schedule_change_requests")),
      async snap => {
        const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Enrich with volunteer name
        const enriched = await Promise.all(reqs.map(async r => {
          try {
            const vpSnap = await getDoc(doc(db, "volunteerProfiles", r.uid));
            if (vpSnap.exists()) {
              const vp = vpSnap.data();
              return { ...r, volunteerName: `${vp.first_name || ""} ${vp.last_name || ""}`.trim() };
            }
            const uSnap = await getDoc(doc(db, "users", r.uid));
            if (uSnap.exists()) {
              const u = uSnap.data();
              return { ...r, volunteerName: `${u.first_name || ""} ${u.last_name || ""}`.trim() };
            }
          } catch {}
          return r;
        }));
        setChangeRequests(enriched);
      }
    );
    return unsub;
  }, []);

  // ── Load contractor windows ──
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "contractor_engagement_windows"),
      async snap => {
        const wins = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const enriched = await Promise.all(wins.map(async w => {
          try {
            const vpSnap = await getDoc(doc(db, "volunteerProfiles", w.uid));
            if (vpSnap.exists()) {
              const vp = vpSnap.data();
              return { ...w, contractorName: `${vp.first_name || ""} ${vp.last_name || ""}`.trim() };
            }
          } catch {}
          return w;
        }));
        setContractorWindows(enriched);
      }
    );
    return unsub;
  }, []);

  // ── Load M&M crew events ──
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "volunteerEvents"), where("event", "in", ["mm"])),
      snap => setCrewEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  // ── Load Event Programming (conference + volunteer) by selected event ──
  useEffect(() => {
    if (!programmingEvent) {
      setConferenceItems([]);
      setVolunteerProgramItems([]);
      return;
    }
    const unsubConf = onSnapshot(
      query(collection(db, "conferenceEvents"), where("event", "==", programmingEvent)),
      snap => setConferenceItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubVol = onSnapshot(
      query(collection(db, "volunteerEvents"), where("event", "==", programmingEvent)),
      snap => setVolunteerProgramItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubConf(); unsubVol(); };
  }, [programmingEvent]);

  // ── Load shift details when a request is selected ──
  useEffect(() => {
    if (!selectedRequest) { setShiftDetails([]); return; }
    const load = async () => {
      const evt = events.find(e => e.name === selectedRequest.event || e.event === selectedRequest.event);
      if (!evt) { setShiftDetails([]); return; }
      const details = await Promise.all(
        (selectedRequest.shifts_to_drop || []).map(async shiftId => {
          try {
            const s = await getDoc(doc(db, "events", evt.id, "shifts", shiftId));
            return s.exists() ? { id: s.id, ...s.data() } : { id: shiftId };
          } catch { return { id: shiftId }; }
        })
      );
      setShiftDetails(details);
    };
    load();
  }, [selectedRequest, events]);

  // ── Approve drop ──
  const handleApprove = useCallback(async (request, note) => {
    try {
      await updateDoc(doc(db, "schedule_change_requests", request.id), {
        status: "approved",
        resolvedAt: serverTimestamp(),
        resolvedNote: note || "",
      });
      // Open shifts back up
      const evt = events.find(e => e.name === request.event || e.event === request.event);
      if (evt) {
        await Promise.all((request.shifts_to_drop || []).map(shiftId =>
          updateDoc(doc(db, "events", evt.id, "shifts", shiftId), {
            status: "open",
          }).catch(() => {})
        ));
      }
      setSelectedRequest(null);
    } catch (err) { console.error(err); }
  }, [events]);

  // ── Deny drop ──
  const handleDeny = useCallback(async (request, note) => {
    try {
      await updateDoc(doc(db, "schedule_change_requests", request.id), {
        status: "denied",
        resolvedAt: serverTimestamp(),
        resolvedNote: note || "",
      });
      setSelectedRequest(null);
    } catch (err) { console.error(err); }
  }, []);

  // ── Approve contractor window ──
  const handleApproveWindow = useCallback(async (window) => {
    try {
      await updateDoc(doc(db, "contractor_engagement_windows", window.id), {
        status: "approved", resolvedAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
  }, []);

  const handleDenyWindow = useCallback(async (window) => {
    try {
      await updateDoc(doc(db, "contractor_engagement_windows", window.id), {
        status: "denied", resolvedAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
  }, []);

  // ── Add crew event ──
  const handleAddCrewEvent = useCallback(async (form) => {
    try {
      await addDoc(collection(db, "volunteerEvents"), {
        ...form,
        createdAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
  }, []);

  // ── Add Event Programming item ──
  const handleAddProgramItem = useCallback(async (type, form) => {
    try {
      const col = type === "conference" ? "conferenceEvents" : "volunteerEvents";
      await addDoc(collection(db, col), {
        ...form,
        event: programmingEvent,
        createdAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
  }, [programmingEvent]);

  // ── Badge counts ──
  const pendingCount = changeRequests.filter(r => r.status === "pending").length;
  const windowCount = contractorWindows.filter(w => w.status === "pending").length;

  const MAIN_TABS = [
    { id: "global", label: "Schedule Overview" },
    { id: "approvals", label: `Shift Changes${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
    { id: "windows", label: `Contractor Windows${windowCount > 0 ? ` (${windowCount})` : ""}` },
    { id: "crew", label: "M&M Crew Events" },
    { id: "programming", label: "Event Programming" },
  ];

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          Axis Desktop
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: T.text, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 8 }}>
          Schedule Manager
        </div>
        <div style={{ fontSize: 14, color: T.textMuted }}>
          Cross-event schedule view, shift drop approvals, contractor windows, and M&M internal events.
        </div>
      </div>

      {/* Stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Total Shifts", value: loading ? "…" : allShifts.length, color: T.primary },
          { label: "Pending Approvals", value: pendingCount, color: pendingCount > 0 ? T.pending : T.approved },
          { label: "Contractor Windows", value: windowCount, color: windowCount > 0 ? T.pending : T.approved },
          { label: "M&M Events", value: crewEvents.length, color: T.primary },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: T.surface, borderRadius: 12, padding: "16px 20px",
            border: `1px solid ${T.border}`,
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: "-0.04em" }}>{value}</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2, fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Main tabs */}
      <div style={{ marginBottom: 24 }}>
        <TabBar tabs={MAIN_TABS} active={mainTab} onChange={setMainTab} />
      </div>

      {/* ── GLOBAL SCHEDULE ── */}
      {mainTab === "global" && (
        <Card>
          <SectionHeader
            title="Schedule Overview"
            subtitle="All shifts across all active events"
            action={<TabBar tabs={[{ id: "calendar", label: "Calendar" }, { id: "table", label: "Table" }]} active={globalViewTab} onChange={setGlobalViewTab} />}
          />
          {loading ? (
            <EmptyState icon="⏳" message="Loading shifts…" />
          ) : globalViewTab === "calendar" ? (
            <GlobalCalendarView shifts={allShifts} />
          ) : (
            <GlobalTableView events={events} shifts={allShifts} />
          )}
        </Card>
      )}

      {/* ── APPROVALS ── */}
      {mainTab === "approvals" && (
        <ApprovalsQueue requests={changeRequests} onSelect={setSelectedRequest} />
      )}

      {/* ── CONTRACTOR WINDOWS ── */}
      {mainTab === "windows" && (
        <ContractorWindows
          windows={contractorWindows}
          onApprove={handleApproveWindow}
          onDeny={handleDenyWindow}
        />
      )}

      {/* ── CREW EVENTS ── */}
      {mainTab === "crew" && (
        <CrewEvents crewEvents={crewEvents} onAdd={() => setShowAddCrewEvent(true)} />
      )}

      {/* ── EVENT PROGRAMMING ── */}
      {mainTab === "programming" && (
        <div style={{ display: "grid", gap: 20 }}>

          {/* Event picker */}
          <Card style={{ padding: "16px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textMuted, whiteSpace: "nowrap" }}>Viewing event:</div>
              <select
                value={programmingEvent}
                onChange={e => setProgrammingEvent(e.target.value)}
                style={{
                  padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
                  fontSize: 13, color: T.text, background: T.surfaceAlt,
                  fontFamily: "'DM Sans', sans-serif", cursor: "pointer", minWidth: 220,
                }}
              >
                <option value="">— Select an event —</option>
                {events.map(e => (
                  <option key={e.id} value={e.name || e.event || e.id}>
                    {e.name || e.event || e.id}
                  </option>
                ))}
              </select>
              {programmingEvent && (
                <div style={{ fontSize: 12, color: T.textMuted }}>
                  {conferenceItems.length} conference item{conferenceItems.length !== 1 ? "s" : ""} · {volunteerProgramItems.length} volunteer event{volunteerProgramItems.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          </Card>

          {!programmingEvent ? (
            <EmptyState icon="📅" message="Select an event above to view and manage its programming." />
          ) : (
            <Card>
              <SectionHeader
                title="Event Programming"
                subtitle={programmingEvent}
                action={
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowAddProgramItem("conference")} style={{
                      padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`,
                      background: T.surfaceAlt, color: T.text, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}>+ Conference Item</button>
                    <button onClick={() => setShowAddProgramItem("volunteer")} style={{
                      padding: "8px 16px", borderRadius: 8, border: "none",
                      background: T.primary, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}>+ Volunteer Event</button>
                  </div>
                }
              />

              <div style={{ marginBottom: 20 }}>
                <TabBar
                  tabs={[
                    { id: "conference", label: `Conference (${conferenceItems.length})` },
                    { id: "volunteer", label: `Volunteer Events (${volunteerProgramItems.length})` },
                  ]}
                  active={programmingViewTab}
                  onChange={setProgrammingViewTab}
                />
              </div>

              {programmingViewTab === "conference" && (
                conferenceItems.length === 0 ? (
                  <EmptyState icon="🎤" message="No conference items yet. Add talks, panels, or activations." />
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {[...conferenceItems].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")).map(item => (
                      <div key={item.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                        padding: "14px 16px", border: `1px solid ${T.border}`, borderRadius: 10,
                        background: T.surfaceAlt, borderLeft: `4px solid ${T.blue}`,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{item.title || item.name || "Untitled"}</div>
                          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                            {item.type && <span style={{ marginRight: 8, textTransform: "capitalize" }}>{item.type}</span>}
                            {item.location && <span>📍 {item.location} · </span>}
                            {formatDate(item.date || item.start_time)} · {formatTime(item.start_time)}{item.end_time ? ` – ${formatTime(item.end_time)}` : ""}
                          </div>
                          {item.speaker && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>🎤 {item.speaker}</div>}
                          {item.description && <div style={{ fontSize: 12, color: T.textMuted, fontStyle: "italic", marginTop: 4 }}>{item.description}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                          {item.audience && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 10,
                              background: item.audience === "crew" ? "#E8F0EC" : item.audience === "both" ? "#FDF6E3" : "#EEF2FF",
                              color: item.audience === "crew" ? T.green : item.audience === "both" ? "#92650A" : T.blue,
                              textTransform: "uppercase", letterSpacing: "0.06em",
                            }}>{item.audience}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {programmingViewTab === "volunteer" && (
                volunteerProgramItems.length === 0 ? (
                  <EmptyState icon="🙌" message="No volunteer events yet. Add kickoffs, orientations, or appreciation events." />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                    {[...volunteerProgramItems].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(item => (
                      <div key={item.id} style={{
                        background: T.surfaceAlt, borderRadius: 10, padding: "14px 16px",
                        border: `1px solid ${T.border}`, borderLeft: `4px solid ${item.requiresSignup ? T.accent : T.green}`,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{item.title || item.name || "Untitled"}</div>
                          {item.requiresSignup && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#92650A", background: "#FDF6E3", padding: "2px 8px", borderRadius: 10, textTransform: "uppercase", whiteSpace: "nowrap", marginLeft: 8 }}>Sign-up</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: T.textMuted }}>
                          {formatDate(item.date)} · {item.start_time && formatTime(item.start_time)}{item.end_time ? ` – ${formatTime(item.end_time)}` : ""}
                        </div>
                        {item.location && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>📍 {item.location}</div>}
                        {item.requiresSignup && item.capacity && (
                          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>👥 Capacity: {item.capacity}</div>
                        )}
                        {item.notes && <div style={{ fontSize: 12, color: T.textMuted, fontStyle: "italic", marginTop: 6 }}>{item.notes}</div>}
                      </div>
                    ))}
                  </div>
                )
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── MODALS ── */}
      {selectedRequest && (
        <ApprovalModal
          request={selectedRequest}
          shiftDetails={shiftDetails}
          onClose={() => setSelectedRequest(null)}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
      )}
      {showAddCrewEvent && (
        <AddCrewEventModal onClose={() => setShowAddCrewEvent(false)} onSave={handleAddCrewEvent} />
      )}
      {showAddProgramItem && (
        <AddProgramItemModal
          type={showAddProgramItem}
          onClose={() => setShowAddProgramItem(null)}
          onSave={(form) => handleAddProgramItem(showAddProgramItem, form)}
        />
      )}
    </div>
  );
}