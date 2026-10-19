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


## 6. 2026-10-19 实施补充：可安装与离线学习（Planet Explorer 模式）

- 新增 `manifest.webmanifest`、本地 SVG 图标和 `service-worker.js`，页面在 HTTPS 环境加载后注册 service worker。
- 首次联网访问时缓存首页、当前 V6 产品样式、300 题题库、判分引擎和主应用；离线导航使用缓存首页回退。
- Service worker 只处理同源 GET 请求，不拦截写入请求或第三方接口，并在激活新缓存时清理旧版本。
- 新增 `scripts/validate-pwa.cjs` 并加入 standalone CI，验证 manifest、图标、缓存清单、离线导航与请求边界。
- 离线模式不会自动同步不同设备的本地学习记录；localStorage 进度仍限于当前浏览器/设备。


## 7. 扩展开源对标：天文探索、行星知识与学习反馈

> 覆盖说明：天文竞赛题库和实时星空软件不是同一种产品。这里分别参考任务式学习、天体探索与观测情境，不将天文观测软件误当成题库系统。

| 上游项目 | 可核查入口 | 可迁移模式 | 不直接照搬的部分 |
|---|---|---|---|
| [Planet Explorer](https://github.com/mariotristan/planets) | [Quiz 交互](https://github.com/mariotristan/planets/blob/main/quiz.js)、[应用流程](https://github.com/mariotristan/planets/blob/main/app.js) | 探索/比较/测验任务、即时反馈、儿童友好阅读节奏、语音与本地进度 | 题量和年龄段较小，不能替代本项目多题型竞赛评分规则 |
| [Stellarium](https://github.com/Stellarium/stellarium) | [主仓库与功能说明](https://github.com/Stellarium/stellarium) | 天空对象、星图场景、观测时间/位置语境，帮助把抽象对象放进天空环境 | 桌面星象软件，不是线上竞赛练习或知识库 |
| [Celestia](https://github.com/CelestiaProject/Celestia) | [README 与导航交互说明](https://github.com/CelestiaProject/Celestia/blob/master/README.md) | 3D 空间漫游、轨道/尺度探索、对象信息随视角变化 | 原生桌面 3D 模拟器；当前网站不声称具有等同精度或完整 3D 天体引擎 |
| [InteractiveSolarSystem](https://github.com/StefVuck/InteractiveSolarSystem) | [README / React Three Fiber 交互](https://github.com/StefVuck/InteractiveSolarSystem) | 浏览器 3D 行星导航、卫星/行星详情页、轨道可视化、移动端响应式交互 | 项目自述的科学精度需独立验证；不能仅凭视觉效果认定轨道数据准确 |
| [Solar-Wanderer](https://github.com/hyqzz/Solar-Wanderer) | [README / NASA JPL 星历说明](https://github.com/hyqzz/Solar-Wanderer) | 浏览器端尺度探索、实时天体位置数据源说明、桌面与触屏交互；作为观测数据接入候选 | README 所述 JPL 精度是上游项目自述，本项目未独立复算；必须先核对数据 API、历元、坐标系和误差再采用 |

### 对本项目的实现映射
- 首页提供“知识学习 → 知识问答 → 天文读报 → 错题复盘”学习路径，并连接原学习/判分/语音/错题模块。
- 下一阶段将每道题绑定知识来源、更新时间、适用年级和时效标记；动态天文数据必须附时间，不把可能变化的数量写成永久事实。
- 模拟竞赛与普通练习使用同一套题目身份和判分协议，但计时、空题、重复提交与多选部分得分分别测试。
- 对星图/空间漫游只做经过验证的数据和轻量交互，不以静态插画冒充精确星图。
