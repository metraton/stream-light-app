export const STATES = Object.freeze({
    LIVE: 'live',
    DEGRADED: 'degraded',
    RECONNECTING: 'reconnecting',
    DOWN: 'down',
});

export const DEFAULTS = Object.freeze({
    stallMs: 5000,
    rateWindowMs: 5000,
    congestionDegraded: 0.3,
    skippedRateDegraded: 0.02,
});

const SEVERITY = { live: 0, degraded: 1, reconnecting: 2, down: 3 };

/**
 * Snapshot: { t (ms), active, reconnecting, congestion (0..1), bytes, skippedFrames, totalFrames, missing? }.
 * The trailing stretch of active, non-reconnecting snapshots whose byte counter never went backwards,
 * because a restarted output resets its counters and must not be compared with its previous run.
 */
function trailingRun(history) {
    let start = history.length - 1;
    while (start >= 0) {
        const snapshot = history[start];
        const next = history[start + 1];
        if (!snapshot.active || snapshot.reconnecting || (next && snapshot.bytes > next.bytes)) break;
        start--;
    }
    return history.slice(start + 1);
}

function baselineAtLeast(run, windowMs) {
    const cutoff = run[run.length - 1].t - windowMs;
    for (let i = run.length - 1; i >= 0; i--) {
        if (run[i].t <= cutoff) return run[i];
    }
    return null;
}

/** Classifies an output from its snapshots, oldest first, as { state, reasons, bitrateKbps, skippedRate, congestion }. */
export function classify(history, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const latest = history[history.length - 1];
    if (!latest) return { state: STATES.DOWN, reasons: ['no-data'], bitrateKbps: null, skippedRate: null, congestion: null };

    const run = latest.active && !latest.reconnecting ? trailingRun(history) : [];
    const base = run.length > 1 ? baselineAtLeast(run, opts.rateWindowMs) ?? run[0] : null;
    const spanMs = base ? latest.t - base.t : 0;
    const bitrateKbps = spanMs > 0 ? ((latest.bytes - base.bytes) * 8) / spanMs : null;
    const framesDelta = base ? latest.totalFrames - base.totalFrames : 0;
    const skippedRate = framesDelta > 0 ? (latest.skippedFrames - base.skippedFrames) / framesDelta : null;
    const verdict = (state, reasons) => ({ state, reasons, bitrateKbps, skippedRate, congestion: latest.congestion });

    if (latest.missing) return verdict(STATES.DOWN, ['not-found']);
    if (latest.reconnecting) return verdict(STATES.RECONNECTING, ['reconnecting']);
    if (!latest.active) return verdict(STATES.DOWN, ['inactive']);

    const stallBase = baselineAtLeast(run, opts.stallMs);
    if (stallBase && latest.bytes <= stallBase.bytes) return verdict(STATES.DOWN, ['stalled']);

    const reasons = [];
    if (latest.congestion >= opts.congestionDegraded) reasons.push('congestion');
    if (skippedRate !== null && skippedRate >= opts.skippedRateDegraded) reasons.push('skipped-frames');
    return reasons.length ? verdict(STATES.DEGRADED, reasons) : verdict(STATES.LIVE, []);
}

/**
 * Returns what a state change means to the operator: 'initial' for the first observation,
 * 'alert' for entering reconnecting/down (or worsening reconnecting to down),
 * 'recovery' for leaving reconnecting/down for live/degraded, otherwise 'change'.
 */
export function transitionKind(previous, next) {
    if (previous === null) return 'initial';
    if (previous === next) return 'none';
    const before = SEVERITY[previous];
    const after = SEVERITY[next];
    if (after >= 2 && (before < 2 || after > before)) return 'alert';
    if (before >= 2 && after < 2) return 'recovery';
    return 'change';
}
