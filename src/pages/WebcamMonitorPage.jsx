import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StatusPanel from '../components/StatusPanel.jsx';
import DrivingSafetyPanel from '../components/DrivingSafetyPanel.jsx';
import { createSocket } from '../lib/socket.js';
import { fetchDrivers, fetchRoutes, fetchBuses, startTrip, stopTrip, postSafetyEvent } from '../lib/api.js';
import { useGPS } from '../hooks/useGPS.js';
import { useHarshBraking } from '../hooks/useHarshBraking.js';
import { useSpeedLimit } from '../hooks/useSpeedLimit.js';

const DEFAULT_INFERENCE_INTERVAL_MS = 500;
const DEFAULT_CAPTURE_QUALITY       = 0.75;
const DEFAULT_CAPTURE_MAX_EDGE      = 960;
const DEFAULT_SPEED_LIMIT_KMH       = 80;

// Sent with every fetch so ngrok's interstitial page is bypassed for API calls.
// Harmless when the backend is not behind ngrok.
const NGROK_HEADER = { 'ngrok-skip-browser-warning': 'true' };

export default function WebcamMonitorPage() {
  const backendUrl          = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  const inferenceIntervalMs = Number(import.meta.env.VITE_INFERENCE_INTERVAL_MS || DEFAULT_INFERENCE_INTERVAL_MS);
  const captureQuality      = Number(import.meta.env.VITE_CAPTURE_QUALITY || DEFAULT_CAPTURE_QUALITY);
  const captureMaxEdge      = Number(import.meta.env.VITE_CAPTURE_MAX_EDGE || DEFAULT_CAPTURE_MAX_EDGE);
  const speedLimit          = Number(import.meta.env.VITE_SPEED_LIMIT_KMH  || DEFAULT_SPEED_LIMIT_KMH);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const socketRef  = useRef(null);
  const sendingRef = useRef(false);

  // Stable ref to the active trip so sensor callbacks always see the latest value.
  const activeTripRef = useRef(null);

  // ── Connection & Camera state ─────────────────────────────────────────────
  const [backendConnected, setBackendConnected] = useState(false);
  const [aiReachable,      setAiReachable]      = useState(null);
  const [cameraActive,     setCameraActive]     = useState(false);
  const [facingMode,       setFacingMode]       = useState('user');

  // ── Detection state (live, unchanged) ────────────────────────────────────
  const [smoking,   setSmoking]   = useState({ label: 'none',  confidence: null });
  const [alertness, setAlertness] = useState({ label: 'awake', confidence: null });
  const [belt,      setBelt]      = useState({ label: 'belt',  confidence: null });
  const [cellphone, setCellphone] = useState({ label: 'none',  confidence: null });
  const [steering,  setSteering]  = useState({ label: 'hands_on_wheel', confidence: null });
  const [lastEvent, setLastEvent] = useState(null);

  // ── Driving safety state ──────────────────────────────────────────────────
  const [lastSafetyEvent, setLastSafetyEvent] = useState(null);

  // ── Dropdown data ─────────────────────────────────────────────────────────
  const [drivers, setDrivers] = useState([]);
  const [routes,  setRoutes]  = useState([]);
  const [buses,   setBuses]   = useState([]);

  // ── Trip context selections ───────────────────────────────────────────────
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedRoute,  setSelectedRoute]  = useState('');
  const [selectedBus,    setSelectedBus]    = useState('');

  // ── Active trip state ─────────────────────────────────────────────────────
  const [activeTrip,  setActiveTrip]  = useState(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError,   setTripError]   = useState(null);

  // Keep ref in sync so sensor callbacks don't capture stale closures.
  useEffect(() => { activeTripRef.current = activeTrip; }, [activeTrip]);

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  const socket = useMemo(() => createSocket(backendUrl), [backendUrl]);

  useEffect(() => {
    socketRef.current = socket;
    socket.on('connect',       () => setBackendConnected(true));
    socket.on('disconnect',    () => setBackendConnected(false));
    socket.on('connect_error', () => setBackendConnected(false));

    socket.on('liveStatus', (payload) => {
      if (!payload) return;
      if (typeof payload.aiServiceReachable === 'boolean') setAiReachable(payload.aiServiceReachable);
      if (payload.smoking)    setSmoking({   label: payload.smoking.label    || 'none',  confidence: payload.smoking.confidence    ?? null });
      if (payload.drowsiness) setAlertness({ label: payload.drowsiness.label || 'awake', confidence: payload.drowsiness.confidence ?? null });
      if (payload.belt)       setBelt({      label: payload.belt.label       || 'no_belt',confidence: payload.belt.confidence       ?? null });
      if (payload.cellphone)  setCellphone({ label: payload.cellphone.label  || 'none',  confidence: payload.cellphone.confidence  ?? null });
      if (payload.steering)   setSteering({  label: payload.steering.label   || 'hands_on_wheel', confidence: payload.steering.confidence ?? null });
      if (payload.lastEvents?.last) setLastEvent(payload.lastEvents.last);
    });

    socket.on('eventSaved', (event) => {
      if (event?.timestamp) setLastEvent(event);
    });

    // Reflect safety events emitted by the backend to other clients.
    socket.on('safetyEvent', (event) => {
      if (event?.timestamp) setLastSafetyEvent(event);
    });

    return () => { socket.off(); socket.close(); };
  }, [socket]);

  // ── Prime status on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${backendUrl}/api/status`, { signal: controller.signal, headers: NGROK_HEADER })
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.aiServiceReachable === 'boolean') setAiReachable(data.aiServiceReachable);
        if (data.smoking)    setSmoking({   label: data.smoking.label,    confidence: data.smoking.confidence    });
        if (data.drowsiness) setAlertness({ label: data.drowsiness.label, confidence: data.drowsiness.confidence });
        if (data.belt)       setBelt({      label: data.belt.label,       confidence: data.belt.confidence       });
        if (data.cellphone)  setCellphone({ label: data.cellphone.label,  confidence: data.cellphone.confidence  });
        if (data.steering)   setSteering({  label: data.steering.label,   confidence: data.steering.confidence   });
        if (data.lastEvents?.last) setLastEvent(data.lastEvents.last);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [backendUrl]);

  // ── Load dropdown data from webcam backend ────────────────────────────────
  useEffect(() => {
    fetchDrivers().then(setDrivers).catch(() => {});
    fetchRoutes().then(setRoutes).catch(() => {});
    fetchBuses().then(setBuses).catch(() => {});
  }, []);

  // ── Camera init ───────────────────────────────────────────────────────────
  useEffect(() => {
    let stream;
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!videoRef.current) throw new Error('video ref missing');
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      } catch {
        setCameraActive(false);
      }
    }
    startCamera();
    return () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [facingMode]);

  // ── Inference loop — only runs when a trip is active ─────────────────────
  useEffect(() => {
    if (!cameraActive || !activeTrip) return;
    const timer = setInterval(() => void sendFrame(), inferenceIntervalMs);
    return () => clearInterval(timer);
  }, [cameraActive, activeTrip, inferenceIntervalMs]);

  // ── sendFrame (unchanged capture logic, adds context) ────────────────────
  async function sendFrame() {
    if (sendingRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    sendingRef.current = true;
    try {
      if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
      const canvas = canvasRef.current;
      const ctx    = canvas.getContext('2d');
      if (!ctx) return;

      const vw = video.videoWidth  || 1280;
      const vh = video.videoHeight || 720;
      const scale = Math.min(1, captureMaxEdge / Math.max(vw, vh));
      const tw = Math.max(1, Math.round(vw * scale));
      const th = Math.max(1, Math.round(vh * scale));

      canvas.width  = tw;
      canvas.height = th;
      ctx.drawImage(video, 0, 0, tw, th);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to encode frame'))),
          'image/jpeg',
          captureQuality
        );
      });

      if (!blob || blob.size === 0) return;
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const idx = result.indexOf(',');
          resolve(idx >= 0 ? result.slice(idx + 1) : result);
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read frame'));
        reader.readAsDataURL(blob);
      });

      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${backendUrl}/api/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...NGROK_HEADER },
        body: JSON.stringify({
          imageBase64: base64,
          imageMime:   'image/jpeg',
          width:  tw,
          height: th,
          // Trip context
          driverId: activeTrip?.driver  || null,
          routeId:  activeTrip?.route   || null,
          busId:    activeTrip?.bus     || null,
          tripId:   activeTrip?._id     || null,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.aiServiceReachable === 'boolean') setAiReachable(data.aiServiceReachable);
      if (data.smoking)    setSmoking({   label: data.smoking.label,    confidence: data.smoking.confidence    });
      if (data.drowsiness) setAlertness({ label: data.drowsiness.label, confidence: data.drowsiness.confidence });
      if (data.belt)       setBelt({      label: data.belt.label,       confidence: data.belt.confidence       });
      if (data.cellphone)  setCellphone({ label: data.cellphone.label,  confidence: data.cellphone.confidence  });
      if (data.steering)   setSteering({  label: data.steering.label,   confidence: data.steering.confidence   });
      if (Array.isArray(data.savedEvents) && data.savedEvents.length > 0) {
        setLastEvent(data.savedEvents[data.savedEvents.length - 1]);
      }
    } catch {
      // Don't break the UI on a single failed inference.
    } finally {
      sendingRef.current = false;
    }
  }

  // ── Trip handlers ─────────────────────────────────────────────────────────
  async function handleStartTrip() {
    if (!selectedDriver) {
      setTripError('Please select a driver before starting a trip.');
      return;
    }
    setTripLoading(true);
    setTripError(null);
    try {
      const data = await startTrip({
        driverId: selectedDriver,
        routeId:  selectedRoute  || null,
        busId:    selectedBus    || null,
      });
      setActiveTrip(data.trip);
    } catch (err) {
      setTripError(err.message || 'Failed to start trip');
    } finally {
      setTripLoading(false);
    }
  }

  async function handleStopTrip() {
    if (!activeTrip) return;
    setTripLoading(true);
    setTripError(null);
    try {
      await stopTrip(activeTrip._id);
      setActiveTrip(null);
    } catch (err) {
      setTripError(err.message || 'Failed to stop trip');
    } finally {
      setTripLoading(false);
    }
  }

  // ── Sensor violation handler (shared by GPS + braking hooks) ─────────────
  const handleSensorViolation = useCallback(async (payload) => {
    const trip = activeTripRef.current;
    try {
      const result = await postSafetyEvent({
        type:       payload.type,
        speed:      payload.speed      ?? null,
        speedLimit: payload.speedLimit ?? null,
        location:   payload.location   ?? null,
        driverId:   trip?.driver || null,
        routeId:    trip?.route  || null,
        busId:      trip?.bus    || null,
        tripId:     trip?._id    || null,
      });
      if (result?.event) setLastSafetyEvent(result.event);
    } catch {
      // Best-effort: sensor events must not disrupt the main monitoring pipeline.
    }
  }, []);

  // ── GPS tracking (phase 1: start with env default limit) ─────────────────
  // speedLimit prop is updated each render via ref inside the hook — no restart.
  const [effectiveSpeedLimit, setEffectiveSpeedLimit] = useState(speedLimit);

  const gps = useGPS({
    enabled:     !!activeTrip,
    speedLimit:  effectiveSpeedLimit,
    onViolation: handleSensorViolation,
  });

  // ── Auto-detect road speed limit from OpenStreetMap ───────────────────────
  const { speedLimit: detectedLimit, detecting: detectingLimit, source: limitSource, roadType: limitRoadType } = useSpeedLimit(
    activeTrip ? gps.location : null
  );

  // When Overpass returns a limit, promote it to the effective limit.
  useEffect(() => {
    if (detectedLimit != null) setEffectiveSpeedLimit(detectedLimit);
  }, [detectedLimit]);

  // ── Harsh braking — active only during an active trip ────────────────────
  const braking = useHarshBraking({
    enabled:    !!activeTrip,
    onViolation: handleSensorViolation,
  });

  // ── Derived display info ──────────────────────────────────────────────────
  const activeDriverName = drivers.find((d) => d._id === selectedDriver)?.name || '—';
  const activeRouteName  = routes.find((r)  => r._id === selectedRoute)?.name  || '—';
  const activeBusId      = buses.find((b)   => b._id === selectedBus)?.busId   || '—';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="mx-auto w-full max-w-4xl space-y-4">

        {/* ── Trip Context Panel ────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
            Trip Setup
          </div>

          {/* Dropdowns — disabled during an active trip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-gray-400">Driver *</label>
              <select
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                disabled={!!activeTrip}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">— Select driver —</option>
                {drivers.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name} ({d.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-400">Route</label>
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                disabled={!!activeTrip}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">— Select route —</option>
                {routes.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-400">Bus</label>
              <select
                value={selectedBus}
                onChange={(e) => setSelectedBus(e.target.value)}
                disabled={!!activeTrip}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">— Select bus —</option>
                {buses.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.busId} ({b.capacity} seats)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Trip error */}
          {tripError && (
            <p className="mt-2 text-xs text-red-400">{tripError}</p>
          )}

          {/* Start / Stop buttons */}
          <div className="mt-4 flex items-center gap-3">
            {!activeTrip ? (
              <button
                onClick={handleStartTrip}
                disabled={tripLoading || !selectedDriver}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {tripLoading ? 'Starting…' : '▶ Start Trip'}
              </button>
            ) : (
              <button
                onClick={handleStopTrip}
                disabled={tripLoading}
                className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {tripLoading ? 'Stopping…' : '■ Stop Trip'}
              </button>
            )}

            {activeTrip && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  Active trip — {activeDriverName}
                  {selectedRoute ? ` · ${activeRouteName}` : ''}
                  {selectedBus   ? ` · ${activeBusId}`    : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Camera Feed ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-3">
          <div className="flex items-center justify-between gap-3 pb-2">
            <div className="text-sm text-gray-300">
              Webcam monitoring
              {!cameraActive ? ' (starting…)' : ''}
              {!activeTrip && cameraActive ? (
                <span className="ml-2 text-xs text-amber-400">(Start a trip to begin detection)</span>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-500">Inference: {inferenceIntervalMs}ms</div>
              {cameraActive && (
                <button
                  onClick={() => setFacingMode((m) => m === 'user' ? 'environment' : 'user')}
                  title="Flip camera"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition hover:border-gray-600 hover:bg-gray-700 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                    <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="m18 22-3-3 3-3" />
                    <path d="m6 2 3 3-3 3" />
                  </svg>
                  Flip
                </button>
              )}
            </div>
          </div>

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-xl bg-black object-cover aspect-video"
          />
        </div>

        {/* ── Detection Status Panel (unchanged) ───────────────────────── */}
        <StatusPanel
          backendConnected={backendConnected}
          aiReachable={aiReachable}
          cameraActive={cameraActive}
          smokingLabel={smoking.label}
          smokingConfidence={smoking.confidence}
          alertnessLabel={alertness.label}
          alertnessConfidence={alertness.confidence}
          beltLabel={belt.label}
          beltConfidence={belt.confidence}
          cellphoneLabel={cellphone.label}
          cellphoneConfidence={cellphone.confidence}
          steeringLabel={steering.label}
          steeringConfidence={steering.confidence}
          lastEvent={lastEvent}
        />

        {/* ── Driving Safety Panel (GPS + harsh braking) ───────────────── */}
        <DrivingSafetyPanel
          gpsSpeed={gps.speed}
          gpsActive={gps.active}
          gpsError={gps.error}
          motionActive={braking.active}
          motionError={braking.error}
          motionPermissionNeeded={braking.permissionNeeded}
          onRequestMotionPermission={braking.requestIOSPermission}
          lastSafetyEvent={lastSafetyEvent}
          speedLimit={effectiveSpeedLimit}
          detectedLimit={detectedLimit}
          detectingLimit={detectingLimit}
          limitSource={limitSource}
          limitRoadType={limitRoadType}
        />

      </div>
    </div>
  );
}
