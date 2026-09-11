import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Trash2,
  Inbox,
  RefreshCw,
  LogOut,
  CheckCircle2,
  Cloud,
  FolderOpen,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import { VoiceNote } from './types.ts';
import {
  getAllLocalNotes,
  saveLocalNote,
  deleteLocalNote,
} from './lib/db.ts';
import { isDummyNote, purgeAllDummyNotes } from './lib/seed.ts';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  getAccessToken,
  setCachedAccessToken,
} from './lib/googleAuth.ts';
import {
  saveNoteToDrive,
  fetchNotesFromDrive,
  deleteNoteFromDrive,
  purgeDummyNotesFromDrive,
} from './lib/drive.ts';
import { TempoSidebar } from './components/TempoSidebar.tsx';
import { SnippetCard } from './components/SnippetCard.tsx';
import { FloatingRecordingStudio } from './components/FloatingRecordingStudio.tsx';
import { SearchModal } from './components/SearchModal.tsx';

export default function App() {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [currentNav, setCurrentNav] = useState<'All Notes' | 'Trash'>('All Notes');

  // Google Drive & Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [driveStatusMsg, setDriveStatusMsg] = useState<string | null>(null);

  // Search & Voice Update Target
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [voiceUpdateTarget, setVoiceUpdateTarget] = useState<VoiceNote | null>(null);

  // Confirm delete dialog state (as required for destructive Workspace operations)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    id: string;
    title: string;
    isPermanent: boolean;
  } | null>(null);

  // Reload notes from local IndexedDB with dummy filter
  const refreshNotes = useCallback(async () => {
    try {
      await purgeAllDummyNotes();
      const localNotes = await getAllLocalNotes();
      const cleanNotes = localNotes.filter((n) => !isDummyNote(n));
      setNotes(cleanNotes);
    } catch (err) {
      console.error('Failed to load notes from DB:', err);
    }
  }, []);

  // Sync notes from Google Drive
  const syncWithDrive = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;

    setIsSyncingDrive(true);
    setDriveStatusMsg('Syncing with Google Drive...');
    try {
      // 1. Purge dummy notes from Drive and local first
      await purgeDummyNotesFromDrive();
      await purgeAllDummyNotes();

      // 2. Fetch remote notes from user's Google Drive folder
      const driveNotes = await fetchNotesFromDrive();

      // 3. Fetch current local notes
      const localNotes = (await getAllLocalNotes()).filter((n) => !isDummyNote(n));
      const mergedMap = new Map<string, VoiceNote>();

      // Put drive notes in map (driveNotes already filtered for dummy notes)
      for (const dNote of driveNotes) {
        if (!isDummyNote(dNote)) {
          mergedMap.set(dNote.id, dNote);
        }
      }

      // Merge local notes
      for (const lNote of localNotes) {
        if (isDummyNote(lNote)) continue;

        if (!mergedMap.has(lNote.id)) {
          mergedMap.set(lNote.id, lNote);
          await saveNoteToDrive(lNote);
        } else {
          const dNote = mergedMap.get(lNote.id)!;
          if (lNote.updatedAt > dNote.updatedAt) {
            mergedMap.set(lNote.id, lNote);
            await saveNoteToDrive(lNote);
          }
        }
      }

      const finalNotes = Array.from(mergedMap.values());
      // Save all merged notes to local DB
      for (const n of finalNotes) {
        await saveLocalNote(n);
      }

      // Sort by creation date descending
      finalNotes.sort((a, b) => b.createdAt - a.createdAt);
      setNotes(finalNotes);

      setDriveStatusMsg(`Synced ${finalNotes.length} notes with Google Drive`);
      setTimeout(() => setDriveStatusMsg(null), 3500);
    } catch (err: any) {
      console.warn('Drive sync error:', err);
      setDriveStatusMsg('Sync error: ' + (err.message || 'Check connection'));
      setTimeout(() => setDriveStatusMsg(null), 4000);
    } finally {
      setIsSyncingDrive(false);
    }
  }, []);

  // Initialization: Thoroughly purge all dummy notes and start auth listener
  useEffect(() => {
    const init = async () => {
      try {
        await purgeAllDummyNotes();
        await refreshNotes();
      } catch (e) {
        console.error('Init notes error:', e);
      }
    };

    init();

    // Firebase Auth listener
    const unsubscribe = initAuth(
      async (user, token) => {
        setCurrentUser(user);
        setIsGoogleConnected(true);
        setCachedAccessToken(token);
        // Automatically purge any dummy notes in Drive & sync
        await purgeDummyNotesFromDrive();
        await syncWithDrive();
      },
      () => {
        setCurrentUser(null);
        setIsGoogleConnected(false);
        setCachedAccessToken(null);
      }
    );

    return () => unsubscribe();
  }, [refreshNotes, syncWithDrive]);

  // Sign in to Google
  const handleConnectGoogle = async () => {
    setIsSigningIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setIsGoogleConnected(true);
        setCachedAccessToken(result.accessToken);
        setDriveStatusMsg('Connected to Google Drive');
        setTimeout(() => setDriveStatusMsg(null), 3000);
        await purgeDummyNotesFromDrive();
        await syncWithDrive();
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      setDriveStatusMsg('Connection canceled or failed');
      setTimeout(() => setDriveStatusMsg(null), 3500);
    } finally {
      setIsSigningIn(false);
    }
  };

  // Disconnect Google
  const handleDisconnectGoogle = async () => {
    await logoutGoogle();
    setCurrentUser(null);
    setIsGoogleConnected(false);
    setDriveStatusMsg('Disconnected from Google Drive');
    setTimeout(() => setDriveStatusMsg(null), 3000);
  };

  // Request note deletion (triggers confirmation dialog)
  const handleDeleteNote = (id: string) => {
    const target = notes.find((n) => n.id === id);
    if (!target) return;

    if (currentNav === 'Trash') {
      setDeleteConfirmTarget({
        id,
        title: target.title || 'Untitled Note',
        isPermanent: true,
      });
    } else {
      setDeleteConfirmTarget({
        id,
        title: target.title || 'Untitled Note',
        isPermanent: false,
      });
    }
  };

  // Execute confirmed deletion
  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    const { id, isPermanent } = deleteConfirmTarget;
    setDeleteConfirmTarget(null);

    const target = notes.find((n) => n.id === id);
    if (!target) return;

    if (isPermanent) {
      await deleteLocalNote(id);
      if (isGoogleConnected) {
        await deleteNoteFromDrive(id);
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } else {
      const updated: VoiceNote = {
        ...target,
        isDeleted: true,
        updatedAt: Date.now(),
      };
      await saveLocalNote(updated);
      if (isGoogleConnected) {
        await saveNoteToDrive(updated);
      }
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    }
  };

  // Restore note from Trash
  const handleRestoreNote = async (id: string) => {
    const target = notes.find((n) => n.id === id);
    if (!target) return;

    const updated: VoiceNote = {
      ...target,
      isDeleted: false,
      updatedAt: Date.now(),
    };
    await saveLocalNote(updated);
    if (isGoogleConnected) {
      await saveNoteToDrive(updated);
    }
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
  };

  // Empty Trash with confirmation
  const handleEmptyTrash = async () => {
    const trashed = notes.filter((n) => n.isDeleted);
    if (trashed.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${trashed.length} note(s) from your device and Google Drive? This cannot be undone.`
    );
    if (!confirmed) return;

    for (const t of trashed) {
      await deleteLocalNote(t.id);
      if (isGoogleConnected) {
        await deleteNoteFromDrive(t.id);
      }
    }
    setNotes((prev) => prev.filter((n) => !n.isDeleted));
  };

  // Clear all active notes with confirmation
  const handleClearAllActiveNotes = async () => {
    const active = notes.filter((n) => !n.isDeleted);
    if (active.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to remove all ${active.length} note(s)? This will delete them from your device and Google Drive.`
    );
    if (!confirmed) return;

    for (const n of active) {
      await deleteLocalNote(n.id);
      if (isGoogleConnected) {
        await deleteNoteFromDrive(n.id);
      }
    }
    await purgeAllDummyNotes();
    if (isGoogleConnected) {
      await purgeDummyNotesFromDrive();
    }
    setNotes((prev) => prev.filter((n) => n.isDeleted));
  };

  // Update note (typing edit or voice update)
  const handleUpdateNote = async (updated: VoiceNote) => {
    if (isDummyNote(updated)) return;
    await saveLocalNote(updated);
    if (isGoogleConnected) {
      saveNoteToDrive(updated).catch((err) => console.warn('Drive save error:', err));
    }
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  };

  // Handle Note Created from Recording Studio
  const handleNoteCreated = (newNote: VoiceNote) => {
    if (isDummyNote(newNote)) return;
    setNotes((prev) => [newNote, ...prev]);
    if (isGoogleConnected) {
      saveNoteToDrive(newNote)
        .then(() => {
          setDriveStatusMsg(`Saved "${newNote.title}" to Google Drive`);
          setTimeout(() => setDriveStatusMsg(null), 3000);
        })
        .catch((err) => console.warn('Drive save error:', err));
    }
  };

  // Filter notes based on navigation
  const visibleNotes = useMemo(() => {
    if (currentNav === 'Trash') {
      return notes.filter((n) => n.isDeleted);
    }
    return notes.filter((n) => !n.isDeleted);
  }, [notes, currentNav]);

  const trashCount = useMemo(() => notes.filter((n) => n.isDeleted).length, [notes]);
  const activeCount = useMemo(() => notes.filter((n) => !n.isDeleted).length, [notes]);

  return (
    <div
      id="app-root"
      className="min-h-screen w-full bg-[#EFECE6] text-stone-900 flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 antialiased selection:bg-orange-100 selection:text-[#F16544]"
      style={{
        backgroundImage: `radial-gradient(at 15% 15%, #F7F5F0 0%, transparent 60%), radial-gradient(at 85% 85%, #E9E3D8 0%, transparent 60%)`,
      }}
    >
      {/* ---------------- MAIN APP CONTAINER ---------------- */}
      <div
        id="tempo-app-container"
        className="w-full max-w-6xl rounded-3xl bg-white shadow-2xl border border-stone-200/90 overflow-hidden flex min-h-[90vh] max-h-[95vh] relative"
      >
        {/* Left Sidebar */}
        <TempoSidebar
          currentNav={currentNav}
          onSelectNav={(nav) => setCurrentNav(nav as any)}
          onOpenSearch={() => setIsSearchOpen(true)}
          trashCount={trashCount}
          notesCount={activeCount}
        />

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col bg-white overflow-hidden relative">
          {/* Top Header */}
          <header className="px-6 sm:px-10 pt-5 pb-4 flex flex-wrap items-center justify-between border-b border-stone-100 shrink-0 gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-serif text-stone-900 tracking-tight">
                {currentNav}
              </h1>
              <p className="text-xs text-stone-400 mt-0.5">
                {currentNav === 'Trash'
                  ? 'Notes in trash can be restored or permanently removed.'
                  : `${activeCount} voice ${activeCount === 1 ? 'note' : 'notes'} recorded`}
              </p>
            </div>

            {/* Right Controls: Google Drive Integration & Actions */}
            <div className="flex items-center gap-2.5">
              {/* Google Drive Status / Connect Button */}
              {isGoogleConnected ? (
                <div className="inline-flex items-center gap-2 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl px-3 py-1.5 text-xs text-emerald-800">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <Cloud className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="hidden sm:inline">Google Drive</span>
                  </div>

                  {currentUser?.email && (
                    <span className="hidden md:inline text-stone-500 max-w-[140px] truncate border-l border-emerald-200 pl-2">
                      {currentUser.email}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={syncWithDrive}
                    disabled={isSyncingDrive}
                    title="Sync notes with Google Drive"
                    className="p-1 hover:bg-emerald-100 rounded-lg transition text-emerald-700 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnectGoogle}
                    title="Disconnect Google Drive"
                    className="p-1 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded-lg transition cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  id="connect-google-drive-btn"
                  onClick={handleConnectGoogle}
                  disabled={isSigningIn}
                  className="inline-flex items-center gap-2 bg-white hover:bg-stone-50 border border-stone-300 rounded-2xl px-3.5 py-1.5 text-xs font-medium text-stone-700 shadow-sm transition hover:shadow cursor-pointer disabled:opacity-60"
                >
                  <svg className="h-4 w-4" viewBox="0 0 48 48">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{isSigningIn ? 'Connecting...' : 'Connect Google Drive'}</span>
                </button>
              )}

              {/* Clear All Active Notes Button */}
              {currentNav === 'All Notes' && activeCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllActiveNotes}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-600 hover:text-red-700 px-3 py-1.5 text-xs font-medium transition cursor-pointer"
                  title="Remove all active notes"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear All</span>
                </button>
              )}

              {/* Trash Empty Button */}
              {currentNav === 'Trash' && trashCount > 0 && (
                <button
                  type="button"
                  onClick={handleEmptyTrash}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 text-xs font-medium transition cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Empty Trash</span>
                </button>
              )}
            </div>
          </header>

          {/* Drive Status Notification */}
          {driveStatusMsg && (
            <div className="bg-stone-900 text-white text-xs px-6 py-2 flex items-center justify-between transition animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>{driveStatusMsg}</span>
              </div>
              <span className="text-[10px] text-stone-400">Google Drive: Tempo Voice Notes</span>
            </div>
          )}

          {/* Notes Feed */}
          <div
            id="notes-feed"
            className="flex-1 overflow-y-auto px-6 sm:px-10 py-4 space-y-2 pb-36"
          >
            {visibleNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-400 mb-3">
                  <Inbox className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-semibold text-stone-800">
                  {currentNav === 'Trash' ? 'Trash is empty' : 'No voice notes yet'}
                </h4>
                <p className="text-xs text-stone-400 mt-1 max-w-xs leading-relaxed">
                  {currentNav === 'Trash'
                    ? 'Deleted voice notes will appear here.'
                    : 'Tap the microphone or press Space to record your first note. Notes are saved directly to your Google Drive.'}
                </p>
                {!isGoogleConnected && currentNav === 'All Notes' && (
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-[#F16544] hover:underline cursor-pointer"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>Connect Google Drive to save and retrieve your notes</span>
                  </button>
                )}
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {visibleNotes.map((note) => (
                  <SnippetCard
                    key={note.id}
                    note={note}
                    onDelete={handleDeleteNote}
                    onRestore={handleRestoreNote}
                    onUpdateNote={handleUpdateNote}
                    onStartVoiceUpdate={(n) => setVoiceUpdateTarget(n)}
                    isTrashView={currentNav === 'Trash'}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* ---------------- FLOATING BOTTOM RECORDING STUDIO ---------------- */}
          <FloatingRecordingStudio
            onNoteCreated={handleNoteCreated}
            updatingNote={voiceUpdateTarget}
            onClearUpdatingNote={() => setVoiceUpdateTarget(null)}
            onNoteUpdated={handleUpdateNote}
          />
        </main>
      </div>

      {/* Confirmation Dialog for Destructive Operations */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl p-6 max-w-md w-full animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-semibold text-stone-900">
              {deleteConfirmTarget.isPermanent
                ? 'Permanently delete note?'
                : 'Move note to Trash?'}
            </h3>
            <p className="text-xs text-stone-500 mt-2 leading-relaxed">
              {deleteConfirmTarget.isPermanent
                ? `Are you sure you want to permanently delete "${deleteConfirmTarget.title}"? This note will be removed from your device and Google Drive. This action cannot be undone.`
                : `Are you sure you want to move "${deleteConfirmTarget.title}" to trash? You can restore it later if needed.`}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition shadow-sm cursor-pointer"
              >
                {deleteConfirmTarget.isPermanent ? 'Delete permanently' : 'Move to trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Modal (Ctrl+K) */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        notes={notes.filter((n) => !n.isDeleted)}
        onSelectNote={() => {
          setCurrentNav('All Notes');
        }}
      />
    </div>
  );
}
