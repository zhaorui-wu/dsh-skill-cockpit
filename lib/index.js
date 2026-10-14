/**
 * dsh-skill-panel · HOST half.
 *
 * Serves the panel's read-only data over local HTTP routes and performs the
 * single write the panel is allowed to make (one entry-file rename).
 *
 *   GET  /__dsh-skill-panel/ping                 plugin identity + route list
 *   GET  /__dsh-skill-panel/skills?cwd=…         the full scan report
 *   GET  /__dsh-skill-panel/body?path=…          one entry file's text (read-only)
 *   GET  /__dsh-skill-panel/undeclared?q=…       search the not-installed index (read-only)
 *   POST /__dsh-skill-panel/toggle               { filePath, disable, plan? }
 *
 * `cwd` is what makes the answer session-scoped: project roots are derived from
 * it exactly like the skill provider does. Without it the panel reports the
 * user-level roots only and says so — it never guesses a cwd.
 *
 * Service access follows the house rule: `webServer` is optional (a
 * terminal-only profile has none), so it is taken through `ctx.get`, which is
 * cordis' documented safe accessor, and the plugin never blocks waiting for it.
 * Nothing else from `ctx` is touched — hence `inject` stays empty and this
 * package declares no @deepseek-ai/dsh* peer dependency at all.
 */

import { scanSkills, readSkillBody } from './scan.js';
import { toggleSkill } from './toggle.js';
import { DEFAULT_UNDECLARED_INDEX, indexStatus, searchUndeclared } from './undeclared.js';

export const name = 'dsh-skill-cockpit';
export const inject = [];

const VERSION = '0.1.0';
const BASE = '/__dsh-skill-panel';
const MAX_BODY = 1024 * 1024;

function normalizeConfig(config) {
  const raw = config && typeof config === 'object' ? config : {};
  return {
    dshHome: typeof raw.dshHome === 'string' ? raw.dshHome : undefined,
    agentsHome: typeof raw.agentsHome === 'string' ? raw.agentsHome : undefined,
    customSkillDirs: Array.isArray(raw.customSkillDirs)
      ? raw.customSkillDirs.filter((d) => typeof d === 'string')
      : [],
    bundledSkillDir: typeof raw.bundledSkillDir === 'string' ? raw.bundledSkillDir : undefined,
    includeDefaultRoots: raw.includeDefaultRoots !== false,
    writableSources: Array.isArray(raw.writableSources) && raw.writableSources.length > 0
      ? raw.writableSources
      : undefined,
    undeclaredIndexPath:
      typeof raw.undeclaredIndexPath === 'string' && raw.undeclaredIndexPath !== ''
        ? raw.undeclaredIndexPath
        : DEFAULT_UNDECLARED_INDEX,
    maxBodyBytes: Number.isInteger(raw.maxBodyBytes) && raw.maxBodyBytes > 0 ? raw.maxBodyBytes : 262144,
  };
}

function scanOptions(cfg, cwd) {
  return {
    cwd: typeof cwd === 'string' && cwd.trim() !== '' ? cwd : undefined,
    dshHome: cfg.dshHome,
    agentsHome: cfg.agentsHome,
    customSkillDirs: cfg.customSkillDirs,
    bundledSkillDir: cfg.bundledSkillDir,
    includeDefaultRoots: cfg.includeDefaultRoots,
    writableSources: cfg.writableSources,
  };
}

/** Light local fence: this API is for the DSH window on this machine. */
function isLocalRequest(req) {
  const origin = req?.headers?.origin;
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return true;
  try {
    const url = new URL(origin);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(new Error(`请求体不是合法 JSON：${error?.message ?? String(error)}`));
      }
    });
    req.on('error', reject);
  });
}

export function apply(ctx, config) {
  const cfg = normalizeConfig(config);
  console.log(`[dsh-skill-panel] host half loaded (v${VERSION})`);

  const send = (res, status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(payload));
  };

  const routes = [
    {
      method: 'GET',
      path: `${BASE}/ping`,
      handler: async () => ({
        ok: true,
        name,
        version: VERSION,
        routes: [`GET ${BASE}/ping`, `GET ${BASE}/skills`, `GET ${BASE}/body`, `GET ${BASE}/undeclared`, `POST ${BASE}/toggle`],
        writableSources: cfg.writableSources ?? ['user-dsh', 'user-agents'],
        undeclaredIndex: indexStatus(cfg.undeclaredIndexPath),
      }),
    },
    {
      method: 'GET',
      path: `${BASE}/skills`,
      handler: async (_req, _res, url) => scanSkills(scanOptions(cfg, url.searchParams.get('cwd'))),
    },
    {
      method: 'GET',
      path: `${BASE}/body`,
      handler: async (_req, _res, url) => {
        const filePath = url.searchParams.get('path');
        if (!filePath) return { ok: false, error: '缺少 path 参数' };
        return readSkillBody(filePath, cfg.maxBodyBytes);
      },
    },
    {
      method: 'GET',
      path: `${BASE}/undeclared`,
      handler: async (_req, _res, url) =>
        searchUndeclared(cfg.undeclaredIndexPath, url.searchParams.get('q') ?? ''),
    },
    {
      method: 'POST',
      path: `${BASE}/toggle`,
      handler: async (req) => {
        const body = await readJsonBody(req);
        const result = toggleSkill(
          { filePath: body.filePath, disable: body.disable !== false, plan: body.plan === true },
          scanOptions(cfg, body.cwd),
        );
        console.log(
          `[dsh-skill-panel] ${result.applied ? 'rename' : 'plan'} ${result.from} -> ${result.to}`,
        );
        return result;
      },
    },
  ];

  const register = (host, targetCtx) => {
    for (const route of routes) {
      targetCtx.effect(() =>
        host.register({
          kind: 'exact',
          path: route.path,
          handler: async (req, res) => {
            let url;
            try {
              url = new URL(req.url ?? route.path, 'http://127.0.0.1');
            } catch {
              send(res, 400, { ok: false, error: '无法解析请求 URL' });
              return;
            }
            if (!isLocalRequest(req)) {
              send(res, 403, { ok: false, error: '只接受本机窗口的请求' });
              return;
            }
            if ((req.method ?? 'GET').toUpperCase() !== route.method) {
              send(res, 405, { ok: false, error: `method not allowed (use ${route.method})` });
              return;
            }
            try {
              const payload = await route.handler(req, res, url);
              // A handler that reports { ok: false } is a client-side failure
              // (missing parameter, unreadable file) — answer 400, not 200.
              const failed = payload !== null && typeof payload === 'object' && payload.ok === false;
              send(res, failed ? 400 : 200, payload);
            } catch (error) {
              send(res, 400, { ok: false, error: error?.message ?? String(error) });
            }
          },
        }),
      );
    }
  };

  const webServer = ctx.get('webServer');
  if (webServer !== undefined) {
    register(webServer, ctx);
  } else {
    // A profile without a web surface: wait for it instead of hanging.
    ctx.inject(['webServer'], (sub) => {
      register(sub.webServer, sub);
    });
  }
}
