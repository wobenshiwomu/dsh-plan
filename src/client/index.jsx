// dsh-plan — 浏览器半区：侧边栏「套餐」入口 + 深潜计划定价页（全屏浮层）+ 订阅闭环。
//
//  侧边栏底部（sidebar.footer.action）一个「套餐」入口；
//  点开是全屏定价页：七张横滑卡（¥10 ~ ¥500 / 自定义），卡片有档名、标语、
//  ¥X/月、订阅按钮、全勾功能清单（主清单 + 实验性功能）。
//
//  订阅闭环：
//   点「订阅」→ 跳 DeepSeek 官方充值页（新标签）→ 页面进入"等待订阅生效"；
//   宿主在后台盯余额（20s + focus 即查 + 退出宽限 5 分钟）→ 余额净增 ≥¥10 判定订阅
//   → 就近匹配档位 → 自动把额度写进 dsh-ration → 弹「订阅成功」小窗（可撤销）。
//
//  页面不标注 token 额度（数字在配给挂件里）；配色走 DSH 设计令牌，亮暗自动跟随。
import { useEffect, useRef, useState } from 'react'

const ROUTE = '/dsh-plan'
const POLL_MS = 4000

const FEATURES_MAIN = [
  'DeepSeek V4.1 Flash 可调用',
  'DeepSeek V4 Pro 可调用',
  '深度思考模式',
  '长上下文会话',
  '高并发已支持',
  '峰谷计价自动生效',
]
const FEATURES_EXP = [
  '联网搜索',
  '定时任务',
  '子代理 / 并行任务',
  '会话压缩找回',
  '插件生态（DSH Market）',
]

/** 模块级桥：侧栏入口 ↔ 浮层页面。 */
const pageBridge = { open: null }

async function api(path, body) {
  const r = await fetch(`${ROUTE}${path}`, body === undefined
    ? { method: 'GET' }
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return r.json()
}

// ── 侧边栏入口（sidebar.footer.action） ─────────────────────────────────
function SidebarEntry(props) {
  const wide = props?.wide === true
  return (
    <button
      type="button"
      className={`dsh-plan-entry${wide ? ' is-wide' : ''}`}
      title="深潜计划：Token Plan 套餐页"
      onClick={() => pageBridge.open?.()}
    >
      Token Plan
    </button>
  )
}

// ── 定价卡 ──────────────────────────────────────────────────────────────
function TierCard({ tier, isCurrent, onSubscribe }) {
  return (
    <div className={`dsh-plan-card${isCurrent ? ' is-current' : ''}`}>
      <div className="dsh-plan-cardhead">
        <span className="dsh-plan-name">{tier.name}</span>
        {isCurrent ? <span className="dsh-plan-currentbadge">当前套餐</span> : null}
      </div>
      <div className="dsh-plan-tag">{tier.tag}</div>
      <div className="dsh-plan-price">
        {tier.price !== null && tier.price !== undefined
          ? <>¥{tier.price}<span className="dsh-plan-permonth">/ 月</span></>
          : <span className="dsh-plan-customlabel">金额随你</span>}
      </div>
      <div className="dsh-plan-billing">按月计费</div>
      <button type="button" className="dsh-plan-sub" disabled={isCurrent} onClick={() => onSubscribe(tier)}>
        {isCurrent ? '已在用' : '订阅'}
      </button>
      <div className="dsh-plan-feats">
        <div className="dsh-plan-featcap">功能</div>
        {FEATURES_MAIN.map((f) => (
          <div key={f} className="dsh-plan-feat"><span className="dsh-plan-check">✓</span>{f}</div>
        ))}
        <div className="dsh-plan-featcap">实验性功能</div>
        {FEATURES_EXP.map((f) => (
          <div key={f} className="dsh-plan-feat"><span className="dsh-plan-check">✓</span>{f}</div>
        ))}
      </div>
    </div>
  )
}

// ── 订阅成功小窗 ────────────────────────────────────────────────────────
function SubPopup({ pending, onUndo, onDismiss, onRetry }) {
  const tier = pending?.tier ?? {}
  const applied = pending?.applied ?? {}
  const priceText = tier.price !== null && tier.price !== undefined ? `¥${tier.price}` : `净增 ¥${pending?.rise ?? '?'}`
  const statusText = applied.ok === true
    ? '配给额度已同步（左下角挂件可见）'
    : applied.code === 'no-ration'
      ? '未检测到 dsh-ration，额度未同步'
      : `额度同步失败（${applied.code ?? '未知'}）`
  return (
    <div className="dsh-plan-popup">
      <div className="dsh-plan-popuptitle">订阅成功 · {tier.name}（{priceText}）</div>
      <div className="dsh-plan-popupline">已计入你的 DeepSeek 余额。</div>
      <div className={`dsh-plan-popupline${applied.ok === true ? '' : ' is-warn'}`}>{statusText}</div>
      <div className="dsh-plan-popupbtns">
        {applied.ok !== true ? (
          <button type="button" className="dsh-plan-btnghost" onClick={onRetry}>重试同步</button>
        ) : null}
        <button type="button" className="dsh-plan-btnghost" onClick={onUndo}>撤销</button>
        <button type="button" className="dsh-plan-btn" onClick={onDismiss}>知道了</button>
      </div>
    </div>
  )
}

// ── 主浮层：入口 → 页面 + 状态轮询 ─────────────────────────────────────
function PlanOverlay() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)
  const openRef = useRef(false)

  const showToast = (text, ms = 3000) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), ms)
  }

  // 页面只由用户自己打开（侧栏入口/自己的手势）——不做任何"推送即弹"。
  const refresh = async () => {
    try {
      const j = await api('/state')
      if (j?.ok !== true) return
      setState(j)
    } catch {
      /* 宿主没起来 */
    }
  }

  const openPage = () => {
    setOpen(true)
    openRef.current = true
    void api('/watch', { open: true })
  }

  const closePage = () => {
    setOpen(false)
    openRef.current = false
    void api('/watch', { open: false })
  }

  // 桥给侧栏入口
  useEffect(() => {
    pageBridge.open = openPage
    return () => { pageBridge.open = null }
  }, [])

  // 状态轮询 + focus 即查
  useEffect(() => {
    void refresh()
    const t = setInterval(() => { void refresh() }, POLL_MS)
    const onFocus = () => {
      if (openRef.current) void api('/check').then(refresh)
      else void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const subscribe = (tier) => {
    const url = state?.topUpUrl ?? 'https://platform.deepseek.com/top_up'
    let win = null
    try { win = window.open(url, '_blank') } catch { win = null }
    if (win !== null) {
      try { win.opener = null } catch { /* 忽略 */ }
    } else {
      try { window.location.href = url } catch { /* 忽略 */ }
    }
    showToast('已打开官方充值页——充完回来自动生效。')
    void api('/watch', { open: true }).then(refresh)
  }

  const doUndo = async () => {
    const r = await api('/undo', {})
    showToast(r?.ok === true ? '已撤销，额度回到订阅前。' : `撤销失败（${r?.code ?? '未知'}）。`)
    void refresh()
  }
  const doDismiss = async () => {
    await api('/dismiss', {})
    void refresh()
  }
  const doRetry = async () => {
    const r = await api('/apply', {})
    if (r?.ok === true) showToast('额度已同步。')
    else showToast(`同步失败（${r?.applied?.code ?? r?.code ?? '未知'}）。`)
    void refresh()
  }
  const doManualCheck = async () => {
    const r = await api('/check', {})
    if (r?.detected === true) showToast('检测到订阅！')
    else if (r?.ok === true) showToast('还没看到余额变化——充完再点一次。')
    else showToast(`查询失败（${r?.code ?? '未知'}）。`)
    void refresh()
  }

  if (state === null) return null
  const tiers = Array.isArray(state.tiers) ? state.tiers : []
  const current = state.current ?? {}
  const currentKey = current.tier?.key ?? null
  const waiting = open && state.watch?.phase === 'open' && state.pending === null
  const pending = state.pending

  return (
    <div className="dsh-plan-layer">
      {toast !== '' ? <div className="dsh-plan-toast">{toast}</div> : null}
      {pending !== null && pending !== undefined ? (
        <SubPopup pending={pending} onUndo={doUndo} onDismiss={doDismiss} onRetry={doRetry} />
      ) : null}
      {open ? (
        <div className="dsh-plan-page">
          <div className="dsh-plan-pagehead">
            <div className="dsh-plan-title">深潜计划</div>
            <button type="button" className="dsh-plan-close" onClick={closePage} aria-label="关闭">×</button>
          </div>
          <div className="dsh-plan-cards">
            {tiers.map((t) => (
              <TierCard
                key={t.key}
                tier={t}
                isCurrent={currentKey !== null && t.key === currentKey}
                onSubscribe={subscribe}
              />
            ))}
          </div>
          <div className="dsh-plan-pagefoot">
            {waiting ? (
              <div className="dsh-plan-waiting">
                <span className="dsh-plan-waitingtext">等待订阅生效…充值完成后自动同步</span>
                <button type="button" className="dsh-plan-btn" onClick={doManualCheck}>我充好了 · 立即检测</button>
              </div>
            ) : (
              <div className="dsh-plan-footline">
                {current.available === false
                  ? '未检测到 dsh-ration（配给）：订阅后额度无法自动同步'
                  : `当前档位：${current.tier?.name ?? '未订阅'} · 按月计费 · 订阅跳转 DeepSeek 官方充值页`}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── 样式（注入一次） ─────────────────────────────────────────────────────
const CSS = `
.dsh-plan-entry{display:block;width:100%;padding:8px 12px;border:none;border-radius:10px;cursor:pointer;
  text-align:center;font-size:12px;font-weight:600;letter-spacing:.02em;
  background:var(--dsw-alias-brand-primary, #1f2329);color:var(--dsw-alias-label-primary-inverted, #fff)}
.dsh-plan-entry:hover{opacity:.9}
.dsh-plan-layer{position:fixed;inset:0;pointer-events:none;z-index:11400;font-size:12px}
.dsh-plan-page{pointer-events:auto;position:absolute;inset:0;display:flex;flex-direction:column;
  background:var(--dsw-alias-bg-base, #fff);color:var(--dsw-alias-label-primary, #1f2329)}
.dsh-plan-pagehead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:18px 16px 8px;flex:none}
.dsh-plan-title{font-size:20px;font-weight:700;letter-spacing:.04em}
.dsh-plan-close{width:30px;height:30px;padding:0;border:none;border-radius:50%;line-height:1;cursor:pointer;
  background:var(--dsw-alias-bg-skeleton, rgba(128,132,140,.18));color:var(--dsw-alias-label-secondary, #61666b)}
.dsh-plan-cards{flex:1;display:flex;gap:12px;overflow-x:auto;padding:8px 16px 12px;align-items:stretch;
  -webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory}
.dsh-plan-card{flex:0 0 224px;scroll-snap-align:start;display:flex;flex-direction:column;padding:14px 14px 10px;
  border-radius:16px;border:1px solid var(--dsw-alias-border-l2, rgba(128,132,140,.3));
  background:var(--dsw-alias-bg-layer-1, #fff)}
.dsh-plan-card.is-current{border-color:var(--dsw-alias-brand-primary, #1f2329);
  box-shadow:0 0 0 1px var(--dsw-alias-brand-primary, #1f2329) inset}
.dsh-plan-cardhead{display:flex;align-items:center;justify-content:space-between;gap:6px}
.dsh-plan-name{font-size:15px;font-weight:700}
.dsh-plan-currentbadge{flex:none;padding:2px 8px;border-radius:999px;font-size:10px;
  background:var(--dsw-alias-brand-primary, #1f2329);color:var(--dsw-alias-label-primary-inverted, #fff)}
.dsh-plan-tag{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-tertiary, #81858c)}
.dsh-plan-price{margin-top:10px;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
.dsh-plan-permonth{font-size:12px;font-weight:400;margin-left:2px;color:var(--dsw-alias-label-tertiary, #81858c)}
.dsh-plan-customlabel{font-size:16px;font-weight:600}
.dsh-plan-billing{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-tertiary, #81858c)}
.dsh-plan-sub{margin-top:10px;height:36px;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;
  background:var(--dsw-alias-brand-primary, #1f2329);color:var(--dsw-alias-label-primary-inverted, #fff)}
.dsh-plan-sub:disabled{opacity:.45;cursor:default}
.dsh-plan-feats{margin-top:12px;border-top:1px solid var(--dsw-alias-border-l2, rgba(128,132,140,.3));padding-top:8px}
.dsh-plan-featcap{font-size:10px;font-weight:600;letter-spacing:.08em;margin:6px 0 4px;
  color:var(--dsw-alias-label-tertiary, #81858c)}
.dsh-plan-feat{display:flex;gap:6px;align-items:flex-start;font-size:11px;line-height:1.6;
  color:var(--dsw-alias-label-secondary, #61666b)}
.dsh-plan-check{color:var(--dsw-static-green-500, #22c55e);font-weight:700}
body[data-ds-dark-theme] .dsh-plan-check{color:var(--dsw-static-green-400, #4ed17e)}
.dsh-plan-pagefoot{flex:none;padding:10px 16px calc(14px + env(safe-area-inset-bottom, 0px));display:flex;
  align-items:center;justify-content:space-between;gap:10px;
  border-top:1px solid var(--dsw-alias-border-l2, rgba(128,132,140,.3))}
.dsh-plan-footline{font-size:11px;color:var(--dsw-alias-label-tertiary, #81858c)}
.dsh-plan-waiting{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%}
.dsh-plan-waitingtext{font-size:11px;color:var(--dsw-alias-label-secondary, #61666b)}
.dsh-plan-btn{height:30px;padding:0 12px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;
  background:var(--dsw-alias-brand-primary, #1f2329);color:var(--dsw-alias-label-primary-inverted, #fff)}
.dsh-plan-btnghost{height:30px;padding:0 10px;border-radius:8px;cursor:pointer;font-size:12px;
  border:1px solid var(--dsw-alias-border-l2, rgba(128,132,140,.3));background:transparent;
  color:var(--dsw-alias-label-secondary, #61666b)}
.dsh-plan-toast{pointer-events:none;position:absolute;top:14px;left:50%;transform:translateX(-50%);max-width:86vw;
  padding:8px 14px;border-radius:10px;font-size:12px;line-height:1.5;box-shadow:0 6px 20px rgba(0,0,0,.2);
  background:var(--dsw-alias-bg-layer-1, #fff);color:var(--dsw-alias-label-primary, #1f2329);
  border:1px solid var(--dsw-alias-border-l2, rgba(128,132,140,.3))}
.dsh-plan-popup{pointer-events:auto;position:absolute;top:14px;left:50%;transform:translateX(-50%);width:min(92vw,340px);
  padding:14px;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.28);z-index:2;
  background:var(--dsw-alias-bg-layer-1, #fff);color:var(--dsw-alias-label-primary, #1f2329);
  border:1px solid var(--dsw-alias-border-l3, rgba(128,132,140,.4))}
.dsh-plan-popuptitle{font-size:14px;font-weight:700}
.dsh-plan-popupline{margin-top:6px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary, #61666b)}
.dsh-plan-popupline.is-warn{color:var(--dsw-static-amber-500, #f59e0b)}
.dsh-plan-popupbtns{margin-top:12px;display:flex;justify-content:flex-end;gap:8px}
`

const inject = ['slots']

async function apply(ctx) {
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.id = 'dsh-plan-style'
    tag.dataset.plugin = 'dsh-plan'
    tag.textContent = CSS
    document.head.appendChild(tag)
    return () => tag.remove()
  }, 'dsh-plan: styles')

  ctx.slots.inject('sidebar.footer.action', () => {
    const dispose = ctx.slots.register({ name: 'sidebar.footer.action', id: 'plan-entry', order: 40 }, SidebarEntry)
    return () => dispose()
  })

  ctx.slots.inject('shell.overlay', () => {
    const dispose = ctx.slots.register({ name: 'shell.overlay', id: 'plan', order: 930 }, PlanOverlay)
    return () => dispose()
  })
}

export { apply, inject }
