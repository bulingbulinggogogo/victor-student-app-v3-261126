/* Student APP v14, 2026-11-27. Existing layouts are retained; named task states live in StudentDemo. */
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
    syncStudyModeUi, jumpToQuestionAudio, selectExerciseOption, tryAutoPlayExerciseAudio,
    getQuestionPageForQuestion, getActiveQuestionSections, openStudySettingsDrawer
  };
  let context = null, report = null, session = null, training = null;
  let activeLearningKey = null;
  let busy = false, starting = false, storeWriting = false, lastSavedAt = 0;
  let currentView = $('.view.active')?.dataset.view || 'home';
  let resultFromHistory = false, historyReturn = null, historyOriginFromHistory = false;

  let bookCategory='active';
  function renderBooks(category=bookCategory){
    bookCategory=category==='purchased'?'purchased':'active';
    const stack=$('.books-screen .books-stack');if(!stack)return;
    const tabs=$$('.books-screen .books-tab');
    tabs.forEach((tab,i)=>{const cat=i?'purchased':'active';tab.dataset.bookCategory=cat;tab.classList.toggle('active',cat===bookCategory);tab.setAttribute('aria-selected',String(cat===bookCategory));tab.textContent=(i?'已过期':'已激活书籍')+'（'+D.getBooks(cat).length+'）';});
    let list=$('.demo-books-list',stack);
    if(!list){$$('.books-card',stack).forEach(card=>card.remove());list=document.createElement('section');list.className='demo-books-list';list.setAttribute('aria-label','书籍列表');stack.appendChild(list);}
    list.innerHTML=D.getBooks(bookCategory).map(b=>`<button class="books-card book-item" type="button" data-demo-book="${esc(b.id)}" aria-label="${esc(b.title)}"><span class="book-cover-frame"><img class="book-cover" src="assets/books/listening-advanced-g1b.jpg" alt="听力进阶书封"></span><span class="book-info"><span class="book-name">${esc(b.title)}</span><span class="book-detail">${esc(b.edition)}</span><span class="book-progress" aria-label="已学 ${b.learned}/${b.total}"><span class="book-progress-track"><span class="book-progress-fill" style="width:${b.learned/b.total*100}%"></span></span><span class="book-progress-meta">已学${b.learned}/${b.total}</span></span></span><span class="book-action">${b.expired?'查看详情':'学习此书'}</span></button>`).join('');
  }
  function syncBookSummary(){
    const book=D.getBooks().find(b=>b.id===D.getState().activeBookId);if(!book)return;
    const card=$('.book-learning-screen .learn-summary-card');if(!card)return;
    $('.book-name',card).textContent=book.title;$('.book-detail',card).textContent=book.edition;
    $('.book-progress-fill',card).style.width=book.learned/book.total*100+'%';
    $('.book-progress-meta',card).textContent='已学'+book.learned+'/'+book.total;
    const accuracy=$('.book-accuracy-tag',card);if(accuracy){accuracy.hidden=!book.learned;accuracy.textContent='正答率'+Math.round(book.accuracy||0)+'%';}
    card.dataset.demoBookId=book.id;
  }
  function openDemoBook(id){
    const book=D.selectBook(id);if(!book)return;
    if(book.expired){openExpiredBook(id);return;}
    bookCategory=book.category;pauseExerciseTimeline();syncBookSummary();showView('book-learning');
    if(typeof openCurrentLesson==='function')openCurrentLesson();
    $$('.nav button[data-target]').forEach(n=>n.classList.toggle('active',n.dataset.target==='books'));
    syncRoute('book-learning',null,null,{book:id});
  }

  const expiredView=document.createElement('main');
  expiredView.className='screen view practice-detail-screen demo-expired-screen';expiredView.dataset.view='expired-book';
  $('.app')?.insertBefore(expiredView,$('.nav'));
  let expiredBookId=null;
  function openExpiredBook(id,recordId=null){
    const book=D.getBooks().find(b=>b.id===id);if(!book?.expired)return;
    expiredBookId=id;pauseExerciseTimeline();session=null;training=null;context=null;report=null;activeLearningKey=null;busy=false;
    const records=D.getExpiredBookRecords(id),record=records.find(a=>a.id===recordId);
    expiredView.innerHTML='<section class="assignment-top"><div class="assignment-nav"><button type="button" data-expired-back>返回</button><h1 class="assignment-title">'+esc(record?'答题卡':book.title)+'</h1><span></span></div></section>'+
      (record?'<section class="demo-expired-card"><h2>'+esc(record.title)+'</h2><div class="demo-expired-answer-grid">'+record.questions.map(q=>'<span class="demo-expired-answer"><b>'+q+'</b><span>'+esc(record.answers[q]||'--')+'</span></span>').join('')+'</div></section>':
      '<section class="books-card"><span class="book-name">'+esc(book.title)+'</span><span class="book-detail">已过期</span></section><section class="book-directory practice-paper-list">'+records.map(a=>'<button class="directory-child" type="button" data-expired-record="'+esc(a.id)+'"><span class="directory-child-label"><span class="directory-child-name">'+esc(a.title)+'</span></span><span class="directory-do">查看答题卡</span></button>').join('')+'</section>');
    expiredView.dataset.record=recordId||'';showView('expired-book');syncRoute('expired-book',null,null,{book:id,record:recordId});
  }
  function blockedExpiredBook(){
    const id=session?.bookOptions?.bookId||(report?.isBook?report.bookId:null)||(training?.source?.isBook?training.source.bookId:null);
    return id&&D.isBookExpired(id)?id:null;
  }

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
  const materialCueOriginal = new Map($$('.exercise-material-cue').map(node=>[node,node.textContent]));
  const questionParentOrder=new Map();
  for(let q=1;q<=20;q++){const parent=getQuestionUnitByNumber(q)?.parentNode;if(parent&&!questionParentOrder.has(parent))questionParentOrder.set(parent,[...parent.children]);}
  function applyRecordedQuestionOrder(){
    questionParentOrder.forEach((children,parent)=>children.forEach(child=>parent.appendChild(child)));
    if(!training)return;
    for(const q of activeQuestionSet){const unit=getQuestionUnitByNumber(q);if(unit?.parentNode)unit.parentNode.appendChild(unit);}
  }
  const resultHeader = $('.result-nav');
  const historyButton = document.createElement('button');
  historyButton.type = 'button'; historyButton.className = 'assignment-history-link demo-result-history'; historyButton.dataset.openAttemptHistory=''; historyButton.textContent = '作答记录';
  resultHeader?.lastElementChild?.replaceWith(historyButton);
  const historySlot=document.createElement('span');historySlot.className='demo-result-history-slot';historySlot.setAttribute('aria-hidden','true');
  function syncResultHistory(allowed){
    historyButton.hidden=!allowed;historyButton.disabled=!allowed;
    if(allowed){if(!historyButton.parentNode&&historySlot.parentNode)historySlot.replaceWith(historyButton);}
    else if(historyButton.parentNode)historyButton.replaceWith(historySlot);
  }

  const retake = document.createElement('button');
  retake.type='button'; retake.className='result-action demo-retake';
  retake.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.64 6.36M3 3v8h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span data-retake-label>重新作答</span>';
  $('.result-actions')?.insertBefore(retake, $('.result-actions')?.firstElementChild);
  $('.result-actions')?.classList.add('demo-result-actions');
  const historyView = document.createElement('main');
  historyView.className='screen view practice-detail-screen assignment-history-screen demo-history-screen'; historyView.dataset.view='answer-history';
  historyView.innerHTML='<section class="assignment-top"><div class="status"><span>9:41</span><span class="status-icons"><span class="signal"><i></i><i></i><i></i><i></i></span>Wi-Fi<span class="battery"><i></i></span></span></div><div class="assignment-nav"><button type="button" class="assignment-history-back demo-history-back" aria-label="返回成绩单"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><h1 class="assignment-title">作答记录</h1><span aria-hidden="true"></span></div></section><section class="demo-history-summary"></section><section class="book-directory practice-paper-list demo-history-list" aria-label="作答记录列表"></section>';
  $('.app')?.insertBefore(historyView, $('.nav'));
  historyButton.addEventListener('click',event=>{stop(event);openHistory();});
  const modalLayer = document.createElement('div'); modalLayer.className='demo-modal-layer'; modalLayer.hidden=true;
  $('.app')?.appendChild(modalLayer);
  const showcaseLayer = document.createElement('div');
  showcaseLayer.className='demo-showcase-layer'; showcaseLayer.hidden=true;
  showcaseLayer.innerHTML='<section class="demo-showcase-panel" role="dialog" aria-modal="true" aria-label="状态案例目录"><header class="demo-showcase-header"><div><h2>状态案例</h2><p class="demo-showcase-summary"></p></div><button type="button" class="demo-showcase-close" data-showcase-close aria-label="关闭状态案例">×</button></header><p class="demo-showcase-note">任务和套题已直接放入练习中心。这里可定位案例并演示进行中的状态；只有“恢复此案例”会重置该任务。</p><label class="demo-showcase-search-label">查找状态<input type="search" class="demo-showcase-search" placeholder="如：补交后仍未达标、未公布、续播" autocomplete="off"></label><div class="demo-showcase-list"></div><p class="demo-showcase-footer">演示辅助目录 · 不属于学生正式产品流程</p></section>';
  // Scenario navigation belongs to the external workbench.
  let showcaseOpener=null;

  function taskIsVisible(taskId) { const value=D.getTask(taskId);return Boolean(value&&D.now()>=Number(value.visibleAt||0)); }
  function itemIsVisible(taskId,paperId){
    return taskIsVisible(taskId)&&(!paperId||D.paperStatus(taskId,paperId).visible);
  }
  function showcaseRows() { return typeof D.getShowcaseScenarios==='function'?D.getShowcaseScenarios().filter(row=>taskIsVisible(row.taskId)):[]; }
  function closeShowcaseDirectory() {
    if(showcaseLayer.hidden)return;
    showcaseLayer.hidden=true;
    showcaseOpener?.focus?.();
  }
  function renderShowcaseDirectory() {
    if(showcaseLayer.hidden)return;
    const rows=showcaseRows();
    const filter=$('.demo-showcase-search',showcaseLayer)?.value.trim().toLowerCase()||'';
    const filtered=rows.filter(row=>[row.title,row.category,row.description,row.expected,D.getTask(row.taskId)?.title,D.getPaper(row.taskId,row.paperId)?.title].join(' ').toLowerCase().includes(filter));
    const labels={pending:'待完成',makeup:'待补交',completed:'已完成',history:'历史练习'};
    $('.demo-showcase-summary',showcaseLayer).textContent=`${rows.length} 个状态任务 · 显示 ${filtered.length} 项`;
    $('.demo-showcase-list',showcaseLayer).innerHTML=filtered.length?filtered.map(row=>{
      const task=D.getTask(row.taskId),paper=D.getPaper(row.taskId,row.paperId),ps=D.paperStatus(row.taskId,row.paperId);
      const label=!ps.started?'尚未开始 · 可查看任务':labels[D.taskStatus(row.taskId)]||'查看';
      return `<article class="demo-showcase-item"><div class="demo-showcase-item-top"><h3>${esc(row.title)}</h3><span class="demo-showcase-state">${esc(label)}</span></div><p class="demo-showcase-paper">套题：${esc(paper?.title||row.paperTitle||'--')}${task?.papers.length>1?`（本任务共 ${task.papers.length} 套）`:''}</p><p>${esc(row.description)}</p><p class="demo-showcase-expected">预期：${esc(row.expected)}</p><div class="demo-showcase-actions"><button type="button" class="demo-btn secondary" data-showcase-task="${esc(row.caseId)}"${ps.visible?'':' disabled'}>查看任务</button><button type="button" class="demo-btn primary" data-showcase-launch="${esc(row.caseId)}">演示此状态</button><button type="button" class="demo-showcase-reset" data-showcase-reset="${esc(row.caseId)}">恢复此案例</button></div></article>`;
    }).join(''):'<p class="demo-list-empty">没有匹配的状态案例</p>';
  }
  function openShowcaseDirectory() { /* External workbench only. */ }
  function syncShowcaseEntries() { $$('.demo-showcase-entry').forEach(node=>node.remove()); }
  function launchShowcaseScenario(caseId) {
    const row=showcaseRows().find(item=>item.caseId===caseId);if(!row)return;
    closeShowcaseDirectory();
    if(row.entry==='exercise')startPaper(row.taskId,row.paperId);
    else if(row.entry==='result'){
      openReport(row.taskId,row.paperId);
      if((row.action==='wrong'||row.action==='similar')&&context?.taskId===row.taskId&&context?.paperId===row.paperId)command(row.action,row.preset||{});
    }else openTask(row.taskId);
    // Prepared exam drafts arm their countdown once in startPaper. Re-entry keeps that deadline.
    // Saved practice/exam drafts are already paused at their breakpoint; no delayed helper action runs.
  }
  function confirmResetShowcase(caseId) {
    const row=showcaseRows().find(item=>item.caseId===caseId);if(!row)return;
    modal('恢复此案例',`将恢复“${row.title}”的初始任务配置、作答记录和暂存。其他案例和任务不会改变。`,[
      {label:'取消',kind:'secondary',run:openShowcaseDirectory},
      {label:'恢复此案例',kind:'primary',run:()=>{
        const sameTask=context?.taskId===row.taskId;
        if(sameTask){pauseExerciseTimeline();session=null;training=null;report=null;context=null;activeLearningKey=null;}
        const previousStarting=starting;starting=true;
        try { D.resetShowcaseScenario(caseId); } finally { starting=previousStarting; }
        renderTasks();
        if(sameTask)openTask(row.taskId);
        openShowcaseDirectory();
      }}
    ]);
  }
  showcaseLayer.addEventListener('input',event=>{if(event.target.matches('.demo-showcase-search'))renderShowcaseDirectory();});
  showcaseLayer.addEventListener('click',event=>{
    if(event.target===showcaseLayer){stop(event);closeShowcaseDirectory();return;}
    const button=event.target.closest('button');if(!button)return;
    if(button.matches('[data-showcase-close]')){stop(event);closeShowcaseDirectory();}
    else if(button.matches('[data-showcase-task]')){stop(event);const row=showcaseRows().find(item=>item.caseId===button.dataset.showcaseTask);closeShowcaseDirectory();if(row)openTask(row.taskId);}
    else if(button.matches('[data-showcase-launch]')){stop(event);launchShowcaseScenario(button.dataset.showcaseLaunch);}
    else if(button.matches('[data-showcase-reset]')){stop(event);confirmResetShowcase(button.dataset.showcaseReset);}
  });
  showcaseLayer.addEventListener('keydown',event=>{
    if(event.key==='Escape'){stop(event);closeShowcaseDirectory();return;}
    if(event.key!=='Tab')return;
    const focusable=$$('button,input',showcaseLayer).filter(node=>!node.disabled&&!node.hidden);
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){stop(event);last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){stop(event);first?.focus();}
  });

  function modal(title, text, actions) {
    closeShowcaseDirectory();
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
  function syncPresentation(){
    const owner=context||report;
    window.StudentPaperPresentation?.activatePaper(owner?.taskId?D.getPaper(owner.taskId,owner.paperId):null);
    window.StudentPaperPresentation?.refresh({questions:[...activeQuestionSet],training:Boolean(training),analysisQuestion:currentAnalysisQuestion});
  }
  function reportReviewAllowed() { return report?(!report.taskId||itemIsVisible(report.taskId,report.paperId))&&D.resultPolicy(report.taskId,report.paperId,report.attempt,{learningRound:Boolean(report.training)}).canReview:true; }
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

  function canOpenStudySettings(){return currentView==='exercise'&&!isManagedExam();}
  function syncStudySettingsAccess(){
    const allowed=canOpenStudySettings();
    if(exerciseSettingsButton){exerciseSettingsButton.hidden=!allowed;exerciseSettingsButton.disabled=!allowed;exerciseSettingsButton.setAttribute('aria-hidden',String(!allowed));}
    if(!allowed)closeStudySettingsDrawer();
  }
  openStudySettingsDrawer = function(){
    if(!canOpenStudySettings()){closeStudySettingsDrawer();return false;}
    orig.openStudySettingsDrawer();return true;
  };
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
    orig.syncStudyModeUi();syncStudySettingsAccess();
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
    const labels={pending:D.now()<t.startAt?'查看详情':'去作答',makeup:'去补交',completed:'查看详情',history:'查看详情'};
    return `<button class="books-card book-item practice-task-card" type="button" data-demo-task="${esc(t.id)}"><span class="book-cover-frame"><img class="book-cover" src="assets/books/listening-advanced-g1b.jpg" alt="听力进阶书封"></span><span class="book-info"><span class="book-name">${esc(D.getTaskLabel(t.id)||t.title)}</span><span class="book-detail practice-date-lines"><span>开始日期：${esc(dateShort(t.startAt))}</span><span>截止日期：${esc(dateShort(t.endAt))}</span></span><span class="book-progress"><span class="book-progress-track"><span class="book-progress-fill" style="width:${stats.total?stats.completed/stats.total*100:0}%"></span></span><span class="book-progress-meta">完成${stats.completed}/${stats.total}</span></span></span><span class="book-action">${labels[st]||'查看'}</span></button>`;
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
    syncShowcaseEntries();
  }
  function openTask(taskId) {
    const t=D.getTask(taskId);if(!t)return;
    if(!taskIsVisible(taskId))return;
    activePracticeTaskKey=taskId;
    if(practiceDetailTitle)practiceDetailTitle.textContent=D.getTaskLabel(t.id);
    if(practiceCardTitle)practiceCardTitle.textContent=D.getTaskLabel(t.id);
    if(practiceStartText)practiceStartText.textContent=`开始日期：${dateShort(t.startAt)}`;
    if(practiceEndText)practiceEndText.textContent=`截止日期：${dateShort(t.endAt)}`;
    const stats=D.getTaskStats(taskId);
    if(practiceProgressText)practiceProgressText.textContent=`完成${stats.completed}/${stats.total}`;
    if(practiceProgressFill)practiceProgressFill.style.width=`${stats.total?stats.completed/stats.total*100:0}%`;
    if(practiceAccuracyText){practiceAccuracyText.hidden=!t.published||!stats.completed;practiceAccuracyText.textContent=t.published?`正答率${Math.round(stats.accuracy||0)}%`:'正答率--';}
    if(practicePaperList)practicePaperList.innerHTML=t.papers.map(p=>{
      const ps=D.paperStatus(taskId,p.id);
      if(!ps.visible)return '';
      const resume=ps.canResume;
      const openResult=!resume&&(ps.everPassed||(ps.expired&&!t.allowLate));
      const label=resume?'继续作答':openResult?'我的作答':'去作答';
      const tag=accuracyLabel(ps.latest,ps.attemptCount,taskId,p.id);
      const action=ps.started&&(resume||ps.unlocked)?`<button type="button" class="directory-do ${openResult?'answer-review':''}" data-demo-paper-action="${openResult?'result':'start'}">${label}</button>`:'';
      return `<div class="directory-child" data-demo-paper="${esc(p.id)}"><span class="directory-child-label"><span class="directory-child-name" title="${esc(D.getPaperLabel(taskId,p.id)||p.title)}">${esc(D.getPaperLabel(taskId,p.id)||p.title)}</span>${tag?`<span class="directory-accuracy">${esc(tag)}</span>`:''}</span><span class="demo-paper-actions">${action}</span></div>`;
    }).join('');
    syncRoute('detail',taskId,context?.taskId===taskId?context.paperId:t.papers[0]?.id);
    showView('practice-detail');
  }
  renderPracticeDetail = openTask;
  openPracticeTask = openTask;
  function goToPaperList() { busy=false;session=null;training=null;activeLearningKey=null;modalLayer.hidden=true;pauseExerciseTimeline();if(context)openTask(context.taskId);else showView('book-learning'); }
  function accuracyLabel(attempt,ordinal,taskId,paperId) {
    const policy=D.resultPolicy(taskId,paperId,attempt);
    if(!policy.published)return '';
    if(!attempt)return D.paperStatus(taskId,paperId).expired?'正答率--':'';
    return (ordinal>1?'第'+ordinal+'次作答：':'')+'正答率'+Math.round(attempt.accuracy)+'%';
  }
  function openHistory() {
    if(!report || report.training || report.isBook || !itemIsVisible(report.taskId,report.paperId))return;
    if(!resultFromHistory || !historyReturn){historyReturn=clone(report);if(resultFromHistory)historyReturn.attempt=clone(D.paperStatus(report.taskId,report.paperId).latest||report.attempt);historyOriginFromHistory=false;}
    const list=$('.demo-history-list',historyView); const t=D.getTask(report.taskId);
    const attempts=D.paperStatus(report.taskId,report.paperId).attempts||[];
    const paperState=D.paperStatus(report.taskId,report.paperId);const stats={total:1,completed:paperState.everPassed?1:0,accuracy:paperState.latest?.accuracy??null};
    const summary=$('.demo-history-summary',historyView);
    if(summary)summary.innerHTML=`<section class="books-card book-item learn-summary-card practice-detail-card" aria-label="作答记录详情"><span class="book-cover-frame"><img class="book-cover" src="assets/books/listening-advanced-g1b.jpg" alt="听力进阶书封"></span><span class="book-info"><span class="book-name">${esc(D.getPaperLabel(report.taskId,report.paperId))}</span><span class="book-detail practice-date-lines"><span>开始日期：${esc(dateShort(t.startAt))}</span><span>截止日期：${esc(dateShort(t.endAt))}</span></span><span class="book-progress"><span class="book-progress-track"><span class="book-progress-fill" style="width:${stats.total?stats.completed/stats.total*100:0}%"></span></span><span class="book-progress-meta">完成${stats.completed}/${stats.total}</span>${t.published&&stats.accuracy!==null?`<span class="book-progress-meta book-accuracy-tag accuracy-good">正答率${Math.round(stats.accuracy)}%</span>`:''}</span></span></section>`;
    list.innerHTML=attempts.length?[...attempts].reverse().map((a,i)=>`<button class="directory-child demo-history-row" data-demo-attempt="${esc(a.id)}" type="button" aria-label="查看第${attempts.length-i}次作答的成绩单"><span class="directory-child-label"><span class="directory-child-name"><span class="demo-attempt-ordinal">第${attempts.length-i}次作答</span><span class="demo-attempt-time">${esc(dateShort(a.submittedAt))}${a.late?' · 补交':''}</span></span>${t.published?`<span class="directory-accuracy">正答率${Math.round(a.accuracy)}%</span>`:''}</span></button>`).join(''):'<div class="demo-list-empty">暂无作答记录</div>';
    syncRoute('history',report.taskId,report.paperId);
    showView('answer-history');$('.demo-history-back',historyView)?.focus();
  }
  function restoreAttempt(a) {
    activeQuestionSet=a?.questions?.length?[...a.questions]:(paper()?.questions||Array.from({length:20},(_,i)=>i+1));
    setOptions(a?.optionOrders||{});restoreExerciseSelections(a?.answers||{});updateVisibleQuestionScope();
  }
  function openReport(taskId,paperId,attemptId=null,fromHistory=false) {
    if(!taskIsVisible(taskId)||!D.getPaper(taskId,paperId)||!D.paperStatus(taskId,paperId).visible)return;
    if(!fromHistory||historyReturn?.taskId!==taskId||historyReturn?.paperId!==paperId){historyReturn=null;historyOriginFromHistory=false;}
    pauseExerciseTimeline();
    context={taskId,paperId};session=null;training=null;activeLearningKey=null;
    const st=D.paperStatus(taskId,paperId); const attempt=attemptId?st.attempts.find(a=>a.id===attemptId):st.latest;
    report={taskId,paperId,attempt:attempt||null};resultFromHistory=fromHistory;
    currentExerciseMode='assignment';activeResultTitle=D.getPaperLabel(taskId,paperId)||'我的作答';
    activeAssignmentPassRate=D.getTask(taskId)?.passRate??70;
    syncRoute('result',taskId,paperId,{attempt:attemptId,historical:fromHistory?'1':null});
    restoreAttempt(attempt);renderExerciseResult();showView('exercise-result');
  }
  renderExerciseResult = function() {
    if(!report){orig.renderExerciseResult();syncResultHistory(false);retake.hidden=true;return;}
    const t=D.getTask(report.taskId);
    const a=report.attempt;
    const policy=D.resultPolicy(report.taskId,report.paperId,a,{learningRound:Boolean(report.training)});
    const passed=policy.everPassed,visible=policy.canReview,counts=policy.showCounts;
    canReviewCurrentResult=visible;currentExerciseMode='assignment';
    const title=$('.result-title');if(title)title.textContent=resultFromHistory&&a?'第'+(a.ordinal||1)+'次作答':'我的成绩单';
    resultScore.textContent=policy.showScore?String(a.score):'--';
    const scoreSuffix=$('.result-score > span');if(scoreSuffix)scoreSuffix.textContent=`/${a?.totalScore||30}分`;
    resultRank.innerHTML=!a?'正答率--<br>暂无作答记录':`${policy.showAccuracy?`正答率${Math.round(a.accuracy)}%`:'正答率--'}<br>${t?(passed?`已达到老师设置的${policy.passRate}%达标线`:`未到达老师设置${policy.passRate}%达标线`):'作答已完成'}`;
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
    retake.hidden=!policy.canRetake;$('[data-retake-label]',retake).textContent='重新作答';
    syncResultHistory(Boolean(report.taskId&&!report.training&&!report.isBook));
    app.classList.remove('assignment-retake-result','no-review');syncPresentation();
  };

  tryAutoPlayExerciseAudio = function() { if(starting&&session?.restored)return;orig.tryAutoPlayExerciseAudio(); };
  function makeSession(draft=null) {
    return draft?{...clone(draft),restored:true,ended:false}:{sessionId:sid(),startedAt:D.now(),answers:{},optionOrders:{},position:0,section:'first-intro',checkDeadline:null,ended:false};
  }
  function startPaper(taskId,paperId,{fresh=false}={}) {
    const t=D.getTask(taskId),p=D.getPaper(taskId,paperId);if(!t||!p)return;
    const st=D.paperStatus(taskId,paperId);
    if(!taskIsVisible(taskId)||!st.visible)return;
    if(!st.started){notify('尚未到老师设置的开始时间');return;}
    let existingDraft=fresh?null:D.getDraft(taskId,paperId);
    if(!existingDraft&&!st.unlocked){notify('该套题尚未解锁，将于'+dateShort(st.unlockAt)+'解锁');return;}
    if(!st.canStart&&!existingDraft){openReport(taskId,paperId);return;}
    if(existingDraft&&typeof D.prepareShowcaseScenario==='function'){
      const previousStarting=starting;starting=true;
      try { existingDraft=D.prepareShowcaseScenario(taskId,paperId)||existingDraft; } finally { starting=previousStarting; }
    }
    context={taskId,paperId};training=null;report=null;busy=false;activeLearningKey=null;
    const draft=existingDraft;session=makeSession(draft);
    starting=true;studyMode=t.mode||'practice';applySettings();
    orig.startExerciseSession({title:D.getPaperLabel(taskId,paperId),mode:'assignment',questions:p.questions||Array.from({length:20},(_,i)=>i+1),returnView:'practice-detail',passRate:t.passRate??70});
    if(!draft)session.optionOrders=freshOrders(true);
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
    const ownerBook=options.bookId||D.getState().activeBookId;
    if(D.isBookExpired(ownerBook)){openExpiredBook(ownerBook);return;}
    if(options.mode==='similar'||options.mode==='similar-review') {startTraining(options.mode==='similar-review'?'wrong':'similar',options.questions);return;}
    context=null;report=null;training=null;busy=false;
    options={...options,bookId:options.bookId||D.getState().activeBookId};if(options.bookId)D.selectBook(options.bookId);
    activeLearningKey=`book:${options.bookId}:${options.mode||'normal'}:${options.title||'听力训练'}:${(options.questions||[]).join('-')}`;
    const saved=D.getLearningDraft(activeLearningKey);
    session=makeSession(saved?.session);session.bookOptions=clone(options);if(options.mode==='wrong-book-review')options.hideQuestionHead=true;starting=true;
    studyMode='practice';orig.startExerciseSession(options);
    if(!saved)session.optionOrders=freshOrders(true);
    setOptions(session.optionOrders);restoreExerciseSelections(session.answers||{});exerciseStartedAt=session.startedAt;
    if(saved)restoreSessionPosition();
    starting=false;applySettings();saveCurrent(true);
    syncRoute('learning',null,null,{resume:activeLearningKey});
  };
  function startTraining(kind,questions=null) {
    if(!report?.attempt&&!context){notify('请先打开一份作答成绩单');return;}
    const expired=blockedExpiredBook();if(expired){openExpiredBook(expired);return;}
    if(report&&!reportReviewAllowed()){notify('答案尚未公布或还没有达标记录');return;}
    const source=report?clone(report):null;
    const returnView=currentView==='question-analysis'?'question-analysis':'exercise-result';
    const returnQuestion=currentAnalysisQuestion;
    const answers=source?.attempt?.answers||currentAnswers();
    const recorded=source?.attempt;
    const sourceQuestions=recorded?(recorded.questionOrder?.length?recorded.questionOrder:recorded.questions).filter(q=>recorded.questions.includes(q)):activeQuestionSet;
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
    if(!saved)session.optionOrders=freshOrders(true);
    setOptions(session.optionOrders);restoreExerciseSelections(session.answers||{});exerciseStartedAt=session.startedAt;
    if(saved)restoreSessionPosition();else showQuestionSection(getActiveQuestionSections()[0]||getQuestionPageForQuestion(questions[0]));
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
  function requestSubmit({auto=false,confirmLate=false}={}) {
    if(busy&&!confirmLate)return;
    if(!session)return;
    const expired=blockedExpiredBook();if(expired){openExpiredBook(expired);return;}
    const missing=activeQuestionSet.filter(q=>!getSelectedChoice(q));
    if(!auto&&(missing.length||!isLastQuestionPage()||isManagedExam()&&!session.checkDeadline)){
      updateBottomExerciseAction();updateAnswerCardState();return;
    }
    if(training){
      const a=localAttempt(),source=training.source;session.ended=true;pauseExerciseTimeline();
      if(activeLearningKey)D.discardLearningDraft(activeLearningKey);
      const localReport={taskId:context?.taskId||source?.taskId,paperId:context?.paperId||source?.paperId,attempt:a,training:true,parentReport:source,trainingKind:training.kind,parentView:training.returnView,parentQuestion:training.returnQuestion,parentFromHistory:Boolean(training.fromHistory)};
      showLocalResult(localReport);return;
    }
    if(!context){
      const a=localAttempt(),originMode=currentExerciseMode,returnView=exerciseReturnView;
      session.ended=true;pauseExerciseTimeline();
      if(originMode==='wrong-book-review'&&returnView==='wrong-book'&&a.wrongCount===0)activeQuestionSet.forEach(markWrongBookQuestionMastered);
      if(activeLearningKey)D.discardLearningDraft(activeLearningKey);
      showLocalResult({taskId:null,paperId:null,attempt:a,training:true,isBook:true,bookId:session?.bookOptions?.bookId||D.getState().activeBookId,originMode,returnView});return;
    }
    const answers=currentAnswers();
    let outcome;
    storeWriting=true;
    try { outcome=D.submit({taskId:context.taskId,paperId:context.paperId,answers,questions:[...activeQuestionSet],startedAt:session.startedAt,auto,confirmLate,sessionId:session.sessionId,optionOrders:session.optionOrders}); }
    finally { storeWriting=false; }
    if(outcome.status==='locked'){pauseExerciseTimeline();saveCurrent(true);notify(outcome.message);return;}
    if(outcome.status==='missing'){updateAnswerCardState();return;}
    if(outcome.status==='blocked'){
      if(outcome.prompt!=='P01'){notify(outcome.message);return;}
      busy=true;session.ended=auto;session.pendingSubmission={auto};pauseExerciseTimeline();saveCurrent(true);
      modal(D.PROMPTS.P01.title,D.PROMPTS.P01.message,[{label:D.PROMPTS.P01.buttons[0],kind:'primary',run:()=>{D.discardDraft(context.taskId,context.paperId);goToPaperList();}}]);return;
    }
    if(outcome.status==='late_confirmation'){
      busy=true;session.ended=auto;session.pendingSubmission={auto};pauseExerciseTimeline();saveCurrent(true);
      modal(D.PROMPTS.P02.title,D.PROMPTS.P02.message,[
        {label:D.PROMPTS.P02.buttons[0],kind:'secondary',run:()=>{D.discardDraft(context.taskId,context.paperId);goToPaperList();}},
        {label:D.PROMPTS.P02.buttons[1],kind:'primary',run:()=>{busy=false;requestSubmit({auto,confirmLate:true});}}
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
    if(starting||!session||storeWriting||blockedExpiredBook())return;
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
    if(isManagedExam())modal(D.PROMPTS.P03.title,D.PROMPTS.P03.message,[{label:D.PROMPTS.P03.buttons[0],run:()=>{}},{label:D.PROMPTS.P03.buttons[1],kind:'danger',run:abandon}]);
    else modal(D.PROMPTS.P04.title,D.PROMPTS.P04.message,[{label:D.PROMPTS.P04.buttons[0],kind:'secondary',run:abandon},{label:D.PROMPTS.P04.buttons[1],kind:'primary',run:()=>{saveCurrent(true);if(activeLearningKey)leaveLearning(false);else{session=null;goToPaperList();}}}]);
  }
  function beginCheck(seconds=120) {
    if(!isManagedExam())return false;
    const check=getTimelineCheckItem();if(!check)return false;
    const length=Math.min(120,Math.max(0,Number(seconds)||0));
    session.checkDeadline=D.now()+length*1000;session.position=check.end-length;session.section=getActiveQuestionSections().slice(-1)[0]||getQuestionPageForQuestion(activeQuestionSet.slice(-1)[0]||20);
    pauseExerciseTimeline();exerciseTimelinePosition=check.end-length;exerciseTimelineItem=check;checkStageOpened=true;
    showQuestionSection(session.section);app.classList.add('exam-checking');closeAnswerDrawer();saveCurrent(true);tickCheck();return true;
  }
  function tickCheck() {
    if(!isManagedExam()||!session.checkDeadline||session.ended||busy)return;
    const remaining=Math.max(0,(session.checkDeadline-D.now())/1000);
    const check=getTimelineCheckItem();
    if(check){exerciseTimelinePosition=check.end-remaining;exerciseTimelineItem=check;}
    if(exerciseBottomLabel)exerciseBottomLabel.textContent=`请检查 ${formatTimelineCountdown(remaining)}`;
    app.classList.add('exam-checking');
    if(remaining<=0){session.ended=true;requestSubmit({auto:true});}
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
  function isLastQuestionPage() {
    const section=$('.exercise-section-panel.active')?.dataset.questionSection;
    const sections=getActiveQuestionSections();
    return Boolean(section&&sections.length&&section===sections[sections.length-1]);
  }
  function syncManualSubmitState() {
    const incomplete=activeQuestionSet.some(q=>!getSelectedChoice(q));
    const blocked=incomplete||Boolean(session?.ended)||Boolean(isManagedExam()&&!session?.checkDeadline);
    exerciseSubmitButtons.forEach(button=>{
      // The answer drawer and the old static last-panel button are not additional submit entries.
      button.hidden=true;button.disabled=blocked;button.setAttribute('aria-disabled',String(blocked));
      button.classList.toggle('demo-submit-muted',blocked);button.textContent='提交';
    });
    if(exerciseBottomNext?.dataset.action==='submit'){
      exerciseBottomNext.disabled=blocked;exerciseBottomNext.classList.toggle('demo-submit-muted',blocked);
      exerciseBottomNext.setAttribute('aria-disabled',String(blocked));
    }else if(exerciseBottomNext){exerciseBottomNext.disabled=false;exerciseBottomNext.classList.remove('demo-submit-muted');exerciseBottomNext.setAttribute('aria-disabled','false');}
  }
  updateAnswerCardState = function() {
    const count=orig.updateAnswerCardState();syncManualSubmitState();syncPresentation();return count;
  };
  updateBottomExerciseAction = function() {
    orig.updateBottomExerciseAction();
    if(!exerciseBottomNext)return;
    const section=$('.exercise-section-panel.active')?.dataset.questionSection;
    const sections=getActiveQuestionSections();const i=sections.indexOf(section);
    const examLocked=isManagedExam()&&!session?.checkDeadline;
    if(examLocked){exerciseBottomNext.hidden=true;delete exerciseBottomNext.dataset.action;delete exerciseBottomNext.dataset.nextSection;}
    else if(i>=0){
      const last=i===sections.length-1;
      exerciseBottomNext.hidden=false;exerciseBottomNext.textContent=last?'提交':'下一页';
      exerciseBottomNext.dataset.action=last?'submit':'next';
      if(last)delete exerciseBottomNext.dataset.nextSection;else exerciseBottomNext.dataset.nextSection=sections[i+1];
    }else if(exerciseBottomNext.dataset.action==='submit'){
      exerciseBottomNext.hidden=true;delete exerciseBottomNext.dataset.action;delete exerciseBottomNext.dataset.nextSection;
    }
    syncManualSubmitState();
  };
  const shortPanel=$('.exercise-section-panel[data-question-section="first"]');
  function materialRound(){return Boolean(training||session?.bookOptions?.mode==='wrong-book-review');}
  function resetShortPanel(){if(shortPanel)shortPanel.dataset.questionSection='first';}
  getQuestionPageForQuestion = function(q) {
    if(materialRound()&&Number(q)<=5)return 'short-'+Number(q);
    return getQuestionUnitByNumber(Number(q))?.closest('.exercise-section-panel')?.dataset.questionSection || orig.getQuestionPageForQuestion(Number(q));
  };
  getActiveQuestionSections = function() {
    const requested=[...new Set(activeQuestionSet.map(getQuestionPageForQuestion))];
    const ordered=$$('.exercise-screen .exercise-section-panel').map(panel=>panel.dataset.questionSection).filter(section=>requested.includes(section));
    return materialRound()?requested:(ordered.length?ordered:orig.getActiveQuestionSections());
  };
  function syncTrainingQuestionScope() {
    const active=new Set(activeQuestionSet.map(Number));
    $$('.exercise-screen .exercise-question-card').forEach(card=>{
      const units=getQuestionUnits(card);
      if(materialRound()){
        units.forEach(unit=>{const number=getQuestionNumberFromIndex($('.exercise-question-index',unit));unit.classList.toggle('practice-question-hidden',!active.has(number));});
        card.classList.toggle('practice-question-hidden',!units.some(unit=>!unit.classList.contains('practice-question-hidden')));
      }
      const cue=$('.exercise-material-cue',card);if(!cue)return;
      const original=materialCueOriginal.get(cue);if(original===undefined)return;
      if(materialRound()){
        const questions=units.map(unit=>getQuestionNumberFromIndex($('.exercise-question-index',unit))).filter(q=>active.has(q));
        cue.textContent=questions.length?original.replace(/回答第[\s\S]*?题[。．]?/,`回答第 ${questions.join('、')} 题。`):original;
      }else cue.textContent=original;
    });
  }
  updateVisibleQuestionScope = function() {
    if(!materialRound())resetShortPanel();
    applyRecordedQuestionOrder();orig.updateVisibleQuestionScope();syncTrainingQuestionScope();
    const short=Number(shortPanel?.dataset.questionSection?.replace('short-',''));
    if(materialRound()&&short>=1&&short<=5)for(let q=1;q<=5;q++)getQuestionUnitByNumber(q)?.classList.toggle('practice-question-hidden',q!==short);
    syncPresentation();
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
    const short=materialRound()&&/^short-[1-5]$/.test(section)?Number(section.slice(6)):null;
    resetShortPanel();orig.showQuestionSection(short?'first':section);
    if(short&&shortPanel){
      shortPanel.dataset.questionSection=section;
      for(let q=1;q<=5;q++)getQuestionUnitByNumber(q)?.classList.toggle('practice-question-hidden',q!==short);
    }updateBottomExerciseAction();saveCurrent();
  };
  openAnalysisAtQuestion = function(q=1) {
    const expired=blockedExpiredBook();if(expired){openExpiredBook(expired);return;}
    if(report&&!reportReviewAllowed()){notify('答案尚未公布或还没有达标作答记录');return;}
    orig.openAnalysisAtQuestion(q);const index=activeQuestionSet.indexOf(q);if(analysisCounter)analysisCounter.textContent=`${index+1}/${activeQuestionSet.length}`;
  };
  renderAnalysisQuestion = function(q=currentAnalysisQuestion) {
    orig.renderAnalysisQuestion(q);if(analysisCounter)analysisCounter.textContent=`${Math.max(0,activeQuestionSet.indexOf(q))+1}/${activeQuestionSet.length}`;
    syncPresentation();
  };
  showView = function(target) {
    currentView=target;historyView.classList.remove('active');expiredView.classList.remove('active');
    if(target==='expired-book'){
      orig.showView('book-learning');$$('.view.active').forEach(v=>v.classList.remove('active'));expiredView.classList.add('active');
    }else if(target==='answer-history'){
      orig.showView('exercise-result');$$('.view.active').forEach(v=>v.classList.remove('active'));historyView.classList.add('active');app.classList.remove('result-mode','exercise-mode','analysis-mode');app.classList.add('learning-mode');
    }else orig.showView(target);
    if(target==='books')renderBooks();if(target==='book-learning')syncBookSummary();
    if(target==='assignments'||target==='assignment-history'||target==='home')renderTasks();
    if(target==='exercise-result'&&report){renderExerciseResult();}
    if(target!=='exercise')closeStudySettingsDrawer();
    syncStudySettingsAccess();
  };

  function stop(event){event.preventDefault();event.stopImmediatePropagation();}
  document.addEventListener('click',event=>{
    const n=event.target.closest('button,.exercise-option');if(!n)return;
    if(n.closest('.demo-modal'))return;
    if(n.matches('[data-expired-back]')){stop(event);if(expiredView.dataset.record)openExpiredBook(expiredBookId);else{renderBooks('purchased');showView('books');}return;}
    if(n.matches('[data-expired-record]')){stop(event);openExpiredBook(expiredBookId,n.dataset.expiredRecord);return;}
    if(n.matches('[data-book-category]')){stop(event);renderBooks(n.dataset.bookCategory);return;}
    const bookCard=n.closest('[data-demo-book]');if(bookCard){stop(event);openDemoBook(bookCard.dataset.demoBook);return;}
    if(n.matches('[data-showcase-directory]')){stop(event);openShowcaseDirectory();return;}
    if(n.matches('[data-demo-task]')){stop(event);openTask(n.dataset.demoTask);return;}
    if(n.matches('[data-assignment-tab]')){stop(event);const name=n.dataset.assignmentTab;selectedTab=name;renderTasks();showView('assignments');return;}
    if(n.matches('.practice-tile.cool,.practice-tile.warm')||n===practiceCenterViewAll){stop(event);selectedTab=n.matches('.practice-tile.warm')?'makeup':'pending';renderTasks();showView('assignments');return;}
    if(n===assignmentHistoryLink){stop(event);renderTasks();showView('assignment-history');return;}
    if(n===assignmentHistoryBack){stop(event);showView('assignments');return;}
    if(n===practiceDetailBack){stop(event);showView(D.taskStatus(activePracticeTaskKey)==='history'?'assignment-history':'assignments');return;}
    const row=n.closest('[data-demo-paper]');
    if(row&&n.matches('[data-demo-paper-action]')){stop(event);if(n.dataset.demoPaperAction==='result')openReport(activePracticeTaskKey,row.dataset.demoPaper);else startPaper(activePracticeTaskKey,row.dataset.demoPaper);return;}
    if(n===historyButton||n.matches('[data-open-attempt-history]')){stop(event);openHistory();return;}
    if(n.matches('.demo-history-back')){stop(event);if(historyReturn){report=clone(historyReturn);context={taskId:report.taskId,paperId:report.paperId};resultFromHistory=historyOriginFromHistory;restoreAttempt(report.attempt);syncRoute('result',report.taskId,report.paperId,{attempt:resultFromHistory?report.attempt?.id:null,historical:resultFromHistory?'1':null});renderExerciseResult();showView('exercise-result');}else goToPaperList();return;}
    if(n.matches('[data-demo-attempt]')){stop(event);openReport(report.taskId,report.paperId,n.dataset.demoAttempt,true);return;}
    if(n===resultBack){stop(event);if(report?.training&&report.parentReport){const child=report;report=report.parentReport;training=null;session=null;activeLearningKey=null;context=report.taskId?{taskId:report.taskId,paperId:report.paperId}:null;resultFromHistory=Boolean(child.parentFromHistory);restoreAttempt(report.attempt);renderExerciseResult();showView('exercise-result');syncRoute('result',report.taskId,report.paperId,{attempt:resultFromHistory?report.attempt?.id:null,historical:resultFromHistory?'1':null});if(child.parentView==='question-analysis')openAnalysisAtQuestion(child.parentQuestion||activeQuestionSet[0]||1);}else if(report?.isBook){const back=report.returnView||'book-learning';session=null;training=null;context=null;report=null;showView(back);syncRoute(back);}else if(resultFromHistory){openHistory();}else goToPaperList();return;}
    if(n===retake){stop(event);if(report?.isBook){startExerciseSession({title:activeResultTitle,mode:report.originMode||'normal',returnView:report.returnView||'book-learning',questions:report.attempt.questions});}else if(report?.training){const previous=report;report=previous.parentReport||previous;resultFromHistory=Boolean(previous.parentFromHistory);startTraining(previous.trainingKind||'wrong',previous.attempt.questions);}else if(context)startPaper(context.taskId,context.paperId,{fresh:true});else startExerciseSession({title:activeResultTitle});return;}
    if(n===resultReviewButton&&report){stop(event);startTraining('wrong');return;}
    if(n===resultAnalysisButton&&report){stop(event);if(!report.attempt)return;openAnalysisAtQuestion(activeQuestionSet[0]||1);return;}
    if(n.matches('[data-result-jump]')&&report){stop(event);if(!report.attempt)return;openAnalysisAtQuestion(Number(n.dataset.resultJump));return;}
    if(n===analysisBack&&report){stop(event);pauseAnalysisAudio();renderExerciseResult();showView('exercise-result');return;}
    if(n===similarQuestionButton&&report){stop(event);startTraining('similar');return;}
    if(n===exerciseBack){stop(event);requestBack();return;}
    if(n.matches('.exercise-option')){stop(event);selectExerciseOption(n);return;}
    if(n.matches('.exercise-submit-button')){stop(event);return;}
    if(n===exerciseBottomNext){
      stop(event);if(session?.ended)return;
      if(n.dataset.action==='submit'){if(!n.disabled&&isLastQuestionPage())requestSubmit();return;}
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
    if(n===exerciseSettingsButton){stop(event);if(canOpenStudySettings()){openStudySettingsDrawer();applySettings();}return;}
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
  const captureStatus={id:null,prepared:false,errors:[]};
  function applyCaptureRecipe(){
    const id=new URLSearchParams(location.search).get('capture');if(!id)return;
    const recipe=window.StudentCapture?.get(id);captureStatus.id=id;
    if(!recipe){captureStatus.errors.push('Unknown capture id');return;}
    if(recipe.freezeClock)D.setClock({now:D.now(),running:false});
    for(const step of recipe.commands||[]){
      const outcome=command(step.name,step.payload||{});
      if(!outcome?.ok)captureStatus.errors.push(step.name+': '+(outcome?.message||'failed'));
    }
    captureStatus.prepared=captureStatus.errors.length===0;
  }
  function command(action,payload={}) {
    if(['publishAnswers','advanceTaskDeadline','nextUnlockDay'].includes(action)){
      const id=context?.taskId||activePracticeTaskKey||resolveTarget()?.taskId,t=D.getTask(id);
      if(!t)return {ok:false,message:'没有当前任务'};
      if(action==='publishAnswers')D.publishTask(id);
      else if(action==='advanceTaskDeadline')D.setClock({now:t.endAt+1,running:false});
      else {const times=t.papers.map(p=>D.getPaperUnlockAt(id,p.id)).filter(at=>at>D.now());if(!times.length)return {ok:false,message:'全部已解锁'};D.setClock({now:Math.min(...times)+1,running:false});}
      D.tickPolicies();return {ok:true,message:'已更新任务配置状态'};
    }
    if(action==='lastPage'||action==='questionPage'){
      if(!session||session.ended||isManagedExam()&&!session.checkDeadline)return {ok:false,message:'当前阶段不可自由切页'};
      const page=action==='lastPage'?getActiveQuestionSections().slice(-1)[0]:getQuestionPageForQuestion(Number(payload.question));
      if(!getActiveQuestionSections().includes(page))return {ok:false,message:'题目不属于本轮'};
      showQuestionSection(page);updateAnswerCardState();return {ok:true,message:'已定位作答材料'};
    }
    if(action==='advanceCheck'){
      if(!isManagedExam()||!session?.checkDeadline)return {ok:false,message:'当前不在考试检查阶段'};
      D.setClock({now:session.checkDeadline,running:false});tickCheck();return {ok:true,message:'已推进至检查截止并执行真实交卷校验'};
    }
    if(action==='analysis'){
      if(!report?.attempt||!reportReviewAllowed())return {ok:false,message:'当前不可查看解析'};
      openAnalysisAtQuestion(Number(payload.question)||1);return {ok:true,message:'已打开解析'};
    }

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
    if(action==='settings'){if(!canOpenStudySettings())return{ok:false,message:'学习设置仅在练习作答页显示'};openStudySettingsDrawer();applySettings();return{ok:true,message:'已打开学习设置'};}
    return {ok:false,message:'不支持的演示操作'};
  }
  function resolveTarget() {
    const params=new URLSearchParams(location.search); const c=D.getCase(params.get('case')||D.getState().caseId);
    const taskId=params.get('task')||c?.taskId||D.getState().tasks.find(t=>D.now()>=t.visibleAt)?.id||D.getState().tasks[0]?.id;
    const paperId=params.get('paper')||c?.paperId||D.getTask(taskId)?.papers[0]?.id;
    return taskId&&paperId?{taskId,paperId,case:c}:null;
  }
  renderBooks();
  window.StudentApp={openExpiredBook,renderBooks,openDemoBook,getCaptureStatus:()=>clone(captureStatus),command,openTask,startPaper,openReport,openHistory,openShowcaseDirectory,launchShowcaseScenario,getContext:()=>clone({context,report,session,training}),version:D.VERSION};
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
    const expired=blockedExpiredBook();if(expired){openExpiredBook(expired);return;}
    const shownOwner=context||report;
    const shownTaskId=['exercise','exercise-result','answer-history','question-analysis','practice-detail'].includes(currentView)?(currentView==='practice-detail'?activePracticeTaskKey:shownOwner?.taskId):null;
    const shownPaperId=currentView==='practice-detail'?null:shownOwner?.paperId;
    if(shownTaskId&&!itemIsVisible(shownTaskId,shownPaperId)){
      if(currentView==='exercise'&&session&&!session.ended)saveCurrent(true);
      pauseExerciseTimeline();session=null;training=null;report=null;context=null;activeLearningKey=null;historyReturn=null;
      modalLayer.hidden=true;closeShowcaseDirectory();showView('assignments');syncRoute('assignments',null,null);
    }
    renderTasks();
    if(currentView==='exercise-result'&&report){
      if(!report.training){const attempts=D.paperStatus(report.taskId,report.paperId).attempts;if(report.attempt)report.attempt=attempts.find(a=>a.id===report.attempt.id)||null;}
      renderExerciseResult();
    }
    if(currentView==='question-analysis'&&report&&!reportReviewAllowed()){renderExerciseResult();showView('exercise-result');}
    if(currentView==='practice-detail')openTask(activePracticeTaskKey);
    if(currentView==='answer-history'&&report)openHistory();
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
    if(!itemIsVisible(target.taskId,target.paperId)&&!['home','assignments','assignment-history','books','book-learning','expired-book','local-result','learning'].includes(entry)){showView('assignments');syncRoute('assignments',null,null);}
    else if(entry==='local-result'){
      const saved=D.getLearningDraft(params.get('resume')||'');
      if(saved?.report&&(!saved.report.taskId||itemIsVisible(saved.report.taskId,saved.report.paperId))){report=clone(saved.report);if(report.isBook&&D.isBookExpired(report.bookId)){openExpiredBook(report.bookId);return;}context=report.taskId?{taskId:report.taskId,paperId:report.paperId}:null;restoreAttempt(report.attempt);renderExerciseResult();showView('exercise-result');}
      else openTask(target.taskId);
    }
    else if(entry==='learning'){
      const saved=D.getLearningDraft(params.get('resume')||'');
      if(saved?.training?.source&&(!saved.training.source.taskId||itemIsVisible(saved.training.source.taskId,saved.training.source.paperId))){report=clone(saved.training.source);context=report.taskId?{taskId:report.taskId,paperId:report.paperId}:null;resultFromHistory=Boolean(saved.training.fromHistory);startTraining(saved.training.kind,saved.training.questions);}
      else if(saved?.session?.bookOptions)startExerciseSession(saved.session.bookOptions);
      else openTask(target.taskId);
    }
    else if(entry==='expired-book'){openExpiredBook(params.get('book'),params.get('record'));}
    else if(entry==='books'){renderBooks(params.get('category'));showView('books');}
    else if(entry==='book-learning'){openDemoBook(params.get('book')||D.getState().activeBookId);}
    else if(entry==='history'||entry==='answer-history'){openReport(target.taskId,target.paperId);openHistory();}
    else if(entry==='home'||entry==='assignments'||entry==='assignment-history'){if(['pending','makeup','completed'].includes(params.get('tab')))selectedTab=params.get('tab');renderTasks();showView(entry);}
    else if(entry==='result')openReport(target.taskId,target.paperId,params.get('attempt'),params.get('historical')==='1');
    else if(entry==='exercise')startPaper(target.taskId,target.paperId);
    else openTask(target.taskId);
    const action=target.case?.action;
    if(taskIsVisible(target.taskId)&&action&&action!=='missing'&&!params.has('entry'))setTimeout(()=>{command(action,target.case?.preset||{});applyCaptureRecipe();},150);
    else applyCaptureRecipe();
  }
})();
