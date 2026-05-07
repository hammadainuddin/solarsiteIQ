import { useMemo } from 'react';
import { Polygon, Tooltip } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
import type { HexTile } from '../types';
import { hexBoundary } from '../utils/hexGrid';

interface Props {
  tiles: HexTile[];
  maxTiles?: number;
}

function rankColor(rank: number): string {
  if (rank <= 5)  return '#4ade80'; // green  — top 5
  if (rank <= 15) return '#22d3ee'; // cyan   — 6–15
  return '#fbbf24';                 // amber  — 16–25
}

function fmtCapacity(mw: number): string {
  return mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : `${mw} MW`;
}

export default function REZClusters({ tiles, maxTiles = 25 }: Props) {
  const top = useMemo(
    () =>
      [...tiles]
        .sort((a, b) => b.scores.composite - a.scores.composite)
        .slice(0, maxTiles),
    [tiles, maxTiles],
  );

  return (
    <>
      {top.map((tile, i) => {
        const rank = i + 1;
        const color = rankColor(rank);
        const positions = hexBoundary(tile.h3Index).map(([lat, lng]) => [lat, lng] as LatLngTuple);

        return (
          <Polygon
            key={`rez-${tile.h3Index}`}
            positions={positions}
            pathOptions={{
              fillOpacity: 0,
              color,
              weight: rank <= 5 ? 2.5 : 1.5,
              dashArray: '5 4',
            }}
          >
            <Tooltip sticky>
              <div style={{ fontSize: 11, lineHeight: 1.6, minWidth: 170 }}>
                <strong style={{ color, display: 'block' }}>REZ Candidate #{rank}</strong>
                <div>Composite: <strong>{tile.scores.composite}</strong>/100</div>
                <div>Est. capacity: <strong>{fmtCapacity(tile.attributes.estimatedCapacityMW)}</strong></div>
                <div>Land: {tile.attributes.landUse.replace(/_/g, ' ')} · {tile.state}</div>
                <div>GHI: {tile.attributes.ghiKwhM2Day} kWh/m²/d</div>
              </div>
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}
