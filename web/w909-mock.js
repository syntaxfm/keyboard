// In-memory W909 emulator for previewing the page without a keyboard (open index.html?demo).
// Seeded with the values read from a real W909 Pro (firmware 2.3.0400).
const W909Mock = (() => {
  function create(productId = 0x4100) {
    const keys = [new Uint8Array(1280), new Uint8Array(1280)];
    const setKeys = (p, list) => list.forEach(([i, v]) => keys[p].set(v, i * 4));
    setKeys(0, W909Keys.FACTORY.keys);
    setKeys(1, [[0, [2, 0x09]], [1, [2, 0x58]], [2, [7, 1]], [8, [2, 0x08]], [9, [2, 0x37]], [10, [2, 0x56]],
      [16, [2, 0x07]], [17, [2, 0x0d]], [18, [2, 0x57]], [24, [2, 0x06]], [25, [0x0a, 0, 0]], [26, [2, 0x2c]],
      [32, [2, 0x05]], [33, [2, 0x0b]], [34, [9, 3]], [40, [2, 0x04]], [41, [2, 0x0a]], [42, [2, 0x28]],
      [50, [2, 0x50]], [58, [2, 0x4f]], [66, [2, 0x51]], [74, [2, 0x52]]]);
    const knob = [[new Uint8Array([4, 0xea, 0, 0, 4, 0xe9, 0, 0]), new Uint8Array([7, 3, 2, 0, 7, 3, 1, 0])],
      [new Uint8Array([4, 0xea, 0, 0, 4, 0xe9, 0, 0]), new Uint8Array([7, 3, 2, 0, 7, 3, 1, 0])]];
    const light = [new Uint8Array(250), new Uint8Array(250)];
    const rainbow = [0xff, 0, 0, 0, 0xff, 0, 0, 0, 0xff, 0xff, 0xff, 0, 0x80, 0, 0x80, 0, 0xff, 0xff, 0xff, 0xff, 0xff]; // R,G,B
    for (const p of [0, 1]) {
      light[p].set([p ? 0x81 : 0x88, 0xff, 0x01]);
      for (let m = 1; m <= 8; m++) light[p].set([4, 0, 0, m % 3 === 2 ? 0x7f : 1, ...(m % 3 === 2 ? rainbow : [0xff, 0, 0])], m * 25);
    }
    const macros = new Map([[0, new Uint8Array([1, 0, 8, 0, 0xe0, 10, 0x06, 10, 0x06, 0x8a, 0xe0, 0x8a])]]);
    const settings = { 2: [1], 3: [60, 0], 4: [0x58, 2] };
    let reply = new Uint8Array(40);

    function handle(p) {
      const [, , cmd, , arg, lo, hi, len] = p;
      const addr = lo | (hi << 8);
      const prof = settings[2][0];
      const data = p.slice(8, 8 + len);
      const out = new Uint8Array(40);
      out.set(p.slice(0, 8));
      const read = (src) => out.set(src.slice(addr, addr + len), 8);
      switch (cmd) {
        case 0xf0: out.set(new TextEncoder().encode(arg === 1 ? "2.3.0400" : "K2005-B01-260915").slice(0, len), 8); break;
        case 0x82: out.set(settings[arg] || [], 8); break;
        case 0x02: settings[arg] = Array.from(data); break;
        case 0x84: read(keys[prof].subarray(arg * 640)); break;
        case 0x04: keys[prof].set(data, arg * 640 + addr); break;
        case 0x85: read(knob[prof][arg]); break;
        case 0x05: knob[prof][arg].set(data, addr); break;
        case 0x89: read(light[prof]); break;
        case 0x09: light[prof].set(data, addr); break;
        case 0x88: { const m = macros.get(arg) || new Uint8Array(4); const b = new Uint8Array(512); b.set(m); read(b); break; }
        case 0x08: { if (arg >= 16) break; // the real firmware only has slots 0..15
           const b = new Uint8Array(512); b.set(macros.get(arg) || []); b.set(data, addr); macros.set(arg, b); break; }
      }
      if (cmd & 0x80) reply = out;
    }

    return {
      vendorId: 0xb6a4, productId, opened: true,
      collections: [{ featureReports: [{ reportId: 6 }] }],
      async open() {}, async close() {},
      async sendFeatureReport(id, p) { handle(new Uint8Array(p)); },
      async receiveFeatureReport() { const b = new Uint8Array(41); b[0] = 6; b.set(reply, 1); return new DataView(b.buffer); },
    };
  }
  return { create };
})();
