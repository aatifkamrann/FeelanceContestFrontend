'use client';

import { useState } from 'react';
import { AutoComplete, type AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import { lastItem, suggest, withItem } from '@/lib/suggestions';

/**
 * A text field that offers what others wrote. Free text underneath — a
 * value on no list is kept exactly as typed — with the whole list behind
 * the dropdown button for whoever would rather pick than spell. In `list`
 * mode the field holds comma-separated items and a suggestion applies to
 * the one being typed, leaving the rest alone.
 */
export default function SuggestInput({
  inputId,
  value,
  onChange,
  options,
  list = false,
  placeholder,
  maxLength,
  className = 'w-full',
  ariaLabel,
}: {
  inputId?: string;
  value: string;
  onChange: (value: string) => void;
  /** Pools in order of preference — the portal's own values before the starter list. */
  options: string[][];
  list?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const [items, setItems] = useState<string[]>([]);
  const complete = (e: AutoCompleteCompleteEvent) => {
    const q = list ? lastItem(e.query).tail : e.query;
    // The dropdown button asks with nothing typed: give it a real list.
    setItems(suggest(q, options, q === '' ? 60 : 25));
  };

  return (
    <AutoComplete
      inputId={inputId}
      value={value}
      suggestions={items}
      completeMethod={complete}
      // Typing reaches onChange alone; a pick reaches onChange with the
      // item and then onSelect, whose answer is the one that lands.
      onChange={(e) => onChange(typeof e.value === 'string' ? e.value : '')}
      onSelect={(e) => onChange(list ? withItem(value, String(e.value)) : String(e.value))}
      dropdown
      dropdownAriaLabel="Show suggestions"
      placeholder={placeholder}
      maxLength={maxLength}
      className={className}
      inputClassName="w-full"
      scrollHeight="16rem"
      aria-label={ariaLabel}
    />
  );
}
