import { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { theme } from "../../theme";

const STATUS_COLORS = {
  pending:  { bg: "rgba(255,200,60,0.12)",  color: "#d4a800", label: "Pending" },
  active:   { bg: "rgba(100,200,100,0.12)", color: "#6dbf6d", label: "Active" },
  closed:   { bg: "rgba(150,150,150,0.12)", color: "#aaaaaa", label: "Closed" },
};

export default function PricingLog() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const fetchRuns = async () => {
    try {
      const snap = await getDocs(query(collection(db, "pricing_log"), orderBy("created_at", "desc")));
      setRuns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRuns(); }, []);

  const updateStatus = async (id, status) => {
    await updateDoc(doc(db, "pricing_log", id), { status });
    // When closing a run, stamp pricing summary onto the event doc for post-event access
    if (status === "closed") {
      const run = runs.find(r => r.id === id);
      if (run?.event_id) {
        try {
          await updateDoc(doc(db, "events", run.event_id), {
            pricing_summary: {
              final_price:         run.final_price,
              tier:                run.tier,
              pillar:              run.pillar,
              engine:              run.engine,
              vri_band:            run.vri_band || null,
              wrr_band:            run.wrr_band || null,
              reserve_level:       run.reserve_level || null,
              reserve_amount:      run.reserve_amount || null,
              labor_cost:          run.projected_labor_cost || null,
              cimi_avg:            run.cimi_avg || null,
              maturity_band:       run.maturity_band || null,
              retainer_band:       run.retainer_band_label || null,
              monthly_rate:        run.monthly_rate || null,
              add_on_total:        run.add_on_total || null,
              escalator_mult:      run.escalator_mult || null,
              discount_type:       run.discount_type || null,
              discount_pct:        run.discount_pct || null,
              operator:            run.operator,
              pricing_log_id:      id,
              closed_at:           new Date().toISOString(),
            }
          });
        } catch (e) {
          console.error("Could not stamp pricing summary on event:", e);
        }
      }
    }
    setRuns(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const filtered = filter === "all" ? runs : runs.filter(r => r.status === filter);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.onSurface }}>Pricing Log</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: theme.onSurface + "60" }}>
            Auto-logged on submission. Read-only — status updates only.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "pending", "active", "closed"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px", borderRadius: 6, border: `1px solid ${filter === f ? theme.accent : theme.primaryDark}`,
                background: filter === f ? theme.accent + "15" : "transparent",
                color: filter === f ? theme.accent : theme.onSurface + "70",
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                textTransform: "capitalize",
              }}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: theme.onSurface + "60", fontSize: 13, padding: 20 }}>Loading log...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: theme.onSurface + "60", fontSize: 13, padding: 20 }}>No entries found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(run => (
            <LogEntry
              key={run.id}
              run={run}
              expanded={expanded === run.id}
              onToggle={() => setExpanded(expanded === run.id ? null : run.id)}
              onStatusChange={(status) => updateStatus(run.id, status)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LogEntry({ run, expanded, onToggle, onStatusChange }) {
  const st = STATUS_COLORS[run.status] || STATUS_COLORS.pending;
  const isAdvisory = run.engine === "advisory";
  const ts = run.created_at?.toDate?.()?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) || "—";

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${theme.primaryDark}`, background: theme.surface, overflow: "hidden" }}>
      {/* Header row */}
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: theme.onSurface }}>{run.event_name}</span>
            {run.client && <span style={{ fontSize: 12, color: theme.onSurface + "60" }}>{run.client}</span>}
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
              background: isAdvisory ? "rgba(180,100,255,0.15)" : theme.accent + "20",
              color: isAdvisory ? "#c080ff" : theme.accent,
            }}>
              {run.pillar} · {isAdvisory ? "Advisory" : "Tier"} Engine
            </span>
            {run.tier_override && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(255,100,100,0.12)", color: "#e07070" }}>
                Override
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: theme.onSurface + "60" }}>
            {ts} · Operator: {run.operator}
            {isAdvisory
              ? ` · CIMI ${run.cimi_avg} · ${run.maturity_band} · ${run.retainer_band_label}`
              : ` · ${run.tier} · $${run.final_price?.toLocaleString()}`
            }
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: st.bg, color: st.color }}>
            {st.label}
          </span>
          <span style={{ fontSize: 14, color: theme.accent + "80", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${theme.primaryDark}`, padding: "16px 18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {isAdvisory ? (
              <>
                <Detail label="CIMI Average" value={run.cimi_avg} />
                <Detail label="Maturity Band" value={run.maturity_band} />
                <Detail label="Phase" value={run.phase_confirmed} />
                <Detail label="Retainer Band" value={`${run.retainer_band_label} — $${run.monthly_rate?.toLocaleString()}/mo`} />
                {run.diagnostic_fee > 0 && <Detail label="Diagnostic Fee" value={`$${run.diagnostic_fee?.toLocaleString()}`} />}
                <Detail label="P4 Tier" value={run.p4_tier} />
                {run.is_hybrid && <Detail label="Hybrid Execution" value={`${run.hybrid_pillar} — $${run.hybrid_price?.toLocaleString()}`} />}
              </>
            ) : (
              <>
                <Detail label="Tier" value={`${run.tier}${run.tier_override ? " (override)" : ""}`} />
                <Detail label="Attendees" value={run.attendee_count} />
                <Detail label="Complexity Score" value={`${run.complexity_score} — ${run.complexity_adj}`} />
                {run.cimi_scored && <Detail label="CIMI Average" value={run.cimi_avg} />}
                {run.escalators?.length > 0 && <Detail label="Escalators" value={`${run.escalator_mult?.toFixed(4)}×`} />}
                {run.add_on_total > 0 && <Detail label="Add-Ons Total" value={`$${run.add_on_total?.toLocaleString()}`} />}
                {run.discount_type !== "none" && run.discount_pct > 0 && <Detail label="Discount" value={`${run.discount_pct?.toFixed(0)}% (${run.discount_type})`} />}
                <Detail label="Final Price" value={`$${run.final_price?.toLocaleString()}`} />
                <Detail label="Floor Check" value={run.floor_check} highlight={run.floor_check === "OK" ? "green" : "red"} />
              </>
            )}
            {run.tier_override && (
              <>
                <Detail label="Override by" value={run.override_founder} />
                <Detail label="Override Rationale" value={run.override_rationale} />
              </>
            )}
          </div>

          {/* Status update */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, borderTop: `1px solid ${theme.primaryDark}` }}>
            <span style={{ fontSize: 12, color: theme.onSurface + "60", fontWeight: 600 }}>Update Status:</span>
            {["pending", "active", "closed"].map(s => (
              <button key={s} onClick={() => onStatusChange(s)}
                style={{
                  padding: "5px 12px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${run.status === s ? STATUS_COLORS[s].color : theme.primaryDark}`,
                  background: run.status === s ? STATUS_COLORS[s].bg : "transparent",
                  color: run.status === s ? STATUS_COLORS[s].color : theme.onSurface + "60",
                  fontFamily: "'DM Sans', sans-serif", textTransform: "capitalize",
                }}>{s}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, highlight }) {
  const color = highlight === "green" ? "#6dbf6d" : highlight === "red" ? "#e07070" : theme.onSurface;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.onSurface + "50", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color }}>{value || "—"}</div>
    </div>
  );
}