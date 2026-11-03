# 应用开发约定

本文件由 tauri-creator 随应用生成。若正在模板仓库的 `base/` 中编辑本文件，将其视为模板内容，按仓库根 AGENTS.md 验证。

## 从实际项目开始

先读 [README](README.md)、[项目地图](PROJECT_MAP.md) 和 [生成状态](.tauri-creator.json)，确认当前启用功能、文件归属和命令。项目地图的 Feature Docs 只列出当前安装的功能说明，修改相关能力时再读取。

包管理器、Node 要求和可执行脚本以 [package.json](package.json) 为准，Rust 版本以 [rust-toolchain.toml](rust-toolchain.toml) 为准。安装后按项目地图的 Common Commands 完成必要的代码生成，再进行开发和检查。

## 开发边界

- React/TypeScript 负责界面、交互及前端状态，Rust 负责原生能力和后端数据操作。先沿现有组件、adapter、command 找到职责边界，复用已安装功能，避免建立第二套持久化或原生服务。
- 业务界面从 [AppContent](src/AppContent.tsx) 及其组件扩展；Rust 入口为 [lib.rs](src-tauri/src/lib.rs)。生成绑定通过对应脚本更新。`src/generated/`、`src-tauri/src/generated/` 和带生成标记的装配区由模板管理，优先使用现有扩展点；业务需要定制装配时，同步命令注册、权限命令名列表与类型导出，并在项目文档记录定制路径，供后续功能增删处理兼容冲突。
- 新增 IPC 时同步核对 Rust 注册、前端调用/类型、输入校验以及窗口权限。遵循当前项目的绑定方案和功能文档，避免手写重复类型掩盖生成漂移。
- 新窗口与原生能力按实际需要配置权限。Tauri 命令和窗口配置分别从 [capabilities](src-tauri/capabilities/) 与 [tauri.conf.json](src-tauri/tauri.conf.json) 追踪，不因 UI 隐藏就假定调用不可达。
- 对持久化失败保留错误，不以默认值覆盖现有数据；成功通知应对应真实完成的操作。遵循相关功能文档中的存储和跨窗口状态契约。

## 模板功能变更

先在匹配的 tauri-creator 仓库中运行 `scripts/apply-feature.js` 或 `scripts/remove-feature.js`，传入本应用的绝对 `--target`、`--feature` 并用 `--dry-run` 查看计划，再执行已授权的变更。生成应用自身不包含这些脚本。

脚本会同步依赖、注册、权限、生成状态和 PROJECT_MAP.md；不要仅删除功能目录或手改状态绕过冲突。遇到受管理文件修改或未知模板基线，保留现有内容，使用匹配版本在副本比对后迁移。删除功能不自动删除其留存依赖。

PROJECT_MAP.md 由生成器维护；业务特有的约定追加到本文件，详细设计放在 `docs/`，避免写入会被重新生成的项目地图。

## 验证与交付

按改动运行项目实际提供的检查，完整本地检查使用 `{{PACKAGE_MANAGER}} run check:all`。需要验证前端构建时运行 `{{PACKAGE_MANAGER}} run build`。`{{PACKAGE_MANAGER}} run dev` 仅启动浏览器前端，`{{PACKAGE_MANAGER}} run tauri:dev` 才运行原生应用。

区分测试/mock、前端构建、原生运行、其他平台和签名安装的验证结果；原生窗口、快捷键和 IPC 权限需要对应原生验收。只做文档调整时不重复运行完整应用构建。

按用户范围持续完成工作，保护无关修改。项目文档放在 `docs/` 按用途组织；本地实验与工作日志放在忽略的 `docs/local/`，不要混入正式设计。Git 提交、推送、发布和真实数据变更按实际授权执行。
