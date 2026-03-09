import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { Card, Button, Spinner, EmptyState } from "../components/UI";

const FOUNDERS = ["Ashley", "Mikal", "Shanell"];

// ── Default library entries ────────────────────────────────────────────────────
// Seeded on first load if library is empty. Drive URLs to be filled in.
const DEFAULT_AGREEMENTS = [
  { name: "Statement of Work (SOW)",             category: "Client Agreements", forWhom: "All clients", description: "Primary client contract defining scope, deliverables, and payment terms.", url: "", platform: "PandaDoc" },
  { name: "Independent Contractor Agreement",    category: "Contractor Agreements", forWhom: "All contractors", description: "Governs the relationship between M&M and any paid contractor.", url: "", platform: "PandaDoc" },
  { name: "Proposal Template",                   category: "Sales", forWhom: "Prospective clients", description: "Standard M&M proposal sent during the sales process.", url: "", platform: "PandaDoc" },
  { name: "Advisory Proposal (P4)",              category: "Sales", forWhom: "P4 prospective clients", description: "Infrastructure advisory-specific proposal.", url: "", platform: "PandaDoc" },
  { name: "Change Order Policy",                 category: "Client Agreements", forWhom: "Active clients", description: "Governs scope changes and out-of-scope requests.", url: "", platform: "PandaDoc" },
  { name: "P3 Joint Execution Agreement",        category: "Client Agreements", forWhom: "P3 clients", description: "Co-execution partnership agreement for Pillar 3 engagements.", url: "", platform: "PandaDoc" },
  { name: "Master Services Agreement (MSA)",     category: "Client Agreements", forWhom: "Repeat clients", description: "Governing agreement for multi-engagement client relationships.", url: "", platform: "PandaDoc" },
  { name: "Tier 0 Engagement Confirmation",      category: "Client Agreements", forWhom: "Tier 0 clients", description: "Lightweight confirmation doc for small internal-team engagements.", url: "", platform: "PandaDoc" },
];

const DEFAULT_DOCUMENTS = [
  { name: "Event Runbook Template",              category: "Operations", description: "Master runbook template for all event types.", url: "" },
  { name: "Run of Show Template",                category: "Operations", description: "Minute-by-minute event timeline template.", url: "" },
  { name: "M&M Incident Response Protocol",      category: "Operations", description: "What to do when an incident occurs on the floor.", url: "" },
  { name: "Technology Failure Runbook",          category: "Operations", description: "Break-glass procedures if Axis goes down on event day.", url: "" },
  { name: "Pillar 1 Framework",                  category: "Pillars", description: "Full P1 Event Execution scope and delivery framework.", url: "" },
  { name: "Pillar 2 Scope Framework",            category: "Pillars", description: "Leadership Training delivery framework and session structure.", url: "" },
  { name: "Pillar 3 Scope Framework",            category: "Pillars", description: "Joint Planning & Co-Execution delivery framework.", url: "" },
  { name: "Pillar 4 Framework",                  category: "Pillars", description: "Infrastructure Advisory diagnostic and delivery framework.", url: "" },
  { name: "Contractor Rate Card",                category: "Internal", description: "M&M contractor rate structure by role.", url: "" },
  { name: "Internal Pricing Reference",          category: "Internal", description: "Pricing engine reference and scoring methodology.", url: "" },
  { name: "Role Documentation",                  category: "Internal", description: "All M&M internal and contractor role definitions.", url: "" },
  { name: "Retention & Upsell Framework",        category: "Internal", description: "How M&M retains clients and expands engagements.", url: "" },
  { name: "First Engagement Framework",          category: "Internal", description: "Intro-tier offerings for each pillar with case study approach.", url: "" },
  { name: "Platform & Tools Directory",          category: "Internal", description: "Every platform M&M uses, purpose, and access info.", url: "" },
  { name: "Volunteer Onboarding Packet",         category: "Templates", description: "Onboarding materials for new volunteers.", url: "" },
  { name: "Contractor Onboarding Packet",        category: "Templates", description: "Onboarding materials for new contractors.", url: "" },
  { name: "Post-Event Client Survey",            category: "Templates", description: "Client satisfaction survey sent after every engagement.", url: "" },
  { name: "Post-Event Volunteer Survey",         category: "Templates", description: "Volunteer feedback survey sent after every event.", url: "" },
  { name: "Post-Event Contractor Survey",        category: "Templates", description: "Contractor feedback survey sent after every engagement.", url: "" },
];

const AGREEMENT_CATEGORIES = ["Client Agreements", "Contractor Agreements", "Sales"];
const DOC_CATEGORIES       = ["Operations", "Pillars", "Internal", "Templates"];
const PLATFORMS            = ["PandaDoc", "Google Drive"];

const inputStyle = (theme) => ({
  padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`,
  fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none",
  color: theme.text, background: "#fff", width: "100%", boxSizing: "border-box",
});

function CategorySection({ category, items, isFounder, onDelete, onEdit, primaryColor, theme }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <button onClick={() => setCollapsed(c => !c)} style={{
        display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
        cursor: "pointer", padding: "0 0 10px", width: "100%", textAlign: "left",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", flex: 1 }}>
          {category} <span style={{ fontWeight: 400 }}>({items.length})</span>
        </div>
        <span style={{ fontSize: 12, color: theme.textMuted }}>{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && items.map(item => (
        <div key={item.id} style={{
          padding: "12px 16px", marginBottom: 8, borderRadius: 10,
          border: `1px solid ${theme.border}`, background: "#fff",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{item.name}</div>
              {item.platform && (
                <span style={{ fontSize: 10, fontWeight: 700, color: item.platform === "PandaDoc" ? "#2d7a46" : "#0F3460",
                  background: item.platform === "PandaDoc" ? "rgba(45,122,70,0.1)" : "rgba(15,52,96,0.1)",
                  padding: "2px 6px", borderRadius: 999 }}>{item.platform}</span>
              )}
              {item.forWhom && (
                <span style={{ fontSize: 10, color: theme.textMuted, background: theme.background, padding: "2px 6px", borderRadius: 999, border: `1px solid ${theme.border}` }}>{item.forWhom}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: item.url ? 8 : 0 }}>{item.description}</div>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" style={{
                fontSize: 12, fontWeight: 700, color: primaryColor, textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>Open Document ↗</a>
            ) : (
              <span style={{ fontSize: 11, color: theme.textMuted, fontStyle: "italic" }}>No URL yet — click Edit to add Drive or PandaDoc link</span>
            )}
          </div>
          {isFounder && (
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} style={{
                padding: "4px 10px", borderRadius: 6, border: `1px solid ${theme.border}`,
                background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
                color: theme.text, fontFamily: "'DM Sans', sans-serif",
              }}>Edit</button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} style={{
                padding: "4px 8px", borderRadius: 6, border: "none",
                background: "none", fontSize: 14, cursor: "pointer", color: theme.textMuted,
              }}>×</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Library() {
  const { activeUser } = useAuth();
  const isFounder = FOUNDERS.includes(activeUser);

  const [activeTab,   setActiveTab]   = useState("agreements");
  const [agreements,  setAgreements]  = useState([]);
  const [documents,   setDocuments]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [showAdd,     setShowAdd]     = useState(false);
  const [editItem,    setEditItem]     = useState(null);
  const [saving,      setSaving]      = useState(false);

  const emptyAgreement = { name: "", category: "Client Agreements", forWhom: "", description: "", url: "", platform: "PandaDoc" };
  const emptyDocument  = { name: "", category: "Operations", description: "", url: "" };
  const [form, setForm] = useState(emptyAgreement);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [aSnap, dSnap] = await Promise.all([
      getDocs(collection(db, "library_agreements")),
      getDocs(collection(db, "library_documents")),
    ]);

    let ag = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    let dc = dSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Seed defaults if empty
    if (ag.length === 0) {
      const refs = await Promise.all(DEFAULT_AGREEMENTS.map(a => addDoc(collection(db, "library_agreements"), a)));
      ag = DEFAULT_AGREEMENTS.map((a, i) => ({ id: refs[i].id, ...a }));
    }
    if (dc.length === 0) {
      const refs = await Promise.all(DEFAULT_DOCUMENTS.map(d => addDoc(collection(db, "library_documents"), d)));
      dc = DEFAULT_DOCUMENTS.map((d, i) => ({ id: refs[i].id, ...d }));
    }

    setAgreements(ag);
    setDocuments(dc);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const coll = activeTab === "agreements" ? "library_agreements" : "library_documents";
    const ref  = await addDoc(collection(db, coll), form);
    const newItem = { id: ref.id, ...form };
    if (activeTab === "agreements") setAgreements(prev => [...prev, newItem]);
    else setDocuments(prev => [...prev, newItem]);
    setForm(activeTab === "agreements" ? emptyAgreement : emptyDocument);
    setShowAdd(false);
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!editItem || !form.name.trim()) return;
    setSaving(true);
    const coll = activeTab === "agreements" ? "library_agreements" : "library_documents";
    await updateDoc(doc(db, coll, editItem.id), form);
    const updater = prev => prev.map(i => i.id === editItem.id ? { ...i, ...form } : i);
    if (activeTab === "agreements") setAgreements(updater);
    else setDocuments(updater);
    setEditItem(null);
    setForm(activeTab === "agreements" ? emptyAgreement : emptyDocument);
    setSaving(false);
  };

  const handleDelete = async (id) => {
    const coll = activeTab === "agreements" ? "library_agreements" : "library_documents";
    await deleteDoc(doc(db, coll, id));
    if (activeTab === "agreements") setAgreements(prev => prev.filter(a => a.id !== id));
    else setDocuments(prev => prev.filter(d => d.id !== id));
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ ...item });
    setShowAdd(false);
    // Scroll to top so the edit form is visible
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelForm = () => {
    setShowAdd(false);
    setEditItem(null);
    setForm(activeTab === "agreements" ? emptyAgreement : emptyDocument);
  };

  const items     = activeTab === "agreements" ? agreements : documents;
  const cats      = activeTab === "agreements" ? AGREEMENT_CATEGORIES : DOC_CATEGORIES;
  const filtered  = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.description?.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase())
  );
  const grouped   = cats.reduce((acc, cat) => {
    acc[cat] = filtered.filter(i => i.category === cat);
    return acc;
  }, {});

  const primaryColor = theme.primary;

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'DM Sans', sans-serif", maxWidth: 960 }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>Library</h1>
          <div style={{ fontSize: 13, color: theme.textMuted }}>Agreements, SOPs, and reference documents</div>
        </div>
        {isFounder && !showAdd && !editItem && (
          <Button size="sm" onClick={() => { setShowAdd(true); setForm(activeTab === "agreements" ? emptyAgreement : emptyDocument); }}>
            + Add {activeTab === "agreements" ? "Agreement" : "Document"}
          </Button>
        )}
      </div>

      {/* Add / Edit form */}
      {(showAdd || editItem) && (
        <Card style={{ marginBottom: 24, border: `1.5px solid ${primaryColor}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 16 }}>
            {editItem ? `Edit — ${editItem.name}` : `Add ${activeTab === "agreements" ? "Agreement" : "Document"}`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Document name *" style={inputStyle(theme)} />
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              style={inputStyle(theme)}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {activeTab === "agreements" && (
              <>
                <input value={form.forWhom || ""} onChange={e => setForm(p => ({ ...p, forWhom: e.target.value }))}
                  placeholder="For whom (e.g. All clients)" style={inputStyle(theme)} />
                <select value={form.platform || "PandaDoc"} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
                  style={inputStyle(theme)}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </>
            )}
            <input value={form.url || ""} onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
              placeholder="URL (Drive or PandaDoc link)" style={{ ...inputStyle(theme), gridColumn: "1 / -1" }} />
            <textarea value={form.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Description" rows={2}
              style={{ ...inputStyle(theme), gridColumn: "1 / -1", resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" onClick={editItem ? handleEdit : handleAdd} disabled={!form.name.trim() || saving}>
              {saving ? "Saving…" : editItem ? "Save Changes" : "Add to Library"}
            </Button>
            <Button size="sm" variant="outline" onClick={cancelForm}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {[
          { key: "agreements", label: `Agreements`, count: agreements.length },
          { key: "documents",  label: `Documents`,  count: documents.length },
        ].map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setSearch(""); cancelForm(); }} style={{
            padding: "7px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: activeTab === t.key ? primaryColor : "transparent",
            color: activeTab === t.key ? "#fff" : theme.textMuted,
            border: `1.5px solid ${activeTab === t.key ? primaryColor : theme.border}`,
            fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
          }}>
            {t.label}
            <span style={{ marginLeft: 6, opacity: 0.7 }}>({t.count})</span>
          </button>
        ))}

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${theme.border}`, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none", color: theme.text, width: 200 }}
        />
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "40vh" }}><Spinner size={28} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="◇" title="Nothing found" subtitle={search ? "Try a different search term." : "Add your first entry above."} />
      ) : (
        <div>
          {cats.map(cat => (
            <CategorySection
              key={cat}
              category={cat}
              items={grouped[cat] || []}
              isFounder={isFounder}
              onDelete={handleDelete}
              onEdit={openEdit}
              primaryColor={primaryColor}
              theme={theme}
            />
          ))}
        </div>
      )}
    </div>
  );
}