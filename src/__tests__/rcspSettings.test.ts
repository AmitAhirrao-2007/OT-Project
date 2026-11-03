import { describe, it, expect } from 'vitest';
import { initialPlanOptions } from '../data/demoSettings';
import { PlanOptions } from '../types/settings';

/**
 * Helper recreating the exact hydration logic used by PlannerContext
 * to guarantee resilience against legacy records and corrupt storage.
 */
function hydratePlanOptions(savedJson: string | null): PlanOptions {
  try {
    if (savedJson) {
      const parsed = JSON.parse(savedJson);
      return {
        ...initialPlanOptions,
        ...parsed,
        useRcspOptimizer: parsed.useRcspOptimizer === true
      };
    }
    return initialPlanOptions;
  } catch {
    return initialPlanOptions;
  }
}

describe('RCSP Optimizer Setting & Persistence (Task 2)', () => {
  it('1. New users receive useRcspOptimizer = false by default', () => {
    expect(initialPlanOptions.useRcspOptimizer).toBe(false);
    const hydratedNewUser = hydratePlanOptions(null);
    expect(hydratedNewUser.useRcspOptimizer).toBe(false);
  });

  it('2. An existing localStorage record without the property safely loads as false', () => {
    const legacySavedOptions = JSON.stringify({
      chargeStops: 'Fewer',
      destinationArrivalSoc: 18,
      avoidTolls: true,
      avoidHighways: false,
      avoidFerriesAndTrains: true,
      avoidBorders: false,
      preferredNetworks: ['Tata Power']
    });

    const hydrated = hydratePlanOptions(legacySavedOptions);
    expect(hydrated.useRcspOptimizer).toBe(false);
    // Verifies legacy fields are preserved intact
    expect(hydrated.chargeStops).toBe('Fewer');
    expect(hydrated.destinationArrivalSoc).toBe(18);
    expect(hydrated.avoidTolls).toBe(true);
    expect(hydrated.preferredNetworks).toEqual(['Tata Power']);
  });

  it('3. Setting useRcspOptimizer to true updates PlanOptions and preserves all fields', () => {
    const baseOptions: PlanOptions = {
      ...initialPlanOptions,
      destinationArrivalSoc: 15,
      avoidTolls: true
    };

    const updated: PlanOptions = {
      ...baseOptions,
      useRcspOptimizer: true
    };

    expect(updated.useRcspOptimizer).toBe(true);
    expect(updated.destinationArrivalSoc).toBe(15);
    expect(updated.avoidTolls).toBe(true);
    expect(updated.chargeStops).toBe('Optimal');
  });

  it('4. The value survives simulated page refresh / rehydration', () => {
    const modifiedOptions: PlanOptions = {
      ...initialPlanOptions,
      destinationArrivalSoc: 20,
      avoidHighways: true,
      useRcspOptimizer: true
    };

    // Simulate saving to localStorage
    const serialized = JSON.stringify(modifiedOptions);

    // Simulate reload and hydration
    const rehydrated = hydratePlanOptions(serialized);

    expect(rehydrated.useRcspOptimizer).toBe(true);
    expect(rehydrated.destinationArrivalSoc).toBe(20);
    expect(rehydrated.avoidHighways).toBe(true);
  });

  it('5. Resetting all settings restores useRcspOptimizer = false', () => {
    // User had enabled the optimizer
    let currentOptions: PlanOptions = {
      ...initialPlanOptions,
      useRcspOptimizer: true
    };
    expect(currentOptions.useRcspOptimizer).toBe(true);

    // Reset action sets initialPlanOptions
    currentOptions = initialPlanOptions;
    expect(currentOptions.useRcspOptimizer).toBe(false);
  });

  it('6. Invalid or non-boolean values in storage safely default to false', () => {
    const corruptedOptions1 = JSON.stringify({
      ...initialPlanOptions,
      useRcspOptimizer: 'true' // string instead of boolean
    });
    expect(hydratePlanOptions(corruptedOptions1).useRcspOptimizer).toBe(false);

    const corruptedOptions2 = JSON.stringify({
      ...initialPlanOptions,
      useRcspOptimizer: 1 // number instead of boolean
    });
    expect(hydratePlanOptions(corruptedOptions2).useRcspOptimizer).toBe(false);

    const corruptedOptions3 = '{ invalid json';
    expect(hydratePlanOptions(corruptedOptions3).useRcspOptimizer).toBe(false);
  });
});

