import { Polyline, Tooltip } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
import { useAppContext } from '../context/AppContext';

const STATE_COLORS: Record<string, string> = {
  Perlis: '#a78bfa',
  Kedah:  '#34d399',
  Penang: '#f472b6',
  Perak:  '#fb923c',
};

export default function StateBoundaries() {
  const { boundaries } = useAppContext();
  if (!boundaries || boundaries.length === 0) return null;

  return (
    <>
      {boundaries.flatMap((sb) =>
        sb.rings.map((ring, ri) => (
          <Polyline
            key={`${sb.state}-${ri}`}
            positions={ring as LatLngTuple[]}
            pathOptions={{
              color: STATE_COLORS[sb.state] ?? '#94a3b8',
              weight: 2,
              opacity: 0.9,
              dashArray: '8 4',
              fillOpacity: 0,
            }}
          >
            <Tooltip sticky direction="top">
              <span style={{ fontWeight: 600, color: STATE_COLORS[sb.state] }}>{sb.state}</span>
            </Tooltip>
          </Polyline>
        )),
      )}
    </>
  );
}
