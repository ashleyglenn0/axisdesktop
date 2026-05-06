// ─────────────────────────────────────────────────────────────────────────────
// DocuSealSigning.jsx — Motion & Method LLC
// Drop in: src/components/DocuSealSigning.jsx
// Works in Axis Desktop (React) — compatible pattern for Axis Mobile (React Native)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { DocusealForm } from '@docuseal/react';
import { theme } from '../theme';

// Signing authority rules — mirrors the Cloud Function validation
const FOUNDER_ONLY    = ['msa', 'sow', 'proposal', 'waiver', 'third_party_staffing_waiver'];
const SHANELL_SIGNABLE = ['ic_agreement'];

function canSign(operatorName, docType) {
  const name = operatorName?.trim().toLowerCase();
  const type = docType?.toLowerCase();
  const isFounder  = name === 'ashley' || name === 'ashley glenn' ||
                     name === 'mikal'  || name === 'mikal driver';
  const isShanell  = name === 'shanell' || name === 'shanell jefferson';

  if (FOUNDER_ONLY.includes(type) && !isFounder) return false;
  if (isShanell && !SHANELL_SIGNABLE.includes(type)) return false;
  return true;
}

const DOC_TYPE_LABELS = {
  ic_agreement:               'IC Agreement',
  waiver:                     'Staffing Waiver',
  third_party_staffing_waiver:'Third-Party Staffing Waiver',
  msa:                        'Master Service Agreement',
  sow:                        'Statement of Work',
  proposal:                   'Proposal',
  runbook:                    'Event Runbook',
};

// ── Sign & Send Button — Axis Desktop ─────────────────────────────────────────
export function SignAndSendButton({ document, operator, onComplete }) {
  const [status,    setStatus]    = useState('idle'); // idle | creating | signing | done | error
  const [embedSrc,  setEmbedSrc]  = useState(null);
  const [errorMsg,  setErrorMsg]  = useState('');
  const [showModal, setShowModal] = useState(false);

  const docType     = document?.docType || '';
  const authorized  = canSign(operator, docType);
  const docLabel    = DOC_TYPE_LABELS[docType] || docType;

  if (!authorized) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 6,
        background: 'rgba(139,0,0,0.06)', border: '1px solid rgba(139,0,0,0.2)',
        fontSize: 11, color: '#8B0000', fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <span>⊘</span>
        Founder authorization required for {docLabel}
      </div>
    );
  }

  async function handleSignAndSend() {
    setStatus('creating');
    setErrorMsg('');
    try {
      const functions = getFunctions();
      const createSubmission = httpsCallable(functions, 'createMMDocuSealSubmission');
      const result = await createSubmission({
        documentId:          document.id,
        documentUrl:         document.url,
        documentStoragePath: document.storagePath || null,
        documentName:        document.name,
        docType:             document.docType,
        operatorName:        operator,
        counterpartyEmail:   document.counterpartyEmail,
        counterpartyName:    document.counterpartyName  || null,
        counterpartyUid:     document.counterpartyUid   || null,
        eventId:             document.eventId           || null,
        engagementId:        document.engagementId      || null,
      });

      if (result.data?.mmEmbedSrc) {
        setEmbedSrc(result.data.mmEmbedSrc);
        setStatus('signing');
        setShowModal(true);
      } else {
        throw new Error('No embed URL returned from DocuSeal');
      }
    } catch (err) {
      console.error('Sign & Send error:', err);
      if (err.code === 'permission-denied') {
        setErrorMsg(err.message);
      } else if (err.code === 'failed-precondition') {
        setErrorMsg('Configuration error — check that DOCUSEAL_API_KEY and CLOUDCONVERT_API_KEY are set in functions/.env');
      } else {
        setErrorMsg(err.message || 'Something went wrong. Try again.');
      }
      setStatus('error');
    }
  }

  function handleSigningComplete() {
    setStatus('done');
    setShowModal(false);
    if (onComplete) onComplete();
  }

  if (status === 'done') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 6,
        background: 'rgba(45,122,70,0.08)', border: '1px solid rgba(45,122,70,0.25)',
        fontSize: 11, color: '#2d7a46', fontWeight: 700,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <span>✓</span>
        Signed — counterparty signing request sent
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={handleSignAndSend}
          disabled={status === 'creating'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, border: 'none',
            cursor: status === 'creating' ? 'not-allowed' : 'pointer',
            background: theme.primary, color: theme.accent,
            fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            opacity: status === 'creating' ? 0.6 : 1,
            transition: 'all 0.15s',
          }}
        >
          <span>✍</span>
          {status === 'creating' ? 'Converting & setting up...' : `Sign & Send — ${docLabel}`}
        </button>
        {status === 'error' && (
          <p style={{ fontSize: 11, color: '#C0392B', margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
            {errorMsg}
          </p>
        )}
      </div>

      {showModal && embedSrc && (
        <SigningModal
          embedSrc={embedSrc}
          title={`Sign — ${document.name}`}
          subtitle={`Sign first. ${document.counterpartyName || 'The counterparty'} will receive their signing request automatically.`}
          onComplete={handleSigningComplete}
          onClose={() => { setShowModal(false); setStatus('idle'); }}
        />
      )}
    </>
  );
}

// ── Signing Status Badge ──────────────────────────────────────────────────────
export function SigningStatusBadge({ document }) {
  const { signingStatus, mmSigned, counterpartySigned, requiresSignature, docType } = document;

  if (!requiresSignature) return null;

  const docLabel = DOC_TYPE_LABELS[docType] || docType;

  if (signingStatus === 'completed') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
        background: 'rgba(45,122,70,0.1)', color: '#2d7a46',
        border: '1px solid rgba(45,122,70,0.25)',
      }}>
        ✓ Fully executed
      </span>
    );
  }

  if (signingStatus === 'pending') {
    if (mmSigned && !counterpartySigned) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
          background: 'rgba(235,199,100,0.15)', color: '#8a6800',
          border: '1px solid rgba(235,199,100,0.3)',
        }}>
          ◑ Waiting on counterparty
        </span>
      );
    }
    if (!mmSigned) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
          background: `${theme.primary}10`, color: theme.primary,
          border: `1px solid ${theme.primary}30`,
        }}>
          ✍ Needs M&M signature
        </span>
      );
    }
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: theme.background, color: theme.textMuted,
      border: `1px solid ${theme.border}`,
    }}>
      ✍ Signature required
    </span>
  );
}

// ── IC Agreement Gate Badge — shown on contractor profiles ────────────────────
// Shows in Axis Desktop staff roster and Axis Mobile shift gate
export function ICAgreementBadge({ profile }) {
  const isContractor = profile?.isContractor || profile?.type === 'contractor';
  if (!isContractor) return null; // volunteers don't have this gate

  const signed = profile?.ic_agreement_signed === true;

  if (signed) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
        background: 'rgba(45,122,70,0.1)', color: '#2d7a46',
        border: '1px solid rgba(45,122,70,0.25)',
      }}>
        ✓ IC Agreement signed
      </span>
    );
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: 'rgba(192,57,43,0.08)', color: '#C0392B',
      border: '1px solid rgba(192,57,43,0.2)',
    }}>
      ⊘ IC Agreement required — shifts locked
    </span>
  );
}

// ── Shared Signing Modal ──────────────────────────────────────────────────────
function SigningModal({ embedSrc, title, subtitle, onComplete, onClose }) {
  const [signed, setSigned] = useState(false);

  function handleComplete() {
    setSigned(true);
    setTimeout(() => { if (onComplete) onComplete(); }, 1500);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 760,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        border: `1px solid ${theme.border}`,
        fontFamily: "'DM Sans', sans-serif",
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: `1px solid ${theme.border}`,
          background: theme.primary, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.accent, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>
              Document Signing
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: "'Playfair Display', serif" }}>
              {title}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
              {subtitle}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              background: 'rgba(255,255,255,0.15)', cursor: 'pointer',
              color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0, marginLeft: 12,
            }}
          >✕</button>
        </div>

        {/* Content */}
        {signed ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '48px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(45,122,70,0.1)', border: '2px solid rgba(45,122,70,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, marginBottom: 16,
            }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif", marginBottom: 8 }}>
              Signed
            </div>
            <div style={{ fontSize: 13, color: theme.textMuted, maxWidth: 320, lineHeight: 1.6 }}>
              The counterparty will receive their signing request automatically. You'll be notified when they sign.
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <DocusealForm src={embedSrc} onComplete={handleComplete} style={{ width: '100%' }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Signing Authority Helper — export for use in UI ───────────────────────────
export { canSign, DOC_TYPE_LABELS };