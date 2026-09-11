import { VoiceNote } from '../types.ts';
import { getAllLocalNotes, deleteLocalNote } from './db.ts';

/**
 * Checks whether a note is one of the initial template sample/dummy notes.
 */
export function isDummyNote(note: Partial<VoiceNote>): boolean {
  if (!note) return false;

  const id = String(note.id || '').toLowerCase();
  if (['note_1', 'note_2', 'note_3', 'note_4', 'note_5', 'note_6', 'note_7'].includes(id)) {
    return true;
  }
  if (id.startsWith('demo_') || id.startsWith('dummy_') || id.startsWith('sample_')) {
    return true;
  }

  const title = (note.title || '').toLowerCase();
  const transcript = (note.transcript || '').toLowerCase();
  const summary = (note.summary || '').toLowerCase();
  const tags = Array.isArray(note.tags) ? note.tags.map((t) => String(t).toLowerCase()) : [];

  // 1. Check for specific known dummy note keywords
  const dummyKeywords = [
    // Culinary / Noma / Risotto dummy notes
    'noma',
    'foraging philosophy',
    'sea buckthorn',
    'fermented wild mushrooms',
    'terroir',
    'truffle risotto',
    'saffron paella',
    'lamb tagine',
    'chocolate fondant',
    'gourmet cuisine',
    'gourmet adventures',
    'culinary experiments',
    'tasting notes',

    // Matrix / UDEX dummy notes
    'udex',
    'matrix integration',
    'trigger those plugins from matrix',
    'plugins to boards',

    // Pursuit of Happyness / Film Analysis dummy notes
    'pursuit of happyness',
    'narrative structure analysis',
    'narrative structure',
    'film analysis',
    'themes of resilience and determination',
    'perseverance in the face of adversity',

    // Generic placeholders
    'spoken memo recorded',
    'audio note recorded',
    'spoken voice note',
    'spoken audio snippet',
    'whimsical widget',
    'whimsical widgets',
    'review report and prepare slides',
    'quarterly progress report',
    'schedule dentist',
    'dentist appointment',
    'dummy note',
    'sample note',
    'test note',
  ];

  for (const kw of dummyKeywords) {
    if (title.includes(kw) || transcript.includes(kw) || summary.includes(kw)) {
      return true;
    }
  }

  // 2. Check for known dummy tag combinations
  const dummyTags = [
    'noma',
    'foraging',
    'fermentation',
    'udex',
    'matrix',
    'paella',
    'truffle',
    'chefs',
  ];

  if (tags.some((tag) => dummyTags.includes(tag))) {
    return true;
  }

  // 3. Check for exact generic fallback titles/transcripts
  if (title === 'spoken memo recorded' || transcript === 'spoken memo recorded') return true;
  if (title === 'audio note recorded' || transcript === 'audio note recorded') return true;
  if (title === 'spoken voice note' || transcript === 'spoken voice note') return true;

  return false;
}

/**
 * Thoroughly purges all dummy/sample notes from local IndexedDB storage.
 */
export async function purgeAllDummyNotes(): Promise<string[]> {
  try {
    const existing = await getAllLocalNotes();
    const purgedIds: string[] = [];

    for (const n of existing) {
      if (isDummyNote(n)) {
        await deleteLocalNote(n.id);
        purgedIds.push(n.id);
      }
    }

    return purgedIds;
  } catch (err) {
    console.warn('Error purging local dummy notes:', err);
    return [];
  }
}

/**
 * Legacy compatibility hook: does not seed any notes and deletes all dummies.
 */
export async function seedDemoNotesIfEmpty(): Promise<void> {
  await purgeAllDummyNotes();
}
