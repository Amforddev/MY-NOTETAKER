import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Mic,
  Copy,
  Check,
  MoreHorizontal,
  Trash2,
  Play,
  Pause,
  Edit3,
  RotateCcw,
  Gauge,
  Tag,
} from 'lucide-react';
import { motion } from 'motion/react';
import { VoiceNote } from '../types.ts';
import { extractKeywords } from '../lib/tagger.ts';

interface SnippetCardProps {
  note: VoiceNote;
  onDelete: (id: string) => void;
  onRestore?: (id: string) => void;
  onUpdateNote: (updated: VoiceNote) => void;
  onStartVoiceUpdate: (note: VoiceNote) => void;
  isTrashView?: boolean;
}

export const SnippetCard: React.FC<SnippetCardProps> = ({
  note,
  onDelete,
  onRestore,
  onUpdateNote,
  onStartVoiceUpdate,
  isTrashView = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  // Auto-suggest tags if note doesn't have any yet
  const displayedTags = useMemo(() => {
    if (note.tags && note.tags.length > 0) {
      return note.tags;
    }
    return extractKeywords(note.transcript, 4);
  }, [note.tags, note.transcript]);

  // Inline editing mode by typing
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editTranscript, setEditTranscript] = useState(note.transcript);
  const [editTagsInput, setEditTagsInput] = useState(
    displayedTags.join(', ')
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleOut = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOut);
    return () => document.removeEventListener('mousedown', handleOut);
  }, []);

  // Format relative timestamp
  const getRelativeTime = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffDays >= 14) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays > 0) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    if (diffHr > 0) return `${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`;
    if (diffMin > 0) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
    return 'just now';
  };

  const copyTranscript = () => {
    navigator.clipboard.writeText(note.transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSetPlaybackRate = (speed: number) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const cyclePlaybackRate = () => {
    const next = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    handleSetPlaybackRate(next);
  };

  const toggleAudio = () => {
    if (!audioRef.current) {
      if (!note.audioBlob && !note.audioDataUrl) return;
      const src = note.audioDataUrl || (note.audioBlob ? URL.createObjectURL(note.audioBlob) : '');
      if (!src) return;

      const audio = new Audio(src);
      audio.playbackRate = playbackRate;

      audio.ontimeupdate = () => {
        if (audio.duration) {
          setAudioProgress((audio.currentTime / audio.duration) * 100);
          setCurrentTime(audio.currentTime);
        }
      };
      audio.onended = () => {
        setIsPlaying(false);
        setAudioProgress(0);
        setCurrentTime(0);
      };
      audioRef.current = audio;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !audioRef.current.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPos = (e.clientX - rect.left) / rect.width;
    const newTime = clickPos * audioRef.current.duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setAudioProgress(clickPos * 100);
  };

  const handleSaveTextEdit = () => {
    const parsedTags = editTagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/[^\w-]/g, ''))
      .filter(Boolean);

    const updatedTags =
      parsedTags.length > 0
        ? parsedTags
        : extractKeywords(editTranscript.trim() || note.transcript, 4);

    onUpdateNote({
      ...note,
      title: editTitle.trim() || note.title,
      transcript: editTranscript.trim() || note.transcript,
      tags: updatedTags,
      updatedAt: Date.now(),
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(note.title);
    setEditTranscript(note.transcript);
    setEditTagsInput(displayedTags.join(', '));
    setIsEditing(false);
  };

  const formatAudioTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="group relative flex flex-col py-3.5 px-2 border-b border-stone-100 last:border-0 transition-colors"
    >
      {isEditing ? (
        /* ---------------- INLINE TYPING EDIT MODE ---------------- */
        <div className="space-y-3 rounded-2xl bg-stone-50/80 p-4 border border-stone-200 animate-in fade-in">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
              Title
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-900 focus:border-[#F16544] focus:ring-1 focus:ring-[#F16544] outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
              Transcript
            </label>
            <textarea
              value={editTranscript}
              onChange={(e) => setEditTranscript(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs leading-relaxed text-stone-800 focus:border-[#F16544] focus:ring-1 focus:ring-[#F16544] outline-none resize-y"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
              Keywords / Tags (comma separated)
            </label>
            <input
              type="text"
              value={editTagsInput}
              onChange={(e) => setEditTagsInput(e.target.value)}
              placeholder="e.g. quarterly, budget, planning"
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-800 focus:border-[#F16544] focus:ring-1 focus:ring-[#F16544] outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="rounded-lg px-3 py-1.5 text-xs text-stone-500 hover:bg-stone-200/50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveTextEdit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#F16544] hover:bg-[#e05535] text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      ) : (
        /* ---------------- NORMAL CARD VIEW ---------------- */
        <>
          {/* 1. Header Row: Title & Actions */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3
              onClick={() => !isTrashView && setIsEditing(true)}
              className="text-sm font-semibold text-stone-900 leading-snug tracking-tight hover:text-[#F16544] cursor-pointer transition-colors"
              title="Click to edit title or transcript"
            >
              {note.title}
            </h3>

            {/* Quick Actions (Copy, Audio, Speed, Edit, Voice Update) */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Copy Transcript Button */}
              <button
                type="button"
                onClick={copyTranscript}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
                title="Copy transcript to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-[11px] text-emerald-600 font-medium">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline text-[11px]">Copy</span>
                  </>
                )}
              </button>

              {/* Audio Listen Button */}
              {(note.audioBlob || note.audioDataUrl) && (
                <button
                  type="button"
                  onClick={toggleAudio}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition cursor-pointer ${
                    isPlaying
                      ? 'bg-orange-50 text-[#F16544]'
                      : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                  title={isPlaying ? 'Pause audio' : 'Play audio recording'}
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline text-[11px]">
                    {isPlaying ? 'Pause' : 'Play'}
                  </span>
                </button>
              )}

              {/* Playback Speed Quick Toggle Pill */}
              {(note.audioBlob || note.audioDataUrl) && (
                <button
                  type="button"
                  onClick={cyclePlaybackRate}
                  className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-mono font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
                  title="Click to cycle playback speed (1x, 1.5x, 2x)"
                >
                  <Gauge className="h-3 w-3 text-stone-400 mr-0.5" />
                  <span>{playbackRate}x</span>
                </button>
              )}

              {/* Update with Voice */}
              {!isTrashView && (
                <button
                  type="button"
                  onClick={() => onStartVoiceUpdate(note)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-orange-50 hover:text-[#F16544] transition cursor-pointer"
                  title="Update or append to this note using your voice"
                >
                  <Mic className="h-3.5 w-3.5" />
                  <span className="hidden md:inline text-[11px]">Add Voice</span>
                </button>
              )}

              {/* Edit by Typing */}
              {!isTrashView && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
                  title="Edit title and transcript by typing"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span className="hidden md:inline text-[11px]">Edit</span>
                </button>
              )}

              {/* Quick Delete / Trash Button */}
              <button
                type="button"
                onClick={() => onDelete(note.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                title={isTrashView ? "Delete permanently" : "Delete note"}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden md:inline text-[11px]">{isTrashView ? 'Delete' : 'Trash'}</span>
              </button>

              {/* Three Dots Menu */}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex h-7 w-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-800 transition cursor-pointer"
                  title="More actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-8 w-44 rounded-xl border border-stone-200 bg-white p-1 shadow-xl z-30 animate-in fade-in">
                    {isTrashView ? (
                      <>
                        {onRestore && (
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              onRestore(note.id);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-stone-500" />
                            <span>Restore Note</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onDelete(note.id);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 transition cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete Permanently</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setIsEditing(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-stone-500" />
                          <span>Edit Text</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onStartVoiceUpdate(note);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                        >
                          <Mic className="h-3.5 w-3.5 text-[#F16544]" />
                          <span>Update with Voice</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onDelete(note.id);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 transition cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Move to Trash</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Automatic Keyword Tag Badges below the title */}
          {displayedTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {displayedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center text-[10px] font-medium tracking-tight bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md border border-stone-200/70 select-none hover:bg-stone-200/60 transition-colors"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* 3. Metadata Line: Relative timestamp, duration, edited status */}
          <div className="flex items-center gap-2 py-0.5 text-xs text-stone-400 mb-2">
            <span>{getRelativeTime(note.createdAt)}</span>
            {note.duration > 0 && (
              <>
                <span>•</span>
                <span>{formatAudioTime(note.duration)}</span>
              </>
            )}
            {note.updatedAt > note.createdAt + 2000 && (
              <>
                <span>•</span>
                <span className="italic text-stone-400">Edited</span>
              </>
            )}
          </div>

          {/* 4. Interactive Audio Scrubber & Playback Speed Controls (when active) */}
          {isPlaying && (
            <div className="mb-2.5 flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 border border-stone-200/80 px-3.5 py-2 animate-in fade-in">
              <button
                type="button"
                onClick={toggleAudio}
                className="text-stone-700 hover:text-stone-900 cursor-pointer"
                title="Pause audio"
              >
                <Pause className="h-3.5 w-3.5" />
              </button>

              {/* Clickable Scrubber Bar */}
              <div
                onClick={handleSeek}
                className="flex-1 min-w-[120px] h-2 bg-stone-200 rounded-full overflow-hidden cursor-pointer relative"
                title="Seek audio position"
              >
                <div
                  className="h-full bg-[#F16544] transition-all duration-100 pointer-events-none"
                  style={{ width: `${audioProgress}%` }}
                />
              </div>

              {/* Time display */}
              <span className="text-[10px] font-mono text-stone-500 shrink-0">
                {formatAudioTime(currentTime)} / {formatAudioTime(note.duration || 0)}
              </span>

              {/* Playback Speed Segmented Control (1x, 1.5x, 2x) */}
              <div className="flex items-center gap-1 bg-stone-200/70 p-0.5 rounded-lg shrink-0">
                {([1, 1.5, 2] as const).map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => handleSetPlaybackRate(speed)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition cursor-pointer ${
                      playbackRate === speed
                        ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                    title={`Set speed to ${speed}x`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5. Body Transcript */}
          <p
            onClick={() => !isTrashView && setIsEditing(true)}
            className="text-xs text-stone-600 leading-relaxed max-w-4xl tracking-normal cursor-pointer hover:text-stone-900 transition-colors whitespace-pre-wrap select-text"
            title="Click to edit transcript"
          >
            {note.transcript}
          </p>
        </>
      )}
    </motion.article>
  );
};
