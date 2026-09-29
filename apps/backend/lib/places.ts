// places.ts: names a coarse 5-char region after the nearest well-known city ("Near Bogotá"), from a
// small built-in list. No network call, no reverse geocoding service: the input is the region's cell
// centre only, and the output is coarser than the cell. Unknown or remote cells stay unnamed.

import { decodeGeohashBounds } from "./geohash";

export interface Place {
  name: string;
  country: string;
}

/** A cell is named only if a listed city is this close to its centre. */
const MAX_KM = 40;

// [name, country, lat, lng]: capitals and large cities in UNICEF programme countries, plus the
// demo and partner cities. Coordinates are city centres, rounded; precision beyond ~1 km is moot.
const CITIES: [string, string, number, number][] = [
  ["Bogotá", "Colombia", 4.711, -74.072],
  ["Medellín", "Colombia", 6.244, -75.581],
  ["Cali", "Colombia", 3.452, -76.532],
  ["Barranquilla", "Colombia", 10.964, -74.796],
  ["Cartagena", "Colombia", 10.391, -75.479],
  ["Lima", "Peru", -12.046, -77.043],
  ["Quito", "Ecuador", -0.18, -78.467],
  ["Guayaquil", "Ecuador", -2.17, -79.922],
  ["La Paz", "Bolivia", -16.5, -68.15],
  ["Caracas", "Venezuela", 10.48, -66.904],
  ["Santiago", "Chile", -33.449, -70.669],
  ["Buenos Aires", "Argentina", -34.604, -58.382],
  ["São Paulo", "Brazil", -23.551, -46.633],
  ["Rio de Janeiro", "Brazil", -22.907, -43.173],
  ["Brasília", "Brazil", -15.794, -47.882],
  ["Asunción", "Paraguay", -25.264, -57.576],
  ["Montevideo", "Uruguay", -34.901, -56.164],
  ["Mexico City", "Mexico", 19.433, -99.133],
  ["Guatemala City", "Guatemala", 14.634, -90.507],
  ["Tegucigalpa", "Honduras", 14.072, -87.192],
  ["San Salvador", "El Salvador", 13.692, -89.218],
  ["Managua", "Nicaragua", 12.114, -86.236],
  ["San José", "Costa Rica", 9.928, -84.091],
  ["Panama City", "Panama", 8.983, -79.517],
  ["Port-au-Prince", "Haiti", 18.594, -72.307],
  ["Santo Domingo", "Dominican Republic", 18.486, -69.931],
  ["Havana", "Cuba", 23.113, -82.366],
  ["Nairobi", "Kenya", -1.292, 36.822],
  ["Mombasa", "Kenya", -4.043, 39.668],
  ["Kampala", "Uganda", 0.347, 32.582],
  ["Kigali", "Rwanda", -1.944, 30.062],
  ["Dar es Salaam", "Tanzania", -6.792, 39.208],
  ["Dodoma", "Tanzania", -6.163, 35.752],
  ["Addis Ababa", "Ethiopia", 9.03, 38.74],
  ["Mogadishu", "Somalia", 2.047, 45.318],
  ["Juba", "South Sudan", 4.859, 31.571],
  ["Khartoum", "Sudan", 15.5, 32.56],
  ["Kinshasa", "DR Congo", -4.441, 15.266],
  ["Goma", "DR Congo", -1.679, 29.222],
  ["Lagos", "Nigeria", 6.524, 3.379],
  ["Abuja", "Nigeria", 9.076, 7.399],
  ["Kano", "Nigeria", 12.002, 8.592],
  ["Accra", "Ghana", 5.604, -0.187],
  ["Dakar", "Senegal", 14.716, -17.467],
  ["Bamako", "Mali", 12.639, -8.003],
  ["Niamey", "Niger", 13.512, 2.112],
  ["Ouagadougou", "Burkina Faso", 12.371, -1.52],
  ["N'Djamena", "Chad", 12.134, 15.056],
  ["Freetown", "Sierra Leone", 8.466, -13.231],
  ["Monrovia", "Liberia", 6.301, -10.797],
  ["Conakry", "Guinea", 9.641, -13.578],
  ["Abidjan", "Côte d'Ivoire", 5.36, -4.008],
  ["Douala", "Cameroon", 4.051, 9.768],
  ["Yaoundé", "Cameroon", 3.848, 11.502],
  ["Luanda", "Angola", -8.839, 13.289],
  ["Maputo", "Mozambique", -25.969, 32.573],
  ["Lusaka", "Zambia", -15.387, 28.323],
  ["Harare", "Zimbabwe", -17.825, 31.034],
  ["Lilongwe", "Malawi", -13.963, 33.774],
  ["Antananarivo", "Madagascar", -18.879, 47.508],
  ["Johannesburg", "South Africa", -26.204, 28.047],
  ["Cape Town", "South Africa", -33.925, 18.424],
  ["Cairo", "Egypt", 30.044, 31.236],
  ["Dhaka", "Bangladesh", 23.811, 90.413],
  ["Cox's Bazar", "Bangladesh", 21.427, 92.006],
  ["Kathmandu", "Nepal", 27.717, 85.324],
  ["Delhi", "India", 28.614, 77.209],
  ["Mumbai", "India", 19.076, 72.878],
  ["Kolkata", "India", 22.573, 88.364],
  ["Karachi", "Pakistan", 24.861, 67.01],
  ["Lahore", "Pakistan", 31.52, 74.359],
  ["Islamabad", "Pakistan", 33.684, 73.048],
  ["Kabul", "Afghanistan", 34.555, 69.207],
  ["Sana'a", "Yemen", 15.369, 44.191],
  ["Aden", "Yemen", 12.785, 45.019],
  ["Amman", "Jordan", 31.954, 35.911],
  ["Beirut", "Lebanon", 33.894, 35.502],
  ["Damascus", "Syria", 33.514, 36.277],
  ["Baghdad", "Iraq", 33.315, 44.366],
  ["Gaza", "State of Palestine", 31.502, 34.467],
  ["Manila", "Philippines", 14.6, 120.984],
  ["Jakarta", "Indonesia", -6.208, 106.846],
  ["Yangon", "Myanmar", 16.866, 96.195],
  ["Phnom Penh", "Cambodia", 11.556, 104.928],
  ["Hanoi", "Viet Nam", 21.028, 105.834],
  ["Ho Chi Minh City", "Viet Nam", 10.823, 106.63],
  ["Bangkok", "Thailand", 13.756, 100.502],
  ["Colombo", "Sri Lanka", 6.927, 79.861],
  ["Dili", "Timor-Leste", -8.556, 125.56],
  ["Port Moresby", "Papua New Guinea", -9.443, 147.18],
  ["Tashkent", "Uzbekistan", 41.299, 69.24],
  ["Kyiv", "Ukraine", 50.45, 30.524],
  ["Stockholm", "Sweden", 59.329, 18.069],
  ["Copenhagen", "Denmark", 55.676, 12.568],
  ["Geneva", "Switzerland", 46.204, 6.143],
  ["London", "United Kingdom", 51.507, -0.128],
  ["New York", "United States", 40.713, -74.006],
  ["San Francisco", "United States", 37.775, -122.419],
];

function km(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

const cache = new Map<string, Place | null>();

/** Nearest listed city within MAX_KM of the region's cell centre, or null. */
export function placeFor(region: string): Place | null {
  if (cache.has(region)) return cache.get(region) ?? null;
  const b = decodeGeohashBounds(region);
  let best: Place | null = null;
  if (b) {
    const lat = (b.minLat + b.maxLat) / 2;
    const lng = (b.minLng + b.maxLng) / 2;
    let bestKm = MAX_KM;
    for (const [name, country, clat, clng] of CITIES) {
      const d = km(lat, lng, clat, clng);
      if (d <= bestKm) {
        bestKm = d;
        best = { name, country };
      }
    }
  }
  cache.set(region, best);
  return best;
}

/** "Near Bogotá" for a named region; empty for an unnamed or missing one. */
export function placeLabel(region: string): string {
  const p = region ? placeFor(region) : null;
  return p ? `Near ${p.name}` : "";
}

/** Lower-case, accent-free text so "bogota" finds "Bogotá". */
export function foldText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
