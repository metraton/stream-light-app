// A browser aborts the whole module graph, before any code runs, when a module
// imports a name its target does not export. `node --check` parses each file
// alone and cannot see that, so this test resolves every relative named import
// across js/ statically and needs no browser, DOM or PIXI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const DECLARED_EXPORT_RE = /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
const LIST_EXPORT_RE = /export\s*\{([^}]*)\}/g;

const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** The names a module exports; `null` when it re-exports a whole module, which this check does not follow. */
function exportedNames(source) {
    if (/export\s*\*/.test(source)) return null;
    const names = new Set();
    for (const [, name] of source.matchAll(DECLARED_EXPORT_RE)) names.add(name);
    for (const [, list] of source.matchAll(LIST_EXPORT_RE)) {
        for (const item of list.split(',')) {
            const name = item.trim().split(/\s+as\s+/).pop().trim();
            if (name) names.add(name);
        }
    }
    if (/export\s+default\b/.test(source)) names.add('default');
    return names;
}

/** Every `import { names } from './x.js'` in js/, as { from, target, name }. */
function namedImports() {
    const imports = [];
    for (const file of readdirSync(JS_DIR).filter(f => f.endsWith('.js'))) {
        const source = stripComments(readFileSync(join(JS_DIR, file), 'utf8'));
        for (const [, list, spec] of source.matchAll(IMPORT_RE)) {
            for (const item of list.split(',')) {
                const name = item.trim().split(/\s+as\s+/)[0].trim();
                if (name) imports.push({ from: file, target: resolve(JS_DIR, spec), spec, name });
            }
        }
    }
    return imports;
}

test('js/ has relative named imports to check', () => {
    assert.ok(namedImports().length > 0);
});

test('every relative named import in js/ resolves to an existing module', () => {
    const missing = namedImports()
        .filter(({ target }) => !existsSync(target))
        .map(({ from, spec }) => `${from} imports from missing ${spec}`);
    assert.deepEqual([...new Set(missing)], []);
});

test('every relative named import in js/ is exported by its target', () => {
    const exportsByFile = new Map();
    const unresolved = [];
    for (const { from, target, spec, name } of namedImports()) {
        if (!existsSync(target)) continue;
        if (!exportsByFile.has(target)) {
            exportsByFile.set(target, exportedNames(stripComments(readFileSync(target, 'utf8'))));
        }
        const names = exportsByFile.get(target);
        if (names !== null && !names.has(name)) unresolved.push(`${from}: { ${name} } is not exported by ${spec}`);
    }
    assert.deepEqual(unresolved, []);
});
