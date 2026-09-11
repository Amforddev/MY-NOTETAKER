import { VoiceNote } from '../types.ts';

const DB_NAME = 'voice_notes_offline_db';
const DB_VERSION = 1;
const STORE_NOTES = 'notes';
const STORE_META = 'sync_meta';

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        const noteStore = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
        noteStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        noteStore.createIndex('category', 'category', { unique: false });
        noteStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        noteStore.createIndex('isPinned', 'isPinned', { unique: false });
        noteStore.createIndex('isFavorite', 'isFavorite', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// Read all notes from IndexedDB
export async function getAllLocalNotes(): Promise<VoiceNote[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readonly');
    const store = tx.objectStore(STORE_NOTES);
    const req = store.getAll();

    req.onsuccess = () => {
      const notes = (req.result as VoiceNote[]) || [];
      // Sort: pinned first, then newest updatedAt desc
      notes.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
      resolve(notes);
    };

    req.onerror = () => reject(req.error);
  });
}

// Get single note
export async function getLocalNote(id: string): Promise<VoiceNote | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readonly');
    const store = tx.objectStore(STORE_NOTES);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// Save or update note locally
export async function saveLocalNote(note: VoiceNote): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readwrite');
    const store = tx.objectStore(STORE_NOTES);
    const req = store.put(note);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Bulk save notes (e.g. from server sync)
export async function bulkUpsertLocalNotes(notes: VoiceNote[]): Promise<void> {
  if (notes.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readwrite');
    const store = tx.objectStore(STORE_NOTES);
    
    for (const note of notes) {
      store.put(note);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Delete note locally and track for cloud sync
export async function deleteLocalNote(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NOTES, STORE_META], 'readwrite');
    const noteStore = tx.objectStore(STORE_NOTES);
    const metaStore = tx.objectStore(STORE_META);

    noteStore.delete(id);

    // Add to deleted queue
    const getDeletedReq = metaStore.get('deleted_ids');
    getDeletedReq.onsuccess = () => {
      const currentIds: string[] = getDeletedReq.result?.value || [];
      if (!currentIds.includes(id)) {
        currentIds.push(id);
      }
      metaStore.put({ key: 'deleted_ids', value: currentIds });
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Get deleted IDs queued for sync
export async function getQueuedDeletedIds(): Promise<string[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const req = store.get('deleted_ids');
    req.onsuccess = () => resolve(req.result?.value || []);
    req.onerror = () => reject(req.error);
  });
}

// Clear queued deleted IDs after successful sync
export async function clearQueuedDeletedIds(idsToRemove: string[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    const req = store.get('deleted_ids');
    
    req.onsuccess = () => {
      const current: string[] = req.result?.value || [];
      const filtered = current.filter((id) => !idsToRemove.includes(id));
      store.put({ key: 'deleted_ids', value: filtered });
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Meta: Last sync timestamp
export async function getLastSyncTimestamp(): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const req = store.get('last_sync_timestamp');
    req.onsuccess = () => resolve(req.result?.value || 0);
    req.onerror = () => reject(req.error);
  });
}

export async function setLastSyncTimestamp(ts: number): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    store.put({ key: 'last_sync_timestamp', value: ts });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Clear all local notes completely
export async function clearAllLocalNotes(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readwrite');
    const store = tx.objectStore(STORE_NOTES);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

