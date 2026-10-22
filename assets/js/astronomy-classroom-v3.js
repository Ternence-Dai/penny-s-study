/* Astronomy classroom v3 · data-driven learning command center.
   Keeps the original question bank, grading, study records, simulation and interval-review flows. */
(function () {
  'use strict';
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
    const evidencePanel = '<section class="classroom-evidence" aria-label="题库来源与事实核验状态">' +
      '<div class="classroom-evidence__head"><div><span class="classroom-kicker">QUESTION BANK / EVIDENCE QUALITY</span>' +
      '<h3>题库来源与事实核验</h3><p>题库条目不会因挂载了 NASA / IAU 链接就自动视为正确；必须逐题核对题干、答案和解析。</p></div>' +
      '<span class="classroom-evidence__state">'+safe(evidenceState)+'</span></div>' +
      '<div class="classroom-evidence__metrics">' +
        '<article><span>题库总量</span><strong>'+evidence.total+'</strong><small>小学组 + 初中组</small></article>' +
        '<article><span>已人工复核</span><strong>'+evidence.verified+'</strong><small>可进入正式题库候选</small></article>' +
        '<article><span>来源待终审</span><strong>'+evidence.reviewNeeded+'</strong><small>含 '+evidence.withSources+' 条官方来源候选</small></article>' +
        '<article><span>尚无来源</span><strong>'+evidence.withoutSources+'</strong><small>须补权威出处或修订</small></article>' +
      '</div><p class="classroom-evidence__note"><b>'+safe(evidenceStatus)+'</b>。在题目逐条复核完成前，练习结果只用于学习反馈，不作为正式竞赛成绩或知识认证。</p></section>';

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

    return '<section class="astronomy-classroom" aria-label="天文竞赛学习指挥台">' +
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
      '<section class="classroom-module-section"><div class="classroom-section-head"><div><span class="classroom-kicker">LEARNING PATH</span><h3>学习工作区</h3><p>选择当前需要执行的学习任务，所有入口连接现有题库、阅卷、模拟与学习记录。</p></div><span class="classroom-path-badge">'+mastered+' 个主题稳定掌握</span></div>' +
      '<div class="classroom-module-grid">'+moduleHtml+'</div></section>' +
      '<section class="classroom-progress-panel"><div class="classroom-section-head"><div><span class="classroom-kicker">LOCAL LEARNING RECORDS</span><h3>学习表现与复习安排</h3><p>只展示本机已有作答记录；空白记录不作推断。</p></div></div>' +
      '<div class="classroom-progress-grid"><div><span>累计答题</span><strong>'+stats.total+'</strong><small>本机学习记录</small></div><div><span>正确率</span><strong>'+stats.rate+'%</strong><small>基于已批改答案</small></div><div><span>学习天数</span><strong>'+stats.days+'</strong><small>本机活动记录</small></div><div><span>需强化主题</span><strong>'+needsWork+'</strong><small>至少 3 次作答且正确率低于 80%</small></div></div></section>' +
      '<section class="classroom-existing-learning" aria-label="详细学习内容">'+oldHome+'</section>' +
      '</section>';
  };

  // Existing application render() uses this explicit hook for the home route.
  // The original home markup remains mounted below the new command surface so the topic map,
  // daily question, question bank controls and legacy learning flows are retained.
  if (typeof window.go === 'function') window.go('home');
})();