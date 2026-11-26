(function () {
  'use strict';
  var data = window.STUDENT_APP_ONLINE_VERSIONS;
  var list = document.getElementById('version-list');
  var detail = document.getElementById('version-detail');
  var search = document.getElementById('version-search');
  var empty = document.getElementById('empty-state');
  var fallback = document.getElementById('copy-fallback');
  var copyValue = document.getElementById('copy-value');
  var messageTimer;
  if (!data || !Array.isArray(data.versions)) {
    detail.textContent = '版本索引加载失败，请刷新页面或重新打开本次发布入口。';
    document.getElementById('version-count').textContent = '索引未加载';
    return;
  }
  var versions = data.versions.slice().sort(function (a, b) {
    return String(b.generatedAt).localeCompare(String(a.generatedAt));
  });
  var selected = versions.find(function (v) { return v.id === location.hash.slice(1); }) || versions[0];
  document.getElementById('version-count').textContent = versions.length + ' 个在线版本入口';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function address(path) { return new URL(path, location.href).href; }
  function say(text) {
    var message = document.getElementById('copy-message');
    message.textContent = text;
    message.hidden = false;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(function () { message.hidden = true; }, 2800);
  }
  function copy(text) {
    fallback.hidden = true;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { say('已复制当前入口地址'); }, function () { manualCopy(text); });
    } else manualCopy(text);
  }
  function manualCopy(text) {
    copyValue.value = text;
    fallback.hidden = false;
    copyValue.focus();
    copyValue.select();
  }
  function link(text, path, primary) {
    var a = el('a', 'action' + (primary ? ' primary' : ''), text);
    a.href = address(path);
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }
  function copyButton(text, path) {
    var button = el('button', 'action', text);
    button.type = 'button';
    button.addEventListener('click', function () { copy(address(path)); });
    return button;
  }
  function meta(label, value) {
    var item = el('div', 'meta-item');
    item.append(el('dt', '', label), el('dd', '', value));
    return item;
  }
  function section(title) {
    var node = el('section', 'subsection');
    node.appendChild(el('h3', '', title));
    return node;
  }
  function renderList() {
    list.replaceChildren();
    var term = search.value.trim().toLowerCase();
    var filtered = versions.filter(function (v) {
      return [v.version, v.name, v.baseline, v.summary, JSON.stringify(v.updates)].join(' ').toLowerCase().indexOf(term) !== -1;
    });
    empty.hidden = filtered.length !== 0;
    filtered.forEach(function (v) {
      var button = el('button', 'version-item');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(selected && selected.id === v.id));
      var header = el('span', 'version-item-header');
      header.appendChild(el('span', 'version-number', v.version));
      if (v.id === versions[0].id) header.appendChild(el('span', 'latest', '最新'));
      button.append(header, el('span', 'version-item-title', v.name), el('span', 'version-item-time', v.generatedLabel));
      button.addEventListener('click', function () { select(v); });
      list.appendChild(button);
    });
  }
  function select(v) {
    selected = v;
    try { history.replaceState(null, '', '#' + v.id); } catch (error) { /* file previews may disallow history changes. */ }
    renderList();
    renderDetail();
  }
  function renderDetail() {
    detail.replaceChildren();
    if (!selected) {
      detail.appendChild(el('p', 'loading', '当前没有可用版本。'));
      return;
    }
    var v = selected;
    var top = el('div', 'detail-top');
    var title = el('div');
    title.append(el('p', 'detail-kicker', v.version + ' · 独立版本'), el('h2', '', v.name));
    title.lastElementChild.id = 'detail-title';
    top.append(title, el('span', 'acceptance', v.statusLabel || '浏览器待验收'));
    var metadata = el('dl', 'meta-list');
    metadata.append(meta('输出时间（北京时间）', v.generatedLabel), meta('实际基线', v.baseline), meta('版本位置', v.entry), meta('状态案例', v.caseSummary || (v.caseCount + ' 个 · 按案例保存记录')));
    var actions = el('div', 'actions');
    actions.append(link('打开学生 Demo', v.entry, true), link('打开任务工作台', v.workbench, false), copyButton('复制学生页链接', v.entry), copyButton('复制工作台链接', v.workbench));
    detail.append(top, metadata, el('p', 'summary', v.summary), actions);

    var changes = section('相对上一版的变化');
    var changesList = el('ul', 'changes');
    v.updates.forEach(function (change) {
      var li = el('li');
      var before = el('div', 'change-row');
      var after = el('div', 'change-row after');
      before.append(el('span', 'change-label', '之前'), el('span', '', change.before));
      after.append(el('span', 'change-label', '现在'), el('span', '', change.after));
      li.append(before, after);
      changesList.appendChild(li);
    });
    changes.appendChild(changesList);
    detail.appendChild(changes);

    var verification = section('验证范围');
    var checks = el('ul', 'check-list');
    v.verification.forEach(function (text) { checks.appendChild(el('li', '', text)); });
    verification.append(checks, el('p', 'check-note', '离线检查不等同于真实浏览器、音频输出或设备验收。'));
    detail.appendChild(verification);
    var sharing = section('当前学生页地址');
    sharing.appendChild(el('p', 'path-box', address(v.entry)));
    detail.appendChild(sharing);
  }
  search.addEventListener('input', renderList);
  document.getElementById('close-copy').addEventListener('click', function () { fallback.hidden = true; });
  window.addEventListener('hashchange', function () {
    var v = versions.find(function (item) { return item.id === location.hash.slice(1); });
    if (v) { selected = v; renderList(); renderDetail(); }
  });
  renderList();
  renderDetail();
}());
