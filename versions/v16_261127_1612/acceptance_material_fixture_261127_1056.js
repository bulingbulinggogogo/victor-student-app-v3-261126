/* Isolated paper presentation numbering.
 * The final-20 fixture reuses the complete, real material-8 question/audio/
 * analysis bundle (internal IDs 10/11/12) as paper-local numbers 6/7/8.
 * Internal IDs, selection keys, audio targets and grading never change.
 */
(function(global) {
  'use strict';
  const doc=global.document;
  if(!doc)return;
  const all=(selector,root=doc)=>Array.from(root.querySelectorAll(selector));
  const one=(selector,root=doc)=>root.querySelector(selector);
  const sourceNumbers=new Map();
  const cueText=new Map();
  let mapping=Object.create(null),paperId=null;
  all('.exercise-question-index').forEach(index=>{
    const source=Number(index.dataset.questionNumber)||Number(index.textContent.trim())||0;
    if(source){sourceNumbers.set(index,source);index.dataset.questionNumber=String(source);}
  });
  all('.exercise-material-cue').forEach(cue=>cueText.set(cue,cue.textContent));

  function number(value) {
    const source=Number(value);
    return Object.prototype.hasOwnProperty.call(mapping,source)?mapping[source]:source;
  }
  function normalize(value) {
    const result=Object.create(null),used=new Set();
    for(const [key,display] of Object.entries(value||{})) {
      const source=Number(key),target=Number(display);
      if(!Number.isInteger(source)||source<1||!Number.isInteger(target)||target<1||used.has(target))throw new Error('Invalid paper presentation numbering');
      result[source]=target;used.add(target);
    }
    return result;
  }
  function activatePaper(paper) {
    const wasMapped=Object.keys(mapping).length>0;
    mapping=normalize(paper?.presentationNumbers);
    paperId=paper?.id||null;
    if(wasMapped&&!Object.keys(mapping).length)for(const [cue,original] of cueText)cue.textContent=original;
    return Object.assign({},mapping);
  }
  function setLabel(node,source,childSelector) {
    if(!Number.isFinite(source)||source<1)return;
    const display=number(source),index=childSelector?one(childSelector,node):node;
    if(index)index.textContent=String(display);
    // A fresh, unrendered answer button initially contains only its number.
    else if(!node.children.length)node.textContent=String(display);
    node.dataset.presentationNumber=String(display);
    const label=node.getAttribute('aria-label');
    if(label)node.setAttribute('aria-label',label.replace(/第\s*\d+\s*题/,'第 '+display+' 题'));
  }
  function refresh({questions=[],training=false,analysisQuestion=null}={}) {
    const active=new Set(questions.map(Number));
    for(const [index,source] of sourceNumbers) {
      // Native functions read this ID, even when text is paper-local.
      index.dataset.questionNumber=String(source);
      setLabel(index,source);
      index.setAttribute('aria-label','播放第 '+number(source)+' 题音频');
    }
    all('[data-answer-jump]').forEach(button=>setLabel(button,Number(button.dataset.answerJump),'.exercise-answer-index'));
    all('[data-result-jump]').forEach(button=>setLabel(button,Number(button.dataset.resultJump),'.result-answer-index'));
    all('[data-analysis-question]').forEach(button=>{
      const source=Number(button.dataset.analysisQuestion);
      setLabel(button,source);button.setAttribute('aria-label','查看第 '+number(source)+' 题解析');
    });
    const current=Number(analysisQuestion)||Number(one('[data-analysis-question].active')?.dataset.analysisQuestion);
    const prefix=one('.analysis-question-title-en > span');
    if(prefix&&Number.isFinite(current)&&current>0)prefix.textContent=number(current)+'. ';
    all('[data-similar-question]').forEach(button=>{
      const source=Number(button.dataset.similarQuestion);
      if(Object.prototype.hasOwnProperty.call(mapping,source)) {
        setLabel(button,source);button.setAttribute('aria-label','切换到第 '+number(source)+' 题');
      }
    });
    const enabled=Object.keys(mapping).length>0;
    for(const [cue,original] of cueText) {
      if(!enabled)continue;
      const card=cue.closest('.exercise-question-card');
      if(!card)continue;
      const sources=all('.exercise-question-index',card).map(index=>Number(index.dataset.questionNumber));
      if(!sources.some(source=>Object.prototype.hasOwnProperty.call(mapping,source)))continue;
      const shown=sources.filter(source=>active.has(source));
      // Scope comes from the active round; a correct question is omitted in
      // consolidation, together with its number in the material cue.
      cue.textContent=shown.length?original.replace(/回答第[\s\S]*?题[。．]?/,'回答第 '+shown.map(number).join('、')+' 题。'):original;
    }
    return {paperId,mapping:Object.assign({},mapping),activeQuestions:questions.slice(),displayQuestions:questions.map(number),training:Boolean(training)};
  }
  global.StudentPaperPresentation={activatePaper,refresh,number,getMapping:()=>Object.assign({},mapping)};
})(typeof window!=='undefined'?window:globalThis);

