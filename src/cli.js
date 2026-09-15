#!/usr/bin/env node

import { audit } from './audit.js';

const VERSION = '0.1.0';

function help() {
  return `md-link-audit v${VERSION}

Find broken local links, images, and heading anchors in Markdown files.

Usage:
  md-link-audit [path] [options]

Options:
  --ignore <name>  Ignore a directory name (repeatable)
  --json           Print machine-readable JSON
  -h, --help       Show this help
  -v, --version    Show the version
`;
}

function parseArguments(argumentsList) {
  const result = { input: '.', ignore: [], json: false };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--json') {
      result.json = true;
    } else if (argument === '--ignore') {
      const value = argumentsList[index + 1];
      if (!value) throw new Error('--ignore requires a directory name');
      result.ignore.push(value);
      index += 1;
    } else if (argument.startsWith('--ignore=')) {
      result.ignore.push(argument.slice('--ignore='.length));
    } else if (argument === '-h' || argument === '--help') {
      result.help = true;
    } else if (argument === '-v' || argument === '--version') {
      result.version = true;
    } else if (argument.startsWith('-')) {
      throw new Error(`unknown option: ${argument}`);
    } else if (result.input === '.') {
      result.input = argument;
    } else {
      throw new Error('only one input path can be checked at a time');
    }
  }

  return result;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}\n\n${help()}`);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(help());
    return;
  }
  if (options.version) {
    console.log(VERSION);
    return;
  }

  try {
    const result = await audit(options.input, { ignore: options.ignore });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.issues.length === 0) {
      console.log(`OK: checked ${result.filesChecked} Markdown file(s); no broken local links found.`);
    } else {
      for (const issue of result.issues) {
        console.error(`${issue.file}:${issue.line}  ${issue.reason}  ${issue.target}`);
      }
      console.error(`\nChecked ${result.filesChecked} Markdown file(s); found ${result.issues.length} problem(s).`);
    }
    process.exitCode = result.issues.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 2;
  }
}

await main();
