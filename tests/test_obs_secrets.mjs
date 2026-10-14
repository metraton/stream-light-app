// Fails when a file under obs/ carries a stream secret: a stream key or server
// field, or a YouTube section holding anything but the dock layout (OBS writes
// the account tokens there after a sign-in). Also fails when the common profile
// turns the main Replay Buffer off.
// Run: node --test tests/test_obs_secrets.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
// The quotes keep OBS's public stream_key_link URL in service.example.json from counting as a key.
const SECRET_FIELD = /"(stream_key|stream_server)"/;

function filesUnder(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]);
}

function findLeaks(text) {
    const leaks = [];
    let section = null;
    text.split(/\r?\n/).forEach((line, index) => {
        const where = `line ${index + 1}`;
        if (SECRET_FIELD.test(line)) leaks.push(`${where}: stream secret field`);
        const header = line.match(/^\[(.+)\]\s*$/);
        if (header) section = header[1];
        else if (section?.startsWith('YouTube') && /^[^=]+=/.test(line) && !line.startsWith('DockState=')) {
            leaks.push(`${where}: [${section}] holds ${line.split('=')[0]}`);
        }
    });
    return leaks;
}

test('the leak check catches a key, a server and a YouTube token', () => {
    assert.equal(findLeaks('{"stream_key":"x"}').length, 1);
    assert.equal(findLeaks('{"stream_server":"rtmps://x"}').length, 1);
    assert.equal(findLeaks('[YouTube - RTMPS]\nDockState=AAA\nRefreshToken=abc\n[Video]\nBaseCX=1').length, 1);
    assert.deepEqual(findLeaks('{"stream_key_link":"https://www.youtube.com/live_dashboard"}'), []);
});

// Aitum Vertical refuses to start its backtrack ("Can't start backtrack when no replay buffer is
// found") unless the main Replay Buffer is enabled.
test('the common profile keeps the main Replay Buffer on, 20 s and 512 MB', () => {
    const ini = readFileSync(join(repo, 'obs', 'profile', 'stream-light', 'basic.ini'), 'utf8');
    const values = key => [...ini.matchAll(new RegExp(`^${key}=(.*)$`, 'gm'))].map(match => match[1].trim());
    assert.ok(values('RecRB').length > 0, 'basic.ini sets RecRB');
    assert.deepEqual(values('RecRB'), values('RecRB').map(() => 'true'));
    assert.deepEqual(values('RecRBTime'), values('RecRBTime').map(() => '20'));
    assert.deepEqual(values('RecRBSize'), values('RecRBSize').map(() => '512'));
});

test('no file under obs/ carries a stream secret', () => {
    const leaks = filesUnder(join(repo, 'obs')).flatMap(path =>
        findLeaks(readFileSync(path, 'utf8')).map(leak => `${relative(repo, path)} ${leak}`));
    assert.deepEqual(leaks, []);
});
