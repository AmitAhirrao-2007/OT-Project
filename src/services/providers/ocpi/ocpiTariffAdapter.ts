// OCPI Tariff Module Adapter
// Conforms to OCPI 2.2.1 and 2.3.0 Tariff schemas.

import { OcpiTariff } from './ocpiTypes';
import { NormalizedTariff, NormalizedTariffElement } from '../providerTypes';

/**
 * Normalizes an OCPI 2.2.1/2.3.0 Tariff object into an internal NormalizedTariff representation.
 * Distinguishes ENERGY (per-kWh rate) from FLAT (session fees) and TIME (per-minute fees).
 */
export function normalizeOcpiTariff(tariff: OcpiTariff): NormalizedTariff {
  let ratePerKwh = 0;
  let sessionFee: number | undefined;
  let ratePerMinute: number | undefined;

  const elements: NormalizedTariffElement[] = [];

  if (tariff.elements && Array.isArray(tariff.elements)) {
    for (const elem of tariff.elements) {
      if (elem.price_components && Array.isArray(elem.price_components)) {
        for (const comp of elem.price_components) {
          const price = typeof comp.price === 'number' ? comp.price : 0;
          elements.push({
            componentType: comp.type,
            price,
            stepSize: comp.step_size
          });

          if (comp.type === 'ENERGY') {
            ratePerKwh = price;
          } else if (comp.type === 'FLAT') {
            sessionFee = (sessionFee || 0) + price;
          } else if (comp.type === 'TIME') {
            // OCPI step_size for TIME is typically 60 seconds (1 minute)
            const minutesInStep = (comp.step_size || 60) / 60;
            ratePerMinute = minutesInStep > 0 ? price / minutesInStep : price;
          }
        }
      }
    }
  }

  // If currency is INR and no energy component was defined, or rate is 0, classify accordingly
  const isConfirmed = ratePerKwh > 0 || sessionFee !== undefined;

  return {
    tariffId: tariff.id,
    currency: tariff.currency || 'INR',
    ratePerKwh,
    sessionFee,
    ratePerMinute,
    isConfirmed,
    tariffElements: elements
  };
}

