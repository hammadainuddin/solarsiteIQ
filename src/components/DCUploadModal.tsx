import { useState, useRef } from 'react';
import { X, Download, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { DC_DATABASE } from '../data/dcDatabase';
import type { DataCentre, DCStatus, TierRating, OperatorType, Country } from '../types';

interface Props {
  onClose: () => void;
  onImport: (dcs: DataCentre[]) => void;
}

const TEMPLATE_HEADERS = [
  'id', 'name', 'operator', 'country', 'city', 'lat', 'lng',
  'status', 'expectedCOD', 'capacityMW', 'itLoadMW', 'pue',
  'tierRating', 'operatorType', 'powerSource', 'landAreaHa',
  'hyperscalerTenants', 'notes',
];

const DC_STATUSES: DCStatus[] = ['operational', 'construction', 'announced', 'rumoured'];
const TIER_RATINGS: TierRating[] = ['I', 'II', 'III', 'IV'];
const OP_TYPES: OperatorType[] = ['colo', 'hyperscale', 'enterprise', 'government', 'carrier_neutral'];
const COUNTRIES: Country[] = ['MY', 'SG', 'ID', 'TH', 'VN', 'PH', 'MM', 'KH', 'LA', 'BN'];

interface ParsedRow {
  index: number;
  data: Partial<DataCentre>;
  errors: string[];
}

function escapeCSV(val: unknown): string {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function buildTemplate(): string {
  return TEMPLATE_HEADERS.join(',') + '\n';
}

function buildCurrentDB(): string {
  const rows = DC_DATABASE.map((d) => [
    d.id, d.name, d.operator, d.country, d.city,
    d.coordinates.lat, d.coordinates.lng,
    d.status, d.expectedCOD, d.capacityMW, d.itLoadMW, d.pue,
    d.tierRating, d.operatorType, d.powerSource, d.landAreaHa,
    d.hyperscalerTenants.join(';'),
    d.notes ?? '',
  ].map(escapeCSV).join(','));
  return TEMPLATE_HEADERS.join(',') + '\n' + rows.join('\n');
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuote = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else { cur += ch; }
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

function validateRows(rows: string[][]): ParsedRow[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name.toLowerCase());

  return rows.slice(1).map((cells, i) => {
    const get = (col: string) => (cells[idx(col)] ?? '').trim();
    const errors: string[] = [];

    const id = get('id') || `UPLOAD-${Date.now()}-${i}`;
    const name = get('name');
    if (!name) errors.push('name required');
    const operator = get('operator');
    if (!operator) errors.push('operator required');
    const country = get('country') as Country;
    if (!COUNTRIES.includes(country)) errors.push(`country must be one of ${COUNTRIES.join('|')}`);
    const city = get('city');
    if (!city) errors.push('city required');

    const lat = parseFloat(get('lat'));
    const lng = parseFloat(get('lng'));
    if (isNaN(lat) || lat < -11 || lat > 29) errors.push('lat out of SEA range');
    if (isNaN(lng) || lng < 92 || lng > 142) errors.push('lng out of SEA range');

    const status = get('status') as DCStatus;
    if (!DC_STATUSES.includes(status)) errors.push(`status must be ${DC_STATUSES.join('|')}`);

    const capacityMW = parseFloat(get('capacityMW'));
    if (isNaN(capacityMW) || capacityMW <= 0) errors.push('capacityMW must be > 0');

    const itLoadMW = parseFloat(get('itLoadMW'));
    if (isNaN(itLoadMW) || itLoadMW <= 0) errors.push('itLoadMW must be > 0');

    const pue = parseFloat(get('pue'));
    if (isNaN(pue) || pue < 1 || pue > 4) errors.push('pue must be 1–4');

    const tierRating = get('tierRating') as TierRating;
    if (!TIER_RATINGS.includes(tierRating)) errors.push(`tierRating must be ${TIER_RATINGS.join('|')}`);

    const operatorType = get('operatorType') as OperatorType;
    if (!OP_TYPES.includes(operatorType)) errors.push(`operatorType must be ${OP_TYPES.join('|')}`);

    const landAreaHa = parseFloat(get('landAreaHa'));
    if (isNaN(landAreaHa) || landAreaHa <= 0) errors.push('landAreaHa must be > 0');

    const tenantStr = get('hyperscalerTenants');
    const hyperscalerTenants = tenantStr ? tenantStr.split(';').map((t) => t.trim()).filter(Boolean) : [];

    const data: Partial<DataCentre> = {
      id,
      name,
      operator,
      country,
      city,
      coordinates: { lat, lng },
      status,
      expectedCOD: get('expectedCOD') || String(new Date().getFullYear()),
      capacityMW,
      itLoadMW,
      pue,
      tierRating,
      operatorType,
      powerSource: get('powerSource') || 'Grid',
      landAreaHa,
      hyperscalerTenants,
      notes: get('notes') || undefined,
      sourceReliability: 'inferred',
    };

    return { index: i + 2, data, errors };
  });
}

export function DCUploadModal({ onClose, onImport }: Props) {
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows = parsed?.filter((r) => r.errors.length === 0) ?? [];
  const invalidCount = (parsed?.length ?? 0) - validRows.length;

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      setParsed(validateRows(rows));
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleConfirm() {
    const dcs = validRows.map((r) => r.data as DataCentre);
    onImport(dcs);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg border border-border rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base">Import Data Centres</h2>
            <p className="text-muted text-xs mt-0.5">Upload a CSV to add DCs to the database</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-white hover:bg-surface-2 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left panel */}
          <div className="w-64 shrink-0 border-r border-border px-5 py-5 flex flex-col gap-4 overflow-y-auto">
            <div>
              <p className="text-white text-xs font-semibold mb-2">1. Download template</p>
              <button
                onClick={() => downloadCSV('dc_template.csv', buildTemplate())}
                className="w-full flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-muted hover:text-white hover:border-accent/40 transition-colors"
              >
                <Download size={12} /> Empty template
              </button>
              <button
                onClick={() => downloadCSV('dc_database.csv', buildCurrentDB())}
                className="mt-1.5 w-full flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-muted hover:text-white hover:border-accent/40 transition-colors"
              >
                <Download size={12} /> Current database ({DC_DATABASE.length} DCs)
              </button>
            </div>

            <div>
              <p className="text-white text-xs font-semibold mb-2">2. Upload your CSV</p>
              <div
                className="border-2 border-dashed border-border rounded-lg px-3 py-6 flex flex-col items-center gap-2 cursor-pointer hover:border-accent/50 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <Upload size={20} className="text-muted" />
                <p className="text-muted text-[10px] text-center leading-snug">
                  {fileName || 'Click or drag a CSV file here'}
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {parsed && (
              <div className="bg-surface border border-border rounded-lg p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 size={12} />
                  <span>{validRows.length} valid rows</span>
                </div>
                {invalidCount > 0 && (
                  <div className="flex items-center gap-1.5 text-red-400">
                    <AlertCircle size={12} />
                    <span>{invalidCount} invalid rows</span>
                  </div>
                )}
              </div>
            )}

            <div className="text-[10px] text-muted/70 leading-relaxed">
              <p className="font-semibold text-muted mb-1">Required columns:</p>
              <p>name, operator, country, city, lat, lng, status, capacityMW, itLoadMW, pue, tierRating, operatorType, landAreaHa</p>
            </div>
          </div>

          {/* Right panel — preview */}
          <div className="flex-1 overflow-auto px-5 py-5">
            {!parsed && (
              <div className="h-full flex items-center justify-center">
                <p className="text-muted text-sm">Upload a CSV file to preview rows here</p>
              </div>
            )}
            {parsed && parsed.length === 0 && (
              <p className="text-muted text-sm">No data rows found in file.</p>
            )}
            {parsed && parsed.length > 0 && (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-bg z-10">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left text-muted font-medium w-8">#</th>
                    <th className="px-2 py-2 text-left text-muted font-medium">Status</th>
                    <th className="px-2 py-2 text-left text-muted font-medium">Name</th>
                    <th className="px-2 py-2 text-left text-muted font-medium">Operator</th>
                    <th className="px-2 py-2 text-left text-muted font-medium">Country</th>
                    <th className="px-2 py-2 text-left text-muted font-medium">City</th>
                    <th className="px-2 py-2 text-left text-muted font-medium">MW</th>
                    <th className="px-2 py-2 text-left text-muted font-medium">COD</th>
                    <th className="px-2 py-2 text-left text-muted font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.map((row) => (
                    <tr key={row.index} className={row.errors.length > 0 ? 'bg-red-500/5' : 'hover:bg-surface-2'}>
                      <td className="px-2 py-2 text-muted font-mono">{row.index}</td>
                      <td className="px-2 py-2">
                        {row.errors.length === 0
                          ? <CheckCircle2 size={12} className="text-emerald-400" />
                          : <AlertCircle size={12} className="text-red-400" />}
                      </td>
                      <td className="px-2 py-2 text-white">{String(row.data.name ?? '—')}</td>
                      <td className="px-2 py-2 text-muted">{String(row.data.operator ?? '—')}</td>
                      <td className="px-2 py-2 text-white font-mono">{String(row.data.country ?? '—')}</td>
                      <td className="px-2 py-2 text-muted">{String(row.data.city ?? '—')}</td>
                      <td className="px-2 py-2 text-white font-mono">{row.data.capacityMW != null && !isNaN(row.data.capacityMW) ? row.data.capacityMW : '—'}</td>
                      <td className="px-2 py-2 text-muted">{String(row.data.expectedCOD ?? '—')}</td>
                      <td className="px-2 py-2 text-red-400 text-[10px]">{row.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <p className="text-muted text-xs">
            {validRows.length > 0
              ? `${validRows.length} rows ready to import`
              : 'No valid rows to import'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:text-white border border-border hover:border-border/60 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={validRows.length === 0}
              className="px-4 py-2 text-sm font-semibold bg-accent hover:bg-accent-hover disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              Import {validRows.length > 0 ? `${validRows.length} DCs` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
