import React, { useState } from 'react';
import {
  X,
  Send,
  CheckCircle,
  AlertCircle,
  Clock,
  Zap,
  Shield,
  HelpCircle
} from 'lucide-react';
import {
  ReportCategory,
  ObservedCondition,
  ReportSubmissionRequest
} from '../../types/communityReports';
import { communityService } from '../../services/communityService';

interface DriverReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  stationId: string;
  stationName: string;
  connectors?: { id?: string; type: string; powerKw: number }[];
}

export const DriverReportModal: React.FC<DriverReportModalProps> = ({
  isOpen,
  onClose,
  stationId,
  stationName,
  connectors = []
}) => {
  const [category, setCategory] = useState<ReportCategory>('session_outcome');
  const [condition, setCondition] = useState<ObservedCondition>('session_completed_successfully');
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>('');
  const [waitTimeMinutes, setWaitTimeMinutes] = useState<string>('');
  const [deliveredPowerKw, setDeliveredPowerKw] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCategoryChange = (newCat: ReportCategory) => {
    setCategory(newCat);
    // Set default condition for category
    switch (newCat) {
      case 'session_outcome':
        setCondition('session_completed_successfully');
        break;
      case 'connector_status':
        setCondition('connector_working');
        break;
      case 'station_availability':
        setCondition('queue_observed');
        break;
      case 'road_access':
        setCondition('entrance_accessible');
        break;
      case 'payment_issue':
        setCondition('app_activation_failure');
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      setErrorMessage('Please confirm that this is a genuine observation.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: ReportSubmissionRequest = {
      stationId,
      connectorId: selectedConnectorId || undefined,
      category,
      condition,
      observationDetails: details.trim() || undefined,
      waitTimeMinutes: waitTimeMinutes ? parseInt(waitTimeMinutes, 10) : undefined,
      deliveredPowerKw: deliveredPowerKw ? parseFloat(deliveredPowerKw) : undefined
    };

    const res = await communityService.submitReport(payload);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMessage('Report submitted successfully! Your observation helps the community navigate reliably.');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1800);
    } else {
      setErrorMessage(res.error || 'Failed to submit report. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-card border border-edge-default rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-edge-subtle bg-surface-subtle/50">
          <div>
            <h2 className="text-base font-bold text-content-primary flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-primary" />
              Report Charger Status
            </h2>
            <p className="text-xs text-content-tertiary mt-0.5 line-clamp-1">{stationName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-content-tertiary hover:text-content-primary hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {successMessage ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-status-success animate-bounce" />
            <h3 className="text-base font-bold text-content-primary">Observation Recorded</h3>
            <p className="text-xs text-content-secondary max-w-sm">{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
            {errorMessage && (
              <div className="p-3 rounded-lg bg-status-dangerSubtle border border-status-danger/40 text-status-danger flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Category selection */}
            <div>
              <label className="font-semibold text-content-secondary block mb-1.5">
                Report Category
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { id: 'session_outcome', label: 'Session Outcome' },
                  { id: 'connector_status', label: 'Connector Status' },
                  { id: 'station_availability', label: 'Availability / Queue' },
                  { id: 'road_access', label: 'Road Entry / Access' },
                  { id: 'payment_issue', label: 'Payment / Activation' }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryChange(cat.id as ReportCategory)}
                    className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                      category === cat.id
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/30'
                        : 'border-edge-subtle bg-surface-subtle text-content-secondary hover:border-edge-default'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Observed Condition */}
            <div>
              <label className="font-semibold text-content-secondary block mb-1.5">
                Observed Condition
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ObservedCondition)}
                className="w-full p-2.5 rounded-xl border border-edge-subtle bg-surface-subtle text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                {category === 'session_outcome' && (
                  <>
                    <option value="session_completed_successfully">Session completed successfully</option>
                    <option value="session_started_successfully">Session started successfully</option>
                    <option value="activation_failed">Session activation failed</option>
                    <option value="stopped_unexpectedly">Charging stopped unexpectedly</option>
                    <option value="low_power_delivered">Delivered power significantly lower than rated</option>
                  </>
                )}
                {category === 'connector_status' && (
                  <>
                    <option value="connector_working">Connector working normally</option>
                    <option value="connector_damaged">Connector damaged / physically broken</option>
                    <option value="connector_unavailable">Connector unavailable / offline</option>
                    <option value="connector_occupied">Connector occupied</option>
                    <option value="connector_obstructed">Connector obstructed / ICE-ing</option>
                  </>
                )}
                {category === 'station_availability' && (
                  <>
                    <option value="queue_observed">Queue observed at station</option>
                    <option value="station_fully_occupied">All stalls occupied</option>
                    <option value="no_compatible_connector">No compatible connector available</option>
                    <option value="station_closed">Station closed / gated</option>
                    <option value="out_of_service">Station completely out of service</option>
                  </>
                )}
                {category === 'road_access' && (
                  <>
                    <option value="entrance_accessible">Entrance clearly accessible</option>
                    <option value="entrance_blocked">Entrance blocked by construction or gates</option>
                    <option value="wrong_carriageway">Carriageway divided / median barrier prevents entry</option>
                    <option value="restricted_premises">Restricted private premises</option>
                    <option value="road_entrance_mismatch">Road entrance differs from map coordinates</option>
                    <option value="uturn_unavailable">Required U-turn or interchange unavailable</option>
                  </>
                )}
                {category === 'payment_issue' && (
                  <>
                    <option value="app_activation_failure">Operator app failed to activate session</option>
                    <option value="rfid_activation_failure">RFID card tap rejected</option>
                    <option value="payment_rejected">Payment method / gateway declined</option>
                    <option value="session_start_failure">Charger failed to handshake with vehicle</option>
                  </>
                )}
              </select>
            </div>

            {/* Connector selection if available */}
            {connectors.length > 0 && (
              <div>
                <label className="font-semibold text-content-secondary block mb-1">
                  Specific Connector (Optional)
                </label>
                <select
                  value={selectedConnectorId}
                  onChange={(e) => setSelectedConnectorId(e.target.value)}
                  className="w-full p-2 rounded-lg border border-edge-subtle bg-surface-subtle text-content-primary"
                >
                  <option value="">Whole Station / Unspecified</option>
                  {connectors.map((c, i) => (
                    <option key={c.id || i} value={c.id || `conn-${i + 1}`}>
                      {c.type} ({c.powerKw} kW) {c.id ? `· ${c.id}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Dynamic Numeric Inputs */}
            {category === 'station_availability' && condition === 'queue_observed' && (
              <div>
                <label className="font-semibold text-content-secondary flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  Observed Waiting Time (minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  max="360"
                  placeholder="e.g. 15"
                  value={waitTimeMinutes}
                  onChange={(e) => setWaitTimeMinutes(e.target.value)}
                  className="w-full p-2 rounded-lg border border-edge-subtle bg-surface-subtle text-content-primary"
                />
              </div>
            )}

            {category === 'session_outcome' && condition === 'low_power_delivered' && (
              <div>
                <label className="font-semibold text-content-secondary flex items-center gap-1.5 mb-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Delivered Power Observed (kW)
                </label>
                <input
                  type="number"
                  min="1"
                  max="350"
                  placeholder="e.g. 24"
                  value={deliveredPowerKw}
                  onChange={(e) => setDeliveredPowerKw(e.target.value)}
                  className="w-full p-2 rounded-lg border border-edge-subtle bg-surface-subtle text-content-primary"
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-content-secondary">
                  Additional Notes (Optional)
                </label>
                <span className="text-[10px] text-content-tertiary">
                  {details.length}/280
                </span>
              </div>
              <textarea
                rows={2}
                maxLength={280}
                placeholder="Brief description of charger display error, obstruction, or access tips..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full p-2 rounded-lg border border-edge-subtle bg-surface-subtle text-content-primary resize-none"
              />
            </div>

            {/* Confirmation & Privacy */}
            <div className="pt-2 border-t border-edge-subtle space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-edge-default text-brand-primary focus:ring-brand-primary"
                />
                <span className="text-[11px] text-content-secondary">
                  I confirm that this report reflects my actual charging observation made at this station.
                </span>
              </label>

              <p className="text-[10px] text-content-tertiary flex items-center gap-1">
                <HelpCircle className="w-3 h-3 shrink-0" />
                Privacy safeguard: reports use pseudonymous tokens. No continuous GPS or personal payment data is collected.
              </p>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-edge-subtle">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-edge-subtle text-content-secondary hover:bg-surface-hover font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !confirmed}
                className="px-4 py-2 rounded-xl bg-brand-primary text-white font-medium hover:bg-brand-primary/90 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                {isSubmitting ? 'Submitting...' : 'Submit Observation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

