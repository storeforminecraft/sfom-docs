import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const tool = new URL('./legal-versions.mjs', import.meta.url).pathname;
const owner = 'ko/terms/EULA.md';
const id = 'sfom_WzEsIkxlZ2FsRG9jdW1lbnRWZXJzaW9uIiwiZml4dHVyZS0xIl0';
const entry = { versionId: id, digest: 'a'.repeat(64), documentKey: 'terms.service', locale: 'ko', approvalPacketSha256: 'b'.repeat(64), reference: 'review:fixture-1' };
const run = (data, command = 'check') => {
  const dir = mkdtempSync(join(tmpdir(), 'legal-map-'));
  const file = join(dir, 'mapping.json');
  const output = join(dir, 'links.html');
  writeFileSync(file, JSON.stringify(data));
  const result = spawnSync(process.execPath, [tool, command, file, output], { encoding: 'utf8' });
  return { ...result, output };
};
test('empty default mapping is valid and compiles without a link', () => {
  const result = run({}, 'compile');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(readFileSync(result.output, 'utf8'), /<a /);
});
test('canonical version compiles a fixed-origin link and exact mapping guards', () => {
  const result = run({ [owner]: entry }, 'compile');
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(result.output, 'utf8');
  assert.ok(html.includes(`https://api.sfom.app/legal/versions/${id}`));
  assert.ok(html.includes(entry.digest));
});
test('October 25 preparation versions are labeled as historical material', () => {
  const result = run({ [owner]: { ...entry, reference: 'SFOM_KO_REVISION_20261025' } }, 'compile');
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(result.output, 'utf8');
  assert.ok(html.includes('이전 준비 문서 보기'));
  assert.ok(html.includes('2026년 11월 6일 시행 문서는 아래 개정 안내'));
  assert.doesNotMatch(html, /이 정책의 고정 버전 보기/);
});
test('rejects malformed IDs, unsafe fields, mismatches and unknown owners', () => {
  const encode = value => 'sfom_' + Buffer.from(JSON.stringify(value)).toString('base64url');
  const cases = [null, [], { 'ko/terms/PrivacyPolicy-2026-10-21.md': entry }, { [owner]: null }];
  for (const versionId of ['raw-id', id.slice(0, -1) + '1', id + '=', id + '/x', id + '?x', 'https://evil.test/' + id, encode([1, 'LegalDocument', 'x']), encode([1, 'LegalDocumentVersion', '']), encode([1, 'LegalDocumentVersion', '\u0000']), encode([1, 'LegalDocumentVersion', '\ud800']), encode([1, 'LegalDocumentVersion', 'x'.repeat(129)]), 'sfom_' + Buffer.from('[1, "LegalDocumentVersion", "x"]').toString('base64url')]) cases.push({ [owner]: { ...entry, versionId } });
  for (const patch of [{ digest: 'a'.repeat(64) + '\n' }, { reference: 'record\n' }, { digest: '' }, { digest: 'G'.repeat(64) }, { documentKey: 'privacy.notice' }, { locale: 'en' }, { approvalPacketSha256: '' }, { reference: "x' %}" }, { url: 'https://evil.test' }]) cases.push({ [owner]: { ...entry, ...patch } });
  for (const field of Object.keys(entry)) {
    const missing = { ...entry }; delete missing[field]; cases.push({ [owner]: missing });
  }
  for (const data of cases) {
    const result = run(data, 'compile');
    assert.equal(result.status, 1, JSON.stringify(data));
    assert.match(result.stderr, /Invalid legal mapping/);
    assert.equal(existsSync(result.output), false, 'invalid mapping must not write generated output');
  }
});
test('readback checks original title+LF+body bytes and published JSON/header identity', () => {
  const digest = '7fbcade393afba9d3ed614a5cd972cabc0faab085ea94c47ec907765c71c506f';
  const dir = mkdtempSync(join(tmpdir(), 'legal-readback-'));
  const mapping = join(dir, 'mapping.json');
  const json = join(dir, 'response.json');
  const headers = join(dir, 'headers.txt');
  writeFileSync(mapping, JSON.stringify({ [owner]: { ...entry, digest } }));
  const version = { id, documentKey: 'terms.service', locale: 'ko', digest, title: 'Title', body: 'body\n', publishedAt: 1, effectiveAt: 2 };
  const runReadback = (value = version, header = digest, errors) => {
    writeFileSync(json, JSON.stringify({ data: { legalDocumentVersion: value }, ...(errors ? { errors } : {}) }));
    writeFileSync(headers, `HTTP/2 200\r\nx-legal-content-digest: ${header}\r\n\r\n`);
    return spawnSync(process.execPath, [tool, 'readback', mapping, json, headers, owner], { encoding: 'utf8' });
  };
  const good = runReadback();
  assert.equal(good.status, 0, good.stderr);
  const receipt = JSON.parse(good.stdout.split('\n')[0]);
  assert.equal(receipt.owner, owner);
  assert.equal(receipt.versionId, id);
  assert.equal(receipt.digest, digest);
  assert.match(receipt.mappingSha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.approvalAuthenticated, false);
  for (const value of [null, { ...version, body: 'body' }, { ...version, title: 'Title\n' }, { ...version, id: 'raw' }, { ...version, locale: 'en' }, { ...version, documentKey: 'privacy.notice' }, { ...version, digest: 'b'.repeat(64) }, { ...version, publishedAt: Date.now() + 86400000 }]) assert.equal(runReadback(value).status, 1);
  assert.equal(runReadback(version, 'b'.repeat(64)).status, 1);
  assert.equal(runReadback(version, digest, [{ message: 'partial data' }]).status, 1);
});

test('check rejects stale generated output and accepts deterministic empty output', () => {
  const result = run({}, 'compile');
  const mapping = join(result.output, '..', 'mapping.json');
  const check = () => spawnSync(process.execPath, [tool, 'check', mapping, result.output], { encoding: 'utf8' });
  assert.equal(check().status, 0);
  writeFileSync(result.output, '<a href="https://evil.test">stale</a>');
  assert.equal(check().status, 1);
});
