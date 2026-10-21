import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const artifacts = process.env.LEGAL_BASELINE_DIR;
assert.ok(artifacts, 'Set LEGAL_BASELINE_DIR to the captured Pages-compatible build/baseline directory');
const baseline = JSON.parse(readFileSync(join(artifacts, 'baseline.json')));
const owners = ['ko/terms/EULA.md', 'ko/terms/PrivacyPolicy.md', 'ko/terms/Personal_Information_Collection_and_Use_Agreement.md', 'ko/terms/Personal_Information_Transfer_Agreement.md', 'ko/terms/ContentOperationsPolicy.md'];
const keys = ['terms.service', 'privacy.notice', 'privacy.collection', 'privacy.overseas', 'policy.content'];
const id = 'sfom_WzEsIkxlZ2FsRG9jdW1lbnRWZXJzaW9uIiwiZml4dHVyZS0xIl0';
const data = Object.fromEntries(owners.map((owner, i) => [owner, { versionId: id, documentKey: keys[i], locale: 'ko', digest: 'a'.repeat(64), approvalPacketSha256: 'b'.repeat(64), reference: 'review:fixture-1' }]));
const work = mkdtempSync(join(tmpdir(), 'legal-jekyll-'));
const source = join(work, 'source');
cpSync(repo, source, { recursive: true, filter: path => !['.git', '.sass-cache', '.jekyll-cache', '_site'].includes(path.split('/').at(-1)) });
mkdirSync(join(source, '_data'), { recursive: true });
const mapping = join(source, '_data/legal_versions.json');
const include = join(source, '_includes/legal-version-links.html');
const command = (exe, args, options = {}) => spawnSync(exe, args, { encoding: 'utf8', cwd: work, ...options });
const compile = () => command(process.execPath, [join(repo, '_tools/legal-versions.mjs'), 'compile', mapping, include]);
const build = label => {
  const dest = join(work, label);
  const result = command('bundle', ['exec', 'jekyll', 'build', '--source', source, '--destination', dest, '--config', `${source}/_config.yml,${artifacts}/pages-build.yml`], { env: { ...process.env, PAGES_REPO_NWO: 'storeforminecraft/sfom-docs', JEKYLL_BUILD_REVISION: readFileSync(join(artifacts, 'baseline-site/index.html'), 'utf8').match(/style\.css\?v=([a-f0-9]+)/)[1], BUNDLE_GEMFILE: join(artifacts, 'Gemfile'), BUNDLE_PATH: join(artifacts, 'gems') } });
  writeFileSync(join(work, `${label}.log`), result.stdout + result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return dest;
};
const rendered = (dir, file) => readFileSync(join(dir, file), 'utf8');
const compare = (dir, stripBridge = false) => {
  for (const file of Object.keys(baseline.rendered)) {
    let actual = rendered(dir, file);
    if (stripBridge) actual = actual.replace(/<aside class="legal-version-bridge"[\s\S]*?<\/aside>/g, '');
    assert.equal(actual, rendered(join(artifacts, 'baseline-site'), file), file);
  }
};
test('default mapping keeps all nine baseline pages byte-identical', () => {
  const dest = build('inactive');
  compare(dest);
  assert.equal(existsSync(join(dest, '_tools')), false);
});
test('all five owners show safe exact links while retaining original rendered content', () => {
  writeFileSync(mapping, JSON.stringify(data));
  const compilation = compile();
  assert.equal(compilation.status, 0, compilation.stderr);
  const dest = build('active');
  for (const owner of owners) {
    const html = rendered(dest, owner.replace(/\.md$/, '.html'));
    assert.ok(html.includes(`<a href="https://api.sfom.app/legal/versions/${id}"`), owner);
    assert.ok(html.includes(`data-content-digest="${'a'.repeat(64)}"`), owner);
    assert.doesNotMatch(html, /http-equiv="refresh"|window\.location/);
  }
  compare(dest, true);
});
test('stale unsafe, mismatched and missing mapping fields fail closed in real Liquid', () => {
  writeFileSync(mapping, JSON.stringify(data));
  assert.equal(compile().status, 0);
  const edited = structuredClone(data);
  edited[owners[0]].versionId = 'https://evil.test/" onclick="alert(1)';
  edited[owners[1]].documentKey = 'terms.service';
  delete edited[owners[2]].digest;
  edited[owners[3]].reference = "record'{% include x %}";
  delete edited[owners[4]];
  writeFileSync(mapping, JSON.stringify(edited));
  const invalid = compile();
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Invalid legal mapping/);
  compare(build('stale-invalid'));
});
test('unknown dated-policy mapping is rejected and never gains a bridge', () => {
  writeFileSync(mapping, JSON.stringify({ 'ko/terms/PrivacyPolicy-2026-10-21.md': data[owners[0]] }));
  assert.equal(compile().status, 1);
  compare(build('unknown-owner'));
});
console.log(`Jekyll fixture artifacts: ${work}`);
