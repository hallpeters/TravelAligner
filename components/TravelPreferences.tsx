'use client';

import { useState, useEffect } from 'react';

const CONTINENTS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Antarctica',
] as const;

export default function TravelPreferences() {
  const [selected, setSelected] = useState<string[]>([]);
  const [homeAirport, setHomeAirport] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/user')
      .then(r => r.json())
      .then(d => {
        setSelected(d.continents ?? []);
        setHomeAirport(d.home_airport ?? '');
      });
  }, []);

  async function toggle(continent: string) {
    const next = selected.includes(continent)
      ? selected.filter(c => c !== continent)
      : [...selected, continent];
    setSelected(next);

    await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ continents: next }),
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function saveHomeAirport() {
    const value = homeAirport.toUpperCase().trim();
    if (!value) return;
    await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home_airport: value }),
    });
    setHomeAirport(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Where do you want to travel?</h3>
        {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {CONTINENTS.map(c => {
          const active = selected.includes(c);
          return (
            <button
              key={c}
              onClick={() => toggle(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">
          Your home airport (IATA code)
        </label>
        <input
          type="text"
          value={homeAirport}
          onChange={e => setHomeAirport(e.target.value)}
          onBlur={saveHomeAirport}
          placeholder="e.g. JFK"
          maxLength={4}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 uppercase"
        />
      </div>
    </div>
  );
}
