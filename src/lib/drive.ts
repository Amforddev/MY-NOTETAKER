import { VoiceNote } from '../types.ts';
import { getAccessToken } from './googleAuth.ts';
import { isDummyNote } from './seed.ts';

const DRIVE_FOLDER_NAME = 'Tempo Voice Notes';
let cachedFolderId: string | null = null;

/**
 * Gets or creates the application folder in the user's Google Drive.
 */
export async function getOrCreateDriveFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  // 1. Search for existing folder
  const query = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and name = '${DRIVE_FOLDER_NAME}' and trashed = false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      cachedFolderId = data.files[0].id;
      return cachedFolderId!;
    }
  }

  // 2. Create the folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    throw new Error('Failed to create folder in Google Drive');
  }

  const folderData = await createRes.json();
  cachedFolderId = folderData.id;
  return cachedFolderId!;
}

/**
 * Saves or updates a VoiceNote JSON document in Google Drive.
 */
export async function saveNoteToDrive(note: VoiceNote): Promise<string | null> {
  // Never save dummy notes to Google Drive
  if (isDummyNote(note)) {
    return null;
  }

  const token = await getAccessToken();
  if (!token) return null;

  try {
    const folderId = await getOrCreateDriveFolder(token);
    const fileName = `${note.id}.json`;

    // Check if file already exists in folder
    const searchQ = encodeURIComponent(
      `'${folderId}' in parents and name = '${fileName}' and trashed = false`
    );
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${searchQ}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const serializedNote = JSON.stringify({
      id: note.id,
      title: note.title,
      transcript: note.transcript,
      summary: note.summary || '',
      tags: note.tags || [],
      duration: note.duration || 0,
      mimeType: note.mimeType || 'audio/webm',
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      isFavorite: Boolean(note.isFavorite),
      isPinned: Boolean(note.isPinned),
      isDeleted: Boolean(note.isDeleted),
      audioDataUrl: note.audioDataUrl || '',
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const existingFileId = searchData.files[0].id;
        // Update existing file content
        await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: serializedNote,
          }
        );
        return existingFileId;
      }
    }

    // Create new file with multipart upload
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
      description: `Voice Note: ${note.title}`,
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      serializedNote +
      closeDelim;

    const createRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (createRes.ok) {
      const newFile = await createRes.json();
      return newFile.id;
    }
    return null;
  } catch (err) {
    console.warn('[Drive] saveNoteToDrive error:', err);
    return null;
  }
}

/**
 * Retrieves all VoiceNotes saved in the Google Drive folder.
 * Automatically purges and filters out any dummy/demo notes.
 */
export async function fetchNotesFromDrive(): Promise<VoiceNote[]> {
  const token = await getAccessToken();
  if (!token) return [];

  try {
    const folderId = await getOrCreateDriveFolder(token);
    const searchQ = encodeURIComponent(
      `'${folderId}' in parents and mimeType = 'application/json' and trashed = false`
    );
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${searchQ}&fields=files(id,name,modifiedTime)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const files: Array<{ id: string; name: string }> = data.files || [];

    const notes: VoiceNote[] = [];
    for (const file of files) {
      try {
        const fileContentRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (fileContentRes.ok) {
          const parsed = await fileContentRes.json();
          // Check if this is a dummy note: if so, purge it from Google Drive immediately!
          if (
            isDummyNote(parsed) ||
            ['note_1.json', 'note_2.json', 'note_3.json'].includes(file.name)
          ) {
            // Delete the dummy note from Drive
            fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
            continue;
          }

          if (parsed && parsed.id && parsed.title && parsed.transcript !== undefined) {
            notes.push(parsed as VoiceNote);
          }
        }
      } catch (fErr) {
        console.warn(`[Drive] Error downloading file ${file.id}:`, fErr);
      }
    }

    return notes;
  } catch (err) {
    console.warn('[Drive] fetchNotesFromDrive error:', err);
    return [];
  }
}

/**
 * Deletes a note file from Google Drive.
 */
export async function deleteNoteFromDrive(noteId: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  try {
    const folderId = await getOrCreateDriveFolder(token);
    const fileName = `${noteId}.json`;
    const searchQ = encodeURIComponent(
      `'${folderId}' in parents and name = '${fileName}' and trashed = false`
    );
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${searchQ}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const fileId = searchData.files[0].id;
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn('[Drive] deleteNoteFromDrive error:', err);
    return false;
  }
}

/**
 * Deletes any dummy/sample notes directly from the Google Drive folder.
 */
export async function purgeDummyNotesFromDrive(): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;

  try {
    const folderId = await getOrCreateDriveFolder(token);
    const searchQ = encodeURIComponent(
      `'${folderId}' in parents and mimeType = 'application/json' and trashed = false`
    );
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${searchQ}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        for (const f of data.files) {
          try {
            const contentRes = await fetch(
              `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            if (contentRes.ok) {
              const noteData = await contentRes.json();
              if (isDummyNote(noteData)) {
                await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${token}` },
                });
              }
            }
          } catch {
            // Ignore single file error and continue
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Drive] purgeDummyNotesFromDrive error:', err);
  }
}
