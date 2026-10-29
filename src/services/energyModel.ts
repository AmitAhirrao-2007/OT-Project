import { VehicleProfile } from '../types/vehicle';

export interface EnergyCalculationParams {
  distanceMi: number;
  vehicle: VehicleProfile;
  ambientTempF?: number;
  relativeSpeedPercent?: number;
}

export interface ChargingCalculationParams {
  batteryCapacityKwh?: number;
  usableCapacityKwh: number;
  degradationPercent?: number;
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
 * Computes the effective usable battery capacity after factoring in degradation once.
 * For example: 38.0 kWh usable * (1 - 0.051 degradation) = 36.06 kWh effective usable.
 */
export function getEffectiveBatteryCapacity(vehicle: VehicleProfile): number {
  const degradation = Math.max(0, Math.min(40, vehicle.batteryDegradationPercent || 0));
  return vehicle.usableBatteryKwh * (1 - degradation / 100);
}

/**
 * Calculates energy consumed over a highway leg in kWh and equivalent SoC percentage drop.
 * Models:
 * 1. Aerodynamic drag scaling (scales with (v_rel / 100)^1.8).
 * 2. Temperature scaling (heating penalty below 65°F, HVAC cooling penalty above 85°F).
 * 3. Vehicle base reference consumption (e.g., 245 Wh/mi for Nexon EV Max at standard conditions).
 */
export function calculateLegEnergy(params: EnergyCalculationParams): {
  energyKwh: number;
  socPercent: number;
} {
  const {
    distanceMi,
    vehicle,
    ambientTempF = 72,
    relativeSpeedPercent = vehicle.relativeSpeedPercent || 100
  } = params;

  // 1. Aerodynamic speed scaling
  const speedRatio = (relativeSpeedPercent || 100) / 100;
  const speedMultiplier = Math.pow(speedRatio, 1.8);

  // 2. Temperature scaling
  let tempMultiplier = 1.0;
  if (ambientTempF < 65) {
    tempMultiplier += ((65 - ambientTempF) / 10) * 0.035; // ~3.5% per 10°F drop
  } else if (ambientTempF > 85) {
    tempMultiplier += ((ambientTempF - 85) / 10) * 0.02; // ~2.0% per 10°F rise for AC
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
 *
 * Charging Curve Assumptions & Specifications:
 * - Peak power is strictly min(vehicle.maxDcChargingKw, stationPowerKw).
 * - Stage 1 (0% - 60% SoC): Flat peak constant-power phase (100% of peak capability).
 * - Stage 2 (60% - 75% SoC): Linear taper from 100% down to 70% of peak capability as cell voltage peaks.
 * - Stage 3 (75% - 85% SoC): Linear taper from 70% down to 45% of peak capability.
 * - Stage 4 (85% - 100% SoC): Saturation/trickle taper down to 20% of peak capability (min 10 kW floor).
 *
 * Note on degradation:
 * To avoid applying degradation twice, degradation is only applied if degradationPercent > 0
 * and usableCapacityKwh is unadjusted.
 */
export function calculateChargingDuration(params: ChargingCalculationParams): ChargingEstimate {
  const {
    usableCapacityKwh,
    degradationPercent = 0,
    maxDcChargingKw,
    stationPowerKw,
    currentSocPercent,
    targetSocPercent
  } = params;

  // Compute effective capacity (applying degradation only once)
  const effectiveCapacity = usableCapacityKwh * (1 - (degradationPercent || 0) / 100);
  const startSoc = Math.max(0, currentSocPercent);
  const endSoc = Math.max(startSoc, Math.min(100, targetSocPercent));

  if (endSoc <= startSoc) {
    return {
      energyAddedKwh: 0,
      durationMinutes: 0,
      averagePowerKw: 0,
      effectiveCapacityKwh: effectiveCapacity
    };
  }

  // Genuine charging power constraint: minimum of vehicle DC capability and station power
  const peakPower = Math.min(maxDcChargingKw, stationPowerKw);
  let totalMinutes = 0;
  let totalEnergyAdded = 0;

  // Divide charge curve into 1% discrete slices for numerical integration
  for (let soc = Math.floor(startSoc); soc < Math.floor(endSoc); soc += 1) {
    const kwhInThisStep = (1 / 100) * effectiveCapacity;
    totalEnergyAdded += kwhInThisStep;

    // Taper factor based on SoC curve
    let powerFactor = 1.0;
    if (soc < 60) {
      powerFactor = 1.0; // Stage 1: Peak constant power
    } else if (soc < 75) {
      // Stage 2: Linear ramp down from 1.0 to 0.70
      powerFactor = 1.0 - ((soc - 60) / 15) * 0.3;
    } else if (soc < 85) {
      // Stage 3: Linear ramp down from 0.70 to 0.45
      powerFactor = 0.7 - ((soc - 75) / 10) * 0.25;
    } else {
      // Stage 4: Trickle taper down to 0.20
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
 * Arrival SoC is NOT artificially clamped to arbitrary positive numbers.
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
  energyKwh: number;
} {
  const { energyKwh, socPercent } = calculateLegEnergy({ distanceMi: legDistanceMi, vehicle });
  const arrivalSoc = Number((startSoc - socPercent).toFixed(1));
  const isFeasible = arrivalSoc >= minReserveSoc;
  const deficitSoc = isFeasible ? 0 : Number((minReserveSoc - arrivalSoc).toFixed(1));

  return { arrivalSoc, isFeasible, deficitSoc, energyKwh };
}
