/**
 * driveUtils.js
 * Google Drive API utilities for M&M Operations — Axis Desktop
 *
 * Flow:
 *   1. signInWithGoogle() → gets OAuth token with Drive scope
 *   2. createClientFolder() → creates Clients/[name] under parent
 *   3. copyTemplatesForPillar() → copies All Pillars + pillar-specific templates
 *   4. Returns folder URL to write back to Firestore
 */

const TEMPLATES_FOLDER_ID = "1181vXektOGzQQZjUt0-ysQwvbrJls1kh";

// Subfolder names inside _Templates that match each pillar
const PILLAR_FOLDER_MAP = {
  "Pillar 1":            ["All Pillars", "P1"],
  "Pillar 2":            ["All Pillars", "P2"],
  "Pillar 3":            ["All Pillars", "P3"],
  "Pillar 4":            ["All Pillars", "P4"],
  "P1":                  ["All Pillars", "P1"],
  "P2":                  ["All Pillars", "P2"],
  "P3":                  ["All Pillars", "P3"],
  "P4":                  ["All Pillars", "P4"],
  "Event Execution":     ["All Pillars", "P1"],
  "Leadership Training": ["All Pillars", "P2"],
  "Joint Planning":      ["All Pillars", "P3"],
  "Infrastructure":      ["All Pillars", "P4"],
  "Tier 0":              ["All Pillars", "Tier 0"],
};

// ─── OAuth ────────────────────────────────────────────────────────────────────

/**
 * Opens Google OAuth popup and returns an access token with Drive scope.
 * Requires VITE_GOOGLE_CLIENT_ID in .env
 */
export async function getDriveAccessToken() {
  return new Promise((resolve, reject) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      reject(new Error("VITE_GOOGLE_CLIENT_ID not set in .env"));
      return;
    }

    // Use Google Identity Services tokenClient
    if (!window.google?.accounts?.oauth2) {
      reject(new Error("Google Identity Services not loaded. Add the GIS script to index.html."));
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive",
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.access_token);
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

// ─── Drive API helpers ────────────────────────────────────────────────────────

async function driveRequest(path, method = "GET", body = null, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Drive API error ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  return res.json();
}

/**
 * List files/folders inside a given folder ID
 */
async function listFolder(folderId, token) {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const data = await driveRequest(
    `/files?q=${query}&fields=files(id,name,mimeType)&pageSize=100`,
    "GET", null, token
  );
  return data.files || [];
}

/**
 * Create a folder inside a parent folder
 */
async function createFolder(name, parentId, token) {
  return driveRequest("/files", "POST", {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  }, token);
}

/**
 * Copy a file into a destination folder
 */
async function copyFile(fileId, destFolderId, fileName, token) {
  return driveRequest(`/files/${fileId}/copy`, "POST", {
    name: fileName,
    parents: [destFolderId],
  }, token);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Creates the client folder and copies templates.
 *
 * @param {object} params
 * @param {string} params.clientName     - Client/org name
 * @param {string} params.eventName      - Event name
 * @param {string} params.eventDate      - Event date string (used for folder name)
 * @param {string} params.pillar         - Pillar string (e.g. "Pillar 1", "P2", "Tier 0")
 * @param {string} params.accessToken    - OAuth access token
 * @returns {Promise<string>}            - Drive folder URL
 */
export async function createEventDriveFolder({ clientName, eventName, eventDate, pillar, accessToken }) {
  // Build folder name: "Client — Event Name Month Year"
  let dateSuffix = "";
  if (eventDate) {
    const d = new Date(eventDate);
    if (!isNaN(d)) {
      dateSuffix = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } else {
      dateSuffix = eventDate;
    }
  }
  const folderName = [
    clientName || "Client",
    "—",
    eventName || "Event",
    dateSuffix,
  ].filter(Boolean).join(" ").trim();

  // 1. Find or create Clients/ subfolder under the M&M parent
  //    We look for it as a sibling of _Templates
  const templatesParentId = await getParentFolderId(TEMPLATES_FOLDER_ID, accessToken);
  const clientsFolder = await findOrCreateFolder("Clients", templatesParentId, accessToken);

  // 2. Create the event folder inside Clients/
  const eventFolder = await createFolder(folderName, clientsFolder.id, accessToken);
  const eventFolderId = eventFolder.id;

  // 3. Determine which template subfolders to copy from
  const normalizedPillar = pillar || "";
  const subfoldersToCopy = PILLAR_FOLDER_MAP[normalizedPillar]
    || PILLAR_FOLDER_MAP[normalizedPillar.split(" ").slice(0, 2).join(" ")]
    || ["All Pillars"];

  // 4. List _Templates subfolders
  const templateSubfolders = await listFolder(TEMPLATES_FOLDER_ID, accessToken);

  // 5. Copy files from each relevant subfolder
  for (const subfolderName of subfoldersToCopy) {
    const subfolder = templateSubfolders.find(
      f => f.name.toLowerCase() === subfolderName.toLowerCase()
        && f.mimeType === "application/vnd.google-apps.folder"
    );
    if (!subfolder) {
      console.warn(`Template subfolder "${subfolderName}" not found — skipping`);
      continue;
    }

    const files = await listFolder(subfolder.id, accessToken);
    for (const file of files) {
      if (file.mimeType === "application/vnd.google-apps.folder") continue; // skip nested folders
      await copyFile(file.id, eventFolderId, file.name, accessToken);
    }
  }

  return `https://drive.google.com/drive/folders/${eventFolderId}`;
}

/**
 * Gets the parent folder ID of a given file/folder
 */
async function getParentFolderId(fileId, token) {
  const data = await driveRequest(
    `/files/${fileId}?fields=parents`,
    "GET", null, token
  );
  return data.parents?.[0] || null;
}

/**
 * Finds a folder by name inside a parent, or creates it if missing
 */
async function findOrCreateFolder(name, parentId, token) {
  const files = await listFolder(parentId, token);
  const existing = files.find(
    f => f.name === name && f.mimeType === "application/vnd.google-apps.folder"
  );
  if (existing) return existing;
  return createFolder(name, parentId, token);
}