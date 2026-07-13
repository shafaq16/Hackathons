const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { status } = req.query;
  const clauses = [];
  const params = [];
  if (status) { params.push(status); clauses.push(`t.status = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT t.*, v.registration_number, v.name AS vehicle_name, d.name AS driver_name
     FROM trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     JOIN drivers d ON d.id = t.driver_id
     ${where}
     ORDER BY t.id DESC`,
    params
  );
  res.json(rows);
});

// Create a Draft trip -- validates capacity + availability, does NOT change status yet
router.post('/', authorize('fleet_manager', 'driver'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { source, destination, vehicle_id, driver_id, cargo_weight, planned_distance } = req.body;
    if (!source || !destination || !vehicle_id || !driver_id || !cargo_weight || !planned_distance) {
      return res.status(400).json({ error: 'Source, destination, vehicle, driver, cargo weight, and distance are all required.' });
    }

    await client.query('BEGIN');

    const vRes = await client.query('SELECT * FROM vehicles WHERE id = $1 FOR UPDATE', [vehicle_id]);
    const dRes = await client.query('SELECT * FROM drivers WHERE id = $1 FOR UPDATE', [driver_id]);
    const vehicle = vRes.rows[0];
    const driver = dRes.rows[0];

    if (!vehicle) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Vehicle not found.' }); }
    if (!driver) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Driver not found.' }); }

    if (vehicle.status === 'Retired' || vehicle.status === 'In Shop') {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `${vehicle.registration_number} is ${vehicle.status} and cannot be dispatched.` });
    }
    if (vehicle.status === 'On Trip') {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `${vehicle.registration_number} is already on a trip.` });
    }
    if (driver.status === 'Suspended') {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `${driver.name} is suspended and cannot be assigned.` });
    }
    if (new Date(driver.license_expiry) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `${driver.name}'s license expired on ${driver.license_expiry}.` });
    }
    if (driver.status === 'On Trip') {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `${driver.name} is already on a trip.` });
    }
    if (Number(cargo_weight) > Number(vehicle.max_load_capacity)) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `Cargo weight ${cargo_weight}kg exceeds ${vehicle.registration_number}'s capacity of ${vehicle.max_load_capacity}kg.` });
    }

    const { rows } = await client.query(
      `INSERT INTO trips (source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'Draft',$7) RETURNING *`,
      [source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, req.user.id]
    );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not create the trip.' });
  } finally {
    client.release();
  }
});

// Dispatch: Draft -> Dispatched, vehicle & driver -> On Trip
router.post('/:id/dispatch', authorize('fleet_manager', 'driver'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const tRes = await client.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [req.params.id]);
    const trip = tRes.rows[0];
    if (!trip) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Trip not found.' }); }
    if (trip.status !== 'Draft') {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `Only Draft trips can be dispatched (this trip is ${trip.status}).` });
    }

    const vRes = await client.query('SELECT * FROM vehicles WHERE id = $1 FOR UPDATE', [trip.vehicle_id]);
    const dRes = await client.query('SELECT * FROM drivers WHERE id = $1 FOR UPDATE', [trip.driver_id]);
    const vehicle = vRes.rows[0];
    const driver = dRes.rows[0];

    if (vehicle.status !== 'Available') {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `${vehicle.registration_number} is no longer Available.` });
    }
    if (driver.status !== 'Available' || new Date(driver.license_expiry) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `${driver.name} is no longer eligible for dispatch.` });
    }

    await client.query(`UPDATE vehicles SET status = 'On Trip', updated_at = now() WHERE id = $1`, [vehicle.id]);
    await client.query(`UPDATE drivers SET status = 'On Trip', updated_at = now() WHERE id = $1`, [driver.id]);
    const upd = await client.query(
      `UPDATE trips SET status = 'Dispatched', dispatched_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
      [trip.id]
    );

    await client.query('COMMIT');
    res.json(upd.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not dispatch the trip.' });
  } finally {
    client.release();
  }
});

// Complete: Dispatched -> Completed, vehicle & driver -> Available
router.post('/:id/complete', authorize('fleet_manager', 'driver'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { final_odometer, fuel_consumed, revenue } = req.body;
    await client.query('BEGIN');
    const tRes = await client.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [req.params.id]);
    const trip = tRes.rows[0];
    if (!trip) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Trip not found.' }); }
    if (trip.status !== 'Dispatched') {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `Only Dispatched trips can be completed (this trip is ${trip.status}).` });
    }

    await client.query(`UPDATE vehicles SET status = 'Available', odometer = COALESCE($2, odometer), updated_at = now() WHERE id = $1`, [trip.vehicle_id, final_odometer]);
    await client.query(`UPDATE drivers SET status = 'Available', updated_at = now() WHERE id = $1`, [trip.driver_id]);

    if (fuel_consumed) {
      await client.query(
        `INSERT INTO fuel_logs (vehicle_id, trip_id, liters, cost, log_date, created_by) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5)`,
        [trip.vehicle_id, trip.id, fuel_consumed, req.body.fuel_cost || 0, req.user.id]
      );
    }

    const upd = await client.query(
      `UPDATE trips SET status = 'Completed', completed_at = now(), final_odometer = COALESCE($2, final_odometer),
        fuel_consumed = COALESCE($3, fuel_consumed), revenue = COALESCE($4, revenue), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [trip.id, final_odometer, fuel_consumed, revenue]
    );

    await client.query('COMMIT');
    res.json(upd.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not complete the trip.' });
  } finally {
    client.release();
  }
});

// Cancel: Draft/Dispatched -> Cancelled, restores vehicle & driver if they were On Trip
router.post('/:id/cancel', authorize('fleet_manager', 'driver'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const tRes = await client.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [req.params.id]);
    const trip = tRes.rows[0];
    if (!trip) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Trip not found.' }); }
    if (!['Draft', 'Dispatched'].includes(trip.status)) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `Trip is already ${trip.status}.` });
    }

    if (trip.status === 'Dispatched') {
      await client.query(`UPDATE vehicles SET status = 'Available', updated_at = now() WHERE id = $1`, [trip.vehicle_id]);
      await client.query(`UPDATE drivers SET status = 'Available', updated_at = now() WHERE id = $1`, [trip.driver_id]);
    }

    const upd = await client.query(
      `UPDATE trips SET status = 'Cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
      [trip.id]
    );

    await client.query('COMMIT');
    res.json(upd.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not cancel the trip.' });
  } finally {
    client.release();
  }
});

module.exports = router;
