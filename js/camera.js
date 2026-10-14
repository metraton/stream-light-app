// --- Camera Management ---

// Quarter turns clockwise, counted like CONFIG.columns.rotationSteps.
const CAMERA_ROTATION_STEPS = { iriun: 1 };

/** Default rotationSteps for a camera label: its CAMERA_ROTATION_STEPS entry, else 0. */
export function defaultRotationSteps(label = '') {
    const name = Object.keys(CAMERA_ROTATION_STEPS).find(n => label.toLowerCase().includes(n));
    return name ? CAMERA_ROTATION_STEPS[name] : 0;
}

async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput');
}

async function openAndRelease(constraints) {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach(t => t.stop());
}

// Labels stay empty until camera permission is granted, hence the throwaway
// stream. It opens the system default camera, which can be listed yet
// unopenable (a disconnected Iriun phone, a camera held by another app), so
// its failure must not hide the other cameras. Once labels are available the
// stream is skipped: this runs on every devicechange, and reopening a camera
// each time lights it up and can fight a stream already in use.
/**
 * Video inputs, labelled once any camera has opened. `error` is the last open
 * failure when no camera could be listed or opened, otherwise null.
 */
export async function enumerateCameras() {
    const listed = await listCameras();
    if (listed.some(cam => cam.label)) return { cameras: listed, error: null };

    try {
        await openAndRelease({ video: true });
        return { cameras: await listCameras(), error: null };
    } catch (e) {
        console.error(`Default camera failed to open (${e.name}):`, e);
        let error = e;
        const cameras = await listCameras();
        if (cameras.length === 0) {
            return { cameras, error };
        }
        for (const cam of cameras) {
            if (!cam.deviceId) continue;
            try {
                await openAndRelease({ video: { deviceId: { exact: cam.deviceId } } });
                return { cameras: await listCameras(), error: null };
            } catch (camError) {
                console.error(`Camera ${cam.deviceId} failed to open (${camError.name}):`, camError);
                error = camError;
            }
        }
        return { cameras, error };
    }
}

/** Why no camera is listed, from the last open failure: no permission, no hardware, or another error. */
export function noCamerasMessage(error) {
    if (!error) return 'No cameras found';
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return 'Camera access denied — check browser permissions';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return 'No camera detected';
    }
    return `Camera error: ${error.message || error.name}`;
}

/** Calls `onChange` whenever a camera is plugged in or removed, for the whole session. */
export function watchCameraDevices(onChange) {
    navigator.mediaDevices.addEventListener('devicechange', onChange);
}

export async function setupWebcam(deviceId) {
    const videoElement = document.createElement('video');
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;

    // Only deviceId and the 30 fps ceiling are hard; size and rate stay `ideal` so
    // cameras without an exact 720p30 mode (Iriun, StreamCam) still open.
    const constraints = {
        video: {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            aspectRatio: { ideal: 16 / 9 },
            frameRate: { ideal: 30, max: 30 },
        }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    await videoElement.play();

    await new Promise((resolve) => {
        if (videoElement.videoWidth > 0) return resolve();
        videoElement.addEventListener('loadedmetadata', resolve, { once: true });
    });

    const videoTexture = PIXI.Texture.from(videoElement);
    return { videoElement, videoTexture };
}

export function createTestPattern() {
    const w = 1080, h = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Dark background with gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1a0a2e');
    grad.addColorStop(0.3, '#16213e');
    grad.addColorStop(0.5, '#0f3460');
    grad.addColorStop(0.7, '#1a1a2e');
    grad.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Ceiling light
    ctx.fillStyle = '#FFD70066';
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.1, 60, 0, Math.PI * 2);
    ctx.fill();

    // LED strip
    const ledGrad = ctx.createLinearGradient(0, h * 0.05, w, h * 0.05);
    ledGrad.addColorStop(0, '#ff000088');
    ledGrad.addColorStop(0.5, '#ff00ff88');
    ledGrad.addColorStop(1, '#0000ff88');
    ctx.fillStyle = ledGrad;
    ctx.fillRect(0, h * 0.02, w, 8);

    // DJ controller
    ctx.fillStyle = '#111';
    ctx.fillRect(w * 0.05, h * 0.55, w * 0.9, h * 0.35);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w * 0.25, h * 0.72, 80, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w * 0.75, h * 0.72, 80, 0, Math.PI * 2);
    ctx.stroke();

    // Pads
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
            ctx.fillStyle = ['#ff6600', '#00ff66', '#6600ff', '#ff0066'][col];
            ctx.globalAlpha = 0.6;
            ctx.fillRect(w * 0.1 + col * 55, h * 0.6 + row * 45, 40, 35);
        }
    }
    ctx.globalAlpha = 1.0;

    // Person silhouette
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(w * 0.35, h * 0.32, 45, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.55);
    ctx.lineTo(w * 0.5, h * 0.55);
    ctx.lineTo(w * 0.45, h * 0.38);
    ctx.lineTo(w * 0.25, h * 0.38);
    ctx.closePath();
    ctx.fill();

    // Screen glow
    ctx.fillStyle = '#22ff4433';
    ctx.fillRect(w * 0.5, h * 0.2, w * 0.35, h * 0.25);

    // Column markers
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
        const x = (w / 5) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }

    const videoElement = { videoWidth: w, videoHeight: h };
    const videoTexture = PIXI.Texture.from(canvas);
    return { videoElement, videoTexture };
}
