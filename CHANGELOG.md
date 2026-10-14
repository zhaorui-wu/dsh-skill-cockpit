# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project intends to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Public repository opened to reserve the name **`dsh-skill-cockpit`**. The plugin is functional but
the first public release is still being prepared: bilingual docs, screenshots, packaging metadata,
and a release checklist are outstanding.

### Known gaps at this point

- `README.md` (English) is a stub; the full bilingual documentation is not written yet.
- No screenshots yet.
- Not published to npm. `repository` / `homepage` / `bugs` metadata is not filled in yet.
- Host half still reports a stale internal version string (`lib/index.js`).

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
