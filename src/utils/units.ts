import { UnitSystem, TempUnit } from '../types/settings';

export const MILES_TO_KM = 1.60934;
export const KM_TO_MILES = 0.621371;

export function formatDistance(miles: number, system: UnitSystem): string {
  if (system === 'metric') {
    const km = Math.round(miles * MILES_TO_KM);
    return `${km.toLocaleString()} km`;
  }
  return `${Math.round(miles).toLocaleString()} mi`;
}

export function formatSpeed(mph: number, system: UnitSystem): string {
  if (system === 'metric') {
    const kmh = Math.round(mph * MILES_TO_KM);
    return `${kmh} km/h`;
  }
  return `${Math.round(mph)} mph`;
}

export function formatConsumption(whPerMi: number, system: UnitSystem): string {
  if (system === 'metric') {
    // 1 Wh/mi = 1 / 1.60934 Wh/km = 0.62137 Wh/km
    const whPerKm = Math.round(whPerMi * KM_TO_MILES);
    return `${whPerKm} Wh/km`;
  }
  return `${Math.round(whPerMi)} Wh/mi`;
}

export function formatTemperature(fahrenheit: number, unit: TempUnit): string {
  if (unit === 'C') {
    const celsius = Math.round(((fahrenheit - 32) * 5) / 9);
    return `${celsius}°C`;
  }
  return `${Math.round(fahrenheit)}°F`;
}
