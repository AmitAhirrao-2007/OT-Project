import React, { useState } from 'react';
import {
  X,
  Users,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { QueueReportAction } from '../../types/queue';
import { chargingQueueService } from '../../services/queue/chargingQueueService';
import { useGps } from '../../context/GpsContext';

interface QueueReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  station: {
    id: string;
    name: string;
    coordinates?: [number, number];
    connectors?: Array<{ type: string; maxPowerKw?: number }>;
  } | null;
  onReportSubmitted?: () => void;
}

export const QueueReportModal: React.FC<QueueReportModalProps> = ({
  isOpen,
  onClose,
  station,
  onReportSubmitted
}) => {
  const { gpsState } = useGps();
  const [selectedAction, setSelectedAction] = useState<QueueReportAction>('no_waiting');
  const [selectedConnector, setSelectedConnector] = useState<string>('CCS2');
  const [customVehicles, setCustomVehicles] = useState<number>(0);
  const [peopleWaiting, setPeopleWaiting] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  if (!isOpen || !station) return null;

  const currentGps = gpsState.currentPosition;
  const hasGps = Boolean(currentGps);

  // Quick action presets
  const actionOptions: Array<{ action: QueueReportAction; label: string; icon: string; desc: string }> = [
    { action: 'no_waiting', label: 'No Waiting (0)', icon: '🟢', desc: 'No queue line at this station' },
    { action: '1_waiting', label: '1 Vehicle Waiting', icon: '🟡', desc: 'Single car waiting for a stall' },
    { action: '2_waiting', label: '2 Vehicles Waiting', icon: '🟠', desc: 'Two cars waiting in line' },
    { action: '3_waiting', label: '3 Vehicles Waiting', icon: '🔴', desc: 'Three cars waiting in line' },
    { action: '4_plus_waiting', label: '4+ Vehicles Waiting', icon: '🟣', desc: 'Heavy queue, 4 or more cars' },
    { action: 'charger_available', label: 'Free Charger Now', icon: '⚡', desc: 'At least one stall is empty' },
    { action: 'all_occupied', label: 'All Stalls In Use', icon: '🚗', desc: 'Every charger is occupied' },
    { action: 'charger_fault', label: 'Charger Out of Order', icon: '⚠️', desc: 'Equipment defect / fault' },
    { action: 'queue_cleared', label: 'Queue Cleared', icon: '✨', desc: 'Previous queue has dispersed' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackMessage(null);

    const reporterCoordinates: [number, number] | undefined = currentGps
      ? [currentGps.latitude, currentGps.longitude]
      : undefined;

    const peopleCount = peopleWaiting.trim() ? parseInt(peopleWaiting, 10) : undefined;

    const result = await chargingQueueService.submitReport({
      stationId: station.id,
      stationName: station.name,
      connectorType: selectedConnector,
      action: selectedAction,
      vehiclesWaiting: selectedAction === 'custom_count' ? customVehicles : undefined,
      peopleWaiting: Number.isFinite(peopleCount) ? peopleCount : undefined,
      comment: comment.trim() || undefined,
      reporterCoordinates
    });

    setIsSubmitting(false);

    if (result.success) {
      setFeedbackMessage({ text: result.message || 'Report submitted successfully!' });
      setTimeout(() => {
        onReportSubmitted?.();
        onClose();
      }, 1200);
    } else {
      setFeedbackMessage({ text: result.message || 'Failed to submit report', isError: true });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-surface-panel border border-edge-default rounded-2xl shadow-modal overflow-hidden text-content-primary">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-edge-subtle bg-surface-subtle/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-content-primary">Live Station Queue Report</h2>
              <p className="text-xs text-content-secondary line-clamp-1">{station.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Connector Group Selector */}
          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1.5">
              Target Connector Group
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {['CCS2', 'Type 2', 'CHAdeMO', 'GB/T'].map((conn) => (
                <button
                  key={conn}
                  type="button"
                  onClick={() => setSelectedConnector(conn)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    selectedConnector === conn
                      ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                      : 'bg-surface-subtle border-edge-subtle text-content-secondary hover:bg-surface-hover'
                  }`}
                >
                  {conn}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Action Presets Grid */}
          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1.5">
              Current Queue Condition
            </label>
            <div className="grid grid-cols-3 gap-2">
              {actionOptions.map((opt) => {
                const isSelected = selectedAction === opt.action;
                return (
                  <button
                    key={opt.action}
                    type="button"
                    onClick={() => setSelectedAction(opt.action)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-brand-primary/10 border-brand-primary text-content-primary ring-1 ring-brand-primary/30'
                        : 'bg-surface-subtle hover:bg-surface-hover border-edge-subtle text-content-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-sm">{opt.icon}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary" />}
                    </div>
                    <span className="text-[11px] font-bold leading-tight">{opt.label}</span>
                    <span className="text-[9px] text-content-muted mt-0.5 line-clamp-1">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Detailed Numbers */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-edge-subtle">
            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                People Waiting (Optional)
              </label>
              <input
                type="number"
                min="0"
                max="30"
                value={peopleWaiting}
                onChange={(e) => setPeopleWaiting(e.target.value)}
                placeholder="e.g. 2"
                className="w-full px-3 py-1.5 bg-surface-subtle border border-edge-default rounded-lg text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                Custom Car Count
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={customVehicles}
                onChange={(e) => {
                  setCustomVehicles(parseInt(e.target.value, 10) || 0);
                  setSelectedAction('custom_count');
                }}
                placeholder="0"
                className="w-full px-3 py-1.5 bg-surface-subtle border border-edge-default rounded-lg text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
          </div>

          {/* Driver Comment */}
          <div>
            <label className="block text-[11px] font-medium text-content-secondary mb-1">
              Driver Observation (Optional)
            </label>
            <input
              type="text"
              maxLength={120}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. 1 Tata Nexon currently on 60 kW stall, smooth turnover"
              className="w-full px-3 py-1.5 bg-surface-subtle border border-edge-default rounded-lg text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>

          {/* GPS Geofence Badge */}
          <div className="px-3 py-2 rounded-xl bg-surface-subtle border border-edge-subtle flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-content-secondary text-[11px]">
              <ShieldCheck className="w-4 h-4 text-brand-primary" />
              <span>Location Geofence Check:</span>
            </span>
            <span className={`text-[11px] font-semibold ${hasGps ? 'text-status-success' : 'text-content-muted'}`}>
              {hasGps ? 'Active (GPS Attached)' : 'Optional (Remote Report)'}
            </span>
          </div>

          {/* Feedback banner */}
          {feedbackMessage && (
            <div
              className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                feedbackMessage.isError
                  ? 'bg-status-dangerSubtle text-status-danger border border-status-danger/30'
                  : 'bg-status-successSubtle text-status-success border border-status-success/30'
              }`}
            >
              {feedbackMessage.isError ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
          )}

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <p className="text-[10px] text-content-muted leading-tight">
              🔒 Voluntary report. Stored pseudonymously via SHA-256 HMAC without continuous location logging.
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:bg-brand-hover transition-colors flex items-center gap-1.5 shrink-0 shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Report</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
