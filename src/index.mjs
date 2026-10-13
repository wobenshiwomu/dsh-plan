/**
 * dsh-plan — 深潜计划：DSH 里的"套餐页"（自营）。
 *
 * 一个模仿 Coding Plan 定价页的页面（DSH 内全屏浮层）：
 *  - 七张档位卡：¥10 / ¥20 / ¥50 / ¥100 / ¥300 / ¥500 / 自定义（金额贴官方充值档）；
 *  - 「订阅」按钮跳转官方充值页 platform.deepseek.com/top_up——钱进的是你自己的 DeepSeek 余额；
 *  - 订阅读回来后自动"生效"：把充值净增按链子换算（净增 ÷4 → 周，÷5 → 5 小时，
 *    1 元 = 800 万 token），写进 dsh-ration 的额度（跨插件走 ctx.provide('ration') 服务）；
 *  - 余额监视：进页面记基准 → 20 秒轮询 + 窗口 focus 即查 → 退出页面后宽限 5 分钟（30 秒/次）；
 *    只认"涨"（净增 ≥ ¥10），就近匹配档位（±5%），匹配不到按自定义金额配。
 *
 * 页面本身不标注 token 额度——数字只活在配给挂件与订阅成功弹窗里。
 *
 * @module dsh-plan
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'

export const name = 'dsh-plan'
// webServer 懒注入（headless 几何下跳过）；ration / deepseekAccount 同为懒注入。
export const inject = ['commands']
export const ROUTE_PREFIX = '/dsh-plan'

const STATE_VERSION = 1

export const Config = Schema.object({
  topUpUrl: Schema.string().default('https://platform.deepseek.com/top_up').description('「订阅」跳转的官方充值页'),
  intervalOpenMs: Schema.number().default(20_000).description('页面打开时的余额轮询间隔（毫秒）'),
  intervalGraceMs: Schema.number().default(30_000).description('离开页面后的宽限轮询间隔（毫秒）'),
  graceMs: Schema.number().default(300_000).description('离开页面后继续监听多久（毫秒，默认 5 分钟）'),
  minRise: Schema.number().default(10).description('判定"订阅发生"的最小余额净增（元）'),
  tolerance: Schema.number().default(0.05).description('就近匹配档位的容差（0.05 = ±5%）'),
  balanceBaseUrl: Schema.string().default('https://api.deepseek.com').description('余额接口 base（账号服务不可用时的兜底；测试可指向本地 mock）'),
  apiKeyRef: Schema.string().default('DEEPSEEK_API_KEY').description('从 DSH 凭据服务读取密钥的引用名（兜底余额查询用）'),
  storageDir: Schema.string().default('').description('状态存储目录（默认 $DSH_HOME/storages/dsh-plan）'),
})

// ---------------------------------------------------------------------------
// 档位表与换算（深潜主题；价格 = 官方充值档位）
// ---------------------------------------------------------------------------

export const TIERS = [
  { key: 't10', name: '试水', price: 10, tag: '尝个鲜' },
  { key: 't20', name: '浅潜', price: 20, tag: '轻度日用' },
  { key: 't50', name: '深潜', price: 50, tag: '日常开发' },
  { key: 't100', name: '深渊', price: 100, tag: '重度码农' },
  { key: 't300', name: '海沟', price: 300, tag: '专业优选' },
  { key: 't500', name: '马里亚纳', price: 500, tag: '全能尊享' },
  { key: 'custom', name: '自定义', price: null, tag: '按自己的节奏' },
]

/** 换算率：1 元 = 40 万（5 小时窗）/ 200 万（周）。¥100 档正好回到 4000万 / 2亿。 */
export const TOKENS_PER_YUAN_5H = 400_000
export const TOKENS_PER_YUAN_WEEK = 2_000_000

/** 金额（元）→ 配给额度（token）。 */
export function quotasForYuan(yuan) {
  const n = Number(yuan)
  if (!Number.isFinite(n) || n <= 0) return null
  return {
    cap5h: Math.round(n * TOKENS_PER_YUAN_5H),
    capWeek: Math.round(n * TOKENS_PER_YUAN_WEEK),
  }
}

/** 净增金额 → 就近档位（±tolerance）；匹配不到返回 null（走自定义）。 */
export function matchTier(rise, tolerance = 0.05) {
  let best = null
  let bestDiff = Number.POSITIVE_INFINITY
  for (const t of TIERS) {
    if (t.price === null) continue
    const diff = Math.abs(rise - t.price)
    if (diff <= Math.max(t.price * tolerance, 0.5) && diff < bestDiff) {
      best = t
      bestDiff = diff
    }
  }
  return best
}

/** 从配给当前额度反推档位（用于页面上的"当前套餐"）。 */
export function tierForQuotas(caps) {
  if (caps === null || caps === undefined || typeof caps.cap5h !== 'number' || caps.cap5h <= 0) return null
  for (const t of TIERS) {
    if (t.price === null) continue
    const q = quotasForYuan(t.price)
    if (Math.abs(q.cap5h - caps.cap5h) / caps.cap5h <= 0.02) return { key: t.key, name: t.name, price: t.price, tag: t.tag }
  }
  const yuan = Math.round((caps.cap5h / TOKENS_PER_YUAN_5H) * 100) / 100
  return { key: 'custom', name: '自定义', price: null, tag: '按自己的节奏', yuan }
}

export function publicTier(tier) {
  if (tier === null || tier === undefined) return null
  return { key: tier.key, name: tier.name, price: tier.price ?? null, tag: tier.tag ?? '', yuan: tier.yuan ?? null }
}

// ---------------------------------------------------------------------------
// 主体
// ---------------------------------------------------------------------------

export function createPlan({ ctx, config, deps = {} }) {
  const fsImpl = deps.fs ?? fs
  const env = deps.env ?? process.env
  const homeDir = deps.homeDir ?? os.homedir()
  const nowFn = deps.now ?? (() => Date.now())
  const setTimer = deps.setTimeout ?? setTimeout
  const clearTimerFn = deps.clearTimeout ?? clearTimeout

  const storageDir = config.storageDir !== '' && config.storageDir !== undefined
    ? config.storageDir
    : path.join(env.DSH_HOME ?? path.join(homeDir, '.dsh'), 'storages', 'dsh-plan')
  const stateFile = path.join(storageDir, 'state.json')

  /** 懒注入的服务：ration（写额度）、deepseekAccount（读余额）、credentials（兜底读密钥）。 */
  let svcRation = null
  let svcAccount = null
  let svcCredentials = null

  const state = {
    pending: null,     // 检测到的订阅（待确认/已自动应用）
    prevCaps: null,    // 应用前的额度（撤销用）
    lastSub: null,     // 最近一次订阅记录
  }

  /** 余额监视（仅内存，重启即散）。 */
  let armed = null
  let timer = null

  // —— 持久化 ——

  function loadState() {
    try {
      const parsed = JSON.parse(fsImpl.readFileSync(stateFile, 'utf8'))
      if (parsed?.version === STATE_VERSION) {
        if (parsed.pending && typeof parsed.pending === 'object') state.pending = parsed.pending
        if (parsed.prevCaps && typeof parsed.prevCaps === 'object') state.prevCaps = parsed.prevCaps
        if (parsed.lastSub && typeof parsed.lastSub === 'object') state.lastSub = parsed.lastSub
      }
    } catch {
      /* 首次运行或损坏：空状态 */
    }
  }

  function saveState() {
    try {
      fsImpl.mkdirSync(storageDir, { recursive: true })
      fsImpl.writeFileSync(stateFile, JSON.stringify({
        version: STATE_VERSION,
        pending: state.pending,
        prevCaps: state.prevCaps,
        lastSub: state.lastSub,
      }))
    } catch (error) {
      ctx.logger.warn(`[dsh-plan] 状态落盘失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // —— 余额读取 ——

  /** 默认：官方账号服务优先，API key 余额接口兜底；测试可用 deps.balanceProvider 覆盖。 */
  async function readBalance() {
    const custom = deps.balanceProvider
    if (typeof custom === 'function') {
      try {
        const v = await custom()
        return typeof v === 'number' && Number.isFinite(v) ? { ok: true, value: v, source: 'custom' } : { ok: false, code: 'no-balance' }
      } catch {
        return { ok: false, code: 'query-failed' }
      }
    }
    const viaAccount = await readBalanceViaAccount()
    if (viaAccount.ok) return viaAccount
    const viaKey = await readBalanceViaApiKey()
    if (viaKey.ok) return viaKey
    // 都失败：兜底没 key 时报账号侧原因，否则报兜底原因
    return viaKey.code === 'no-key' ? viaAccount : viaKey
  }

  /** 官方账号服务（需已登录 platform 账号）。 */
  async function readBalanceViaAccount() {
    if (svcAccount === null || typeof svcAccount.getBalance !== 'function') return { ok: false, code: 'no-account' }
    try {
      const res = await svcAccount.getBalance({
        version: '0.0.0-dsh-plan',
        locale: 'zh-CN',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      })
      if (res === null || res === undefined) return { ok: false, code: 'signed-out' }
      if (res.status !== 'ready') return { ok: false, code: 'account-failed' }
      const wallets = Array.isArray(res.value) ? res.value : []
      let sum = null
      for (const w of wallets) {
        if (w?.currency !== 'CNY') continue
        const n = Number.parseFloat(String(w.balance))
        if (Number.isFinite(n)) sum = (sum ?? 0) + n
      }
      return sum === null ? { ok: false, code: 'no-balance' } : { ok: true, value: sum, source: 'account' }
    } catch (error) {
      ctx.logger.warn(`[dsh-plan] 账号服务余额查询失败: ${error instanceof Error ? error.message : String(error)}`)
      return { ok: false, code: 'query-failed' }
    }
  }

  /** 兜底：API key 走官方 /user/balance（与 dsh-tide 同款；这台机器上验证过）。 */
  async function readBalanceViaApiKey() {
    const fetchFn = deps.fetchFn ?? fetch
    let key
    try {
      const cred = await svcCredentials?.resolve?.(config.apiKeyRef)
      key = cred?.value
    } catch {
      key = undefined
    }
    if (key === undefined || key === '') key = env[config.apiKeyRef]
    if (key === undefined || key === '') return { ok: false, code: 'no-key' }
    try {
      const res = await fetchFn(`${config.balanceBaseUrl}/user/balance`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return { ok: false, code: `http-${res.status}` }
      const data = await res.json()
      const info = Array.isArray(data?.balance_infos)
        ? data.balance_infos.find((w) => w?.currency === 'CNY') ?? data.balance_infos[0]
        : undefined
      const value = Number.parseFloat(String(info?.total_balance ?? ''))
      if (!Number.isFinite(value)) return { ok: false, code: 'parse-failed' }
      return { ok: true, value, source: 'api-key' }
    } catch (error) {
      return { ok: false, code: 'query-failed' }
    }
  }

  // —— ration 联动 ——

  function rationCaps() {
    if (svcRation === null || typeof svcRation.getCaps !== 'function') return null
    try {
      return svcRation.getCaps()
    } catch {
      return null
    }
  }

  function tryApply(quotas) {
    if (svcRation === null || typeof svcRation.setCaps !== 'function') return { ok: false, code: 'no-ration' }
    const before = rationCaps()
    try {
      const r = svcRation.setCaps({ cap5h: quotas.cap5h, capWeek: quotas.capWeek })
      if (r?.ok === true) {
        state.prevCaps = before === null ? null : { h5: before.h5, week: before.week }
        saveState()
        return { ok: true, caps: r.caps }
      }
      return { ok: false, code: r?.code ?? 'apply-failed' }
    } catch (error) {
      return { ok: false, code: 'apply-threw' }
    }
  }

  function undo() {
    if (svcRation === null || typeof svcRation.setCaps !== 'function') return { ok: false, code: 'no-ration' }
    if (state.prevCaps === null) return { ok: false, code: 'nothing-to-undo' }
    try {
      const r = svcRation.setCaps({ cap5h: state.prevCaps.h5, capWeek: state.prevCaps.week })
      if (r?.ok === true) {
        state.prevCaps = null
        state.pending = null
        saveState()
        return { ok: true, caps: r.caps }
      }
      return { ok: false, code: r?.code ?? 'undo-failed' }
    } catch {
      return { ok: false, code: 'undo-threw' }
    }
  }

  // —— 监视状态机 ——

  function clearWatchTimer() {
    if (timer !== null) {
      clearTimerFn(timer)
      timer = null
    }
  }

  function schedule(delay) {
    clearWatchTimer()
    timer = setTimer(() => {
      timer = null
      void tick()
    }, delay)
  }

  async function tick() {
    if (armed === null) return
    if (armed.phase === 'grace' && nowFn() > armed.graceUntil) {
      armed = null
      return
    }
    await checkNow('auto')
    if (armed === null || armed.phase === 'detected') return
    schedule(armed.phase === 'open' ? config.intervalOpenMs : config.intervalGraceMs)
  }

  /** 打开页面：记基准并开始轮询。已有 pending 时只清错不重记。 */
  async function openWatch() {
    if (state.pending !== null) return { ok: true, pending: state.pending }
    const r = await readBalance()
    armed = {
      phase: 'open',
      base: r.ok ? r.value : null,
      armedAt: nowFn(),
      graceUntil: null,
      lastError: r.ok ? null : r.code,
    }
    schedule(config.intervalOpenMs)
    return { ok: true, base: armed.base }
  }

  /** 离开页面：没检测到就转宽限模式，继续盯 5 分钟。 */
  function leaveWatch() {
    if (armed === null || armed.phase === 'detected') {
      clearWatchTimer()
      return { ok: true, phase: null }
    }
    armed.phase = 'grace'
    armed.graceUntil = nowFn() + config.graceMs
    schedule(config.intervalGraceMs)
    return { ok: true, phase: 'grace', graceUntil: armed.graceUntil }
  }

  /** 查一次余额：涨了就判定订阅（就近匹配/自定义）→ 自动应用额度。 */
  async function checkNow(source) {
    if (armed === null) return { ok: false, code: 'not-armed' }
    if (state.pending !== null) return { ok: true, detected: true, pending: state.pending }
    const r = await readBalance()
    if (!r.ok) {
      armed.lastError = r.code
      return { ok: false, code: r.code }
    }
    if (armed.base === null) {
      armed.base = r.value
      armed.lastError = null
      return { ok: true, detected: false, baselined: true }
    }
    const rise = Math.round((r.value - armed.base) * 100) / 100
    if (rise < config.minRise) return { ok: true, detected: false, balance: r.value, rise }

    const tier = matchTier(rise, config.tolerance)
    const amount = tier !== null ? tier.price : rise
    const quotas = quotasForYuan(amount)
    const applied = quotas === null ? { ok: false, code: 'bad-amount' } : tryApply(quotas)
    const tierPub = publicTier(tier) ?? { key: 'custom', name: '自定义', price: null, tag: '', yuan: amount }
    state.pending = {
      rise,
      amount,
      tier: tierPub,
      quotas,
      applied,
      source,
      at: nowFn(),
    }
    state.lastSub = { amount, tier: tierPub, at: state.pending.at, auto: applied.ok === true }
    armed.phase = 'detected'
    clearWatchTimer()
    saveState()
    const banner = `[dsh-plan] 检测到订阅：净增 ¥${rise} → ${tierPub.name}（额度已${applied.ok ? '同步' : '未同步：' + applied.code}）`
    ctx.logger.info(banner)
    return { ok: true, detected: true, pending: state.pending }
  }

  // —— 对外状态 ——

  function publicState() {
    const caps = rationCaps()
    // ration 服务的键名是 {h5, week}；反推档位用 {cap5h, capWeek}
    const capsForTier = caps === null ? null : { cap5h: caps.h5, capWeek: caps.week }
    return {
      ok: true,
      now: nowFn(),
      topUpUrl: config.topUpUrl,
      tiers: TIERS.map((t) => publicTier(t)),
      watch: armed === null ? null : {
        phase: armed.phase,
        base: armed.base,
        graceUntil: armed.graceUntil,
        lastError: armed.lastError ?? null,
      },
      pending: state.pending,
      lastSub: state.lastSub,
      current: {
        available: svcRation !== null,
        caps: caps === null ? null : { h5: caps.h5, week: caps.week },
        // 只有"订阅过"才盖章：没订阅（lastSub 为空）时显示无档位
        tier: state.lastSub === null ? null : tierForQuotas(capsForTier),
      },
    }
  }

  // —— 命令 ——

  async function cmdPlan() {
    return {
      kind: 'success',
      text: '深潜计划：入口在侧边栏底部的「Token Plan」，点它打开（页面不会自己弹出来）。',
    }
  }

  // —— 路由 ——

  function sendJson(res, code, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
        if (data.length > 1 << 20) reject(new Error('body too large'))
      })
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })
  }

  async function routeHandler(req, res) {
    try {
      const url = new URL(req.url ?? ROUTE_PREFIX, 'http://localhost')
      const route = url.pathname
      const method = req.method ?? 'GET'
      if (route === `${ROUTE_PREFIX}/state` && method === 'GET') {
        return sendJson(res, 200, publicState())
      }
      if (route === `${ROUTE_PREFIX}/watch` && method === 'POST') {
        let body
        try {
          body = JSON.parse((await readBody(req)) || '{}')
        } catch {
          return sendJson(res, 400, { ok: false, code: 'bad-json' })
        }
        const result = body?.open === true ? await openWatch() : leaveWatch()
        return sendJson(res, 200, result)
      }
      if (route === `${ROUTE_PREFIX}/check` && method === 'POST') {
        const result = await checkNow('manual')
        return sendJson(res, 200, result)
      }
      if (route === `${ROUTE_PREFIX}/apply` && method === 'POST') {
        if (state.pending === null) return sendJson(res, 400, { ok: false, code: 'nothing-pending' })
        const quotas = state.pending.quotas ?? quotasForYuan(state.pending.amount)
        if (quotas === null) return sendJson(res, 400, { ok: false, code: 'bad-amount' })
        const applied = tryApply(quotas)
        state.pending.applied = applied
        saveState()
        return sendJson(res, 200, { ok: applied.ok === true, applied })
      }
      if (route === `${ROUTE_PREFIX}/undo` && method === 'POST') {
        return sendJson(res, 200, undo())
      }
      if (route === `${ROUTE_PREFIX}/dismiss` && method === 'POST') {
        state.pending = null
        clearWatchTimer()
        armed = null
        saveState()
        return sendJson(res, 200, { ok: true })
      }
      if (route === `${ROUTE_PREFIX}/health`) {
        return sendJson(res, 200, {
          ok: true,
          name: 'dsh-plan',
          ration: svcRation !== null,
          account: svcAccount !== null,
          credentials: svcCredentials !== null || typeof env[config.apiKeyRef] === 'string',
          storage: storageDir,
        })
      }
      return sendJson(res, 404, { ok: false, code: 'not-found' })
    } catch (error) {
      ctx.logger.warn(`[dsh-plan] 路由失败: ${error instanceof Error ? error.message : String(error)}`)
      return sendJson(res, 500, { ok: false, code: 'internal' })
    }
  }

  // —— 装配 ——

  function start() {
    loadState()

    //  HTTP 路由（客户端页面/入口轮询）
    try {
      ctx.inject(['webServer'], (scoped) => {
        scoped.effect(() => {
          const dispose = scoped.webServer.register({
            kind: 'prefix',
            path: ROUTE_PREFIX,
            handler: routeHandler,
          })
          return dispose
        }, 'dsh-plan: routes')
      })
    } catch (error) {
      ctx.logger.warn(`[dsh-plan] 路由注册失败（无 web 服务时忽略）: ${error instanceof Error ? error.message : String(error)}`)
    }

    // 斜杠命令
    ctx.effect(function* () {
      yield ctx.commands.register({
        definitionId: CommandDefinitionId('dsh-plan/plan'),
        name: 'plan',
        description: '深潜计划：打开套餐页（DSH 内页面）',
        handler: cmdPlan,
      })
    }, 'dsh-plan: commands')

    // 跨插件：ration（写额度）
    try {
      ctx.inject(['ration'], (scoped) => {
        svcRation = scoped.ration
      })
    } catch (error) {
      ctx.logger.warn(`[dsh-plan] ration 服务注入失败: ${error instanceof Error ? error.message : String(error)}`)
    }

    // 官方账号服务（读余额，首选）
    try {
      ctx.inject(['deepseekAccount'], (scoped) => {
        svcAccount = scoped.deepseekAccount
      })
    } catch (error) {
      ctx.logger.warn(`[dsh-plan] deepseekAccount 服务注入失败: ${error instanceof Error ? error.message : String(error)}`)
    }

    // 凭据服务（余额兜底：API key 走 /user/balance）
    try {
      ctx.inject(['credentials'], (scoped) => {
        svcCredentials = scoped.credentials
      })
    } catch (error) {
      ctx.logger.warn(`[dsh-plan] credentials 服务注入失败: ${error instanceof Error ? error.message : String(error)}`)
    }

    ctx.effect(() => {
      const banner = `[dsh-plan] 已加载（深潜计划 · 7 档，充值跳转 ${config.topUpUrl}，storage=${storageDir}）`
      ctx.logger.info(banner)
      console.log(banner)
      return () => {
        clearWatchTimer()
        ctx.logger.info('[dsh-plan] 已卸载')
      }
    })
  }

  return {
    start,
    // 测试与调试入口
    _state: state,
    _armed: () => armed,
    _loadState: loadState,
    _saveState: saveState,
    _openWatch: openWatch,
    _leaveWatch: leaveWatch,
    _checkNow: checkNow,
    _undo: undo,
    _publicState: publicState,
    _cmdPlan: cmdPlan,
    _route: routeHandler,
    _setRation: (svc) => { svcRation = svc },
    _setAccount: (svc) => { svcAccount = svc },
    _tick: tick,
    _storageDir: storageDir,
  }
}

export function apply(ctx, config) {
  const rt = createPlan({ ctx, config })
  rt.start()
  return rt
}
