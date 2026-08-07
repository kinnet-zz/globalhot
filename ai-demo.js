(function () {
  'use strict';

  // GlobalHot AI 데모 엔진 (Mock)
  // ---------------------------------------------------------------
  // 아직 실측 Gradio/HF Space 연동 전이므로, 엔드포인트와 같은 계약
  // (request -> progress stream -> result)을 갖춘 데모 구현으로 페이지
  // 구조·인터랙션·광고 슬롯을 먼저 검증한다. 실모델 도입 시 아래
  // DEMO_MODELS 정의만 실제 호출로 교체하면 UI는 그대로 재사용된다.
  //
  // 공개 인터페이스: window.globalhotAI
  //   models()            -> 서비스 가능 모델 목록
  //   run(modelId, input) -> Promise<result> (progress 콜백 포함)
  //   bind(container)     -> [data-ai-*] 마크업과 상호작용 연결

  var DEMO_MODELS = [
    {
      id: 'image-vision',
      name: 'Image Vision',
      label: '이미지 생성',
      kind: 'image',
      placeholder: '키워드를 입력하세요. 예) neon city, rainy street, pastel',
      unit: '한 장 생성',
    },
    {
      id: 'text-summary',
      name: 'Text Summary',
      label: '텍스트 요약',
      kind: 'text',
      placeholder: '요약할 문장을 붙여넣으세요.',
      unit: '한 번 요약',
    },
    {
      id: 'idea-spark',
      name: 'Idea Spark',
      label: '아이디어 스파크',
      kind: 'text',
      placeholder: '주제를 입력하세요. 예: 여름 한정 LINE 스탬프',
      unit: '세 가지 제안',
    },
  ];

  function tagToHash(seed) {
    var h = 0;
    var s = String(seed || 'demo');
    for (var i = 0; i < s.length; i += 1) h = ((h << 5) - h) + s.charCodeAt(i);
    return Math.abs(h);
  }

  function buildImageBody(input) {
    var tags = String(input || '').trim().split(/[^a-z0-9가-힣]+/).filter(Boolean);
    var head = tags[0] || 'ai';
    var hue = (tagToHash(head) * 137.508) % 360;
    var gradient = 'linear-gradient(135deg, hsl(' + hue.toFixed(0) + ' 65% 18%), hsl(' + ((hue + 45) % 360).toFixed(0) + ' 72% 48%))';
    return {
      kind: 'image',
      title: tags.join(' · ') || 'GlobalHot AI',
      gradient: gradient,
      monogram: head.slice(0, 2).toUpperCase(),
      note: '이미지는 데모 미리보기입니다. 실제 모델 연동 시 생성 결과가 표시됩니다.',
    };
  }

  function buildSummaryBody(input) {
    var head = String(input || '').trim().slice(0, 90) || '입력 원문이 비어 있습니다.';
    return {
      kind: 'text',
      text: head + '… (요약) 핵심 주제를 중심으로 중요 내용을 간결하게 정리했습니다. 실제 모델 연동 시 전체 원문이 처리됩니다.',
    };
  }

  function buildSparkBody(input) {
    var subject = String(input || '').trim() || '새로운 주제';
    return {
      kind: 'list',
      items: [
        subject + '의 핵심을 담은 짧고 임팩트 있는 캐치프레이즈 아이디어',
        '소셜 미디어용 30초 숏폼 컨셉과 후킹 문구',
        '이번 시즌에 어울리는 컬러·컨셉 조합과 활용 예시',
      ],
    };
  }

  // 스트리밍풍 진행 콜백을 재현. 실제 네트워크 지연 없이 프론트 단계별
  // "xx%" 진행 표시가 돌아가 UI 상태 검증에 쓰인다.
  function simulateProgress(onProgress) {
    var steps = [8, 16, 27, 40, 55, 72, 88, 100];
    var i = 0;
    return new Promise(function (resolve) {
      (function tick() {
        if (i >= steps.length) return resolve();
        onProgress(steps[i]);
        i += 1;
        setTimeout(tick, 160);
      })();
    });
  }

  function findModel(modelId) {
    for (var i = 0; i < DEMO_MODELS.length; i += 1) {
      if (DEMO_MODELS[i].id === modelId) return DEMO_MODELS[i];
    }
    return null;
  }

  function run(modelId, input, onProgress) {
    return new Promise(function (resolve, reject) {
      var model = findModel(modelId);
      if (!model) return reject(new Error('unknown_model'));
      var cb = typeof onProgress === 'function' ? onProgress : function () {};
      cb(4);
      setTimeout(function () {
        simulateProgress(cb).then(function () {
          cb(100);
          setTimeout(function () { resolve(buildResult(model, input)); }, 80);
        });
      }, 120);
    });
  }

  function buildResult(model, input) {
    var body = null;
    if (model.kind === 'image') body = buildImageBody(input);
    else if (model.id === 'idea-spark') body = buildSparkBody(input);
    else body = buildSummaryBody(input);
    return { model: model.id, label: model.label, input: String(input || ''), body: body, demo: true };
  }

  function models() { return DEMO_MODELS.slice(); }

  function bind(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    var runButtons = container.querySelectorAll('[data-ai-run]');
    Array.prototype.forEach.call(runButtons, function (button) {
      button.addEventListener('click', function () {
        var box = button.closest('[data-ai-box]');
        if (!box) return;
        var inputEl = box.querySelector('[data-ai-input]');
        var resultEl = box.querySelector('[data-ai-result]');
        var progressEl = box.querySelector('[data-ai-progress]');
        var modelId = box.getAttribute('data-ai-model') || 'image-vision';
        var input = inputEl && inputEl.value ? inputEl.value : '';
        button.disabled = true;
        if (resultEl) resultEl.hidden = true;
        if (progressEl) { progressEl.hidden = false; progressEl.textContent = '데모 실행 중… 0%'; }

        run(modelId, input, function (p) {
          if (progressEl) progressEl.textContent = '데모 실행 중… ' + p + '%';
        }).then(function (result) {
          button.disabled = false;
          if (progressEl) progressEl.hidden = true;
          if (resultEl) { renderResult(resultEl, result); resultEl.hidden = false; }
        }).catch(function () {
          button.disabled = false;
          if (progressEl) progressEl.textContent = '요청 처리에 실패했습니다. 다시 시도해 주세요.';
        });
      });
    });
  }

  function renderResult(el, result) {
    if (!el) return;
    el.textContent = '';
    var label = document.createElement('strong');
    label.className = 'ai-result-label';
    label.textContent = result.label + ' · 데모 결과';
    el.appendChild(label);

    if (result.body.kind === 'image') {
      var img = document.createElement('div');
      img.className = 'ai-image-grid';
      img.style.background = result.body.gradient;
      var mono = document.createElement('span');
      mono.className = 'ai-image-mono';
      mono.textContent = result.body.monogram;
      img.appendChild(mono);
      el.appendChild(img);
      if (result.body.title) {
        var cap = document.createElement('p');
        cap.className = 'ai-image-caption';
        cap.textContent = result.body.title;
        el.appendChild(cap);
      }
    } else if (result.body.kind === 'list') {
      var ul = document.createElement('ul');
      ul.className = 'ai-result-list';
      result.body.items.forEach(function (item) {
        var li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      el.appendChild(ul);
    } else {
      var p = document.createElement('p');
      p.className = 'ai-result-text';
      p.textContent = result.body.text;
      el.appendChild(p);
    }

    var note = document.createElement('p');
    note.className = 'ai-result-note';
    note.textContent = result.body.note;
    el.appendChild(note);
  }

  if (typeof window !== 'undefined') {
    window.globalhotAI = { models: models, run: run, bind: bind };
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { bind(document); }, { once: true });
    } else {
      bind(document);
    }
  }
}());