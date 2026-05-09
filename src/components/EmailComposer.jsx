// ─────────────────────────────────────────────────────────────────────────────
// EmailComposer.jsx — Motion & Method LLC
// Drop into src/components/EmailComposer.jsx
// Mirrors RayCodes EmailComposer pattern — one EmailJS template, all types
// M&M design system: forest green #1C4A36, gold #EBC764, DM Sans
//
// Usage:
//   <EmailComposer
//     isOpen={showEmail}
//     onClose={() => setShowEmail(false)}
//     context={{
//       // Any of these — component uses what's available
//       clientName, clientEmail, eventName, orgName,
//       docType, docUrl, invoiceAmount, dueDate,
//       contractorName, contractorEmail,
//     }}
//     defaultTemplate="leadFollowUp"  // optional
//   />
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { theme } from "../theme";

const EMAILJS_SERVICE_ID  = "service_jxgb2v9";
const EMAILJS_TEMPLATE_ID = "template_mm_outreach"; // create this in EmailJS dashboard
const EMAILJS_PUBLIC_KEY  = process.env.REACT_APP_EMAILJS_PUBLIC_KEY || "";
const EMAILJS_PRIVATE_KEY = process.env.REACT_APP_EMAILJS_PRIVATE_KEY || "";

// ─── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES = {
  onboardingInvite: {
    label:       "Onboarding Invite",
    icon:        "◈",
    description: "Welcome + deep link to Axis Mobile + packet",
    category:    "crew",
    subject: (ctx) => `Welcome to Motion & Method${ctx.contractorName ? `, ${ctx.contractorName.split(" ")[0]}` : ""}`,
    body: (ctx) => `Hi ${ctx.contractorName?.split(" ")[0] || "there"},

We're excited to have you joining the Motion & Method crew.

To complete your onboarding, download the Axis app using the link below. Once you're in, you'll be walked through everything you need to get started — it takes about 5 minutes.

Get started in Axis: ${ctx.deepLink || "https://axismobile.app.link/onboard"}

We've also attached your onboarding packet here so you can reference it anytime:
${ctx.onboardingPacketUrl || "[onboarding packet link]"}

A few important things to know:

— Axis is required on event day. Check-in and check-out happen in the app.

— Points and badges are earned through the app. Every event you work earns you points that count toward your crew ranking and priority placement for future events. None of that gets tracked outside the app, so staying active in Axis is how you move up.

If you have any trouble getting in, just reply to this email and we'll get you sorted.

Looking forward to working with you.

— The M&M Team
Motion & Method LLC`,
  },

  leadFollowUp: {
    label:       "Lead Follow-Up",
    icon:        "◎",
    description: "Check in after initial inquiry",
    category:    "client",
    subject: (ctx) => `Following up — ${ctx.eventName || ctx.orgName || "your event"}`,
    body: (ctx) => `Hi ${ctx.clientFirstName || ctx.clientName || "there"},

I wanted to follow up on your recent inquiry about M&M's event operations support${ctx.eventName ? ` for ${ctx.eventName}` : ""}.

I know things move fast, so I just wanted to make sure you had everything you need and see if any questions came up.

We'd love to learn more about what you're building and see if M&M is the right fit. If you're open to it, a 20-minute discovery call would be a great next step.

Let me know what works on your end.

— Ashley Glenn
Co-Founder, Motion & Method LLC`,
  },

  proposalFollowUp: {
    label:       "Proposal Follow-Up",
    icon:        "◐",
    description: "Check in after sending a proposal",
    category:    "client",
    subject: (ctx) => `Following up — M&M proposal for ${ctx.eventName || ctx.orgName || "your event"}`,
    body: (ctx) => `Hi ${ctx.clientFirstName || ctx.clientName || "there"},

I wanted to follow up on the proposal I sent over for ${ctx.eventName || "your event"}. I know inboxes get busy — just wanted to make sure it landed and see if anything needs clarifying.

If you have questions about scope, timeline, or investment, I'm happy to jump on a quick call and walk through it together.

Looking forward to hearing from you.

— Ashley Glenn
Co-Founder, Motion & Method LLC`,
  },

  docSignatureReminder: {
    label:       "Document Signature Reminder",
    icon:        "⊞",
    description: "Nudge for pending MSA/SOW/Proposal signature",
    category:    "client",
    subject: (ctx) => `Reminder — ${ctx.docType || "agreement"} pending your signature`,
    body: (ctx) => `Hi ${ctx.clientFirstName || ctx.clientName || "there"},

Quick reminder that your ${ctx.docType || "agreement"} for ${ctx.eventName || "your engagement"} is still waiting on your signature before we can officially move forward.

Once signed, we're cleared to proceed. If you have any questions about anything in the document, just reply here — happy to walk through it.

You can review and sign here: ${ctx.docUrl || "[document link]"}

— Ashley Glenn
Co-Founder, Motion & Method LLC`,
  },

  invoiceReminder: {
    label:       "Invoice Reminder",
    icon:        "$",
    description: "Payment reminder for outstanding invoice",
    category:    "client",
    subject: (ctx) => `Payment reminder — M&M invoice${ctx.eventName ? ` · ${ctx.eventName}` : ""}`,
    body: (ctx) => `Hi ${ctx.clientFirstName || ctx.clientName || "there"},

This is a friendly reminder that your invoice${ctx.eventName ? ` for ${ctx.eventName}` : ""} is currently outstanding.

${ctx.invoiceAmount ? `Amount Due: $${ctx.invoiceAmount}` : ""}
${ctx.dueDate ? `Due Date: ${ctx.dueDate}` : ""}
${ctx.paymentLink ? `\nPay here: ${ctx.paymentLink}` : ""}

If you've already sent payment, please disregard. If you need to make other arrangements, don't hesitate to reach out.

Thank you!

— Ashley Glenn
Co-Founder, Motion & Method LLC`,
  },

  staleLeadNudge: {
    label:       "Stale Lead Nudge",
    icon:        "⚠",
    description: "Re-engage a lead that's gone quiet",
    category:    "client",
    subject: (ctx) => `Checking in — ${ctx.eventName || ctx.orgName || "your event plans"}`,
    body: (ctx) => `Hi ${ctx.clientFirstName || ctx.clientName || "there"},

I wanted to check in — we spoke a while back about ${ctx.eventName || "your upcoming event"} and I want to make sure you have what you need as you get closer.

If your timeline or scope has shifted, or if you've decided to go a different direction, no worries at all — just let me know and I'll update your record on our end.

If you're still in planning mode and want to revisit what M&M can do for you, I'm happy to reconnect.

— Ashley Glenn
Co-Founder, Motion & Method LLC`,
  },

  generalOutreach: {
    label:       "General",
    icon:        "◱",
    description: "Blank template for anything else",
    category:    "general",
    subject: (ctx) => `${ctx.eventName ? `Re: ${ctx.eventName} — ` : ""}Message from Motion & Method`,
    body: (ctx) => `Hi ${ctx.clientFirstName || ctx.clientName || "there"},

${ctx.customMessage || ""}

— Ashley Glenn
Co-Founder, Motion & Method LLC`,
  },
};

const CATEGORIES = [
  { key: "all",     label: "All"     },
  { key: "client",  label: "Client"  },
  { key: "crew",    label: "Crew"    },
  { key: "general", label: "General" },
];

// ─── Send via EmailJS REST (server-safe) ──────────────────────────────────────
async function sendViaEmailJS({ toName, toEmail, subject, body }) {
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id:  EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id:     EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: {
        to_name:   toName,
        to_email:  toEmail,
        subject,
        message:   body,
        from_name: "Motion & Method LLC",
        reply_to:  "hello@motionmethodgroup.com",
      },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`EmailJS failed (${res.status}): ${text}`);
  return text;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EmailComposer({
  isOpen,
  onClose,
  context = {},
  defaultTemplate = "leadFollowUp",
}) {
  const [selectedTemplate, setSelectedTemplate] = useState(defaultTemplate);
  const [catFilter,        setCatFilter]        = useState("all");
  const [subject,          setSubject]          = useState("");
  const [body,             setBody]             = useState("");
  const [toEmail,          setToEmail]          = useState("");
  const [toName,           setToName]           = useState("");
  const [sending,          setSending]          = useState(false);
  const [sent,             setSent]             = useState(false);
  const [error,            setError]            = useState("");

  const enriched = {
    ...context,
    clientFirstName: context.clientName?.split(" ")[0] || "",
  };

  useEffect(() => {
    if (!isOpen) return;
    const tmpl = TEMPLATES[selectedTemplate];
    if (tmpl) {
      setSubject(tmpl.subject(enriched));
      setBody(tmpl.body(enriched));
    }
  }, [selectedTemplate, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setToEmail(context.clientEmail || context.contractorEmail || "");
    setToName(context.clientName  || context.contractorName  || "");
    setSent(false);
    setError("");
    setSelectedTemplate(defaultTemplate);
  }, [isOpen]);

  const handleSend = async () => {
    if (!toEmail.trim()) { setError("Email address is required."); return; }
    setSending(true);
    setError("");
    try {
      await sendViaEmailJS({ toName, toEmail, subject, body });

      // Log to activityLog
      await addDoc(collection(db, "activityLog"), {
        description: `Email sent to ${toName || toEmail} — "${subject}"`,
        client:      context.clientName    || toName  || "",
        clientId:    context.clientId      || "",
        eventId:     context.eventId       || "",
        type:        "email",
        template:    selectedTemplate,
        sentBy:      context.sentBy        || "Axis Desktop",
        timestamp:   serverTimestamp(),
      });

      setSent(true);
      setTimeout(() => { onClose(); setSent(false); }, 2000);
    } catch (err) {
      console.error("Email send error:", err);
      setError(err.message || "Send failed. Check EmailJS config.");
    }
    setSending(false);
  };

  const filteredTemplates = Object.entries(TEMPLATES).filter(
    ([, tmpl]) => catFilter === "all" || tmpl.category === catFilter
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 9999, padding: 16,
    }}>
      <div style={{
        background: theme.surface || "#fff", borderRadius: 16,
        boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        width: "100%", maxWidth: 680,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        overflow: "hidden", fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "20px 24px 16px", borderBottom: `1px solid ${theme.border}`,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.accent || "#EBC764", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              M&M Operations
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
              Compose Email
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: theme.textMuted, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Template selector */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Template</div>
            {/* Category filter */}
            <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
              {CATEGORIES.map(c => (
                <button key={c.key} onClick={() => setCatFilter(c.key)} style={{
                  padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: "pointer",
                  background: catFilter === c.key ? theme.primary : "transparent",
                  color: catFilter === c.key ? "#fff" : theme.textMuted,
                  border: `1px solid ${catFilter === c.key ? theme.primary : theme.border}`,
                  fontFamily: "'DM Sans', sans-serif",
                }}>{c.label}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {filteredTemplates.map(([key, tmpl]) => (
                <button key={key} onClick={() => setSelectedTemplate(key)} style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                  border: `1.5px solid ${selectedTemplate === key ? theme.primary : theme.border}`,
                  background: selectedTemplate === key ? `${theme.primary}0D` : "#fff",
                  transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: selectedTemplate === key ? theme.primary : theme.text, marginBottom: 2 }}>
                    {tmpl.icon} {tmpl.label}
                  </div>
                  <div style={{ fontSize: 10, color: theme.textMuted, lineHeight: 1.4 }}>{tmpl.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* To fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>To (Email) *</label>
              <input value={toEmail} onChange={e => setToEmail(e.target.value)}
                placeholder="recipient@email.com" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>To (Name)</label>
              <input value={toName} onChange={e => setToName(e.target.value)}
                placeholder="Recipient name" style={inputStyle} />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label style={labelStyle}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
          </div>

          {/* Body */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={labelStyle}>Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={12}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7, minHeight: 240 }}
            />
          </div>

          {/* Context chips */}
          {(context.eventName || context.orgName || context.docType || context.invoiceAmount) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {context.eventName    && <Chip label={`Event: ${context.eventName}`}    color={theme.primary} />}
              {context.orgName      && <Chip label={`Org: ${context.orgName}`}        color={theme.primary} />}
              {context.docType      && <Chip label={context.docType}                  color="#7C3AED" />}
              {context.invoiceAmount && <Chip label={`$${context.invoiceAmount}`}     color="#2d7a46" />}
            </div>
          )}

          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, fontSize: 12,
              background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)",
              color: "#C0392B",
            }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 10, padding: "16px 24px",
          borderTop: `1px solid ${theme.border}`,
        }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${theme.border}`,
            background: "transparent", color: theme.textMuted, fontSize: 13,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending || sent || !toEmail.trim()}
            style={{
              flex: 2, padding: "10px 0", borderRadius: 8, border: "none",
              background: sent ? "rgba(45,122,70,0.15)" : theme.primary,
              color: sent ? "#2d7a46" : "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              opacity: sending || !toEmail.trim() ? 0.6 : 1,
              transition: "all 0.15s",
            }}
          >
            {sent ? "✓ Sent!" : sending ? "Sending…" : "↑ Send Email"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
function Chip({ label, color }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: `${color}15`, color, border: `1px solid ${color}30`,
    }}>{label}</span>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const labelStyle = {
  display: "block", fontSize: 10, fontWeight: 700, color: "#6B7280",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5,
};

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#1A1A1A",
  fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none",
  boxSizing: "border-box",
};

/*
─── EmailJS Setup ────────────────────────────────────────────────────────────────

Create ONE template in EmailJS dashboard:
  Template ID: template_mm_outreach
  Service ID:  service_jxgb2v9

Template variables:
  {{to_name}}   — recipient name         (set as "To Name" in EmailJS)
  {{to_email}}  — recipient email        (set as "To Email" in EmailJS)
  {{subject}}   — subject line           (set as "Subject" in EmailJS)
  {{message}}   — full body
  {{from_name}} — "Motion & Method LLC"
  {{reply_to}}  — hello@motionmethodgroup.com

Add to functions/.env:
  MM_OUTREACH_TEMPLATE_ID=template_mm_outreach

─── Where to wire EmailComposer ─────────────────────────────────────────────────

1. TalentPool.jsx — Crew onboarding invite (defaultTemplate="onboardingInvite")
   context={{ contractorName, contractorEmail, deepLink }}

2. Pipeline.jsx — Lead follow-up (defaultTemplate="leadFollowUp")
   context={{ clientName, clientEmail, eventName, orgName }}

3. Pipeline.jsx — Proposal follow-up (defaultTemplate="proposalFollowUp")
   context={{ clientName, clientEmail, eventName }}

4. DocumentGenerator.jsx — Doc signature reminder (defaultTemplate="docSignatureReminder")
   context={{ clientName, clientEmail, docType, docUrl, eventName }}

5. Finance.jsx — Invoice reminder (defaultTemplate="invoiceReminder")
   context={{ clientName, clientEmail, invoiceAmount, dueDate, paymentLink, eventName }}

─────────────────────────────────────────────────────────────────────────────────
*/