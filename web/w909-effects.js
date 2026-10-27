// Light shows: animations the page plays on the pad by streaming colors into Constant mode.
// Each effect maps time in seconds to one [r, g, b] color (0..255) for the whole pad.

const W909Effects = (() => {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const scale = (c, k) => c.map((v) => v * k);
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const hsv = (h) => {
    const f = (n) => { const k = (n + h * 6) % 6; return 255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))); };
    return [f(5), f(3), f(1)];
  };
  // Smooth value noise in 0..1
  const hash = (n) => Math.abs((Math.sin(n * 127.1) * 43758.5453) % 1);
  const noise = (t) => { const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f); return hash(i) + (hash(i + 1) - hash(i)) * s; };

  const ORANGE = [255, 140, 0];
  const LIST = [
    { name: "Syntax pulse", about: "Slow orange breathe", fn: (t) => scale(ORANGE, 0.15 + 0.85 * (0.5 - 0.5 * Math.cos(t * 2.2))) },
    { name: "Heartbeat", about: "Double thump, then rest", fn: (t) => {
      const p = t % 1.2;
      const beat = Math.exp(-((p - 0.1) ** 2) / 0.003) + 0.7 * Math.exp(-((p - 0.38) ** 2) / 0.004);
      return scale([255, 0, 20], 0.05 + 0.95 * Math.min(1, beat));
    } },
    { name: "Candle", about: "Warm flame flicker", fn: (t) => {
      const k = 0.55 + 0.3 * noise(t * 6) + 0.15 * noise(t * 17);
      return scale(mix([255, 60, 0], [255, 150, 30], noise(t * 3)), k);
    } },
    { name: "Lightning", about: "Storm with random strikes", fn: (t) => (hash(Math.floor(t * 12)) > 0.93 ? [235, 240, 255] : [0, 0, 18 + 10 * noise(t)]) },
    { name: "Color loop", about: "Cycle the rainbow", fn: (t) => hsv((t / 6) % 1) },
    { name: "Police", about: "Red / blue double flash", fn: (t) => {
      const p = (t * 2) % 2, q = p % 1, on = q < 0.15 || (q > 0.25 && q < 0.4);
      return on ? (p < 1 ? [255, 0, 0] : [0, 40, 255]) : [0, 0, 0];
    } },
    { name: "Strobe", about: "Hard white bursts", fn: (t) => ((t * 8) % 1 < 0.25 ? [255, 255, 255] : [0, 0, 0]) },
    { name: "Sunrise", about: "Night to daylight", fn: (t) => {
      const k = Math.min(1, t / 20);
      return k < 0.5 ? mix([10, 0, 30], [255, 60, 0], k * 2) : mix([255, 60, 0], [255, 220, 170], (k - 0.5) * 2);
    } },
    { name: "Ship it!", about: "Party: fast random hues", fn: (t) => hsv(hash(Math.floor(t * 6))) },
  ];

  const color = (effect, t) => effect.fn(t).map(clamp);
  return { LIST, color };
})();
