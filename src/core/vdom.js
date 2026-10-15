// Virtual SVG tree. Engines build plain objects with h(tag, attrs, ...children);
// toDom() turns them into nodes with createElementNS, because YouTube enforces
// Trusted Types and innerHTML is not an option.
//
// IDs written as "@name" (e.g. url(#@clip3)) are local to one render and get a
// unique prefix, so several posters on one page never share a <clipPath>.
(() => {
  const P = (globalThis.Plakat ??= {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  P.h = (tag, attrs, ...children) => ({
    tag,
    attrs: attrs || {},
    children: children.flat(Infinity).filter((c) => c != null && c !== false && c !== ''),
  });

  const localize = (val, prefix) =>
    typeof val === 'string' && val.includes('@') ? val.replace(/@([\w-]+)/g, `${prefix}$1`) : val;

  // External hrefs (image URLs) are left alone; only "#@id" references are localized.
  const attrValue = (key, val, prefix) =>
    key === 'href' && !String(val).startsWith('#') ? String(val) : String(localize(val, prefix));

  let uid = 0;
  P.toDom = (node) => {
    const prefix = `plk${(++uid).toString(36)}_`;
    const build = (n) => {
      if (typeof n === 'string' || typeof n === 'number') return document.createTextNode(String(n));
      const el = document.createElementNS(SVG_NS, n.tag);
      for (const [k, v] of Object.entries(n.attrs)) {
        if (v != null && v !== false) el.setAttribute(k, attrValue(k, v, prefix));
      }
      for (const c of n.children) el.appendChild(build(c));
      return el;
    };
    return build(node);
  };

  // Markup string with a fixed ID prefix. Used by dev tooling (snapshots, exports).
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  P.toString = (node) => {
    const prefix = 'p_';
    const build = (n) => {
      if (typeof n === 'string' || typeof n === 'number') return esc(n);
      const attrs = Object.entries(n.attrs)
        .filter(([, v]) => v != null && v !== false)
        .map(([k, v]) => ` ${k}="${esc(localize(v, prefix))}"`)
        .join('');
      return `<${n.tag}${attrs}>${n.children.map(build).join('')}</${n.tag}>`;
    };
    return build(node);
  };
})();
