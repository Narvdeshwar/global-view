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

const DIAGNOSTIC_MESSAGES = [
  "UPLINK_ESTABLISHED // SOURCE: OPEN-SKY-NODE-7",
  "SEISMIC_BUFFER_FLUSH... OK",
  "ENCRYPTING_GEOSPATIAL_STREAM...",
  "TRAFFIC_PARTICLES_SYNCING // NODES: ACTIVE",
  "RADAR_SWEEP_COMPLETE // NO_ANOMALIES",
  "THERMAL_CALIBRATION_PENDING...",
  "SATELLITE_LOCK_STABLE // ORBIT: IND-O-1",
  "OSINT_AGGREGATOR_V6 // STATUS: NOMINAL"
];

const ScrollingDiagnostic = memo(() => {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const msg = DIAGNOSTIC_MESSAGES[Math.floor(Math.random() * DIAGNOSTIC_MESSAGES.length)];
      setMessages(prev => [...prev.slice(-4), msg]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="diagnostic-scroller h-20 overflow-hidden text-[9px] opacity-40 font-mono mt-4 border-t border-green-500/20 pt-2">
      {messages.map((m, i) => (
        <div key={i} className="mb-1 animate-in slide-in-from-left duration-500">{m}</div>
      ))}
    </div>
  );
});

const ViewContainer = memo(({ viewState, setViewState, layers, onMouseEnter, onMouseLeave, viewMode }: any) => {
  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="w-full h-full relative">
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        viewState={viewState}
        controller={true}
        layers={layers}
        style={{ background: 'transparent' }}
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
        <Map
          mapStyle={MAP_STYLE}
          projection={viewMode === 'GLOBE' ? 'globe' : 'mercator'}
          style={{ background: 'transparent' }}
        />
      </DeckGL>
    </div>
  );
});

const MemoizedSmartCamera = memo(SmartCamera);

const VisualProcessingPanel = memo(({ visionMode, setVisionMode, viewMode, setViewMode }: {
  visionMode: 'CRT' | 'NVG' | 'FLIR',
  setVisionMode: (mode: 'CRT' | 'NVG' | 'FLIR') => void,
  viewMode: 'MAP' | 'GLOBE',
  setViewMode: (mode: 'MAP' | 'GLOBE') => void
}) => (
  <div className="absolute top-24 right-4 z-20 pointer-events-auto glass-panel p-5 rounded-lg text-green-500 font-mono text-xs w-[320px]">
    <div className="uppercase tracking-[0.2em] border-b border-green-500/30 pb-3 mb-4 neon-text font-black text-sm italic">Tactical Processing</div>

    <div className="mb-5">
      <div className="text-[9px] opacity-50 mb-2 uppercase tracking-widest font-bold">Projection Matrix</div>
      <div className="flex gap-2">
        {(['MAP', 'GLOBE'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`tactical-btn flex-1 py-1.5 border border-green-500/30 text-[10px] font-bold ${viewMode === mode ? 'bg-green-500/40 border-green-400 text-white shadow-[0_0_15px_rgba(0,255,65,0.25)]' : 'bg-transparent hover:bg-green-500/10'} rounded-sm`}
          >
            {mode}
          </button>
        ))}
      </div>
    </div>

    <div>
      <div className="text-[9px] opacity-50 mb-2 uppercase tracking-widest font-bold">Spectral Filtration</div>
      <div className="flex gap-2 flex-wrap">
        {(['CRT', 'NVG', 'FLIR'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setVisionMode(mode)}
            className={`tactical-btn flex-1 min-w-[75px] py-1.5 border border-green-500/30 text-[10px] font-bold ${visionMode === mode ? 'bg-green-500/40 border-green-400 text-white shadow-[0_0_15px_rgba(0,255,65,0.25)]' : 'bg-transparent hover:bg-green-500/10'} rounded-sm`}
          >
            {mode}
          </button>
        ))}
      </div>
    </div>

    <ScrollingDiagnostic />
  </div>
));

const HudOverlay = memo(({ viewState, flightsCount, earthquakesCount, trafficCount }: any) => (
  <div className="absolute top-4 left-4 z-10 font-mono pointer-events-none">
    <div className="flex items-center gap-4 mb-3">
      <div className="relative">
        <div className="w-5 h-5 bg-red-600 rounded-full animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.9)]" />
        <div className="absolute -inset-1 border border-red-600/50 rounded-full animate-ping" />
      </div>
      <h1 className="text-3xl font-black tracking-tighter neon-text italic uppercase">IND-PANOPTICON <span className="text-[10px] not-italic opacity-40 font-normal uppercase ml-2 tracking-widest border border-green-500/30 px-2 py-0.5">SENSORY-v8.0</span></h1>
    </div>

    <div className="glass-panel p-5 rounded-sm border-l-4 border-l-green-500 text-white w-[350px]">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-green-500/20">
        <div className="text-[10px] font-bold"><span className="opacity-50">STATUS:</span> <span className="text-green-400 animate-pulse">OPTIMIZED</span></div>
        <div className="text-[10px] font-bold"><span className="opacity-50">THREAD:</span> <span className="text-cyan-400">0xf2-CORE</span></div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[11px]">
        <div className="space-y-1">
          <div className="opacity-40 uppercase text-[8px] font-bold tracking-widest">Geodetic-X</div>
          <div className="text-white font-black text-lg tracking-tight transition-all duration-300">{viewState.latitude?.toFixed(4)}N</div>
        </div>
        <div className="space-y-1 text-right">
          <div className="opacity-40 uppercase text-[8px] font-bold tracking-widest">Signal:Air</div>
          <div className="text-cyan-400 font-black text-lg tracking-tight">{flightsCount} T-NODE</div>
        </div>

        <div className="space-y-1">
          <div className="opacity-40 uppercase text-[8px] font-bold tracking-widest">Geodetic-Y</div>
          <div className="text-white font-black text-lg tracking-tight tracking-tight">{viewState.longitude?.toFixed(4)}E</div>
        </div>
        <div className="space-y-1 text-right">
          <div className="opacity-40 uppercase text-[8px] font-bold tracking-widest">Signal:Seis</div>
          <div className="text-red-400 font-black text-lg tracking-tight">{earthquakesCount} ALERT</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-green-500/20 flex justify-between items-center">
        <div className="text-[8px] font-bold opacity-30 uppercase">Uplink Encryption: AES-256</div>
        <div className="text-orange-400 font-bold text-xs">{trafficCount} TRAFFIC</div>
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
  const [viewMode, setViewMode] = useState<'MAP' | 'GLOBE'>('GLOBE');
  const [isRotating, setIsRotating] = useState(true);

  // Auto-rotation system
  useEffect(() => {
    if (!isRotating || viewMode !== 'GLOBE') return;

    const interval = setInterval(() => {
      setViewState(prev => ({
        ...prev,
        longitude: (prev.longitude || 0) + 0.05,
        transitionDuration: 0
      }));
    }, 16);

    return () => clearInterval(interval);
  }, [isRotating, viewMode]);

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
    setIsRotating(false);
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
    <div className="w-screen h-screen overflow-hidden relative">
      {/* Premium Cinematic Layers */}
      <div className="sunrise-bg">
        <div className="atmosphere-haze" />
        <div className="space-dust" />
        <div className="sun-orb" />
        <div className="lens-flare">
          <div className="flare-ring flare-ring-1" />
          <div className="flare-ring flare-ring-2" />
          <div className="flare-ring flare-ring-3" />
          <div className="flare-ring flare-ring-4" />
        </div>
      </div>

      <ViewContainer
        viewState={viewState}
        setViewState={setViewState}
        layers={layers}
        onMouseEnter={() => setIsRotating(false)}
        onMouseLeave={() => setIsRotating(true)}
        viewMode={viewMode}
      />

      <div className={`absolute inset-0 pointer-events-none z-[1000] ${modeClass}`} />

      <MemoizedSmartCamera onLocationFound={handleLocationFound} />
      <VisualProcessingPanel
        visionMode={visionMode}
        setVisionMode={setVisionMode}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />
      <HudOverlay viewState={viewState} flightsCount={flights.length} earthquakesCount={earthquakes.length} trafficCount={traffic.length} />
    </div>
  );
}

export default App;
