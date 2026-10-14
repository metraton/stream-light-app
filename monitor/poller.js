export const MAIN_ID = '__main__';
export const VENDOR = 'aitum-vertical-canvas';
export const DEFAULT_VERTICAL_OUTPUT = 'Instagram';

const VERTICAL_OUTPUT_PREFIX = 'vertical_canvas_stream_';
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 30000;

export const verticalOutputId = name => `${VERTICAL_OUTPUT_PREFIX}${name}`;

const snapshotOf = (t, status) => ({
    t,
    active: status.outputActive,
    reconnecting: status.outputReconnecting,
    congestion: status.outputCongestion,
    bytes: status.outputBytes,
    skippedFrames: status.outputSkippedFrames,
    totalFrames: status.outputTotalFrames,
});

const idleSnapshot = t => ({ t, active: false, reconnecting: false, congestion: 0, bytes: 0, skippedFrames: 0, totalFrames: 0 });

/**
 * Returns a poller whose poll() resolves to [{ id, snapshot }] for the main stream and, when `vertical`
 * names an Aitum output, that output; or to null when a poll is in flight or backing off after a failure.
 * `send(type, data)` must reject with `error.timeout === true` on a timeout.
 *
 * Requests go out one at a time, and only GetStreamStatus, Aitum's vendor status and, while Aitum reports
 * streaming, GetOutputStatus for the vertical output: GetOutputList is never sent because obs-websocket
 * 5.6.x calls obs_output_get_width on every output, which crashes OBS on an output without video.
 */
export function createPoller({ send, now, vertical }) {
    let inFlight = false;
    let failures = 0;
    let blockedUntil = 0;

    async function pollVertical(t) {
        const id = verticalOutputId(vertical);
        const aitum = await send('CallVendorRequest', { vendorName: VENDOR, requestType: 'status', requestData: {} });
        if (!aitum.responseData?.streaming) return { id, snapshot: idleSnapshot(t) };
        try {
            return { id, snapshot: snapshotOf(t, await send('GetOutputStatus', { outputName: id })) };
        } catch (error) {
            if (error.timeout) throw error;
            return { id, snapshot: { ...idleSnapshot(t), missing: true } };
        }
    }

    async function poll() {
        if (inFlight || now() < blockedUntil) return null;
        inFlight = true;
        const t = now();
        try {
            const results = [{ id: MAIN_ID, snapshot: snapshotOf(t, await send('GetStreamStatus')) }];
            if (vertical) results.push(await pollVertical(t));
            failures = 0;
            return results;
        } catch (error) {
            failures++;
            blockedUntil = now() + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
            throw error;
        } finally {
            inFlight = false;
        }
    }

    return { poll };
}
