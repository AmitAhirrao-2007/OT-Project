import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePlanner } from '../../context/PlannerContext';
import { Crosshair, Plus, Minus, Layers } from 'lucide-react';

export const MapView: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polylineLayerRef = useRef<L.Polyline | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const {
    activeRoute,
    trip,
    selectedStop,
    setSelectedStop,
    setIsStationDetailsOpen,
    hoveredStopId,
    setHoveredStopId
  } = usePlanner();

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true
    }).setView([27.0, 81.0], 6);

    // CartoDB Dark Matter tiles (free for public use with attribution)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Route Polyline & Markers when activeRoute changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // 1. Update Polyline
    if (polylineLayerRef.current) {
      polylineLayerRef.current.remove();
    }

    const latLngs = activeRoute.polylineCoordinates;
    if (latLngs.length > 0) {
      // Glow background line
      const glowLine = L.polyline(latLngs, {
        color: '#00b0ff',
        weight: 8,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      // Core electric blue line
      const coreLine = L.polyline(latLngs, {
        color: '#38bdf8',
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      polylineLayerRef.current = L.featureGroup([glowLine, coreLine]).addTo(map) as unknown as L.Polyline;

      // Fit bounds with left panel padding
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, {
        paddingTopLeft: [440, 60],
        paddingBottomRight: [60, 60]
      });
    }

    // 2. Update Markers
    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers();

      // Origin Marker (Patna)
      const originIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer group">
            <div class="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[11px] font-bold shadow-lg shadow-emerald-500/30 flex items-center gap-1 border border-emerald-300">
              <span>●</span>
              <span>${trip.origin.name}</span>
              <span class="bg-emerald-950 text-emerald-300 px-1 rounded text-[9px]">${trip.origin.batterySoc}%</span>
            </div>
            <div class="w-2.5 h-2.5 bg-emerald-400 rotate-45 -mt-1 shadow-md"></div>
          </div>
        `,
        iconSize: [100, 36],
        iconAnchor: [50, 30]
      });

      L.marker(trip.origin.coordinates, { icon: originIcon })
        .bindTooltip(`Origin: ${trip.origin.name} (Depart: ${trip.origin.batterySoc}%)`, {
          direction: 'top',
          offset: [0, -20]
        })
        .addTo(markersLayerRef.current);

      // Destination Marker (Delhi)
      const destIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer group">
            <div class="px-2 py-0.5 rounded-full bg-[#00b0ff] text-slate-950 text-[11px] font-bold shadow-lg shadow-[#00b0ff]/30 flex items-center gap-1 border border-cyan-200">
              <span>🏁</span>
              <span>${trip.destination.name}</span>
              <span class="bg-cyan-950 text-cyan-300 px-1 rounded text-[9px]">${trip.destination.batterySoc}%</span>
            </div>
            <div class="w-2.5 h-2.5 bg-[#00b0ff] rotate-45 -mt-1 shadow-md"></div>
          </div>
        `,
        iconSize: [110, 36],
        iconAnchor: [55, 30]
      });

      L.marker(trip.destination.coordinates, { icon: destIcon })
        .bindTooltip(`Destination: ${trip.destination.name} (Arrival: ${trip.destination.batterySoc}%)`, {
          direction: 'top',
          offset: [0, -20]
        })
        .addTo(markersLayerRef.current);

      // Charging Stop Markers
      activeRoute.stops.forEach((stop, index) => {
        const isSelected = selectedStop?.id === stop.id;
        const isHovered = hoveredStopId === stop.id;

        const stopIcon = L.divIcon({
          className: 'custom-map-marker',
          html: `
            <div class="relative flex flex-col items-center cursor-pointer transition-transform duration-150 ${
              isSelected || isHovered ? 'scale-125 z-50' : 'hover:scale-110'
            }">
              <div class="px-2 py-0.5 rounded-full ${
                isSelected
                  ? 'bg-amber-400 text-slate-950 ring-2 ring-white ring-offset-2 ring-offset-slate-900 font-bold'
                  : 'bg-[#1e2834] text-slate-100 border border-[#3c4f64] shadow-lg'
              } text-[10px] flex items-center gap-1.5 backdrop-blur-sm">
                <span class="w-3.5 h-3.5 rounded-full ${
                  isSelected ? 'bg-slate-900 text-amber-400' : 'bg-cyan-500/20 text-[#00b0ff]'
                } flex items-center justify-center text-[9px] font-bold">
                  ⚡
                </span>
                <span class="font-semibold">${stop.arrivalSoc}%</span>
                <span class="text-slate-400 font-normal">#${index + 1}</span>
              </div>
              <div class="w-2 h-2 ${
                isSelected ? 'bg-amber-400' : 'bg-[#1e2834]'
              } rotate-45 -mt-1"></div>
            </div>
          `,
          iconSize: [80, 36],
          iconAnchor: [40, 28]
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
          `<div><strong>${stop.name}</strong><br/>${stop.powerKw} kW · ${stop.stallsTotal} stalls<br/>Charge: ${stop.arrivalSoc}% → ${stop.departureSoc}% (${stop.chargeDurationMinutes} min)</div>`,
          { direction: 'top', offset: [0, -18] }
        );

        marker.addTo(markersLayerRef.current!);
      });
    }
  }, [
    activeRoute,
    trip,
    selectedStop,
    hoveredStopId,
    setSelectedStop,
    setIsStationDetailsOpen,
    setHoveredStopId
  ]);

  // Map Controls Handlers
  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleResetBounds = () => {
    if (!mapInstanceRef.current || !activeRoute.polylineCoordinates.length) return;
    mapInstanceRef.current.fitBounds(L.latLngBounds(activeRoute.polylineCoordinates), {
      paddingTopLeft: [440, 60],
      paddingBottomRight: [60, 60]
    });
  };

  return (
    <div className="relative w-full h-full bg-[#12161a]">
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Demonstration Data Banner (Bottom Center) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-[#161f28]/90 backdrop-blur-md border border-[#2b3a4a] text-slate-300 text-[11px] px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-2 pointer-events-auto">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
        <span>
          Reference Demonstration Data (Patna → Delhi corridor, Tata Nexon EV test model)
        </span>
      </div>

      {/* Bottom-right Map Controls */}
      <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2 pointer-events-auto">
        <div className="flex flex-col bg-[#1a232f]/95 border border-[#2a3746] rounded-lg shadow-xl overflow-hidden backdrop-blur-md">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In"
            aria-label="Zoom in"
            className="p-2.5 text-slate-300 hover:text-white hover:bg-[#253242] transition-colors border-b border-[#2a3746]"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out"
            aria-label="Zoom out"
            className="p-2.5 text-slate-300 hover:text-white hover:bg-[#253242] transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleResetBounds}
          title="Recenter Route"
          aria-label="Recenter Route"
          className="p-2.5 bg-[#1a232f]/95 border border-[#2a3746] text-slate-300 hover:text-white hover:bg-[#253242] rounded-lg shadow-xl transition-colors backdrop-blur-md"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            alert('Map layers: Dark Matter (Active), Terrain, Satellite');
          }}
          title="Layers"
          aria-label="Toggle map layer"
          className="p-2.5 bg-[#1a232f]/95 border border-[#2a3746] text-slate-300 hover:text-white hover:bg-[#253242] rounded-lg shadow-xl transition-colors backdrop-blur-md"
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
