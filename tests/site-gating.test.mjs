// Exercise the site-gating logic in js/database.js:
//   - inferEntrySites(entry)        — explicit `sites` field wins, else filename prefix
//   - visibleDatabasesForSite(...)  — strict per-site gating
//
// Loads both functions out of js/database.js by source-extract so tests stay
// dependency-free and always reflect what the runtime actually does.

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, TestRunner } from './_extract.mjs';

const t = new TestRunner('Site gating');

// ---- Extract functions and constants from js/database.js ----
const dbSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/database.js'), 'utf8');

function grabFunction(name) {
    const re = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}\\n`, 'm');
    const m = dbSrc.match(re);
    if (!m) throw new Error(`Could not find function ${name} in database.js`);
    return m[0];
}
function grabConst(name) {
    const re = new RegExp(`const ${name}\\s*=\\s*[^;\\n]+;?`, 'm');
    const m = dbSrc.match(re);
    if (!m) throw new Error(`Could not find const ${name} in database.js`);
    return m[0];
}

const sandbox = `
    ${grabConst('SITE_FILENAME_PREFIX_RE')}
    ${grabConst('ALWAYS_SITE')}
    ${grabFunction('inferEntrySites')}
    ${grabFunction('visibleDatabasesForSite')}
    ({ inferEntrySites, visibleDatabasesForSite, ALWAYS_SITE });
`;
// eslint-disable-next-line no-eval
const { inferEntrySites, visibleDatabasesForSite, ALWAYS_SITE } = (0, eval)(sandbox);

t.assertEqual(ALWAYS_SITE, 'terminal', 'ALWAYS_SITE sentinel exported as "terminal"');

// ---- inferEntrySites: explicit field wins ----
{
    const sites = inferEntrySites({ file: 'BRE-01 ignored.md', sites: ['BRE-03'] });
    t.assertEqual(sites.join(','), 'BRE-03', 'explicit sites field overrides filename prefix');
}
{
    const sites = inferEntrySites({ file: 'whatever.md', sites: ['BRE-01', 'BRE-02'] });
    t.assertEqual(sites.join(','), 'BRE-01,BRE-02', 'multi-site sites field preserved');
}

// ---- inferEntrySites: filename inference ----
[
    ['Terminal ares_01_director_logbook.md', ['terminal']],
    ['BRE-01 ares_database1_metaplanar_access.md', ['BRE-01']],
    ['BRE-06 whatever.md', ['BRE-06']],
    ['database1.md', ['terminal']],
    ['ares_05_security.md', ['terminal']],
    ['ares_database1_metaplanar_access_de.md', ['terminal']],
].forEach(([file, expected]) => {
    const sites = inferEntrySites({ file });
    t.assertEqual(sites.join(','), expected.join(','), `infer from "${file}"`);
});

// ---- visibleDatabasesForSite: strict gating semantics ----
const sample = [
    { id: 'a', file: 'Terminal a.md' },
    { id: 'b', file: 'BRE-01 b.md' },
    { id: 'c', file: 'BRE-02 c.md' },
    { id: 'd', file: 'plain.md' },
    { id: 'e', file: 'irrelevant.md', sites: ['BRE-01', 'BRE-02'] },
    { id: 'f', file: 'wild.md', sites: ['*'] },
];

{
    // No site connected: only ALWAYS_SITE entries (Terminal*, plain default,
    // and explicit "*") should be visible.
    const v = visibleDatabasesForSite(sample, '').map(e => e.id).join(',');
    t.assertEqual(v, 'a,d,f', 'no site connected -> Terminal + default + wildcard only');
}
{
    // BRE-01 connected: Terminal + BRE-01 + multi-site(BRE-01) + wildcard.
    const v = visibleDatabasesForSite(sample, 'BRE-01').map(e => e.id).join(',');
    t.assertEqual(v, 'a,b,d,e,f', 'BRE-01 connected -> Terminal + BRE-01 + multi-site + wildcard');
}
{
    // BRE-02 connected: Terminal + BRE-02 + multi-site + wildcard;
    // BRE-01 (b) stays hidden.
    const v = visibleDatabasesForSite(sample, 'BRE-02').map(e => e.id).join(',');
    t.assertEqual(v, 'a,c,d,e,f', 'BRE-02 connected hides BRE-01-only');
}
{
    // Unknown site id: still shows ALWAYS_SITE entries; site-gated ones stay hidden.
    const v = visibleDatabasesForSite(sample, 'BRE-99').map(e => e.id).join(',');
    t.assertEqual(v, 'a,d,f', 'unknown site id -> Terminal/default/wildcard only');
}

// ---- Round-trip against the real manifest ----
{
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'databases/manifest.json'), 'utf8'));
    const all = manifest.databases;
    const totalCount = all.length;
    t.assert(totalCount === 17, `real manifest has ${totalCount} entries`);

    const noSite = visibleDatabasesForSite(all, '');
    const bre01 = visibleDatabasesForSite(all, 'BRE-01');
    const bre02 = visibleDatabasesForSite(all, 'BRE-02');

    // Sanity: no-site count must be <= BRE-01 count (gating is additive).
    t.assert(noSite.length <= bre01.length, 'no-site shows no more than BRE-01-connected');

    // The "BRE-01 ..." prefixed files must NOT appear when no site is connected.
    const bre01Files = all.filter(e => /^BRE-01\s/.test(e.file)).map(e => e.id);
    const noSiteIds = noSite.map(e => e.id);
    bre01Files.forEach(id => {
        t.assert(!noSiteIds.includes(id), `BRE-01 file "${id}" hidden when no site connected`);
    });

    // The "BRE-01 ..." prefixed files MUST appear when connected to BRE-01.
    const bre01Ids = bre01.map(e => e.id);
    bre01Files.forEach(id => {
        t.assert(bre01Ids.includes(id), `BRE-01 file "${id}" visible when connected to BRE-01`);
    });

    // BRE-01-only files must NOT appear when connected to a different site.
    const bre02Ids = bre02.map(e => e.id);
    bre01Files.forEach(id => {
        t.assert(!bre02Ids.includes(id), `BRE-01 file "${id}" hidden at BRE-02`);
    });

    // "Terminal "-prefixed files must always appear.
    const terminalFiles = all.filter(e => /^Terminal\s/i.test(e.file)).map(e => e.id);
    terminalFiles.forEach(id => {
        t.assert(noSiteIds.includes(id), `Terminal file "${id}" visible with no site`);
        t.assert(bre01Ids.includes(id), `Terminal file "${id}" visible at BRE-01`);
        t.assert(bre02Ids.includes(id), `Terminal file "${id}" visible at BRE-02`);
    });
}

t.exit();
