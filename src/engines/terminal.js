// Terminal: a CRT console. A command built from the title runs, the title is its output,
// and a phosphor cursor waits on the last line.
(() => {
  const P = globalThis.Plakat;
  const { h } = P;
  const { WEIGHTS, CAP, photo, lineSize } = P.kit;

  // ASCII only: the bundled font subsets have no ❯ or λ.
  const PROMPTS = ['$', '>', '%', '#', '=>'];
  const VERBS = ['./', 'run ', 'play ', 'cat '];
  const SHELLS = ['zsh', 'bash', 'fish', 'sh'];
  // Scrollback above the current command: [command, output?].
  const HISTORY = [
    ['ls', 'episodes/  notes.md  thumbs/'],
    ['git pull', 'Already up to date.'],
    ['uptime', 'up 42 days, load average: 0.12'],
    ['wc -l notes.md', '128 notes.md'],
    ['make', "make: Nothing to be done for 'all'."],
    ['whoami', null],
    ['clear', null],
  ];

  const weights = (font) => WEIGHTS[font] || WEIGHTS['JetBrains Mono'];
  const isDark = (hex) => P.luminance(hex) < 0.2;

  // One line of differently coloured runs: segs = [[text, fill, weight?], ...].
  const runs = (segs, { x, y, size, font, weight }) => h('text', {
    x, y: y.toFixed(2), 'font-family': P.fontCss(font), 'font-size': size.toFixed(2), 'font-weight': weight,
  }, segs.filter(Boolean).map(([t, fill, w]) => h('tspan', { fill, 'font-weight': w }, t)));

  // Cuts the last run so the whole line fits maxW, ending it with an ellipsis.
  const fitRuns = (segs, { size, font, weight, maxW }) => {
    const width = (list) => P.measure(list.map((s) => s[0]).join(''), { font, weight, size });
    const out = segs.filter(Boolean).map((s) => s.slice());
    while (out.length && width(out) > maxW) {
      const last = out[out.length - 1];
      if (last[0].length > 2) last[0] = last[0].slice(0, -2) + '…';
      else out.pop();
    }
    return out;
  };

  // Horizontal scanlines over the whole frame, plus a vignette on dark glass.
  const glass = (x, { W, H, step, vignette }) => {
    const n = x.uid++;
    const dark = isDark(x.pal.bg);
    return [
      h('defs', {},
        h('pattern', { id: `@scan${n}`, width: 8, height: step.toFixed(2), patternUnits: 'userSpaceOnUse' },
          h('rect', { x: 0, y: 0, width: 8, height: (step * 0.45).toFixed(2), fill: '#000' })),
        vignette && dark ? h('radialGradient', { id: `@vig${n}`, cx: '50%', cy: '50%', r: '75%' },
          h('stop', { offset: '0.55', 'stop-color': '#000', 'stop-opacity': 0 }),
          h('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': 0.55 })) : null),
      h('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#@scan${n})`, opacity: dark ? 0.32 : 0.07 }),
      vignette && dark ? h('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#@vig${n})` }) : null,
    ];
  };

  P.defineEngine('terminal', {
    label: P.t('engineTerminal'),
    comps: [P.t('terminalCompWindow'), P.t('terminalCompFull')],
    defaults: { font: 'JetBrains Mono', case: 'asis', composition: 'auto', showChannel: true, showNumber: true, photo: false, density: 1 },

    series: (x) => ({
      comp: x.comp(2),
      prompt: x.c.pick(PROMPTS),
      verb: x.c.pick(VERBS),
      shell: x.c.pick(SHELLS),
      glow: x.c.chance(0.6),
    }),

    render(x) {
      const { W, H, u, m, pal, p, v, portrait } = x;
      const { comp, prompt, verb, shell, glow } = x.series;
      const font = p.font;
      const wt = weights(font);
      const out = [];
      const windowed = comp === 0;
      const slug = P.identifier(x.channel.split(/\s+/), 'kebab') || 'home';
      const path = p.showChannel ? `~/${slug}` : '~';
      let top = m;

      if (windowed) {
        const barH = u * 0.1;
        out.push(h('rect', { x: 0, y: 0, width: W, height: barH, fill: pal.fg, opacity: 0.08 }));
        [0, 1, 2].forEach((i) => out.push(h('circle', {
          cx: (m * 0.8 + i * barH * 0.42).toFixed(2), cy: (barH / 2).toFixed(2), r: (barH * 0.13).toFixed(2),
          fill: i === 0 ? pal.a1 : pal.a2, opacity: i === 0 ? 1 : 0.7,
        })));
        out.push(h('text', {
          x: W / 2, y: (barH * 0.64).toFixed(2), 'text-anchor': 'middle', fill: pal.a2,
          'font-family': P.fontCss(font), 'font-size': (barH * 0.34).toFixed(2), 'font-weight': wt.r,
        }, `${slug} — ${shell}`));
        top = barH + m * 0.7;
      }

      // The thumbnail as a phosphor image beside (or above) the output.
      let right = W - m;
      if (p.photo) {
        if (portrait) {
          const ph = H * 0.3;
          out.push(photo(x, { px: m, py: top, pw: W - 2 * m, ph, dark: pal.bg, light: pal.fg }));
          top += ph + m * 0.6;
        } else {
          const pw = W * 0.36;
          out.push(photo(x, { px: W - pw, py: windowed ? u * 0.1 : 0, pw, ph: H - (windowed ? u * 0.1 : 0), dark: pal.bg, light: pal.fg }));
          right = W - pw - m * 0.8;
        }
      }
      const width = right - m;

      const s = u * (portrait ? 0.042 : 0.05);
      const ident = P.titleIdentifier(x.mainRaw, 'kebab') || 'feed';
      const command = fitRuns([
        [path, pal.a2],
        [` ${prompt} `, pal.a1, wt.b],
        [`${verb}${ident}`, pal.fg],
        p.showNumber && x.number ? [` --ep ${x.number}`, pal.a1] : null,
      ], { size: s, font, weight: wt.r, maxW: width });

      // The output: the title, as large as the screen allows. The block sits at the
      // bottom like a scrolled console; earlier commands fill the space above it.
      const tail = (x.sub ? s * 1.9 : 0) + s * 2.2;
      const f = P.fit(x.main, {
        font, weight: wt.b, tracking: 0, maxW: width, maxH: H - m - top - s * 2 - tail,
        maxSize: u * (portrait ? 0.15 : 0.2), minSize: u * 0.05, lh: 1.08, maxLines: portrait ? 8 : 4,
      });
      const blockH = s * 2 + f.height + s * 0.5 + tail;
      const blockTop = Math.max(top, H - m * 0.9 - blockH);
      const rows = Math.floor((blockTop - top) / (s * 1.55));
      if (rows > 0) {
        const lines = v.shuffle(HISTORY).flatMap(([cmd, res]) => [[`${prompt} ${cmd}`, 0.65], res && [res, 0.42]]).filter(Boolean).slice(-rows);
        lines.forEach(([text, opacity], i) => out.push(h('text', {
          x: m, y: (blockTop - (lines.length - i) * s * 1.55 + s * 0.85).toFixed(2), fill: pal.a2, opacity,
          'font-family': P.fontCss(font), 'font-size': s.toFixed(2), 'font-weight': wt.r,
        }, P.truncate(text, s, width, { font, weight: wt.r }, false))));
      }
      out.push(runs(command, { x: m, y: blockTop + s * 0.85, size: s, font, weight: wt.r }));
      const outTop = blockTop + s * 2;
      if (glow) out.push(P.textBlock(f, { x: m, y: outTop, fill: pal.fg, extra: { stroke: pal.fg, 'stroke-width': (f.size * 0.1).toFixed(2), 'stroke-linejoin': 'round', opacity: 0.16 } }));
      out.push(P.textBlock(f, { x: m, y: outTop, fill: pal.fg }));
      let y = outTop + f.height + s * 0.5;

      if (x.sub) {
        out.push(runs(fitRuns([[`# ${x.sub}`, pal.a2]], { size: s, font, weight: wt.r, maxW: width }), { x: m, y: y + s * 0.85, size: s, font, weight: wt.r }));
        y += s * 1.9;
      }

      // A fresh prompt and the cursor block.
      const promptW = P.measure(`${prompt} `, { font, weight: wt.b, size: s });
      const capH = s * (CAP[font] ?? 0.72);
      out.push(runs([[`${prompt} `, pal.a1, wt.b]], { x: m, y: y + s * 0.85, size: s, font, weight: wt.r }));
      out.push(h('rect', {
        x: (m + promptW).toFixed(2), y: (y + s * 0.85 - capH * 1.12).toFixed(2),
        width: (P.measure('0', { font, weight: wt.r, size: s }) * v.range(0.95, 1.05)).toFixed(2), height: (capH * 1.3).toFixed(2), fill: pal.a1,
      }));

      out.push(...glass(x, { W, H, step: Math.max(2, (u * 0.013) / p.density), vignette: !windowed }));
      if (!windowed) {
        out.push(h('rect', {
          x: (u * 0.025).toFixed(2), y: (u * 0.025).toFixed(2), width: (W - u * 0.05).toFixed(2), height: (H - u * 0.05).toFixed(2),
          rx: (u * 0.06).toFixed(2), fill: 'none', stroke: pal.fg, 'stroke-width': Math.max(1, u * 0.004).toFixed(2), opacity: 0.18,
        }));
      }
      return out;
    },

    // Initials and the cursor block on the channel's glass.
    renderAvatar(x) {
      const { pal, p } = x;
      const font = p.font;
      const wt = weights(font);
      const text = P.applyCase(x.initials, p.case);
      const size = lineSize(text + '0', { font, weight: wt.k, maxW: 60, maxCap: 30 });
      const tw = P.measure(text, { font, weight: wt.k, size });
      const cw = P.measure('0', { font, weight: wt.k, size });
      const gap = size * 0.1;
      const x0 = 50 - (tw + gap + cw) / 2;
      const capH = size * (CAP[font] ?? 0.72);
      const base = 50 + capH / 2;
      return [
        h('text', {
          x: x0.toFixed(2), y: base.toFixed(2), fill: pal.fg, 'font-family': P.fontCss(font),
          'font-size': size.toFixed(2), 'font-weight': wt.k,
        }, text),
        h('rect', { x: (x0 + tw + gap).toFixed(2), y: (base - capH).toFixed(2), width: cw.toFixed(2), height: capH.toFixed(2), fill: pal.a1 }),
        ...glass(x, { W: 100, H: 100, step: 3, vignette: true }),
      ];
    },
  });
})();
