import React from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

import {
  Dialog, DialogClose, DialogTitle, SheetContent,
} from './ui/dialog';
import { useI18n } from '../lib/i18n';

// Mobile-only bottom sheet that hosts the shared FiltersPanel, with a sticky
// footer showing how many sites match the current filters.
function FiltersSheet({
  open,
  onOpenChange,
  resultCount = 0,
  onClear,
  canClear = false,
  onApply,
  children,
}) {
  const { t, tn } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        data-testid="filters-sheet"
        className="p-0"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-1">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-emerald-600" /> {t('filters.title')}
          </DialogTitle>
          <DialogClose
            aria-label={t('filters.close')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <X className="h-4 w-4" />
          </DialogClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          {children}
        </div>

        <div className="flex items-center gap-3 border-t border-gray-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClear}
            disabled={!canClear}
            className="h-11 flex-shrink-0 rounded-xl px-3 text-sm font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40"
          >
            {t('filters.clearAll')}
          </button>
          <button
            type="button"
            onClick={onApply}
            className="h-11 flex-1 rounded-xl bg-emerald-700 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {tn('filters.showResults', resultCount)}
          </button>
        </div>
      </SheetContent>
    </Dialog>
  );
}

export default FiltersSheet;
