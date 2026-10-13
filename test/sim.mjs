/**
 * dsh-plan 仿真测试台
 *
 * ①纯函数：额度换算（1元=800万）/ 就近档位匹配（±5%）/ 从额度反推档位
 * ②装配：路由/命令/服务注入（ration + deepseekAccount）
 * ③余额监视状态机：基准 → 净增判定 → 就近匹配/自定义 → 自动写额度 → 撤销
 *    （含：低于阈值不触发、基准缺失时先补基准、宽限模式超时自散、没 ration 时降级）
 * ④HTTP 路由全量：/state /watch /check /apply /undo /dismiss /health /404
 * ⑤/plan 命令：openSeq 递增并持久化
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createPlan,
  quotasForYuan,
  matchTier,
  tierForQuotas,
  TIERS,
  TOKENS_PER_YUAN_5H,
  TOKENS_PER_YUAN_WEEK,
  ROUTE_PREFIX,
} from '../src/index.mjs'

let passed = 0
const log = (...a) => console.log(...a)
function group(name) {
  log(`\n═══ ${name}`)
}
function ok(msg) {
  passed++
  log(`  ✓ ${msg}`)
}
function eq(msg, a, b) {
  assert.equal(a, b, msg)
  ok(msg)
}
function okIf(msg, cond) {
  assert.ok(cond, msg)
  ok(msg)
}

function makeRes() {
  return {
    status: 0,
    headers: null,
    body: '',
    writeHead(s, h) {
      this.status = s
      this.headers = h
      return this
    },
    end(chunk) {
      if (chunk !== undefined) this.body += String(chunk)
    },
  }
}

function makeReq({ method = 'GET', url = `${ROUTE_PREFIX}/health`, body = '' } = {}) {
  const req = { method, url, _l: {} }
  req.on = (ev, cb) => {
    req._l[ev] = cb
    return req
  }
  setImmediate(() => {
    if (body !== '' && req._l.data) req._l.data(Buffer.from(body, 'utf8'))
    if (req._l.end) req._l.end()
  })
  return req
}

/** 假 ration 服务（记录 setCaps 调用）。 */
function makeRation({ h5 = 40_000_000, week = 200_000_000 } = {}) {
  const calls = []
  const svc = {
    version: '0.1.2',
    calls,
    caps: { h5, week },
    setCaps(input) {
      calls.push(input)
      if (typeof input?.cap5h === 'number' && input.cap5h > 0) svc.caps.h5 = input.cap5h
      if (typeof input?.capWeek === 'number' && input.capWeek > 0) svc.caps.week = input.capWeek
      return { ok: true, caps: { ...svc.caps } }
    },
    getCaps() {
      return { h5: svc.caps.h5, week: svc.caps.week, enforce: true }
    },
  }
  return svc
}

/** 假环境：可控余额 / 可控时钟 / 假计时器。 */
function makeEnv({ config = {}, ration = makeRation(), account = null, credentials = null, fetchFn = null, balance = 100 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-sim-'))
  const routes = []
  const commands = []
  const logs = []
  const timers = []
  const box = { balance, now: 1_800_000_000_000 }
  const ctx = {
    logger: {
      info: (m) => logs.push(['info', m]),
      warn: (m) => logs.push(['warn', m]),
    },
    inject: (deps, cb) => {
      if (deps.includes('webServer')) {
        cb({ effect: (fn) => fn(), webServer: { register: (r) => { routes.push(r); return () => {} } } })
      } else if (deps.includes('ration')) {
        if (ration !== null) cb({ ration })
      } else if (deps.includes('deepseekAccount')) {
        if (account !== null) cb({ deepseekAccount: account })
      } else if (deps.includes('credentials')) {
        if (credentials !== null) cb({ credentials })
      }
    },
    commands: {
      register: (def) => {
        commands.push(def)
        return () => {}
      },
    },
    effect: (fn) => {
      if (typeof fn === 'function' && fn.constructor && fn.constructor.name === 'GeneratorFunction') {
        const it = fn()
        for (let r = it.next(); !r.done; r = it.next()) { /* 忽略 */ }
        return () => {}
      }
      const dispose = typeof fn === 'function' ? fn() : undefined
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  const cfg = {
    topUpUrl: 'https://platform.deepseek.com/top_up',
    intervalOpenMs: 20_000,
    intervalGraceMs: 30_000,
    graceMs: 300_000,
    minRise: 10,
    tolerance: 0.05,
    balanceBaseUrl: 'https://api.deepseek.com',
    apiKeyRef: 'DEEPSEEK_API_KEY',
    storageDir: dir,
    ...config,
  }
  const deps = {
    fs,
    env: {},
    homeDir: os.homedir(),
    now: () => box.now,
    setTimeout: (fn, ms) => {
      const id = { fn, ms }
      timers.push(id)
      return id
    },
    clearTimeout: (id) => {
      const i = timers.indexOf(id)
      if (i >= 0) timers.splice(i, 1)
    },
    balanceProvider: async () => box.balance,
  }
  if (fetchFn !== null) deps.fetchFn = fetchFn
  return { ctx, cfg, deps, dir, routes, commands, logs, timers, box, ration }
}

// ---------------------------------------------------------------------------
// ① 纯函数
// ---------------------------------------------------------------------------

group('① 纯函数')
{
  eq('档位表 7 档', TIERS.length, 7)
  eq('换算率 5h', TOKENS_PER_YUAN_5H, 400_000)
  eq('换算率 周', TOKENS_PER_YUAN_WEEK, 2_000_000)

  const q100 = quotasForYuan(100)
  eq('¥100 → 5h 4000万', q100.cap5h, 40_000_000)
  eq('¥100 → 周 2亿', q100.capWeek, 200_000_000)
  eq('¥0 → null', quotasForYuan(0), null)
  eq('¥-5 → null', quotasForYuan(-5), null)

  eq('¥100 就近 → 深渊', matchTier(100)?.key, 't100')
  eq('¥97 就近 → 深渊（±5%）', matchTier(97)?.key, 't100')
  eq('¥104.9 就近 → 深渊', matchTier(104.9)?.key, 't100')
  eq('¥80 匹配不到 → null（走自定义）', matchTier(80), null)
  eq('¥10 → 试水', matchTier(10)?.key, 't10')
  eq('¥9 低于最小档容差 → null', matchTier(9), null)

  eq('4000万/2亿 反推 → 深渊', tierForQuotas({ cap5h: 40_000_000, capWeek: 200_000_000 })?.key, 't100')
  const cu = tierForQuotas({ cap5h: 12_340_000, capWeek: 61_700_000 })
  eq('非常规额度 → 自定义', cu?.key, 'custom')
  eq('自定义反推金额 ≈ ¥30.85', cu?.yuan, 30.85)
}

// ---------------------------------------------------------------------------
// ② 装配
// ---------------------------------------------------------------------------

group('② 装配')
{
  const env = makeEnv()
  const rt = createPlan({ ctx: env.ctx, config: env.cfg, deps: env.deps })
  rt.start()
  eq('注册了 1 条路由', env.routes.length, 1)
  eq('路由前缀', env.routes[0].path, ROUTE_PREFIX)
  eq('注册了 /plan 命令', env.commands.length, 1)
  eq('命令名', env.commands[0].name, 'plan')

  const h = await rt._route({ method: 'GET', url: `${ROUTE_PREFIX}/health` }, makeRes())
  void h
  const res = makeRes()
  await rt._route({ method: 'GET', url: `${ROUTE_PREFIX}/health` }, res)
  const health = JSON.parse(res.body)
  okIf('health 报告 ration/account/credentials', health.ration === true && health.account === false && health.credentials === false)

  // 官方账号服务路径（wallet 解析：CNY 求和，忽略 USD）
  const env2 = makeEnv({
    ration: makeRation(),
    account: {
      getBalance: async (meta) => {
        assert.equal(typeof meta.version, 'string')
        assert.equal(typeof meta.timezoneOffsetSeconds, 'number')
        return { status: 'ready', value: [{ currency: 'USD', balance: '7' }, { currency: 'CNY', balance: '100.5' }], bonusWallets: [] }
      },
    },
  })
  const rt2 = createPlan({ ctx: env2.ctx, config: env2.cfg, deps: { ...env2.deps, balanceProvider: undefined } })
  rt2.start()
  const r2 = await rt2._checkNow('manual') // 未武装：not-armed
  eq('未武装时 check → not-armed', r2.code, 'not-armed')
  await rt2._openWatch()
  const r2b = await rt2._checkNow('manual')
  eq('账号服务路径：基准 100.5（忽略 USD）', rt2._armed().base, 100.5)
  okIf('基准补记后不误判', r2b.detected === false)
}

// ---------------------------------------------------------------------------
// ②.5 余额兜底（API key 走 /user/balance）
// ---------------------------------------------------------------------------

group('②.5 余额兜底')
{
  // 账号服务未登录 → 走 API key 兜底（credentials 提供密钥）
  const env = makeEnv({
    account: null,
    credentials: { resolve: async (ref) => (ref === 'DEEPSEEK_API_KEY' ? { value: 'sk-test' } : undefined) },
    fetchFn: async (url, opts) => {
      assert.equal(url, 'https://api.deepseek.com/user/balance')
      assert.equal(opts.headers.authorization, 'Bearer sk-test')
      return {
        ok: true,
        json: async () => ({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '1' }, { currency: 'CNY', total_balance: '88.88' }] }),
      }
    },
  })
  const rt = createPlan({ ctx: env.ctx, config: env.cfg, deps: { ...env.deps, balanceProvider: undefined } })
  rt.start()
  await rt._openWatch()
  eq('API key 兜底读到 CNY 88.88', rt._armed().base, 88.88)

  // 没有 credentials 服务，但 env 里有 key
  const env2 = makeEnv({
    account: null,
    fetchFn: async () => ({ ok: true, json: async () => ({ balance_infos: [{ currency: 'CNY', total_balance: '10' }] }) }),
  })
  const rt2 = createPlan({
    ctx: env2.ctx, config: env2.cfg,
    deps: { ...env2.deps, balanceProvider: undefined, env: { DEEPSEEK_API_KEY: 'sk-env' } },
  })
  rt2.start()
  await rt2._openWatch()
  eq('env key 兜底', rt2._armed().base, 10)

  // 账号服务 + 密钥都没有 → 报账号侧错误码
  const env3 = makeEnv({ account: null })
  const rt3 = createPlan({ ctx: env3.ctx, config: env3.cfg, deps: { ...env3.deps, balanceProvider: undefined } })
  rt3.start()
  await rt3._openWatch()
  eq('无源可读 → no-account', rt3._armed().lastError, 'no-account')
}

// ---------------------------------------------------------------------------
// ③ 余额监视状态机
// ---------------------------------------------------------------------------

group('③ 余额监视状态机')
{
  // 正常订阅：+103.5 → 就近深渊 → 自动写额度 + 撤销
  const env = makeEnv({ ration: makeRation(), balance: 100 })
  const rt = createPlan({ ctx: env.ctx, config: env.cfg, deps: env.deps })
  rt.start()

  await rt._openWatch()
  eq('基准余额', rt._armed().base, 100)

  env.box.balance = 100
  const r0 = await rt._checkNow('manual')
  okIf('余额没动 → 不触发', r0.detected === false)

  env.box.balance = 103.5 // +3.5 < ¥10，不触发
  const r1 = await rt._checkNow('manual')
  okIf('净增 3.5 低于阈值 → 不触发', r1.detected === false)

  env.box.balance = 203.5 // +103.5 → 就近 ¥100 档
  const r2 = await rt._checkNow('auto')
  okIf('净增 103.5 → 判定订阅', r2.detected === true)
  eq('就近匹配 深渊', r2.pending.tier.key, 't100')
  eq('配给写入 cap5h', env.ration.caps.h5, 40_000_000)
  eq('配给写入 capWeek', env.ration.caps.week, 200_000_000)
  okIf('applied ok', r2.pending.applied.ok === true)
  okIf('lastSub 记录', rt._state.lastSub?.tier?.key === 't100' && rt._state.lastSub?.auto === true)

  // 撤销：恢复到订阅前（假 ration 初始 4000万/2亿 之外的旧值）
  const envU = makeEnv({ ration: makeRation({ h5: 5_000_000, week: 25_000_000 }), balance: 50 })
  const rtU = createPlan({ ctx: envU.ctx, config: envU.cfg, deps: envU.deps })
  rtU.start()
  await rtU._openWatch()
  envU.box.balance = 250 // +200 → 就近 ¥300? |200-300|=100 no; |200-100|=100 no → 自定义 ¥200
  const rU = await rtU._checkNow('manual')
  eq('净增 200 匹配不到 → 自定义', rU.pending.tier.key, 'custom')
  eq('自定义额度按 200 元', envU.ration.caps.h5, 200 * TOKENS_PER_YUAN_5H)
  const ru = rtU._undo()
  okIf('撤销成功', ru.ok === true)
  eq('撤销恢复旧 cap5h', envU.ration.caps.h5, 5_000_000)
  eq('撤销清空 pending', rtU._publicState().pending, null)

  // 基准缺失：首次读取失败 → 下次成功时补基准
  const envB = makeEnv()
  let failFirst = true
  const rtB = createPlan({
    ctx: envB.ctx,
    config: envB.cfg,
    deps: {
      ...envB.deps,
      balanceProvider: async () => {
        if (failFirst) {
          failFirst = false
          throw new Error('boom')
        }
        return 50
      },
    },
  })
  rtB.start()
  await rtB._openWatch()
  eq('基准缺失（读取失败）', rtB._armed().base, null)
  const rb = await rtB._checkNow('manual')
  okIf('首次成功读取补基准', rb.baselined === true && rtB._armed().base === 50)

  // 宽限模式：离页转 grace，超时自散
  const envG = makeEnv()
  const rtG = createPlan({ ctx: envG.ctx, config: envG.cfg, deps: envG.deps })
  rtG.start()
  await rtG._openWatch()
  const lg = rtG._leaveWatch()
  eq('离页 → grace', lg.phase, 'grace')
  okIf('graceUntil = now + 5min', rtG._armed().graceUntil === envG.box.now + 300_000)
  envG.box.now += 300_001
  await rtG._tick()
  eq('宽限超时 → 自散', rtG._armed(), null)

  // 没 ration：检测照样发生，但 applied 降级
  const envN = makeEnv({ ration: null, balance: 10 })
  const rtN = createPlan({ ctx: envN.ctx, config: envN.cfg, deps: envN.deps })
  rtN.start()
  await rtN._openWatch()
  envN.box.balance = 110
  const rN = await rtN._checkNow('manual')
  okIf('无 ration 仍判订阅', rN.detected === true)
  eq('applied 降级 no-ration', rN.pending.applied.code, 'no-ration')
}

// ---------------------------------------------------------------------------
// ④ HTTP 路由
// ---------------------------------------------------------------------------

group('④ HTTP 路由')
{
  const env = makeEnv({ ration: makeRation(), balance: 100 })
  const rt = createPlan({ ctx: env.ctx, config: env.cfg, deps: env.deps })
  rt.start()

  const res1 = makeRes()
  await rt._route({ method: 'GET', url: `${ROUTE_PREFIX}/state` }, res1)
  const st = JSON.parse(res1.body)
  eq('state 200', res1.status, 200)
  eq('tiers 7 档', st.tiers.length, 7)
  eq('topUpUrl 正确', st.topUpUrl, 'https://platform.deepseek.com/top_up')
  eq('未订阅 → 无档位（不盖章）', st.current.tier, null)

  const resW = makeRes()
  await rt._route(makeReq({ method: 'POST', url: `${ROUTE_PREFIX}/watch`, body: '{"open":true}' }), resW)
  okIf('watch open → 武装', JSON.parse(resW.body).ok === true && rt._armed() !== null)

  env.box.balance = 160 // +60 → 就近 ¥50? |60-50|=10 no → 自定义
  const resC = makeRes()
  await rt._route(makeReq({ method: 'POST', url: `${ROUTE_PREFIX}/check`, body: '{}' }), resC)
  const chk = JSON.parse(resC.body)
  okIf('check 检出订阅', chk.detected === true)
  eq('自定义档（净增 60）', chk.pending.tier.key, 'custom')

  const res1b = makeRes()
  await rt._route({ method: 'GET', url: `${ROUTE_PREFIX}/state` }, res1b)
  eq('订阅过之后再盖章（自定义）', JSON.parse(res1b.body).current.tier.key, 'custom')

  const resU = makeRes()
  await rt._route(makeReq({ method: 'POST', url: `${ROUTE_PREFIX}/undo`, body: '{}' }), resU)
  okIf('undo 路由 ok', JSON.parse(resU.body).ok === true)

  const resD = makeRes()
  await rt._route(makeReq({ method: 'POST', url: `${ROUTE_PREFIX}/dismiss`, body: '{}' }), resD)
  okIf('dismiss 清空 pending', rt._publicState().pending === null)

  const res404 = makeRes()
  await rt._route({ method: 'GET', url: `${ROUTE_PREFIX}/nope` }, res404)
  eq('404', res404.status, 404)
}

// ---------------------------------------------------------------------------
// ⑤ /plan 命令（只提示入口，不再推页）
// ---------------------------------------------------------------------------

group('⑤ /plan 命令')
{
  const env = makeEnv()
  const rt = createPlan({ ctx: env.ctx, config: env.cfg, deps: env.deps })
  rt.start()
  const r1 = await rt._cmdPlan()
  okIf('回执 success', r1.kind === 'success')
  okIf('提示 Token Plan 入口且不推页', r1.text.includes('Token Plan') && !r1.text.includes('推到你的窗口'))
  eq('state 里没有 openSeq 机制', Object.prototype.hasOwnProperty.call(rt._publicState(), 'openSeq'), false)
}

// ---------------------------------------------------------------------------
log(`\n═══ 全部通过：${passed} 项断言 ═══`)
process.exit(0)
