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

export default function Calendar({
  refreshKey,
  onDateSelected,
}: {
  refreshKey: number;
  onDateSelected?: (start: string, end: string) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<CalendarData>({});
  const [tooltip, setTooltip] = useState<{ date: string; day: DayData } | null>(null);
  const [loading, setLoading] = useState(false);

  // Drag selection — isDragging is a ref to avoid re-renders during drag
  const isDragging = useRef(false);
  const dragStartRef = useRef<string | null>(null);
  const dragEndRef = useRef<string | null>(null);
  const onDateSelectedRef = useRef(onDateSelected);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);

  useEffect(() => { onDateSelectedRef.current = onDateSelected; }, [onDateSelected]);

  const finalizeDrag = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const s = dragStartRef.current;
    const e = dragEndRef.current;
    dragStartRef.current = null;
    dragEndRef.current = null;
    setDragStart(null);
    setDragEnd(null);
    if (s && e) {
      const start = s <= e ? s : e;
      const end = s <= e ? e : s;
      onDateSelectedRef.current?.(start, end);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', finalizeDrag);
    return () => window.removeEventListener('mouseup', finalizeDrag);
  }, [finalizeDrag]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Normalized drag range for highlight check
  const dragRangeStart = dragStart && dragEnd ? (dragStart <= dragEnd ? dragStart : dragEnd) : null;
  const dragRangeEnd = dragStart && dragEnd ? (dragStart <= dragEnd ? dragEnd : dragStart) : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
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
        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 mb-2">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
        ))}
      </div>

      {/* Days grid — select-none prevents text highlighting during drag */}
      <div className={`grid grid-cols-7 gap-1 relative select-none ${loading ? 'opacity-50' : ''}`}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayData = data[dateStr];
          const isToday = dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          const colorClass = dayData ? friendCountColor(dayData.friendCount, dayData.mine) : '';
          const inDragRange = !!(dragRangeStart && dragRangeEnd && dateStr >= dragRangeStart && dateStr <= dragRangeEnd);

          return (
            <div
              key={dateStr}
              className={`relative aspect-square flex flex-col items-center justify-center rounded-xl cursor-pointer transition-colors
                ${inDragRange
                  ? 'bg-blue-100 ring-1 ring-blue-300'
                  : `${colorClass || 'hover:bg-gray-50'} hover:scale-105 hover:shadow-sm`
                }
                ${isToday && !colorClass && !inDragRange ? 'ring-2 ring-blue-400' : ''}
              `}
              onMouseDown={() => {
                isDragging.current = true;
                dragStartRef.current = dateStr;
                dragEndRef.current = dateStr;
                setDragStart(dateStr);
                setDragEnd(dateStr);
                setTooltip(null);
              }}
              onMouseOver={() => {
                if (!isDragging.current) return;
                dragEndRef.current = dateStr;
                setDragEnd(dateStr);
              }}
              onMouseEnter={() => {
                if (isDragging.current) return;
                if (dayData && (dayData.mine || dayData.friendCount > 0)) {
                  setTooltip({ date: dateStr, day: dayData });
                }
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              <span className={`text-sm font-medium ${isToday && !colorClass && !inDragRange ? 'text-blue-600' : ''}`}>
                {day}
              </span>
              {dayData?.friendCount > 0 && (
                <span className="flex flex-col items-center leading-none">
                  <span className="text-xs font-bold">
                    {dayData.friendCount > 9 ? '9+' : dayData.friendCount}
                  </span>
                  <span className="text-[9px] opacity-70">
                    {dayData.friendCount === 1 ? 'friend' : 'friends'}
                  </span>
                </span>
              )}
              {dayData?.mine && dayData.friendCount === 0 && (
                <div className="w-1 h-1 rounded-full bg-blue-400 mt-0.5" />
              )}

              {/* Tooltip — suppressed while dragging */}
              {!isDragging.current && tooltip?.date === dateStr && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-xl">
                  <div className="font-semibold mb-1">{dateStr}</div>
                  {tooltip.day.mine && <div className="text-blue-300">✓ You're available</div>}
                  {tooltip.day.friends.length > 0 && (
                    <div className="text-green-300">
                      {tooltip.day.friends.join(', ')}
                    </div>
                  )}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                </div>
              )}
            </div>
          );
        })}
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
