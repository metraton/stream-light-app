// --- Effect registry: the per-color effects a column can run after its color adjust ---
// Each effect is { id, label, defaults, params, create(params, context), update(filter, params, context) }.
// `params` describes the panel controls: a slider ({ key, label, min, max,
// decimals }) or a button choice ({ key, label, options: [{ value, label }] }).
// `context.color` is the hex of the color the column shows, null when uncolored.
// An effect that can follow the beat also has a `sync` option and
// tick(filter, params, { beatPhase, beatIndex }), called every frame only while
// `sync` is not 'fixed' (runsOnBeat); every other effect costs nothing per frame.
// create() and update() reach the PIXI global and the DOM only when called, so
// the definitions load in Node for the stack tests. Every effect is one more
// render pass, paid only by the columns whose color runs it.

const WHITE = 0xffffff;

// Pixi 8's standard filter vertex stage: maps the filter quad to the output
// frame and gives the fragment stage input-texture coordinates.
const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

const reportedFailures = new Set();

function reportBuildFailure(name, detail) {
    if (reportedFailures.has(name)) return;
    reportedFailures.add(name);
    console.error(`[effects] The "${name}" filter failed to build; columns running it draw nothing for that pass.\n${detail}`);
}

let probeContext;

/**
 * The compile and link log of `glProgram`'s processed sources in a scratch
 * WebGL context: '' when the program links or no WebGL context is available.
 * Pixi links a filter only at its first render and then just logs "Could not
 * initialize shader", so this is where a broken filter becomes visible to us.
 */
function linkErrorOf(glProgram) {
    probeContext ??= document.createElement('canvas').getContext('webgl2')
        ?? document.createElement('canvas').getContext('webgl');
    const gl = probeContext;
    if (!gl) return '';
    const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, glProgram.vertex);
    const fragment = compile(gl.FRAGMENT_SHADER, glProgram.fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    const error = gl.getProgramParameter(program, gl.LINK_STATUS) ? '' : [
        gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment), gl.getProgramInfoLog(program),
    ].filter(Boolean).join('\n');
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return error;
}

const checkedPrograms = new Set();

/**
 * A WebGL-only filter running `fragment` over FILTER_VERTEX. A build failure is
 * reported once per name with console.error; an exception is rethrown.
 *
 * WebGL only (glProgram, no gpuProgram): app.init() sets no renderer
 * preference and Pixi 8 tries WebGL first. Under WebGPU, Pixi skips the whole
 * filter chain of a column holding such a filter, so a WebGPU preference
 * requires a WGSL gpuProgram here.
 *
 * Every fragment must open with `precision highp float;`: Pixi gives fragment
 * stages mediump by default and vertex stages highp, and uInputSize is
 * declared in both, so a mediump fragment fails to link.
 */
export function glFilter(name, fragment, resources) {
    try {
        const glProgram = PIXI.GlProgram.from({ vertex: FILTER_VERTEX, fragment, name });
        if (!checkedPrograms.has(name)) {
            checkedPrograms.add(name);
            const error = linkErrorOf(glProgram);
            if (error) reportBuildFailure(name, error);
        }
        return new PIXI.Filter({ glProgram, resources });
    } catch (error) {
        reportBuildFailure(name, error?.stack ?? String(error));
        throw error;
    }
}

const hexToRgb = hex => [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];

// --- ASCII: a glyph atlas sampled per cell ---

/** Glyphs from empty to densest; a cell's leveled luminance picks one. */
export const ASCII_RAMP = ' .:-=+*#%@';

/** Rec. 601 luma, the weighting the shader's LUMA constant uses. */
export const LUMA_WEIGHTS = [0.299, 0.587, 0.114];

/**
 * Luminance after the gain curve 1 - (1 - luma)^gain: 0 and 1 stay fixed,
 * gain 1 is the identity, and a higher gain lifts dark cells so a dimly lit
 * scene still reaches the dense end of the ramp. ASCII_FRAGMENT's `level`
 * computes the same curve and must change with it.
 */
export function asciiLevel(luma, gain) {
    const clamped = Math.min(1, Math.max(0, luma));
    return 1 - (1 - clamped) ** gain;
}

/** The ramp position for a leveled luminance; ASCII_FRAGMENT's `glyph` mirrors it. */
export function glyphIndex(level, glyphCount) {
    return Math.min(Math.floor(level * glyphCount), glyphCount - 1);
}

// Cells are taller than wide, like a monospace character box.
const CELL_ASPECT = 1.6;
const ATLAS_GLYPH_WIDTH = 48;
const ATLAS_GLYPH_HEIGHT = Math.round(ATLAS_GLYPH_WIDTH * CELL_ASPECT);
const COLOR_MODE = { column: 0, white: 0, original: 1 };

let asciiAtlas;

/** The ramp drawn once, white bold monospace on transparent, one glyph box per ramp entry, shared by every column. */
function asciiAtlasSource() {
    if (asciiAtlas) return asciiAtlas;
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_GLYPH_WIDTH * ASCII_RAMP.length;
    canvas.height = ATLAS_GLYPH_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(ATLAS_GLYPH_HEIGHT * 0.78)}px ui-monospace, Menlo, Consolas, "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [...ASCII_RAMP].forEach((glyph, i) => {
        ctx.fillText(glyph, (i + 0.5) * ATLAS_GLYPH_WIDTH, ATLAS_GLYPH_HEIGHT / 2);
    });
    asciiAtlas = new PIXI.CanvasSource({ resource: canvas, scaleMode: 'linear', autoGenerateMipmaps: true });
    return asciiAtlas;
}

// One pass: each cell samples the source at its center, levels the luma,
// picks a ramp glyph and stamps it from the atlas over the dimmed source.
// textureGrad keeps the atlas mip level steady across cell edges, where the
// glyph column jumps; it needs GLSL ES 3.00, hence the #version line.
const ASCII_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uAtlas;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec2 uCell;
uniform float uGain;
uniform float uDim;
uniform float uGlyphCount;
uniform float uColorMode;
uniform vec3 uColor;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

void main(void)
{
    vec4 source = texture(uTexture, vTextureCoord);
    vec2 pixel = vTextureCoord * uInputSize.xy;
    vec2 cellOrigin = floor(pixel / uCell) * uCell;
    vec2 cellCenter = clamp((cellOrigin + 0.5 * uCell) * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
    vec4 cell = texture(uTexture, cellCenter);

    float luma = clamp(dot(cell.rgb, LUMA), 0.0, 1.0);
    float level = 1.0 - pow(1.0 - luma, uGain);
    float glyph = min(floor(level * uGlyphCount), uGlyphCount - 1.0);

    vec2 inCell = (pixel - cellOrigin) / uCell;
    vec2 atlasUv = vec2((glyph + inCell.x) / uGlyphCount, inCell.y);
    float ink = textureGrad(uAtlas, atlasUv, vec2(1.0 / (uCell.x * uGlyphCount), 0.0), vec2(0.0, 1.0 / uCell.y)).a;

    vec3 original = clamp(cell.rgb * (level / max(luma, 0.001)), 0.0, 1.0);
    vec3 inkColor = uColorMode > 0.5 ? original : uColor;
    vec3 color = mix(source.rgb * uDim, inkColor, ink);
    finalColor = vec4(color * source.a, source.a);
}
`;

// A 12px cell gives ~30 glyphs across a 1080p column, small enough to read as
// text and large enough to survive stream compression.
const ascii = {
    id: 'ascii',
    label: 'ASCII',
    defaults: { size: 12, gain: 2.5, dim: 0, color: 'column' },
    params: [
        { key: 'size', label: 'Celda', min: 4, max: 32, decimals: 0 },
        { key: 'gain', label: 'Contraste', min: 1, max: 6, decimals: 1 },
        { key: 'dim', label: 'Fondo', min: 0, max: 1, decimals: 2 },
        {
            key: 'color',
            label: 'Color',
            options: [
                { value: 'column', label: 'Columna' },
                { value: 'white', label: 'Blanco' },
                { value: 'original', label: 'Original' },
            ],
        },
    ],
    create(params, context) {
        const filter = glFilter('ascii-atlas-filter', ASCII_FRAGMENT, {
            asciiUniforms: {
                uCell: { value: new Float32Array(2), type: 'vec2<f32>' },
                uGain: { value: params.gain, type: 'f32' },
                uDim: { value: params.dim, type: 'f32' },
                uGlyphCount: { value: ASCII_RAMP.length, type: 'f32' },
                uColorMode: { value: 0, type: 'f32' },
                uColor: { value: new Float32Array(3), type: 'vec3<f32>' },
            },
            uAtlas: asciiAtlasSource(),
        });
        ascii.update(filter, params, context);
        return filter;
    },
    update(filter, params, context) {
        const uniforms = filter.resources.asciiUniforms.uniforms;
        uniforms.uCell.set([params.size, params.size * CELL_ASPECT]);
        uniforms.uGain = params.gain;
        uniforms.uDim = params.dim;
        uniforms.uColorMode = COLOR_MODE[params.color];
        const color = params.color === 'column' && context.color !== null ? context.color : WHITE;
        uniforms.uColor.set(hexToRgb(color));
    },
};

// --- Rayos X ---

const CLASSIC_CYAN = 0x59f2ff;

/**
 * The photographic negative of one channel or luma value, 0-1: the value
 * scaled by `exposure` and clamped, inverted, then stretched by `contrast`
 * around mid-grey and clamped. Exposure first lets a dim room fill the whole
 * tonal range instead of inverting to a flat pale frame. XRAY_FRAGMENT's
 * `negative` computes the same curve and must change with it.
 */
export function xrayNegative(value, exposure, contrast) {
    const exposed = Math.min(1, Math.max(0, value) * exposure);
    return Math.min(1, Math.max(0, (1 - exposed - 0.5) * contrast + 0.5));
}

// One pass: the exposed, inverted, contrast-stretched image, either in color
// or as its luminance on a black -> tint -> white ramp, plus an optional 3x3
// Sobel edge glow in the tint and static per-pixel grain.
const XRAY_FRAGMENT = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uEdge;
uniform float uExposure;
uniform float uContrast;
uniform float uTinted;
uniform vec3 uTint;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float RAMP_MID = 0.6;
const float GRAIN = 0.03;

float lumaAt(vec2 offset)
{
    vec2 uv = clamp(vTextureCoord + offset * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
    return dot(texture(uTexture, uv).rgb, LUMA) * uExposure;
}

vec3 negative(vec3 value)
{
    vec3 exposed = min(value * uExposure, 1.0);
    return clamp((1.0 - exposed - 0.5) * uContrast + 0.5, 0.0, 1.0);
}

void main(void)
{
    vec4 source = texture(uTexture, vTextureCoord);

    float tl = lumaAt(vec2(-1.0, -1.0));
    float t  = lumaAt(vec2( 0.0, -1.0));
    float tr = lumaAt(vec2( 1.0, -1.0));
    float l  = lumaAt(vec2(-1.0,  0.0));
    float r  = lumaAt(vec2( 1.0,  0.0));
    float bl = lumaAt(vec2(-1.0,  1.0));
    float b  = lumaAt(vec2( 0.0,  1.0));
    float br = lumaAt(vec2( 1.0,  1.0));
    float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
    float gy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
    float edge = smoothstep(0.08, 0.6, length(vec2(gx, gy))) * uEdge;

    vec3 inverted = negative(source.rgb);
    float tone = dot(inverted, LUMA);
    vec3 ramp = tone < RAMP_MID
        ? mix(vec3(0.0), uTint, tone / RAMP_MID)
        : mix(uTint, vec3(1.0), (tone - RAMP_MID) / (1.0 - RAMP_MID));
    vec3 color = uTinted > 0.5 ? ramp : inverted;
    color += uTint * edge;

    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    color += grain * GRAIN;

    finalColor = vec4(clamp(color, 0.0, 1.0) * source.a, source.a);
}
`;

const xray = {
    id: 'xray',
    label: 'Rayos X',
    defaults: { exposure: 2.5, contrast: 1.2, edge: 0, tint: 'none' },
    params: [
        { key: 'exposure', label: 'Exposición', min: 0.5, max: 6, decimals: 1 },
        { key: 'contrast', label: 'Contraste', min: 0.5, max: 3, decimals: 2 },
        { key: 'edge', label: 'Bordes', min: 0, max: 3, decimals: 2 },
        {
            key: 'tint',
            label: 'Tinte',
            options: [
                { value: 'none', label: 'Ninguno' },
                { value: 'cyan', label: 'Cian' },
                { value: 'column', label: 'Columna' },
            ],
        },
    ],
    create(params, context) {
        const filter = glFilter('xray-filter', XRAY_FRAGMENT, {
            xrayUniforms: {
                uEdge: { value: params.edge, type: 'f32' },
                uExposure: { value: params.exposure, type: 'f32' },
                uContrast: { value: params.contrast, type: 'f32' },
                uTinted: { value: 0, type: 'f32' },
                uTint: { value: new Float32Array(3), type: 'vec3<f32>' },
            },
        });
        xray.update(filter, params, context);
        return filter;
    },
    update(filter, params, context) {
        const uniforms = filter.resources.xrayUniforms.uniforms;
        uniforms.uEdge = params.edge;
        uniforms.uExposure = params.exposure;
        uniforms.uContrast = params.contrast;
        uniforms.uTinted = params.tint === 'none' ? 0 : 1;
        const tint = params.tint === 'column' && context.color !== null ? context.color : CLASSIC_CYAN;
        uniforms.uTint.set(hexToRgb(tint));
    },
};

// --- Beat sync ---

const FIXED = 'fixed';

/**
 * The strength of a beat-struck value at `beatPhase` (0-1 within the beat): 1 on
 * the beat, falling along (1 - phase)^3 to 0 just before the next, so the hit
 * reads as a spike with a fast decay rather than a sawtooth.
 */
export function beatEnvelope(beatPhase) {
    const phase = Math.min(1, Math.max(0, beatPhase));
    return (1 - phase) ** 3;
}

/** Whether effect `effect` with `params` needs tick() every frame. */
export function runsOnBeat(effect, params) {
    return effect.tick !== undefined && params.sync !== FIXED;
}

// --- RGB split ---

// Red moves left and blue right by `amount` px; green stays as the anchor.
function setSplit(filter, amount) {
    filter.redX = -amount;
    filter.blueX = amount;
}

const rgbSplit = {
    id: 'rgbsplit',
    label: 'RGB split',
    defaults: { amount: 8, sync: FIXED },
    params: [
        { key: 'amount', label: 'Desfase px', min: 0, max: 40, decimals: 0 },
        {
            key: 'sync',
            label: 'Ritmo',
            options: [{ value: FIXED, label: 'Fijo' }, { value: 'beat', label: 'Al golpe' }],
        },
    ],
    create(params) {
        const filter = new PIXI.filters.RGBSplitFilter({ red: [0, 0], green: [0, 0], blue: [0, 0] });
        rgbSplit.update(filter, params);
        return filter;
    },
    update(filter, params) {
        setSplit(filter, params.amount);
    },
    tick(filter, params, { beatPhase }) {
        setSplit(filter, params.amount * beatEnvelope(beatPhase));
    },
};

// --- Pixelado ---

/** Block-size multipliers one bar (4 beats) each, looping. */
export const PIXEL_BAR_STEPS = [1, 2, 3, 2];
const BEATS_PER_BAR = 4;
const MIN_PIXEL = 2;

/** The block size during the bar holding `beatIndex`: `size` times that bar's step, at least MIN_PIXEL. */
export function pixelBarSize(size, beatIndex) {
    const bar = Math.floor(beatIndex / BEATS_PER_BAR);
    const step = PIXEL_BAR_STEPS[((bar % PIXEL_BAR_STEPS.length) + PIXEL_BAR_STEPS.length) % PIXEL_BAR_STEPS.length];
    return Math.max(MIN_PIXEL, Math.round(size * step));
}

const pixelate = {
    id: 'pixelate',
    label: 'Pixelado',
    defaults: { size: 10, sync: FIXED },
    params: [
        { key: 'size', label: 'Bloque', min: MIN_PIXEL, max: 60, decimals: 0 },
        {
            key: 'sync',
            label: 'Ritmo',
            options: [{ value: FIXED, label: 'Fijo' }, { value: 'bar', label: 'Por compás' }],
        },
    ],
    create(params) {
        return new PIXI.filters.PixelateFilter(params.size);
    },
    update(filter, params) {
        filter.size = params.size;
    },
    tick(filter, params, { beatIndex }) {
        const size = pixelBarSize(params.size, beatIndex);
        if (filter.sizeX !== size) filter.size = size;
    },
};

// --- Semitono ---

const halftone = {
    id: 'halftone',
    label: 'Semitono',
    defaults: { scale: 1, angle: 5, tone: 'gray' },
    params: [
        { key: 'scale', label: 'Escala', min: 0.3, max: 3, decimals: 2 },
        { key: 'angle', label: 'Ángulo', min: 0, max: 6.28, decimals: 2 },
        {
            key: 'tone',
            label: 'Tono',
            options: [{ value: 'gray', label: 'Gris' }, { value: 'color', label: 'Color' }],
        },
    ],
    create(params) {
        const filter = new PIXI.filters.DotFilter();
        halftone.update(filter, params);
        return filter;
    },
    update(filter, params) {
        filter.scale = params.scale;
        filter.angle = params.angle;
        filter.grayscale = params.tone === 'gray';
    },
};

// --- Glitch ---

// The beat index each Al golpe glitch last re-rolled on; kept outside the Pixi filter object.
const glitchBeats = new WeakMap();

const glitch = {
    id: 'glitch',
    label: 'Glitch',
    defaults: { slices: 8, offset: 60, sync: FIXED },
    params: [
        { key: 'slices', label: 'Franjas', min: 2, max: 30, decimals: 0 },
        { key: 'offset', label: 'Desplazamiento', min: 0, max: 300, decimals: 0 },
        {
            key: 'sync',
            label: 'Ritmo',
            options: [{ value: FIXED, label: 'Fijo' }, { value: 'beat', label: 'Al golpe' }],
        },
    ],
    create(params) {
        return new PIXI.filters.GlitchFilter({ slices: params.slices, offset: params.offset });
    },
    update(filter, params) {
        filter.slices = params.slices;
        filter.offset = params.offset;
    },
    // A new beat gets new slice sizes and offsets (refresh) and a new noise seed.
    tick(filter, params, { beatIndex }) {
        if (glitchBeats.get(filter) === beatIndex) return;
        glitchBeats.set(filter, beatIndex);
        filter.seed = Math.random();
        filter.refresh();
    },
};

// --- Térmica ---
// A custom shader rather than ColorMapFilter: that filter remaps RGB through a
// 3D lookup texture, so a luminance ramp would need a full RGB cube built on a
// canvas, while the ramp itself is five mixes the tests can mirror in JS.

/** The heat-camera ramp, black -> blue -> magenta -> red -> yellow -> white, at evenly spaced luminance stops. */
export const THERMAL_STOPS = [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]];

/** The ramp color for `luma` (clamped to 0-1), linear between stops; THERMAL_FRAGMENT's `thermal` mirrors it. */
export function thermalColor(luma) {
    const segments = THERMAL_STOPS.length - 1;
    const t = Math.min(1, Math.max(0, luma)) * segments;
    const index = Math.min(Math.floor(t), segments - 1);
    const weight = t - index;
    const [from, to] = [THERMAL_STOPS[index], THERMAL_STOPS[index + 1]];
    return from.map((channel, i) => channel + (to[i] - channel) * weight);
}

const THERMAL_FRAGMENT = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uMix;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

vec3 thermal(float luma)
{
    float t = clamp(luma, 0.0, 1.0) * 5.0;
    vec3 color = mix(vec3(0.0), vec3(0.0, 0.0, 1.0), clamp(t, 0.0, 1.0));
    color = mix(color, vec3(1.0, 0.0, 1.0), clamp(t - 1.0, 0.0, 1.0));
    color = mix(color, vec3(1.0, 0.0, 0.0), clamp(t - 2.0, 0.0, 1.0));
    color = mix(color, vec3(1.0, 1.0, 0.0), clamp(t - 3.0, 0.0, 1.0));
    return mix(color, vec3(1.0), clamp(t - 4.0, 0.0, 1.0));
}

void main(void)
{
    vec4 source = texture(uTexture, vTextureCoord);
    vec3 heat = thermal(dot(source.rgb, LUMA));
    finalColor = vec4(mix(source.rgb, heat * source.a, uMix), source.a);
}
`;

const thermalEffect = {
    id: 'thermal',
    label: 'Térmica',
    defaults: { mix: 1 },
    params: [{ key: 'mix', label: 'Mezcla', min: 0, max: 1, decimals: 2 }],
    create(params) {
        return glFilter('thermal-filter', THERMAL_FRAGMENT, {
            thermalUniforms: { uMix: { value: params.mix, type: 'f32' } },
        });
    },
    update(filter, params) {
        filter.resources.thermalUniforms.uniforms.uMix = params.mix;
    },
};

// --- Posterizado ---

/** `value` (clamped to 0-1) snapped to the nearest of `levels` evenly spaced steps; POSTERIZE_FRAGMENT mirrors it. */
export function posterize(value, levels) {
    const steps = levels - 1;
    return Math.round(Math.min(1, Math.max(0, value)) * steps) / steps;
}

const POSTERIZE_FRAGMENT = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uLevels;

void main(void)
{
    vec4 source = texture(uTexture, vTextureCoord);
    float steps = uLevels - 1.0;
    vec3 color = floor(clamp(source.rgb, 0.0, 1.0) * steps + 0.5) / steps;
    finalColor = vec4(color * source.a, source.a);
}
`;

const posterizeEffect = {
    id: 'posterize',
    label: 'Posterizado',
    defaults: { levels: 4 },
    params: [{ key: 'levels', label: 'Niveles', min: 2, max: 8, decimals: 0 }],
    create(params) {
        return glFilter('posterize-filter', POSTERIZE_FRAGMENT, {
            posterizeUniforms: { uLevels: { value: params.levels, type: 'f32' } },
        });
    },
    update(filter, params) {
        filter.resources.posterizeUniforms.uniforms.uLevels = params.levels;
    },
};

// --- Contorno neón ---

// Black everywhere but the luminance edges: a 3x3 Sobel at 1px draws the line
// and the same kernel at 3px adds a softer halo around it, both in the tint.
// `uGlow` scales the edge strength, so a higher glow lights fainter edges too.
const NEON_FRAGMENT = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uGlow;
uniform vec3 uTint;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float HALO_RADIUS = 3.0;
const float HALO_WEIGHT = 0.45;

float lumaAt(vec2 offset)
{
    vec2 uv = clamp(vTextureCoord + offset * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
    return dot(texture(uTexture, uv).rgb, LUMA);
}

float sobel(float radius)
{
    float tl = lumaAt(vec2(-radius, -radius));
    float t  = lumaAt(vec2(    0.0, -radius));
    float tr = lumaAt(vec2( radius, -radius));
    float l  = lumaAt(vec2(-radius,     0.0));
    float r  = lumaAt(vec2( radius,     0.0));
    float bl = lumaAt(vec2(-radius,  radius));
    float b  = lumaAt(vec2(    0.0,  radius));
    float br = lumaAt(vec2( radius,  radius));
    float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
    float gy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
    return length(vec2(gx, gy));
}

void main(void)
{
    float alpha = texture(uTexture, vTextureCoord).a;
    float line = smoothstep(0.05, 0.5, sobel(1.0) * uGlow);
    float halo = smoothstep(0.05, 0.8, sobel(HALO_RADIUS) * uGlow) * HALO_WEIGHT;
    vec3 color = uTint * clamp(line + halo, 0.0, 1.0);
    finalColor = vec4(color * alpha, alpha);
}
`;

const neon = {
    id: 'neon',
    label: 'Contorno neón',
    defaults: { glow: 1.5, color: 'column' },
    params: [
        { key: 'glow', label: 'Brillo', min: 0.5, max: 4, decimals: 2 },
        {
            key: 'color',
            label: 'Color',
            options: [{ value: 'column', label: 'Columna' }, { value: 'white', label: 'Blanco' }],
        },
    ],
    create(params, context) {
        const filter = glFilter('neon-edge-filter', NEON_FRAGMENT, {
            neonUniforms: {
                uGlow: { value: params.glow, type: 'f32' },
                uTint: { value: new Float32Array(3), type: 'vec3<f32>' },
            },
        });
        neon.update(filter, params, context);
        return filter;
    },
    update(filter, params, context) {
        const uniforms = filter.resources.neonUniforms.uniforms;
        uniforms.uGlow = params.glow;
        const tint = params.color === 'column' && context.color !== null ? context.color : WHITE;
        uniforms.uTint.set(hexToRgb(tint));
    },
};

export const EFFECTS = [ascii, xray, rgbSplit, pixelate, halftone, glitch, thermalEffect, posterizeEffect, neon];

/** The definition registered under `id`, undefined when there is none. */
export function effectById(id) {
    return EFFECTS.find(effect => effect.id === id);
}
