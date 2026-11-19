// Recipes page mock (Aurora-4g4d.1). Static: no clip files, no real viewer.
// Frames: #a generated SVG (text list on phones), #c screenshot stand-in, #b master-detail.
(function () {
  const CHEV = '<svg class="ui-icon" viewBox="0 0 32 32" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M15.905 17.4809C15.9571 17.533 16.0415 17.533 16.0936 17.4809L22.4111 11.1635C22.6714 10.9031 23.0935 10.9031 23.3539 11.1635L24.9567 12.7662C25.217 13.0266 25.217 13.4487 24.9567 13.709L18.1028 20.5629C18.0937 20.5732 18.0842 20.5833 18.0744 20.5931L16.4716 22.1959C16.2113 22.4562 15.7892 22.4562 15.5288 22.1959L7.04353 13.7106C6.78318 13.4503 6.78318 13.0281 7.04353 12.7678L8.6463 11.165C8.90665 10.9047 9.32876 10.9047 9.58911 11.165L15.905 17.4809Z"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.25"/></svg>';

  // Stand-in for docs/recipes/<name>.clip.json. col/row are the saved ui positions.
  const RECIPES = [
    {
      id: 'candles', name: 'Candles',
      desc: 'Warm candle flicker across the room, with sliders for speed, color and smoothing.',
      inp: 'none', out: 'zone colors', layout: 'depends on layout',
      needs: 'nothing', notes: ['Paste into a new, empty graph.', 'Depends on your light layout. Comes with 6 Tuning controls.'],
      nodes: [
        { id: 'f', type: 'color.constant', p: 'hue 32, value 1', col: 0, row: 0 },
        { id: 'e', type: 'color.constant', p: 'hue 18, value 0.15', col: 0, row: 1 },
        { id: 'n', type: 'image.noise', p: 'cells 16, rate 6, seed 7', col: 1, row: 0 },
        { id: 'z', type: 'zones.sample', p: 'output', col: 2, row: 0 },
        { id: 's', type: 'frame.smooth', p: 'smoothing', col: 3, row: 0 },
        { id: 'o', type: 'output.send', p: 'output', col: 4, row: 0 },
      ],
      edges: [['f', 'n', 'color'], ['e', 'n', 'background'], ['n', 'z', 'image'], ['z', 's', 'frame'], ['s', 'o', 'frame']],
      steps: [
        { branches: [
          { label: 'Flame color', steps: [{ t: 'color.constant', p: 'hue 32, saturation 0.95' }] },
          { label: 'Ember color', steps: [{ t: 'color.constant', p: 'hue 18, value 0.15' }] },
        ] },
        { t: 'image.noise', p: 'cells 16, rate 6, seed 7', join: ['color: flame color', 'background: ember color'] },
        { t: 'zones.sample' },
        { t: 'frame.smooth' },
        { t: 'output.send' },
      ],
    },
    {
      id: 'loudness-switch', name: 'Loudness switch between two looks',
      desc: 'Flips between two looks when the music gets loud, without flickering near the threshold.',
      inp: 'audio', out: 'zone colors', layout: 'any layout',
      needs: 'audio', notes: ['Connect your own looks to a and b after pasting.'],
      nodes: [
        { id: 'r', type: 'audio.features.rms', p: '', col: 0, row: 0 },
        { id: 's', type: 'math.step', p: 'edge 0.32, hysteresis 0.03', col: 1, row: 0 },
        { id: 'la', type: 'look A', p: 'any Frame', col: 1, row: 1, ghost: true },
        { id: 'lb', type: 'look B', p: 'any Frame', col: 1, row: 2, ghost: true },
        { id: 'm', type: 'frame.mix', p: '', col: 2, row: 1 },
      ],
      edges: [['r', 's', ''], ['s', 'm', 't'], ['la', 'm', 'a'], ['lb', 'm', 'b']],
      steps: [
        { t: 'audio.features.rms' },
        { t: 'math.step', p: 'edge 0.32, hysteresis 0.03' },
        { t: 'frame.mix', p: 'the select', join: ['t: from math.step above', 'a: look A (any Frame)', 'b: look B (any Frame)'] },
      ],
    },
    {
      id: 'rgb-split', name: 'Bass, mids and treble as red, green and blue',
      desc: 'Each band drives the brightness of one color, and the three add up to the room color.',
      inp: 'audio', out: 'frame', layout: 'any layout',
      needs: 'audio', notes: [],
      nodes: [
        { id: 'cr', type: 'color.constant', p: 'red', col: 0, row: 0 },
        { id: 'cg', type: 'color.constant', p: 'green', col: 0, row: 1 },
        { id: 'cb', type: 'color.constant', p: 'blue', col: 0, row: 2 },
        { id: 'br', type: 'frame.broadcast', p: '', col: 1, row: 0 },
        { id: 'bg', type: 'frame.broadcast', p: '', col: 1, row: 1 },
        { id: 'bb', type: 'frame.broadcast', p: '', col: 1, row: 2 },
        { id: 'ab', type: 'audio.bands', p: 'bass, mid, treble', col: 1, row: 3 },
        { id: 'sr', type: 'frame.brightnessScale', p: '', col: 2, row: 0 },
        { id: 'sg', type: 'frame.brightnessScale', p: '', col: 2, row: 1 },
        { id: 'sb', type: 'frame.brightnessScale', p: '', col: 2, row: 2 },
        { id: 'm1', type: 'frame.mix', p: 'mode add, t 1', col: 3, row: 0 },
        { id: 'm2', type: 'frame.mix', p: 'mode add, t 1', col: 4, row: 1 },
      ],
      edges: [['cr', 'br', ''], ['cg', 'bg', ''], ['cb', 'bb', ''], ['br', 'sr', ''], ['bg', 'sg', ''], ['bb', 'sb', ''],
        ['ab', 'sr', 'factor'], ['ab', 'sg', 'factor'], ['ab', 'sb', 'factor'],
        ['sr', 'm1', 'a'], ['sg', 'm1', 'b'], ['m1', 'm2', 'a'], ['sb', 'm2', 'b']],
      steps: [
        { branches: [
          { label: 'Red channel', steps: [{ t: 'color.constant', p: 'red' }, { t: 'frame.broadcast' }, { t: 'frame.brightnessScale', p: 'factor: audio.bands bass' }] },
          { label: 'Green channel', steps: [{ t: 'color.constant', p: 'green' }, { t: 'frame.broadcast' }, { t: 'frame.brightnessScale', p: 'factor: audio.bands mid' }] },
          { label: 'Blue channel', steps: [{ t: 'color.constant', p: 'blue' }, { t: 'frame.broadcast' }, { t: 'frame.brightnessScale', p: 'factor: audio.bands treble' }] },
        ] },
        { t: 'frame.mix', p: 'mode add, t 1', join: ['a: red channel', 'b: green channel'] },
        { t: 'frame.mix', p: 'mode add, t 1', join: ['a: the mix above', 'b: blue channel'] },
      ],
    },
  ];


  // Editor-look data for B. Titles, ports and param labels are from the node catalog
  // (Static_GraphEditor_Mocks_Grille/catalog.js, math.step from core MathNodes.cpp).
  const TYPES = { Image: ['#38c9a8', true], AudioBuffer: ['#c58cf0', true], AudioFeatures: ['#c58cf0', false], Frame: ['#e5ad3c', true],
    Color: ['#e5ad3c', false], Float: ['#9a9a9a', false], Angle: ['#9a9a9a', false], Trigger: ['#9a9a9a', false, true] };
  const CAT = {
    'lfo': { title: 'LFO', i: [], o: [['value', 'Float']] },
    'image.gradient': { title: 'Gradient image', i: [['phase', 'Float']], o: [['image', 'Image']] },
    'zones.sample': { title: 'Sample zones', i: [['image', 'Image', 1]], o: [['frame', 'Frame']] },
    'audio.features': { title: 'Audio features', i: [['buffer', 'AudioBuffer', 1]], o: [['features', 'AudioFeatures'], ['rms', 'Float'], ['onset', 'Trigger'], ['onsetStrength', 'Float'], ['centroid', 'Float']] },
    'math.step': { title: 'Step', i: [['value', 'Float', 1], ['edge', 'Float']], o: [['value', 'Float']] },
    'frame.mix': { title: 'Mix frames', i: [['a', 'Frame', 1], ['b', 'Frame', 1], ['t', 'Float']], o: [['frame', 'Frame']] },
    'color.constant': { title: 'Color', i: [], o: [['color', 'Color']] },
    'frame.broadcast': { title: 'Broadcast color', i: [['color', 'Color', 1]], o: [['frame', 'Frame']] },
    'frame.brightnessScale': { title: 'Brightness', i: [['frame', 'Frame', 1], ['factor', 'Float']], o: [['frame', 'Frame']] },
    'image.noise': { title: 'Noise image', i: [['color', 'Color'], ['background', 'Color']], o: [['image', 'Image']] },
    'frame.smooth': { title: 'Smooth frames', i: [['frame', 'Frame', 1]], o: [['frame', 'Frame']] },
    'output.send': { title: 'Send to output', i: [['frame', 'Frame', 1]], o: [] },
    'audio.bands': { title: 'Audio bands', i: [['buffer', 'AudioBuffer', 1]], o: [['bass', 'Float'], ['mid', 'Float'], ['treble', 'Float']] },
  };
  const RAINBOW = 'linear-gradient(90deg,#f33,#fc3,#3d6,#3cf,#93f)';
  const GRAPHS = {
    'candles': {
      nodes: [
        { id: 'flame', type: 'color.constant', col: 0, p: [['Hue', '32'], ['Saturation', '0.95'], ['Value', '1']] },
        { id: 'ember', type: 'color.constant', col: 0, p: [['Hue', '18'], ['Saturation', '1'], ['Value', '0.15']] },
        { id: 'candles', type: 'image.noise', col: 1, p: [['Width', '64'], ['Height', '36'], ['Cells', '16'], ['Rate', '6'], ['Seed', '7']] },
        { id: 'zones_hue', type: 'zones.sample', col: 2, p: [['Output', 'hue']] },
        { id: 'ease_hue', type: 'frame.smooth', col: 3, p: [['Output', 'hue'], ['Transition smoothing', '0']] },
        { id: 'send_hue', type: 'output.send', col: 4, p: [['Output', 'hue']] },
      ],
      links: [['flame', 'color', 'candles', 'color'], ['ember', 'color', 'candles', 'background'], ['candles', 'image', 'zones_hue', 'image'],
        ['zones_hue', 'frame', 'ease_hue', 'frame'], ['ease_hue', 'frame', 'send_hue', 'frame']],
    },
    'loudness-switch': {
      nodes: [
        { id: 'af', type: 'audio.features', col: 0, p: [] },
        { id: 'st', type: 'math.step', col: 1, p: [['Edge', '0.32'], ['Hysteresis', '0.03'], ['Invert', 'Off']] },
        { id: 'la', ghost: 'Your look A', col: 1, o: [['frame', 'Frame']] },
        { id: 'lb', ghost: 'Your look B', col: 1, o: [['frame', 'Frame']] },
        { id: 'mx', type: 'frame.mix', col: 2, p: [['Mode', 'normal'], ['Mix', '1']] },
      ],
      links: [['af', 'rms', 'st', 'value'], ['st', 'value', 'mx', 't'], ['la', 'frame', 'mx', 'a'], ['lb', 'frame', 'mx', 'b']],
    },
    'rgb-split': {
      nodes: [
        ...[['r', 'red', '0'], ['g', 'green', '120'], ['b', 'blue', '240']].map(([k, n, h], i) =>
          ({ id: 'c' + k, type: 'color.constant', col: 0, p: [['Hue', h], ['Saturation', '1'], ['Value', '1']] })),
        ...['r', 'g', 'b'].map((k) => ({ id: 'b' + k, type: 'frame.broadcast', col: 1, p: [['Output', 'Default']] })),
        { id: 'ab', type: 'audio.bands', col: 1, p: [['Bass ceiling', '250'], ['Treble floor', '4000']] },
        ...['r', 'g', 'b'].map((k) => ({ id: 's' + k, type: 'frame.brightnessScale', col: 2, p: [['Factor', '1']] })),
        { id: 'm1', type: 'frame.mix', col: 3, p: [['Mode', 'add'], ['Mix', '1']] },
        { id: 'm2', type: 'frame.mix', col: 4, p: [['Mode', 'add'], ['Mix', '1']] },
      ],
      links: [['cr', 'color', 'br', 'color'], ['cg', 'color', 'bg', 'color'], ['cb', 'color', 'bb', 'color'],
        ['br', 'frame', 'sr', 'frame'], ['bg', 'frame', 'sg', 'frame'], ['bb', 'frame', 'sb', 'frame'],
        ['ab', 'bass', 'sr', 'factor'], ['ab', 'mid', 'sg', 'factor'], ['ab', 'treble', 'sb', 'factor'],
        ['sr', 'frame', 'm1', 'a'], ['sg', 'frame', 'm1', 'b'], ['m1', 'frame', 'm2', 'a'], ['sb', 'frame', 'm2', 'b']],
    },
  };

  const sock = (t) => `<span class="sk circle" style="--c:${(TYPES[t] || TYPES.Float)[0]}"></span>`;
  function nodeHtml(n, linked) {
    if (n.ghost) {
      return `<div class="gn card ghost" data-id="${n.id}"><div class="gn-head">${n.ghost}</div><div class="gn-ports"><div></div><div class="gn-port out" data-port="${n.o[0][0]}">frame${sock('Frame')}</div></div></div>`;
    }
    const c = CAT[n.type];
    const ins = c.i.map(([nm, t, req]) => `<div class="gn-port in${req && !linked.has(n.id + '.' + nm) ? ' open' : ''}" data-port="${nm}">${sock(t)}${nm} <small>${t}</small></div>`).join('');
    const outs = c.o.map(([nm, t]) => `<div class="gn-port out" data-port="${nm}"><small>${t}</small> ${nm}${sock(t)}</div>`).join('');
    const ps = n.p.map(([l, v]) => l === 'Gradient'
      ? `<div class="gn-param"><div class="gn-param-row">${l}</div><div class="gn-gradient" style="background:${v}"></div></div>`
      : `<div class="gn-param"><div class="gn-param-row">${l}<b>${v}</b></div></div>`).join('');
    return `<div class="gn card" data-id="${n.id}"><div class="gn-head">${c.title}<span class="gn-more" aria-hidden="true">&middot;&middot;&middot;</span></div>` +
      `<div class="gn-ports"><div>${ins}</div><div>${outs}</div></div>${ps}</div>`;
  }

  // Builds the editor-look chain into el, then draws wires from the measured sockets.
  function buildChain(el, id) {
    const g = GRAPHS[id], NW = 240, GX = 80, GY = 24;
    const linked = new Set(g.links.map((l) => l[2] + '.' + l[3]));
    el.innerHTML = g.nodes.map((n) => nodeHtml(n, linked)).join('');
    const box = {}, colH = {};
    g.nodes.forEach((n) => { const e = el.querySelector(`[data-id="${n.id}"]`); e.style.width = NW + 'px'; e.style.position = 'absolute'; box[n.id] = { e, n }; });
    g.nodes.forEach((n) => { const b = box[n.id]; b.h = b.e.offsetHeight; colH[n.col] = (colH[n.col] || 0) + b.h + GY; });
    const total = Math.max(...Object.values(colH)) - GY, top = {};
    g.nodes.forEach((n) => {
      const b = box[n.id], y0 = (total - (colH[n.col] - GY)) / 2; top[n.col] = top[n.col] === undefined ? y0 : top[n.col];
      b.x = n.col * (NW + GX); b.y = top[n.col]; top[n.col] += b.h + GY;
      b.e.style.left = b.x + 'px'; b.e.style.top = b.y + 'px';
    });
    const W = (Math.max(...g.nodes.map((n) => n.col)) + 1) * NW + Math.max(...g.nodes.map((n) => n.col)) * GX;
    const at = (id2, port, out) => {
      const b = box[id2], row = b.e.querySelector(`.gn-port.${out ? 'out' : 'in'}[data-port="${port}"]`), r = row.getBoundingClientRect(), pr = el.getBoundingClientRect();
      return [b.x + (out ? NW : 0), r.top - pr.top + r.height / 2];
    };
    let svg = `<svg class="wires" width="${W}" height="${total}" aria-hidden="true">`;
    for (const [f, fp, t, tp] of g.links) {
      const [x1, y1] = at(f, fp, true), [x2, y2] = at(t, tp, false), ft = (CAT[box[f].n.type] || { o: box[f].n.o }).o.find((o) => o[0] === fp)[1], s = TYPES[ft] || TYPES.Float, k = Math.max(40, (x2 - x1) * 0.5);
      svg += `<path d="M${x1} ${y1} C${x1 + k} ${y1} ${x2 - k} ${y2} ${x2} ${y2}" fill="none" stroke="${s[0]}" stroke-width="${s[1] ? 3 : 2}"${s[2] ? ' stroke-dasharray="6 4"' : ''}/>`;
    }
    el.insertAdjacentHTML('afterbegin', svg + '</svg>');
    el.style.width = W + 'px'; el.style.height = total + 'px';
    return [W, total];
  }

  const W = 168, H = 56, GX = 70, GY = 28, PAD = 14;
  const pos = (n) => ({ x: PAD + n.col * (W + GX), y: PAD + n.row * (H + GY) });

  function svgFor(r, label) {
    const cols = Math.max(...r.nodes.map((n) => n.col)) + 1, rows = Math.max(...r.nodes.map((n) => n.row)) + 1;
    const w = PAD * 2 + cols * W + (cols - 1) * GX, h = PAD * 2 + rows * H + (rows - 1) * GY;
    const by = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
    let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" width="${w}">`;
    const into = {}, seen = {};
    for (const e of r.edges) into[e[1]] = (into[e[1]] || 0) + 1;
    for (const [f, t, port] of r.edges) {
      // Several wires into one node land at spread heights so their port labels do not overlap.
      const k = seen[t] = (seen[t] || 0) + 1, n = into[t];
      const a = pos(by[f]), b = pos(by[t]), x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + (H * k) / (n + 1), mx = (x1 + x2) / 2;
      s += `<path class="w" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2 - 6} ${y2}"/>`;
      s += `<path class="ah" d="M${x2} ${y2} l-7 -4 v8z"/>`;
      if (port) s += `<text class="pl" x="${x2 - 14}" y="${y2 - 6}" text-anchor="end">${port}</text>`;
    }
    for (const n of r.nodes) {
      const p = pos(n);
      s += `<rect class="n" x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="6"${n.ghost ? ' stroke-dasharray="4 3"' : ''}/>`;
      s += `<text class="nt" x="${p.x + 10}" y="${p.y + (n.p ? 21 : 30)}">${n.type}</text>`;
      if (n.p) s += `<text class="np" x="${p.x + 10}" y="${p.y + 38}">${n.p}</text>`;
    }
    return s + '</svg>';
  }

  function listFor(r) {
    const item = (s) => s.branches
      ? `<li class="br">${s.branches.map((b) => `<div class="br-col"><span class="br-label">${b.label}</span>${listFor({ steps: b.steps })}</div>`).join('')}</li>`
      : `<li><b>${s.t}</b>${s.p ? `<small>${s.p}</small>` : ''}${(s.join || []).map((j) => `<small class="join">${j}</small>`).join('')}</li>`;
    return '<ol class="dg-list">' + r.steps.map(item).join('') + '</ol>';
  }

  function meta(r) {
    if (state.meta === 'old') return `<p class="rc-io"><span><b>In</b> ${r.inp}</span><span><b>Out</b> ${r.out}</span><span><b>Layout</b> ${r.layout}</span></p>`;
    return `<p class="rc-io"><span><b>Needs</b> ${r.needs}</span></p>` + r.notes.map((n) => `<p class="rc-note">${n}</p>`).join('');
  }

  function head(r, primary) {
    return `<div class="rc-head"><div><h2>${r.name}</h2><p class="rc-desc">${r.desc}</p></div>` +
      `<button type="button" class="ui-button copy"${primary ? ' data-variant="primary"' : ''} data-copy="${r.id}">Copy</button></div>` + meta(r);
  }

  const FRAMES = {
    a: {
      label: 'A: generated SVG',
      cap: 'Flat list. Desktop draws the chain as an SVG from nodes, edges and saved positions. Under 650 px the same data renders as a text list, with a branch join named as "a: look A".',
      render: () => '<div class="rp-list frame-A">' + RECIPES.map((r) =>
        `<article class="rc">${head(r)}<div class="dg"><div class="dg-h">${svgFor(r, r.name + ' node chain')}</div><div class="dg-v">${listFor(r)}</div></div></article>`).join('') + '</div>',
    },
    c: {
      label: 'C: screenshots',
      cap: 'Same flat list. The chain is a fixed raster stand-in (here an SVG inside a dark box). It shrinks on phones with no vertical form. Alt text is hand written per recipe.',
      render: () => '<div class="rp-list frame-C">' + RECIPES.map((r) =>
        `<article class="rc">${head(r)}<div class="dg"><div class="shot">${svgFor(r, r.steps.map((s) => s.t).join(', '))}</div>` +
        `<p class="shot-note">Editor screenshot, retaken by hand on any node or port change.</p></div></article>`).join('') + '</div>',
    },
    b: {
      label: 'B: master-detail viewer',
      cap: 'Recipe list on the left, one read-only viewer on the right. The viewer mimics the editor: fit on load with minZoom 0.6 and maxZoom 1 (ViewMenu.tsx FIT_OPTIONS), drag to pan, wheel or the View menu (Zoom in, Zoom out, Fit view) to zoom. Copy is primary, and the React Flow credit sits bottom-centre as in the editor. On phones the list becomes a row of buttons.',
      render: (sel) => {
        const r = RECIPES[sel];
        const btn = (x, i) => `<button type="button" class="ui-button" data-pick="${i}" aria-current="${i === sel}">${x.name}</button>`;
        return `<div class="md"><div class="md-list" role="group" aria-label="Recipes">${RECIPES.map(btn).join('')}</div><div>` +
          `<div class="md-pick" role="group" aria-label="Recipes">${RECIPES.map(btn).join('')}</div>` +
          `<article class="rc">${head(r, true)}<div class="viewer-wrap">` +
          `<div class="viewer dg" id="viewer"><div class="vp" id="vp"><div class="ec" id="ec" data-recipe="${r.id}"></div></div>` +
          `<div class="vctl"><button type="button" class="ui-button view-btn" data-size="sm" id="viewbtn" aria-label="View menu" aria-haspopup="menu" aria-expanded="false"><span id="vzoom">View</span>${CHEV}</button>` +
          `<div class="ui-popover vmenu" id="vmenu" hidden><div class="ui-menu" role="menu" aria-label="View actions">` +
          `<div class="ui-menu-item" role="menuitem" tabindex="0" data-z="in">Zoom in</div><div class="ui-menu-item" role="menuitem" tabindex="0" data-z="out">Zoom out</div>` +
          `<div class="ui-menu-item" role="menuitem" tabindex="0" data-z="fit">Fit view</div></div></div></div>` +
          `<a class="vcredit" href="https://reactflow.dev" tabindex="-1">React Flow</a></div></div></article></div></div>`;
      },
    },
  };

  const page = document.getElementById('page'), frames = document.getElementById('frames');
  const cap = document.getElementById('caption'), measure = document.getElementById('measure');
  let sel = 0, timer = null;
  const state = { meta: 'needs' };

  function show() {
    const key = (location.hash || '#a').slice(1);
    const f = FRAMES[key] || FRAMES.a;
    frames.innerHTML = Object.entries(FRAMES).map(([k, v]) =>
      `<a class="ui-button" href="#${k}" aria-current="${v === f}">${v.label}</a>`).join('') +
      `<button type="button" class="ui-button mk-sw" data-meta="${state.meta === 'needs' ? 'old' : 'needs'}">Meta lines: ${state.meta === 'needs' ? 'Needs line (pitch)' : 'In / Out / Layout (current)'}</button>`;
    cap.textContent = f.cap;
    page.innerHTML = '<h1>Aurora graph recipes</h1><p class="rp-how">Press Copy, then paste into the graph editor with Ctrl+V.</p>' + f.render(sel);
    initViewer();
    requestAnimationFrame(() => {
      const card = page.querySelector('.rc'), dg = page.querySelector('svg:not([aria-hidden])') || document.getElementById('ec');
      const vis = (page.querySelector('.dg-v') && getComputedStyle(page.querySelector('.dg-v')).display !== 'none') ? page.querySelector('.dg-list') : dg;
      const cards = [...page.querySelectorAll('.rc')].map((c) => Math.round(c.getBoundingClientRect().height));
      measure.textContent = `Measured: window ${innerWidth} px, card heights ${cards.join(', ')} px, ` +
        `first chain ${vis ? Math.round(vis.getBoundingClientRect().width) + ' x ' + Math.round(vis.getBoundingClientRect().height) : 'n/a'} px.`;
    });
  }

  // Mimics React Flow in the editor: fitView({ minZoom: 0.6, maxZoom: 1 }), drag pan, zoom 0.2 to 2.
  function initViewer() {
    const v = document.getElementById('viewer'), vp = document.getElementById('vp');
    if (!v) return;
    const [cw, ch] = buildChain(document.getElementById('ec'), document.getElementById('ec').dataset.recipe);
    v.setAttribute('role', 'img'); v.setAttribute('aria-label', 'Node chain: ' + RECIPES.find((x) => x.id === document.getElementById('ec').dataset.recipe).steps.map((s) => s.t || s.branches.map((b) => b.label).join(', ')).join(', then '));
    let k = 1, x = 0, y = 0;
    const apply = () => { vp.style.transform = `translate(${x}px,${y}px) scale(${k})`; document.getElementById('vzoom').textContent = 'View ' + Math.round(k * 100) + '%'; };
    const fit = () => {
      const bw = v.clientWidth, bh = v.clientHeight;
      k = Math.min(1, Math.max(0.6, Math.min(bw / (cw + 40), bh / (ch + 40))));
      x = (bw - cw * k) / 2; y = (bh - ch * k) / 2; apply();
    };
    const zoom = (f, cx, cy) => { const nk = Math.min(2, Math.max(0.2, k * f)); x = cx - (cx - x) * nk / k; y = cy - (cy - y) * nk / k; k = nk; apply(); };
    v.addEventListener('wheel', (e) => { e.preventDefault(); const r = v.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    let drag = null;
    v.addEventListener('pointerdown', (e) => { if (e.target.closest('.vctl, .vcredit')) return; drag = { px: e.clientX, py: e.clientY, x, y }; v.setPointerCapture(e.pointerId); v.classList.add('grab'); });
    v.addEventListener('pointermove', (e) => { if (drag) { x = drag.x + e.clientX - drag.px; y = drag.y + e.clientY - drag.py; apply(); } });
    v.addEventListener('pointerup', () => { drag = null; v.classList.remove('grab'); });
    const menu = document.getElementById('vmenu'), btn = document.getElementById('viewbtn');
    const setOpen = (o) => { menu.hidden = !o; btn.setAttribute('aria-expanded', String(o)); if (o) menu.querySelector('.ui-menu-item').focus(); else if (document.activeElement && menu.contains(document.activeElement)) btn.focus(); };
    btn.addEventListener('click', () => setOpen(menu.hidden));
    const act = (b) => { const c = [v.clientWidth / 2, v.clientHeight / 2]; setOpen(false); if (b.dataset.z === 'fit') fit(); else zoom(b.dataset.z === 'in' ? 1.25 : 0.8, c[0], c[1]); };
    menu.querySelectorAll('[data-z]').forEach((b) => {
      b.addEventListener('click', () => act(b));
      b.addEventListener('keydown', (e) => {
        const items = [...menu.querySelectorAll('.ui-menu-item')], i = items.indexOf(b);
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(b); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i + items.length - 1) % items.length].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      });
    });
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false); });
    fit();
  }

  document.addEventListener('click', (e) => {
    const mt = e.target.closest('[data-meta]');
    if (mt) { state.meta = mt.dataset.meta; show(); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) { sel = +pick.dataset.pick; show(); return; }
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const r = RECIPES.find((x) => x.id === btn.dataset.copy);
    const clip = JSON.stringify({ mark: 'aurora-graph-clip', recipe: r.id });
    try { navigator.clipboard.writeText(clip); } catch (err) { /* mock only */ }
    btn.innerHTML = CHECK + 'Copied'; btn.setAttribute('data-done', '');
    clearTimeout(timer);
    timer = setTimeout(() => { btn.textContent = 'Copy'; btn.removeAttribute('data-done'); }, 2000);
  });
  addEventListener('hashchange', show);
  addEventListener('resize', show);
  show();
})();
