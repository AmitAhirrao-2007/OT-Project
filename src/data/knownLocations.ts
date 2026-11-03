export interface LocationPoint {
  id: string;
  name: string;
  subTitle: string;
  state: string;
  coordinates: [number, number]; // [lat, lng]
}

export const POPULAR_LOCATIONS: LocationPoint[] = [
  { id: 'loc-patna', name: 'Patna', subTitle: 'Bihar (Origin)', state: 'Bihar', coordinates: [25.5941, 85.1376] },
  { id: 'loc-darbhanga', name: 'Darbhanga', subTitle: 'North Bihar / NH-27', state: 'Bihar', coordinates: [26.1542, 85.8918] },
  { id: 'loc-kankarbagh', name: 'Kankarbagh', subTitle: 'Main Road / Patna Urban', state: 'Bihar', coordinates: [25.5990, 85.1480] },
  { id: 'loc-delhi', name: 'Delhi', subTitle: 'National Capital (South West)', state: 'Delhi', coordinates: [28.6139, 77.2090] },
  { id: 'loc-noida', name: 'Noida', subTitle: 'Sector 62 / Expressway', state: 'Uttar Pradesh', coordinates: [28.5355, 77.3910] },
  { id: 'loc-gurugram', name: 'Gurugram', subTitle: 'Cyber Hub / Golf Course Rd', state: 'Haryana', coordinates: [28.4595, 77.0266] },
  { id: 'loc-lucknow', name: 'Lucknow', subTitle: 'Kisan Path / Gomti Nagar', state: 'Uttar Pradesh', coordinates: [26.8467, 80.9462] },
  { id: 'loc-agra', name: 'Agra', subTitle: 'Yamuna Expressway Interchange', state: 'Uttar Pradesh', coordinates: [27.1767, 78.0081] },
  { id: 'loc-kanpur', name: 'Kanpur', subTitle: 'GT Road / Bypass', state: 'Uttar Pradesh', coordinates: [26.4499, 80.3319] },
  { id: 'loc-varanasi', name: 'Varanasi', subTitle: 'Ring Road / Cantt', state: 'Uttar Pradesh', coordinates: [25.3176, 82.9739] },
  { id: 'loc-prayagraj', name: 'Prayagraj (Allahabad)', subTitle: 'Civil Lines / Naini', state: 'Uttar Pradesh', coordinates: [25.4358, 81.8463] },
  { id: 'loc-bareilly', name: 'Bareilly', subTitle: 'NH-30 Bypass', state: 'Uttar Pradesh', coordinates: [28.3670, 79.4304] },
  { id: 'loc-azamgarh', name: 'Azamgarh', subTitle: 'Purvanchal Expressway Entry', state: 'Uttar Pradesh', coordinates: [26.0684, 83.1859] },
  { id: 'loc-gorakhpur', name: 'Gorakhpur', subTitle: 'Gorakhpur Link Expressway', state: 'Uttar Pradesh', coordinates: [26.7606, 83.3732] },
  { id: 'loc-jaipur', name: 'Jaipur', subTitle: 'Pink City / Delhi-Jaipur Expressway', state: 'Rajasthan', coordinates: [26.9124, 75.7873] },
  { id: 'loc-chandigarh', name: 'Chandigarh', subTitle: 'Sector 17 / NH-44', state: 'Punjab / Chandigarh', coordinates: [30.7333, 76.7794] },
  { id: 'loc-mumbai', name: 'Mumbai', subTitle: 'BKC / Western Express Highway', state: 'Maharashtra', coordinates: [19.0760, 72.8777] },
  { id: 'loc-pune', name: 'Pune', subTitle: 'Mumbai-Pune Expressway', state: 'Maharashtra', coordinates: [18.5204, 73.8567] },
  { id: 'loc-goa', name: 'Goa', subTitle: 'Panaji / NH-66', state: 'Goa', coordinates: [15.2993, 74.1240] },
  { id: 'loc-bengaluru', name: 'Bengaluru', subTitle: 'Indiranagar / Electronic City', state: 'Karnataka', coordinates: [12.9716, 77.5946] },
  { id: 'loc-chennai', name: 'Chennai', subTitle: 'OMR / Guindy', state: 'Tamil Nadu', coordinates: [13.0827, 80.2707] },
  { id: 'loc-hyderabad', name: 'Hyderabad', subTitle: 'Outer Ring Road / Gachibowli', state: 'Telangana', coordinates: [17.3850, 78.4867] },
  { id: 'loc-kolkata', name: 'Kolkata', subTitle: 'Park Street / Rajarhat', state: 'West Bengal', coordinates: [22.5726, 88.3639] }
];

export function findLocationByName(query: string): LocationPoint | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return POPULAR_LOCATIONS.find(
    (loc) =>
      loc.name.toLowerCase().includes(q) ||
      loc.subTitle.toLowerCase().includes(q) ||
      loc.state.toLowerCase().includes(q)
  );
}

