---
name: tauri-creator
description: 使用 tauri-creator 模板创建 Rust + Tauri + React 桌面应用，选择 recipe 和功能，并验证生成基础。适用于要求用此模板建项目的任务；普通 Rust 库、CLI 或现有应用的日常修改无需调用。
---

# 使用 Tauri Creator 创建应用

把用户的产品需求转成可运行的生成应用，随后按用户授权继续业务开发。当前模板使用 Tauri v2、Rust、React/TypeScript；若用户明确要求其他前端或纯 Rust 项目，保留该选择，不强行套用。

## 定位模板与需求

优先使用用户指定的模板路径。否则解析本 SKILL.md 的真实路径（包括安装符号链接），从其祖先目录查找同时包含 `scripts/create-app.js`、`base/`、`features/` 和 `recipes/` 的仓库。本技能的仓库位置是 `docs/ai/skills/tauri-creator/`，符号链接安装可从任意工作目录定位模板。若技能是独立复制且无法定位模板，再询问仓库路径，不扫描整台机器。

读取模板的 AGENTS.md、README 的 Automation 部分及相关 recipe/feature manifest。以当前脚本 `--help` 和配置为准，不凭记忆固定版本或功能清单。

沿用用户给出的产品需求、目标平台、项目名称和绝对输出目录。常规可逆细节可直接选择并简短说明；目标不明确且可能改到现有项目时才询问。目标必须为空或不存在；发现已有应用时按修改或迁移任务处理，不重新生成覆盖它。

## 选择与生成

- 默认从 `starter` 开始，按业务需求添加可选能力；用户明确要求最小基础时用 `minimal`。`full` 用于完整参考/回归或用户明确选择，不为“以后可能用”默认全部安装。
- 从 `recipes/*.json`、`features/*/feature.json` 读取实际组合。`--recipe` 加 `--features` 表示在 recipe 上追加；单独 `--features` 表示精确的请求集合，其依赖由生成器解析。
- 使用非交互参数调用脚本，避免进入终端问答。模板路径与输出目录分开，绝对路径作为独立参数传递并正确引用包含空格的路径。`--sidebar` 只在启用 `ui-layout` 时可用。

例如，在已确定以下变量值后执行：

```bash
node "$template_repo/scripts/create-app.js" \
  --name "$app_name" \
  --target "$app_target" \
  --recipe starter \
  --package-manager npm
```

npm 为当前默认；用户选择 pnpm 时传入 `--package-manager pnpm`。作者、标识符前缀、许可、窗口设置仅按本次需要增加；使用脚本默认值时不把示例身份当作已确认的发布身份。

## 验证与继续开发

在生成目录读取 AGENTS.md、README、PROJECT_MAP.md 和 `.tauri-creator.json`。确认输出路径、包管理器、实际启用功能及权限符合需求，然后在该目录执行：

1. 用项目的包管理器安装依赖；新生成应用没有锁文件时不要直接使用 frozen/ci 安装。
2. 若 `package.json` 提供 `bindings:generate`，首次安装和 Rust IPC 类型变化后先运行它，审查生成结果。
3. 执行该应用的 `check:all` 和 `build` 验证基础。它们与模板仓库的同名命令范围不同；无需为每个新项目运行模板的整个功能矩阵。

基础验证后继续已授权业务实现，不在阶段边界询问继续。后续按修改范围验证。若只有工具链、网络或依赖下载阻塞，明确阻塞命令与缺失前提，继续能独立完成的工作，不把未执行的检查当作通过。

按需阅读 PROJECT_MAP 的 Feature Docs，复用已安装能力。新增或移除模板功能先从匹配模板运行 apply/remove 脚本的 `--dry-run`，保留修改冲突；这是功能组合工具，不是任意旧应用的升级器。

交付说明生成位置、所选 recipe/附加功能、实际检查结果和剩余配置。浏览器构建不证明原生运行，本机检查不证明其他平台或签名安装。创建应用的授权不自动包含提交、推送或发布。
