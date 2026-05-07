import { useMemo } from 'react';
import { Polygon, Tooltip } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
import type { HexTile, HexScoreDimension } from '../types';
import { hexBoundary } from '../utils/hexGrid';
import { scoreToColor, scoreToVerdict } from '../utils/solarScoring';

interface Props {
  tiles: HexTile[];
  activeDimension: HexScoreDimension;
  stateFilter: string; // 'All' | 'Perak' | 'Kedah' | 'Penang' | 'Perlis'
  onTileClick: (tile: HexTile) => void;
  selectedTileIndex?: string;
}

const DIMENSION_LABELS: Record<HexScoreDimension, string> = {
  solar:        'Solar Resource',
  grid:         'Grid Interconnection',
  land:         'Land Suitability',
  availability: 'Land Availability',
  climate:      'Climate Risk',
  road:         'Road Access',
  envSocial:    'Env & Social',
  composite:    'Composite',
};

function HexTilePolygon({
  tile,
  activeDimension,
  onClick,
  isSelected,
}: {
  tile: HexTile;
  activeDimension: HexScoreDimension;
  onClick: () => void;
  isSelected: boolean;
}) {
  const score = tile.scores[activeDimension];
  const positions = useMemo<LatLngTuple[]>(
    () => hexBoundary(tile.h3Index).map(([lat, lng]) => [lat, lng]),
    [tile.h3Index],
  );

  const fillColor = scoreToColor(score, isSelected ? 0.9 : 0.6);
  const borderColor = isSelected ? '#fff' : scoreToColor(score, 0.85);

  return (
    <Polygon
      positions={positions}
      pathOptions={{
        fillColor,
        fillOpacity: isSelected ? 0.9 : 0.6,
        color: borderColor,
        weight: isSelected ? 2 : 0.5,
      }}
      eventHandlers={{ click: onClick }}
    >
      <Tooltip sticky>
        <div style={{ fontSize: 12, lineHeight: 1.6, minWidth: 180 }}>
          <strong style={{ display: 'block' }}>{tile.state ?? 'Unknown'}</strong>
          <div>{DIMENSION_LABELS[activeDimension]}: <strong>{score}</strong>/100</div>
          <div>Composite: <strong>{tile.scores.composite}</strong> — {scoreToVerdict(tile.scores.composite)}</div>
          <div>GHI: {tile.attributes.ghiKwhM2Day} kWh/m²/d · Land: {tile.attributes.landUse.replace(/_/g, ' ')}</div>
          <div style={{ color: '#fbbf24' }}>Est. capacity: <strong>{tile.attributes.estimatedCapacityMW} MW</strong></div>
        </div>
      </Tooltip>
    </Polygon>
  );
}

export default function HexGridLayer({ tiles, activeDimension, stateFilter, onTileClick, selectedTileIndex }: Props) {
  const filtered = useMemo(
    () => (stateFilter === 'All' ? tiles : tiles.filter((t) => t.state === stateFilter)),
    [tiles, stateFilter],
  );

  return (
    <>
      {filtered.map((tile) => (
        <HexTilePolygon
          key={tile.h3Index}
          tile={tile}
          activeDimension={activeDimension}
          onClick={() => onTileClick(tile)}
          isSelected={tile.h3Index === selectedTileIndex}
        />
      ))}
    </>
  );
}
