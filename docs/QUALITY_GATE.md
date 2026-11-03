# 模板质量门禁

本门禁区分生成正确性、自动行为验证和真实平台验收。通过前一层不代表后一层通过。

| 层级 | 证明内容 | 入口 | 不证明的内容 |
| --- | --- | --- | --- |
| G0 结构 | manifests、依赖闭包、生成结果、功能增删、用户修改保护、权限分配 | `npm run check:fast`、`npm run docs:check` | 应用可编译、原生行为 |
| G1 独立构建 | 每个功能及其依赖独立安装，TS/Rust 编译、测试与前端构建 | `npm run check:feature-matrix` | 系统窗口、真实权限拒绝 |
| G2 契约与集成 | 三种 recipe、npm/pnpm、bindings 漂移、同目录重复检查、状态与失败恢复 | `npm run check:generated`、`npm run check:contracts`、`npm run check:feature-matrix:pnpm` | 签名、更新服务、真实跨窗交互 |
| G3 原生 | macOS/Windows/Linux 窗口、快捷键、跨窗、ACL 拒绝、数据库响应性 | [原生验收清单](NATIVE_ACCEPTANCE.md) | 签名和发布链路 |
| G4 发布 | 打包、签名、更新签名验证、安装升级及回滚 | `npm run check:release` 加真实签名/服务验证 | 自动获得发布授权 |

`npm run check:all` 执行 G0–G2 的全部自动入口。`--quick` 只执行结构检查，结果标记为 `structure-only`，不能计入 G1。`check:release` 运行未必签名的 bundle build，仅提供 G4 的部分证据。

## 工具链与首次运行

使用 Node 22.13.0 或 Node 24.11.1 代表性版本、npm 11.6.2 / pnpm 12.9.1、Rust 1.92.0（rustfmt/clippy）。生成器 engines 允许 `^22.13.0 || >=24.0.0`；其余版本仍须自行验证。生成项目中的工具链文件固定 Rust；Node 不再接受原来的过宽 20.x 支持声明。

生成包含 Rust 自定义 command 的项目后，按以下顺序执行：

```bash
npm install
npm run bindings:generate
npm run check:all
npm run build
```

没有 `specta-bindings` 的 minimal 项目省略 bindings 命令。pnpm 项目使用对应包管理器执行同名脚本。首次独立生成没有锁文件，先 install；保存生成锁文件后，应用 CI 使用 `npm ci` 或 pnpm frozen lockfile。

`bindings:generate` 是显式写操作；`bindings:check` 导出至临时文件、规范格式后比较，不覆盖现有 bindings。Rust DTO 改动必须先被 drift 检查发现，再重新生成并修复 TypeScript 消费端，不能以手写重复类型或 `@ts-nocheck` 规避。

## 功能矩阵

`node scripts/verify-feature-matrix.js --list` 从 catalog 获取全部功能，并追加共享输出、标题栏/i18n、独立 preferences/主题、updater/workflow 和 full/titlebar 边界组合。每项拥有独立生成目录和 node_modules；允许共享 Cargo 编译缓存，不能共享 full 的 node_modules。

```bash
node scripts/verify-feature-matrix.js --only custom-titlebar+i18n --output /tmp/titlebar-evidence
node scripts/verify-feature-matrix.js --package-manager pnpm --only preferences+ui-shadcn
```

每个命令保存参数、cwd、stdout、stderr、退出码；矩阵 results 记录 Node、包管理器、依赖闭包和 lockfile SHA-256。失败目录保留；成功目录清理，但矩阵日志复制至 evidence 目录。预期失败的契约测试也保留现场，结果以测试断言为准。

CI 分 macOS 的两条 Node 线和三系统功能矩阵，上传矩阵日志。CI 配置存在不等于远程执行通过。新增功能应添加自身行为测试，声明依赖/command/权限，并更新边界组合；不能只把它加入 full 后宣布独立可用。

## 证据记录

每次正式验收记录源码提交和未提交 diff 指纹、工具版本、生成参数、lockfile hash、命令/退出码和日志位置。证据与源码不一致时只保留历史价值；只在改动涉及对应边界时重跑相关检查，发布前执行完整门禁。当前实施进展见 [实施记录](TEMPLATE_QUALITY_IMPLEMENTATION.md)。
