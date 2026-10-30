import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePlanner } from '../../context/PlannerContext';
import { Crosshair, Plus, Minus, Layers, AlertTriangle, Loader2, Check } from 'lucide-react';

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

  const [activeProvider, setActiveProvider] = useState<MapTileProvider>('osm-auto');
  const [isLayersMenuOpen, setIsLayersMenuOpen] = useState(false);
  const [isLoadingTiles, setIsLoadingTiles] = useState(true);
  const [tileErrorCount, setTileErrorCount] = useState(0);

  const {
    activeRoute,
    trip,
    vehicle,
    selectedStop,
    setSelectedStop,
    setIsStationDetailsOpen,
    hoveredStopId,
    setHoveredStopId,
    isPanelCollapsed,
    resolvedTheme
  } = usePlanner();

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

  // Initialize Map on Mount
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true
    }).setView([27.1, 81.2], 6);

    markersLayerRef.current = L.layerGroup().addTo(map);
    polylineLayerRef.current = L.featureGroup().addTo(map);
    mapInstanceRef.current = map;

    switchTileLayer('osm-auto');

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [switchTileLayer]);

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

    // 1. Update Polyline
    polylineLayerRef.current.clearLayers();

    const latLngs = activeRoute.polylineCoordinates;
    if (latLngs.length > 0) {
      // Background glow line
      const glowLine = L.polyline(latLngs, {
        color: '#00b0ff',
        weight: 9,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round'
      });

      // Core electric blue line
      const coreLine = L.polyline(latLngs, {
        color: '#38bdf8',
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      });

      polylineLayerRef.current.addLayer(glowLine);
      polylineLayerRef.current.addLayer(coreLine);

      // Frame route with padding based on panel state
      const bounds = L.latLngBounds(latLngs);
      const leftPad = isPanelCollapsed ? 60 : 520;
      map.fitBounds(bounds, {
        paddingTopLeft: [leftPad, 60],
        paddingBottomRight: [60, 60]
      });
    }

    // 2. Update Markers
    markersLayerRef.current.clearLayers();

    // Origin Marker (Patna)
    const originIcon = L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div class="relative flex flex-col items-center cursor-pointer group">
          <div class="px-2.5 py-1 rounded-full bg-emerald-500 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/40 flex items-center gap-1.5 border border-emerald-200">
            <span class="w-2 h-2 rounded-full bg-slate-950"></span>
            <span>${trip.origin.name}</span>
            <span class="bg-emerald-950 text-emerald-300 px-1 py-0.2 rounded text-[10px] font-mono">${trip.origin.batterySoc}%</span>
          </div>
          <div class="w-2.5 h-2.5 bg-emerald-400 rotate-45 -mt-1 shadow-md"></div>
        </div>
      `,
      iconSize: [110, 38],
      iconAnchor: [55, 32]
    });

    L.marker(trip.origin.coordinates, { icon: originIcon })
      .bindTooltip(
        `<div class="font-sans"><strong>Departure: ${trip.origin.name}</strong><br/>Time: ${trip.origin.departureTime || '12:31 AM'}<br/>Battery: ${trip.origin.batterySoc}% SoC</div>`,
        { direction: 'top', offset: [0, -22] }
      )
      .addTo(markersLayerRef.current);

    // Destination Marker (Delhi)
    const destIcon = L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div class="relative flex flex-col items-center cursor-pointer group">
          <div class="px-2.5 py-1 rounded-full bg-[#00b0ff] text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/40 flex items-center gap-1.5 border border-cyan-100">
            <span>🏁</span>
            <span>${trip.destination.name}</span>
            <span class="bg-cyan-950 text-cyan-300 px-1 py-0.2 rounded text-[10px] font-mono">${trip.destination.batterySoc}%</span>
          </div>
          <div class="w-2.5 h-2.5 bg-[#00b0ff] rotate-45 -mt-1 shadow-md"></div>
        </div>
      `,
      iconSize: [120, 38],
      iconAnchor: [60, 32]
    });

    L.marker(trip.destination.coordinates, { icon: destIcon })
      .bindTooltip(
        `<div class="font-sans"><strong>Arrival: ${trip.destination.name}</strong><br/>Estimated Arrival: ${trip.destination.arrivalTime || '3:12 PM'}<br/>Reserve Battery: ${trip.destination.batterySoc}% SoC</div>`,
        { direction: 'top', offset: [0, -22] }
      )
      .addTo(markersLayerRef.current);

    // Intermediate Waypoints Markers
    trip.waypoints.forEach((wp, wIdx) => {
      const wpIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer group">
            <div class="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/40 flex items-center gap-1 border border-amber-200">
              <span class="w-1.5 h-1.5 rounded-full bg-slate-950"></span>
              <span>${wp.name}</span>
              <span class="bg-amber-950 text-amber-200 px-1 rounded text-[9px] font-mono">W${wIdx + 1}</span>
            </div>
            <div class="w-2 h-2 bg-amber-400 rotate-45 -mt-1 shadow-md"></div>
          </div>
        `,
        iconSize: [110, 34],
        iconAnchor: [55, 28]
      });

      L.marker(wp.coordinates, { icon: wpIcon })
        .bindTooltip(
          `<div class="font-sans text-xs"><strong>Waypoint #${wIdx + 1}: ${wp.name}</strong><br/><span class="text-slate-300">${wp.subTitle || 'Intermediate stop'}</span></div>`,
          { direction: 'top', offset: [0, -18] }
        )
        .addTo(markersLayerRef.current!);
    });

    // Charging Stop Markers
    activeRoute.stops.forEach((stop, index) => {
      const isSelected = selectedStop?.id === stop.id;
      const isHovered = hoveredStopId === stop.id;

      const stopIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer transition-transform duration-200 ${
            isSelected ? 'scale-125 z-50' : isHovered ? 'scale-115 z-40' : 'hover:scale-110'
          }">
            <div class="px-2.5 py-0.5 rounded-full ${
              !stop.isFeasible
                ? 'bg-rose-600 text-white font-bold ring-2 ring-rose-400 shadow-xl'
                : isSelected
                ? 'bg-amber-400 text-slate-950 ring-2 ring-white font-bold shadow-xl shadow-amber-500/40'
                : isHovered
                ? 'bg-[#2b3a4a] text-white border-2 border-[#00b0ff] shadow-lg'
                : 'bg-[#182330] text-slate-200 border border-[#3b4d63] shadow-md'
            } text-[11px] flex items-center gap-1.5 backdrop-blur-md">
              <span class="w-3.5 h-3.5 rounded-full ${
                !stop.isFeasible
                  ? 'bg-white text-rose-700'
                  : isSelected
                  ? 'bg-slate-950 text-amber-400'
                  : 'bg-cyan-500/20 text-[#00b0ff]'
              } flex items-center justify-center text-[9px] font-black">
                ${!stop.isFeasible ? '!' : '⚡'}
              </span>
              <span class="font-bold">${stop.arrivalSoc}%</span>
              <span class="text-[10px] ${isSelected ? 'text-slate-800' : 'text-slate-400'}">#${index + 1}</span>
            </div>
            <div class="w-2 h-2 ${
              !stop.isFeasible ? 'bg-rose-600' : isSelected ? 'bg-amber-400' : isHovered ? 'bg-[#00b0ff]' : 'bg-[#182330]'
            } rotate-45 -mt-1"></div>
          </div>
        `,
        iconSize: [85, 36],
        iconAnchor: [42, 28]
      });

      const marker = L.marker(stop.coordinates, { icon: stopIcon });

      marker.on('click', () => {
        setSelectedStop(stop);
        setIsStationDetailsOpen(true);
      });

      marker.on('mouseover', () => {
        setHoveredStopId(stop.id);
      });

      marker.on('mouseout', () => {
        setHoveredStopId(null);
      });

      marker.bindTooltip(
        `<div class="font-sans text-xs">
          <div class="font-bold text-white mb-0.5">${stop.name} (#${index + 1})</div>
          <div class="text-slate-300">${stop.powerKw} kW · ${stop.stallsTotal} stalls</div>
          ${!stop.isFeasible ? '<div class="text-rose-400 font-bold mt-0.5">⚠️ Infeasible: Arrival SoC below minimum reserve!</div>' : ''}
          <div class="text-amber-400 mt-0.5 font-medium">Session: ${stop.arrivalSoc}% → ${stop.departureSoc}% (${stop.chargeDurationMinutes} min)</div>
          <div class="text-slate-400 text-[10px] mt-0.5">Click for station details & controls</div>
        </div>`,
        { direction: 'top', offset: [0, -18] }
      );

      marker.addTo(markersLayerRef.current!);
    });
  }, [
    activeRoute,
    trip,
    selectedStop,
    hoveredStopId,
    isPanelCollapsed,
    setSelectedStop,
    setIsStationDetailsOpen,
    setHoveredStopId
  ]);

  // Map Controls
  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleResetBounds = () => {
    if (!mapInstanceRef.current || !activeRoute.polylineCoordinates.length) return;
    const leftPad = isPanelCollapsed ? 60 : 520;
    mapInstanceRef.current.fitBounds(L.latLngBounds(activeRoute.polylineCoordinates), {
      paddingTopLeft: [leftPad, 60],
      paddingBottomRight: [60, 60]
    });
  };

  return (
    <div className="relative w-full h-full bg-surface-canvas overflow-hidden select-none">
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Loading & Error States */}
      {isLoadingTiles && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-surface-panel/90 backdrop-blur-md border border-edge-default text-content-secondary text-xs px-3.5 py-1.5 rounded-full shadow-card flex items-center gap-2 pointer-events-none">
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
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-surface-panel/95 backdrop-blur-md border border-edge-default text-content-secondary text-[11px] px-3.5 py-1.5 rounded-full shadow-card flex items-center gap-2 pointer-events-auto">
        <span className={`w-2 h-2 rounded-full ${activeRoute.isFeasible ? 'bg-status-success animate-pulse' : 'bg-status-danger'}`}></span>
        <span>
          {activeRoute.id.startsWith('default-')
            ? `Reference Route · ${trip.origin.name} → ${trip.destination.name} · ${vehicle.name}`
            : `Dynamic Route · ${trip.origin.name} → ${trip.destination.name} · ${vehicle.name}`}
        </span>
      </div>

      {/* Bottom-right Map Controls */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2 pointer-events-auto">
        <div className="flex flex-col bg-surface-panel border border-edge-default rounded-xl shadow-dropdown overflow-hidden backdrop-blur-md">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In"
            aria-label="Zoom in"
            className="p-2.5 text-content-primary hover:bg-surface-hover transition-colors border-b border-edge-subtle"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out"
            aria-label="Zoom out"
            className="p-2.5 text-content-primary hover:bg-surface-hover transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleResetBounds}
          title="Recenter and Frame Route"
          aria-label="Recenter Route"
          className="p-2.5 bg-surface-panel border border-edge-default text-content-primary hover:bg-surface-hover rounded-xl shadow-dropdown transition-colors backdrop-blur-md"
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
            className={`p-2.5 rounded-xl border shadow-dropdown transition-colors backdrop-blur-md ${
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
      </div>
    </div>
  );
};
