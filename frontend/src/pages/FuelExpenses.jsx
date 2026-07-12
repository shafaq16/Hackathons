import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const EMPTY_FUEL = { vehicle_id: '', liters: '', cost: '', log_date: '' };
const EMPTY_EXPENSE = { vehicle_id: '', category: 'Toll', amount: '', expense_date: '', notes: '' };

export default function FuelExpenses() {
  const { user } = useAuth();
  const canManage = ['fleet_manager', 'driver', 'financial_analyst'].includes(user?.role);
  const [tab, setTab] = useState('fuel');
  const [fuelLogs, setFuelLogs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fuelModal, setFuelModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [fuelForm, setFuelForm] = useState(EMPTY_FUEL);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([client.get('/fuel-logs'), client.get('/expenses'), client.get('/vehicles')])
      .then(([f, e, v]) => { setFuelLogs(f.data); setExpenses(e.data); setVehicles(v.data); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submitFuel = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await client.post('/fuel-logs', fuelForm);
      setFuelModal(false);
      setFuelForm(EMPTY_FUEL);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the fuel log.');
    }
  };

  const submitExpense = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await client.post('/expenses', expenseForm);
      setExpenseModal(false);
      setExpenseForm(EMPTY_EXPENSE);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the expense.');
    }
  };

  return (
    <Layout title="Fuel & Expenses">
      <div className="flex items-center gap-1 mb-5 border-b border-paper-line dark:border-ink-line">
        {[['fuel', 'Fuel Logs'], ['expenses', 'Other Expenses']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-signal-transit text-signal-transit' : 'border-transparent text-ink/50 dark:text-paper/50'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        {canManage && (tab === 'fuel'
          ? <button onClick={() => { setFuelForm(EMPTY_FUEL); setError(''); setFuelModal(true); }} className="btn-primary !py-1.5 mb-1">+ Add Fuel Log</button>
          : <button onClick={() => { setExpenseForm(EMPTY_EXPENSE); setError(''); setExpenseModal(true); }} className="btn-primary !py-1.5 mb-1">+ Add Expense</button>)}
      </div>

      {tab === 'fuel' ? (
        <div className="panel overflow-x-auto">
          <table className="w-full manifest-table">
            <thead><tr><th>Vehicle</th><th>Date</th><th>Liters</th><th>Cost</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={4} className="text-center py-8 text-ink/40">Loading fuel logs…</td></tr>
                : fuelLogs.length === 0 ? <tr><td colSpan={4} className="text-center py-8 text-ink/40">No fuel logs recorded yet.</td></tr>
                : fuelLogs.map((f) => (
                <tr key={f.id}>
                  <td className="font-mono">{f.registration_number}</td>
                  <td className="text-ink/55 dark:text-paper/55">{new Date(f.log_date).toLocaleDateString('en-IN')}</td>
                  <td className="font-mono">{Number(f.liters).toFixed(1)} L</td>
                  <td className="font-mono">₹{Number(f.cost).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full manifest-table">
            <thead><tr><th>Vehicle</th><th>Category</th><th>Date</th><th>Amount</th><th>Notes</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="text-center py-8 text-ink/40">Loading expenses…</td></tr>
                : expenses.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-ink/40">No expenses recorded yet.</td></tr>
                : expenses.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono">{e.registration_number}</td>
                  <td>{e.category}</td>
                  <td className="text-ink/55 dark:text-paper/55">{new Date(e.expense_date).toLocaleDateString('en-IN')}</td>
                  <td className="font-mono">₹{Number(e.amount).toLocaleString()}</td>
                  <td className="text-ink/45 dark:text-paper/45">{e.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={fuelModal} onClose={() => setFuelModal(false)} title="Add Fuel Log">
        <form onSubmit={submitFuel} className="space-y-3">
          <div>
            <label className="board-eyebrow block mb-1.5">Vehicle</label>
            <select required className="input-field" value={fuelForm.vehicle_id} onChange={(e) => setFuelForm({ ...fuelForm, vehicle_id: e.target.value })}>
              <option value="">Select a vehicle…</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number} — {v.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="board-eyebrow block mb-1.5">Liters</label>
              <input required type="number" className="input-field" value={fuelForm.liters} onChange={(e) => setFuelForm({ ...fuelForm, liters: e.target.value })} />
            </div>
            <div>
              <label className="board-eyebrow block mb-1.5">Cost (₹)</label>
              <input required type="number" className="input-field" value={fuelForm.cost} onChange={(e) => setFuelForm({ ...fuelForm, cost: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="board-eyebrow block mb-1.5">Date</label>
            <input type="date" className="input-field" value={fuelForm.log_date} onChange={(e) => setFuelForm({ ...fuelForm, log_date: e.target.value })} />
          </div>
          {error && <div className="text-sm text-signal-alert">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFuelModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Fuel Log</button>
          </div>
        </form>
      </Modal>

      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="Add Expense">
        <form onSubmit={submitExpense} className="space-y-3">
          <div>
            <label className="board-eyebrow block mb-1.5">Vehicle</label>
            <select required className="input-field" value={expenseForm.vehicle_id} onChange={(e) => setExpenseForm({ ...expenseForm, vehicle_id: e.target.value })}>
              <option value="">Select a vehicle…</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number} — {v.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="board-eyebrow block mb-1.5">Category</label>
              <select className="input-field" value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                {['Toll', 'Parking', 'Permit', 'Fine', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="board-eyebrow block mb-1.5">Amount (₹)</label>
              <input required type="number" className="input-field" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="board-eyebrow block mb-1.5">Date</label>
            <input type="date" className="input-field" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} />
          </div>
          <div>
            <label className="board-eyebrow block mb-1.5">Notes</label>
            <input className="input-field" value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} />
          </div>
          {error && <div className="text-sm text-signal-alert">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setExpenseModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Expense</button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
