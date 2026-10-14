// Checks the camera rotation key 0 runs: the order the panel sets, disabled cameras skipped, an
// unplugged active camera falling to the next one, a new camera joining enabled, and the saved order.
// Run: node --test tests/test_camera_rotation.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CAMERA_ORDER_KEY, describeCameras, reconcileOrder, rotationKeys, nextCameraKey, cameraToShow,
    orderedCameras, setCameraEnabled, moveCamera, loadCameraOrder, saveCameraOrder,
} from '../js/camera-rotation.js';
import { resolveShortcut } from '../js/shortcuts.js';

const LOGI = { deviceId: 'id-logi', label: 'Logitech StreamCam' };
const IRIUN = { deviceId: 'id-iriun', label: 'Iriun Webcam' };
const OBS = { deviceId: 'id-obs', label: 'OBS Virtual Camera' };

function memoryStorage(initial = {}) {
    const items = new Map(Object.entries(initial));
    return { getItem: key => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)) };
}

test('a first start puts the Iriun camera first and every camera enabled', () => {
    const cameras = describeCameras([LOGI, IRIUN, OBS]);
    const order = reconcileOrder([], cameras);
    assert.deepEqual(order, [
        { key: 'Iriun Webcam', enabled: true },
        { key: 'Logitech StreamCam', enabled: true },
        { key: 'OBS Virtual Camera', enabled: true },
    ]);
    assert.equal(cameraToShow(order, cameras, null), 'Iriun Webcam');
});

test('cameras are keyed by label, by device id without one, and repeated labels are numbered', () => {
    const cameras = describeCameras([LOGI, { deviceId: 'raw-id', label: '' }, { ...LOGI, deviceId: 'id-logi-2' }, { deviceId: '', label: '' }]);
    assert.deepEqual(cameras.map(cam => cam.key), ['Logitech StreamCam', 'raw-id', 'Logitech StreamCam #2']);
});

test('0 follows the panel order, wraps, and skips disabled cameras', () => {
    const cameras = describeCameras([LOGI, IRIUN, OBS]);
    let order = reconcileOrder([], cameras);
    assert.equal(nextCameraKey(order, cameras, 'Iriun Webcam'), 'Logitech StreamCam');
    assert.equal(nextCameraKey(order, cameras, 'OBS Virtual Camera'), 'Iriun Webcam');

    order = setCameraEnabled(order, 'Logitech StreamCam', false);
    assert.deepEqual(rotationKeys(order, cameras), ['Iriun Webcam', 'OBS Virtual Camera']);
    assert.equal(nextCameraKey(order, cameras, 'Iriun Webcam'), 'OBS Virtual Camera');
});

test('with one camera in the rotation 0 stays on it; with none it gives null', () => {
    const cameras = describeCameras([IRIUN]);
    const order = reconcileOrder([], cameras);
    assert.equal(nextCameraKey(order, cameras, 'Iriun Webcam'), 'Iriun Webcam');
    assert.equal(nextCameraKey(setCameraEnabled(order, 'Iriun Webcam', false), cameras, 'Iriun Webcam'), null);
    assert.equal(cameraToShow([], [], null), null);
});

test('disabling the camera on stage moves the stage to the next enabled one', () => {
    const cameras = describeCameras([LOGI, IRIUN, OBS]);
    const order = setCameraEnabled(reconcileOrder([], cameras), 'Logitech StreamCam', false);
    assert.equal(cameraToShow(order, cameras, 'Logitech StreamCam'), 'OBS Virtual Camera');
    assert.equal(cameraToShow(order, cameras, 'Iriun Webcam'), 'Iriun Webcam');
});

test('an unplugged active camera falls to the next enabled one after its place, and keeps that place', () => {
    const all = describeCameras([LOGI, IRIUN, OBS]);
    const order = reconcileOrder([], all);
    const withoutLogi = describeCameras([IRIUN, OBS]);
    assert.equal(cameraToShow(reconcileOrder(order, withoutLogi), withoutLogi, 'Logitech StreamCam'), 'OBS Virtual Camera');
    assert.deepEqual(reconcileOrder(order, withoutLogi), order);
    assert.deepEqual(orderedCameras(order, withoutLogi).map(cam => cam.key), ['Iriun Webcam', 'OBS Virtual Camera']);
});

test('a camera plugged in later joins the end of the rotation enabled, without taking the stage', () => {
    const before = describeCameras([LOGI]);
    const order = reconcileOrder([], before);
    const after = describeCameras([LOGI, OBS]);
    const merged = reconcileOrder(order, after);
    assert.deepEqual(merged, [{ key: 'Logitech StreamCam', enabled: true }, { key: 'OBS Virtual Camera', enabled: true }]);
    assert.equal(cameraToShow(merged, after, 'Logitech StreamCam'), 'Logitech StreamCam');
    assert.equal(cameraToShow(merged, after, null), 'Logitech StreamCam');
});

test('a disabled camera stays disabled when it is unplugged and plugged back', () => {
    const cameras = describeCameras([LOGI, IRIUN]);
    const order = setCameraEnabled(reconcileOrder([], cameras), 'Logitech StreamCam', false);
    const back = reconcileOrder(reconcileOrder(order, describeCameras([IRIUN])), cameras);
    assert.deepEqual(back, order);
});

test('moving a camera swaps it with the nearest listed neighbour and stops at either end', () => {
    const cameras = describeCameras([LOGI, IRIUN, OBS]);
    const order = reconcileOrder([], cameras);
    const keys = o => o.map(entry => entry.key);
    assert.deepEqual(keys(moveCamera(order, cameras, 'OBS Virtual Camera', -1)), ['Iriun Webcam', 'OBS Virtual Camera', 'Logitech StreamCam']);
    assert.equal(moveCamera(order, cameras, 'Iriun Webcam', -1), order);
    assert.equal(moveCamera(order, cameras, 'OBS Virtual Camera', 1), order);

    const unpluggedMiddle = describeCameras([IRIUN, OBS]);
    assert.deepEqual(keys(moveCamera(order, unpluggedMiddle, 'Iriun Webcam', 1)), ['OBS Virtual Camera', 'Logitech StreamCam', 'Iriun Webcam']);
});

test('0 and Shift+0 ask the app for the next camera; Ctrl+0 and Alt+0 stay unbound', () => {
    for (const shiftKey of [false, true]) {
        let calls = 0;
        resolveShortcut({ key: '0', code: 'Digit0', shiftKey, ctrlKey: false, altKey: false })({ nextCamera: () => calls++ });
        assert.equal(calls, 1);
    }
    assert.equal(resolveShortcut({ key: '0', code: 'Digit0', shiftKey: false, ctrlKey: true, altKey: false }), null);
    assert.equal(resolveShortcut({ key: '0', code: 'Digit0', shiftKey: false, ctrlKey: false, altKey: true }), null);
});

test('the order round-trips through storage, and a bad stored value loads as empty', () => {
    const storage = memoryStorage();
    const order = setCameraEnabled(reconcileOrder([], describeCameras([LOGI, IRIUN])), 'Iriun Webcam', false);
    saveCameraOrder(order, storage);
    assert.deepEqual(loadCameraOrder(storage), order);

    assert.deepEqual(loadCameraOrder(memoryStorage()), []);
    assert.deepEqual(loadCameraOrder(memoryStorage({ [CAMERA_ORDER_KEY]: '{not json' })), []);
    assert.deepEqual(loadCameraOrder(memoryStorage({ [CAMERA_ORDER_KEY]: '{"key":"x"}' })), []);
    const messy = [{ key: 'a', enabled: true }, { key: 'a', enabled: false }, { key: '', enabled: true }, { key: 'b' }, null];
    assert.deepEqual(loadCameraOrder(memoryStorage({ [CAMERA_ORDER_KEY]: JSON.stringify(messy) })), [{ key: 'a', enabled: true }]);
});
