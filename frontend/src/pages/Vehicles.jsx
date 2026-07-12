import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const EMPTY_FORM = { registration_number: '', name: '', type: '', max_load_capacity: '', odometer: '', acquisition_cost: '', region: '' };

export default function Vehicles() {
  const { user } = useAuth();
  const canManage = user?.role === 'fleet_manager';
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    client.get('/vehicles').then((res) => setVehicles(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true); };
  const openEdit = (v) => {
    setEditing(v);
    setForm({ ...v, max_load_capacity: v.max_load_capacity, odometer: v.odometer, acquisition_cost: v.acquisition_cost });
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        await client.put(`/vehicles/${editing.id}`, form);
      } else {
        await client.post('/vehicles', form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the vehicle.');
    }
  };

  const handleDelete = async (v) => {
    if (!confirm(`Remove ${v.registration_number} from the registry?`)) return;
    await client.delete(`/vehicles/${v.id}`);
    load();
  };

  const filtered = vehicles.filter((v) => {
    const matchesSearch = `${v.registration_number} ${v.name}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <Layout title="Vehicle Registry">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Search registration or model…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field w-64 text-sm"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-auto text-sm">
            <option value="">All statuses</option>
            {['Available', 'On Trip', 'In Shop', 'Retired'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {canManage && <button onClick={openCreate} className="btn-primary">+ Register Vehicle</button>}
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full manifest-table">
          <thead>
            <tr>
              <th>Registration</th>
              <th>Model</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Odometer</th>
              <th>Status</th>
              <th>Region</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-ink/40">Loading fleet…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-ink/40">No vehicles match these filters.</td></tr>
            ) : filtered.map((v) => (
              <tr key={v.id}>
                <td className="font-mono">{v.registration_number}</td>
                <td>{v.name}</td>
                <td>{v.type}</td>
                <td className="font-mono">{Number(v.max_load_capacity).toLocaleString()} kg</td>
                <td className="font-mono">{Number(v.odometer).toLocaleString()} km</td>
                <td><StatusBadge status={v.status} /></td>
                <td className="text-ink/55 dark:text-paper/55">{v.region || '—'}</td>
                {canManage && (
                  <td className="text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => openEdit(v)} className="text-xs font-medium text-signal-route">Edit</button>
                    <button onClick={() => handleDelete(v)} className="text-xs font-medium text-signal-alert">Remove</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Vehicle' : 'Register Vehicle'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="board-eyebrow block mb-1.5">Registration Number</label>
            <input required disabled={!!editing} className="input-field disabled:opacity-60" value={form.registration_number}
              onChange={(e) => setForm({ ...form, registration_number: e.target.value })} />
          </div>
          <div>
            <label className="board-eyebrow block mb-1.5">Name / Model</label>
            <input required className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="board-eyebrow block mb-1.5">Type</label>
              <input required className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            </div>
            <div>
              <label className="board-eyebrow block mb-1.5">Max Load (kg)</label>
              <input required type="number" className="input-field" value={form.max_load_capacity}
                onChange={(e) => setForm({ ...form, max_load_capacity: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="board-eyebrow block mb-1.5">Odometer (km)</label>
              <input type="number" className="input-field" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} />
            </div>
            <div>
              <label className="board-eyebrow block mb-1.5">Acquisition Cost (₹)</label>
              <input type="number" className="input-field" value={form.acquisition_cost} onChange={(e) => setForm({ ...form, acquisition_cost: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="board-eyebrow block mb-1.5">Region</label>
            <input className="input-field" value={form.region || ''} onChange={(e) => setForm({ ...form, region: e.target.value })} />
          </div>
          {editing && (
            <div>
              <label className="board-eyebrow block mb-1.5">Status</label>
              <select className="input-field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['Available', 'On Trip', 'In Shop', 'Retired'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {error && <div className="text-sm text-signal-alert">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editing ? 'Save Changes' : 'Register Vehicle'}</button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
