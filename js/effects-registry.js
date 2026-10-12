// --- Effect registry: the per-color effects a column can run after its color adjust ---
// Each effect is { id, label, defaults, params, create(params, context), update(filter, params, context) }.
// `params` describes the panel controls: a slider ({ key, label, min, max,
// decimals }) or a button choice ({ key, label, options: [{ value, label }] }).
// `context.color` is the hex of the color the column shows, null when uncolored.
// create() and update() reach the PIXI global only when called, so the
// definitions load in Node for the stack tests. Every effect is one more
// render pass, paid only by the columns whose color runs it.

const WHITE = 0xffffff;

// pixi-filters AsciiFilter: glyphs are picked by the luminance of each cell and
// drawn in one flat color. A 10px cell gives ~36 glyphs across a 1080p column,
// small enough to read as text and large enough to survive stream compression.
const ascii = {
    id: 'ascii',
    label: 'ASCII',
    defaults: { size: 10, color: 'column' },
    params: [
        { key: 'size', label: 'Celda', min: 4, max: 32, decimals: 0 },
        { key: 'color', label: 'Color', options: [{ value: 'column', label: 'Columna' }, { value: 'white', label: 'Blanco' }] },
    ],
    create(params, context) {
        const filter = new PIXI.filters.AsciiFilter({ size: params.size, color: WHITE, replaceColor: true });
        ascii.update(filter, params, context);
        return filter;
    },
    update(filter, params, context) {
        filter.size = params.size;
        filter.replaceColor = true;
        filter.color = params.color === 'white' || context.color === null ? WHITE : context.color;
    },
};

const CLASSIC_CYAN = 0x59f2ff;

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

// One pass: inverted luminance on a dark blue -> tint -> white ramp, a 3x3
// Sobel edge glow in the tint, and static per-pixel grain.
const XRAY_FRAGMENT = `
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

const hexToRgb = hex => [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];

// WebGL only (glProgram, no gpuProgram): app.init() sets no renderer
// preference, and Pixi 8 then tries WebGL first, so WebGPU is reached only
// where WebGL is missing. Adding a WebGPU renderer preference requires a WGSL
// gpuProgram here.
const xray = {
    id: 'xray',
    label: 'Rayos X',
    defaults: { edge: 1.2, tint: 'cyan' },
    params: [
        { key: 'edge', label: 'Bordes', min: 0, max: 3, decimals: 2 },
        { key: 'tint', label: 'Tinte', options: [{ value: 'cyan', label: 'Cian' }, { value: 'column', label: 'Columna' }] },
    ],
    create(params, context) {
        const filter = new PIXI.Filter({
            glProgram: PIXI.GlProgram.from({ vertex: FILTER_VERTEX, fragment: XRAY_FRAGMENT, name: 'xray-filter' }),
            resources: {
                xrayUniforms: {
                    uEdge: { value: params.edge, type: 'f32' },
                    uTint: { value: new Float32Array(3), type: 'vec3<f32>' },
                },
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
