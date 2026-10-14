# dsh-skill-cockpit

> **Status: early / work in progress.** This repository is being published ahead of its first
> release to reserve the name. The plugin already works end-to-end on the author's machine
> (4/4 self-test suites · 124 assertions) but the public docs, screenshots, and packaging are
> still being finished. Expect the surface below to change.

A **skill cockpit for [DSH](https://github.com/deepseek-ai)** (DeepSeek Harness): one page in the
app-level navigation that shows every skill the machine actually exposes, says **why** a skill is
missing, and lets you toggle a single skill without editing anything but its entry-file name.

[中文说明](README.zh.md)

## What it does

- **One page in the application-level nav.** It takes the official `sidebar.panellist` seat with
  `order: 5` — between the shipped **Plugins** row (0) and the shipped **Schedule** row (10) — plus
  the whole page in the layout's `main` keyed slot. Both seats are registered through the
  framework's `slots` service, the same extension point the shipped pages use.
- **All six skill-root kinds, not just one.** DSH resolves skills from `project-dsh`,
  `project-agents`, `custom`, `user-dsh`, `user-agents`, and `bundled`. Scanning only
  `~/.dsh/skills` under-reports what a session can actually see.
- **It answers "why is this skill not there?"** A malformed frontmatter block makes the runtime
  drop a skill silently. The cockpit reports the concrete reason (`dropped:no-frontmatter`,
  `dropped:unclosed`, `dropped:bad-yaml`, `dropped:missing-fields`, `dropped:bad-name`), plus a
  missing root, a shadowed entry, or an explicit error — instead of showing nothing.
- **Toggling = renaming the entry file only.** Enable/disable flips `SKILL.md` ⇄
  `SKILL.md.disabled`. There is no sidecar state file, so there is exactly one source of truth:
  the filename. **Project-level skill roots are always read-only.**
- **No `@deepseek-ai/dsh*` peer dependency at all.** The host half declares `inject = []` and the
  client half declares only `slots`, so the plugin is not subject to DSH's compatibility-exemption
  gate and does not touch the credentials surface.

## Install (from source, for now)

Not on npm yet. Until the first release, mount the working tree into a profile with a local link:

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dependencies": { "dsh-skill-cockpit": "link:/path/to/this/repo" },
  "dsh": { "profile": { "bundles": ["…", "dsh-skill-cockpit"] } }
}
```

Then restart DSH. The entry appears in the left navigation as **Skills**.

## Development

```bash
node test/run-all.mjs      # 4 suites: data layer · toggle loop · host routes · client
```

Pure ESM JavaScript, no build step — `lib/*.js` runs as-is.

## Layout

| Path | What |
|---|---|
| `lib/index.js` | host half: local HTTP routes (`/__dsh-skill-panel/*`) |
| `lib/client.js` | client half: the whole UI (classic script, `React.createElement`) |
| `lib/roots.js` · `lib/scan.js` · `lib/frontmatter.js` | six-root enumeration, scan, YAML frontmatter |
| `lib/toggle.js` | the only writer: 8 guards, entry-file rename only |
| `lib/undeclared.js` | "referenced but not installed" index |
| `test/` | self-tests (no framework) |

## License

[MIT](LICENSE)
