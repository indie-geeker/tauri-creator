# Tauri Creator 开发约定

这个仓库维护 Rust + Tauri v2 + React/TypeScript 的生成器。业务应用生成到仓库外或忽略的临时目录。先从 [README](README.md) 确认创建入口，按任务读取相关源码；不要把生成应用的开发命令当作生成器检查命令。

## 源码与生成边界

- `base/` 是基础模板；`features/<name>/feature.json` 及其 files/json/cargo 内容声明可选能力；`recipes/` 定义组合。版本和依赖以实际配置为准。
- `scripts/create-app.js` 负责创建；`scripts/apply-feature.js` 与 `scripts/remove-feature.js` 负责现有应用的功能变更。后两者先重建预期输出并检查冲突，不是任意旧项目的源码升级器。
- 新能力在 manifest 声明依赖、文件、命令、权限和注册信息。修改共享装配时检查 `scripts/lib/registration-renderer.js`、`scripts/lib/capability-renderer.js` 及对应测试，避免在共享页面硬编码可选能力。
- README 的标记区、`docs/features/` 和 `docs/recipes/` 索引由 `npm run docs:generate` 更新；修改它们的源数据。

## AI 开发入口

- 本文件指导模板维护；`base/AGENTS.md` 是随应用交付的开发约定。在 `base/` 编辑时按模板维护任务验证，不能直接在未渲染占位符上运行应用命令。
- 生成应用的 AGENTS.md 保持通用且允许追加产品决策。功能相关命令和文档入口由 `scripts/project-map.js` 按当前启用功能输出到 PROJECT_MAP.md，增删功能时同步。
- 个人 skill 的可维护源文件是 [SKILL.md](docs/ai/skills/tauri-creator/SKILL.md)。安装方式和启动 prompt 见 [AI 使用说明](docs/ai/USAGE.md)。修改创建入口时一并核对其中的命令。

## 验证与交付

- 按改动运行相应 `package.json` 检查。AI 指引生成用 `npm run check:agent-guidance`；文档索引用 `npm run docs:check`；生成器结构回归用 `npm run check:fast`。
- 涉及运行时代码、依赖或原生装配时，增加相关生成应用的安装、检查和构建验证，范围见 [质量门禁](docs/QUALITY_GATE.md)。仅文档或生成指引变化无需重复完整构建矩阵。
- 临时应用和测试数据放在系统临时目录或 `tmp/`，不得使用真实业务项目测试删除或覆盖行为。保留已有用户修改；不要手改 state 绕过冲突。
- 浏览器、mock、编译和本机测试分别报告；原生窗口、其他操作系统、签名与安装升级的证据独立记录。
- AI 编写的项目文档放在 `docs/` 按用途组织；本地研究、实验和工作日志放在忽略的 `docs/local/`，需要时使用 `.git/info/exclude`。AGENTS.md 与 SKILL.md 保留入口位置。仅将授权范围内的长期共享文档作为 Git 交付物。

按已授权范围完成工作和必要验证。常规可逆选择自行处理，不在阶段边界询问继续；只有无法查明的重大决定或真实外部前提才需要用户输入。提交、推送、发布、生产修改及破坏性操作沿用用户实际授权范围。
