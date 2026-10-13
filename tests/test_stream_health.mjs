// Checks the stream health monitor's pure logic: the obs-websocket v5 authentication string
// against a vector derived independently with Python's hashlib, and the classification of
// output snapshots (live / degraded / reconnecting / down, including stall detection).
// Run: node --test tests/test_stream_health.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAuthentication } from '../monitor/obs-auth.js';
import { classify, transitionKind } from '../monitor/health.js';

const BYTES_PER_SECOND = 1_125_000;

/** One snapshot per second from t=0, a healthy 9000 kbps / 60 fps output unless `overrides(second)` says otherwise. */
function series(seconds, overrides = () => ({})) {
    return Array.from({ length: seconds + 1 }, (_, s) => ({
        t: s * 1000,
        active: true,
        reconnecting: false,
        congestion: 0,
        bytes: s * BYTES_PER_SECOND,
        skippedFrames: 0,
        totalFrames: s * 60,
        ...overrides(s),
    }));
}

test('authentication string matches the vector from the protocol guide inputs', async () => {
    const auth = await computeAuthentication(
        'supersecretpassword',
        'lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=',
        '+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=',
    );
    assert.equal(auth, '1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=');
});

test('healthy output is live and its bitrate comes from byte deltas', () => {
    const verdict = classify(series(10));
    assert.equal(verdict.state, 'live');
    assert.deepEqual(verdict.reasons, []);
    assert.equal(verdict.bitrateKbps, 9000);
    assert.equal(verdict.skippedRate, 0);
});

test('active output whose bytes stop for stallMs is down (stalled), not before', () => {
    const frozenAfter4s = s => ({ bytes: Math.min(s, 4) * BYTES_PER_SECOND });
    assert.equal(classify(series(8, frozenAfter4s)).state, 'live');
    const stalled = classify(series(9, frozenAfter4s));
    assert.equal(stalled.state, 'down');
    assert.deepEqual(stalled.reasons, ['stalled']);
    assert.equal(stalled.bitrateKbps, 0);
});

test('stallMs is configurable', () => {
    const frozenAfter4s = s => ({ bytes: Math.min(s, 4) * BYTES_PER_SECOND });
    assert.equal(classify(series(7, frozenAfter4s), { stallMs: 3000 }).state, 'down');
});

test('too little history never counts as a stall', () => {
    const history = series(2, () => ({ bytes: 0 }));
    assert.equal(classify(history).state, 'live');
});

test('a restarted output with reset counters is not a stall', () => {
    const restarted = series(8, s => ({ bytes: s < 6 ? s * BYTES_PER_SECOND * 3 : (s - 5) * BYTES_PER_SECOND }));
    assert.equal(classify(restarted).state, 'live');
});

test('reconnecting wins over active and carries no stall verdict', () => {
    const history = series(10, s => (s >= 7 ? { reconnecting: true, bytes: 7 * BYTES_PER_SECOND } : {}));
    const verdict = classify(history);
    assert.equal(verdict.state, 'reconnecting');
    assert.deepEqual(verdict.reasons, ['reconnecting']);
});

test('an output that is not active is down (inactive)', () => {
    const verdict = classify(series(5, s => (s === 5 ? { active: false } : {})));
    assert.equal(verdict.state, 'down');
    assert.deepEqual(verdict.reasons, ['inactive']);
});

test('an output missing from the list is down (not-found); no history is down (no-data)', () => {
    assert.deepEqual(classify(series(3, s => (s === 3 ? { missing: true, active: false } : {}))).reasons, ['not-found']);
    assert.deepEqual(classify([]).reasons, ['no-data']);
});

test('congestion at the threshold makes a flowing output degraded', () => {
    const verdict = classify(series(10, () => ({ congestion: 0.5 })));
    assert.equal(verdict.state, 'degraded');
    assert.deepEqual(verdict.reasons, ['congestion']);
});

test('skipped frames above 2% over the recent window make it degraded; 1% does not', () => {
    const skipping = rate => s => ({ skippedFrames: Math.round(s * 60 * rate) });
    const verdict = classify(series(10, skipping(0.05)));
    assert.equal(verdict.state, 'degraded');
    assert.deepEqual(verdict.reasons, ['skipped-frames']);
    assert.ok(Math.abs(verdict.skippedRate - 0.05) < 0.005);
    assert.equal(classify(series(10, skipping(0.01))).state, 'live');
});

test('old skipped frames fall out of the recent-rate window', () => {
    const early = s => ({ skippedFrames: Math.min(s, 2) * 30 });
    assert.equal(classify(series(20, early)).state, 'live');
});

test('transitions: first observation is initial, drops alert, returns recover', () => {
    assert.equal(transitionKind(null, 'down'), 'initial');
    assert.equal(transitionKind('live', 'live'), 'none');
    assert.equal(transitionKind('live', 'down'), 'alert');
    assert.equal(transitionKind('degraded', 'reconnecting'), 'alert');
    assert.equal(transitionKind('reconnecting', 'down'), 'alert');
    assert.equal(transitionKind('down', 'reconnecting'), 'change');
    assert.equal(transitionKind('down', 'live'), 'recovery');
    assert.equal(transitionKind('reconnecting', 'degraded'), 'recovery');
    assert.equal(transitionKind('live', 'degraded'), 'change');
    assert.equal(transitionKind('degraded', 'live'), 'change');
});

test('an inactive output nobody expects to stream is idle; once expected it is down', () => {
    const history = series(5, () => ({ active: false, bytes: 0, totalFrames: 0 }));
    const idle = classify(history, { expectStreaming: false });
    assert.equal(idle.state, 'idle');
    assert.deepEqual(idle.reasons, ['not-streaming']);
    assert.equal(classify(history).state, 'down');
});

test('going idle never alerts or counts as a recovery; leaving idle is a plain change', () => {
    assert.equal(transitionKind('down', 'idle'), 'change');
    assert.equal(transitionKind('live', 'idle'), 'change');
    assert.equal(transitionKind('idle', 'live'), 'change');
    assert.equal(transitionKind('idle', 'down'), 'alert');
    assert.equal(transitionKind(null, 'idle'), 'initial');
});
