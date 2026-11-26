/* 学生端 APP v3 状态与案例。仅操作本版本及当前案例的存储空间。 */
(function (global) {
  'use strict';
  const VERSION = '学生端APP_v3_261126_1240';
  const STORAGE_KEY = 'victor-student-app:v3:261126_1240';
  const SCHEMA = 1;
  const DAY = 86400000;
  const MINUTE = 60000;
  const ALL = Array.from({ length: 20 }, (_, i) => i + 1);
  const CORRECT = {1:'A',2:'B',3:'B',4:'A',5:'B',6:'B',7:'C',8:'A',9:'C',10:'B',11:'A',12:'C',13:'C',14:'C',15:'A',16:'A',17:'C',18:'B',19:'C',20:'B'};
  const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const toMs = (value, fallback) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value); if (Number.isFinite(n)) return n;
      const d = Date.parse(value); if (Number.isFinite(d)) return d;
    }
    return fallback;
  };
  const round = (number, places = 2) => Math.round((number + Number.EPSILON) * 10 ** places) / 10 ** places;
  const questionsOf = (paper, proposed) => [...new Set(Array.isArray(proposed) && proposed.length ? proposed : (paper.questions || ALL))].map(Number).filter(q => CORRECT[q]);
  const storageMemory = Object.create(null);
  let storageAvailable = true;
  const storage = {
    read(key) { try { return global.localStorage.getItem(key); } catch (_) { storageAvailable = false; return storageMemory[key] || null; } },
    write(key, value) { storageMemory[key] = value; try { global.localStorage.setItem(key, value); } catch (_) { storageAvailable = false; } }
  };
  function answersFor(count = 16, questions = ALL, wrongQuestions) {
    const answers = {};
    const wrongSet = wrongQuestions ? new Set(wrongQuestions.map(Number)) : null;
    questions.forEach((q, index) => {
      const wrong = wrongSet ? wrongSet.has(q) : index >= count;
      answers[q] = wrong ? (CORRECT[q] === 'A' ? 'B' : 'A') : CORRECT[q];
    });
    return answers;
  }
  function resultFromAnswers(answers, questions) {
    const clean = {};
    questions.forEach(q => { const value = String((answers || {})[q] || '').toUpperCase(); if (['A','B','C'].includes(value)) clean[q] = value; });
    const correctCount = questions.filter(q => clean[q] === CORRECT[q]).length;
    return {answers: clean, correctCount, totalCount: questions.length, wrongCount: questions.length - correctCount, accuracy: questions.length ? round(correctCount / questions.length * 100) : 0, score: questions.length ? round(correctCount / questions.length * 30) : 0, totalScore: 30};
  }
  function seedAttempt(task, paper, spec, at, order) {
    const questions = questionsOf(paper, spec.questions);
    const answerMap = spec.answers || answersFor(spec.correctCount === undefined ? 16 : spec.correctCount, questions, spec.wrongQuestions);
    const score = resultFromAnswers(answerMap, questions);
    const submittedAt = toMs(spec.submittedAt, at - (10 - order) * MINUTE);
    return Object.assign({id: 'seed-' + paper.id + '-' + order, sessionId:'seed-' + paper.id + '-' + order, taskId:task.id, paperId:paper.id, questions, questionOrder:questions.slice(), startedAt:submittedAt - (spec.elapsedSeconds || 186) * 1000, submittedAt, elapsedSeconds:spec.elapsedSeconds || 186, durationSeconds:spec.elapsedSeconds || 186, passed:score.accuracy >= task.passRate, passRate:task.passRate, auto:false, late:submittedAt > task.endAt, publishedAtSubmit:!!task.published, ordinal:order + 1}, score, {correct:score.correctCount,total:score.totalCount});
  }
  function baseState(caseId) {
    const at = Date.now();
    const papers = Array.from({length:20},(_,i) => ({id:'paper-' + String(i+1).padStart(2,'0'), title:'模拟试题' + (i+3), questions:ALL.slice()}));
    const tasks = [
      {id:'pending-260805',title:'260805听力试题',mode:'practice',startAt:at-DAY,endAt:at+2*DAY,visibleAt:at-2*DAY,allowLate:true,published:true,passRate:70,randomOptions:false,papers},
      {id:'makeup-260803',title:'260803听力组卷',mode:'practice',startAt:at-3*DAY,endAt:at-DAY,visibleAt:at-4*DAY,allowLate:true,published:false,passRate:70,randomOptions:false,papers:[{id:'makeup-paper-01',title:'260803听力组卷',questions:ALL.slice()}]},
      {id:'history-260801',title:'260801听力组卷',mode:'exam',startAt:at-6*DAY,endAt:at-4*DAY,visibleAt:at-7*DAY,allowLate:false,published:true,passRate:70,randomOptions:false,papers:[{id:'history-01-paper-01',title:'260801听力组卷',questions:ALL.slice()}]},
      {id:'history-260802',title:'260802听力试题',mode:'practice',startAt:at-5*DAY,endAt:at-3*DAY,visibleAt:at-6*DAY,allowLate:false,published:true,passRate:70,randomOptions:false,papers:[{id:'history-02-paper-01',title:'模拟试题1',questions:ALL.slice()},{id:'history-02-paper-02',title:'模拟试题2',questions:ALL.slice()}]}
    ];
    const state = {schemaVersion:SCHEMA,version:VERSION,caseId:caseId || 'personal',createdAt:at,updatedAt:at,revision:0,tasks,attempts:{},drafts:{},settings:{shortDialoguePlayCount:2,speed:1,skipMainInstruction:false,skipReadingTime:false},clock:{offsetMs:0,running:true}};
    for (const task of tasks) {
      task.papers.forEach((paper, index) => {
        if ((task.id === 'pending-260805' && index < 2) || task.id.startsWith('history-')) {
          const submittedAt = task.id.startsWith('history-') ? task.endAt - 20*MINUTE : at - (index+2)*MINUTE;
          state.attempts[paper.id] = [seedAttempt(task,paper,{correctCount:16,submittedAt},at,0)];
        }
      });
    }
    return state;
  }
  const definitions = [
    {id:'c01_visible_later',title:'C01 尚未到可见时间',category:'时间与入口',description:'任务尚不可见，不能查看详情或开始。',expected:'任务入口受可见时间控制。',entry:'detail',config:{visible:60,start:120,end:240}},
    {id:'c02_before_start',title:'C02 已可见但未到开始',category:'时间与入口',description:'可看任务详情，开始按钮暂不可用。',expected:'可见与可作答分别控制。',entry:'detail',config:{start:60,end:240}},
    {id:'c03_practice_new',title:'C03 练习首次作答',category:'作答流程',description:'截止前、未作答，练习可自由切题。',expected:'正常进入练习，可拖动和反复播放。',entry:'exercise'},
    {id:'c04_exam_new',title:'C04 考试首次作答',category:'作答流程',description:'考试固定倍速，播放阶段不可跳题。',expected:'无主动暂停、进度拖动、跳主指令或遍数调整。',entry:'exercise',config:{mode:'exam'}},
    {id:'c05_manual_missing',title:'C05 手动提交存在缺答',category:'提交与交卷',description:'仅回答前几题，提交提示未答题号。',expected:'灰色提交只提示缺题，不交卷、不计次。',entry:'exercise',action:'missing',draft:{answered:4}},
    {id:'c06_auto_blanks',title:'C06 考试带空题自动交卷',category:'提交与交卷',description:'检查即将结束，部分题未作答。',expected:'到点空题按错误计并保存一条记录。',entry:'exercise',action:'autoSoon',config:{mode:'exam'},draft:{answered:8,checkSeconds:5}},
    {id:'c07_check_stage',title:'C07 考试2分钟检查',category:'提交与交卷',description:'音频已播完，进入完整2分钟检查阶段。',expected:'检查可切题，截止前可提前提交。',entry:'exercise',action:'check',config:{mode:'exam'},draft:{answered:20,checkSeconds:120}},
    {id:'c08_check_background',title:'C08 检查期间切后台',category:'退出与恢复',description:'检查倒计时临近结束，可切后台后返回。',expected:'后台倒计时不停止，返回直接显示交卷结果。',entry:'exercise',action:'autoSoon',config:{mode:'exam'},draft:{answered:20,checkSeconds:8}},
    {id:'c09_hidden_passed',title:'C09 未公布且曾达标',category:'成绩与公布',description:'有80%达标记录，答案尚未公布。',expected:'完成状态保留，分数及对错隐藏、解析不可进入。',entry:'result',config:{published:false},history:[{correctCount:16}]},
    {id:'c10_hidden_failed',title:'C10 未公布且未达标',category:'成绩与公布',description:'有65%未达标记录，答案尚未公布。',expected:'成绩和对错隐藏；记录及用时仍保留。',entry:'result',config:{published:false},history:[{correctCount:13}]},
    {id:'c11_public_passed',title:'C11 已公布且曾达标',category:'成绩与公布',description:'80%达标且已公布，可查看解析。',expected:'显示真实成绩、对错、解析和错题巩固。',entry:'result',history:[{correctCount:16}]},
    {id:'c12_public_failed',title:'C12 已公布但从未达标',category:'成绩与公布',description:'65%未达标且已公布。',expected:'显示对错数量和用时，隐藏分数、答题卡对错及解析。',entry:'result',history:[{correctCount:13}]},
    {id:'c13_exact_threshold',title:'C13 恰好达到70%达标线',category:'成绩与公布',description:'14道正确，刚好70%。',expected:'等于达标线即达标。',entry:'result',history:[{correctCount:14}]},
    {id:'c14_late_allowed',title:'C14 已截止未达标可补交',category:'截止与补交',description:'从未达标，老师允许补交。',expected:'待补交，仍可开始，提交需立即补交确认。',entry:'detail',config:{end:-60,allowLate:true}},
    {id:'c15_late_forbidden',title:'C15 已截止未作答不可补交',category:'截止与补交',description:'从未提交，老师不允许补交。',expected:'历史练习显示我的作答，进入空成绩单全部--。',entry:'result',config:{end:-60,allowLate:false}},
    {id:'c16_late_passed_allowed',title:'C16 已截止曾达标允许补交',category:'截止与补交',description:'虽允许补交，但本人已经达标。',expected:'不能继续刷分，可看已有作答。',entry:'detail',config:{end:-60,allowLate:true},history:[{correctCount:16}]},
    {id:'c17_late_passed_forbidden',title:'C17 已截止曾达标禁止补交',category:'截止与补交',description:'已达标且不允许补交。',expected:'历史练习只查看作答及按权限展示的解析。',entry:'detail',config:{end:-60,allowLate:false},history:[{correctCount:16}]},
    {id:'c18_manual_cross_allowed',title:'C18 手动跨截止允许补交',category:'截止与补交',description:'已开始的作答跨过截止，答案已完整。',expected:'提交弹出放弃本次作答／立即补交，不设置取消。',entry:'exercise',action:'fill',config:{end:-1,allowLate:true},draft:{answered:20,startedMinutes:20}},
    {id:'c19_manual_cross_forbidden',title:'C19 手动跨截止禁止补交',category:'截止与补交',description:'已开始的作答跨过截止且不可补交。',expected:'无法提交弹窗，我知道了返回试题列表。',entry:'exercise',action:'fill',config:{end:-1,allowLate:false},draft:{answered:20,startedMinutes:20}},
    {id:'c20_auto_cross_allowed',title:'C20 考试到点需补交确认',category:'截止与补交',description:'任务已截止，考试检查即将到点，允许补交。',expected:'自动交卷弹出补交选择，确认后才进入成绩单。',entry:'exercise',action:'autoSoon',config:{mode:'exam',end:-1,allowLate:true},draft:{answered:20,checkSeconds:5,startedMinutes:20}},
    {id:'c21_auto_cross_forbidden',title:'C21 考试到点不能补交',category:'截止与补交',description:'任务已截止，考试即将到点，不允许补交。',expected:'自动交卷不豁免截止限制，不新增记录。',entry:'exercise',action:'autoSoon',config:{mode:'exam',end:-1,allowLate:false},draft:{answered:20,checkSeconds:5,startedMinutes:20}},
    {id:'c22_pass_then_fail',title:'C22 先80%后60%',category:'次数与历史',description:'第一次达标，第二次退步到60%。',expected:'仍完成、最终60%，两条记录均保留并可对应查看。',entry:'result',history:[{correctCount:16},{correctCount:12}]},
    {id:'c23_mixed_history',title:'C23 达标未达标混合作答记录',category:'次数与历史',description:'多次作答分别为50%、70%、80%、65%。',expected:'四次均计数，历史最新在前，最终65%，曾达标保持完成。',entry:'result',history:[{correctCount:10},{correctCount:14},{correctCount:16},{correctCount:13}]},
    {id:'c24_practice_draft',title:'C24 练习暂存后继续',category:'退出与恢复',description:'练习已有部分答案和播放位置。',expected:'恢复原答案、材料、选项顺序和累计用时。',entry:'exercise',action:'interrupt',draft:{answered:7,position:180,section:'second-6',startedMinutes:12}},
    {id:'c25_exam_resume',title:'C25 考试非主动中断后续播',category:'退出与恢复',description:'考试从后台恢复，保存部分答案和断点。',expected:'只能从断点继续播放，不能主动暂停；不限制恢复次数。',entry:'exercise',action:'interrupt',config:{mode:'exam'},draft:{answered:7,position:180,section:'second-6',startedMinutes:12}},
    {id:'c26_shuffle',title:'C26 随机选项与解析映射',category:'选项与设置',description:'每次新作答打乱选项，暂存恢复不重排。',expected:'判分按选项内容，解析恢复默认ABC顺序。',entry:'exercise',config:{randomOptions:true}},
    {id:'c27_same_material_wrong',title:'C27 长对话多道错题整轮巩固',category:'错题与解析',description:'第6、7题等同材料错题合并一页。',expected:'只展示当次错题，最后材料页整轮提交后显答案。',entry:'result',action:'wrong',history:[{wrongQuestions:[6,7,10,18]}]},
    {id:'c28_similar_round',title:'C28 同类题整轮提交与凸显解析',category:'错题与解析',description:'从普通解析进入同类题，作答时不立即显对错。',expected:'最后材料页提交后使用统一解析，高亮内容对应。',entry:'result',action:'similar',history:[{correctCount:16}]},
    {id:'c29_settings_memory',title:'C29 练习学习设置记忆',category:'选项与设置',description:'预置1遍、1.25倍速和跳过主指令。',expected:'设置记住用户选择，段落指令仍播放，解析无设置入口。',entry:'exercise',settings:{shortDialoguePlayCount:1,speed:1.25,skipMainInstruction:true,skipReadingTime:false}},
    {id:'c30_task_partial',title:'C30 大任务部分套题完成',category:'任务汇总',description:'两套题仅一套曾经达标。',expected:'整块任务仍待完成，完成量1/2。',entry:'detail',papers:2,histories:{'paper-01':[{correctCount:16}]}},
    {id:'c31_task_complete',title:'C31 大任务全部套题完成',category:'任务汇总',description:'两套题都曾达标。',expected:'整块任务已完成，完成量2/2。',entry:'detail',papers:2,histories:{'paper-01':[{correctCount:16}],'paper-02':[{correctCount:14}]}},
    {id:'c32_weighted_latest',title:'C32 不同题数按最新成绩加权',category:'任务汇总',description:'10题套卷80%后60%，20题套卷80%；另有未达标套卷不计。',expected:'曾达标两套最新合计22/30，正答率73.33%，第三套不纳入。',entry:'detail',papers:3,paperQuestions:{'paper-01':ALL.slice(0,10)},histories:{'paper-01':[{correctCount:8},{correctCount:6}],'paper-02':[{correctCount:16}],'paper-03':[{correctCount:10}]}},
    {id:'c33_publish_after_submit',title:'C33 提交后老师公布答案',category:'成绩与公布',description:'先查看隐藏成绩，再通过工作台公布。',expected:'原成绩单与历史记录按当前公布状态更新，无需重做。',entry:'result',config:{published:false},history:[{correctCount:16}]},
    {id:'c34_failed_history_forbidden',title:'C34 逾期未达标历史仍保留',category:'次数与历史',description:'已提交65%，现在截止且禁止补交。',expected:'历史练习可看原记录和用时，不伪装成从未提交空成绩单。',entry:'result',config:{end:-60,allowLate:false},history:[{correctCount:13}]},
    {id:'c35_retries_then_pass',title:'C35 第5次首次达标',category:'次数与历史',description:'前4次未达标，第5次70%达标。',expected:'显示第5次作答，历史保存全部5次。',entry:'result',history:[{correctCount:8},{correctCount:10},{correctCount:11},{correctCount:13},{correctCount:14}]},
    {id:'c36_late_pass_submission',title:'C36 补交后达标完成',category:'截止与补交',description:'有一条截止后的80%补交记录。',expected:'提交时间标记补交，任务进入历史练习，不可继续刷分。',entry:'result',config:{end:-60,allowLate:true},history:[{correctCount:16,late:true}]},
    {id:'c37_late_failed_submission',title:'C37 补交后仍未达标',category:'截止与补交',description:'补交65%仍未达标，老师允许补交。',expected:'记录仍保留、任务仍待补交，允许再次补交。',entry:'result',config:{end:-60,allowLate:true},history:[{correctCount:13,late:true}]},
    {id:'c38_no_threshold',title:'C38 不限制达标线',category:'成绩与公布',description:'老师达标线设置为不限制。',expected:'成功交卷即满足完成条件，但成绩仍为实际结果。',entry:'result',config:{passRate:0},history:[{correctCount:8}]}
  ];
  const cases = definitions.map(def => Object.freeze({id:def.id,title:def.title,category:def.category,description:def.description,expected:def.expected,taskId:'pending-260805',paperId:'paper-01',entry:def.entry || 'detail',action:def.action || '',preset:Object.assign({},def.draft ? {draft:copy(def.draft),correctCount:def.draft.answered === 20 ? 16 : undefined} : {},def.id === 'c27_same_material_wrong' ? {wrongQuestions:[6,7,10,18]} : {})}));
  function makeCase(caseId) {
    const state = baseState(caseId);
    const def = definitions.find(item => item.id === caseId);
    if (!def) return state;
    const at = state.createdAt;
    const task = state.tasks[0];
    const config = def.config || {};
    task.papers = task.papers.slice(0,def.papers || 1);
    task.startAt = at + finite(config.start,-120)*MINUTE;
    task.endAt = at + finite(config.end,180)*MINUTE;
    task.visibleAt = at + finite(config.visible,-180)*MINUTE;
    ['mode','allowLate','published','passRate','randomOptions'].forEach(key => { if (config[key] !== undefined) task[key] = config[key]; });
    for (const key of Object.keys(state.attempts)) if (key.startsWith('paper-')) delete state.attempts[key];
    if (def.paperQuestions) task.papers.forEach(paper => { if (def.paperQuestions[paper.id]) paper.questions = def.paperQuestions[paper.id].slice(); });
    const histories = Object.assign({},def.histories || {});
    if (def.history) histories[task.papers[0].id] = def.history;
    task.papers.forEach(paper => {
      if (!histories[paper.id]) return;
      state.attempts[paper.id] = histories[paper.id].map((spec,index) => {
        const when = spec.late ? at - (histories[paper.id].length-index)*MINUTE : Math.min(at - (histories[paper.id].length-index+2)*MINUTE,task.endAt-20*MINUTE);
        return seedAttempt(task,paper,Object.assign({},spec,{submittedAt:when}),at,index);
      });
    });
    if (def.settings) Object.assign(state.settings,def.settings);
    if (def.draft) {
      const paper = task.papers[0];
      const questions = questionsOf(paper);
      const count = def.draft.answered || 0;
      const answers = {};
      questions.slice(0,count).forEach((q,index) => { answers[q] = index < 16 ? CORRECT[q] : (CORRECT[q] === 'A' ? 'B' : 'A'); });
      const optionOrders = {};
      questions.forEach(q => { optionOrders[q] = ['A','B','C']; });
      state.drafts[paper.id] = {taskId:task.id,paperId:paper.id,sessionId:'case-draft-'+caseId,answers,questions,questionOrder:questions.slice(),optionOrders,position:def.draft.position || 0,section:def.draft.section || 'first-intro',startedAt:at-(def.draft.startedMinutes || 5)*MINUTE,paused:true,wasPlaying:false,checkDeadline:def.draft.checkSeconds ? at+def.draft.checkSeconds*1000 : null,checkStartedAt:def.draft.checkSeconds ? at+def.draft.checkSeconds*1000-120000 : null,createdAt:at,updatedAt:at};
    }
    state.caseDescription = def.description;
    return state;
  }
  const subscribers = new Set();
  let activeCaseId = 'personal';
  try { const query = new URLSearchParams(global.location && global.location.search || ''); const requested = query.get('case'); if (definitions.some(c => c.id === requested)) activeCaseId = requested; } catch (_) {}
  const keyFor = id => STORAGE_KEY + ':' + id;
  function validState(value) { return !!(value && value.version === VERSION && value.schemaVersion === SCHEMA && Array.isArray(value.tasks) && value.attempts && value.drafts); }
  function load(id) {
    try { const stored = JSON.parse(storage.read(keyFor(id)) || 'null'); if (validState(stored)) return stored; } catch (_) {}
    const fresh = id === 'personal' ? baseState('personal') : makeCase(id);
    storage.write(keyFor(id),JSON.stringify(fresh));
    return fresh;
  }
  let state = load(activeCaseId);
  let channel = null;
  try { if (typeof global.BroadcastChannel === 'function') channel = new global.BroadcastChannel(STORAGE_KEY); } catch (_) {}
  function emit(reason) {
    for (const fn of subscribers) { try { fn(state,{reason,caseId:activeCaseId}); } catch (error) { if (global.console) global.console.error(error); } }
    try { global.dispatchEvent(new CustomEvent('studentdemo:change',{detail:{reason,caseId:activeCaseId}})); } catch (_) {}
  }
  function persist(reason) {
    state.updatedAt = Date.now();
    state.revision = (state.revision || 0) + 1;
    storage.write(keyFor(activeCaseId),JSON.stringify(state));
    try { if (channel) channel.postMessage({key:keyFor(activeCaseId),revision:state.revision}); } catch (_) {}
    emit(reason || 'change');
  }
  function refreshFromStorage(reason) {
    try {
      const fresh = JSON.parse(storage.read(keyFor(activeCaseId)) || 'null');
      if (validState(fresh) && (fresh.revision !== state.revision || fresh.updatedAt !== state.updatedAt)) { state = fresh; emit(reason || 'external'); }
    } catch (_) {}
  }
  if (global.addEventListener) global.addEventListener('storage',event => { if (event.key === keyFor(activeCaseId)) refreshFromStorage('storage'); });
  if (channel) channel.onmessage = event => { if (event.data && event.data.key === keyFor(activeCaseId)) refreshFromStorage('broadcast'); };
  function now() { const clock = state.clock || {}; return clock.running === false ? toMs(clock.now,Date.now()) : Date.now() + finite(clock.offsetMs,0); }
  function getTask(id) { return state.tasks.find(task => task.id === id) || null; }
  function getPaper(taskId,paperId) { const task = getTask(taskId); return task ? task.papers.find(paper => paper.id === paperId) || null : null; }
  function paperStatus(taskId,paperId) {
    const task = getTask(taskId); const paper = getPaper(taskId,paperId);
    if (!task || !paper) return {everPassed:false,latest:null,attempts:[],canStart:false,canReview:false,visible:false,started:false,expired:false};
    const attempts = (state.attempts[paperId] || []).slice().sort((a,b) => a.submittedAt-b.submittedAt || finite(a.ordinal,0)-finite(b.ordinal,0));
    const latest = attempts[attempts.length-1] || null;
    const everPassed = attempts.some(attempt => attempt.passed === true);
    const at = now(); const visible = at >= task.visibleAt; const started = at >= task.startAt; const expired = at > task.endAt;
    return {everPassed,latest,attempts,canStart:visible && started && (!expired || (!everPassed && !!task.allowLate)),canReview:!!task.published && everPassed,visible,started,expired,hasAttempt:!!latest,attemptCount:attempts.length,published:!!task.published};
  }
  function getTaskStats(taskId) {
    const task = getTask(taskId);
    if (!task) return {completed:0,total:0,accuracy:null,correct:0,questions:0};
    let completed = 0, correct = 0, questions = 0;
    task.papers.forEach(paper => { const status = paperStatus(taskId,paper.id); if (status.everPassed) { completed++; if (status.latest) { correct += status.latest.correctCount; questions += status.latest.totalCount; } } });
    return {completed,total:task.papers.length,accuracy:questions ? round(correct/questions*100) : null,correct,questions};
  }
  function taskStatus(taskId) {
    const task = getTask(taskId); if (!task) return 'history';
    const stats = getTaskStats(taskId); const complete = stats.total > 0 && stats.completed === stats.total;
    if (now() > task.endAt) return complete || !task.allowLate ? 'history' : 'makeup';
    return complete ? 'completed' : 'pending';
  }
  function updateTask(id,patch) {
    const task = getTask(id); if (!task || !patch || typeof patch !== 'object') return null;
    const allowed = ['title','mode','startAt','endAt','visibleAt','allowLate','published','passRate','randomOptions'];
    allowed.forEach(key => {
      if (patch[key] === undefined) return;
      if (['startAt','endAt','visibleAt'].includes(key)) task[key] = toMs(patch[key],task[key]);
      else if (['allowLate','published','randomOptions'].includes(key)) task[key] = !!patch[key];
      else if (key === 'passRate') task[key] = Math.min(100,Math.max(0,finite(patch[key],task[key])));
      else if (key === 'mode') task[key] = patch[key] === 'exam' ? 'exam' : 'practice';
      else task[key] = String(patch[key]);
    });
    persist('task'); return task;
  }
  function updateSettings(patch) {
    if (!patch || typeof patch !== 'object') return state.settings;
    const settings = state.settings;
    if (patch.shortDialoguePlayCount !== undefined) settings.shortDialoguePlayCount = Number(patch.shortDialoguePlayCount) === 1 ? 1 : 2;
    if (patch.speed !== undefined) settings.speed = [0.75,1,1.25,1.5].includes(Number(patch.speed)) ? Number(patch.speed) : 1;
    if (patch.skipMainInstruction !== undefined) settings.skipMainInstruction = !!patch.skipMainInstruction;
    if (patch.skipReadingTime !== undefined) settings.skipReadingTime = !!patch.skipReadingTime;
    persist('settings'); return settings;
  }
  function setClock(value) {
    const current = now();
    if (value === null || value === 'real') state.clock = {offsetMs:0,running:true};
    else if (typeof value === 'object') {
      const running = value.running !== false;
      const time = toMs(value.now !== undefined ? value.now : value.value,current);
      state.clock = value.offsetMs !== undefined ? {offsetMs:finite(value.offsetMs,0),running} : {offsetMs:time-Date.now(),running};
      if (!running) state.clock.now = value.offsetMs !== undefined ? Date.now()+state.clock.offsetMs : time;
    } else { const time = toMs(value,current); state.clock = {offsetMs:time-Date.now(),running:true}; }
    persist('clock'); return now();
  }
  function getDraft(taskId,paperId) { const draft = state.drafts[paperId]; return draft && (!draft.taskId || draft.taskId === taskId) ? copy(draft) : null; }
  function saveDraft(taskId,paperId,draft) {
    if (!getPaper(taskId,paperId) || !draft || typeof draft !== 'object') return null;
    state.drafts[paperId] = Object.assign({},copy(draft),{taskId,paperId,updatedAt:now()}); persist('draft'); return copy(state.drafts[paperId]);
  }
  function discardDraft(taskId,paperId) { if (!getPaper(taskId,paperId)) return false; delete state.drafts[paperId]; persist('draft-discard'); return true; }
  function getLearningDraft(key) { return copy((state.learningDrafts || {})[key] || null); }
  function saveLearningDraft(key, draft) {
    if (typeof key !== 'string' || !key || !draft || typeof draft !== 'object') return null;
    if (!state.learningDrafts) state.learningDrafts = {};
    state.learningDrafts[key] = Object.assign({}, copy(draft), {updatedAt: now()});
    persist('learning-draft'); return getLearningDraft(key);
  }
  function discardLearningDraft(key) {
    if (!state.learningDrafts || !Object.prototype.hasOwnProperty.call(state.learningDrafts,key)) return false;
    delete state.learningDrafts[key]; persist('learning-draft-discard'); return true;
  }
  function submit(payload) {
    const data = payload || {};
    const task = getTask(data.taskId); const paper = getPaper(data.taskId,data.paperId);
    if (!task || !paper) return {status:'blocked',message:'未找到对应任务或套题'};
    const previous = (state.attempts[paper.id] || []).find(attempt => data.sessionId && attempt.sessionId === data.sessionId);
    if (previous) return {status:'success',attempt:copy(previous),duplicate:true};
    const questions = questionsOf(paper,data.questions);
    const score = resultFromAnswers(data.answers,questions);
    const missing = questions.filter(q => !score.answers[q]);
    if (!data.auto && missing.length) return {status:'missing',missing,message:'以下题目尚未作答：' + missing.join('、')};
    const at = toMs(data.submittedAt,now());
    if (at < task.startAt || at < task.visibleAt) return {status:'blocked',message:'尚未到老师规定的作答时间'};
    const status = paperStatus(task.id,paper.id);
    const late = at > task.endAt;
    if (late && (status.everPassed || !task.allowLate)) return {status:'blocked',message:'您已经超过了老师的规定作答时间，无法提交'};
    if (late && !data.confirmLate) return {status:'late_confirmation',message:'您已经超过了老师的规定作答时间，是否立即补交？'};
    const startedAt = toMs(data.startedAt,at);
    const elapsedSeconds = Math.max(0,Math.round((at-startedAt)/1000));
    const id = data.sessionId || 'session-' + at.toString(36) + '-' + Math.random().toString(36).slice(2,8);
    const attempts = state.attempts[paper.id] || (state.attempts[paper.id] = []);
    const attempt = Object.assign({id:'attempt-'+id,sessionId:id,taskId:task.id,paperId:paper.id,questions,questionOrder:Array.isArray(data.questionOrder) ? data.questionOrder.slice() : questions.slice(),startedAt,submittedAt:at,elapsedSeconds,durationSeconds:elapsedSeconds,passed:score.accuracy >= task.passRate,passRate:task.passRate,auto:!!data.auto,late,publishedAtSubmit:!!task.published,ordinal:attempts.length+1},score,{correct:score.correctCount,total:score.totalCount});
    if (data.optionOrders) attempt.optionOrders = copy(data.optionOrders);
    attempts.push(attempt);
    delete state.drafts[paper.id];
    persist('submit'); return {status:'success',attempt:copy(attempt)};
  }
  function selectCase(id) {
    const target = id || 'personal';
    if (target !== 'personal' && !definitions.some(item => item.id === target)) return null;
    activeCaseId = target; state = load(target); emit('case-select'); return state;
  }
  function resetCase(id) {
    const target = id || activeCaseId;
    if (target === 'personal' || !definitions.some(item => item.id === target)) return null;
    const fresh = makeCase(target);
    storage.write(keyFor(target),JSON.stringify(fresh));
    try { if (channel) channel.postMessage({key:keyFor(target),revision:fresh.revision,reset:true}); } catch (_) {}
    if (target === activeCaseId) { state = fresh; emit('case-reset'); }
    return fresh;
  }
  const api = {VERSION,STORAGE_KEY,SCHEMA_VERSION:SCHEMA,CORRECT_ANSWERS:Object.freeze(copy(CORRECT)),cases,getState:() => state,getTask,getPaper,now,taskStatus,paperStatus,getTaskStats,submit,saveDraft,getDraft,discardDraft,getLearningDraft,saveLearningDraft,discardLearningDraft,updateTask,updateSettings,setClock,selectCase,resetCase,subscribe(fn) { if (typeof fn !== 'function') return () => {}; subscribers.add(fn); return () => subscribers.delete(fn); },answersFor,refresh:() => { refreshFromStorage('refresh'); return state; },getStorageKey:() => keyFor(activeCaseId),isPersistent:() => storageAvailable};
  global.StudentDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
