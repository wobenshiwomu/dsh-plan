# dsh-plan（深潜计划）

> DSH 里的自营「Token Plan」——**DSH 没有 Coding Plan，所以你自己开一家。**
> 七档订阅（¥10 ~ ¥500 / 自定义），点「订阅」跳 DeepSeek 官方充值页；钱进你自己的余额，「套餐」由 [dsh-ration](https://github.com/wobenshiwomu/dsh-ration) 落地执行。

## 是什么

一个模仿 Coding Plan 定价页版式的 DSH 内页面：

- **入口**：侧边栏底部的黑色圆角按钮「**Token Plan**」（点它打开；页面不会自己弹出来——`/plan` 命令只做入口提示）
- **七张档位卡**（横向滑动）：试水 ¥10 / 浅潜 ¥20 / 深潜 ¥50 / 深渊 ¥100 / 海沟 ¥300 / 马里亚纳 ¥500 / 自定义（金额随你）
- 每张卡：档名、标语、¥X/月、订阅按钮、功能清单（全档全勾：DeepSeek V4.1 Flash / V4 Pro 可调用、深度思考、长上下文、高并发、峰谷计价；实验性功能：联网搜索、定时任务、子代理、压缩找回、插件生态）
- **页面不标注 token 额度**——数字只在配给挂件和订阅成功小窗里
- **配色跟随 DSH 主题**：亮色 = 白底黑字，暗色 = 黑底白字
- 「当前档位」只有**订阅过**才会盖章（没充过钱 = 未订阅，不会凭空给你安一个档）

## 订阅闭环

```
点「订阅」 → 新标签打开 platform.deepseek.com/top_up（官方充值页）
          → 页面进入"等待订阅生效"（也可点「我充好了 · 立即检测」）
宿主后台盯余额 → 净增 ≥ ¥10 判定订阅（就近匹配档位 ±5%，匹配不到按自定义）
          → 自动把额度写进 dsh-ration → 弹「订阅成功」小窗（可撤销）
```

- 换算链：净增 ÷4 → 周，÷5 → 5 小时（1 元 = 800 万 token；¥100 档 = 5h 4000万 / 周 2亿）
- 余额轮询：页面打开时 20 秒一次 + 窗口 focus 即查 + 离开页面后宽限 5 分钟（30 秒/次）
- 只认"涨"：充值 = 余额跳升；日常消耗下降不会误判
- 余额读取：官方账号服务优先，未登录时兜底走 API key 的 `/user/balance`（与 [dsh-tide](https://github.com/wobenshiwomu/dsh-tide) 同款）
- 依赖 [dsh-ration](https://github.com/wobenshiwomu/dsh-ration)（v0.1.2+）自动写额度；没装也能看页面、能跳充值，只是订阅后额度不会自动同步

## 安装

```sh
dsh plugin --profile web add 'https://codeload.github.com/wobenshiwomu/dsh-plan/tar.gz/v0.1.3'
# 建议同时安装 dsh-ration（v0.1.2+）：
dsh plugin --profile web add 'https://codeload.github.com/wobenshiwomu/dsh-ration/tar.gz/v0.1.2'
```

或在图形界面：侧栏「插件」→ 添加插件 → 填上面这条 URL。装完重启 DSH 生效。

## 使用

1. 点侧栏底部的「Token Plan」（或命令 `/plan` 看提示）
2. 选一档 → 订阅 → 跳官方充值 → 充完回来（5 分钟宽限内自动检测；也可手动「立即检测」）
3. 自动弹「订阅成功」→ 配给额度已同步；「撤销」可恢复到订阅前

## 配置（profile 层可覆盖）

```yaml
- id: dsh-plan
  config:
    topUpUrl: https://platform.deepseek.com/top_up
    intervalOpenMs: 20000   # 页面打开时的余额轮询
    intervalGraceMs: 30000  # 离开页面后的宽限轮询
    graceMs: 300000         # 宽限期时长（5 分钟）
    minRise: 10             # 判定订阅的最小净增（元）
    tolerance: 0.05         # 就近匹配档位容差
    balanceBaseUrl: https://api.deepseek.com   # 余额兜底接口
    apiKeyRef: DEEPSEEK_API_KEY                # 兜底读密钥的引用名
```

## 开发

```bash
node test/sim.mjs          # 62 项断言（档位匹配/换算/监视状态机/路由/命令）
# 重建客户端（需要一个 esbuild 二进制）
ESBUILD_BIN=scripts/esbuild node scripts/build-client.mjs
```
