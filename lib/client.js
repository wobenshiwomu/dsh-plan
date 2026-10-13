window.__ModuleLoader__.load({
	id: "dsh-plan",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var ROUTE = "/dsh-plan";
var POLL_MS = 4e3;
var FEATURES_MAIN = [
  "DeepSeek V4.1 Flash 可调用",
  "DeepSeek V4 Pro 可调用",
  "深度思考模式",
  "长上下文会话",
  "高并发已支持",
  "峰谷计价自动生效"
];
var FEATURES_EXP = [
  "联网搜索",
  "定时任务",
  "子代理 / 并行任务",
  "会话压缩找回",
  "插件生态（DSH Market）"
];
var pageBridge = { open: null };
async function api(path, body) {
  const r = await fetch(`${ROUTE}${path}`, body === void 0 ? { method: "GET" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
function SidebarEntry(props) {
  const wide = props?.wide === true;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className: `dsh-plan-entry${wide ? " is-wide" : ""}`,
      title: "深潜计划：Token Plan 套餐页",
      onClick: () => pageBridge.open?.(),
      children: "Token Plan"
    }
  );
}
function TierCard({ tier, isCurrent, onSubscribe }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `dsh-plan-card${isCurrent ? " is-current" : ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-cardhead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-plan-name", children: tier.name }),
      isCurrent ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-plan-currentbadge", children: "当前套餐" }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-tag", children: tier.tag }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-price", children: tier.price !== null && tier.price !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      "¥",
      tier.price,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-plan-permonth", children: "/ 月" })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-plan-customlabel", children: "金额随你" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-billing", children: "按月计费" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-plan-sub", disabled: isCurrent, onClick: () => onSubscribe(tier), children: isCurrent ? "已在用" : "订阅" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-feats", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-featcap", children: "功能" }),
      FEATURES_MAIN.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-feat", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-plan-check", children: "✓" }),
        f
      ] }, f)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-featcap", children: "实验性功能" }),
      FEATURES_EXP.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-feat", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-plan-check", children: "✓" }),
        f
      ] }, f))
    ] })
  ] });
}
function SubPopup({ pending, onUndo, onDismiss, onRetry }) {
  const tier = pending?.tier ?? {};
  const applied = pending?.applied ?? {};
  const priceText = tier.price !== null && tier.price !== void 0 ? `¥${tier.price}` : `净增 ¥${pending?.rise ?? "?"}`;
  const statusText = applied.ok === true ? "配给额度已同步（左下角挂件可见）" : applied.code === "no-ration" ? "未检测到 dsh-ration，额度未同步" : `额度同步失败（${applied.code ?? "未知"}）`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-popup", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-popuptitle", children: [
      "订阅成功 · ",
      tier.name,
      "（",
      priceText,
      "）"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-popupline", children: "已计入你的 DeepSeek 余额。" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `dsh-plan-popupline${applied.ok === true ? "" : " is-warn"}`, children: statusText }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-popupbtns", children: [
      applied.ok !== true ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-plan-btnghost", onClick: onRetry, children: "重试同步" }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-plan-btnghost", onClick: onUndo, children: "撤销" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-plan-btn", onClick: onDismiss, children: "知道了" })
    ] })
  ] });
}
function PlanOverlay() {
  const [open, setOpen] = (0, import_react.useState)(false);
  const [state, setState] = (0, import_react.useState)(null);
  const [toast, setToast] = (0, import_react.useState)("");
  const toastTimer = (0, import_react.useRef)(0);
  const openRef = (0, import_react.useRef)(false);
  const showToast = (text, ms = 3e3) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms);
  };
  const refresh = async () => {
    try {
      const j = await api("/state");
      if (j?.ok !== true) return;
      setState(j);
    } catch {
    }
  };
  const openPage = () => {
    setOpen(true);
    openRef.current = true;
    void api("/watch", { open: true });
  };
  const closePage = () => {
    setOpen(false);
    openRef.current = false;
    void api("/watch", { open: false });
  };
  (0, import_react.useEffect)(() => {
    pageBridge.open = openPage;
    return () => {
      pageBridge.open = null;
    };
  }, []);
  (0, import_react.useEffect)(() => {
    void refresh();
    const t = setInterval(() => {
      void refresh();
    }, POLL_MS);
    const onFocus = () => {
      if (openRef.current) void api("/check").then(refresh);
      else void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  const subscribe = (tier) => {
    const url = state?.topUpUrl ?? "https://platform.deepseek.com/top_up";
    let win = null;
    try {
      win = window.open(url, "_blank");
    } catch {
      win = null;
    }
    if (win !== null) {
      try {
        win.opener = null;
      } catch {
      }
    } else {
      try {
        window.location.href = url;
      } catch {
      }
    }
    showToast("已打开官方充值页——充完回来自动生效。");
    void api("/watch", { open: true }).then(refresh);
  };
  const doUndo = async () => {
    const r = await api("/undo", {});
    showToast(r?.ok === true ? "已撤销，额度回到订阅前。" : `撤销失败（${r?.code ?? "未知"}）。`);
    void refresh();
  };
  const doDismiss = async () => {
    await api("/dismiss", {});
    void refresh();
  };
  const doRetry = async () => {
    const r = await api("/apply", {});
    if (r?.ok === true) showToast("额度已同步。");
    else showToast(`同步失败（${r?.applied?.code ?? r?.code ?? "未知"}）。`);
    void refresh();
  };
  const doManualCheck = async () => {
    const r = await api("/check", {});
    if (r?.detected === true) showToast("检测到订阅！");
    else if (r?.ok === true) showToast("还没看到余额变化——充完再点一次。");
    else showToast(`查询失败（${r?.code ?? "未知"}）。`);
    void refresh();
  };
  if (state === null) return null;
  const tiers = Array.isArray(state.tiers) ? state.tiers : [];
  const current = state.current ?? {};
  const currentKey = current.tier?.key ?? null;
  const waiting = open && state.watch?.phase === "open" && state.pending === null;
  const pending = state.pending;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-layer", children: [
    toast !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-toast", children: toast }) : null,
    pending !== null && pending !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SubPopup, { pending, onUndo: doUndo, onDismiss: doDismiss, onRetry: doRetry }) : null,
    open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-page", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-pagehead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-title", children: "深潜计划" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-plan-close", onClick: closePage, "aria-label": "关闭", children: "×" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-cards", children: tiers.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        TierCard,
        {
          tier: t,
          isCurrent: currentKey !== null && t.key === currentKey,
          onSubscribe: subscribe
        },
        t.key
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-pagefoot", children: waiting ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-plan-waiting", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-plan-waitingtext", children: "等待订阅生效…充值完成后自动同步" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-plan-btn", onClick: doManualCheck, children: "我充好了 · 立即检测" })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-plan-footline", children: current.available === false ? "未检测到 dsh-ration（配给）：订阅后额度无法自动同步" : `当前档位：${current.tier?.name ?? "未订阅"} · 按月计费 · 订阅跳转 DeepSeek 官方充值页` }) })
    ] }) : null
  ] });
}
var CSS = `
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
`;
var inject = ["slots"];
async function apply(ctx) {
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.id = "dsh-plan-style";
    tag.dataset.plugin = "dsh-plan";
    tag.textContent = CSS;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, "dsh-plan: styles");
  ctx.slots.inject("sidebar.footer.action", () => {
    const dispose = ctx.slots.register({ name: "sidebar.footer.action", id: "plan-entry", order: 40 }, SidebarEntry);
    return () => dispose();
  });
  ctx.slots.inject("shell.overlay", () => {
    const dispose = ctx.slots.register({ name: "shell.overlay", id: "plan", order: 930 }, PlanOverlay);
    return () => dispose();
  });
}

		return module.exports;
	}
});
