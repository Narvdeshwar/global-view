import { useState, useEffect, memo, useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { FlyToInterpolator } from '@deck.gl/core';
import type { MapViewState } from '@deck.gl/core';
import { IconLayer, ScatterplotLayer, LineLayer, ArcLayer, PolygonLayer } from '@deck.gl/layers';
import { TripsLayer, Tile3DLayer } from '@deck.gl/geo-layers';
import { HeatmapLayer, HexagonLayer } from '@deck.gl/aggregation-layers';
import { Map, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SmartCamera } from './components/SmartCamera';
import { getLiveFlights, getSeismicActivity, getSatelliteTracks, getCyberThreats } from './lib/osint';
import type { FlightData, SeismicData, SatelliteData, CyberThreat } from './lib/osint';
import { loadCityRoadsSequentially } from './lib/traffic';
import type { TrafficTrip } from './lib/traffic';
import { playTacticalSound, startAmbientDrone } from './lib/sounds';

const INITIAL_VIEW_STATE = {
  longitude: 78.9629,
  latitude: 20.5937,
  zoom: 4,
  pitch: 45,
  bearing: 0
};

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const AIRPLANE_ICON = 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/icon-atlas.png';
const GOOGLE_MAP_KEY = ''; // ENTER_KEY_FOR_3D_TILES_PHASE_2

// Helper to calculate a circle polygon for orbital footprint
function getCirclePolygon(centerPoint: [number, number], radiusInKm: number, points: number = 32) {
  const coords: [number, number][] = [];
  const kmPerDegreeLat = 111.32; // km
  const kmPerDegreeLon = 40075 * Math.cos(centerPoint[1] * Math.PI / 180) / 360;

  for (let i = 0; i < points; i++) {
    const angle = (i * 360 / points) * Math.PI / 180;
    const dx = radiusInKm * Math.cos(angle);
    const dy = radiusInKm * Math.sin(angle);
    coords.push([
      centerPoint[0] + dx / kmPerDegreeLon,
      centerPoint[1] + dy / kmPerDegreeLat
    ]);
  }
  return coords;
}

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
            return `${object.isMilitary ? 'MILITARY' : 'CIVILIAN'} FLIGHT: ${object.callsign}\nALT: ${object.altitude}m`;
          }
          if ('name' in object) {
            return `SATELLITE: ${object.name}\nORBIT: LEO\nALT: ${Math.round(object.altitude / 1000)}km`;
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
          terrain={{ source: 'terrain-source', exaggeration: 1.5 }}
        >
          <Source
            id="terrain-source"
            type="raster-dem"
            url="https://demotiles.maplibre.org/terrain-tiles/tiles.json"
            tileSize={256}
          />
          <Layer
            id="3d-buildings"
            source="openmaptiles"
            source-layer="building"
            type="fill-extrusion"
            minzoom={14}
            paint={{
              'fill-extrusion-color': '#00ff41',
              'fill-extrusion-height': ['get', 'render_height'],
              'fill-extrusion-base': ['get', 'render_min_height'],
              'fill-extrusion-opacity': 0.6
            }}
          />
        </Map>
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

const HudOverlay = memo(({ viewState, flightsCount, militaryCount, satellitesCount, earthquakesCount, trafficCount }: any) => (
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
          <div className="opacity-40 uppercase text-[8px] font-bold tracking-widest">Orbital Nodes</div>
          <div className="text-cyan-400 font-black text-lg tracking-tight">{satellitesCount} SAT-UPLINK</div>
        </div>

        <div className="space-y-1">
          <div className="opacity-40 uppercase text-[8px] font-bold tracking-widest">Geodetic-Y</div>
          <div className="text-white font-black text-lg tracking-tight tracking-tight">{viewState.longitude?.toFixed(4)}E</div>
        </div>
        <div className="space-y-1 text-right">
          <div className="opacity-40 uppercase text-[8px] font-bold tracking-widest">Signal:Air</div>
          <div className="text-red-400 font-black text-lg tracking-tight">{militaryCount} MIL-TRANS</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-green-500/20 flex flex-col gap-2">
        <div className="flex justify-between items-center w-full">
          <div className="text-[10px] text-cyan-400 font-bold">{flightsCount} CIV-AIR</div>
          <div className="text-[10px] text-orange-400 font-bold">{trafficCount} TRAFFIC</div>
          <div className="text-[10px] text-red-500 font-bold">{earthquakesCount} SEISMIC</div>
        </div>
        <div className="text-[8px] font-bold opacity-30 uppercase text-center border-t border-white/5 pt-1">SEC_PROTOCOL: AES-256 // SOURCE: MULTI_FEED_V8</div>
      </div>
    </div>
  </div>
));

const TargetIntelligenceSidebar = memo(({ asset, onClose }: { asset: any, onClose: () => void }) => {
  if (!asset) return null;

  const isFlight = 'callsign' in asset;
  const isSat = 'name' in asset;
  const isSeismic = 'magnitude' in asset;

  return (
    <div className="absolute top-24 left-4 z-20 pointer-events-auto glass-panel p-5 rounded-lg text-green-500 font-mono text-xs w-[320px] animate-in slide-in-from-left duration-300">
      <div className="flex justify-between items-center border-b border-green-500/30 pb-3 mb-4">
        <div className="uppercase tracking-[0.2em] neon-text font-black text-sm italic">Target Acquisition</div>
        <button onClick={onClose} className="hover:text-white transition-colors"> [X] </button>
      </div>

      <div className="space-y-4">
        <div className="text-[10px] bg-green-500/10 p-2 border border-green-500/20 rounded">
          <span className="opacity-50">STID:</span> {asset.id || 'N/A'}
        </div>

        <div className="spec-sheet">
          <div className="spec-item">
            <span className="spec-label">Classification</span>
            <span className="spec-value">{isFlight ? (asset.isMilitary ? 'MILITARY_AIR' : 'CIVILIAN_AIR') : isSat ? 'ORBITAL_NODE' : 'GEOLOGICAL_ALERT'}</span>
          </div>
          {isFlight && (
            <>
              <div className="spec-item">
                <span className="spec-label">Callsign</span>
                <span className="spec-value">{asset.callsign}</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Altitude</span>
                <span className="spec-value">{asset.altitude}m</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Velocity</span>
                <span className="spec-value">{Math.round((asset.velocity || 0) * 1.94384)} knots</span>
              </div>
            </>
          )}
          {isSat && (
            <>
              <div className="spec-item">
                <span className="spec-label">Designation</span>
                <span className="spec-value">{asset.name}</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Orbit</span>
                <span className="spec-value">LEO // {Math.round(asset.altitude / 1000)}km</span>
              </div>
            </>
          )}
          {isSeismic && (
            <>
              <div className="spec-item">
                <span className="spec-label">Magnitude</span>
                <span className="spec-value">{asset.magnitude} Richter</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Location</span>
                <span className="spec-value">{asset.place}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <button className="tactical-btn w-full py-2 bg-green-500/20 border border-green-500/40 text-[10px] font-bold hover:bg-green-500/40 transition-all rounded">INITIATE_UPLINK</button>
        <button className="tactical-btn w-full py-2 border border-red-500/40 text-red-500 text-[10px] font-bold hover:bg-red-500/10 transition-all rounded" onClick={onClose}>DISCARD_TARGET</button>
      </div>
    </div>
  );
});

const SentinelMonitor = memo(({ asset }: { asset: any }) => {
  if (!asset) return null;

  return (
    <div className="sentinel-monitor animate-in fade-in zoom-in duration-500">
      <div className="monitor-pov">
        <div className="noise-bg" />
        <div className="text-[10px] text-green-500/40 font-mono animate-pulse uppercase tracking-[0.3em] font-black italic">
          Synchronizing POV...
        </div>
        {/* Visual feedback circles */}
        <div className="absolute inset-4 border border-green-500/10 rounded-full" />
        <div className="absolute inset-8 border border-green-500/5 rounded-full animate-ping" />
      </div>
      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        <div className="w-1 h-1 bg-green-400 rounded-full" />
        <span className="text-[8px] text-green-400/60 font-mono uppercase">Live_01</span>
      </div>
    </div>
  );
});

const NeuralLinkLog = memo(({ logs }: { logs: string[] }) => (
  <div className="neural-link-log">
    {logs.map((log, i) => (
      <div key={i} className="log-entry">
        <span className="log-timestamp">[{new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}]</span>
        {log}
      </div>
    ))}
  </div>
));

const CortexTerminal = memo(({ onCommand }: { onCommand: (cmd: string) => void }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onCommand(input.trim());
      setInput('');
      playTacticalSound('SELECT');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="cortex-terminal">
      <span className="terminal-prompt">&gt;_</span>
      <input
        type="text"
        className="terminal-input"
        placeholder="ENTER CORTEX COMMAND (e.g. /GOTO MUMBAI, /VISION NVG)..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        autoFocus
      />
    </form>
  );
});

const SituationReport = memo(({ data, onClose }: { data: any, onClose: () => void }) => (
  <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
    <div className="glass-panel max-w-md w-full p-8 rounded-xl border-t-4 border-cyan-500 animate-in zoom-in duration-300">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-cyan-400 font-black tracking-widest uppercase italic">Neural Theater Briefing</h2>
          <div className="text-[10px] text-white/30 font-mono">CODE: PANOPTICON_V11 // {new Date().toLocaleDateString()}</div>
        </div>
        <button onClick={onClose} className="text-white/50 hover:text-white">[X]</button>
      </div>

      <div className="space-y-6 font-mono text-cyan-500 uppercase font-black text-sm italic">
        <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded">
          <div className="text-[10px] text-cyan-400/50 mb-1 uppercase">Strategic Threat Level</div>
          <div className="text-2xl font-black italic flex items-center gap-3">
            <span style={{ color: data.threatColor }}>{Math.round(data.threatLevel * 100)}%</span>
            <div className="h-2 flex-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full transition-all duration-1000" style={{ width: `${data.threatLevel * 100}%`, backgroundColor: data.threatColor }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 border border-white/5 rounded">
            <div className="text-[9px] opacity-40 uppercase">Airborne Signals</div>
            <div className="text-xl font-bold">{data.flights}</div>
          </div>
          <div className="p-3 border border-white/5 rounded">
            <div className="text-[9px] opacity-40 uppercase">Orbital Nodes</div>
            <div className="text-xl font-bold">{data.satellites}</div>
          </div>
          <div className="p-3 border border-white/5 rounded">
            <div className="text-[9px] opacity-40 uppercase">Seismic Variance</div>
            <div className="text-xl font-bold">{data.seismic} Alerts</div>
          </div>
          <div className="p-3 border border-white/5 rounded">
            <div className="text-[9px] opacity-40 uppercase">Surface Traffic</div>
            <div className="text-xl font-bold">{data.traffic} units</div>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-white/60 lowercase italic">
          // automatic analysis indicates {data.threatLevel > 0.5 ? 'elevated regional friction' : 'nominal atmospheric baseline'} across the southern peninsula. recommend maintaining active patrol cycles.
        </p>

        <button onClick={onClose} className="w-full py-3 bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 font-black uppercase text-xs hover:bg-cyan-500/40 transition-all">Dismiss Briefing</button>
      </div>
    </div>
  </div>
));

function App() {
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);
  const [flights, setFlights] = useState<FlightData[]>([]);
  const [earthquakes, setEarthquakes] = useState<SeismicData[]>([]);
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [traffic, setTraffic] = useState<TrafficTrip[]>([]);
  const [logs, setLogs] = useState<string[]>(["SYSTEM READY", "UPLINK ESTABLISHED"]);
  const [isHeatmapActive, setIsHeatmapActive] = useState(false);
  const [isPatrolActive, setIsPatrolActive] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isCyberWarfareActive, setIsCyberWarfareActive] = useState(false);
  const [cyberThreats, setCyberThreats] = useState<CyberThreat[]>([]);
  const [time, setTime] = useState(0);
  const [isHexGridActive, setIsHexGridActive] = useState(false);
  const [isOrbitalFootprintActive, setIsOrbitalFootprintActive] = useState(false);

  const threatLevel = useMemo(() => {
    if (isCyberWarfareActive) return 1.0; // Cyber war sets max threat
    const militaryCount = flights.filter(f => f.isMilitary).length;
    const seismicCount = earthquakes.filter(e => e.magnitude > 5).length;
    return Math.min(1, (militaryCount * 0.1) + (seismicCount * 0.2));
  }, [flights, earthquakes, isCyberWarfareActive]);

  const threatColor = isCyberWarfareActive ? '#ff003c' : (threatLevel > 0.6 ? '#ff3131' : threatLevel > 0.3 ? '#ff8c00' : '#00f3ff');

  // Recon Patrol Logic
  useEffect(() => {
    if (!isPatrolActive) return;

    const targets = [...flights, ...earthquakes].slice(0, 5);
    if (targets.length === 0) return;

    let index = 0;
    const interval = setInterval(() => {
      const target = targets[index];
      setSelectedAsset(target);
      setViewState(prev => ({
        ...prev,
        longitude: target.longitude,
        latitude: target.latitude,
        zoom: 12,
        transitionDuration: 3000,
        transitionInterpolator: new FlyToInterpolator() as any
      }));
      setLogs(prev => [`RECON PATROL: SCANNING TARGET [${index + 1}/5]`, ...prev]);
      playTacticalSound('SELECT');
      index = (index + 1) % targets.length;
    }, 8000);

    return () => clearInterval(interval);
  }, [isPatrolActive, flights, earthquakes]);

  useEffect(() => {
    if (threatLevel > 0.8) {
      setLogs(prev => ["CRITICAL THREAT LEVEL DETECTED", ...prev]);
      playTacticalSound('WARNING');
    }
  }, [threatLevel]);
  const [visionMode, setVisionMode] = useState<'CRT' | 'NVG' | 'FLIR'>('CRT');
  const [viewMode, setViewMode] = useState<'MAP' | 'GLOBE'>('GLOBE');
  const [isRotating, setIsRotating] = useState(true);

  // Auto-rotation system
  useEffect(() => {
    if (!isRotating || viewMode !== 'GLOBE' || !!selectedAsset) return;

    const interval = setInterval(() => {
      setViewState(prev => ({
        ...prev,
        longitude: (prev.longitude || 0) + 0.05,
        transitionDuration: 0
      }));
    }, 16);

    return () => clearInterval(interval);
  }, [isRotating, viewMode, selectedAsset]);

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
        const [fData, eData, sData] = await Promise.all([
          getLiveFlights(),
          getSeismicActivity(),
          getSatelliteTracks()
        ]);
        setFlights(fData);
        setEarthquakes(eData);
        setSatellites(sData);
      } catch (err) {
        console.error("OSINT Fetch Error:", err);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    let interval: any;
    if (isCyberWarfareActive) {
      const fetchThreats = () => {
        setCyberThreats(getCyberThreats());
      };
      fetchThreats();
      interval = setInterval(fetchThreats, 2000);
    } else {
      setCyberThreats([]);
    }
    return () => clearInterval(interval);
  }, [isCyberWarfareActive]);

  const handleLocationFound = (bounds: any) => {
    startAmbientDrone();
    playTacticalSound('SELECT');
    setIsRotating(false);
    setSelectedAsset(null);
    setLogs(prev => [`TARGET ACQUIRED: ${bounds.centerLat.toFixed(2)},${bounds.centerLon.toFixed(2)}`, ...prev]);

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
    new Tile3DLayer({
      id: 'google-3d-tiles',
      data: `https://tile.googleapis.com/v1/3dtiles/datasets/google-photorealistic-3d-tiles/tileset?key=${GOOGLE_MAP_KEY}`,
      visible: !!GOOGLE_MAP_KEY,
      opacity: 1.0,
    }),
    new ArcLayer({
      id: 'cyber-intrusion-layer',
      data: cyberThreats,
      getSourcePosition: (d: any) => d.source,
      getTargetPosition: (d: any) => d.target,
      getSourceColor: (d: any) => d.type === 'DDOS' ? [255, 0, 80, 200] : [150, 0, 255, 200],
      getTargetColor: () => [255, 0, 0, 255],
      getWidth: (d: any) => 3 + (d.intensity * 2),
      getTilt: 15,
      greatCircle: false,
      visible: isCyberWarfareActive
    }),
    new ScatterplotLayer({
      id: 'focus-pulsar',
      data: selectedAsset ? [selectedAsset] : [],
      getPosition: (d: any) => [d.longitude, d.latitude, d.altitude || 0],
      getFillColor: [0, 255, 65, 100],
      getRadius: 15000,
      radiusScale: 1,
      updateTriggers: { getPosition: [selectedAsset] },
      beforeId: 'flight-layer'
    }),
    new LineLayer({
      id: 'satellite-beams',
      data: satellites,
      getSourcePosition: (d: any) => [d.longitude, d.latitude, d.altitude],
      getTargetPosition: (d: any) => [d.longitude, d.latitude, 0],
      getColor: [0, 255, 255, 50],
      getWidth: 1
    }),
    new ScatterplotLayer({
      id: 'satellite-layer',
      data: satellites,
      getPosition: (d: any) => [d.longitude, d.latitude, d.altitude],
      getFillColor: [0, 255, 255],
      getRadius: 10000,
      pickable: true
    }),
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
    new HeatmapLayer({
      id: 'activity-heatmap',
      data: flights,
      getPosition: (d: any) => [d.longitude, d.latitude],
      getWeight: (d: any) => d.isMilitary ? 10 : 1,
      radiusPixels: 60,
      visible: isHeatmapActive,
      opacity: 0.6
    }),
    new HexagonLayer({
      id: 'hex-grid-layer',
      data: flights,
      getPosition: (d: any) => [d.longitude, d.latitude],
      getColorWeight: (d: any) => d.isMilitary ? 10 : 1,
      getElevationWeight: (d: any) => d.isMilitary ? 10 : 1,
      elevationScale: 50,
      radius: 15000,
      extruded: true,
      colorRange: [
        [0, 255, 65, 50],
        [0, 200, 100, 100],
        [0, 150, 150, 150],
        [150, 100, 150, 200],
        [255, 50, 50, 255]
      ],
      visible: isHexGridActive,
      opacity: 0.8
    }),
    new PolygonLayer({
      id: 'orbital-footprint-layer',
      data: satellites,
      getPolygon: (d: any) => getCirclePolygon([d.longitude, d.latitude], 500),
      getFillColor: [0, 255, 255, 30],
      getLineColor: [0, 255, 255, 100],
      lineWidthMinPixels: 1,
      filled: true,
      stroked: true,
      visible: isOrbitalFootprintActive,
      updateTriggers: {
        getPolygon: [satellites]
      }
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
      getColor: (d: any) => d.isMilitary ? [255, 0, 0, 255] : [0, 255, 255, 255],
      getAngle: (d: any) => 360 - (d.heading || 0),
      transitions: { getPosition: 15000 },
      visible: !isHeatmapActive && !isHexGridActive,
      updateTriggers: { getPosition: [flights] },
      pickable: true
    })
  ], [earthquakes, traffic, flights, satellites, time, selectedAsset, isHeatmapActive, isCyberWarfareActive, cyberThreats, isHexGridActive, isOrbitalFootprintActive]);

  const handleCommand = useCallback((cmd: string) => {
    const [action, ...args] = cmd.toLowerCase().split(' ');
    setLogs(prev => [`CMD: ${cmd.toUpperCase()}`, ...prev].slice(0, 15));

    if (action === '/goto' && args.length > 0) {
      setLogs(prev => ["INITIATING GEODETIC SEARCH...", ...prev]);
    } else if (action === '/vision' && args.length > 0) {
      const mode = args[0].toUpperCase() as any;
      if (['CRT', 'NVG', 'FLIR'].includes(mode)) {
        setVisionMode(mode);
        setLogs(prev => [`FILTRATION SET: ${mode}`, ...prev]);
      }
    } else if (action === '/lock') {
      setIsRotating(false);
      setLogs(prev => ["ORBITAL LOCK ENGAGED", ...prev]);
    } else if (action === '/unlock') {
      setIsRotating(true);
      setSelectedAsset(null);
      setLogs(prev => ["ORBITAL LOCK RELEASED", ...prev]);
    } else if (action === '/heatmap') {
      setIsHeatmapActive(prev => !prev);
      setLogs(prev => [`HEATMAP OVERLAY: ${!isHeatmapActive ? 'ON' : 'OFF'}`, ...prev]);
    } else if (action === '/patrol') {
      setIsPatrolActive(prev => !prev);
      setLogs(prev => [`RECON PATROL: ${!isPatrolActive ? 'ACTIVE' : 'STANDBY'}`, ...prev]);
    } else if (action === '/report') {
      setShowReport(true);
      playTacticalSound('SELECT');
      setLogs(prev => ["GENERATING THEATER BRIEFING...", ...prev]);
    } else if (action === '/intrusion') {
      setIsCyberWarfareActive(prev => {
        const nextState = !prev;
        if (nextState) playTacticalSound('WARNING');
        return nextState;
      });
      setLogs(prev => [`CYBER WARFARE SIMULATION: ${!isCyberWarfareActive ? 'ACTIVE' : 'OFF'}`, ...prev]);
    } else if (action === '/hex') {
      setIsHexGridActive(prev => !prev);
      playTacticalSound('SELECT');
      setLogs(prev => [`HEX/GRID ANALYTICS: ${!isHexGridActive ? 'LINKED' : 'UNLINKED'}`, ...prev]);
    } else if (action === '/orbital') {
      setIsOrbitalFootprintActive(prev => !prev);
      playTacticalSound('SELECT');
      setLogs(prev => [`ORBITAL TARGETING PROJECTION: ${!isOrbitalFootprintActive ? 'ENGAGED' : 'RELEASED'}`, ...prev]);
    }
  }, [isHeatmapActive, isPatrolActive, isCyberWarfareActive, isHexGridActive, isOrbitalFootprintActive]);

  const modeClass = visionMode === 'CRT' ? 'crt-overlay' :
    visionMode === 'NVG' ? 'nvg-overlay saturate-200 contrast-125 sepia hue-rotate-[70deg] brightness-110' :
      visionMode === 'FLIR' ? 'flir-overlay invert hue-rotate-180 contrast-150 saturate-200' : '';

  const handleAssetClick = (info: any) => {
    startAmbientDrone();
    if (info.object) {
      playTacticalSound('SELECT');
      setSelectedAsset(info.object);
      setLogs(prev => [`UPLINK ESTABLISHED: ${info.object.id || 'NODE-X'}`, ...prev].slice(0, 15));
      setViewState({
        ...viewState,
        longitude: info.object.longitude,
        latitude: info.object.latitude,
        zoom: 12,
        pitch: 60,
        bearing: 0,
        transitionDuration: 2000,
        transitionInterpolator: new FlyToInterpolator() as any
      });
    } else {
      playTacticalSound('HOVER');
      setSelectedAsset(null);
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden relative" onMouseMove={() => startAmbientDrone()}>
      {/* Cinematic Technical Void Layers */}
      <div className="void-bg">
        <div className="technical-grid" />
        <div className="atmosphere-haze" style={{ background: `radial-gradient(circle at center, ${threatColor}22 0%, transparent 70%)` }} />
        <div className="space-dust" />
        <div className="data-node" style={{ top: '10%', left: '20%' }} />
        <div className="data-node" style={{ top: '40%', left: '80%' }} />
        <div className="data-node" style={{ top: '70%', left: '40%' }} />
        <div className="lens-flare">
          <div className="flare-ring flare-ring-1" />
          <div className="flare-ring flare-ring-2" />
          <div className="flare-ring flare-ring-3" />
        </div>
      </div>

      <ViewContainer
        viewState={viewState}
        setViewState={setViewState}
        layers={layers}
        onMouseEnter={() => {
          setIsRotating(false);
          playTacticalSound('HOVER');
        }}
        onMouseLeave={() => setIsRotating(true)}
        viewMode={viewMode}
        onClick={handleAssetClick}
      />

      <div className={`absolute inset-0 pointer-events-none z-[1000] ${modeClass}`} />

      {isCyberWarfareActive && (
        <div className="cyber-threat-banner">
          <div className="cyber-threat-text">CRITICAL INTRUSION DETECTED</div>
        </div>
      )}

      <MemoizedSmartCamera onLocationFound={handleLocationFound} />

      <NeuralLinkLog logs={logs} />
      <TargetIntelligenceSidebar asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      <SentinelMonitor asset={selectedAsset} />

      <VisualProcessingPanel
        visionMode={visionMode}
        setVisionMode={setVisionMode}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />
      <HudOverlay
        viewState={viewState}
        flightsCount={flights.filter(f => !f.isMilitary).length}
        militaryCount={flights.filter(f => f.isMilitary).length}
        satellitesCount={satellites.length}
        earthquakesCount={earthquakes.length}
        trafficCount={traffic.length}
      />

      <CortexTerminal onCommand={handleCommand} />

      {showReport && (
        <SituationReport
          onClose={() => setShowReport(false)}
          data={{
            threatLevel,
            threatColor,
            flights: flights.length,
            satellites: satellites.length,
            seismic: earthquakes.length,
            traffic: traffic.length
          }}
        />
      )}
    </div>
  );
}

export default App;
