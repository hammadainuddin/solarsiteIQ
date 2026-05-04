/**
 * Market benchmarks for SEA data centre projects, by category × region.
 *
 * Ranges reflect publicly cited industry research:
 *   - JLL Asia Pacific Data Center Report 2024
 *   - CBRE Asia Pacific Data Centre Trends Report 2024
 *   - DC Byte Hyperscale Pipeline 2024
 *   - Cushman & Wakefield Global Data Center Market Comparison 2024
 *
 * Numbers are rounded mid-points within published bands. They are intended
 * for orientation only and should not be relied on for transactional pricing.
 */

export type BenchmarkCategory = 'hyperscale' | 'colocation' | 'edge';
export type BenchmarkRegion = 'SEA' | 'JB' | 'SG' | 'BKK' | 'JKT';

export interface PercentileBand { p25: number; p50: number; p75: number; }

export interface BenchmarkProfile {
  category: BenchmarkCategory;
  region: BenchmarkRegion;
  capexUSD_kW: PercentileBand;
  opexUSD_kWyr: PercentileBand;
  rackRateUSD_kWmo: PercentileBand;
  utilisationY3Pct: PercentileBand;
  /** Power Load Factor at stabilisation, % */
  plf: PercentileBand;
  /** Equity IRR, % */
  irr: PercentileBand;
  source: string;
}

export const BENCHMARKS: BenchmarkProfile[] = [
  {
    category: 'hyperscale',
    region: 'JB',
    capexUSD_kW:      { p25: 8500,  p50: 9500,  p75: 10500 },
    opexUSD_kWyr:     { p25: 280,   p50: 320,   p75: 380 },
    rackRateUSD_kWmo: { p25: 100,   p50: 115,   p75: 130 },
    utilisationY3Pct: { p25: 55,    p50: 65,    p75: 75 },
    plf:              { p25: 65,    p50: 72,    p75: 80 },
    irr:              { p25: 12,    p50: 15,    p75: 18 },
    source: 'JLL APAC DC 2024 + DC Byte Pipeline 2024 (Johor Bahru hyperscale band)',
  },
  {
    category: 'hyperscale',
    region: 'SG',
    capexUSD_kW:      { p25: 11000, p50: 12500, p75: 14000 },
    opexUSD_kWyr:     { p25: 380,   p50: 440,   p75: 520 },
    rackRateUSD_kWmo: { p25: 220,   p50: 260,   p75: 300 },
    utilisationY3Pct: { p25: 75,    p50: 85,    p75: 95 },
    plf:              { p25: 78,    p50: 84,    p75: 90 },
    irr:              { p25: 13,    p50: 16,    p75: 20 },
    source: 'CBRE APAC DC Trends 2024 (Singapore Pilot Allocation cohort)',
  },
  {
    category: 'colocation',
    region: 'JB',
    capexUSD_kW:      { p25: 9500,  p50: 10500, p75: 12000 },
    opexUSD_kWyr:     { p25: 320,   p50: 360,   p75: 420 },
    rackRateUSD_kWmo: { p25: 120,   p50: 140,   p75: 165 },
    utilisationY3Pct: { p25: 45,    p50: 55,    p75: 70 },
    plf:              { p25: 55,    p50: 65,    p75: 75 },
    irr:              { p25: 10,    p50: 13,    p75: 16 },
    source: 'JLL APAC DC 2024 (Johor Bahru colocation segment)',
  },
  {
    category: 'colocation',
    region: 'BKK',
    capexUSD_kW:      { p25: 9000,  p50: 10000, p75: 11500 },
    opexUSD_kWyr:     { p25: 300,   p50: 340,   p75: 400 },
    rackRateUSD_kWmo: { p25: 130,   p50: 150,   p75: 175 },
    utilisationY3Pct: { p25: 40,    p50: 50,    p75: 65 },
    plf:              { p25: 55,    p50: 62,    p75: 72 },
    irr:              { p25: 9,     p50: 12,    p75: 15 },
    source: 'CBRE APAC DC Trends 2024 (Bangkok colocation)',
  },
  {
    category: 'colocation',
    region: 'JKT',
    capexUSD_kW:      { p25: 8500,  p50: 9500,  p75: 11000 },
    opexUSD_kWyr:     { p25: 290,   p50: 330,   p75: 390 },
    rackRateUSD_kWmo: { p25: 140,   p50: 165,   p75: 195 },
    utilisationY3Pct: { p25: 50,    p50: 65,    p75: 78 },
    plf:              { p25: 58,    p50: 66,    p75: 76 },
    irr:              { p25: 11,    p50: 14,    p75: 18 },
    source: 'Cushman & Wakefield Indonesia DC report 2024',
  },
  {
    category: 'edge',
    region: 'SG',
    capexUSD_kW:      { p25: 13000, p50: 15000, p75: 17500 },
    opexUSD_kWyr:     { p25: 420,   p50: 500,   p75: 600 },
    rackRateUSD_kWmo: { p25: 280,   p50: 340,   p75: 400 },
    utilisationY3Pct: { p25: 35,    p50: 50,    p75: 65 },
    plf:              { p25: 50,    p50: 58,    p75: 68 },
    irr:              { p25: 8,     p50: 12,    p75: 17 },
    source: 'DC Byte Edge Compute supplement 2024 (Singapore)',
  },
];

export function findBenchmark(
  category: BenchmarkCategory,
  region: BenchmarkRegion,
): BenchmarkProfile | null {
  return BENCHMARKS.find((b) => b.category === category && b.region === region) ?? null;
}
