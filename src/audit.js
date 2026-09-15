import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  'coverage',
  'dist',
  'node_modules',
  'vendor',
]);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function maskFencedCode(markdown) {
  let fence = null;

  return markdown
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*(`{3,}|~{3,})/);
      if (match && fence === null) {
        fence = match[1][0];
        return '';
      }
      if (match && match[1][0] === fence) {
        fence = null;
        return '';
      }
      return fence === null ? line : '';
    })
    .join('\n');
}

function lineAtOffset(markdown, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (markdown.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function extractTargets(markdown) {
  const visibleMarkdown = maskFencedCode(markdown);
  const targets = [];
  const inlineLink = /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|((?:\\.|[^)\s])+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
  const referenceDefinition = /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(?:<([^>]+)>|(\S+))/gm;

  for (const pattern of [inlineLink, referenceDefinition]) {
    let match;
    while ((match = pattern.exec(visibleMarkdown)) !== null) {
      const target = match[1] ?? match[2];
      if (target) {
        targets.push({
          target: target.replace(/\\([()])/g, '$1'),
          line: lineAtOffset(visibleMarkdown, match.index),
        });
      }
    }
  }

  return targets.sort((left, right) => left.line - right.line);
}

function headingTextToSlug(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-zA-Z0-9#]+;/g, '')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

export function extractHeadingAnchors(markdown) {
  const visibleMarkdown = maskFencedCode(markdown);
  const anchors = new Set();
  const counts = new Map();

  for (const line of visibleMarkdown.split('\n')) {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const baseSlug = headingTextToSlug(match[1]);
    const count = counts.get(baseSlug) ?? 0;
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
    counts.set(baseSlug, count + 1);
    anchors.add(slug);
  }

  return anchors;
}

function isExternalTarget(target) {
  return (
    target.startsWith('//') ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target)
  );
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false;
    throw error;
  }
}

async function collectMarkdownFiles(inputPath, ignoredDirectories) {
  const inputStats = await stat(inputPath);
  if (inputStats.isFile()) {
    return path.extname(inputPath).toLowerCase() === '.md' ? [inputPath] : [];
  }

  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await visit(entryPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
        files.push(entryPath);
      }
    }
  }

  await visit(inputPath);
  return files.sort();
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function splitTarget(target) {
  const hashIndex = target.indexOf('#');
  const beforeHash = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? null : target.slice(hashIndex + 1);
  const queryIndex = beforeHash.indexOf('?');
  const filePart = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  return { filePart, fragment };
}

export async function audit(input = '.', options = {}) {
  const absoluteInput = path.resolve(input);
  const inputStats = await stat(absoluteInput);
  const rootDirectory = inputStats.isDirectory()
    ? absoluteInput
    : path.dirname(absoluteInput);
  const ignoredDirectories = new Set([
    ...DEFAULT_IGNORED_DIRECTORIES,
    ...(options.ignore ?? []),
  ]);
  const files = await collectMarkdownFiles(absoluteInput, ignoredDirectories);
  const issues = [];
  const anchorsByFile = new Map();

  async function anchorsFor(filePath) {
    if (!anchorsByFile.has(filePath)) {
      const markdown = await readFile(filePath, 'utf8');
      anchorsByFile.set(filePath, extractHeadingAnchors(markdown));
    }
    return anchorsByFile.get(filePath);
  }

  for (const sourceFile of files) {
    const markdown = await readFile(sourceFile, 'utf8');
    for (const link of extractTargets(markdown)) {
      if (isExternalTarget(link.target)) continue;

      const { filePart, fragment } = splitTarget(link.target);
      const decodedFilePart = safeDecode(filePart);
      const decodedFragment = fragment === null ? null : safeDecode(fragment);
      const displayFile = toPosix(path.relative(rootDirectory, sourceFile)) || path.basename(sourceFile);

      if (decodedFilePart === null || (fragment !== null && decodedFragment === null)) {
        issues.push({
          file: displayFile,
          line: link.line,
          target: link.target,
          reason: 'invalid URL encoding',
          code: 'invalid-encoding',
        });
        continue;
      }

      const targetFile = decodedFilePart.length === 0
        ? sourceFile
        : decodedFilePart.startsWith('/')
          ? path.resolve(rootDirectory, `.${decodedFilePart}`)
          : path.resolve(path.dirname(sourceFile), decodedFilePart);

      if (!(await exists(targetFile))) {
        issues.push({
          file: displayFile,
          line: link.line,
          target: link.target,
          reason: 'missing file',
          code: 'missing-file',
        });
        continue;
      }

      if (decodedFragment !== null && path.extname(targetFile).toLowerCase() === '.md') {
        const wantedAnchor = decodedFragment.toLowerCase();
        const anchors = await anchorsFor(targetFile);
        if (!anchors.has(wantedAnchor)) {
          issues.push({
            file: displayFile,
            line: link.line,
            target: link.target,
            reason: 'missing heading anchor',
            code: 'missing-anchor',
          });
        }
      }
    }
  }

  return {
    root: rootDirectory,
    filesChecked: files.length,
    issues,
  };
}
