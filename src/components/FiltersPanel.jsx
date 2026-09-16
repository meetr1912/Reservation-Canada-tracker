import React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import MultiSelect from './ui/multi-select';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/data';

function FieldLabel({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 sm:sr-only"
    >
      {children}
    </label>
  );
}

function ToggleRow({ id, label, hint, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-700">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-gray-400">{hint}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'h-6 w-11 flex-shrink-0 rounded-full p-0.5 transition-colors',
          checked ? 'bg-emerald-500' : 'bg-gray-300',
        )}
      >
        <span className={cn(
          'block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5',
        )} />
      </button>
    </div>
  );
}

// Shared filter form: rendered inside the desktop sticky card and the mobile
// bottom sheet, so both stay pixel-identical and state stays in App.
function FiltersPanel({
  idPrefix = 'filters',
  dates = [],
  availableDates = [],
  selectedDate,
  onSelectDate,
  showDate = true,
  parks = [],
  selectedParks = [],
  onChangeParks,
  types = [],
  selectedTypes = [],
  onChangeTypes,
  showOnlyAvailable = true,
  onChangeShowOnlyAvailable,
  className,
}) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {showDate && selectedDate && (
          <div>
            <FieldLabel htmlFor={`${idPrefix}-date`}>
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" /> Date
              </span>
            </FieldLabel>
            <Select value={selectedDate} onValueChange={onSelectDate}>
              <SelectTrigger id={`${idPrefix}-date`} className="h-11 bg-white">
                <SelectValue placeholder="Select a date" />
              </SelectTrigger>
              <SelectContent>
                {dates.map(date => (
                  <SelectItem key={date} value={date}>
                    <span className="flex items-center gap-2">
                      {formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}
                      {availableDates.includes(date) && <span className="text-emerald-500">●</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <FieldLabel htmlFor={`${idPrefix}-parks`}>Parks</FieldLabel>
          <MultiSelect
            id={`${idPrefix}-parks`}
            options={parks}
            selected={selectedParks}
            onChange={onChangeParks}
            placeholder="All parks"
            title="Parks"
            searchable
            searchPlaceholder="Search parks…"
            selectAllLabel="Select all parks"
          />
        </div>
        {types.length > 1 && (
          <div>
            <FieldLabel htmlFor={`${idPrefix}-types`}>Accommodation</FieldLabel>
            <MultiSelect
              id={`${idPrefix}-types`}
              options={types}
              selected={selectedTypes}
              onChange={onChangeTypes}
              placeholder="All types"
              title="Accommodation"
              selectAllLabel="Select all types"
            />
          </div>
        )}
      </div>
      {onChangeShowOnlyAvailable && (
        <ToggleRow
          id={`${idPrefix}-available-only`}
          label="Show available only"
          hint="Hide fully booked sites"
          checked={showOnlyAvailable}
          onChange={onChangeShowOnlyAvailable}
        />
      )}
    </div>
  );
}

export default FiltersPanel;
