# 开源项目深度对标：星赛通天文学习平台

> 对标日期：2026-10-19。重点借鉴儿童/青少年学习体验、可访问性和练习闭环；题库事实与答案仍需由可靠天文来源独立复核。

## 1. 上游项目与可借鉴点

### Planet Explorer — 面向儿童的天文探索体验
- 仓库：[mariotristan/planets](https://github.com/mariotristan/planets)
- 项目功能说明：[README](https://github.com/mariotristan/planets#readme)，交互模块：[quiz.js](https://github.com/mariotristan/planets/blob/main/quiz.js)、[app.js](https://github.com/mariotristan/planets/blob/main/app.js)。
- 借鉴：Explore/Compare/Fly/Quiz 等任务化导航；可触摸的天体交互；答案反馈、下一题、回合成绩和徽章；语音朗读；本地保存进度和离线访问；降低低龄学习者阅读负担。
- 不照搬：Planet Explorer 面向 6–8 岁儿童且题库规模较小；星赛通覆盖小学、初中竞赛，需要更严格的知识深度、判分精确度和多题型支持。

### Stellarium — 天文对象与天空探索
- 仓库：[Stellarium/stellarium](https://github.com/Stellarium/stellarium)
- 项目说明：[README](https://github.com/Stellarium/stellarium#readme)。
- 借鉴：天体对象浏览、场景上下文和探索式学习；对于观测类内容，应让用户知道对象、时间和观测条件。
- 不照搬：Stellarium 是实时星空软件，不等于竞赛题库；星赛通的天文事实仍需标注来源和知识适用范围。

## 2. 对本项目的产品映射

| 学习场景 | 借鉴模式 | 验收点 |
|---|---|---|
| 首页 | 年级选择、掌握度、快速开始 | 进度值来自真实答题记录 |
| 知识学习 | 知识地图 → 主题卡 → 交互模拟 | 小学/初中难度清晰分层 |
| 专项练习 | 按知识点和题型抽题 | 题目、判分器、解析一致 |
| 模拟竞赛 | 限时、题目导航、成绩总结 | 计时和评分边界覆盖测试 |
| 错题复习 | 错因/主题归档和重新练习 | 答题状态不被普通浏览覆盖 |
| 读报/朗读 | 语音播放、可暂停、移动端控制 | 浏览器不支持语音时有退化方案 |

## 3. 本轮实际落地
- 在学习进度卡片增加专项练习、模拟竞赛和错题复习三个入口。
- 保留年级切换、知识点地图、每日一题和现有六个主要功能入口。
- 题库修订时要求选项与解析一致；题目知识正确性不能由格式校验代替。

## 4. 后续重构要求
1. 建立题目证据表：题目 ID、标准答案、知识来源、更新时间、时效性说明。
2. 对会变化的知识（如卫星数量、行星发现、任务状态）加日期和来源，不写成永久常数。
3. 各题型共用统一答题状态协议，但评分规则分别测试。
4. 键盘、触摸、屏幕阅读器和语音朗读都应有可用交互。
5. 学习成就应奖励掌握和坚持，不仅奖励速度或首次答对。

## 5. 参考链接
- [Planet Explorer](https://github.com/mariotristan/planets)
- [Planet Explorer Quiz 实现](https://github.com/mariotristan/planets/blob/main/quiz.js)
- [Planet Explorer 交互与语音辅助](https://github.com/mariotristan/planets/blob/main/app.js)
- [Stellarium](https://github.com/Stellarium/stellarium)
