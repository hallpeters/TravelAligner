'use client';

import { useState, useEffect } from 'react';

type DayData = {
  mine: boolean;
  friendCount: number;
  friends: string[];
};

type CalendarData = Record<string, DayData>;

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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

export default function YearOverview({ refreshKey }: { refreshKey: number }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [year, setYear] = useState(today.getFullYear());
  const [data, setData] = useState<CalendarData>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        fetch(`/api/calendar?year=${year}&month=${i + 1}`).then(r => r.ok ? r.json() : {})
      )
    ).then(results => {
      const merged: CalendarData = {};
      for (const r of results) Object.assign(merged, r);
      setData(merged);
      setLoading(false);
    });
  }, [year, refreshKey]);

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${loading ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setYear(y => y - 1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-gray-900">{year}</h2>
        <button
          onClick={() => setYear(y => y + 1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 12 mini months */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
        {Array.from({ length: 12 }, (_, mi) => {
          const month = mi + 1;
          const firstDay = new Date(year, mi, 1).getDay();
          const daysInMonth = new Date(year, month, 0).getDate();
          const cells: (number | null)[] = [
            ...Array(firstDay).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ];

          return (
            <div key={mi}>
              <div className="text-xs font-semibold text-gray-700 mb-1.5 text-center tracking-wide">
                {MONTH_ABBR[mi]}
              </div>
              <div className="grid grid-cols-7">
                {DOW.map((d, i) => (
                  <div key={i} className="text-center text-[8px] text-gray-300 leading-4">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px">
                {cells.map((day, i) => {
                  if (!day) return <div key={i} />;
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayData = data[dateStr];
                  const isToday = dateStr === todayStr;
                  const colorClass = dayData ? friendCountColor(dayData.friendCount, dayData.mine) : '';

                  return (
                    <div
                      key={dateStr}
                      className={`aspect-square flex items-center justify-center rounded text-[9px] font-medium leading-none
                        ${colorClass || (isToday ? 'ring-1 ring-inset ring-blue-400 text-blue-600' : 'text-gray-400')}
                      `}
                      title={
                        dayData
                          ? [
                              dayData.mine ? 'You' : '',
                              ...(dayData.friends ?? []),
                            ].filter(Boolean).join(', ')
                          : undefined
                      }
                    >
                      {day}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend — identical to monthly view */}
      <div className="mt-6 flex flex-wrap gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-blue-200" />
          <span>Only you</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-orange-200" />
          <span>Friends only</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-green-400" />
          <span>You + friends (darker = more)</span>
        </div>
      </div>
    </div>
  );
}
