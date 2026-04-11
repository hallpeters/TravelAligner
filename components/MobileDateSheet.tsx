'use client';

import { useState, useEffect } from 'react';
import Calendar from '@/components/Calendar';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

function formatShort(d: string) {
  const [, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(day)}`;
}

export default function MobileDateSheet({ onRefresh }: { onRefresh: () => void }) {
  const isMobile = useIsMobile();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 'start' | 'end' | null
  const [pickerFor, setPickerFor] = useState<'start' | 'end' | null>(null);
  // refreshKey for the calendar inside the picker (static — never changes)
  const [calKey] = useState(0);

  function openSheet() {
    setStartDate('');
    setEndDate('');
    setLabel('');
    setError('');
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setPickerFor(null);
  }

  function handleDaySelected(date: string) {
    if (pickerFor === 'start') {
      setStartDate(date);
      // If end is now before start, clear it
      if (endDate && endDate < date) setEndDate('');
    } else {
      setEndDate(date);
    }
    setPickerFor(null);
  }

  async function handleSubmit() {
    if (!startDate || !endDate) { setError('Both dates are required'); return; }
    if (startDate > endDate) { setError('Start must be before end'); return; }
    setError('');
    setSubmitting(true);
    const res = await fetch('/api/date-ranges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date: startDate, end_date: endDate, label: label.trim() || null }),
    });
    setSubmitting(false);
    if (res.ok) {
      closeSheet();
      onRefresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed to save');
    }
  }

  if (!isMobile) return null;

  return (
    <>
      {/* FAB */}
      <button
        onClick={openSheet}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-lg flex items-center justify-center transition-colors"
        aria-label="Add travel dates"
      >
        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Full-screen calendar picker */}
      {pickerFor && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          {/* Picker header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <button
              onClick={() => setPickerFor(null)}
              className="p-2 -ml-2 text-gray-600 hover:text-gray-900"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-base font-semibold text-gray-900">
              {pickerFor === 'start' ? 'Select start date' : 'Select end date'}
            </h2>
          </div>
          {/* Calendar */}
          <div className="flex-1 overflow-y-auto p-4">
            <Calendar
              refreshKey={calKey}
              readOnly
              onDaySelected={handleDaySelected}
            />
          </div>
        </div>
      )}

      {/* Overlay */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={closeSheet}
        />
      )}

      {/* Bottom sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ${
          sheetOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-300 rounded mx-auto mt-3 mb-4" />

        <div className="px-5 pb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Add travel dates</h2>

          {/* Start date */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">Start date</label>
            <button
              onClick={() => setPickerFor('start')}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                startDate
                  ? 'border-blue-300 bg-blue-50 text-blue-800 font-medium'
                  : 'border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              {startDate ? formatShort(startDate) : 'Select start date'}
            </button>
          </div>

          {/* End date */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">End date</label>
            <button
              onClick={() => setPickerFor('end')}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                endDate
                  ? 'border-blue-300 bg-blue-50 text-blue-800 font-medium'
                  : 'border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              {endDate ? formatShort(endDate) : 'Select end date'}
            </button>
          </div>

          {/* Name */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">Name (optional)</label>
            <input
              type="text"
              placeholder="e.g. Summer Europe trip"
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
          </div>

          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-50 mb-3"
          >
            {submitting ? 'Adding…' : 'Add'}
          </button>
          <button
            onClick={closeSheet}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
