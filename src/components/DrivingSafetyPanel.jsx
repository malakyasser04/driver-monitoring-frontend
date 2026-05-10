function LabelValue({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-gray-400">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-red-400' : ''}`}>{value}</div>
    </div>
  );
}

/**
 * DrivingSafetyPanel
 *
 * Displays GPS speed + harsh-braking status using the same visual style as
 * StatusPanel so both panels look consistent below the webcam feed.
 */
export default function DrivingSafetyPanel({
  gpsSpeed,
  gpsActive,
  gpsError,
  motionActive,
  motionError,
  motionPermissionNeeded,
  onRequestMotionPermission,
  lastSafetyEvent,
  speedLimit,
}) {
  const speedText   = gpsSpeed != null ? `${gpsSpeed} km/h` : '—';
  const isSpeeding  = gpsSpeed != null && gpsSpeed > speedLimit;
  const speedStatus = isSpeeding
    ? `Speeding! (limit ${speedLimit} km/h)`
    : gpsSpeed != null
    ? 'OK'
    : '—';

  const gpsStatusText = gpsActive
    ? 'Active'
    : gpsError || 'Inactive';

  const motionStatusText = motionActive
    ? 'Active'
    : motionError || 'Inactive';

  const lastEventText = lastSafetyEvent
    ? `${lastSafetyEvent.type === 'speed_violation' ? 'Speed violation' : 'Harsh braking'} — ${new Date(lastSafetyEvent.timestamp).toLocaleTimeString()}`
    : 'None yet';

  return (
    <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Driving Safety
      </div>

      <div className="grid grid-cols-1 gap-y-2 sm:grid-cols-2">
        <div>
          <LabelValue label="GPS" value={gpsStatusText} />
        </div>
        <div>
          <LabelValue label="Speed" value={speedText} highlight={isSpeeding} />
        </div>
        <div>
          <LabelValue label="Speed Status" value={speedStatus} highlight={isSpeeding} />
        </div>
        <div>
          {motionPermissionNeeded ? (
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-gray-400">Motion Sensor</div>
              <button
                onClick={onRequestMotionPermission}
                className="rounded px-2 py-0.5 text-xs bg-blue-600 text-white hover:bg-blue-500 transition"
              >
                Allow (iPhone)
              </button>
            </div>
          ) : (
            <LabelValue label="Motion Sensor" value={motionStatusText} />
          )}
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-400">
        Last safety event:{' '}
        {lastSafetyEvent ? (
          <span className="text-gray-200">{lastEventText}</span>
        ) : (
          <span>None yet</span>
        )}
      </div>
    </div>
  );
}
