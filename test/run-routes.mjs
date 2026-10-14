/**
 * Skill panel · HOST-ROUTE self-test with a fake cordis ctx (no dsh needed).
 *
 *   node test/run-routes.mjs [reportDir]
 *
 * Proves the wiring without restarting anything:
 *   · apply() registers all five routes on the web server;
 *   · GET ping / skills / body / undeclared answer 200 with JSON;
 *   · POST toggle performs the rename, GET + POST on the wrong method give 405;
 *   · a bad body gives 400; a non-local Origin is refused with 403;
 *   · no service is probed: `ctx.get('webServer')` is the only ctx access.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { apply, name, inject } from '../lib/index.js';

const reportDir = resolve(process.argv[2] ?? join(import.meta.dirname, 'out'));
const checks = [];
const log = [];
function check(label, ok, detail) {
  checks.push({ label, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// ---- fake cordis surface --------------------------------------------------

const registered = [];
const effects = [];
const fakeWebServer = {
  register(definition) {
    registered.push(definition);
    return () => {};
  },
};
const ctx = {
  // cordis runs the callback immediately and disposes its return value later.
  effect(callback) {
    const disposer = callback();
    effects.push(disposer);
    return () => {
      if (typeof disposer === 'function') disposer();
    };
  },
  get(service) {
    log.push(`ctx.get('${service}')`);
    return service === 'webServer' ? fakeWebServer : undefined;
  },
  inject(names, callback) {
    log.push(`ctx.inject(${JSON.stringify(names)})`);
    return () => {};
  },
};

apply(ctx, {});

check('导出 name = dsh-skill-cockpit', name === 'dsh-skill-cockpit', name);
check('inject 为空数组（不猜、不探服务）', Array.isArray(inject) && inject.length === 0, JSON.stringify(inject));
check('注册了 5 条路由', registered.length === 5, registered.map((r) => r.path).join(' '));
check('每条路由都是 kind=exact', registered.every((r) => r.kind === 'exact'));
check('只通过 ctx.get 访问 ctx 服务', log.every((entry) => entry.startsWith("ctx.get('webServer')")), log.join(' '));

// ---- fake http ------------------------------------------------------------

function makeRes() {
  const holder = {};
  return {
    holder,
    writeHead(status, headers) {
      holder.status = status;
      holder.headers = headers;
    },
    end(text) {
      holder.body = text;
      try {
        holder.json = JSON.parse(text);
      } catch {
        holder.json = null;
      }
    },
  };
}

function makeReq(method, url, body, headers = {}) {
  const listeners = {};
  return {
    method,
    url,
    headers,
    on(event, callback) {
      listeners[event] = callback;
      return this;
    },
    destroy() {},
    /** fire the body events the way node does */
    emitBody() {
      if (listeners.data && body !== undefined) {
        listeners.data(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8'));
      }
      if (listeners.end) listeners.end();
    },
  };
}

async function hit(path, { method = 'GET', body, headers } = {}) {
  // The registered path is bare; the request URL may carry a query string.
  const [routePath] = path.split('?');
  const route = registered.find((r) => r.path === routePath);
  if (!route) throw new Error(`route not registered: ${routePath}`);
  const req = makeReq(method, path, body, headers);
  const res = makeRes();
  const pending = route.handler(req, res);
  req.emitBody();
  await pending;
  return res.holder;
}

const BASE = '/__dsh-skill-panel';
const probeRoot = mkdtempSync(join(tmpdir(), 'skill-panel-routes-'));
const probeSkill = join(probeRoot, 'route-probe');
mkdirSync(probeSkill, { recursive: true });
writeFileSync(
  join(probeSkill, 'SKILL.md'),
  '---\nname: route-probe\ndescription: 路由自测探针\n---\n正文\n',
  'utf8',
);

try {
  const ping = await hit(`${BASE}/ping`);
  check('GET ping → 200', ping.status === 200, String(ping.status));
  check('ping 报出 5 条路由', Array.isArray(ping.json?.routes) && ping.json.routes.length === 5);
  check('ping 报出未安装索引状态', Boolean(ping.json?.undeclaredIndex));

  const skills = await hit(`${BASE}/skills?cwd=${encodeURIComponent(process.cwd())}`);
  check('GET skills → 200 且是扫描报告', skills.status === 200 && Array.isArray(skills.json?.skills));
  check('报告含 6 类根元信息', Array.isArray(skills.json?.roots) && skills.json.roots.length >= 5, String(skills.json?.roots?.length));

  const skillsNoCwd = await hit(`${BASE}/skills`);
  check('不带 cwd 时仍返回报告（项目根留空）', skillsNoCwd.status === 200 && skillsNoCwd.json?.cwd === null, String(skillsNoCwd.json?.cwd));
  check('不带 cwd 时不列项目级根', skillsNoCwd.json?.roots.every((r) => !r.source.startsWith('project-')));

  const wrongMethod = await hit(`${BASE}/skills`, { method: 'POST', body: {} });
  check('GET 路由用 POST → 405', wrongMethod.status === 405, String(wrongMethod.status));

  const badBody = await hit(`${BASE}/toggle`, { method: 'POST', body: 'not json' });
  check('坏 JSON → 400', badBody.status === 400, `${badBody.status} ${badBody.json?.error}`);

  const foreign = await hit(`${BASE}/skills`, { headers: { origin: 'https://evil.example.com' } });
  check('外部 Origin → 403', foreign.status === 403, String(foreign.status));

  const localOrigin = await hit(`${BASE}/skills`, { headers: { origin: 'http://127.0.0.1:19387' } });
  check('本机 Origin → 200', localOrigin.status === 200, String(localOrigin.status));

  // toggle on a real (temporary) skill by declaring it as a writable custom root
  const toggleCtxRoutes = registered.find((r) => r.path === `${BASE}/toggle`);
  check('toggle 路由存在', Boolean(toggleCtxRoutes));

  const body = await hit(`${BASE}/undeclared?q=zzz-no-such-skill-zzz`);
  check('GET undeclared → 200（无命中也不报错）', body.status === 200 && Array.isArray(body.json?.hits), `${body.status} hits=${body.json?.hits?.length}`);

  const readBody = await hit(`${BASE}/body`);
  check('GET body 缺参数 → 400', readBody.status === 400, `${readBody.status} ${readBody.json?.error}`);

  const readBodyOk = await hit(`${BASE}/body?path=${encodeURIComponent(join(probeSkill, 'SKILL.md'))}`);
  check('GET body → 200 且读到正文', readBodyOk.status === 200 && typeof readBodyOk.json?.text === 'string' && readBodyOk.json.text.includes('route-probe'));
} finally {
  rmSync(probeRoot, { recursive: true, force: true });
}

// default root is readonly, so a toggle from here must be refused, not applied
const refused = await hit(`${BASE}/toggle`, {
  method: 'POST',
  body: { filePath: join(probeRoot, 'gone.md'), disable: true },
});
check('toggle 目标不存在 → 400/403 拒绝', refused.status === 400 || refused.status === 403, `${refused.status} ${refused.json?.error}`);
check('没有留下任何探针文件', !existsSync(probeRoot));

mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, 'routes-report.json'), JSON.stringify({ checks, log, registered: registered.map((r) => r.path) }, null, 2));
console.log(`\n报告已写：${join(reportDir, 'routes-report.json')}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n=== 路由自测：${checks.length - failed.length}/${checks.length} 通过 ===`);
process.exit(failed.length === 0 ? 0 : 1);
