// ─────────────────────────────────────────────────────────────────────────────
// functions/index.js — Motion & Method LLC
// Firebase project: volunteercheckin-3659e
// ─────────────────────────────────────────────────────────────────────────────

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const admin  = require('firebase-admin');
const fetch  = require('node-fetch');
const { google } = require('googleapis');
const JSZip  = require('jszip');
const { Readable } = require('stream');

admin.initializeApp();
const db = admin.firestore();

// ─── Constants ────────────────────────────────────────────────────────────────
const DOCUSEAL_API_KEY     = process.env.DOCUSEAL_API_KEY     || '';
const DOCUSEAL_API_URL     = 'https://api.docuseal.com';
const CLOUDCONVERT_API_KEY = process.env.CLOUDCONVERT_API_KEY || '';
const TEMPLATES_FOLDER_ID  = '1L4TMWekY4QBHoMDP2wVzp6xvFZtCgw5x';
const CLIENTS_FOLDER_ID    = '18blEQkYN3kEvM8MWrq7pKrmAUt4p-2Os';

const MM_SIGNERS = {
  ASHLEY:  { name: 'Ashley Glenn',      email: process.env.ASHLEY_EMAIL  || 'ashley@motionmethodgroup.com',  role: 'Founder' },
  MIKAL:   { name: 'Mikal Driver',      email: process.env.MIKAL_EMAIL   || 'mikal@motionmethodgroup.com',    role: 'Founder' },
  SHANELL: { name: 'Shanell Jefferson', email: process.env.SHANELL_EMAIL || 'shanell@motionmethodgroup.com',  role: 'Senior Ops Manager' },
};

const SHANELL_SIGNABLE = ['ic_agreement'];
const FOUNDER_ONLY     = ['msa', 'sow', 'proposal', 'waiver', 'third_party_staffing_waiver'];

const TEMPLATE_NAMES = {
  sow:          'MM_SOW_Template',
  proposal:     'MM_Proposal_Template',
  ic_agreement: 'MM_Independent_Contractor_Agreement',
};

// ─── Google Drive Auth ────────────────────────────────────────────────────────
function getDriveClient() {
  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

// ─── Pull template from Drive ─────────────────────────────────────────────────
async function getTemplateBuffer(docType) {
  const drive        = getDriveClient();
  const templateName = TEMPLATE_NAMES[docType];
  if (!templateName) throw new Error(`No template defined for docType: ${docType}`);

  const listRes = await drive.files.list({
    q: `'${TEMPLATES_FOLDER_ID}' in parents and name contains '${templateName}' and trashed = false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 5,
  });

  const files = listRes.data.files;
  if (!files || files.length === 0) throw new Error(`Template not found in Drive: ${templateName}`);

  const file = files[0];

  if (file.mimeType === 'application/vnd.google-apps.document') {
    const exportRes = await drive.files.export(
      { fileId: file.id, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(exportRes.data);
  }

  const downloadRes = await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(downloadRes.data);
}

// ─── Fill template placeholders ───────────────────────────────────────────────
async function fillTemplate(docxBuffer, placeholders) {
  const zip     = await JSZip.loadAsync(docxBuffer);
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) throw new Error('Invalid .docx — word/document.xml not found');

  let xml = await xmlFile.async('string');

  for (const [placeholder, value] of Object.entries(placeholders)) {
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    xml = xml.replace(new RegExp(escaped, 'g'), value || '');
  }

  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

// ─── Get or create client folder in Drive ─────────────────────────────────────
async function getOrCreateClientFolder(folderName) {
  const drive = getDriveClient();

  const listRes = await drive.files.list({
    q: `'${CLIENTS_FOLDER_ID}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });

  if (listRes.data.files?.length > 0) return listRes.data.files[0].id;

  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [CLIENTS_FOLDER_ID],
    },
    fields: 'id',
  });

  return createRes.data.id;
}

// ─── Upload signed PDF to Drive ───────────────────────────────────────────────
async function uploadSignedDocToDrive(pdfUrl, filename, clientFolderName) {
  const drive    = getDriveClient();
  const folderId = await getOrCreateClientFolder(clientFolderName);

  const pdfRes = await fetch(pdfUrl);
  if (!pdfRes.ok) throw new Error(`Failed to download signed PDF: ${pdfRes.status}`);
  const pdfBuffer = await pdfRes.buffer();
  const stream    = Readable.from(pdfBuffer);

  const uploadRes = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: 'application/pdf', body: stream },
    fields: 'id, webViewLink',
  });

  return { driveFileId: uploadRes.data.id, driveViewLink: uploadRes.data.webViewLink };
}

// ─── Signing authority helpers ────────────────────────────────────────────────
function validateSigningAuthority(operatorName, docType) {
  const name      = operatorName?.trim().toLowerCase();
  const type      = docType?.toLowerCase();
  const isFounder = name === 'ashley' || name === 'ashley glenn' || name === 'mikal' || name === 'mikal driver';
  const isShanell = name === 'shanell' || name === 'shanell jefferson';
  if (FOUNDER_ONLY.includes(type) && !isFounder) {
    return { allowed: false, reason: `${docType} requires Founder authorization.` };
  }
  if (isShanell && !SHANELL_SIGNABLE.includes(type)) {
    return { allowed: false, reason: `Shanell Jefferson can sign IC Agreements only.` };
  }
  return { allowed: true };
}

function getMMSigner(operatorName) {
  const name = operatorName?.trim().toLowerCase();
  if (name === 'shanell' || name === 'shanell jefferson') return MM_SIGNERS.SHANELL;
  if (name === 'mikal'   || name === 'mikal driver')      return MM_SIGNERS.MIKAL;
  return MM_SIGNERS.ASHLEY;
}

// ─── Review routing — who reviews whose docs ─────────────────────────────────
function getReviewers(generatedBy) {
  const name = (generatedBy || '').toLowerCase();
  if (name.includes('ashley')) return ['Mikal Driver'];
  if (name.includes('mikal'))  return ['Ashley Glenn'];
  return ['Ashley Glenn', 'Mikal Driver']; // Shanell or anyone else
}

// ─── convertDocxToPdf ─────────────────────────────────────────────────────────
async function convertDocxToPdf(docxUrl, docxStoragePath, contextId, originalFilename) {
  if (!CLOUDCONVERT_API_KEY) throw new Error('CLOUDCONVERT_API_KEY not configured');

  const docxRes    = await fetch(docxUrl);
  if (!docxRes.ok) throw new Error(`Failed to download .docx: ${docxRes.status}`);
  const docxBase64 = Buffer.from(await docxRes.arrayBuffer()).toString('base64');

  const jobRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${CLOUDCONVERT_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tasks: {
        'import-file':  { operation: 'import/base64', file: docxBase64, filename: originalFilename },
        'convert-file': { operation: 'convert', input: 'import-file', input_format: 'docx', output_format: 'pdf', engine: 'libreoffice' },
        'export-file':  { operation: 'export/url', input: 'convert-file' },
      },
      tag: `mm-${contextId}`,
    }),
  });

  if (!jobRes.ok) { const e = await jobRes.json(); throw new Error(`CloudConvert failed: ${JSON.stringify(e)}`); }

  const jobId = (await jobRes.json()).data.id;
  let pdfDownloadUrl = null;

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const s = await (await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
      headers: { 'Authorization': `Bearer ${CLOUDCONVERT_API_KEY}` },
    })).json();
    if (s.data.status === 'error')    throw new Error(`CloudConvert failed: ${JSON.stringify(s.data)}`);
    if (s.data.status === 'finished') {
      pdfDownloadUrl = s.data.tasks.find(t => t.name === 'export-file' && t.status === 'finished')?.result?.files?.[0]?.url;
      break;
    }
  }
  if (!pdfDownloadUrl) throw new Error('CloudConvert timed out');

  const pdfRes    = await fetch(pdfDownloadUrl);
  if (!pdfRes.ok) throw new Error('Failed to download converted PDF');
  const pdfBuffer = await pdfRes.buffer();

  const pdfFilename = originalFilename.replace(/\.docx$/i, '').replace(/\.pdf$/i, '') + '.pdf';
  const pdfPath     = `documents/${contextId}/${Date.now()}_${pdfFilename}`;
  const bucket      = admin.storage().bucket();
  const pdfFile     = bucket.file(pdfPath);
  await pdfFile.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } });
  await pdfFile.makePublic();
  const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${pdfPath}`;

  if (docxStoragePath) {
    try { await bucket.file(docxStoragePath).delete(); }
    catch (e) { console.warn('Could not delete temp .docx:', e.message); }
  }

  return { pdfUrl, pdfPath, pdfFilename };
}

// ─────────────────────────────────────────────────────────────────────────────
// generateMMDocument
// ─────────────────────────────────────────────────────────────────────────────
exports.generateMMDocument = onCall(
  { timeoutSeconds: 120 },
  async (request) => {
    const {
      docType, operatorName, placeholders, contextId, contextName,
      eventId, engagementId, counterpartyEmail, counterpartyName, counterpartyUid,
    } = request.data;

    if (!docType || !placeholders) {
      throw new HttpsError('invalid-argument', 'docType and placeholders are required');
    }

    try {
      const templateBuffer = await getTemplateBuffer(docType);
      const filledBuffer   = await fillTemplate(templateBuffer, placeholders);

      const filename    = `MM_${docType}_${(contextName || contextId || 'doc').replace(/\s+/g, '_')}_${Date.now()}.docx`;
      const storagePath = `documents/temp/${contextId || 'general'}/${filename}`;
      const bucket      = admin.storage().bucket();
      const file        = bucket.file(storagePath);

      await file.save(filledBuffer, {
        metadata: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      });
      await file.makePublic();
      const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      const docRef = await db.collection('mm_documents').add({
        name: filename, fileName: filename, docType, url, downloadUrl: url, storagePath,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        contextId: contextId || null, contextName: contextName || null,
        eventId: eventId || null, engagementId: engagementId || null,
        operatorName: operatorName || null,
        counterpartyEmail: counterpartyEmail || null,
        counterpartyName: counterpartyName || null,
        counterpartyUid: counterpartyUid || null,
        signingStatus: 'not_started', requiresSignature: true,
        mmSigned: false, counterpartySigned: false,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (docType === 'ic_agreement' && counterpartyUid && counterpartyEmail) {
        const poolSnap = await db.collection('talent_pool').where('uid', '==', counterpartyUid).limit(1).get();
        if (!poolSnap.empty) await poolSnap.docs[0].ref.update({ email: counterpartyEmail });
      }

      await db.collection('activity_log').add({
        description: `Document generated — ${filename} (${docType})`,
        event_id: eventId || null, operator: operatorName, type: 'document',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, documentId: docRef.id, url, filename };

    } catch (err) {
      console.error('generateMMDocument error:', err);
      throw new HttpsError('internal', err.message);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// createMMDocuSealSubmission
// ─────────────────────────────────────────────────────────────────────────────
exports.createMMDocuSealSubmission = onCall(
  { timeoutSeconds: 120 },
  async (request) => {
    const {
      documentId, documentUrl, documentStoragePath, documentName, docType,
      operatorName, counterpartyEmail, counterpartyName, counterpartyUid,
      eventId, engagementId, contextName,
    } = request.data;

    if (!documentId || !documentUrl || !counterpartyEmail) {
      throw new HttpsError('invalid-argument', 'documentId, documentUrl, and counterpartyEmail are required');
    }
    if (!DOCUSEAL_API_KEY)     throw new HttpsError('failed-precondition', 'DocuSeal API key not configured.');
    if (!CLOUDCONVERT_API_KEY) throw new HttpsError('failed-precondition', 'CloudConvert API key not configured.');

    const authCheck = validateSigningAuthority(operatorName, docType);
    if (!authCheck.allowed) throw new HttpsError('permission-denied', authCheck.reason);

    const mmSigner  = getMMSigner(operatorName);
    const contextId = eventId || engagementId || 'general';
    const filename  = documentName || `MM_${docType}.docx`;

    try {
      const { pdfUrl, pdfPath, pdfFilename } = await convertDocxToPdf(
        documentUrl, documentStoragePath, contextId,
        filename.endsWith('.docx') ? filename : `${filename}.docx`
      );

      await db.collection('mm_documents').doc(documentId).update({
        name: pdfFilename, fileName: pdfFilename,
        url: pdfUrl, downloadUrl: pdfUrl,
        fileType: 'application/pdf', storagePath: pdfPath,
        convertedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const counterpartyRole = docType === 'ic_agreement' ? 'Contractor' : 'Client';
      const pdfB64           = Buffer.from(await (await fetch(pdfUrl)).arrayBuffer()).toString('base64');

      const submissionRes = await fetch(`${DOCUSEAL_API_URL}/submissions/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': DOCUSEAL_API_KEY },
        body: JSON.stringify({
          name: pdfFilename.replace('.pdf', ''),
          send_email: true, submitters_order: 'preserved',
          metadata: {
            doc_type: docType, document_id: documentId,
            counterparty_uid: counterpartyUid || null,
            event_id: eventId || null, engagement_id: engagementId || null,
            context_name: contextName || null, pdf_filename: pdfFilename,
          },
          documents: [{ name: pdfFilename, file: pdfB64 }],
          submitters: [
            { role: 'Motion & Method LLC', email: mmSigner.email, name: mmSigner.name, send_email: false },
            { role: counterpartyRole, email: counterpartyEmail, name: counterpartyName || counterpartyEmail, send_email: true },
          ],
        }),
      });

      if (!submissionRes.ok) {
        const e = await submissionRes.json();
        throw new HttpsError('internal', `DocuSeal error: ${JSON.stringify(e)}`);
      }

      const submission      = await submissionRes.json();
      const submitters      = Array.isArray(submission) ? submission : submission.submitters || [];
      const mmSub           = submitters.find(s => s.email === mmSigner.email);
      const counterSub      = submitters.find(s => s.email === counterpartyEmail);
      const submissionId    = mmSub?.submission_id || submission.id || null;

      await db.collection('mm_documents').doc(documentId).update({
        signingStatus: 'pending', requiresSignature: true,
        status: 'sent',  // ← sync review status
        docusealSubmissionId: submissionId,
        mmSignerName: mmSigner.name, mmSignerEmail: mmSigner.email,
        mmEmbedSrc: mmSub?.embed_src || null,
        counterpartyEmbedSrc: counterSub?.embed_src || null,
        counterpartyEmail, counterpartyName: counterpartyName || null,
        counterpartyUid: counterpartyUid || null,
        mmSigned: false, counterpartySigned: false, docType,
        eventId: eventId || null, engagementId: engagementId || null,
        signingInitiatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('activity_log').add({
        description: `Document sent for signing — ${pdfFilename} (${docType})`,
        event_id: eventId || null, operator: operatorName, type: 'document',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true, submissionId,
        mmEmbedSrc: mmSub?.embed_src || null,
        counterpartyEmbedSrc: counterSub?.embed_src || null,
        pdfUrl,
      };

    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err.message);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// mmDocuSealWebhook
// ─────────────────────────────────────────────────────────────────────────────
exports.mmDocuSealWebhook = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST')   return res.status(405).send('Method Not Allowed');

  try {
    const event = req.body;

    if (event.event_type === 'form.completed') {
      const submitter  = event.data;
      const metadata   = submitter.submission?.metadata || {};
      const documentId = metadata.document_id;
      const mmEmails   = Object.values(MM_SIGNERS).map(s => s.email);
      const isMMSigner = mmEmails.includes(submitter.email);

      if (documentId) {
        await db.collection('mm_documents').doc(documentId).update(
          isMMSigner
            ? { mmSigned: true,          mmSignedAt:          admin.firestore.FieldValue.serverTimestamp() }
            : { counterpartySigned: true, counterpartySignedAt: admin.firestore.FieldValue.serverTimestamp() }
        );
      }
    }

    if (event.event_type === 'submission.completed') {
      const submission    = event.data;
      const metadata      = submission.metadata || {};
      const docType       = metadata.doc_type;
      const documentId    = metadata.document_id;
      const contractorUid = metadata.counterparty_uid;
      const eventId       = metadata.event_id;
      const engagementId  = metadata.engagement_id;
      const contextName   = metadata.context_name;
      const pdfFilename   = metadata.pdf_filename;
      const signedDocUrl  = submission.documents?.[0]?.url || null;

      if (docType === 'ic_agreement' && contractorUid) {
        const snap = await db.collection('volunteerProfiles').where('uid', '==', contractorUid).limit(1).get();
        if (!snap.empty) {
          await snap.docs[0].ref.update({
            ic_agreement_signed:    true,
            ic_agreement_signed_at: admin.firestore.FieldValue.serverTimestamp(),
            agreementsCompleted:    true,
            signed_ic_url:          signedDocUrl,
          });
        }
      }

      if ((docType === 'waiver' || docType === 'third_party_staffing_waiver') && eventId) {
        await db.collection('events').doc(eventId).update({
          waiver_signed:    true,
          waiver_signed_at: admin.firestore.FieldValue.serverTimestamp(),
          waiver_doc_url:   signedDocUrl,
        });
      }

      if (documentId) {
        await db.collection('mm_documents').doc(documentId).update({
          signingStatus: 'completed', bothSigned: true,
          status: 'signed',  // ← sync review status
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          signedDocumentUrl: signedDocUrl,
        });
      }

      if (engagementId && ['msa', 'sow', 'proposal'].includes(docType)) {
        await db.collection('pipeline').doc(engagementId).update({
          [`docs_signed.${docType}`]:    true,
          [`docs_signed_at.${docType}`]: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (signedDocUrl && contextName && pdfFilename) {
        try {
          const { driveViewLink } = await uploadSignedDocToDrive(
            signedDocUrl, `SIGNED_${pdfFilename}`, contextName
          );
          if (documentId) {
            await db.collection('mm_documents').doc(documentId).update({ driveViewLink });
          }
        } catch (e) { console.warn('Drive upload failed (non-fatal):', e.message); }
      }

      await db.collection('activity_log').add({
        description: `Document fully executed — ${docType} (submission ${submission.id})`,
        event_id: eventId || null, type: 'document',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('mmDocuSealWebhook error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// saveMMDocRecord
// Saves a generated doc record with full status/review layer
// Storage path is now structured: clients/{client}/events/{eventId}/documents/
// ─────────────────────────────────────────────────────────────────────────────
exports.saveMMDocRecord = onCall(async (request) => {
  const {
    filename, url, docType, storagePath, contextId, contextName,
    operatorName, eventId, engagementId, counterpartyName,
    counterpartyEmail, counterpartyUid, pipelineId
  } = request.data;

  if (!filename || !url || !docType) {
    throw new HttpsError('invalid-argument', 'filename, url, and docType are required');
  }

  try {
    const reviewers = getReviewers(operatorName);

    const ref = await db.collection('mm_documents').add({
      name: filename, fileName: filename, docType, url, downloadUrl: url,
      storagePath: storagePath || null,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contextId:    contextId    || null,
      contextName:  contextName  || null,
      eventId:      eventId      || null,
      engagementId: engagementId || null,
      pipelineId:   pipelineId   || null,
      operatorName:      operatorName      || null,
      generatedBy:       operatorName      || null,
      counterpartyName:  counterpartyName  || null,
      counterpartyEmail: counterpartyEmail || null,
      counterpartyUid:   counterpartyUid   || null,

      // ── Review / approval state ───────────────────────────────────────────
      status:      'draft',
      reviewers,
      reviewedBy:  null,
      approvedBy:  null,
      approvedAt:  null,
      sharedBy:    null,
      sharedAt:    null,

      // ── Signing state ─────────────────────────────────────────────────────
      signingStatus:     'not_started',
      requiresSignature: true,
      mmSigned:          false,
      counterpartySigned: false,
      bothSigned:        false,
      signedDocumentUrl: null,

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, documentId: ref.id };
  } catch (err) {
    throw new HttpsError('internal', err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// approveMMDoc
// Founders only — flips status to 'approved', unlocking Sign & Send
// ─────────────────────────────────────────────────────────────────────────────
exports.approveMMDoc = onCall(async (request) => {
  const { documentId, approvedBy } = request.data;

  if (!documentId || !approvedBy) {
    throw new HttpsError('invalid-argument', 'documentId and approvedBy are required');
  }

  const name      = (approvedBy || '').toLowerCase();
  const isFounder = name.includes('ashley') || name.includes('mikal');
  if (!isFounder) {
    throw new HttpsError('permission-denied', 'Only founders can approve documents.');
  }

  try {
    await db.collection('mm_documents').doc(documentId).update({
      status:     'approved',
      approvedBy,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('activity_log').add({
      description: `Document approved by ${approvedBy}`,
      documentId, type: 'document',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    throw new HttpsError('internal', err.message);
  }
});

// ─── EmailJS config ───────────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID  = 'service_jxgb2v9';
const EMAILJS_TEMPLATE_ID = 'template_30u4xwv';
const EMAILJS_PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY  || '';
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY || '';

const REVIEWER_EMAILS = {
  'Ashley Glenn':      { email: process.env.ASHLEY_EMAIL  || 'ashley@motionmethodgroup.com',  name: 'Ashley' },
  'Mikal Driver':      { email: process.env.MIKAL_EMAIL   || 'mikal@motionmethodgroup.com',    name: 'Mikal'  },
};

const DOC_TYPE_LABELS = {
  proposal:     'Proposal',
  sow:          'Statement of Work',
  msa:          'Master Service Agreement',
  ic_agreement: 'IC Agreement',
  waiver:       'Third-Party Staffing Waiver',
  invoice:      'Invoice',
};

async function sendReviewEmail({ reviewerName, reviewerEmail, sharedBy, docType, eventName, docUrl, documentId }) {
  const reviewLink = `https://axis.motionmethodgroup.com/documents?review=${documentId}`;
  const docLabel   = DOC_TYPE_LABELS[docType] || docType;

  const payload = {
    service_id:  EMAILJS_SERVICE_ID,
    template_id: EMAILJS_TEMPLATE_ID,
    user_id:     EMAILJS_PUBLIC_KEY,
    accessToken: EMAILJS_PRIVATE_KEY,
    template_params: {
      reviewer_name:  reviewerName,
      reviewer_email: reviewerEmail,
      shared_by:      sharedBy,
      doc_type:       docLabel,
      event_name:     eventName || 'this engagement',
      doc_url:        docUrl,
      review_link:    reviewLink,
    },
  };

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EmailJS failed (${res.status}): ${text}`);
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// shareMMDocForReview
// Moves doc to pending_review — emails each reviewer with doc link + Axis link
// Internal only: no DocuSeal, no client visibility
// ─────────────────────────────────────────────────────────────────────────────
exports.shareMMDocForReview = onCall(async (request) => {
  const { documentId, sharedBy } = request.data;

  if (!documentId) {
    throw new HttpsError('invalid-argument', 'documentId is required');
  }

  try {
    const docSnap = await db.collection('mm_documents').doc(documentId).get();
    if (!docSnap.exists) throw new HttpsError('not-found', 'Document not found');

    const docData   = docSnap.data();
    const reviewers = docData.reviewers || [];

    // Send email to each reviewer
    const emailResults = [];
    for (const reviewerName of reviewers) {
      const reviewer = REVIEWER_EMAILS[reviewerName];
      if (!reviewer) {
        console.warn(`No email config for reviewer: ${reviewerName}`);
        continue;
      }
      try {
        await sendReviewEmail({
          reviewerName:  reviewer.name,
          reviewerEmail: reviewer.email,
          sharedBy:      sharedBy || 'M&M Operations',
          docType:       docData.docType,
          eventName:     docData.contextName,
          docUrl:        docData.url,
          documentId,
        });
        emailResults.push({ reviewer: reviewerName, sent: true });
        console.log(`Review email sent to ${reviewerName} (${reviewer.email})`);
      } catch (emailErr) {
        // Non-fatal — status already updated, just log the failure
        console.error(`Failed to email ${reviewerName}:`, emailErr.message);
        emailResults.push({ reviewer: reviewerName, sent: false, error: emailErr.message });
      }
    }

    const anySuccess = emailResults.some(r => r.sent);
    if (!anySuccess) {
      throw new HttpsError('internal', `Email delivery failed for all reviewers: ${emailResults.map(r => r.error).join('; ')}`);
    }

    await db.collection('mm_documents').doc(documentId).update({
      status:    'pending_review',
      sharedBy:  sharedBy || null,
      sharedAt:  admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('activity_log').add({
      description: `Document shared for review by ${sharedBy} — reviewers: ${reviewers.join(', ')}`,
      documentId, type: 'document',
      emailResults,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, reviewers, emailResults };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message);
  }
});