'use client';

import { useState, useRef, useEffect } from 'react';
import { AIRPORTS, type Airport } from '@/lib/airports';

export default function AirportSearch({
  value,
  onChange,
}: {
  value: string; // IATA code or empty
  onChange: (iata: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Airport | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelected(value ? (AIRPORTS.find(a => a.iata === value) ?? null) : null);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const results = query.length < 2 ? [] : AIRPORTS.filter(a => {
    const q = query.toLowerCase();
    return (
      a.iata.toLowerCase().startsWith(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.country.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  function select(airport: Airport) {
    setSelected(airport);
    setQuery('');
    setOpen(false);
    onChange(airport.iata);
  }

  function clear() {
    setSelected(null);
    setQuery('');
    onChange('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div ref={containerRef} className="relative">
      {selected ? (
        <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50">
          <span className="text-sm text-gray-900">
            <span className="font-mono font-semibold text-blue-700">{selected.iata}</span>
            <span className="text-gray-500"> — {selected.city}, {selected.country}</span>
          </span>
          <button
            onClick={clear}
            className="ml-2 text-gray-400 hover:text-gray-600 transition-colors text-xs leading-none"
          >
            ✕
          </button>
        </div>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search city or airport…"
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
        />
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-auto max-h-52">
          {results.map(a => (
            <li
              key={a.iata}
              onMouseDown={() => select(a)}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer flex items-center gap-2"
            >
              <span className="font-mono text-xs font-bold text-blue-700 w-9 shrink-0">{a.iata}</span>
              <span className="text-gray-800 shrink-0">{a.city}</span>
              <span className="text-gray-400 text-xs truncate">{a.name}, {a.country}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
