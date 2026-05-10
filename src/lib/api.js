const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

// ngrok-skip-browser-warning bypasses the ngrok interstitial page for API calls.
// It is harmless for non-ngrok backends (ignored by Express / other servers).
const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
};

const json = (res) => {
  if (!res.ok) return res.json().then((e) => Promise.reject(new Error(e?.error || res.statusText)));
  return res.json();
};

export const fetchDrivers = () =>
  fetch(`${BACKEND}/api/drivers`, { headers: BASE_HEADERS }).then(json);

export const fetchRoutes = () =>
  fetch(`${BACKEND}/api/routes`, { headers: BASE_HEADERS }).then(json);

export const fetchBuses = () =>
  fetch(`${BACKEND}/api/buses`, { headers: BASE_HEADERS }).then(json);

export const startTrip = ({ driverId, routeId, busId }) =>
  fetch(`${BACKEND}/api/trips/start`, {
    method: 'POST',
    headers: BASE_HEADERS,
    body: JSON.stringify({ driverId, routeId, busId }),
  }).then(json);

export const stopTrip = (tripId) =>
  fetch(`${BACKEND}/api/trips/stop/${tripId}`, {
    method: 'POST',
    headers: BASE_HEADERS,
  }).then(json);

export const postSafetyEvent = ({ type, driverId, routeId, busId, tripId, speed, speedLimit, location }) =>
  fetch(`${BACKEND}/api/safety-events`, {
    method: 'POST',
    headers: BASE_HEADERS,
    body: JSON.stringify({ type, driverId, routeId, busId, tripId, speed, speedLimit, location }),
  }).then(json);
