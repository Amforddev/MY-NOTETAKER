import React from 'react';
import {
  FileText,
  Search,
  Trash2,
} from 'lucide-react';

interface TempoSidebarProps {
  currentNav: string; // 'All Notes' | 'Trash'
  onSelectNav: (nav: string) => void;
  onOpenSearch: () => void;
  trashCount?: number;
  notesCount?: number;
}

export const TempoSidebar: React.FC<TempoSidebarProps> = ({
  currentNav,
  onSelectNav,
  onOpenSearch,
  trashCount = 0,
  notesCount = 0,
}) => {
  return (
    <aside
      id="tempo-sidebar"
      className="w-52 lg:w-60 bg-stone-50/80 border-r border-stone-200/70 p-4 flex flex-col justify-between shrink-0 select-none"
    >
      <div className="space-y-6">
        {/* App Logo & Title - Clean, no user or login */}
        <div className="flex items-center gap-2.5 px-1 pt-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-white font-bold text-xs tracking-tight shadow-2xs">
            T
          </div>
          <span className="text-base font-semibold tracking-tight text-stone-900">
            Tempo
          </span>
        </div>

        {/* Primary Nav */}
        <nav className="space-y-1">
          {/* All Notes */}
          <button
            type="button"
            onClick={() => onSelectNav('All Notes')}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition cursor-pointer ${
              currentNav === 'All Notes'
                ? 'bg-stone-200/70 text-stone-950 font-semibold'
                : 'text-stone-600 hover:bg-stone-200/40 hover:text-stone-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4" />
              <span>All Notes</span>
            </div>
            {notesCount > 0 && (
              <span className="text-[10px] font-mono text-stone-400">
                {notesCount}
              </span>
            )}
          </button>

          {/* Search */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-200/40 hover:text-stone-900 transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Search className="h-4 w-4" />
              <span>Search</span>
            </div>
            <kbd className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-400 font-sans">
              Ctrl K
            </kbd>
          </button>

          {/* Trash */}
          <button
            type="button"
            onClick={() => onSelectNav('Trash')}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition cursor-pointer ${
              currentNav === 'Trash'
                ? 'bg-stone-200/70 text-stone-950 font-semibold'
                : 'text-stone-600 hover:bg-stone-200/40 hover:text-stone-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Trash2 className="h-4 w-4" />
              <span>Trash</span>
            </div>
            {trashCount > 0 && (
              <span className="text-[10px] font-mono text-stone-400">
                {trashCount}
              </span>
            )}
          </button>
        </nav>
      </div>

      <div className="pt-4 border-t border-stone-200/60 text-[11px] text-stone-400 text-center">
        Voice Notes
      </div>
    </aside>
  );
};
