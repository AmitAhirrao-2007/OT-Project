import React, { useState } from 'react';
import { ChargingStop, Amenity } from '../../types/route';
import {
  Zap,
  Utensils,
  Coffee,
  ShoppingBag,
  Wifi,
  Info,
  ShieldCheck,
  AlertTriangle,
  CornerDownRight,
  MessageSquarePlus,
  Users
} from 'lucide-react';
import { usePlanner } from '../../context/PlannerContext';
import { formatDistance } from '../../utils/units';
import { DriverReportModal } from '../dialogs/DriverReportModal';
import { QueueReportModal } from '../dialogs/QueueReportModal';

interface ChargingStopCardProps {
  stop: ChargingStop;
  index: number;
}

const renderAmenityIcon = (amenity: Amenity) => {
  switch (amenity) {
    case 'restaurant':
      return <Utensils className="w-3 h-3" />;
    case 'coffee':
      return <Coffee className="w-3 h-3" />;
    case 'shopping':
      return <ShoppingBag className="w-3 h-3" />;
    case 'wifi':
      return <Wifi className="w-3 h-3" />;
    case 'restroom':
    default:
      return (
        <span className="text-[10px] font-bold px-1 bg-surface-subtle border border-edge-subtle rounded">
          WC
        </span>
      );
  }
};

export const ChargingStopCard: React.FC<ChargingStopCardProps> = ({ stop, index }) => {
  const {
    selectedStop,
    setSelectedStop,
    setIsStationDetailsOpen,
    hoveredStopId,
    setHoveredStopId,
    displaySettings
  } = usePlanner();

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isQueueReportModalOpen, setIsQueueReportModalOpen] = useState(false);

  const isSelected = selectedStop?.id === stop.id;
  const isHovered = hoveredStopId === stop.id;

  const handleCardClick = () => {
    setSelectedStop(stop);
    setIsStationDetailsOpen(true);
  };

  return (
    <div
      onMouseEnter={() => setHoveredStopId(stop.id)}
      onMouseLeave={() => setHoveredStopId(null)}
      className="relative flex flex-col"
    >
      {/* Driving leg banner prior to this stop */}
      <div className="flex items-center gap-2 pl-7 py-2 text-xs text-content-tertiary">
        <div className="w-px h-6 bg-edge-subtle absolute left-3.5 -top-2"></div>
        <span className="font-semibold text-content-secondary">{stop.legDriveDuration}</span>
        <span>·</span>
        <span>{formatDistance(stop.legDistanceMi, displaySettings.units)}</span>
      </div>

      {/* Main Stop Card */}
      <div
        onClick={handleCardClick}
        className={`group relative rounded-xl border p-3.5 transition-all duration-150 cursor-pointer ${
          !stop.isFeasible
            ? 'bg-status-dangerSubtle/30 border-status-danger/70 shadow-sm ring-1 ring-status-danger/30'
            : isSelected
            ? 'bg-surface-card border-brand-primary shadow-sm ring-1 ring-brand-primary/40'
            : isHovered
            ? 'bg-surface-hover border-edge-default shadow-sm'
            : 'bg-surface-card border-edge-subtle hover:border-edge-default hover:bg-surface-hover'
        }`}
      >
        {/* Top Row: Time, Station Name, Power & Stalls */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {/* Stop sequence badge */}
            <div className={`w-6 h-6 rounded-full border text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
              !stop.isFeasible
                ? 'bg-status-dangerSubtle border-status-danger text-status-danger'
                : 'bg-surface-subtle border-edge-subtle text-content-primary'
            }`}>
              {index + 1}
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-content-secondary">
                  {stop.arrivalTime}
                </span>
                <span className="text-sm font-semibold text-content-primary group-hover:text-brand-primary transition-colors">
                  {stop.name}
                </span>
              </div>
              <p className="text-xs text-content-tertiary line-clamp-1 mt-0.5" title={stop.address}>
                {stop.address}
              </p>
            </div>
          </div>

          {/* Power & Stalls Badge */}
          <div className="flex flex-col items-end shrink-0">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
              <Zap className="w-3 h-3 fill-current" />
              {stop.powerKw} kW
            </span>
            <span
              className="text-[11px] text-content-tertiary"
              title={
                stop.stallsAvailable !== undefined
                  ? `${stop.stallsAvailable} of ${stop.stallsTotal} stalls available (static catalogue snapshot)`
                  : 'Live occupancy unverified; displays total physical stalls'
              }
            >
              {stop.stallsAvailable !== undefined
                ? stop.stallsAvailable === 0
                  ? `0/${stop.stallsTotal} stalls (Full)`
                  : `${stop.stallsAvailable}/${stop.stallsTotal} stalls`
                : `${stop.stallsTotal} stalls (Unverified)`}
            </span>
          </div>
        </div>

        {/* Road Accessibility, Detour, Community Reliability & Backup Badges */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          {/* User Pinned Stop Badge */}
          {stop.isPinned && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
              title="Station added as mandatory charging stop by user"
            >
              📌 User Pinned
            </span>
          )}

          {/* Community Reliability Badge */}
          {stop.communityReliabilityScore !== null && stop.communityReliabilityScore !== undefined ? (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-medium ${
                stop.communityReliabilityScore >= 80
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : stop.communityReliabilityScore >= 60
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
              }`}
              title={`Community Reliability Score: ${stop.communityReliabilityScore}% (${stop.communityConfidenceTier || 'moderate'} confidence)`}
            >
              <ShieldCheck className="w-2.5 h-2.5" />
              {stop.communityReliabilityScore}% Reliable
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-subtle text-content-tertiary border border-edge-subtle"
              title="Insufficient community reports recorded yet"
            >
              Insufficient evidence
            </span>
          )}

          {/* Queue Wait Time Estimate */}
          {stop.communityQueueMinutes !== undefined && stop.communityQueueMinutes > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium"
              title="Community-estimated queue waiting time based on recent driver observations"
            >
              ⏱️ ~{stop.communityQueueMinutes}m wait
            </span>
          )}

          {stop.roadAccessStatus === 'verified' && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium"
              title={stop.accessNotes || 'Road access and carriageway verified'}
            >
              <ShieldCheck className="w-2.5 h-2.5" />
              Verified Access
            </span>
          )}
          {stop.roadAccessStatus === 'uncertain' && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium"
              title="Road access is uncertain or restricted"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              Access Uncertain
            </span>
          )}
          {stop.carriagewayAccess === 'bidirectional_service_road' && (
            <span className="px-1.5 py-0.5 rounded bg-surface-subtle text-content-tertiary border border-edge-subtle">
              Service Road
            </span>
          )}
          {stop.actualDetourMi !== undefined && stop.actualDetourMi > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface-subtle text-content-tertiary border border-edge-subtle"
              title="Off-highway spur detour distance"
            >
              <CornerDownRight className="w-2.5 h-2.5" />
              {formatDistance(stop.actualDetourMi, displaySettings.units)} detour
            </span>
          )}
          {stop.backupStationName && (
            <span
              className={`px-1.5 py-0.5 rounded border ${
                stop.backupReachable
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
              }`}
              title={
                stop.backupReachable
                  ? `Backup station reachable: ${stop.backupStationName} (${stop.reachabilityClassification?.replace(/_/g, ' ') || 'feasible'})`
                  : `Warning: low reserve risk reaching backup station ${stop.backupStationName}`
              }
            >
              Backup: {stop.backupStationName.split('-')[0].trim()} ({stop.backupReachable ? 'Reachable' : 'Risk'})
            </span>
          )}
          {stop.tariffClassification === 'estimated_default' && (
            <span
              className="px-1.5 py-0.5 rounded bg-surface-subtle text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium"
              title="Tariff not confirmed by operator; calculated using ₹21.00/kWh estimated default"
            >
              Est. Tariff
            </span>
          )}
        </div>

        {/* CPO vs Community Conflict Dual Signal Warning */}
        {stop.cpoConflict?.hasConflict && (
          <div className="mt-2 py-1 px-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <span>
              Dual Signal: {stop.cpoConflict.cpoStatus} · {stop.cpoConflict.communityWarning}
            </span>
          </div>
        )}

        {/* Community Warning if present */}
        {!stop.cpoConflict?.hasConflict && stop.communityWarning && (
          <div className="mt-2 py-1 px-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <span>Community Warning: {stop.communityWarning}</span>
          </div>
        )}

        {/* If Infeasible Leg Alert */}
        {!stop.isFeasible && (
          <div className="mt-2.5 py-1 px-2 rounded-md bg-status-dangerSubtle border border-status-danger/40 text-[11px] text-status-danger font-medium flex items-center gap-1.5">
            <span>⚠️ Infeasible Stop:</span>
            <span>
              Arrival {stop.arrivalSoc}% is below reserve or charger is blocked
            </span>
          </div>
        )}

        {/* Middle Row: Battery Delta & Charging Duration */}
        <div className="mt-3 pt-2.5 border-t border-edge-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Battery state of charge range */}
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-status-danger">{stop.arrivalSoc}%</span>
              <span className="text-content-tertiary">→</span>
              <span className="text-status-success">{stop.departureSoc}%</span>
            </div>
            <span className="text-content-tertiary">·</span>
            <span className="text-xs text-content-primary font-medium">
              {stop.chargeDurationMinutes} min charge
            </span>
          </div>

          {/* Amenities & Action Buttons */}
          <div className="flex items-center gap-1.5 text-content-secondary">
            {stop.amenities.slice(0, 4).map((a, i) => (
              <span
                key={i}
                title={a}
                className="p-1 rounded bg-surface-subtle border border-edge-subtle text-content-secondary hover:text-content-primary"
              >
                {renderAmenityIcon(a)}
              </span>
            ))}

            {/* Report Live Station Queue Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsQueueReportModalOpen(true);
              }}
              title="Report live station queue & waiting vehicles"
              aria-label="Report live queue"
              className="p-1 rounded hover:bg-surface-hover text-content-tertiary hover:text-brand-primary transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
            </button>

            {/* Report Charger Status Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsReportModalOpen(true);
              }}
              title="Report charger status"
              aria-label="Report charger status"
              className="p-1 rounded hover:bg-surface-hover text-content-tertiary hover:text-brand-primary transition-colors"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStop(stop);
                setIsStationDetailsOpen(true);
              }}
              title="Station Details & Settings"
              aria-label="View station details"
              className="p-1 rounded hover:bg-surface-hover text-content-tertiary hover:text-content-primary"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress bar showing SoC charge gain */}
        <div className="mt-2.5 w-full bg-surface-subtle border border-edge-subtle/50 h-1.5 rounded-full overflow-hidden flex">
          <div
            className="bg-status-danger h-full"
            style={{ width: `${stop.arrivalSoc}%` }}
          />
          <div
            className="bg-status-success h-full"
            style={{ width: `${stop.departureSoc - stop.arrivalSoc}%` }}
          />
          <div
            className="bg-surface-subtle h-full"
            style={{ width: `${100 - stop.departureSoc}%` }}
          />
        </div>
      </div>

      {/* Driver Reporting Modal */}
      <DriverReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        stationId={stop.stationId}
        stationName={stop.name}
      />

      {/* Live Queue Reporting Modal */}
      <QueueReportModal
        isOpen={isQueueReportModalOpen}
        onClose={() => setIsQueueReportModalOpen(false)}
        station={{
          id: stop.stationId,
          name: stop.name,
          coordinates: stop.coordinates
        }}
      />
    </div>
  );
};
