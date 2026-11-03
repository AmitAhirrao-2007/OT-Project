// Time utility functions shared across services.
// Extracted from routingService.ts to avoid circular imports between routingService and rcspSolver.

/** Formats minutes into standard "X h Y min" or "Y min" string. */
export function formatHoursMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** Parses duration strings such as "3 h 38 min" or "41 min" into total integer minutes. */
export function parseDurationStringToMinutes(str: string): number {
  if (!str) return 0;
  let total = 0;
  const hMatch = str.match(/(\d+)\s*h/i);
  const mMatch = str.match(/(\d+)\s*min/i);
  if (hMatch) total += parseInt(hMatch[1], 10) * 60;
  if (mMatch) total += parseInt(mMatch[1], 10);
  return total || 0;
}

/** Parses station tariff strings such as "₹22.50 / kWh" into numeric tariff values. */
export function parsePricePerKwh(priceStr?: string): number {
  if (!priceStr) return 21.0;
  const match = priceStr.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 21.0;
}

/** Adds minutes to an HH:MM AM/PM string, wrapping around 24 hours. */
export function addMinutesToTimeString(startTime: string, minutesToAdd: number): string {
  const match = startTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  let hours = 12;
  let mins = 0;

  if (match) {
    hours = parseInt(match[1], 10);
    mins = parseInt(match[2], 10);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }

  const totalMin = (hours * 60 + mins + Math.round(minutesToAdd)) % (24 * 60);
  const newHours24 = Math.floor(totalMin / 60);
  const newMins = totalMin % 60;

  const displayHours = newHours24 % 12 === 0 ? 12 : newHours24 % 12;
  const displayMeridiem = newHours24 >= 12 ? 'PM' : 'AM';
  const displayMins = newMins.toString().padStart(2, '0');

  return `${displayHours}:${displayMins} ${displayMeridiem}`;
}

