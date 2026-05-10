import { useEffect, useRef, useState } from 'react';

const MIN_DISTANCE_M   = 80;    // re-query only after moving this many metres
const MIN_INTERVAL_MS  = 30_000; // re-query at most once every 30 s

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R  = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function queryOverpass(lat, lng, signal) {
  // Query any drivable way within 30 m that has a maxspeed tag
  const q = `[out:json][timeout:6];way(around:30,${lat},${lng})[highway][maxspeed];out tags 1;`;
  const res = await fetch(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
    { signal }
  );
  const data = await res.json();
  if (!Array.isArray(data.elements) || data.elements.length === 0) return null;

  for (const el of data.elements) {
    const raw = el.tags?.maxspeed;
    if (!raw) continue;
    const m = raw.match(/^(\d+)/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    return raw.toLowerCase().includes('mph') ? Math.round(n * 1.60934) : n;
  }
  return null;
}

/**
 * useSpeedLimit
 *
 * Accepts the current GPS location and returns the posted speed limit (km/h)
 * on the nearest road, fetched from OpenStreetMap Overpass API.
 *
 * Re-queries only when the device has moved ≥ 80 m from the last query point
 * and at least 30 s have elapsed, to avoid hammering the free API.
 *
 * Returns:
 *   speedLimit  number|null  – detected limit in km/h, null if unknown
 *   detecting   boolean      – true while a query is in-flight
 */
export function useSpeedLimit(location) {
  const [speedLimit, setSpeedLimit] = useState(null);
  const [detecting,  setDetecting]  = useState(false);

  const lastQueryPos  = useRef(null);
  const lastQueryTime = useRef(0);
  const abortRef      = useRef(null);

  useEffect(() => {
    if (!location?.lat || !location?.lng) return;

    const now  = Date.now();
    const dist = lastQueryPos.current
      ? haversineMeters(lastQueryPos.current.lat, lastQueryPos.current.lng, location.lat, location.lng)
      : Infinity;

    if (now - lastQueryTime.current < MIN_INTERVAL_MS && dist < MIN_DISTANCE_M) return;

    // Cancel any in-flight query before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    lastQueryTime.current = now;
    lastQueryPos.current  = { lat: location.lat, lng: location.lng };

    setDetecting(true);

    queryOverpass(location.lat, location.lng, controller.signal)
      .then((limit) => { if (limit != null) setSpeedLimit(limit); })
      .catch(() => {}) // network errors are silent — keep whatever limit we had
      .finally(() => setDetecting(false));
  }, [location]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { speedLimit, detecting };
}
