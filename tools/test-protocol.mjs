// Runs web/w909-protocol.js + web/w909-keys.js against the real keyboard via tools/w909-bridge.
// usage: node tools/test-protocol.mjs [--write-test]
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import vm from "node:vm";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const bridge = spawn(path.join(root, "tools/w909-bridge"));
const lines = createInterface({ input: bridge.stdout });
const waiting = [];
lines.on("line", (l) => waiting.shift()?.(l));
const next = () => new Promise((r) => waiting.push(r));
const call = async (cmd) => { const p = next(); bridge.stdin.write(cmd + "\n"); return p; };
if ((await next()) !== "READY") throw new Error("bridge failed");

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fakeHid = {
  productId: 0x4100, vendorId: 0xb6a4, opened: true,
  collections: [{ featureReports: [{ reportId: 6 }] }],
  async sendFeatureReport(id, data) { const r = await call("S " + hex(data)); if (r !== "OK") throw new Error(r); },
  async receiveFeatureReport() {
    const h = await call("G");
    const b = new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
    return new DataView(b.buffer);
  },
  async close() {},
};

const ctx = { navigator: {}, setTimeout, TextDecoder, console, Uint8Array, DataView, Promise, Error, Math, Map, Array, Number, Object, String };
vm.createContext(ctx);
for (const f of ["web/w909-protocol.js", "web/w909-keys.js"]) {
  vm.runInContext(readFileSync(path.join(root, f), "utf8").replace(/^const (\w+) =/m, "globalThis.$1 ="), ctx);
}
const { W909, W909Keys: K } = ctx;
const dev = new W909.Device(fakeHid, () => {});

let failures = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); if (!cond) failures++; };

const info = await dev.readInfo();
check("firmware string", /^\d+\.\d+/.test(info.firmware), JSON.stringify(info));
const profile = await dev.readProfile();
check("profile 0/1", profile === 0 || profile === 1, `profile=${profile}`);
const keys = await dev.readKeys(80);
const labels = [];
for (let r = 0; r < 6; r++) labels.push([0, 1, 2].map((c) => K.describe(keys.slice((r * 8 + c) * 4, (r * 8 + c) * 4 + 4)).label).join(" | "));
console.log("  grid:\n   " + labels.join("\n   "));
console.log("  joystick:", [74, 50, 58, 66].map((i) => K.describe(keys.slice(i * 4, i * 4 + 4)).label).join(", "));
check("keys read", keys.some((b) => b !== 0));
const knob0 = await dev.readKnob(0), knob1 = await dev.readKnob(1);
console.log("  knob:", K.describe(knob0.slice(0, 4)).label, "/", K.describe(knob0.slice(4, 8)).label,
  " layer2:", K.describe(knob1.slice(0, 4)).label, "/", K.describe(knob1.slice(4, 8)).label);
const light = await dev.readLighting();
console.log("  lighting header:", hex(light.header), " mode1:", hex(light.modes[1]));
check("lighting header", (light.header[0] & 0x3f) >= 1);
const power = await dev.readPowerTimers();
console.log("  power:", JSON.stringify(power));

// macro encode/decode round trip (no device)
const ev = K.shortcutEvents([0xe0, 0xe1], 0x06);
const dec = K.decodeEvents(K.encodeEvents(ev));
check("shortcut summary", K.summarizeEvents(dec.events) === "Ctrl+Shift+C", K.summarizeEvents(dec.events));
const t = K.textEvents("Hi!");
check("text summary", K.summarizeEvents(K.decodeEvents(K.encodeEvents(t)).events) === "Shift+H, I, Shift+1");
const long = K.decodeEvents(K.encodeEvents([{ hid: 4, up: false, delay: 1000 }]));
check("long delay round trip", long.events[0].delay === 1000);

if (process.argv.includes("--write-test")) {
  // Uses matrix index 3 (not a physical key) and macro slot 3; both are saved first and restored afterwards.
  const before = await dev.readKey(3);
  const macroBefore = await dev.readLong(0x08, 3, 0, 512); // raw slot contents, including any data past the header length
  await dev.writeKey(3, [0x0a, 0, 3, 0]);
  await dev.writeMacro(3, 1, K.encodeEvents(K.shortcutEvents([0xe0], 0x06)));
  const m = await dev.readMacro(3);
  check("macro write/read", K.summarizeEvents(K.decodeEvents(m.events).events) === "Ctrl+C" && m.repeat === 1);
  const longText = K.encodeEvents(K.textEvents("The quick brown fox jumps over the lazy dog"));
  await dev.writeMacro(3, 2, longText);
  const m2 = await dev.readMacro(3);
  check("long macro (multi-chunk) write/read", hex(m2.events) === hex(longText) && m2.repeat === 2, `${longText.length} bytes`);
  await dev.writeLong(0x08, 3, 0, macroBefore);
  await dev.writeKey(3, before);
  check("key 3 and macro slot 3 restored", hex(await dev.readKey(3)) === hex(before) && hex(await dev.readLong(0x08, 3, 0, 512)) === hex(macroBefore));
  // knob layer 2 round trip
  const k = await dev.readKnob(1);
  await dev.writeKnob(1, 0, [0x04, 0xcd, 0x00, 0x00]);
  check("knob write", hex((await dev.readKnob(1)).slice(0, 4)) === "04cd0000");
  await dev.writeKnob(1, 0, k.slice(0, 4));
  check("knob restored", hex(await dev.readKnob(1)) === hex(k));
  // full-profile rewrite with identical data (what Restore does), then compare
  const keysBefore = await dev.readKeys(80);
  const knobBefore = [await dev.readKnob(0), await dev.readKnob(1)];
  const macrosBefore = [];
  for (let slot = 0; slot < 16; slot++) macrosBefore.push(await dev.readMacro(slot));
  for (let slot = 0; slot < 16; slot++) await dev.writeMacro(slot, macrosBefore[slot].events.length ? macrosBefore[slot].repeat : 0, macrosBefore[slot].events);
  await dev.writeKeys(keysBefore);
  for (const l of [0, 1]) await dev.writeKnobTable(l, knobBefore[l]);
  check("bulk key rewrite unchanged", hex(await dev.readKeys(80)) === hex(keysBefore));
  check("knob tables unchanged", hex(await dev.readKnob(0)) + hex(await dev.readKnob(1)) === hex(knobBefore[0]) + hex(knobBefore[1]));
  let macrosOk = true;
  for (let slot = 0; slot < 16; slot++) { const m = await dev.readMacro(slot); if (hex(m.events) !== hex(macrosBefore[slot].events)) macrosOk = false; }
  check("macro slots unchanged", macrosOk, `${macrosBefore.filter((m) => m.events.length).length} in use`);
  // lighting header rewrite (same values) round trip
  await dev.writeLightingHeader(light.header);
  check("lighting header unchanged", hex((await dev.readLighting()).header) === hex(light.header));
}

bridge.stdin.end();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
