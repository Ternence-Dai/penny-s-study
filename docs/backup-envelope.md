# 统一备份信封 + age 口令加密导出（第六波 #3 推广，penny-s-study）

格式与 Health 试点（Human-Digital-Twin-Health `docs/backup-envelope.md`）同一规范，按本仓数据集形态适配：本仓没有单一台账对象，数据是登记表（`STORAGE_REGISTRY`）里的多个独立数据集，信封因此是多数据集形态。

## 信封格式（明文层）

`buildUnifiedBackupEnvelope(datasetsById, exportedAt)`（`src/domain/index.js`，与迁移登记制同层）产出：

```json
{
  "format": "penny-backup-envelope",
  "manifest": {
    "schemaVersion": 1,
    "exportedBy": "penny-s-study",
    "exportedAt": "<ISO 时间>",
    "datasets": [
      { "key": "wrong", "schemaVersion": 6, "storage": "local-browser", "count": 2 },
      { "key": "attempts", "schemaVersion": 1, "storage": "local-browser", "count": 1 }
    ]
  },
  "datasets": {
    "wrong": [ /* 存储原形状 */ ],
    "attempts": [ /* 存储原形状 */ ]
  }
}
```

- 备份集与原始恢复包的条目集一致：KEY 八数据集（wrong/record/days/qstats/ai/prefs/practice/graduated）+ 作答流水（attempts），共 9 个。错误事件账有自己的导出信封、FSRS 影子日志是可由流水重放的派生数据——两者按登记表既有口径不进备份集。
- 清单中的 `schemaVersion` 是各数据集在登记表中的声明版本，`count` 是条目数（数组长度／记录型数据集的键数／缺失数据集为 0、payload 为 null）。数据集 payload 就是存储原形状，不做任何字段改写；孩子题库与孩子模式可见性完全不经信封层，无任何改动（verify 链照旧复核孩子池 144/110）。
- 预检 `parseUnifiedBackupEnvelope`：信封 `schemaVersion` 不是 1 明确拒绝（版本过高不猜读）；清单列出的数据集缺失、未列出的数据集混入、备份集外的数据集、清单版本与登记声明不一致、练习会话印记高于当前版本、清单计数与实际条目不一致——全部整包拒绝。

## 本仓的适配边界（重要）

本仓的恢复模型按设计是**只导出、不回灌**：应用内没有备份导入路径，恢复包历来只用于人工/开发者辅助恢复。本波不新建任何把数据写回存储的导入路径；信封的导入侧预检（版本门＋计数门）落在 domain 层并有测试钉住，是未来任何恢复工具必须先过的门。

## 加密层（age）

- 实现：FiloSottile/typage 官方 bundle `age-encryption` v0.3.1（BSD-3-Clause），单文件 vendor 于 `assets/js/vendor/age-encryption.js`（208,688 字节，SHA-256 `3199bdb6ae48d2efa6fa762c81d19f3f7362d2179b9d61b3ba642db8d092b93c`，与 Health 仓的同一份逐字节一致；许可证在同目录 `age-encryption.LICENSE.txt`）。
- 形态：经典脚本，仅在用户点击加密导出时由 `loadPennyAgeEncryption()` 动态插入 `<script>` 按需加载；不进首屏、不在 service worker 预缓存清单中（测试钉住）。
- 模式：口令（scrypt）模式，导出文件名为 `penny-study-backup-<日期>.age`。口令只存在于调用期间的局部变量：不落盘、不进 localStorage、不进错误事件账（测试以源码正则钉住）。
- 导出时逐数据集直读 localStorage 并解析：任一数据集损坏即中止导出并提示先导原始恢复包，绝不把坏数据封进加密备份；读取不走受保护的存储通道，导出本身不会触发恢复锁。存储处于恢复保护时加密导出被明确阻止。

## 风险提示（已写进导出 UI）

口令丢失 = 数据不可恢复。明文恢复包导出仍在，加密是显式选项；.age 文件不依赖本应用存续，任何标准 age 工具都能解。
