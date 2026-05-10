import { useEffect, useRef, useState } from 'react';

// Minimum ms between speed-violation events sent to the backend.
const SPEED_VIOLATION_COOLDOWN_MS = 30_000;

/**
 * useGPS — continuous GPS speed tracking via navigator.geolocation.
 *
 * @param {object}   opts
 * @param {boolean}  opts.enabled      - Start/stop tracking.
 * @param {number}   opts.speedLimit   - km/h threshold that triggers onViolation.
 * @param {Function} opts.onViolation  - Called with { type, speed, speedLimit, location }.
 *
 * @returns {{ speed: number|null, location: object|null, error: string|null,
 *             permissionDenied: boolean, active: boolean }}
 */
export function useGPS({ enabled = false, speedLimit = 80, onViolation } = {}) {
  const [state, setState] = useState({
    speed:           null,
    location:        null,
    error:           null,
    permissionDenied: false,
    active:          false,
  });

  // Keep a stable ref to onViolation so the geolocation callback never goes stale.
  const onViolationRef        = useRef(onViolation);
  const lastViolationTimeRef  = useRef(0);
  const watchIdRef            = useRef(null);

  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setState((s) => ({ ...s, active: false }));
      return;
    }

    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'Geolocation not supported by this browser', active: false }));
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const speedMs  = pos.coords.speed;                              // m/s or null
        const speedKmh = speedMs != null ? Math.round(speedMs * 3.6) : null;
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };

        setState({ speed: speedKmh, location, error: null, permissionDenied: false, active: true });

        if (speedKmh != null && speedKmh > speedLimit) {
          const now = Date.now();
          if (now - lastViolationTimeRef.current >= SPEED_VIOLATION_COOLDOWN_MS) {
            lastViolationTimeRef.current = now;
            onViolationRef.current?.({ type: 'speed_violation', speed: speedKmh, speedLimit, location });
          }
        }
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setState((s) => ({
          ...s,
          error:           denied ? 'GPS permission denied' : 'GPS signal unavailable',
          permissionDenied: denied,
          active:          false,
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
    // speedLimit intentionally included — if limit changes mid-trip, restart watch.
  }, [enabled, speedLimit]);

  return state;
}
