import { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { useSearchParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import TierEngine from "../components/pricing/TierEngine";
import AdvisoryEngine from "../components/pricing/AdvisoryEngine";
import PricingLog from "../components/pricing/PricingLog";
import { theme } from "../theme";

const TABS = ["New Quote", "Pricing Log"];

function makeHybridGroupId() {
  return `hybrid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function Pricing() {
  const { activeUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const pipelineId = searchParams.get("pipeline_id");
  const returnTo = searchParams.get("return_to"); // "pipeline" — signals to go back after submit

  const [tab, setTab] = useState("New Quote");
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [pillar, setPillar] = useState(null);
  // Which P1/P2/P3 pairs with the P4 retainer when pillar === "HYBRID". Only relevant then.
  const [hybridExecutionPillar, setHybridExecutionPillar] = useState("P1");
  const [engineStep, setEngineStep] = useState("select"); // select | configure | tier | advisory
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [pipelineRecord, setPipelineRecord] = useState(null);

  // Hybrid flow state: the completed Tier Engine run (execution component) gets handed here
  // once logged, then passed into AdvisoryEngine as read-only data — no manual re-entry.
  const [hybridGroupId, setHybridGroupId] = useState(null);
  const [hybridExecutionResult, setHybridExecutionResult] = useState(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const snap = await getDocs(collection(db, "events"));
        const evts = snap.docs
          .map(d => {
            const data = d.data();
            // Normalize: some event docs use "name", some use "event_name"
            return {
              id: d.id,
              ...data,
              name: data.name || data.event_name || "",
            };
          })
          .filter(e => e.name)
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEvents(evts);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingEvents(false);
      }
    };
    fetchEvents();
  }, []);

  // If launched from Pipeline, auto-load the pipeline record and skip event selection
  useEffect(() => {
    if (!pipelineId) return;
    const fetchPipeline = async () => {
      try {
        const snap = await getDoc(doc(db, "pipeline", pipelineId));
        if (!snap.exists()) return;
        const data = { id: snap.id, ...snap.data() };
        setPipelineRecord(data);
        // Build a synthetic event object from pipeline data
        const sd = data.stage_data || {};
        const syntheticEvent = {
          id: data.id,
          name: data.event_name || data.org_name || "Pipeline Event",
          client: data.org_name || data.organization || "",
          attendee_count: sd.disc_attendance || sd.qual_est_attendance || "",
          location: sd.disc_location || "",
          event_date: sd.disc_confirmed_date || sd.qual_est_date || "",
          pillar: sd.disc_pillar || sd.qual_pillar_hypothesis || "P1",
          _from_pipeline: true,
          _pipeline_id: pipelineId,
        };
        setSelectedEvent(syntheticEvent);
        const p = syntheticEvent.pillar;
        setPillar(p === "P4" ? "P4" : p === "HYBRID" ? "HYBRID" : p || "P1");
        setEngineStep("configure");
      } catch (e) {
        console.error(e);
      }
    };
    fetchPipeline();
  }, [pipelineId]);

  const handleEventSelect = (evt) => {
    setSelectedEvent(evt);
    // Auto-detect pillar from event doc if available
    if (evt.pillar) {
      const p = evt.pillar.toLowerCase();
      if (p.includes("4")) setPillar("P4");
      else setPillar("P1");
    } else {
      setPillar(null);
    }
    setEngineStep("configure");
  };

  // Previously: pillar picked here was never actually passed into TierEngine, which instead
  // silently read event?.pillar (a different, often-stale source). And "HYBRID" fell through
  // to the same branch as P1/P2/P3 — it never reached AdvisoryEngine at all. Both fixed below.
  const handleStartEngine = () => {
    if (!pillar) return;
    setHybridExecutionResult(null);
    if (pillar === "P4") {
      setHybridGroupId(null);
      setEngineStep("advisory");
    } else if (pillar === "HYBRID") {
      setHybridGroupId(makeHybridGroupId());
      setEngineStep("tier"); // execution component runs first; Advisory follows once it's logged
    } else {
      setHybridGroupId(null);
      setEngineStep("tier");
    }
  };

  const handleReset = () => {
    setSelectedEvent(null);
    setPillar(null);
    setHybridExecutionPillar("P1");
    setHybridGroupId(null);
    setHybridExecutionResult(null);
    setEngineStep("select");
  };

  const handleComplete = () => {
    if (returnTo === "pipeline" && pipelineId) {
      navigate(`/pipeline?highlight=${pipelineId}&priced=1`);
    } else {
      setTab("Pricing Log");
      handleReset();
    }
  };

  // Called by TierEngine when it finishes logging the execution component of a Hybrid
  // engagement. Hands the real, already-logged result straight into AdvisoryEngine.
  const handleHybridTierComplete = (result) => {
    setHybridExecutionResult(result);
    setEngineStep("advisory");
  };

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
          M&M Operations
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: theme.onBackground, fontFamily: "'Playfair Display', serif" }}>
              Pricing
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.onSurface + "99" }}>
              Founders + Senior Ops only — every quote requires a complete engine run
            </p>
          </div>
          <div style={{ fontSize: 11, color: theme.onSurface + "60", fontWeight: 600 }}>
            {activeUser && `Operator: ${activeUser}`}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${theme.primaryDark}` }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === "New Quote") handleReset(); }}
            style={{
              padding: "8px 18px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: "transparent", fontFamily: "'DM Sans', sans-serif",
              color: tab === t ? theme.accent : theme.onSurface + "70",
              borderBottom: tab === t ? `2px solid ${theme.accent}` : "2px solid transparent",
              marginBottom: -1, transition: "all 0.15s",
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "New Quote" && (
        <>
          {engineStep === "select" && (
            <EventSelector
              events={events}
              loading={loadingEvents}
              onSelect={handleEventSelect}
            />
          )}
          {engineStep === "configure" && selectedEvent && (
            <PillarConfigurator
              event={selectedEvent}
              pillar={pillar}
              setPillar={setPillar}
              hybridExecutionPillar={hybridExecutionPillar}
              setHybridExecutionPillar={setHybridExecutionPillar}
              onStart={handleStartEngine}
              onBack={handleReset}
            />
          )}
          {engineStep === "tier" && (
            <TierEngine
              event={selectedEvent}
              operator={activeUser}
              pipelineId={pipelineId}
              initialPillar={pillar === "HYBRID" ? hybridExecutionPillar : pillar}
              hybridMode={pillar === "HYBRID"}
              hybridGroupId={hybridGroupId}
              onHybridComplete={handleHybridTierComplete}
              onComplete={handleComplete}
              onBack={() => setEngineStep("configure")}
            />
          )}
          {engineStep === "advisory" && (
            <AdvisoryEngine
              event={selectedEvent}
              operator={activeUser}
              pipelineId={pipelineId}
              hybridExecutionResult={hybridExecutionResult}
              hybridGroupId={hybridGroupId}
              onComplete={handleComplete}
              onBack={() => setEngineStep("configure")}
            />
          )}
        </>
      )}
      {tab === "Pricing Log" && <PricingLog />}
    </div>
  );
}

// ─── Event Selector ────────────────────────────────────────────────
function EventSelector({ events, loading, onSelect }) {
  const [search, setSearch] = useState("");
  const filtered = events.filter(e =>
    (e.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (e.client || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <SectionHeader
        title="Select Event"
        sub="Choose the event you're quoting. New pipeline leads should be priced from within Pipeline."
      />
      <input
        placeholder="Search events..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: "100%", padding: "10px 14px", marginBottom: 16, borderRadius: 8,
          border: `1px solid ${theme.primaryDark}`, background: theme.surface,
          color: theme.onSurface, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          boxSizing: "border-box",
        }}
      />
      {loading ? (
        <div style={{ color: theme.onSurface + "60", fontSize: 13, padding: 20 }}>Loading events...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: theme.onSurface + "60", fontSize: 13, padding: 20 }}>No events found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(evt => (
            <EventCard key={evt.id} event={evt} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event, onSelect }) {
  const [hov, setHov] = useState(false);
  const pillarLabel = event.pillar ? `Pillar ${event.pillar.replace("P", "")}` : null;
  const hasPrice = !!event.confirmed_price;

  return (
    <div
      onClick={() => onSelect(event)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "16px 20px", borderRadius: 10, cursor: "pointer",
        border: `1px solid ${hov ? theme.accent + "60" : theme.primaryDark}`,
        background: hov ? theme.accent + "08" : theme.surface,
        transition: "all 0.15s",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: theme.onSurface }}>
            {event.name}
          </span>
          {pillarLabel && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
              background: theme.accent + "20", color: theme.accent, letterSpacing: "0.06em",
            }}>
              {pillarLabel}
            </span>
          )}
          {hasPrice && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
              background: "rgba(100,200,100,0.15)", color: "#6dbf6d", letterSpacing: "0.06em",
            }}>
              Previously Quoted
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: theme.onSurface + "70" }}>
          {[event.client, event.location, event.event_date].filter(Boolean).join(" · ")}
        </div>
      </div>
      <span style={{ fontSize: 18, color: theme.accent + "80" }}>›</span>
    </div>
  );
}

// ─── Pillar Configurator ───────────────────────────────────────────
const PILLARS = [
  { id: "P1", label: "Pillar 1", sub: "Event Execution", desc: "Full-service staffing and on-site operations. M&M runs the floor." },
  { id: "P2", label: "Pillar 2", sub: "Leadership Training", desc: "Training for Team Leads, Ops Leads, and organizational leadership." },
  { id: "P3", label: "Pillar 3", sub: "Co-Execution", desc: "Joint planning and co-execution with a strategic partner." },
  { id: "P4", label: "Pillar 4", sub: "Infrastructure Advisory", desc: "Retainer-based operational infrastructure advisory. Uses the Advisory Engine." },
  { id: "HYBRID", label: "Hybrid", sub: "Pillar 4 + Execution", desc: "Advisory retainer combined with execution or training. Runs both engines." },
];

function PillarConfigurator({ event, pillar, setPillar, hybridExecutionPillar, setHybridExecutionPillar, onStart, onBack }) {
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← Back to event selection</button>

      <div style={{
        padding: "16px 20px", borderRadius: 10, marginBottom: 24,
        background: theme.surface, border: `1px solid ${theme.primaryDark}`,
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
            Selected Event
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.onSurface }}>{event.name}</div>
          <div style={{ fontSize: 12, color: theme.onSurface + "70" }}>
            {[event.client, event.location, event.attendee_count ? `${event.attendee_count} attendees` : null].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>

      <SectionHeader
        title="Select Pillar"
        sub="This determines which pricing engine runs. If the event doc already had a pillar set, it's pre-selected — confirm it's correct."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {PILLARS.map(p => (
          <div
            key={p.id}
            onClick={() => setPillar(p.id)}
            style={{
              padding: "14px 18px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${pillar === p.id ? theme.accent : theme.primaryDark}`,
              background: pillar === p.id ? theme.accent + "10" : theme.surface,
              transition: "all 0.15s", display: "flex", alignItems: "center", gap: 14,
            }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
              border: `2px solid ${pillar === p.id ? theme.accent : theme.onSurface + "40"}`,
              background: pillar === p.id ? theme.accent : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {pillar === p.id && <div style={{ width: 6, height: 6, borderRadius: "50%", background: theme.primary }} />}
            </div>
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.onSurface }}>{p.label}</span>
                <span style={{ fontSize: 12, color: theme.accent, fontWeight: 600 }}>{p.sub}</span>
              </div>
              <div style={{ fontSize: 12, color: theme.onSurface + "70" }}>{p.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {pillar === "HYBRID" && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: theme.onSurface + "80", marginBottom: 8 }}>
            Execution Component (paired with the Pillar 4 retainer)
          </div>
          <select value={hybridExecutionPillar} onChange={e => setHybridExecutionPillar(e.target.value)}
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${theme.primaryDark}`, background: theme.surface,
              color: theme.onSurface, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
              boxSizing: "border-box",
            }}>
            <option value="P1">Pillar 1 — Event Execution</option>
            <option value="P2">Pillar 2 — Leadership Training</option>
            <option value="P3">Pillar 3 — Co-Execution</option>
          </select>
          <div style={{ fontSize: 11, color: theme.onSurface + "50", marginTop: 6 }}>
            You'll run the Tier Engine for this pillar first, then continue straight to the Advisory Engine with that pricing already attached.
          </div>
        </div>
      )}

      {(pillar === "P4" || pillar === "HYBRID") ? (
        <div style={{
          padding: "12px 16px", borderRadius: 8, marginBottom: 20,
          background: theme.accent + "12", border: `1px solid ${theme.accent + "30"}`,
          fontSize: 12, color: theme.onSurface + "90",
        }}>
          <strong style={{ color: theme.accent }}>Advisory Engine</strong> — This pillar requires a completed CIMI diagnostic before any pricing can be issued. Make sure you've had a discovery conversation with this client before proceeding.
        </div>
      ) : null}

      <button
        onClick={onStart}
        disabled={!pillar}
        style={{
          padding: "12px 28px", borderRadius: 8, border: "none", cursor: pillar ? "pointer" : "not-allowed",
          background: pillar ? theme.accent : 'rgba(150,150,150,0.15)',
          color: pillar ? theme.primary : 'rgba(150,150,150,0.5)',
          fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          transition: "all 0.15s",
        }}>
        Start Engine →
      </button>
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────
function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.onSurface }}>{title}</h2>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 12, color: theme.onSurface + "70" }}>{sub}</p>}
    </div>
  );
}

const backBtnStyle = {
  background: "transparent", border: "none", cursor: "pointer",
  fontSize: 12, color: theme.accent, fontWeight: 600, padding: "0 0 16px",
  fontFamily: "'DM Sans', sans-serif",
};