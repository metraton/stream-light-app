// Checks that the monitor's poller can never ask OBS for something that crashes it: no GetOutputList
// ever, GetOutputStatus for the vertical output only while Aitum reports streaming, one request in
// flight at a time, and a growing silence after a failure.
// Run: node --test tests/test_poller.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller, MAIN_ID } from '../monitor/poller.js';

const STATUS = { outputActive: true, outputReconnecting: false, outputCongestion: 0, outputBytes: 10, outputSkippedFrames: 0, outputTotalFrames: 60 };

/** A fake obs-websocket: records every request type and answers from `aitumStreaming` and `outputKnown`. */
function fakeObs({ aitumStreaming = false, outputKnown = true } = {}) {
    const sent = [];
    const send = async (type, data) => {
        sent.push({ type, data });
        if (type === 'GetStreamStatus') return STATUS;
        if (type === 'CallVendorRequest') return { responseData: { streaming: aitumStreaming, success: true } };
        if (type === 'GetOutputStatus' && outputKnown) return STATUS;
        throw Object.assign(new Error(`${type} rejected`), { timeout: false });
    };
    return { sent, send };
}

const timeoutError = () => Object.assign(new Error('timed out'), { timeout: true });

test('never sends GetOutputList, whatever the state of Aitum or the output', async () => {
    for (const scenario of [{}, { aitumStreaming: true }, { aitumStreaming: true, outputKnown: false }, { aitumStreaming: false, outputKnown: false }]) {
        const { sent, send } = fakeObs(scenario);
        const poller = createPoller({ send, now: () => 1000, vertical: 'IG' });
        await poller.poll();
        assert.ok(!sent.some(r => r.type === 'GetOutputList'), JSON.stringify(scenario));
    }
});

test('GetOutputStatus for the vertical output is sent only when Aitum reported streaming', async () => {
    const idle = fakeObs({ aitumStreaming: false });
    const idleResult = await createPoller({ send: idle.send, now: () => 1000, vertical: 'IG' }).poll();
    assert.deepEqual(idle.sent.map(r => r.type), ['GetStreamStatus', 'CallVendorRequest']);
    assert.equal(idleResult[1].snapshot.active, false);

    const live = fakeObs({ aitumStreaming: true });
    const liveResult = await createPoller({ send: live.send, now: () => 1000, vertical: 'IG' }).poll();
    assert.deepEqual(live.sent.map(r => r.type), ['GetStreamStatus', 'CallVendorRequest', 'GetOutputStatus']);
    assert.deepEqual(live.sent[2].data, { outputName: 'vertical_canvas_stream_IG' });
    assert.deepEqual(liveResult.map(r => r.id), [MAIN_ID, 'vertical_canvas_stream_IG']);
    assert.equal(liveResult[1].snapshot.bytes, 10);
});

test('without a vertical output only the main stream is polled', async () => {
    const { sent, send } = fakeObs({ aitumStreaming: true });
    await createPoller({ send, now: () => 1000, vertical: null }).poll();
    assert.deepEqual(sent.map(r => r.type), ['GetStreamStatus']);
});

test('a rejected (not timed out) GetOutputStatus marks the output missing; a timeout propagates', async () => {
    const missing = fakeObs({ aitumStreaming: true, outputKnown: false });
    const result = await createPoller({ send: missing.send, now: () => 1000, vertical: 'IG' }).poll();
    assert.equal(result[1].snapshot.missing, true);

    const send = async type => {
        if (type === 'GetOutputStatus') throw timeoutError();
        return type === 'GetStreamStatus' ? STATUS : { responseData: { streaming: true } };
    };
    await assert.rejects(createPoller({ send, now: () => 1000, vertical: 'IG' }).poll(), { timeout: true });
});

test('only one poll is in flight at a time', async () => {
    let release;
    let calls = 0;
    const send = () => new Promise(resolve => { calls++; release = () => resolve(STATUS); });
    const poller = createPoller({ send, now: () => 1000, vertical: null });
    const first = poller.poll();
    assert.equal(await poller.poll(), null);
    assert.equal(calls, 1);
    release();
    assert.equal((await first).length, 1);
});

test('after a failure nothing is sent until the delay passes; the delay doubles and stops at 30 s', async () => {
    let clock = 0;
    let calls = 0;
    const send = async () => { calls++; throw timeoutError(); };
    const poller = createPoller({ send, now: () => clock, vertical: null });

    await assert.rejects(poller.poll(), { timeout: true });
    assert.equal(calls, 1);
    clock = 1999;
    assert.equal(await poller.poll(), null);
    assert.equal(calls, 1);

    clock = 2000;
    await assert.rejects(poller.poll());
    clock = 2000 + 3999;
    assert.equal(await poller.poll(), null);
    assert.equal(calls, 2);

    for (let i = 0; i < 6; i++) {
        clock += 60000;
        await assert.rejects(poller.poll());
    }
    const before = calls;
    clock += 29999;
    assert.equal(await poller.poll(), null);
    clock += 1;
    await assert.rejects(poller.poll());
    assert.equal(calls, before + 1);
});

test('a successful poll resets the back-off', async () => {
    let clock = 0;
    let failNext = true;
    const send = async () => {
        if (failNext) { failNext = false; throw timeoutError(); }
        return STATUS;
    };
    const poller = createPoller({ send, now: () => clock, vertical: null });
    await assert.rejects(poller.poll());
    clock = 2000;
    assert.ok(await poller.poll());
    assert.ok(await poller.poll());
});
