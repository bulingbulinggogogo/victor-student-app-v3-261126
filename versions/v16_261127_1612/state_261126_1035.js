/* 学生端 APP v11 状态与案例。默认目录共存，旧独立案例继续隔离。 */
(function (global) {
  'use strict';
  const VERSION = '学生端APP_v16_261127_1612';
  const STORAGE_KEY = 'victor-student-app:v16:261127_1612';
  const SCHEMA = 1;
  const DAY = 86400000;
  const MINUTE = 60000;
  const PROMPTS=Object.freeze({
    P01:Object.freeze({title:'无法提交',message:'您已经超过了老师的规定作答时间，无法提交',buttons:['我知道了']}),
    P02:Object.freeze({title:'补交作答',message:'您已经超过了老师的规定作答时间，是否立即补交？',buttons:['放弃本次作答','立即补交']}),
    P03:Object.freeze({title:'放弃本次作答',message:'是否放弃本次作答？',buttons:['取消','确认放弃']}),
    P04:Object.freeze({title:'暂存本次作答',message:'是否暂存本次作答？下次可继续作答',buttons:['放弃本次作答','确认暂存']})
  });
  const passRateOf=task=>Math.max(0,Math.min(100,Number.isFinite(Number(task?.passRate))?Number(task.passRate):0));

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
    return Object.assign({id: 'seed-' + paper.id + '-' + order, sessionId:'seed-' + paper.id + '-' + order, taskId:task.id, paperId:paper.id, questions, questionOrder:questions.slice(), startedAt:submittedAt - (spec.elapsedSeconds || 186) * 1000, submittedAt, elapsedSeconds:spec.elapsedSeconds || 186, durationSeconds:spec.elapsedSeconds || 186, passed:score.accuracy >= passRateOf(task), passRate:task.passRate, auto:false, late:submittedAt > task.endAt, publishedAtSubmit:!!task.published, ordinal:order + 1}, score, {correct:score.correctCount,total:score.totalCount});
  }
  const BOOKS=[
    {id:'active-01',category:'active',title:'新高中英语听力进阶 高一下',edition:'2026·人教版',learned:5,total:50,accuracy:90},
    {id:'active-02',category:'active',title:'新高中英语听力进阶 高一下·专项训练',edition:'2026·配套训练',learned:2,total:50,accuracy:80},
    {id:'purchased-01',category:'purchased',expired:true,title:'听力进阶 高一下·基础巩固',edition:'2026·配套训练',learned:0,total:50},
    {id:'purchased-02',category:'purchased',expired:true,title:'听力进阶 高一下·提升训练',edition:'2026·配套训练',learned:0,total:50}
  ];
  function taskStateName(task,label,at){
    const base=String(label).split('｜')[0].replace(/^(A\d{2}) (截止前|已截止)[\s\S]*$/,'$1').replace(/ · (已公布|未公布)$/,'');
    return [base,task.mode==='exam'?'考试模式':'练习模式',task.published?'答案已公布':'答案未公布',at<task.startAt?'未开始':at>task.endAt?'已过截止':'未过截止',task.allowLate?'教师允许补交':'教师禁止补交'].join('｜');
  }
  function paperStateName(label,attempts,draft){
    const count=attempts.length,passed=attempts.some(a=>a.passed);
    return [String(label).split('｜')[0],passed?'曾达标':'从未达标',count?(count===1?'1次作答':'多次作答('+count+'次)'):'0次作答',count?'有作答记录':'无作答记录',draft?'有存稿':'无存稿'].join('｜');
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
    tasks.forEach(task => {
      task.planDays=2;task.unlockMode='all';task.publishPolicy='manual';
      if(task.papers.length===1)task.papers.push(Object.assign(copy(task.papers[0]),{id:task.papers[0].id+'-02',title:'模拟试题2'}));
    });
    const state = {schemaVersion:SCHEMA,version:VERSION,books:copy(BOOKS),expiredBookRecords:Object.fromEntries(BOOKS.filter(b=>b.expired).map(b=>[b.id,[{id:b.id+'-record-1',title:'模拟试题1',questions:ALL.slice(),answers:answersFor(12)},{id:b.id+'-record-2',title:'模拟试题2',questions:ALL.slice(),answers:answersFor(16)}]])),activeBookId:BOOKS[0].id,caseId:caseId || 'personal',createdAt:at,updatedAt:at,revision:0,tasks,attempts:{},drafts:{},settings:{shortDialoguePlayCount:2,speed:1,skipMainInstruction:false,skipReadingTime:false},clock:{offsetMs:0,running:true}};
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
    {id:'c01_visible_later',title:'C01 尚未到可见时间',category:'时间与入口',description:'任务尚不可见，学生端不显示该任务或套题。',expected:'普通列表与学生案例目录均不可见，直接入口也不弹窗提示。',entry:'detail',config:{visible:60,start:120,end:240}},
    {id:'c02_before_start',title:'C02 已可见但未到开始',category:'时间与入口',description:'可看任务详情，开始按钮暂不可用。',expected:'可见与可作答分别控制。',entry:'detail',config:{start:60,end:240}},
    {id:'c03_practice_new',title:'C03 练习首次作答',category:'作答流程',description:'截止前、未作答，练习可自由切题。',expected:'正常进入练习，可拖动和反复播放。',entry:'exercise'},
    {id:'c04_exam_new',title:'C04 考试首次作答',category:'作答流程',description:'考试固定倍速，播放阶段不可跳题。',expected:'无主动暂停、进度拖动、跳主指令或遍数调整。',entry:'exercise',config:{mode:'exam'}},
    {id:'c05_manual_missing',title:'C05 手动提交存在缺答',category:'提交与交卷',description:'仅回答前几题，只有最后题所在页显示禁用的提交。',expected:'漏答时提交按钮真正禁用，不弹窗、不交卷、不计次；其他页不显示提交。',entry:'exercise',action:'missing',draft:{answered:4}},
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
    {id:'c27_same_material_wrong',title:'C27 长对话多道错题整轮巩固',category:'错题与解析',description:'第10至12题同一材料，本次第10题正确、11和12题错误；另有第7和18题错误。',expected:'同一材料页只显示11和12题，不显示正确的第10题；其他材料仅显示各自错题，最后错题所在页整轮提交。',entry:'result',action:'wrong',history:[{wrongQuestions:[7,11,12,18]}]},
    {id:'c28_similar_round',title:'C28 同类题整轮提交与凸显解析',category:'错题与解析',description:'从普通解析进入同类题，作答时不立即显对错。',expected:'最后材料页提交后使用统一解析，高亮内容对应。',entry:'result',action:'similar',history:[{correctCount:16}]},
    {id:'c29_settings_memory',title:'C29 练习学习设置记忆',category:'选项与设置',description:'预置1遍、1.25倍速和跳过主指令。',expected:'设置记住用户选择，段落指令仍播放，解析无设置入口。',entry:'exercise',settings:{shortDialoguePlayCount:1,speed:1.25,skipMainInstruction:true,skipReadingTime:false}},
    {id:'c30_task_partial',title:'C30 大任务部分套题完成',category:'任务汇总',description:'两套题仅一套曾经达标。',expected:'整块任务仍待完成，完成量1/2。',entry:'detail',papers:2,histories:{'paper-01':[{correctCount:16}]}},
    {id:'c31_task_complete',title:'C31 大任务全部套题完成',category:'任务汇总',description:'两套题都曾达标。',expected:'整块任务已完成，完成量2/2。',entry:'detail',papers:2,histories:{'paper-01':[{correctCount:16}],'paper-02':[{correctCount:14}]}},
    {id:'c32_weighted_latest',title:'C32 曾达标套题取最新成绩',category:'任务汇总',description:'10题套卷80%后60%，20题套卷80%；另有未达标套卷不计。',expected:'仅取曾达标两套的最新60%和80%，任务正答率70%，第三套从未达标不纳入。',entry:'detail',papers:3,paperQuestions:{'paper-01':ALL.slice(0,10)},histories:{'paper-01':[{correctCount:8},{correctCount:6}],'paper-02':[{correctCount:16}],'paper-03':[{correctCount:10}]}},
    {id:'c33_publish_after_submit',title:'C33 提交后老师公布答案',category:'成绩与公布',description:'先查看隐藏成绩，再通过工作台公布。',expected:'原成绩单与历史记录按当前公布状态更新，无需重做。',entry:'result',config:{published:false},history:[{correctCount:16}]},
    {id:'c34_failed_history_forbidden',title:'C34 逾期未达标历史仍保留',category:'次数与历史',description:'已提交65%，现在截止且禁止补交。',expected:'历史练习可看原记录和用时，不伪装成从未提交空成绩单。',entry:'result',config:{end:-60,allowLate:false},history:[{correctCount:13}]},
    {id:'c35_retries_then_pass',title:'C35 第5次首次达标',category:'次数与历史',description:'前4次未达标，第5次70%达标。',expected:'显示第5次作答，历史保存全部5次。',entry:'result',history:[{correctCount:8},{correctCount:10},{correctCount:11},{correctCount:13},{correctCount:14}]},
    {id:'c36_late_pass_submission',title:'C36 补交后达标完成',category:'截止与补交',description:'有一条截止后的80%补交记录。',expected:'提交时间标记补交，任务进入历史练习，不可继续刷分。',entry:'result',config:{end:-60,allowLate:true},history:[{correctCount:16,late:true}]},
    {id:'c37_late_failed_submission',title:'C37 补交后仍未达标',category:'截止与补交',description:'补交65%仍未达标，老师允许补交。',expected:'记录仍保留、任务仍待补交，允许再次补交。',entry:'result',config:{end:-60,allowLate:true},history:[{correctCount:13,late:true}]},
    {id:'c38_no_threshold',title:'C38 不限制达标线',category:'成绩与公布',description:'老师达标线设置为不限制。',expected:'成功交卷即满足完成条件，但成绩仍为实际结果。',entry:'result',config:{passRate:0},history:[{correctCount:8}]}
  ];
  const historyProfiles = [
    {label:'未作答',history:[]},
    {label:'1次未达标',history:[{correctCount:12}]},
    {label:'1次已达标',history:[{correctCount:16}]},
    {label:'多次均未达标',history:[{correctCount:10},{correctCount:13}]},
    {label:'曾达标，最新未达标',history:[{correctCount:16},{correctCount:12}]},
    {label:'多次作答，最新达标',history:[{correctCount:8},{correctCount:10},{correctCount:11},{correctCount:13},{correctCount:16}]}
  ];
  const catalogRows = [];
  let catalogSerial=0;
  [{key:'open',label:'截止前',end:10080,allowLate:true},
   {key:'late-yes',label:'已截止，可补交',end:-60,allowLate:true},
   {key:'late-no',label:'已截止，不可补交',end:-60,allowLate:false}].forEach(period=>{
    [false,true].forEach(published=>{
      const id='catalog-'+period.key+'-'+Number(published), code='A'+String(++catalogSerial).padStart(2,'0');
      const title=code+' '+period.label+' · '+(published?'已公布':'未公布');
      definitions.push({id,title,category:'A 套题与成绩',papers:6,entry:'detail',
        config:{published,end:period.end,allowLate:period.allowLate},
        paperTitles:historyProfiles.map(p=>p.label),
        histories:Object.fromEntries(historyProfiles.map((p,i)=>['paper-'+String(i+1).padStart(2,'0'),p.history])),
        description:'同一任务配置下对照六种作答历史，不重复拆分任务。',expected:'每行按钮互斥，公布条件正确；曾达标和最新成绩分开判断。'});
      catalogRows.push({id,code,title,group:'A 套题与成绩'});
    });
  });
  [false,true].forEach((published,i)=>{
    const id='catalog-before-start-'+Number(published),code='B0'+(i+1),title=code+' 未开始 · '+(published?'已公布':'未公布');
    definitions.push({id,title,category:'B 时间与可见',papers:2,entry:'detail',config:{published,start:60,end:240},
      description:'可见未开始，两套均无记录。',expected:'无操作按钮；未公布隐藏标签，已公布无记录显示正答率--。'});
    catalogRows.push({id,code,title,group:'B 时间与可见'});
  });
  definitions.push({id:'catalog-complete-hidden',title:'C01 全部达标 · 未公布',category:'C 任务汇总',papers:2,entry:'detail',
    config:{published:false},histories:{'paper-01':[{correctCount:16}],'paper-02':[{correctCount:16},{correctCount:12}]},
    description:'两套均曾达标，但最新成绩不同。',expected:'任务已完成，成绩标签全部隐藏。'});
  catalogRows.push(
    {id:'catalog-complete-hidden',code:'C01',title:'C01 全部达标 · 未公布',group:'C 任务汇总'},
    {id:'c31_task_complete',code:'C02',title:'C02 全部达标 · 已公布',group:'C 任务汇总'},
    {id:'c32_weighted_latest',code:'C03',title:'C03 曾达标套题 · 最新成绩',group:'C 任务汇总'},
    {id:'c38_no_threshold',code:'C04',title:'C04 不设达标线',group:'C 任务汇总'},
    {id:'c24_practice_draft',code:'D01',title:'D01 练习 · 暂存与首次作答',group:'D 作答与恢复'},
    {id:'c25_exam_resume',code:'D02',title:'D02 考试 · 中断与首次作答',group:'D 作答与恢复'},
    {id:'c27_same_material_wrong',code:'E01',title:'E01 解析 · 错题与全对',group:'E 解析与巩固'},
    {id:'c01_visible_later',code:'Z01',title:'Z01 未到可见时间',group:'Z 不可见校验'}
  );
  const practiceRows=catalogRows.filter(row=>row.code.startsWith('A'));
  practiceRows.forEach((row,i)=>{
    const def=copy(definitions.find(def=>def.id===row.id));
    def.id=row.id.replace('catalog-','catalog-exam-');def.title='A'+String(i+7).padStart(2,'0')+' '+row.title.slice(4);
    def.config.mode='exam';definitions.push(def);
    catalogRows.push({id:def.id,code:'A'+String(i+7).padStart(2,'0'),title:def.title,group:row.group});
  });
  [false,true].forEach((published,i)=>{
    const def=copy(definitions.find(def=>def.id==='catalog-before-start-'+Number(published)));
    def.id='catalog-exam-before-start-'+Number(published);def.title='B0'+(i+3)+' 未开始';def.config.mode='exam';definitions.push(def);
    catalogRows.push({id:def.id,code:'B0'+(i+3),title:def.title,group:'B 时间与可见'});
  });
  const hiddenExam=copy(definitions.find(def=>def.id==='c01_visible_later'));
  hiddenExam.id='catalog-exam-hidden';hiddenExam.title='Z02 未到可见时间';hiddenExam.config.mode='exam';definitions.push(hiddenExam);
  catalogRows.push({id:hiddenExam.id,code:'Z02',title:hiddenExam.title,group:'Z 不可见校验'});
  catalogRows.sort((a,b)=>a.code.localeCompare(b.code));
  const teacherDefinitions=[
    {id:'teacher-daily',title:'T01 每日解锁首日',category:'T 教师配置',entry:'detail',papers:6,config:{mode:'practice',published:false,startDay:0,end:10080,planDays:3,unlockMode:'daily',publishPolicy:'manual'},description:'3天计划、6套题，开始日解锁2套。',expected:'未解锁行保留但无操作按钮，显示解锁时间。'},
    {id:'teacher-complete',title:'T02 任务完成不自动公布',category:'T 教师配置',entry:'detail',papers:6,config:{mode:'exam',published:false,startDay:-2,end:10080,planDays:2,unlockMode:'daily',publishPolicy:'manual'},histories:Object.fromEntries([2,3,4,5,6].map(i=>['paper-0'+i,[{correctCount:16}]])),draft:{answered:20,checkSeconds:120},description:'已开始3天，全部解锁，5套已达标，首套在检查阶段。',expected:'首套成功达标后任务完成，答案仍保持未公布。'},
    {id:'teacher-deadline',title:'T03 截止后自动公布',category:'T 教师配置',entry:'detail',papers:6,config:{mode:'practice',published:false,end:60,planDays:2,unlockMode:'all',publishPolicy:'afterDeadline'},histories:{'paper-01':[{correctCount:16}]},description:'未截止隐藏成绩，到截止点自动公布。',expected:'无需重新作答，已打开页面按当前策略刷新。'},
    {id:'teacher-manual',title:'T04 教师手动公布',category:'T 教师配置',entry:'detail',papers:6,config:{mode:'practice',published:false,end:10080,planDays:2,unlockMode:'all',publishPolicy:'manual'},histories:{'paper-01':[{correctCount:16}]},description:'教师点击公布答案后，学生成绩、记录和解析权限刷新。',expected:'公布按钮实际更新当前任务，其他任务不变。'}
  ];
  teacherDefinitions.forEach((def,i)=>{definitions.push(def);catalogRows.push({id:def.id,code:'T0'+(i+1),title:def.title,group:'T 教师配置'});});
  catalogRows.sort((a,b)=>a.code.localeCompare(b.code));
  const finalDefinitions=[{"id":"final-01","title":"F01 未到可见时间","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"visible":60},"description":"最终确认稿第11节验收情景01。","expected":"未到可见时间"},{"id":"final-02","title":"F02 已可见未开始","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"start":60},"description":"最终确认稿第11节验收情景02。","expected":"已可见未开始"},{"id":"final-03","title":"F03 截止前未达标无存稿","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{},"description":"最终确认稿第11节验收情景03。","expected":"截止前未达标无存稿"},{"id":"final-04","title":"F04 截止前曾达标无存稿","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{},"description":"最终确认稿第11节验收情景04。","expected":"截止前曾达标无存稿","history":[{"correctCount":16}]},{"id":"final-05","title":"F05 截止前曾达标有存稿","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{},"description":"最终确认稿第11节验收情景05。","expected":"截止前曾达标有存稿","history":[{"correctCount":16}],"draft":{"answered":7,"position":180,"section":"material-6"}},{"id":"final-06","title":"F06 已截止禁止补交有存稿","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"end":-60,"allowLate":false},"description":"最终确认稿第11节验收情景06。","expected":"已截止禁止补交有存稿","draft":{"answered":20,"position":180,"section":"material-10"}},{"id":"final-07","title":"F07 已截止允许补交但曾达标有存稿","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"end":-60,"allowLate":true,"mode":"exam"},"description":"最终确认稿第11节验收情景07。","expected":"已截止允许补交但曾达标有存稿","history":[{"correctCount":16}],"draft":{"answered":20,"position":180,"section":"material-10"}},{"id":"final-08","title":"F08 已截止允许补交且从未达标无存稿","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"end":-60,"allowLate":true},"description":"最终确认稿第11节验收情景08。","expected":"已截止允许补交且从未达标无存稿"},{"id":"final-09","title":"F09 已截止允许补交且从未达标有存稿","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"end":-60,"allowLate":true},"description":"最终确认稿第11节验收情景09。","expected":"已截止允许补交且从未达标有存稿","draft":{"answered":20,"position":180,"section":"material-10"}},{"id":"final-10","title":"F10 补交后仍未达标","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"end":-60,"allowLate":true},"description":"最终确认稿第11节验收情景10。","expected":"补交后仍未达标","history":[{"correctCount":12,"late":true}],"paperDrafts":{"paper-02":{"answered":7,"position":180,"section":"material-6"}}},{"id":"final-11","title":"F11 补交首次达标后","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"end":-60,"allowLate":true},"description":"最终确认稿第11节验收情景11。","expected":"补交首次达标后","history":[{"correctCount":16,"late":true}]},{"id":"final-12","title":"F12 作答中跨越截止","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"end":60,"allowLate":false},"description":"最终确认稿第11节验收情景12。","expected":"作答中跨越截止"},{"id":"final-13","title":"F13 未公布已有记录","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"published":false},"description":"最终确认稿第11节验收情景13。","expected":"未公布已有记录","history":[{"correctCount":12}]},{"id":"final-14","title":"F14 已公布无记录","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"published":true},"description":"最终确认稿第11节验收情景14。","expected":"已公布无记录"},{"id":"final-15","title":"F15 首次未达标已公布","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"published":true},"description":"最终确认稿第11节验收情景15。","expected":"首次未达标已公布","history":[{"correctCount":12}]},{"id":"final-16","title":"F16 第5次作答已公布","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"published":true},"description":"最终确认稿第11节验收情景16。","expected":"第5次作答已公布","history":[{"correctCount":8},{"correctCount":10},{"correctCount":11},{"correctCount":13},{"correctCount":16}]},{"id":"final-17","title":"F17 先达标后未达标","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"published":true},"description":"最终确认稿第11节验收情景17。","expected":"先达标后未达标","history":[{"correctCount":16},{"correctCount":12}]},{"id":"final-18","title":"F18 不设达标线尚未提交","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"passRate":0},"description":"最终确认稿第11节验收情景18。","expected":"不设达标线尚未提交"},{"id":"final-19","title":"F19 不设达标线首次0%","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"passRate":0},"description":"最终确认稿第11节验收情景19。","expected":"不设达标线首次0%"},{"id":"final-20","title":"F20 同材料6至8题仅7和8错误","category":"00 最终稿验收20情景","entry":"detail","papers":2,"config":{"passRate":0,"published":true},"description":"最终确认稿第11节验收情景20。","expected":"同材料6至8题仅7和8错误","paperQuestions":{"paper-01":[10,11,12],"paper-02":[10,11,12]},"paperOverrides":{"paper-01":{"presentationNumbers":{"10":6,"11":7,"12":8},"fixtureMaterial":"material-8","fixtureSourceQuestions":[10,11,12]},"paper-02":{"presentationNumbers":{"10":6,"11":7,"12":8},"fixtureMaterial":"material-8","fixtureSourceQuestions":[10,11,12]}},"histories":{"paper-01":[{"correctCount":1,"wrongQuestions":[11,12]}],"paper-02":[{"correctCount":3}]}}];
  finalDefinitions.forEach(def=>{definitions.push(def);catalogRows.push({id:def.id,code:def.title.slice(0,3),title:def.title,group:'00 最终稿验收20情景'});});
  // Full paired draft matrix; historical source fixtures remain unchanged.
  let draftMatrixSerial=0;
  for(const mode of ['practice','exam'])for(const published of [false,true])for(const allowLate of [false,true])for(const stage of ['hidden','before-start','open','late','locked']){
    const code='G'+String(++draftMatrixSerial).padStart(2,'0'),id='draft-matrix-'+mode+'-'+Number(published)+'-'+Number(allowLate)+'-'+stage;
    const stageLabel={hidden:'未到可见时间','before-start':'已可见未开始',open:'截止前',late:'已过截止',locked:'分天解锁未解锁'}[stage];
    const offset=stage==='locked'?2:0,config={mode,published,allowLate,passRate:70};
    if(stage==='hidden')Object.assign(config,{visible:60,start:120,end:240});
    if(stage==='before-start')Object.assign(config,{start:60,end:240});
    if(stage==='late')config.end=-60;
    if(stage==='locked')Object.assign(config,{startDay:0,unlockMode:'daily',planDays:14});
    const histories={},paperDrafts={},paperTitles=[];
    if(offset)paperTitles.push('解锁前置套题1','解锁前置套题2');
    historyProfiles.forEach((profile,i)=>[false,true].forEach(hasDraft=>{
      const n=offset+i*2+Number(hasDraft)+1,key='paper-'+String(n).padStart(2,'0');histories[key]=copy(profile.history);paperTitles[n-1]=profile.label+'，'+(hasDraft?'有存稿':'无存稿');
      if(hasDraft)paperDrafts[key]={answered:7,position:180,section:'material-6',startedMinutes:stage==='late'?120:5};
    }));
    const title=code+' 存稿对照 · '+stageLabel;
    definitions.push({id,title,category:'G 存稿全状态',papers:12+offset,entry:'detail',config,histories,paperDrafts,paperTitles,
      description:'六种成功历史，每种各有存稿和无存稿一套；未可见、未开始及未解锁含教师调整配置后的保留存稿。',expected:'有存稿且已可见已开始均显示继续作答，提交时再校验；未可见不显示，未开始不提供作答按钮。'});
    catalogRows.push({id,code,title,group:'G 存稿全状态',matrixStage:stage,draftMatrix:true,matrixOffset:offset});
  }
  const cases = definitions.map(def => {
    const sample=makeCase(def.id),task=sample.tasks[0],paper=task.papers[0];
    return Object.freeze({id:def.id,title:taskStateName(task,def.title,Date.now()),fullTitle:taskStateName(task,def.title,Date.now())+'｜'+paperStateName('当前套题',sample.attempts[paper.id]||[],sample.drafts[paper.id]),category:def.category,description:def.description,expected:def.expected,taskId:'pending-260805',paperId:'paper-01',entry:def.entry||'detail',action:def.action||'',preset:Object.assign({},def.draft?{draft:copy(def.draft),correctCount:def.draft.answered===20?16:undefined}:{},def.id==='c27_same_material_wrong'?{wrongQuestions:[7,11,12,18]}:{})});
  });
  function makeCase(caseId) {
    const state = baseState(caseId);
    const def = definitions.find(item => item.id === caseId);
    if (!def) return state;
    const at = state.createdAt;
    const task = state.tasks[0];
    const config = def.config || {};
    task.papers = task.papers.slice(0,Math.max(2,def.papers || 2));
    task.startAt = config.startDay!==undefined ? Math.floor((at+8*3600000)/DAY)*DAY-8*3600000+config.startDay*DAY : at + finite(config.start,-120)*MINUTE;
    task.endAt = at + finite(config.end,180)*MINUTE;
    task.visibleAt = at + finite(config.visible,-180)*MINUTE;
    ['mode','allowLate','published','passRate','randomOptions','planDays','unlockMode','publishPolicy'].forEach(key => { if (config[key] !== undefined) task[key] = config[key]; });
    for (const key of Object.keys(state.attempts)) if (key.startsWith('paper-')) delete state.attempts[key];
    if (def.paperQuestions) task.papers.forEach(paper => { if (def.paperQuestions[paper.id]) paper.questions = def.paperQuestions[paper.id].slice(); });
    if(def.paperOverrides)task.papers.forEach(paper=>{Object.assign(paper,copy(def.paperOverrides[paper.id]||{}));});
    const histories = Object.assign({},def.histories || {});
    if (def.history) task.papers.forEach(paper => { histories[paper.id] = def.history; });
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
    if(def.paperDrafts)task.papers.forEach(paper=>{
      const draft=def.paperDrafts[paper.id];if(!draft)return;
      const questions=questionsOf(paper),answers=Object.fromEntries(questions.slice(0,draft.answered||0).map(q=>[q,CORRECT[q]]));
      state.drafts[paper.id]=Object.assign({taskId:task.id,paperId:paper.id,sessionId:'case-extra-'+caseId+'-'+paper.id,questions,questionOrder:questions.slice(),answers,optionOrders:Object.fromEntries(questions.map(q=>[q,['A','B','C']])),startedAt:at-(draft.startedMinutes||5)*MINUTE,paused:true},copy(draft));
    });
    state.caseDescription = def.description;
    return state;
  }
  const showcaseTaskId = caseId => caseId === 'catalog-open-1' ? 'pending-260805' : 'showcase-' + caseId;
  function makeShowcaseTask(caseId) {
    const def = definitions.find(item => item.id === caseId);
    if (!def) return null;
    // makeCase keeps its existing isolated fixtures. Only its primary task is copied.
    const source = makeCase(caseId);
    const original = source.tasks[0];
    const task = copy(original);
    const at = source.createdAt;
    task.id = showcaseTaskId(caseId);
    const catalog = catalogRows.find(row=>row.id===caseId);
    task.title = catalog?.title || def.title;
    task.catalogCode = catalog?.code || null;
    task.catalogGroup = catalog?.group || null;
    task.showcaseCaseId = caseId;
    // The default catalogue should keep its named states during a long review.
    // A task being worked on still uses the real running clock and normal submit rules.
    if (def.config && def.config.visible > 0) {
      task.visibleAt = at + 365 * DAY;
      task.startAt = at + 366 * DAY;
      task.endAt = at + 367 * DAY;
    } else if (def.config && def.config.start > 0) {
      task.startAt = at + 365 * DAY;
      task.endAt = at + 366 * DAY;
    } else if (!def.config || def.config.end === undefined) {
      task.endAt = at + 365 * DAY;
    }
    task.title=taskStateName(task,task.title,at);
    const attempts = {}, drafts = {};
    task.papers.forEach((paper, index) => {
      const oldId = paper.id;
      paper.id = caseId === 'catalog-open-1' ? oldId : task.id + '-' + oldId;
      let sourceAttempts = source.attempts[oldId] || [];
      if(caseId==='c27_same_material_wrong'&&index===1)sourceAttempts=[seedAttempt(original,paper,{correctCount:20},at,0)];
      const everPassed = sourceAttempts.some(item => item.passed);
      const latest = sourceAttempts[sourceAttempts.length - 1];
      if (task.papers.length === 1) paper.title = def.title.replace(/^C\d+\s*/, '');
      else {
        const stateLabel = !latest ? '尚未作答' : everPassed ? (latest.passed ? '已达标' : '曾达标，最新未达标') : '未达标';
        paper.title = '套题' + (index + 1) + ' · ' + (def.paperTitles?.[index] || stateLabel);
      }
      if(catalog&&['c24_practice_draft','c25_exam_resume','c27_same_material_wrong'].includes(caseId)){
        const labels=caseId==='c24_practice_draft'?['暂存作答，恢复7题','首次作答，无草稿']:caseId==='c25_exam_resume'?['非主动中断，断点续播','首次考试，无草稿']:['含同材料错题11和12','全部答对，无错题'];
        paper.title='套题'+(index+1)+' · '+labels[index];
      }
      paper.title=paperStateName('套题'+(index+1),sourceAttempts,!!source.drafts[oldId]);
      if (sourceAttempts.length) attempts[paper.id] = sourceAttempts.map((value, order) => Object.assign(copy(value), {
        id: 'seed-' + paper.id + '-' + order,
        sessionId: 'seed-' + paper.id + '-' + order,
        taskId: task.id,
        paperId: paper.id
      }));
      if (source.drafts[oldId]) {
        const draft = copy(source.drafts[oldId]);
        Object.assign(draft, {
          taskId: task.id,
          paperId: paper.id,
          sessionId: 'showcase-draft-' + paper.id,
          checkDeadline: null,
          checkStartedAt: null,
          showcasePending: true,
          showcasePreparation: {
            caseId,
            checkSeconds: Number(def.draft && def.draft.checkSeconds || 0),
            startedMinutes: Number(def.paperDrafts?.[oldId]?.startedMinutes || def.draft && def.draft.startedMinutes || 5)
          }
        });
        drafts[paper.id] = draft;
      }
    });
    return {task, attempts, drafts};
  }
  let canonicalCatalogCache=[];
  const timeState=(t,at)=>at<t.visibleAt?'hidden':at<t.startAt?'before-start':at>t.endAt?'late':'open';
  function taskGroupKey(t,at,attempts){
    const complete=t.papers.length>0&&t.papers.every(p=>(attempts[p.id]||[]).some(a=>a.passed));
    return JSON.stringify([t.mode,timeState(t,at),!!t.published,!!t.allowLate,passRateOf(t),t.unlockMode,t.planDays,t.publishPolicy,complete]);
  }
  function paperCaseKey(t,p,attempts,draft,at){
    const unlock=t.unlockMode==='daily'?Math.floor(t.papers.indexOf(p)/Math.max(1,Math.ceil(t.papers.length/t.planDays))):0;
    return JSON.stringify([p.questions,p.presentationNumbers||null,p.fixtureMaterial||null,unlock,(attempts||[]).map(a=>[a.answers,a.passed,!!a.late]),draft?[draft.answers,draft.position||0,String(draft.section||'first-intro').replace(/^second-/,'material-'),draft.checkDeadline?Math.round((draft.checkDeadline-at)/1000):draft.showcasePreparation?.checkSeconds||0]:null]);
  }
  function regroupPersonal(personal){
    const at=personal.createdAt,groups=new Map(),aliases={tasks:{},papers:{},cases:{},sourceRows:[]};
    for(const task of personal.tasks){const key=taskGroupKey(task,at,personal.attempts);if(!groups.has(key))groups.set(key,{key,sources:[]});groups.get(key).sources.push(task);}
    const order={practice:0,exam:1},stages={hidden:0,'before-start':1,open:2,late:3};
    const sorted=[...groups.values()].sort((a,b)=>{const x=a.sources[0],y=b.sources[0];return order[x.mode]-order[y.mode]||stages[timeState(x,at)]-stages[timeState(y,at)]||Number(x.published)-Number(y.published)||Number(x.allowLate)-Number(y.allowLate)||passRateOf(x)-passRateOf(y)||a.key.localeCompare(b.key);});
    const tasks=[],attempts={},drafts={},catalog=[];
    sorted.forEach((group,index)=>{
      const primary=group.sources.find(t=>t.id==='pending-260805')||group.sources[0],task=copy(primary),code='T'+String(index+1).padStart(2,'0'),paperKeys=new Map();
      task.papers=[];task.catalogCode=code;task.catalogGroup=task.mode==='exam'?'02 考试任务':'01 练习任务';task.title=code+' '+({hidden:'未到可见时间','before-start':'未开始',open:'截止前',late:'已截止'}[timeState(task,at)])+' · '+(JSON.parse(group.key)[8]?'已完成':'未完成');
      task.caseGroupKey=group.key;task.sourceCaseIds=group.sources.map(t=>t.showcaseCaseId);
      const sourceOrder=[primary,...group.sources.filter(t=>t!==primary)];
      for(const source of sourceOrder){aliases.tasks[source.id]=task.id;aliases.cases[source.showcaseCaseId]=[];
        source.papers.forEach((paper,sourceIndex)=>{
          const history=personal.attempts[paper.id]||[],draft=personal.drafts[paper.id],key=paperCaseKey(source,paper,history,draft,at);let target=paperKeys.get(key);
          if(!target){target=copy(paper);target.title='试题'+String(index+1).padStart(2,'0')+'-'+String(task.papers.length+1).padStart(2,'0');target.caseFingerprint=key;task.papers.push(target);paperKeys.set(key,target);
            if(history.length)attempts[target.id]=history.map(a=>({...copy(a),taskId:task.id,paperId:target.id}));
            if(draft)drafts[target.id]={...copy(draft),taskId:task.id,paperId:target.id};
          }
          aliases.papers[paper.id]=target.id;const entry={caseId:source.showcaseCaseId,oldTaskId:source.id,oldPaperId:paper.id,oldIndex:sourceIndex+1,taskId:task.id,paperId:target.id,taskCode:code};aliases.cases[source.showcaseCaseId].push(entry);aliases.sourceRows.push(entry);
        });
      }
      // A group with a single unique paper gets an explicit draft counterpart.
      if(task.papers.length===1){const first=task.papers[0],second=copy(first);second.id=task.id+'-paired-draft';second.title='试题'+String(index+1).padStart(2,'0')+'-02';task.papers.push(second);if(attempts[first.id])attempts[second.id]=attempts[first.id].map((a,i)=>({...copy(a),id:'paired-'+second.id+'-'+i,sessionId:'paired-'+second.id+'-'+i,paperId:second.id}));if(!drafts[first.id])drafts[second.id]={taskId:task.id,paperId:second.id,sessionId:'paired-'+second.id,answers:{1:'A'},questions:copy(second.questions),optionOrders:{},position:0,section:'first',startedAt:at-60000};second.caseFingerprint=paperCaseKey(task,second,attempts[second.id],drafts[second.id],at);}
      tasks.push(task);catalog.push({id:task.showcaseCaseId,code,title:task.title,group:task.catalogGroup,paperCount:task.papers.length,sourceCaseIds:task.sourceCaseIds,groupKey:group.key,taskId:task.id,stage:timeState(task,at),firstPaperId:task.papers[0].id,paperIds:task.papers.map(p=>p.id)});
    });
    personal.tasks=tasks;personal.attempts=attempts;personal.drafts=drafts;personal.caseAliases=aliases;personal.catalogGroups=catalog;canonicalCatalogCache=copy(catalog);return personal;
  }
  function canonicalTaskId(id){return state?.caseId==='personal'?(state.caseAliases?.tasks[id]||id):id;}
  function canonicalPaperId(id){return state?.caseId==='personal'?(state.caseAliases?.papers[id]||id):id;}
  function resolveCatalogCase(id){return copy(state?.caseAliases?.cases[id]||[]);}
  function getCanonicalCatalog(){
    if(!canonicalCatalogCache.length)makePersonalState();
    return canonicalCatalogCache.map(g=>{const t=state.caseId==='personal'?getTask(g.taskId):null;return {...copy(g),title:t?getTaskLabel(t.id):g.title,paperCount:t?t.papers.length:g.paperCount};});
  }
  function makePersonalState() {
    const personal = baseState('personal');
    personal.tasks=[];personal.attempts={};personal.drafts={};
    catalogRows.forEach(row => {
      const sample = makeShowcaseTask(row.id);
      personal.tasks.push(sample.task);
      Object.assign(personal.attempts,sample.attempts);
      Object.assign(personal.drafts,sample.drafts);
    });
    personal.showcaseVersion = 3;
    return regroupPersonal(personal);
  }
  const subscribers = new Set();
  let activeCaseId = 'personal';
  try { const query = new URLSearchParams(global.location && global.location.search || ''); const requested = query.get('case'); if (definitions.some(c => c.id === requested)) activeCaseId = requested; } catch (_) {}
  const keyFor = id => STORAGE_KEY + ':' + id;
  function validState(value) { return !!(value && value.version === VERSION && value.schemaVersion === SCHEMA && Array.isArray(value.tasks) && value.attempts && value.drafts); }
  function load(id) {
    try { const stored = JSON.parse(storage.read(keyFor(id)) || 'null'); if (validState(stored)) return stored; } catch (_) {}
    const fresh = id === 'personal' ? makePersonalState() : makeCase(id);
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
    refreshPublication();
    policySignature=policyStateSignature();
    state.updatedAt = Date.now();
    state.revision = (state.revision || 0) + 1;
    storage.write(keyFor(activeCaseId),JSON.stringify(state));
    try { if (channel) channel.postMessage({key:keyFor(activeCaseId),revision:state.revision}); } catch (_) {}
    emit(reason || 'change');
  }
  function refreshFromStorage(reason) {
    try {
      const fresh = JSON.parse(storage.read(keyFor(activeCaseId)) || 'null');
      if (validState(fresh) && (fresh.revision !== state.revision || fresh.updatedAt !== state.updatedAt)) { state = fresh; policySignature=policyStateSignature();emit(reason || 'external'); }
    } catch (_) {}
  }
  if (global.addEventListener) global.addEventListener('storage',event => { if (event.key === keyFor(activeCaseId)) refreshFromStorage('storage'); });
  if (channel) channel.onmessage = event => { if (event.data && event.data.key === keyFor(activeCaseId)) refreshFromStorage('broadcast'); };
  function now() { const clock = state.clock || {}; return clock.running === false ? toMs(clock.now,Date.now()) : Date.now() + finite(clock.offsetMs,0); }
  function effectivePublication(task,at=now()){
    if(task.publishPolicy==='afterDeadline')return at>=task.endAt;
    return !!task.published;
  }
  function refreshPublication(){if(!state)return;for(const task of state.tasks)task.published=effectivePublication(task);}
  function dailyCount(task){return Math.max(1,Math.ceil(task.papers.length/Math.max(1,Number(task.planDays)||1)));}
  function getPaperUnlockAt(taskId,paperId){
    const task=getTask(taskId);if(!task)return Infinity;const index=task.papers.findIndex(p=>p.id===paperId);if(index<0)return Infinity;
    if(task.unlockMode!=='daily')return task.startAt;
    const day=Math.floor((task.startAt+8*3600000)/DAY)*DAY-8*3600000;
    return Math.max(task.startAt,day+Math.floor(index/dailyCount(task))*DAY);
  }
  function publishTask(id){const task=getTask(id);if(!task)return null;task.publishPolicy='manual';task.published=true;persist('publish-answers');return task;}
  let policySignature='';
  function policyStateSignature(){
    const at=now();return JSON.stringify(state.tasks.map(t=>[t.id,t.published,at>=t.visibleAt,at>=t.startAt,at>t.endAt,t.papers.map(p=>[at>=Math.max(t.visibleAt,toMs(p.visibleAt,t.visibleAt)),at>=Math.max(t.startAt,toMs(p.startAt,t.startAt)),at>=getPaperUnlockAt(t.id,p.id)])]));
  }
  function tickPolicies(){
    refreshPublication();const signature=policyStateSignature();
    if(signature!==policySignature){const previous=policySignature;policySignature=signature;if(previous)persist('policy-clock');}
  }
  function getTask(id) { id=canonicalTaskId(id);const task=state.tasks.find(task => task.id === id)||null;if(task){task.published=effectivePublication(task);task.passRate=passRateOf(task);task.randomOptions=true;}return task; }
  function getPaper(taskId,paperId) { taskId=canonicalTaskId(taskId);paperId=canonicalPaperId(paperId);const task = getTask(taskId); return task ? task.papers.find(paper => paper.id === paperId) || null : null; }
  function getShowcaseScenarios() {
    if(state.caseId==='personal')return getCanonicalCatalog().map(g=>({caseId:g.id,title:getTaskLabel(g.taskId),category:g.group,description:'同一任务设定和任务状态归为一组；组内各套为不同作答条件。',expected:'见本版案例清单',taskId:g.taskId,paperId:getTask(g.taskId).papers[0].id,paperCount:g.paperCount,entry:'detail',action:'',preset:{},visible:now()>=getTask(g.taskId).visibleAt}));
    return definitions.map(def => {
      const task = getTask(showcaseTaskId(def.id));
      const paper = task && task.papers[0];
      if (!task || !paper || task.showcaseCaseId !== def.id) return null;
      const item = cases.find(value => value.id === def.id);
      const personalSettingsCase = def.id === 'c29_settings_memory';
      return {
        caseId: def.id,
        title: def.title,
        category: def.category,
        description: personalSettingsCase ? '使用当前个人学习设置，可修改后退出再进入验证记忆。' : def.description,
        expected: personalSettingsCase ? '学习设置记住自己的选择；此共存任务不覆盖其他任务的个人设置，段落指令仍播放。' : def.expected,
        taskId: task.id,
        paperId: paper.id,
        paperTitle: paper.title,
        paperCount: task.papers.length,
        entry: def.entry || 'detail',
        action: personalSettingsCase ? 'settings' : def.action || '',
        preset: copy(item && item.preset || {}),
        visible: now() >= task.visibleAt
      };
    }).filter(Boolean);
  }
  function prepareShowcaseScenario(taskId, paperId) {taskId=canonicalTaskId(taskId);paperId=canonicalPaperId(paperId);
    const task = getTask(taskId);
    const draft = state.drafts[paperId];
    if (!task || !task.showcaseCaseId || !getPaper(taskId, paperId) || !draft || draft.taskId !== taskId) return null;
    if (!draft.showcasePending) return copy(draft);
    const preparation = draft.showcasePreparation || {};
    const at = now();
    draft.startedAt = at - finite(preparation.startedMinutes, 5) * MINUTE;
    draft.createdAt = at;
    draft.updatedAt = at;
    draft.showcasePreparedAt = at;
    draft.showcasePending = false;
    if (task.mode === 'exam' && Number(preparation.checkSeconds) > 0) {
      draft.checkDeadline = at + Number(preparation.checkSeconds) * 1000;
      draft.checkStartedAt = draft.checkDeadline - 120000;
    }
    persist('showcase-prepare');
    return copy(draft);
  }
  function resetShowcaseScenario(caseId) {
    if(state.caseId==='personal'){
      const alias=resolveCatalogCase(caseId)[0],id=alias?.taskId||getCanonicalCatalog().find(g=>g.id===caseId)?.taskId;if(!id)return null;
      const current=getTask(id),fresh=makePersonalState(),next=fresh.tasks.find(t=>t.id===id);if(!current||!next)return null;
      for(const p of current.papers){delete state.attempts[p.id];delete state.drafts[p.id];}
      state.tasks[state.tasks.findIndex(t=>t.id===id)]=next;for(const p of next.papers){if(fresh.attempts[p.id])state.attempts[p.id]=fresh.attempts[p.id];if(fresh.drafts[p.id])state.drafts[p.id]=fresh.drafts[p.id];}
      persist('showcase-reset');return getShowcaseScenarios().find(g=>g.taskId===id);
    }
    const current = getTask(showcaseTaskId(caseId));
    if (!current || current.showcaseCaseId !== caseId) return null;
    const sample = makeShowcaseTask(caseId);
    if (!sample) return null;
    const index = state.tasks.findIndex(task => task.id === current.id);
    current.papers.forEach(paper => {
      delete state.attempts[paper.id];
      delete state.drafts[paper.id];
    });
    Object.keys(state.learningDrafts || {}).forEach(key => {
      const value = state.learningDrafts[key];
      if (value && (value.report && value.report.taskId === current.id || value.training && value.training.source && value.training.source.taskId === current.id)) delete state.learningDrafts[key];
    });
    state.tasks[index] = sample.task;
    Object.assign(state.attempts, sample.attempts);
    Object.assign(state.drafts, sample.drafts);
    persist('showcase-reset');
    return getShowcaseScenarios().find(item => item.caseId === caseId) || null;
  }
  function paperStatus(taskId,paperId) {
    taskId=canonicalTaskId(taskId);paperId=canonicalPaperId(paperId);
    const task = getTask(taskId); const paper = getPaper(taskId,paperId);
    if (!task || !paper) return {everPassed:false,latest:null,attempts:[],canStart:false,canReview:false,visible:false,started:false,expired:false};
    const attempts = (state.attempts[paperId] || []).slice().sort((a,b) => a.submittedAt-b.submittedAt || finite(a.ordinal,0)-finite(b.ordinal,0));
    const latest = attempts[attempts.length-1] || null;
    const everPassed = attempts.some(attempt => attempt.passed === true);
    const at = now(); const visible = at >= Math.max(task.visibleAt,toMs(paper.visibleAt,task.visibleAt)); const started = at >= Math.max(task.startAt,toMs(paper.startAt,task.startAt)); const expired = at > task.endAt;
    const hasDraft=Boolean(getDraft(taskId,paperId)),canResume=visible&&started&&hasDraft;
    const unlockAt=getPaperUnlockAt(taskId,paperId),unlocked=at>=unlockAt;
    return {hasDraft,canResume,unlockAt,unlocked,everPassed,latest,attempts,canStart:visible && started && unlocked && (!expired || (!everPassed && !!task.allowLate)),canReview:!!task.published && everPassed,visible,started,expired,hasAttempt:!!latest,attemptCount:attempts.length,published:!!task.published};
  }
  function getTaskStats(taskId) {
    const task = getTask(taskId);
    if (!task) return {completed:0,total:0,accuracy:null,correct:0,questions:0};
    let completed = 0, correct = 0, questions = 0, accuracySum=0;
    task.papers.forEach(paper => { const status = paperStatus(taskId,paper.id); if (status.everPassed) { completed++; if (status.latest) { correct += status.latest.correctCount; questions += status.latest.totalCount; accuracySum+=Number(status.latest.accuracy); } } });
    return {completed,total:task.papers.length,accuracy:completed ? round(accuracySum/completed) : null,correct,questions};
  }
  function taskStatus(taskId) {
    const task = getTask(taskId); if (!task) return 'history';
    const stats = getTaskStats(taskId); const complete = stats.total > 0 && stats.completed === stats.total;
    if (now() > task.endAt) return complete || !task.allowLate ? 'history' : 'makeup';
    return complete ? 'completed' : 'pending';
  }
  function updateTask(id,patch) {id=canonicalTaskId(id);
    const task = getTask(id); if (!task || !patch || typeof patch !== 'object') return null;
    const previousTitle=task.title;
    const allowed = ['title','mode','startAt','endAt','visibleAt','allowLate','published','passRate','randomOptions','planDays','unlockMode','publishPolicy'];
    allowed.forEach(key => {
      if (patch[key] === undefined) return;
      if (['startAt','endAt','visibleAt'].includes(key)) task[key] = toMs(patch[key],task[key]);
      else if (['allowLate','published','randomOptions'].includes(key)) task[key] = !!patch[key];
      else if (key === 'planDays') task[key]=Math.max(1,Math.min(365,Math.round(finite(patch[key],2))));
      else if (key === 'unlockMode') task[key]=patch[key]==='daily'?'daily':'all';
      else if (key === 'publishPolicy') task[key]=['manual','afterDeadline'].includes(patch[key])?patch[key]:'manual';
      else if (key === 'passRate') task[key] = passRateOf({passRate:patch[key]});
      else if (key === 'mode') task[key] = patch[key] === 'exam' ? 'exam' : 'practice';
      else task[key] = String(patch[key]);
    });
    if(patch.title===undefined||patch.title===previousTitle)task.title=taskStateName(task,task.title,now());
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
  function getDraft(taskId,paperId) {taskId=canonicalTaskId(taskId);paperId=canonicalPaperId(paperId); const draft = state.drafts[paperId]; return draft && (!draft.taskId || draft.taskId === taskId) ? copy(draft) : null; }
  function saveDraft(taskId,paperId,draft) {taskId=canonicalTaskId(taskId);paperId=canonicalPaperId(paperId);
    if (!getPaper(taskId,paperId) || !draft || typeof draft !== 'object') return null;
    state.drafts[paperId] = Object.assign({},copy(draft),{taskId,paperId,updatedAt:now()}); persist('draft'); return copy(state.drafts[paperId]);
  }
  function discardDraft(taskId,paperId) {taskId=canonicalTaskId(taskId);paperId=canonicalPaperId(paperId); if (!getPaper(taskId,paperId)) return false; delete state.drafts[paperId]; persist('draft-discard'); return true; }
  function getLearningDraft(key) { return copy((state.learningDrafts || {})[key] || null); }
  function saveLearningDraft(key, draft) {
    const bookId=draft?.session?.bookOptions?.bookId||draft?.report?.bookId||draft?.training?.source?.bookId;
    if(isBookExpired(bookId)||getBooks('purchased').some(b=>key?.startsWith('book:'+b.id+':')))return null;
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
    const at = now(); // The submitting device clock is authoritative, never payload.submittedAt.
    const status = paperStatus(task.id,paper.id);
    if (!status.visible || !status.started) return {status:'blocked',reason:'not_started',message:'尚未到老师规定的作答时间'};
    const late = at > task.endAt;
    if (late && (status.everPassed || !task.allowLate)) return {status:'blocked',prompt:'P01',message:PROMPTS.P01.message};
    if (late && !data.confirmLate) return {status:'late_confirmation',prompt:'P02',message:PROMPTS.P02.message};
    if(!status.hasDraft && at<getPaperUnlockAt(task.id,paper.id))return {status:'locked',message:'该套题尚未解锁，无法提交'};
    const questions = questionsOf(paper,data.questions);
    const score = resultFromAnswers(data.answers,questions);
    const missing = questions.filter(q => !score.answers[q]);
    if (!data.auto && missing.length) return {status:'missing',missing,message:'以下题目尚未作答：' + missing.join('、')};
    const startedAt = toMs(data.startedAt,at);
    const elapsedSeconds = Math.max(0,Math.round((at-startedAt)/1000));
    const id = data.sessionId || 'session-' + at.toString(36) + '-' + Math.random().toString(36).slice(2,8);
    const attempts = state.attempts[paper.id] || (state.attempts[paper.id] = []);
    const attempt = Object.assign({id:'attempt-'+id,sessionId:id,taskId:task.id,paperId:paper.id,questions,questionOrder:Array.isArray(data.questionOrder) ? data.questionOrder.slice() : questions.slice(),startedAt,submittedAt:at,elapsedSeconds,durationSeconds:elapsedSeconds,passed:score.accuracy >= passRateOf(task),passRate:passRateOf(task),auto:!!data.auto,late,publishedAtSubmit:!!task.published,ordinal:attempts.length+1},score,{correct:score.correctCount,total:score.totalCount});
    if (data.optionOrders) attempt.optionOrders = copy(data.optionOrders);
    attempts.push(attempt);
    delete state.drafts[paper.id];
    refreshPublication();attempt.publishedAtSubmit=!!task.published;
    persist('submit'); return {status:'success',attempt:copy(attempt)};
  }
  function selectCase(id) {
    const target = id || 'personal';
    if (target !== 'personal' && !definitions.some(item => item.id === target)) return null;
    activeCaseId = target; state = load(target); policySignature=policyStateSignature();emit('case-select'); return state;
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
  // One result policy for formal submissions and local practice rounds.
  // Publishing accuracy does not depend on pass history.
  function resultPolicy(taskId,paperId,attempt,{learningRound=false}={}) {
    const task=getTask(taskId),status=task?paperStatus(taskId,paperId):null;
    const published=task?Boolean(task.published):true;
    const everPassed=task?Boolean(status.everPassed):Boolean(attempt);
    const hasAttempt=Boolean(attempt);
    const canReview=hasAttempt&&published&&everPassed;
    return {published,everPassed,hasAttempt,showAccuracy:hasAttempt&&published,
      showScore:hasAttempt&&published,showCounts:hasAttempt&&published,canReview,
      canRetake:learningRound||Boolean(status?.canStart),passRate:task?.passRate??0};
  }
  const NAME_CODEBOOK=Object.freeze([
    {scope:'任务',dimension:'模式',code:'练',meaning:'练习模式'},{scope:'任务',dimension:'模式',code:'考',meaning:'考试模式'},
    {scope:'任务',dimension:'公布',code:'公',meaning:'答案已公布'},{scope:'任务',dimension:'公布',code:'隐',meaning:'答案未公布'},
    {scope:'任务',dimension:'时间',code:'前',meaning:'已开始、未过截止'},{scope:'任务',dimension:'时间',code:'后',meaning:'已超过截止'},
    {scope:'任务',dimension:'时间',code:'候',meaning:'已可见、尚未开始'},{scope:'任务',dimension:'时间',code:'藏',meaning:'尚未可见，学生列表不出现'},
    {scope:'任务',dimension:'补交',code:'补',meaning:'任务允许补交，个人实际资格另看此前是否达标'},
    {scope:'任务',dimension:'补交',code:'禁',meaning:'任务不允许补交'},
    {scope:'试题',dimension:'达标历史',code:'达',meaning:'此前曾经达标'},{scope:'试题',dimension:'达标历史',code:'未',meaning:'此前从未达标'},
    {scope:'试题',dimension:'成功次数',code:'零',meaning:'0次成功提交'},{scope:'试题',dimension:'成功次数',code:'首',meaning:'仅1次成功提交'},
    {scope:'试题',dimension:'成功次数',code:'多',meaning:'多次成功提交，实际次数见正答率标签或记录'},
    {scope:'试题',dimension:'作答记录',code:'记',meaning:'有成功作答记录'},{scope:'试题',dimension:'作答记录',code:'空',meaning:'无成功作答记录'},
    {scope:'试题',dimension:'存稿',code:'稿',meaning:'有可恢复存稿'},{scope:'试题',dimension:'存稿',code:'无',meaning:'无存稿'},
    {scope:'试题',dimension:'解锁',code:'锁',meaning:'尚未解锁；无此后缀表示已解锁'}
  ]);
  function taskShortName(task,code,at=now()){
    const time=at<task.visibleAt?'藏':at<task.startAt?'候':at>task.endAt?'后':'前';
    return code+'·'+(task.mode==='exam'?'考':'练')+(task.published?'公':'隐')+time+(task.allowLate?'补':'禁');
  }
  function taskStableCode(task){
    if(task.catalogCode)return task.catalogCode;
    if(state.caseId!=='personal'&&state.tasks[0]?.id===task.id){
      const index=definitions.findIndex(def=>def.id===state.caseId);if(index>=0)return 'S'+String(index+1).padStart(2,'0');
    }
    return 'T'+String(state.tasks.findIndex(t=>t.id===task.id)+1).padStart(2,'0');
  }
  function getTaskLabel(id){return getTaskFullLabel(id);}
  function getTaskFullLabel(id){const task=getTask(id);return task?taskStateName(task,task.title,now()):'';}
  function getPaperFullLabel(taskId,paperId){const p=getPaper(taskId,paperId);return p?paperStateName(p.title,paperStatus(taskId,paperId).attempts,getDraft(taskId,paperId))+(paperStatus(taskId,paperId).unlocked?'':'｜未解锁'):'';}
  function getPaperLabel(taskId,paperId){return getPaperFullLabel(taskId,paperId);}
  function isBookExpired(id){return Boolean((state.books||BOOKS).find(b=>b.id===id)?.expired);}
  function getExpiredBookRecords(id){return copy(state.expiredBookRecords?.[id]||[]);}
  function getBooks(category){return (state.books||BOOKS).filter(b=>!category||b.category===category).map(copy);}
  function selectBook(id){const book=getBooks().find(b=>b.id===id);if(!book)return null;state.activeBookId=id;persist('book-select');return copy(book);}
  const processGroups=new Map();
  for(const c of cases.filter(c=>c.entry==='exercise'||['c27_same_material_wrong','c28_similar_round'].includes(c.id))){
    const sample=makeCase(c.id),task=sample.tasks[0],p=task.papers[0],draft=sample.drafts[p.id];
    const key=JSON.stringify([taskGroupKey(task,sample.createdAt,sample.attempts),sample.settings,c.entry,c.action,paperCaseKey(task,p,sample.attempts[p.id],draft,sample.createdAt)]);
    if(!processGroups.has(key))processGroups.set(key,{...c,processFingerprint:key,sourceCaseIds:[]});processGroups.get(key).sourceCaseIds.push(c.id);
  }
  const visibleProcessCases=[...processGroups.values()].map((c,i)=>({...c,displayCode:'P'+String(i+1).padStart(2,'0'),title:'P'+String(i+1).padStart(2,'0')+' '+c.title.replace(/^C\d+\s*/,'')}));

  const api = {getCase:id=>cases.find(c=>c.id===id),resolveCatalogCase,isBookExpired,getExpiredBookRecords,NAME_CODEBOOK,getTaskFullLabel,getPaperFullLabel,taskStableCode,PROMPTS,passRateOf,resultPolicy,VERSION,STORAGE_KEY,SCHEMA_VERSION:SCHEMA,CORRECT_ANSWERS:Object.freeze(copy(CORRECT)),cases:visibleProcessCases,dailyCount,getPaperUnlockAt,publishTask,tickPolicies,getTaskLabel,getPaperLabel,getBooks,selectBook,getCatalog:getCanonicalCatalog,getState:() => {refreshPublication();return state;},getTask,getPaper,now,taskStatus,paperStatus,getTaskStats,getShowcaseScenarios,prepareShowcaseScenario,resetShowcaseScenario,submit,saveDraft,getDraft,discardDraft,getLearningDraft,saveLearningDraft,discardLearningDraft,updateTask,updateSettings,setClock,selectCase,resetCase,subscribe(fn) { if (typeof fn !== 'function') return () => {}; subscribers.add(fn); return () => subscribers.delete(fn); },answersFor,refresh:() => { refreshFromStorage('refresh'); return state; },getStorageKey:() => keyFor(activeCaseId),isPersistent:() => storageAvailable};
  global.StudentDemo = api;
  tickPolicies();if(typeof global.setInterval==='function')global.setInterval(tickPolicies,500);
})(typeof window !== 'undefined' ? window : globalThis);
