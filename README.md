# md-link-audit

A tiny, zero-dependency CLI that finds broken local links, missing images, and invalid heading anchors in Markdown files.

```text
README.md:18  missing file  ./docs/install.md
README.md:32  missing heading anchor  ./guide.md#deployment

Checked 12 Markdown file(s); found 2 problem(s).
```

## Why?

Documentation links often break after files or headings are renamed. `md-link-audit` catches those problems locally and in CI, without requiring an account or API key.

## Quick start

Run it directly with npm:

```bash
npx md-link-audit .
```

Or install it globally:

```bash
npm install --global md-link-audit
md-link-audit ./docs
```

## What it checks

- Relative links to files
- Relative image paths
- Same-file anchors such as `#quick-start`
- Cross-file anchors such as `guide.md#installation`
- Reference-style link definitions
- Duplicate GitHub-style heading slugs such as `#install-1`

Remote URLs (`https:`, `mailto:`, and other schemes) are deliberately skipped so checks stay fast and deterministic.

## Usage

```text
md-link-audit [path] [options]

Options:
  --ignore <name>  Ignore a directory name (repeatable)
  --json           Print machine-readable JSON
  -h, --help       Show help
  -v, --version    Show the version
```

Common examples:

```bash
# Check the current repository
md-link-audit .

# Check one document
md-link-audit README.md

# Skip generated documentation
md-link-audit . --ignore generated --ignore snapshots

# Produce a report for another tool
md-link-audit . --json
```

The process exits with code `0` when all links are valid, `1` when broken links are found, and `2` for usage or runtime errors.

## GitHub Actions

Add this step to a workflow:

```yaml
- name: Check Markdown links
  run: npx md-link-audit .
```

This repository includes a complete [CI workflow](.github/workflows/ci.yml) as an example.

## Development

```bash
npm test
npm run check
```

The project uses only built-in Node.js modules, so there is no dependency installation step.

## 中文说明

`md-link-audit` 是一个零依赖的 Markdown 本地链接检查工具。它会递归扫描 `.md` 文件，检查相对文件路径、图片路径以及标题锚点，并返回适合 CI 使用的退出码。

```bash
npx md-link-audit .
```

## License

[MIT](LICENSE)
