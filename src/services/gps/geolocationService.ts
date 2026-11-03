/**
 * Browser Geolocation API Wrapper & GPS Diagnostics
 * Phase 6F: High-accuracy device GPS tracking with robust error handling
 */

import { GpsCoordinates, GpsStatus } from '../../types/gps';

export interface GpsLocationError {
  code: number;
  message: string;
  status: GpsStatus;
}

/**
 * Checks whether the browser supports the Geolocation API
 */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator && !!navigator.geolocation;
}

/**
 * Maps raw GeolocationPosition to strongly-typed GpsCoordinates
 */
export function extractGpsCoordinates(pos: GeolocationPosition): GpsCoordinates {
  const c = pos.coords;
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    accuracy: typeof c.accuracy === 'number' && !isNaN(c.accuracy) ? c.accuracy : 25,
    altitude: c.altitude ?? null,
    altitudeAccuracy: c.altitudeAccuracy ?? null,
    heading: typeof c.heading === 'number' && !isNaN(c.heading) ? c.heading : null,
    speed: typeof c.speed === 'number' && !isNaN(c.speed) ? c.speed : null,
    timestamp: pos.timestamp || Date.now()
  };
}

/**
 * Translates GeolocationPositionError into user-friendly message and GpsStatus
 */
export function mapGeolocationError(err: GeolocationPositionError): GpsLocationError {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return {
        code: 1,
        status: 'permission_denied',
        message: 'Location access was denied. Please allow location permissions in your browser or device settings.'
      };
    case err.POSITION_UNAVAILABLE:
      return {
        code: 2,
        status: 'unavailable',
        message: 'GPS location is temporarily unavailable. Check GPS/network reception.'
      };
    case err.TIMEOUT:
      return {
        code: 3,
        status: 'timeout',
        message: 'GPS location request timed out. Please try again.'
      };
    default:
      return {
        code: 0,
        status: 'error',
        message: err.message || 'An unexpected error occurred while retrieving GPS location.'
      };
  }
}

/**
 * Requests one-time high-accuracy GPS coordinates via getCurrentPosition
 */
export function getCurrentGpsPosition(
  customOptions?: PositionOptions
): Promise<GpsCoordinates> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject({
        code: -1,
        status: 'unsupported' as GpsStatus,
        message: 'Geolocation is not supported by your current browser.'
      });
      return;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 10000,
      ...customOptions
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(extractGpsCoordinates(pos)),
      (err) => reject(mapGeolocationError(err)),
      options
    );
  });
}

/**
 * Starts continuous GPS tracking using watchPosition
 */
export function startGpsWatch(
  onPosition: (pos: GpsCoordinates) => void,
  onError: (err: GpsLocationError) => void,
  customOptions?: PositionOptions
): number | null {
  if (!isGeolocationSupported()) {
    onError({
      code: -1,
      status: 'unsupported',
      message: 'Geolocation is not supported by this browser.'
    });
    return null;
  }

  const options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 5000,
    ...customOptions
  };

  try {
    return navigator.geolocation.watchPosition(
      (pos) => onPosition(extractGpsCoordinates(pos)),
      (err) => onError(mapGeolocationError(err)),
      options
    );
  } catch (e: unknown) {
    onError({
      code: 0,
      status: 'error',
      message: e instanceof Error ? e.message : 'Failed to initialize GPS watcher'
    });
    return null;
  }
}

/**
 * Clears an active GPS watch cleanly
 */
export function stopGpsWatch(watchId: number | null): void {
  if (watchId !== null && isGeolocationSupported()) {
    try {
      navigator.geolocation.clearWatch(watchId);
    } catch {}
  }
}
