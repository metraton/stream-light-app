// --- Camera rotation: which cameras key 0 cycles through, and in what order ---
// Pure: it never touches the DOM or the media APIs. An order is a list of { key, enabled }
// that also keeps cameras not plugged in now, so a camera that comes back keeps its place.

export const CAMERA_ORDER_KEY = 'streamlight-camera-order';

const isIriun = cam => cam.label.toLowerCase().includes('iriun');

/**
 * Browser video inputs as { key, deviceId, label }. The key is the label, so a camera keeps its
 * settings in any browser profile, else the device id; a repeated label gets " #2", " #3" in
 * browser order. An input listed with neither (no camera permission yet) is dropped.
 */
export function describeCameras(devices) {
    const seen = new Map();
    const cameras = [];
    for (const { deviceId, label } of devices) {
        const base = label || deviceId;
        if (!base) continue;
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        cameras.push({ key: count === 1 ? base : `${base} #${count}`, deviceId, label });
    }
    return cameras;
}

/** `order` plus every present camera it does not know, appended enabled; an Iriun camera goes first among them. */
export function reconcileOrder(order, cameras) {
    const known = new Set(order.map(entry => entry.key));
    const added = cameras
        .filter(cam => !known.has(cam.key))
        .sort((a, b) => Number(isIriun(b)) - Number(isIriun(a)));
    return [...order, ...added.map(cam => ({ key: cam.key, enabled: true }))];
}

/** Keys of the cameras key 0 cycles through: present and enabled, in order. */
export function rotationKeys(order, cameras) {
    const present = new Set(cameras.map(cam => cam.key));
    return order.filter(entry => entry.enabled && present.has(entry.key)).map(entry => entry.key);
}

/**
 * The camera after `currentKey` in the rotation, wrapping. A `currentKey` that was unplugged or
 * disabled still marks its place in the order, so the next one after that place is chosen; with no
 * `currentKey` it is the first in the rotation. null when no present camera is enabled.
 */
export function nextCameraKey(order, cameras, currentKey) {
    const rotation = rotationKeys(order, cameras);
    if (rotation.length === 0) return null;
    const place = order.findIndex(entry => entry.key === currentKey);
    if (place === -1) return rotation[0];
    const after = [...order.slice(place + 1), ...order.slice(0, place + 1)];
    return after.find(entry => rotation.includes(entry.key)).key;
}

/** The camera to show after the list or the order changed: `currentKey` while it stays in the rotation, else the next. */
export function cameraToShow(order, cameras, currentKey) {
    return rotationKeys(order, cameras).includes(currentKey) ? currentKey : nextCameraKey(order, cameras, currentKey);
}

/** The present cameras in order, each with its enabled flag, as the panel lists them. */
export function orderedCameras(order, cameras) {
    const byKey = new Map(cameras.map(cam => [cam.key, cam]));
    return order.filter(entry => byKey.has(entry.key)).map(entry => ({ ...byKey.get(entry.key), enabled: entry.enabled }));
}

export function setCameraEnabled(order, key, enabled) {
    return order.map(entry => (entry.key === key ? { ...entry, enabled } : entry));
}

/**
 * `order` with camera `key` swapped with the nearest present camera before it (direction -1) or
 * after it (+1); unchanged at either end. Cameras not plugged in are stepped over, since the panel
 * does not list them.
 */
export function moveCamera(order, cameras, key, direction) {
    const present = new Set(cameras.map(cam => cam.key));
    const from = order.findIndex(entry => entry.key === key);
    if (from === -1) return order;
    let to = from + direction;
    while (to >= 0 && to < order.length && !present.has(order[to].key)) to += direction;
    if (to < 0 || to >= order.length) return order;
    const moved = [...order];
    [moved[from], moved[to]] = [moved[to], moved[from]];
    return moved;
}

/** The saved order, keeping the first well-formed entry per key; [] when none is saved or it is unreadable. */
export function loadCameraOrder(storage = localStorage) {
    let data;
    try {
        data = JSON.parse(storage.getItem(CAMERA_ORDER_KEY));
    } catch {
        return [];
    }
    if (!Array.isArray(data)) return [];
    const order = [];
    const keys = new Set();
    for (const entry of data) {
        if (typeof entry?.key !== 'string' || !entry.key || typeof entry.enabled !== 'boolean') continue;
        if (keys.has(entry.key)) continue;
        keys.add(entry.key);
        order.push({ key: entry.key, enabled: entry.enabled });
    }
    return order;
}

export function saveCameraOrder(order, storage = localStorage) {
    storage.setItem(CAMERA_ORDER_KEY, JSON.stringify(order));
}
