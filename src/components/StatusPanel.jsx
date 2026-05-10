function LabelValue({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

export default function StatusPanel({
  backendConnected,
  aiReachable,
  cameraActive,
  smokingLabel,
  smokingConfidence,
  alertnessLabel,
  alertnessConfidence,
  beltLabel,
  beltConfidence,
  cellphoneLabel,
  cellphoneConfidence,
  steeringLabel,
  steeringConfidence,
  lastEvent
}) {
  const smokingText = smokingLabel === 'none' ? 'None' : smokingLabel;
  const smokingConfText =
    typeof smokingConfidence === 'number' ? `${Math.round(smokingConfidence * 100)}%` : '—';
  const alertnessConfText =
    typeof alertnessConfidence === 'number' ? `${Math.round(alertnessConfidence * 100)}%` : '—';
  const beltText = beltLabel === 'belt' ? 'Wearing' : beltLabel === 'no_belt' ? 'Not wearing' : beltLabel ?? '—';
  const beltConfText =
    typeof beltConfidence === 'number' ? `${Math.round(beltConfidence * 100)}%` : '—';
  const cellphoneText = cellphoneLabel === 'cellphone' ? 'Holding phone' : cellphoneLabel === 'none' ? 'None' : cellphoneLabel ?? '—';
  const cellphoneConfText =
    typeof cellphoneConfidence === 'number' ? `${Math.round(cellphoneConfidence * 100)}%` : '—';
  const steeringText = steeringLabel === 'hands_on_wheel' ? 'Hands on' : steeringLabel === 'hands_off_wheel' ? 'Hands off' : steeringLabel ?? '—';
  const steeringConfText =
    typeof steeringConfidence === 'number' ? `${Math.round(steeringConfidence * 100)}%` : '—';

  return (
    <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="min-w-[220px]">
          <LabelValue label="Backend" value={backendConnected ? 'Connected' : 'Disconnected'} />
        </div>
        <div className="min-w-[220px]">
          <LabelValue
            label="AI Service"
            value={aiReachable === null ? 'Checking…' : aiReachable ? 'Reachable' : 'Unavailable'}
          />
        </div>
        <div className="min-w-[220px]">
          <LabelValue label="Camera" value={cameraActive ? 'Active' : 'Inactive'} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-y-2 sm:grid-cols-2">
        <div>
          <LabelValue label="Smoking" value={`${smokingText} (${smokingConfText})`} />
        </div>
        <div>
          <LabelValue label="Alertness" value={`${alertnessLabel} (${alertnessConfText})`} />
        </div>
        <div>
          <LabelValue label="Seatbelt" value={`${beltText} (${beltConfText})`} />
        </div>
        <div>
          <LabelValue label="Cellphone" value={`${cellphoneText} (${cellphoneConfText})`} />
        </div>
        <div>
          <LabelValue label="Steering" value={`${steeringText} (${steeringConfText})`} />
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-400">
        Last event:{' '}
        {lastEvent?.timestamp ? (
          <span className="text-gray-200">{new Date(lastEvent.timestamp).toLocaleString()}</span>
        ) : (
          <span>None yet</span>
        )}
      </div>
    </div>
  );
}

