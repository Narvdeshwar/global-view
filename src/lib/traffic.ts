import { fetchOsmBounds } from './osm';

export interface TrafficTrip {
    vendor: number; // 0 or 1 for color
    path: [number, number][]; // [lon, lat][]
    timestamps: number[]; // relative time in seconds
}

let requestQueue = Promise.resolve();

// Sequential loader to prevent crashing
export async function loadCityRoadsSequentially(cityName: string, onProgress: (trips: TrafficTrip[]) => void) {
    const bounds = await fetchOsmBounds(cityName);
    if (!bounds) return;

    const bbox = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;

    // High to low hierarchy
    const highwayLevels = [
        '["highway"~"motorway|trunk"]',
        '["highway"~"primary|secondary"]'
    ];

    for (const level of highwayLevels) {
        requestQueue = requestQueue.then(async () => {
            try {
                const query = `
          [out:json][timeout:25];
          way${level}(${bbox});
          out geom;
        `;

                const url = 'https://overpass-api.de/api/interpreter';
                const res = await fetch(url, {
                    method: 'POST',
                    body: query
                });
                const data = await res.json();

                const trips: TrafficTrip[] = [];
                data.elements.forEach((el: any) => {
                    if (el.type === 'way' && el.geometry) {
                        const path: [number, number][] = el.geometry.map((g: any) => [g.lon, g.lat]);

                        // Generate 1-5 vehicles per road segment natively
                        const count = Math.floor(Math.random() * 5) + 1;
                        for (let i = 0; i < count; i++) {
                            const speed = (Math.random() * 0.5 + 0.5) * 0.001; // degrees per second approximation
                            const timestamps: number[] = [0];

                            for (let j = 1; j < path.length; j++) {
                                const prev = path[j - 1];
                                const curr = path[j];
                                const dist = Math.sqrt(Math.pow(curr[0] - prev[0], 2) + Math.pow(curr[1] - prev[1], 2));
                                timestamps.push(timestamps[j - 1] + dist / speed);
                            }

                            // Shift start time
                            const shift = Math.random() * 1000;
                            const shiftedTimestamps = timestamps.map(t => t + shift);

                            trips.push({
                                vendor: Math.random() > 0.5 ? 0 : 1,
                                path,
                                timestamps: shiftedTimestamps
                            });
                        }
                    }
                });

                if (trips.length > 0) {
                    onProgress(trips);
                }
            } catch (error) {
                console.error("Overpass query failed", error);
            }

            // Artificial delay between requests to not overwhelm the API or browser
            await new Promise(r => setTimeout(r, 2000));
        });
    }
}
