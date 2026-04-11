'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

type DayData = {
  mine: boolean;
  friendCount: number;
  friends: string[];
};

type CalendarData = Record<string, DayData>;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function friendCountColor(count: number, mine: boolean): string {
  if (mine && count === 0) return 'bg-blue-200 text-blue-900';
  if (mine && count === 1) return 'bg-green-300 text-green-900';
  if (mine && count === 2) return 'bg-green-400 text-green-900';
  if (mine && count >= 3) return 'bg-green-600 text-white';
  if (!mine && count === 1) return 'bg-orange-200 text-orange-900';
  if (!mine && count === 2) return 'bg-orange-300 text-orange-900';
  if (!mine && count >= 3) return 'bg-orange-400 text-orange-900';
  return '';
}

function formatShort(d: string) {
  const [, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(day)}`;
}

export default function Calendar({
  refreshKey,
  onSaved,
  readOnly,
  onDaySelected,
  headerRight,
}: {
  refreshKey: number;
  onSaved?: () => void;
  readOnly?: boolean;
  onDaySelected?: (date: string) => void;
  headerRight?: React.ReactNode;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<CalendarData>({});
  const [tooltip, setTooltip] = useState<{ date: string; day: DayData } | null>(null);
  const [loading, setLoading] = useState(false);

  // Two-click selection (desktop only — disabled when readOnly)
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [confirmedRange, setConfirmedRange] = useState<{ start: string; end: string } | null>(null);

  // Popup form state
  const [popupStart, setPopupStart] = useState('');
  const [popupEnd, setPopupEnd] = useState('');
  const [popupLabel, setPopupLabel] = useState('');
  const [popupError, setPopupError] = useState('');
  const [popupLoading, setPopupLoading] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  // Keep popup dates in sync with hover while selecting
  useEffect(() => {
    if (!selectionStart) return;
    const end = hoverDate ?? selectionStart;
    const s = selectionStart <= end ? selectionStart : end;
    const e = selectionStart <= end ? end : selectionStart;
    setPopupStart(s);
    setPopupEnd(e);
  }, [selectionStart, hoverDate]);

  // Cancel pending first-click if user clicks outside calendar
  useEffect(() => {
    if (!selectionStart) return;
    function onOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSelectionStart(null);
        setHoverDate(null);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [selectionStart]);

  // Close popup when clicking outside it
  useEffect(() => {
    if (!confirmedRange) return;
    function onOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        cancelPopup();
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [confirmedRange]);

  function cancelPopup() {
    setConfirmedRange(null);
    setPopupLabel('');
    setPopupError('');
  }

  async function savePopup() {
    if (!popupStart || !popupEnd) { setPopupError('Both dates are required'); return; }
    if (popupStart > popupEnd) { setPopupError('Start must be before end'); return; }
    setPopupError('');
    setPopupLoading(true);
    const res = await fetch('/api/date-ranges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date: popupStart, end_date: popupEnd, label: popupLabel.trim() || null }),
    });
    setPopupLoading(false);
    if (res.ok) {
      setConfirmedRange(null);
      setPopupLabel('');
      setPopupError('');
      onSavedRef.current?.();
    } else {
      const d = await res.json().catch(() => ({}));
      setPopupError(d.error || 'Failed to save');
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Compute highlighted range (desktop selection only)
  const previewEnd = selectionStart ? (hoverDate ?? selectionStart) : null;
  const rangeStart = selectionStart && previewEnd
    ? (selectionStart <= previewEnd ? selectionStart : previewEnd)
    : confirmedRange?.start ?? null;
  const rangeEnd = selectionStart && previewEnd
    ? (selectionStart <= previewEnd ? previewEnd : selectionStart)
    : confirmedRange?.end ?? null;

  function handleDayClick(dateStr: string) {
    if (readOnly) {
      onDaySelected?.(dateStr);
      return;
    }
    if (confirmedRange) {
      cancelPopup();
      setSelectionStart(dateStr);
      setHoverDate(dateStr);
      setTooltip(null);
      return;
    }
    if (!selectionStart) {
      setSelectionStart(dateStr);
      setHoverDate(dateStr);
      setTooltip(null);
    } else {
      const start = selectionStart <= dateStr ? selectionStart : dateStr;
      const end = selectionStart <= dateStr ? dateStr : selectionStart;
      setSelectionStart(null);
      setHoverDate(null);
      setPopupStart(start);
      setPopupEnd(end);
      setPopupLabel('');
      setPopupError('');
      setConfirmedRange({ start, end });
    }
  }

  return (
    <div ref={wrapperRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-gray-900">
          {MONTHS[month - 1]} {year}
        </h2>
        <div className="flex items-center gap-2">
          {headerRight}
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hint while awaiting second click (desktop only) */}
      {!readOnly && selectionStart && (
        <p className="text-xs text-center text-blue-500 mb-2 -mt-4">
          Click a second date to complete your range
        </p>
      )}

      {/* Day names */}
      <div className="grid grid-cols-7 mb-2">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
        ))}
      </div>

      {/* Grid + popup wrapper */}
      <div className="relative">
        <div className={`grid grid-cols-7 gap-1 select-none ${loading ? 'opacity-50' : ''}`}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayData = data[dateStr];
            const isToday = dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const colorClass = dayData ? friendCountColor(dayData.friendCount, dayData.mine) : '';
            const inRange = !readOnly && !!(rangeStart && rangeEnd && dateStr >= rangeStart && dateStr <= rangeEnd);
            const isAnchor = !readOnly && dateStr === selectionStart;

            return (
              <div
                key={dateStr}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-xl cursor-pointer transition-colors
                  ${inRange
                    ? isAnchor
                      ? 'bg-blue-500 text-white ring-2 ring-blue-600'
                      : 'bg-blue-100 ring-1 ring-blue-300'
                    : `${colorClass || 'hover:bg-gray-50'} hover:scale-105 hover:shadow-sm`
                  }
                  ${isToday && !colorClass && !inRange ? 'ring-2 ring-blue-400' : ''}
                `}
                onClick={() => handleDayClick(dateStr)}
                onMouseEnter={() => {
                  if (!readOnly && selectionStart) {
                    setHoverDate(dateStr);
                  } else if (!readOnly && !confirmedRange && dayData && (dayData.mine || dayData.friendCount > 0)) {
                    setTooltip({ date: dateStr, day: dayData });
                  }
                }}
                onMouseLeave={() => {
                  if (!readOnly && selectionStart) {
                    setHoverDate(selectionStart);
                  } else {
                    setTooltip(null);
                  }
                }}
              >
                <span className={`text-sm font-medium
                  ${isAnchor ? 'text-white' : ''}
                  ${isToday && !colorClass && !inRange ? 'text-blue-600' : ''}
                `}>
                  {day}
                </span>
                {!inRange && dayData?.friendCount > 0 && (
                  <span className="flex flex-col items-center leading-none">
                    <span className="text-xs font-bold">
                      {dayData.friendCount > 9 ? '9+' : dayData.friendCount}
                    </span>
                    <span className="text-[9px] opacity-70">
                      {dayData.friendCount === 1 ? 'friend' : 'friends'}
                    </span>
                  </span>
                )}
                {!inRange && dayData?.mine && dayData.friendCount === 0 && (
                  <div className="w-1 h-1 rounded-full bg-blue-400 mt-0.5" />
                )}

                {/* Tooltip — desktop only, not in readOnly mode */}
                {!readOnly && !selectionStart && !confirmedRange && tooltip?.date === dateStr && (
                  <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-xl">
                    <div className="font-semibold mb-1">{dateStr}</div>
                    {tooltip.day.mine && <div className="text-blue-300">✓ You're available</div>}
                    {tooltip.day.friends.length > 0 && (
                      <div className="text-green-300">{tooltip.day.friends.join(', ')}</div>
                    )}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Popup card — desktop only */}
        {!readOnly && confirmedRange && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div
              ref={popupRef}
              className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-gray-200 w-72 p-5"
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-gray-800">
                  {formatShort(popupStart)} – {formatShort(popupEnd)}
                </span>
                <button
                  onClick={cancelPopup}
                  className="text-gray-400 hover:text-gray-600 transition-colors leading-none text-lg"
                >
                  ×
                </button>
              </div>

              <div className="space-y-3">
                <input
                  autoFocus
                  type="text"
                  placeholder="Name (optional)"
                  value={popupLabel}
                  onChange={e => setPopupLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') savePopup(); if (e.key === 'Escape') cancelPopup(); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-gray-400 mb-1 block uppercase tracking-wide">From</label>
                    <input
                      type="date"
                      value={popupStart}
                      onChange={e => setPopupStart(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-400 mb-1 block uppercase tracking-wide">To</label>
                    <input
                      type="date"
                      value={popupEnd}
                      min={popupStart}
                      onChange={e => setPopupEnd(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {popupError && <p className="text-red-500 text-xs">{popupError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={savePopup}
                    disabled={popupLoading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {popupLoading ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={cancelPopup}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-blue-200" />
          <span>You're free, no friends yet</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-orange-200" />
          <span>Friends free, you're not</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-green-400" />
          <span>You + friends are free</span>
        </div>
      </div>
    </div>
  );
}
