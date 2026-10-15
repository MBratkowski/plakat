// Colour helpers for #rrggbb palettes.
(() => {
  const P = (globalThis.Plakat ??= {});

  P.hexToRgb = (hex) => {
    const m = String(hex).replace('#', '');
    const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  // WCAG relative luminance.
  P.luminance = (hex) => {
    const [r, g, b] = P.hexToRgb(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  // Whichever of a / b reads better on bg.
  P.contrastOn = (bg, a, b) => {
    const L = P.luminance(bg);
    const ratio = (x) => {
      const l2 = P.luminance(x);
      return (Math.max(L, l2) + 0.05) / (Math.min(L, l2) + 0.05);
    };
    return ratio(a) >= ratio(b) ? a : b;
  };

  P.darker = (a, b) => (P.luminance(a) < P.luminance(b) ? a : b);
})();
