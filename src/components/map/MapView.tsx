import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePlanner } from '../../context/PlannerContext';
import { reverseGeocode } from '../../services/search/placesSearchService';
import { defaultTrafficProvider, fetchRouteTrafficSegments } from '../../services/traffic/trafficService';
import { getMarkerQueueBadge, getBatchStationQueueData, formatIstTime } from '../../services/queue/chargingQueueService';
import { simulatedQueueService } from '../../services/queue/simulatedQueueService';

function formatMinutesAgo(timestamp?: number): string {
  if (!timestamp) return 'recently';
  const mins = Math.max(0, Math.round((Date.now() - timestamp) / (60 * 1000)));
  if (mins === 0) return 'just now';
  if (mins === 1) return '1m ago';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m ago`;
}
import { StationQueueData } from '../../types/queue';
import { QueueReportModal } from '../dialogs/QueueReportModal';
import { Waypoint } from '../../types/route';
import { TrafficDataStatus } from '../../types/traffic';
import { useGps } from '../../context/GpsContext';
import { GpsControlPanel } from '../gps/GpsControlPanel';
import { Crosshair, Plus, Minus, Layers, AlertTriangle, Loader2, Check, TrafficCone, Zap } from 'lucide-react';

export type MapTileProvider = 'osm-auto' | 'osm-light' | 'osm-dark' | 'esri-dark';

interface TileProviderConfig {
  id: MapTileProvider;
  name: string;
  url: string;
  attribution: string;
  className?: string;
  maxZoom: number;
}

const TILE_PROVIDERS: Record<MapTileProvider, TileProviderConfig> = {
  'osm-auto': {
    id: 'osm-auto',
    name: 'Theme Adaptive Basemap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    className: 'osm-dark-tiles',
    maxZoom: 19
  },
  'osm-light': {
    id: 'osm-light',
    name: 'OpenStreetMap Light Terrain',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    className: 'osm-light-tiles',
    maxZoom: 19
  },
  'osm-dark': {
    id: 'osm-dark',
    name: 'OpenStreetMap Dark Terrain',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    className: 'osm-dark-tiles',
    maxZoom: 19
  },
  'esri-dark': {
    id: 'esri-dark',
    name: 'Esri Dark Gray Canvas',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    className: 'esri-dark-tiles',
    maxZoom: 16
  }
};

export const MapView: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
  const polylineLayerRef = useRef<L.FeatureGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const trafficLayerRef = useRef<L.TileLayer | null>(null);
  const incidentsLayerRef = useRef<L.LayerGroup | null>(null);
  const trafficSegmentsLayerRef = useRef<L.FeatureGroup | null>(null);
  const stationsLayerRef = useRef<L.LayerGroup | null>(null);
  const gpsLayerRef = useRef<L.LayerGroup | null>(null);
  const gpsMarkerRef = useRef<L.Marker | null>(null);
  const gpsAccuracyCircleRef = useRef<L.Circle | null>(null);

  const [activeProvider, setActiveProvider] = useState<MapTileProvider>('osm-auto');
  const [isLayersMenuOpen, setIsLayersMenuOpen] = useState(false);
  const [isLoadingTiles, setIsLoadingTiles] = useState(true);
  const [tileErrorCount, setTileErrorCount] = useState(0);
  const [isTrafficEnabled, setIsTrafficEnabled] = useState(true);
  const [isStationsLayerEnabled, setIsStationsLayerEnabled] = useState(true);
  const [liveTrafficStatus, setLiveTrafficStatus] = useState<TrafficDataStatus>('unavailable');

  // Phase 6G.1: Live Station Queue Map & Crowd Report Dialog State
  const [stationQueueMap, setStationQueueMap] = useState<Record<string, StationQueueData>>({});
  const [queueReportStation, setQueueReportStation] = useState<{ id: string; name: string; coordinates?: [number, number] } | null>(null);
  const stationQueueMapRef = useRef<Record<string, StationQueueData>>({});
  stationQueueMapRef.current = stationQueueMap;

  const { gpsState, setFollowMe } = useGps();
  const setFollowMeRef = useRef(setFollowMe);
  setFollowMeRef.current = setFollowMe;

  const {
    activeRoute,
    trip,
    setTrip,
    selectedRouteId,
    setSelectedRouteId,
    vehicle,
    selectedStop,
    setSelectedStop,
    setIsStationDetailsOpen,
    hoveredStopId,
    setHoveredStopId,
    isPanelCollapsed,
    resolvedTheme,
    showToast,
    replanRoute
  } = usePlanner();

  // Stable references for map event handlers to prevent map recreation on state changes
  const replanRouteRef = useRef(replanRoute);
  replanRouteRef.current = replanRoute;
  const setTripRef = useRef(setTrip);
  setTripRef.current = setTrip;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const tripRef = useRef(trip);
  tripRef.current = trip;

  useEffect(() => {
    (window as any).__replanRoute = replanRoute;
    (window as any).__setTrip = setTrip;
    (window as any).__trip = trip;
  }, [replanRoute, setTrip, trip]);

  // Flag to suppress map-click reverse-geocode popup when clicking an alternative road
  const isSelectingRoadRef = useRef(false);

  // Track the last route key that was auto-fitted so zooming/panning is preserved across queue updates, stop hover, and marker updates
  const lastFittedRouteKeyRef = useRef<string>('');

  // Function to switch tile layer cleanly
  const switchTileLayer = useCallback((providerId: MapTileProvider) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (currentTileLayerRef.current) {
      map.removeLayer(currentTileLayerRef.current);
    }

    const config = TILE_PROVIDERS[providerId];
    setIsLoadingTiles(true);
    setTileErrorCount(0);

    const newLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      className: config.className || '',
      maxZoom: config.maxZoom
    });

    newLayer.on('loading', () => setIsLoadingTiles(true));
    newLayer.on('load', () => setIsLoadingTiles(false));
    newLayer.on('tileerror', () => {
      setTileErrorCount((prev) => prev + 1);
      setIsLoadingTiles(false);
    });

    newLayer.addTo(map);
    currentTileLayerRef.current = newLayer;
    setActiveProvider(providerId);
  }, []);

  const switchTileLayerRef = useRef(switchTileLayer);
  switchTileLayerRef.current = switchTileLayer;

  // Initialize Map ONCE on Mount (Never recreate on route / state updates)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 19,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: true,
      keyboard: true
    }).setView([27.1, 81.2], 6);

    // Create custom panes to guarantee route polylines are visible above tiles and traffic
    if (!map.getPane('traffic-pane')) {
      const trafficPane = map.createPane('traffic-pane');
      trafficPane.style.zIndex = '350';
    }
    if (!map.getPane('route-pane')) {
      const routePane = map.createPane('route-pane');
      routePane.style.zIndex = '450';
    }
    if (!map.getPane('traffic-route-pane')) {
      const trafficRoutePane = map.createPane('traffic-route-pane');
      trafficRoutePane.style.zIndex = '460';
    }
    if (!map.getPane('stations-pane')) {
      const stationsPane = map.createPane('stations-pane');
      stationsPane.style.zIndex = '400';
    }
    if (!map.getPane('gps-pane')) {
      const gpsPane = map.createPane('gps-pane');
      gpsPane.style.zIndex = '620';
    }

    gpsLayerRef.current = L.layerGroup().addTo(map);
    stationsLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    polylineLayerRef.current = L.featureGroup().addTo(map);
    incidentsLayerRef.current = L.layerGroup().addTo(map);
    trafficSegmentsLayerRef.current = L.featureGroup().addTo(map);
    mapInstanceRef.current = map;
    (window as any).__leafletMap = map;

    // Detect manual user panning to pause Follow Me smoothly without fighting the user
    map.on('dragstart', () => {
      setFollowMeRef.current(false);
    });

    switchTileLayerRef.current('osm-auto');

    // Click on map to add waypoint
    map.on('click', async (e: L.LeafletMouseEvent) => {
      if (isSelectingRoadRef.current) return;

      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent(`
          <div class="p-2 text-xs font-sans text-slate-800">
            <div class="font-bold flex items-center gap-1.5">
              <span>Resolving address...</span>
            </div>
            <div class="text-[10px] text-slate-500 mt-0.5">${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
          </div>
        `)
        .openOn(map);

      try {
        const place = await reverseGeocode([lat, lon]);
        const container = document.createElement('div');
        container.className = 'p-2 text-xs font-sans text-slate-900 space-y-2 min-w-[200px]';
        container.innerHTML = `
          <div>
            <div class="font-bold text-xs text-slate-900">${place.name}</div>
            <div class="text-[10px] text-slate-600 truncate mt-0.5">${place.address}</div>
          </div>
          <div class="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-200">
            <button id="map-btn-origin" class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors">
              <span>Set Origin</span>
            </button>
            <button id="map-btn-dest" class="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors">
              <span>Set Destination</span>
            </button>
            <button id="map-btn-via" class="px-2 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors">
              <span>+ Via Stop</span>
            </button>
            <button id="map-btn-charge" class="px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors">
              <span>+ Charger</span>
            </button>
          </div>
        `;

        container.querySelector('#map-btn-origin')?.addEventListener('click', () => {
          map.closePopup();
          const currentTrip = tripRef.current;
          const nextOrigin = {
            ...currentTrip.origin,
            name: place.name,
            subTitle: place.address,
            address: place.address,
            coordinates: [lat, lon] as [number, number]
          };
          setTripRef.current((prev) => ({
            ...prev,
            origin: nextOrigin
          }));
          showToastRef.current(`Origin set to "${place.name}".`);
          replanRouteRef.current({ origin: nextOrigin });
        });

        container.querySelector('#map-btn-dest')?.addEventListener('click', () => {
          map.closePopup();
          const currentTrip = tripRef.current;
          const nextDest = {
            ...currentTrip.destination,
            name: place.name,
            subTitle: place.address,
            address: place.address,
            coordinates: [lat, lon] as [number, number]
          };
          setTripRef.current((prev) => ({
            ...prev,
            destination: nextDest
          }));
          showToastRef.current(`Destination set to "${place.name}".`);
          replanRouteRef.current({ destination: nextDest });
        });

        container.querySelector('#map-btn-via')?.addEventListener('click', () => {
          map.closePopup();
          const currentTrip = tripRef.current;
          const newWp: Waypoint = {
            id: `map-via-${Date.now()}`,
            name: place.name,
            subTitle: place.address,
            address: place.address,
            coordinates: [lat, lon],
            batterySoc: 25,
            type: 'via',
            category: place.category,
            source: 'map_click',
            isCustom: true
          };
          const nextWaypoints = [...currentTrip.waypoints, newWp];
          setTripRef.current((prev) => ({ ...prev, waypoints: nextWaypoints }));
          showToastRef.current(`Added "${place.name}" as via stop.`);
          replanRouteRef.current({ waypoints: nextWaypoints });
        });

        container.querySelector('#map-btn-charge')?.addEventListener('click', () => {
          map.closePopup();
          const currentTrip = tripRef.current;
          const newWp: Waypoint = {
            id: `map-charge-${Date.now()}`,
            name: place.name,
            subTitle: place.address,
            address: place.address,
            coordinates: [lat, lon],
            batterySoc: 15,
            type: 'charging_pinned',
            category: 'charging_station',
            source: 'map_click',
            targetChargeSoc: 80,
            isCustom: true
          };
          const nextWaypoints = [...currentTrip.waypoints, newWp];
          setTripRef.current((prev) => ({ ...prev, waypoints: nextWaypoints }));
          showToastRef.current(`Added "${place.name}" as pinned charging stop.`);
          replanRouteRef.current({ waypoints: nextWaypoints });
        });

        popup.setContent(container);
      } catch {
        popup.setContent('<div class="p-2 text-xs text-rose-600">Failed to resolve location details.</div>');
      }
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []); // Run ONCE on mount

  // Fetch and display national charging stations in current viewport (Task 6)
  const loadStationsForCurrentViewport = useCallback(async () => {
    const map = mapInstanceRef.current;
    const layer = stationsLayerRef.current;
    if (!map || !layer) return;

    if (!isStationsLayerEnabled) {
      layer.clearLayers();
      return;
    }

    const zoom = map.getZoom();
    if (zoom < 6) {
      layer.clearLayers();
      return;
    }

    try {
      const b = map.getBounds();
      const minLat = b.getSouth();
      const maxLat = b.getNorth();
      const minLon = b.getWest();
      const maxLon = b.getEast();
      const excludeLev = zoom < 11;
      const minPower = zoom < 9 ? 30 : 0;

      const res = await fetch(
        `/api/stations/bbox?minLat=${minLat.toFixed(4)}&maxLat=${maxLat.toFixed(4)}&minLon=${minLon.toFixed(4)}&maxLon=${maxLon.toFixed(4)}&minPower=${minPower}&excludeLev=${excludeLev}&limit=120`
      );

      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.stations)) return;

      // Phase 6G.1 & 6J: Batch fetch queue data & register with simulated queue service
      simulatedQueueService.registerStations(data.stations);
      const visibleStationIds = data.stations.map((s: any) => s.id).filter(Boolean);
      if (visibleStationIds.length > 0) {
        getBatchStationQueueData(visibleStationIds).then((batchData: Record<string, StationQueueData>) => {
          setStationQueueMap((prev) => ({ ...prev, ...batchData }));
        });
      }

      layer.clearLayers();

      for (const st of data.stations) {
        if (!st.coordinates || st.coordinates.length !== 2) continue;
        const [lat, lng] = st.coordinates;
        const isFast = st.ratedPowerKw >= 30;

        const stQueue = stationQueueMapRef.current[st.id];
        const qBadge = getMarkerQueueBadge(stQueue, vehicle);

        const icon = L.divIcon({
          className: 'national-station-pin',
          html: `
            <div class="relative flex flex-col items-center cursor-pointer hover:scale-115 transition-transform" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
              <div class="w-5 h-5 rounded-full ${
                isFast ? 'bg-amber-500 border-2 border-white text-slate-950 font-black' : 'bg-teal-600 border border-teal-200 text-white font-bold'
              } flex items-center justify-center text-[9px]">
                ⚡
              </div>
              <div class="px-1.5 py-0.2 rounded-full text-[8px] font-bold border mt-0.5 whitespace-nowrap shadow-sm ${qBadge.badgeClass}">
                ${qBadge.badgeText}
              </div>
            </div>
          `,
          iconSize: [80, 36],
          iconAnchor: [40, 10]
        });

        const marker = L.marker([lat, lng], {
          icon,
          pane: 'stations-pane'
        });

        marker.on('click', () => {
          const currentQueue = stationQueueMapRef.current[st.id];
          const currentBadge = getMarkerQueueBadge(currentQueue, vehicle);

          const timeAgo = currentBadge.updatedAt
            ? formatMinutesAgo(currentBadge.updatedAt)
            : '';
          const timeIst = currentBadge.updatedAt
            ? formatIstTime(currentBadge.updatedAt)
            : '';

          const isSimulated = currentBadge.dataSource === 'simulated_queue' || currentBadge.isSimulated;
          const sourceDisplay =
            currentBadge.dataSource === 'operator_managed_queue'
              ? 'Verified Operator Live Queue'
              : currentBadge.dataSource === 'operator_aggregate_report'
              ? 'Operator-Reported Count'
              : currentBadge.dataSource === 'hardware_telemetry'
              ? 'Hardware Telemetry'
              : currentBadge.dataSource === 'community_report'
              ? 'Community report'
              : isSimulated
              ? 'EVSure simulated queue'
              : currentBadge.dataSource === 'historical_estimate'
              ? 'Historical estimate'
              : 'Unknown source';

          const queueSectionHtml = isSimulated
            ? `
              <div class="space-y-1.5 p-2 bg-violet-950/10 border border-violet-300 rounded">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-slate-800 text-[11px]">Live Queue (${currentBadge.connectorType}):</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold ${currentBadge.badgeClass}">${currentBadge.badgeText}</span>
                </div>
                <div class="text-[11px] font-bold text-slate-900">${currentBadge.label}</div>
                <div class="text-[10px] font-bold text-violet-800 uppercase tracking-wide">Status: SIMULATED — NOT LIVE</div>
                <div class="flex items-center justify-between text-[10px] text-slate-600 pt-0.5 border-t border-violet-200">
                  <span class="font-medium">Source: EVSure simulated queue</span>
                  <span class="font-medium text-violet-700">Confidence: Illustrative only</span>
                </div>
              </div>
            `
            : currentBadge.hasData
            ? `
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-slate-800 text-[11px]">Live Queue (${currentBadge.connectorType}):</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold ${currentBadge.badgeClass}">${currentBadge.badgeText}</span>
                </div>
                <div class="text-[11px] font-bold text-slate-900">${currentBadge.label}</div>
                <div class="flex items-center justify-between text-[10px] text-slate-500 pt-0.5 border-t border-slate-200/60">
                  <span class="${currentBadge.dataSource.startsWith('operator') ? 'font-bold text-emerald-700' : ''}">Source: ${sourceDisplay}</span>
                  <span>${timeAgo} (${timeIst})</span>
                </div>
              </div>
            `
            : `
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-slate-800 text-[11px]">Live Queue (${currentBadge.connectorType}):</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200">Queue unknown</span>
                </div>
                <div class="text-[11px] text-slate-600 italic">
                  Nobody has submitted a recent queue report for this connector.
                </div>
              </div>
            `;

          L.popup({ minWidth: 260, maxWidth: 320 })
            .setLatLng([lat, lng])
            .setContent(`
              <div class="p-3 text-xs font-sans text-slate-900 space-y-2.5">
                <div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold text-xs text-slate-950">${st.name}</span>
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                      isFast ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
                    }">${st.ratedPowerKw} kW ${isFast ? 'Fast' : 'AC'}</span>
                  </div>
                  <div class="text-[10px] text-slate-600 truncate mt-0.5">${st.address}</div>
                  <div class="text-[10px] text-slate-500 mt-0.5">Operator: ${st.canonicalNetwork || st.network}</div>
                </div>

                <div class="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  ${queueSectionHtml}
                </div>

                <div class="grid grid-cols-3 gap-1 pt-1 border-t border-slate-200">
                  <button id="st-btn-add-${st.id}" class="px-1.5 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors">
                    <span>+ Stop</span>
                  </button>
                  <button id="st-btn-dest-${st.id}" class="px-1.5 py-1.5 rounded bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] font-bold flex items-center justify-center gap-1 transition-colors">
                    <span>Set Dest</span>
                  </button>
                  <button id="st-btn-queue-${st.id}" class="px-1.5 py-1.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold flex items-center justify-center gap-1 transition-colors">
                    <span>💬 Report queue</span>
                  </button>
                </div>
              </div>
            `)
            .openOn(map);

          setTimeout(() => {
            document.getElementById(`st-btn-queue-${st.id}`)?.addEventListener('click', () => {
              map.closePopup();
              setQueueReportStation({
                id: st.id,
                name: st.name,
                coordinates: [lat, lng]
              });
            });

            document.getElementById(`st-btn-add-${st.id}`)?.addEventListener('click', () => {
              map.closePopup();
              const currentTrip = tripRef.current;
              const newWp: Waypoint = {
                id: `map-station-${Date.now()}`,
                name: st.name,
                subTitle: `${st.network} · ${st.ratedPowerKw} kW`,
                address: st.address,
                coordinates: [lat, lng],
                batterySoc: 15,
                type: 'charging_pinned',
                category: 'charging_station',
                stationId: st.id,
                source: 'map_click',
                targetChargeSoc: 80,
                isCustom: true
              };
              const nextWaypoints = [...currentTrip.waypoints, newWp];
              setTripRef.current((prev) => ({ ...prev, waypoints: nextWaypoints }));
              showToastRef.current(`Added "${st.name}" as charging stop.`);
              replanRouteRef.current({ waypoints: nextWaypoints });
            });

            document.getElementById(`st-btn-dest-${st.id}`)?.addEventListener('click', () => {
              map.closePopup();
              const currentTrip = tripRef.current;
              const nextDest = {
                ...currentTrip.destination,
                name: st.name,
                subTitle: `${st.network} · ${st.ratedPowerKw} kW`,
                address: st.address,
                coordinates: [lat, lng] as [number, number]
              };
              setTripRef.current((prev) => ({ ...prev, destination: nextDest }));
              showToastRef.current(`Destination set to "${st.name}".`);
              replanRouteRef.current({ destination: nextDest });
            });
          }, 50);
        });

        marker.addTo(layer);
      }
    } catch {}
  }, [isStationsLayerEnabled, stationQueueMap, vehicle]);

  // Hook map moveend event to reload stations
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    let timeoutId: any = null;
    const handleMove = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        loadStationsForCurrentViewport();
      }, 300);
    };

    map.on('moveend', handleMove);
    handleMove();

    return () => {
      map.off('moveend', handleMove);
      clearTimeout(timeoutId);
    };
  }, [loadStationsForCurrentViewport]);

  // Sync adaptive tile theme
  useEffect(() => {
    if (activeProvider === 'osm-auto') {
      switchTileLayer('osm-auto');
    }
  }, [resolvedTheme, activeProvider, switchTileLayer]);

  // Handle panel collapse / expand responsive resize
  useEffect(() => {
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [isPanelCollapsed]);

  // Update Route Polyline & Markers when activeRoute changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !polylineLayerRef.current || !markersLayerRef.current) return;

    // 1. Update Polylines: First render all unselected alternative road paths (interactive & clickable)
    polylineLayerRef.current.clearLayers();

    // Fallback coordinates between origin, intermediate waypoints and destination
    const fallbackEndpoints: [number, number][] = [
      trip.origin?.coordinates,
      ...((trip.waypoints || []).map((w) => w.coordinates)),
      trip.destination?.coordinates
    ].filter(
      (c): c is [number, number] =>
        Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
    );

    // Render unselected alternative road options
    trip.routeOptions.forEach((opt) => {
      if (opt.id === selectedRouteId) return; // Selected route rendered prominently on top
      const coords = (opt.polylineCoordinates && opt.polylineCoordinates.length >= 2)
        ? opt.polylineCoordinates
        : fallbackEndpoints;
      if (!coords || coords.length < 2) return;

      // Transparent wide hit-buffer line to make road clicking effortless
      const hitBuffer = L.polyline(coords, {
        color: '#64748b',
        weight: 18,
        opacity: 0.001,
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'route-pane',
        className: 'cursor-pointer'
      });

      // Visible alternative line
      const altLine = L.polyline(coords, {
        color: '#64748b',
        weight: 6,
        opacity: 0.7,
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'route-pane',
        className: 'cursor-pointer hover:opacity-100 transition-opacity'
      });

      const tooltipHtml = `
        <div class="p-1 font-sans text-xs">
          <div class="font-bold text-slate-900">${opt.description || opt.routeName || opt.label}</div>
          <div class="text-[11px] text-slate-600">${opt.totalDistanceMi} mi • ${opt.totalDuration} • ${opt.stopCount} stops</div>
          <div class="text-[10px] text-cyan-600 font-semibold mt-0.5">Click road to select this route</div>
        </div>
      `;
      altLine.bindTooltip(tooltipHtml, { sticky: true });
      hitBuffer.bindTooltip(tooltipHtml, { sticky: true });

      const handleSelectRoute = (e: L.LeafletMouseEvent) => {
        if (e.originalEvent) {
          L.DomEvent.stopPropagation(e.originalEvent);
        }
        isSelectingRoadRef.current = true;
        setSelectedRouteId(opt.id);
        showToast(`Selected route: ${opt.description || opt.routeName || opt.label}`);
        setTimeout(() => {
          isSelectingRoadRef.current = false;
        }, 500);
      };

      altLine.on('click', handleSelectRoute);
      hitBuffer.on('click', handleSelectRoute);

      polylineLayerRef.current?.addLayer(hitBuffer);
      polylineLayerRef.current?.addLayer(altLine);
    });

    // Render active selected route prominently on top
    let fitTimer: any = null;
    const activeCoords = (activeRoute.polylineCoordinates && activeRoute.polylineCoordinates.length >= 2)
      ? activeRoute.polylineCoordinates
      : fallbackEndpoints;

    const validLatLngs = activeCoords.filter(
      (pt): pt is [number, number] =>
        Array.isArray(pt) && pt.length === 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
    );

    if (validLatLngs.length >= 2) {
      // Background glow line
      const glowLine = L.polyline(validLatLngs, {
        color: '#00b0ff',
        weight: 9,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'route-pane'
      });

      // Core electric blue line
      const coreLine = L.polyline(validLatLngs, {
        color: '#38bdf8',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'route-pane'
      });

      polylineLayerRef.current.addLayer(glowLine);
      polylineLayerRef.current.addLayer(coreLine);

      // Frame route with safe responsive padding only when the route identity changes
      // This prevents user zoom/pan from getting unexpectedly reset when queue badges, hover, or markers update
      const currentRouteKey = `${activeRoute.id}-${trip.origin?.coordinates?.join(',')}-${trip.destination?.coordinates?.join(',')}-${validLatLngs.length}`;
      const shouldAutoFit = lastFittedRouteKeyRef.current !== currentRouteKey;

      if (shouldAutoFit) {
        lastFittedRouteKeyRef.current = currentRouteKey;

        const safeFit = () => {
          try {
            map.invalidateSize();
            const bounds = L.latLngBounds(validLatLngs);
            if (bounds.isValid()) {
              const mapSize = map.getSize();
              const mapWidth = mapSize.x || 1000;
              const safeLeftPad = isPanelCollapsed
                ? 35
                : Math.max(20, Math.min(Math.round(mapWidth * 0.35), Math.max(20, mapWidth - 120)));

              map.fitBounds(bounds, {
                paddingTopLeft: [safeLeftPad, 35],
                paddingBottomRight: [35, 35],
                maxZoom: 15
              });
            }
          } catch {
            try {
              const bounds = L.latLngBounds(validLatLngs);
              if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [25, 25], maxZoom: 14 });
              }
            } catch {}
          }
        };

        safeFit();
        fitTimer = setTimeout(safeFit, 150);
      }
    }

    // 2. Update Markers
    markersLayerRef.current.clearLayers();

    // Origin Marker
    if (
      Array.isArray(trip.origin?.coordinates) &&
      trip.origin.coordinates.length === 2 &&
      Number.isFinite(trip.origin.coordinates[0]) &&
      Number.isFinite(trip.origin.coordinates[1])
    ) {
      const originIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer group">
            <div class="px-2.5 py-1 rounded-full bg-emerald-500 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/40 flex items-center gap-1.5 border border-emerald-200">
              <span class="w-2 h-2 rounded-full bg-slate-950"></span>
              <span>${trip.origin.name}</span>
              <span class="bg-emerald-950 text-emerald-300 px-1 py-0.2 rounded text-[10px] font-mono">${trip.origin.batterySoc ?? 95}%</span>
            </div>
            <div class="w-2.5 h-2.5 bg-emerald-400 rotate-45 -mt-1 shadow-md"></div>
          </div>
        `,
        iconSize: [110, 38],
        iconAnchor: [55, 32]
      });

      L.marker(trip.origin.coordinates, { icon: originIcon })
        .bindTooltip(
          `<div class="font-sans"><strong>Departure: ${trip.origin.name}</strong><br/>Time: ${trip.origin.departureTime || '12:31 AM'}<br/>Battery: ${trip.origin.batterySoc ?? 95}% SoC</div>`,
          { direction: 'top', offset: [0, -22] }
        )
        .addTo(markersLayerRef.current);
    }

    // Destination Marker
    if (
      Array.isArray(trip.destination?.coordinates) &&
      trip.destination.coordinates.length === 2 &&
      Number.isFinite(trip.destination.coordinates[0]) &&
      Number.isFinite(trip.destination.coordinates[1])
    ) {
      const destIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer group">
            <div class="px-2.5 py-1 rounded-full bg-[#00b0ff] text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/40 flex items-center gap-1.5 border border-cyan-100">
              <span>🏁</span>
              <span>${trip.destination.name}</span>
              <span class="bg-cyan-950 text-cyan-300 px-1 py-0.2 rounded text-[10px] font-mono">${trip.destination.batterySoc ?? 10}%</span>
            </div>
            <div class="w-2.5 h-2.5 bg-[#00b0ff] rotate-45 -mt-1 shadow-md"></div>
          </div>
        `,
        iconSize: [120, 38],
        iconAnchor: [60, 32]
      });

      L.marker(trip.destination.coordinates, { icon: destIcon })
        .bindTooltip(
          `<div class="font-sans"><strong>Arrival: ${trip.destination.name}</strong><br/>Estimated Arrival: ${trip.destination.arrivalTime || '3:12 PM'}<br/>Reserve Battery: ${trip.destination.batterySoc ?? 10}% SoC</div>`,
          { direction: 'top', offset: [0, -22] }
        )
        .addTo(markersLayerRef.current);
    }

    // Intermediate Waypoints Markers
    (trip.waypoints || []).forEach((wp, wIdx) => {
      if (
        !Array.isArray(wp.coordinates) ||
        wp.coordinates.length !== 2 ||
        !Number.isFinite(wp.coordinates[0]) ||
        !Number.isFinite(wp.coordinates[1])
      ) {
        return;
      }
      const isCharging = wp.type === 'charging_pinned' || wp.category === 'charging_station';

      const wpIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer group">
            <div class="px-2 py-0.5 rounded-full ${
              isCharging
                ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 shadow-amber-500/40'
                : 'bg-sky-500 text-white ring-2 ring-sky-300 shadow-sky-500/40'
            } text-xs font-bold shadow-lg flex items-center gap-1 border border-white">
              <span>${isCharging ? '⚡' : '📍'}</span>
              <span>${wp.name}</span>
              <span class="${
                isCharging ? 'bg-amber-950 text-amber-200' : 'bg-sky-950 text-sky-200'
              } px-1 rounded text-[9px] font-mono">
                ${isCharging ? `C${wIdx + 1}` : `V${wIdx + 1}`}
              </span>
            </div>
            <div class="w-2 h-2 ${
              isCharging ? 'bg-amber-400' : 'bg-sky-500'
            } rotate-45 -mt-1 shadow-md"></div>
          </div>
        `,
        iconSize: [110, 34],
        iconAnchor: [55, 28]
      });

      L.marker(wp.coordinates, { icon: wpIcon })
        .bindTooltip(
          `<div class="font-sans text-xs"><strong>${isCharging ? '⚡ Pinned Charger' : '📍 Via Stop'} #${wIdx + 1}: ${wp.name}</strong><br/><span class="text-slate-300">${wp.subTitle || wp.address || 'Intermediate stop'}</span></div>`,
          { direction: 'top', offset: [0, -18] }
        )
        .addTo(markersLayerRef.current!);
    });

    // Charging Stop Markers with Live Queue Badges
    (activeRoute.stops || []).forEach((stop, index) => {
      if (
        !Array.isArray(stop.coordinates) ||
        stop.coordinates.length !== 2 ||
        !Number.isFinite(stop.coordinates[0]) ||
        !Number.isFinite(stop.coordinates[1])
      ) {
        return;
      }
      const isSelected = selectedStop?.id === stop.id;
      const isHovered = hoveredStopId === stop.id;
      const isPinned = Boolean(stop.isPinned);

      const stQueue = stationQueueMapRef.current[stop.stationId || stop.id];
      const qBadge = getMarkerQueueBadge(stQueue, vehicle);

      const stopIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer transition-transform duration-200 ${
            isSelected ? 'scale-125 z-50' : isHovered ? 'scale-115 z-40' : 'hover:scale-110'
          }">
            <div class="px-2.5 py-0.5 rounded-full ${
              isPinned
                ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 font-bold shadow-xl shadow-amber-500/50'
                : !stop.isFeasible
                ? 'bg-rose-600 text-white font-bold ring-2 ring-rose-400 shadow-xl'
                : isSelected
                ? 'bg-amber-400 text-slate-950 ring-2 ring-white font-bold shadow-xl shadow-amber-500/40'
                : isHovered
                ? 'bg-[#2b3a4a] text-white border-2 border-[#00b0ff] shadow-lg'
                : 'bg-[#182330] text-slate-200 border border-[#3b4d63] shadow-md'
            } text-[11px] flex items-center gap-1.5">
              <span class="w-3.5 h-3.5 rounded-full ${
                isPinned
                  ? 'bg-slate-950 text-amber-300'
                  : !stop.isFeasible
                  ? 'bg-white text-rose-700'
                  : isSelected
                  ? 'bg-slate-950 text-amber-400'
                  : 'bg-cyan-500/20 text-[#00b0ff]'
              } flex items-center justify-center text-[9px] font-black">
                ${isPinned ? '📌' : !stop.isFeasible ? '!' : '⚡'}
              </span>
              <span class="font-bold">${stop.arrivalSoc}%</span>
              <span class="text-[10px] ${isPinned ? 'text-slate-900 font-extrabold' : isSelected ? 'text-slate-800' : 'text-slate-400'}">${isPinned ? 'PIN' : `#${index + 1}`}</span>
            </div>
            <div class="px-1.5 py-0.2 rounded-full text-[9px] font-bold border mt-0.5 whitespace-nowrap shadow-sm ${qBadge.badgeClass}">
              ${qBadge.badgeText}
            </div>
            <div class="w-2 h-2 ${
              isPinned ? 'bg-amber-400' : !stop.isFeasible ? 'bg-rose-600' : isSelected ? 'bg-amber-400' : isHovered ? 'bg-[#00b0ff]' : 'bg-[#182330]'
            } rotate-45 -mt-1"></div>
          </div>
        `,
        iconSize: [95, 48],
        iconAnchor: [47, 40]
      });

      const marker = L.marker(stop.coordinates, { icon: stopIcon });

      marker.on('click', () => {
        const currentQueue = stationQueueMapRef.current[stop.stationId || stop.id];
        const currentBadge = getMarkerQueueBadge(currentQueue, vehicle);

        const timeAgo = currentBadge.updatedAt
          ? formatMinutesAgo(currentBadge.updatedAt)
          : '';
        const timeIst = currentBadge.updatedAt
          ? formatIstTime(currentBadge.updatedAt)
          : '';

        const isSimulated = currentBadge.dataSource === 'simulated_queue' || currentBadge.isSimulated;
        const sourceDisplay =
          currentBadge.dataSource === 'operator_managed_queue'
            ? 'Verified Operator Live Queue'
            : currentBadge.dataSource === 'operator_aggregate_report'
            ? 'Operator-Reported Count'
            : currentBadge.dataSource === 'hardware_telemetry'
            ? 'Hardware Telemetry'
            : currentBadge.dataSource === 'community_report'
            ? 'Community report'
            : isSimulated
            ? 'EVSure simulated queue'
            : currentBadge.dataSource === 'historical_estimate'
            ? 'Historical estimate'
            : 'Unknown source';

        const queueSectionHtml = isSimulated
          ? `
            <div class="space-y-1.5 p-2 bg-violet-950/10 border border-violet-300 rounded">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-800 text-[11px]">Live Queue (${currentBadge.connectorType}):</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${currentBadge.badgeClass}">${currentBadge.badgeText}</span>
              </div>
              <div class="text-[11px] font-bold text-slate-900">${currentBadge.label}</div>
              <div class="text-[10px] font-bold text-violet-800 uppercase tracking-wide">Status: SIMULATED — NOT LIVE</div>
              <div class="flex items-center justify-between text-[10px] text-slate-600 pt-0.5 border-t border-violet-200">
                <span class="font-medium">Source: EVSure simulated queue</span>
                <span class="font-medium text-violet-700">Confidence: Illustrative only</span>
              </div>
            </div>
          `
          : currentBadge.hasData
          ? `
            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-800 text-[11px]">Live Queue (${currentBadge.connectorType}):</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${currentBadge.badgeClass}">${currentBadge.badgeText}</span>
              </div>
              <div class="text-[11px] font-bold text-slate-900">${currentBadge.label}</div>
              <div class="flex items-center justify-between text-[10px] text-slate-500 pt-0.5 border-t border-slate-200/60">
                <span class="${currentBadge.dataSource.startsWith('operator') ? 'font-bold text-emerald-700' : ''}">Source: ${sourceDisplay}</span>
                <span>${timeAgo} (${timeIst})</span>
              </div>
            </div>
          `
          : `
            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-800 text-[11px]">Live Queue (${currentBadge.connectorType}):</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200">Queue unknown</span>
              </div>
              <div class="text-[11px] text-slate-600 italic">
                Nobody has submitted a recent queue report for this connector.
              </div>
            </div>
          `;

        L.popup({ minWidth: 260, maxWidth: 320 })
          .setLatLng(stop.coordinates)
          .setContent(`
            <div class="p-3 text-xs font-sans text-slate-900 space-y-2.5">
              <div>
                <div class="flex items-center justify-between gap-1 flex-wrap">
                  <span class="font-bold text-sm text-slate-950">${stop.name}</span>
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-800">
                    ${isPinned ? '📌 User-Pinned' : `Stop #${index + 1}`}
                  </span>
                </div>
                <div class="text-[10px] text-slate-600 truncate mt-0.5">${stop.address}</div>
                <div class="text-[10px] text-slate-500 mt-0.5">${stop.powerKw} kW · ${stop.stallsTotal} stalls · ${stop.network}</div>
              </div>

              <div class="p-2 rounded-lg bg-slate-50 border border-slate-200">
                ${queueSectionHtml}
              </div>

              <div class="text-[10px] text-amber-700 bg-amber-50/70 p-1.5 rounded border border-amber-200">
                Charging Session: ${stop.arrivalSoc}% → ${stop.departureSoc}% (${stop.chargeDurationMinutes} min)
              </div>

              <div class="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-200">
                <button id="stop-btn-queue-${stop.id}" class="px-2 py-1.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-colors">
                  <span>💬 Report current queue</span>
                </button>
                <button id="stop-btn-details-${stop.id}" class="px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold flex items-center justify-center transition-colors">
                  <span>Full Details</span>
                </button>
              </div>
            </div>
          `)
          .openOn(map);

        setTimeout(() => {
          document.getElementById(`stop-btn-queue-${stop.id}`)?.addEventListener('click', () => {
            map.closePopup();
            setQueueReportStation({
              id: stop.stationId || stop.id,
              name: stop.name,
              coordinates: stop.coordinates
            });
          });

          document.getElementById(`stop-btn-details-${stop.id}`)?.addEventListener('click', () => {
            map.closePopup();
            setSelectedStop(stop);
            setIsStationDetailsOpen(true);
          });
        }, 10);
      });

      marker.on('mouseover', () => {
        setHoveredStopId(stop.id);
      });

      marker.on('mouseout', () => {
        setHoveredStopId(null);
      });

      marker.bindTooltip(
        `<div class="font-sans text-xs">
          <div class="font-bold text-white mb-0.5">${stop.name} (${isPinned ? '📌 User-Pinned' : `#${index + 1}`})</div>
          <div class="text-slate-300">${stop.powerKw} kW · ${stop.stallsTotal} stalls</div>
          ${!stop.isFeasible ? '<div class="text-rose-400 font-bold mt-0.5">⚠️ Infeasible: Arrival SoC below minimum reserve!</div>' : ''}
          <div class="text-amber-400 mt-0.5 font-medium">Session: ${stop.arrivalSoc}% → ${stop.departureSoc}% (${stop.chargeDurationMinutes} min)</div>
          <div class="mt-1 pt-1 border-t border-slate-700 flex items-center justify-between text-[10px]">
            <span class="text-slate-300">Live Queue (${qBadge.connectorType}):</span>
            <span class="px-1.5 py-0.2 rounded text-[9px] font-bold ${qBadge.badgeClass}">${qBadge.label}</span>
          </div>
          <div class="text-slate-400 text-[10px] mt-0.5">Click for station details & controls</div>
        </div>`,
        { direction: 'top', offset: [0, -18] }
      );

      marker.addTo(markersLayerRef.current!);
    });

    return () => {
      clearTimeout(fitTimer);
    };
  }, [
    activeRoute,
    trip,
    selectedRouteId,
    setSelectedRouteId,
    selectedStop,
    hoveredStopId,
    isPanelCollapsed,
    setSelectedStop,
    setIsStationDetailsOpen,
    setHoveredStopId,
    stationQueueMap,
    vehicle
  ]);

  // Phase 6G.1: Batch fetch queue data for all stops and intermediate chargers in active route
  useEffect(() => {
    const stopIds = (activeRoute.stops || [])
      .map((s) => s.stationId || s.id)
      .filter((id): id is string => Boolean(id));

    const wpIds = (trip.waypoints || [])
      .map((w) => w.stationId)
      .filter((id): id is string => Boolean(id));

    const allIds = Array.from(new Set([...stopIds, ...wpIds]));
    if (allIds.length === 0) return;

    getBatchStationQueueData(allIds).then((batchMap: Record<string, StationQueueData>) => {
      setStationQueueMap((prev) => ({ ...prev, ...batchMap }));
    });
  }, [activeRoute.stops, trip.waypoints]);

  // Live queue update event listener across portal and driver view
  useEffect(() => {
    const handleQueueUpdated = (e: any) => {
      if (e?.detail?.simulationChanged) {
        if (!simulatedQueueService.isSimulationEnabled()) {
          setStationQueueMap((prev) => {
            const next: Record<string, StationQueueData> = {};
            for (const [k, v] of Object.entries(prev)) {
              if (v.primaryDataSource !== 'simulated_queue') {
                next[k] = v;
              }
            }
            return next;
          });
          return;
        }
      }
      const updatedId = e?.detail?.stationId;
      const stopIds = (activeRoute.stops || [])
        .map((s) => s.stationId || s.id)
        .filter((id): id is string => Boolean(id));
      const wpIds = (trip.waypoints || [])
        .map((w) => w.stationId)
        .filter((id): id is string => Boolean(id));
      const allIds = Array.from(new Set([...stopIds, ...wpIds, ...(updatedId ? [updatedId] : [])]));
      if (allIds.length === 0) return;
      getBatchStationQueueData(allIds).then((batchMap: Record<string, StationQueueData>) => {
        setStationQueueMap((prev) => ({ ...prev, ...batchMap }));
      });
    };
    window.addEventListener('evsure:queue-updated', handleQueueUpdated);
    return () => window.removeEventListener('evsure:queue-updated', handleQueueUpdated);
  }, [activeRoute.stops, trip.waypoints]);

  // Synchronize Live Traffic Layer & Incidents
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (trafficLayerRef.current) {
      map.removeLayer(trafficLayerRef.current);
      trafficLayerRef.current = null;
    }
    if (incidentsLayerRef.current) {
      incidentsLayerRef.current.clearLayers();
    }
    if (trafficSegmentsLayerRef.current) {
      trafficSegmentsLayerRef.current.clearLayers();
    }

    if (!isTrafficEnabled) return;

    // 1. Add TomTom Traffic Flow tile layer if key available
    const tileUrl = defaultTrafficProvider.getTrafficTileUrlTemplate();
    if (tileUrl) {
      const trafficTileLayer = L.tileLayer(tileUrl, {
        opacity: 0.75,
        maxZoom: 18,
        zIndex: 15,
        pane: 'traffic-pane'
      });
      trafficTileLayer.addTo(map);
      trafficLayerRef.current = trafficTileLayer;
    }

    // 2. Query incidents if key configured
    if (activeRoute.polylineCoordinates && activeRoute.polylineCoordinates.length > 0 && defaultTrafficProvider.hasCredentials()) {
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      for (const c of activeRoute.polylineCoordinates) {
        if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
        if (c[0] < minLat) minLat = c[0];
        if (c[0] > maxLat) maxLat = c[0];
        if (c[1] < minLng) minLng = c[1];
        if (c[1] > maxLng) maxLng = c[1];
      }
      minLat -= 0.25;
      maxLat += 0.25;
      minLng -= 0.25;
      maxLng += 0.25;

      defaultTrafficProvider.getTrafficIncidents([minLat, minLng, maxLat, maxLng]).then((incidents) => {
        if (!incidentsLayerRef.current || !isTrafficEnabled) return;
        incidentsLayerRef.current.clearLayers();
        for (const inc of incidents) {
          const incIcon = L.divIcon({
            className: 'custom-traffic-incident-marker',
            html: `
              <div class="w-6 h-6 rounded-full bg-rose-600 text-white shadow-lg border border-white flex items-center justify-center text-xs font-bold ring-2 ring-rose-400/40">
                ⚠️
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          L.marker(inc.coordinates, { icon: incIcon })
            .bindTooltip(
              `<div class="font-sans text-xs"><strong>⚠️ ${inc.category.toUpperCase()}: ${inc.description}</strong>${
                inc.delaySeconds ? `<br/><span class="text-rose-400 font-semibold">+${Math.round(inc.delaySeconds / 60)} min delay</span>` : ''
              }</div>`,
              { direction: 'top', offset: [0, -12] }
            )
            .addTo(incidentsLayerRef.current);
        }
      });
    }

    // 3. Phase 6E: Fetch and Render Live Road Traffic Directly on Selected Road
    const fallbackCoords: [number, number][] = [
      trip.origin?.coordinates,
      ...((trip.waypoints || []).map((w) => w.coordinates)),
      trip.destination?.coordinates
    ].filter(
      (c): c is [number, number] =>
        Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
    );

    const coords = (activeRoute.polylineCoordinates && activeRoute.polylineCoordinates.length >= 2)
      ? activeRoute.polylineCoordinates
      : fallbackCoords;

    const validCoords = coords.filter(
      (pt: any): pt is [number, number] =>
        Array.isArray(pt) && pt.length === 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
    );

    let abortTraffic: AbortController | null = null;

    if (validCoords.length >= 2 && trafficSegmentsLayerRef.current) {
      abortTraffic = new AbortController();

      fetchRouteTrafficSegments(validCoords, abortTraffic.signal)
        .then((trafficData) => {
          if (!trafficSegmentsLayerRef.current) return;
          trafficSegmentsLayerRef.current.clearLayers();
          setLiveTrafficStatus(trafficData.status);

          if (trafficData.segments && trafficData.segments.length > 0) {
            for (const seg of trafficData.segments) {
              let color = '#22c55e'; // Green: free flowing (relative_speed >= 0.90)
              let badgeClass = 'bg-emerald-100 text-emerald-800';
              let conditionText = 'Free Flow';

              if (seg.roadClosed || seg.congestionLevel === 'blocked') {
                color = '#991b1b'; // Dark crimson: road closed / blocked
                badgeClass = 'bg-rose-950 text-rose-200 border border-rose-500';
                conditionText = 'Road Closed';
              } else if (seg.congestionLevel === 'heavy') {
                color = '#ef4444'; // Red: severe congestion (ratio < 0.50)
                badgeClass = 'bg-rose-100 text-rose-800';
                conditionText = 'Severe Congestion';
              } else if (seg.congestionLevel === 'moderate') {
                color = '#f59e0b'; // Amber / Orange: heavy traffic (0.50 <= ratio < 0.75)
                badgeClass = 'bg-amber-100 text-amber-800';
                conditionText = 'Heavy Traffic';
              } else if (seg.congestionLevel === 'minor') {
                color = '#84cc16'; // Light green / lime: minor slowdown (0.75 <= ratio < 0.90)
                badgeClass = 'bg-lime-100 text-lime-800';
                conditionText = 'Moderate Traffic';
              } else if (seg.congestionLevel === 'unknown') {
                color = '#94a3b8'; // Neutral grey: traffic unknown / no coverage
                badgeClass = 'bg-slate-100 text-slate-700';
                conditionText = 'Traffic Unknown';
              }

              const segLine = L.polyline(seg.coordinates, {
                color,
                weight: 6,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
                pane: 'traffic-route-pane',
                className: 'cursor-pointer hover:opacity-100'
              });

              // Click popup
              const ratioPercent = typeof seg.speedRatio === 'number' ? Math.round(seg.speedRatio * 100) : null;
              const delayMin = typeof seg.delaySeconds === 'number' ? Math.round(seg.delaySeconds / 60) : 0;
              const updatedTime = seg.lastUpdated ? new Date(seg.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live';

              const popupHtml = `
                <div class="p-2.5 font-sans text-xs text-slate-900 min-w-[210px] space-y-1.5">
                  <div class="flex items-center justify-between">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}">${conditionText}</span>
                    ${ratioPercent !== null ? `<span class="text-[10px] text-slate-500 font-mono font-bold">${ratioPercent}% flow</span>` : ''}
                  </div>
                  <div class="font-bold text-slate-800 text-xs">${seg.roadName || 'Selected Road Corridor'}</div>
                  <div class="grid grid-cols-2 gap-1.5 text-[11px] pt-1.5 border-t border-slate-200">
                    <div>
                      <span class="text-slate-500 text-[10px]">Current:</span>
                      <div class="font-bold text-slate-900">
                        ${typeof seg.currentSpeedMph === 'number' ? `${seg.currentSpeedMph} mph` : 'N/A'}
                        ${typeof seg.currentSpeedKph === 'number' ? `<span class="text-[10px] text-slate-500 font-normal"> (${seg.currentSpeedKph} km/h)</span>` : ''}
                      </div>
                    </div>
                    <div>
                      <span class="text-slate-500 text-[10px]">Free-Flow:</span>
                      <div class="font-bold text-slate-900">
                        ${typeof seg.freeFlowSpeedMph === 'number' ? `${seg.freeFlowSpeedMph} mph` : 'N/A'}
                        ${typeof seg.freeFlowSpeedKph === 'number' ? `<span class="text-[10px] text-slate-500 font-normal"> (${seg.freeFlowSpeedKph} km/h)</span>` : ''}
                      </div>
                    </div>
                  </div>
                  ${delayMin > 0 ? `<div class="text-[10px] text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">Estimated Delay: +${delayMin} min</div>` : ''}
                  ${seg.roadClosed ? `<div class="text-[10px] text-rose-800 font-bold bg-rose-50 px-1.5 py-0.5 rounded">⛔ Road Closure Reported</div>` : ''}
                  <div class="text-[9px] text-slate-400 pt-1 border-t border-slate-100 flex items-center justify-between">
                    <span>${seg.provider || 'TomTom Live Traffic Flow'}</span>
                    <span>${updatedTime}</span>
                  </div>
                </div>
              `;

              segLine.bindPopup(popupHtml, { maxWidth: 260 });
              segLine.bindTooltip(`
                <div class="p-1 font-sans text-xs">
                  <span class="font-bold">${conditionText}</span>
                  ${ratioPercent !== null ? ` • ${ratioPercent}% flow` : ''}
                  ${typeof seg.currentSpeedMph === 'number' ? ` (${seg.currentSpeedMph} mph)` : ''}
                  <div class="text-[10px] text-cyan-600 font-semibold mt-0.5">Click for road speeds & delay</div>
                </div>
              `, { sticky: true });

              segLine.on('click', (e) => {
                if (e.originalEvent) {
                  L.DomEvent.stopPropagation(e.originalEvent);
                }
              });

              trafficSegmentsLayerRef.current.addLayer(segLine);
            }
          }
        })
        .catch(() => {
          setLiveTrafficStatus('unavailable');
        });
    }

    return () => {
      if (abortTraffic) {
        abortTraffic.abort();
      }
    };
  }, [isTrafficEnabled, activeRoute]);

  // Synchronize Live GPS Marker & Reported Accuracy Radius (Phase 6F)
  // Reuses single marker and circle instances to avoid garbage collection and render flicker
  useEffect(() => {
    const map = mapInstanceRef.current;
    const gpsLayer = gpsLayerRef.current;
    if (!map || !gpsLayer) return;

    const pos = gpsState.currentPosition;
    if (!pos) {
      if (gpsMarkerRef.current) {
        gpsLayer.removeLayer(gpsMarkerRef.current);
        gpsMarkerRef.current = null;
      }
      if (gpsAccuracyCircleRef.current) {
        gpsLayer.removeLayer(gpsAccuracyCircleRef.current);
        gpsAccuracyCircleRef.current = null;
      }
      return;
    }

    const latLng: [number, number] = [pos.latitude, pos.longitude];
    const hasReliableHeading =
      typeof pos.heading === 'number' &&
      !isNaN(pos.heading) &&
      typeof pos.speed === 'number' &&
      !isNaN(pos.speed) &&
      pos.speed > 0.5;

    // 1. Accuracy Circle (honest reported accuracy, reused instance)
    const accuracyRadiusMeters = Math.max(5, pos.accuracy);
    if (gpsAccuracyCircleRef.current) {
      gpsAccuracyCircleRef.current.setLatLng(latLng);
      gpsAccuracyCircleRef.current.setRadius(accuracyRadiusMeters);
    } else {
      const circle = L.circle(latLng, {
        radius: accuracyRadiusMeters,
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: '4, 4',
        pane: 'gps-pane'
      });
      circle.addTo(gpsLayer);
      gpsAccuracyCircleRef.current = circle;
    }

    // 2. Blue Circular Marker with pulsing beacon and optional heading beam
    const markerHtml = `
      <div class="relative flex items-center justify-center pointer-events-auto" style="width: 32px; height: 32px;">
        <!-- Pulsing beacon ring -->
        <span class="absolute w-8 h-8 rounded-full bg-blue-500/30 animate-ping"></span>
        <!-- Outer border ring -->
        <div class="relative w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center">
          <!-- Core dot -->
          <div class="w-2 h-2 rounded-full bg-white"></div>
        </div>
        ${
          hasReliableHeading
            ? `<!-- Direction beam cone -->
               <div class="absolute -top-3 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-blue-600 pointer-events-none"
                    style="transform-origin: 50% 22px; transform: rotate(${pos.heading}deg);"></div>`
            : ''
        }
      </div>
    `;

    const gpsIcon = L.divIcon({
      className: 'live-gps-user-marker',
      html: markerHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    if (gpsMarkerRef.current) {
      gpsMarkerRef.current.setLatLng(latLng);
      gpsMarkerRef.current.setIcon(gpsIcon);
    } else {
      const marker = L.marker(latLng, {
        icon: gpsIcon,
        pane: 'gps-pane',
        zIndexOffset: 1000
      });

      marker.bindTooltip(
        `<div class="p-1 font-sans text-xs">
          <div class="font-bold text-blue-700 flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
            <span>Current Device Location</span>
          </div>
          <div class="text-[10px] text-slate-600 mt-0.5">Reported Accuracy: ±${pos.accuracy}m</div>
          ${typeof pos.speed === 'number' && !isNaN(pos.speed) ? `<div class="text-[10px] text-slate-600">Speed: ${(pos.speed * 2.23694).toFixed(1)} mph (${(pos.speed * 3.6).toFixed(1)} km/h)</div>` : ''}
          ${hasReliableHeading ? `<div class="text-[10px] text-slate-500">Heading: ${Math.round(pos.heading!)}°</div>` : ''}
        </div>`,
        { direction: 'top', offset: [0, -14] }
      );

      marker.addTo(gpsLayer);
      gpsMarkerRef.current = marker;
    }

    // 3. Follow Me Auto-pan (Smooth pan without interrupting manual zoom)
    if (gpsState.isFollowMe) {
      map.panTo(latLng, { animate: true, duration: 0.5 });
    }
  }, [gpsState.currentPosition, gpsState.isFollowMe]);

  // Map Controls (Feature A: Complete robust zoom handling without resetting or bubbling)
  const handleZoomIn = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const map = mapInstanceRef.current;
    if (map) {
      map.zoomIn(1);
    }
  };

  const handleZoomOut = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const map = mapInstanceRef.current;
    if (map) {
      map.zoomOut(1);
    }
  };

  const handleResetBounds = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const map = mapInstanceRef.current;
    if (!map || !activeRoute.polylineCoordinates.length) return;
    const mapWidth = map.getSize().x || 1000;
    const leftPad = isPanelCollapsed ? 50 : Math.min(420, Math.max(50, Math.round(mapWidth * 0.35)));
    map.fitBounds(L.latLngBounds(activeRoute.polylineCoordinates), {
      paddingTopLeft: [leftPad, 50],
      paddingBottomRight: [50, 50],
      maxZoom: 15
    });
  };

  return (
    <div className="relative w-full h-full bg-surface-canvas overflow-hidden select-none">
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Loading & Error States */}
      {isLoadingTiles && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-surface-panel border border-edge-default text-content-secondary text-xs px-3.5 py-1.5 rounded-full shadow-card flex items-center gap-2 pointer-events-none">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-primary" />
          <span>Loading geographic map tiles...</span>
        </div>
      )}

      {tileErrorCount > 3 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-status-dangerSubtle border border-status-danger text-status-danger text-xs px-4 py-2 rounded-xl shadow-dropdown flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-status-danger shrink-0" />
          <span>
            Tile network warning: Some tiles failed to download. Switching layers may help.
          </span>
          <button
            type="button"
            onClick={() => switchTileLayer('osm-light')}
            className="underline font-bold ml-1 text-content-primary"
          >
            Switch to Light OSM
          </button>
        </div>
      )}

      {/* Bottom Center Demonstration / Dynamic Route Status Badge */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-surface-panel border border-edge-default text-content-secondary text-[11px] px-3.5 py-1.5 rounded-full shadow-card flex items-center gap-2 pointer-events-auto">
        <span className={`w-2 h-2 rounded-full ${activeRoute.isFeasible ? 'bg-status-success animate-pulse' : 'bg-status-danger'}`}></span>
        <span>
          {activeRoute.id.startsWith('default-')
            ? `Reference Route · ${trip.origin.name} → ${trip.destination.name} · ${vehicle.name}`
            : `Dynamic Route · ${trip.origin.name} → ${trip.destination.name} · ${vehicle.name}`}
        </span>
      </div>

      {/* Bottom-right Map Controls */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2 pointer-events-auto">
        {/* Phase 6F: Live GPS Controls & Progress HUD */}
        <GpsControlPanel />

        <div
          className="flex flex-col bg-surface-panel border border-edge-default rounded-xl shadow-dropdown overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-testid="map-zoom-in"
            onClick={handleZoomIn}
            onMouseDown={(e) => e.stopPropagation()}
            title="Zoom In"
            aria-label="Zoom in"
            className="p-2.5 text-content-primary hover:bg-surface-hover transition-colors border-b border-edge-subtle"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-testid="map-zoom-out"
            onClick={handleZoomOut}
            onMouseDown={(e) => e.stopPropagation()}
            title="Zoom Out"
            aria-label="Zoom out"
            className="p-2.5 text-content-primary hover:bg-surface-hover transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          data-testid="map-recenter"
          onClick={handleResetBounds}
          onMouseDown={(e) => e.stopPropagation()}
          title="Recenter and Frame Route"
          aria-label="Recenter Route"
          className="p-2.5 bg-surface-panel border border-edge-default text-content-primary hover:bg-surface-hover rounded-xl shadow-dropdown transition-colors"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {/* Layer Selector Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsLayersMenuOpen(!isLayersMenuOpen)}
            title="Map Layer Styles"
            aria-label="Toggle map layer style"
            className={`p-2.5 rounded-xl border shadow-dropdown transition-colors ${
              isLayersMenuOpen
                ? 'bg-brand-primary text-brand-contrast border-brand-primary'
                : 'bg-surface-panel border-edge-default text-content-primary hover:bg-surface-hover'
            }`}
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* Layer Selector Dropdown */}
          {isLayersMenuOpen && (
            <div className="absolute bottom-0 right-12 w-64 bg-surface-panel border border-edge-default rounded-xl shadow-dropdown p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2.5 py-1 text-[11px] font-bold text-content-muted uppercase tracking-wider border-b border-edge-subtle mb-1">
                Map Basemap Provider
              </div>
              {(Object.keys(TILE_PROVIDERS) as MapTileProvider[]).map((pid) => {
                const prov = TILE_PROVIDERS[pid];
                const isSelected = activeProvider === pid;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => {
                      switchTileLayer(pid);
                      setIsLayersMenuOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-lg text-left text-xs flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-surface-subtle text-content-primary font-bold border border-edge-default'
                        : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
                    }`}
                  >
                    <span>{prov.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-brand-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Traffic Toggle Button */}
        <button
          type="button"
          onClick={() => {
            setIsTrafficEnabled(!isTrafficEnabled);
            showToast(isTrafficEnabled ? 'Live traffic layer hidden.' : 'Live traffic layer enabled.');
          }}
          title={isTrafficEnabled ? 'Hide Live Traffic Layer' : 'Show Live Traffic Layer'}
          aria-label="Toggle Live Traffic Layer"
          className={`p-2.5 rounded-xl border shadow-dropdown transition-colors ${
            isTrafficEnabled
              ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
              : 'bg-surface-panel border-edge-default text-content-primary hover:bg-surface-hover'
          }`}
        >
          <TrafficCone className="w-4 h-4" />
        </button>

        {/* National Charging Stations Layer Toggle Button */}
        <button
          type="button"
          onClick={() => {
            setIsStationsLayerEnabled(!isStationsLayerEnabled);
            showToast(isStationsLayerEnabled ? 'National charging stations hidden.' : 'National charging stations layer enabled (28.3k).');
          }}
          title={isStationsLayerEnabled ? 'Hide National Charging Stations (28.3k)' : 'Show National Charging Stations (28.3k)'}
          aria-label="Toggle National Charging Stations"
          className={`p-2.5 rounded-xl border shadow-dropdown transition-colors ${
            isStationsLayerEnabled
              ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm'
              : 'bg-surface-panel border-edge-default text-content-primary hover:bg-surface-hover'
          }`}
        >
          <Zap className="w-4 h-4 fill-current" />
        </button>
      </div>

      {/* Floating Traffic Legend */}
      {isTrafficEnabled && (
        <div className="absolute top-4 right-4 z-20 bg-surface-panel border border-edge-default rounded-xl shadow-dropdown p-2.5 text-xs pointer-events-auto space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-content-primary pb-1 border-b border-edge-subtle">
            <span className="flex items-center gap-1.5">
              <TrafficCone className="w-3.5 h-3.5 text-status-warning" />
              <span>Traffic Conditions</span>
            </span>
            {(liveTrafficStatus === 'live' || activeRoute.trafficSummary?.status === 'live') ? (
              <span className="flex items-center gap-1 text-[9px] text-status-success font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
                <span>Live Flow Active</span>
              </span>
            ) : (liveTrafficStatus === 'stale' || activeRoute.trafficSummary?.status === 'stale') ? (
              <span className="flex items-center gap-1 text-[9px] text-amber-400 font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Stale Data</span>
              </span>
            ) : (liveTrafficStatus === 'unavailable' && activeRoute.trafficSummary?.status === 'unavailable') ? (
              <span className="text-[9px] text-status-warning font-mono font-medium">
                Free-Flow
              </span>
            ) : (
              <span className="text-[9px] text-content-muted font-mono">
                Unconfigured
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-content-secondary pt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Flowing (≥90%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <span>Moderate (50-90%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <span>Congested (&lt;50%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-950 border border-rose-500 shrink-0" />
              <span>Road Closed</span>
            </div>
          </div>
          {liveTrafficStatus !== 'live' && activeRoute.trafficSummary?.status !== 'live' && (
            <p className="text-[9px] text-content-muted pt-1 border-t border-edge-subtle">
              Real-time traffic flow powered by TomTom Traffic API.
            </p>
          )}
        </div>
      )}

      {/* Phase 6G.1: Voluntary Community Queue Report Modal */}
      {queueReportStation && (
        <QueueReportModal
          isOpen={Boolean(queueReportStation)}
          onClose={() => setQueueReportStation(null)}
          station={queueReportStation}
          onReportSubmitted={() => {
            getBatchStationQueueData([queueReportStation.id]).then((batchMap: Record<string, StationQueueData>) => {
              setStationQueueMap((prev) => ({ ...prev, ...batchMap }));
            });
            showToast('Queue report submitted! Map marker badge updated.');
          }}
        />
      )}
    </div>
  );
};
