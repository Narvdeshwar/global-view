/**
 * Tactical Sound Generation Service
 * Synthesizes procedural audio (drones, beeps, chirps) using the Web Audio API.
 * This avoids the need for external MP3/WAV assets and keeps the build lightweight.
 */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let ambientOsc: OscillatorNode | null = null;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.15; // Set global volume
    masterGain.connect(audioCtx.destination);
}

/**
 * Procedural UI Feedback Beeps
 */
export const playTacticalSound = (type: 'HOVER' | 'SELECT' | 'WARNING' | 'ERROR') => {
    if (!audioCtx) initAudio();
    if (!audioCtx || !masterGain) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(masterGain);

    const now = audioCtx.currentTime;

    switch (type) {
        case 'HOVER':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
            break;

        case 'SELECT':
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;

        case 'WARNING':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.linearRampToValueAtTime(440, now + 0.2);
            osc.frequency.linearRampToValueAtTime(220, now + 0.4);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
            break;

        case 'ERROR':
            osc.type = 'square';
            osc.frequency.setValueAtTime(110, now);
            osc.frequency.linearRampToValueAtTime(80, now + 0.2);
            gain.gain.setValueAtTime(0.6, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
            break;
    }
};

/**
 * Ambient Tactical Uplink Drone (Atmosphere)
 */
export const startAmbientDrone = () => {
    if (!audioCtx) initAudio();
    if (!audioCtx || !masterGain || ambientOsc) return;

    ambientOsc = audioCtx.createOscillator();
    const ambientGain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    ambientOsc.type = 'sine';
    ambientOsc.frequency.value = 55; // Low A

    filter.type = 'lowpass';
    filter.frequency.value = 150;
    filter.Q.value = 10;

    ambientGain.gain.value = 0.05; // Very subtle

    ambientOsc.connect(filter);
    filter.connect(ambientGain);
    ambientGain.connect(masterGain);

    ambientOsc.start();
};

export const stopAmbientDrone = () => {
    if (ambientOsc) {
        ambientOsc.stop();
        ambientOsc = null;
    }
};
