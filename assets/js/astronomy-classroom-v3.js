/* Astronomy classroom v3 · data-driven learning command center.
   Keeps the original question bank, grading, study records, simulation and interval-review flows. */
(function () {
  'use strict';
  let reviewQueueExpanded = false;
  function safe(value) {
    return typeof esc === 'function' ? esc(String(value == null ? '' : value)) :
      String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  window.renderAstronomyClassroom = function () {
    const currentLevel = state.level;
    const questions = Q.filter(question => question.level === currentLevel);
    const categories = getCategories(currentLevel);
    const stats = Store.getStats();
    const activePractice = Store.getActivePractice();
    const wrongRows = Store.getWrong();
    const questionById = new Map(Q.map(question => [question.id,question]));
    const now = Date.now();
    const dueWrong = wrongRows.filter(row => {
      const question = questionById.get(row.id);
      return question && question.level === currentLevel &&
        (!Number.isFinite(row.nextReviewAt) || row.nextReviewAt <= now);
    });
    const mastery = categories.map(category => ({category,score:getMastery(currentLevel,category)}));
    const touched = mastery.filter(item => item.score.answered > 0).length;
    const mastered = mastery.filter(item => item.score.answered >= 3 && item.score.rate >= 80).length;
    const needsWork = mastery.filter(item => item.score.answered >= 3 && item.score.rate < 80).length;
    const coverage = categories.length ? Math.round(touched/categories.length*100) : 0;
    const resumable = !!activePractice;
    const done = resumable ? activePractice.evaluated.filter(Boolean).length : 0;
    const percent = resumable && activePractice.questionIds.length ?
      Math.round(done/activePractice.questionIds.length*100) : 0;
    const oldHome = renderHome();
    const evidence = typeof window.getQuestionEvidenceSummary === 'function'
      ? window.getQuestionEvidenceSummary()
      : {loadState:'unavailable',total:Q.length,verified:0,reviewNeeded:Q.length,rejected:0,withSources:0,withoutSources:Q.length};
    const evidenceState = evidence.loadState === 'ready' ? 'INDEX LOADED · HUMAN REVIEW REQUIRED' : 'SOURCE INDEX NOT READY';
    const evidenceStatus = evidence.loadState === 'ready'
      ? (evidence.verified === evidence.total ? '已完成人工来源复核' : '尚未达到正式题库验收标准')
      : '来源索引暂不可用 · 所有题目按待核验处理';
    const pendingQuestions = evidence.loadState === 'ready'
      ? questions.filter(question => questionEvidenceById[question.id] &&
          questionEvidenceById[question.id].status === 'review-needed')
      : [];
    const reviewQueueRows = pendingQuestions.slice(0, 8).map(question => {
      const item = questionEvidenceById[question.id];
      const sourceLinks = item.sources.map(source => {
        const href = typeof safeQuestionEvidenceUrl === 'function' ? safeQuestionEvidenceUrl(source.url) : null;
        return href ? '<a href="'+safe(href)+'" target="_blank" rel="noopener noreferrer">'+
          safe(source.title)+' · '+safe(source.publisher || '官方资料')+'</a>' : '';
      }).filter(Boolean).join('');
      return '<details class="classroom-review-item"><summary><span>'+safe(question.id.toUpperCase())+
        ' · '+safe(question.category)+'</span><b>'+safe(question.stem)+'</b></summary>'+
        '<div class="classroom-review-item__body"><p><strong>标准答案（待核对）：</strong>'+safe(answerText(question))+'</p>'+
        '<p><strong>现有解析（待核对）：</strong>'+safe(question.explanation)+'</p>'+
        '<div class="classroom-review-item__sources"><strong>来源候选（不代表已验证）</strong>'+sourceLinks+'</div></div></details>';
    }).join('');
    const reviewQueue = '<div class="classroom-review-queue">' +
      '<button type="button" class="classroom-review-queue__toggle" data-question-review-toggle aria-expanded="'+
        String(reviewQueueExpanded)+'"><span>打开逐题复核队列</span><b>'+evidence.reviewNeeded+' 题待人工核验</b>'+
        '<i aria-hidden="true">'+(reviewQueueExpanded?'收起 −':'展开 +')+'</i></button>'+
      (reviewQueueExpanded
        ? '<div class="classroom-review-queue__content"><p>按当前学段展示最多 8 道待核验题目；完整 300 题仍保留在题库证据清单中。请逐项核对题干、答案、解析和来源，不能仅凭来源链接判定通过。</p>'+
          (evidence.loadState !== 'ready' ? '<p>证据索引暂不可用，无法生成逐题清单；所有题目继续按待核验处理。</p>' :
            (reviewQueueRows || '<p>当前学段没有待核验题目。</p>'))+
          '<small>此处为只读审阅视图，不会修改审核状态或把题目自动标记为已验证。</small></div>'
        : '')+'</div>';
    if (!document.documentElement.dataset.questionReviewQueueBound) {
      document.addEventListener('click', event => {
        const toggle = event.target.closest('[data-question-review-toggle]');
        if (!toggle) return;
        reviewQueueExpanded = !reviewQueueExpanded;
        render();
      });
      document.documentElement.dataset.questionReviewQueueBound = 'true';
    }
    const evidencePanel = '<section class="classroom-evidence" aria-label="题库来源与事实核验状态">' +
      '<div class="classroom-evidence__head"><div><span class="classroom-kicker">QUESTION BANK / EVIDENCE QUALITY</span>' +
      '<h3>题库来源与事实核验</h3><p>题库条目不会因挂载了 NASA / IAU 链接就自动视为正确；必须逐题核对题干、答案和解析。</p></div>' +
      '<span class="classroom-evidence__state">'+safe(evidenceState)+'</span></div>' +
      '<div class="classroom-evidence__metrics">' +
        '<article><span>题库总量</span><strong>'+evidence.total+'</strong><small>小学组 + 初中组</small></article>' +
        '<article><span>已人工复核</span><strong>'+evidence.verified+'</strong><small>可进入正式题库候选</small></article>' +
        '<article><span>来源待终审</span><strong>'+evidence.reviewNeeded+'</strong><small>含 '+evidence.withSources+' 条官方来源候选</small></article>' +
        '<article><span>尚无来源</span><strong>'+evidence.withoutSources+'</strong><small>须补权威出处或修订</small></article>' +
      '</div>'+reviewQueue+'<p class="classroom-evidence__note"><b>'+safe(evidenceStatus)+'</b>。在题目逐条复核完成前，练习结果只用于学习反馈，不作为正式竞赛成绩或知识认证。</p></section>';

    const modules = [
      {id:'learn',number:'01',icon:'✦',title:'知识星图',description:'按知识主题进入概念、图示、天体运动与动态模拟',action:'进入知识地图',tone:'sky'},
      {id:'practice',number:'02',icon:'⌁',title:'专项训练',description:'调用当前学段题库，按题型和知识点开展练习',action:'开始专项练习',tone:'violet'},
      {id:'exam',number:'03',icon:'◷',title:'竞赛模拟',description:'计时作答、自动阅卷与成绩复盘',action:'进入模拟竞赛',tone:'amber'},
      {id:'wrong',number:'04',icon:'↻',title:'间隔复习',description:dueWrong.length+' 道到期错题 · 按复习计划重新巩固',action:'复习薄弱知识',tone:'mint'},
      {id:'ai',number:'05',icon:'⌘',title:'知识助教',description:'围绕本地知识库提问；答案仍需教材与可靠资料核对',action:'打开知识助教',tone:'blue'},
      {id:'news',number:'06',icon:'◎',title:'天文观测站',description:'天文资讯、读报与观测知识拓展',action:'进入观测站',tone:'rose'}
    ];
    const moduleHtml = modules.map(item =>
      '<button type="button" class="classroom-module classroom-module--'+item.tone+'" data-classroom-module="'+item.id+'" onclick="'+
      (item.id === 'practice' ? "startPractice('"+currentLevel+"','')" :
       item.id === 'exam' ? "startExam('"+currentLevel+"')" : "go('"+item.id+"')")+'">' +
      '<span class="classroom-module__number">'+item.number+'</span><span class="classroom-module__icon">'+item.icon+'</span>' +
      '<strong>'+item.title+'</strong><small>'+item.description+'</small><b>'+item.action+' ↗</b></button>'
    ).join('');

    const metrics = [
      ['题库规模',questions.length,'当前学段可用题目'],
      ['知识主题',categories.length,'当前学段知识点'],
      ['已覆盖主题',touched+' / '+categories.length,'覆盖率 '+coverage+'%'],
      ['到期错题',dueWrong.length,'进入间隔复习队列']
    ].map((item,index)=>'<article class="classroom-metric classroom-metric--'+index+'"><span>'+item[0]+'</span><strong>'+item[1]+'</strong><small>'+item[2]+'</small></article>').join('');

    const levelButtons = ['小学','初中'].map(level =>
      '<button type="button" class="classroom-level '+(level===currentLevel?'active':'')+'" aria-pressed="'+(level===currentLevel)+'" onclick="switchLevel(\''+level+'\')">'+level+'组</button>'
    ).join('');

    const session = resumable ?
      '<section class="classroom-resume"><div><span class="classroom-kicker">SESSION RECOVERY</span><strong>继续上次练习</strong><small>'+safe(activePractice.label)+' · '+safe(activePractice.level)+'组 · 已答 '+done+' / '+activePractice.questionIds.length+' 题</small></div>'+
      '<div class="classroom-resume__progress"><b>'+percent+'%</b><i><span style="width:'+percent+'%"></span></i></div>'+
      '<button type="button" onclick="resumePractice()">继续 ↗</button></section>' :
      '<section class="classroom-resume is-idle"><div><span class="classroom-kicker">NEXT STUDY SESSION</span><strong>开始今天的学习任务</strong><small>按知识点掌握、答题统计和到期复习计划安排下一步。</small></div>'+
      '<button type="button" onclick="startPractice(\''+currentLevel+'\',\'\')">开始练习 ↗</button></section>';

    const qStats = Store.getQStats();
    const topicRows = mastery.map(item => {
      const topicQuestions = questions.filter(question => question.category === item.category);
      const attemptedQuestions = topicQuestions.filter(question =>
        qStats[question.id] && Number(qStats[question.id].t) > 0
      ).length;
      const dueCount = dueWrong.filter(row => {
        const question = questionById.get(row.id);
        return question && question.category === item.category;
      }).length;
      let stateKey = 'new';
      let stateLabel = '尚未开始';
      if (item.score.answered >= 3 && item.score.rate < 80) {
        stateKey = 'needs-work';
        stateLabel = '需要强化';
      } else if (item.score.answered >= 3 && item.score.rate >= 80) {
        stateKey = 'steady';
        stateLabel = '阶段稳定';
      } else if (item.score.answered > 0) {
        stateKey = 'warming';
        stateLabel = '继续积累';
      }
      const coveragePct = topicQuestions.length
        ? Math.round(attemptedQuestions / topicQuestions.length * 100) : 0;
      const uniqueLabel = attemptedQuestions + ' / ' + topicQuestions.length + ' 题有作答记录';
      const accuracyLabel = item.score.answered
        ? '作答正确率 ' + item.score.rate + '%' : '正确率待积累';
      return {
        category:item.category,
        stateKey,stateLabel,
        dueCount,
        coveragePct,
        uniqueLabel,
        accuracyLabel,
        total:topicQuestions.length
      };
    });
    const topicMap = '<section class="classroom-topic-map" aria-label="按真实作答记录计算的知识主题掌握地图">' +
      '<div class="classroom-section-head"><div><span class="classroom-kicker">TOPIC MASTERY / NEXT BEST ACTION</span>' +
        '<h3>知识主题掌握地图</h3><p>按本机作答统计与到期错题安排下一步；未开始主题保持未知，不推算掌握度。</p></div>' +
        '<div class="classroom-topic-map__legend"><span class="is-needs">需要强化</span><span class="is-steady">阶段稳定</span><span class="is-new">尚未开始</span></div></div>' +
      '<div class="classroom-topic-map__grid">' +
      topicRows.map(row =>
        '<article class="classroom-topic-card '+row.stateKey+'" data-topic-state="'+row.stateKey+'">' +
          '<div class="classroom-topic-card__top"><strong>'+safe(row.category)+'</strong><span class="classroom-topic-card__state">'+row.stateLabel+'</span></div>' +
          '<div class="classroom-topic-card__meta"><span>'+row.uniqueLabel+'</span><span>'+row.accuracyLabel+'</span></div>' +
          '<div class="classroom-topic-card__track" role="img" aria-label="'+safe(row.category)+'，有作答记录题目覆盖 '+row.coveragePct+'%"><i style="width:'+row.coveragePct+'%"></i></div>' +
          '<div class="classroom-topic-card__foot"><span>'+(row.dueCount ? row.dueCount+' 道到期错题' : (row.stateKey === 'new' ? '等待首次作答' : '暂无到期错题'))+'</span>' +
          '<button type="button" data-classroom-topic="'+safe(row.category)+'" aria-label="练习知识主题 '+safe(row.category)+'">专项练习 ↗</button></div>' +
        '</article>'
      ).join('') +
      '</div><p class="classroom-topic-map__note">覆盖率表示当前学段中至少作答过一次的题目比例；正确率按本机已批改作答次数计算，两者含义不同。</p></section>';

    if (!document.documentElement.dataset.classroomTopicActionsBound) {
      document.addEventListener('click', event => {
        const button = event.target.closest('[data-classroom-topic]');
        if (!button) return;
        const category = button.getAttribute('data-classroom-topic');
        if (!category) return;
        startPractice(state.level, category);
      });
      document.documentElement.dataset.classroomTopicActionsBound = 'true';
    }

    const inspector = '<aside class="classroom-inspector" aria-label="本机学习上下文与题库证据检查器">' +
      '<section class="classroom-inspector-card"><span class="classroom-kicker">LEARNING CONTEXT / LOCAL RECORDS</span>' +
        '<h3>当前学习上下文</h3><div class="classroom-inspector-level">'+safe(currentLevel)+'组 · 本机记录</div>' +
        '<div class="classroom-inspector-stat"><span>累计答题</span><strong>'+stats.total+'</strong></div>' +
        '<div class="classroom-inspector-stat"><span>已覆盖知识主题</span><strong>'+touched+' / '+categories.length+'</strong></div>' +
        '<div class="classroom-inspector-stat"><span>到期错题</span><strong>'+dueWrong.length+'</strong></div>' +
        '<div class="classroom-inspector-stat"><span>当前练习</span><strong>'+(resumable?percent+'%':'未开始')+'</strong></div>' +
        '<p>未作答的知识主题保持未知，不自动记为掌握；进度仅来自当前浏览器保存的作答记录。</p></section>' +
      '<section class="classroom-inspector-card"><span class="classroom-kicker">QUESTION BANK / REVIEW GATE</span>' +
        '<h3>题库质量闸门</h3><div class="classroom-inspector-status">'+safe(evidenceStatus)+'</div>' +
        '<div class="classroom-inspector-stat"><span>题目总量</span><strong>'+evidence.total+'</strong></div>' +
        '<div class="classroom-inspector-stat"><span>人工复核完成</span><strong>'+evidence.verified+'</strong></div>' +
        '<div class="classroom-inspector-stat"><span>待核验</span><strong>'+evidence.reviewNeeded+'</strong></div>' +
        '<p>'+safe(evidenceState)+'。官方来源链接不等于题干、答案和解析已经过审。</p></section>' +
      '<section class="classroom-inspector-card"><span class="classroom-kicker">QUICK ACTIONS</span><h3>继续学习</h3>' +
        (resumable?'<button type="button" class="classroom-inspector-action" onclick="resumePractice()">▶ 继续上次练习 <b>↗</b></button>':'<button type="button" class="classroom-inspector-action" onclick="startPractice(\''+currentLevel+'\',\'\')">＋ 开始专项练习 <b>↗</b></button>') +
        '<button type="button" class="classroom-inspector-action" onclick="startExam(\''+currentLevel+'\')">计时竞赛模拟 <b>↗</b></button>' +
        '<button type="button" class="classroom-inspector-action" onclick="go(\'wrong\')">到期错题复习 <b>↗</b></button>' +
        '<a class="classroom-inspector-action" href="#nasaExoplanetExplorer">NASA 系外行星数据 ↗</a></section>' +
      '<section class="classroom-inspector-card classroom-inspector-card--note"><span class="classroom-kicker">DATA BOUNDARY</span>' +
        '<h3>数据来源边界</h3><p>个人学习数据来自本机记录；NASA TAP 仅提供公开天文数据查询，不作为题库答案正确性的自动证明。</p></section></aside>';

    return '<section class="astronomy-classroom" aria-label="天文竞赛学习指挥台"><div class="classroom-primary">' +
      '<header class="classroom-hero"><div class="classroom-hero__copy"><span class="classroom-kicker">ASTRONOMY / LEARN / PRACTICE / OBSERVE</span>' +
      '<h2>星赛通 · 天文学习指挥台</h2><p>从知识地图到专项训练、竞赛模拟与错题复盘，围绕真实本机学习记录安排学习路径。</p>' +
      '<div class="classroom-hero__actions"><button type="button" onclick="go(\'learn\')">探索知识星图 ↗</button><button type="button" onclick="startExam(\''+currentLevel+'\')">开始竞赛模拟</button></div></div>' +
      '<div class="classroom-hero__orb" aria-hidden="true"><span class="orbit orbit-a"></span><span class="orbit orbit-b"></span><span class="planet planet-main">✦</span><span class="planet planet-small">•</span><b>SKY<br>LAB</b></div></header>' +
      evidencePanel +
      '<section class="nasa-exoplanet-explorer" id="nasaExoplanetExplorer" aria-label="NASA 官方系外行星数据">' +
        '<div class="nasa-exoplanet-explorer__head"><div><span class="classroom-kicker">NASA EXOPLANET ARCHIVE / LIVE DATA</span>' +
          '<h3>全球系外行星数据</h3><p>只读读取 NASA Exoplanet Archive 的行星综合参数表；数据源、查询时间和缺失值均保留，不作为题库答案。</p></div>' +
          '<div class="nasa-exoplanet-explorer__actions"><button type="button" data-nasa-exoplanet-load>读取最新公开数据</button>' +
          '<a href="https://exoplanetarchive.ipac.caltech.edu/" target="_blank" rel="noopener noreferrer">NASA 官方数据站 ↗</a></div></div>' +
        '<div class="nasa-exoplanet-explorer__meta"><span data-nasa-exoplanet-state aria-live="polite">尚未请求数据 · 点击后从 NASA TAP 读取</span>' +
          '<span>来源：Planetary Systems Composite Parameters · 单位按官方列定义</span></div>' +
        '<div class="nasa-exoplanet-explorer__table-wrap" data-nasa-exoplanet-results>' +
          '<div class="nasa-exoplanet-explorer__empty">尚未载入外部数据。网络请求失败时可通过官方 CSV 链接下载；不会以样例数值填充。</div></div>' +
        '<div class="nasa-exoplanet-explorer__foot"><a data-nasa-exoplanet-json target="_blank" rel="noopener noreferrer">打开 NASA TAP JSON 查询 ↗</a>' +
          '<a data-nasa-exoplanet-csv target="_blank" rel="noopener noreferrer">下载官方 CSV ↗</a>' +
          '<span>检索字段：行星、宿主恒星、发现方法、发现年份、半径、质量、轨道周期、距离</span></div>' +
      '</section>' +
      '<section class="classroom-control"><div class="classroom-control__title"><div><span class="classroom-kicker">YOUR LEARNING PROFILE</span><strong>学习计划与学段</strong><small>进度来自本机已保存作答；未作答知识点不会被标记为掌握。</small></div><div class="classroom-levels">'+levelButtons+'</div></div>' +
      '<div class="classroom-metrics">'+metrics+'</div></section>' +
      session +
      topicMap +
      '<section class="classroom-module-section"><div class="classroom-section-head"><div><span class="classroom-kicker">LEARNING PATH</span><h3>学习工作区</h3><p>选择当前需要执行的学习任务，所有入口连接现有题库、阅卷、模拟与学习记录。</p></div><span class="classroom-path-badge">'+mastered+' 个主题稳定掌握</span></div>' +
      '<div class="classroom-module-grid">'+moduleHtml+'</div></section>' +
      '<section class="classroom-progress-panel"><div class="classroom-section-head"><div><span class="classroom-kicker">LOCAL LEARNING RECORDS</span><h3>学习表现与复习安排</h3><p>只展示本机已有作答记录；空白记录不作推断。</p></div></div>' +
      '<div class="classroom-progress-grid"><div><span>累计答题</span><strong>'+stats.total+'</strong><small>本机学习记录</small></div><div><span>正确率</span><strong>'+stats.rate+'%</strong><small>基于已批改答案</small></div><div><span>学习天数</span><strong>'+stats.days+'</strong><small>本机活动记录</small></div><div><span>需强化主题</span><strong>'+needsWork+'</strong><small>至少 3 次作答且正确率低于 80%</small></div></div></section>' +
      '<section class="classroom-existing-learning" aria-label="详细学习内容">'+oldHome+'</section>' +
      '</div>' + inspector + '</section>';
  };

  // Existing application render() uses this explicit hook for the home route.
  // The original home markup remains mounted below the new command surface so the topic map,
  // daily question, question bank controls and legacy learning flows are retained.
  if (typeof window.go === 'function') window.go('home');
})();