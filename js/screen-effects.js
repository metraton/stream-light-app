// --- Screen effect registry: the Pantalla effects, run once over every column and glow ---
// Same shape as the per-color registry (effects-registry.js): { id, label,
// defaults, params, create(params, context), update(filter, params, context) },
// plus an optional tick(filter, params, { beatPhase, beatIndex }) called every
// frame while runsOnBeat(effect, params) holds: always for an effect with no
// `sync` param, and unless `sync` is 'fixed' for one with it.
// `context` is { width, height }, the stage size the filters cover.
// SCREEN_EFFECTS order is the order the passes run in, whatever order they were turned on.
import { glFilter, beatEnvelope } from './effects-registry.js';

const FIXED = 'fixed';
const TAU = 2 * Math.PI;
const BEATS_PER_BAR = 4;

// --- Flash ---

/**
 * The flash strength `beat` beats in (the clock's continuous position): 1 at
 * each of the `rate` flashes per beat, falling along (1 - t)^2 to 0 `duration`
 * beats later. A duration longer than the gap between flashes is cut to the
 * gap, so consecutive flashes never merge into a steady tint.
 */
export function flashEnvelope(beat, rate, duration) {
    const interval = 1 / rate;
    const since = ((beat % interval) + interval) % interval;
    const length = Math.min(duration, interval);
    return since >= length ? 0 : (1 - since / length) ** 2;
}

const FLASH_MODE = { white: 0, black: 1, negative: 2 };

// The frame over the black stage pushed toward white, black or its own
// negative by uAmount, and made opaque as it goes so the gaps flash too.
const FLASH_FRAGMENT = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uAmount;
uniform float uMode;

void main(void)
{
    vec4 source = texture(uTexture, vTextureCoord);
    vec3 target = uMode < 0.5 ? vec3(1.0) : (uMode < 1.5 ? vec3(0.0) : vec3(1.0) - source.rgb);
    finalColor = vec4(mix(source.rgb, target, uAmount), mix(source.a, 1.0, uAmount));
}
`;

const flash = {
    id: 'flash',
    label: 'Flash',
    defaults: { mode: 'white', rate: 1, duration: 0.25 },
    params: [
        {
            key: 'mode',
            label: 'Modo',
            options: [
                { value: 'white', label: 'Blanco' },
                { value: 'black', label: 'Negro' },
                { value: 'negative', label: 'Negativo' },
            ],
        },
        {
            key: 'rate',
            label: 'Ritmo',
            options: [{ value: 1, label: '1/1' }, { value: 2, label: '1/2' }, { value: 4, label: '1/4' }],
        },
        { key: 'duration', label: 'Duración', min: 0.05, max: 1, decimals: 2 },
    ],
    create(params) {
        const filter = glFilter('screen-flash-filter', FLASH_FRAGMENT, {
            flashUniforms: {
                uAmount: { value: 0, type: 'f32' },
                uMode: { value: 0, type: 'f32' },
            },
        });
        flash.update(filter, params);
        return filter;
    },
    update(filter, params) {
        filter.resources.flashUniforms.uniforms.uMode = FLASH_MODE[params.mode];
    },
    tick(filter, params, { beatPhase, beatIndex }) {
        filter.resources.flashUniforms.uniforms.uAmount = flashEnvelope(beatIndex + beatPhase, params.rate, params.duration);
    },
};

// --- Estelas ---

export const PERSISTENCE_MIN = 0.5;
export const PERSISTENCE_MAX = 0.95;

/** `value` held to the Persistencia range: below it a trail is gone in a few frames, above it the trail never clears. */
export function clampPersistence(value) {
    return Math.min(PERSISTENCE_MAX, Math.max(PERSISTENCE_MIN, value));
}

/**
 * The persistence Al golpe fades by at `beatPhase`: PERSISTENCE_MAX on the
 * beat, falling back to the clamped `base` along beatEnvelope, so each hit
 * leaves a long smear that shortens before the next one.
 */
export function trailPersistence(base, beatPhase) {
    const held = clampPersistence(base);
    return held + (PERSISTENCE_MAX - held) * beatEnvelope(beatPhase);
}

// The input and the history are sampled at the same stage pixel: the input
// texture may be larger than the stage (Pixi pools power-of-two sizes), the
// history is exactly the stage size.
const TRAILS_FRAGMENT = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uPrevious;
uniform vec4 uInputSize;
uniform vec2 uScreen;
uniform float uPersistence;

void main(void)
{
    vec4 current = texture(uTexture, vTextureCoord);
    vec2 previousUv = vTextureCoord * uInputSize.xy / uScreen;
    vec4 previous = texture(uPrevious, previousUv) * uPersistence;
    finalColor = max(current, previous);
}
`;

// Each frame the shader draws max(current, previous * persistence) into the
// history texture not read last frame, that texture is copied to the output,
// and the two swap. max() rather than the frame drawn over the faded history
// lets ghosts show across the opaque columns, not only in the gaps.
// GPU memory: the two RGBA8 textures at the stage size, 1920 x 1080 x 4 B =
// 7.9 MiB each, 15.8 MiB in all, are allocated in create() and freed in
// destroy(), which the screen layer calls when Estelas is turned off.
const trails = {
    id: 'trails',
    label: 'Estelas',
    defaults: { persistence: 0.8, sync: FIXED },
    params: [
        { key: 'persistence', label: 'Persistencia', min: PERSISTENCE_MIN, max: PERSISTENCE_MAX, decimals: 2 },
        {
            key: 'sync',
            label: 'Ritmo',
            options: [{ value: FIXED, label: 'Fijo' }, { value: 'beat', label: 'Al golpe' }],
        },
    ],
    create(params, { width, height }) {
        const filter = glFilter('screen-trails-filter', TRAILS_FRAGMENT, {
            trailsUniforms: {
                uScreen: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
                uPersistence: { value: 0, type: 'f32' },
            },
            uPrevious: PIXI.Texture.EMPTY.source,
        });
        const history = [PIXI.RenderTexture.create({ width, height }), PIXI.RenderTexture.create({ width, height })];
        const copy = new PIXI.AlphaFilter({ alpha: 1 });
        let read = 0;
        filter.apply = (filterManager, input, output, clearMode) => {
            const write = 1 - read;
            filter.resources.uPrevious = history[read].source;
            filterManager.applyFilter(filter, input, history[write], true);
            filterManager.applyFilter(copy, history[write], output, clearMode);
            read = write;
        };
        const destroyFilter = filter.destroy.bind(filter);
        filter.destroy = () => {
            for (const texture of history) texture.destroy(true);
            copy.destroy();
            destroyFilter();
        };
        trails.update(filter, params);
        return filter;
    },
    update(filter, params) {
        filter.resources.trailsUniforms.uniforms.uPersistence = clampPersistence(params.persistence);
    },
    tick(filter, params, { beatPhase }) {
        filter.resources.trailsUniforms.uniforms.uPersistence = trailPersistence(params.persistence, beatPhase);
    },
};

// --- Espejo / Caleidoscopio ---

/**
 * `angle` (radians) folded into one kaleidoscope wedge: reduced modulo the
 * segment angle TAU / segments, then mirrored about the segment's middle, so
 * the result lies in [0, segment / 2] and neighbouring wedges are reflections.
 * MIRROR_FRAGMENT's foldAngle computes the same and must change with it.
 */
export function foldAngle(angle, segments) {
    const segment = TAU / segments;
    const within = ((angle % segment) + segment) % segment;
    return Math.min(within, segment - within);
}

/**
 * The kaleidoscope rotation in radians for `spin` turns per 4-beat bar: steady
 * with sync 'smooth', and with 'beat' a quick turn on each beat that settles
 * before the next (1 - beatEnvelope), meeting the next beat's start exactly.
 */
export function kaleidoRotation(spin, beatIndex, beatPhase, sync) {
    const beats = sync === 'beat' ? beatIndex + 1 - beatEnvelope(beatPhase) : beatIndex + beatPhase;
    return TAU * spin * beats / BEATS_PER_BAR;
}

const MIRROR_MODE = { horizontal: 0, vertical: 1, kaleido: 2 };

// Espejo H keeps the left half and mirrors it onto the right, Espejo V the top
// onto the bottom; Caleido folds every pixel's angle around the stage center
// into one wedge, which the rotation turns.
const MIRROR_FRAGMENT = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec2 uScreen;
uniform float uMode;
uniform float uSegments;
uniform float uRotation;

const float TAU = 6.28318530718;

float foldAngle(float angle, float segments)
{
    float segment = TAU / segments;
    float within = mod(angle, segment);
    return min(within, segment - within);
}

void main(void)
{
    vec2 pixel = vTextureCoord * uInputSize.xy;
    if (uMode < 0.5) {
        pixel.x = min(pixel.x, uScreen.x - pixel.x);
    } else if (uMode < 1.5) {
        pixel.y = min(pixel.y, uScreen.y - pixel.y);
    } else {
        vec2 center = 0.5 * uScreen;
        vec2 offset = pixel - center;
        float angle = foldAngle(atan(offset.y, offset.x) - uRotation, uSegments);
        pixel = center + length(offset) * vec2(cos(angle), sin(angle));
    }
    finalColor = texture(uTexture, clamp(pixel * uInputSize.zw, uInputClamp.xy, uInputClamp.zw));
}
`;

const mirror = {
    id: 'mirror',
    label: 'Espejo',
    defaults: { mode: 'horizontal', segments: 6, spin: 0.25, sync: FIXED },
    params: [
        {
            key: 'mode',
            label: 'Modo',
            options: [
                { value: 'horizontal', label: 'Espejo H' },
                { value: 'vertical', label: 'Espejo V' },
                { value: 'kaleido', label: 'Caleido' },
            ],
        },
        { key: 'segments', label: 'Segmentos', min: 3, max: 12, decimals: 0 },
        { key: 'spin', label: 'Vueltas/compás', min: 0, max: 1, decimals: 2 },
        {
            key: 'sync',
            label: 'Giro',
            options: [
                { value: FIXED, label: 'Quieto' },
                { value: 'smooth', label: 'Continuo' },
                { value: 'beat', label: 'Al golpe' },
            ],
        },
    ],
    create(params, { width, height }) {
        const filter = glFilter('screen-mirror-filter', MIRROR_FRAGMENT, {
            mirrorUniforms: {
                uScreen: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
                uMode: { value: 0, type: 'f32' },
                uSegments: { value: params.segments, type: 'f32' },
                uRotation: { value: 0, type: 'f32' },
            },
        });
        mirror.update(filter, params);
        return filter;
    },
    update(filter, params) {
        const uniforms = filter.resources.mirrorUniforms.uniforms;
        uniforms.uMode = MIRROR_MODE[params.mode];
        uniforms.uSegments = params.segments;
        if (params.sync === FIXED) uniforms.uRotation = 0;
    },
    tick(filter, params, { beatPhase, beatIndex }) {
        filter.resources.mirrorUniforms.uniforms.uRotation = kaleidoRotation(params.spin, beatIndex, beatPhase, params.sync);
    },
};

export const SCREEN_EFFECTS = [flash, trails, mirror];

/** The definition registered under `id`, undefined when there is none. */
export function screenEffectById(id) {
    return SCREEN_EFFECTS.find(effect => effect.id === id);
}
