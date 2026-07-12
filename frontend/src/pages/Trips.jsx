import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const EMPTY_FORM = { source: '', destination: '', vehicle_id: '', driver_id: '', cargo_weight: '', planned_distance: '' };
const EMPTY_COMPLETE = { final_odometer: '', fuel_consumed: '', fuel_cost: '', revenue: '' };

export default function Trips() {
  const { user } = useAuth();
  const canManage = user?.role === 'fleet_manager' || user?.role === 'driver';
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [completeModal, setCompleteModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [completeForm, setCompleteForm] = useState(EMPTY_COMPLETE);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      client.get('/trips'),
      client.get('/vehicles', { params: { dispatchable: true } }),
      client.get('/drivers', { params: { dispatchable: true } }),
    ]).then(([t, v, d]) => {
      setTrips(t.data);
      setVehicles(v.data);
      setDrivers(d.data);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => { setForm(EMPTY_FORM); setError(''); setModalOpen(true); };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await client.post('/trips', form);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create the trip.');
    }
  };

  const act = async (id, action) => {
    try {
      await client.post(`/trips/${id}/${action}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || `Could not ${action} the trip.`);
    }
  };

  const openComplete = (trip) => { setCompleteModal(trip); setCompleteForm(EMPTY_COMPLETE); setError(''); };

  const handleComplete = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await client.post(`/trips/${completeModal.id}/complete`, completeForm);
      setCompleteModal(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not complete the trip.');
    }
  };

  const filtered = trips.filter((t) => !statusFilter || t.status === statusFilter);

  return (
    <Layout title="Trip Management">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-auto text-sm">
          <option value="">All statuses</option>
          {['Draft', 'Dispatched', 'Completed', 'Cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {canManage && <button onClick={openCreate} className="btn-primary">+ Create Trip</button>}
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full manifest-table">
          <thead>
            <tr>
              <th>Route</th>
              <th>Vehicle</th>
              <th>Driver</th>
              <th>Cargo</th>
              <th>Distance</th>
              <th>Status</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-ink/40">Loading trip log…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-ink/40">No trips match this filter.</td></tr>
            ) : filtered.map((t) => (
              <tr key={t.id}>
                <td>
                  <span className="font-medium">{t.source}</span>
                  <span className="text-ink/35 dark:text-paper/35 mx-1.5">→</span>
                  <span className="font-medium">{t.destination}</span>
                </td>
                <td className="font-mono">{t.registration_number}</td>
                <td>{t.driver_name}</td>
                <td className="font-mono">{Number(t.cargo_weight).toLocaleString()} kg</td>
                <td className="font-mono">{Number(t.planned_distance).toLocaleString()} km</td>
                <td><StatusBadge status={t.status} /></td>
                {canManage && (
                  <td className="text-right space-x-2 whitespace-nowrap">
                    {t.status === 'Draft' && (
                      <>
                        <button onClick={() => act(t.id, 'dispatch')} className="text-xs font-medium text-signal-route">Dispatch</button>
                        <button onClick={() => act(t.id, 'cancel')} className="text-xs font-medium text-signal-alert">Cancel</button>
                      </>
                    )}
                    {t.status === 'Dispatched' && (
                      <>
                        <button onClick={() => openComplete(t)} className="text-xs font-medium text-signal-transit">Complete</button>
                        <button onClick={() => act(t.id, 'cancel')} className="text-xs font-medium text-signal-alert">Cancel</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Trip">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="board-eyebrow block mb-1.5">Source</label>
              <input required className="input-field" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </div>
            <div>
              <label className="board-eyebrow block mb-1.5">Destination</label>
              <input required className="input-field" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="board-eyebrow block mb-1.5">Vehicle (available only)</label>
            <select required className="input-field" value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
              <option value="">Select a vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.registration_number} — {v.name} (max {v.max_load_capacity}kg)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="board-eyebrow block mb-1.5">Driver (available &amp; licensed only)</label>
            <select required className="input-field" value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
              <option value="">Select a driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name} — {d.license_category}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="board-eyebrow block mb-1.5">Cargo Weight (kg)</label>
              <input required type="number" className="input-field" value={form.cargo_weight} onChange={(e) => setForm({ ...form, cargo_weight: e.target.value })} />
            </div>
            <div>
              <label className="board-eyebrow block mb-1.5">Planned Distance (km)</label>
              <input required type="number" className="input-field" value={form.planned_distance} onChange={(e) => setForm({ ...form, planned_distance: e.target.value })} />
            </div>
          </div>
          {error && <div className="text-sm text-signal-alert">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Draft Trip</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!completeModal} onClose={() => setCompleteModal(null)} title={`Complete Trip — ${completeModal?.source} → ${completeModal?.destination}`}>
        <form onSubmit={handleComplete} className="space-y-3">
          <div>
            <label className="board-eyebrow block mb-1.5">Final Odometer (km)</label>
            <input required type="number" className="input-field" value={completeForm.final_odometer}
              onChange={(e) => setCompleteForm({ ...completeForm, final_odometer: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="board-eyebrow block mb-1.5">Fuel Consumed (L)</label>
              <input type="number" className="input-field" value={completeForm.fuel_consumed}
                onChange={(e) => setCompleteForm({ ...completeForm, fuel_consumed: e.target.value })} />
            </div>
            <div>
              <label className="board-eyebrow block mb-1.5">Fuel Cost (₹)</label>
              <input type="number" className="input-field" value={completeForm.fuel_cost}
                onChange={(e) => setCompleteForm({ ...completeForm, fuel_cost: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="board-eyebrow block mb-1.5">Trip Revenue (₹)</label>
            <input type="number" className="input-field" value={completeForm.revenue}
              onChange={(e) => setCompleteForm({ ...completeForm, revenue: e.target.value })} />
          </div>
          {error && <div className="text-sm text-signal-alert">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCompleteModal(null)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Mark Completed</button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
