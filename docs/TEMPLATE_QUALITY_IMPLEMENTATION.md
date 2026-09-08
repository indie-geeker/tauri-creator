# 模板质量改进实施记录

实施日期：2026-09-07。基线提交：`990bbb0cfdd9dc8e5df4cf7815e079c7adb7b55a`。

代码与自动验证位于隔离 worktree `/Users/wen/.config/superpowers/worktrees/tauri-creator/template-quality`，分支 `codex/template-quality`。实施和验证快照生成时尚未提交，main 工作区未修改。用户随后授权将本轮改动提交并合并到本地 main；不包含远程推送或发布。核心 T01–T13 已实现；T14 自动门禁与文档已实现，原生及远程发布验收保持待验证。可选 E01 不在实施范围。

## 任务与交付

| 任务 | 已实现的行为 | 主要源文件/验证 |
| --- | --- | --- |
| T01 | 唯一临时应用、自有 node_modules、完整命令日志、失败现场保留；DOM native mock 拒绝未知调用 | `scripts/lib/generated-fixture.js`、`test-feature-contracts.js`、`base/src/test/tauri-mocks.ts` |
| T02 | 名称统一校验、拒绝数字开头/保留词、固定包管理器与 Rust、收窄 Node 支持线、重复检查可运行 | `scripts/lib/app-name.js`、`package-managers.js`、`base/rust-toolchain.toml` |
| T03 | 标题栏独立依赖、业务无关 props、本地窗口控制/hooks、OS 共享所有者、Linux 原生装饰 | `features/custom-titlebar`、`features/os-runtime`、9 项标题栏 DOM 测试 |
| T04 | SQLite String ID、真实 Specta commands/types 消费、统一 Result adapter、只读漂移检查、中央 check 脚本组合 | `scripts/specta-bindings.js`、`generated-checks.js`、`features/specta-bindings`；DTO 漂移负例及两种应用顺序测试 |
| T05 | updater 读取最终 AppHandle config，允许官方动态 URL；发布 workflow 独立，tag/dispatch 版本预检 | `features/updater`、`features/updater-release-workflow`、`test-release-version.js` |
| T06 | 增删前生成完整计划、受管理文件冲突拒绝、JSON/窗口/Cargo 协调、CRLF 与 symlink 检查、尽力回滚 | `scripts/lib/feature-change-plan.js`、`output-ownership.js`、`test-output-ownership.js`、roundtrip 测试 |
| T07 | layout/preferences 不隐含浮窗，Appearance 为基础面板，General 只在组合启用时贡献 | `scripts/settings-contributions.js`、`features/quick-pane/contributions`、5 种结构组合 |
| T08 | Rust 单一偏好权威、typed patch、互斥持久化、损坏文件拒绝、跨窗刷新、错误阻写、主题/语言桥接 | `features/preferences`、`features/app-state`、`features/i18n`；读取交错/事件失败/卸载回归 |
| T09 | 快捷键验证→注册→移除旧键→持久化→提交；失败补偿、实际注册集合和 degraded 可见 | `quick_pane_shortcut.rs`；7 项协调测试含排他注册 fallback 和同键重置 |
| T10 | Rust receipt 序号与进程内快照，ACK 前保留草稿，pending 防重复，快照/事件抗乱序，监听清理 | `quick_pane_submission.rs`、`submission-store.ts`、`submission-runtime.ts`、窗口 DOM 测试 |
| T11 | 统一 feature graph、确定性闭包、声明式 bootstrap/providers/command 装配，引用计数与失败逆序清理 | `scripts/lib/feature-catalog.js`、`registration-renderer.js`、`base/src/lib/runtime.ts` |
| T12 | main/quick-pane/titlebar 分窗能力，command manifest 与注册共用出口，避免旧 default 权限累加 | `scripts/lib/capability-renderer.js`、`test-capabilities.js`；本地 Rust schema 编译通过，真实拒绝待验 |
| T13 | SQLite 专属 worker、bounded queue、async IPC、显式退出、user_version 迁移、稳定 keyset 分页/详情 | `features/sqlite/.../database/{worker,migrations,notes}.rs`；13 项数据库测试 |
| T14 | 21 个独立功能和 7 个边界组合、npm/pnpm、Node 两条线、三系统 CI、分层门禁与迁移文档 | `scripts/verify-feature-matrix.js`、`.github/workflows/ci.yml`；当前平台证据见下 |

## 实施调整

- 不采用通用插件框架；只增加设置贡献与 runtime start/dispose 两种小型扩展点。
- 偏好存储的同步核心保留在 `preferences.rs` 内，没有为计划中的每个概念机械拆文件。
- 设置注册文件命名为 `src/generated/settings.ts`；权限测试入口为 `scripts/test-capabilities.js`。
- JSON 协调区分缺失/null；Cargo 仅接受已知表/单行值结构，未知语法安全拒绝。
- 源码注册格式按 rustfmt 行宽生成，生成器本身不依赖本机安装 Rust 才能运行结构检查。
- fixture 使用唯一 crate 名，避免不同应用共享 Cargo target 时重复包名导致 build-script 命令表缓存污染；保留首败记录，并重新验证受影响组合。
- `resolvedFeatures` 现在随增删更新，避免 PROJECT_MAP 与有效闭包矛盾；创建时选择历史另行保留。

## 本地验证记录

验证均在 macOS，本地 Node 24.11.1/npm 11.6.2/pnpm 11.7.0/Rust 1.92.0；Node 22.13.0 单独安装固定 npm 后验证 starter。原生 UI/签名没有由这些测试证明。

| 检查 | 结果/证据 |
| --- | --- |
| 原始 G0 基线 | 通过；`/tmp/tauri-quality-baseline.log` |
| 生成器、结构、增删、所有权测试 | 通过；`/tmp/tauri-fast-final-verified.log` |
| 名称、标题栏、bindings 漂移、updater 配置、feature roundtrip 契约 | 通过；`/tmp/tauri-contracts-final.log` 含历史 repeat-check 格式失败，不表示该轮全绿 |
| 同目录 check→build→check | 修正测试文件格式后通过；`/tmp/tauri-repeat-final-v2.log` |
| Preferences/runtime 专项补测 | 2 文件 13 测试和整项目 typecheck 通过；`/tmp/tauri-review-lifecycle-*.log` |
| npm full 严格检查 | 通过（76 前端测试、43 Rust 测试）；`/tmp/tauri-npm-full-final.log` 和保留目录中的 `logs/*.json` |
| pnpm full 严格检查 | 通过；`/tmp/tauri-pnpm-full-strict.log` |
| Node 22.13 starter | 安装、bindings、TS、前端测试、rustfmt、Rust 测试、build 通过；`/tmp/tauri-node22-starter.log` |
| npm minimal / pnpm starter | 全部通过；`/tmp/tauri-remaining-recipes.log` |
| npm 独立功能与组合 | 28/28 通过（21 独立 + 7 组合）；`/tmp/tauri-quality-matrix-npm/status.json`、各子目录命令日志 |
| pnpm 四种高风险组合 | 全部通过；`/tmp/tauri-quality-matrix-pnpm/results.json` 与 `...-recheck/results.json` 合并取各项最终结果；保留原失败证据 |

最终可机器读取的结果/锁 hash/源码指纹见 [验证证据](validation/template-quality-2026-09-07.json)。临时原始日志可能随系统清理失效；可用 QUALITY_GATE 中的固定命令重新生成完整证据。源码 fingerprint 表示最终实现，前期通过项发生在同轮较早快照；后续修改范围已在本记录说明，不能把全部历史条目误称为一次同 SHA 全量运行。

## 尚未取得的验收证据

A01/A02/A04/A05/A06/A07/A11/A13 的本地自动项已覆盖；A03/A08/A09/A10/A12 的原生交互/拒绝项和 A14 的三系统实测、远程 Actions、签名发布保持待验证。数据库线程单元测试不证明真实窗口帧率；DOM mock 不证明系统控件；capability 编译不证明实际 IPC 拒绝。

具体步骤见 [原生验收](NATIVE_ACCEPTANCE.md)。本轮没有把这些项目标记为全通过，也没有为验证修改真实应用数据。本地 main 集成不改变这些验收状态；发布前仍需补齐对应平台与签名证据。验证 JSON 中的 `uncommitted` 和 branch 字段描述记录生成时的快照状态。

## 本地集成复验修正

首次合并到 main 后，干净工作区的结构验证发现 `base/src/generated/application.tsx` 和 `providers.tsx` 被根 `generated/` 规则忽略，未进入首个提交；此前工作区验证使用了这两个实际文件。现为该模板输入目录添加显式例外，并将两文件纳入版本控制。补充 Git 归档验证，以检查提交内容本身，避免仅验证含忽略文件的工作区。原始失败日志：`/tmp/tauri-main-post-merge-fast.log`。
