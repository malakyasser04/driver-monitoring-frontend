function LabelValue({ label, value, highlight, dim }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-gray-400">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-red-400' : dim ? 'text-gray-500' : ''}`}>{value}</div>
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
  speedLimit,        // effective limit used for violation checking
  detectedLimit,     // raw value from Overpass (null = not yet detected)
  detectingLimit,    // true while Overpass query is in-flight
  limitSource,       // 'tagged' | 'road_type' | null
  limitRoadType,     // OSM highway type when source === 'road_type'
}) {
  const effectiveLimit = detectedLimit ?? speedLimit;
  const isSpeeding     = gpsSpeed != null && gpsSpeed > effectiveLimit;

  const speedText = gpsSpeed != null ? `${gpsSpeed} km/h` : '—';

  const speedStatus = isSpeeding ? 'Speeding!' : gpsSpeed != null ? 'OK' : '—';

  let limitText;
  if (detectingLimit) {
    limitText = 'Detecting…';
  } else if (detectedLimit != null) {
    const tag = limitSource === 'road_type' && limitRoadType
      ? ` (${limitRoadType.replace('_', ' ')})`
      : limitSource === 'tagged' ? ' (signed)' : '';
    limitText = `${detectedLimit} km/h${tag}`;
  } else if (speedLimit) {
    limitText = `${speedLimit} km/h (default)`;
  } else {
    limitText = '—';
  }

  const gpsStatusText    = gpsActive  ? 'Active' : gpsError  || 'Inactive';
  const motionStatusText = motionActive ? 'Active' : motionError || 'Inactive';

  const lastEventText = lastSafetyEvent
    ? `${lastSafetyEvent.type === 'speed_violation' ? 'Speed violation' : 'Harsh braking'} — ${new Date(lastSafetyEvent.timestamp).toLocaleTimeString()}`
    : 'None yet';

  return (
    <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Driving Safety
      </div>

      <div className="grid grid-cols-1 gap-y-2 sm:grid-cols-2">
        <LabelValue label="GPS" value={gpsStatusText} />

        <LabelValue
          label="Speed"
          value={speedText}
          highlight={isSpeeding}
          dim={gpsSpeed == null}
        />

        <LabelValue
          label="Speed Limit"
          value={limitText}
          dim={detectedLimit == null}
        />

        <LabelValue
          label="Speed Status"
          value={isSpeeding ? `Speeding! (limit ${effectiveLimit} km/h)` : speedStatus}
          highlight={isSpeeding}
          dim={gpsSpeed == null}
        />

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
