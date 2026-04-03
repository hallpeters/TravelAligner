'use client';

import { useState, useEffect } from 'react';

type User = { id: number; username: string };

type FriendsData = {
  friends: User[];
  incoming: User[];
  outgoing: User[];
};

export default function FriendsManager({ onRequestsChange }: { onRequestsChange?: () => void }) {
  const [data, setData] = useState<FriendsData>({ friends: [], incoming: [], outgoing: [] });
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  function copyInviteLink() {
    navigator.clipboard.writeText(window.location.origin).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function fetchFriends() {
    const res = await fetch('/api/friends');
    if (res.ok) {
      setData(await res.json());
      onRequestsChange?.();
    }
  }

  useEffect(() => { fetchFriends(); }, []);

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    setMessage(''); setError('');
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: search.trim() }),
    });
    const d = await res.json();
    if (res.ok) {
      setMessage(d.status === 'accepted' ? `You're now friends with ${search}!` : `Request sent to ${search}`);
      setSearch('');
      fetchFriends();
    } else {
      setError(d.error);
    }
  }

  async function acceptRequest(fromUserId: number) {
    await fetch('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId }),
    });
    fetchFriends();
  }

  async function removeFriend(friendId: number) {
    await fetch('/api/friends', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId }),
    });
    fetchFriends();
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Friends</h2>

      {/* Add friend */}
      <form onSubmit={sendRequest} className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Add by username"
          value={search}
          onChange={e => { setSearch(e.target.value); setError(''); setMessage(''); }}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Add
        </button>
      </form>
      {message && <p className="text-green-600 text-xs mb-3">{message}</p>}
      {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

      {/* Invite prompt */}
      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-6">
        <p className="text-xs text-gray-500">Friend not on TravelSync yet?</p>
        <button
          onClick={copyInviteLink}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors whitespace-nowrap ml-3"
        >
          {copied ? 'Copied!' : 'Copy invite link'}
        </button>
      </div>

      {/* Incoming requests */}
      {data.incoming.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Requests</h3>
          <div className="space-y-2">
            {data.incoming.map(u => (
              <div key={u.id} className="flex items-center justify-between bg-yellow-50 rounded-xl px-4 py-3">
                <span className="text-sm font-medium text-gray-800">@{u.username}</span>
                <button
                  onClick={() => acceptRequest(u.id)}
                  className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg transition-colors"
                >
                  Accept
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending outgoing */}
      {data.outgoing.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pending</h3>
          <div className="space-y-2">
            {data.outgoing.map(u => (
              <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-sm text-gray-600">@{u.username}</span>
                <span className="text-xs text-gray-400">Awaiting...</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends list */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Friends ({data.friends.length})
        </h3>
        {data.friends.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No friends added yet</p>
        ) : (
          <div className="space-y-2">
            {data.friends.map(u => (
              <div key={u.id} className="flex items-center justify-between rounded-xl px-4 py-3 bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                    {u.username[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-800">@{u.username}</span>
                </div>
                <button
                  onClick={() => removeFriend(u.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors"
                  title="Remove friend"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
