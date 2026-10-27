const DB_NAME = "apex-local-files-v1";
const STORE_NAME = "files";

function openFileDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) return reject(new Error("Local file storage is unavailable in this browser."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local file storage."));
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}

async function withFileStore(mode, action) {
  const db = await openFileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Local file storage failed."));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Local file storage failed.")); };
  });
}

export function saveLocalFile(id, dataUrl) { return withFileStore("readwrite", (store) => store.put(dataUrl, id)); }
export function loadLocalFile(id) { return withFileStore("readonly", (store) => store.get(id)); }
export function deleteLocalFile(id) { return withFileStore("readwrite", (store) => store.delete(id)); }
