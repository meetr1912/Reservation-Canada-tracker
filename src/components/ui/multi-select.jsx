import * as React from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Dialog, DialogClose, DialogTitle, SheetContent } from './dialog';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/utils';

// Checkbox picker for filtering on many values at once. An empty selection
// means "no filter" (i.e. all values): [] === "All".
//
// Desktop: a popover anchored to the trigger.
// Mobile: a nested bottom sheet, which keeps the list scrollable, avoids
// floating menus fighting the filters sheet for focus, and is easier to tap.

function CountLabel({ selected, options }) {
  return selected.length
    ? `${selected.length} selected`
    : `${options.length} option${options.length === 1 ? '' : 's'}`;
}

function Actions({ selected, visible, query, onChange, selectAllLabel }) {
  const allVisibleSelected = visible.length > 0 && visible.every(o => selected.includes(o));
  return (
    <span className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => onChange(Array.from(new Set([...selected, ...visible])))}
        disabled={allVisibleSelected}
        className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 disabled:text-gray-300"
      >
        {query ? 'Select shown' : selectAllLabel}
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
  );
}

function OptionList({ options, selected, onChange, className }) {
  return (
    <div
      role="listbox"
      aria-multiselectable="true"
      className={cn('overflow-y-auto overscroll-contain p-1', className)}
    >
      {options.length === 0 && (
        <p className="px-3 py-4 text-center text-xs text-gray-400">No matches</p>
      )}
      {options.map(option => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            role="option"
            aria-selected={on}
            onClick={() => onChange(
              on ? selected.filter(o => o !== option) : [...selected, option])}
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
  );
}

function SearchField({ value, onChange, placeholder, inputRef }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="done"
        className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />
    </div>
  );
}

function MultiSelect({
  options = [],
  selected = [],
  onChange,
  placeholder = 'All',
  title,
  searchable = false,
  searchPlaceholder = 'Search…',
  selectAllLabel = 'Select all',
  className,
  contentClassName,
  disabled = false,
  id,
}) {
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef(null);

  const q = query.trim().toLowerCase();
  const visible = q ? options.filter(o => o.toLowerCase().includes(q)) : options;

  const close = (next) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  const summary = selected.length === 0 ? null
    : selected.length <= 2 ? selected.join(', ')
    : `${selected.slice(0, 2).join(', ')} +${selected.length - 2}`;

  const trigger = (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={isDesktop ? undefined : () => setOpen(true)}
      aria-haspopup="listbox"
      aria-expanded={open}
      className={cn(
        'flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 text-left text-sm transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400',
        selected.length ? 'border-emerald-300' : 'border-gray-200',
        disabled && 'cursor-not-allowed opacity-50',
        className,
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
  );

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={close}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(e) => {
            if (searchable) {
              e.preventDefault();
              inputRef.current?.focus();
            }
          }}
          className={cn(
            'pointer-events-auto flex w-[max(var(--radix-popover-trigger-width),15rem)] flex-col overflow-hidden p-0',
            contentClassName,
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              <CountLabel selected={selected} options={options} />
            </span>
            <Actions selected={selected} visible={visible} query={q} onChange={onChange} selectAllLabel={selectAllLabel} />
          </div>
          {searchable && (
            <div className="px-2.5 pt-2">
              <SearchField value={query} onChange={setQuery} placeholder={searchPlaceholder} inputRef={inputRef} />
            </div>
          )}
          <OptionList
            options={visible}
            selected={selected}
            onChange={onChange}
            className="max-h-[min(15rem,calc(var(--radix-popover-content-available-height)-5.5rem))]"
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      {trigger}
      <SheetContent
        data-testid="multi-select-sheet"
        aria-describedby={undefined}
        className="max-h-[85dvh]"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-1">
          <DialogTitle className="text-lg font-semibold">{title || placeholder}</DialogTitle>
          <DialogClose
            aria-label={`Close ${title || placeholder}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <X className="h-4 w-4" />
          </DialogClose>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pb-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            <CountLabel selected={selected} options={options} />
          </span>
          <Actions selected={selected} visible={visible} query={q} onChange={onChange} selectAllLabel={selectAllLabel} />
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-5">
          {searchable && (
            <SearchField value={query} onChange={setQuery} placeholder={searchPlaceholder} />
          )}
          <OptionList
            options={visible}
            selected={selected}
            onChange={onChange}
            className="max-h-[45dvh]"
          />
        </div>

        <div className="border-t border-gray-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <DialogClose className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            Done
          </DialogClose>
        </div>
      </SheetContent>
    </Dialog>
  );
}

export { MultiSelect };
export default MultiSelect;
