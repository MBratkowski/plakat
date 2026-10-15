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

  // WCAG contrast ratio, 1–21.
  P.contrast = (a, b) => {
    const la = P.luminance(a), lb = P.luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  // Whichever of a / b reads better on bg.
  P.contrastOn = (bg, a, b) => (P.contrast(bg, a) >= P.contrast(bg, b) ? a : b);

  P.darker = (a, b) => (P.luminance(a) < P.luminance(b) ? a : b);

  P.rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  // a moved towards b: t = 0 is a, t = 1 is b.
  P.mix = (a, b, t) => {
    const x = P.hexToRgb(a), y = P.hexToRgb(b);
    return P.rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
  };

  // How colourful a colour is, 0 (grey) to 1, independent of lightness.
  P.chroma = (hex) => {
    const rgb = P.hexToRgb(hex);
    return (Math.max(...rgb) - Math.min(...rgb)) / 255;
  };

  // color moved towards `toward` in small steps until it reaches `min` contrast with
  // every colour in `against`.
  P.withContrast = (color, against, min, toward) => {
    for (let t = 0; t < 1; t += 0.02) {
      const c = P.mix(color, toward, t);
      if (against.every((b) => P.contrast(c, b) >= min)) return c;
    }
    return toward;
  };
})();
