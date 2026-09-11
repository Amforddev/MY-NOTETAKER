import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { VoiceNote } from '../types.ts';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: VoiceNote[];
  onSelectNote: (note: VoiceNote) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  notes,
  onSelectNote,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else inputRef.current?.focus();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = notes.filter((n) => {
    const q = query.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.transcript.toLowerCase().includes(q) ||
      (n.tags && n.tags.some((t) => t.toLowerCase().includes(q)))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-stone-900/40 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3">
          <Search className="h-4 w-4 text-stone-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search voice notes or transcripts..."
            className="flex-1 bg-transparent text-sm text-stone-900 placeholder-stone-400 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500 hover:bg-stone-200 cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400">
              No notes matching "{query}"
            </div>
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => {
                  onSelectNote(note);
                  onClose();
                }}
                className="flex w-full flex-col gap-1 rounded-xl p-3 text-left hover:bg-stone-50 transition cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-stone-900 truncate">
                    {note.title}
                  </span>
                  {note.tags && note.tags.length > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {note.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[9px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-stone-500">
                  {note.transcript}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
