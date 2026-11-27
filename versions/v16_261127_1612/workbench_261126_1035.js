/* External demonstration workbench. Student product UI remains in index.html. */
(function () {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const escapeHTML = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const model = window.StudentDemo;
  const form = $("#task-form");
  const taskSelect = $("#task-select");
  const paperSelect = $("#paper-select");
  const windows = new Map();
  const requests = new Map();
  const fileMode = location.protocol === "file:";
  if ($("#file-mode-note")) $("#file-mode-note").hidden = !fileMode;
  const statusNames = {pending:"待完成",makeup:"待补交",completed:"已完成",history:"历史练习"};
  let activeTaskId = "";
  let activePaperId = "";
  let activeCaseId = "personal";
  let formDirty = false;
  let lastConfigSignature = "";
  let toastTimer;
  let requestCounter = 0;
  let listSignature = "";

  function setStatus(element, text, type) {
    element.textContent = text;
    element.classList.remove("error", "success");
    if (type) element.classList.add(type);
  }
  function toast(text) {
    $("#toast").textContent = text;
    $("#toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("#toast").hidden = true; }, 4200);
  }
  function timestamp(value) {
    if (typeof value === "number") return value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  function dateInput(value) {
    const ms = timestamp(value);
    if (!Number.isFinite(ms)) return "";
    return new Date(ms + 8 * 3600000).toISOString().slice(0,16);
  }
  function parseInput(value) {
    if (!value) return NaN;
    return Date.parse(value + ":00+08:00");
  }
  function formatDate(value) {
    const ms = timestamp(value);
    if (!Number.isFinite(ms)) return "--";
    return new Intl.DateTimeFormat("zh-CN", {timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(ms);
  }
  function caseData(id) { return (model.cases || []).find((item) => item.id === id); }
  function currentTask() { return model.getTask(activeTaskId); }
  function currentPaper() { return model.getPaper(activeTaskId, activePaperId); }
  function taskConfigSignature(task) {
    return JSON.stringify([task.id,task.mode,task.passRate,task.visibleAt,task.startAt,task.endAt,task.allowLate,task.published,task.randomOptions,task.planDays,task.unlockMode,task.publishPolicy]);
  }
  function percent(value) {
    if (!Number.isFinite(Number(value))) return "--";
    const number = Number(value);
    return Math.round(number) + "%";
  }
  function attemptAccuracy(attempt) {
    if (!attempt) return null;
    if (attempt.accuracy != null) return Number(attempt.accuracy);
    if (attempt.rate != null) return Number(attempt.rate);
    if (attempt.percentage != null) return Number(attempt.percentage);
    const total = attempt.total || attempt.questionCount || (Array.isArray(attempt.questions) ? attempt.questions.length : 0);
    return total ? Number(attempt.correctCount == null ? attempt.correct : attempt.correctCount) / total * 100 : null;
  }
  function productUrl(options) {
    const opts = options || {};
    const url = new URL("index.html", location.href);
    if (activeCaseId !== "personal") url.searchParams.set("case", activeCaseId);
    if (opts.taskId || activeTaskId) url.searchParams.set("task", opts.taskId || activeTaskId);
    if (opts.paperId || activePaperId) url.searchParams.set("paper", opts.paperId || activePaperId);
    if (opts.entry) url.searchParams.set("entry", opts.entry);
    return url;
  }
  function managementUrl(path){
    const url=new URL(path,location.href);
    if(activeCaseId==='personal')url.searchParams.delete('case');else url.searchParams.set('case',activeCaseId);
    if(activeTaskId)url.searchParams.set('task',activeTaskId);
    if(activePaperId)url.searchParams.set('paper',activePaperId);
    return url.href;
  }
  function currentWindow() {
    const target = windows.get(activeCaseId);
    return target && !target.handle.closed && target.taskId === activeTaskId && target.paperId === activePaperId ? target : null;
  }
  function openStudent(options) {
    const opts = options || {};
    if (opts.taskId) activeTaskId = opts.taskId;
    if (opts.paperId) activePaperId = opts.paperId;
    const url = productUrl(opts);
    const name = "victor_student_v16_261127_1612_" + activeCaseId.replace(/[^a-zA-Z0-9_-]/g,"_") + "_" + activePaperId.replace(/[^a-zA-Z0-9_-]/g,"_");
    const handle = window.open(url.href, name);
    if (!handle) {
      setStatus($("#tool-status"), fileMode ? "浏览器未打开新页面。请允许此本地页面打开学生演示页后重试。" : "浏览器未打开新页面。请允许当前网站弹出学生演示页后重试。", "error");
      toast("请允许打开学生页面后再试。");
      return;
    }
    windows.set(activeCaseId, {handle,taskId:activeTaskId,paperId:activePaperId});
    setStatus($("#tool-status"), "已打开学生页面。请进入作答后使用对应辅助操作。", "success");
    renderConnection();
  }

  function applyTeacherTimePreset(name){
    const current=model.now(),day=Math.floor((current+8*3600000)/86400000)*86400000-8*3600000;
    if(name==='start-now')form.elements.startAt.value=dateInput(current);
    else if(name==='visible-now')form.elements.visibleAt.value=dateInput(current);
    else if(name==='visible-start')form.elements.visibleAt.value=form.elements.startAt.value;
    else {const days={ 'end-today':1,'end-tomorrow':2,'end-after':3,'end-week':8 }[name];if(!days)return;form.elements.endAt.value=dateInput(day+days*86400000-60000);}
    formDirty=true;setStatus($("#config-status"),"已填写快捷时间，保存任务配置后生效。");
  }

  function renderConnection() {
    const connected = !!currentWindow();
    const task = currentTask();
    $("#connection-dot").classList.toggle("connected", connected);
    $("#connection-status").textContent = connected ? "已打开当前套题的学生页面" : "先打开当前套题的学生页面";
    document.querySelectorAll("[data-command]").forEach((button) => {
      const examOnly = button.dataset.command === "check" || button.dataset.command === "autoSoon";
      button.disabled = !connected || (examOnly && task?.mode !== "exam");
      button.title = examOnly && task?.mode !== "exam" ? "此操作仅适用于考试模式" : (!connected ? "请先打开当前套题的学生页面" : "");
    });
  }
  function renderCaseList(force) {
    const filter = $("#case-search").value.trim().toLowerCase();
    const category = $("#case-category").value;
    const list = (model.cases || []).filter((item) => (!category || String(item.category || "其他") === category) && (!filter || [item.id,item.displayCode,item.title,item.description,item.expected,item.category].join(" ").toLowerCase().includes(filter)));
    const signature = [activeCaseId, filter,category,list.map((item) => item.id).join(",")].join("|");
    if (!force && signature === listSignature) return;
    listSignature = signature;
    $("#case-count").textContent = String(list.length);
    $("#case-list").innerHTML = list.length ? list.map((item) => `<article class="case-card${item.id === activeCaseId ? " selected" : ""}"><button class="case-pick" type="button" data-case-select="${escapeHTML(item.id)}" aria-pressed="${item.id === activeCaseId}"><span class="case-meta"><strong>${escapeHTML(item.displayCode||item.id)}</strong><span>${escapeHTML(item.category || "其他")}</span></span><span class="case-name">${escapeHTML(item.title)}</span></button><button class="case-open" type="button" data-case-open="${escapeHTML(item.id)}" aria-label="打开案例 ${escapeHTML(item.title)}">打开</button></article>`).join("") : '<p class="empty-cases">没有匹配的案例</p>';
    $("#personal-session").classList.toggle("active", activeCaseId === "personal");
  }
  function renderCaseBanner() {
    const item = caseData(activeCaseId);
    $("#session-label").textContent = item ? "独立状态案例" : "个人演示空间";
    $("#case-id-label").textContent = activeCaseId;
    $("#case-title").textContent = item?.title || "个人演示";
    $("#case-description").textContent = item?.description || "在这里调整任务配置，再打开学生页面体验。个人空间与预设案例分别保留记录。";
    $("#case-expected").textContent = item?.expected || "页面状态由任务配置及成功交卷记录共同决定。";
    $("#reset-case").disabled = !item;
  }
  function loadTaskForm() {
    const task = currentTask();
    if (!task) return;
    ["mode","passRate","planDays","unlockMode","publishPolicy"].forEach((name) => { form.elements[name].value = task[name]; });
    ["visibleAt","startAt","endAt"].forEach((name) => { form.elements[name].value = dateInput(task[name]); });
    ["allowLate","published","randomOptions"].forEach((name) => { form.elements[name].checked = !!task[name]; });
    form.elements.published.disabled=task.publishPolicy!=="manual";
    $("#daily-paper-count").textContent=String(model.dailyCount(task));
    formDirty = false;
    lastConfigSignature = taskConfigSignature(task);
    setStatus($("#config-status"), "已载入任务配置，修改后点击保存。");
  }
  function renderObjects(forceForm) {
    const state = model.getState();
    const tasks = state.tasks || [];
    if (!tasks.some((task) => task.id === activeTaskId)) activeTaskId = tasks[0]?.id || "";
    const oldTaskOptions = Array.from(taskSelect.options).map((item) => item.value + ":" + item.textContent).join("|");
    const newTaskOptions = tasks.map((task) => task.id + ":" + model.getTaskLabel(task.id)).join("|");
    if (oldTaskOptions !== newTaskOptions) taskSelect.innerHTML = tasks.map((task) => `<option value="${escapeHTML(task.id)}">${escapeHTML(model.getTaskLabel(task.id)||task.title)}</option>`).join("");
    taskSelect.value = activeTaskId;
    const task = currentTask();
    if (!task) return;
    const papers = task.papers || [];
    if (!papers.some((paper) => paper.id === activePaperId)) activePaperId = papers[0]?.id || "";
    const paperSignature = papers.map((paper) => paper.id + ":" + model.getPaperLabel(activeTaskId,paper.id)).join("|");
    if (paperSelect.dataset.signature !== paperSignature) {
      paperSelect.innerHTML = papers.map((paper) => `<option value="${escapeHTML(paper.id)}">${escapeHTML(model.getPaperLabel(activeTaskId,paper.id)||paper.title)}</option>`).join("");
      paperSelect.dataset.signature = paperSignature;
    }
    paperSelect.value = activePaperId;
    document.querySelectorAll('[data-control-peer]').forEach(link=>{link.href=managementUrl(link.dataset.controlPeer);});
    if (forceForm || (!formDirty && taskConfigSignature(task) !== lastConfigSignature)) loadTaskForm();
    const count = currentPaper()?.questions?.length || 20;
    $("#correct-count").max = String(count);
    $("#blank-count").max = String(count);
    $("#answer-preset-help").textContent = `当前套题 ${count} 题。仅预填本轮答案，仍需在学生页面提交。`;
  }
  function renderSummary() {
    const task = currentTask();
    if (!task) return;
    $("#publish-answers").disabled=!!task.published;$("#publish-answers").textContent=task.published?"答案已公布":"公布答案";
    $("#publication-policy-hint").textContent=task.publishPolicy==="afterDeadline"?"截止时间到达时自动公布":"教师手动控制公布；点击按钮立即公布当前任务";
    const stats = model.getTaskStats(activeTaskId);
    $("#stat-status").textContent = statusNames[model.taskStatus(activeTaskId)] || "--";
    $("#stat-completed").textContent = `${stats.completed || 0} / ${stats.total || task.papers.length}`;
    $("#stat-accuracy").textContent = stats.accuracy == null ? "--" : percent(stats.accuracy);
    $("#stat-published").textContent = task.published ? "已公布" : "未公布";
    $("#paper-table").innerHTML = task.papers.map((paper) => {
      const status = model.paperStatus(activeTaskId, paper.id);
      const attempts = status.attempts || model.getState().attempts[paper.id] || [];
      const rate = attemptAccuracy(status.latest);
      let permission = status.canStart ? "可作答" : "不可作答";
      if (!status.visible) permission = "尚不可见";
      else if (!status.started) permission = "尚未开始";
      else if (status.expired && status.canStart) permission = "可补交";
      const canReview = status.canReview ? " · 可看解析" : "";
      return `<tr><td>${escapeHTML(model.getPaperLabel(activeTaskId,paper.id)||paper.title)}</td><td>${attempts.length} 次</td><td><span class="pill${status.everPassed ? " good" : ""}">${status.everPassed ? "曾经达标" : "未达标"}</span></td><td>${rate == null ? "--" : escapeHTML(percent(rate))}</td><td>${escapeHTML(permission + canReview)}</td><td><button class="button" type="button" data-paper-open="${escapeHTML(paper.id)}" data-entry="detail">试题列表</button><button class="button" type="button" data-paper-open="${escapeHTML(paper.id)}" data-entry="result">成绩单</button></td></tr>`;
    }).join("");
    renderConnection();
  }
  function renderClock() {
    $("#clock-now").textContent = formatDate(model.now());
    const clock = model.getState().clock || {};
    $("#clock-mode").textContent = clock.running === false ? "固定时刻" : "持续计时";
  }
  function renderAll(forceForm) {
    activeCaseId = model.getState().caseId || activeCaseId;
    renderCaseBanner();
    renderCaseList();
    renderObjects(forceForm);
    renderSummary();
    renderClock();
  }
  function chooseCase(id) {
    const item = caseData(id);
    model.selectCase(id);
    activeCaseId = id;
    activeTaskId = item?.taskId || "";
    activePaperId = item?.paperId || "";
    formDirty = false;
    lastConfigSignature = "";
    const url = new URL(location.href);
    if (id === "personal") url.searchParams.delete("case");
    else url.searchParams.set("case", id);
    try { history.replaceState(null, "", url.href); } catch (_) {}
    renderAll(true);
    $("#clock-input").value = dateInput(model.now());
    setStatus($("#tool-status"), "已切换演示空间。打开当前套题后可使用辅助工具。");
  }
  function sendCommand(command) {
    const target = currentWindow();
    if (!target) { toast("请先打开当前套题的学生页面。"); renderConnection(); return; }
    const payload = {};
    if (command === "fill") {
      const count = currentPaper()?.questions?.length || 20;
      payload.correctCount = Number($("#correct-count").value);
      payload.blankCount = Number($("#blank-count").value);
      if (!Number.isInteger(payload.correctCount) || !Number.isInteger(payload.blankCount) || payload.correctCount < 0 || payload.blankCount < 0 || payload.correctCount + payload.blankCount > count) {
        setStatus($("#tool-status"), `答对题数与空题数量须为非负整数，合计不超过 ${count}。`, "error");
        return;
      }
    }
    if (command === "autoSoon") payload.seconds = 3;
    const requestId = "workbench-" + Date.now() + "-" + (++requestCounter);
    const timeout = setTimeout(() => {
      if (!requests.has(requestId)) return;
      requests.delete(requestId);
      setStatus($("#tool-status"), "学生页面尚未回传结果。请确认页面已加载完成并处于相应流程，再重试。", "error");
    }, 6500);
    requests.set(requestId, {target:target.handle,timeout});
    target.handle.postMessage({type:"student-demo-command",command,payload,requestId}, fileMode ? "*" : location.origin);
    setStatus($("#tool-status"), "正在等待学生页面执行并回传结果……");
  }
  async function copyUrl() {
    const value = productUrl().href;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      toast("已复制当前学生页面链接。");
    } catch (_) {
      $("#copy-fallback").hidden = false;
      $("#copy-value").value = value;
      $("#copy-value").focus();
      $("#copy-value").select();
    }
  }

  if (!model) {
    $("#fatal-error").hidden = false;
    $("#fatal-error").textContent = fileMode ? "状态模块没有加载完成。请从版本中心启动本地服务，再打开此工作台；确认本版 state_261126_1035.js 文件完整。" : "状态模块没有加载完成。请重新打开当前版本的工作台；若仍无法加载，请检查网络连接并联系演示维护者。";
    form.querySelectorAll("input,select,button").forEach((element) => { element.disabled = true; });
    return;
  }

  const categories = [...new Set((model.cases || []).map((item) => item.category || "其他"))];
  $("#case-category").innerHTML += categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("");
  activeCaseId = model.getState().caseId || "personal";
  const initialCase = caseData(activeCaseId);
  const initialParams=new URL(location.href).searchParams;
  activeTaskId = initialParams.get("task") || initialCase?.taskId || "";
  activePaperId = initialParams.get("paper") || initialCase?.paperId || "";
  renderAll(true);
  $("#clock-input").value = dateInput(model.now());

  $("#case-search").addEventListener("input", () => renderCaseList());
  $("#case-category").addEventListener("change", () => renderCaseList());
  $("#personal-session").addEventListener("click", () => { chooseCase("personal"); });
  $("#case-list").addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-case-select]");
    const openButton = event.target.closest("[data-case-open]");
    if (selectButton) chooseCase(selectButton.dataset.caseSelect);
    if (openButton) {
      const id = openButton.dataset.caseOpen;
      chooseCase(id);
      openStudent();
    }
  });
  document.querySelectorAll("[data-open-student]").forEach((button) => { button.addEventListener("click", () => openStudent()); });
  taskSelect.addEventListener("change", () => {
    activeTaskId = taskSelect.value;
    activePaperId = "";
    formDirty = false;
    renderAll(true);
  });
  paperSelect.addEventListener("change", () => {
    activePaperId = paperSelect.value;
    renderObjects(false);
    renderConnection();
  });
  $("#paper-table").addEventListener("click", (event) => {
    const button = event.target.closest("[data-paper-open]");
    if (!button) return;
    activePaperId = button.dataset.paperOpen;
    paperSelect.value = activePaperId;
    document.querySelectorAll('[data-control-peer]').forEach(link=>{link.href=managementUrl(link.dataset.controlPeer);});
    openStudent({entry:button.dataset.entry});
  });
  form.addEventListener("input", () => {
    $("#daily-paper-count").textContent=String(Math.ceil((currentTask()?.papers.length||1)/Math.max(1,Number(form.elements.planDays.value)||1)));
    form.elements.published.disabled=form.elements.publishPolicy.value!=="manual";
    formDirty = true;
    setStatus($("#config-status"), "当前表单有未保存的修改。");
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const patch = {
      mode:form.elements.mode.value,
      passRate:Number(form.elements.passRate.value),
      visibleAt:parseInput(form.elements.visibleAt.value),
      startAt:parseInput(form.elements.startAt.value),
      endAt:parseInput(form.elements.endAt.value),
      allowLate:form.elements.allowLate.checked,
      published:form.elements.published.checked,
      randomOptions:form.elements.randomOptions.checked,
      planDays:Number(form.elements.planDays.value),unlockMode:form.elements.unlockMode.value,publishPolicy:form.elements.publishPolicy.value
    };
    if (![patch.visibleAt,patch.startAt,patch.endAt].every(Number.isFinite) || patch.startAt >= patch.endAt) {
      setStatus($("#config-status"), "请填写有效日期，截止时间应晚于开始时间。", "error");
      return;
    }
    try {
      model.updateTask(activeTaskId, patch);
      formDirty = false;
      renderAll(true);
      setStatus($("#config-status"), fileMode ? "已保存在当前工作台。完整跨页面联动请使用双击启动后的HTTP入口。" : "已保存任务配置，同任务套题均使用此配置。已打开的同案例学生页面会读取当前状态。", "success");
      $("#save-indicator").textContent = "最近保存 " + formatDate(Date.now());
      toast("任务配置已保存。");
    } catch (error) { setStatus($("#config-status"), error.message || "保存失败，请重试。", "error"); }
  });
  $("#publish-answers").addEventListener("click",()=>{model.publishTask(activeTaskId);formDirty=false;renderAll(true);setStatus($("#config-status"),"当前任务答案已公布，已打开学生页面按当前状态刷新。","success");});
  document.querySelectorAll("[data-time-preset]").forEach(button=>button.addEventListener("click",()=>applyTeacherTimePreset(button.dataset.timePreset)));
  $("#reload-config").addEventListener("click", () => loadTaskForm());
  $("#reset-case").addEventListener("click", () => {
    if (activeCaseId === "personal" || !caseData(activeCaseId)) return;
    model.resetCase(activeCaseId);
    const item = caseData(activeCaseId);
    activeTaskId = item.taskId;
    activePaperId = item.paperId;
    formDirty = false;
    renderAll(true);
    $("#clock-input").value = dateInput(model.now());
    toast("已恢复当前案例的初始状态，其他空间保持原样。");
    const target = currentWindow();
    if (target) {
      target.handle.location.href = productUrl().href;
      setStatus($("#tool-status"), "当前案例已恢复，学生页面重新打开初始状态。", "success");
    }
  });
  $("#set-clock").addEventListener("click", () => {
    const value = parseInput($("#clock-input").value);
    if (!Number.isFinite(value)) { toast("请填写有效的模拟当前时间。"); return; }
    model.setClock({now:value,running:true});
    renderAll(false);
    toast("模拟时间已应用，并继续计时。");
  });
  $("#real-clock").addEventListener("click", () => {
    model.setClock({now:Date.now(),running:true});
    $("#clock-input").value = dateInput(model.now());
    renderAll(false);
    toast("已回到真实时间。");
  });
  document.querySelectorAll("[data-command]").forEach((button) => { button.addEventListener("click", () => sendCommand(button.dataset.command)); });
  $("#copy-case-link").addEventListener("click", copyUrl);
  $("#close-copy").addEventListener("click", () => { $("#copy-fallback").hidden = true; });
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.type !== "student-demo-command-result" || !requests.has(data.requestId)) return;
    const request = requests.get(data.requestId);
    if (event.source !== request.target) return;
    if (fileMode ? event.origin !== "null" : !/^https?:$/.test(location.protocol) || event.origin !== location.origin) return;
    clearTimeout(request.timeout);
    requests.delete(data.requestId);
    setStatus($("#tool-status"), data.message || (data.ok ? "学生页面已完成操作。" : "当前页面不能执行此操作。"), data.ok ? "success" : "error");
    renderSummary();
  });
  model.subscribe(() => {
    try { renderAll(false); } catch (error) { setStatus($("#config-status"), "状态更新未完成：" + error.message, "error"); }
  });
  setInterval(() => { renderClock(); renderConnection(); }, 1000);
  setInterval(() => { renderSummary(); }, 5000);

  function renderCaptureCatalog(){
    const catalog=window.StudentCapture;if(!catalog)return;
    const filter=$("#capture-search").value.trim().toLowerCase(),group=$("#capture-group").value,kind=$("#capture-kind").value;
    const rows=catalog.recipes.filter(r=>(!group||r.group===group)&&(!kind||r.kind===kind)&&(!filter||[r.id,r.title,r.group,...r.expected,...r.coverage].join(" ").toLowerCase().includes(filter)));
    $("#capture-count").textContent=rows.length+" 个截图入口 · 普通打开不重置数据";
    $("#capture-list").innerHTML=rows.map(r=>`<article class="capture-card"><strong>${escapeHTML(r.id)}</strong><h3>${escapeHTML(r.title)}</h3><span class="capture-meta">${r.kind==='process'?'过程场景':'稳定页面'} · ${escapeHTML(r.group)}</span><div><a href="${escapeHTML(r.url)}" target="_blank" rel="noopener" data-capture-open="${escapeHTML(r.id)}">打开定位</a><button type="button" data-capture-reset="${escapeHTML(r.id)}">${r.resetTaskCaseIds?.length?'复位本版总览并打开':'复位此案例并打开'}</button></div><details><summary>截图检查与操作</summary><p>${r.expected.map(escapeHTML).join('；')}</p><p>${r.steps.map(escapeHTML).join('；')||'定位完成后检查页面并截图。'}</p></details></article>`).join("");
  }
  function openCapture(id,reset){
    const recipe=window.StudentCapture?.get(id);if(!recipe)return;
    if(reset)window.StudentCapture.restore(id);
    chooseCase(recipe.params.case||'personal');
    const meta=caseData(activeCaseId);
    activeTaskId=recipe.params.task||meta?.taskId||model.getState().tasks[0]?.id||'';
    activePaperId=recipe.params.paper||meta?.paperId||currentTask()?.papers[0]?.id||'';
    renderObjects(true);
    const handle=window.open(new URL(recipe.url,location.href).href,'victor_capture_'+model.VERSION.replace(/[^a-zA-Z0-9_-]/g,'_')+'_'+id.replace(/[^a-zA-Z0-9_-]/g,'_'));
    if(!handle){toast('请允许工作台打开学生页面。');return;}
    windows.set(activeCaseId,{handle,taskId:activeTaskId,paperId:activePaperId});renderConnection();
    setStatus($("#tool-status"),"已打开 "+id+"。定位页冻结业务时钟；播放、后台和原生手势仍需按清单操作。","success");
  }
  if(window.StudentCapture){
    const names=[...new Set(window.StudentCapture.recipes.map(r=>r.group))].sort();
    $("#capture-group").innerHTML='<option value="">全部截图分组</option>'+names.map(n=>'<option value="'+escapeHTML(n)+'">'+escapeHTML(n)+'</option>').join('');
    $("#capture-group").value="00 最终稿验收20情景";
    $("#capture-search").addEventListener('input',()=>{$("#capture-group").value="";renderCaptureCatalog();});
    $("#capture-kind").addEventListener('change',renderCaptureCatalog);
    $("#capture-group").addEventListener('change',renderCaptureCatalog);
    $("#capture-list").addEventListener('click',event=>{
      const button=event.target.closest('[data-capture-open],[data-capture-reset]');if(!button)return;
      event.preventDefault();openCapture(button.dataset.captureOpen||button.dataset.captureReset,Boolean(button.dataset.captureReset));
    });
    $("#freeze-clock").addEventListener('click',()=>{model.setClock({now:model.now(),running:false});toast('已冻结业务时间；流程测试前请恢复流动时间。');});
    renderCaptureCatalog();
  }
})();
