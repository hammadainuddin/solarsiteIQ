import { DC_DATABASE } from '../data/dcDatabase';
import { EXAMPLE_SITES } from '../data/candidateSites';
import { calculateSiteScore, DEFAULT_WEIGHTS } from './scoring';
import { runFinancialModel, DEFAULT_DCF_INPUTS } from './financial';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt2(n: number): string { return n.toFixed(2); }
function fmtPct(n: number): string { return isNaN(n) ? 'N/A' : n.toFixed(1) + '%'; }

export function generateAndPrintReport(): void {
  // Score sites
  const scoredSites = EXAMPLE_SITES
    .map(site => ({ site, result: calculateSiteScore(site, DC_DATABASE, DEFAULT_WEIGHTS) }))
    .sort((a, b) => b.result.total - a.result.total);

  // DC database stats
  const totalCapacityMW = DC_DATABASE.reduce((s, d) => s + d.capacityMW, 0);
  const pipelineMW = DC_DATABASE
    .filter(d => d.status === 'construction' || d.status === 'announced')
    .reduce((s, d) => s + d.capacityMW, 0);
  const totalDCs = DC_DATABASE.length;

  // Financial model (default inputs)
  let fin: ReturnType<typeof runFinancialModel> | null = null;
  try { fin = runFinancialModel(DEFAULT_DCF_INPUTS); } catch { /* leave null */ }

  const top3 = scoredSites.slice(0, 3);

  const scoreRow = (label: string, val: number): string =>
    `<tr><td>${esc(label)}</td><td class="num">${val.toFixed(0)}</td>
     <td><div class="bar"><div class="bar-fill" style="width:${val}%"></div></div></td></tr>`;

  const siteRows = scoredSites.map(({ site, result }, i) =>
    `<tr>
      <td>${i + 1}</td>
      <td>${esc(site.name)}</td>
      <td>${site.country}, ${esc(site.city)}</td>
      <td class="num">${result.total.toFixed(0)}</td>
      <td class="num">${result.power.toFixed(0)}</td>
      <td class="num">${result.competition.toFixed(0)}</td>
      <td class="num">${result.utilities.toFixed(0)}</td>
      <td class="num">${result.landRegulatory.toFixed(0)}</td>
      <td class="num">${result.marketAccess.toFixed(0)}</td>
    </tr>`
  ).join('');

  const topSiteCards = top3.map(({ site, result }, i) => `
    <div class="site-card">
      <h3>#${i + 1} — ${esc(site.name)}</h3>
      <p class="meta">${site.country} · ${esc(site.city)} · ${site.landAreaHa} ha · Status: ${esc(site.status)}</p>
      <p class="score-big">${result.total.toFixed(0)}<span>/100</span></p>
      <table class="score-table">
        <thead><tr><th>Dimension</th><th>Score</th><th>Bar</th></tr></thead>
        <tbody>
          ${scoreRow('Power & Grid', result.power)}
          ${scoreRow('Competition', result.competition)}
          ${scoreRow('Utilities', result.utilities)}
          ${scoreRow('Land & Regulatory', result.landRegulatory)}
          ${scoreRow('Market Access', result.marketAccess)}
        </tbody>
      </table>
      <p class="notes">${esc(site.notes)}</p>
    </div>
  `).join('');

  const finSection = fin ? `
    <section>
      <h2>Financial Model — ${esc(DEFAULT_DCF_INPUTS.projectName)}</h2>
      <p class="subtitle">${DEFAULT_DCF_INPUTS.totalCapacityMW} MW IT · ${DEFAULT_DCF_INPUTS.country} · 20-Year DCF</p>
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-label">Total Capex</div><div class="kpi-value">$${fin.totalCapexUSDM.toFixed(0)}M</div></div>
        <div class="kpi"><div class="kpi-label">Equity IRR</div><div class="kpi-value">${fmtPct(fin.equityIRRPct)}</div></div>
        <div class="kpi"><div class="kpi-label">Project IRR</div><div class="kpi-value">${fmtPct(fin.projectIRRPct)}</div></div>
        <div class="kpi"><div class="kpi-label">Min DSCR</div><div class="kpi-value">${fin.minDSCR.toFixed(2)}×</div></div>
        <div class="kpi"><div class="kpi-label">Payback</div><div class="kpi-value">${fin.paybackPeriodYears != null ? 'Y' + fin.paybackPeriodYears : 'N/A'}</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Yr</th><th>Cal Yr</th><th>MW</th><th>Util%</th>
            <th>Rev $M</th><th>EBITDA $M</th><th>EBITDA%</th>
            <th>ProjFCF $M</th><th>Debt Svc $M</th><th>DSCR</th><th>Cum Eq CF $M</th>
          </tr>
        </thead>
        <tbody>
          ${fin.yearlyData.filter(r => r.year > 0).map(r => `
            <tr>
              <td class="num">${r.year}</td>
              <td class="num">${r.calendarYear}</td>
              <td class="num">${r.capacityMW}</td>
              <td class="num">${(r.utilisationPct * 100).toFixed(0)}%</td>
              <td class="num">${fmt2(r.revenueUSDM)}</td>
              <td class="num">${fmt2(r.ebitdaUSDM)}</td>
              <td class="num">${r.ebitdaMarginPct.toFixed(0)}%</td>
              <td class="num">${fmt2(r.projectFcfUSDM)}</td>
              <td class="num">${fmt2(r.totalDebtServiceUSDM)}</td>
              <td class="num">${r.dscrRatio != null ? r.dscrRatio.toFixed(2) : '—'}</td>
              <td class="num">${fmt2(r.cumulativeEquityCfUSDM)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </section>
  ` : '<section><h2>Financial Model</h2><p>No model data available.</p></section>';

  const dcCountByStatus = (status: string) =>
    DC_DATABASE.filter(d => d.status === status).length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>DC SiteIQ — Site Intelligence Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #111; background: #fff; padding: 24px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 14px; border-bottom: 2px solid #111; padding-bottom: 6px; margin: 24px 0 12px; }
  h3 { font-size: 12px; margin-bottom: 4px; }
  .meta { font-size: 10px; color: #666; margin-bottom: 6px; }
  .subtitle { font-size: 10px; color: #666; margin-bottom: 12px; }
  .cover { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #ccc; }
  .cover-right { font-size: 10px; color: #666; text-align: right; }
  .stat-row { display: flex; gap: 16px; margin-bottom: 20px; }
  .stat { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; }
  .stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 4px; }
  .stat-value { font-size: 20px; font-weight: 700; font-family: monospace; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
  th { background: #f0f0f0; text-align: left; padding: 5px 6px; font-weight: 600; border: 1px solid #ddd; }
  td { padding: 4px 6px; border: 1px solid #ddd; vertical-align: top; }
  .num { text-align: right; font-family: monospace; }
  .site-card { border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; page-break-inside: avoid; }
  .score-big { font-size: 36px; font-weight: 700; font-family: monospace; margin: 8px 0; }
  .score-big span { font-size: 14px; color: #666; }
  .score-table { margin: 8px 0 12px; }
  .bar { width: 80px; height: 6px; background: #eee; border-radius: 3px; display: inline-block; vertical-align: middle; }
  .bar-fill { height: 100%; border-radius: 3px; background: #2563eb; }
  .notes { font-size: 10px; color: #555; line-height: 1.5; margin-top: 8px; font-style: italic; }
  .kpi-row { display: flex; gap: 12px; margin-bottom: 16px; }
  .kpi { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; }
  .kpi-label { font-size: 9px; text-transform: uppercase; color: #666; margin-bottom: 4px; }
  .kpi-value { font-size: 16px; font-weight: 700; font-family: monospace; }
  @media print {
    body { padding: 0; }
    section { page-break-before: auto; }
    .site-card { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="cover">
  <div>
    <h1>DC SiteIQ — Site Intelligence Report</h1>
    <p class="meta">Southeast Asia Data Centre Intelligence Platform</p>
  </div>
  <div class="cover-right">
    <p>Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p>Confidential — Internal Use Only</p>
  </div>
</div>

<section>
  <h2>Market Overview</h2>
  <div class="stat-row">
    <div class="stat"><div class="stat-label">Total DC Capacity Tracked</div><div class="stat-value">${totalCapacityMW.toLocaleString()} MW</div></div>
    <div class="stat"><div class="stat-label">Pipeline (Construction + Announced)</div><div class="stat-value">${pipelineMW.toLocaleString()} MW</div></div>
    <div class="stat"><div class="stat-label">Facilities in Database</div><div class="stat-value">${totalDCs}</div></div>
    <div class="stat"><div class="stat-label">Sites Under Evaluation</div><div class="stat-value">${EXAMPLE_SITES.length}</div></div>
  </div>
  <table>
    <thead><tr><th>Status</th><th>Count</th><th>Capacity (MW)</th></tr></thead>
    <tbody>
      ${(['operational','construction','announced','rumoured'] as const).map(s =>
        `<tr><td style="text-transform:capitalize">${s}</td>
         <td class="num">${dcCountByStatus(s)}</td>
         <td class="num">${DC_DATABASE.filter(d => d.status === s).reduce((a, d) => a + d.capacityMW, 0).toLocaleString()}</td></tr>`
      ).join('')}
    </tbody>
  </table>
</section>

<section>
  <h2>Site Shortlist — Scored Rankings</h2>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Site</th><th>Location</th><th>Total</th>
        <th>Power</th><th>Comp.</th><th>Utilities</th><th>Land &amp; Reg.</th><th>Market</th>
      </tr>
    </thead>
    <tbody>${siteRows}</tbody>
  </table>
</section>

<section>
  <h2>Top ${top3.length} Sites — Detailed Breakdown</h2>
  ${topSiteCards}
</section>

${finSection}

</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this site.'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}
