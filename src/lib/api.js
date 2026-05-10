const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

const json = (res) => {
  if (!res.ok) return res.json().then((e) => Promise.reject(new Error(e?.error || res.statusText)));
  return res.json();
};

export const fetchDrivers = () => fetch(`${BACKEND}/api/drivers`).then(json);
export const fetchRoutes  = () => fetch(`${BACKEND}/api/routes`).then(json);
export const fetchBuses   = () => fetch(`${BACKEND}/api/buses`).then(json);

export const startTrip = ({ driverId, routeId, busId }) =>
  fetch(`${BACKEND}/api/trips/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId, routeId, busId }),
  }).then(json);

export const stopTrip = (tripId) =>
  fetch(`${BACKEND}/api/trips/stop/${tripId}`, { method: 'POST' }).then(json);
