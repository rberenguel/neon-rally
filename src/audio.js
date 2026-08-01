let _motorSampler = null;
let _driftSampler = null;
let _audioStarted = false;

export function initEngineSound() {
    if (typeof Tone === 'undefined') return;
    _motorSampler = new Tone.Sampler({
        urls: { e1: 'motor.mp3' },
        baseUrl: 'audio/',
        release: 1.9,
        volume: -20,
    }).toDestination();

    _driftSampler = new Tone.Sampler({
        urls: { e1: 'drift.mp3' },
        baseUrl: 'audio/',
        release: 1.9,
        volume: -20,
    }).toDestination();

    const start = async () => {
        if (_audioStarted) return;
        await Tone.start();
        _audioStarted = true;
        document.removeEventListener('keydown', start);
        document.removeEventListener('pointerdown', start);
    };
    document.addEventListener('keydown', start);
    document.addEventListener('pointerdown', start);
}

export function updateEngineSound() {
    if (!_motorSampler || !_audioStarted) return;
    if (Math.random() < 0.05) {
        _motorSampler.triggerAttackRelease('e1', 0.3, Tone.now());
    }
}

// velocity: 0–1, converted to dB so the difference is perceptible.
// 1 = full volume, 0 = silent (clamped to -40dB floor to avoid -Infinity).
export function updateDriftSound(velocity = 1) {
    if (!_driftSampler || !_audioStarted) return;
    if (Math.random() < 0.05) {
        _driftSampler.volume.value = -20 + (velocity > 0 ? 20 * Math.log10(velocity) : -40);
        _driftSampler.triggerAttackRelease('e1', 0.3, Tone.now());
    }
}
