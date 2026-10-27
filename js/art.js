/*
 * 만화 캐릭터 SVG
 * Art.char(type, expression, opts) → <svg> 문자열
 */
(function () {
  const K = '#1b1b2f';
  const SKIN = '#ffdcb5';
  const line = `stroke="${K}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;

  // 얼굴: (0,0) 기준으로 그린 뒤 transform으로 배치
  function face(e) {
    const st = `${line} fill="none"`;
    const dot = (x, y, r = 3.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${K}"/><circle cx="${x + 1}" cy="${y - 1.2}" r="1" fill="#fff"/>`;
    const blush = `<ellipse cx="-17" cy="7" rx="5" ry="3" fill="#ff9aa2" opacity=".7"/><ellipse cx="17" cy="7" rx="5" ry="3" fill="#ff9aa2" opacity=".7"/>`;
    switch (e) {
      case 'happy':
        return `${blush}<path d="M-14 -1 q5 -7 10 0" ${st}/><path d="M4 -1 q5 -7 10 0" ${st}/>
          <path d="M-8 6 q8 11 16 0 z" fill="#d94a4a" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>`;
      case 'surprised':
        return `<circle cx="-9" cy="-3" r="5.5" fill="#fff" stroke="${K}" stroke-width="2.5"/><circle cx="-9" cy="-3" r="2.3" fill="${K}"/>
          <circle cx="9" cy="-3" r="5.5" fill="#fff" stroke="${K}" stroke-width="2.5"/><circle cx="9" cy="-3" r="2.3" fill="${K}"/>
          <ellipse cx="0" cy="11" rx="4.5" ry="5.5" fill="#d94a4a" stroke="${K}" stroke-width="2.5"/>`;
      case 'sad':
        return `<path d="M-15 -7 L-5 -11" ${st}/><path d="M15 -7 L5 -11" ${st}/>${dot(-9, -1, 3)}${dot(9, -1, 3)}
          <path d="M-6 12 q6 -7 12 0" ${st}/>
          <path d="M-14 4 q-3.5 5 0 7.5 q3.5 -2.5 0 -7.5z" fill="#6ec6ff" stroke="${K}" stroke-width="1.5"/>`;
      case 'think':
        return `${dot(-9, -1)}<path d="M5 -1 h8" ${st}/><path d="M4 -10 q5 -4 10 0" ${st}/>
          <path d="M-4 10 q5 -2 9 1" ${st}/>`;
      case 'angry':
        return `<path d="M-16 -11 L-5 -6" ${st}/><path d="M16 -11 L5 -6" ${st}/>${dot(-9, 0, 3)}${dot(9, 0, 3)}
          <path d="M-7 12 q7 -7 14 0" ${st}/>`;
      default:
        return `${blush}${dot(-9, -2)}${dot(9, -2)}<path d="M-6 6 q6 6 12 0" ${st}/>`;
    }
  }
  const at = (x, y, e, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${face(e)}</g>`;
  const legs = (y = 116, c = '#3d3d5c') =>
    `<rect x="42" y="${y}" width="12" height="18" rx="4" fill="${c}"/><rect x="66" y="${y}" width="12" height="18" rx="4" fill="${c}"/>`;

  const parts = {
    server: (e) => `
      ${legs(118, '#2d3e50')}
      <path d="M26 82 Q12 88 14 104" fill="none"/><circle cx="14" cy="106" r="5.5" fill="#bdc3c7"/>
      <path d="M94 82 Q108 88 106 104" fill="none"/><circle cx="106" cy="106" r="5.5" fill="#bdc3c7"/>
      <path d="M60 30 L60 16" fill="none"/><circle cx="60" cy="12" r="5" fill="#ff5c5c"/>
      <rect x="26" y="30" width="68" height="90" rx="10" fill="#6c7a89"/>
      <rect x="34" y="38" width="52" height="42" rx="7" fill="#eef3f7"/>
      <rect x="34" y="88" width="52" height="10" rx="3" fill="#34495e"/><rect x="34" y="102" width="52" height="10" rx="3" fill="#34495e"/>
      <circle cx="78" cy="93" r="2.6" fill="#2ecc71" stroke="none"/><circle cx="70" cy="93" r="2.6" fill="#ffd23f" stroke="none"/>
      <circle cx="78" cy="107" r="2.6" fill="#2ecc71" stroke="none"/>
      ${at(60, 60, e, .85)}`,

    db: (e) => `
      ${legs(116, '#8a5a12')}
      <path d="M28 76 Q14 82 16 98" fill="none"/><circle cx="16" cy="100" r="5.5" fill="#f8c471"/>
      <path d="M92 76 Q106 82 104 98" fill="none"/><circle cx="104" cy="100" r="5.5" fill="#f8c471"/>
      <path d="M28 36 V108 A32 11 0 0 0 92 108 V36" fill="#f5b041"/>
      <path d="M28 92 A32 11 0 0 0 92 92" fill="none"/>
      <ellipse cx="60" cy="36" rx="32" ry="11" fill="#fad390"/>
      ${at(60, 68, e, .9)}`,

    client: (e) => `
      <rect x="44" y="104" width="11" height="22" rx="4" fill="#3d3d5c"/><rect x="65" y="104" width="11" height="22" rx="4" fill="#3d3d5c"/>
      <rect x="40" y="124" width="17" height="9" rx="4" fill="#ff5c5c"/><rect x="63" y="124" width="17" height="9" rx="4" fill="#ff5c5c"/>
      <path d="M22 62 Q8 70 10 84" fill="none"/><circle cx="10" cy="86" r="5.5" fill="${SKIN}"/>
      <path d="M98 62 Q112 70 110 84" fill="none"/><circle cx="110" cy="86" r="5.5" fill="${SKIN}"/>
      <rect x="22" y="22" width="76" height="62" rx="9" fill="#2c3e50"/>
      <rect x="29" y="29" width="62" height="47" rx="5" fill="#aee1f9"/>
      <path d="M14 92 H106 L98 104 H22Z" fill="#a4b0be"/><rect x="18" y="84" width="84" height="8" rx="3" fill="#ced6e0"/>
      ${at(60, 54, e, .85)}`,

    cache: (e) => `
      ${legs(114, '#8e1f14')}
      <path d="M8 70 H20 M4 84 H18 M10 98 H22" fill="none"/>
      <path d="M28 80 Q16 84 16 98" fill="none"/><circle cx="16" cy="100" r="5.5" fill="#ffb3a7"/>
      <path d="M92 80 Q104 84 104 98" fill="none"/><circle cx="104" cy="100" r="5.5" fill="#ffb3a7"/>
      <rect x="28" y="42" width="64" height="74" rx="18" fill="#ff5c5c"/>
      <rect x="36" y="52" width="48" height="40" rx="12" fill="#ffe3df"/>
      <path d="M66 4 L46 34 H58 L52 52 L76 22 H63 L70 4Z" fill="#ffd23f"/>
      ${at(60, 72, e, .85)}`,

    lb: (e) => `
      ${legs(114, '#145a32')}
      <path d="M36 74 L16 64" fill="none"/><path d="M2 60 L12 50 V56 H26 V64 H12 V70Z" fill="#ffd23f"/>
      <path d="M84 74 L104 64" fill="none"/><path d="M118 60 L108 50 V56 H94 V64 H108 V70Z" fill="#ffd23f"/>
      <rect x="34" y="62" width="52" height="54" rx="10" fill="#2ec27e"/>
      <rect x="34" y="86" width="52" height="8" fill="#ffd23f"/>
      <rect x="36" y="24" width="48" height="40" rx="12" fill="#eef3f7"/>
      ${at(60, 46, e, .8)}
      <path d="M32 26 Q60 2 88 26Z" fill="#1e3d59"/><rect x="28" y="23" width="64" height="7" rx="3" fill="#1e3d59"/>
      <circle cx="60" cy="16" r="3.5" fill="#ffd23f" stroke-width="1.5"/>`,

    queue: (e) => `
      <rect x="54" y="98" width="12" height="36" fill="#7a4a24"/>
      <path d="M100 66 L100 28" fill="none"/><rect x="100" y="28" width="16" height="11" fill="#ff5c5c"/>
      <path d="M22 98 V60 Q22 32 60 32 Q98 32 98 60 V98Z" fill="#3a86ff"/>
      <rect x="38" y="84" width="44" height="7" rx="3" fill="${K}"/>
      <path d="M48 80 L50 66 H72 L70 80" fill="#fff" stroke-width="2"/><path d="M50 66 L61 74 L72 66" fill="none" stroke-width="2"/>
      ${at(60, 52, e, .85)}`,

    container: (e) => `
      ${legs(114, '#0b4f8a')}
      <path d="M22 80 Q10 84 10 98" fill="none"/><circle cx="10" cy="100" r="5.5" fill="#9fd0fb"/>
      <path d="M98 80 Q110 84 110 98" fill="none"/><circle cx="110" cy="100" r="5.5" fill="#9fd0fb"/>
      <rect x="34" y="30" width="15" height="14" fill="#5fb0f5"/><rect x="52" y="30" width="15" height="14" fill="#5fb0f5"/><rect x="70" y="30" width="15" height="14" fill="#5fb0f5"/>
      <rect x="52" y="14" width="15" height="14" fill="#5fb0f5"/>
      <rect x="22" y="46" width="76" height="70" rx="8" fill="#2496ed"/>
      <path d="M34 46 V116 M86 46 V116" fill="none" stroke-width="2" opacity=".5"/>
      <rect x="38" y="56" width="44" height="38" rx="9" fill="#e8f4fd"/>
      ${at(60, 75, e, .8)}`,

    monster: (e, o) => `
      <path d="M46 60 Q36 36 28 32" fill="none"/><circle cx="27" cy="31" r="5.5" fill="${o.color}"/>
      <path d="M74 60 Q84 36 92 32" fill="none"/><circle cx="93" cy="31" r="5.5" fill="${o.color}"/>
      <path d="M16 122 Q12 70 60 54 Q108 70 104 122 Q97 130 89 123 Q81 131 73 123 Q65 131 57 123 Q49 131 41 123 Q33 131 25 123 Q19 128 16 122Z" fill="${o.color}"/>
      <ellipse cx="38" cy="82" rx="6" ry="11" fill="#fff" opacity=".55" stroke="none"/>
      ${at(60, 94, e || 'angry', 1)}`,

  };

  // 직접 그린 일러스트가 있는 캐릭터 (img/ 폴더)
  const IMAGES = {
    hero: (e) => (e === 'attack' || e === 'angry' ? 'prince-attack' : e === 'sad' ? 'prince-hurt' : 'prince'),
    mentor: () => 'wizard',
    princess: () => 'princess',
    dragon: () => 'darklord',
  };
  const ALT = { hero: '백둥이 왕자', mentor: '서버 마법사', princess: '공주', dragon: '암흑군주 버그킹' };

  function char(type, e = 'normal', o = {}) {
    if (IMAGES[type]) {
      const name = IMAGES[type](e);
      return `<img class="char char-${type} img-char pose-${name}" src="img/${name}.webp" alt="${ALT[type]}" draggable="false">`;
    }
    const draw = parts[type] || parts.server;
    return `<svg class="char char-${type}" viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g ${line}>${draw(e, o)}</g></svg>`;
  }

  function castle() {
    return `<svg class="castle-svg" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g ${line}>
        <path d="M80 30 V4" fill="none"/><path d="M80 4 L102 11 L80 18Z" fill="#ff5c5c"/>
        <rect x="8" y="80" width="144" height="118" fill="#d7c4f0"/>
        <path d="M8 80 v-12 h16 v12 h16 v-12 h16 v12 h16 v-12 h16 v12 h16 v-12 h16 v12 h16 v-12 h16 v12" fill="#d7c4f0"/>
        <rect x="52" y="40" width="56" height="70" fill="#c4adeb"/>
        <path d="M46 42 L80 26 L114 42Z" fill="#7b4fc9"/>
        <rect x="64" y="56" width="32" height="34" rx="16" fill="#3b2a63"/>
        <path d="M58 198 V158 Q80 136 102 158 V198Z" fill="#7a4a24"/>
        <path d="M80 142 V198" fill="none" stroke-width="2"/>
        <rect x="20" y="104" width="18" height="24" rx="9" fill="#3b2a63"/><rect x="122" y="104" width="18" height="24" rx="9" fill="#3b2a63"/>
      </g></svg>`;
  }

  window.Art = { char, castle };
})();
