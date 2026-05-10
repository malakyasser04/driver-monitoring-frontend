import { useEffect, useRef, useState } from 'react';

const MIN_DISTANCE_M  = 80;
const MIN_INTERVAL_MS = 30_000;

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R  = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * useSpeedLimit
 *
 * Calls your own backend GET /api/speed-limit?lat=&lng= which in turn queries
 * OpenStreetMap Overpass from Node.js (no CORS issues, more reliable on mobile).
 *
 * Re-queries only when the device has moved ≥ 80 m OR 30 s have elapsed.
 *
 * Returns:
 *   speedLimit  number|null  – detected limit in km/h
 *   detecting   boolean      – true while a request is in-flight
 *   source      'tagged'|'road_type'|null
 *   roadType    string|null  – OSM highway value when source === 'road_type'
 */
export function useSpeedLimit(location) {
  const [speedLimit, setSpeedLimit] = useState(null);
  const [detecting,  setDetecting]  = useState(false);
  const [source,     setSource]     = useState(null);
  const [roadType,   setRoadType]   = useState(null);

  const lastQueryPos  = useRef(null);
  const lastQueryTime = useRef(0);
  const abortRef      = useRef(null);

  useEffect(() => {
    if (!location?.lat || !location?.lng) return;

    const now  = Date.now();
    const dist = lastQueryPos.current
      ? haversineMeters(lastQueryPos.current.lat, lastQueryPos.current.lng, location.lat, location.lng)
      : Infinity;

    // Debounce: skip if we queried recently AND haven't moved much
    if (now - lastQueryTime.current < MIN_INTERVAL_MS && dist < MIN_DISTANCE_M) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    lastQueryTime.current = now;
    lastQueryPos.current  = { lat: location.lat, lng: location.lng };

    setDetecting(true);

    fetch(
      `${BACKEND}/api/speed-limit?lat=${location.lat}&lng=${location.lng}`,
      {
        signal:  controller.signal,
        headers: { 'ngrok-skip-browser-warning': 'true' },
      }
    )
      .then((r) => r.json())
      .then((data) => {
        if (data?.limit != null) {
          setSpeedLimit(data.limit);
          setSource(data.source ?? null);
          setRoadType(data.roadType ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setDetecting(false));
  }, [location]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { speedLimit, detecting, source, roadType };
}
