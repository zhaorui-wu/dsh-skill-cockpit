# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project intends to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Public repository opened to reserve the name **`dsh-skill-cockpit`**. The plugin is functional but
the first public release is still being prepared: bilingual docs, screenshots, and a release
checklist are outstanding.

### Known gaps at this point

- `README.md` (English) is a stub; the full bilingual documentation is not written yet.
- No screenshots yet.

## [0.2.3] — 2026-10-14

### Fixed

- **The rename to `dsh-skill-cockpit` had missed the plugin's own identity, so the entry failed to
  activate.** `lib/client.js` registered its bundle as `dsh-skill-panel` and `lib/index.js` exported
  `name = 'dsh-skill-panel'`, while the package — and therefore the loader entry — is
  `dsh-skill-cockpit`. A client bundle must register under its package name: the host normalizes
  both `<package>/client` and the bare package name onto the same graph row. The registration id and
  the exported name now match the package, and the two test assertions that pinned the old name were
  updated.
- The host half reported a stale internal version string (`0.1.0` while the package was `0.2.2`);
  it now reports the package version.

### Note

- A leftover `node_modules` link under the old name lets the same bundle execute twice and aborts web
  boot (`duplicate factory registration`). Renaming a `link:` dependency therefore means rebuilding
  the link **and removing the old one**.

## [0.2.2] — 2026-10-08

Last pre-publication version, developed privately.

### Added

- Locale files (`locale/zh.json`, `locale/en.json`) and their export path.

### Changed

- Dropped the `title` block from `package.json` in favor of a bilingual `description`.

## Earlier private history

| Version | Note |
|---|---|
| 0.2.1 | `SKILL.md.disabled` toggling hardened |
| 0.2.0 | six skill-root kinds enumerated; "why invisible" reasons reported |
| 0.1.0 | first working version: `sidebar.panellist` seat + full page |

### Renamed

The package was previously named `dsh-skill-panel` in private use. The public name is
`dsh-skill-cockpit`; the npm name `dsh-skill-panel` is owned by another author, which is why the
project is published under a new name.
