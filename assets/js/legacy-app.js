
/* ==========================================
   全局错误保护
   ========================================== */
window.addEventListener('error', function(e){
  console.error('[星赛通]', e.message);
  var v = document.getElementById('view');
  if (v && (!v.innerHTML || v.innerHTML.trim() === '')){
    v.innerHTML = '<div class="card"><div class="title">加载出错了</div><div class="sub">' + esc(e.message) + '</div></div>';
  }
});

/* ==========================================
   动态星空背景
   ========================================== */
(function(){
  var c = document.getElementById('starsBg'), x = c.getContext('2d');
  var stars = [], w, h, dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize(){
    w = window.innerWidth; h = window.innerHeight;
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function init(){
    stars = [];
    var n = Math.floor(w * h / 6500);
    for (var i = 0; i < n; i++){
      stars.push({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.3 + 0.3, a: Math.random() * 0.7 + 0.2,
        da: (Math.random() - 0.5) * 0.015,
        vx: (Math.random() - 0.5) * 0.06, vy: (Math.random() - 0.5) * 0.06
      });
    }
  }
  function draw(){
    x.clearRect(0, 0, w, h);
    for (var i = 0; i < stars.length; i++){
      var s = stars[i];
      s.a += s.da;
      if (s.a < 0.1 || s.a > 0.95) s.da = -s.da;
      s.x += s.vx; s.y += s.vy;
      if (s.x < 0) s.x = w; if (s.x > w) s.x = 0;
      if (s.y < 0) s.y = h; if (s.y > h) s.y = 0;
      x.globalAlpha = s.a;
      x.beginPath(); x.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      x.fillStyle = '#fff'; x.fill();
    }
    x.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  resize(); init(); draw();
  window.addEventListener('resize', function(){ resize(); init(); });
})();

/* ==========================================
   工具函数
   ========================================== */
var $ = function(s){ return document.querySelector(s); };
var LETTERS = ['A','B','C','D','E','F'];
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
function rate(a,b){return b?Math.round(a/b*100):0;}
function fmtTime(s){return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function norm(s){return String(s==null?'':s).trim().toLowerCase().replace(/[\s，,。.、；;：:！!？?"'"'（）()]/g,'').replace(/[°º]/g,'度').replace(/[′']/g,'分').replace(/[″"]/g,'秒');}

/* ==========================================
   存储
   ========================================== */
var KEY = {wrong:'a_w_v6',record:'a_r_v6',days:'a_d_v6',qstats:'a_q_v6',ai:'a_ai_v6',prefs:'a_prefs_v6'};
// Fail closed: if browser storage becomes unavailable, never replace existing learning data with fallback defaults.
var storageRecoveryRequired = false;
function safeStorageGet(key){try{var value=localStorage.getItem(key);if(value!==null){try{JSON.parse(value);}catch(parseError){storageRecoveryRequired=true;console.warn('本地学习数据格式损坏，已暂停写入以保护原始记录',parseError);}}return value;}catch(e){storageRecoveryRequired=true;console.warn('本地存储读取失败，已暂停后续写入以保护学习记录',e);return null;}}
function safeStorageSet(key,value){if(storageRecoveryRequired){console.warn('学习记录写入已暂停：请先恢复浏览器本地存储');return false;}try{localStorage.setItem(key,value);return true;}catch(e){storageRecoveryRequired=true;console.warn('本地存储写入失败，已暂停后续写入以保护学习记录',e);return false;}}
function safeStorageRemove(key){if(storageRecoveryRequired){console.warn('学习记录删除已暂停：请先恢复浏览器本地存储');return false;}try{localStorage.removeItem(key);return true;}catch(e){storageRecoveryRequired=true;console.warn('本地存储删除失败，已暂停后续写入以保护学习记录',e);return false;}}
function safeStorageJSON(key,fallback,validator){
  var raw=safeStorageGet(key);
  if(raw===null)return fallback;
  try{
    var value=JSON.parse(raw);
    if(typeof validator==='function'&&!validator(value)){
      storageRecoveryRequired=true;
      console.warn('本地学习数据结构异常，已暂停写入以保护原始记录：'+key);
      return fallback;
    }
    return value;
  }catch(e){return fallback;}
}
function isStorageRecord(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function isWrongStorageList(value){
  return Array.isArray(value)&&value.every(function(item){
    return isStorageRecord(item)&&
      ((typeof item.id==='string'&&item.id.length>0)||(typeof item.id==='number'&&Number.isSafeInteger(item.id)))&&
      Number.isSafeInteger(item.count)&&item.count>=1&&Number.isFinite(item.lastTime)&&item.lastTime>=0;
  });
}
function isQuestionStatsStorage(value){
  return isStorageRecord(value)&&Object.keys(value).every(function(key){
    var item=value[key];
    return isStorageRecord(item)&&Number.isSafeInteger(item.t)&&item.t>=0&&
      Number.isSafeInteger(item.c)&&item.c>=0&&item.c<=item.t&&
      Number.isFinite(item.last)&&item.last>=0;
  });
}
function isPracticeRecordStorage(value){
  return Array.isArray(value)&&value.every(function(item){
    return isStorageRecord(item)&&typeof item.mode==='string'&&
      Number.isFinite(item.total)&&item.total>=0&&
      Number.isFinite(item.correct)&&item.correct>=0&&item.correct<=item.total&&
      Number.isFinite(item.time)&&item.time>=0;
  });
}
function isStudyDayStorage(value){
  return Array.isArray(value)&&value.every(function(item){return typeof item==='string'&&item.trim().length>0;});
}
function isAIConversationStorage(value){
  return Array.isArray(value)&&value.every(function(item){
    return isStorageRecord(item)&&['user','bot'].includes(item.role)&&typeof item.text==='string';
  });
}
function isPreferenceStorage(value){
  if(!isStorageRecord(value))return false;
  if(value.speed!==undefined&&(!Number.isFinite(value.speed)||value.speed<0.6||value.speed>1.8))return false;
  if(value.volume!==undefined&&(!Number.isFinite(value.volume)||value.volume<0.3||value.volume>1))return false;
  if(value.pitch!==undefined&&(!Number.isFinite(value.pitch)||value.pitch<0.7||value.pitch>1.4))return false;
  if(value.aiModel!==undefined&&!['general','quiz','explain','exam'].includes(value.aiModel))return false;
  return Object.keys(value).every(function(key){
    return ['speed','volume','pitch','aiModel'].includes(key);
  });
}

var Store = {
  getWrong:function(){return safeStorageJSON(KEY.wrong,[],isWrongStorageList);},
  addWrong:function(id){var l=this.getWrong(),i=-1;for(var k=0;k<l.length;k++)if(l[k].id===id){i=k;break;}if(i>=0){l[i].count++;l[i].lastTime=Date.now();}else l.push({id:id,count:1,lastTime:Date.now()});safeStorageSet(KEY.wrong,JSON.stringify(l));},
  removeWrong:function(id){safeStorageSet(KEY.wrong,JSON.stringify(this.getWrong().filter(function(i){return i.id!==id;})));},
  clearWrong:function(){safeStorageRemove(KEY.wrong);},
  getQStats:function(){return safeStorageJSON(KEY.qstats,{},isQuestionStatsStorage);},
  bumpQStat:function(id,ok){var s=this.getQStats();if(!s[id])s[id]={t:0,c:0};s[id].t++;if(ok)s[id].c++;s[id].last=Date.now();safeStorageSet(KEY.qstats,JSON.stringify(s));},
  addRecord:function(r){var l=safeStorageJSON(KEY.record,[],isPracticeRecordStorage);l.push(Object.assign({},r,{time:Date.now()}));if(l.length>500)l=l.slice(l.length-500);safeStorageSet(KEY.record,JSON.stringify(l));var d=safeStorageJSON(KEY.days,[],isStudyDayStorage);var td=new Date().toDateString();if(d.indexOf(td)<0){d.push(td);safeStorageSet(KEY.days,JSON.stringify(d));}},
  getStats:function(){var r=safeStorageJSON(KEY.record,[],isPracticeRecordStorage),d=safeStorageJSON(KEY.days,[],isStudyDayStorage);var t=0,c=0;r.forEach(function(x){t+=(x.total||0);c+=(x.correct||0);});return{total:t,correct:c,rate:rate(c,t),sessions:r.length,days:d.length,wrongCount:this.getWrong().length};},
  clearAll:function(){['wrong','record','days','qstats'].forEach(function(k){safeStorageRemove(KEY[k]);});},
  getAI:function(){return safeStorageJSON(KEY.ai,[],isAIConversationStorage);},
  saveAI:function(l){if(l.length>50)l=l.slice(l.length-50);safeStorageSet(KEY.ai,JSON.stringify(l));},
  clearAI:function(){safeStorageRemove(KEY.ai);},
  getPrefs:function(){return safeStorageJSON(KEY.prefs,{speed:1,volume:1,pitch:1.05,aiModel:'general'},isPreferenceStorage);},
  savePrefs:function(p){
    if(!isPreferenceStorage(p)){
      console.warn('拒绝保存越界或未知的学习偏好设置；现有偏好保持不变');
      return false;
    }
    return safeStorageSet(KEY.prefs,JSON.stringify(p));
  }
};

/* ==========================================
   知识卡片（含模拟器 ID）
   ========================================== */
var KNOWLEDGE = [
{id:'k_ss',level:'小学',category:'太阳系',icon:'敖',title:'太阳系大家庭',sim:'solar',content:'【八大行星顺序】由近到远：\n水星→金星→地球→火星→木星→土星→天王星→海王星\n\n【分类】\n· 类地行星：水、金、地、火（岩石）\n· 巨行星：木、土（气态）\n· 远日行星：天王、海王（冰质）\n\n【记住】最大木星、最小水星、最热金星、环最美土星。'},
{id:'k_phase',level:'小学',category:'月相',icon:'',title:'月相变化规律',sim:'moonPhase',content:'【顺序】新月→上弦月→满月→下弦月→新月\n\n【口诀】上上上西西，下下下东东\n· 上弦月：上半夜、西边、亮面朝西\n· 下弦月：下半夜、东边、亮面朝东\n\n【时间】初一新月、初七八上弦、十五六满月、廿二三下弦。\n\n【周期】朔望月约29.53天。'},
{id:'k_star_map',level:'小学',category:'星座',icon:'⭐',title:'认识星空',sim:'starMap',content:'【找北极星】\n1. 找北斗七星\n2. 勺头两星连线\n3. 朝勺口延长约5倍\n\n【重要】\n· 北极星地平高度≈观测者纬度\n· 北极星不是最亮的星（天狼星最亮）\n· 冬季代表：猎户座（腰带三星）\n· 夏季代表：天蝎座、天琴座、天鹅座'},
{id:'k_star',level:'小学',category:'恒星',icon:'☀️',title:'恒星是什么',sim:'spectrum',content:'【定义】自身能发光发热、内部进行核聚变的天体。\n\n【太阳】距地球最近，约1.5亿千米\n【比邻星】距太阳最近，约4.22光年\n【天狼星】夜空最亮，视星等-1.46\n\n【恒星/行星/卫星】\n· 恒星：自己发光\n· 行星：反射光，绕恒星\n· 卫星：反射光，绕行星\n\n【寿命】主序星阶段约90%。'},
{id:'k_eclipse',level:'小学',category:'日食月食',icon:'',title:'日食与月食',sim:'eclipse',content:'【日食】太阳→月球→地球\n· 农历初一（朔）发生\n· 分日全食、日偏食、日环食\n\n【月食】太阳→地球→月球\n· 农历十五前后（望）发生\n· 分月全食、月偏食、半影月食\n· 没有"月环食"\n\n【为何不是每月都有】\n白道与黄道有约5°09′夹角。'},
{id:'k_motion',level:'小学',category:'天体运动',icon:'',title:'地球的运动',sim:'earth',content:'【自转】\n· 绕地轴，自西向东\n· 周期约24小时\n· 产生昼夜交替\n\n【公转】\n· 绕太阳，自西向东\n· 周期约365.2422天\n· 产生四季变化\n\n【节气】\n春分3.21、夏至6.22、秋分9.23、冬至12.22。'},
{id:'k_moon',level:'小学',category:'月球',icon:'',title:'月球小档案',sim:'moonPhase',content:'【基本】\n· 地球唯一的天然卫星\n· 平均距离约38.4万千米\n· 直径约3476千米\n· 表面重力约为地球1/6\n\n【表面】\n· 无大气 → 昼夜温差大（+120~-180℃）\n· 无声音、天空漆黑\n· 环形山（陨石撞击）、月海（火山平原）\n\n【探月】1969阿波罗11号首次登月。'},
{id:'k_galaxy',level:'小学',category:'星系',icon:'',title:'银河系与宇宙',sim:'galaxy',content:'【银河系】\n· 棒旋星系，直径约10万光年\n· 恒星约1000~4000亿颗\n· 太阳距银心约2.6万光年\n\n【河外星系】\n· 仙女座星系M31：约254万光年\n· 大麦哲伦云、小麦哲伦云\n\n【宇宙】\n本星系群直径约1000万光年，可观测宇宙直径约930亿光年。'},
{id:'k_tele',level:'小学',category:'望远镜',icon:'',title:'天文望远镜入门',sim:'telescope',content:'【核心】不是放大，而是"聚光"！\n口径越大 → 聚光能力越强\n\n【两种基本类型】\n· 折射式：用凸透镜作物镜\n· 反射式：用凹面镜作物镜\n\n【放大倍率】\n= 物镜焦距 ÷ 目镜焦距\n有效倍率上限 ≈ 口径(mm) × 2\n\n【安全】观测太阳必须使用专用滤光片！'},
{id:'k_meteor',level:'小学',category:'流星',icon:'☄️',title:'流星与流星雨',sim:'meteor',content:'【流星】\n流星体高速进入地球大气层，与大气摩擦生热发光。\n\n【火流星】特别明亮的流星\n【陨石】未烧尽落到地面的残骸\n\n【流星雨】\n地球穿过彗星轨道遗留的尘埃带时形成。\n\n【著名】英仙座（8月）、双子座（12月）、象限仪座（1月）。'},
{id:'k_sun',level:'小学',category:'太阳',icon:'☀️',title:'太阳活动',sim:'sunStruct',content:'【太阳黑子】\n· 太阳活动的基本标志\n· 温度比周围低约1500℃\n· 变化周期约11年\n\n【其他活动】\n· 耀斑：太阳大气突然释放巨大能量\n· 日珥：太阳边缘喷出的巨大气体\n· 太阳风：太阳向外吹出的带电粒子流\n\n【影响】极光、干扰通信、影响卫星。'},
{id:'k_unit',level:'小学',category:'天文单位',icon:'',title:'天文距离单位',sim:'lightyear',content:'【天文单位 AU】\n1 AU ≈ 1.496亿千米 = 地日平均距离\n\n【光年 ly】\n1 光年 ≈ 9.46万亿千米\n\n【秒差距 pc】\n1 秒差距 ≈ 3.26光年 ≈ 206265 AU\n\n【大小】秒差距 > 光年 > 天文单位'},
{id:'k_history',level:'小学',category:'天文史',icon:'',title:'航天与天文史',sim:'rocket',content:'【世界】\n· 1961 加加林首次进入太空\n· 1969 阿姆斯特朗首次登月\n\n【中国】\n· 2003 杨利伟乘神舟五号\n· 2008 翟志刚首次太空行走\n· 2016 FAST"中国天眼"落成\n· 2020 嫦娥五号月球采样返回\n· 2021 天问一号着陆火星'},
{id:'k_j_coord',level:'初中',category:'天球坐标',icon:'吝',title:'天球坐标系统',sim:'coord',content:'【天球】以观测者为球心的假想球面。\n\n【地平坐标】\n· 基圈：地平圈\n· 分量：方位角A + 地平高度h\n· 随观测地点和时间变化\n\n【赤道坐标】\n· 基圈：天赤道\n· 分量：赤经α + 赤纬δ\n· 与地点、时间无关\n\n【赤经】自春分点起算，1h=15°\n【赤纬】自天赤道起算，北正南负\n【北天极地平高度】= 观测者地理纬度'},
{id:'k_j_evo',level:'初中',category:'恒星演化',icon:'',title:'恒星演化路径',sim:'evolution',content:'【小质量恒星（< 8 倍太阳质量）】\n分子云 → 主序星 → 红巨星 → 行星状星云 → 白矮星\n太阳最终成为白矮星\n\n【大质量恒星（> 8 倍太阳质量）】\n分子云 → 主序星 → 红超巨星 → 超新星爆发\n→ 中子星（1.4~3 倍太阳质量）\n→ 黑洞（> 3 倍太阳质量）\n\n【主序星】恒星一生最长的阶段（约占90%）。'},
{id:'k_j_mag',level:'初中',category:'星等',icon:'',title:'星等与光度',sim:'hr',content:'【视星等 m】肉眼看到的亮度，越小越亮\n太阳-26.7、满月-12.7、天狼星-1.46、肉眼极限+6\n\n【绝对星等 M】\n把恒星放到10秒差距处的视星等\n\n【距离模数】\nM = m + 5 − 5·lg d\n\n【亮度比】每差1等约2.512倍，差5等=100倍。'},
{id:'k_j_motion',level:'初中',category:'天体运动',icon:'',title:'视运动与坐标系',sim:'earth',content:'【周日视运动】\n由地球自转引起，天体东升西落\n周期：1恒星日 = 23h56m4s\n\n【周年视运动】\n由地球公转引起\n太阳沿黄道自西向东移动\n\n【黄赤交角】约23°26′\n是四季变化和昼夜长短变化的根本原因\n\n【拱极星】天极附近永不落下的星\n北纬φ处，赤纬δ > 90°−φ 的星为拱极星。'},
{id:'k_j_tele',level:'初中',category:'望远镜',icon:'',title:'望远镜原理与参数',sim:'telescope',content:'【核心参数】\n· 口径D：物镜直径，决定聚光能力和分辨率\n· 分辨率 ≈ 1.22 λ / D（角秒）\n\n【放大倍率】\n放大倍率 = 物镜焦距 ÷ 目镜焦距\n有效倍率上限 ≈ 口径(mm) × 2\n\n【类型】\n· 折射式：凸透镜物镜\n· 反射式（牛顿式）：凹面镜物镜\n· 折反射式：兼顾两者'},
{id:'k_j_phase',level:'初中',category:'月相',icon:'',title:'月相与月球运动',sim:'moonPhase',content:'【两个周期】\n· 恒星月：27.32天（月球公转）\n· 朔望月：29.53天（月相变化）\n\n【为什么朔望月更长】\n地球同时绕太阳公转，月球需多走约2.2天。\n\n【月球同步自转】\n自转周期 = 公转周期 = 27.32天\n所以地球上永远只能看到月球同一面。'},
{id:'k_j_eclipse',level:'初中',category:'日食月食',icon:'',title:'日月食机制',sim:'eclipse',content:'【日食】太阳→月球→地球\n· 只在朔（初一）发生\n· 日全食、日偏食、日环食\n\n【月食】太阳→地球→月球\n· 只在望（十五前后）发生\n· 月全食、月偏食、半影月食\n\n【为什么不是每月都有】\n白道与黄道有约5°09′交角。\n\n【沙罗周期】约18年11天8小时。'},
{id:'k_j_galaxy',level:'初中',category:'星系',icon:'',title:'星系与宇宙膨胀',sim:'galaxy',content:'【银河系】\n· 棒旋星系，直径约10万光年\n· 恒星约1000~4000亿颗\n· 太阳距银心约2.6万光年\n· 中心有人马座A*（超大质量黑洞）\n\n【哈勃定律】\nv = H₀ × d（H₀约70 km/s/Mpc）\n说明宇宙在膨胀\n\n【宇宙年龄】约138亿年\n【可观测宇宙直径】约930亿光年'},
{id:'k_j_history',level:'初中',category:'天文史',icon:'',title:'中外天文简史',sim:'rocket',content:'【中国古代】\n· 张衡（东汉）：浑天仪、地动仪、《灵宪》\n· 祖冲之（南朝）：《大明历》\n· 一行（唐）：《大衍历》\n· 郭守敬（元）：登封观星台，《授时历》\n\n【西方】\n托勒密（地心说）→哥白尼（日心说）→第谷→开普勒（三定律）→伽利略（望远镜）→牛顿（万有引力）'},
{id:'k_j_sun',level:'初中',category:'太阳',icon:'☀️',title:'太阳的结构与活动',sim:'sunStruct',content:'【结构（由内到外）】\n核心 → 辐射层 → 对流层 → 光球 → 色球 → 日冕\n\n【温度】\n· 核心：约1500万℃（氢核聚变）\n· 光球：约5500℃\n· 色球：约4000~几万℃\n· 日冕：最外层，百万℃\n\n【活动】黑子、耀斑、日珥、太阳风。'},
{id:'k_j_star',level:'初中',category:'恒星',icon:'⭐',title:'恒星的光谱与分类',sim:'spectrum',content:'【光谱型（温度由高到低）】\nO → B → A → F → G → K → M\n· O型：>30000K，蓝白色\n· G型：约5800K，黄色（太阳是G2V）\n· M型：<3500K，红色\n\n【赫罗图】\n· 主序星：左上到右下的对角带\n· 巨星、超巨星：右上\n· 白矮星：左下\n\n质量越大，光度越高，寿命越短。'},
{id:'k_j_unit',level:'初中',category:'天文单位',icon:'',title:'距离单位与视差',sim:'lightyear',content:'【三种距离单位】\n· 天文单位 AU ≈ 1.496亿千米\n· 光年 ly ≈ 9.46万亿千米\n· 秒差距 pc ≈ 3.26光年 ≈ 206265 AU\n\n【周年视差】\n地球绕日公转导致近距离恒星在背景上的微小位移。\n\n公式：d(秒差距) = 1 / p(角秒)\n\n【比邻星】视差0.77角秒 → 距离1.3 pc ≈ 4.22 ly'},
{id:'k_j_dso',level:'初中',category:'深空天体',icon:'',title:'深空天体与宇宙学',sim:'blackhole',content:'【深空天体】\n· 星云：猎户座大星云M42、蟹状星云M1\n· 星团：昴星团M45（疏散）、M13（球状）\n· 星系：M31仙女座、M33三角座\n\n【特殊天体】\n· 类星体：极亮的活跃星系核\n· 脉冲星：快速自转的中子星\n· 黑洞：人马座A*、M87*\n\n【宇宙学】\n大爆炸约138亿年前，微波背景辐射2.725K，暗物质约27%，暗能量约68%。'}
];

/* ==========================================
   读报数据
   ========================================== */
var NEWS = [
{id:'n01',cat:'深空探索',date:'2026-10-08',title:'韦布望远镜观测到迄今最遥远星系',
body:'天文学家利用詹姆斯·韦布空间望远镜，在距离地球约134亿光年的位置发现了一个名为 JADES-GS-z14-0 的星系。这是迄今为止人类观测到的最遥远星系之一，其光线出发时宇宙年龄仅约2.9亿年。\n\n该星系比预想的更加明亮和成熟，包含大量恒星和尘埃，这对现有的星系形成模型提出了挑战。研究人员认为，早期宇宙中可能存在此前未知的高效恒星形成机制。\n\n这一发现将帮助科学家理解宇宙黑暗时代结束后，第一批星系是如何诞生和演化的。相关成果已发表于国际顶级期刊。'},
{id:'n02',cat:'航天动态',date:'2026-10-05',title:'嫦娥六号月背样品研究取得重大突破',
body:'中国科学家对嫦娥六号从月球背面南极-艾特肯盆地采集的样品进行深入研究，发现了月球背面与正面在地质演化上的显著差异。\n\n研究显示，月球背面样品中含有约28亿年前的火山活动痕迹，比此前预期的更年轻。这一发现改写了月球热演化历史，表明月球背面在较晚时期仍有活跃的岩浆活动。\n\n嫦娥六号于2024年成功实现人类首次月球背面采样返回，共带回约1935克月背样品，这是人类探月史上的重要里程碑。'},
{id:'n03',cat:'天文快讯',date:'2026-10-02',title:'北极星或将迎来新一轮观测热潮',
body:'国际天文学联合会宣布，将2027年定为北极星年，以纪念人类对北极星的系统性观测与研究。\n\n北极星（勾陈一）是当前距离北天极最近的亮星，其地平高度约等于观测者所在的地理纬度，长期以来是天文导航的重要参考。\n\n由于地轴进动（岁差），北极星的身份会随时间变化——约12000年后，织女星将成为新的北极星。各国天文机构计划在2027年组织公众观测活动，让更多人了解北极星及其背后的天文原理。'},
{id:'n04',cat:'竞赛资讯',date:'2026-09-28',title:'2026年全国中学生天文知识竞赛日程公布',
body:'中国天文学会正式公布2026年全国中学生天文知识竞赛日程。预赛将于11月中旬举行，采取闭卷笔试形式，考察内容涵盖太阳系、恒星、星系、天球坐标、望远镜等知识点。\n\n决赛计划于次年3月举行，包括笔试和望远镜实际操作两个环节。本届竞赛新增图片题和排序题，更加注重考察学生的观察能力和逻辑思维。\n\n各地中小学天文社团正在积极组织备赛，许多学校增设了天文观测实践课程，为学生提供动手操作望远镜的机会。'},
{id:'n05',cat:'深空探索',date:'2026-09-25',title:'FAST捕获迄今最清晰的快速射电暴信号',
body:'中国天眼FAST再次取得重要成果，成功捕获并精确定位了一个快速射电暴信号。该信号来自约30亿光年外的一个星系，持续时间仅几毫秒，却释放出相当于太阳数天辐射的总能量。\n\n快速射电暴是宇宙中最神秘的射电现象之一，其起源仍未完全明确。目前主流理论认为，它们可能来自磁星——一种磁场极强的中子星。\n\nFAST凭借其超高灵敏度，已成为全球研究快速射电暴的核心设备。截至2026年，FAST已发现超过900颗新脉冲星。'},
{id:'n06',cat:'天文快讯',date:'2026-09-20',title:'2026年英仙座流星雨观测报告发布',
body:'国际流星组织发布了2026年英仙座流星雨的观测报告。本次流星雨极大期出现在8月12日夜间，理想观测条件下每小时天顶流星数约为100颗。\n\n英仙座流星雨的母体是斯威夫特-塔特尔彗星，其轨道上的尘埃带每年8月与地球相遇，形成壮观的流星雨。流星速度极快，约59 km/s，常留下明亮的尾迹。\n\n天文爱好者建议：观测流星雨应选择远离城市灯光、视野开阔的地点，肉眼观测即可，不需要望远镜。'},
{id:'n07',cat:'航天动态',date:'2026-09-15',title:'中国空间站完成新一轮科学实验',
body:'中国空间站梦天实验舱近期完成了一批微重力科学实验，涵盖流体物理、材料科学、生命科学等多个领域。\n\n其中，一项关于火焰在微重力环境下传播规律的实验取得突破性进展，为未来空间站防火安全设计提供了关键数据。另一项植物培育实验成功实现了水稻在太空中的从种子到种子完整生命周期。\n\n空间站作为国家级太空实验室，正在持续产出具有国际影响力的科研成果，并向全球科学家开放合作机会。'},
{id:'n08',cat:'深空探索',date:'2026-09-10',title:'欧罗巴快船探测器传回首批科学数据',
body:'NASA的欧罗巴快船探测器已进入木星系统，开始对木卫二（欧罗巴）进行详细探测。首批数据显示，木卫二冰层下确实存在一个巨大的液态水海洋，含水量约为地球海洋的两倍。\n\n科学家认为，木卫二的海洋中可能存在适合生命存在的化学环境。探测器将通过多次近距离飞掠，分析冰壳厚度、海洋成分以及表面喷发的水汽羽流。\n\n这一任务被视为寻找地外生命最重要的探索之一，其结果将深刻影响人类对宇宙中生命普遍性的认识。'},
{id:'n09',cat:'天文快讯',date:'2026-09-05',title:'天文学家发现一颗超级地球位于宜居带',
body:'国际研究团队宣布发现了一颗名为 TOI-715b 的超级地球，其半径约为地球的1.55倍，围绕一颗红矮星运行，公转周期仅19天。\n\n该行星位于母星的宜居带内，理论上表面可能存在液态水。虽然红矮星耀斑活动较为频繁，但研究人员认为该行星仍有可能保留大气层。\n\n这是继TRAPPIST-1系统之后，又一个引起广泛关注的潜在宜居行星系统。未来韦布望远镜将对它的大气成分进行详细分析。'},
{id:'n10',cat:'竞赛资讯',date:'2026-08-28',title:'国际天文奥林匹克竞赛中国队再创佳绩',
body:'第29届国际天文奥林匹克竞赛在巴西落幕，中国代表队表现优异，共获得3枚金牌、2枚银牌和1枚铜牌，位列团体总分第一。\n\n本届竞赛吸引了来自50多个国家的300余名选手参加，内容涵盖理论、观测、数据分析三大板块。中国选手在理论题和观测题环节表现尤为突出。\n\n中国代表队由经过全国中学生天文知识竞赛选拔的优秀选手组成，他们的成绩也激励着更多青少年投身天文科学的学习与探索。'}
];

/* ==========================================
   模拟器引擎（修复速度控制）
   ========================================== */
var SimEngine = {
  active:{},
  running:false,
  lastTime:0,
  raf:null,
  sims:{},
  init:function(canvas, id){
    var sim = this.sims[id];
    if (!sim) return null;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 480;
    var cssH = sim.height || 220;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {sim:sim, ctx:ctx, w:cssW, h:cssH, t:0, speed:1, playing:true};
  },
  startAll:function(){
    var self = this;
    this.stopAll();
    var canvases = document.querySelectorAll('.sim-canvas');
    canvases.forEach(function(cv){
      var id = cv.dataset.sim;
      if (!id || !self.sims[id]) return;
      var inst = self.init(cv, id);
      if (!inst) return;
      self.active[cv.id] = inst;
      // 初始化按钮状态
      var box = cv.closest('.sim-box');
      if (box){
        var pb = box.querySelector('.sim-play');
        if (pb){ pb.textContent = '⏸ 暂停'; pb.classList.add('active'); }
      }
    });
    if (!this.running){
      this.running = true;
      this.lastTime = performance.now();
      this.loop();
    }
  },
  stopAll:function(){
    this.running = false;
    this.active = {};
    if (this.raf){ cancelAnimationFrame(this.raf); this.raf = null; }
  },
  loop:function(){
    if (!this.running) return;
    var now = performance.now();
    var dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    var self = this;
    Object.keys(this.active).forEach(function(k){
      var inst = self.active[k];
      if (!inst || !inst.playing) return;
      inst.t += dt * inst.speed;
      try { inst.sim.draw(inst.ctx, inst.w, inst.h, inst.t, inst); }
      catch(err){ console.error('sim error', k, err); }
    });
    this.raf = requestAnimationFrame(function(){ self.loop(); });
  }
};

/* ==========================================
   模拟器绘制函数
   ========================================== */

/* 太阳系 */
SimEngine.sims.solar = {
  height:240,
  planets:[
    {n:'水星',a:30,p:9,c:'#B8C2DC',r:2.5,s:4.15},
    {n:'金星',a:46,p:13,c:'#FFB84D',r:3.5,s:1.62},
    {n:'地球',a:62,p:17,c:'#4FA8FF',r:3.8,s:1.0},
    {n:'火星',a:80,p:21,c:'#FF5B5B',r:3,s:0.53},
    {n:'木星',a:104,p:27,c:'#E08A1E',r:6,s:0.084},
    {n:'土星',a:128,p:33,c:'#FFD84D',r:5.2,s:0.034},
    {n:'天王星',a:150,p:39,c:'#A78BFA',r:4,s:0.012},
    {n:'海王星',a:170,p:45,c:'#2F7BFF',r:3.8,s:0.006}
  ],
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    // 星空
    for (var i = 0; i < 60; i++){
      var sx = (i * 73) % w, sy = (i * 41) % h;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + (i % 4) * 0.12) + ')';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var cx = w / 2, cy = h / 2;
    var maxR = Math.min(w / 2 - 15, h / 2 - 15) / 175;
    // 轨道
    this.planets.forEach(function(p){
      ctx.beginPath();
      ctx.ellipse(cx, cy, p.a * maxR, p.p * maxR * 0.42, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(79,168,255,0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    // 太阳（带脉动）
    var pulse = 1 + 0.06 * Math.sin(t * 2.5);
    var sunR = 12 * pulse;
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR * 3);
    grad.addColorStop(0, 'rgba(255,245,180,1)');
    grad.addColorStop(0.35, 'rgba(255,216,77,0.85)');
    grad.addColorStop(1, 'rgba(224,138,30,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, sunR * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFD84D';
    ctx.beginPath();
    ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
    ctx.fill();
    // 行星
    this.planets.forEach(function(p, i){
      var speed = p.s * 0.25;
      var angle = t * speed + i * 0.7;
      var x = cx + Math.cos(angle) * p.a * maxR;
      var y = cy + Math.sin(angle) * p.p * maxR * 0.42;
      // 光晕
      if (p.n === '地球' || p.n === '木星'){
        var gl = ctx.createRadialGradient(x, y, 0, x, y, p.r * 3);
        gl.addColorStop(0, p.c + '80');
        gl.addColorStop(1, p.c + '00');
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(x, y, p.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
      // 土星环
      if (p.n === '土星'){
        ctx.strokeStyle = 'rgba(255,216,77,0.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(x, y, p.r * 2.2, p.r * 0.6, 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 标签
      if (w > 400){
        ctx.fillStyle = 'rgba(184,194,220,0.75)';
        ctx.font = '9px sans-serif';
        ctx.fillText(p.n, x + p.r + 3, y + 3);
      }
    });
    // 标题
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('太阳系八大行星 · 按真实相对周期', w / 2, h - 6);
    ctx.textAlign = 'left';
  }
};

/* 月相 */
SimEngine.sims.moonPhase = {
  height:250,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 40; i++){
      var sx = (i * 97) % w, sy = (i * 53) % h;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var phase = (t * 0.12) % 1;
    var cx = w / 2, cy = h / 2 + 10;
    var r = Math.min(w, h) / 4;
    // 月球暗面
    ctx.fillStyle = '#1a2340';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // 亮面
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#E8ECF7';
    if (phase < 0.5){
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx, cy, r * Math.abs(Math.cos(phase * Math.PI * 2)), 0, Math.PI * 2, Math.cos(phase * Math.PI * 2) > 0);
      ctx.fill('evenodd');
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx, cy, r * Math.abs(Math.cos(phase * Math.PI * 2)), 0, Math.PI * 2, Math.cos(phase * Math.PI * 2) < 0);
      ctx.fill('evenodd');
    }
    // 环形山
    ctx.fillStyle = 'rgba(120,130,160,0.35)';
    [[-0.3,-0.2,0.15],[0.25,0.1,0.12],[-0.1,0.35,0.08],[0.1,-0.4,0.1]].forEach(function(cr){
      ctx.beginPath();
      ctx.arc(cx + cr[0] * r, cy + cr[1] * r, cr[2] * r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    // 描边
    ctx.strokeStyle = 'rgba(79,168,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // 名称
    var day = Math.round(phase * 29.5) + 1;
    var names = ['新月（朔）','蛾眉月','上弦月','盈凸月','满月（望）','亏凸月','下弦月','残月'];
    var idx = Math.floor(phase * 8) % 8;
    ctx.fillStyle = '#4FA8FF';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(names[idx], cx, cy + r + 32);
    ctx.fillStyle = '#8A93B8';
    ctx.font = '11px sans-serif';
    ctx.fillText('农历约 ' + day + ' 日', cx, cy + r + 50);
    // 进度条
    var barW = w - 40, barX = 20, barY = 18;
    ctx.fillStyle = 'rgba(79,168,255,0.15)';
    ctx.fillRect(barX, barY, barW, 4);
    ctx.fillStyle = '#4FA8FF';
    ctx.fillRect(barX, barY, barW * phase, 4);
    ctx.fillStyle = '#8A93B8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('初一', barX, barY - 3);
    ctx.textAlign = 'right';
    ctx.fillText('三十', barX + barW, barY - 3);
    ctx.textAlign = 'left';
  }
};

/* 日食 */
SimEngine.sims.eclipse = {
  height:210,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 30; i++){
      var sx = (i * 89) % w, sy = (i * 47) % h;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var sunX = 60, sunY = h / 2, sunR = 32;
    // 太阳光晕
    var sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2);
    sg.addColorStop(0, '#FFF5B0');
    sg.addColorStop(0.35, '#FFD84D');
    sg.addColorStop(1, 'rgba(224,138,30,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFD84D';
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();
    // 地球
    var earthX = w - 60, earthY = h / 2, earthR = 22;
    var eg = ctx.createRadialGradient(earthX - 5, earthY - 5, 0, earthX, earthY, earthR);
    eg.addColorStop(0, '#4FA8FF');
    eg.addColorStop(1, '#1E4FA8');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(46,212,122,0.6)';
    ctx.beginPath();
    ctx.arc(earthX - 5, earthY - 3, 8, 0, Math.PI * 2);
    ctx.fill();
    // 月球运动
    var progress = (t * 0.18) % 1;
    var moonX = (sunX + sunR + 20) + (earthX - 40 - (sunX + sunR + 20)) * progress;
    var moonY = sunY;
    var moonR = 8;
    // 月球影子
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(moonX, moonY - moonR);
    ctx.lineTo(moonX + (earthX - moonX) * 0.7, earthY - moonR * 1.5);
    ctx.lineTo(moonX + (earthX - moonX) * 0.7, earthY + moonR * 1.5);
    ctx.lineTo(moonX, moonY + moonR);
    ctx.closePath();
    ctx.fill();
    // 月球
    ctx.fillStyle = '#8A93B8';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    // 标注
    ctx.fillStyle = '#FFD84D';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('太阳', sunX, sunY + sunR + 16);
    ctx.fillStyle = '#8A93B8';
    ctx.fillText('月球', moonX, moonY + moonR + 20);
    ctx.fillStyle = '#4FA8FF';
    ctx.fillText('地球', earthX, earthY + earthR + 16);
    // 状态
    var dist = Math.abs(moonX - sunX);
    var status = dist < sunR ? ' 日食进行中' : (progress < 0.5 ? '月球接近太阳' : '月球远离太阳');
    ctx.fillStyle = 'rgba(138,147,184,0.8)';
    ctx.font = '10px sans-serif';
    ctx.fillText(status + ' · 日食几何示意', w / 2, h - 6);
    ctx.textAlign = 'left';
  }
};

/* 恒星演化 */
SimEngine.sims.evolution = {
  height:230,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 40; i++){
      var sx = (i * 67) % w, sy = (i * 43) % h;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var cy = h / 2;
    var stages = [
      {n:'分子云', c:'#4FA8FF', r:26, alpha:0.35},
      {n:'主序星', c:'#FFD84D', r:18, alpha:0.95},
      {n:'红巨星', c:'#FF5B5B', r:36, alpha:0.7},
      {n:'行星状星云', c:'#A78BFA', r:42, alpha:0.35},
      {n:'白矮星', c:'#E8ECF7', r:7, alpha:0.95}
    ];
    var total = stages.length;
    var p = (t * 0.14) % total;
    var idx = Math.floor(p);
    var frac = p - idx;
    // 时间轴
    var axisY = h - 24;
    ctx.strokeStyle = 'rgba(79,168,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, axisY);
    ctx.lineTo(w - 30, axisY);
    ctx.stroke();
    var step = (w - 60) / (total - 1);
    stages.forEach(function(s, i){
      var x = 30 + step * i;
      ctx.fillStyle = i <= idx ? '#4FA8FF' : '#3A4A78';
      ctx.beginPath();
      ctx.arc(x, axisY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = i <= idx ? '#B8C2DC' : '#5C6688';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.n, x, axisY + 15);
    });
    ctx.textAlign = 'left';
    // 中心恒星
    var cx = w / 2;
    var s1 = stages[idx], s2 = stages[(idx + 1) % total];
    var r = s1.r + (s2.r - s1.r) * frac;
    var a = s1.alpha + (s2.alpha - s1.alpha) * frac;
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
    grad.addColorStop(0, s1.c);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s1.c;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s1.n, cx, cy - r - 14);
    ctx.textAlign = 'left';
    // 标题
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('小质量恒星演化路径 · 循环演示', w / 2, 16);
    ctx.textAlign = 'left';
  }
};

/* 望远镜 */
SimEngine.sims.telescope = {
  height:210,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 30; i++){
      var sx = (i * 91) % w, sy = (i * 57) % h;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var cy = h / 2;
    // 镜筒
    ctx.fillStyle = 'rgba(42,58,102,0.9)';
    ctx.fillRect(80, cy - 14, w - 200, 28);
    ctx.strokeStyle = 'rgba(79,168,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(80, cy - 14, w - 200, 28);
    // 物镜
    ctx.fillStyle = '#4FA8FF';
    ctx.beginPath();
    ctx.ellipse(90, cy, 6, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    // 目镜
    ctx.fillStyle = '#FFB84D';
    ctx.beginPath();
    ctx.ellipse(w - 120, cy, 5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // 探测屏
    ctx.fillStyle = 'rgba(46,212,122,0.18)';
    ctx.fillRect(w - 90, cy - 30, 60, 60);
    ctx.strokeStyle = 'rgba(46,212,122,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(w - 90, cy - 30, 60, 60);
    // 光线
    var focusX = w - 150;
    for (var k = 0; k < 5; k++){
      var offset = (k - 2) * 6;
      ctx.strokeStyle = 'rgba(255,216,77,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, cy + offset);
      ctx.lineTo(90, cy + offset);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(90, cy + offset);
      ctx.lineTo(focusX, cy + offset * 0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(focusX, cy + offset * 0.1);
      ctx.lineTo(w - 120, cy + offset * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w - 120, cy + offset * 0.3);
      ctx.lineTo(w - 80, cy + offset * 1.5);
      ctx.stroke();
    }
    // 焦点闪烁
    var flash = 0.4 + 0.6 * Math.abs(Math.sin(t * 3));
    ctx.fillStyle = 'rgba(255,216,77,' + flash + ')';
    ctx.beginPath();
    ctx.arc(focusX, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    // 屏上成像
    ctx.fillStyle = 'rgba(46,212,122,0.9)';
    var imgSize = 6 + 2 * Math.sin(t * 2);
    ctx.beginPath();
    ctx.ellipse(w - 60, cy, imgSize, imgSize * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    // 标注
    ctx.fillStyle = '#8A93B8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('平行光', 40, cy - 30);
    ctx.fillStyle = '#4FA8FF';
    ctx.fillText('物镜', 90, cy + 34);
    ctx.fillStyle = '#FFB84D';
    ctx.fillText('目镜', w - 120, cy + 30);
    ctx.fillStyle = '#2ED47A';
    ctx.fillText('成像', w - 60, cy + 40);
    ctx.fillStyle = 'rgba(138,147,184,0.8)';
    ctx.fillText('折射式望远镜光路 · 光线追踪', w / 2, h - 6);
    ctx.textAlign = 'left';
  }
};

/* 银河系 */
SimEngine.sims.galaxy = {
  height:280,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 80; i++){
      var sx = (i * 71) % w, sy = (i * 53) % h;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + (i % 4) * 0.12) + ')';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var cx = w / 2, cy = h / 2;
    var maxR = Math.min(w, h) / 2 - 22;
    ctx.save();
    ctx.translate(cx, cy);
    // 旋臂
    for (var arm = 0; arm < 4; arm++){
      ctx.beginPath();
      var startA = arm * Math.PI / 2 + t * 0.12;
      for (var s = 0; s < 60; s++){
        var r = 10 + s * (maxR - 10) / 60;
        var a = startA + s * 0.28;
        var x = Math.cos(a) * r;
        var y = Math.sin(a) * r * 0.55;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(79,168,255,0.3)';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(167,139,250,0.55)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    // 核球
    var ng = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
    ng.addColorStop(0, 'rgba(255,245,180,0.95)');
    ng.addColorStop(0.5, 'rgba(255,216,77,0.7)');
    ng.addColorStop(1, 'rgba(224,138,30,0)');
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    // 太阳
    var sunA = t * 0.12 + 1.2;
    var sunR = maxR * 0.55;
    var sunX = Math.cos(sunA) * sunR;
    var sunY = Math.sin(sunA) * sunR * 0.55;
    ctx.fillStyle = '#FFD84D';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,216,77,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#FFD84D';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('太阳系', sunX + 13, sunY + 3);
    ctx.fillStyle = '#8A93B8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('人马座A*', 0, 34);
    ctx.textAlign = 'left';
    ctx.restore();
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('银河系俯视 · 棒旋星系 · 太阳系位于猎户臂', w / 2, h - 6);
    ctx.textAlign = 'left';
  }
};

/* 地球公转 */
SimEngine.sims.earth = {
  height:260,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 50; i++){
      var sx = (i * 83) % w, sy = (i * 47) % h;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var cx = w / 2, cy = h / 2 + 5;
    var orbitR = Math.min(w / 2 - 30, h / 2 - 30);
    // 轨道
    ctx.strokeStyle = 'rgba(79,168,255,0.25)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, orbitR, orbitR * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // 太阳
    var sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    sg.addColorStop(0, '#FFF5B0');
    sg.addColorStop(0.6, '#FFD84D');
    sg.addColorStop(1, 'rgba(224,138,30,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    // 地球
    var angle = t * 0.22;
    var ex = cx + Math.cos(angle) * orbitR;
    var ey = cy + Math.sin(angle) * orbitR * 0.55;
    var eg = ctx.createRadialGradient(ex - 3, ey - 3, 0, ex, ey, 12);
    eg.addColorStop(0, '#4FA8FF');
    eg.addColorStop(1, '#1E4FA8');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(ex, ey, 12, 0, Math.PI * 2);
    ctx.fill();
    // 大陆
    ctx.fillStyle = 'rgba(46,212,122,0.75)';
    ctx.beginPath();
    ctx.ellipse(ex - 3, ey - 2, 5, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(ex + 3, ey + 3, 4, 3, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // 地轴
    var tilt = -23.5 * Math.PI / 180;
    var axisLen = 18;
    ctx.strokeStyle = 'rgba(255,216,77,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ex - Math.sin(tilt) * axisLen, ey - Math.cos(tilt) * axisLen);
    ctx.lineTo(ex + Math.sin(tilt) * axisLen, ey + Math.cos(tilt) * axisLen);
    ctx.stroke();
    // 昼夜
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, 12, 0, Math.PI * 2);
    ctx.clip();
    var sunAngle = Math.atan2(cy - ey, cx - ex);
    var lg = ctx.createLinearGradient(ex - Math.cos(sunAngle) * 12, ey - Math.sin(sunAngle) * 12, ex + Math.cos(sunAngle) * 12, ey + Math.sin(sunAngle) * 12);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    lg.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = lg;
    ctx.fillRect(ex - 12, ey - 12, 24, 24);
    ctx.restore();
    // 四季标注
    var labels = ['春分','夏至','秋分','冬至'];
    for (var k = 0; k < 4; k++){
      var a = k * Math.PI / 2;
      var lx = cx + Math.cos(a) * (orbitR + 14);
      var ly = cy + Math.sin(a) * (orbitR + 14) * 0.55 + 4;
      ctx.fillStyle = 'rgba(138,147,184,0.7)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[k], lx, ly);
    }
    ctx.textAlign = 'left';
    // 标题
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('地球公转与四季 · 地轴倾斜约23.5°', w / 2, h - 6);
    ctx.textAlign = 'left';
  }
};

/* 光谱 */
SimEngine.sims.spectrum = {
  height:190,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    var colors = [
      {n:'O',c:'#8FA8FF',temp:'>30000K'},
      {n:'B',c:'#B8D4FF',temp:'1万-3万K'},
      {n:'A',c:'#FFFFFF',temp:'7500-1万K'},
      {n:'F',c:'#FFE8B0',temp:'6000-7500K'},
      {n:'G',c:'#FFD84D',temp:'5200-6000K'},
      {n:'K',c:'#FFA84D',temp:'3700-5200K'},
      {n:'M',c:'#FF5B5B',temp:'<3700K'}
    ];
    var bw = (w - 40) / colors.length;
    var by = h / 2 - 42;
    var bh = 66;
    colors.forEach(function(c, i){
      var x = 20 + i * bw;
      ctx.fillStyle = c.c;
      ctx.fillRect(x, by, bw, bh);
      ctx.fillStyle = (i === 2) ? '#0B1026' : '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.n, x + bw / 2, by + bh / 2 + 6);
      ctx.fillStyle = '#8A93B8';
      ctx.font = '9px sans-serif';
      ctx.fillText(c.temp, x + bw / 2, by + bh + 16);
    });
    // 高亮
    var pIdx = Math.floor((t * 0.8) % colors.length);
    var px = 20 + pIdx * bw;
    var flash = 0.4 + 0.6 * Math.abs(Math.sin(t * 2));
    ctx.strokeStyle = 'rgba(79,168,255,' + flash + ')';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(px - 2, by - 2, bw + 4, bh + 4);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.fillText('恒星光谱型 · 温度由高到低', w / 2, h - 8);
    ctx.textAlign = 'left';
  }
};

/* 赫罗图 */
SimEngine.sims.hr = {
  height:270,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    var pad = {l:44,r:22,t:28,b:36};
    var plotW = w - pad.l - pad.r;
    var plotH = h - pad.t - pad.b;
    // 坐标轴
    ctx.strokeStyle = 'rgba(58,74,120,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + plotH);
    ctx.lineTo(pad.l + plotW, pad.t + plotH);
    ctx.stroke();
    // 标签
    ctx.fillStyle = '#8A93B8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('温度（左高右低）', pad.l + plotW / 2, h - 10);
    ctx.textAlign = 'left';
    ctx.save();
    ctx.translate(14, pad.t + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('光度', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    // 主序带
    ctx.strokeStyle = 'rgba(79,168,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (var i = 0; i <= 30; i++){
      var p = i / 30;
      var x = pad.l + 22 + p * (plotW - 66);
      var y = pad.t + 18 + p * (plotH - 58);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 太阳
    var px = pad.l + 22 + 0.55 * (plotW - 66);
    var py = pad.t + 18 + 0.55 * (plotH - 58);
    var flash = 0.5 + 0.5 * Math.abs(Math.sin(t * 2));
    ctx.fillStyle = 'rgba(255,216,77,' + flash + ')';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFD84D';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#FFD84D';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('太阳', px + 16, py + 4);
    // 巨星
    ctx.fillStyle = 'rgba(167,139,250,0.45)';
    ctx.beginPath();
    ctx.arc(pad.l + 34, pad.t + 24, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#A78BFA';
    ctx.font = '10px sans-serif';
    ctx.fillText('巨星', pad.l + 62, pad.t + 28);
    // 白矮星
    ctx.fillStyle = 'rgba(255,184,77,0.45)';
    ctx.beginPath();
    ctx.arc(pad.l + 44, pad.t + plotH - 32, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFB84D';
    ctx.fillText('白矮星', pad.l + 62, pad.t + plotH - 28);
    // 主序标签
    ctx.fillStyle = '#4FA8FF';
    ctx.fillText('主序带', pad.l + plotW * 0.68, pad.t + plotH * 0.75);
    // 标题
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('赫罗图 H-R Diagram', w / 2, 14);
    ctx.textAlign = 'left';
  }
};

/* 北斗七星 */
SimEngine.sims.starMap = {
  height:230,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 80; i++){
      var sx = (i * 67) % w, sy = (i * 43) % h;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + (i % 5) * 0.1) + ')';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var beidou = [{x:0.15,y:0.65},{x:0.28,y:0.55},{x:0.4,y:0.45},{x:0.55,y:0.4},{x:0.7,y:0.35},{x:0.82,y:0.5},{x:0.68,y:0.62}];
    ctx.strokeStyle = 'rgba(79,168,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    beidou.forEach(function(p, i){
      var x = p.x * w, y = p.y * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var flash = 0.7 + 0.3 * Math.sin(t * 2);
    beidou.forEach(function(p, i){
      var x = p.x * w, y = p.y * h;
      ctx.fillStyle = 'rgba(255,255,255,' + (i === 0 ? flash : 1) + ')';
      ctx.beginPath();
      ctx.arc(x, y, i === 0 ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
    // 延长线
    var x1 = beidou[0].x * w, y1 = beidou[0].y * h;
    var x2 = beidou[1].x * w, y2 = beidou[1].y * h;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx*dx + dy*dy);
    var ux = dx/len, uy = dy/len;
    ctx.strokeStyle = 'rgba(255,216,77,0.6)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + ux * w * 0.62, y1 + uy * w * 0.36);
    ctx.stroke();
    ctx.setLineDash([]);
    var px = x1 + ux * w * 0.56;
    var py = y1 + uy * w * 0.33;
    if (px > 0 && px < w && py > 0 && py < h){
      var pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * 1.5));
      ctx.fillStyle = 'rgba(255,216,77,' + pulse + ')';
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFD84D';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('北极星', px + 12, py + 4);
    }
    ctx.fillStyle = '#8A93B8';
    ctx.font = '10px sans-serif';
    ctx.fillText('北斗七星', beidou[0].x * w - 24, beidou[0].y * h + 16);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.fillText('北斗勺头延长约5倍 → 北极星', w / 2, h - 8);
    ctx.textAlign = 'left';
  }
};

/* 流星 */
SimEngine.sims.meteor = {
  height:230,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 100; i++){
      var sx = (i * 71) % w, sy = (i * 43) % h;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.2 + (i % 4) * 0.1) + ')';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var meteors = [
      {x0:0.1,y0:0.2,len:0.15,sp:0.6,delay:0},
      {x0:0.5,y0:0.1,len:0.2,sp:0.45,delay:1.5},
      {x0:0.8,y0:0.25,len:0.12,sp:0.7,delay:0.7},
      {x0:0.3,y0:0.15,len:0.18,sp:0.5,delay:2.3},
      {x0:0.65,y0:0.3,len:0.14,sp:0.55,delay:1.1}
    ];
    meteors.forEach(function(m, i){
      var p = ((t * m.sp + m.delay) % 3) / 3;
      if (p > 0.7) return;
      var x = m.x0 * w + p * w * 0.6;
      var y = m.y0 * h + p * h * 0.4;
      var x2 = x - m.len * w;
      var y2 = y - m.len * h * 0.6;
      var g = ctx.createLinearGradient(x, y, x2, y2);
      g.addColorStop(0, 'rgba(255,216,77,0.95)');
      g.addColorStop(0.5, 'rgba(255,184,77,0.5)');
      g.addColorStop(1, 'rgba(255,91,91,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      var flash = 0.6 + 0.4 * Math.sin(t * 8 + i);
      ctx.fillStyle = 'rgba(255,255,255,' + flash + ')';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(167,139,250,0.5)';
    ctx.beginPath();
    ctx.arc(w * 0.75, h * 0.15, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#A78BFA';
    ctx.font = '10px sans-serif';
    ctx.fillText('辐射点', w * 0.75 + 9, h * 0.15 + 4);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.fillText('流星雨 · 地球穿过彗星尘埃带', w / 2, h - 8);
    ctx.textAlign = 'left';
  }
};

/* 太阳结构 */
SimEngine.sims.sunStruct = {
  height:240,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    var cx = w / 2, cy = h / 2;
    var maxR = Math.min(w, h) / 2 - 22;
    var layers = [
      {r:maxR, c1:'rgba(167,139,250,0.14)', c2:'rgba(167,139,250,0.32)', n:'日冕'},
      {r:maxR * 0.82, c1:'rgba(79,168,255,0.2)', c2:'rgba(79,168,255,0.4)', n:'色球'},
      {r:maxR * 0.65, c1:'rgba(255,216,77,0.5)', c2:'rgba(255,184,77,0.7)', n:'光球'},
      {r:maxR * 0.45, c1:'rgba(255,184,77,0.6)', c2:'rgba(224,138,30,0.8)', n:'对流层'},
      {r:maxR * 0.25, c1:'rgba(255,216,77,0.85)', c2:'rgba(255,245,180,0.95)', n:'辐射层'},
      {r:maxR * 0.1, c1:'#FFF5B0', c2:'#FFFFFF', n:'核心'}
    ];
    var pulse = 1 + 0.03 * Math.sin(t * 2);
    layers.forEach(function(L){
      var r = L.r * pulse;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, L.c1);
      g.addColorStop(1, L.c2);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    });
    // 黑子
    ctx.fillStyle = 'rgba(11,16,38,0.75)';
    for (var i = 0; i < 3; i++){
      var a = t * 0.4 + i * 2.1;
      var sx = cx + Math.cos(a) * maxR * 0.55;
      var sy = cy + Math.sin(a) * maxR * 0.55;
      ctx.beginPath();
      ctx.arc(sx, sy, 4 + i * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // 日珥
    var prom = 7 + 3 * Math.sin(t * 1.5);
    ctx.fillStyle = 'rgba(255,91,91,0.7)';
    ctx.beginPath();
    ctx.arc(cx, cy - maxR * 0.75, prom, 0, Math.PI * 2);
    ctx.fill();
    // 标签
    ctx.fillStyle = 'rgba(232,236,247,0.85)';
    ctx.font = '9.5px sans-serif';
    ctx.textAlign = 'center';
    layers.forEach(function(L, i){
      var y = cy - L.r * pulse + 9;
      if (y > 14 && y < h - 12) ctx.fillText(L.n, cx, y);
    });
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('太阳分层结构 · 黑子与日珥动态', w / 2, h - 6);
    ctx.textAlign = 'left';
  }
};

/* 光年 */
SimEngine.sims.lightyear = {
  height:190,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 40; i++){
      var sx = (i * 89) % w, sy = (i * 53) % h;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var cy = h / 2;
    var x1 = 40, x2 = w - 40;
    var sg = ctx.createRadialGradient(x1, cy, 0, x1, cy, 22);
    sg.addColorStop(0, '#FFF5B0');
    sg.addColorStop(0.6, '#FFD84D');
    sg.addColorStop(1, 'rgba(224,138,30,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(x1, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFD84D';
    ctx.beginPath();
    ctx.arc(x1, cy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x2, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    // 光线轨迹
    var p = (t * 0.35) % 1;
    var px = x1 + (x2 - x1) * p;
    ctx.strokeStyle = 'rgba(79,168,255,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, cy);
    ctx.lineTo(x2, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    // 光点
    ctx.fillStyle = '#4FA8FF';
    ctx.beginPath();
    ctx.arc(px, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    var flash = 0.5 + 0.5 * Math.abs(Math.sin(t * 5));
    ctx.fillStyle = 'rgba(79,168,255,' + flash + ')';
    ctx.beginPath();
    ctx.arc(px, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    // 标签
    ctx.fillStyle = '#FFD84D';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('太阳', x1, cy + 32);
    ctx.fillStyle = '#fff';
    ctx.fillText('比邻星 4.22光年', x2, cy + 32);
    ctx.fillStyle = '#4FA8FF';
    ctx.fillText('光速 30万 km/s', w / 2, cy - 28);
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.fillText('1光年 ≈ 9.46万亿千米', w / 2, h - 8);
    ctx.textAlign = 'left';
  }
};

/* 火箭 */
SimEngine.sims.rocket = {
  height:230,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 60; i++){
      var sx = (i * 73) % w, sy = (i * 41) % h;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + (i % 5) * 0.1) + ')';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var earthX = 60, earthY = h - 40, earthR = 26;
    var eg = ctx.createRadialGradient(earthX - 5, earthY - 5, 0, earthX, earthY, earthR);
    eg.addColorStop(0, '#4FA8FF');
    eg.addColorStop(1, '#1E4FA8');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(46,212,122,0.7)';
    ctx.beginPath();
    ctx.ellipse(earthX - 6, earthY - 4, 10, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(earthX + 8, earthY + 6, 7, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    var moonA = t * 0.6;
    var moonR = 70;
    var mx = earthX + Math.cos(moonA) * moonR;
    var my = earthY + Math.sin(moonA) * moonR;
    ctx.fillStyle = '#B8C2DC';
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.fill();
    // 火箭
    var rp = (t * 0.35) % 1;
    var rx = earthX + (w - 100 - earthX) * rp;
    var ry = earthY - (earthY - 30) * rp;
    ctx.strokeStyle = 'rgba(255,184,77,0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 22, ry + 13);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,91,91,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 32, ry + 19);
    ctx.stroke();
    ctx.fillStyle = '#E8ECF7';
    ctx.beginPath();
    ctx.moveTo(rx, ry - 11);
    ctx.lineTo(rx - 5, ry + 9);
    ctx.lineTo(rx + 5, ry + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FF5B5B';
    ctx.beginPath();
    ctx.moveTo(rx, ry - 11);
    ctx.lineTo(rx - 3, ry - 3);
    ctx.lineTo(rx + 3, ry - 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8A93B8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('地球', earthX, earthY + earthR + 12);
    ctx.fillText('月球', mx, my + 18);
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.fillText('航天探索：地球 → 月球 → 深空', w / 2, h - 6);
    ctx.textAlign = 'left';
  }
};

/* 地平坐标 */
SimEngine.sims.coord = {
  height:230,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 40; i++){
      var sx = (i * 79) % w, sy = (i * 43) % h;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var cx = w / 2, cy = h / 2 + 20;
    var R = Math.min(w / 2 - 30, h - 60);
    // 地平圈
    ctx.strokeStyle = 'rgba(79,168,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 天球
    ctx.strokeStyle = 'rgba(58,74,120,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * 0.9, 0, Math.PI, 0);
    ctx.stroke();
    // 天赤道
    ctx.strokeStyle = 'rgba(255,216,77,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(cx, cy - R * 0.3, R * 0.9, R * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // 观测者
    ctx.fillStyle = '#4FA8FF';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8A93B8';
    ctx.font = '9.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('观测者', cx, cy + 16);
    // 天顶
    ctx.fillStyle = '#A78BFA';
    ctx.beginPath();
    ctx.arc(cx, cy - R * 0.9, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('天顶', cx, cy - R * 0.9 - 7);
    // 东西
    ctx.fillStyle = '#4FA8FF';
    ctx.beginPath(); ctx.arc(cx - R, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + R, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillText('西', cx - R, cy - 8);
    ctx.fillText('东', cx + R, cy - 8);
    // 天体运动
    var ang = t * 0.4;
    var tx = cx + Math.cos(ang) * R * 0.7;
    var ty = cy - R * 0.6 - Math.sin(ang) * R * 0.2;
    var pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * 2));
    ctx.fillStyle = 'rgba(255,216,77,' + pulse + ')';
    ctx.beginPath();
    ctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,216,77,0.4)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#FFD84D';
    ctx.fillText('天体', tx + 11, ty + 4);
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.fillText('地平坐标 · 方位角 + 地平高度', w / 2, h - 6);
    ctx.textAlign = 'left';
  }
};

/* 黑洞 */
SimEngine.sims.blackhole = {
  height:230,
  draw:function(ctx,w,h,t){
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0,0,w,h);
    for (var i = 0; i < 60; i++){
      var sx = (i * 67) % w, sy = (i * 47) % h;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.12 + (i % 4) * 0.08) + ')';
      ctx.fillRect(sx, sy, 1, 1);
    }
    var cx = w / 2, cy = h / 2;
    var bhR = 28;
    // 吸积盘
    for (var k = 0; k < 3; k++){
      var rr = bhR + 14 + k * 18;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * (0.6 - k * 0.15) + k * 0.6);
      var g = ctx.createLinearGradient(-rr, 0, rr, 0);
      g.addColorStop(0, 'rgba(255,184,77,0)');
      g.addColorStop(0.3, 'rgba(255,184,77,0.7)');
      g.addColorStop(0.5, 'rgba(255,216,77,0.95)');
      g.addColorStop(0.7, 'rgba(255,184,77,0.7)');
      g.addColorStop(1, 'rgba(255,184,77,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 4.5 - k;
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // 事件视界
    var bhG = ctx.createRadialGradient(cx, cy, 0, cx, cy, bhR);
    bhG.addColorStop(0, '#000');
    bhG.addColorStop(0.85, '#000');
    bhG.addColorStop(1, 'rgba(255,216,77,0.9)');
    ctx.fillStyle = bhG;
    ctx.beginPath();
    ctx.arc(cx, cy, bhR, 0, Math.PI * 2);
    ctx.fill();
    // 光子环
    var pulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 1.5));
    ctx.strokeStyle = 'rgba(255,216,77,' + pulse + ')';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, bhR + 2, 0, Math.PI * 2);
    ctx.stroke();
    // 落入物质
    for (var i = 0; i < 10; i++){
      var a = t * 0.8 + i * Math.PI / 5;
      var rr2 = 70 - (t * 20 + i * 6) % 55;
      if (rr2 < bhR + 4) continue;
      var px = cx + Math.cos(a) * rr2;
      var py = cy + Math.sin(a) * rr2 * 0.4;
      ctx.fillStyle = 'rgba(255,245,180,' + (rr2 / 90) + ')';
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(138,147,184,0.75)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('黑洞 · 事件视界 + 光子环 + 吸积盘', w / 2, h - 8);
    ctx.textAlign = 'left';
  }
};

/* ==========================================
   模拟器 HTML 包装
   ========================================== */
var SIM_TITLES = {
  solar:'太阳系轨道动态模型', moonPhase:'月相变化动态模拟', eclipse:'日食几何动态演示',
  evolution:'恒星演化时间轴', telescope:'望远镜光路追踪', galaxy:'银河系旋转模型',
  earth:'地球公转与四季', spectrum:'恒星光谱温度色带', hr:'赫罗图动态演示',
  starMap:'北斗七星与北极星', meteor:'流星雨动态演示', sunStruct:'太阳分层结构',
  lightyear:'光年距离动画', rocket:'航天探索轨迹', coord:'地平坐标动态演示',
  blackhole:'黑洞吸积盘动态'
};
var SIM_HINTS = {
  solar:'拖动速度滑块可加快/减慢行星运动，行星按真实相对周期运行。',
  moonPhase:'月相自动循环演示，从新月经上弦、满月到下弦再回到新月。',
  eclipse:'月球从右向左穿过太阳前方，演示日食的几何关系。',
  evolution:'恒星从分子云到白矮星的完整演化过程循环展示。',
  telescope:'追踪光线从平行入射、物镜汇聚到目镜成像的完整路径。',
  galaxy:'银河系俯视旋转模型，太阳系位于猎户臂上。',
  earth:'地球绕太阳公转，展示地轴倾斜与四季形成。',
  spectrum:'恒星光谱型色带，高亮指针循环展示各温度区间。',
  hr:'赫罗图上太阳位于主序带，可对比巨星与白矮星区域。',
  starMap:'北斗七星勺头两星延长约5倍即可找到北极星。',
  meteor:'流星体进入地球大气层摩擦燃烧的动态演示。',
  sunStruct:'太阳各层结构，含动态黑子与日珥。',
  lightyear:'光从太阳传播到比邻星需要4.22年。',
  rocket:'从地球出发，经月球飞向深空的航天轨迹。',
  coord:'地平坐标系统：方位角+地平高度，天体随天球运动。',
  blackhole:'黑洞、事件视界、光子环与吸积盘旋转动态。'
};

function simHTML(id, customTitle){
  var title = customTitle || SIM_TITLES[id] || '动态模拟';
  var hint = SIM_HINTS[id] || '';
  return '<div class="sim-box" data-simid="' + id + '">' +
    '<div class="sim-head"><span class="sim-tag"> ' + title + '</span><span class="sim-info">动态模拟</span></div>' +
    '<canvas class="sim-canvas" data-sim="' + id + '" id="sim_' + id + '_' + Math.random().toString(36).slice(2, 8) + '"></canvas>' +
    '<div class="sim-ctrl">' +
      '<button class="sim-play active">⏸ 暂停</button>' +
      '<button class="sim-reset">↺ 重置</button>' +
      '<div class="sim-sp"><span>速度</span><input type="range" class="sim-speed" min="0.3" max="3" step="0.1" value="1"><span class="sim-sp-val">1.0x</span></div>' +
    '</div>' +
    (hint ? '<div class="dyn-caption">' + hint + '</div>' : '') +
    '</div>';
}

/* ==========================================
   模拟器控制事件委托（修复速度调节）
   ========================================== */
document.addEventListener('click', function(e){
  var btn = e.target.closest('.sim-ctrl button');
  if (!btn) return;
  var box = btn.closest('.sim-box');
  if (!box) return;
  var cv = box.querySelector('.sim-canvas');
  if (!cv) return;
  var inst = SimEngine.active[cv.id];
  if (!inst) return;
  if (btn.classList.contains('sim-play')){
    inst.playing = !inst.playing;
    btn.textContent = inst.playing ? '⏸ 暂停' : '▶ 播放';
    btn.classList.toggle('active', inst.playing);
  } else if (btn.classList.contains('sim-reset')){
    inst.t = 0;
  }
});
document.addEventListener('input', function(e){
  if (!e.target.classList.contains('sim-speed')) return;
  var box = e.target.closest('.sim-box');
  if (!box) return;
  var cv = box.querySelector('.sim-canvas');
  if (!cv) return;
  var inst = SimEngine.active[cv.id];
  if (!inst) return;
  var v = parseFloat(e.target.value);
  if (isNaN(v)) v = 1;
  inst.speed = v;
  var label = box.querySelector('.sim-sp-val');
  if (label) label.textContent = v.toFixed(1) + 'x';
});

/* ==========================================
   读报器（优化音量与风格）
   ========================================== */
var Reader = {
  synth: window.speechSynthesis,
  utterance: null,
  sentences: [],
  idx: 0,
  playing: false,
  speed: 1,
  volume: 1,
  pitch: 1.05,
  current: null,
  voices: [],
  chineseVoices: [],
  bestVoice: null,

  init: function(){
    var self = this;
    if (!this.synth){ console.warn('浏览器不支持语音合成'); return; }
    var prefs = Store.getPrefs();
    this.speed = prefs.speed || 1;
    this.volume = prefs.volume || 1;
    this.pitch = prefs.pitch || 1.05;

    var loadVoices = function(){
      self.voices = self.synth.getVoices();
      self.pickBestVoice();
      // 更新 UI
      var sp = $('#rSpeed'); if (sp) sp.value = self.speed;
      var sv = $('#rSpeedVal'); if (sv) sv.textContent = self.speed.toFixed(1) + 'x';
      var vp = $('#rVol'); if (vp) vp.value = self.volume;
      var vv = $('#rVolVal'); if (vv) vv.textContent = Math.round(self.volume * 100) + '%';
      var pp = $('#rPitch'); if (pp) pp.value = self.pitch;
      var pv = $('#rPitchVal'); if (pv) pv.textContent = self.pitch.toFixed(2);
    };
    loadVoices();
    if (this.synth.onvoiceschanged !== undefined){
      this.synth.onvoiceschanged = loadVoices;
    }
  },

  pickBestVoice: function(){
    var zh = this.voices.filter(function(v){
      return v.lang && (v.lang.indexOf('zh') === 0 || v.lang.indexOf('cmn') === 0 || v.lang.indexOf('Chinese') >= 0);
    });
    this.chineseVoices = zh;
    // 优先级：自然语音 > 云端 > 普通
    var priority = [
      /Microsoft\s*(Xiaoxiao|Yunxi|Yunyang|Xiaoyi)/i,
      /Google\s*普通话/i,
      /Ting-?Ting|Tingting/i,
      /Mei-?Jia|Meijia/i,
      /Sin-?ji/i,
      /Yaoyao/i,
      /Xiaoxiao|Yunxi|Yunyang/i,
      /zh-CN/i,
      /zh/i
    ];
    var self = this;
    this.bestVoice = null;
    for (var p = 0; p < priority.length && !this.bestVoice; p++){
      for (var i = 0; i < zh.length; i++){
        if (priority[p].test(zh[i].name)){ self.bestVoice = zh[i]; break; }
      }
    }
    if (!this.bestVoice && zh.length) this.bestVoice = zh[0];
  },

  splitSentences: function(text){
    var parts = text.replace(/\n+/g, '。\n').split(/(?<=[。！？；\n])/g)
      .map(function(s){ return s.trim(); })
      .filter(function(s){ return s.length > 1; });
    var result = [];
    parts.forEach(function(p){
      if (p.length > 55){
        p.split(/(?<=[，、：])/g).forEach(function(s){
          if (s.trim().length > 1) result.push(s.trim());
        });
      } else {
        result.push(p);
      }
    });
    return result;
  },

  read: function(news){
    this.stop();
    if (!this.synth){
      alert('当前浏览器不支持语音朗读，请使用 Chrome / Edge / Safari 打开');
      return;
    }
    this.current = news;
    this.sentences = this.splitSentences(news.body);
    if (!this.sentences.length){ alert('无法解析文本'); return; }
    this.idx = 0;
    this.playing = true;
    this.showPanel(news);
    this.speakNext();
  },

  speakNext: function(){
    var self = this;
    if (!this.playing || this.idx >= this.sentences.length){
      if (this.idx >= this.sentences.length){
        this.playing = false;
        this.updatePlayBtn();
        var st = $('#readerStatus'); if (st) st.textContent = '朗读完毕';
      }
      return;
    }
    var text = this.sentences[this.idx];
    var u = new SpeechSynthesisUtterance(text);
    if (this.bestVoice) u.voice = this.bestVoice;
    u.lang = 'zh-CN';
    u.rate = this.speed;
    u.volume = this.volume;
    u.pitch = this.pitch;
    u.onend = function(){
      if (!self.playing) return;
      self.idx++;
      self.highlightCurrent();
      // 短延迟更自然
      setTimeout(function(){ self.speakNext(); }, 60);
    };
    u.onerror = function(){
      if (!self.playing) return;
      self.idx++;
      self.highlightCurrent();
      setTimeout(function(){ self.speakNext(); }, 60);
    };
    this.utterance = u;
    this.highlightCurrent();
    this.synth.speak(u);
  },

  highlightCurrent: function(){
    var container = $('#readerText');
    if (!container || !this.current) return;
    var html = '';
    var self = this;
    this.sentences.forEach(function(s, i){
      html += '<span class="' + (i === self.idx ? 'hl' : '') + '">' + esc(s) + '</span>';
    });
    container.innerHTML = html;
    var st = $('#readerStatus');
    if (st) st.textContent = (this.idx + 1) + ' / ' + this.sentences.length + ' 句';
    var el = container.querySelector('.hl');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },

  showPanel: function(news){
    var panel = $('#readerPanel');
    if (!panel) return;
    var t = $('#readerTitle'); if (t) t.textContent = news.title;
    var container = $('#readerText');
    if (container){
      var self = this;
      var html = '';
      this.sentences.forEach(function(s, i){
        html += '<span class="' + (i === 0 ? 'hl' : '') + '">' + esc(s) + '</span>';
      });
      container.innerHTML = html;
    }
    panel.classList.add('show');
    this.updatePlayBtn();
  },

  updatePlayBtn: function(){
    var btn = $('#readerPlay');
    if (!btn) return;
    if (this.playing){
      btn.textContent = '⏸ 暂停';
      btn.classList.add('playing');
    } else {
      btn.textContent = '▶ 播放';
      btn.classList.remove('playing');
    }
    document.querySelectorAll('.news-card').forEach(function(c){
      c.classList.toggle('active', Reader.current && c.dataset.id === Reader.current.id);
    });
  },

  toggle: function(){
    if (!this.current){
      alert('请先选择一条资讯');
      return;
    }
    if (this.playing){
      this.playing = false;
      this.synth.cancel();
      this.updatePlayBtn();
      var st = $('#readerStatus');
      if (st) st.textContent = '已暂停 (' + (this.idx + 1) + '/' + this.sentences.length + ')';
    } else {
      if (this.idx >= this.sentences.length) this.idx = 0;
      this.playing = true;
      this.updatePlayBtn();
      this.speakNext();
    }
  },

  stop: function(){
    if (this.synth) this.synth.cancel();
    this.playing = false;
    this.idx = 0;
    this.updatePlayBtn();
    var p = $('#readerPanel'); if (p) p.classList.remove('show');
    document.querySelectorAll('.news-card').forEach(function(c){ c.classList.remove('active'); });
  },

  prev: function(){
    if (!this.playing) return;
    this.idx = Math.max(0, this.idx - 1);
    this.synth.cancel();
    this.speakNext();
  },

  next: function(){
    if (!this.playing) return;
    this.idx = Math.min(this.sentences.length - 1, this.idx + 1);
    this.synth.cancel();
    this.speakNext();
  },

  setSpeed: function(v){
    this.speed = parseFloat(v) || 1;
    var el = $('#rSpeedVal'); if (el) el.textContent = this.speed.toFixed(1) + 'x';
    var prefs = Store.getPrefs(); prefs.speed = this.speed; Store.savePrefs(prefs);
    if (this.playing){
      this.synth.cancel();
      setTimeout(this.speakNext.bind(this), 80);
    }
  },
  setVolume: function(v){
    this.volume = parseFloat(v) || 1;
    var el = $('#rVolVal'); if (el) el.textContent = Math.round(this.volume * 100) + '%';
    var prefs = Store.getPrefs(); prefs.volume = this.volume; Store.savePrefs(prefs);
    if (this.playing){
      this.synth.cancel();
      setTimeout(this.speakNext.bind(this), 80);
    }
  },
  setPitch: function(v){
    this.pitch = parseFloat(v) || 1;
    var el = $('#rPitchVal'); if (el) el.textContent = this.pitch.toFixed(2);
    var prefs = Store.getPrefs(); prefs.pitch = this.pitch; Store.savePrefs(prefs);
    if (this.playing){
      this.synth.cancel();
      setTimeout(this.speakNext.bind(this), 80);
    }
  }
};
Reader.init();

/* ==========================================
   AI 知识库与模型
   ========================================== */
var AI_MODELS = [
  {id:'general', name:'通用天文助手', icon:'', desc:'天文竞赛综合问答'},
  {id:'quiz', name:'随机出题官', icon:'', desc:'随机抽取题目测验'},
  {id:'explain', name:'概念讲解员', icon:'', desc:'通俗讲解天文概念'},
  {id:'exam', name:'竞赛教练', icon:'', desc:'备赛策略与考点解析'}
];

var AI_KB = [
{keys:['黑洞'],a:'黑洞是引力极强的天体，连光都无法逃脱。\n\n【形成】足够大质量恒星在演化末期可能发生核心坍缩并形成黑洞；具体结局取决于初始质量、质量损失、金属丰度与双星相互作用等因素，并不存在适用于所有恒星的单一质量阈值。\n\n【结构】\n· 事件视界：有去无回的边界\n· 奇点：经典广义相对论解中的理论预测；真实中心状态仍需量子引力理论解释\n· 吸积盘：周围高速旋转的物质\n\n【著名黑洞】\n· 人马座A*：银河系中心，约430万倍太阳质量\n· M87*：2019年首张黑洞照片的主角'},
{keys:['中子星','脉冲星'],a:'中子星是恒星演化的终点之一。\n\n【特点】\n· 直径仅约20千米，质量是太阳的1.4~3倍\n· 密度极大：1立方厘米约重10亿吨\n· 自转极快，磁场极强\n\n【脉冲星】快速自转的中子星，发出周期性脉冲信号。'},
{keys:['太阳系','八大行星','行星'],a:'太阳系由太阳和围绕它运动的天体组成。\n\n【八大行星（由近到远）】\n水星→金星→地球→火星→木星→土星→天王星→海王星\n\n【分类】\n· 类地行星：水、金、地、火（岩石）\n· 巨行星：木星、土星（气态）\n· 远日行星：天王、海王（冰质）\n\n【其他】矮行星、小行星带、柯伊伯带、奥尔特云'},
{keys:['月相','上弦月','下弦月','满月','新月'],a:'月相变化是月球绕地球运动时，被太阳照亮部分朝向地球角度不同造成的。\n\n【口诀】上上上西西，下下下东东\n· 上弦月：上半夜、西边、亮面朝西\n· 下弦月：下半夜、东边、亮面朝东\n\n【周期】朔望月约29.53天'},
{keys:['日食','月食'],a:'日月食是日地月三者共线的天文现象。\n\n【日食】太阳→月球→地球，发生在农历初一\n【月食】太阳→地球→月球，发生在农历十五前后\n\n【为什么不是每月都有？】\n白道与黄道有约5°09′夹角。'},
{keys:['北极星','北斗'],a:'北极星是离北天极最近的亮星。\n\n【如何找到】\n1. 找到北斗七星\n2. 勺头两星连线\n3. 朝勺口延长约5倍\n\n【重要】\n· 北极星地平高度 ≈ 观测者地理纬度\n· 北极星不是最亮的星（天狼星最亮）'},
{keys:['银河系','星系','宇宙'],a:'银河系是我们的家园星系。\n\n【基本参数】\n· 类型：棒旋星系\n· 直径：约10万光年\n· 恒星：约1000~4000亿颗\n· 太阳位置：距银心约2.6万光年\n\n【宇宙膨胀】哈勃定律 v = H₀·d\n可观测宇宙直径约930亿光年。'},
{keys:['望远镜'],a:'天文望远镜的核心是"聚光"而非"放大"。\n\n【关键参数】\n· 口径：物镜直径，决定聚光能力（最重要）\n· 放大倍率 = 物镜焦距 ÷ 目镜焦距\n\n【类型】\n· 折射式：凸透镜物镜\n· 反射式：凹面镜物镜\n· 折反射式：兼顾两者'},
{keys:['恒星演化','白矮星','红巨星'],a:'恒星的一生与质量密切相关。\n\n【小质量恒星】\n分子云→主序星→红巨星→行星状星云→白矮星\n\n【大质量恒星】\n分子云→主序星→红超巨星→超新星爆发\n→中子星或黑洞'},
{keys:['星等'],a:'星等是天体亮度的度量。\n\n【视星等】肉眼看到的亮度，越小越亮\n· 太阳：-26.7 · 满月：-12.7 · 天狼星：-1.46\n\n【绝对星等】把恒星放到10秒差距处的视星等\n\n【关系】M = m + 5 − 5·lg d'},
{keys:['光年','天文单位','秒差距'],a:'天文距离单位：\n\n【天文单位 AU】1 AU ≈ 1.496亿千米\n【光年 ly】1 ly ≈ 9.46万亿千米\n【秒差距 pc】1 pc ≈ 3.26光年 ≈ 206265 AU\n\n【换算】秒差距 > 光年 > 天文单位'},
{keys:['航天','杨利伟','加加林'],a:'航天里程碑：\n\n【世界】1961年加加林首次进入太空\n【世界】1969年阿姆斯特朗首次登月\n【中国】2003年杨利伟乘神舟五号\n【中国】2016年FAST"中国天眼"落成\n【中国】2020年嫦娥五号月球采样返回'},
{keys:['流星','流星雨','陨石'],a:'流星是流星体进入大气层摩擦燃烧的现象。\n\n【流星雨】地球穿过彗星尘埃带时形成\n\n【著名流星雨】\n· 英仙座（8月）\n· 双子座（12月）\n· 象限仪座（1月）'},
{keys:['太阳黑子','太阳活动','耀斑'],a:'太阳活动的主要形式：\n\n【太阳黑子】光球上的低温暗区，周期约11年\n【耀斑】色球突然爆发\n【日珥】喷出的巨大气体\n【太阳风】日冕向外吹出的粒子流'},
{keys:['天球','赤经','赤纬','黄道'],a:'【天球】以观测者为球心的假想球面。\n\n【赤道坐标】\n· 赤经 α：自春分点起算，向东度量\n· 赤纬 δ：自天赤道起算，北正南负\n\n【黄道】太阳周年视运动的轨迹，与天赤道约成23°26′夹角。'},
{keys:['深空','星云','星团','类星体'],a:'深空天体包括星云、星团、星系等。\n\n【星云】M42猎户座大星云、M1蟹状星云\n【星团】昴星团M45（疏散）、M13（球状）\n【特殊】类星体、脉冲星、黑洞'}
];

/* ==========================================
   题型工具
   ========================================== */
function isCorrect(q, ua){
  return window.PennyQuestionGrading.isCorrect(q, ua, norm);
}
function isAnswered(q, ua){
  if (q.type === 'multi' || q.type === 'order') return Array.isArray(ua) && ua.length > 0;
  if (q.type === 'fill') return String(ua == null ? '' : ua).trim() !== '';
  return ua !== undefined && ua !== null && ua !== -1;
}
function answerText(q){
  if (q.type === 'single' || q.type === 'image') return LETTERS[q.answer];
  if (q.type === 'judge') return q.answer === 0 ? '正确' : '错误';
  if (q.type === 'multi') return q.answer.map(function(i){return LETTERS[i];}).join('、');
  if (q.type === 'fill') return q.answer[0];
  if (q.type === 'order') return q.answer.map(function(i){return q.options[i];}).join(' → ');
  return '';
}
function typeLabel(t){return {single:'单选',multi:'多选',judge:'判断',fill:'填空',order:'排序',image:'图片'}[t]||'题目';}
function typeBadge(t){return {single:'blue',multi:'purple',judge:'green',fill:'amber',order:'purple',image:'blue'}[t]||'';}

/* ==========================================
   数据查询
   ========================================== */
function getQuestions(level, category){
  return Q.filter(function(q){return (!level||q.level===level)&&(!category||q.category===category);});
}
function getCategories(level){
  var s = {};
  Q.forEach(function(q){if(q.level===level)s[q.category]=1;});
  return Object.keys(s);
}
function getKnowledge(level, category){
  for (var i = 0; i < KNOWLEDGE.length; i++){
    if (KNOWLEDGE[i].level === level && KNOWLEDGE[i].category === category) return KNOWLEDGE[i];
  }
  return null;
}
function getDaily(level){
  var p = getQuestions(level);
  if (!p.length) return null;
  var d = Math.floor(Date.now() / 86400000);
  return p[d % p.length];
}
function getMastery(level, category){
  var qs = getQuestions(level, category);
  var st = Store.getQStats();
  var t=0,c=0;
  qs.forEach(function(q){var s=st[q.id];if(s){t+=s.t;c+=s.c;}});
  var wid = Store.getWrong().map(function(w){return w.id;});
  var wc = qs.filter(function(q){return wid.indexOf(q.id)>=0;}).length;
  return {total:qs.length,answered:t,correct:c,rate:t?Math.round(c/t*100):0,wrongCount:wc};
}

/* ==========================================
   状态与路由
   ========================================== */
var state = {
  page:'home', level:'小学', practice:null, exam:null, result:null,
  learnCategory:null, expanded:{}, aiMsgs:[], aiTyping:false,
  newsFilter:'全部', aiModel:'general'
};
var timers = [];
function clearTimers(){timers.forEach(function(t){clearInterval(t);});timers=[];}

var TITLES = {
  home:'星赛通 · 戴煜', learn:'知识点学习', news:'天文知识读报', ai:'本地知识库助手',
  wrong:'错题归纳', profile:'我的', practice:'练习', exam:'模拟竞赛',
  result:'成绩单', learnDetail:'知识点详情'
};
var TABS = ['home','learn','ai','news','wrong','profile'];

function go(p,o){
  SimEngine.stopAll();
  if (state.page === 'news' && p !== 'news') Reader.stop();
  state.page = p;
  if (o) Object.assign(state, o);
  window.scrollTo(0,0);
  render();
}

/* ==========================================
   渲染
   ========================================== */
var view = $('#view'), navTitle = $('#navTitle'), backBtn = $('#backBtn'), tabbar = $('#tabbar');

function render(){
  clearTimers();
  navTitle.textContent = TITLES[state.page] || '星赛通';
  if (TABS.indexOf(state.page) >= 0){
    backBtn.classList.add('hidden');
    tabbar.classList.remove('hidden');
    document.querySelectorAll('.tabbar button').forEach(function(b){
      b.classList.toggle('active', b.dataset.tab === state.page);
    });
  } else {
    backBtn.classList.remove('hidden');
    tabbar.classList.add('hidden');
  }
  var map = {
    home:renderHome, practice:renderPractice, exam:renderExam, result:renderResult,
    wrong:renderWrong, learn:renderLearn, learnDetail:renderLearnDetail,
    ai:renderAI, profile:renderProfile, news:renderNews
  };
  var fn = map[state.page] || renderHome;
  view.innerHTML = fn();
  if (state.page === 'exam' && state.exam && state.exam.running) startExamTimer();
  if (state.page === 'learnDetail') setTimeout(function(){ SimEngine.startAll(); }, 30);
  if (state.page === 'home') setTimeout(function(){ SimEngine.startAll(); }, 30);
}

/* ==========================================
   首页：一目了然的学习地图
   ========================================== */
function renderHome(){
  var cats = getCategories(state.level);
  var totalQ = Q.filter(function(q){return q.level===state.level;}).length;
  var stats = Store.getStats();

  // 计算总体掌握度
  var totalT = 0, totalC = 0;
  cats.forEach(function(c){
    var m = getMastery(state.level, c);
    totalT += m.answered; totalC += m.correct;
  });
  var overall = totalT ? Math.round(totalC / totalT * 100) : 0;
  var circleDash = Math.round(overall * 1.13);

  var h = '';
  // 品牌区
  h += '<div class="brand"><h2>星赛通</h2>' +
    '<div class="sub">小学 · 初中天文知识竞赛智能备赛</div>' +
    '<div class="sign">作者：<b>戴煜</b> · 18662613315@163.com</div></div>';

  // 年级切换
  h += '<div class="level-switch" style="display:flex;background:var(--bg2);border:1px solid var(--line);border-radius:999px;padding:5px;margin-bottom:14px;">' +
    '<button style="flex:1;padding:10px 0;border:none;background:' + (state.level==='小学'?'linear-gradient(135deg,#2F7BFF,#4FA8FF)':'transparent') + ';cursor:pointer;border-radius:999px;color:' + (state.level==='小学'?'#fff':'var(--sub)') + ';font-size:14px;font-family:inherit;font-weight:600;" onclick="switchLevel(\'小学\')">小学组</button>' +
    '<button style="flex:1;padding:10px 0;border:none;background:' + (state.level==='初中'?'linear-gradient(135deg,#2F7BFF,#4FA8FF)':'transparent') + ';cursor:pointer;border-radius:999px;color:' + (state.level==='初中'?'#fff':'var(--sub)') + ';font-size:14px;font-family:inherit;font-weight:600;" onclick="switchLevel(\'初中\')">初中组</button></div>';

  // 学习进度概览
  h += '<div class="progress-overview">' +
    '<div class="po-row">' +
    '<div class="po-circle">' +
    '<svg width="64" height="64" viewBox="0 0 64 64">' +
    '<circle cx="32" cy="32" r="26" fill="none" stroke="rgba(79,168,255,.15)" stroke-width="6"/>' +
    '<circle cx="32" cy="32" r="26" fill="none" stroke="url(#pg1)" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + circleDash + ' 200"/>' +
    '<defs><linearGradient id="pg1"><stop offset="0" stop-color="#2F7BFF"/><stop offset="1" stop-color="#4FA8FF"/></linearGradient></defs>' +
    '</svg>' +
    '<div class="po-num">' + overall + '%</div>' +
    '</div>' +
    '<div class="po-info">' +
    '<h4>学习进度 · ' + state.level + '组</h4>' +
    '<p>共 <b>' + totalQ + '</b> 道题 · <b>' + cats.length + '</b> 个知识点<br>' +
    '累计答题 <b>' + stats.total + '</b> 题 · 正确率 <b>' + stats.rate + '%</b><br>' +
    '学习 <b>' + stats.days + '</b> 天 · 错题 <b>' + stats.wrongCount + '</b> 道</p>' +
    '</div></div></div>';

  // 快捷入口
  h += '<div class="sec-title"> 快速开始</div>';
  h += '<div class="quick-grid">' +
    '<div class="quick-card q-blue" onclick="startPractice(\'' + state.level + '\',\'\')"><span class="qi"></span><div class="qt">开始练习</div><div class="qs">5 种题型</div></div>' +
    '<div class="quick-card q-purple" onclick="startExam(\'' + state.level + '\')"><span class="qi">⏱️</span><div class="qt">模拟竞赛</div><div class="qs">限时倒扣分</div></div>' +
    '<div class="quick-card q-cyan" onclick="go(\'learn\')"><span class="qi"></span><div class="qt">知识学习</div><div class="qs">动态模拟</div></div>' +
    '<div class="quick-card q-green" onclick="go(\'news\')"><span class="qi"></span><div class="qt">天文读报</div><div class="qs">语音播报</div></div>' +
    '<div class="quick-card q-amber" onclick="go(\'ai\')"><span class="qi">烙</span><div class="qt">AI 模型</div><div class="qs">智能问答</div></div>' +
    '<div class="quick-card q-pink" onclick="go(\'wrong\')"><span class="qi"></span><div class="qt">错题归纳</div><div class="qs">' + stats.wrongCount + ' 道</div></div>' +
    '</div>';

  // 每日一题
  var daily = getDaily(state.level);
  if (daily){
    h += '<div class="sec-title"> 每日一题</div>';
    h += '<div class="card">' +
      '<div style="font-size:12px;color:var(--blue);font-weight:700;margin-bottom:8px;">' + esc(daily.category) + ' <span class="type-badge ' + typeBadge(daily.type) + '">' + typeLabel(daily.type) + '</span></div>' +
      '<div style="font-size:15.5px;line-height:1.6;margin-bottom:10px;font-weight:500;">' + esc(daily.stem) + '</div>';
    if (daily.type === 'fill' || daily.type === 'order'){
      h += '<div style="color:var(--sub);font-size:13px;">（进入练习作答）</div>';
    } else if (daily.options){
      h += '<div style="color:#B8C2DC;font-size:13.5px;line-height:1.9;">' + daily.options.map(function(t,i){return LETTERS[i]+'. '+esc(t);}).join('<br>') + '</div>';
    }
    h += '<div id="dailyHint" style="display:none;margin-top:11px;padding:10px;background:rgba(79,168,255,.08);border-radius:9px;font-size:13px;line-height:1.7;">' +
      '<div style="color:var(--green);font-weight:700;margin-bottom:4px;">✅ 正确答案：' + esc(answerText(daily)) + '</div>' +
      '<div style="color:var(--sub);font-size:12.5px;">' + esc(daily.explanation) + '</div></div>' +
      '<button class="btn btn-ghost" style="margin-top:12px;padding:9px;font-size:13.5px;" id="dailyBtn" onclick="toggleDaily()">查看答案</button>' +
      '</div>';
  }

  // 知识点地图
  h += '<div class="sec-title">️ 知识点地图（' + cats.length + ' 个）</div>';
  h += '<div class="map-grid">';
  cats.forEach(function(c){
    var m = getMastery(state.level, c);
    var k = getKnowledge(state.level, c);
    var icon = k ? k.icon : '';
    var bc = m.rate >= 80 ? 'var(--green)' : (m.rate >= 50 ? 'var(--amber)' : 'var(--red)');
    var bw = m.answered ? m.rate : 0;
    h += '<div class="map-card" onclick="openLearn(\'' + c.replace(/'/g,"\\'") + '\')">' +
      '<div class="map-top"><div class="map-ico">' + icon + '</div>' +
      '<div class="map-name">' + esc(c) + '</div></div>' +
      '<div class="map-bar"><i style="width:' + bw + '%;background:' + bc + ';"></i></div>' +
      '<div class="map-info"><span>' + m.total + ' 题 · ' + (m.answered ? m.rate + '%' : '未开始') + '</span>' +
      (m.wrongCount ? '<span style="color:var(--red);">错 ' + m.wrongCount + '</span>' : '') +
      '</div></div>';
  });
  h += '</div>';

  // 底部统计
  h += '<div class="version" style="margin-top:26px;">星赛通 v6.0 · 网页版<br>' +
    '作者：戴煜 · 18662613315@163.com<br>' +
    '题库 ' + Q.length + ' 题 · 知识卡 ' + KNOWLEDGE.length + ' 张 · 动态模拟 16 个 · 读报 10 条</div>';

  return h;
}
function switchLevel(l){state.level=l;render();}
var dailyShown = false;
function toggleDaily(){
  var hint = $('#dailyHint'), btn = $('#dailyBtn');
  if (!hint) return;
  dailyShown = !dailyShown;
  hint.style.display = dailyShown ? 'block' : 'none';
  btn.textContent = dailyShown ? '隐藏答案' : '查看答案';
}

/* ==========================================
   学习列表
   ========================================== */
function renderLearn(){
  var cats = getCategories(state.level);
  var h = '<div class="title">知识点学习</div><div class="sub" style="margin-bottom:14px;">先看动态知识卡片，再针对性练习</div>';
  h += '<div class="level-switch" style="display:flex;background:var(--bg2);border:1px solid var(--line);border-radius:999px;padding:5px;margin-bottom:14px;">' +
    '<button style="flex:1;padding:10px 0;border:none;background:' + (state.level==='小学'?'linear-gradient(135deg,#2F7BFF,#4FA8FF)':'transparent') + ';cursor:pointer;border-radius:999px;color:' + (state.level==='小学'?'#fff':'var(--sub)') + ';font-size:14px;font-family:inherit;font-weight:600;" onclick="switchLevel(\'小学\')">小学组</button>' +
    '<button style="flex:1;padding:10px 0;border:none;background:' + (state.level==='初中'?'linear-gradient(135deg,#2F7BFF,#4FA8FF)':'transparent') + ';cursor:pointer;border-radius:999px;color:' + (state.level==='初中'?'#fff':'var(--sub)') + ';font-size:14px;font-family:inherit;font-weight:600;" onclick="switchLevel(\'初中\')">初中组</button></div>';
  cats.forEach(function(c){
    var m = getMastery(state.level, c);
    var k = getKnowledge(state.level, c);
    var icon = k ? k.icon : '';
    var bc = m.rate >= 80 ? 'var(--green)' : (m.rate >= 50 ? 'var(--amber)' : 'var(--red)');
    var bw = m.answered ? m.rate : 0;
    var hasSim = k && k.sim ? '' : '';
    h += '<div class="learn-card" onclick="openLearn(\'' + c.replace(/'/g,"\\'") + '\')">' +
      '<div class="learn-head"><div class="learn-ico">' + icon + '</div>' +
      '<div style="flex:1;"><div class="learn-name">' + esc(c) + ' ' + hasSim + '</div>' +
      '<div class="learn-meta">' + m.total + ' 道题 · 已练 ' + m.answered + ' 道' +
      (m.wrongCount ? ' · <span style="color:var(--red);">错 ' + m.wrongCount + '</span>' : '') +
      '</div></div></div>' +
      '<div class="mastery-bar"><i style="width:' + bw + '%;background:' + bc + ';"></i></div>' +
      '<div class="mastery-info"><span>掌握度 ' + (m.answered ? m.rate + '%' : '未开始') + '</span><span>进入学习 ›</span></div></div>';
  });
  return h;
}
function openLearn(c){state.learnCategory=c;go('learnDetail');}

function renderLearnDetail(){
  var c = state.learnCategory;
  if (!c) return '<div class="empty"><div class="ico"></div><div class="txt">知识点不存在</div></div>';
  var k = getKnowledge(state.level, c);
  var m = getMastery(state.level, c);
  var list = getQuestions(state.level, c);
  var h = '<div class="tags">' +
    '<span class="tag">' + esc(state.level) + '</span>' +
    '<span class="tag">' + esc(c) + '</span>' +
    '<span class="tag ok">' + list.length + ' 道题</span>' +
    (m.wrongCount ? '<span class="tag err">错 ' + m.wrongCount + '</span>' : '') + '</div>';
  h += '<div class="title" style="font-size:22px;margin-bottom:14px;">' + (k ? esc(k.icon) + ' ' + esc(k.title) : ' ' + esc(c)) + '</div>';

  // 动态模拟器 + 知识卡片
  if (k){
    h += '<div class="study-box">' +
      '<div style="font-size:14.5px;font-weight:700;color:var(--blue);margin-bottom:10px;"> 动态演示</div>' +
      simHTML(k.sim || 'solar') +
      '<div style="font-size:14.5px;font-weight:700;color:var(--blue);margin:14px 0 10px;"> 知识卡片</div>' +
      '<div class="k-content" style="font-size:14px;line-height:1.95;">' + esc(k.content) + '</div></div>';
  }

  // 掌握度
  h += '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
    '<div style="font-size:14.5px;font-weight:700;"> 掌握情况</div>' +
    '<div style="font-size:19px;font-weight:800;color:' + (m.answered?(m.rate>=80?'var(--green)':m.rate>=50?'var(--amber)':'var(--red)'):'var(--sub)') + ';">' +
    (m.answered ? m.rate + '%' : '—') + '</div></div>' +
    '<div class="mastery-bar"><i style="width:' + (m.answered?m.rate:0) + '%;background:' + (m.rate>=80?'var(--green)':m.rate>=50?'var(--amber)':'var(--red)') + ';"></i></div>' +
    '<div class="mastery-info"><span>已答 ' + m.answered + ' · 答对 ' + m.correct + '</span><span>共 ' + m.total + ' 题</span></div></div>';

  // 题目清单
  h += '<div class="sec-title">题目清单</div><div class="card" style="padding:10px 14px;">';
  list.forEach(function(q,i){
    h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;' + (i?'border-top:1px solid var(--line);':'') + '">' +
      '<span style="font-size:12.5px;color:var(--sub);width:20px;">' + (i+1) + '</span>' +
      '<span class="type-badge ' + typeBadge(q.type) + '" style="margin:0;">' + typeLabel(q.type) + '</span>' +
      '<span style="flex:1;font-size:13px;color:#B8C2DC;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(q.stem) + '</span></div>';
  });
  h += '</div>';

  h += '<div class="btn-row" style="margin-top:20px;">' +
    '<button class="btn btn-ghost" onclick="go(\'learn\')">返回列表</button>' +
    '<button class="btn btn-main" onclick="startPractice(\'' + state.level + '\',\'' + c.replace(/'/g,"\\'") + '\')">开始练习</button></div>';
  if (m.wrongCount){
    h += '<button class="btn btn-amber" style="margin-top:10px;" onclick="reAsk(\'' + state.level + '\',\'' + c.replace(/'/g,"\\'") + '\')"> 针对错题再提问（' + m.wrongCount + ' 道）</button>';
  }
  return h;
}

/* ==========================================
   练习
   ========================================== */
function startPractice(level, category){
  var list = shuffle(getQuestions(level, category));
  if (!list.length){ alert('该知识点暂无题目'); return; }
  startWith(list, level, category || '综合练习');
}
function startWith(list, level, label){
  state.practice = {
    list:list, index:0,
    userAnswers: new Array(list.length).fill(null),
    showAnswer:false, correct:0, wrong:0,
    level:level, label:label
  };
  go('practice');
}
function renderPractice(){
  var p = state.practice;
  if (!p) return '<div class="empty"><div class="ico"></div><div class="txt">数据丢失</div></div>';
  var q = p.list[p.index];
  var ua = p.userAnswers[p.index];
  var total = p.list.length;
  var answered = isAnswered(q, ua);
  var h = '<div class="topbar">' +
    '<div class="counter">第 ' + (p.index+1) + ' / ' + total + ' 题</div>' +
    '<div class="counter"><span class="ok">✓ ' + p.correct + '</span>　<span class="no">✗ ' + p.wrong + '</span></div></div>';
  h += '<div class="progress"><i style="width:' + rate(p.index,total) + '%;"></i></div>';
  h += '<div class="card"><div class="tags">' +
    '<span class="tag">' + esc(q.level) + '</span>' +
    '<span class="tag">' + esc(q.category) + '</span>' +
    '<span class="tag amber">' + typeLabel(q.type) + '</span></div>';
  h += '<div class="stem">' + esc(q.stem) + '</div>';
  h += renderInput(q, ua, p.showAnswer, 'pChoose');
  h += '</div>';
  if (p.showAnswer){
    var ok = isCorrect(q, ua);
    h += '<div class="explain"><div class="head ' + (ok?'ok':'no') + '">' +
      (ok?'✓ 回答正确':'✗ 回答错误') + '</div>' +
      '<div class="line">正确答案：' + esc(answerText(q)) + '</div>' +
      '<div class="line">' + esc(q.explanation) + '</div></div>';
  }
  h += '<div class="footer">';
  if (!p.showAnswer){
    h += '<button class="btn btn-main" ' + (!answered?'disabled':'') + ' onclick="pSubmit()">提交答案</button>';
  } else if (p.index < total - 1){
    h += '<button class="btn btn-main" onclick="pNext()">下一题</button>';
  } else {
    h += '<button class="btn btn-main" onclick="pFinish()">完成练习</button>';
  }
  h += '</div>';
  return h;
}
function renderInput(q, ua, show, fn){
  if (q.type === 'fill'){
    var v = esc(ua == null ? '' : ua);
    var h = '<input class="fill-input" id="fillInput" type="text" value="' + v + '" placeholder="请输入答案" ' +
      (show?'disabled':'') + ' oninput="onFill(this.value)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">';
    if (show){
      var ok = isCorrect(q, ua);
      h += '<div style="margin-top:11px;font-size:12.5px;color:var(--sub);">你填写的是：<b style="color:' + (ok?'var(--green)':'var(--red)') + ';">' + esc(ua || '（空）') + '</b></div>';
    }
    return h;
  }
  if (q.type === 'order'){
    var arr = Array.isArray(ua) ? ua : [];
    var h2 = '<div style="font-size:12.5px;color:var(--sub);margin-bottom:9px;">点击选项，按正确顺序依次排列</div>';
    q.options.forEach(function(t, i){
      var pos = arr.indexOf(i);
      var taken = pos >= 0;
      var cls = 'option order-item' + (taken ? ' taken' : '');
      if (show){
        var isRight = q.answer.indexOf(i) === pos;
        cls += isRight ? ' right' : ' wrong';
      }
      h2 += '<div class="' + cls + '" onclick="' + fn + '(' + i + ')">' +
        (taken ? '<span class="order-num">' + (pos+1) + '</span>' : '<span class="opt-key">?</span>') +
        '<span class="opt-text">' + esc(t) + '</span></div>';
    });
    if (arr.length && !show){
      h2 += '<div style="margin-top:7px;font-size:11.5px;color:var(--sub);">已排：' + arr.map(function(i){return q.options[i];}).join(' → ') + '</div>';
    }
    if (show){
      h2 += '<div style="margin-top:11px;font-size:12.5px;color:var(--sub);">你的排序：' + (arr.length ? arr.map(function(i){return q.options[i];}).join(' → ') : '（空）') + '</div>';
    }
    return h2;
  }
  var isMulti = q.type === 'multi';
  var am = Array.isArray(ua) ? ua : [];
  return q.options.map(function(t, i){
    var cls = 'option';
    var sel = isMulti ? am.indexOf(i) >= 0 : (ua === i);
    var right = isMulti ? q.answer.indexOf(i) >= 0 : (q.answer === i);
    if (show){
      if (right) cls += ' right';
      else if (sel) cls += ' wrong';
      else cls += ' dim';
    } else if (sel){
      cls += ' selected';
    }
    var key = q.type === 'judge' ? (i===0?'✓':'✗') : LETTERS[i];
    return '<div class="' + cls + '" onclick="' + fn + '(' + i + ')">' +
      '<span class="opt-key">' + key + '</span>' +
      '<span class="opt-text">' + esc(t) + '</span></div>';
  }).join('');
}
function onFill(v){
  var p = state.practice;
  if (!p) return;
  p.userAnswers[p.index] = v;
  var b = document.querySelector('.footer .btn-main');
  if (b && !p.showAnswer) b.disabled = !v.trim();
}
function pChoose(i){
  var p = state.practice;
  if (!p || p.showAnswer) return;
  var q = p.list[p.index];
  if (q.type === 'multi'){
    var arr = Array.isArray(p.userAnswers[p.index]) ? p.userAnswers[p.index].slice() : [];
    var k = arr.indexOf(i);
    if (k >= 0) arr.splice(k, 1); else arr.push(i);
    p.userAnswers[p.index] = arr;
    document.querySelectorAll('.option').forEach(function(n, j){
      n.className = 'option' + (arr.indexOf(j)>=0?' selected':'');
    });
    var b = document.querySelector('.footer .btn-main');
    if (b) b.disabled = arr.length === 0;
    return;
  }
  if (q.type === 'order'){
    var a2 = Array.isArray(p.userAnswers[p.index]) ? p.userAnswers[p.index].slice() : [];
    var k2 = a2.indexOf(i);
    if (k2 >= 0) a2.splice(k2, 1); else a2.push(i);
    p.userAnswers[p.index] = a2;
    render();
    return;
  }
  p.userAnswers[p.index] = i;
  document.querySelectorAll('.option').forEach(function(n, j){
    n.className = 'option' + (j===i?' selected':'');
  });
  var b2 = document.querySelector('.footer .btn-main');
  if (b2) b2.disabled = false;
}
function pSubmit(){
  var p = state.practice;
  if (!p) return;
  var q = p.list[p.index];
  var ua = p.userAnswers[p.index];
  if (!isAnswered(q, ua)) return;
  var ok = isCorrect(q, ua);
  if (ok) p.correct++; else { p.wrong++; Store.addWrong(q.id); }
  Store.bumpQStat(q.id, ok);
  p.showAnswer = true;
  render();
}
function pNext(){state.practice.index++;state.practice.showAnswer=false;render();}
function pFinish(){
  var p = state.practice;
  var total = p.list.length, correct = p.correct;
  Store.addRecord({mode:'practice', total:total, correct:correct});
  if (confirm('共 ' + total + ' 题\n答对 ' + correct + ' 题\n正确率 ' + rate(correct, total) + '%\n\n点击「确定」再来一组，点击「取消」返回')){
    var list = shuffle(p.list);
    state.practice = {
      list:list, index:0,
      userAnswers: new Array(list.length).fill(null),
      showAnswer:false, correct:0, wrong:0,
      level:p.level, label:p.label
    };
    render();
  } else go('home');
}

/* ==========================================
   竞赛
   ========================================== */
var EXAM_N = 20, EXAM_MIN = 20;
function startExam(level){
  var pool = getQuestions(level);
  if (!pool.length){ alert('题库为空'); return; }
  var list = shuffle(pool).slice(0, Math.min(EXAM_N, pool.length));
  state.exam = {
    list:list, index:0,
    answers: new Array(list.length).fill(null),
    remain: EXAM_MIN * 60, total: EXAM_MIN * 60,
    showCard:false, running:true
  };
  go('exam');
}
function renderExam(){
  var e = state.exam;
  if (!e) return '<div class="empty"><div class="ico"></div><div class="txt">数据丢失</div></div>';
  var q = e.list[e.index];
  var ua = e.answers[e.index];
  var answered = e.answers.filter(function(a,i){return isAnswered(e.list[i], a);}).length;
  var h = '<div class="topbar">' +
    '<div class="timer" id="timerText">' + fmtTime(e.remain) + '</div>' +
    '<div class="counter">已答 ' + answered + ' / ' + e.list.length + '</div>' +
    '<button class="card-btn" onclick="toggleCard()">答题卡</button></div>';
  h += '<div class="progress"><i style="width:' + rate(e.index+1, e.list.length) + '%;"></i></div>';
  h += '<div class="card"><div class="tags">' +
    '<span class="tag">' + esc(q.level) + '</span>' +
    '<span class="tag">' + esc(q.category) + '</span>' +
    '<span class="tag">' + typeLabel(q.type) + '</span>' +
    '<span class="tag">第 ' + (e.index+1) + ' 题</span></div>';
  h += '<div class="stem">' + esc(q.stem) + '</div>';
  h += renderInput(q, ua, false, 'eChoose');
  h += '</div>';
  h += '<div class="btn-row" style="margin-top:6px;">' +
    '<button class="btn btn-ghost" ' + (e.index===0?'disabled':'') + ' onclick="ePrev()">上一题</button>' +
    '<button class="btn btn-ghost" ' + (e.index===e.list.length-1?'disabled':'') + ' onclick="eNext()">下一题</button></div>';
  h += '<button class="btn btn-main" style="margin-top:14px;" onclick="eConfirm()">交卷</button>';
  if (e.showCard){
    h += '<div class="mask" onclick="toggleCard()"></div><div class="sheet show"><h3>答题卡</h3><div class="sheet-grid">';
    e.list.forEach(function(qq,i){
      h += '<div class="sheet-item ' + (isAnswered(qq, e.answers[i])?'done':'') + ' ' + (i===e.index?'active':'') + '" onclick="eJump(' + i + ')">' + (i+1) + '</div>';
    });
    h += '</div><div style="margin-top:16px;font-size:11.5px;color:#5C6688;">蓝色 = 已作答　灰色 = 未作答</div></div>';
  }
  return h;
}
function startExamTimer(){
  var t = setInterval(function(){
    if (!state.exam || state.page !== 'exam'){clearInterval(t);return;}
    state.exam.remain--;
    if (state.exam.remain <= 0){
      state.exam.remain = 0;
      updateTimer();
      clearInterval(t);
      state.exam.running = false;
      alert('时间到，自动交卷！');
      submitExam();
      return;
    }
    updateTimer();
  }, 1000);
  timers.push(t);
}
function updateTimer(){
  var el = document.getElementById('timerText');
  if (el && state.exam){
    el.textContent = fmtTime(state.exam.remain);
    el.style.color = state.exam.remain <= 60 ? 'var(--red)' : 'var(--blue)';
  }
}
function eChoose(i){
  var e = state.exam;
  if (!e) return;
  var q = e.list[e.index];
  if (q.type === 'multi'){
    var arr = Array.isArray(e.answers[e.index]) ? e.answers[e.index].slice() : [];
    var k = arr.indexOf(i);
    if (k >= 0) arr.splice(k, 1); else arr.push(i);
    e.answers[e.index] = arr;
    document.querySelectorAll('.option').forEach(function(n, j){
      n.className = 'option' + (arr.indexOf(j)>=0?' selected':'');
    });
  } else if (q.type === 'order'){
    var a2 = Array.isArray(e.answers[e.index]) ? e.answers[e.index].slice() : [];
    var k2 = a2.indexOf(i);
    if (k2 >= 0) a2.splice(k2, 1); else a2.push(i);
    e.answers[e.index] = a2;
    render();
    return;
  } else {
    e.answers[e.index] = i;
    document.querySelectorAll('.option').forEach(function(n, j){
      n.className = 'option' + (j===i?' selected':'');
    });
  }
  var c = document.querySelector('.topbar .counter');
  if (c){
    var an = e.answers.filter(function(a,k){return isAnswered(e.list[k], a);}).length;
    c.textContent = '已答 ' + an + ' / ' + e.list.length;
  }
}
function ePrev(){if(state.exam.index>0){state.exam.index--;render();}}
function eNext(){if(state.exam.index<state.exam.list.length-1){state.exam.index++;render();}}
function eJump(i){state.exam.index=i;state.exam.showCard=false;render();}
function toggleCard(){state.exam.showCard=!state.exam.showCard;render();}
function eConfirm(){
  var e = state.exam;
  var un = e.list.filter(function(q,i){return !isAnswered(q, e.answers[i]);}).length;
  if (confirm(un>0?'还有 ' + un + ' 题未作答，确定交卷吗？':'确定交卷吗？')) submitExam();
}
function submitExam(){
  var e = state.exam;
  if (!e) return;
  clearTimers(); e.running = false;
  var score=0, right=0, wrong=0, blank=0;
  var det = [];
  e.list.forEach(function(q, i){
    var ua = e.answers[i];
    var ok = isCorrect(q, ua);
    var done = isAnswered(q, ua);
    if (!done) blank++;
    else if (ok){ right++; score += 2; }
    else { wrong++; score -= 1; Store.addWrong(q.id); }
    if (done) Store.bumpQStat(q.id, ok);
    det.push({id:q.id, type:q.type, stem:q.stem, options:q.options||null, image:q.image||null,
      your:ua, correct:q.answer, explanation:q.explanation, isCorrect:ok, isBlank:!done});
  });
  var r = {
    level:e.list[0].level, total:e.list.length,
    score:score, fullScore:e.list.length*2,
    right:right, wrong:wrong, blank:blank,
    rate:rate(right, e.list.length), used:e.total-e.remain, details:det
  };
  Store.addRecord({mode:'exam', total:e.list.length, correct:right});
  state.result = r; state.exam = null; go('result');
}

/* ==========================================
   成绩单
   ========================================== */
function renderResult(){
  var r = state.result;
  if (!r) return '<div class="empty"><div class="ico"></div><div class="txt">没有成绩数据</div></div>';
  var wl = r.details.filter(function(d){return !d.isCorrect;});
  var h = '<div class="score-card">' +
    '<div class="lb">本次得分</div><div class="num">' + r.score + '</div>' +
    '<div class="full">满分 ' + r.fullScore + ' 分</div>' +
    '<div class="rate">正确率 ' + r.rate + '%　用时 ' + fmtTime(r.used) + '</div></div>';
  h += '<div class="stat-row">' +
    '<div><div class="n ok">' + r.right + '</div><div class="l">答对</div></div>' +
    '<div><div class="n no">' + r.wrong + '</div><div class="l">答错</div></div>' +
    '<div><div class="n gray">' + r.blank + '</div><div class="l">未答</div></div></div>';
  if (wl.length){
    h += '<div class="sec-title">错题解析（' + wl.length + ' 题）</div>';
    wl.forEach(function(d){
      h += '<div class="card"><div class="tags"><span class="tag amber">' + typeLabel(d.type) + '</span></div>';
      h += '<div class="q-stem">' + esc(d.stem) + '</div><div class="q-line">';
      if (d.type === 'fill'){
        h += '<span style="color:var(--sub);">你的答案：</span> <span class="no">' + esc(d.your || '（空）') + '</span>';
      } else if (d.type === 'order'){
        var ya = Array.isArray(d.your) ? d.your : [];
        h += '<span style="color:var(--sub);">你的排序：</span> ' + (ya.length ? ya.map(function(i){return d.options[i];}).join(' → ') : '（空）') + '<br>';
        h += '<span style="color:var(--green);">正确排序：</span> ' + d.correct.map(function(i){return d.options[i];}).join(' → ');
      } else if (d.options){
        d.options.forEach(function(t, i){
          var isR = Array.isArray(d.correct) ? d.correct.indexOf(i)>=0 : d.correct===i;
          var isY = Array.isArray(d.your) ? d.your.indexOf(i)>=0 : d.your===i;
          var c = isR ? 'ok' : (isY ? 'no' : '');
          h += '<span class="' + c + '">' + LETTERS[i] + '. ' + esc(t) + '</span><br>';
        });
      }
      h += '</div><div class="q-exp">' + (d.isBlank?'⚠️ 本题未作答<br>':'') +
        '正确答案：<b style="color:var(--green);">' + esc(answerText({type:d.type, answer:d.correct, options:d.options})) + '</b><br>' +
        esc(d.explanation) + '</div></div>';
    });
  } else {
    h += '<div class="card" style="text-align:center;padding:36px 20px;">' +
      '<div style="font-size:40px;margin-bottom:10px;"></div>' +
      '<div style="font-size:16px;font-weight:700;">全部答对，太棒了！</div></div>';
  }
  h += '<div class="btn-row" style="margin:20px 0 40px;">' +
    '<button class="btn btn-ghost" onclick="go(\'wrong\')">查看错题归纳</button>' +
    '<button class="btn btn-main" onclick="go(\'home\')">返回首页</button></div>';
  return h;
}

/* ==========================================
   错题
   ========================================== */
function renderWrong(){
  var wid = Store.getWrong();
  if (!wid.length){
    return '<div class="title">错题归纳</div><div class="sub" style="margin-bottom:20px;">按知识点归纳，支持再提问</div>' +
      '<div class="empty"><div class="ico">✨</div><div class="txt">还没有错题，继续保持！</div></div>';
  }
  var g = {};
  wid.forEach(function(w){
    var q = null;
    for (var i = 0; i < Q.length; i++) if (Q[i].id === w.id){ q = Q[i]; break; }
    if (!q) return;
    var key = q.level + '|' + q.category;
    if (!g[key]) g[key] = {level:q.level, category:q.category, items:[]};
    g[key].items.push({q:q, count:w.count});
  });
  var gl = Object.keys(g).map(function(k){return g[k];});
  gl.sort(function(a,b){return b.items.length - a.items.length;});
  var h = '<div class="title">错题归纳</div>' +
    '<div class="sub" style="margin-bottom:14px;">共 ' + wid.length + ' 道错题，分布在 ' + gl.length + ' 个知识点</div>' +
    '<div class="card" style="background:linear-gradient(135deg,rgba(255,184,77,.10),rgba(255,91,91,.08));border-color:rgba(255,184,77,.25);">' +
    '<div style="font-size:12.5px;line-height:1.8;color:#C8D2E8;"> <b style="color:var(--amber);">再提问</b>：点开知识点，点击「再提问」按钮，系统会从该知识点重新抽题。</div></div>';
  gl.forEach(function(gr){
    var key = gr.level + '|' + gr.category;
    var ex = !!state.expanded[key];
    var k = getKnowledge(gr.level, gr.category);
    var icon = k ? k.icon : '';
    h += '<div class="group-head" onclick="toggleG(\'' + key.replace(/'/g,"\\'") + '\')">' +
      '<div class="gh-l"><div class="learn-ico" style="width:34px;height:34px;font-size:17px;">' + icon + '</div>' +
      '<div><div class="gn">' + esc(gr.category) + '</div>' +
      '<div class="gc">' + esc(gr.level) + ' · ' + gr.items.length + ' 道错题</div></div></div>' +
      '<div style="color:var(--sub);font-size:17px;">' + (ex?'▾':'▸') + '</div></div>';
    if (ex){
      h += '<div class="group-body">';
      gr.items.forEach(function(it){
        h += '<div class="card" style="padding:14px;">' +
          '<div class="tags"><span class="tag amber">' + typeLabel(it.q.type) + '</span>' +
          '<span class="tag err">错 ' + it.count + ' 次</span></div>';
        h += '<div class="q-stem" style="font-size:14px;">' + esc(it.q.stem) + '</div><div class="q-line">';
        if (it.q.type === 'fill'){
          h += '<span class="ok">正确答案：' + esc(answerText(it.q)) + '</span>';
        } else if (it.q.type === 'order'){
          h += '<span class="ok">正确顺序：' + it.q.answer.map(function(i){return it.q.options[i];}).join(' → ') + '</span>';
        } else if (it.q.options){
          it.q.options.forEach(function(t, i){
            var isR = Array.isArray(it.q.answer) ? it.q.answer.indexOf(i)>=0 : it.q.answer===i;
            h += '<span class="' + (isR?'ok':'') + '">' + LETTERS[i] + '. ' + esc(t) + '</span><br>';
          });
        }
        h += '</div><div class="q-exp">' + esc(it.q.explanation) + '</div>' +
          '<div style="display:flex;gap:10px;margin-top:12px;justify-content:flex-end;">' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();removeW(\'' + it.q.id + '\')">移除</button></div></div>';
      });
      h += '<button class="btn btn-amber" style="margin-bottom:14px;" onclick="reAsk(\'' + gr.level + '\',\'' + gr.category.replace(/'/g,"\\'") + '\')"> 针对「' + esc(gr.category) + '」再提问</button></div>';
    }
  });
  h += '<button class="btn btn-ghost" style="margin:10px 0 40px;" onclick="clearW()">清空错题本</button>';
  return h;
}
function toggleG(k){state.expanded[k] = !state.expanded[k]; render();}
function reAsk(level, category){
  var pool = getQuestions(level, category);
  if (!pool.length){alert('该知识点暂无题目');return;}
  var wid = Store.getWrong().map(function(w){return w.id;});
  var wrongOnes = pool.filter(function(q){return wid.indexOf(q.id)>=0;});
  var others = pool.filter(function(q){return wid.indexOf(q.id)<0;});
  var picked = shuffle(wrongOnes);
  if (picked.length < 5) picked = picked.concat(shuffle(others).slice(0, 5-picked.length));
  picked = shuffle(picked).slice(0, Math.min(6, pool.length));
  if (!confirm('针对「' + category + '」再提问\n\n本次共 ' + picked.length + ' 题\n（优先抽取你答错过的题目）\n\n点击「确定」开始练习')) return;
  startWith(picked, level, category + ' · 强化练习');
}
function removeW(id){if(confirm('确定从错题本移除这道题吗？')){Store.removeWrong(id);render();}}
function clearW(){if(confirm('所有错题记录将被删除，不可恢复。确定吗？')){Store.clearWrong();render();}}

/* ==========================================
   AI 模型页面（重新布局）
   ========================================== */
function renderAI(){
  if (state.aiMsgs.length === 0){
    state.aiMsgs = [{role:'bot', text:'你好，我是星赛通本地知识库助手 \n\n选择上方的模型切换不同功能，或直接在输入框提问。'}];
  }
  var h = '';
  // 头部
  h += '<div class="ai-hero">' +
    '<h3> 本地知识库助手</h3>' +
    '<p>基于本地知识库，提供天文问答、随机出题、概念讲解与备赛建议。</p>' +
    '</div>';
  h += '<div class="card" style="margin:10px 0;padding:12px;border:1px solid var(--line);font-size:12px;line-height:1.65;color:var(--sub)"><b>能力说明：</b>当前是浏览器内置知识库与规则匹配，不连接云端大模型，也不进行实时联网检索。回答可能不完整或过时，竞赛事实请以教材和权威天文资料为准。</div>';
  // 模型选择
  h += '<div class="sec-title" style="margin-top:6px;">️ 选择模式</div>';
  h += '<div class="model-grid">';
  AI_MODELS.forEach(function(m){
    h += '<div class="model-card ' + (state.aiModel === m.id ? 'active' : '') + '" onclick="setAIModel(\'' + m.id + '\')">' +
      '<div class="model-ico">' + m.icon + '</div>' +
      '<div class="model-name">' + m.name + '</div>' +
      '<div class="model-desc">' + m.desc + '</div></div>';
  });
  h += '</div>';
  // 快捷提问
  var quick = getQuickQuestions(state.aiModel);
  h += '<div class="sec-title"> 快捷提问</div>';
  h += '<div class="ai-quick">';
  quick.forEach(function(q){
    h += '<button onclick="aiAsk(\'' + q.replace(/'/g,"\\'") + '\')">' + q + '</button>';
  });
  h += '</div>';
  // 对话
  h += '<div class="sec-title"> 对话</div>';
  h += '<div class="ai-chat" id="aiChat">';
  state.aiMsgs.forEach(function(m){
    h += '<div class="ai-msg ' + m.role + '">' + fmtAI(m.text) + '</div>';
  });
  if (state.aiTyping) h += '<div class="ai-typing"><span></span><span></span><span></span></div>';
  h += '</div>';
  // 底部留白
  h += '<div style="height:60px;"></div>';
  // 输入框
  h += '<div class="ai-input-row">' +
    '<input class="ai-input" id="aiInput" type="text" placeholder="输入你的天文问题..." onkeydown="if(event.key===\'Enter\')aiSend()">' +
    '<button class="ai-send" onclick="aiSend()">发送</button></div>';
  return h;
}
function getQuickQuestions(model){
  if (model === 'quiz') return ['随机出题','出一套小学题','考考我','再来一题'];
  if (model === 'explain') return ['黑洞是什么？','月相怎么变化？','什么是星等？','日食怎么形成？'];
  if (model === 'exam') return ['备赛策略','竞赛考什么？','重点知识有哪些？','时间怎么分配？'];
  return ['黑洞是怎么形成的？','如何找到北极星？','望远镜怎么选？','太阳系有哪些行星？'];
}
function setAIModel(id){
  state.aiModel = id;
  var m = AI_MODELS.filter(function(x){return x.id===id;})[0];
  if (m) state.aiMsgs.push({role:'bot', text:'已切换到【' + m.name + '】模式。' + m.desc + '。\n\n' + getModelIntro(id)});
  render();
  setTimeout(function(){ window.scrollTo(0, document.body.scrollHeight); }, 50);
}
function getModelIntro(id){
  if (id === 'quiz') return '试试问："随机出题" 或 "出一套小学题"。';
  if (id === 'explain') return '我会用通俗的语言解释天文概念。';
  if (id === 'exam') return '我可以分享备赛经验和考点解析。';
  return '有任何天文问题都可以问我。';
}
function fmtAI(t){return esc(t).replace(/\n/g,'<br>').replace(/【(.+?)】/g,'<b>【$1】</b>');}
function aiAsk(t){var i = document.getElementById('aiInput'); if (i) i.value = t; aiSend();}
function aiSend(){
  var i = document.getElementById('aiInput');
  if (!i) return;
  var t = i.value.trim();
  if (!t) return;
  i.value = '';
  state.aiMsgs.push({role:'user', text:t});
  state.aiTyping = true;
  render();
  setTimeout(function(){
    window.scrollTo(0, document.body.scrollHeight);
  }, 50);
  setTimeout(function(){
    var r = aiRespond(t, state.aiModel);
    state.aiMsgs.push({role:'bot', text:r});
    state.aiTyping = false;
    Store.saveAI(state.aiMsgs);
    render();
    setTimeout(function(){ window.scrollTo(0, document.body.scrollHeight); }, 50);
  }, 500 + Math.random() * 400);
}
function aiRespond(text, model){
  var q = String(text || '').toLowerCase();
  // 出题模型
  if (model === 'quiz' || q.indexOf('出题') >= 0 || q.indexOf('考考') >= 0 || q.indexOf('再来一题') >= 0){
    var level = state.level;
    if (q.indexOf('小学') >= 0) level = '小学';
    if (q.indexOf('初中') >= 0) level = '初中';
    var p = getQuestions(level);
    var q1 = p[Math.floor(Math.random() * p.length)];
    return ' 随机一道' + level + '组的题目：\n\n【' + typeLabel(q1.type) + '】' + q1.stem +
      (q1.options ? '\n\n' + q1.options.map(function(t,i){return LETTERS[i] + '. ' + t;}).join('\n') : '') +
      '\n\n（点击底部"练习"标签可进入答题模式）';
  }
  // 概念讲解
  if (model === 'explain' && (q.indexOf('什么是') >= 0 || q.indexOf('是什么') >= 0)){
    // 提取关键词
    var kw = q.replace(/什么是|是什么|？|\?|呢|呀/g, '').trim();
    var best = null, bs = 0;
    AI_KB.forEach(function(item){
      item.keys.forEach(function(k){
        if (kw.indexOf(k) >= 0 && k.length > bs){ bs = k.length; best = item; }
      });
    });
    if (best) return ' ' + best.a;
  }
  // 通用匹配
  var best2 = null, bs2 = 0;
  AI_KB.forEach(function(item){
    var s = 0;
    item.keys.forEach(function(k){
      if (q.indexOf(k.toLowerCase()) >= 0) s += k.length;
    });
    if (s > bs2){ bs2 = s; best2 = item; }
  });
  if (best2) return best2.a;
  // 备赛模型
  if (model === 'exam'){
    if (q.indexOf('备赛') >= 0 || q.indexOf('策略') >= 0){
      return ' 备赛建议：\n\n【知识准备】\n1. 系统学习教材知识点（太阳系、恒星、星系）\n2. 熟记重要数据（行星顺序、距离单位、星等）\n3. 理解天球坐标与日月食原理\n\n【实践】\n· 学会使用望远镜\n· 认识四季星空和主要星座\n· 关注天文新闻\n\n【刷题】\n· 每天 20 题，分知识点攻克\n· 重点复习错题\n· 模拟竞赛计时练习';
    }
    if (q.indexOf('考什么') >= 0 || q.indexOf('考点') >= 0){
      return ' 竞赛主要考点：\n\n【小学组】\n· 太阳系天体常识\n· 月相变化\n· 星座辨认\n· 日食月食\n· 望远镜基础\n\n【初中组】\n· 天球坐标系统\n· 恒星演化\n· 星等与光度\n· 天体视运动\n· 望远镜原理';
    }
  }
  // 默认
  return '我是星赛通 AI 助手（' + (AI_MODELS.filter(function(m){return m.id === state.aiModel;})[0] || {name:'通用'}).name + '）。\n\n试试问我：\n· 黑洞是怎么形成的？\n· 如何找到北极星？\n· 日食和月食有什么区别？\n· 望远镜怎么选？\n· 星等是什么意思？\n· 随机出题';
}

/* ==========================================
   我的
   ========================================== */
function renderProfile(){
  var s = Store.getStats();
  var cats = getCategories(state.level);
  var weakest = null;
  cats.forEach(function(c){
    var m = getMastery(state.level, c);
    if (m.answered >= 3 && (!weakest || m.rate < weakest.rate)) weakest = {category:c, rate:m.rate};
  });
  var h = '<div class="profile-card"><div class="av"></div>' +
    '<div class="nk">天文小达人</div>' +
    '<div class="sub" style="margin-top:6px;">坚持每天学一点，竞赛更从容</div>' +
    '<div class="sign">作者：<b>戴煜</b> · 18662613315@163.com</div></div>';
  h += '<div class="grid2">' +
    '<div><div class="n">' + s.total + '</div><div class="l">累计答题</div></div>' +
    '<div><div class="n">' + s.rate + '%</div><div class="l">正确率</div></div>' +
    '<div><div class="n">' + s.days + '</div><div class="l">学习天数</div></div>' +
    '<div><div class="n">' + s.wrongCount + '</div><div class="l">错题数</div></div></div>';
  if (weakest){
    h += '<div class="card" style="background:linear-gradient(135deg,rgba(255,184,77,.12),rgba(255,91,91,.08));border-color:rgba(255,184,77,.25);">' +
      '<div style="font-size:12.5px;color:var(--sub);margin-bottom:6px;"> 薄弱知识点</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div style="font-size:16.5px;font-weight:700;">' + esc(weakest.category) + '</div>' +
      '<div style="font-size:20px;font-weight:800;color:var(--red);">' + weakest.rate + '%</div></div>' +
      '<button class="btn btn-amber" style="margin-top:12px;" onclick="reAsk(\'' + state.level + '\',\'' + weakest.category.replace(/'/g,"\\'") + '\')">立即强化练习</button></div>';
  }
  h += '<div class="card" style="padding:0;">' +
    '<div class="row-item" onclick="go(\'learn\')"><span> 知识点学习</span><span class="arrow">' + cats.length + ' 个 ›</span></div>' +
    '<div style="height:1px;background:var(--line);margin:0 16px;"></div>' +
    '<div class="row-item" onclick="go(\'news\')"><span> 天文读报</span><span class="arrow">' + NEWS.length + ' 条 ›</span></div>' +
    '<div style="height:1px;background:var(--line);margin:0 16px;"></div>' +
    '<div class="row-item" onclick="go(\'ai\')"><span>烙 AI 天文模型</span><span class="arrow">4 个模型 ›</span></div>' +
    '<div style="height:1px;background:var(--line);margin:0 16px;"></div>' +
    '<div class="row-item" onclick="go(\'wrong\')"><span> 错题归纳</span><span class="arrow">' + s.wrongCount + ' 道 ›</span></div></div>';
  h += '<div class="card" style="padding:0;">' +
    '<div class="row-item" onclick="clearAI()"><span style="color:var(--sub);">粒 清除 AI 对话</span><span class="arrow">›</span></div>' +
    '<div style="height:1px;background:var(--line);margin:0 16px;"></div>' +
    '<div class="row-item" onclick="clearAll()"><span style="color:var(--red);"> 清除所有数据</span><span class="arrow">›</span></div></div>';
  h += '<div class="version">星赛通 v6.0 · 网页版<br>' +
    '作者：戴煜 · 邮箱：18662613315@163.com<br>' +
    '题库 ' + Q.length + ' 题 · 知识卡 ' + KNOWLEDGE.length + ' 张<br>' +
    '动态模拟 ' + Object.keys(SimEngine.sims).length + ' 个 · 读报 ' + NEWS.length + ' 条</div>';
  return h;
}
function clearAI(){if(confirm('清除所有 AI 对话记录？')){Store.clearAI(); state.aiMsgs=[]; render();}}
function clearAll(){if(confirm('所有数据都会被清空，不可恢复。确定吗？')){Store.clearAll(); state.aiMsgs=[]; render();}}

/* ==========================================
   读报
   ========================================== */
function renderNews(){
  var cats = ['全部'].concat(Array.from(new Set(NEWS.map(function(n){return n.cat;}))));
  var list = state.newsFilter === '全部' ? NEWS : NEWS.filter(function(n){return n.cat === state.newsFilter;});
  var h = '<div class="title">天文读报</div>' +
    '<div class="sub" style="margin-bottom:14px;">内置精选内容 · 非实时新闻订阅 · 支持语音朗读</div>';
  h += '<div class="filter-bar">';
  cats.forEach(function(c){
    h += '<button class="filter-item ' + (state.newsFilter===c?'active':'') + '" onclick="setNewsFilter(\'' + c + '\')">' + esc(c) + '</button>';
  });
  h += '</div>';
  h += '<div class="news-list">';
  list.forEach(function(n){
    h += '<div class="news-card" data-id="' + n.id + '">' +
      '<div class="news-top"><span class="tag">' + esc(n.cat) + '</span><span class="news-date"> ' + esc(n.date) + '</span></div>' +
      '<div class="news-title">' + esc(n.title) + '</div>' +
      '<div class="news-summary">' + esc(n.body.slice(0, 80)) + '...</div>' +
      '<div class="news-actions">' +
      '<button onclick="Reader.read(NEWS.filter(function(x){return x.id===\'' + n.id + '\';})[0])"> 语音朗读</button>' +
      '<button onclick="showNewsDetail(\'' + n.id + '\')"> 阅读全文</button>' +
      '</div></div>';
  });
  h += '</div>';
  h += '<div style="text-align:center;color:var(--sub);font-size:12px;margin:18px 0;">共 ' + NEWS.length + ' 条资讯 · 支持语速/音量/音调调节</div>';
  return h;
}
function setNewsFilter(c){state.newsFilter = c; render();}
function showNewsDetail(id){
  var n = null;
  for (var i = 0; i < NEWS.length; i++) if (NEWS[i].id === id){ n = NEWS[i]; break; }
  if (!n) return;
  var body = n.body.split('\n\n').map(function(p){
    return '<p style="margin:0 0 12px;line-height:1.9;color:#C8D2E8;font-size:14.5px;">' + esc(p) + '</p>';
  }).join('');
  var html = '<div class="tags"><span class="tag">' + esc(n.cat) + '</span><span class="news-date" style="margin-left:auto;"> ' + esc(n.date) + '</span></div>' +
    '<div class="title" style="font-size:20px;margin-bottom:14px;line-height:1.4;">' + esc(n.title) + '</div>' +
    '<div class="card">' + body + '</div>' +
    '<div class="btn-row" style="margin-top:18px;">' +
    '<button class="btn btn-ghost" onclick="go(\'news\')">返回列表</button>' +
    '<button class="btn btn-main" onclick="Reader.read(NEWS.filter(function(x){return x.id===\'' + n.id + '\';})[0])"> 语音朗读</button></div>';
  view.innerHTML = html;
  navTitle.textContent = '资讯详情';
  backBtn.classList.remove('hidden');
  tabbar.classList.add('hidden');
  window.scrollTo(0, 0);
}

/* ==========================================
   事件绑定
   ========================================== */
backBtn.addEventListener('click', function(){
  if (state.page === 'result') return go('home');
  if (state.page === 'learnDetail') return go('learn');
  if (state.page === 'practice' || state.page === 'exam'){
    if (state.page === 'exam' && state.exam){
      if (!confirm('退出后本次答题记录不会保存，确定退出吗？')) return;
      clearTimers();
      state.exam = null;
    }
    return go('home');
  }
  go('home');
});
tabbar.addEventListener('click', function(e){
  var b = e.target.closest('button');
  if (!b) return;
  var t = b.dataset.tab;
  if (!t || t === state.page) return;
  if (state.page === 'exam' && state.exam){
    if (!confirm('退出后本次答题记录不会保存，确定退出吗？')) return;
    clearTimers();
    state.exam = null;
  }
  go(t);
});
document.addEventListener('keydown', function(e){
  var tag = (e.target.tagName || '').toLowerCase();
  var isI = tag === 'input' || tag === 'textarea';
  if (state.page === 'practice'){
    var p = state.practice;
    if (!p) return;
    var q = p.list[p.index];
    if (!isI && !p.showAnswer && q.type !== 'fill'){
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= q.options.length){ pChoose(n-1); e.preventDefault(); }
    }
    if (e.key === 'Enter'){
      if (!p.showAnswer && isAnswered(q, p.userAnswers[p.index])){ pSubmit(); e.preventDefault(); }
      else if (p.showAnswer && p.index < p.list.length - 1){ pNext(); e.preventDefault(); }
    }
  }
  if (state.page === 'exam'){
    var ex = state.exam;
    if (!ex) return;
    var q2 = ex.list[ex.index];
    if (!isI && q2.type !== 'fill'){
      var n2 = parseInt(e.key, 10);
      if (n2 >= 1 && n2 <= q2.options.length){ eChoose(n2-1); e.preventDefault(); }
    }
    if (!isI && e.key === 'ArrowLeft') ePrev();
    if (!isI && e.key === 'ArrowRight') eNext();
  }
});

/* ==========================================
   启动
   ========================================== */
try { render(); } catch(err){
  console.error(err);
  view.innerHTML = '<div class="card"><div class="title">加载出错了</div><div class="sub">' + esc(err.message) + '</div></div>';
}
