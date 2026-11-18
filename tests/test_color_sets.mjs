// Checks the color sets: built-in sets are well formed, share codes round-trip,
// and every malformed code is rejected with a message naming the problem.
// Run: node --test tests/test_color_sets.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, DEFAULTS } from '../js/config.js';
import {
    BUILTIN_SETS, SHARE_PREFIX, SHARE_VERSION, NAME_MAX_LENGTH, encodeShareCode, decodeShareCode,
} from '../js/color-sets.js';

const HEX = /^#[0-9a-f]{6}$/;
const FIVE = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#123abc'];

/** A code built with Node's own base64url, independent of the module's encoder. */
const codeOf = payload => SHARE_PREFIX + Buffer.from(JSON.stringify(payload)).toString('base64url');

test('built-in sets have unique names and five valid hex colors each', () => {
    const names = BUILTIN_SETS.map(s => s.name);
    assert.equal(new Set(names).size, names.length, `duplicate names: ${names}`);
    for (const { name, colors } of BUILTIN_SETS) {
        assert.ok(name.length > 0 && name.length <= NAME_MAX_LENGTH, name);
        assert.equal(colors.length, 5, name);
        for (const hex of colors) assert.match(hex, HEX, `${name}: ${hex}`);
    }
});

test('the curated sets keep the user\'s key 1 to 5 order, and Neón (a copy of Original) is gone', () => {
    assert.deepEqual(Object.fromEntries(BUILTIN_SETS.filter(s => s.name !== 'Original').map(s => [s.name, [...s.colors]])), {
        'Atardecer': ['#ffc93c', '#ff8c42', '#ff3c38', '#c9184a', '#7b2cbf'],
        'Océano': ['#00f5d4', '#48cae4', '#0096c7', '#3a86ff', '#4361ee'],
        'Púrpura místico': ['#e0aaff', '#ff77e9', '#ff4fa3', '#c77dff', '#9d4edd'],
        'Cálido': ['#ffb4a2', '#ffd60a', '#ff9e00', '#ff5400', '#ff006e'],
        'Frío': ['#caf0f8', '#4cc9f0', '#2ec4b6', '#4361ee', '#7209b7'],
        'Pastel': ['#fdffb6', '#caffbf', '#a0c4ff', '#ffadad', '#f49ac1'],
        'Rayos X': ['#ffffff', '#e0ffff', '#7df9ff', '#00ffff', '#4d9fff'],
    });
    assert.equal(BUILTIN_SETS[0].name, 'Original');
});

test('"Original" is the default colors in slot order', () => {
    const original = BUILTIN_SETS.find(s => s.name === 'Original');
    assert.deepEqual(original.colors, CONFIG.colorOrder.map(n => '#' + DEFAULTS.colors[n].toString(16).padStart(6, '0')));
});

test('every built-in set survives a share-code round trip, accents included', () => {
    for (const set of BUILTIN_SETS) {
        const code = encodeShareCode(set);
        assert.ok(code.startsWith(SHARE_PREFIX));
        assert.match(code.slice(SHARE_PREFIX.length), /^[A-Za-z0-9_-]+$/, 'base64url without padding');
        assert.deepEqual(decodeShareCode(code), { name: set.name, colors: [...set.colors] });
    }
});

test('a code is base64url JSON [version, name, colors] and normalizes hex case', () => {
    const code = codeOf([SHARE_VERSION, '  Púrpura  ', ['#FF77E9', ...FIVE.slice(1)]]);
    assert.deepEqual(decodeShareCode(code), { name: 'Púrpura', colors: ['#ff77e9', ...FIVE.slice(1)] });
    assert.equal(encodeShareCode({ name: 'Púrpura', colors: FIVE }), codeOf([SHARE_VERSION, 'Púrpura', FIVE]));
});

test('malformed codes are rejected with a message naming the problem', () => {
    const body = codeOf([SHARE_VERSION, 'x', FIVE]).slice(SHARE_PREFIX.length);
    const cases = [
        ['wrong prefix', 'SLA2.' + body, /empezar con SLA1\./],
        ['no prefix', body, /empezar con SLA1\./],
        ['bad base64 characters', SHARE_PREFIX + 'ab$cd', /dañado/],
        ['impossible base64 length', SHARE_PREFIX + 'abcde', /dañado/],
        ['base64 of non-JSON', SHARE_PREFIX + Buffer.from('hola').toString('base64url'), /dañado/],
        ['not an array', codeOf({ version: 1 }), /forma/],
        ['wrong version', codeOf([2, 'x', FIVE]), /Versión de código no soportada: 2/],
        ['version as string', codeOf(['1', 'x', FIVE]), /Versión/],
        ['four colors', codeOf([SHARE_VERSION, 'x', FIVE.slice(0, 4)]), /exactamente 5 colores/],
        ['six colors', codeOf([SHARE_VERSION, 'x', [...FIVE, '#000000']]), /exactamente 5 colores/],
        ['non-hex color', codeOf([SHARE_VERSION, 'x', ['#gg0000', ...FIVE.slice(1)]]), /Color inválido/],
        ['short hex', codeOf([SHARE_VERSION, 'x', ['#fff', ...FIVE.slice(1)]]), /Color inválido/],
        ['empty name', codeOf([SHARE_VERSION, '  ', FIVE]), /nombre/],
        ['name too long', codeOf([SHARE_VERSION, 'n'.repeat(NAME_MAX_LENGTH + 1), FIVE]), /nombre/],
        ['extra field', codeOf([SHARE_VERSION, 'x', FIVE, 'extra']), /forma/],
    ];
    for (const [label, code, message] of cases) {
        assert.throws(() => decodeShareCode(code), message, label);
    }
});
