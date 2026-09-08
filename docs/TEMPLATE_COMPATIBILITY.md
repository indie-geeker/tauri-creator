# 模板兼容与维护约定

本轮调整针对新生成应用。旧项目不会自动获得源码升级；先备份/提交应用自身修改，在副本中比较输出，再迁移下列契约。

| 变化 | 迁移要求 |
| --- | --- |
| app 名称要求字母开头的 ASCII kebab-case，并拒绝 Rust 保留词 | 旧名称需要同时核对 package、crate、identifier；不要只改目录 |
| 自定义 command 功能依赖 specta-bindings | 首次 install 后生成 bindings；前端从生成 commands/types 导入，Result 用统一 adapter 解包 |
| SQLite ID 从 number 改为 decimal string | 更新前端参数/类型和缓存 key；不要转成 JS Number；SQLite INTEGER 不变 |
| save_preferences 改为 patch_preferences | 只发送 theme/language patch；快捷键由专用协调命令更新；保持旧文件字段名 |
| ui-preferences/ui-layout 不隐式带 quick-pane | 需要浮窗时显式启用 quick-pane；General 面板由条件贡献注册 |
| updater 与发布流程分开 | 仅运行时更新选 updater；需要 draft release workflow 时加 updater-release-workflow |
| custom-titlebar/i18n 共用 os-runtime | 移除重复 OS 注册/依赖；标题栏不依赖业务设置或布局 |
| SQLite worker 和分页 | 查询使用 summary page 与独立 detail；默认 50、最大 200；游标保留 String ID |
| generated 装配边界 | 应用业务放到组件/service；generated application/providers/bootstrap 和 Rust commands 由生成器维护 |

## 安全增删功能

`apply-feature` / `remove-feature` 先从当前模板重建预期前后输出，再计算变更计划。未知基线、修改过的受管理代码、符号链接路径、依赖冲突会在写入前拒绝。先运行 `--dry-run` 查看将变更的路径。

JSON 按受管理字段协调，窗口按 label 合并，保留用户新增字段；null 与缺失区分。Cargo 使用受限的表/单行键值解析，保留不冲突的用户表与依赖；遇到未知多行语法会拒绝，需手工迁移。仅行尾 CRLF 差异可接受。删除功能不会强删其他功能仍依赖的能力，也不自动清除留存的依赖，需按依赖逆序显式移除。

`requestedFeatures`、`recipeFeatures` 和 `optionalFeatures` 保留创建时选择历史；`resolvedFeatures` 与 `enabledFeatures` 表示当前有效闭包，增删成功后同步更新。

schemaVersion 不等于 2 或无法重建旧输出时拒绝自动增删。schemaVersion 2 也不是任意历史版本都兼容的承诺。复制原版本生成器、在副本重新生成比对，或手动集成，是旧项目的恢复路径；不要修改 state 伪造版本来绕过检测。

写前进行全计划和逐文件并发检查，异常时只回退仍等于本次输出的文件，保留并发修改。该机制是进程级尽力回滚，不是文件系统事务，不保证断电/崩溃原子性；部分写入或回滚失败会报告人工恢复路径。生成器操作期间不要同时编辑受影响文件。

## 扩展约定

- 功能 metadata 集中声明依赖、command 和权限；共享资源指定单一所有者。
- frontendRuntime 用 start/dispose 契约，由 bootstrap 管理引用计数、启动失败反向清理和 HMR。
- 新设置面板使用明确的贡献 id/requires/source/exportName/order；不要在共享页面直接引入可选业务。
- Rust 持有持久状态和全局快捷键权威，前端缓存反映成功返回的快照；不能在读取失败时写入默认值。
- 新窗口按最小 capability 分配权限，自定义 command 同时进入生成的 command manifest，进行允许和拒绝两类原生测试。
- 新 schema 迁移需检测已知旧结构、事务升级、拒绝未来版本，并在临时数据库验证失败回滚。

功能矩阵和验收边界见 [质量门禁](QUALITY_GATE.md)；真实设备状态见 [原生验收](NATIVE_ACCEPTANCE.md)。
