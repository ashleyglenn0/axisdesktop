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
  ASHLEY:  { name: 'Ashley Glenn',      email: process.env.ASHLEY_EMAIL  || 'ashleyg@motionmethodgroup.com',  role: 'Founder' },
  MIKAL:   { name: 'Mikal Driver',      email: process.env.MIKAL_EMAIL   || 'mikal@motionmethodgroup.com',    role: 'Founder' },
  SHANELL: { name: 'Shanell Jefferson', email: process.env.SHANELL_EMAIL || 'shanell@motionmethodgroup.com',  role: 'Senior Ops Manager' },
};

const SHANELL_SIGNABLE = ['ic_agreement'];
const FOUNDER_ONLY     = ['msa', 'sow', 'proposal', 'waiver', 'third_party_staffing_waiver'];

// Template file name patterns in Drive
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
  if (!files || files.length === 0) {
    throw new Error(`Template not found in Drive: ${templateName}`);
  }

  const file = files[0];

  // Google Docs export as docx
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const exportRes = await drive.files.export(
      { fileId: file.id, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(exportRes.data);
  }

  // Already a .docx — download directly
  const downloadRes = await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(downloadRes.data);
}

// ─── Fill template placeholders ───────────────────────────────────────────────
// Opens the .docx ZIP, replaces bracket placeholders in word/document.xml
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

// ─── convertDocxToPdf ────────────────────────────────────────────────────────
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
// Pulls template from Drive, fills placeholders, uploads to Storage,
// saves Firestore record, returns documentId + url for Sign & Send
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

      // Save email back to talent_pool on IC Agreement generation
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
      const submission   = event.data;
      const metadata     = submission.metadata || {};
      const docType      = metadata.doc_type;
      const documentId   = metadata.document_id;
      const contractorUid = metadata.counterparty_uid;
      const eventId      = metadata.event_id;
      const engagementId = metadata.engagement_id;
      const contextName  = metadata.context_name;
      const pdfFilename  = metadata.pdf_filename;
      const signedDocUrl = submission.documents?.[0]?.url || null;

      // IC Agreement: unlock shifts
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

      // Waiver: flag on event
      if ((docType === 'waiver' || docType === 'third_party_staffing_waiver') && eventId) {
        await db.collection('events').doc(eventId).update({
          waiver_signed: true,
          waiver_signed_at: admin.firestore.FieldValue.serverTimestamp(),
          waiver_doc_url: signedDocUrl,
        });
      }

      // Update mm_documents
      if (documentId) {
        await db.collection('mm_documents').doc(documentId).update({
          signingStatus: 'completed', bothSigned: true,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          signedDocumentUrl: signedDocUrl,
        });
      }

      // Pipeline: flag signed docs
      if (engagementId && ['msa', 'sow', 'proposal'].includes(docType)) {
        await db.collection('pipeline').doc(engagementId).update({
          [`docs_signed.${docType}`]:    true,
          [`docs_signed_at.${docType}`]: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Upload signed PDF to Drive client folder
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
// ─────────────────────────────────────────────────────────────────────────────
exports.saveMMDocRecord = onCall(async (request) => {
  const { filename, url, docType, storagePath, contextId, contextName,
          operatorName, eventId, engagementId, counterpartyName,
          counterpartyEmail, counterpartyUid } = request.data;

  if (!filename || !url || !docType) {
    throw new HttpsError('invalid-argument', 'filename, url, and docType are required');
  }

  try {
    const ref = await db.collection('mm_documents').add({
      name: filename, fileName: filename, docType, url, downloadUrl: url,
      storagePath: storagePath || null,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contextId: contextId || null, contextName: contextName || null,
      eventId: eventId || null, engagementId: engagementId || null,
      operatorName: operatorName || null,
      counterpartyName: counterpartyName || null,
      counterpartyEmail: counterpartyEmail || null,
      counterpartyUid: counterpartyUid || null,
      signingStatus: 'not_started', requiresSignature: true,
      mmSigned: false, counterpartySigned: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, documentId: ref.id };
  } catch (err) {
    throw new HttpsError('internal', err.message);
  }
});