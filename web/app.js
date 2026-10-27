// W909 Configurator UI.
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const K = W909Keys;

  const KEY_COUNT = 80;               // matrix indexes 0..79 (index = row*8 + col)
  const MACRO_SLOTS = 16;
  const TESTED_FIRMWARE = "2.3.0400";
  // Physical layout of the Syntax W909 pad: [matrix index, printed legend, keycap color, width in units].
  // Matrix positions come from the factory keymap (legends 1-6 = Keypad 1-6 etc.).
  const LAYOUT = {
    "row-a": [[40, "1", "orange"], [32, "2", "dark"], [24, "3", "dark"], [16, "4", "dark"], [8, "5", "light"], [0, "6", "light"]],
    "row-b": [[41, "7", "dark"], [33, "8", "dark"], [25, "9", "light"], [17, "0", "light"], [9, "•", "light"], [1, "ENTER", "orange", 2]],
    "row-c": [[10, "−", "orange", 1.5], [18, "+", "dark"], [26, "", "dark", 3]],
  };
  const LIGHT_MODES = ["Constant", "Flowing water", "Mono water", "Breathing", "Cycle breathing",
    "Enraptured", "Neon", "Ambilight", "LED off"]; // device mode = position + 1

  let dev = null;
  let state = null;
  let selected = null;
  let tab = "key";

  // ---------- helpers ----------
  function toast(msg, err = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = err ? "err" : "";
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), err ? 6000 : 2500);
  }
  function log(line) {
    const el = $("#log");
    el.textContent = (el.textContent + line + "\n").split("\n").slice(-400).join("\n");
    el.scrollTop = el.scrollHeight;
  }
  async function busy(fn) {
    document.body.classList.add("busy");
    try { return await fn(); }
    catch (e) { console.error(e); toast(e.message || String(e), true); }
    finally { document.body.classList.remove("busy"); }
  }
  const keyValue = (i) => state.keys.slice(i * 4, i * 4 + 4);
  const knobValue = (layer, slot) => state.knob[layer].slice(slot * 4, slot * 4 + 4);
  const rgbToHex = (r, g, b) => "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));

  // ---------- platform help ----------
  function platform() {
    // The user-agent string still carries the OS in Chromium browsers (Windows NT / CrOS / X11; Linux / Macintosh).
    const ua = navigator.userAgent;
    if (/Windows/.test(ua)) return "windows";
    if (/CrOS/.test(ua)) return "chromeos";
    if (/Linux|X11/.test(ua) && !/Android/.test(ua)) return "linux";
    if (/Macintosh|Mac OS X/.test(ua)) return "mac";
    return "other";
  }
  const helpPanel = () => $(`#help-${platform()}`);

  function initHelp() {
    const panel = helpPanel();
    if (!panel) return;
    panel.hidden = false;
    if (platform() === "linux") panel.open = !localStorage.getItem("w909-connected"); // setup needed before first connect
    $$(".copy").forEach((b) => b.addEventListener("click", async () => {
      await navigator.clipboard.writeText($(`#${b.dataset.copy}`).textContent);
      b.textContent = "Copied";
      setTimeout(() => (b.textContent = "Copy"), 1500);
    }));
  }

  // Called when connecting fails: open this platform's tips and point at them.
  function showHelp(reason) {
    const panel = helpPanel();
    if (panel) {
      panel.hidden = false;
      panel.open = true;
      panel.classList.add("alert");
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    toast(panel ? `${reason}. See the tips below.` : reason, true);
  }

  // ---------- connection ----------
  const DEMO = new URLSearchParams(location.search).has("demo");

  async function connect(auto = false) {
    if (!W909.Device.isSupported() && !DEMO) return;
    try {
      if (DEMO) dev = new W909.Device(W909Mock.create(new URLSearchParams(location.search).get("demo") === "receiver" ? 0x4101 : 0x4100), log);
      else dev = auto ? await W909.Device.reconnect(log) : await W909.Device.request(log);
    } catch (e) {
      console.error(e);
      // Cancelling the browser's device picker throws NotFoundError; anything else is a real failure (often permissions).
      if (!auto && e.name !== "NotFoundError") showHelp(`Couldn't open the keyboard (${e.message})`);
      return;
    }
    if (!dev) {
      if (!auto) showHelp("No W909 selected. Pick the one named “W909 Pro USB”");
      return;
    }
    localStorage.setItem("w909-connected", "1");
    $$(".help").forEach((p) => { p.open = false; p.classList.remove("alert"); });
    $("#status").textContent = DEMO ? "Demo mode (no keyboard)" : `Connected via ${dev.connectionName}`;
    $("#connect").textContent = "Disconnect";
    $("#intro").hidden = true;
    document.body.classList.remove("offline");
    $("#app").hidden = false;
    setReadOnly(dev.hid.productId === 0x4101);
    dev.onKeys(onPadKeys);
    await busy(loadAll);
  }

  // Over the 2.4G receiver the keyboard answers reads but ignores writes, so lock editing.
  let readOnly = false;
  function setReadOnly(on) {
    readOnly = on;
    $("#readonly").hidden = !on;
    document.body.classList.toggle("read-only", on);
    $$("#ed-apply, #lt-apply, #pw-apply, #profiles button, #restore, #factory, #shows button").forEach((b) => (b.disabled = on));
  }
  function guardWrite() {
    if (readOnly) toast("Connected through the 2.4G receiver, so settings can't be changed. Use the USB cable.", true);
    return readOnly;
  }

  async function disconnect(unplugged = false) {
    if (dev && !unplugged) await stopShow();
    show = null;
    renderShows();
    held = new Set();
    if (dev) await dev.close();
    dev = null;
    $("#status").textContent = "Not connected";
    $("#connect").textContent = "Connect keyboard";
    $("#intro").hidden = false;
    setReadOnly(false);
    showOffline();
  }

  // Not connected: show the factory layout, greyed out, with a "Disconnected" overlay.
  function showOffline() {
    const keys = new Uint8Array(KEY_COUNT * 4);
    for (const [i, v] of K.FACTORY.keys) keys.set(v, i * 4);
    state = { keys, knob: K.FACTORY.knob.map((k) => Uint8Array.from(k)), macros: new Map() };
    closeEditor();
    renderSlots();
    document.body.classList.add("offline");
    $("#app").hidden = false;
  }

  navigator.hid?.addEventListener("disconnect", (e) => {
    if (dev && e.device === dev.hid) { disconnect(true); toast("Keyboard disconnected", true); }
  });

  // ---------- loading ----------
  async function loadAll() {
    const info = await dev.readInfo();
    const profile = await dev.readProfile();
    const keys = await dev.readKeys(KEY_COUNT);
    if (readOnly && keys.every((b) => b === 0)) {
      toast("The 2.4G receiver didn't return any settings. Connect with the USB cable.", true);
    }
    const knob = [await dev.readKnob(0), await dev.readKnob(1)];
    const light = await dev.readLighting();
    const power = await dev.readPowerTimers();
    state = { info, profile, keys, knob, light, power, macros: new Map() };
    for (let i = 0; i < KEY_COUNT; i++) {
      const v = keyValue(i);
      if (v[0] === K.TYPE.MACRO) state.macros.set(v[2], await dev.readMacro(v[2]));
    }
    $("#info").textContent = `Firmware ${info.firmware} · ${info.board}`;
    const fw = $("#fw-warning");
    fw.hidden = info.firmware === TESTED_FIRMWARE;
    fw.innerHTML = `<b>Untested firmware.</b> This page was built and tested with firmware ${TESTED_FIRMWARE}; your keyboard reports
      <b>${info.firmware || "unknown"}</b>. Viewing settings is safe. Before changing anything, use <b>Back up profile</b> so you can undo.`;
    renderAll();
  }

  // ---------- rendering ----------
  function buildBoard() {
    for (const [rowId, keys] of Object.entries(LAYOUT)) {
      const row = $(`#${rowId}`);
      const before = row.querySelector(".joy-ring"); // joystick stays at the end of the bottom row
      for (const [index, legend, color, w = 1] of keys) {
        const b = document.createElement("button");
        b.className = `slot cap ${color}`;
        b.dataset.key = String(index);
        b.dataset.name = legend ? `Key “${legend === "•" ? "." : legend}”` : "Space bar";
        b.style.setProperty("--w", w);
        b.innerHTML = `<small>${legend}</small><span></span>`;
        row.insertBefore(b, before);
      }
    }
  }

  function label(v) {
    const d = K.describe(v);
    if (d.kind === "macro") {
      const m = state.macros.get(d.slot);
      if (m) {
        const { events, complex } = K.decodeEvents(m.events);
        const s = complex ? "Macro" : K.summarizeEvents(events) || "Macro";
        return { ...d, label: s.length > 28 ? s.slice(0, 26) + "…" : s };
      }
    }
    return d;
  }

  function renderSlot(el, v) {
    const d = label(v);
    el.querySelector("span").textContent = d.label;
    el.classList.toggle("macro", d.kind === "macro");
    el.classList.toggle("none", d.kind === "none");
  }

  function renderAll() {
    $$("#profiles button").forEach((b) => b.classList.toggle("on", Number(b.dataset.profile) === state.profile));
    renderSlots();
    renderLighting();
    $("#pw-sleep").value = Math.max(1, Math.round(state.power.sleepSeconds / 60));
    $("#pw-off").textContent = `Turns off after ${Math.round(state.power.powerOffSeconds / 60)} min idle`;
    if (selected) openEditor(selected);
  }

  function renderSlots() {
    $$(".slot[data-key]").forEach((el) => renderSlot(el, keyValue(Number(el.dataset.key))));
    $$(".slot[data-knob]").forEach((el) => {
      const [layer, slot] = el.dataset.knob.split(":").map(Number);
      renderSlot(el, knobValue(layer, slot));
    });
  }

  // ---------- pressing a key on the pad ----------
  // The pad streams its switch matrix, so pressing a physical key selects it here.
  let held = new Set();
  function onPadKeys(indexes) {
    const fresh = indexes.filter((i) => !held.has(i));
    held = new Set(indexes);
    $$(".slot[data-key]").forEach((el) => el.classList.toggle("pressed", held.has(Number(el.dataset.key))));
    // Leave the editor alone while someone is typing into it or capturing a key (pad keys type too).
    const typing = document.activeElement?.matches("input, textarea") || $(".listening");
    if (fresh.length !== 1 || typing || !state || document.body.classList.contains("busy")) return;
    if ($(`.slot[data-key="${fresh[0]}"]`)) openEditor({ kind: "key", index: fresh[0] });
  }

  // ---------- key editor ----------
  function fillSelects() {
    const keyOpts = K.HID.map(([c, n]) => `<option value="${c}">${n}</option>`).join("");
    $("#ed-key").innerHTML = keyOpts;
    $("#ed-sc-key").innerHTML = K.HID.filter(([c]) => c < 0xe0).map(([c, n]) => `<option value="${c}">${n}</option>`).join("");
    const groups = {};
    K.SPECIAL.forEach(([n, g], i) => (groups[g] = groups[g] || []).push(`<option value="${i}">${n}</option>`));
    $("#ed-special").innerHTML = Object.entries(groups).map(([g, o]) => `<optgroup label="${g}">${o.join("")}</optgroup>`).join("");
    $("#ed-mods").innerHTML = K.MODS.map((m) => `<label class="check"><input type="checkbox" value="${m.bit}"> ${m.label}</label>`).join("");
  }

  function setTab(t) {
    tab = t;
    $$("#ed-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
    $$(".tab").forEach((p) => (p.hidden = p.dataset.pane !== t));
    $("#ed-repeat-wrap").hidden = !(t === "shortcut" || t === "text");
  }

  function currentValue(sel) {
    return sel.kind === "key" ? keyValue(sel.index) : knobValue(sel.layer, sel.slot);
  }

  function openEditor(sel) {
    selected = sel;
    $$(".slot").forEach((el) => el.classList.remove("selected"));
    const el = sel.kind === "key" ? $(`.slot[data-key="${sel.index}"]`) : $(`.slot[data-knob="${sel.layer}:${sel.slot}"]`);
    el?.classList.add("selected");
    $("#editor").hidden = false;
    $("#ed-title").textContent = el?.dataset.name || `Key ${sel.index}`;
    const v = currentValue(sel);
    const d = label(v);
    $("#ed-current").textContent = `Currently: ${d.label}`;
    // Macros only on matrix keys (the vendor app keeps knob macros in separate slots we haven't mapped).
    $$('#ed-tabs button[data-tab="shortcut"], #ed-tabs button[data-tab="text"]').forEach((b) => (b.hidden = sel.kind !== "key"));
    $$("#ed-mods input").forEach((i) => (i.checked = false));
    $("#ed-repeat").value = 1;
    if (d.kind === "key") { $("#ed-key").value = v[1]; setTab("key"); }
    else if (d.kind === "special") { $("#ed-special").value = K.SPECIAL.findIndex(([, , b]) => b[0] === v[0] && b[1] === v[1] && b[2] === v[2]); setTab("special"); }
    else if (d.kind === "macro") {
      const m = state.macros.get(d.slot);
      $("#ed-repeat").value = m?.repeat || 1;
      const ev = m ? K.decodeEvents(m.events).events : [];
      const downs = ev.filter((e) => !e.up);
      const mods = downs.filter((e) => e.hid >= 0xe0).map((e) => e.hid);
      const keys = downs.filter((e) => e.hid < 0xe0);
      if (keys.length === 1) {
        $$("#ed-mods input").forEach((i) => (i.checked = mods.includes(Number(i.value))));
        $("#ed-sc-key").value = keys[0].hid;
        setTab("shortcut");
      } else setTab("text");
    } else setTab(d.kind === "none" ? "none" : "key");
  }

  function closeEditor() {
    selected = null;
    $("#editor").hidden = true;
    $$(".slot").forEach((el) => el.classList.remove("selected"));
  }

  async function applyEditor() {
    const sel = selected;
    if (!sel || guardWrite()) return;
    const old = currentValue(sel);
    let value;
    let macro = null;
    if (tab === "key") value = [K.TYPE.KEY, Number($("#ed-key").value), 0, 0];
    else if (tab === "special") {
      const s = K.SPECIAL[Number($("#ed-special").value)];
      if (!s) return toast("Pick an action first", true);
      value = [...s[2], 0];
    } else if (tab === "none") value = [0, 0, 0, 0];
    else {
      let events;
      try {
        events = tab === "shortcut"
          ? K.shortcutEvents($$("#ed-mods input").filter((i) => i.checked).map((i) => Number(i.value)), Number($("#ed-sc-key").value))
          : K.textEvents($("#ed-text").value, Number($("#ed-text-delay").value) || 10);
      } catch (e) { return toast(e.message, true); }
      if (!events.length) return toast("Nothing to type", true);
      const bytes = K.encodeEvents(events);
      if (bytes.length > 508) return toast("Too long for one key (about 80 characters max)", true);
      const repeat = Math.min(255, Math.max(1, Number($("#ed-repeat").value) || 1));
      const slot = pickMacroSlot(sel.index);
      if (slot < 0) return toast(`All ${MACRO_SLOTS} macro slots in this profile are in use`, true);
      macro = { slot, repeat, bytes };
      value = [K.TYPE.MACRO, 0, slot, 0];
    }
    await busy(async () => {
      if (sel.kind === "key") {
        await dev.writeKey(sel.index, value);
        if (macro) {
          await dev.writeMacro(macro.slot, macro.repeat, macro.bytes);
          const back = await dev.readMacro(macro.slot);
          state.macros.set(macro.slot, back);
          if (back.events.length !== macro.bytes.length) throw new Error("The keyboard didn't store the macro");
        } else if (old[0] === K.TYPE.MACRO && old[2] < MACRO_SLOTS) {
          await dev.writeMacro(old[2], 0, new Uint8Array(0));
          state.macros.delete(old[2]);
        }
        state.keys.set(await dev.readKey(sel.index), sel.index * 4);
      } else {
        await dev.writeKnob(sel.layer, sel.slot, value);
        state.knob[sel.layer] = await dev.readKnob(sel.layer);
      }
      renderAll();
      const ok = currentValue(sel).every((b, i) => b === (value[i] || 0));
      toast(ok ? "Saved to keyboard" : "Written, but the keyboard reports a different value", !ok);
    });
  }

  // The firmware has 16 macro slots per profile (0..15); a macro key stores its slot in byte 2.
  // Reuse the key's own slot if it has one, otherwise take the lowest slot no other key uses.
  function pickMacroSlot(index) {
    const own = keyValue(index);
    if (own[0] === K.TYPE.MACRO && own[2] < MACRO_SLOTS) return own[2];
    const used = new Set();
    for (let i = 0; i < KEY_COUNT; i++) {
      const v = keyValue(i);
      if (i !== index && v[0] === K.TYPE.MACRO) used.add(v[2]);
    }
    for (let s = 0; s < MACRO_SLOTS; s++) if (!used.has(s)) return s;
    return -1;
  }

  // one-shot key capture from the computer keyboard
  function capture(btn, onKey) {
    btn.classList.add("listening");
    const prev = btn.textContent;
    btn.textContent = "Press a key… (Esc to cancel)";
    const handler = (e) => {
      if (["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(e.code) && onKey.wantsCombo) return;
      e.preventDefault();
      window.removeEventListener("keydown", handler, true);
      btn.classList.remove("listening");
      btn.textContent = prev;
      if (e.code === "Escape" && onKey.wantsCombo) return;
      const hid = K.codeToHid.get(e.code);
      if (hid === undefined) return toast(`That key (${e.code}) isn't in the list`, true);
      onKey(hid, e);
    };
    window.addEventListener("keydown", handler, true);
  }

  // ---------- lighting ----------
  const CONSTANT = 1;
  function lightRecord(mode) { return state.light.modes[mode]; }

  function renderLighting() {
    const h = state.light.header;
    const mode = h[0] & 0x3f;
    $("#lt-mode").value = String(mode);
    renderLightSettings(mode);
  }

  function renderLightSettings(mode) {
    const rec = mode >= 1 && mode <= 8 ? lightRecord(mode) : null;
    $("#lt-settings").hidden = !rec;
    if (!rec) return;
    $("#lt-bright").value = rec[0]; $("#lt-bright-v").textContent = rec[0];
    $("#lt-speed").value = rec[1]; $("#lt-speed-v").textContent = rec[1];
    $("#lt-dir").value = String(rec[2] ? 1 : 0);
    const box = $("#lt-colors");
    box.innerHTML = "";
    const color = (i) => rgbToHex(rec[4 + i * 3], rec[5 + i * 3], rec[6 + i * 3]); // stored R,G,B (verified on the LEDs)
    if (mode === CONSTANT) {
      // Constant shows the one selected color (lowest enabled bit), so offer a single picker.
      const sel = Math.max(0, [0, 1, 2, 3, 4, 5, 6].find((i) => rec[3] & (1 << i)) ?? 0);
      box.innerHTML = `<label>Color <input type="color" data-single value="${color(sel)}"></label>`;
      return;
    }
    for (let i = 0; i < 7; i++) {
      const on = !!(rec[3] & (1 << i));
      const l = document.createElement("label");
      l.innerHTML = `<input type="color" value="${color(i)}"><span><input type="checkbox" ${on ? "checked" : ""}> ${i + 1}</span>`;
      box.appendChild(l);
    }
  }

  async function applyLighting() {
    if (guardWrite()) return;
    await stopShow();
    const mode = Number($("#lt-mode").value);
    const h = state.light.header;
    const header = [(h[0] & 0xc0) | mode, h[1], h[2]];
    await busy(async () => {
      if (mode >= 1 && mode <= 8) {
        const rec = Uint8Array.from(lightRecord(mode)); // keep colors the form doesn't show
        rec[0] = Number($("#lt-bright").value);
        rec[1] = Number($("#lt-speed").value);
        rec[2] = Number($("#lt-dir").value);
        const single = $("#lt-colors input[data-single]");
        if (single) {
          rec.set(hexToRgb(single.value), 4);
          rec[3] = 0x01; // select color 1 only
        } else {
          let mask = 0;
          $$("#lt-colors label").forEach((l, i) => {
            rec.set(hexToRgb(l.querySelector("input[type=color]").value), 4 + i * 3);
            if (l.querySelector("input[type=checkbox]").checked) mask |= 1 << i;
          });
          rec[3] = mask;
        }
        await dev.writeLightingMode(mode, rec);
      }
      // The LEDs only pick up changes when the header is written, so send it after the mode record.
      await dev.writeLightingHeader(header);
      state.light = await dev.readLighting();
      renderLighting();
      toast("Lighting saved");
    });
  }

  // Roughly what the pad's LEDs show, for the 3D board: [r, g, b] for a key at x (0 = left, 1 = right), or null.
  function padGlow(t, x) {
    if (show) return W909Effects.color(W909Effects.LIST[show.index], (performance.now() - show.started) / 1000);
    const light = state?.light;
    const mode = light ? light.header[0] & 0x3f : 0;
    const rec = light?.modes[mode];
    if (!rec) return null; // LED off, or not loaded
    const k = 0.3 + (0.7 * Math.min(6, rec[0])) / 6;
    const colors = [0, 1, 2, 3, 4, 5, 6].filter((i) => rec[3] & (1 << i)).map((i) => Array.from(rec.slice(4 + i * 3, 7 + i * 3)));
    const scale = (c, f) => c.map((v) => v * f);
    if (mode === CONSTANT) return scale(colors[0] || Array.from(rec.slice(4, 7)), k);
    const p = t * (0.15 + rec[1] * 0.08);
    const wave = mode === 2 || mode === 3 || mode === 7 || mode === 8; // flowing/mono water, neon, ambilight
    if (wave) {
      const pos = p - x * 0.8;
      return scale(colors.length ? colors[Math.abs(Math.floor(pos * 2)) % colors.length] : W909Effects.hsv(((pos % 1) + 1) % 1), k);
    }
    const c = colors.length ? colors[Math.floor(p) % colors.length] : W909Effects.hsv((p * 0.25) % 1);
    return scale(c, k * (0.15 + 0.85 * (0.5 - 0.5 * Math.cos(p * 2 * Math.PI)))); // breathing
  }

  // ---------- light shows ----------
  // The page animates the pad by rewriting Constant mode's color, then the header (the LEDs only refresh on a
  // header write). Every write is saved by the keyboard, so shows stop on their own and then put the lighting back.
  const SHOW_SECONDS = 30;
  let show = null; // { index, started, saved: { header, constant } }

  function renderShows() {
    $$("#shows button[data-show]").forEach((b) => b.classList.toggle("on", show?.index === Number(b.dataset.show)));
    $("#show-stop").hidden = !show;
  }

  function startShow(index) {
    if (guardWrite() || !state?.light) return;
    const first = !show;
    show = { index, started: performance.now(), saved: show?.saved || { header: Uint8Array.from(state.light.header), constant: Uint8Array.from(lightRecord(CONSTANT)) } };
    renderShows();
    if (first) showFrame();
  }

  async function showFrame() {
    if (!show) return;
    const t = (performance.now() - show.started) / 1000;
    if (t > SHOW_SECONDS) return stopShow();
    const { header, constant } = show.saved;
    const rec = Uint8Array.from(constant);
    if (!rec[0]) rec[0] = 4; // brightness 0 would hide the show
    rec[3] = 0x01; // Constant shows the color selected in the mask
    rec.set(W909Effects.color(W909Effects.LIST[show.index], t), 4);
    try {
      // Queue both writes at once so a Stop can't land between them.
      await Promise.all([dev.writeLightingMode(CONSTANT, rec), dev.writeLightingHeader([(header[0] & 0xc0) | CONSTANT, header[1], header[2]])]);
    } catch (e) {
      console.error(e);
      show = null;
      renderShows();
      return;
    }
    setTimeout(showFrame, 0); // each frame is two writes of ~50 ms, about 10 frames a second
  }

  async function stopShow() {
    if (!show) return;
    const { saved } = show;
    show = null;
    renderShows();
    await dev.writeLightingMode(CONSTANT, saved.constant);
    await dev.writeLightingHeader(saved.header);
  }

  function buildShows() {
    $("#show-list").innerHTML = W909Effects.LIST.map((e, i) =>
      `<button data-show="${i}"><i class="swatch"></i><b>${e.name}</b><small>${e.about}</small></button>`).join("");
    const swatches = $$("#show-list .swatch");
    const preview = (now) => {
      W909Effects.LIST.forEach((e, i) => (swatches[i].style.background = `rgb(${W909Effects.color(e, now / 1000)})`));
      requestAnimationFrame(preview);
    };
    requestAnimationFrame(preview);
  }

  // ---------- backup / restore / factory reset (active profile) ----------
  const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  const fromHex = (h, len) => {
    if (typeof h !== "string" || !/^([0-9a-f]{2})*$/i.test(h) || (len && h.length !== len * 2)) throw new Error("Backup file is damaged");
    return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
  };

  async function backup() {
    await busy(async () => {
      const macros = {};
      for (let slot = 0; slot < MACRO_SLOTS; slot++) {
        const m = await dev.readMacro(slot);
        if (m.events.length) macros[slot] = { repeat: m.repeat, events: toHex(m.events) };
      }
      const data = {
        format: "w909-backup", version: 1, savedAt: new Date().toISOString(),
        firmware: state.info.firmware, board: state.info.board, profile: state.profile + 1,
        keys: toHex(state.keys),
        knob: state.knob.map(toHex),
        lighting: { header: toHex(state.light.header), modes: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((m) => [m, toHex(state.light.modes[m])])) },
        macros,
        sleepSeconds: state.power.sleepSeconds,
      };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = `w909-profile${state.profile + 1}-${data.savedAt.slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast(`Profile ${state.profile + 1} saved to ${a.download}`);
    });
  }

  // Writes a complete profile: macros first (so macro keys point at real data), then keys, knob, lighting, sleep.
  async function writeProfile(p) {
    await stopShow();
    for (let slot = 0; slot < MACRO_SLOTS; slot++) {
      const m = p.macros[slot];
      await dev.writeMacro(slot, m ? m.repeat : 0, m ? m.events : new Uint8Array(0));
    }
    await dev.writeKeys(p.keys);
    for (const layer of [0, 1]) await dev.writeKnobTable(layer, p.knob[layer]);
    for (let m = 1; m <= 8; m++) await dev.writeLightingMode(m, p.lightModes[m]);
    await dev.writeLightingHeader(p.lightHeader);
    await dev.setSleepSeconds(p.sleepSeconds);
    await loadAll();
  }

  function parseBackup(text) {
    let d;
    try { d = JSON.parse(text); } catch { throw new Error("That file isn't a W909 backup"); }
    if (d?.format !== "w909-backup" || d.version !== 1) throw new Error("That file isn't a W909 backup");
    const macros = {};
    for (const [slot, m] of Object.entries(d.macros || {})) {
      const n = Number(slot);
      if (!(n >= 0 && n < MACRO_SLOTS)) throw new Error("Backup file is damaged");
      macros[n] = { repeat: Math.min(255, Math.max(1, Number(m.repeat) || 1)), events: fromHex(m.events) };
      if (macros[n].events.length > 508) throw new Error("Backup file is damaged");
    }
    return {
      meta: d,
      keys: fromHex(d.keys, KEY_COUNT * 4),
      knob: [fromHex(d.knob?.[0], 8), fromHex(d.knob?.[1], 8)],
      lightHeader: fromHex(d.lighting?.header, 3),
      lightModes: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((m) => [m, fromHex(d.lighting?.modes?.[m], 25)])),
      macros,
      sleepSeconds: Math.min(7200, Math.max(60, Number(d.sleepSeconds) || 60)),
    };
  }

  async function restoreFile(file) {
    if (guardWrite()) return;
    let p;
    try { p = parseBackup(await file.text()); } catch (e) { return toast(e.message, true); }
    const from = `profile ${p.meta.profile ?? "?"}, saved ${String(p.meta.savedAt || "").slice(0, 10)}`;
    if (!confirm(`Replace everything in Profile ${state.profile + 1} with this backup (${from})?`)) return;
    await busy(async () => { await writeProfile(p); toast(`Backup restored to Profile ${state.profile + 1}`); });
  }

  async function factoryReset() {
    if (guardWrite()) return;
    if (!confirm(`Reset Profile ${state.profile + 1} to factory settings?\n\nThis replaces its keys, knob, joystick, macros, lighting and sleep timer. Tip: back it up first.`)) return;
    const F = K.FACTORY;
    const keys = new Uint8Array(KEY_COUNT * 4);
    for (const [i, v] of F.keys) keys.set(v, i * 4);
    await busy(async () => {
      await writeProfile({
        keys, knob: F.knob.map((k) => Uint8Array.from(k)), macros: {},
        lightHeader: F.lightHeader,
        lightModes: Object.fromEntries(Object.entries(F.lightModes).map(([m, h]) => [m, fromHex(h, 25)])),
        sleepSeconds: F.sleepSeconds,
      });
      toast(`Profile ${state.profile + 1} reset to factory settings`);
    });
  }

  // ---------- wire up ----------
  function init() {
    if (!W909.Device.isSupported() && !DEMO) {
      $("#unsupported").hidden = false;
      $("#connect").disabled = true;
      return;
    }
    initHelp();
    buildBoard();
    // 3D board when WebGL is available; otherwise the 2D board stays.
    try { if (typeof W909Board3D !== "undefined") W909Board3D.mount($(".board-wrap"), { glow: padGlow }); }
    catch (e) { console.error("3D board failed", e); }
    showOffline();
    fillSelects();
    buildShows();
    $("#lt-mode").innerHTML = LIGHT_MODES.map((n, i) => `<option value="${i + 1}">${n}</option>`).join("");

    $("#connect").addEventListener("click", () => (dev ? disconnect() : connect()));
    $("#reload").addEventListener("click", () => busy(async () => { await stopShow(); await loadAll(); }));
    $("#backup").addEventListener("click", backup);
    $("#restore").addEventListener("click", () => !guardWrite() && $("#restore-file").click());
    $("#restore-file").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) restoreFile(f); });
    $("#factory").addEventListener("click", factoryReset);
    $("#use-cable").addEventListener("click", async () => { await disconnect(); await connect(); });
    $("#profiles").addEventListener("click", (e) => {
      const p = e.target.dataset.profile;
      if (p === undefined || !state || Number(p) === state.profile || guardWrite()) return;
      busy(async () => { await stopShow(); await dev.setProfile(Number(p)); await loadAll(); toast(`Switched to Profile ${Number(p) + 1}`); });
    });
    document.querySelector(".pad-wrap").addEventListener("click", (e) => {
      const s = e.target.closest(".slot");
      if (!s || !dev || !state) return;
      if (s.dataset.key) openEditor({ kind: "key", index: Number(s.dataset.key) });
      else { const [layer, slot] = s.dataset.knob.split(":").map(Number); openEditor({ kind: "knob", layer, slot }); }
    });
    $("#ed-tabs").addEventListener("click", (e) => e.target.dataset.tab && setTab(e.target.dataset.tab));
    $("#ed-cancel").addEventListener("click", closeEditor);
    $("#ed-apply").addEventListener("click", applyEditor);
    $("#ed-capture").addEventListener("click", (e) => capture(e.currentTarget, (hid) => ($("#ed-key").value = hid)));
    const combo = (hid, ev) => {
      const want = { 0xe0: ev.ctrlKey, 0xe1: ev.shiftKey, 0xe2: ev.altKey, 0xe3: ev.metaKey };
      $$("#ed-mods input").forEach((i) => (i.checked = !!want[Number(i.value)]));
      $("#ed-sc-key").value = hid;
    };
    combo.wantsCombo = true;
    $("#ed-sc-capture").addEventListener("click", (e) => capture(e.currentTarget, combo));
    $("#lt-mode").addEventListener("change", (e) => renderLightSettings(Number(e.target.value)));
    $("#lt-bright").addEventListener("input", (e) => ($("#lt-bright-v").textContent = e.target.value));
    $("#lt-speed").addEventListener("input", (e) => ($("#lt-speed-v").textContent = e.target.value));
    $("#lt-apply").addEventListener("click", applyLighting);
    $("#show-list").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-show]");
      if (b && dev && state) startShow(Number(b.dataset.show));
    });
    $("#show-stop").addEventListener("click", () => busy(stopShow));
    // Best effort: put the lighting back if the tab closes mid-show.
    window.addEventListener("pagehide", () => { if (show && dev) stopShow(); });
    $("#pw-apply").addEventListener("click", () => !guardWrite() && busy(async () => {
      const min = Math.min(120, Math.max(1, Number($("#pw-sleep").value) || 1));
      await dev.setSleepSeconds(min * 60);
      state.power = await dev.readPowerTimers();
      renderAll();
      toast("Sleep timer saved");
    }));

    connect(true); // reconnect silently if permission was granted before
  }

  init();
})();
