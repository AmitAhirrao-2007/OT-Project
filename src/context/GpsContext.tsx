/**
 * GPS Location & Route Tracking Context Provider
 * Phase 6F: Clean state management and route progress matching
 */

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { GpsCoordinates, GpsStatus, GpsRouteProgress, GpsState } from '../types/gps';
import {
  getCurrentGpsPosition,
  startGpsWatch,
  stopGpsWatch,
  isGeolocationSupported,
  GpsLocationError
} from '../services/gps/geolocationService';
import { matchGpsToRoute } from '../utils/routeProgressUtils';
import { usePlanner } from './PlannerContext';
import { reverseGeocode } from '../services/search/placesSearchService';

export interface GpsContextValue {
  gpsState: GpsState;
  locateMe: () => Promise<GpsCoordinates | null>;
  startTracking: () => void;
  stopTracking: () => void;
  toggleFollowMe: () => void;
  setFollowMe: (val: boolean) => void;
  useCurrentLocationAsOrigin: () => Promise<boolean>;
  clearGpsError: () => void;
}

const GpsContext = createContext<GpsContextValue | undefined>(undefined);

export const GpsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeRoute, trip, setTrip, replanRoute, showToast } = usePlanner();

  const [status, setStatus] = useState<GpsStatus>('idle');
  const [currentPosition, setCurrentPosition] = useState<GpsCoordinates | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isFollowMe, setIsFollowMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [routeProgress, setRouteProgress] = useState<GpsRouteProgress | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const activeRouteRef = useRef(activeRoute);
  activeRouteRef.current = activeRoute;

  // Clear error state helper
  const clearGpsError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  // Update route progress whenever current position or activeRoute changes
  useEffect(() => {
    if (!currentPosition) {
      setRouteProgress(null);
      return;
    }

    const polyline = activeRoute.polylineCoordinates;
    if (polyline && polyline.length >= 2) {
      const progress = matchGpsToRoute(
        [currentPosition.latitude, currentPosition.longitude],
        polyline,
        {
          gpsAccuracyMeters: currentPosition.accuracy,
          offRouteThresholdMeters: 120,
          maxCorridorThresholdMeters: 3500
        }
      );
      setRouteProgress(progress);
    } else {
      setRouteProgress(null);
    }
  }, [currentPosition, activeRoute]);

  // Request one-time GPS location (Locate Me)
  const locateMe = useCallback(async (): Promise<GpsCoordinates | null> => {
    if (!isGeolocationSupported()) {
      setStatus('unsupported');
      setErrorMessage('Geolocation is not supported by your browser.');
      showToast('Geolocation is not supported by your browser.');
      return null;
    }

    setStatus('locating');
    setErrorMessage(null);

    try {
      const pos = await getCurrentGpsPosition({ timeout: 10000, enableHighAccuracy: true });
      setCurrentPosition(pos);
      setStatus('idle');
      showToast(`Located: ±${pos.accuracy}m GPS accuracy`);
      return pos;
    } catch (err: unknown) {
      const locErr = err as GpsLocationError;
      setStatus(locErr.status || 'error');
      setErrorMessage(locErr.message);
      showToast(locErr.message);
      return null;
    }
  }, [showToast]);

  // Start continuous GPS tracking
  const startTracking = useCallback(() => {
    if (isTracking && watchIdRef.current !== null) return;

    if (!isGeolocationSupported()) {
      setStatus('unsupported');
      setErrorMessage('Geolocation is not supported by this browser.');
      showToast('Geolocation is not supported by this browser.');
      return;
    }

    setStatus('tracking');
    setIsTracking(true);
    setIsFollowMe(true);
    setErrorMessage(null);

    const id = startGpsWatch(
      (pos: GpsCoordinates) => {
        setCurrentPosition(pos);
        setStatus('tracking');
      },
      (err: GpsLocationError) => {
        setStatus(err.status || 'error');
        setErrorMessage(err.message);
        showToast(err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000
      }
    );

    watchIdRef.current = id;
    showToast('GPS route tracking started (Follow Me on)');
  }, [isTracking, showToast]);

  // Stop continuous GPS tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      stopGpsWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setIsFollowMe(false);
    setStatus('idle');
    showToast('GPS tracking stopped.');
  }, [showToast]);

  // Toggle Follow Me mode
  const toggleFollowMe = useCallback(() => {
    setIsFollowMe((prev) => {
      const next = !prev;
      showToast(next ? 'Follow Me enabled' : 'Follow Me paused');
      return next;
    });
  }, [showToast]);

  const setFollowMe = useCallback((val: boolean) => {
    setIsFollowMe(val);
  }, []);

  // Use current device GPS position as journey Origin
  const useCurrentLocationAsOrigin = useCallback(async (): Promise<boolean> => {
    setStatus('locating');
    showToast('Acquiring GPS coordinates for Origin...');

    try {
      const pos = await getCurrentGpsPosition({ timeout: 12000, enableHighAccuracy: true });
      setCurrentPosition(pos);
      setStatus('idle');

      // Resolve human-readable place name using reverse geocode service
      const geoResult = await reverseGeocode([pos.latitude, pos.longitude]);
      const originName = geoResult.name || 'My Current Location';
      const originAddress = geoResult.address || `GPS (${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)})`;

      const nextOrigin = {
        ...trip.origin,
        name: originName,
        subTitle: `GPS ±${pos.accuracy}m • ${originAddress}`,
        address: originAddress,
        coordinates: [pos.latitude, pos.longitude] as [number, number],
        source: 'gps' as const
      };

      setTrip((prev) => ({
        ...prev,
        origin: nextOrigin
      }));

      showToast(`Origin set to "${originName}" (GPS ±${pos.accuracy}m)`);
      replanRoute({ origin: nextOrigin });
      return true;
    } catch (err: unknown) {
      const locErr = err as GpsLocationError;
      setStatus(locErr.status || 'error');
      setErrorMessage(locErr.message);
      showToast(locErr.message || 'Failed to retrieve current GPS coordinates.');
      return false;
    }
  }, [trip.origin, setTrip, replanRoute, showToast]);

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        stopGpsWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const value: GpsContextValue = {
    gpsState: {
      status,
      currentPosition,
      isTracking,
      isFollowMe,
      errorMessage,
      routeProgress
    },
    locateMe,
    startTracking,
    stopTracking,
    toggleFollowMe,
    setFollowMe,
    useCurrentLocationAsOrigin,
    clearGpsError
  };

  return <GpsContext.Provider value={value}>{children}</GpsContext.Provider>;
};

export const useGps = (): GpsContextValue => {
  const context = useContext(GpsContext);
  if (!context) {
    throw new Error('useGps must be used within a GpsProvider');
  }
  return context;
};

