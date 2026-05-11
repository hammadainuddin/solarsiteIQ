// Simplified polygon outlines for the four northern states of Peninsular Malaysia.
// Coordinates are [lat, lng] pairs forming closed rings (first = last point).
// These are approximate — accurate enough for hex-tile assignment verification.

export interface StateBoundary {
  state: string;
  color: string;
  polygons: [number, number][][]; // supports multi-part (e.g. Penang island + mainland)
}

export const STATE_BOUNDARIES: StateBoundary[] = [
  {
    state: 'Perlis',
    color: '#a78bfa', // violet
    polygons: [[
      [6.720, 100.108],
      [6.720, 100.295],
      [6.720, 100.508],
      [6.601, 100.510],
      [6.500, 100.492],
      [6.380, 100.488],
      [6.303, 100.340],
      [6.258, 100.165],
      [6.340, 100.038],
      [6.472, 99.988],
      [6.565, 99.982],
      [6.650, 100.045],
      [6.720, 100.108],
    ]],
  },
  {
    state: 'Kedah',
    color: '#34d399', // emerald
    polygons: [[
      // SW coast, going north
      [5.393, 100.450],
      [5.540, 100.360],
      [5.680, 100.188],
      [5.802, 100.143],
      [6.042, 100.118],
      // NW meets Perlis SW
      [6.258, 100.165],
      [6.303, 100.340],
      [6.380, 100.488],
      // North (Thai border), going east
      [6.267, 100.625],
      [6.268, 100.860],
      [6.280, 101.085],
      // East (Kedah-Perak border, going south)
      [6.050, 101.055],
      [5.820, 101.010],
      [5.660, 100.995],
      [5.528, 100.970],
      [5.360, 100.930],
      // SE (toward Penang/Perak)
      [5.297, 100.872],
      [5.280, 100.720],
      [5.297, 100.558],
      [5.393, 100.450],
    ]],
  },
  {
    state: 'Penang',
    color: '#f472b6', // pink
    polygons: [
      // Penang Island
      [
        [5.478, 100.178],
        [5.478, 100.285],
        [5.466, 100.435],
        [5.322, 100.442],
        [5.225, 100.370],
        [5.235, 100.210],
        [5.312, 100.163],
        [5.420, 100.163],
        [5.478, 100.178],
      ],
      // Seberang Prai (mainland)
      [
        [5.555, 100.352],
        [5.556, 100.522],
        [5.508, 100.628],
        [5.440, 100.690],
        [5.338, 100.670],
        [5.246, 100.522],
        [5.297, 100.450],
        [5.393, 100.358],
        [5.472, 100.342],
        [5.555, 100.352],
      ],
    ],
  },
  {
    state: 'Perak',
    color: '#fb923c', // orange
    polygons: [[
      // Northern border (with Kedah) from west
      [5.530, 100.340],
      [5.640, 100.410],
      [5.650, 100.600],
      [5.658, 100.850],
      [5.655, 101.000],
      // Gerik / Hulu Perak — northern extent reaching Thai border area
      [5.720, 101.100],
      [5.750, 101.310],
      [5.760, 101.530],
      [5.840, 101.600], // Thai border area
      // Eastern border (Kelantan / Pahang boundary)
      [5.720, 101.750],
      [5.500, 101.880],
      [5.200, 101.950],
      [4.900, 101.900],
      [4.600, 101.880],
      [4.300, 101.820],
      [4.000, 101.600],
      [3.820, 101.440],
      [3.730, 101.200],
      // Southern tip
      [3.700, 101.000],
      [3.730, 100.920],
      // West coast going north
      [3.820, 100.875],
      [4.000, 100.688],
      [4.300, 100.522],
      [4.520, 100.420],
      [4.620, 100.372],
      [4.850, 100.387],
      [5.000, 100.380],
      [5.100, 100.430],
      [5.297, 100.450],
      [5.393, 100.450],
      [5.530, 100.340],
    ]],
  },
];
