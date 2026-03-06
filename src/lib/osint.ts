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

export interface VesselData {
    id: string;
    mmsi: string;
    name: string;
    longitude: number;
    latitude: number;
    heading: number;
    speed: number;
    type: 'CARGO' | 'TANKER' | 'MILITARY';
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

/**
 * Simulates Maritime Domain Awareness (MDA) AIS data near Indian ports.
 */
export function getVesselTraffic(): VesselData[] {
    const ports = [
        { name: 'MUMBAI', lon: 72.85, lat: 18.95 },
        { name: 'CHENNAI', lon: 80.30, lat: 13.10 },
        { name: 'KOCHI', lon: 76.25, lat: 9.95 },
        { name: 'VIZAG', lon: 83.30, lat: 17.70 },
        { name: 'KANDLA', lon: 70.21, lat: 23.01 },
    ];

    const vessels: VesselData[] = [];
    const types: ('CARGO' | 'TANKER' | 'MILITARY')[] = ['CARGO', 'TANKER', 'MILITARY'];

    ports.forEach(port => {
        const count = 5 + Math.floor(Math.random() * 10);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 0.5 + Math.random() * 3; // Distance from port
            vessels.push({
                id: `vessel-${port.name}-${i}`,
                mmsi: `419${Math.floor(100000 + Math.random() * 900000)}`,
                name: `${port.name}_SHIP_${i}`,
                longitude: port.lon + Math.cos(angle) * dist,
                latitude: port.lat + Math.sin(angle) * dist,
                heading: Math.floor(Math.random() * 360),
                speed: 10 + Math.random() * 20,
                type: types[Math.floor(Math.random() * types.length)]
            });
        }
    });

    return vessels;
}

export interface CyberThreat {
    id: string;
    source: [number, number];
    target: [number, number];
    type: 'DDOS' | 'EXFIL' | 'INTRUSION';
    intensity: number; // 0-1
}

export interface CableData {
    id: string;
    name: string;
    path: [number, number][];
    capacity: string;
}

export interface SigintNode {
    id: string;
    longitude: number;
    latitude: number;
    intensity: number;
    frequency: string;
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

export interface LogisticsNode {
    id: string;
    name: string;
    type: 'GRAIN_SILO' | 'FUEL_DEPOT' | 'POWER_HUB';
    longitude: number;
    latitude: number;
    inventory: number; // 0-1
}

export interface FreightPath {
    id: string;
    name: string;
    path: [number, number][];
}

/**
 * Simulates Submarine Fiber Optic Cable paths connecting India.
 */
export function getSubmarineCables(): CableData[] {
    return [
        {
            id: 'smw-5',
            name: 'SEA-ME-WE 5',
            path: [[55.0, 25.0], [65.0, 20.0], [72.8, 18.9], [80.3, 13.1], [90.0, 5.0]],
            capacity: '24 Tbps'
        },
        {
            id: 'aae-1',
            name: 'AAE-1',
            path: [[45.0, 12.0], [55.0, 15.0], [72.8, 18.9], [76.2, 9.9]],
            capacity: '40 Tbps'
        },
        {
            id: 'bbg',
            name: 'Bay of Bengal Gateway',
            path: [[80.3, 13.1], [85.0, 10.0], [92.0, 5.0], [100.0, 2.0]],
            capacity: '6.4 Tbps'
        },
        {
            id: 'tic',
            name: 'Tata Indicom Cable',
            path: [[80.3, 13.1], [88.0, 12.0], [103.8, 1.3]],
            capacity: '5.1 Tbps'
        }
    ];
}

/**
 * Simulates SIGINT signal pulses along undersea infrastructure.
 */
export function getSigintSignals(cables: CableData[]): any[] {
    const signals: any[] = [];
    cables.forEach(cable => {
        // Create 2-3 active signals per cable
        for (let i = 0; i < 3; i++) {
            const pathIndex = Math.floor(Math.random() * (cable.path.length - 1));
            const start = cable.path[pathIndex];
            const end = cable.path[pathIndex + 1];
            signals.push({
                id: `sig-${cable.id}-${i}`,
                cableName: cable.name,
                source: start,
                target: end,
                intensity: Math.random()
            });
        }
    });
    return signals;
}

/**
 * Simulates Strategic Freight Corridors (Railway Spines) across India.
 */
export function getFreightTraffic(): FreightPath[] {
    return [
        {
            id: 'dfc-east',
            name: 'EASTERN DFC',
            path: [[77.2, 28.6], [80.9, 26.8], [82.9, 25.3], [88.3, 22.5]] // Delhi to Howrah roughly
        },
        {
            id: 'dfc-west',
            name: 'WESTERN DFC',
            path: [[77.2, 28.6], [75.8, 26.9], [72.6, 23.0], [72.8, 19.0]] // Delhi to JNPT roughly
        },
        {
            id: 'gq-south',
            name: 'GQ-SOUTH',
            path: [[72.8, 19.0], [75.0, 15.0], [77.6, 13.0], [80.3, 13.1]] // Mumbai to Chennai
        }
    ];
}

/**
 * Simulates Strategic Resource Hubs (Grain Silos, Fuel, Power).
 */
export function getStrategicHubs(): LogisticsNode[] {
    return [
        { id: 'hub-1', name: 'SPR-MUMBAI', type: 'FUEL_DEPOT', longitude: 72.8, latitude: 19.2, inventory: 0.85 },
        { id: 'hub-2', name: 'GRAIN-LUDHIANA', type: 'GRAIN_SILO', longitude: 75.8, latitude: 30.9, inventory: 0.92 },
        { id: 'hub-3', name: 'SPR-VIZAG', type: 'FUEL_DEPOT', longitude: 83.3, latitude: 17.7, inventory: 0.78 },
        { id: 'hub-4', name: 'POWER-GRID-HQ', type: 'POWER_HUB', longitude: 77.2, latitude: 28.6, inventory: 0.95 },
        { id: 'hub-5', name: 'GRAIN-HARYANA', type: 'GRAIN_SILO', longitude: 76.6, latitude: 29.1, inventory: 0.88 }
    ];
}
