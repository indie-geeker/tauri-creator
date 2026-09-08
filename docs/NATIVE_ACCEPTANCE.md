# 原生验收清单

当前本地自动测试采用临时生成项目、Rust 单元测试和 DOM/mock。下表的原生项目尚未在本次实施中实测；Windows/Linux CI 也未远程执行。不得将本表当作已通过证明。

每个系统分别记录 OS/架构、源码 SHA/diff 指纹、应用版本、生成参数、锁 hash、命令、截图/录像和通过/失败结果。使用独立 bundle identifier 和临时数据；不要操作真实应用偏好或数据库。

| 场景 | 操作 | 通过条件 |
| --- | --- | --- |
| 标题栏 | macOS/Windows 最小化、最大化、恢复、拖动、双击；Linux 保持原生装饰 | 控件状态与窗口一致；按钮不误触拖动；Linux 无双重装饰 |
| 窗口生命周期 | 关闭/重开主窗、打开浮窗、应用退出 | 退出策略正确，无悬挂监听或重复回调 |
| 快捷键 | 正常改键、同键重置、被另一个应用占用、模拟持久化失败 | 有效注册、文件、UI 一致；补偿失败显示 degraded 与实际键 |
| 提交确认 | 浮窗连续 Enter、提交时继续输入、IPC 失败、收起失败 | pending 期间不接受新草稿；接收确认前不清空；失败可恢复 |
| 主窗恢复 | 提交后主窗重载，snapshot 与 event 交错 | 展示进程内最新 receipt；旧序号不覆盖新序号；明确不跨进程持久化 |
| 偏好 | 两窗改主题/语言，重启；损坏 JSON、磁盘不可写 | Rust 快照权威；加载/重载失败不伪造默认值，不允许覆盖 |
| ACL 正例 | 主窗调用其允许的 preferences/sqlite command | 正常成功 |
| ACL 反例 | 浮窗尝试 patch_preferences、create_note 等 main-only command | Tauri runtime 拒绝；同时验证浮窗正常 submit/dismiss 可用 |
| SQLite | 大量 notes、翻页、数据库锁等待、退出时队列处理 | UI 可继续交互；分页无重复/遗漏；队列满/关闭错误可见 |
| CSP | release 模式启动，主题/i18n/浮窗全部正常 | 无 CSP 引起的空白或功能丢失；本次未删除既有必要策略 |

## 发布验证（单独记录）

1. 用 fixture 验证 tag/dispatch 版本与 package/tauri.conf 一致；不匹配必须在发布前失败。
2. 配置真实更新公钥和 HTTPS endpoint，在测试渠道验证正确包成功、错误签名拒绝。
3. 分系统验证签名、公证/安装、旧版本升级和可恢复路径，保留实际 artifact hash。
4. 检查 GitHub Actions 的 draft release 与签名 secrets 配置；本地 workflow fixture 不是远程签名证明。

只有对应系统/场景取得实际证据后才更新状态。此文档不发起下载、签名、远程发布或真实数据迁移。
