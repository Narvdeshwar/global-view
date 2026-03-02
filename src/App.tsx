import { useState, useEffect, memo, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { FlyToInterpolator } from '@deck.gl/core';
import type { MapViewState } from '@deck.gl/core';
import { IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { Map } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SmartCamera } from './components/SmartCamera';
import { getLiveFlights, getSeismicActivity } from './lib/osint';
import type { FlightData, SeismicData } from './lib/osint';
import { loadCityRoadsSequentially } from './lib/traffic';
import type { TrafficTrip } from './lib/traffic';

const INITIAL_VIEW_STATE = {
  longitude: 78.9629,
  latitude: 20.5937,
  zoom: 4,
  pitch: 45,
  bearing: 0
};

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const AIRPLANE_ICON = 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/icon-atlas.png';

const ViewContainer = memo(({ viewState, setViewState, layers }: any) => {
  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      viewState={viewState}
      controller={true}
      layers={layers}
      onViewStateChange={(e) => setViewState(e.viewState as any)}
      getTooltip={({ object }) => {
        if (!object) return null;
        if ('callsign' in object) {
          return `FLIGHT: ${object.callsign}\nALT: ${object.altitude}m\nSPD: ${object.velocity}m/s`;
        }
        if ('magnitude' in object) {
          return `SEISMIC ALERT\nMAG: ${object.magnitude}\nLOC: ${object.place}`;
        }
        return null;
      }}
    >
      <Map mapStyle={MAP_STYLE} />
    </DeckGL>
  );
});

const MemoizedSmartCamera = memo(SmartCamera);

const VisualProcessingPanel = memo(({ visionMode, setVisionMode }: { visionMode: 'CRT' | 'NVG' | 'FLIR', setVisionMode: (mode: 'CRT' | 'NVG' | 'FLIR') => void }) => (
  <div className="absolute top-24 right-4 z-20 pointer-events-auto bg-black/80 border border-green-500/50 p-3 rounded-md backdrop-blur-sm text-green-500 font-mono text-xs w-[300px]">
    <div className="uppercase tracking-widest border-b border-green-500/30 pb-2 mb-2">Visual Processing</div>
    <div className="flex gap-2 mb-3 flex-wrap">
      {(['CRT', 'NVG', 'FLIR'] as const).map(mode => (
        <button
          key={mode}
          onClick={() => setVisionMode(mode)}
          className={`flex-1 min-w-[60px] py-1 border ${visionMode === mode ? 'bg-green-500/30 border-green-400 text-green-300' : 'bg-transparent border-green-500/50 hover:bg-green-500/10'} transition-colors`}
        >
          {mode}
        </button>
      ))}
    </div>
  </div>
));

const HudOverlay = memo(({ viewState, flightsCount, earthquakesCount, trafficCount }: any) => (
  <div className="absolute top-4 left-4 z-10 text-white font-mono pointer-events-none">
    <div className="flex items-center gap-2 mb-2">
      <div className="w-3 h-3 bg-red-500 rounded-full" />
      <h1 className="text-xl font-bold tracking-widest text-green-500">IND-PANOPTICON</h1>
    </div>
    <p className="text-sm text-green-400 opacity-80 mt-1">SYS: ONLINE // GEO: ACTIVE</p>
    <div className="mt-4 text-xs opacity-70 border border-green-500/30 p-2 bg-green-900/40">
      <div>LAT : {viewState.latitude?.toFixed(4)}</div>
      <div>LON : {viewState.longitude?.toFixed(4)}</div>
      <div>ALT : {viewState.zoom?.toFixed(2)}</div>
      <div>FOV : {viewState.pitch?.toFixed(2)}</div>

      <div className="mt-4 border-t border-green-500/30 pt-2 text-[10px]">
        <div className="text-cyan-400 uppercase">TRACKING {flightsCount} AIRCRAFT</div>
        <div className="text-red-400 uppercase">DETECTED {earthquakesCount} SEISMIC EVENTS</div>
        <div className="text-orange-400 uppercase">TRAFFIC NODES: {trafficCount}</div>
      </div>
    </div>
  </div>
));

function App() {
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);
  const [flights, setFlights] = useState<FlightData[]>([]);
  const [earthquakes, setEarthquakes] = useState<SeismicData[]>([]);
  const [traffic, setTraffic] = useState<TrafficTrip[]>([]);
  const [time, setTime] = useState(0);
  const [visionMode, setVisionMode] = useState<'CRT' | 'NVG' | 'FLIR'>('CRT');

  useEffect(() => {
    let animation: number;
    const animate = () => {
      setTime(t => (t + 1) % 10000);
      animation = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animation);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fData, eData] = await Promise.all([getLiveFlights(), getSeismicActivity()]);
        setFlights(fData);
        setEarthquakes(eData);
      } catch (err) {
        console.error("OSINT Fetch Error:", err);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLocationFound = (bounds: any) => {
    const latDiff = Math.abs(bounds.maxLat - bounds.minLat);
    const targetZoom = latDiff < 0.05 ? 15 : 12;

    setViewState({
      ...viewState,
      longitude: bounds.centerLon,
      latitude: bounds.centerLat,
      zoom: targetZoom,
      pitch: 60,
      bearing: 0,
      transitionDuration: 3000,
      transitionInterpolator: new FlyToInterpolator() as any
    });

    setTraffic([]);
    if (targetZoom >= 12) {
      loadCityRoadsSequentially(`${bounds.centerLat},${bounds.centerLon}`, (newTrips) => {
        setTraffic(prev => [...prev, ...newTrips]);
      });
    }
  };

  const layers = useMemo(() => [
    new ScatterplotLayer({
      id: 'seismic-layer',
      data: earthquakes,
      getPosition: (d: any) => [d.longitude, d.latitude],
      getRadius: (d: any) => Math.pow(2, d.magnitude) * 1000,
      getFillColor: [255, 100, 0, 150],
      getLineColor: [255, 0, 0, 200],
      radiusScale: 1,
      radiusMinPixels: 2,
      radiusMaxPixels: 100,
      pickable: true,
      opacity: 0.8,
      updateTriggers: { getPosition: [earthquakes], getRadius: [earthquakes] }
    }),
    new TripsLayer({
      id: 'traffic-layer',
      data: traffic,
      getPath: (d: any) => d.path,
      getTimestamps: (d: any) => d.timestamps,
      getColor: (d: any) => d.vendor === 0 ? [253, 128, 93] : [23, 184, 190],
      opacity: 0.8,
      widthMinPixels: 2,
      rounded: true,
      trailLength: 200,
      currentTime: time,
    }),
    new IconLayer({
      id: 'flight-layer',
      data: flights,
      iconAtlas: AIRPLANE_ICON,
      iconMapping: { marker: { x: 0, y: 0, width: 128, height: 128, mask: true } },
      getIcon: () => 'marker',
      sizeScale: 10,
      getPosition: (d: any) => [d.longitude, d.latitude, d.altitude + 50],
      getSize: 3,
      getColor: [0, 255, 255, 255],
      getAngle: (d: any) => 360 - (d.heading || 0),
      transitions: { getPosition: 15000 },
      updateTriggers: { getPosition: [flights] },
      pickable: true
    })
  ], [earthquakes, traffic, flights, time]);

  const modeClass = visionMode === 'CRT' ? 'crt-overlay' :
    visionMode === 'NVG' ? 'nvg-overlay saturate-200 contrast-125 sepia hue-rotate-[70deg] brightness-110' :
      visionMode === 'FLIR' ? 'flir-overlay invert hue-rotate-180 contrast-150 saturate-200' : '';

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative">
      <ViewContainer viewState={viewState} setViewState={setViewState} layers={layers} />
      <div className={`absolute inset-0 pointer-events-none z-[100] ${modeClass}`} />

      <MemoizedSmartCamera onLocationFound={handleLocationFound} />
      <VisualProcessingPanel visionMode={visionMode} setVisionMode={setVisionMode} />
      <HudOverlay viewState={viewState} flightsCount={flights.length} earthquakesCount={earthquakes.length} trafficCount={traffic.length} />
    </div>
  );
}

export default App;
