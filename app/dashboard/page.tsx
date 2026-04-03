'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Calendar from '@/components/Calendar';
import TripWindowsPanel from '@/components/TripWindowsPanel';
import FriendsManager from '@/components/FriendsManager';
import YearOverview from '@/components/YearOverview';

export default function Dashboard() {
  const router = useRouter();
  const [calendarKey, setCalendarKey] = useState(0);
  const [tab, setTab] = useState<'calendar' | 'friends'>('calendar');
  const [calView, setCalView] = useState<'month' | 'year'>('month');
  const [pendingRequests, setPendingRequests] = useState(0);

  const refreshCalendar = useCallback(() => setCalendarKey(k => k + 1), []);

  async function fetchPendingRequests() {
    const res = await fetch('/api/friends');
    if (res.ok) {
      const data = await res.json();
      setPendingRequests(data.incoming?.length ?? 0);
    }
  }

  useEffect(() => { fetchPendingRequests(); }, []);

  async function logout() {
    await fetch('/api/auth/login', { method: 'DELETE' });
    router.push('/');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">✈️</span>
            <span className="font-bold text-gray-900">TravelSync</span>
          </div>
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setTab('calendar')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'calendar' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setTab('friends')}
              className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'friends' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Friends
              {pendingRequests > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {pendingRequests}
                </span>
              )}
            </button>
          </nav>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4">
        {tab === 'calendar' ? (
          <div className="space-y-4">
            {/* Month / Year toggle */}
            <div className="flex justify-end">
              <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                <button
                  onClick={() => setCalView('month')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    calView === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setCalView('year')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    calView === 'year' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Year
                </button>
              </div>
            </div>

            {calView === 'month' ? (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
                <div className="lg:sticky lg:top-20">
                  <Calendar refreshKey={calendarKey} />
                </div>
                <TripWindowsPanel refreshKey={calendarKey} onRefresh={refreshCalendar} onGoToFriends={() => setTab('friends')} />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
                <div className="lg:sticky lg:top-20">
                  <YearOverview refreshKey={calendarKey} />
                </div>
                <TripWindowsPanel refreshKey={calendarKey} onRefresh={refreshCalendar} onGoToFriends={() => setTab('friends')} />
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-md mx-auto">
            <FriendsManager onRequestsChange={fetchPendingRequests} />
          </div>
        )}
      </main>
    </div>
  );
}
