// ─────────────────────────────────────────────────────────────────────────────
// DocumentGenerator.jsx — Motion & Method LLC
// Route: /documents
// Standalone page — generate, sign, and track all M&M documents
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { theme } from '../theme';
import { SignAndSendButton, SigningStatusBadge } from '../components/DocuSealSigning';
import { generateMSA, generateProposal, generateSOW, generateICAgreement, generateWaiver } from '../utils/generateMMDocs';

const FOUNDERS = ['Ashley', 'Mikal', 'Ashley Glenn', 'Mikal Driver'];
const ALL_OPERATORS = ['Ashley Glenn', 'Mikal Driver', 'Shanell Jefferson'];

// Document suite definition
const DOC_SUITE = [
  { key: 'proposal',     label: 'Proposal',               icon: '◈', signable: true,  founderOnly: true,  contextType: 'both' },
  { key: 'sow',          label: 'Statement of Work',       icon: '◎', signable: true,  founderOnly: true,  contextType: 'both' },
  { key: 'msa',          label: 'Master Service Agreement',icon: '⊞', signable: true,  founderOnly: true,  contextType: 'both' },
  { key: 'ic_agreement', label: 'IC Agreement',            icon: '✍', signable: true,  founderOnly: false, contextType: 'event' },
  { key: 'waiver',       label: 'Third-Party Staffing Waiver', icon: '⚠', signable: true, founderOnly: true, contextType: 'event' },
  { key: 'invoice',      label: 'Invoice',                 icon: '$', signable: false, founderOnly: false, contextType: 'both' },
];

// ─── Placeholder builder ──────────────────────────────────────────────────────
function buildPlaceholders({ event, pricingLog, formData, operatorName, today }) {
  const tier     = pricingLog?.tier          || '';
  const vri      = pricingLog?.vri_band      || '';
  const wrr      = pricingLog?.wrr_band      || '';
  const base     = pricingLog?.base_anchor   || '';
  const clientTotal = pricingLog?.client_total || pricingLog?.final_price || '';
  const reserve  = pricingLog?.reserve_amount || '';
  const gross    = pricingLog?.gross_engagement_value || '';
  const pillar   = pricingLog?.pillar        || event?.pillar || '';
  const attendees = event?.attendee_count    || '';
  const client   = event?.client             || '';
  const eventName = event?.name              || '';
  const venue    = event?.venue              || event?.location || '';
  const eventDate = event?.event_date        || '';

  return {
    // Header fields
    '[ CLIENT NAME ]':                client,
    '[ CLIENT / ORGANIZATION NAME ]': client,
    '[ EVENT NAME ]':                 eventName,
    '[ Event Name ]':                 eventName,
    '[ Proposal Date ]':              today,
    '[ Date ]':                       today,
    // SOW / Proposal info table
    '[ Legal entity name ]':          client,
    '[ Name, title, email, phone ]':  formData.clientContact   || '',
    '[ Name — Founder or Senior Ops ]': operatorName,
    '[ Name and title — per Governance & Signing Authority doc ]': operatorName,
    '[ SOW Issue Date ]':             today,
    '[ Date of governing MSA, or \'Standalone SOW\' ]': formData.msaRef || 'Standalone SOW',
    '[ Pillar 1 / Pillar 2 / Pillar 4 / Hybrid — select all that apply ]': pillar,
    '[ Tier 0 / Tier 1 / Tier 2 / Tier 3 — per Pricing Engine ]': tier,
    // Event details
    '[ ]':                            '',
    '[ Single venue / Multi-venue — specify ]': venue,
    '[ Per Workforce Architecture Model ]': attendees ? `${attendees} target` : '',
    '[ Tier 1 / Tier 2 / Tier 3 — per attendance band ]': tier,
    '[ Low / Moderate / Elevated / High — from Pricing Engine ]': vri,
    '[ Low / Moderate / High / Critical — from Pricing Engine ]': wrr,
    // Fees
    '[ From Pricing Engine — Final Summary ]': clientTotal ? `$${Number(clientTotal).toLocaleString()}` : '',
    '[ From Pricing Engine ]':        clientTotal ? `$${Number(clientTotal).toLocaleString()}` : '',
    '[ From Pricing Engine — Adjusted Base ]': base ? `$${Number(base).toLocaleString()}` : '',
    '[ Pillar 2 / 4 if applicable ]': '',
    '[ From Add-Ons & Escalators tab ]': pricingLog?.add_on_total ? `$${Number(pricingLog.add_on_total).toLocaleString()}` : '—',
    '[ Multiplier — from Pricing Engine ]': pricingLog?.escalator_mult > 1 ? `x${pricingLog.escalator_mult.toFixed(2)}` : 'x1.00',
    '[ Multiplier — e.g. x1.20 for government ]': pricingLog?.escalator_mult > 1 ? `x${pricingLog.escalator_mult.toFixed(2)}` : 'x1.00',
    '[ Auto-calculated ]':            clientTotal ? `$${Number(clientTotal).toLocaleString()}` : '',
    '[ Post-escalator total ]':       clientTotal ? `$${Number(clientTotal).toLocaleString()}` : '',
    '[ From Labor Reserve Calculator ]': reserve ? `$${Number(reserve).toLocaleString()}` : '$0',
    '[ Final Price — from Pricing Engine ]': gross ? `$${Number(gross).toLocaleString()}` : clientTotal ? `$${Number(clientTotal).toLocaleString()}` : '',
    '[ Final Price from Pricing Engine ]':   gross ? `$${Number(gross).toLocaleString()}` : '',
    // Payment schedule
    '[ 30% / 50% — specify ]':        formData.depositPct    || '50%',
    '[ Amount ] — engagement activates upon clearance': formData.depositAmount  || '',
    '[ Amount ] — due at [ milestone ]': formData.midPayment  || 'N/A',
    '[ Amount ] — due [ X days ] before event date': formData.finalBalance || '',
    '[ Amount / Timing ]':            formData.depositAmount  || '',
    '[ X days ]':                     formData.balanceDueDays || '30',
    '[ milestone ]':                  formData.midMilestone   || '',
    // CIMI / scoring
    '[ Score and band — e.g. 2.8 — Structural Gaps Present ]': pricingLog?.cimi_avg ? `${pricingLog.cimi_avg} — ${getCimiLabel(pricingLog.cimi_avg)}` : 'Not assessed',
    '[ Band — e.g. Elevated Risk ]':  vri,
    '[ Band — e.g. High Consequence ]': wrr,
    // Proposal narrative fields
    '[ 1–2 sentences from discovery — in their language ]': formData.keyChallenge    || '',
    '[ Their definition from discovery conversation ]':     formData.successDef      || '',
    '[ 2–3 sentences on why this structure is right for this client — written fresh per engagement ]': formData.engagementRationale || '',
    '[ e.g. Pillar 1 — Execution  /  Pillar 4 — Advisory  /  Hybrid ]': pillar,
    '[ Tier 1 / Tier 2 / Tier 3 — per Pricing Engine output ]': tier,
    // Workforce model
    '[ Target: X volunteers ]':       attendees ? `${Math.ceil(Number(attendees) / 75)} target` : '',
    '[ 1 TL per X volunteers ]':      '1 TL per 10 volunteers',
    '[ X Ops Leads ]':                attendees ? `${Math.ceil(Number(attendees) / 300)} Ops Leads` : '',
    '[ Band ]':                       vri,
    '[ One sentence on what this means operationally ]':    formData.vriNote  || '',
    '[ One sentence on consequence exposure ]':             formData.wrrNote  || '',
    '[ 1 / 2 / 3 ]':                  pricingLog?.reserve_level || '1',
    '[ Reserve amount and activation conditions ]':         reserve ? `$${Number(reserve).toLocaleString()} — activates if show rate falls below projection` : '',
    // Contact
    '[ Name, phone, email ]':         `${operatorName} — ashleyg@motionmethodgroup.com`,
    // Milestones
    '[ SOW executed & deposit received ]': '',
    '[ Engagement activation — Axis + workspace live ]': '',
    // Event dates
    '[ Event Date(s) ]':              eventDate,
    '[ Event Location(s) ]':          venue,
    '[ Estimated Peak Attendance ]':  attendees ? Number(attendees).toLocaleString() : '',
    '[ Volunteer Headcount (Target) ]': attendees ? `${Math.ceil(Number(attendees) / 75)} target` : '',
    // Signing authority
    '[ Founder / Senior Ops Name ]':  operatorName,
    '[ Founder / Authorized Signatory ]': operatorName,
    '[ Authorized Representative Name ]': formData.clientContact || '',
    '[ Authorized Signatory ]':       operatorName,
    // IC Agreement specific
    '[ Contractor Name ]':            formData.contractorName  || '',
    '[ Contractor Legal Name ]':      formData.contractorName  || '',
    '[ Contractor Business Name (if applicable) ]': '',
    '[ Contractor Address ]':         '',
    '[ Contractor Email ]':           formData.contractorEmail || '',
    '[ Contractor Phone ]':           '',
    '[ M&M\'s payment method — e.g. direct deposit, check ]': 'direct deposit via Gusto',
    '[ Registered Address ]':         'Atlanta, Georgia',
    // Organization
    '[ Organization ]':               client,
    '[ Name ]':                       client,
  };
}

function getCimiLabel(avg) {
  if (!avg) return '';
  const n = parseFloat(avg);
  if (n < 2.4) return 'Foundational';
  if (n < 3.5) return 'Structural Gaps Present';
  if (n < 4.5) return 'Maturing';
  return 'Embedded Partner';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DocumentGenerator() {
  const { activeUser } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedEventId = searchParams.get('event_id');
  const isFounder = FOUNDERS.includes(activeUser);

  // Context selection
  const [contextMode, setContextMode]     = useState('event'); // 'event' | 'engagement'
  const [events, setEvents]               = useState([]);
  const [engagements, setEngagements]     = useState([]);
  const [selectedContext, setSelectedContext] = useState(null);
  const [pricingLog, setPricingLog]       = useState(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // Operator
  const [operator, setOperator] = useState(activeUser || 'Ashley Glenn');

  // Document selection
  const [selectedDoc, setSelectedDoc]     = useState(null);
  const [generating, setGenerating]       = useState(false);
  const [generatedDocs, setGeneratedDocs] = useState({}); // { docType: { id, url, name, ... } }
  const [error, setError]                 = useState('');

  // IC Agreement contractor
  const [contractors, setContractors]     = useState([]);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [contractorEmail, setContractorEmail] = useState('');

  // Form fields for manual inputs
  const [form, setForm] = useState({
    clientContact:        '',
    clientEmail:          '',
    depositPct:           '50%',
    depositAmount:        '',
    balanceDueDays:       '30',
    midPayment:           '',
    midMilestone:         '',
    finalBalance:         '',
    msaRef:               '',
    keyChallenge:         '',
    successDef:           '',
    engagementRationale:  '',
    vriNote:              '',
    wrrNote:              '',
    contractorName:       '',
    contractorEmail:      '',
  });

  // Load events and engagements
  useEffect(() => {
    const loadAll = async () => {
      const [evtSnap, pipeSnap] = await Promise.all([
        getDocs(collection(db, 'events')),
        getDocs(collection(db, 'pipeline')),
      ]);
      const evtList = evtSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.name).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setEvents(evtList);
      setEngagements(pipeSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.event_name || e.org_name).sort((a, b) => (a.event_name || '').localeCompare(b.event_name || '')));

      // Auto-select event if launched from EventCommand
      if (preselectedEventId) {
        const match = evtList.find(e => e.id === preselectedEventId);
        if (match) {
          setContextMode('event');
          setSelectedContext(match);
        }
      }
    };
    loadAll();
  }, [preselectedEventId]);

  // Load pricing log and contractors when context selected
  useEffect(() => {
    if (!selectedContext) return;
    const load = async () => {
      setLoadingContext(true);
      setPricingLog(null);

      // Load latest pricing log for this context
      try {
        const q = contextMode === 'event'
          ? query(collection(db, 'pricing_log'), where('event_id', '==', selectedContext.id), orderBy('created_at', 'desc'), limit(1))
          : query(collection(db, 'pricing_log'), where('pipeline_id', '==', selectedContext.id), orderBy('created_at', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) setPricingLog({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch (e) {
        console.error('pricing_log load error:', e);
      }

      // Load contractors for IC Agreement
      try {
        const talentSnap = await getDocs(
          query(collection(db, 'volunteerProfiles'), where('isContractor', '==', true))
        );
        const contractorList = talentSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Enrich with emails from talent_pool
        const emailMap = {};
        const poolSnap = await getDocs(collection(db, 'talent_pool'));
        poolSnap.docs.forEach(d => {
          const data = d.data();
          if (data.uid && data.email) emailMap[data.uid] = data.email;
        });

        setContractors(contractorList.map(c => ({ ...c, email: emailMap[c.uid] || '' })));
      } catch (e) {
        console.error('contractor load error:', e);
      }

      setLoadingContext(false);
    };
    load();
  }, [selectedContext, contextMode]);

  // When contractor selected, pre-fill email
  useEffect(() => {
    if (!selectedContractor) return;
    setForm(p => ({ ...p, contractorName: selectedContractor.name || '', contractorEmail: selectedContractor.email || '' }));
    setContractorEmail(selectedContractor.email || '');
  }, [selectedContractor]);

  const f = key => val => setForm(p => ({ ...p, [key]: val }));

  const today       = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const contextName = selectedContext?.name || selectedContext?.event_name || selectedContext?.org_name || '';

  async function handleGenerate(docType) {
    if (!selectedContext) { setError('Select an event or engagement first.'); return; }
    setGenerating(true);
    setError('');
    setSelectedDoc(docType);

    try {
      const functions = getFunctions();
      const saveDoc   = httpsCallable(functions, 'saveMMDocRecord');

      // Build doc in code for all types
      let blob, filename;

      if (docType === 'msa') {
        ({ blob, filename } = await generateMSA({
          client: contextName, event: selectedContext, operator, today,
        }));
      } else if (docType === 'proposal') {
        ({ blob, filename } = await generateProposal({
          client: contextName, event: selectedContext, pricingLog, operator, form, today,
        }));
      } else if (docType === 'sow') {
        ({ blob, filename } = await generateSOW({
          client: contextName, event: selectedContext, pricingLog, operator, form, today,
        }));
      } else if (docType === 'ic_agreement') {
        if (!form.contractorName) { setError('Select a contractor first.'); setGenerating(false); return; }
        ({ blob, filename } = await generateICAgreement({
          contractorName: form.contractorName, operator, today,
        }));
      } else if (docType === 'waiver') {
        ({ blob, filename } = await generateWaiver({
          client: contextName, event: selectedContext, operator, today,
        }));
      } else {
        setError(`Document type "${docType}" not yet implemented.`);
        setGenerating(false);
        return;
      }

      // Upload to Storage
      const storagePath = `documents/temp/${selectedContext.id}/${safeFilename(filename)}`;
      const fileRef     = ref(storage, storagePath);
      await uploadBytes(fileRef, blob);
      const url = await getDownloadURL(fileRef);

      // Save Firestore record
      const counterpartyEmail = docType === 'ic_agreement'
        ? (contractorEmail || form.contractorEmail)
        : form.clientEmail || '';
      const counterpartyName = docType === 'ic_agreement'
        ? form.contractorName
        : form.clientContact || contextName;
      const counterpartyUid = docType === 'ic_agreement'
        ? selectedContractor?.uid || null
        : null;

      const result = await saveDoc({
        filename, url, storagePath, docType,
        contextId:    selectedContext.id,
        contextName,
        operatorName: operator,
        eventId:      contextMode === 'event'      ? selectedContext.id : null,
        engagementId: contextMode === 'engagement' ? selectedContext.id : null,
        counterpartyName,
        counterpartyEmail,
        counterpartyUid,
      });

      setGeneratedDocs(p => ({ ...p, [docType]: {
        id:  result.data.documentId,
        url, filename, name: filename,
        docType, storagePath,
        counterpartyEmail,
        counterpartyName,
        counterpartyUid,
        eventId:      contextMode === 'event'      ? selectedContext.id : null,
        engagementId: contextMode === 'engagement' ? selectedContext.id : null,
        contextName,
      }}));

    } catch (err) {
      console.error('Generate error:', err);
      setError(err.message || 'Generation failed. Check console.');
    }
    setGenerating(false);
  }

  function safeFilename(str) {
    return str.replace(/[^a-zA-Z0-9_\-.]/g, '_');
  }

  const canOperatorSign = (docDef) => {
    const name = operator.toLowerCase();
    const isFounderOp = name.includes('ashley') || name.includes('mikal');
    const isShanell   = name.includes('shanell');
    if (docDef.founderOnly && !isFounderOp) return false;
    if (isShanell && docDef.key !== 'ic_agreement') return false;
    return true;
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100, margin: '0 auto', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');"}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          M&M Operations
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
              Document Generator
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.textMuted }}>
              Generate, sign, and track all M&M engagement documents
            </p>
          </div>
          {/* Operator selector */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Signing Operator
            </div>
            <select
              value={operator}
              onChange={e => setOperator(e.target.value)}
              style={selectStyle}
            >
              {ALL_OPERATORS.map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.25)', fontSize: 12, color: '#C0392B', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>

        {/* ── Left: Context Selector ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 4, background: theme.background, borderRadius: 10, padding: 4, border: `1px solid ${theme.border}` }}>
            {[{ key: 'event', label: 'Events' }, { key: 'engagement', label: 'Pipeline' }].map(m => (
              <button key={m.key} onClick={() => { setContextMode(m.key); setSelectedContext(null); setPricingLog(null); }}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: contextMode === m.key ? theme.primary : 'transparent',
                  color: contextMode === m.key ? '#fff' : theme.textMuted,
                  fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.15s',
                }}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Context list */}
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${theme.border}`, background: theme.background }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {contextMode === 'event' ? 'Select Event' : 'Select Engagement'}
              </div>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {(contextMode === 'event' ? events : engagements).map(item => {
                const label    = item.name || item.event_name || item.org_name || 'Unnamed';
                const sublabel = item.client || item.org_name || item.event_date || '';
                const isSelected = selectedContext?.id === item.id;
                return (
                  <div key={item.id} onClick={() => setSelectedContext(item)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer',
                      background: isSelected ? `${theme.primary}10` : '#fff',
                      borderLeft: isSelected ? `3px solid ${theme.primary}` : '3px solid transparent',
                      borderBottom: `1px solid ${theme.border}`,
                      transition: 'all 0.1s',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? theme.primary : theme.text }}>
                      {label}
                    </div>
                    {sublabel && label !== sublabel && (
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{sublabel}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pricing log status */}
          {selectedContext && (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: pricingLog ? 'rgba(45,122,70,0.06)' : 'rgba(235,199,100,0.1)',
              border: `1px solid ${pricingLog ? 'rgba(45,122,70,0.2)' : 'rgba(235,199,100,0.3)'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: pricingLog ? '#2d7a46' : '#8a6800', marginBottom: pricingLog ? 6 : 0 }}>
                {pricingLog ? '✓ Pricing Engine Run Found' : '⚠ No Pricing Run Found'}
              </div>
              {pricingLog ? (
                <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.6 }}>
                  {pricingLog.tier} · Client Total: ${Number(pricingLog.client_total || pricingLog.final_price || 0).toLocaleString()}
                  {pricingLog.reserve_amount > 0 && ` · Reserve: $${Number(pricingLog.reserve_amount).toLocaleString()}`}
                  <br />VRI: {pricingLog.vri_band || '—'} · WRR: {pricingLog.wrr_band || '—'}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
                  Fee fields will be blank. Run the Pricing Engine first for a complete document.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Document Suite ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {!selectedContext ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: theme.textMuted, fontSize: 13 }}>
              Select an event or engagement to generate documents
            </div>
          ) : (
            <>
              {/* Context banner */}
              <div style={{
                padding: '12px 16px', borderRadius: 10, background: theme.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
                    {contextMode === 'event' ? 'Event' : 'Engagement'}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: "'Playfair Display', serif" }}>
                    {contextName}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  {today}
                </div>
              </div>

              {/* Manual form fields */}
              <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.background }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Engagement Details
                  </div>
                </div>
                <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Client Contact (Name, Title)" span={2}>
                    <input value={form.clientContact} onChange={e => f('clientContact')(e.target.value)}
                      placeholder="Jane Smith, Head of Events" style={inputStyle} />
                  </Field>
                  <Field label="Client Email (for DocuSeal signing request)" span={2}>
                    <input value={form.clientEmail} onChange={e => f('clientEmail')(e.target.value)}
                      placeholder="jane@render.com" style={inputStyle} />
                  </Field>
                  <Field label="Deposit %">
                    <select value={form.depositPct} onChange={e => f('depositPct')(e.target.value)} style={inputStyle}>
                      <option value="30%">30%</option>
                      <option value="50%">50%</option>
                    </select>
                  </Field>
                  <Field label="Deposit Amount ($)">
                    <input value={form.depositAmount} onChange={e => f('depositAmount')(e.target.value)}
                      placeholder="e.g. 27,500" style={inputStyle} />
                  </Field>
                  <Field label="Final Balance Due (days before event)">
                    <input value={form.balanceDueDays} onChange={e => f('balanceDueDays')(e.target.value)}
                      placeholder="30" style={inputStyle} />
                  </Field>
                  <Field label="MSA Reference Date">
                    <input value={form.msaRef} onChange={e => f('msaRef')(e.target.value)}
                      placeholder="Leave blank for Standalone SOW" style={inputStyle} />
                  </Field>
                </div>

                {/* Proposal-specific fields */}
                <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', paddingTop: 4, borderTop: `1px solid ${theme.border}` }}>
                    Proposal Narrative (required for Proposal generation)
                  </div>
                  <Field label="Key Operational Challenge" span={2}>
                    <textarea value={form.keyChallenge} onChange={e => f('keyChallenge')(e.target.value)}
                      placeholder="1-2 sentences in the client's language about their core ops problem..."
                      rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </Field>
                  <Field label="What Success Looks Like (Their Definition)" span={2}>
                    <textarea value={form.successDef} onChange={e => f('successDef')(e.target.value)}
                      placeholder="Their definition from discovery conversation..."
                      rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </Field>
                  <Field label="Engagement Rationale" span={2}>
                    <textarea value={form.engagementRationale} onChange={e => f('engagementRationale')(e.target.value)}
                      placeholder="2-3 sentences on why this engagement structure is right for this client..."
                      rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </Field>
                </div>
              </div>

              {/* IC Agreement contractor selector */}
              <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.background }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    IC Agreement — Contractor
                  </div>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Field label="Select Contractor">
                    <select value={selectedContractor?.uid || ''} onChange={e => setSelectedContractor(contractors.find(c => c.uid === e.target.value) || null)} style={inputStyle}>
                      <option value="">— Select a contractor —</option>
                      {contractors.map(c => (
                        <option key={c.uid} value={c.uid}>{c.name} {c.ic_agreement_signed ? '✓' : ''}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Contractor Email (for DocuSeal signing request)">
                    <input value={contractorEmail} onChange={e => setContractorEmail(e.target.value)}
                      placeholder="contractor@email.com" style={inputStyle} />
                  </Field>
                  {selectedContractor?.ic_agreement_signed && (
                    <div style={{ fontSize: 11, color: '#2d7a46', fontWeight: 700 }}>
                      ✓ IC Agreement already signed by this contractor
                    </div>
                  )}
                </div>
              </div>

              {/* Document suite */}
              <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.background }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Document Suite
                  </div>
                </div>
                <div style={{ padding: '8px 0' }}>
                  {DOC_SUITE.map(docDef => {
                    const generated = generatedDocs[docDef.key];
                    const canSign   = canOperatorSign(docDef);
                    const isGenerating = generating && selectedDoc === docDef.key;

                    return (
                      <div key={docDef.key} style={{
                        padding: '12px 16px', borderBottom: `1px solid ${theme.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                          <span style={{ fontSize: 16, color: theme.primary }}>{docDef.icon}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{docDef.label}</div>
                            {docDef.founderOnly && (
                              <div style={{ fontSize: 10, color: theme.textMuted }}>Founder only</div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {/* Status badge if generated */}
                          {generated && (
                            <SigningStatusBadge document={{
                              ...generated,
                              requiresSignature: docDef.signable,
                              signingStatus: generated.signingStatus || 'not_started',
                            }} />
                          )}

                          {/* Download if generated */}
                          {generated?.url && (
                            <a href={generated.url} target="_blank" rel="noreferrer"
                              style={{ fontSize: 11, fontWeight: 700, color: theme.primary, textDecoration: 'none' }}>
                              ↓ Download
                            </a>
                          )}

                          {/* Sign & Send if generated and signable */}
                          {generated && docDef.signable && canSign && (
                            <SignAndSendButton
                              document={generated}
                              operator={operator}
                              onComplete={() => setGeneratedDocs(p => ({
                                ...p,
                                [docDef.key]: { ...p[docDef.key], signingStatus: 'pending', mmSigned: true },
                              }))}
                            />
                          )}

                          {/* Generate button */}
                          {!generated && (
                            <button
                              onClick={() => handleGenerate(docDef.key)}
                              disabled={isGenerating || generating || !selectedContext}
                              style={{
                                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                background: isGenerating ? theme.background : theme.primary,
                                color: isGenerating ? theme.textMuted : '#fff',
                                fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                                opacity: generating && !isGenerating ? 0.5 : 1,
                                transition: 'all 0.15s',
                              }}>
                              {isGenerating ? 'Generating...' : 'Generate'}
                            </button>
                          )}

                          {/* Regenerate if already generated */}
                          {generated && (
                            <button
                              onClick={() => { setGeneratedDocs(p => { const n = { ...p }; delete n[docDef.key]; return n; }); }}
                              style={{
                                padding: '5px 10px', borderRadius: 6,
                                border: `1px solid ${theme.border}`, background: 'transparent',
                                color: theme.textMuted, fontSize: 11, cursor: 'pointer',
                                fontFamily: "'DM Sans', sans-serif",
                              }}>
                              ↺ Regen
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span === 2 ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  border: '1.5px solid #E5E7EB', background: '#F9FAFB',
  color: '#1A1A1A', fontSize: 12, fontFamily: "'DM Sans', sans-serif",
  outline: 'none', boxSizing: 'border-box',
};

const selectStyle = {
  ...inputStyle, appearance: 'none', cursor: 'pointer',
};