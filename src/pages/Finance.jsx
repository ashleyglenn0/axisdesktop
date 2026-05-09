// ─────────────────────────────────────────────────────────────────────────────
// Finance.jsx — Motion & Method LLC
// Refactored: Square + Relay + Gusto, Money In/Out ledger,
// invoice tracking from mm_documents, distribution calculator
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Spinner } from "../components/UI";

// ── Platform config — update URLs when accounts are live ─────────────────────
const PLATFORMS = {
  square: {
    label: "Square",
    note:  "Day-of payments and deposit collection",
    url:   "https://squareup.com/dashboard",
    color: "#000000", bg: "rgba(0,0,0,0.06)", border: "rgba(0,0,0,0.15)",
    icon:  "⬛",
  },
  relay: {
    label: "Relay",
    note:  "Business banking — where revenue lands",
    url:   "https://relayfi.com",
    color: "#1C4A36", bg: "rgba(28,74,54,0.07)", border: "rgba(28,74,54,0.2)",
    icon:  "🏦",
  },
  gusto: {
    label: "Gusto",
    note:  "Contractor payouts and 1099 filing",
    url:   "https://app.gusto.com",
    color: "#F45F42", bg: "rgba(244,95,66,0.08)", border: "rgba(244,95,66,0.2)",
    icon:  "💸",
  },
};

// ── Distribution split ────────────────────────────────────────────────────────
const SPLITS = { Ashley: 0.40, Mikal: 0.40, Shanell: 0.20 };
// 30% operating reserve off gross before distributable pool
const OPERATING_RESERVE_PCT = 0.30;

// ── Money In categories ───────────────────────────────────────────────────────
const MONEY_IN_CATEGORIES  = ["Event Revenue", "Deposit", "Balance Payment", "Retainer", "Other"];
const MONEY_OUT_CATEGORIES = ["Contractor Pay", "Venue / Logistics", "Equipment", "Software / Tools", "Operating Reserve Transfer", "Owner Draw", "Other"];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ padding: "16px 20px", borderRadius: 12, background: "#fff", border: `1px solid ${theme.border}`, flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || theme.primary }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function PlatformCard({ id }) {
  const p = PLATFORMS[id];
  return (
    <div style={{ padding: "16px 20px", borderRadius: 12, border: `1.5px solid ${p.border}`, background: p.bg, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 18 }}>{p.icon}</span>
          <div style={{ fontSize: 14, fontWeight: 700, color: p.color }}>{p.label}</div>
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted }}>{p.note}</div>
      </div>
      <a href={p.url} target="_blank" rel="noreferrer" style={{
        padding: "7px 16px", borderRadius: 8, background: p.color, color: "#fff",
        fontWeight: 700, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap",
        fontFamily: "'DM Sans', sans-serif",
      }}>Open ↗</a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Money In/Out Ledger
// ─────────────────────────────────────────────────────────────────────────────

function LedgerSection({ activeUser }) {
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [adding,     setAdding]     = useState(null); // "in" | "out" | null
  const [saving,     setSaving]     = useState(false);
  const [filterType, setFilterType] = useState("all"); // "all" | "in" | "out"
  const [draft, setDraft] = useState({
    type: "in", amount: "", category: "", description: "", event: "", date: "",
  });

  useEffect(() => { loadEntries(); }, []);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "money_ledger"), orderBy("date", "desc")));
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("Ledger load error:", e); }
    setLoading(false);
  };

  const openAdd = (type) => {
    setDraft({ type, amount: "", category: "", description: "", event: "", date: new Date().toISOString().slice(0, 10) });
    setAdding(type);
  };

  const saveEntry = async () => {
    if (!draft.amount || !draft.category) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "money_ledger"), {
        ...draft,
        amount:    parseFloat(draft.amount),
        addedBy:   activeUser,
        createdAt: serverTimestamp(),
      });
      await loadEntries();
      setAdding(null);
    } catch (e) { console.error("Save entry error:", e); }
    setSaving(false);
  };

  const deleteEntry = async (id) => {
    await deleteDoc(doc(db, "money_ledger", id));
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const filtered = filterType === "all" ? entries : entries.filter(e => e.type === filterType);
  const totalIn  = entries.filter(e => e.type === "in").reduce((s, e)  => s + (e.amount || 0), 0);
  const totalOut = entries.filter(e => e.type === "out").reduce((s, e) => s + (e.amount || 0), 0);
  const net      = totalIn - totalOut;

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Total In"  value={`$${totalIn.toLocaleString()}`}  color="#2d7a46" />
        <StatCard label="Total Out" value={`$${totalOut.toLocaleString()}`} color={theme.danger} />
        <StatCard label="Net"       value={`$${net.toLocaleString()}`}      color={net >= 0 ? "#2d7a46" : theme.danger} />
      </div>

      <Card>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["all","in","out"].map(f => (
              <button key={f} onClick={() => setFilterType(f)} style={{
                padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: filterType === f ? theme.primary : "transparent",
                color: filterType === f ? "#fff" : theme.textMuted,
                border: `1px solid ${filterType === f ? theme.primary : theme.border}`,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {f === "all" ? "All" : f === "in" ? "Money In" : "Money Out"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => openAdd("in")} style={{
              padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              background: "#2d7a46", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            }}>+ Money In</button>
            <button onClick={() => openAdd("out")} style={{
              padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              background: theme.danger || "#C0392B", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            }}>+ Money Out</button>
          </div>
        </div>

        {/* Add form */}
        {adding && (
          <div style={{
            padding: "16px", borderRadius: 10, marginBottom: 16,
            background: adding === "in" ? "rgba(45,122,70,0.06)" : "rgba(192,57,43,0.06)",
            border: `1px solid ${adding === "in" ? "rgba(45,122,70,0.25)" : "rgba(192,57,43,0.25)"}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: adding === "in" ? "#2d7a46" : "#C0392B", marginBottom: 12 }}>
              {adding === "in" ? "Record Money In" : "Record Money Out"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Amount ($) *</label>
                <input type="number" value={draft.amount} onChange={e => setDraft(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Category *</label>
                <select value={draft.category} onChange={e => setDraft(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
                  <option value="">— Select —</option>
                  {(adding === "in" ? MONEY_IN_CATEGORIES : MONEY_OUT_CATEGORIES).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={draft.date} onChange={e => setDraft(p => ({ ...p, date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Event (optional)</label>
                <input value={draft.event} onChange={e => setDraft(p => ({ ...p, event: e.target.value }))}
                  placeholder="Event name" style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Description</label>
                <input value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))}
                  placeholder="Notes..." style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveEntry} disabled={saving || !draft.amount || !draft.category} style={{
                padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
                background: theme.primary, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                opacity: saving || !draft.amount || !draft.category ? 0.5 : 1,
              }}>{saving ? "Saving…" : "Save"}</button>
              <button onClick={() => setAdding(null)} style={{
                padding: "7px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, cursor: "pointer",
                background: "transparent", color: theme.textMuted, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
              }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Ledger table */}
        {loading ? <Spinner size={20} /> : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.textMuted, padding: "20px 0", textAlign: "center" }}>
            No entries yet. Add money in or out above.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                {["Date", "Type", "Category", "Description", "Event", "Amount", ""].map(h => (
                  <th key={h} style={{ padding: "6px 10px 8px 0", textAlign: "left", fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={e.id} style={{ borderBottom: `1px solid ${theme.border}`, background: i % 2 === 0 ? "#fff" : theme.background }}>
                  <td style={{ padding: "9px 10px 9px 0", color: theme.textMuted, fontSize: 12 }}>{e.date || "—"}</td>
                  <td style={{ padding: "9px 10px 9px 0" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                      background: e.type === "in" ? "rgba(45,122,70,0.1)" : "rgba(192,57,43,0.1)",
                      color: e.type === "in" ? "#2d7a46" : "#C0392B",
                    }}>{e.type === "in" ? "IN" : "OUT"}</span>
                  </td>
                  <td style={{ padding: "9px 10px 9px 0", color: theme.text }}>{e.category || "—"}</td>
                  <td style={{ padding: "9px 10px 9px 0", color: theme.textMuted, fontSize: 12 }}>{e.description || "—"}</td>
                  <td style={{ padding: "9px 10px 9px 0", color: theme.textMuted, fontSize: 12 }}>{e.event || "—"}</td>
                  <td style={{ padding: "9px 10px 9px 0", fontWeight: 700, color: e.type === "in" ? "#2d7a46" : "#C0392B" }}>
                    {e.type === "in" ? "+" : "−"}${Number(e.amount || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "9px 0" }}>
                    <button onClick={() => deleteEntry(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: theme.textMuted, fontSize: 14, padding: "0 4px" }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice Tracker — reads from mm_documents
// ─────────────────────────────────────────────────────────────────────────────

function InvoiceTracker() {
  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, "mm_documents"), orderBy("createdAt", "desc"))
        );
        const inv = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => d.docType === "invoice");
        setInvoices(inv);
      } catch (e) { console.error("Invoice load error:", e); }
      setLoading(false);
    };
    load();
  }, []);

  const STATUS_COLORS = {
    draft:    { bg: "rgba(107,114,128,0.1)", color: "#6B7280" },
    sent:     { bg: "rgba(37,99,235,0.1)",   color: "#2563EB" },
    signed:   { bg: "rgba(45,122,70,0.12)",  color: "#2d7a46" },
    paid:     { bg: "rgba(45,122,70,0.15)",  color: "#2d7a46" },
    overdue:  { bg: "rgba(192,57,43,0.1)",   color: "#C0392B" },
  };

  const totalIssued = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const totalPaid   = invoices.filter(i => i.status === "paid" || i.bothSigned).reduce((s, i) => s + (i.amount || 0), 0);
  const outstanding = totalIssued - totalPaid;

  if (loading) return <Spinner size={20} />;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Issued"      value={`$${totalIssued.toLocaleString()}`}   />
        <StatCard label="Collected"   value={`$${totalPaid.toLocaleString()}`}     color="#2d7a46" />
        <StatCard label="Outstanding" value={`$${outstanding.toLocaleString()}`}   color={outstanding > 0 ? "#D97706" : "#2d7a46"} />
      </div>
      <Card>
        {invoices.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.textMuted, padding: "20px 0", textAlign: "center" }}>
            No invoices generated yet. Use the Document Generator to create invoices.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                {["Client / Event", "Generated", "Status", "Amount", "Square Link", "Signed Copy"].map(h => (
                  <th key={h} style={{ padding: "6px 10px 8px 0", textAlign: "left", fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => {
                const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.draft;
                return (
                  <tr key={inv.id} style={{ borderBottom: `1px solid ${theme.border}`, background: i % 2 === 0 ? "#fff" : theme.background }}>
                    <td style={{ padding: "10px 10px 10px 0" }}>
                      <div style={{ fontWeight: 600, color: theme.text }}>{inv.contextName || inv.counterpartyName || "—"}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted }}>{inv.fileName || inv.name || ""}</div>
                    </td>
                    <td style={{ padding: "10px 10px 10px 0", color: theme.textMuted, fontSize: 12 }}>
                      {inv.createdAt?.toDate?.()?.toLocaleDateString?.() || "—"}
                    </td>
                    <td style={{ padding: "10px 10px 10px 0" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: sc.bg, color: sc.color }}>
                        {inv.bothSigned ? "Signed" : inv.status || "Draft"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 10px 10px 0", fontWeight: 700, color: theme.primary }}>
                      {inv.amount ? `$${Number(inv.amount).toLocaleString()}` : "—"}
                    </td>
                    <td style={{ padding: "10px 10px 10px 0" }}>
                      {inv.squarePaymentUrl ? (
                        <a href={inv.squarePaymentUrl} target="_blank" rel="noreferrer"
                          style={{ fontSize: 12, color: "#000", fontWeight: 700, textDecoration: "none" }}>
                          Pay via Square ↗
                        </a>
                      ) : (
                        <span style={{ fontSize: 11, color: theme.textMuted }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 0" }}>
                      {inv.signedDocumentUrl ? (
                        <a href={inv.signedDocumentUrl} target="_blank" rel="noreferrer"
                          style={{ fontSize: 12, color: "#2d7a46", fontWeight: 700, textDecoration: "none" }}>
                          ↓ Download
                        </a>
                      ) : inv.url ? (
                        <a href={inv.url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 12, color: theme.primary, fontWeight: 700, textDecoration: "none" }}>
                          ↓ Draft
                        </a>
                      ) : <span style={{ fontSize: 11, color: theme.textMuted }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Distribution Calculator
// ─────────────────────────────────────────────────────────────────────────────

function DistributionCalculator() {
  const [gross, setGross] = useState("");

  const grossNum   = parseFloat(String(gross).replace(/[^0-9.]/g, "")) || 0;
  const reserve    = grossNum * OPERATING_RESERVE_PCT;
  const pool       = grossNum - reserve;
  const splits     = Object.entries(SPLITS).map(([name, pct]) => ({
    name, pct, amount: pool * pct,
  }));

  return (
    <Card>
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 4 }}>Event Distribution Calculator</div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16 }}>
        Enter gross event revenue to see the 30% reserve split and 40/40/20 distribution.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: theme.textMuted, fontSize: 14 }}>$</span>
          <input
            type="number"
            value={gross}
            onChange={e => setGross(e.target.value)}
            placeholder="0"
            style={{ ...inputStyle, paddingLeft: 24, width: 180 }}
          />
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted }}>gross event revenue</div>
      </div>

      {grossNum > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Reserve */}
          <div style={{
            padding: "12px 16px", borderRadius: 10,
            background: "rgba(235,199,100,0.1)", border: "1px solid rgba(235,199,100,0.3)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#8a6800" }}>Operating Reserve (30%)</div>
              <div style={{ fontSize: 11, color: theme.textMuted }}>Reinvestment, emergency fund, overhead</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#8a6800" }}>${reserve.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>

          {/* Distributable pool */}
          <div style={{
            padding: "10px 16px", borderRadius: 10,
            background: "rgba(28,74,54,0.06)", border: "1px solid rgba(28,74,54,0.15)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.primary }}>Distributable Pool (70%)</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.primary }}>${pool.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>

          {/* Individual splits */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {splits.map(({ name, pct, amount }) => (
              <div key={name} style={{
                flex: 1, minWidth: 120, padding: "12px 16px", borderRadius: 10,
                background: "#fff", border: `1px solid ${theme.border}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{name}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: theme.primary }}>${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>{(pct * 100).toFixed(0)}% of pool</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
            Owner draws (Ash/Mikal quarterly profit split) are separate and processed as LLC distributions from Relay.
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Contractor Payout Summary
// ─────────────────────────────────────────────────────────────────────────────

function ContractorPayouts() {
  const [events,         setEvents]         = useState([]);
  const [selectedEvent,  setSelectedEvent]  = useState("");
  const [contractors,    setContractors]    = useState([]);
  const [loadingPayout,  setLoadingPayout]  = useState(false);
  const [eventsLoading,  setEventsLoading]  = useState(true);

  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "events"));
      setEvents(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(e => e.status !== "archived")
          .sort((a, b) => (b.event_date || "").localeCompare(a.event_date || ""))
      );
      setEventsLoading(false);
    };
    load();
  }, []);

  const loadContractors = async (eventId) => {
    setSelectedEvent(eventId);
    if (!eventId) { setContractors([]); return; }
    setLoadingPayout(true);
    const snap = await getDocs(collection(db, "events", eventId, "roster"));
    const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setContractors(all.filter(r => r.type === "contractor"));
    setLoadingPayout(false);
  };

  const totalPayout = contractors.reduce((sum, c) => {
    return sum + (parseFloat(String(c.rate || "0").replace(/[^0-9.]/g, "")) || 0);
  }, 0);

  const selectedEventName = events.find(e => e.id === selectedEvent)?.event_nickname
    || events.find(e => e.id === selectedEvent)?.name || "";

  return (
    <Card>
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 4 }}>Contractor Payout Reference</div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16 }}>
        Select an event to review contractor rates before processing in Gusto.
      </div>
      {eventsLoading ? <Spinner size={20} /> : (
        <select value={selectedEvent} onChange={e => loadContractors(e.target.value)} style={{ ...inputStyle, maxWidth: 400, marginBottom: 20 }}>
          <option value="">— Select an event —</option>
          {events.map(e => (
            <option key={e.id} value={e.id}>{e.event_nickname || e.name} {e.event_date ? `· ${e.event_date}` : ""}</option>
          ))}
        </select>
      )}

      {loadingPayout && <Spinner size={20} />}

      {!loadingPayout && selectedEvent && contractors.length === 0 && (
        <div style={{ fontSize: 13, color: theme.textMuted }}>No contractors on roster for this event.</div>
      )}

      {!loadingPayout && contractors.length > 0 && (
        <>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px", borderRadius: 8, background: theme.background,
            border: `1px solid ${theme.border}`, marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, color: theme.textMuted }}>
              <span style={{ fontWeight: 700, color: theme.text }}>{contractors.length}</span> contractor{contractors.length !== 1 ? "s" : ""} · {selectedEventName}
            </div>
            <div>
              <span style={{ fontSize: 11, color: theme.textMuted, marginRight: 6 }}>Est. Total Payout</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: theme.primary }}>
                {totalPayout > 0 ? `$${totalPayout.toLocaleString()}` : "—"}
              </span>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                {["Name", "Role", "Engagement Window", "Rate", "Status"].map(h => (
                  <th key={h} style={{ padding: "6px 10px 8px 0", textAlign: "left", fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contractors.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${theme.border}`, background: i % 2 === 0 ? "#fff" : theme.background }}>
                  <td style={{ padding: "10px 10px 10px 0", fontWeight: 600, color: theme.text }}>{c.name || "—"}</td>
                  <td style={{ padding: "10px 10px 10px 0", color: theme.textMuted }}>{c.role || "—"}</td>
                  <td style={{ padding: "10px 10px 10px 0", color: theme.textMuted, fontSize: 12 }}>{c.engagement_window || "—"}</td>
                  <td style={{ padding: "10px 10px 10px 0", fontWeight: 700, color: c.rate ? theme.primary : theme.textMuted }}>
                    {c.rate || <span style={{ fontStyle: "italic", fontWeight: 400 }}>Not set</span>}
                  </td>
                  <td style={{ padding: "10px 0" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                      background: c.checked_in ? "rgba(45,122,70,0.1)" : "rgba(150,150,150,0.1)",
                      color: c.checked_in ? "#2d7a46" : theme.textMuted,
                    }}>{c.checked_in ? "Checked In" : "Not Checked In"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Process payouts in Gusto using this list as reference.</div>
            <a href={PLATFORMS.gusto.url} target="_blank" rel="noreferrer" style={{
              padding: "7px 16px", borderRadius: 8, background: "#F45F42", color: "#fff",
              fontWeight: 700, fontSize: 12, textDecoration: "none", fontFamily: "'DM Sans', sans-serif",
            }}>Open Gusto ↗</a>
          </div>
        </>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus Metric Widget — Shanell's closing rate view (no dollar amounts)
// ─────────────────────────────────────────────────────────────────────────────

function BonusMetricWidget() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, "pipeline"));
        const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Current quarter bounds
        const now   = new Date();
        const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        const qEnd   = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);

        const inRange = (item) => {
          const ts = item.created_at?.toDate?.() || item.createdAt?.toDate?.();
          if (!ts) return false;
          return ts >= qStart && ts <= qEnd;
        };

        const thisQ   = all.filter(inRange);
        const closed  = thisQ.filter(i => i.stage === "active");
        const declined = thisQ.filter(i => i.stage === "declined");
        const inProgress = thisQ.filter(i => !["active","declined"].includes(i.stage));

        setStats({
          total:      thisQ.length,
          closed:     closed.length,
          declined:   declined.length,
          inProgress: inProgress.length,
          rate:       thisQ.length > 0 ? Math.round((closed.length / thisQ.length) * 100) : 0,
          quarter:    `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
        });
      } catch (e) {
        console.error("Bonus metric load error:", e);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <Card><Spinner size={20} /></Card>;
  if (!stats)  return null;

  return (
    <Card>
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 2 }}>
        Client Closing Rate — {stats.quarter}
      </div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 20 }}>
        Your bonus is tied to engagement closing rate. Here's where things stand this quarter.
      </div>

      {/* Rate dial */}
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{
          width: 90, height: 90, borderRadius: "50%", flexShrink: 0,
          background: `conic-gradient(${theme.primary} ${stats.rate * 3.6}deg, ${theme.border} 0deg)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "inset 0 0 0 14px #fff",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.primary }}>{stats.rate}%</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "Total Leads",   value: stats.total,      color: theme.text    },
            { label: "Closed",        value: stats.closed,     color: "#2d7a46"     },
            { label: "In Progress",   value: stats.inProgress, color: "#D97706"     },
            { label: "Declined",      value: stats.declined,   color: theme.textMuted },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color, minWidth: 20, textAlign: "right" }}>{value}</div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        padding: "10px 14px", borderRadius: 8,
        background: stats.rate >= 50 ? "rgba(45,122,70,0.07)" : "rgba(235,199,100,0.1)",
        border: `1px solid ${stats.rate >= 50 ? "rgba(45,122,70,0.2)" : "rgba(235,199,100,0.3)"}`,
        fontSize: 12,
        color: stats.rate >= 50 ? "#2d7a46" : "#8a6800",
      }}>
        {stats.rate >= 70
          ? "Strong quarter — closing rate is above target."
          : stats.rate >= 50
            ? "On track. Keep pushing on open leads."
            : "Below 50% close rate. Review open leads and follow up."}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Finance Component
// ─────────────────────────────────────────────────────────────────────────────

const FOUNDER_TABS = [
  { key: "overview",      label: "Overview"       },
  { key: "ledger",        label: "Money In/Out"   },
  { key: "invoices",      label: "Invoices"       },
  { key: "payouts",       label: "Contractor Pay" },
  { key: "distributions", label: "Distributions"  },
];

const OPS_TABS = [
  { key: "overview", label: "Overview"       },
  { key: "payouts",  label: "Contractor Pay" },
];

const FOUNDERS = ["Ashley", "Mikal"];

export default function Finance() {
  const { activeUser } = useAuth();
  const isFounder  = FOUNDERS.some(f => (activeUser || "").includes(f));
  const TABS       = isFounder ? FOUNDER_TABS : OPS_TABS;
  const [activeTab, setActiveTab] = useState("overview");

  // If active tab isn't available for this role, reset to overview
  const visibleTab = TABS.find(t => t.key === activeTab) ? activeTab : "overview";

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'DM Sans', sans-serif", maxWidth: 960 }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Finance</h1>
        <div style={{ fontSize: 13, color: theme.textMuted }}>
          {isFounder ? "Revenue tracking, payouts, invoices, and distributions" : "Contractor payouts and platform access"}
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${theme.border}` }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
            background: visibleTab === t.key ? "#fff" : "transparent",
            color: visibleTab === t.key ? theme.primary : theme.textMuted,
            fontSize: 13, fontWeight: visibleTab === t.key ? 700 : 500,
            fontFamily: "'DM Sans', sans-serif",
            borderBottom: visibleTab === t.key ? `2px solid ${theme.primary}` : "2px solid transparent",
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── FOUNDER Overview ──────────────────────────────────────────────── */}
      {visibleTab === "overview" && isFounder && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div>
            <SectionLabel>Platforms</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.keys(PLATFORMS).map(id => <PlatformCard key={id} id={id} />)}
            </div>
          </div>
          <div>
            <SectionLabel>Quick Actions</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {[
                { label: "Create Square Payment Link", icon: "🔗", url: "https://squareup.com/dashboard/payment-links", note: "Send to client for deposit or balance payment" },
                { label: "Open Relay",                 icon: "🏦", url: "https://relayfi.com",                         note: "Check balances, transfers, operating reserve" },
                { label: "Process Contractor Pay",     icon: "💸", url: "https://app.gusto.com",                       note: "Run payroll for event contractors in Gusto" },
                { label: "Generate Invoice",           icon: "📄", url: "/document-generator",                         note: "Create M&M invoice in Document Generator", internal: true },
              ].map(item => (
                <div key={item.label} style={{ padding: "16px", borderRadius: 10, border: `1px solid ${theme.border}`, background: "#fff", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 18 }}>{item.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, flex: 1 }}>{item.note}</div>
                  {item.internal
                    ? <a href={item.url} style={{ fontSize: 11, fontWeight: 700, color: theme.primary, textDecoration: "none", marginTop: 4 }}>Open →</a>
                    : <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 700, color: theme.primary, textDecoration: "none", marginTop: 4 }}>Open ↗</a>
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── OPS Overview (Shanell) ────────────────────────────────────────── */}
      {visibleTab === "overview" && !isFounder && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Relay + Gusto only */}
          <div>
            <SectionLabel>Platforms</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <PlatformCard id="relay" />
              <PlatformCard id="gusto" />
            </div>
          </div>
          {/* Bonus metric */}
          <div>
            <SectionLabel>Your Performance This Quarter</SectionLabel>
            <BonusMetricWidget />
          </div>
        </div>
      )}

      {/* ── Founder-only tabs ─────────────────────────────────────────────── */}
      {visibleTab === "ledger"   && isFounder && <LedgerSection activeUser={activeUser} />}
      {visibleTab === "invoices" && isFounder && <InvoiceTracker />}

      {/* ── Shared tab ───────────────────────────────────────────────────── */}
      {visibleTab === "payouts" && <ContractorPayouts />}

      {/* ── Founder-only distributions ────────────────────────────────────── */}
      {visibleTab === "distributions" && isFounder && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DistributionCalculator />
          <Card>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 8 }}>Owner Draws</div>
            <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.7 }}>
              Quarterly profit distributions for Ashley and Mikal (50/50) are processed as LLC member draws directly from Relay — not through Gusto. Log them in the Money In/Out ledger under <strong>Owner Draw</strong> for record keeping.
            </div>
            <div style={{ marginTop: 12 }}>
              <a href="https://relayfi.com" target="_blank" rel="noreferrer" style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px",
                borderRadius: 8, background: theme.primary, color: "#fff",
                fontSize: 12, fontWeight: 700, textDecoration: "none", fontFamily: "'DM Sans', sans-serif",
              }}>Open Relay ↗</a>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const labelStyle = {
  display: "block", fontSize: 10, fontWeight: 700, color: "#6B7280",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5,
};

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#1A1A1A",
  fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
};