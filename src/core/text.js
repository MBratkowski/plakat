// Title analysis and channel initials. Heuristics only, no network.
(() => {
  const P = (globalThis.Plakat ??= {});

  const STOP = new Set(
    ('a an the and or of to in on at for with from by is are be this that how why what when my your our we you i ' +
      'it its vs feat ft official video full part new jak i w z na do od po za o u co to że się nie czy dla przy ' +
      'jest są był być ten ta te tego mój moja twój nasz który która które oraz ale też jeszcze tylko już bardzo').split(' '),
  );
  const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;

  // Strips emoji and hashtags and normalises separators to " | ".
  P.cleanTitle = (t) =>
    String(t || '')
      .replace(PICTOGRAPHS, '')
      .replace(/#(?!\d)\S+/g, '')
      .replace(/[|•·]+/g, ' | ')
      .replace(/\s+/g, ' ')
      .replace(/(\s\|\s?)+$/, '')
      .trim();

  // "Title | Subtitle" or "Title - Subtitle" -> { main, sub }.
  P.splitTitle = (t) => {
    const m = t.match(/^(.{6,}?)\s+(?:\||–|—|-|:)\s+(.+)$/);
    return m ? { main: m[1].trim(), sub: m[2].replace(/\s*\|\s*/g, ' · ').trim() } : { main: t, sub: '' };
  };

  // Episode-like numbers (#12, odc. 47, ep 5) win over any other number.
  P.extractNumber = (t) => {
    const pref = t.match(/(?:#|nr\.?\s?|no\.?\s?|ep\.?\s?|odc(?:inek|\.)?\s?|part\s|cz(?:ęść|\.)\s?|vol\.?\s?|s\d+e)(\d{1,4})\b/i);
    if (pref) return pref[1];
    const any = t.match(/(?<![\d.,])(\d{1,4})(?![\d.,]\d)/);
    return any ? any[1] : null;
  };

  // Longest meaningful word.
  P.extractKeyword = (t) => {
    const words = t.split(/[\s|:,.!?()[\]"„”'«»–—-]+/).filter(Boolean);
    let best = '';
    for (const w of words) {
      const lw = w.toLowerCase();
      if (STOP.has(lw) || /^\d+$/.test(w)) continue;
      if ([...w].length > [...best].length) best = w;
    }
    return best || words[0] || '';
  };

  // Up to `max` uppercase initials of a channel name: "Kanał Techniczny" -> "KT",
  // "Biegacz z Wrocławia" -> "BW", "PewDiePie" -> "PD", "@veritasium" -> "V".
  const NAME_STOP = new Set('a an and by de del der for i in na o of the to u von w z ze & +'.split(' '));
  P.initials = (name, max = 2) => {
    const words = String(name || '')
      .replace(PICTOGRAPHS, '')
      .replace(/^@/, '')
      .split(/[\s_./|·:,–—-]+/)
      .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ''))
      .filter(Boolean);
    const content = words.filter((w) => !NAME_STOP.has(w.toLowerCase()));
    const use = content.length ? content : words;
    if (!use.length) return '?';
    const first = (w) => [...w][0];
    let out;
    if (use.length > 1) out = first(use[0]) + first(use[1]);
    else {
      const chars = [...use[0]];
      const hump = chars.slice(1).find((ch) => /\p{Lu}/u.test(ch));
      out = chars[0] + (hump || '');
    }
    return [...out].slice(0, max).join('').toLocaleUpperCase('pl');
  };

  // ---------- Titles as code ----------
  // Tokens of a title: { s, kind: 'word' | 'num' | 'sym', stop }. Used by the code-flavoured
  // engines to build identifiers, flags and arguments from real title words.
  P.tokenize = (t) => (String(t || '').match(/\p{L}[\p{L}\p{N}'’]*|\p{N}+(?:[.,]\p{N}+)*|\S/gu) || []).map((s) => ({
    s,
    kind: /^\p{L}/u.test(s) ? 'word' : /^\p{N}/u.test(s) ? 'num' : 'sym',
    stop: STOP.has(s.toLowerCase()),
  }));

  // "Zażółć" -> "Zazolc": strips diacritics, including ł, which NFD does not decompose.
  P.asciiFold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');

  // Words joined as an identifier: 'snake' (home_server), 'camel' (homeServer),
  // 'kebab' (home-server). ASCII only, so it reads as code in any language.
  P.identifier = (words, style = 'snake') => {
    const parts = words.map((w) => P.asciiFold(w).toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
    if (!parts.length) return '';
    if (style === 'camel') return parts[0] + parts.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
    return parts.join(style === 'kebab' ? '-' : '_');
  };

  // Identifier from the first `max` meaningful words of a title, e.g.
  // "Jak zbudowałem własny serwer" -> "zbudowalem_wlasny".
  P.titleIdentifier = (title, style, max = 2) =>
    P.identifier(P.tokenize(title).filter((t) => t.kind === 'word' && !t.stop).slice(0, max).map((t) => t.s), style);

  P.pad = (n, len = 3) => String(n).padStart(len, '0');
})();
