// Options page: general switches, seen channels, the style library, topic pools and the editor.
(async () => {
  const P = Plakat;
  const { $, el, localize, SAMPLES, thumb, avatar, downloadStyle, confirmButton } = P.ui;

  localize();
  await P.loadFonts();
  const state = { settings: await P.loadSettings(), seen: await P.loadSeen(), topics: await P.loadTopics() };
  const save = () => P.saveSettings(state.settings);
  const editor = P.ui.createEditor({
    state, save,
    onCommit: () => { renderStyles(); renderChannels(); renderTopics(); },
  });

  // ---------- Header ----------
  const heroArt = () => {
    const styles = P.BUILTIN_STYLES;
    let i = 0;
    const draw = () => {
      const style = styles[i++ % styles.length];
      $('#heroArt').replaceChildren(P.toDom(P.render({ style, title: P.t('optionsHeroTitle'), channelName: style.name, channelKey: 'hero' + i, vid: 'hero' + i })));
    };
    draw();
    setInterval(draw, 3200);
  };

  // ---------- 01 General (and the topic switch in 04) ----------
  const SWITCHES = ['enabled', 'hoverReveal', 'avatars', 'commentAvatars', 'byTopic'];
  const renderGeneral = () => {
    for (const key of SWITCHES) {
      const box = $('#' + key);
      box.checked = !!state.settings[key];
      box.onchange = () => {
        state.settings[key] = box.checked;
        save();
        renderGeneral();
        if (key === 'byTopic') { renderChannels(); renderTopics(); }
      };
    }
    // Comment avatars only make sense while channel avatars are on.
    $('#commentAvatars').disabled = !state.settings.avatars;
    $('#commentAvatars').closest('.switch-row').classList.toggle('off', !state.settings.avatars);
  };

  // ---------- 02 Channels ----------
  let chLimit = 25;
  const topicLine = (topic, fromTopic) => el('div', { class: 'ch-topic muted', 'data-topic': topic || '' },
    topic ? P.t('channelTopic', P.topicName(topic)) : P.t('channelTopicUnknown'),
    fromTopic ? el('span', { class: 'topic-pool', text: P.t('channelTopicPool') }) : null);

  const channelRow = (key, ch) => {
    const { settings } = state;
    const topic = state.topics[key];
    const { style, salt, pinned, fromTopic } = P.resolveStyle(settings, key, topic);
    const auto = P.resolveStyle({ ...settings, channels: { ...settings.channels, [key]: { salt } } }, key, topic).style;
    const items = (ch.items || []).slice(0, 3);
    while (items.length < 3) items.push(SAMPLES[items.length]);
    const series = { channelKey: key, channelName: ch.name, salt };

    const sel = el('select', { 'aria-label': P.t('channelStyleLabel', ch.name) },
      el('option', { value: '', text: P.t('channelRandomStyle', auto.name) }),
      P.allStyles(settings).map((s) => el('option', { value: s.id, text: s.name + (s.builtin ? '' : ' ★') })));
    sel.value = pinned ? style.id : '';
    sel.onchange = () => {
      const conf = (settings.channels[key] ||= {});
      if (sel.value) conf.styleId = sel.value;
      else delete conf.styleId;
      if (!conf.styleId && !conf.salt) delete settings.channels[key];
      save();
      row.replaceWith(channelRow(key, ch));
    };

    const row = el('div', { class: 'ch-row' },
      el('div', { class: 'ch-thumbs' },
        avatar(style, { ...series, avatarUrl: ch.avatar || null }),
        items.map((it) => thumb(style, { ...it, ...series }))),
      el('div', { class: 'ch-info' },
        el('div', { class: 'ch-name' }, ch.name || key, pinned ? el('span', { class: 'pin', text: P.t('channelPinned') }) : null),
        el('div', { class: 'ch-key muted', text: key.startsWith('name:') ? P.t('channelNoLink') : key }),
        topicLine(topic, fromTopic),
        sel,
        el('div', { class: 'ch-actions' },
          el('button', {
            class: 'btn small', text: P.t('channelReroll'), title: P.t('channelRerollHint'),
            onclick: () => {
              const conf = (settings.channels[key] ||= {});
              conf.salt = (conf.salt || 0) + 1;
              save();
              row.replaceWith(channelRow(key, ch));
            },
          }),
          el('button', {
            class: 'btn small ghost', text: P.t('channelOwnStyle'),
            onclick: () => editor.open(style, { isNew: style.builtin, channelKey: key }),
          }))));
    return row;
  };

  // The seen list lives only in this browser; the data note says so and lets the user wipe it.
  const clearSeen = confirmButton(P.t('channelsClear'), async () => {
    await P.clearSeen();
    state.seen = {};
    state.topics = {};
    renderChannels();
    renderTopics();
  });
  clearSeen.id = 'clearSeen';
  $('#dataNote').appendChild(clearSeen);

  const renderChannels = () => {
    const { seen } = state;
    const box = $('#channels');
    clearSeen.disabled = !Object.keys(seen).length;
    const q = $('#chSearch').value.trim().toLowerCase();
    const keys = Object.keys(seen)
      .filter((k) => !q || k.includes(q) || (seen[k].name || '').toLowerCase().includes(q))
      .sort((a, b) => (seen[b].last || 0) - (seen[a].last || 0));
    if (!keys.length) {
      box.replaceChildren(el('div', { class: 'empty' },
        el('b', { text: q ? P.t('channelsNoMatch') : P.t('channelsEmpty') }),
        q ? '' : P.t('channelsEmptyHint')));
      return;
    }
    box.replaceChildren(...keys.slice(0, chLimit).map((k) => channelRow(k, seen[k])));
    if (keys.length > chLimit) {
      box.appendChild(el('button', {
        class: 'btn more', text: P.t('channelsShowMore', keys.length - chLimit),
        onclick: () => { chLimit += 25; renderChannels(); },
      }));
    }
  };
  $('#chSearch').addEventListener('input', () => { chLimit = 25; renderChannels(); });

  // ---------- 03 Styles ----------

  const removeStyle = (id) => {
    const { settings } = state;
    settings.customStyles = settings.customStyles.filter((s) => s.id !== id);
    settings.pool = settings.pool.filter((x) => x !== id);
    for (const t of Object.keys(settings.topicPools)) settings.topicPools[t] = settings.topicPools[t].filter((x) => x !== id);
    for (const c of Object.values(settings.channels)) if (c.styleId === id) delete c.styleId;
    save();
    renderStyles();
    renderChannels();
    renderTopics();
  };

  const renderStyles = () => {
    const { settings } = state;
    $('#styles').replaceChildren(...P.allStyles(settings).map((style) => {
      const pool = el('input', { type: 'checkbox', class: 'switch', checked: settings.pool.includes(style.id) });
      pool.onchange = () => {
        settings.pool = pool.checked ? [...new Set([...settings.pool, style.id])] : settings.pool.filter((x) => x !== style.id);
        save();
        renderChannels();
      };
      return el('div', { class: 'st-card' },
        el('div', { class: 'st-strip' },
          [0, 1, 2].map((i) => thumb(style, { ...SAMPLES[i], channelKey: `card-${style.id}-${i}`, channelName: [P.t('styleCardChannel1'), P.t('styleCardChannel2'), P.t('styleCardChannel3')][i] }))),
        el('div', { class: 'st-meta' },
          el('div', {},
            el('div', { class: 'st-name', text: style.name }),
            el('div', { class: 'st-sub muted', text: P.t('styleMeta', P.t(style.builtin ? 'styleKindBuiltin' : 'styleKindCustom'), P.ENGINES[style.engine]?.label || style.engine, style.palettes.length) })),
          el('label', { class: 'st-pool', title: P.t('stylePoolHint') }, P.t('stylePool'), pool)),
        el('div', { class: 'st-actions' },
          style.builtin
            ? el('button', { class: 'btn small', 'data-act': 'dup', text: P.t('styleDuplicateEdit'), onclick: () => editor.open(style, { isNew: true }) })
            : [
              el('button', { class: 'btn small primary', text: P.t('styleEdit'), onclick: () => editor.open(style, { isNew: false }) }),
              el('button', { class: 'btn small', text: P.t('styleDuplicate'), onclick: () => editor.open(style, { isNew: true }) }),
              el('button', { class: 'btn small ghost', text: P.t('styleExport'), onclick: () => downloadStyle(style) }),
              confirmButton(P.t('styleDelete'), () => removeStyle(style.id)),
            ]));
    }));
  };

  // ---------- 04 Topics ----------
  // One row per topic: how many listed channels have it, and the styles its pool draws from.
  const renderTopics = () => {
    const { settings, seen, topics } = state;
    // Rows are rebuilt on every change; keep keyboard focus on the chip that had it.
    const active = document.activeElement;
    const focus = active?.closest?.('.tp-row') ? [active.closest('.tp-row').dataset.topic, active.value] : null;
    const counts = {};
    for (const key of Object.keys(seen)) if (topics[key]) counts[topics[key]] = (counts[topics[key]] || 0) + 1;
    $('#topics').classList.toggle('off', !settings.byTopic);
    $('#topics').replaceChildren(...P.TOPICS.map((topic) => {
      const ids = settings.topicPools[topic.id];
      return el('div', { class: 'tp-row', 'data-topic': topic.id },
        el('div', { class: 'tp-name' },
          el('b', { text: topic.name }),
          el('div', { class: 'muted tiny', text: P.t('topicChannels', counts[topic.id] || 0) })),
        el('div', { class: 'tp-styles', role: 'group', 'aria-label': P.t('topicPoolLabel', topic.name) },
          P.allStyles(settings).map((style) => {
            const box = el('input', { type: 'checkbox', value: style.id, checked: ids.includes(style.id) });
            box.onchange = () => {
              settings.topicPools[topic.id] = box.checked ? [...new Set([...ids, style.id])] : ids.filter((x) => x !== style.id);
              save();
              renderTopics();
              renderChannels();
            };
            return el('label', { class: 'tp-chip' }, box, style.name);
          }),
          ids.length ? null : el('span', { class: 'muted tiny tp-empty', text: P.t('topicPoolEmpty') })));
    }));
    if (focus) $(`.tp-row[data-topic="${focus[0]}"] input[value="${focus[1]}"]`)?.focus();
  };

  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const style = P.sanitizeStyle(JSON.parse(await file.text()));
      state.settings.customStyles.push(style);
      state.settings.pool.push(style.id);
      await save();
      renderStyles();
      renderTopics();
      editor.open(style, { isNew: false });
    } catch (err) {
      $('#importBtn').textContent = P.t('stylesImportError', err.message);
      setTimeout(() => ($('#importBtn').textContent = P.t('stylesImport')), 3500);
    }
  };

  // ---------- Sync with other tabs ----------
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      state.settings = P.normalizeSettings(changes.settings.newValue);
      renderGeneral();
    }
    if (changes.seen) {
      const before = Object.keys(state.seen).length;
      state.seen = changes.seen.newValue || {};
      if (Object.keys(state.seen).length !== before && !editor.isOpen()) renderChannels();
    }
    // A newly detected topic can change a channel's style.
    if (changes.topics) {
      state.topics = changes.topics.newValue || {};
      if (!editor.isOpen()) renderChannels();
    }
    if (changes.settings || changes.topics) renderTopics();
  });

  heroArt();
  renderGeneral();
  renderChannels();
  renderStyles();
  renderTopics();
  document.body.dataset.ready = '1';
})();
