import { describe, it, expect } from 'vitest';

/**
 * Fixed-asset depreciation — pure unit tests.
 *
 * Schema fields (all Drizzle numeric → string):
 *   purchaseCost, salvageValue, usefulLifeYears,
 *   accumulatedDepreciation, netBookValue
 */

// ---------------------------------------------------------------------------
// Helper functions mirroring business logic
// ---------------------------------------------------------------------------

interface AssetInput {
  purchaseCost: string;       // Drizzle numeric → string
  salvageValue: string;       // Drizzle numeric → string
  usefulLifeYears: number;    // Drizzle integer → number
  accumulatedDepreciation: string;
}

/** Straight-line annual depreciation = (cost - residual) / useful life */
function annualDepreciation(asset: AssetInput): number {
  const cost = Number(asset.purchaseCost);
  const residual = Number(asset.salvageValue);
  return (cost - residual) / asset.usefulLifeYears;
}

/** Monthly depreciation = annual / 12 */
function monthlyDepreciation(asset: AssetInput): number {
  return annualDepreciation(asset) / 12;
}

/** Net book value = cost - accumulated depreciation */
function netBookValue(asset: AssetInput): number {
  return Number(asset.purchaseCost) - Number(asset.accumulatedDepreciation);
}

/** Depreciable base = cost - residual. Accumulated must never exceed this. */
function depreciableBase(asset: AssetInput): number {
  return Number(asset.purchaseCost) - Number(asset.salvageValue);
}

/**
 * Run depreciation for N months, capping at the depreciable base.
 * Returns the new accumulated depreciation.
 */
function runDepreciation(asset: AssetInput, months: number): number {
  const monthly = monthlyDepreciation(asset);
  const cap = depreciableBase(asset);
  const current = Number(asset.accumulatedDepreciation);
  const additional = monthly * months;
  return Math.min(current + additional, cap);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Fixed Assets Module', () => {
  const sampleAsset: AssetInput = {
    purchaseCost: '120000.00',
    salvageValue: '12000.00',
    usefulLifeYears: 5,
    accumulatedDepreciation: '0.00',
  };

  // -----------------------------------------------------------------------
  // Straight-line depreciation: (cost - residual) / useful life
  // -----------------------------------------------------------------------
  it('should calculate straight-line annual depreciation correctly', () => {
    const annual = annualDepreciation(sampleAsset);
    // (120000 - 12000) / 5 = 21600
    expect(annual).toBe(21600);
  });

  // -----------------------------------------------------------------------
  // Monthly depreciation = annual / 12
  // -----------------------------------------------------------------------
  it('should calculate monthly depreciation as annual / 12', () => {
    const monthly = monthlyDepreciation(sampleAsset);
    // 21600 / 12 = 1800
    expect(monthly).toBe(1800);
  });

  // -----------------------------------------------------------------------
  // Accumulated depreciation must not exceed (cost - residual)
  // -----------------------------------------------------------------------
  it('should cap accumulated depreciation at depreciable base', () => {
    const cap = depreciableBase(sampleAsset);
    // 120000 - 12000 = 108000
    expect(cap).toBe(108000);

    // Depreciate for 5 full years (60 months) — should hit exactly the cap
    const acc60 = runDepreciation(sampleAsset, 60);
    expect(acc60).toBe(108000);

    // Depreciate for 10 years (120 months) — must still not exceed cap
    const acc120 = runDepreciation(sampleAsset, 120);
    expect(acc120).toBe(108000);
  });

  // -----------------------------------------------------------------------
  // Net book value = cost - accumulated
  // -----------------------------------------------------------------------
  it('should compute net book value correctly after partial depreciation', () => {
    const partialAsset: AssetInput = {
      ...sampleAsset,
      accumulatedDepreciation: '43200.00', // 2 years worth
    };

    const nbv = netBookValue(partialAsset);
    // 120000 - 43200 = 76800
    expect(nbv).toBe(76800);
  });

  // -----------------------------------------------------------------------
  // Edge case: asset with zero salvage value
  // -----------------------------------------------------------------------
  it('should depreciate to zero when salvage value is zero', () => {
    const zeroSalvage: AssetInput = {
      purchaseCost: '60000.00',
      salvageValue: '0',
      usefulLifeYears: 3,
      accumulatedDepreciation: '0.00',
    };

    const annual = annualDepreciation(zeroSalvage);
    expect(annual).toBe(20000); // 60000 / 3

    const fullyDepreciated = runDepreciation(zeroSalvage, 36);
    expect(fullyDepreciated).toBe(60000);
  });
});
