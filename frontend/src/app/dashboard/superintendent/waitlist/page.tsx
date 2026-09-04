'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/shadcn/badge-extended';
import { Button } from '@/components/shadcn/button-extended';
import { Spinner } from '@/components/feedback/Spinner';
import { Modal } from '@/components/feedback/Modal';

interface WaitlistApplication {
  id: string;
  tracking_number: string;
  applicant_name: string;
  applicant_mobile: string;
  applicant_email: string | null;
  vertical: string;
  current_status: string;
  waitlisted_at: string | null;
  created_at: string;
}

interface Room {
  id: string;
  room_number: string;
  floor: number;
  capacity: number;
  occupied_count: number;
  status: string;
  vertical: string;
}

export default function WaitlistPage() {
  const [items, setItems] = useState<WaitlistApplication[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WaitlistApplication | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [allocating, setAllocating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('authToken');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [waitRes, roomsRes] = await Promise.all([
        fetch('/api/applications/waitlist', { headers }),
        fetch('/api/rooms', { headers }),
      ]);
      if (!waitRes.ok) throw new Error('Failed to load waitlist');
      const waitData = await waitRes.json();
      setItems(Array.isArray(waitData.data) ? waitData.data : waitData.data?.data || []);

      if (roomsRes.ok) {
        const roomsData = await roomsRes.json();
        const allRooms: Room[] = Array.isArray(roomsData.data)
          ? roomsData.data
          : roomsData.data?.data || [];
        setRooms(allRooms.filter((r) => r.occupied_count < r.capacity && r.status !== 'MAINTENANCE' && r.status !== 'CLOSED'));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load waitlist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAllocateModal = (app: WaitlistApplication) => {
    setSelected(app);
    setSelectedRoomId('');
  };

  const closeModal = () => {
    setSelected(null);
    setSelectedRoomId('');
  };

  const handleAllocate = async () => {
    if (!selected || !selectedRoomId) return;
    setAllocating(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/allocations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ application_id: selected.id, room_id: selectedRoomId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to allocate room');
        return;
      }
      closeModal();
      await fetchData();
    } finally {
      setAllocating(false);
    }
  };

  const matchingRooms = selected ? rooms.filter((r) => r.vertical === selected.vertical) : [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Waitlist
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Approved applicants waiting for a room. Allocate a room to promote them to APPROVED.
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded border-l-4 bg-red-50 border-red-500">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-12 border rounded" style={{ borderColor: 'var(--border-gray-200)' }}>
          <p className="text-gray-500">No applicants currently on the waitlist.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="border rounded overflow-hidden" style={{ borderColor: 'var(--border-gray-200)' }}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Tracking</th>
                <th className="text-left px-4 py-3 font-medium">Applicant</th>
                <th className="text-left px-4 py-3 font-medium">Mobile</th>
                <th className="text-left px-4 py-3 font-medium">Vertical</th>
                <th className="text-left px-4 py-3 font-medium">Waitlisted Since</th>
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((app, idx) => (
                <tr key={app.id} className="border-t" style={{ borderColor: 'var(--border-gray-200)' }}>
                  <td className="px-4 py-3">{idx + 1}</td>
                  <td className="px-4 py-3 font-mono">{app.tracking_number}</td>
                  <td className="px-4 py-3 font-medium">{app.applicant_name}</td>
                  <td className="px-4 py-3">{app.applicant_mobile}</td>
                  <td className="px-4 py-3">
                    <Badge variant="info" size="sm">{app.vertical}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {app.waitlisted_at ? new Date(app.waitlisted_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="primary" size="sm" onClick={() => openAllocateModal(app)}>
                      Allocate Room
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={!!selected}
        onClose={closeModal}
        title={selected ? `Allocate Room — ${selected.applicant_name}` : ''}
        size="md"
      >
        {selected && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              Allocating a room will promote <strong>{selected.applicant_name}</strong> ({selected.tracking_number}) from WAITLIST to APPROVED, create the student account, and assign the selected room — all in one step.
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Available rooms in {selected.vertical}
              </label>
              {matchingRooms.length === 0 ? (
                <p className="text-sm text-red-600">
                  No rooms with capacity available in this vertical. Free up a bed first.
                </p>
              ) : (
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                >
                  <option value="">— Select a room —</option>
                  {matchingRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.room_number} (Floor {r.floor}) — {r.occupied_count}/{r.capacity} occupied
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="secondary" onClick={closeModal} disabled={allocating}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleAllocate}
                loading={allocating}
                disabled={!selectedRoomId || matchingRooms.length === 0}
              >
                Promote &amp; Allocate
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
