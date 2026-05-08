// ─────────────────────────────────────────────────────────────────────────────
// saveMMDocRecord — Cloud Function
// Replaces the existing saveMMDocRecord function in functions/index.js
// Adds: status layer, reviewer routing, structured storage path
// ─────────────────────────────────────────────────────────────────────────────

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// Reviewer routing — who reviews whose docs
// Shanell always needs a founder. Founders review each other.
function getReviewers(generatedBy) {
  const name = (generatedBy || "").toLowerCase();
  if (name.includes("ashley")) return ["Mikal Driver"];
  if (name.includes("mikal"))  return ["Ashley Glenn"];
  // Shanell or anyone else — both founders
  return ["Ashley Glenn", "Mikal Driver"];
}

exports.saveMMDocRecord = onCall(async (request) => {
  const db = getFirestore();
  const data = request.data;

  const {
    filename,
    url,
    storagePath,
    docType,
    contextId,
    contextName,
    operatorName,
    eventId,
    engagementId,
    counterpartyName,
    counterpartyEmail,
    counterpartyUid,
  } = data;

  if (!filename || !url || !docType || !contextId) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const reviewers = getReviewers(operatorName);

  const docRecord = {
    filename,
    url,
    storagePath,
    docType,
    contextId,
    contextName,
    operatorName,      // who generated it
    generatedBy: operatorName,
    eventId:      eventId || null,
    engagementId: engagementId || null,
    counterpartyName:  counterpartyName  || null,
    counterpartyEmail: counterpartyEmail || null,
    counterpartyUid:   counterpartyUid   || null,

    // ── Review / approval state ───────────────────────────────────────────
    status:      "draft",          // draft | pending_review | approved | sent | signed
    reviewers,                     // array of names who should review
    reviewedBy:  null,
    approvedBy:  null,
    approvedAt:  null,

    // ── Signing state (set by DocuSeal webhook later) ─────────────────────
    signingStatus:    null,
    mmSigned:         false,
    clientSigned:     false,
    bothSigned:       false,
    signedDocumentUrl: null,

    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("mm_documents").add(docRecord);

  return { documentId: ref.id };
});


// ─────────────────────────────────────────────────────────────────────────────
// approveMMDoc — Cloud Function
// Called when a founder approves a doc for sending
// ─────────────────────────────────────────────────────────────────────────────
exports.approveMMDoc = onCall(async (request) => {
  const db = getFirestore();
  const { documentId, approvedBy } = request.data;

  if (!documentId || !approvedBy) {
    throw new HttpsError("invalid-argument", "Missing documentId or approvedBy.");
  }

  // Only founders can approve
  const name = (approvedBy || "").toLowerCase();
  const isFounder = name.includes("ashley") || name.includes("mikal");
  if (!isFounder) {
    throw new HttpsError("permission-denied", "Only founders can approve documents.");
  }

  await db.collection("mm_documents").doc(documentId).update({
    status:     "approved",
    approvedBy,
    approvedAt: FieldValue.serverTimestamp(),
    updatedAt:  FieldValue.serverTimestamp(),
  });

  return { success: true };
});


// ─────────────────────────────────────────────────────────────────────────────
// shareMMDocForReview — Cloud Function
// Sends internal email to reviewer(s) with the Storage link
// No DocuSeal, no client visibility — internal only
// ─────────────────────────────────────────────────────────────────────────────
exports.shareMMDocForReview = onCall(async (request) => {
  const db = getFirestore();
  const { documentId, sharedBy } = request.data;

  if (!documentId) {
    throw new HttpsError("invalid-argument", "Missing documentId.");
  }

  const docSnap = await db.collection("mm_documents").doc(documentId).get();
  if (!docSnap.exists) {
    throw new HttpsError("not-found", "Document not found.");
  }

  const docData = docSnap.data();
  const reviewers = docData.reviewers || [];

  // Update status to pending_review
  await db.collection("mm_documents").doc(documentId).update({
    status:    "pending_review",
    sharedBy,
    sharedAt:  FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // TODO: send email to each reviewer via EmailJS / SendGrid
  // Each reviewer gets: docData.url, docData.filename, docData.contextName, documentId
  // Email should include an "Approve" deep link back to Axis Desktop
  // For now this just updates status — wire email when ready

  return { success: true, reviewers };
});