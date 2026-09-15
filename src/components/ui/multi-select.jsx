import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

import { cn } from '../../lib/utils';

// Checkbox dropdown for filtering on many values at once. An empty selection
// means "no filter" (i.e. all values), which keeps the URL-less state model
// simple: [] === "All".
function MultiSelect({
  options = [],
  selected = [],
  onChange,
  placeholder = 'All',
  searchable = false,
  searchPlaceholder = 'Search…',
  selectAllLabel = 'Select all',
  className,
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  React.useEffect(() => { if (!open) setQuery(''); }, [open]);

  const q = query.trim().toLowerCase();
  const visible = q ? options.filter(o => o.toLowerCase().includes(q)) : options;

  const toggle = (option) => onChange(
    selected.includes(option)
      ? selected.filter(o => o !== option)
      : [...selected, option]);

  const summary = selected.length === 0 ? null
    : selected.length <= 2 ? selected.join(', ')
    : `${selected.slice(0, 2).join(', ')} +${selected.length - 2}`;

  const allVisibleSelected = visible.length > 0 && visible.every(o => selected.includes(o));
  const countLabel = selected.length
    ? `${selected.length} selected`
    : `${options.length} option${options.length === 1 ? '' : 's'}`;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 text-left text-sm transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400',
          selected.length ? 'border-emerald-300' : 'border-gray-200',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected.length > 0 && (
            <span className="inline-flex h-5 min-w-[1.25rem] flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">
              {selected.length}
            </span>
          )}
          <span className={cn('truncate', selected.length ? 'font-medium text-gray-900' : 'text-gray-500')}>
            {summary || placeholder}
          </span>
        </span>
        <ChevronDown className={cn(
          'h-4 w-4 flex-shrink-0 text-gray-400 transition-transform',
          open && 'rotate-180',
        )} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {countLabel}
            </span>
            <span className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onChange(Array.from(new Set([...selected, ...visible])))}
                disabled={allVisibleSelected}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 disabled:text-gray-300"
              >
                {q ? 'Select shown' : selectAllLabel}
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={!selected.length}
                className="text-[11px] font-medium text-gray-500 hover:text-gray-700 disabled:text-gray-300"
              >
                Clear
              </button>
            </span>
          </div>

          {searchable && (
            <div className="relative px-2.5 pt-2">
              <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          )}

          <div role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1">
            {visible.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-gray-400">No matches</p>
            )}
            {visible.map(option => {
              const on = selected.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(option)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    on ? 'bg-emerald-50/70 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <span className={cn(
                    'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors',
                    on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white',
                  )}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{option}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export { MultiSelect };
export default MultiSelect;
