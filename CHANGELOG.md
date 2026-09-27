# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.1.0

- Project metadata (`meta.json`): data model, workspace layout and file names, field-by-field parsing, and generation of `project.config.json`.
- Menu protocol (`menu.config.json`): parsing, serialization, node kinds, microapp resolution, diagnostics with codes and fixes, and highlight claims.
- Sitemap protocol (`sitemap.json`): node model, key rules, file parsing, tree helpers and validation, page declarations (Vue custom blocks, React header comments in JSON, JSONC or YAML), file-based route derivation, application generation that keeps manual hierarchy, and project merge with mount paths and conflict detection.
- Diagnostics and errors carry a stable code, an English message and parameters.
