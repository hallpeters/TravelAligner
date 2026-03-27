'use client';

import { useState, useEffect } from 'react';

type DateRange = {
  id: number;
  start_date: string;
  end_date: string;
  label: string | null;
  overlappingFriends: string[];
};

export default function DateRangeManager({ onRefresh }: { onRefresh: () => void }) {
  const [ranges, setRanges] = useState<DateRange[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editError, setEditError] = useState('');

  async function fetchRanges() {
    const res = await fetch('/api/date-ranges');
    if (res.ok) setRanges(await res.json());
  }

  useEffect(() => { fetchRanges(); }, []);

  async function addRange(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!startDate || !endDate) return setError('Please select both dates');
    if (startDate > endDate) return setError('Start must be before end');

    setLoading(true);
    const res = await fetch('/api/date-ranges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date: startDate, end_date: endDate, label }),
    });
    setLoading(false);

    if (res.ok) {
      setStartDate(''); setEndDate(''); setLabel('');
      await fetchRanges();
      onRefresh();
    } else {
      const d = await res.json();
      setError(d.error);
    }
  }

  function startEdit(r: DateRange) {
    setEditingId(r.id);
    setEditStart(r.start_date);
    setEditEnd(r.end_date);
    setEditLabel(r.label ?? '');
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  async function saveEdit(id: number) {
    setEditError('');
    if (!editStart || !editEnd) return setEditError('Please select both dates');
    if (editStart > editEnd) return setEditError('Start must be before end');

    const res = await fetch('/api/date-ranges', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, start_date: editStart, end_date: editEnd, label: editLabel }),
    });

    if (res.ok) {
      setEditingId(null);
      await fetchRanges();
      onRefresh();
    } else {
      const d = await res.json();
      setEditError(d.error);
    }
  }

  async function removeRange(id: number) {
    await fetch('/api/date-ranges', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await fetchRanges();
    onRefresh();
  }

  function formatDateRange(start: string, end: string) {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    if (s.getFullYear() !== e.getFullYear()) {
      return `${s.toLocaleDateString('en', { ...opts, year: 'numeric' })} – ${e.toLocaleDateString('en', { ...opts, year: 'numeric' })}`;
    }
    return `${s.toLocaleDateString('en', opts)} – ${e.toLocaleDateString('en', { ...opts, year: 'numeric' })}`;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">My Travel Dates</h2>

      <form onSubmit={addRange} className="space-y-3 mb-6">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">From</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">To</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <input
          type="text"
          placeholder="Label (optional, e.g. Summer trip)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {loading ? 'Adding...' : '+ Add Date Range'}
        </button>
      </form>

      <div className="space-y-2">
        {ranges.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No travel dates added yet</p>
        )}
        {ranges.map(r => (
          <div key={r.id} className="bg-blue-50 rounded-xl px-4 py-3">
            {editingId === r.id ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">From</label>
                    <input
                      type="date"
                      value={editStart}
                      onChange={e => setEditStart(e.target.value)}
                      className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">To</label>
                    <input
                      type="date"
                      value={editEnd}
                      min={editStart}
                      onChange={e => setEditEnd(e.target.value)}
                      className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Label (optional)"
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                {editError && <p className="text-red-500 text-xs">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(r.id)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex-1 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium py-1.5 rounded-lg border border-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-blue-900">
                    {formatDateRange(r.start_date, r.end_date)}
                  </div>
                  {r.label && <div className="text-xs text-blue-600 mt-0.5">{r.label}</div>}
                  {r.overlappingFriends.length > 0 && (
                    <div className="mt-1.5">
                    <div className="text-xs text-blue-400 mb-1">friends interested in dates:</div>
                    <div className="flex flex-wrap gap-1">
                      {r.overlappingFriends.map(u => (
                        <span key={u} className="inline-flex items-center gap-0.5 bg-green-100 text-green-700 text-xs font-medium px-1.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                          {u}
                        </span>
                      ))}
                    </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button
                    onClick={() => startEdit(r)}
                    className="text-blue-400 hover:text-blue-600 transition-colors"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeRange(r.id)}
                    className="text-blue-400 hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
