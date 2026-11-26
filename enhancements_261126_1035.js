/* Student APP v3, 2026-11-26. Existing layouts are retained; state rules live in StudentDemo. */
(() => {
  'use strict';
  const D = window.StudentDemo;
  if (!D) { console.error('StudentDemo state module is required'); return; }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = v => JSON.parse(JSON.stringify(v));
  const fmt = t => new Date(Number(t)).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).replaceAll('/', '-');
  const dateShort = t => fmt(t).slice(0,16);
  const orig = {
    showView, startExerciseSession, renderExerciseResult, renderPracticeDetail,
    getTimelineTime, seekExerciseTimeline, syncExerciseAudioControl,
    updateAnswerCardState, updateVisibleQuestionScope, showQuestionSection,
    openAnalysisAtQuestion, renderAnalysisQuestion, getAnalysisQuestionData,
    shouldSkipTimelineItem, updateBottomExerciseAction, playExerciseTimeline,
    syncStudyModeUi, jumpToQuestionAudio, selectExerciseOption, tryAutoPlayExerciseAudio
  };
  let context = null, report = null, session = null, training = null;
  let activeLearningKey = null;
  let busy = false, starting = false, storeWriting = false, lastSavedAt = 0;
  let currentView = $('.view.active')?.dataset.view || 'home';
  let resultFromHistory = false, historyReturn = null;
  const canonical = {};
  for (let q = 1; q <= 20; q++) {
    const unit = getQuestionUnitByNumber(q);
    const titleNode = $$('.exercise-question-title > span', unit || document).find(n => !n.classList.contains('exercise-question-index') && !n.classList.contains('similar-question-cn-inline'));
    canonical[q] = {title:titleNode?.textContent.trim() || `第${q}题`, options:[]};
    $$('.exercise-option', unit || document).forEach((node, i) => {
      const choice = $('strong', node)?.textContent.trim() || 'ABC'[i];
      node.dataset.canonicalChoice = choice;
      canonical[q].options.push({choice, text:getExerciseOptionText(node), node});
    });
  }
  const resultHeader = $('.result-nav');
  const historyButton = document.createElement('button');
  historyButton.type = 'button'; historyButton.className = 'demo-result-history'; historyButton.textContent = '作答记录';
  resultHeader?.lastElementChild?.replaceWith(historyButton);
  const retake = document.createElement('button');
  retake.type='button'; retake.className='result-action demo-retake'; retake.textContent='重新作答';
  $('.result-actions')?.insertBefore(retake, resultAnalysisButton);
  $('.result-actions')?.classList.add('demo-result-actions');
  const historyView = document.createElement('main');
  historyView.className='screen view demo-history-screen'; historyView.dataset.view='answer-history';
  historyView.innerHTML='<section class="assignment-top"><div class="status"><span>9:41</span><span>Wi-Fi ▰</span></div><div class="assignment-nav"><button type="button" class="demo-history-back" aria-label="返回成绩单">‹</button><h1 class="assignment-title">作答记录</h1><span></span></div></section><div class="demo-history-list"></div>';
  $('.app')?.insertBefore(historyView, $('.nav'));
  const modalLayer = document.createElement('div'); modalLayer.className='demo-modal-layer'; modalLayer.hidden=true;
  $('.app')?.appendChild(modalLayer);

  function modal(title, text, actions) {
    closeAnswerDrawer(); closeStudySettingsDrawer();
    modalLayer.hidden=false;
    modalLayer.innerHTML=`<section class="demo-modal" role="alertdialog" aria-modal="true" aria-label="${esc(title)}"><h2 class="demo-modal-title">${esc(title)}</h2><div class="demo-modal-text">${esc(text).replaceAll('\n','<br>')}</div><div class="demo-modal-actions">${actions.map((a,i)=>`<button type="button" class="demo-btn ${esc(a.kind || 'secondary')}" data-modal-action="${i}">${esc(a.label)}</button>`).join('')}</div></section>`;
    $$('[data-modal-action]',modalLayer).forEach(b=>b.onclick=()=>{ const action=actions[Number(b.dataset.modalAction)]; modalLayer.hidden=true;modalLayer.innerHTML='';action.run?.(); });
    $('[data-modal-action]',modalLayer)?.focus();
  }
  function notify(text) { modal('提示',text,[{label:'我知道了',kind:'primary'}]); }
  function task() { return context ? D.getTask(context.taskId) : null; }
  function paper() { return context ? D.getPaper(context.taskId,context.paperId) : null; }
  function status() { return context ? D.paperStatus(context.taskId,context.paperId) : null; }
  function reportReviewAllowed() { return report?.taskId&&D.getTask(report.taskId)?D.paperStatus(report.taskId,report.paperId).canReview:true; }
  function isChild() { return Boolean(training); }
  function isManagedExam() { return Boolean(session && !training && task()?.mode==='exam'); }
  function currentAnswers() { return Object.fromEntries(activeQuestionSet.filter(q=>getSelectedChoice(q)).map(q=>[q,getSelectedChoice(q)])); }
  function sid() { return `answer-${Date.now()}-${Math.random().toString(36).slice(2,9)}`; }
  function syncRoute(entry, taskId=context?.taskId, paperId=context?.paperId, extra={}) {
    try {
      const url=new URL(location.href);
      ['entry','task','paper','attempt','historical','resume'].forEach(key=>url.searchParams.delete(key));
      url.searchParams.set('entry',entry);
      if(taskId)url.searchParams.set('task',taskId);
      if(paperId)url.searchParams.set('paper',paperId);
      Object.entries(extra).forEach(([key,value])=>{if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));});
      history.replaceState(null,'',url.href);
    } catch (_) {}
  }
  function restoreSessionPosition() {
    if(!session)return;
    pauseExerciseTimeline();
    const savedSection=(session.section||'').replace(/^second-(\d+)$/,'material-$1');
    showQuestionSection(savedSection||getQuestionPageForQuestion(activeQuestionSet[0]||1));
    orig.seekExerciseTimeline(Number(session.position||0),false,{suppressScroll:true});
  }
  function setOptions(orders = {}) {
    Object.entries(canonical).forEach(([q,data])=>{
      const unit=getQuestionUnitByNumber(Number(q)); if(!unit)return;
      const options=data.options; const parent=options[0]?.node.parentNode; if(!parent)return;
      const order=orders[q] || options.map(o=>o.choice);
      order.forEach((choice,index)=>{ const o=options.find(x=>x.choice===choice);if(!o)return;parent.appendChild(o.node);const strong=$('strong',o.node);if(strong)strong.textContent='ABC'[index]; });
    });
  }
  function freshOrders(random) {
    const orders={};
    for (const q of activeQuestionSet) {
      const arr=['A','B','C']; if(random)for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
      orders[q]=arr;
    }
    return orders;
  }
  getSelectedChoice = function(q) { return getQuestionUnitByNumber(q)?.querySelector('.exercise-option.selected')?.dataset.canonicalChoice || ''; };
  restoreExerciseSelections = function(answers={}) {
    $$('.exercise-option').forEach(o=>o.classList.remove('selected','feedback-correct','feedback-wrong'));
    $$('.similar-question-answered,.similar-analysis-panel.open').forEach(n=>n.classList.remove('similar-question-answered','open'));
    Object.entries(answers).forEach(([q,c])=>{const n=$$('.exercise-option',getQuestionUnitByNumber(Number(q))||document).find(o=>o.dataset.canonicalChoice===c);n?.classList.add('selected');});
    updateAnswerCardState();
  };
  selectQuestionChoice = function(q,c) { const n=$$('.exercise-option',getQuestionUnitByNumber(q)||document).find(o=>o.dataset.canonicalChoice===c);if(n)selectExerciseOption(n); };
  selectExerciseOption = function(option) {
    if(session?.ended || !modalLayer.hidden)return;
    const unit=option.closest('.exercise-question-item')||option.closest('.exercise-question-card');if(!unit)return;
    $$('.exercise-option',unit).forEach(o=>o.classList.remove('selected','feedback-correct','feedback-wrong'));
    option.classList.add('selected');unit.classList.remove('needs-answer');
    const card=unit.closest('.exercise-question-card');card?.classList.remove('needs-answer');
    updateAnswerCardState();saveCurrent(true);
  };
  getAnalysisQuestionData = function(q) { const data=canonical[q];return {question:q,title:data?.title||`第${q}题`,options:(data?.options||[]).map(o=>({choice:o.choice,text:o.text})),selected:getSelectedChoice(q),correct:exerciseCorrectAnswers[q]}; };

  function applySettings() {
    const settings=D.getState().settings || {};
    studyMode = task()?.mode || (training ? 'practice' : 'practice');
    if(training)studyMode='practice';
    shortDialoguePlayCount = isManagedExam()?2:Number(settings.shortDialoguePlayCount||2);
    skipChineseInstructions = Boolean(settings.skipMainInstruction);
    skipReadingTime = Boolean(settings.skipReadingTime);
    if(studySkipInstructionToggle)studySkipInstructionToggle.checked=skipChineseInstructions;
    if(studySkipReadingToggle)studySkipReadingToggle.checked=skipReadingTime;
    if(exerciseSpeedSelect)exerciseSpeedSelect.value=String(isManagedExam()?1:(settings.speed||1));
    if(exerciseAudio)exerciseAudio.playbackRate=Number(exerciseSpeedSelect?.value||1);
    studySpeedRadios.forEach(r=>r.checked=Number(r.value)===Number(exerciseSpeedSelect?.value||1));
    shortDialoguePlayCountRadios.forEach(r=>r.checked=Number(r.value)===shortDialoguePlayCount);
    studyModeRadios.forEach(r=>{r.checked=r.value===studyMode;r.disabled=true;});
    const modeGroup=studyModeRadios[0]?.closest('.study-settings-group');if(modeGroup)modeGroup.hidden=true;
    const repeatGroup=shortDialoguePlayCountRadios[0]?.closest('.study-settings-group');if(repeatGroup)repeatGroup.hidden=isManagedExam();
    const instructionText=$('.study-skip-instruction-toggle')?.closest('label')?.querySelector('.study-settings-switch-text');
    if(instructionText)instructionText.innerHTML='<span>跳过主指令</span><span class="study-settings-note">仅跳过第一节、第二节主指令，段落指令正常播放</span>';
    orig.syncStudyModeUi();
  }
  shouldSkipTimelineItem = function(item) {
    if(!item)return false;
    if(isManagedExam())return false;
    if(item.kind==='english'&&item.section==='first'&&Number(item.repeat)>shortDialoguePlayCount)return true;
    if(training&&item.questions?.length&&!item.questions.some(q=>activeQuestionSet.includes(q)))return true;
    if(training&&(item.kind==='check'||item.kind==='end'))return true;
    const main=item.kind==='instruction'&&!item.material;
    if(main&&(training||skipChineseInstructions))return true;
    return item.kind==='read'&&skipReadingTime;
  };
  syncStudyModeUi = function() { orig.syncStudyModeUi(); if(exerciseSpeedSelect)exerciseSpeedSelect.hidden=isManagedExam();if(exerciseBottomProgress&&isManagedExam())exerciseBottomProgress.disabled=true; };
  syncExerciseAudioControl = function() {
    orig.syncExerciseAudioControl();
    if(isManagedExam()) {
      exerciseAudioToggle?.classList.remove('playing');
      exerciseAudioToggle?.setAttribute('aria-label',exerciseTimelinePlaying?'正在播放，考试中不可暂停':'继续播放');
      exerciseAudioToggle?.setAttribute('aria-disabled',String(exerciseTimelinePlaying||Boolean(session?.checkDeadline)||Boolean(session?.ended)));
      if(exerciseBottomProgress)exerciseBottomProgress.disabled=true;
    }
  };

  function selectTab(name) { selectAssignmentTab(name); renderTasks(); showView('assignments'); }
  function cardHTML(t) {
    const stats=D.getTaskStats(t.id); const st=D.taskStatus(t.id);
    const labels={pending:'待完成',makeup:'待补交',completed:'已完成',history:'历史练习'};
    return `<button class="books-card book-item practice-task-card" type="button" data-demo-task="${esc(t.id)}"><span class="book-cover-frame"><img class="book-cover" src="assets/books/listening-advanced-g1b.jpg" alt="听力进阶书封"></span><span class="book-info"><span class="book-name">${esc(t.title)}</span><span class="book-detail practice-date-lines"><span>开始日期：${esc(dateShort(t.startAt))}</span><span>截止日期：${esc(dateShort(t.endAt))}</span></span><span class="book-progress"><span class="book-progress-track"><span class="book-progress-fill" style="width:${stats.total?stats.completed/stats.total*100:0}%"></span></span><span class="book-progress-meta">完成${stats.completed}/${stats.total}</span></span></span><span class="book-action">${labels[st]||'查看'}</span></button>`;
  }
  function renderTasks() {
    const tasks=D.getState().tasks||[];
    const available=tasks.filter(t=>D.now()>=Number(t.visibleAt||0));
    const pending=available.filter(t=>D.taskStatus(t.id)==='pending');
    const makeup=available.filter(t=>D.taskStatus(t.id)==='makeup');
    const completed=available.filter(t=>D.taskStatus(t.id)==='completed');
    const history=available.filter(t=>D.taskStatus(t.id)==='history');
    const count=$('.practice-tile.cool .tile-count');if(count)count.textContent=String(pending.filter(t=>D.now()>=t.startAt&&D.now()<t.endAt).length);
    const late=$('.practice-tile.warm .tile-count');if(late)late.textContent=String(makeup.length);
    const p=$('[data-assignment-panel="pending"]');if(p)p.innerHTML=pending.map(cardHTML).join('')||'<div class="demo-list-empty">当前没有待完成任务</div>';
    const m=$('[data-assignment-panel="makeup"]');if(m)m.innerHTML=makeup.map(cardHTML).join('')||'<div class="demo-list-empty">当前没有待补交任务</div>';
    let tab=$('[data-assignment-tab="completed"]');
    if(!tab){tab=document.createElement('button');tab.className='assignment-tab';tab.type='button';tab.setAttribute('role','tab');tab.dataset.assignmentTab='completed';tab.textContent='已完成';$('.assignment-tabs')?.appendChild(tab);const pane=document.createElement('section');pane.className='assignment-list assignment-panel practice-task-list';pane.dataset.assignmentPanel='completed';pane.hidden=true;$('.assignment-screen')?.appendChild(pane);}
    const c=$('[data-assignment-panel="completed"]');if(c)c.innerHTML=completed.map(cardHTML).join('')||'<div class="demo-list-empty">当前没有已完成任务</div>';
    const h=$('.assignment-history-screen .assignment-list');if(h)h.innerHTML=history.map(cardHTML).join('')||'<div class="demo-list-empty">暂无历史练习</div>';
    $$('[data-assignment-tab]').forEach(b=>{const active=b.dataset.assignmentTab===(selectedTab);b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
    $$('[data-assignment-panel]').forEach(pane=>pane.hidden=pane.dataset.assignmentPanel!==(selectedTab));
  }
  function openTask(taskId) {
    const t=D.getTask(taskId);if(!t)return;
    if(D.now()<Number(t.visibleAt||0)){notify('试题详情尚未到老师设置的可见时间');return;}
    activePracticeTaskKey=taskId;
    if(practiceDetailTitle)practiceDetailTitle.textContent=t.title;
    if(practiceCardTitle)practiceCardTitle.textContent=t.title;
    if(practiceStartText)practiceStartText.textContent=`开始日期：${dateShort(t.startAt)}`;
    if(practiceEndText)practiceEndText.textContent=`截止日期：${dateShort(t.endAt)}`;
    const stats=D.getTaskStats(taskId);
    if(practiceProgressText)practiceProgressText.textContent=`完成${stats.completed}/${stats.total}`;
    if(practiceProgressFill)practiceProgressFill.style.width=`${stats.total?stats.completed/stats.total*100:0}%`;
    if(practiceAccuracyText){practiceAccuracyText.hidden=!stats.completed;practiceAccuracyText.textContent=t.published?`正答率${Math.round(stats.accuracy||0)}%`:'正答率--';}
    if(practicePaperList)practicePaperList.innerHTML=t.papers.map(p=>{
      const ps=D.paperStatus(taskId,p.id);const items=ps.attempts||[];const expired=D.now()>t.endAt;
      const openResult=ps.everPassed||(expired&&!t.allowLate);
      let label=openResult?'我的作答':(D.getDraft(taskId,p.id)?'继续作答':'去做题');
      if(D.now()<t.startAt)label='未开始';
      const latest=ps.latest;
      const tag=latest?`${items.length>1?`第${items.length}次作答：`:''}正答率${t.published&&ps.everPassed?`${Math.round(latest.accuracy)}%`:'--'}`:'';
      return `<div class="directory-child" data-demo-paper="${esc(p.id)}"><span class="directory-child-label"><span class="directory-child-name">${esc(p.title)}</span>${tag?`<span class="directory-accuracy">${esc(tag)}</span>`:''}</span><button type="button" class="directory-do ${openResult?'answer-review':''}" data-demo-paper-action="${openResult?'result':'start'}">${esc(label)}</button></div>`;
    }).join('');
    syncRoute('detail',taskId,context?.taskId===taskId?context.paperId:t.papers[0]?.id);
    showView('practice-detail');
  }
  renderPracticeDetail = openTask;
  openPracticeTask = openTask;
  function goToPaperList() { busy=false;session=null;training=null;activeLearningKey=null;modalLayer.hidden=true;pauseExerciseTimeline();if(context)openTask(context.taskId);else showView('book-learning'); }
  function openHistory() {
    historyReturn=report?{...report}:null;
    const list=$('.demo-history-list',historyView); const t=report?D.getTask(report.taskId):null;
    const attempts=report?.paperId?(D.paperStatus(report.taskId,report.paperId).attempts||[]):[];
    list.innerHTML=attempts.length?[...attempts].reverse().map((a,i)=>`<div class="demo-history-row"><div><strong>${esc(fmt(a.submittedAt))}</strong><p class="demo-history-meta">第${attempts.length-i}次作答 · ${a.passed?'本次达标':'本次未达标'}${a.late?' · 补交':''}</p></div><button class="directory-do answer-review" data-demo-attempt="${esc(a.id)}" type="button">我的作答</button></div>`).join(''):'<div class="demo-list-empty">暂无作答记录</div>';
    showView('answer-history');
  }
  function restoreAttempt(a) {
    activeQuestionSet=a?.questions?.length?[...a.questions]:(paper()?.questions||Array.from({length:20},(_,i)=>i+1));
    setOptions(a?.optionOrders||{});restoreExerciseSelections(a?.answers||{});updateVisibleQuestionScope();
  }
  function openReport(taskId,paperId,attemptId=null,fromHistory=false) {
    pauseExerciseTimeline();
    context={taskId,paperId};session=null;training=null;activeLearningKey=null;
    const st=D.paperStatus(taskId,paperId); const attempt=attemptId?st.attempts.find(a=>a.id===attemptId):st.latest;
    report={taskId,paperId,attempt:attempt||null};resultFromHistory=fromHistory;
    currentExerciseMode='assignment';activeResultTitle=D.getPaper(taskId,paperId)?.title||'我的作答';
    activeAssignmentPassRate=D.getTask(taskId)?.passRate??70;
    syncRoute('result',taskId,paperId,{attempt:attemptId,historical:fromHistory?'1':null});
    restoreAttempt(attempt);renderExerciseResult();showView('exercise-result');
  }
  renderExerciseResult = function() {
    if(!report){orig.renderExerciseResult();return;}
    const t=D.getTask(report.taskId); const st=D.paperStatus(report.taskId,report.paperId);
    const a=report.attempt; const child=Boolean(report.training);
    const published=t?Boolean(t.published):child;const passed=t?Boolean(st.everPassed):child;
    const visible=Boolean(a&&published&&passed); const counts=Boolean(a&&published);
    canReviewCurrentResult=visible;currentExerciseMode='assignment';
    const title=$('.result-title');if(title)title.textContent=resultFromHistory&&a?fmt(a.submittedAt):(child?'练习成绩单':'我的成绩单');
    resultScore.textContent=visible?String(a.score):'--';
    const scoreSuffix=$('.result-score > span');if(scoreSuffix)scoreSuffix.textContent=`/${a?.totalScore||30}分`;
    resultRank.innerHTML=!a?'正答率--<br>暂无作答记录':`${visible?`正答率${Math.round(a.accuracy)}%`:'正答率--'}<br>${passed?(child?'本轮练习已完成':`已达到老师设置的${t?.passRate||0}%达标线`):`未到达老师设置${t?.passRate||0}%达标线`}`;
    resultCorrect.innerHTML=counts?`${a.correctCount}<span class="metric-unit">题</span>`:'--';
    resultWrong.innerHTML=counts?`${a.wrongCount}<span class="metric-unit">题</span>`:'--';
    resultTime.innerHTML=a?formatResultTimeMarkup(a.elapsedSeconds||0):'--';
    resultAnswerNumbers.forEach(b=>{
      const q=Number(b.dataset.resultJump),choice=a?.answers?.[q]||'';
      b.classList.toggle('practice-question-hidden',!activeQuestionSet.includes(q));
      b.classList.toggle('correct',Boolean(visible&&choice===exerciseCorrectAnswers[q]));
      b.classList.toggle('incorrect',Boolean(visible&&choice!==exerciseCorrectAnswers[q]));
      b.classList.toggle('demo-result-neutral',!visible);
      const originalPosition=a?.optionOrders?.[q]?.indexOf(choice);
      const displayChoice=choice&&originalPosition>=0?'ABC'[originalPosition]:choice;
      b.innerHTML=`<span class="result-answer-index">${q}</span><span class="result-answer-choice">${displayChoice||'--'}</span>`;
      b.setAttribute('aria-label',`第${q}题${visible?(choice===exerciseCorrectAnswers[q]?'正确':'错误'):'，对错未显示'}`);
    });
    const actions=$('.result-actions');actions?.classList.add('demo-result-actions');
    resultReviewLabel.textContent='错题巩固';resultReviewButton.hidden=!visible;resultReviewButton.disabled=Boolean(a&&a.wrongCount===0);
    resultAnalysisButton.hidden=!visible;
    retake.hidden=child?false:!Boolean(st.canStart);retake.textContent=child?'再次练习':'重新作答';
    historyButton.hidden=child;
    app.classList.remove('assignment-retake-result','no-review');
  };

  tryAutoPlayExerciseAudio = function() { if(starting&&session?.restored)return;orig.tryAutoPlayExerciseAudio(); };
  function makeSession(draft=null) {
    return draft?{...clone(draft),restored:true,ended:false}:{sessionId:sid(),startedAt:D.now(),answers:{},optionOrders:{},position:0,section:'first-intro',checkDeadline:null,ended:false};
  }
  function startPaper(taskId,paperId,{fresh=false}={}) {
    const t=D.getTask(taskId),p=D.getPaper(taskId,paperId);if(!t||!p)return;
    const st=D.paperStatus(taskId,paperId);
    if(D.now()<Number(t.visibleAt||0)){notify('尚未到可见时间');return;}
    if(D.now()<Number(t.startAt||0)){notify('尚未到老师设置的开始时间');return;}
    const existingDraft=fresh?null:D.getDraft(taskId,paperId);
    if(!st.canStart&&!existingDraft){openReport(taskId,paperId);return;}
    context={taskId,paperId};training=null;report=null;busy=false;activeLearningKey=null;
    const draft=existingDraft;session=makeSession(draft);
    starting=true;studyMode=t.mode||'practice';applySettings();
    orig.startExerciseSession({title:p.title,mode:'assignment',questions:p.questions||Array.from({length:20},(_,i)=>i+1),returnView:'practice-detail',passRate:t.passRate??70});
    if(!draft)session.optionOrders=freshOrders(Boolean(t.randomOptions));
    setOptions(session.optionOrders);restoreExerciseSelections(session.answers||{});
    exerciseStartedAt=session.startedAt;
    if(draft){
      pauseExerciseTimeline();
      showQuestionSection((session.section||'').replace(/^second-(\d+)$/, 'material-$1')||getQuestionPageForQuestion(activeQuestionSet[0]));
      if(session.checkDeadline){
        const check=getTimelineCheckItem();if(check){exerciseTimelinePosition=check.start;exerciseTimelineItem=check;checkStageOpened=true;app.classList.add('exam-checking');}
      }else orig.seekExerciseTimeline(Number(session.position||0),false,{suppressScroll:true});
    }
    starting=false;applySettings();updateAnswerCardState();saveCurrent(true);
    syncRoute('exercise',taskId,paperId);
    if(session.pendingSubmission)requestSubmit(session.pendingSubmission);
    else if(session.checkDeadline)tickCheck();
  }
  startPracticePaper = function(title) {
    const t=D.getTask(activePracticeTaskKey)||D.getState().tasks[0];const p=t?.papers.find(x=>x.title===title)||t?.papers[0];if(p)startPaper(t.id,p.id);
  };
  openPracticeResult = function(title) {const t=D.getTask(activePracticeTaskKey)||D.getState().tasks[0];const p=t?.papers.find(x=>x.title===title)||t?.papers[0];if(p)openReport(t.id,p.id);};
  startExerciseSession = function(options={}) {
    if(options.mode==='similar'||options.mode==='similar-review') {startTraining(options.mode==='similar-review'?'wrong':'similar',options.questions);return;}
    context=null;report=null;training=null;busy=false;
    activeLearningKey=`book:${options.mode||'normal'}:${options.title||'听力训练'}:${(options.questions||[]).join('-')}`;
    const saved=D.getLearningDraft(activeLearningKey);
    session=makeSession(saved?.session);session.bookOptions=clone(options);starting=true;
    studyMode='practice';orig.startExerciseSession(options);
    if(!saved)session.optionOrders=freshOrders(false);
    setOptions(session.optionOrders);restoreExerciseSelections(session.answers||{});exerciseStartedAt=session.startedAt;
    if(saved)restoreSessionPosition();
    starting=false;applySettings();saveCurrent(true);
    syncRoute('learning',null,null,{resume:activeLearningKey});
  };
  function startTraining(kind,questions=null) {
    if(!report?.attempt&&!context){notify('请先打开一份作答成绩单');return;}
    if(report&&!reportReviewAllowed()){notify('答案尚未公布或还没有达标记录');return;}
    const source=report?clone(report):null;
    const returnView=currentView==='question-analysis'?'question-analysis':'exercise-result';
    const returnQuestion=currentAnalysisQuestion;
    const answers=source?.attempt?.answers||currentAnswers();
    const sourceQuestions=source?.attempt?.questions||activeQuestionSet;
    if(!questions)questions=kind==='wrong'?sourceQuestions.filter(q=>answers[q]!==exerciseCorrectAnswers[q]):getSimilarPracticeQuestions(currentAnalysisQuestion||sourceQuestions[0]||1);
    questions=[...new Set(questions)];
    if(!questions.length){notify('本次作答没有错题');return;}
    activeLearningKey=`training:${kind}:${source?.taskId||'book'}:${source?.paperId||'book'}:${source?.attempt?.id||'current'}:${questions.join('-')}`;
    const saved=D.getLearningDraft(activeLearningKey);
    training={kind,source,questions,returnView,returnQuestion,fromHistory:resultFromHistory};
    if(saved?.training)training={...saved.training,source};
    report=null;session=makeSession(saved?.session);busy=false;
    starting=true;studyMode='practice';
    orig.startExerciseSession({title:kind==='wrong'?'错题巩固':'同类题练习',mode:'normal',questions,returnView:'exercise-result',hideQuestionHead:true,canReview:false});
    if(!saved)session.optionOrders=freshOrders(false);
    setOptions(session.optionOrders);restoreExerciseSelections(session.answers||{});exerciseStartedAt=session.startedAt;
    if(saved)restoreSessionPosition();else showQuestionSection(getQuestionPageForQuestion(questions[0]));
    starting=false;applySettings();updateAnswerCardState();saveCurrent(true);
    syncRoute('learning',context?.taskId,context?.paperId,{resume:activeLearningKey});
  }
  function leaveLearning(discard=false) {
    const source=training?.source;
    const returnView=training?.returnView;
    const returnQuestion=training?.returnQuestion;
    const wasHistorical=training?.fromHistory||false;
    const bookReturn=session?.bookOptions?.returnView||report?.returnView||'book-learning';
    if(discard&&activeLearningKey)D.discardLearningDraft(activeLearningKey);
    pauseExerciseTimeline();session=null;training=null;activeLearningKey=null;busy=false;modalLayer.hidden=true;
    if(source) {
      report=source;context=source.taskId?{taskId:source.taskId,paperId:source.paperId}:null;resultFromHistory=wasHistorical;
      restoreAttempt(source.attempt);renderExerciseResult();showView('exercise-result');
      syncRoute('result',source.taskId,source.paperId,{attempt:wasHistorical?source.attempt?.id:null,historical:wasHistorical?'1':null});
      if(returnView==='question-analysis')openAnalysisAtQuestion(returnQuestion||source.attempt?.questions?.[0]||1);
    } else {
      context=null;report=null;showView(bookReturn);syncRoute(bookReturn);
    }
  }
  function localAttempt() {
    const answers=currentAnswers();const correctCount=activeQuestionSet.filter(q=>answers[q]===exerciseCorrectAnswers[q]).length;
    return {id:sid(),answers,questions:[...activeQuestionSet],optionOrders:clone(session?.optionOrders||{}),correctCount,totalCount:activeQuestionSet.length,wrongCount:activeQuestionSet.length-correctCount,accuracy:100*correctCount/activeQuestionSet.length,score:Math.round(30*correctCount/activeQuestionSet.length),totalScore:30,elapsedSeconds:Math.max(1,Math.round((D.now()-(session?.startedAt||D.now()))/1000)),submittedAt:D.now()};
  }
  function showLocalResult(value) {
    report=value;resultFromHistory=false;session=null;training=null;activeLearningKey=null;
    const key=`result:${value.attempt.id}`;
    storeWriting=true;
    try { D.saveLearningDraft(key,{report:clone(value)}); } finally { storeWriting=false; }
    syncRoute('local-result',value.taskId,value.paperId,{resume:key});
    renderExerciseResult();showView('exercise-result');
  }
  function requestSubmit({auto=false,confirmLate=false,submittedAt=null}={}) {
    if(busy&&!confirmLate)return;
    if(!session)return;
    const missing=activeQuestionSet.filter(q=>!getSelectedChoice(q));
    if(!auto&&missing.length){
      modal('还有题目未作答',`未作答题号：${missing.join('、')}\n请完成全部题目后再提交。`,[{label:'继续作答',kind:'primary',run:()=>{if(!isManagedExam()||isExamCheckStage())scrollToQuestion(missing[0]);}}]);return;
    }
    if(training){
      const a=localAttempt(),source=training.source;session.ended=true;pauseExerciseTimeline();
      if(activeLearningKey)D.discardLearningDraft(activeLearningKey);
      const localReport={taskId:context?.taskId||source?.taskId,paperId:context?.paperId||source?.paperId,attempt:a,training:true,parentReport:source,trainingKind:training.kind,parentView:training.returnView,parentQuestion:training.returnQuestion};
      showLocalResult(localReport);return;
    }
    if(!context){
      const a=localAttempt(),originMode=currentExerciseMode,returnView=exerciseReturnView;
      session.ended=true;pauseExerciseTimeline();
      if(originMode==='wrong-book-review'&&returnView==='wrong-book'&&a.wrongCount===0)activeQuestionSet.forEach(markWrongBookQuestionMastered);
      if(activeLearningKey)D.discardLearningDraft(activeLearningKey);
      showLocalResult({taskId:null,paperId:null,attempt:a,training:true,isBook:true,originMode,returnView});return;
    }
    const answers=currentAnswers(); const at=submittedAt??(auto&&session.checkDeadline?session.checkDeadline:D.now());
    let outcome;
    storeWriting=true;
    try { outcome=D.submit({taskId:context.taskId,paperId:context.paperId,answers,questions:[...activeQuestionSet],startedAt:session.startedAt,auto,submittedAt:at,confirmLate,sessionId:session.sessionId,optionOrders:session.optionOrders}); }
    finally { storeWriting=false; }
    if(outcome.status==='missing'){notify(`未作答题号：${(outcome.missing||missing).join('、')}`);return;}
    if(outcome.status==='blocked'){
      busy=true;session.ended=auto;session.pendingSubmission={auto,submittedAt:at};pauseExerciseTimeline();saveCurrent(true);
      modal('无法提交','您已经超过了老师的规定作答时间，无法提交',[{label:'我知道了',kind:'primary',run:()=>{D.discardDraft(context.taskId,context.paperId);goToPaperList();}}]);return;
    }
    if(outcome.status==='late_confirmation'){
      busy=true;session.ended=auto;session.pendingSubmission={auto,submittedAt:at};pauseExerciseTimeline();saveCurrent(true);
      modal('补交作答','您已经超过了老师的规定作答时间，是否立即补交？',[
        {label:'放弃本次作答',kind:'secondary',run:()=>{D.discardDraft(context.taskId,context.paperId);goToPaperList();}},
        {label:'立即补交',kind:'primary',run:()=>{busy=false;requestSubmit({auto,confirmLate:true,submittedAt:at});}}
      ]);return;
    }
    if(outcome.status==='success'){
      session.ended=true;pauseExerciseTimeline();busy=false;const target={...context};
      report={...target,attempt:outcome.attempt};resultFromHistory=false;session=null;
      syncRoute('result',target.taskId,target.paperId);
      restoreAttempt(outcome.attempt);renderTasks();renderExerciseResult();showView('exercise-result');
    }
  }
  submitExercise = function({force=false}={}) {requestSubmit({auto:force});};
  function saveCurrent(force=false) {
    if(starting||!session||storeWriting)return;
    if(session.ended&&!session.pendingSubmission)return;
    if(!context&&!activeLearningKey)return;
    if(!force&&D.now()-lastSavedAt<1500)return;
    session.answers=currentAnswers();session.position=orig.getTimelineTime();session.section=$('.exercise-section-panel.active')?.dataset.questionSection||session.section;
    session.savedAt=D.now();lastSavedAt=D.now();storeWriting=true;
    try{
      if(activeLearningKey)D.saveLearningDraft(activeLearningKey,{session:clone(session),training:training?clone(training):null});
      else D.saveDraft(context.taskId,context.paperId,clone(session));
    }finally{storeWriting=false;}
  }
  function abandon() { if(activeLearningKey){leaveLearning(true);return;}if(context)D.discardDraft(context.taskId,context.paperId);session=null;goToPaperList(); }
  function requestBack() {
    if(!session){goToPaperList();return;}
    pauseExerciseTimeline();saveCurrent(true);
    if(isManagedExam())modal('放弃本次作答','是否确认放弃本次任务？',[{label:'取消',run:()=>{}},{label:'确认放弃',kind:'danger',run:abandon}]);
    else modal('暂存本次作答','是否暂存本次作答？下次可继续作答',[{label:'放弃本次作答',kind:'secondary',run:abandon},{label:'确认暂存',kind:'primary',run:()=>{saveCurrent(true);if(activeLearningKey)leaveLearning(false);else{session=null;goToPaperList();}}}]);
  }
  function beginCheck(seconds=120) {
    if(!isManagedExam())return false;
    const check=getTimelineCheckItem();if(!check)return false;
    const length=Math.min(120,Math.max(0,Number(seconds)||0));
    session.checkDeadline=D.now()+length*1000;session.position=check.end-length;session.section='material-10';
    pauseExerciseTimeline();exerciseTimelinePosition=check.end-length;exerciseTimelineItem=check;checkStageOpened=true;
    showQuestionSection('material-10');app.classList.add('exam-checking');openAnswerDrawer();saveCurrent(true);tickCheck();return true;
  }
  function tickCheck() {
    if(!isManagedExam()||!session.checkDeadline||session.ended||busy)return;
    const remaining=Math.max(0,(session.checkDeadline-D.now())/1000);
    const check=getTimelineCheckItem();
    if(check){exerciseTimelinePosition=check.end-remaining;exerciseTimelineItem=check;}
    if(exerciseBottomLabel)exerciseBottomLabel.textContent=`请检查 ${formatTimelineCountdown(remaining)}`;
    app.classList.add('exam-checking');
    if(remaining<=0){session.ended=true;requestSubmit({auto:true,submittedAt:session.checkDeadline});}
  }
  getTimelineTime = function() {
    if(isManagedExam()&&session?.checkDeadline){const check=getTimelineCheckItem();if(check)return Math.min(check.end,Math.max(check.start,check.end-(session.checkDeadline-D.now())/1000));}
    return orig.getTimelineTime();
  };
  seekExerciseTimeline = function(time,shouldPlay=exerciseTimelinePlaying,options={}) {
    if(isManagedExam()&&session&&!starting){
      const check=getTimelineCheckItem();
      if(check&&time>=check.start){
        if(!session.checkDeadline)beginCheck(Math.max(0,Math.min(120,check.end-time)));
        else tickCheck();return;
      }
    }
    orig.seekExerciseTimeline(time,shouldPlay,options);
  };
  updateAnswerCardState = function() {
    const count=orig.updateAnswerCardState();
    const incomplete=count<activeQuestionSet.length;
    exerciseSubmitButtons.forEach(b=>{b.classList.toggle('demo-submit-muted',incomplete);b.setAttribute('aria-disabled',String(incomplete));b.textContent='提交';});
    if(exerciseBottomNext?.dataset.action==='submit'){exerciseBottomNext.classList.toggle('demo-submit-muted',incomplete);exerciseBottomNext.setAttribute('aria-disabled',String(incomplete));}
    return count;
  };
  updateBottomExerciseAction = function() {
    orig.updateBottomExerciseAction();
    if(!training)exerciseSubmitButtons.forEach(button=>button.hidden=false);
    if(isManagedExam()&&session?.checkDeadline){exerciseBottomNext.hidden=false;exerciseBottomNext.textContent='提交';exerciseBottomNext.dataset.action='submit';delete exerciseBottomNext.dataset.nextSection;}
    if(training){
      const section=$('.exercise-section-panel.active')?.dataset.questionSection;const sections=getActiveQuestionSections();const i=sections.indexOf(section);
      exerciseSubmitButtons.forEach(button=>button.hidden=i!==sections.length-1);
      if(i>=0){exerciseBottomNext.hidden=false;exerciseBottomNext.textContent=i===sections.length-1?'提交':'下一页';exerciseBottomNext.dataset.action=i===sections.length-1?'submit':'next';if(i<sections.length-1)exerciseBottomNext.dataset.nextSection=sections[i+1];else delete exerciseBottomNext.dataset.nextSection;}
    }
  };
  updateVisibleQuestionScope = function() {
    orig.updateVisibleQuestionScope();
    $$('.demo-exam-future').forEach(n=>n.classList.remove('demo-exam-future'));
  };
  function examScope() {
    if(!isManagedExam()||session?.checkDeadline||currentView!=='exercise'){$$('.demo-exam-future').forEach(n=>n.classList.remove('demo-exam-future'));return;}
    const cue=getCueForTime(getTimelineTime());if(!cue?.questions?.length)return;
    $$('.exercise-question-index').forEach(index=>{
      const q=getQuestionNumberFromIndex(index);const unit=index.closest('.exercise-question-item')||index.closest('.exercise-question-card');
      unit?.classList.toggle('demo-exam-future',activeQuestionSet.includes(q)&&!cue.questions.includes(q));
    });
    $$('.exercise-question-card').forEach(card=>{const units=getQuestionUnits(card);if(units.length>1)card.classList.toggle('demo-exam-future',units.every(u=>u.classList.contains('demo-exam-future')||u.classList.contains('practice-question-hidden')));});
  }
  showQuestionSection = function(section) {
    orig.showQuestionSection(section);updateBottomExerciseAction();saveCurrent();
  };
  openAnalysisAtQuestion = function(q=1) {
    if(report&&!reportReviewAllowed()){notify('答案尚未公布或还没有达标作答记录');return;}
    orig.openAnalysisAtQuestion(q);const index=activeQuestionSet.indexOf(q);if(analysisCounter)analysisCounter.textContent=`${index+1}/${activeQuestionSet.length}`;
  };
  renderAnalysisQuestion = function(q=currentAnalysisQuestion) {
    orig.renderAnalysisQuestion(q);if(analysisCounter)analysisCounter.textContent=`${Math.max(0,activeQuestionSet.indexOf(q))+1}/${activeQuestionSet.length}`;
  };
  showView = function(target) {
    currentView=target;historyView.classList.remove('active');
    if(target==='answer-history'){
      orig.showView('exercise-result');$$('.view.active').forEach(v=>v.classList.remove('active'));historyView.classList.add('active');app.classList.remove('result-mode','exercise-mode','analysis-mode');app.classList.add('learning-mode');
    }else orig.showView(target);
    if(target==='assignments'||target==='assignment-history'||target==='home')renderTasks();
    if(target==='exercise-result'&&report){renderExerciseResult();}
    if(target!=='exercise')closeStudySettingsDrawer();
    if(exerciseSettingsButton)exerciseSettingsButton.hidden=target!=='exercise';
  };

  function stop(event){event.preventDefault();event.stopImmediatePropagation();}
  document.addEventListener('click',event=>{
    const n=event.target.closest('button,.exercise-option');if(!n)return;
    if(n.closest('.demo-modal'))return;
    if(n.matches('[data-demo-task]')){stop(event);openTask(n.dataset.demoTask);return;}
    if(n.matches('[data-assignment-tab]')){stop(event);const name=n.dataset.assignmentTab;selectedTab=name;renderTasks();showView('assignments');return;}
    if(n.matches('.practice-tile.cool,.practice-tile.warm')||n===practiceCenterViewAll){stop(event);selectedTab=n.matches('.practice-tile.warm')?'makeup':'pending';renderTasks();showView('assignments');return;}
    if(n===assignmentHistoryLink){stop(event);renderTasks();showView('assignment-history');return;}
    if(n===assignmentHistoryBack){stop(event);showView('assignments');return;}
    if(n===practiceDetailBack){stop(event);showView(D.taskStatus(activePracticeTaskKey)==='history'?'assignment-history':'assignments');return;}
    const row=n.closest('[data-demo-paper]');
    if(row&&n.matches('[data-demo-paper-action]')){stop(event);if(n.dataset.demoPaperAction==='result')openReport(activePracticeTaskKey,row.dataset.demoPaper);else startPaper(activePracticeTaskKey,row.dataset.demoPaper);return;}
    if(n===historyButton){stop(event);openHistory();return;}
    if(n.matches('.demo-history-back')){stop(event);if(historyReturn){report=historyReturn;context={taskId:report.taskId,paperId:report.paperId};restoreAttempt(report.attempt);renderExerciseResult();showView('exercise-result');}else goToPaperList();return;}
    if(n.matches('[data-demo-attempt]')){stop(event);openReport(report.taskId,report.paperId,n.dataset.demoAttempt,true);return;}
    if(n===resultBack){stop(event);if(report?.training&&report.parentReport){const child=report;report=report.parentReport;training=null;session=null;activeLearningKey=null;context=report.taskId?{taskId:report.taskId,paperId:report.paperId}:null;restoreAttempt(report.attempt);renderExerciseResult();showView('exercise-result');syncRoute('result',report.taskId,report.paperId);if(child.parentView==='question-analysis')openAnalysisAtQuestion(child.parentQuestion||activeQuestionSet[0]||1);}else if(report?.isBook){const back=report.returnView||'book-learning';session=null;training=null;context=null;report=null;showView(back);syncRoute(back);}else if(resultFromHistory){openHistory();}else goToPaperList();return;}
    if(n===retake){stop(event);if(report?.isBook){startExerciseSession({title:activeResultTitle,mode:report.originMode||'normal',returnView:report.returnView||'book-learning',questions:report.attempt.questions});}else if(report?.training){const previous=report;report=previous.parentReport||previous;startTraining(previous.trainingKind||'wrong',previous.attempt.questions);}else if(context)startPaper(context.taskId,context.paperId,{fresh:true});else startExerciseSession({title:activeResultTitle});return;}
    if(n===resultReviewButton&&report){stop(event);startTraining('wrong');return;}
    if(n===resultAnalysisButton&&report){stop(event);if(!report.attempt)return;openAnalysisAtQuestion(activeQuestionSet[0]||1);return;}
    if(n.matches('[data-result-jump]')&&report){stop(event);if(!report.attempt)return;openAnalysisAtQuestion(Number(n.dataset.resultJump));return;}
    if(n===analysisBack&&report){stop(event);pauseAnalysisAudio();renderExerciseResult();showView('exercise-result');return;}
    if(n===similarQuestionButton&&report){stop(event);startTraining('similar');return;}
    if(n===exerciseBack){stop(event);requestBack();return;}
    if(n.matches('.exercise-option')){stop(event);selectExerciseOption(n);return;}
    if(n.matches('.exercise-submit-button')){stop(event);if(training&&$('.exercise-section-panel.active')?.dataset.questionSection!==getActiveQuestionSections().slice(-1)[0])return;requestSubmit();return;}
    if(n===exerciseBottomNext){
      stop(event);if(session?.ended)return;
      if(n.dataset.action==='submit'){requestSubmit();return;}
      if(isManagedExam()&&!session?.checkDeadline)return;
      const section=$('.exercise-section-panel.active')?.dataset.questionSection;
      const sections=getActiveQuestionSections();
      let next=n.dataset.nextSection||$('.exercise-section-panel.active .exercise-next-section-button')?.dataset.nextPage;
      if(training)next=sections[sections.indexOf(section)+1];
      if(next){showQuestionSection(next);jumpToQuestionPageAudio(next,exerciseTimelinePlaying);$('.exercise-screen')?.scrollTo({top:0,behavior:'auto'});}
      return;
    }
    if(n.matches('.exercise-next-section-button')&&training){
      stop(event);const section=n.closest('.exercise-section-panel')?.dataset.questionSection;const sections=getActiveQuestionSections();const next=sections[sections.indexOf(section)+1];if(next){showQuestionSection(next);jumpToQuestionPageAudio(next,exerciseTimelinePlaying);}return;
    }
    if(n.matches('[data-answer-jump]')){
      stop(event);if(session?.ended)return;const q=Number(n.dataset.answerJump);if(!activeQuestionSet.includes(q))return;
      if(isManagedExam()&&!session?.checkDeadline)return;
      closeAnswerDrawer();
      if(isManagedExam()){showQuestionSection(getQuestionPageForQuestion(q));scrollToQuestion(q);}else jumpToQuestionAudio(q,{scrollToQuestion:true});
      return;
    }
    if(n===exerciseAudioToggle){
      stop(event);if(session?.ended||session?.checkDeadline||!modalLayer.hidden)return;
      if(isManagedExam()){if(!exerciseTimelinePlaying){exerciseAudio.playbackRate=1;playExerciseTimeline();}}
      else if(exerciseTimelinePlaying)pauseExerciseTimeline();else playExerciseTimeline();
      saveCurrent(true);return;
    }
    if(n.matches('.exercise-question-index')&&isManagedExam()&&!session?.checkDeadline){stop(event);return;}
    if(n===exerciseSettingsButton){stop(event);if(currentView==='exercise'){openStudySettingsDrawer();applySettings();}return;}
  },true);
  ['pointerdown','mousedown','touchstart','input','change','keydown'].forEach(type=>{
    exerciseBottomProgress?.addEventListener(type,e=>{if(isManagedExam()){e.preventDefault();e.stopImmediatePropagation();exerciseBottomProgress.disabled=true;}},true);
  });
  document.addEventListener('change',event=>{
    const n=event.target;
    if(n.matches('input[name="study-mode"]')){stop(event);applySettings();return;}
    if(!n.closest('.study-settings-drawer')&&n!==exerciseSpeedSelect)return;
    if(isManagedExam()){stop(event);applySettings();return;}
    const patch={};
    if(n.matches('input[name="study-speed"]')||n===exerciseSpeedSelect)patch.speed=Number(n.value)||1;
    if(n.matches('input[name="short-dialogue-play-count"]'))patch.shortDialoguePlayCount=Number(n.value)||2;
    if(n===studySkipInstructionToggle)patch.skipMainInstruction=n.checked;
    if(n===studySkipReadingToggle)patch.skipReadingTime=n.checked;
    if(Object.keys(patch).length){stop(event);D.updateSettings(patch);applySettings();if(n===studySkipInstructionToggle||n===studySkipReadingToggle)seekExerciseTimeline(getTimelineTime(),exerciseTimelinePlaying,{applySkip:true,suppressScroll:true});saveCurrent(true);}
  },true);
  function interrupted() {
    if(!session||session.ended||currentView!=='exercise')return;
    if(session.checkDeadline){saveCurrent(true);tickCheck();return;}
    pauseExerciseTimeline();saveCurrent(true);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)interrupted();else tickCheck();});
  window.addEventListener('pagehide',()=>{interrupted();saveCurrent(true);});
  window.addEventListener('beforeunload',()=>saveCurrent(true));
  window.addEventListener('blur',interrupted);
  window.addEventListener('focus',tickCheck);
  function command(action,payload={}) {
    if(action==='fill'){
      if(!session||session.ended)return {ok:false,message:'请先打开作答页'};
      const qs=[...activeQuestionSet],blank=Math.min(qs.length,Math.max(0,Number(payload.blankCount)||0));
      const answered=qs.slice(0,qs.length-blank);let count=payload.correctCount;
      if(count===undefined)count=Math.round(answered.length*(payload.accuracy===undefined?80:Number(payload.accuracy))/100);
      const a=D.answersFor?D.answersFor(Number(count),answered,payload.wrongQuestions):Object.fromEntries(answered.map((q,i)=>[q,i<count?exerciseCorrectAnswers[q]:getWrongChoice(q)]));
      restoreExerciseSelections(a);saveCurrent(true);return {ok:true,message:`已填写${answered.length}题`};
    }
    if(action==='check'||action==='autoSoon'){
      if(!isManagedExam())return {ok:false,message:'当前不是考试作答'};
      beginCheck(action==='check'?120:(payload.seconds===undefined?3:Number(payload.seconds)));return {ok:true,message:action==='check'?'已进入2分钟检查':'已定位到即将自动交卷'};
    }
    if(action==='interrupt'){interrupted();return {ok:true,message:'已保存断点并暂停音频；可点击继续播放'};}
    if(action==='report'){const c=context||resolveTarget();if(c)openReport(c.taskId,c.paperId);return {ok:Boolean(c),message:'已打开最新成绩单'};}
    if(action==='wrong'||action==='similar'){
      if(!report){const c=context||resolveTarget();if(c)openReport(c.taskId,c.paperId);}
      if(action==='similar'&&report?.attempt){openAnalysisAtQuestion(report.attempt.questions?.[0]||1);}
      startTraining(action);return {ok:Boolean(training),message:training?'已进入整轮练习':'当前状态不能进入练习'};
    }
    if(action==='submit'){requestSubmit({auto:Boolean(payload.auto)});return {ok:true,message:'已发起提交校验'};}
    if(action==='settings'){if(currentView!=='exercise')return{ok:false,message:'学习设置仅在作答页显示'};openStudySettingsDrawer();applySettings();return{ok:true,message:'已打开学习设置'};}
    return {ok:false,message:'不支持的演示操作'};
  }
  function resolveTarget() {
    const params=new URLSearchParams(location.search); const c=D.cases.find(x=>x.id===(params.get('case')||D.getState().caseId));
    const taskId=params.get('task')||c?.taskId||D.getState().tasks[0]?.id;
    const paperId=params.get('paper')||c?.paperId||D.getTask(taskId)?.papers[0]?.id;
    return taskId&&paperId?{taskId,paperId,case:c}:null;
  }
  window.StudentApp={command,openTask,startPaper,openReport,openHistory,getContext:()=>clone({context,report,session,training}),version:D.VERSION};
  window.addEventListener('message',event=>{
    if(event.data?.type!=='student-demo-command')return;
    const fileMode=location.protocol==='file:';
    if(fileMode){if(event.origin!=='null'||event.source!==window.opener)return;}
    else if(!/^https?:$/.test(location.protocol)||event.origin!==location.origin)return;
    let result;try{result=command(event.data.command,event.data.payload||{});}catch(error){result={ok:false,message:error.message};}
    event.source?.postMessage({type:'student-demo-command-result',requestId:event.data.requestId,...result},fileMode?'*':location.origin);
  });
  D.subscribe(()=>{
    if(storeWriting||starting)return;
    renderTasks();
    if(currentView==='exercise-result'&&report){
      if(!report.training){const attempts=D.paperStatus(report.taskId,report.paperId).attempts;if(report.attempt)report.attempt=attempts.find(a=>a.id===report.attempt.id)||null;}
      renderExerciseResult();
    }
    if(currentView==='question-analysis'&&report&&!reportReviewAllowed()){renderExerciseResult();showView('exercise-result');}
    if(currentView==='practice-detail')openTask(activePracticeTaskKey);
    if(currentView==='exercise'){applySettings();tickCheck();}
  });
  let selectedTab='pending';
  setInterval(()=>{tickCheck();examScope();if(currentView==='exercise'){syncExerciseAudioControl();updateBottomExerciseAction();updateAnswerCardState();saveCurrent();}},400);
  exerciseSimulateFab?.setAttribute('hidden','');
  $$('button').filter(b=>b.textContent.trim()==='跟读').forEach(b=>b.remove());
  renderTasks();applySettings();
  const target=resolveTarget();const params=new URLSearchParams(location.search);
  if(target&&(params.has('case')||params.has('task')||params.has('entry'))){
    const entry=params.get('entry')||target.case?.entry||'detail';
    if(entry==='local-result'){
      const saved=D.getLearningDraft(params.get('resume')||'');
      if(saved?.report){report=clone(saved.report);context=report.taskId?{taskId:report.taskId,paperId:report.paperId}:null;restoreAttempt(report.attempt);renderExerciseResult();showView('exercise-result');}
      else openTask(target.taskId);
    }
    else if(entry==='learning'){
      const saved=D.getLearningDraft(params.get('resume')||'');
      if(saved?.training?.source){report=clone(saved.training.source);context=report.taskId?{taskId:report.taskId,paperId:report.paperId}:null;resultFromHistory=Boolean(saved.training.fromHistory);startTraining(saved.training.kind,saved.training.questions);}
      else if(saved?.session?.bookOptions)startExerciseSession(saved.session.bookOptions);
      else openTask(target.taskId);
    }
    else if(entry==='result')openReport(target.taskId,target.paperId,params.get('attempt'),params.get('historical')==='1');
    else if(entry==='exercise')startPaper(target.taskId,target.paperId);
    else openTask(target.taskId);
    const action=target.case?.action;
    if(action&&action!=='missing'&&!params.has('entry'))setTimeout(()=>command(action,target.case?.preset||{}),150);
  }
})();
