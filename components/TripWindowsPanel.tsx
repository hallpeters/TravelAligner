'use client';

import { useState, useEffect, useMemo } from 'react';

type MyRange = { id: number; start_date: string; end_date: string; label: string | null };
type FriendRange = { friend_name: string; start_date: string; end_date: string };

type TripWindow = {
  id: string;
  type: 'grey' | 'green' | 'yellow';
  start_date: string;
  end_date: string;
  label: string | null;
  friends: string[];
  rangeId?: number; // only set for grey cards (DB id)
};

// ---- date helpers ----

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayCount(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

function formatDate(d: string): string {
  const parts = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(parts[1]) - 1]} ${parseInt(parts[2])}`;
}

function formatRange(start: string, end: string): string {
  const sy = start.slice(0, 4), ey = end.slice(0, 4);
  if (sy === ey) return `${formatDate(start)} – ${formatDate(end)}, ${sy}`;
  return `${formatDate(start)}, ${sy} – ${formatDate(end)}, ${ey}`;
}

// ---- algorithm ----

type Segment = { start: string; end: string; meIn: boolean; friendsIn: Set<string> };

function computeSegments(myRanges: MyRange[], friendRanges: FriendRange[]): Segment[] {
  const boundarySet = new Set<string>();
  for (const r of myRanges) {
    boundarySet.add(r.start_date);
    boundarySet.add(addDays(r.end_date, 1));
  }
  for (const fr of friendRanges) {
    boundarySet.add(fr.start_date);
    boundarySet.add(addDays(fr.end_date, 1));
  }
  const boundaries = Array.from(boundarySet).sort();
  const segments: Segment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = addDays(boundaries[i + 1], -1);
    const meIn = myRanges.some(r => r.start_date <= start && r.end_date >= end);
    const friendsIn = new Set(
      friendRanges
        .filter(fr => fr.start_date <= start && fr.end_date >= end)
        .map(fr => fr.friend_name)
    );
    segments.push({ start, end, meIn, friendsIn });
  }
  return segments;
}

// Enumerate every contiguous span of segments, computing the friend intersection
// (people available for ALL days in the span) and whether I'm in every day.
// Prunes early when the intersection empties or the window becomes mixed.
function enumerateSpans(segments: Segment[]) {
  const spans: { start: string; end: string; meInAll: boolean; friends: string[] }[] = [];
  for (let i = 0; i < segments.length; i++) {
    let intersection = new Set(segments[i].friendsIn);
    let meInAll = segments[i].meIn;
    let meInAny = segments[i].meIn;

    for (let j = i; j < segments.length; j++) {
      if (j > i) {
        const next = segments[j];
        const narrowed = new Set<string>();
        for (const f of intersection) if (next.friendsIn.has(f)) narrowed.add(f);
        intersection = narrowed;
        meInAll = meInAll && next.meIn;
        meInAny = meInAny || next.meIn;
      }
      // Mixed span (some days I'm in, some not) — can't be green or yellow, prune
      if (!meInAll && meInAny) break;
      // Friend intersection is empty — extending can only keep it empty, prune
      if (intersection.size === 0) break;

      spans.push({
        start: segments[i].start,
        end: segments[j].end,
        meInAll,
        friends: Array.from(intersection),
      });
    }
  }
  return spans;
}

function selectNonOverlapping(
  candidates: { start: string; end: string; friends: string[]; meInAll: boolean }[],
  type: 'green' | 'yellow',
  minDays: number,
  myRanges: MyRange[]
): TripWindow[] {
  const minFriends = 1;
  const filtered = candidates
    .filter(c => c.friends.length >= minFriends && dayCount(c.start, c.end) >= minDays)
    .sort((a, b) => {
      const diff = b.friends.length - a.friends.length;
      return diff !== 0 ? diff : dayCount(b.start, b.end) - dayCount(a.start, a.end);
    });

  const selected: TripWindow[] = [];
  for (const c of filtered) {
    if (selected.some(s => overlaps(s.start_date, s.end_date, c.start, c.end))) continue;
    const label = type === 'green'
      ? (myRanges.find(r => r.start_date <= c.start && r.end_date >= c.end)?.label ?? null)
      : null;
    selected.push({
      id: `${type}-${c.start}-${c.end}`,
      type,
      start_date: c.start,
      end_date: c.end,
      label,
      friends: c.friends,
    });
  }
  return selected;
}

function generateWindows(
  myRanges: MyRange[],
  friendRanges: FriendRange[],
  minDays: number
): TripWindow[] {
  // Grey cards: one per personal range, friends = those who cover the FULL range
  const grey: TripWindow[] = myRanges.map(r => ({
    id: `grey-${r.id}`,
    type: 'grey' as const,
    start_date: r.start_date,
    end_date: r.end_date,
    label: r.label,
    rangeId: r.id,
    friends: [
      ...new Set(
        friendRanges
          .filter(fr => fr.start_date <= r.start_date && fr.end_date >= r.end_date)
          .map(fr => fr.friend_name)
      ),
    ],
  }));

  if (friendRanges.length === 0) return grey;

  const segments = computeSegments(myRanges, friendRanges);
  const spans = enumerateSpans(segments);

  const green = selectNonOverlapping(
    spans.filter(s => s.meInAll),
    'green', minDays, myRanges
  );
  const yellow = selectNonOverlapping(
    spans.filter(s => !s.meInAll),
    'yellow', minDays, myRanges
  );

  // Sort by: total people DESC → user-attending first → duration DESC
  function totalPeople(w: TripWindow) {
    return w.friends.length + (w.type !== 'yellow' ? 1 : 0);
  }
  return [...grey, ...green, ...yellow].sort((a, b) => {
    const tDiff = totalPeople(b) - totalPeople(a);
    if (tDiff !== 0) return tDiff;
    const userA = a.type !== 'yellow' ? 1 : 0;
    const userB = b.type !== 'yellow' ? 1 : 0;
    if (userB !== userA) return userB - userA;
    return dayCount(b.start_date, b.end_date) - dayCount(a.start_date, a.end_date);
  });
}

// ---- card component ----

const SHOW_LIMIT = 3;

function WindowCard({
  window: w,
  expanded,
  onToggle,
  labelOverride,
  onLabelSave,
  onDateRangeSave,
}: {
  window: TripWindow;
  expanded: boolean;
  onToggle: () => void;
  labelOverride: string | null;
  onLabelSave: (label: string) => void;
  onDateRangeSave?: (id: number, start: string, end: string, label: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const visibleFriends = expanded ? w.friends : w.friends.slice(0, SHOW_LIMIT);
  const days = dayCount(w.start_date, w.end_date);

  // Green cards don't inherit the date-range label — only show explicit overrides
  const displayLabel = labelOverride ?? (w.type === 'green' ? null : w.label);

  function startEdit() {
    setDraft(displayLabel ?? '');
    setEditStart(w.start_date);
    setEditEnd(w.end_date);
    setEditError('');
    setEditing(true);
  }

  function save() {
    onLabelSave(draft.trim());
    setEditing(false);
  }

  async function saveGreyEdit() {
    if (!editStart || !editEnd) { setEditError('Both dates required'); return; }
    if (editStart > editEnd) { setEditError('Start must be before end'); return; }
    setSaving(true);
    await onDateRangeSave!(w.rangeId!, editStart, editEnd, draft.trim());
    setSaving(false);
    setEditing(false);
  }

  const cardStyle = {
    grey: 'bg-gray-50 border-gray-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-orange-50 border-orange-200',
  }[w.type];

  const badgeStyle = {
    grey: 'bg-gray-400 text-white',
    green: 'bg-green-500 text-white',
    yellow: 'bg-orange-400 text-white',
  }[w.type];

  const badgeText = {
    grey: 'Your dates',
    green: "You're free!",
    yellow: 'Not free',
  }[w.type];

  return (
    <div className={`relative rounded-xl border ${cardStyle} pt-6 px-4 pb-4`}>
      {/* Corner badge */}
      <div className="absolute -top-3 left-3">
        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${badgeStyle}`}>
          {badgeText}
        </span>
      </div>

      {/* Edit pen — top right */}
      {!editing && (
        <button
          onClick={startEdit}
          title="Edit name"
          className="absolute top-2 right-3 text-gray-300 hover:text-gray-500 transition-colors text-sm leading-none"
        >
          ✎
        </button>
      )}

      {/* Edit form */}
      {editing && w.type === 'grey' ? (
        <div className="mb-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">From</label>
              <input autoFocus type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">To</label>
              <input type="date" value={editEnd} min={editStart} onChange={e => setEditEnd(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </div>
          </div>
          <input type="text" placeholder="Label (optional)" value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGreyEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          {editError && <p className="text-red-500 text-xs">{editError}</p>}
          <div className="flex gap-2">
            <button onClick={saveGreyEdit} disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 rounded-lg transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
              className="flex-1 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium py-1.5 rounded-lg border border-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : editing ? (
        <div className="mb-1">
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="Add a name…"
            className="w-full text-sm font-semibold text-gray-900 bg-transparent border-b border-gray-300 focus:outline-none focus:border-blue-400 leading-tight"
          />
        </div>
      ) : displayLabel ? (
        <div className="text-sm font-semibold text-gray-900 leading-tight mb-0.5">{displayLabel}</div>
      ) : null}

      {!editing && <div className="text-sm font-medium text-gray-700">{formatRange(w.start_date, w.end_date)}</div>}

      {/* Stats */}
      <div className="mt-2 flex gap-3 text-xs text-gray-600">
        <span>{w.friends.length} {w.friends.length === 1 ? 'friend' : 'friends'} can attend</span>
        <span>·</span>
        <span>{days} {days === 1 ? 'day' : 'days'}</span>
      </div>

      {/* Friend list */}
      {w.friends.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {visibleFriends.map(f => (
            <div key={f} className="text-xs text-gray-700">· {f}</div>
          ))}
          {w.friends.length > SHOW_LIMIT && (
            <button
              onClick={onToggle}
              className="text-xs text-blue-500 hover:underline mt-0.5"
            >
              {expanded ? 'Show less' : `Show all ${w.friends.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---- main export ----

const STORAGE_KEY = 'tripWindowLabels';

export default function TripWindowsPanel({
  refreshKey,
  onRefresh,
  onGoToFriends,
}: {
  refreshKey: number;
  onRefresh: () => void;
  onGoToFriends?: () => void;
}) {
  const [myRanges, setMyRanges] = useState<MyRange[]>([]);
  const [friendRanges, setFriendRanges] = useState<FriendRange[]>([]);
  const [minDays, setMinDays] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Add-date form state
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rangeLabel, setRangeLabel] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setLabelOverrides(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch('/api/trip-windows')
      .then(r => r.json())
      .then(data => {
        setMyRanges(data.myRanges ?? []);
        setFriendRanges(data.friendRanges ?? []);
        setLoading(false);
      });
  }, [refreshKey]);

  async function addRange(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) { setFormError('Both dates are required'); return; }
    if (startDate > endDate) { setFormError('Start must be before end'); return; }
    setFormError('');
    setFormLoading(true);
    const res = await fetch('/api/date-ranges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date: startDate, end_date: endDate, label: rangeLabel || null }),
    });
    setFormLoading(false);
    if (res.ok) {
      setStartDate('');
      setEndDate('');
      setRangeLabel('');
      setShowForm(false);
      onRefresh();
    } else {
      const d = await res.json();
      setFormError(d.error || 'Failed to add');
    }
  }

  const windows = useMemo(
    () => generateWindows(myRanges, friendRanges, minDays),
    [myRanges, friendRanges, minDays]
  );

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveLabel(id: string, label: string) {
    setLabelOverrides(prev => {
      const next = { ...prev, [id]: label };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  async function saveDateRange(id: number, start: string, end: string, label: string) {
    await fetch('/api/date-ranges', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, start_date: start, end_date: end, label: label || null }),
    });
    onRefresh();
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      {/* Header + filter */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Trip Windows</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Min days</label>
          <input
            type="number"
            min={1}
            value={minDays}
            onChange={e => setMinDays(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-gray-400" /> Your dates
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-green-500" /> You + friends
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-orange-400" /> Friends only
        </span>
      </div>

      {/* Add date range */}
      {showForm ? (
        <form onSubmit={addRange} className="mb-5 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">To</label>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500" />
            </div>
          </div>
          <input type="text" placeholder="Label (optional)" value={rangeLabel} onChange={e => setRangeLabel(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500" />
          <p className="text-[11px] text-gray-400">Add dates you're free to travel — not trips you've already booked.</p>
          {formError && <p className="text-red-500 text-xs">{formError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={formLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 rounded-lg transition-colors disabled:opacity-50">
              {formLoading ? 'Adding…' : 'Add'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setFormError(''); }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full mb-5 py-1.5 text-sm text-blue-600 hover:text-blue-700 border border-dashed border-blue-300 hover:border-blue-400 rounded-lg transition-colors">
          + Add date range
        </button>
      )}

      {/* Invite prompt: has dates but no friends yet */}
      {!loading && myRanges.length > 0 && friendRanges.length === 0 && (
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center">
          <p className="text-sm text-blue-800 font-medium mb-2">Now invite a friend to see when you can travel together</p>
          <button
            onClick={onGoToFriends}
            className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg transition-colors"
          >
            Go to Friends
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading...</div>
      ) : windows.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">
          Add travel dates to see trip windows
        </div>
      ) : (
        <div className="space-y-5">
          {windows.map(w => (
            <WindowCard
              key={w.id}
              window={w}
              expanded={expandedIds.has(w.id)}
              onToggle={() => toggleExpanded(w.id)}
              labelOverride={labelOverrides[w.id] ?? null}
              onLabelSave={label => saveLabel(w.id, label)}
              onDateRangeSave={saveDateRange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
