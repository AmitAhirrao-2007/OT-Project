import React, { useState, useEffect } from 'react';
import { X, QrCode, CheckCircle2, Clock, Zap, AlertCircle, ShieldCheck } from 'lucide-react';
import { operatorQueueService } from '../../services/queue/operatorQueueService';
import { QueueEntry, StationQueueData } from '../../types/queue';
import { formatIstTime } from '../../services/queue/chargingQueueService';

interface DriverCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  station: { id: string; name: string } | null;
  onSuccess?: () => void;
}

export const DriverCheckInModal: React.FC<DriverCheckInModalProps> = ({
  isOpen,
  onClose,
  station,
  onSuccess
}) => {
  const [connectorType, setConnectorType] = useState<'CCS2' | 'Type 2'>('CCS2');
  const [vehicleModel, setVehicleModel] = useState('Tata Nexon EV Max');
  const [driverName, setDriverName] = useState('');
  const [vehicleRegLast4, setVehicleRegLast4] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedEntry, setConfirmedEntry] = useState<QueueEntry | null>(null);
  const [liveQueueData, setLiveQueueData] = useState<StationQueueData | null>(null);

  useEffect(() => {
    if (isOpen && station) {
      setConfirmedEntry(null);
      setError(null);
      // Fetch current queue state
      fetch(`/api/queue/station/${encodeURIComponent(station.id)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setLiveQueueData(data);
        })
        .catch(() => {});
    }
  }, [isOpen, station]);

  if (!isOpen || !station) return null;

  const currentQueueForConnector = liveQueueData?.connectorQueues?.[connectorType];
  const waitingAhead = currentQueueForConnector?.vehiclesWaiting ?? 0;
  const estWaitMins = currentQueueForConnector?.estimatedWaitMinutes ?? (waitingAhead * 25);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const fullModel = vehicleRegLast4
      ? `${vehicleModel || 'EV'} (${vehicleRegLast4})`
      : vehicleModel || 'EV Driver';

    const res = await operatorQueueService.driverCheckIn(
      station.id,
      connectorType,
      fullModel,
      driverName || 'EV Driver'
    );

    setIsSubmitting(false);

    if (res.success && res.entry) {
      setConfirmedEntry(res.entry);
      if (onSuccess) onSuccess();
    } else {
      setError(res.message || 'Failed to check in to queue. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl text-slate-100 overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-100">Live Station Check-in</h2>
              <p className="text-[11px] text-slate-400 truncate max-w-[260px]">{station.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {confirmedEntry ? (
            /* Confirmation View */
            <div className="space-y-4 text-center py-2 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="text-[11px] font-semibold tracking-wider uppercase text-emerald-400">
                  Checked In Successfully
                </span>
                <h3 className="text-2xl font-black text-slate-100 mt-1">
                  Queue Position #{confirmedEntry.queuePosition}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Assigned to <span className="font-semibold text-slate-200">{connectorType}</span> fast queue
                </p>
              </div>

              {/* Ticket Card */}
              <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 text-left space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Ticket ID</span>
                  <span className="font-mono font-semibold text-slate-200">{confirmedEntry.id}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Vehicle</span>
                  <span className="font-medium text-slate-200">{confirmedEntry.vehicleModel}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Check-in Time</span>
                  <span className="font-medium text-slate-200">{formatIstTime(confirmedEntry.checkInTime)}</span>
                </div>
                <div className="flex items-center justify-between text-xs border-t border-slate-700/60 pt-2">
                  <span className="text-slate-400">Est. Plug-in Time</span>
                  <span className="font-bold text-amber-400">
                    ~{confirmedEntry.estimatedDurationMinutes ? `${confirmedEntry.estimatedDurationMinutes} mins` : '15-20 mins'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-violet-950/40 border border-violet-800/40 text-[11px] text-violet-300 text-left flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <span>
                  Please remain near your vehicle or the waiting lounge. The station operator will call your vehicle when a bay opens.
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors shadow-lg"
              >
                Done
              </button>
            </div>
          ) : (
            /* Check-in Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Live Queue Status Banner */}
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400">Current Queue ({connectorType})</div>
                  <div className="font-bold text-sm text-slate-100">
                    {waitingAhead} {waitingAhead === 1 ? 'vehicle' : 'vehicles'} in line ahead
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">Estimated Wait</div>
                  <div className="font-bold text-sm text-amber-400">~{estWaitMins} mins</div>
                </div>
              </div>

              {/* Connector Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Select Plug Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConnectorType('CCS2')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      connectorType === 'CCS2'
                        ? 'bg-violet-600/20 border-violet-500 text-white shadow-sm'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>CCS2 (DC Fast)</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">High power fast charging</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConnectorType('Type 2')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      connectorType === 'Type 2'
                        ? 'bg-violet-600/20 border-violet-500 text-white shadow-sm'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Type 2 (AC)</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Destination AC charging</div>
                  </button>
                </div>
              </div>

              {/* Vehicle Model */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Vehicle Model
                </label>
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder="e.g. Tata Nexon EV, MG ZS EV, Mahindra XUV400"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  required
                />
              </div>

              {/* Registration Last 4 & Driver Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Reg No. (Last 4 digits)
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={vehicleRegLast4}
                    onChange={(e) => setVehicleRegLast4(e.target.value.toUpperCase())}
                    placeholder="e.g. 7821"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Driver Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="e.g. Aarav Sharma"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-lg flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>Checking In...</span>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    <span>Check In to {connectorType} Queue</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

