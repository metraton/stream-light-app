// --- Screen effect registry: the Pantalla effects, run once over every column and glow ---
// Same shape as the per-color registry (effects-registry.js): { id, label,
// defaults, params, create(params, context), update(filter, params, context) },
// plus an optional tick(filter, params, { beatPhase, beatIndex }) called every
// frame while runsOnBeat(effect, params) holds: always for an effect with no
// `sync` param, and unless `sync` is 'fixed' for one with it.
// `context` is { width, height }, the stage size the filters cover.
// SCREEN_EFFECTS order is the order the passes run in, whatever order they were turned on.
import { glFilter } from './effects-registry.js';

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

export const SCREEN_EFFECTS = [flash];

/** The definition registered under `id`, undefined when there is none. */
export function screenEffectById(id) {
    return SCREEN_EFFECTS.find(effect => effect.id === id);
}
