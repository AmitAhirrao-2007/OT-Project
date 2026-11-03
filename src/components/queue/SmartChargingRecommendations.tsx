import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import {
  RecommendationPriority,
  StationRecommendationCandidate
} from '../../types/queue';
import {
  ChargingStationPriorityQueue
} from '../../services/queue/chargingStationPriorityQueue';
import {
  predictQueueAtArrival,
  chargingQueueService,
  formatIstTime
} from '../../services/queue/chargingQueueService';
import { chargingStations as catalogueStations } from '../../data/stationCatalogue';
import { ChargingStation } from '../../types/station';
import { Waypoint } from '../../types/route';
import { QueueReportModal } from '../dialogs/QueueReportModal';
import { projectStationOnPolyline } from '../../utils/geoUtils';
import { simulatedQueueService } from '../../services/queue/simulatedQueueService';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Plus,
  MessageSquarePlus
} from 'lucide-react';

const managedNationalStations: ChargingStation[] = [
  {
    id: 'sta-pcs-58fad8f122f2',
    name: 'Tata Power EZ Charge - Agra Agra Ashok Auto Sales',
    network: 'Tata Power EZ Charge',
    canonicalNetwork: 'Tata Power EZ Charge',
    address: 'Agra Ashok Auto Sales, NH-19 Civil Lines, Agra, Uttar Pradesh',
    coordinates: [27.200798, 78.008796],
    ratedPowerKw: 60,
    totalStalls: 4,
    availableStalls: 2,
    connectors: [
      { type: 'CCS2', maxPowerKw: 60, count: 3, availableCount: 1, canonicalType: 'CCS2' },
      { type: 'Type 2', maxPowerKw: 22, count: 1, availableCount: 1, canonicalType: 'Type 2' }
    ],
    amenities: ['restaurant', 'restroom', 'coffee', 'wifi'],
    pricePerKwh: '₹21.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified live',
    openingHours: '24/7',
    paymentMethods: ['App', 'RFID'],
    dataSource: 'Operator API'
  }
];

export const SmartChargingRecommendations: React.FC = () => {
  const {
    trip,
    setTrip,
    activeRoute,
    vehicle,
    replanRoute,
    showToast
  } = usePlanner();

  const [selectedPriority, setSelectedPriority] = useState<RecommendationPriority>('best_overall_trip_time');
  const [isSectionOpen, setIsSectionOpen] = useState<boolean>(true);
  const [reportingStation, setReportingStation] = useState<ChargingStation | null>(null);
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null);
  const [liveQueueDataMap, setLiveQueueDataMap] = useState<Record<string, any>>({});
  const [, setIsLoadingQueues] = useState<boolean>(false);

  const polyline = activeRoute.polylineCoordinates || [];
  const roadDistanceMi = activeRoute.totalDistanceMi || 300;

  // 1. Fetch live queue data for candidate stations
  const fetchQueues = useCallback(async (stationIds: string[]) => {
    if (stationIds.length === 0) return;
    setIsLoadingQueues(true);
    const updates: Record<string, any> = {};
    for (const id of stationIds.slice(0, 10)) {
      const data = await chargingQueueService.getStationQueueData(id);
      if (data) {
        updates[id] = data;
      }
    }
    setLiveQueueDataMap((prev) => ({ ...prev, ...updates }));
    setIsLoadingQueues(false);
  }, []);

  // 2. Discover and evaluate candidate stations along active route
  const candidateRecommendations = useMemo(() => {
    if (polyline.length < 2) return [];

    const now = Date.now();
    // Parse departure time to timestamp
    let departureTimeMs = now;
    const depStr = trip.origin.departureTime || '08:00 AM';
    const timeMatch = depStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const ampm = timeMatch[3]?.toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      const d = new Date();
      d.setHours(hours, minutes, 0, 0);
      departureTimeMs = d.getTime();
    }

    const pq = new ChargingStationPriorityQueue({
      priority: selectedPriority,
      maxCandidates: 5
    });

    // Check corridor stations from catalogue, managed national hubs, and active route stops
    const candidatesToFetch: string[] = [];
    const seenStationIds = new Set<string>();

    const stopStations: ChargingStation[] = (activeRoute.stops || []).map((s) => ({
      id: s.stationId || s.id,
      name: s.name,
      network: s.network,
      canonicalNetwork: s.network,
      address: s.address,
      coordinates: s.coordinates,
      ratedPowerKw: s.powerKw,
      totalStalls: s.stallsTotal,
      availableStalls: s.stallsAvailable ?? s.stallsTotal,
      connectors: [
        { type: 'CCS2', maxPowerKw: s.powerKw, count: s.stallsTotal, canonicalType: 'CCS2' }
      ],
      amenities: s.amenities || [],
      pricePerKwh: s.priceEstimate || '₹21.00 / kWh',
      operationalStatus: 'operational',
      statusTimestamp: 'Verified',
      openingHours: '24/7',
      paymentMethods: ['App', 'RFID'],
      dataSource: 'Reference Simulation'
    }));

    const pool = [...catalogueStations, ...managedNationalStations, ...stopStations];

    for (const station of pool) {
      if (seenStationIds.has(station.id)) continue;
      seenStationIds.add(station.id);
      // Plug compatibility check
      const compatibleConn = station.connectors.find((c) => {
        const cType = c.type.toLowerCase();
        return vehicle.selectedPlugTypes.some((vp) =>
          cType.includes(vp.toLowerCase()) || vp.toLowerCase().includes(cType)
        );
      });

      if (!compatibleConn) continue;

      const proj = projectStationOnPolyline(station.coordinates, polyline);
      // Detour must be within 25 miles and station must lie along the corridor
      if (proj.detourMi > 25 || proj.distFromOriginMi < 5 || proj.distFromOriginMi > roadDistanceMi - 5) {
        continue;
      }

      candidatesToFetch.push(station.id);

      // Estimated drive time from origin to this station
      const legDriveMinutes = Math.round(proj.distFromOriginMi * 1.33);
      const arrivalTimestampMs = departureTimeMs + legDriveMinutes * 60 * 1000;
      const detourDurationMinutes = Math.round(proj.detourMi * 2.0); // round-trip detour road time

      // Estimated battery SoC on arrival
      const estSoc = Math.max(10, Math.round(trip.origin.batterySoc - (proj.distFromOriginMi / 3.0)));

      // Queue status from live cache if present, with simulated fallback when enabled
      let stationQueue = liveQueueDataMap[station.id];
      if (!stationQueue && simulatedQueueService.isSimulationEnabled()) {
        stationQueue = simulatedQueueService.getOrGenerateSimulatedQueue(station.id, station);
      }
      const connQueueStatus = stationQueue?.connectorQueues?.[compatibleConn.canonicalType || compatibleConn.type] || null;

      // Predict queue wait at arrival
      const prediction = predictQueueAtArrival({
        station,
        connectorType: compatibleConn.type,
        currentQueueStatus: connQueueStatus,
        arrivalTimestampMs,
        currentTimestampMs: now,
        vehicle,
        arrivalSocPercent: estSoc,
        targetSocPercent: 80
      });

      const estWaitMin = prediction.estimatedWaitAtArrivalMinutes ?? 0;
      const estChargeMin = prediction.estimatedChargeDurationMinutes;
      const totalImpactMin = detourDurationMinutes + estWaitMin + estChargeMin;

      // Price calculation
      const priceStr = String(station.pricePerKwh || '21');
      const tariffNum = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 21;
      const estKwh = (vehicle.usableBatteryKwh * (80 - estSoc)) / 100;
      const estPriceInr = Math.round(estKwh * tariffNum);

      const candidate: StationRecommendationCandidate = {
        station,
        connectorType: compatibleConn.type,
        powerKw: station.ratedPowerKw || compatibleConn.maxPowerKw,
        detourDistanceMi: Math.round(proj.detourMi * 10) / 10,
        detourDurationMinutes,
        expectedArrivalTime: formatIstTime(arrivalTimestampMs),
        arrivalTimestampMs,
        queueStatus: connQueueStatus,
        prediction,
        estimatedWaitMinutes: estWaitMin,
        estimatedChargeMinutes: estChargeMin,
        totalStopImpactMinutes: totalImpactMin,
        estimatedPriceInr: estPriceInr,
        reliabilityScore: 85, // Catalogue verified baseline
        isFeasible: true,
        recommendationRank: 0,
        isBestChoice: false
      };

      pq.addCandidate(candidate);
    }

    return pq.getRankedRecommendations();
  }, [polyline, roadDistanceMi, trip.origin.departureTime, trip.origin.batterySoc, vehicle, selectedPriority, liveQueueDataMap]);

  // Initial trigger to fetch queue data for candidates
  useEffect(() => {
    const ids = candidateRecommendations.map((c) => c.station.id);
    if (ids.length > 0) {
      fetchQueues(ids);
    }
  }, [candidateRecommendations.length, fetchQueues]);

  // Live queue update listener
  useEffect(() => {
    const handleQueueUpdated = (e: any) => {
      const updatedStationId = e?.detail?.stationId;
      const ids = candidateRecommendations.map((c) => c.station.id);
      if (updatedStationId && !ids.includes(updatedStationId)) {
        ids.push(updatedStationId);
      }
      if (ids.length > 0) {
        fetchQueues(ids);
      }
    };
    window.addEventListener('evsure:queue-updated', handleQueueUpdated);
    return () => window.removeEventListener('evsure:queue-updated', handleQueueUpdated);
  }, [candidateRecommendations, fetchQueues]);

  // Handle adding candidate station to route stops
  const handleAddStop = (candidate: StationRecommendationCandidate) => {
    const { station } = candidate;
    const newWaypoint: Waypoint = {
      id: `pinned-charger-${station.id}-${Date.now()}`,
      stationId: station.id,
      name: station.name,
      subTitle: `${station.canonicalNetwork || station.network || 'CPO'} · ${candidate.powerKw} kW`,
      address: station.address,
      coordinates: station.coordinates,
      powerKw: candidate.powerKw,
      batterySoc: 15,
      type: 'charging_pinned',
      category: 'charging_station',
      verificationState: 'verified_station',
      source: 'catalogue',
      targetChargeSoc: 80,
      isCustom: true
    };

    const nextWaypoints = [...trip.waypoints, newWaypoint];
    setTrip((prev) => ({
      ...prev,
      waypoints: nextWaypoints
    }));
    replanRoute({ waypoints: nextWaypoints });
    showToast(`Added "${station.name}" to trip stops.`);
  };

  if (candidateRecommendations.length === 0) {
    return null;
  }

  const priorityOptions: Array<{ key: RecommendationPriority; label: string; icon: string }> = [
    { key: 'best_overall_trip_time', label: 'Best Trip Time', icon: '⚡' },
    { key: 'shortest_queue', label: 'Shortest Queue', icon: '⏱️' },
    { key: 'fastest_charging', label: 'Fastest Charging', icon: '🚀' },
    { key: 'lowest_cost', label: 'Lowest Cost', icon: '💰' },
    { key: 'most_reliable', label: 'Most Reliable', icon: '🛡️' }
  ];

  return (
    <div className="mt-3 bg-surface-card border border-brand-primary/20 rounded-2xl p-3 shadow-card transition-all">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsSectionOpen(!isSectionOpen)}
          className="flex items-center gap-2 text-left focus:outline-none group"
        >
          <div className="w-6 h-6 rounded-lg bg-brand-primary/10 border border-brand-primary/30 text-brand-primary flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-content-primary group-hover:text-brand-primary transition-colors">
                Smart Charging Recommendations
              </span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-brand-primary/15 text-brand-primary border border-brand-primary/30">
                Phase 6G
              </span>
            </div>
            <p className="text-[10px] text-content-muted">
              Live predicted queue wait & optimal stops at arrival
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setIsSectionOpen(!isSectionOpen)}
          className="p-1 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-hover transition-colors"
        >
          {isSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isSectionOpen && (
        <div className="mt-2.5 space-y-2.5">
          {/* Driver Preference Priority Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar">
            {priorityOptions.map((opt) => {
              const isSelected = selectedPriority === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSelectedPriority(opt.key)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap border transition-all flex items-center gap-1 ${
                    isSelected
                      ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                      : 'bg-surface-subtle border-edge-subtle text-content-secondary hover:bg-surface-hover'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Notice when recommendations use simulated queue fallback */}
          {candidateRecommendations.some((c) => c.prediction?.dataSource === 'simulated_queue') && (
            <div className="px-2.5 py-1.5 rounded-lg bg-violet-950/20 border border-violet-500/30 text-[10px] text-violet-300 flex items-center justify-between">
              <span className="font-medium">Recommendation uses simulated queue data</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-violet-700 text-white">
                SIMULATED
              </span>
            </div>
          )}

          {/* Candidates List */}
          <div className="space-y-2">
            {candidateRecommendations.map((cand) => {
              const isBest = cand.isBestChoice;
              const isExpanded = expandedStationId === cand.station.id;
              const queueStatus = cand.queueStatus;
              const pred = cand.prediction;

              // Source badge styling
              let sourceBadge = 'Queue Info Unavailable';
              let sourceColor = 'bg-zinc-500/10 text-zinc-600 border-zinc-500/30';

              if (pred?.dataSource === 'operator_live' || pred?.dataSource === 'operator_managed_queue') {
                sourceBadge = 'Operator Live Data';
                sourceColor = 'bg-emerald-600 text-white border-emerald-400 font-bold';
              } else if (pred?.dataSource === 'operator_aggregate_report') {
                sourceBadge = 'Operator Report';
                sourceColor = 'bg-teal-700 text-white border-teal-500 font-bold';
              } else if (pred?.dataSource === 'verified_availability') {
                sourceBadge = 'Verified Live Availability';
                sourceColor = 'bg-blue-600 text-white border-blue-400 font-bold';
              } else if (pred?.dataSource === 'community_report') {
                sourceBadge = 'Community Report';
                sourceColor = 'bg-amber-500 text-slate-950 border-amber-300 font-bold';
              } else if (pred?.dataSource === 'simulated_queue') {
                sourceBadge = 'SIMULATED QUEUE';
                sourceColor = 'bg-violet-700 text-white border-violet-500 font-bold';
              } else if (pred?.dataSource === 'historical_estimate') {
                sourceBadge = 'Historical Estimate';
                sourceColor = 'bg-indigo-700 text-white border-indigo-500 font-bold';
              }

              return (
                <div
                  key={cand.station.id}
                  className={`rounded-xl border transition-all text-xs overflow-hidden ${
                    isBest
                      ? 'bg-brand-primary/5 border-brand-primary/40 shadow-sm ring-1 ring-brand-primary/20'
                      : 'bg-surface-subtle/60 border-edge-subtle hover:border-edge-default'
                  }`}
                >
                  {/* Best Choice Banner */}
                  {isBest && cand.bestChoiceRationale && (
                    <div className="px-3 py-1.5 bg-brand-primary text-white text-[10px] font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>Best Choice: {cand.bestChoiceRationale}</span>
                    </div>
                  )}

                  <div className="p-3 space-y-2">
                    {/* Top Row: Name, Power, Detour */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-content-primary text-xs">
                            {cand.station.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-surface-panel border border-edge-subtle text-[9px] font-mono text-content-secondary">
                            {cand.powerKw} kW
                          </span>
                        </div>
                        <p className="text-[10px] text-content-muted mt-0.5">
                          {cand.station.network || 'CPO'} • {cand.detourDistanceMi} mi detour (~{cand.detourDurationMinutes} min)
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-content-muted block">Arrival (IST)</span>
                        <span className="font-bold text-content-primary font-mono text-xs">
                          {cand.expectedArrivalTime}
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Queue Prediction & Plug-in Timing */}
                    <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-surface-panel border border-edge-subtle text-[10px]">
                      <div>
                        <span className="text-content-muted block text-[9px]">Predicted Wait</span>
                        {pred && pred.estimatedWaitAtArrivalMinutes !== null ? (
                          <span className={`font-bold font-mono ${pred.estimatedWaitAtArrivalMinutes === 0 ? 'text-status-success' : 'text-amber-500'}`}>
                            {pred.estimatedWaitAtArrivalMinutes === 0
                              ? '0 min wait'
                              : `${pred.estimatedWaitRange?.[0] || pred.estimatedWaitAtArrivalMinutes}–${pred.estimatedWaitRange?.[1] || pred.estimatedWaitAtArrivalMinutes} min`}
                          </span>
                        ) : (
                          <span className="font-medium text-content-muted">Unavailable</span>
                        )}
                      </div>

                      <div>
                        <span className="text-content-muted block text-[9px]">Est. Plug-in</span>
                        <span className="font-bold text-content-primary font-mono">
                          {pred?.estimatedPlugInTime || '—'}
                        </span>
                      </div>

                      <div>
                        <span className="text-content-muted block text-[9px]">Est. Departure</span>
                        <span className="font-bold text-content-primary font-mono">
                          {pred?.estimatedDepartureTime || '—'}
                        </span>
                      </div>
                    </div>

                    {/* Badges: Source, Confidence, Stalls */}
                    <div className="flex items-center justify-between gap-1 flex-wrap pt-0.5 text-[9px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded border font-semibold ${sourceColor}`}>
                          {sourceBadge}
                        </span>
                        {pred && pred.confidence !== 'unknown' && (
                          <span className="px-1.5 py-0.5 rounded border bg-surface-panel text-content-secondary border-edge-subtle">
                            {pred.confidence.toUpperCase()} Confidence
                          </span>
                        )}
                        {queueStatus && (
                          <span className="px-1.5 py-0.5 rounded border bg-surface-panel text-content-secondary border-edge-subtle">
                            {queueStatus.availablePoints}/{queueStatus.totalPoints} Free
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono text-content-secondary">
                          ₹{cand.estimatedPriceInr}
                        </span>
                        <span className="text-content-muted">•</span>
                        <span className="font-bold text-brand-primary">
                          ~{cand.totalStopImpactMinutes} min stop
                        </span>
                      </div>
                    </div>

                    {/* Expandable Connector Details */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-edge-subtle space-y-1.5 text-[10px] animate-in fade-in duration-150">
                        <div className="flex items-center justify-between text-content-secondary">
                          <span>Compatible Connector:</span>
                          <span className="font-bold text-content-primary">{cand.connectorType} ({cand.powerKw} kW)</span>
                        </div>
                        {pred?.predictionRationale && (
                          <p className="text-[10px] text-content-muted leading-tight">
                            ℹ️ {pred.predictionRationale}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between pt-1 border-t border-edge-subtle/60 gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedStationId(isExpanded ? null : cand.station.id)}
                        className="text-[10px] text-brand-primary hover:underline flex items-center gap-0.5"
                      >
                        <span>{isExpanded ? 'Less details' : 'Queue breakdown'}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setReportingStation(cand.station)}
                          title="Report live queue condition"
                          className="px-2 py-1 rounded-lg border border-edge-default hover:bg-surface-hover text-content-secondary text-[10px] font-medium flex items-center gap-1 transition-colors"
                        >
                          <MessageSquarePlus className="w-3 h-3" />
                          <span>Report</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddStop(cand)}
                          className="px-2.5 py-1 rounded-lg bg-brand-primary text-white text-[10px] font-bold hover:bg-brand-hover transition-colors flex items-center gap-1 shadow-sm"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Stop</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Community Queue Reporting Modal */}
      {reportingStation && (
        <QueueReportModal
          isOpen={Boolean(reportingStation)}
          onClose={() => setReportingStation(null)}
          station={reportingStation}
          onReportSubmitted={() => {
            fetchQueues([reportingStation.id]);
          }}
        />
      )}
    </div>
  );
};
