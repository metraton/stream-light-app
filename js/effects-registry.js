// --- Effect registry: the per-color effects a column can run after its color adjust ---
// Each effect is { id, label, defaults, params, create(params, context), update(filter, params, context) }.
// `params` describes the panel controls: a slider ({ key, label, min, max,
// decimals }) or a button choice ({ key, label, options: [{ value, label }] }).
// `context.color` is the hex of the color the column shows, null when uncolored.
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
function glFilter(name, fragment, resources) {
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

// One pass: inverted luminance on a dark blue -> tint -> white ramp, a 3x3
// Sobel edge glow in the tint, and static per-pixel grain.
const XRAY_FRAGMENT = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uEdge;
uniform vec3 uTint;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float RAMP_MID = 0.55;
const float GRAIN = 0.05;

float lumaAt(vec2 offset)
{
    vec2 uv = clamp(vTextureCoord + offset * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
    return dot(texture(uTexture, uv).rgb, LUMA);
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

    float density = 1.0 - dot(source.rgb, LUMA);
    vec3 dark = mix(vec3(0.01, 0.03, 0.12), uTint * 0.12, 0.5);
    vec3 color = density < RAMP_MID
        ? mix(dark, uTint, density / RAMP_MID)
        : mix(uTint, vec3(1.0), (density - RAMP_MID) / (1.0 - RAMP_MID));
    color += uTint * edge + vec3(0.35 * edge);

    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    color += grain * GRAIN;

    finalColor = vec4(clamp(color, 0.0, 1.0) * source.a, source.a);
}
`;

const xray = {
    id: 'xray',
    label: 'Rayos X',
    defaults: { edge: 1.2, tint: 'cyan' },
    params: [
        { key: 'edge', label: 'Bordes', min: 0, max: 3, decimals: 2 },
        { key: 'tint', label: 'Tinte', options: [{ value: 'cyan', label: 'Cian' }, { value: 'column', label: 'Columna' }] },
    ],
    create(params, context) {
        const filter = glFilter('xray-filter', XRAY_FRAGMENT, {
            xrayUniforms: {
                uEdge: { value: params.edge, type: 'f32' },
                uTint: { value: new Float32Array(3), type: 'vec3<f32>' },
            },
        });
        xray.update(filter, params, context);
        return filter;
    },
    update(filter, params, context) {
        const uniforms = filter.resources.xrayUniforms.uniforms;
        uniforms.uEdge = params.edge;
        const tint = params.tint === 'column' && context.color !== null ? context.color : CLASSIC_CYAN;
        uniforms.uTint.set(hexToRgb(tint));
    },
};

export const EFFECTS = [ascii, xray];

/** The definition registered under `id`, undefined when there is none. */
export function effectById(id) {
    return EFFECTS.find(effect => effect.id === id);
}
