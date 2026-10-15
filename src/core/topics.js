// Channel topics from what the content script already sees: video titles, the channel
// name, and on watch and channel pages the meta keywords and category. Heuristics only,
// no network. The keyword table below is the whole vocabulary.
(() => {
  const P = (globalThis.Plakat ??= {});

  // Keywords are lowercase ASCII and match whole words of the lowercased, ASCII-folded
  // text (P.asciiFold), so case and Polish diacritics in titles do not matter. A trailing
  // * matches any ending ("programow*": programowanie, programowania); phrases match words
  // in a row.
  // Words that are common in other topics or in plain Polish are left out on purpose
  // ("nas", "git", "rust", "react", "gra", "mario"), because a topic, once given, stays.
  // 'other' has no keywords: a channel gets it after many titles that match nothing.
  P.TOPICS = [
    {
      id: 'tech', name: P.t('topicTech'),
      keywords: 'linux, ubuntu, debian, fedora, windows 11, macos, python, javascript, typescript, java, kotlin, swiftui, ' +
        'golang, php, html, css, sql, postgres*, mysql, programow*, programist*, programming, programmer*, coding, koduj*, ' +
        'developer*, devops, frontend, backend, fullstack, full stack, api, sdk, framework*, reactjs, react native, nodejs, ' +
        'node js, vuejs, angular, docker, kubernetes, k8s, homelab, serwer*, proxmox, raspberry, arduino, esp32, ' +
        'android, ios, iphone, ipad, macbook, smartfon*, smartphone*, laptop*, komputer*, computer*, procesor*, processor*, ' +
        'cpu, gpu, nvidia, geforce, radeon, ryzen, intel, mini pc, chatgpt, gpt, llm, ai, sztuczn* inteligencj*, ' +
        'machine learning, uczenie maszynowe, algorytm*, algorithm*, github, gitlab, vscode, vs code, neovim, vim, bash, ' +
        'baza danych, bazy danych, database*, cyberbezpieczenst*, cybersecurity, haker*, hacker*, hacking, open source, ' +
        'self hosted, selfhosted, jetpack compose, coroutine*, concurrency, kompilator*, compiler*, refaktor*, refactor*',
    },
    {
      id: 'reviews', name: P.t('topicReviews'),
      keywords: 'recenzj*, review*, unboxing, rozpakowanie, test, testuj*, porownani*, comparison, opini*, first look, ' +
        'pierwsze wrazenia, first impressions, hands on, czy warto, worth it, warto kupic, nie kupuj, dont buy, ' +
        'po miesiacu uzytkowania, po roku uzytkowania, long term review, ocena, oceniam',
    },
    {
      id: 'music', name: P.t('topicMusic'),
      keywords: 'official video, official music video, official audio, teledysk*, lyric*, tekst piosenki, piosenk*, cover, ' +
        'live session, koncert*, concert*, album*, singiel, remix, feat, acoustic, akustycz*, gitar*, guitar*, pianin*, ' +
        'piano, perkusj*, drums, muzyk*, music, rap, hip hop, jazz, mixtape, type beat, dj set, unplugged, orkiestr*, ' +
        'orchestra, symfoni*, akord*, chords',
    },
    {
      id: 'gaming', name: P.t('topicGaming'),
      keywords: 'gameplay, lets play, let s play, minecraft, fortnite, gta, cs2, counter strike, valorant, league of legends, ' +
        'wiedzmin*, witcher, cyberpunk, elden ring, zelda, pokemon, super mario, nintendo, playstation, ps5, xbox, steam deck, ' +
        'speedrun*, walkthrough, gry, gier, gamer*, gaming, esport*, rpg, mmo, mmorpg, roblox, genshin, hearthstone, dota, ' +
        'tekken, boss fight, dlc',
    },
    {
      id: 'cooking', name: P.t('topicCooking'),
      keywords: 'przepis, przepisy na, recipe*, gotowanie, gotuj*, ugotuj*, kuchni*, cooking, cook, chef, szef kuchni, ' +
        'kuchar*, obiad*, kolacj*, sniadani*, ciast*, deser*, zupa, zupy, zupe, pierogi, pierogow, ramen, pizza, pizze, ' +
        'burger*, sushi, makaron*, pasta, baking, pieczeni*, piekarnik*, air fryer, airfryer, bbq, food, street food, ' +
        'jedzeni*, restauracj*, chleb*, tort, torty, tortu',
    },
    {
      id: 'sport', name: P.t('topicSport'),
      keywords: 'mecz, meczu, mecze, pilka nozna, pilki noznej, football, soccer, ekstraklasa, premier league, ' +
        'liga mistrzow, champions league, gol, gole, trening*, workout, silownia, silowni, fitness, biegani*, ' +
        'biegacz*, maraton*, polmaraton*, marathon*, triathlon, kolarstw*, cycling, mma, ufc, ksw, boks, boxing, tenis*, ' +
        'tennis, siatkow*, koszykow*, nba, nfl, f1, formula 1, skoki narciarskie, narciar*, olimpi*, olympic*, mundial, ' +
        'reprezentacj*, trener*, kibic*, stadion*',
    },
    {
      id: 'design', name: P.t('topicDesign'),
      keywords: 'design, projektowani*, grafika, grafiki, graficzn*, graphic design, typografi*, typography, typeface, ' +
        'font, fonty, fontow, fonts, logo, logotyp*, branding, identyfikacj* wizualn*, ux, ui ux, ux ui, figma, photoshop, ' +
        'illustrator, ilustracj*, illustration, plakat*, poster*, bauhaus*, architektur*, architecture, wnetrz*, ' +
        'interior design, kaligrafi*, calligraphy, lettering, behance, dribbble',
    },
    { id: 'other', name: P.t('topicOther'), keywords: '' },
  ];
  P.topicName = (id) => P.TOPICS.find((t) => t.id === id)?.name || '';

  // YouTube's video categories (meta itemprop="genre"), folded; unlisted ones say nothing.
  const GENRES = {
    'science technology': 'tech', 'nauka i technika': 'tech',
    gaming: 'gaming', gry: 'gaming',
    music: 'music', muzyka: 'music',
    sports: 'sport', sport: 'sport',
  };

  // How much one piece of evidence can add to one topic.
  const CAP = { title: 2, name: 2, tags: 2, keywords: 3, genre: 3 };
  const MIN_SCORE = 4; // the leading topic needs at least this score…
  const LEAD = 2; //      …this many times the runner-up's…
  const MIN_SUPPORT = 2; // …hits in at least this many separate titles or fields…
  const MIN_SHARE = 1 / 3; // …and in at least this share of the channel's titles.
  const OTHER_AFTER = 10; // titles that match next to nothing before a channel is 'other'

  const fold = (s) => ` ${P.asciiFold(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const compile = (kw) => new RegExp(` ${kw.split(' ').map((w) => (w.endsWith('*') ? `${w.slice(0, -1)}[a-z0-9]*` : w)).join(' ')} `);
  const TABLE = P.TOPICS.filter((t) => t.keywords).map((t) => ({ id: t.id, patterns: t.keywords.split(/\s*,\s*/).map(compile) }));

  // { topic: hits } for one piece of text, at most `cap` per topic.
  const hits = (text, cap) => {
    const out = {};
    if (!text) return out;
    const s = fold(text);
    for (const t of TABLE) {
      const n = t.patterns.reduce((acc, re) => acc + (re.test(s) ? 1 : 0), 0);
      if (n) out[t.id] = Math.min(cap, n);
    }
    return out;
  };

  // Evidence of a seen channel { name, items: [{ title, tags?, genre? }], keywords? } as
  // { score: { topic: n }, support: { topic: pieces }, titles: { topic: titles } }.
  P.topicEvidence = (entry) => {
    const score = {}, support = {}, titles = {};
    const add = (h, isTitle) => {
      for (const [id, n] of Object.entries(h)) {
        score[id] = (score[id] || 0) + n;
        support[id] = (support[id] || 0) + 1;
        if (isTitle) titles[id] = (titles[id] || 0) + 1;
      }
    };
    add(hits(entry.name, CAP.name));
    for (const it of entry.items || []) {
      const h = hits(it.title, CAP.title);
      for (const [id, n] of Object.entries(hits(it.tags, CAP.tags))) h[id] = (h[id] || 0) + n;
      const genre = GENRES[fold(it.genre).trim()];
      if (genre) h[genre] = (h[genre] || 0) + CAP.genre;
      add(h, true);
    }
    add(hits(entry.keywords, CAP.keywords));
    return { score, support, titles };
  };

  // Auto-generated artist channels ("Artist - Topic") and VEVO carry music only.
  const MUSIC_CHANNEL = /\s-\s*topic$|vevo$/i;

  // The channel's topic id once the evidence is clear, otherwise null (not yet known).
  P.detectTopic = (entry) => {
    if (MUSIC_CHANNEL.test(String(entry.name || '').trim())) return 'music';
    const { score, support, titles } = P.topicEvidence(entry);
    const ranked = TABLE.map((t) => t.id).sort((a, b) => (score[b] || 0) - (score[a] || 0));
    const [top, second] = ranked;
    const best = score[top] || 0;
    const count = (entry.items || []).length;
    if (best >= MIN_SCORE && best >= LEAD * (score[second] || 0)
      && support[top] >= MIN_SUPPORT && (titles[top] || 0) >= MIN_SHARE * count) return top;
    if (count >= OTHER_AFTER && best <= 1) return 'other';
    return null;
  };
})();
