/**
 * OSINT Data Aggregation Service
 * Filters global feeds to India's bounding box to optimize performance.
 */

// Bounding box for India roughly
const INDIA_BBOX = {
    lamin: 6.75,
    lomin: 68.16,
    lamax: 35.5,
    lomax: 97.4
};

export interface FlightData {
    id: string;
    callsign: string;
    longitude: number;
    latitude: number;
    altitude: number;
    velocity: number;
    heading: number;
    isMilitary?: boolean;
}

export interface SeismicData {
    id: string;
    longitude: number;
    latitude: number;
    magnitude: number;
    place: string;
    time: number;
}

export interface SatelliteData {
    id: string;
    name: string;
    longitude: number;
    latitude: number;
    altitude: number;
}

/**
 * Fetches commercial flights from OpenSky Network, filtered by India bounding box.
 */
export async function getLiveFlights(): Promise<FlightData[]> {
    try {
        const url = `https://opensky-network.org/api/states/all?lamin=${INDIA_BBOX.lamin}&lomin=${INDIA_BBOX.lomin}&lamax=${INDIA_BBOX.lamax}&lomax=${INDIA_BBOX.lomax}`;
        const res = await fetch(url);
        if (res.status === 429) return [];
        const data = await res.json();
        if (!data.states) return [];

        return data.states.map((state: any) => ({
            id: state[0],
            callsign: state[1] ? state[1].trim() : 'UNKNOWN',
            longitude: state[5],
            latitude: state[6],
            altitude: state[7] || state[13] || 10000,
            velocity: state[9],
            heading: state[10],
            isMilitary: state[1].startsWith('M') || Math.random() < 0.05 // Simulation fallback
        })).filter((f: FlightData) => f.longitude && f.latitude);
    } catch (error) {
        console.error("Failed to fetch flight data", error);
        return [];
    }
}

/**
 * Fetches recent seismic activity (earthquakes) globally, filtering to India region.
 */
export async function getSeismicActivity(): Promise<SeismicData[]> {
    try {
        const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
        const res = await fetch(url);
        const data = await res.json();

        return data.features
            .filter((feature: any) => {
                const [lon, lat] = feature.geometry.coordinates;
                return lon >= INDIA_BBOX.lomin && lon <= INDIA_BBOX.lomax &&
                    lat >= INDIA_BBOX.lamin && lat <= INDIA_BBOX.lamax;
            })
            .map((feature: any) => ({
                id: feature.id,
                longitude: feature.geometry.coordinates[0],
                latitude: feature.geometry.coordinates[1],
                magnitude: feature.properties.mag,
                place: feature.properties.place,
                time: feature.properties.time
            }));
    } catch (error) {
        console.error("Failed to fetch seismic data", error);
        return [];
    }
}

/**
 * Fetches real-time satellite positions (Simulation for High-Altitude Phase 3)
 */
export async function getSatelliteTracks(): Promise<SatelliteData[]> {
    // In a real scenario, we use TLE (Two-Line Element) from CelesTrak and satellite.js
    // For this build, we simulate 10 high-altitude orbital nodes for the tactical look.
    const satellites: SatelliteData[] = [];
    const count = 12;

    for (let i = 0; i < count; i++) {
        satellites.push({
            id: `sat-${i}`,
            name: `IND-O-${100 + i}`,
            longitude: 65 + Math.random() * 40,
            latitude: 5 + Math.random() * 35,
            altitude: 350000 + Math.random() * 50000 // Low Earth Orbit height
        });
    }
    return satellites;
}

export interface CyberThreat {
    id: string;
    source: [number, number];
    target: [number, number];
    type: 'DDOS' | 'EXFIL' | 'INTRUSION';
    intensity: number; // 0-1
}

/**
 * Simulates a massive cyber-warfare event with intrusion arcs targeting major hubs.
 */
export function getCyberThreats(): CyberThreat[] {
    const targets = [
        [72.8777, 19.0760], // Mumbai
        [77.2090, 28.6139], // Delhi
        [77.5946, 12.9716], // Bangalore
        [80.2707, 13.0827], // Chennai
        [78.4867, 17.3850], // Hyderabad
    ];

    const threats: CyberThreat[] = [];
    const count = 30 + Math.random() * 50; // Dynamic severity

    for (let i = 0; i < count; i++) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        // Random global external sources
        const source: [number, number] = [
            (Math.random() - 0.5) * 360,
            (Math.random() - 0.5) * 160
        ];

        const types: ('DDOS' | 'EXFIL' | 'INTRUSION')[] = ['DDOS', 'EXFIL', 'INTRUSION'];

        threats.push({
            id: `cyber-${Math.random()}`,
            source,
            target: target as [number, number],
            type: types[Math.floor(Math.random() * types.length)],
            intensity: Math.random()
        });
    }

    return threats;
}
