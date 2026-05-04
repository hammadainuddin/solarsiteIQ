import type { InfraLayer, MapLayerId } from '../types';

interface LayerToggleProps {
  layers: InfraLayer[];
  activeLayers: MapLayerId[];
  onToggle: (id: MapLayerId) => void;
}

export function LayerToggle({ layers, activeLayers, onToggle }: LayerToggleProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h3 className="text-white text-xs font-semibold uppercase tracking-wider mb-3">
        Infrastructure Layers
      </h3>
      <div className="space-y-2">
        {layers.map((layer) => {
          const active = activeLayers.includes(layer.id);
          return (
            <button
              key={layer.id}
              onClick={() => onToggle(layer.id)}
              className="w-full flex items-center gap-3 py-1.5 rounded-lg hover:bg-surface-2 transition-colors px-1"
            >
              <span
                className={`w-3 h-3 rounded-sm shrink-0 transition-opacity ${active ? 'opacity-100' : 'opacity-25'}`}
                style={{ backgroundColor: layer.color }}
              />
              <span
                className={`text-xs transition-colors ${
                  active ? 'text-white' : 'text-muted'
                }`}
              >
                {layer.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
