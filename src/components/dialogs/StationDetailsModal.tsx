import React, { useState, useEffect } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import {
  Zap,
  MapPin,
  Star,
  Slash,
  CheckCircle2,
  ShieldCheck,
  MessageSquarePlus,
  AlertTriangle,
  Clock,
  Users
} from 'lucide-react';
import { DriverReportModal } from './DriverReportModal';
import { QueueReportModal } from './QueueReportModal';
import { chargingQueueService, getMarkerQueueBadge, formatIstTime } from '../../services/queue/chargingQueueService';
import { StationQueueData } from '../../types/queue';

export const StationDetailsModal: React.FC = () => {
  const {
    isStationDetailsOpen,
    setIsStationDetailsOpen,
    selectedStop,
    showToast,
    setChargingSettings,
    chargingSettings,
    replanRoute,
    vehicle,
    setIsDriverCheckInOpen,
    setDriverCheckInStation
  } = usePlanner();

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isQueueReportModalOpen, setIsQueueReportModalOpen] = useState(false);
  const [stationQueue, setStationQueue] = useState<StationQueueData | null>(null);

  useEffect(() => {
    if (!selectedStop) {
      setStationQueue(null);
      return;
    }
    const targetId = selectedStop.stationId || selectedStop.id;
    chargingQueueService.getStationQueueData(targetId).then((q) => {
      setStationQueue(q);
    });
  }, [selectedStop]);

  if (!selectedStop) return null;

  const isExcluded = chargingSettings.excludedChargers.includes(selectedStop.id);

  const handleToggleExclude = () => {
    if (isExcluded) {
      setChargingSettings((prev) => ({
        ...prev,
        excludedChargers: prev.excludedChargers.filter((id) => id !== selectedStop.id)
      }));
      showToast(`Removed ${selectedStop.name} from excluded list.`);
    } else {
      setChargingSettings((prev) => ({
        ...prev,
        excludedChargers: [...prev.excludedChargers, selectedStop.id]
      }));
      showToast(`Added ${selectedStop.name} to excluded chargers.`);
    }
    setIsStationDetailsOpen(false);
    setTimeout(() => replanRoute(), 100);
  };

  const handlePreferStation = () => {
    setChargingSettings((prev) => {
      const alreadyPreferred = prev.preferredNetworks.includes(selectedStop.network);
      return alreadyPreferred
        ? prev
        : { ...prev, preferredNetworks: [...prev.preferredNetworks, selectedStop.network] };
    });
    showToast(`Prioritizing ${selectedStop.name} (${selectedStop.network}) for future routes.`);
    setIsStationDetailsOpen(false);
    setTimeout(() => replanRoute(), 100);
  };

  return (
    <Modal
      isOpen={isStationDetailsOpen}
      onClose={() => setIsStationDetailsOpen(false)}
      title={selectedStop.name}
      subtitle={selectedStop.network}
      maxWidth="max-w-xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={handleToggleExclude}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              isExcluded
                ? 'bg-surface-hover text-content-primary border-edge-default'
                : 'bg-status-dangerSubtle hover:opacity-90 text-status-danger border-status-danger/30'
            }`}
          >
            <Slash className="w-3.5 h-3.5" />
            <span>{isExcluded ? 'Unblock Charger' : 'Exclude Charger'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 text-xs font-semibold transition-colors"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Report Status</span>
            </button>
            <button
              type="button"
              onClick={handlePreferStation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-semibold transition-colors"
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Prefer Station</span>
            </button>
            <button
              type="button"
              onClick={() => setIsStationDetailsOpen(false)}
              className="px-4 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-hover text-brand-inverse font-bold text-xs shadow-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Address and Coordinates Banner */}
        <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-content-primary font-medium">{selectedStop.address}</p>
            <p className="text-content-tertiary mt-0.5">
              Coordinates: {selectedStop.coordinates[0].toFixed(4)}° N,{' '}
              {selectedStop.coordinates[1].toFixed(4)}° E
            </p>
          </div>
        </div>

        {/* Charger Specs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 bg-surface-subtle rounded-xl border border-edge-subtle text-center">
            <span className="text-[10px] text-content-tertiary uppercase tracking-wider block">
              Max Power
            </span>
            <span className="text-base font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1 mt-0.5">
              <Zap className="w-3.5 h-3.5 fill-current" />
              {selectedStop.powerKw} kW
            </span>
          </div>

          <div className="p-2.5 bg-surface-subtle rounded-xl border border-edge-subtle text-center">
            <span className="text-[10px] text-content-tertiary uppercase tracking-wider block">
              Stalls
            </span>
            <span className="text-base font-bold text-content-primary mt-0.5 block">
              {selectedStop.stallsTotal} units
            </span>
            {selectedStop.stallsAvailable !== undefined ? (
              <span className="text-[10px] text-status-success font-medium">
                {selectedStop.stallsAvailable} available (snapshot)
              </span>
            ) : (
              <span className="text-[10px] text-content-tertiary font-medium">
                Live occupancy unverified
              </span>
            )}
          </div>

          <div className="p-2.5 bg-surface-subtle rounded-xl border border-edge-subtle text-center">
            <span className="text-[10px] text-content-tertiary uppercase tracking-wider block">
              Timing
            </span>
            <span className="text-sm font-bold text-content-primary mt-0.5 block font-mono">
              {selectedStop.arrivalTime}
            </span>
            <span className="text-[10px] text-content-tertiary font-mono">
              Depart {selectedStop.departureTime}
            </span>
          </div>

          <div className="p-2.5 bg-surface-subtle rounded-xl border border-edge-subtle text-center">
            <span className="text-[10px] text-content-tertiary uppercase tracking-wider block">
              {selectedStop.tariffClassification === 'estimated_default' ? 'Est. Tariff' : 'Tariff'}
            </span>
            <span className="text-base font-bold text-status-success mt-0.5 block">
              {selectedStop.priceEstimate || '₹22.00 / kWh'}
            </span>
            <span className="text-[9px] text-content-tertiary block">
              {selectedStop.tariffClassification === 'source_confirmed' ? 'Operator confirmed' : 'Estimated default'}
            </span>
          </div>
        </div>

        {/* Battery State & Charge Curve Window */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-content-primary">
              Session Charge Window
            </span>
            <span className="font-bold text-brand-primary">
              +{selectedStop.departureSoc - selectedStop.arrivalSoc}% gain (
              {selectedStop.chargeDurationMinutes} min)
            </span>
          </div>

          {/* Bar Visual */}
          <div className="w-full bg-surface-canvas h-3.5 rounded-full overflow-hidden flex border border-edge-default">
            <div
              className="bg-status-danger h-full flex items-center justify-center text-[9px] font-bold text-white"
              style={{ width: `${selectedStop.arrivalSoc}%` }}
              title={`Arrival: ${selectedStop.arrivalSoc}%`}
            >
              {selectedStop.arrivalSoc}%
            </div>
            <div
              className="bg-status-success h-full flex items-center justify-center text-[9px] font-bold text-slate-950 animate-pulse"
              style={{
                width: `${selectedStop.departureSoc - selectedStop.arrivalSoc}%`
              }}
              title={`Added charge: +${selectedStop.departureSoc - selectedStop.arrivalSoc}%`}
            >
              +{selectedStop.departureSoc - selectedStop.arrivalSoc}%
            </div>
            <div
              className="bg-surface-subtle h-full"
              style={{ width: `${100 - selectedStop.departureSoc}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] text-content-secondary mt-2 font-mono">
            <span>
              Arrival SoC:{' '}
              <strong className="text-status-danger font-semibold">{selectedStop.arrivalSoc}%</strong>
            </span>
            <span>
              Target SoC:{' '}
              <strong className="text-status-success font-semibold">
                {selectedStop.departureSoc}%
              </strong>
            </span>
          </div>
        </div>

        {/* Amenities List */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
          <span className="text-xs font-semibold text-content-primary uppercase tracking-wider block mb-2">
            Wayside Amenities
          </span>
          <div className="flex flex-wrap gap-2 text-xs">
            {selectedStop.amenities.map((amenity) => (
              <span
                key={amenity}
                className="px-2.5 py-1 rounded-md bg-surface-panel border border-edge-default text-content-primary capitalize flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-3 h-3 text-status-success" />
                <span>{amenity}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Community Reliability & Driver Feedback Card */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-content-primary uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" />
              Community Reliability
            </span>
            {selectedStop.communityReliabilityScore !== null && selectedStop.communityReliabilityScore !== undefined ? (
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                selectedStop.communityReliabilityScore >= 80
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : selectedStop.communityReliabilityScore >= 60
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
              }`}>
                {selectedStop.communityReliabilityScore}% ({selectedStop.communityConfidenceTier || 'moderate'} confidence)
              </span>
            ) : (
              <span className="text-[11px] text-content-tertiary italic">
                Insufficient community evidence
              </span>
            )}
          </div>

          {/* Queue Wait Time */}
          {selectedStop.communityQueueMinutes !== undefined && selectedStop.communityQueueMinutes > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>Observed wait time: ~{selectedStop.communityQueueMinutes} minutes</span>
            </div>
          )}

          {/* CPO Conflict or Community Warnings */}
          {selectedStop.cpoConflict?.hasConflict && (
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span>Dual Signal: {selectedStop.cpoConflict.cpoStatus} · {selectedStop.cpoConflict.communityWarning}</span>
            </div>
          )}

          {!selectedStop.cpoConflict?.hasConflict && selectedStop.communityWarning && (
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span>Community Warning: {selectedStop.communityWarning}</span>
            </div>
          )}

          {/* Backup charger details */}
          {selectedStop.backupStationName && (
            <div className="text-[11px] text-content-secondary flex items-center justify-between pt-1 border-t border-edge-subtle">
              <span>Alternative Backup:</span>
              <strong className={selectedStop.backupReachable ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}>
                {selectedStop.backupStationName} ({selectedStop.backupReachable ? 'Reachable' : 'Risk'})
              </strong>
            </div>
          )}
        </div>

        {/* Station Notes / Reference remarks */}
        {selectedStop.notes && (
          <p className="text-xs text-content-secondary italic bg-surface-panel p-3 rounded-lg border border-edge-default">
            "{selectedStop.notes}"
          </p>
        )}

        {/* Live Station Queue Status */}
        {(() => {
          const qBadge = getMarkerQueueBadge(stationQueue, vehicle);
          const sourceLabel =
            qBadge.dataSource === 'operator_managed_queue'
              ? 'Verified Operator Live Queue'
              : qBadge.dataSource === 'operator_aggregate_report'
              ? 'Operator-Reported Count'
              : qBadge.dataSource === 'hardware_telemetry'
              ? 'Hardware Telemetry'
              : qBadge.dataSource === 'community_report'
              ? 'Community Crowd Report'
              : qBadge.dataSource === 'historical_estimate'
              ? 'Historical Estimate'
              : 'Unknown';

          return (
            <div className="p-3 rounded-xl bg-surface-subtle border border-edge-default space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-xs text-content-primary">
                  <Users className="w-4 h-4 text-brand-primary" />
                  <span>Live Queue ({qBadge.connectorType})</span>
                  {stationQueue?.operatorManaged && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                      ✓ Operator Managed
                    </span>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${qBadge.badgeClass}`}>
                  {qBadge.badgeText}
                </span>
              </div>

              {qBadge.hasData ? (
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-content-primary">{qBadge.label}</div>
                  {stationQueue?.connectorsTotal !== undefined && stationQueue.connectorsTotal > 0 && (
                    <div className="text-[11px] text-content-secondary">
                      Bays: {stationQueue.connectorsAvailable} available / {stationQueue.connectorsTotal} total ({stationQueue.activeSessionCount || 0} active charging)
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-content-secondary pt-1 border-t border-edge-subtle">
                    <span className="font-medium text-emerald-500/90">Source: {sourceLabel}</span>
                    {qBadge.updatedAt && (
                      <span>Updated {formatIstTime(qBadge.updatedAt)}</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-content-secondary italic">
                  Nobody has submitted a recent queue report for this connector.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDriverCheckInStation({
                      id: selectedStop.stationId || selectedStop.id,
                      name: selectedStop.name
                    });
                    setIsDriverCheckInOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Check In to Queue</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsQueueReportModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary text-xs font-semibold flex items-center justify-center gap-1.5 border border-brand-primary/20 transition-colors"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Report current queue</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Data Provenance Transparency Notice */}
        <div className="p-2.5 rounded-lg bg-surface-subtle border border-edge-subtle text-[11px] text-content-tertiary flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" />
            <span>
              Operator: <strong className="text-content-secondary">{selectedStop.canonicalNetwork || selectedStop.network}</strong>
            </span>
          </div>
          <span className="text-[10px]">
            {selectedStop.roadAccessStatus === 'verified' ? 'Road Access Verified' : 'Road Access Estimated'}
          </span>
        </div>
      </div>

      {/* Driver Reporting Modal */}
      <DriverReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        stationId={selectedStop.stationId}
        stationName={selectedStop.name}
      />

      {/* Live Queue Reporting Modal */}
      <QueueReportModal
        isOpen={isQueueReportModalOpen}
        onClose={() => setIsQueueReportModalOpen(false)}
        station={{
          id: selectedStop.stationId || selectedStop.id,
          name: selectedStop.name,
          coordinates: selectedStop.coordinates
        }}
        onReportSubmitted={() => {
          const targetId = selectedStop.stationId || selectedStop.id;
          chargingQueueService.getStationQueueData(targetId).then((q) => {
            setStationQueue(q);
          });
          showToast('Queue report submitted successfully!');
        }}
      />
    </Modal>
  );
};
