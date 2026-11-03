import { describe, it, expect } from 'vitest';
import {
  geoJsonCoordinatesToLeafletLatLng,
  leafletLatLngToGeoJsonCoordinates,
  validateRoadGeometry,
  mergeRouteLegGeometries
} from '../utils/geoUtils';
import { calculateTripRoutes } from '../services/routingService';
import { initialVehicleProfile } from '../data/demoVehicle';
import {
  initialPlanOptions,
  initialChargingSettings,
  initialRoutingSettings
} from '../data/demoSettings';
import { demoTrip } from '../data/demoRoute';

describe('Road Geometry & Map Visibility Suite (Phase 6C.2)', () => {
  describe('1. GeoJSON to Leaflet Coordinate Transformations', () => {
    it('converts GeoJSON [lon, lat] pairs to Leaflet [lat, lon] pairs', () => {
      // Karol Bagh: lat 28.65, lon 77.19
      // GeoJSON: [77.19, 28.65]
      const geoJsonPoints: [number, number][] = [
        [77.19, 28.65],
        [77.41, 23.25] // Bhopal: lat 23.25, lon 77.41 -> [77.41, 23.25]
      ];

      const leafletPoints = geoJsonCoordinatesToLeafletLatLng(geoJsonPoints);
      expect(leafletPoints).toHaveLength(2);
      expect(leafletPoints[0]).toEqual([28.65, 77.19]);
      expect(leafletPoints[1]).toEqual([23.25, 77.41]);
    });

    it('inverts Leaflet [lat, lon] back to GeoJSON [lon, lat] correctly', () => {
      const leafletPoints: [number, number][] = [
        [28.65, 77.19],
        [23.25, 77.41]
      ];

      const geoJsonPoints = leafletLatLngToGeoJsonCoordinates(leafletPoints);
      expect(geoJsonPoints[0]).toEqual([77.19, 28.65]);
      expect(geoJsonPoints[1]).toEqual([77.41, 23.25]);
    });

    it('handles empty coordinate lists safely', () => {
      expect(geoJsonCoordinatesToLeafletLatLng([])).toEqual([]);
      expect(leafletLatLngToGeoJsonCoordinates([])).toEqual([]);
    });
  });

  describe('2. Road Geometry Validation', () => {
    it('validates genuine route polylines', () => {
      const validPolyline: [number, number][] = [
        [28.6517, 77.1907], // Karol Bagh, Delhi
        [27.1767, 78.0081], // Agra
        [26.2183, 78.1828], // Gwalior
        [23.2599, 77.4126]  // Bhopal
      ];

      expect(validateRoadGeometry(validPolyline)).toBe(true);
    });

    it('rejects empty or single point polylines', () => {
      expect(validateRoadGeometry([])).toBe(false);
      expect(validateRoadGeometry([[28.6517, 77.1907]])).toBe(false);
    });

    it('rejects coordinates with NaN or infinite values', () => {
      expect(validateRoadGeometry([[NaN, 77.19], [23.25, 77.41]])).toBe(false);
      expect(validateRoadGeometry([[28.65, Infinity], [23.25, 77.41]])).toBe(false);
    });

    it('rejects coordinates out of valid latitude (-90 to 90) range', () => {
      // Inverted latitude (e.g. lon 120 passed as lat)
      expect(validateRoadGeometry([[120.0, 77.19], [23.25, 77.41]])).toBe(false);
    });
  });

  describe('3. Leg Geometry Merging', () => {
    it('deduplicates connecting endpoint coordinates between successive legs', () => {
      const leg1: [number, number][] = [
        [28.65, 77.19],
        [27.17, 78.00]
      ];
      const leg2: [number, number][] = [
        [27.17, 78.00], // Duplicate connecting point
        [23.25, 77.41]
      ];

      const merged = mergeRouteLegGeometries([leg1, leg2]);
      expect(merged).toHaveLength(3);
      expect(merged[0]).toEqual([28.65, 77.19]);
      expect(merged[1]).toEqual([27.17, 78.00]);
      expect(merged[2]).toEqual([23.25, 77.41]);
    });

    it('handles single leg or empty arrays gracefully', () => {
      const leg1: [number, number][] = [[28.65, 77.19], [23.25, 77.41]];
      expect(mergeRouteLegGeometries([leg1])).toEqual(leg1);
      expect(mergeRouteLegGeometries([])).toEqual([]);
    });
  });

  describe('4. Routing Result Status & Non-Fabrication of Alternatives', () => {
    it('sets OSRM_ROAD_GEOMETRY and roadValidated on Patna-Delhi calibrated corridor', async () => {
      const result = await calculateTripRoutes({
        origin: demoTrip.origin,
        destination: demoTrip.destination,
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      });

      expect(result.routeOptions.length).toBe(3);
      const active = result.routeOptions.find((r) => r.id === result.activeRouteId)!;
      expect(active).toBeDefined();
      expect(active.geometryStatus).toBe('OSRM_ROAD_GEOMETRY');
      expect(active.roadValidated).toBe(true);
      expect(active.polylineCoordinates.length).toBeGreaterThan(10);
    });

    it('returns genuine route count without manufacturing duplicate alternatives for custom journeys', async () => {
      // A custom arbitrary journey
      const customOrigin = {
        id: 'origin-karol-bagh',
        name: 'Karol Bagh, New Delhi',
        coordinates: [28.6517, 77.1907] as [number, number],
        batterySoc: 90
      };
      const customDest = {
        id: 'dest-bhopal',
        name: 'Bhopal, Madhya Pradesh',
        coordinates: [23.2599, 77.4126] as [number, number],
        batterySoc: 10
      };

      const result = await calculateTripRoutes({
        origin: customOrigin,
        destination: customDest,
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      });

      // Must produce valid route options with coordinates
      expect(result.routeOptions.length).toBeGreaterThanOrEqual(1);
      const active = result.routeOptions.find((r) => r.id === result.activeRouteId)!;
      expect(active).toBeDefined();
      expect(active.polylineCoordinates.length).toBeGreaterThanOrEqual(2);
      expect(active.geometryStatus).toBeDefined();

      // If only 1 alternative returned by provider/fallback, no fake alternatives are added
      if (result.routeOptions.length === 1) {
        expect(result.routeOptions[0].id).toBe('route-optimal');
      }
    });
  });
});
