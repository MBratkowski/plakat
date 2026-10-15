// Style editor dialog: engine, params and palettes with a live preview on real titles.
// createEditor({ state, save, onCommit }) -> { open(baseStyle, { isNew, channelKey }) }
//   state: { settings, seen }, read on every open so it follows storage sync.
(() => {
  const P = globalThis.Plakat;
  const { $, el, SAMPLES, thumb, avatar, downloadStyle } = P.ui;

  const PALETTE_SLOTS = [P.t('paletteBackground'), P.t('paletteText'), P.t('paletteAccent1'), P.t('paletteAccent2'), P.t('paletteAccent3')];

  const hsl = (h, s, l) => {
    s /= 100; l /= 100;
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  const randomPalette = () => {
    const r = Math.random;
    const dark = r() < 0.35;
    const hue = Math.floor(r() * 360);
    return [
      dark ? hsl(hue, 10, 9) : hsl(hue, 24, 92),
      dark ? hsl(hue, 18, 92) : hsl(hue, 22, 9),
      hsl((hue + 150 + r() * 60) % 360, 78, 52),
      hsl((hue + 30 + r() * 50) % 360, 62, dark ? 62 : 32),
      hsl((hue + 90 + r() * 80) % 360, 72, 60),
    ];
  };

  P.ui.createEditor = ({ state, save, onCommit }) => {
    const dlg = $('#editor');
    let draft = null, assignKey = null;

    const recentChannels = () => Object.keys(state.seen)
      .sort((a, b) => (state.seen[b].last || 0) - (state.seen[a].last || 0))
      .slice(0, 60);

    const fillSources = () => {
      const keys = recentChannels();
      $('#edSource').replaceChildren(
        el('option', { value: '__samples', text: P.t('editorSampleTitles') }),
        ...keys.map((k) => el('option', { value: k, text: state.seen[k].name || k })));
      $('#edSource').value = assignKey && state.seen[assignKey] ? assignKey : keys[0] || '__samples';
    };

    // The channel the preview runs on: a seen channel, or sample titles.
    const previewChannel = () => {
      const key = $('#edSource').value;
      const ch = key !== '__samples' && state.seen[key];
      const items = ch ? ch.items.slice(0, 6) : SAMPLES.slice();
      while (items.length < 6) items.push(SAMPLES[items.length]);
      const channelKey = ch ? key : 'samples';
      return {
        ch, items, channelKey,
        channelName: ch ? ch.name : P.t('editorSampleChannel'),
        avatarUrl: ch?.avatar || null,
        salt: (state.settings.channels[channelKey] || {}).salt || 0,
      };
    };

    let pvTimer = 0;
    const refreshPreview = () => {
      clearTimeout(pvTimer);
      pvTimer = setTimeout(() => {
        const { ch, items, channelKey, channelName, avatarUrl, salt } = previewChannel();
        const opts = { channelKey, channelName, salt };
        $('#edSourceNote').textContent = ch ? P.t('editorSourceNote', ch.items.length) : '';
        // Avatar at the sizes YouTube uses: channel header, watch page, guide.
        $('#edAvatar').replaceChildren(
          ...[96, 40, 24].map((size) => avatar(draft, { ...opts, avatarUrl, size })),
          el('span', { class: 'muted tiny', text: P.t('editorAvatarCaption', channelName) }));
        const grid = items.map((it) => thumb(draft, { ...it, ...opts }));
        grid.splice(3, 0, thumb(draft, { ...items[0], ...opts, portrait: true }));
        $('#edPreview').replaceChildren(...grid);
        $('#edPalPreview').replaceChildren(...draft.palettes.map((pal) => thumb({ ...draft, palettes: [pal] }, { ...items[1], ...opts })));
        $('#edSaveAssign').hidden = !ch;
        if (ch) $('#edSaveAssign').textContent = P.t('editorSaveAssignTo', channelName);
      }, 40);
    };

    const renderParams = () => {
      const engine = P.ENGINES[draft.engine];
      const vals = { ...engine.defaults, ...draft.params };
      $('#edParams').replaceChildren(...engine.schema.map((f) => {
        if (f.type === 'select') {
          const s = el('select', {}, f.options.map(([v, l]) => el('option', { value: v, text: l })));
          s.value = String(vals[f.key]);
          s.onchange = () => { draft.params[f.key] = s.value; refreshPreview(); };
          return el('label', { class: 'field' }, el('span', { text: f.label }), s);
        }
        if (f.type === 'bool') {
          const c = el('input', { type: 'checkbox', class: 'switch', checked: !!vals[f.key] });
          c.onchange = () => { draft.params[f.key] = c.checked; refreshPreview(); };
          return el('label', { class: 'p-bool' }, el('span', { text: f.label }), c);
        }
        const out = el('output', { text: (+vals[f.key]).toFixed(1) });
        const r = el('input', { type: 'range', min: f.min, max: f.max, step: f.step, value: String(vals[f.key]) });
        r.oninput = () => { draft.params[f.key] = +r.value; out.textContent = (+r.value).toFixed(1); refreshPreview(); };
        return el('label', { class: 'p-range' }, f.label, el('div', {}, r, out));
      }));
    };

    const renderPalettes = () => {
      $('#edPalettes').replaceChildren(...draft.palettes.map((pal, pi) => el('div', { class: 'pal-row' },
        PALETTE_SLOTS.map((n, ci) => {
          const inp = el('input', { type: 'color', title: n, 'aria-label': P.t('paletteColorLabel', n, pi + 1), value: pal[ci] || pal[1] });
          inp.oninput = () => { draft.palettes[pi][ci] = inp.value; refreshPreview(); };
          return inp;
        }),
        draft.palettes.length > 1
          ? el('button', { type: 'button', class: 'btn small ghost x', title: P.t('paletteRemove'), text: '✕', onclick: () => { draft.palettes.splice(pi, 1); renderPalettes(); refreshPreview(); } })
          : null)));
    };

    const open = (base, { isNew, channelKey = null }) => {
      draft = JSON.parse(JSON.stringify(base));
      draft.params ||= {};
      // Every palette gets all five slots so each one has a colour picker.
      draft.palettes = draft.palettes.map((p) => {
        const q = p.slice(0, 5);
        while (q.length < 5) q.push(q[q.length - 2] || q[1]);
        return q;
      });
      delete draft.builtin;
      assignKey = channelKey;
      if (isNew) {
        draft.id = P.newStyleId();
        const seenName = channelKey && state.seen[channelKey]?.name;
        draft.name = (seenName ? `${seenName} — ${base.name}` : P.t('styleCopyName', base.name)).slice(0, 40);
      }
      $('#edName').value = draft.name;
      $('#edEngine').replaceChildren(...Object.values(P.ENGINES).map((e) => el('option', { value: e.id, text: e.label })));
      $('#edEngine').value = draft.engine;
      fillSources();
      renderParams();
      renderPalettes();
      refreshPreview();
      if (!dlg.open) dlg.showModal();
    };

    const commit = (assign) => {
      const { settings } = state;
      const style = JSON.parse(JSON.stringify(draft));
      const i = settings.customStyles.findIndex((s) => s.id === style.id);
      if (i >= 0) settings.customStyles[i] = style;
      else {
        settings.customStyles.push(style);
        if (!assign) settings.pool.push(style.id);
      }
      if (assign) (settings.channels[assign] ||= {}).styleId = style.id;
      save();
      dlg.close();
      onCommit();
    };

    $('#edName').oninput = (e) => { draft.name = e.target.value || P.t('styleUntitled'); };
    $('#edEngine').onchange = (e) => {
      draft.engine = e.target.value;
      const keys = P.ENGINES[draft.engine].schema.map((f) => f.key);
      for (const k of Object.keys(draft.params)) if (!keys.includes(k)) delete draft.params[k];
      delete draft.params.font; // a new engine starts with its own typeface
      renderParams();
      refreshPreview();
    };
    $('#edSource').onchange = refreshPreview;
    $('#edRandPal').onclick = () => { draft.palettes.unshift(randomPalette()); renderPalettes(); refreshPreview(); };
    $('#edAddPal').onclick = () => { draft.palettes.push([...draft.palettes[draft.palettes.length - 1]]); renderPalettes(); refreshPreview(); };
    $('#edCancel').onclick = () => dlg.close();
    $('#edExport').onclick = () => downloadStyle(draft);
    $('#edSave').onclick = () => commit(null);
    $('#edSaveAssign').onclick = () => commit($('#edSource').value);

    return { open, isOpen: () => dlg.open };
  };
})();
