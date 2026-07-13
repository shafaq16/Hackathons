const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/kpis', async (req, res) => {
  const { type, region } = req.query;
  const vClauses = [];
  const vParams = [];
  if (type) { vParams.push(type); vClauses.push(`type = $${vParams.length}`); }
  if (region) { vParams.push(region); vClauses.push(`region = $${vParams.length}`); }
  const vWhere = vClauses.length ? `WHERE ${vClauses.join(' AND ')}` : '';

  const [vehicleCounts, tripCounts, driverCounts, totalVehicles] = await Promise.all([
    db.query(`SELECT status, COUNT(*) FROM vehicles ${vWhere} GROUP BY status`, vParams),
    db.query(`SELECT status, COUNT(*) FROM trips GROUP BY status`),
    db.query(`SELECT status, COUNT(*) FROM drivers GROUP BY status`),
    db.query(`SELECT COUNT(*) FROM vehicles ${vWhere}`, vParams),
  ]);

  const asMap = (rows) => rows.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.count) }), {});
  const vStatus = asMap(vehicleCounts.rows);
  const tStatus = asMap(tripCounts.rows);
  const dStatus = asMap(driverCounts.rows);

  const total = Number(totalVehicles.rows[0].count) || 0;
  const active = (vStatus['Available'] || 0) + (vStatus['On Trip'] || 0);
  const utilization = total > 0 ? ((vStatus['On Trip'] || 0) / total) * 100 : 0;

  res.json({
    activeVehicles: active,
    availableVehicles: vStatus['Available'] || 0,
    vehiclesInMaintenance: vStatus['In Shop'] || 0,
    retiredVehicles: vStatus['Retired'] || 0,
    activeTrips: tStatus['Dispatched'] || 0,
    pendingTrips: tStatus['Draft'] || 0,
    completedTrips: tStatus['Completed'] || 0,
    cancelledTrips: tStatus['Cancelled'] || 0,
    driversOnDuty: dStatus['On Trip'] || 0,
    driversAvailable: dStatus['Available'] || 0,
    driversSuspended: dStatus['Suspended'] || 0,
    fleetUtilization: Number(utilization.toFixed(1)),
  });
});

router.get('/filters', async (req, res) => {
  const [types, regions] = await Promise.all([
    db.query(`SELECT DISTINCT type FROM vehicles ORDER BY type`),
    db.query(`SELECT DISTINCT region FROM vehicles WHERE region IS NOT NULL ORDER BY region`),
  ]);
  res.json({
    types: types.rows.map((r) => r.type),
    regions: regions.rows.map((r) => r.region),
  });
});

module.exports = router;
