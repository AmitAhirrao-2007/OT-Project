import { VehicleProfile } from '../types/vehicle';

export interface EnergyCalculationParams {
  distanceMi: number;
  vehicle: VehicleProfile;
  ambientTempF?: number;
  relativeSpeedPercent?: number;
}

export interface ChargingCalculationParams {
  batteryCapacityKwh: number;
  usableCapacityKwh: number;
  degradationPercent: number;
  maxDcChargingKw: number;
  stationPowerKw: number;
  currentSocPercent: number;
  targetSocPercent: number;
}

export interface ChargingEstimate {
  energyAddedKwh: number;
  durationMinutes: number;
  averagePowerKw: number;
  effectiveCapacityKwh: number;
}

/**
 * Computes the effective usable battery capacity after factoring in degradation.
 */
export function getEffectiveBatteryCapacity(vehicle: VehicleProfile): number {
  const degradation = Math.max(0, Math.min(40, vehicle.batteryDegradationPercent || 0));
  return vehicle.usableBatteryKwh * (1 - degradation / 100);
}

/**
 * Calculates energy consumed over a highway leg in kWh.
 */
export function calculateLegEnergy(params: EnergyCalculationParams): {
  energyKwh: number;
  socPercent: number;
} {
  const { distanceMi, vehicle, ambientTempF = 72, relativeSpeedPercent = vehicle.relativeSpeedPercent } = params;

  // 1. Aerodynamic speed scaling (drag scales with v^1.8)
  const speedRatio = (relativeSpeedPercent || 100) / 100;
  const speedMultiplier = Math.pow(speedRatio, 1.8);

  // 2. Temperature scaling (cold penalty below 65F, heat AC penalty above 85F)
  let tempMultiplier = 1.0;
  if (ambientTempF < 65) {
    tempMultiplier += ((65 - ambientTempF) / 10) * 0.035; // ~3.5% per 10 deg drop
  } else if (ambientTempF > 85) {
    tempMultiplier += ((ambientTempF - 85) / 10) * 0.02; // ~2% per 10 deg rise for AC
  }

  // Adjusted consumption in Wh/mi
  const adjustedConsumptionWhPerMi = vehicle.referenceConsumptionWhPerMi * speedMultiplier * tempMultiplier;

  // Energy consumed in kWh
  const energyKwh = Number(((distanceMi * adjustedConsumptionWhPerMi) / 1000).toFixed(2));

  // Percentage of effective battery capacity
  const effectiveCapacity = getEffectiveBatteryCapacity(vehicle);
  const socPercent = Number(((energyKwh / effectiveCapacity) * 100).toFixed(1));

  return { energyKwh, socPercent };
}

/**
 * Calculates charging session duration using a realistic multi-stage EV DC fast charging curve.
 * Power tapers as battery fills past 60%, 80%, and 90%.
 */
export function calculateChargingDuration(params: ChargingCalculationParams): ChargingEstimate {
  const {
    usableCapacityKwh,
    degradationPercent,
    maxDcChargingKw,
    stationPowerKw,
    currentSocPercent,
    targetSocPercent
  } = params;

  const effectiveCapacity = usableCapacityKwh * (1 - degradationPercent / 100);
  const startSoc = Math.max(0, Math.min(100, currentSocPercent));
  const endSoc = Math.max(startSoc, Math.min(100, targetSocPercent));

  if (endSoc <= startSoc) {
    return {
      energyAddedKwh: 0,
      durationMinutes: 0,
      averagePowerKw: 0,
      effectiveCapacityKwh: effectiveCapacity
    };
  }

  const peakPower = Math.min(maxDcChargingKw, stationPowerKw);
  let totalMinutes = 0;
  let totalEnergyAdded = 0;

  // Divide charge curve into 1% discrete slices for accurate integration
  for (let soc = startSoc; soc < endSoc; soc += 1) {
    const kwhInThisStep = (1 / 100) * effectiveCapacity;
    totalEnergyAdded += kwhInThisStep;

    // Taper factor based on SoC
    let powerFactor = 1.0;
    if (soc < 60) {
      powerFactor = 1.0; // Peak constant power
    } else if (soc < 75) {
      // Linear ramp down from 1.0 to 0.70
      powerFactor = 1.0 - ((soc - 60) / 15) * 0.3;
    } else if (soc < 85) {
      // Linear ramp down from 0.70 to 0.45
      powerFactor = 0.7 - ((soc - 75) / 10) * 0.25;
    } else {
      // Slow trickle charge past 85% down to 0.20
      powerFactor = Math.max(0.2, 0.45 - ((soc - 85) / 15) * 0.25);
    }

    const currentPowerKw = Math.max(10, peakPower * powerFactor);
    const minutesForStep = (kwhInThisStep / currentPowerKw) * 60;
    totalMinutes += minutesForStep;
  }

  const durationMinutes = Math.max(1, Math.round(totalMinutes));
  const averagePowerKw = Number((totalEnergyAdded / (durationMinutes / 60)).toFixed(1));

  return {
    energyAddedKwh: Number(totalEnergyAdded.toFixed(2)),
    durationMinutes,
    averagePowerKw,
    effectiveCapacityKwh: effectiveCapacity
  };
}

/**
 * Checks battery feasibility for a leg and verifies if minimum reserve is satisfied.
 */
export function checkLegFeasibility(
  startSoc: number,
  legDistanceMi: number,
  vehicle: VehicleProfile,
  minReserveSoc: number = 10
): {
  arrivalSoc: number;
  isFeasible: boolean;
  deficitSoc: number;
} {
  const { socPercent } = calculateLegEnergy({ distanceMi: legDistanceMi, vehicle });
  const arrivalSoc = Number((startSoc - socPercent).toFixed(1));
  const isFeasible = arrivalSoc >= minReserveSoc;
  const deficitSoc = isFeasible ? 0 : Number((minReserveSoc - arrivalSoc).toFixed(1));

  return { arrivalSoc, isFeasible, deficitSoc };
}
