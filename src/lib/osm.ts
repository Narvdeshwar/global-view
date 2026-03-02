export interface POIBounds {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    centerLat: number;
    centerLon: number;
}

/**
 * Queries OpenStreetMap Nominatim for a specific location in India
 * and returns the bounding box to center the camera perfectly.
 */
export async function fetchOsmBounds(query: string): Promise<POIBounds | null> {
    try {
        // Restricting to India (countrycodes=in)
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            query
        )}&countrycodes=in&format=json&limit=1`;

        const response = await fetch(url);
        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            // boundingbox is [minLat, maxLat, minLon, maxLon] as strings
            const bbox = result.boundingbox.map(Number);

            return {
                minLat: bbox[0],
                maxLat: bbox[1],
                minLon: bbox[2],
                maxLon: bbox[3],
                centerLat: Number(result.lat),
                centerLon: Number(result.lon)
            };
        }
        return null;
    } catch (error) {
        console.error("OSM Nominatim fetch error:", error);
        return null;
    }
}
