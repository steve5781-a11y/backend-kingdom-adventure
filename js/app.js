(function () {
  'use strict';

  // ---------- 유틸 ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pad = (n) => String(n).padStart(2, '0');

  const Store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('beq:' + k);
        return v ? JSON.parse(v) : d;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('beq:' + k, JSON.stringify(v));
      } catch (e) { /* 저장 불가 환경은 무시 */ }
    },
  };

  const CH = window.CHAPTERS;
  const chById = (id) => CH.find((c) => c.id === id);
  const VOCAB = CH.flatMap((c) => c.vocab.map((v, i) => ({ ...v, id: `${c.id}-v${i}`, ch: c.id })));

  // 게임 중 포즈가 바뀔 때 깜빡이지 않도록 일러스트 미리 불러오기
  ['prince', 'prince-hurt', 'prince-attack', 'princess', 'darklord', 'wizard'].forEach((n) => { new Image().src = `img/${n}.webp`; });

  // ---------- 효과음 ----------
  const Sfx = {
    ctx: null,
    get muted() { return Store.get('muted', false); },
    play(type) {
      if (this.muted) return;
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        const seq = {
          good: [[523, .08], [659, .08], [784, .14]],
          bad: [[260, .12], [180, .22]],
          step: [[392, .05], [440, .05]],
          flip: [[660, .04]],
          win: [[523, .1], [659, .1], [784, .1], [1047, .2], [784, .1], [1047, .3]],
          lose: [[392, .18], [330, .18], [262, .18], [196, .4]],
          potion: [[880, .06], [988, .06], [1175, .1]],
        }[type] || [];
        let t = this.ctx.currentTime;
        seq.forEach(([f, d]) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = type === 'bad' || type === 'lose' ? 'sawtooth' : 'square';
          o.frequency.value = f;
          g.gain.setValueAtTime(.06, t);
          g.gain.exponentialRampToValueAtTime(.001, t + d);
          o.connect(g).connect(this.ctx.destination);
          o.start(t);
          o.stop(t + d);
          t += d;
        });
      } catch (e) { /* 오디오 미지원 */ }
    },
  };

  // ---------- 진행 데이터 ----------
  const getRead = () => Store.get('read', []);
  const markRead = (id) => {
    const r = getRead();
    if (!r.includes(id)) { r.push(id); Store.set('read', r); }
  };
  const getKnown = () => Store.get('known', {});
  const setKnown = (id, val) => {
    const k = getKnown();
    if (val) k[id] = true; else delete k[id];
    Store.set('known', k);
  };
  const getWrong = () => Store.get('wrong', {});
  const addWrong = (q, picked) => {
    const w = getWrong();
    const e = w[q.id] || { n: 0 };
    e.n += 1;
    e.picked = picked;
    e.at = Date.now();
    w[q.id] = e;
    Store.set('wrong', w);
  };
  const removeWrong = (id) => {
    const w = getWrong();
    delete w[id];
    Store.set('wrong', w);
  };
  const getStats = () => Store.get('stats', { plays: 0, rescues: 0, best: 0 });

  // ---------- 문제 만들기 ----------
  // 단어 뜻 속에 용어 자체가 들어 있으면 가려서 정답이 드러나지 않게 함
  function maskTerm(text, term) {
    const tokens = term.split(/[\s()/]+/).filter((t) => t.length >= 2);
    return tokens.reduce((out, t) => out.split(t).join('○○'), text);
  }
  function vocabQuestion(v) {
    const same = shuffle(VOCAB.filter((x) => x.ch === v.ch && x.id !== v.id));
    const other = shuffle(VOCAB.filter((x) => x.ch !== v.ch));
    const wrongs = [...same.slice(0, 2), ...other].slice(0, 3).map((x) => x.t);
    return {
      id: 'v:' + v.id, ch: v.ch, kind: 'vocab',
      q: `“${maskTerm(v.m, v.t)}”`, prompt: '이 설명에 해당하는 용어는?',
      o: [v.t, ...wrongs], exp: `${v.t} — ${v.m}`,
    };
  }
  function conceptQuestion(c, i) {
    const q = c.quiz[i];
    return { id: `q:${c.id}-${i}`, ch: c.id, kind: 'concept', q: q.q, o: q.o, exp: q.exp };
  }
  function findQuestion(id) {
    if (id.startsWith('v:')) {
      const v = VOCAB.find((x) => x.id === id.slice(2));
      return v ? vocabQuestion(v) : null;
    }
    const [ch, i] = id.slice(2).split('-').map(Number);
    const c = chById(ch);
    return c && c.quiz[i] ? conceptQuestion(c, i) : null;
  }
  function materialize(q) {
    const order = shuffle(q.o.map((t, i) => ({ t, ok: i === 0 })));
    return { ...q, choices: order.map((x) => x.t), answer: order.findIndex((x) => x.ok) };
  }

  // ---------- 라우터 ----------
  const app = $('#app');
  let onKey = null;
  let cleanup = null;
  document.addEventListener('keydown', (e) => {
    if (onKey && !e.target.matches('input, textarea')) onKey(e);
  });

  const routes = { home: renderHome, learn: renderLearn, vocab: renderVocab, quiz: renderQuiz, wrong: renderWrong };

  function router() {
    const [page = 'home', arg] = location.hash.replace(/^#\/?/, '').split('/');
    if (cleanup) { cleanup(); cleanup = null; }
    onKey = null;
    (routes[page] || renderHome)(arg);
    $$('.nav a[data-page]').forEach((a) => a.classList.toggle('active', a.dataset.page === (routes[page] ? page : 'home')));
    refreshBadges();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', router);

  function refreshBadges() {
    const n = Object.keys(getWrong()).length;
    const b = $('#wrongBadge');
    b.textContent = n;
    b.hidden = n === 0;
    $('#muteBtn').textContent = Sfx.muted ? '🔇' : '🔊';
  }
  $('#muteBtn').addEventListener('click', () => {
    Store.set('muted', !Sfx.muted);
    refreshBadges();
  });

  // 스크롤하면 등장하는 애니메이션
  function reveal(selector) {
    const els = $$(selector);
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return () => {}; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: .15 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }

  // =====================================================
  // 홈
  // =====================================================
  function renderHome() {
    const read = getRead();
    const known = Object.keys(getKnown()).length;
    const wrongN = Object.keys(getWrong()).length;
    const st = getStats();
    const next = CH.find((c) => !read.includes(c.id));

    app.innerHTML = `
      <section class="hero-banner">
        <div class="hb-text">
          <span class="tag">백엔드 필수 개념 · ${CH.length}챕터</span>
          <h1>백엔드 왕국<br><em>대모험</em></h1>
          <p>암흑군주 버그킹이 공주를 납치했다! 😈<br>
          만화로 개념을 익히고, 단어를 외우고,<br>퀴즈로 버그 몬스터를 물리쳐 공주를 구하라!</p>
          <div class="btns">
            <a class="btn primary" href="#/learn${next ? '/' + next.id : ''}">📖 ${next && read.length ? '이어서 공부하기' : '만화로 공부 시작'}</a>
            <a class="btn" href="#/quiz">⚔️ 바로 모험 떠나기</a>
          </div>
        </div>
        <div class="hb-art">
          <div class="hb-hero">
            <div class="bubble small">공주님,<br>제가 구할게요!</div>
            ${Art.char('hero', 'happy')}
          </div>
          <div class="hb-castle">
            <div class="bubble small think">살려줘요~</div>
            ${Art.char('princess', 'sad')}
          </div>
          <div class="hb-dragon">${Art.char('dragon', 'angry')}</div>
        </div>
      </section>

      <section class="stats">
        <div class="stat"><b>${read.length}<small>/${CH.length}</small></b><span>읽은 챕터</span></div>
        <div class="stat"><b>${known}<small>/${VOCAB.length}</small></b><span>외운 단어</span></div>
        <div class="stat"><b>${st.rescues}</b><span>공주 구출 횟수</span></div>
        <div class="stat"><b>${wrongN}</b><span>복습할 오답</span></div>
      </section>

      <section class="features">
        <a class="feature" href="#/learn" style="--c:var(--blue)">
          <div class="f-icon">📖</div><h3>만화로 배우기</h3>
          <p>백둥이 왕자와 서버 마법사가 대화로 풀어주는 ${CH.length}개 챕터 만화</p>
        </a>
        <a class="feature" href="#/vocab" style="--c:var(--green)">
          <div class="f-icon">🃏</div><h3>단어 카드</h3>
          <p>뒤집어 보는 플래시카드로 핵심 용어 ${VOCAB.length}개 암기</p>
        </a>
        <a class="feature" href="#/quiz" style="--c:var(--red)">
          <div class="f-icon">⚔️</div><h3>퀴즈 모험</h3>
          <p>맞히면 전진, 틀리면 하트 감소! 10칸을 가면 공주 구출</p>
        </a>
        <a class="feature" href="#/wrong" style="--c:var(--purple)">
          <div class="f-icon">📝</div><h3>오답 노트</h3>
          <p>틀린 문제는 자동 저장. "오답 리벤지"로 다시 도전</p>
        </a>
      </section>

      <section class="howto">
        <h2>🗺️ 추천 공부 루트</h2>
        <ol>
          <li><b>만화 읽기</b> — 한 챕터씩 컷과 설명을 읽어요.</li>
          <li><b>단어 카드</b> — 그 챕터의 용어를 외워요.</li>
          <li><b>퀴즈 모험</b> — 몬스터를 물리치며 확인해요.</li>
          <li><b>오답 리벤지</b> — 틀린 문제만 모아 다시 도전!</li>
        </ol>
      </section>`;
  }

  // =====================================================
  // 만화 학습
  // =====================================================
  function renderLearn(arg) {
    const id = Number(arg);
    if (id && chById(id)) return renderChapter(chById(id));
    const read = getRead();
    app.innerHTML = `
      <div class="page-head">
        <h1>📖 만화로 배우는 백엔드</h1>
        <p>순서대로 읽으면 백엔드의 큰 그림이 그려져요. 챕터를 골라 보세요!</p>
      </div>
      <div class="ch-grid">
        ${CH.map((c) => `
          <a class="ch-card reveal ${read.includes(c.id) ? 'done' : ''}" href="#/learn/${c.id}">
            <div class="ch-mascot">${Art.char(c.mascot, read.includes(c.id) ? 'happy' : 'normal')}</div>
            <div class="ch-info">
              <span class="ch-num">CHAPTER ${pad(c.id)} ${c.emoji}</span>
              <h3>${esc(c.title)}</h3>
              <p>${esc(c.sub)}</p>
              <div class="ch-meta"><span>🎞️ ${c.panels.length}컷</span><span>🃏 ${c.vocab.length}단어</span><span>❓ ${c.quiz.length}문제</span></div>
            </div>
            ${read.includes(c.id) ? '<span class="done-stamp">완료!</span>' : ''}
          </a>`).join('')}
      </div>`;
    cleanup = reveal('.reveal');
  }

  function panelHTML(p, idx) {
    const slots = p.chars.map((ch, i) => {
      const said = (p.say || []).find((s) => s.w === i);
      return `<div class="slot">
          ${said ? `<div class="bubble">${esc(said.t)}</div>` : ''}
          <div class="char-wrap">${Art.char(ch.c, ch.e)}${ch.name ? `<span class="nametag">${esc(ch.name)}</span>` : ''}</div>
        </div>`;
    }).join('');
    return `
      <figure class="panel reveal">
        <div class="art bg-${p.bg || 'sky'} n${p.chars.length}">
          ${p.caption ? `<div class="caption">${esc(p.caption)}</div>` : ''}
          ${p.fx ? `<div class="fx">${esc(p.fx)}</div>` : ''}
          <div class="stage">${slots}</div>
        </div>
        <figcaption class="explain"><span class="pnum">${idx + 1}</span><p>${p.text}</p></figcaption>
      </figure>`;
  }

  function renderChapter(c) {
    const prev = chById(c.id - 1);
    const next = chById(c.id + 1);
    const known = getKnown();
    app.innerHTML = `
      <div class="chapter-head">
        <a class="back" href="#/learn">← 목차로</a>
        <span class="ch-badge">CHAPTER ${pad(c.id)}</span>
        <h1>${c.emoji} ${esc(c.title)}</h1>
        <p>${esc(c.sub)}</p>
      </div>
      <div class="comic-page">${c.panels.map(panelHTML).join('')}</div>

      <section class="summary reveal" id="summary">
        <div class="summary-mentor">${Art.char('mentor', 'happy')}</div>
        <div>
          <h2>📌 핵심 정리</h2>
          <ul>${c.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        </div>
      </section>

      <section class="ch-vocab reveal">
        <h2>🃏 이 챕터의 단어</h2>
        <div class="vocab-chips">
          ${c.vocab.map((v, i) => `<span class="vchip ${known[`${c.id}-v${i}`] ? 'known' : ''}" title="${esc(v.m)}">${esc(v.t)}</span>`).join('')}
        </div>
      </section>

      <div class="ch-actions">
        <a class="btn" href="#/vocab/${c.id}">🃏 단어 외우기</a>
        <a class="btn primary" href="#/quiz/${c.id}">⚔️ 이 챕터 퀴즈로 몬스터 잡기</a>
      </div>
      <div class="ch-pager">
        ${prev ? `<a href="#/learn/${prev.id}">← ${pad(prev.id)}. ${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a href="#/learn/${next.id}">${pad(next.id)}. ${esc(next.title)} →</a>` : '<a href="#/quiz">🏁 마지막 챕터! 모험 떠나기 →</a>'}
      </div>`;

    const stopReveal = reveal('.reveal');
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((en) => {
        if (en.some((e) => e.isIntersecting)) { markRead(c.id); io.disconnect(); }
      }, { threshold: .6 });
      io.observe($('#summary'));
    } else {
      markRead(c.id);
    }
    cleanup = () => { stopReveal(); if (io) io.disconnect(); };
  }

  // =====================================================
  // 단어 카드
  // =====================================================
  function renderVocab(arg) {
    const V = { ch: chById(Number(arg)) ? Number(arg) : 'all', only: false, deck: [], i: 0, flipped: false };

    function buildDeck(doShuffle) {
      const known = getKnown();
      let list = VOCAB.filter((v) => V.ch === 'all' || v.ch === V.ch);
      if (V.only) list = list.filter((v) => !known[v.id]);
      V.deck = doShuffle ? shuffle(list) : list;
      V.i = 0;
      V.flipped = false;
    }

    function chipsHTML() {
      const known = getKnown();
      const count = (ch) => {
        const list = VOCAB.filter((v) => ch === 'all' || v.ch === ch);
        return `${list.filter((v) => known[v.id]).length}/${list.length}`;
      };
      return [['all', '전체'], ...CH.map((c) => [c.id, `${pad(c.id)} ${c.title}`])]
        .map(([id, label]) => `<button class="chip ${V.ch === id ? 'on' : ''}" data-ch="${id}">${esc(label)} <small>${count(id)}</small></button>`).join('');
    }

    function cardHTML() {
      const known = getKnown();
      if (!V.deck.length) {
        return `<div class="flash-empty">
          <div class="big">🏆</div>
          <h3>${V.only ? '못 외운 단어가 없어요!' : '단어가 없어요'}</h3>
          <p>${V.only ? '이 범위의 단어를 모두 외웠어요. 퀴즈 모험으로 확인해 볼까요?' : ''}</p>
          <a class="btn primary" href="#/quiz">⚔️ 퀴즈 모험 가기</a>
        </div>`;
      }
      if (V.i >= V.deck.length) {
        const total = V.deck.length;
        const k = V.deck.filter((v) => known[v.id]).length;
        return `<div class="flash-empty">
          <div class="big">🎉</div>
          <h3>한 바퀴 완료!</h3>
          <p>이번 카드 묶음 ${total}개 중 <b>${k}개</b>를 외웠어요.</p>
          <div class="btns">
            <button class="btn" data-act="restart">🔁 처음부터</button>
            <button class="btn primary" data-act="unknownOnly">😵 못 외운 것만 다시</button>
          </div>
        </div>`;
      }
      const v = V.deck[V.i];
      const c = chById(v.ch);
      return `
        <div class="flash ${V.flipped ? 'flipped' : ''}" id="flash" tabindex="0" role="button" aria-label="카드 뒤집기">
          <div class="face front">
            <span class="fc-tag">${c.emoji} CH.${pad(c.id)} ${esc(c.title)}</span>
            ${known[v.id] ? '<span class="fc-known">✅ 외움</span>' : ''}
            <div class="fc-term">${esc(v.t)}</div>
            <div class="fc-hint">뜻을 먼저 떠올려 보고 카드를 눌러 확인! <kbd>Space</kbd></div>
          </div>
          <div class="face back">
            <div class="fc-term small">${esc(v.t)}</div>
            <div class="fc-mean">${esc(v.m)}</div>
            <div class="fc-ex"><b>예)</b> ${esc(v.ex)}</div>
          </div>
        </div>`;
    }

    function listHTML() {
      const known = getKnown();
      const list = VOCAB.filter((v) => V.ch === 'all' || v.ch === V.ch);
      return list.map((v) => `
        <button class="wl-item ${known[v.id] ? 'known' : ''}" data-id="${v.id}" title="눌러서 외움 표시 바꾸기">
          <span class="wl-check">${known[v.id] ? '✅' : '⬜'}</span>
          <span class="wl-term">${esc(v.t)}</span>
          <span class="wl-mean">${esc(v.m)}</span>
        </button>`).join('');
    }

    function tip() {
      if (!V.deck.length || V.i >= V.deck.length) return '훌륭해! 반복이 암기의 지름길이란다.';
      return V.flipped ? '알고 있었니? 솔직하게 체크하렴!' : '뜻을 먼저 소리 내어 말해 보고 뒤집어 보렴!';
    }

    function update() {
      $('#vchips').innerHTML = chipsHTML();
      $('#flashArea').innerHTML = cardHTML();
      $('#wordList').innerHTML = listHTML();
      $('#tipText').textContent = tip();
      const total = V.deck.length;
      const cur = Math.min(V.i + 1, total);
      $('#vprog').textContent = total ? `${cur} / ${total}` : '0 / 0';
      $('#vbar').style.width = total ? `${(Math.min(V.i, total) / total) * 100}%` : '0%';
      $('#vcontrols').hidden = !total || V.i >= total;
    }

    function flip() {
      if (!$('#flash')) return;
      V.flipped = !V.flipped;
      $('#flash').classList.toggle('flipped', V.flipped);
      $('#tipText').textContent = tip();
      Sfx.play('flip');
    }

    function go(delta) {
      V.i = Math.max(0, Math.min(V.deck.length, V.i + delta));
      V.flipped = false;
      update();
    }

    function mark(val) {
      const v = V.deck[V.i];
      if (!v) return;
      setKnown(v.id, val);
      Sfx.play(val ? 'good' : 'flip');
      const f = $('#flash');
      f.classList.add(val ? 'out-right' : 'out-left');
      setTimeout(() => go(1), 220);
    }

    app.innerHTML = `
      <div class="page-head">
        <h1>🃏 단어 카드</h1>
        <p>카드를 뒤집어 뜻을 확인하고, 외웠는지 체크하세요. 외운 기록은 이 브라우저에 저장돼요.</p>
      </div>
      <div class="chips" id="vchips"></div>
      <div class="vocab-toolbar">
        <label class="toggle"><input type="checkbox" id="onlyUnknown"> 못 외운 단어만</label>
        <button class="btn sm" id="shuffleBtn">🔀 섞기</button>
        <div class="vprog-wrap"><div class="vprog-bar"><i id="vbar"></i></div><span id="vprog"></span></div>
      </div>
      <div class="vocab-main">
        <div class="mentor-tip">
          <div class="bubble" id="tipText"></div>
          ${Art.char('mentor', 'happy')}
        </div>
        <div class="flash-area" id="flashArea"></div>
      </div>
      <div class="flash-controls" id="vcontrols">
        <button class="btn sm ghost" data-act="prev" title="이전 (←)">◀</button>
        <button class="btn no" data-act="no">😵 아직 몰라요 <kbd>1</kbd></button>
        <button class="btn yes" data-act="yes">😎 외웠어요 <kbd>2</kbd></button>
        <button class="btn sm ghost" data-act="next" title="다음 (→)">▶</button>
      </div>
      <details class="word-list-box">
        <summary>📚 단어장 전체 보기 (눌러서 외움 표시)</summary>
        <div class="word-list" id="wordList"></div>
      </details>`;

    buildDeck(false);
    update();

    app.addEventListener('click', onClick);
    $('#onlyUnknown').addEventListener('change', (e) => { V.only = e.target.checked; buildDeck(false); update(); });
    $('#shuffleBtn').addEventListener('click', () => { buildDeck(true); update(); });

    function onClick(e) {
      const chip = e.target.closest('.chip[data-ch]');
      if (chip) {
        V.ch = chip.dataset.ch === 'all' ? 'all' : Number(chip.dataset.ch);
        buildDeck(false);
        update();
        return;
      }
      const wl = e.target.closest('.wl-item');
      if (wl) {
        setKnown(wl.dataset.id, !getKnown()[wl.dataset.id]);
        $('#vchips').innerHTML = chipsHTML();
        $('#wordList').innerHTML = listHTML();
        return;
      }
      if (e.target.closest('#flash')) return flip();
      const act = e.target.closest('[data-act]');
      if (!act) return;
      ({
        prev: () => go(-1), next: () => go(1), yes: () => mark(true), no: () => mark(false),
        restart: () => { V.i = 0; update(); },
        unknownOnly: () => { V.only = true; $('#onlyUnknown').checked = true; buildDeck(false); update(); },
      })[act.dataset.act]?.();
    }

    onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '1') mark(false);
      else if (e.key === '2') mark(true);
    };
    cleanup = () => app.removeEventListener('click', onClick);
  }

  // =====================================================
  // 퀴즈 모험 (게임)
  // =====================================================
  const GOAL = 10;
  const DIFFS = [
    { key: 'easy', name: '견습 기사', hearts: 5, desc: '하트 5개로 여유롭게' },
    { key: 'normal', name: '정식 기사', hearts: 3, desc: '하트 3개, 기본 난이도' },
    { key: 'hard', name: '전설의 용사', hearts: 1, desc: '한 번만 틀려도 끝!' },
  ];
  let G = null;
  let pendingRevenge = false;

  function renderQuiz(arg) {
    const pre = chById(Number(arg)) ? [Number(arg)] : CH.map((c) => c.id);
    const cfg = Store.get('quizCfg', { diff: 'normal', vocab: true });
    cfg.chs = pre;
    if (pendingRevenge && Object.keys(getWrong()).length) {
      pendingRevenge = false;
      return startGame({ ...cfg, mode: 'revenge' });
    }
    pendingRevenge = false;
    renderSetup(cfg);
  }

  function renderSetup(cfg) {
    const wrongN = Object.keys(getWrong()).length;
    const st = getStats();
    app.innerHTML = `
      <div class="quest-intro">
        <div class="qi-art">
          ${Art.char('hero', 'angry')}
          <span class="vs">VS</span>
          ${Art.char('dragon', 'happy')}
        </div>
        <div class="qi-text">
          <span class="tag red">QUEST</span>
          <h1>공주 구출 대작전</h1>
          <p>버그 몬스터를 퀴즈로 물리치며 성까지 <b>${GOAL}칸</b>을 전진하세요!<br>마지막 칸에는 보스 <b>암흑군주 버그킹</b>이 기다립니다.</p>
          <ul class="rules">
            <li>⭕ 정답 → 몬스터 처치 & <b>한 칸 전진</b></li>
            <li>❌ 오답 → <b>하트 -1</b>, 그 문제는 잠시 후 다시 등장</li>
            <li>🧪 50:50 포션 1개 — 오답 2개 제거</li>
            <li>🔥 연속 정답 시 콤보 보너스 점수</li>
          </ul>
          <p class="best">🏆 최고 점수 <b>${st.best}</b> · 👸 구출 <b>${st.rescues}</b>회 · 🎮 플레이 <b>${st.plays}</b>회</p>
        </div>
      </div>

      <section class="setup-box">
        <h3>1. 모험할 챕터 <button class="link" id="toggleAll">전체 선택/해제</button></h3>
        <div class="chips" id="chChips">
          ${CH.map((c) => `<button class="chip ${cfg.chs.includes(c.id) ? 'on' : ''}" data-ch="${c.id}">${c.emoji} ${pad(c.id)} ${esc(c.title)}</button>`).join('')}
        </div>

        <h3>2. 난이도</h3>
        <div class="diffs" id="diffs">
          ${DIFFS.map((d) => `
            <button class="diff ${cfg.diff === d.key ? 'on' : ''}" data-diff="${d.key}">
              <b>${d.name}</b><span class="hearts">${'❤️'.repeat(d.hearts)}</span><small>${d.desc}</small>
            </button>`).join('')}
        </div>

        <h3>3. 옵션</h3>
        <label class="toggle"><input type="checkbox" id="vocabOpt" ${cfg.vocab ? 'checked' : ''}> 단어 뜻 맞히기 문제도 섞기</label>

        <div class="setup-actions">
          <button class="btn primary big" id="startBtn">⚔️ 모험 시작!</button>
          ${wrongN ? `<button class="btn big revenge" id="revengeBtn">🔥 오답 리벤지 (${wrongN}문제)</button>` : ''}
        </div>
        <p class="setup-msg" id="setupMsg"></p>
      </section>`;

    $('#chChips').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const id = Number(b.dataset.ch);
      cfg.chs = cfg.chs.includes(id) ? cfg.chs.filter((x) => x !== id) : [...cfg.chs, id];
      b.classList.toggle('on');
    });
    $('#toggleAll').addEventListener('click', () => {
      cfg.chs = cfg.chs.length === CH.length ? [] : CH.map((c) => c.id);
      $$('#chChips .chip').forEach((b) => b.classList.toggle('on', cfg.chs.length > 0));
    });
    $('#diffs').addEventListener('click', (e) => {
      const b = e.target.closest('.diff');
      if (!b) return;
      cfg.diff = b.dataset.diff;
      $$('#diffs .diff').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('#startBtn').addEventListener('click', () => {
      cfg.vocab = $('#vocabOpt').checked;
      if (!cfg.chs.length) { $('#setupMsg').textContent = '⚠️ 챕터를 하나 이상 골라 주세요!'; return; }
      Store.set('quizCfg', { diff: cfg.diff, vocab: cfg.vocab });
      startGame({ ...cfg, mode: 'normal' });
    });
    const rb = $('#revengeBtn');
    if (rb) rb.addEventListener('click', () => startGame({ ...cfg, mode: 'revenge' }));
  }

  function buildPool(cfg) {
    if (cfg.mode === 'revenge') {
      return shuffle(Object.keys(getWrong()).map(findQuestion).filter(Boolean));
    }
    const chs = CH.filter((c) => cfg.chs.includes(c.id));
    const concept = shuffle(chs.flatMap((c) => c.quiz.map((_, i) => conceptQuestion(c, i))));
    const vocab = cfg.vocab ? shuffle(VOCAB.filter((v) => cfg.chs.includes(v.ch)).map(vocabQuestion)) : [];
    // 개념 문제 2 : 단어 문제 1 비율로 섞기
    const out = [];
    while (concept.length || vocab.length) {
      if (concept.length) out.push(concept.shift());
      if (concept.length) out.push(concept.shift());
      if (vocab.length) out.push(vocab.shift());
    }
    return out;
  }

  function startGame(cfg) {
    const pool = buildPool(cfg);
    if (!pool.length) { renderSetup(cfg); return; }
    const diff = DIFFS.find((d) => d.key === cfg.diff) || DIFFS[1];
    G = {
      cfg, queue: pool.map(materialize), goal: Math.min(GOAL, pool.length),
      step: 0, hearts: diff.hearts, maxHearts: diff.hearts, potion: 1,
      combo: 0, maxCombo: 0, score: 0, answered: 0, correct: 0,
      wrongIds: [], cur: null, locked: false, monsterAlive: false, monster: null, over: false,
    };
    renderPlay();
    nextQuestion();
  }

  const posOf = (s) => 2 + s * (50 / G.goal);

  function renderPlay() {
    const marks = Array.from({ length: G.goal }, (_, s) => `<i class="stone" style="left:${posOf(s) + 5}%"></i>`).join('');
    app.innerHTML = `
      <div class="game">
        <div class="hud">
          <div class="hud-hearts" id="hudHearts"></div>
          <div class="hud-step" id="hudStep"></div>
          <div class="hud-score" id="hudScore"></div>
          <div class="hud-combo" id="hudCombo"></div>
          <div class="hud-right">
            <button class="btn sm potion" id="potionBtn" title="오답 2개 제거 (P)">🧪 50:50</button>
            <button class="btn sm ghost" id="quitBtn">🏳️ 그만하기</button>
          </div>
        </div>
        ${G.cfg.mode === 'revenge' ? '<div class="mode-banner">🔥 오답 리벤지 모드 — 맞힌 문제는 오답 노트에서 사라져요!</div>' : ''}
        <div class="scene" id="scene">
          <div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div>
          <div class="mountains"></div>
          <div class="ground"></div>
          <div class="path">${marks}</div>
          <div class="castle">
            <div class="bubble small think help" id="helpBubble">도와줘요!</div>
            ${Art.castle()}
            <div class="princess-peek" id="princess">${Art.char('princess', 'sad')}</div>
          </div>
          <div class="actor hero" id="hero" style="left:${posOf(0)}%">${Art.char('hero', 'normal')}</div>
          <div class="actor monster" id="monster"><div class="m-name" id="mName"></div><div class="m-body" id="mBody"></div></div>
          <div class="progress-strip"><i id="progFill"></i></div>
        </div>
        <div class="qcard" id="qcard"></div>
      </div>`;

    $('#potionBtn').addEventListener('click', usePotion);
    $('#quitBtn').addEventListener('click', () => { G.over = true; renderSetup(G.cfg); });
    onKey = (e) => {
      if (!G || G.over) return;
      const fb = $('#nextBtn');
      if (fb && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fb.click(); return; }
      if (/^[1-4]$/.test(e.key)) answer(Number(e.key) - 1);
      if (e.key.toLowerCase() === 'p') usePotion();
    };
    cleanup = () => { if (G) G.over = true; };
    updateHud();
  }

  function updateHud() {
    $('#hudHearts').innerHTML = Array.from({ length: G.maxHearts }, (_, i) =>
      `<span class="heart ${i < G.hearts ? '' : 'lost'}">${i < G.hearts ? '❤️' : '🖤'}</span>`).join('');
    $('#hudStep').innerHTML = `🚩 <b>${G.step}</b> / ${G.goal}`;
    $('#hudScore').innerHTML = `⭐ <b>${G.score}</b>`;
    $('#hudCombo').innerHTML = G.combo >= 2 ? `🔥 ${G.combo} 콤보!` : '';
    $('#hudCombo').classList.toggle('hot', G.combo >= 2);
    const pb = $('#potionBtn');
    pb.disabled = G.potion < 1 || G.locked;
    pb.textContent = G.potion ? '🧪 50:50' : '🧪 사용함';
    $('#progFill').style.width = `${(G.step / G.goal) * 100}%`;
  }

  function spawnMonster() {
    const boss = G.step === G.goal - 1 && G.goal >= 3;
    const pick = window.MONSTER_NAMES[(Math.random() * window.MONSTER_NAMES.length) | 0];
    G.monster = boss ? { name: '👑 보스: 암흑군주 버그킹', boss: true } : { name: pick[0], color: pick[1] };
    G.monsterAlive = true;
    const m = $('#monster');
    m.className = 'actor monster spawn' + (boss ? ' boss' : '');
    m.style.left = `${posOf(G.step) + 17}%`;
    $('#mName').textContent = G.monster.name;
    $('#mBody').innerHTML = boss ? Art.char('dragon', 'angry') : Art.char('monster', 'angry', { color: G.monster.color });
    if (boss) popFx('BOSS 등장!', 50, 30, 'boss-fx');
  }

  function nextQuestion() {
    if (G.over) return;
    if (!G.monsterAlive) spawnMonster();
    G.cur = G.queue.shift();
    G.locked = false;
    const q = G.cur;
    const c = chById(q.ch);
    $('#qcard').innerHTML = `
      <div class="q-tags">
        <span class="q-tag">${c.emoji} CH.${pad(c.id)} ${esc(c.title)}</span>
        <span class="q-tag ${q.kind}">${q.kind === 'vocab' ? '🃏 단어' : '💡 개념'}</span>
        <span class="q-no">문제 ${G.answered + 1}</span>
      </div>
      <h2 class="q-text">${esc(q.q)}</h2>
      ${q.prompt ? `<p class="q-prompt">${esc(q.prompt)}</p>` : ''}
      <div class="choices">
        ${q.choices.map((t, i) => `<button class="choice" data-i="${i}"><kbd>${i + 1}</kbd><span>${esc(t)}</span></button>`).join('')}
      </div>
      <div class="feedback" id="feedback" hidden></div>`;
    $$('#qcard .choice').forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.i))));
    $('#qcard').classList.remove('pop');
    void $('#qcard').offsetWidth;
    $('#qcard').classList.add('pop');
    updateHud();
  }

  function usePotion() {
    if (!G || G.locked || G.potion < 1 || !G.cur) return;
    G.potion -= 1;
    const wrongs = shuffle(G.cur.choices.map((_, i) => i).filter((i) => i !== G.cur.answer)).slice(0, 2);
    wrongs.forEach((i) => {
      const b = $(`#qcard .choice[data-i="${i}"]`);
      b.disabled = true;
      b.classList.add('removed');
    });
    Sfx.play('potion');
    popFx('🧪 펑!', posOf(G.step) + 5, 40);
    updateHud();
  }

  function popFx(text, leftPct, topPct, cls = '') {
    const scene = $('#scene');
    if (!scene) return;
    const el = document.createElement('div');
    el.className = 'pop-fx ' + cls;
    el.textContent = text;
    el.style.left = leftPct + '%';
    el.style.top = topPct + '%';
    scene.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function replay(el, cls) {
    el.classList.remove('attack', 'hurt', 'walk', 'jump', 'lunge', 'shake');
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function answer(i) {
    if (!G || G.locked || G.over || !G.cur) return;
    const btn = $(`#qcard .choice[data-i="${i}"]`);
    if (!btn || btn.disabled) return;
    G.locked = true;
    const q = G.cur;
    const ok = i === q.answer;
    G.answered += 1;
    $$('#qcard .choice').forEach((b) => { b.disabled = true; });
    $(`#qcard .choice[data-i="${q.answer}"]`).classList.add('correct');
    const hero = $('#hero');
    const mon = $('#monster');

    if (ok) {
      G.correct += 1;
      G.combo += 1;
      G.maxCombo = Math.max(G.maxCombo, G.combo);
      const gain = 100 + (G.combo - 1) * 20 + (G.monster.boss ? 200 : 0);
      G.score += gain;
      G.step += 1;
      G.monsterAlive = false;
      if (G.cfg.mode === 'revenge') removeWrong(q.id);
      Sfx.play('good');
      hero.querySelector('.char').outerHTML = Art.char('hero', 'attack');
      replay(hero, 'attack');
      setTimeout(() => {
        popFx(G.monster.boss ? '크아악!' : ['슉!', '쾅!', '처치!', '베었다!'][(Math.random() * 4) | 0], posOf(G.step - 1) + 15, 22);
        mon.classList.add('poof');
      }, 220);
      popFx(`+${gain}`, posOf(G.step - 1) + 4, 12, 'score-fx');
    } else {
      G.combo = 0;
      G.hearts -= 1;
      btn.classList.add('wrong');
      G.wrongIds.push(q.id);
      addWrong(q, q.choices[i]);
      // 틀린 문제는 조금 뒤에 다시 출제
      G.queue.splice(Math.min(G.queue.length, 2 + ((Math.random() * 3) | 0)), 0, materialize(q));
      Sfx.play('bad');
      replay(mon, 'lunge');
      setTimeout(() => {
        hero.querySelector('.char').outerHTML = Art.char('hero', 'sad');
        replay(hero, 'hurt');
        replay($('#scene'), 'shake');
        popFx('-❤️', posOf(G.step) + 4, 14, 'dmg-fx');
      }, 200);
      refreshBadges();
    }
    updateHud();

    const last = G.hearts <= 0 || G.step >= G.goal;
    const fb = $('#feedback');
    fb.hidden = false;
    fb.className = 'feedback ' + (ok ? 'ok' : 'no');
    fb.innerHTML = `
      <div class="fb-head">${ok
        ? `⭕ 정답! ${esc(G.monster.boss ? '보스를 쓰러뜨렸다!' : G.monster.name + ' 처치!')}`
        : `❌ 앗! 하트 -1 <small>정답: ${esc(q.choices[q.answer])}</small>`}</div>
      <p class="fb-exp">💡 ${esc(q.exp)}</p>
      <div class="fb-actions">
        ${!ok ? `<a class="link" href="#/learn/${q.ch}">📖 만화로 복습하기</a>` : '<span></span>'}
        <button class="btn primary" id="nextBtn">${last ? (G.hearts <= 0 ? '결과 보기 💀' : '성으로! 🏰') : ok ? '앞으로 전진 →' : '다시 맞서기 ⚔️'} <kbd>Enter</kbd></button>
      </div>`;
    $('#nextBtn').addEventListener('click', proceed, { once: true });
    $('#nextBtn').focus({ preventScroll: true });
  }

  function proceed() {
    if (!G || G.over) return;
    const hero = $('#hero');
    if (G.hearts <= 0) return endGame(false);
    hero.querySelector('.char').outerHTML = Art.char('hero', 'normal');
    if (G.step >= G.goal) return winSequence();
    if (!G.monsterAlive) {
      hero.style.left = `${posOf(G.step)}%`;
      replay(hero, 'walk');
      Sfx.play('step');
      $('#qcard').innerHTML = `<div class="walking-msg">🚶 앞으로 전진 중…</div>`;
      setTimeout(nextQuestion, 750);
    } else {
      nextQuestion();
    }
  }

  function winSequence() {
    G.over = true;
    const hero = $('#hero');
    hero.style.left = '55%';
    replay(hero, 'walk');
    $('#qcard').innerHTML = `<div class="walking-msg">🏰 성으로 달려가는 중…</div>`;
    setTimeout(() => {
      const p = $('#princess');
      p.innerHTML = Art.char('princess', 'happy');
      p.classList.add('saved');
      $('#helpBubble').textContent = '고마워요!';
      $('#helpBubble').classList.remove('think');
      hero.querySelector('.char').outerHTML = Art.char('hero', 'happy');
      replay(hero, 'jump');
      confetti();
      Sfx.play('win');
      saveResult(true);
      showResult(true);
    }, 900);
  }

  function endGame(win) {
    G.over = true;
    const hero = $('#hero');
    hero.querySelector('.char').outerHTML = Art.char('hero', 'sad');
    hero.classList.add('fallen');
    popFx(G.monster.boss ? '크하하하!' : '키키킥!', posOf(G.step) + 16, 18, 'dmg-fx');
    Sfx.play('lose');
    saveResult(win);
    showResult(win);
  }

  function saveResult(win) {
    const st = getStats();
    st.plays += 1;
    if (win) st.rescues += 1;
    st.best = Math.max(st.best, G.score);
    Store.set('stats', st);
  }

  function showResult(win) {
    const rate = G.answered ? Math.round((G.correct / G.answered) * 100) : 0;
    const wrongs = [...new Set(G.wrongIds)].map(findQuestion).filter(Boolean);
    const worstCh = wrongs.length ? wrongs[0].ch : null;
    $('#qcard').innerHTML = `
      <div class="result ${win ? 'win' : 'lose'}">
        <div class="r-art">${win ? Art.char('princess', 'happy') : Art.char('dragon', 'happy')}</div>
        <div class="r-body">
          <h2>${win ? '🎉 공주 구출 성공!' : '💀 GAME OVER'}</h2>
          <p class="r-quote">${win
            ? '“고마워요, 백엔드 왕자님! 당신의 지식이 왕국을 구했어요!”'
            : '“크하하! 공부를 더 하고 와라, 꼬마 왕자!” — 암흑군주 버그킹'}</p>
          <div class="r-stats">
            <div><b>${G.score}</b><span>점수</span></div>
            <div><b>${rate}%</b><span>정답률</span></div>
            <div><b>${G.maxCombo}</b><span>최고 콤보</span></div>
            <div><b>${G.step}/${G.goal}</b><span>전진한 칸</span></div>
          </div>
          ${wrongs.length ? `
            <div class="r-wrongs">
              <h4>📝 이번에 틀린 문제 (오답 노트에 저장됨)</h4>
              <ul>${wrongs.slice(0, 5).map((q) => `<li><span>${esc(q.q)}</span><b>→ ${esc(q.o[0])}</b></li>`).join('')}</ul>
            </div>` : '<p class="r-perfect">✨ 한 문제도 틀리지 않았어요! 완벽해요!</p>'}
          <div class="btns">
            <button class="btn primary" id="againBtn">🔁 다시 모험하기</button>
            ${wrongs.length ? '<a class="btn" href="#/wrong">📝 오답 노트</a>' : ''}
            ${!win && worstCh ? `<a class="btn" href="#/learn/${worstCh}">📖 만화로 복습</a>` : ''}
          </div>
        </div>
      </div>`;
    $('#againBtn').addEventListener('click', () => renderSetup(G.cfg));
    $('#potionBtn').disabled = true;
    refreshBadges();
  }

  function confetti() {
    const scene = $('#scene');
    const colors = ['#ff5c5c', '#ffd23f', '#3a86ff', '#2ec27e', '#ff8fc8', '#b388ff'];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('i');
      s.className = 'confetti';
      s.style.left = Math.random() * 100 + '%';
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = Math.random() * .8 + 's';
      s.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
      scene.appendChild(s);
    }
  }

  // =====================================================
  // 오답 노트
  // =====================================================
  function renderWrong() {
    const w = getWrong();
    const items = Object.entries(w)
      .map(([id, e]) => ({ id, e, q: findQuestion(id) }))
      .filter((x) => x.q)
      .sort((a, b) => b.e.n - a.e.n || b.e.at - a.e.at);

    app.innerHTML = `
      <div class="page-head">
        <h1>📝 오답 노트</h1>
        <p>퀴즈 모험에서 틀린 문제가 자동으로 모여요. 이해했다면 "이제 알아요"를 눌러 지우거나, 리벤지 모험으로 다시 도전하세요!</p>
      </div>
      ${items.length ? `
        <div class="wrong-top">
          <div class="wrong-count">${Art.char('monster', 'angry', { color: '#ff8a80' })}<div><b>${items.length}</b>마리의 오답 몬스터가<br>복수를 기다리고 있어요!</div></div>
          <div class="btns">
            <a class="btn primary revenge" href="#/quiz" id="goRevenge">🔥 오답 리벤지 모험</a>
            <button class="btn ghost" id="clearAll">🗑️ 전체 비우기</button>
          </div>
        </div>
        <div class="wrong-list">
          ${items.map(({ id, e, q }) => {
            const c = chById(q.ch);
            return `
            <article class="wrong-item reveal" data-id="${esc(id)}">
              <div class="wi-tags">
                <span class="q-tag">${c.emoji} CH.${pad(c.id)} ${esc(c.title)}</span>
                <span class="q-tag ${q.kind}">${q.kind === 'vocab' ? '🃏 단어' : '💡 개념'}</span>
                <span class="wi-count">❌ ${e.n}회 틀림</span>
              </div>
              <h3>${esc(q.q)}</h3>
              ${q.prompt ? `<p class="q-prompt">${esc(q.prompt)}</p>` : ''}
              <div class="wi-answers">
                ${e.picked && e.picked !== q.o[0] ? `<div class="wi-mine">내가 고른 답 <b>${esc(e.picked)}</b></div>` : ''}
                <div class="wi-right">정답 <b>${esc(q.o[0])}</b></div>
              </div>
              <p class="wi-exp">💡 ${esc(q.exp)}</p>
              <div class="wi-actions">
                <a class="link" href="#/learn/${q.ch}">📖 만화로 복습</a>
                <button class="btn sm yes" data-resolve="${esc(id)}">✔ 이제 알아요</button>
              </div>
            </article>`;
          }).join('')}
        </div>` : `
        <div class="empty-state">
          ${Art.char('princess', 'happy')}
          <h3>오답 노트가 깨끗해요! ✨</h3>
          <p>퀴즈 모험에서 틀린 문제가 생기면 여기에 모여요.</p>
          <a class="btn primary" href="#/quiz">⚔️ 퀴즈 모험 떠나기</a>
        </div>`}`;

    const stop = reveal('.reveal');
    const onClick = (ev) => {
      const r = ev.target.closest('[data-resolve]');
      if (r) {
        removeWrong(r.dataset.resolve);
        const card = r.closest('.wrong-item');
        card.classList.add('resolved');
        Sfx.play('good');
        setTimeout(() => renderWrong(), 350);
        refreshBadges();
        return;
      }
      if (ev.target.closest('#clearAll')) {
        const btn = ev.target.closest('#clearAll');
        if (btn.dataset.confirm) { Store.set('wrong', {}); renderWrong(); refreshBadges(); }
        else { btn.dataset.confirm = '1'; btn.textContent = '정말 비울까요? 한 번 더 클릭'; }
        return;
      }
      if (ev.target.closest('#goRevenge')) {
        // 퀴즈 페이지로 이동하면서 리벤지 모드로 바로 시작
        pendingRevenge = true;
      }
    };
    app.addEventListener('click', onClick);
    cleanup = () => { stop(); app.removeEventListener('click', onClick); };
  }

  router();
})();
