# 用 AI 创建和开发应用

模板提供两个入口：个人 `tauri-creator` skill 负责选型、生成和基础验证；每个生成应用的 AGENTS.md 负责后续开发约定。README 保留人工使用说明，PROJECT_MAP.md 提供当前功能和文档索引。

## 安装个人 skill

在此仓库根目录执行以下命令，将维护源文件链接到个人技能目录：

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -s "$PWD/docs/ai/skills/tauri-creator" \
  "${CODEX_HOME:-$HOME/.codex}/skills/tauri-creator"
```

若同名目录已存在，先检查其内容，不用强制覆盖。该链接可从其他工作目录使用，模板迁移路径后需要更新链接。若运行环境不支持链接目录，可复制技能，并在调用时提供模板仓库的绝对路径。已有会话若尚未发现技能，可重新打开任务或显式提供 SKILL.md 路径。

安装源文件：[tauri-creator/SKILL.md](skills/tauri-creator/SKILL.md)。当前模板面向 Rust + Tauri + React；纯 Rust 库或其他前端技术栈需要另行选择基础。

## 创建项目 prompt

将以下方括号字段替换成实际值；包管理器和额外功能可省略，由本次需求决定：

```text
使用 $tauri-creator 创建桌面应用。
产品目标：[目标用户和要解决的问题]
项目名称：[英文 kebab-case 名称]
目标目录：[绝对路径]
目标平台：[macOS / Windows / Linux]
基础模板：starter
额外功能：[按需列出，例如 sqlite、i18n]
核心功能：[本次要实现的功能和验收条件]
先验证生成基础，再按生成项目的 AGENTS.md 完成业务实现。
```

其他 AI 工具若未自动发现技能，可直接要求读取该 SKILL.md，并提供模板路径。项目创建后，打开生成目录继续工作，不需要每次重新运行创建 skill。

## 后续开发 prompt

```text
先读取本项目 AGENTS.md、PROJECT_MAP.md 和相关功能文档。
本次需求：[具体修改与验收条件]
复用现有能力，完成实现和相应验证，并报告实际结果。
```

生成应用的 AGENTS.md 可追加业务规则；详细产品设计放在应用自己的 `docs/`。不要在模板仓库中记录某个业务应用的专属要求，也不要手改自动维护的 PROJECT_MAP.md。版本、脚本、功能清单引用实际配置，避免在多份 AI 说明里重复维护。

## 已有生成应用

新增说明默认随之后创建的应用交付，旧应用不会自动升级。为旧应用补充 AGENTS.md 时先合并其已有规则，核对所有链接和命令；功能增删仍遵循 [模板兼容约定](../TEMPLATE_COMPATIBILITY.md)。更新了生成文档格式的模板可能无法匹配旧 PROJECT_MAP 基线，需要匹配原模板版本或在副本中明确迁移，不能伪造生成状态绕过冲突。

## 维护验证

修改 AI 入口后运行 `npm run check:agent-guidance`。它在临时目录验证 minimal/npm、starter/pnpm、full/npm 的文档链接和命令，并检查增删功能后说明同步及应用自定义 AGENTS.md 的保留。技能格式另用 skill-creator 的 `quick_validate.py` 检查；格式和生成测试通过不等于已经验证模型的自动选择行为。
