import { useEffect, useRef, useState } from 'react';

const SPEED_VIOLATION_COOLDOWN_MS = 30_000;

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
 * useGPS — continuous GPS speed tracking via navigator.geolocation.
 *
 * Speed is taken from coords.speed (native GPS chip) and, when that is null
 * (common on Android), calculated from consecutive position fixes using the
 * Haversine formula.
 *
 * speedLimit is kept in a ref so changing it mid-trip does NOT restart the
 * geolocation watch — the new limit takes effect on the next position fix.
 *
 * @param {object}   opts
 * @param {boolean}  opts.enabled      – Start/stop tracking.
 * @param {number}   opts.speedLimit   – km/h threshold that triggers onViolation.
 * @param {Function} opts.onViolation  – Called with { type, speed, speedLimit, location }.
 *
 * @returns {{ speed: number|null, location: object|null, error: string|null,
 *             permissionDenied: boolean, active: boolean }}
 */
export function useGPS({ enabled = false, speedLimit = 80, onViolation } = {}) {
  const [state, setState] = useState({
    speed:            null,
    location:         null,
    error:            null,
    permissionDenied: false,
    active:           false,
  });

  const onViolationRef       = useRef(onViolation);
  const speedLimitRef        = useRef(speedLimit);
  const lastViolationTimeRef = useRef(0);
  const watchIdRef           = useRef(null);
  const prevPosRef           = useRef(null); // { lat, lng, time } of last fix

  // Keep refs in sync without restarting the watch
  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);
  useEffect(() => { speedLimitRef.current  = speedLimit;  }, [speedLimit]);

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      prevPosRef.current = null;
      setState((s) => ({ ...s, active: false }));
      return;
    }

    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'Geolocation not supported by this browser', active: false }));
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const location = { lat, lng };

        // ── Speed: prefer native GPS chip, fall back to Haversine ──────────
        let speedKmh = null;

        if (pos.coords.speed != null && pos.coords.speed >= 0) {
          speedKmh = Math.round(pos.coords.speed * 3.6);
        } else if (prevPosRef.current) {
          const { lat: lat1, lng: lng1, time: t1 } = prevPosRef.current;
          const dtSec = (pos.timestamp - t1) / 1000;
          if (dtSec > 0.5 && dtSec < 15) {
            const distM = haversineMeters(lat1, lng1, lat, lng);
            speedKmh = Math.round((distM / dtSec) * 3.6);
          }
        }

        prevPosRef.current = { lat, lng, time: pos.timestamp };

        setState({ speed: speedKmh, location, error: null, permissionDenied: false, active: true });

        // ── Violation check ─────────────────────────────────────────────────
        const limit = speedLimitRef.current;
        if (speedKmh != null && speedKmh > limit) {
          const now = Date.now();
          if (now - lastViolationTimeRef.current >= SPEED_VIOLATION_COOLDOWN_MS) {
            lastViolationTimeRef.current = now;
            onViolationRef.current?.({ type: 'speed_violation', speed: speedKmh, speedLimit: limit, location });
          }
        }
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        prevPosRef.current = null;
        setState((s) => ({
          ...s,
          error:            denied ? 'GPS permission denied' : 'GPS signal unavailable',
          permissionDenied: denied,
          active:           false,
        }));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 2_000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // speedLimit intentionally NOT in deps — managed via speedLimitRef to avoid restarting watch
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
