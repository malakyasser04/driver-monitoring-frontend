import { useCallback, useEffect, useRef, useState } from 'react';

// Deceleration magnitude (m/s²) that qualifies as harsh braking.
// Negative y-acceleration on most phones corresponds to forward deceleration.
const BRAKING_THRESHOLD_MS2 = 15;

// Minimum ms between consecutive harsh-braking events sent to the backend.
const BRAKING_COOLDOWN_MS = 15_000;

/**
 * useHarshBraking — detects sudden deceleration via DeviceMotion API.
 *
 * On iOS 13+ the user must explicitly grant DeviceMotion permission.
 * When permissionNeeded is true, call requestIOSPermission() from a user-gesture
 * handler (e.g. a button onClick) to trigger the native dialog.
 *
 * @param {object}   opts
 * @param {boolean}  opts.enabled     - Start/stop tracking.
 * @param {Function} opts.onViolation - Called with { type: 'harsh_braking' }.
 *
 * @returns {{ active, error, permissionDenied, permissionNeeded, requestIOSPermission }}
 */
export function useHarshBraking({ enabled = false, onViolation } = {}) {
  const [state, setState] = useState({
    active:           false,
    error:            null,
    permissionDenied: false,
    permissionNeeded: false,
  });

  const onViolationRef     = useRef(onViolation);
  const lastBrakingTimeRef = useRef(0);
  const listenerRef        = useRef(null);

  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);

  const stopTracking = useCallback(() => {
    if (listenerRef.current) {
      window.removeEventListener('devicemotion', listenerRef.current);
      listenerRef.current = null;
    }
    setState((s) => ({ ...s, active: false }));
  }, []);

  const startTracking = useCallback(() => {
    const handler = (event) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;

      // y-axis: negative = braking on most phone orientations.
      const decel = -(acc.y ?? 0);
      if (decel > BRAKING_THRESHOLD_MS2) {
        const now = Date.now();
        if (now - lastBrakingTimeRef.current >= BRAKING_COOLDOWN_MS) {
          lastBrakingTimeRef.current = now;
          onViolationRef.current?.({ type: 'harsh_braking', deceleration: Math.round(decel * 10) / 10 });
        }
      }
    };

    listenerRef.current = handler;
    window.addEventListener('devicemotion', handler);
    setState({ active: true, error: null, permissionDenied: false, permissionNeeded: false });
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopTracking();
      return;
    }

    // iOS 13+ requires DeviceMotionEvent.requestPermission() before any events fire.
    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function'
    ) {
      setState((s) => ({ ...s, permissionNeeded: true }));
      return; // Caller must invoke requestIOSPermission() from a button tap.
    }

    // Non-iOS (Android, desktop): start immediately.
    startTracking();
    return stopTracking;
  }, [enabled, startTracking, stopTracking]);

  /** Must be called from inside a user-gesture handler on iOS. */
  const requestIOSPermission = useCallback(async () => {
    try {
      const result = await DeviceMotionEvent.requestPermission();
      if (result === 'granted') {
        startTracking();
      } else {
        setState({ active: false, error: 'Motion permission denied', permissionDenied: true, permissionNeeded: false });
      }
    } catch {
      setState((s) => ({ ...s, error: 'Failed to request motion permission', permissionNeeded: false }));
    }
  }, [startTracking]);

  return { ...state, requestIOSPermission };
}
