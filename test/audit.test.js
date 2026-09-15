import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { audit, extractHeadingAnchors } from '../src/audit.js';

async function fixture(files) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'md-link-audit-'));
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(directory, name);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, 'utf8');
  }
  return directory;
}

test('reports missing files and accepts existing files', async (context) => {
  const directory = await fixture({
    'README.md': '[Guide](docs/guide.md)\n[Missing](docs/missing.md)\n![Logo](logo.svg)',
    'docs/guide.md': '# Guide',
    'logo.svg': '<svg></svg>',
  });
  context.after(() => rm(directory, { recursive: true, force: true }));

  const result = await audit(directory);

  assert.equal(result.filesChecked, 2);
  assert.deepEqual(result.issues.map((issue) => issue.code), ['missing-file']);
  assert.equal(result.issues[0].line, 2);
});

test('checks same-file and cross-file heading anchors', async (context) => {
  const directory = await fixture({
    'README.md': '# Quick Start\n[Local](#quick-start)\n[API](docs/api.md#request-options)\n[Bad](#not-here)',
    'docs/api.md': '# Request Options',
  });
  context.after(() => rm(directory, { recursive: true, force: true }));

  const result = await audit(directory);

  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, 'missing-anchor');
  assert.equal(result.issues[0].target, '#not-here');
});

test('models duplicate GitHub heading slugs', () => {
  const anchors = extractHeadingAnchors('# Install\n## Install\n### 中文 标题');
  assert.deepEqual([...anchors], ['install', 'install-1', '中文-标题']);
});

test('ignores links inside fenced code blocks', async (context) => {
  const directory = await fixture({
    'README.md': '# Example\n```md\n[Not a real link](missing.md)\n```',
  });
  context.after(() => rm(directory, { recursive: true, force: true }));

  const result = await audit(directory);

  assert.equal(result.issues.length, 0);
});

test('checks reference-style link definitions', async (context) => {
  const directory = await fixture({
    'README.md': 'Read the [guide][guide].\n\n[guide]: docs/guide.md',
  });
  context.after(() => rm(directory, { recursive: true, force: true }));

  const result = await audit(directory);

  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].target, 'docs/guide.md');
  assert.equal(result.issues[0].line, 3);
});
