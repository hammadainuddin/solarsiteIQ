import { useState, useRef } from 'react';
import { X, Download, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { SUBSTATIONS } from '../data/infraLayers';
import type { SubstationFeature } from '../data/infraLayers';

interface Props {
  onClose: () => void;
  onImport: (subs: SubstationFeature[]) => void;
}

const TEMPLATE_HEADERS = [
  'id', 'name', 'operator', 'lat', 'lng',
  'voltageKV', 'capacityMVA', 'availableHeadroomMVA',
  'dedicatedFeedAvailable', 'notes',
];

interface ParsedRow {
  index: number;
  data: Partial<SubstationFeature>;
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
  const rows = SUBSTATIONS.map((s) => [
    s.id, s.properties.name, s.properties.operator, s.lat, s.lng,
    s.properties.voltageKV, s.properties.capacityMVA, s.properties.availableHeadroomMVA,
    s.properties.dedicatedFeedAvailable ? 'true' : 'false',
    s.properties.notes ?? '',
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

    const id = get('id') || `SUB-UPLOAD-${Date.now()}-${i}`;
    const name = get('name');
    if (!name) errors.push('name required');

    const operator = get('operator');
    if (!operator.trim()) errors.push('operator required');

    const lat = parseFloat(get('lat'));
    const lng = parseFloat(get('lng'));
    if (isNaN(lat) || lat < -11 || lat > 29) errors.push('lat out of SEA range');
    if (isNaN(lng) || lng < 92 || lng > 142) errors.push('lng out of SEA range');

    const voltageKV = parseFloat(get('voltageKV'));
    if (isNaN(voltageKV) || voltageKV <= 0) errors.push('voltageKV must be > 0');

    const capacityMVA = parseFloat(get('capacityMVA'));
    if (isNaN(capacityMVA) || capacityMVA <= 0) errors.push('capacityMVA must be > 0');

    const availableHeadroomMVA = parseFloat(get('availableHeadroomMVA'));
    if (isNaN(availableHeadroomMVA) || availableHeadroomMVA < 0) errors.push('availableHeadroomMVA must be ≥ 0');

    const dedicatedRaw = get('dedicatedFeedAvailable').toLowerCase();
    const dedicatedFeedAvailable = dedicatedRaw === 'true' || dedicatedRaw === '1' || dedicatedRaw === 'yes';

    const data: Partial<SubstationFeature> = {
      id,
      lat,
      lng,
      properties: {
        name,
        operator,
        voltageKV,
        capacityMVA,
        availableHeadroomMVA,
        dedicatedFeedAvailable,
        notes: get('notes') || undefined,
      },
    };

    return { index: i + 2, data, errors };
  });
}

export function SubstationUploadModal({ onClose, onImport }: Props) {
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
    const subs = validRows.map((r) => r.data as SubstationFeature);
    onImport(subs);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg border border-border rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base">Import Substations</h2>
            <p className="text-muted text-xs mt-0.5">Upload a CSV to add T&D substations to the map</p>
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
                onClick={() => downloadCSV('substation_template.csv', buildTemplate())}
                className="w-full flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-muted hover:text-white hover:border-accent/40 transition-colors"
              >
                <Download size={12} /> Empty template
              </button>
              <button
                onClick={() => downloadCSV('substation_database.csv', buildCurrentDB())}
                className="mt-1.5 w-full flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-muted hover:text-white hover:border-accent/40 transition-colors"
              >
                <Download size={12} /> Current database ({SUBSTATIONS.length} substations)
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
              <p className="font-semibold text-muted mb-1">Operator values:</p>
              <p>{VALID_OPERATORS.join(' · ')}</p>
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
                    <th className="px-2 py-2 text-left text-muted font-medium">kV</th>
                    <th className="px-2 py-2 text-left text-muted font-medium">Cap. MVA</th>
                    <th className="px-2 py-2 text-left text-muted font-medium">Headroom</th>
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
                      <td className="px-2 py-2 text-white">{String(row.data.properties?.name ?? '—')}</td>
                      <td className="px-2 py-2 text-muted">{String(row.data.properties?.operator ?? '—')}</td>
                      <td className="px-2 py-2 text-white font-mono">{row.data.properties?.voltageKV ?? '—'}</td>
                      <td className="px-2 py-2 text-white font-mono">{row.data.properties?.capacityMVA ?? '—'}</td>
                      <td className="px-2 py-2 text-emerald-400 font-mono">{row.data.properties?.availableHeadroomMVA ?? '—'}</td>
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
              ? `${validRows.length} substations ready to import`
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
              Import {validRows.length > 0 ? `${validRows.length} substations` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
