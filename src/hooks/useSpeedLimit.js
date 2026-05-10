import { useEffect, useRef, useState } from 'react';

const MIN_DISTANCE_M  = 80;
const MIN_INTERVAL_MS = 30_000;

// Default speed limits by OSM highway type (km/h).
// Used when a road has no explicit maxspeed tag.
const HIGHWAY_DEFAULTS = {
  motorway:        120,
  motorway_link:   100,
  trunk:           100,
  trunk_link:       80,
  primary:          80,
  primary_link:     70,
  secondary:        70,
  secondary_link:   60,
  tertiary:         50,
  tertiary_link:    50,
  unclassified:     50,
  residential:      40,
  living_street:    20,
  service:          30,
  road:             50,
};

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R  = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseMpeed(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return raw.toLowerCase().includes('mph') ? Math.round(n * 1.60934) : n;
}

async function queryOverpass(lat, lng, signal) {
  // Query all drivable ways within 30 m — no maxspeed filter so we get results
  // even when speed limit isn't explicitly tagged.
  const q = `[out:json][timeout:8];way(around:30,${lat},${lng})[highway~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|road)$"];out tags 3;`;

  const res = await fetch(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
    { signal }
  );

  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data.elements) || data.elements.length === 0) return null;

  // Prefer an explicit maxspeed tag; fall back to highway-type default.
  for (const el of data.elements) {
    const explicit = parseMpeed(el.tags?.maxspeed);
    if (explicit != null) return { limit: explicit, source: 'tagged' };
  }

  // No maxspeed tag — use the most common highway type among results.
  const typeCounts = {};
  for (const el of data.elements) {
    const t = el.tags?.highway;
    if (t) typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const defaultLimit = HIGHWAY_DEFAULTS[dominantType];

  return defaultLimit != null ? { limit: defaultLimit, source: 'road_type', roadType: dominantType } : null;
}

/**
 * useSpeedLimit
 *
 * Accepts the current GPS location and returns the effective speed limit (km/h)
 * on the nearest road, sourced from OpenStreetMap Overpass API.
 *
 * Strategy:
 *   1. Use explicit maxspeed tag if available.
 *   2. Fall back to standard defaults for the detected road type
 *      (e.g. residential → 40, primary → 80, motorway → 120).
 *
 * Re-queries only when the device has moved ≥ 80 m OR 30 s have elapsed.
 *
 * Returns:
 *   speedLimit  number|null  – detected limit in km/h
 *   detecting   boolean      – true while a query is in-flight
 *   source      string|null  – 'tagged' | 'road_type' | null
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

    if (now - lastQueryTime.current < MIN_INTERVAL_MS && dist < MIN_DISTANCE_M) return;

    abortRef.current?.abort();
    const controller  = new AbortController();
    abortRef.current  = controller;

    lastQueryTime.current = now;
    lastQueryPos.current  = { lat: location.lat, lng: location.lng };

    setDetecting(true);

    queryOverpass(location.lat, location.lng, controller.signal)
      .then((result) => {
        if (result) {
          setSpeedLimit(result.limit);
          setSource(result.source);
          setRoadType(result.roadType ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setDetecting(false));
  }, [location]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { speedLimit, detecting, source, roadType };
}
