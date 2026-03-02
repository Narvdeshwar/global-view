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
}

export interface SeismicData {
    id: string;
    longitude: number;
    latitude: number;
    magnitude: number;
    place: string;
    time: number;
}

/**
 * Fetches commercial flights from OpenSky Network, filtered by India bounding box.
 */
export async function getLiveFlights(): Promise<FlightData[]> {
    try {
        // OpenSky returns state vectors:
        // https://opensky-network.org/api/states/all?lamin=x&lomin=y&lamax=z&lomax=w
        const url = `https://opensky-network.org/api/states/all?lamin=${INDIA_BBOX.lamin}&lomin=${INDIA_BBOX.lomin}&lamax=${INDIA_BBOX.lamax}&lomax=${INDIA_BBOX.lomax}`;

        const res = await fetch(url);
        if (res.status === 429) {
            console.warn("OpenSky Rate Limited");
            return [];
        }
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

        // Filter locally to reduce payload
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
                depth: feature.geometry.coordinates[2],
                magnitude: feature.properties.mag,
                place: feature.properties.place,
                time: feature.properties.time
            }));
    } catch (error) {
        console.error("Failed to fetch seismic data", error);
        return [];
    }
}
