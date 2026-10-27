// Key action tables for the W909. A key action is 4 bytes: [type, b1, b2, b3].
// Types and values were recovered from the vendor app's encoder (SXS-W909.exe 0x47ebe0).

const W909Keys = (() => {
  // USB HID keyboard usages (page 0x07), with the browser KeyboardEvent.code that produces them.
  const HID = [
    [0x04, "A", "KeyA"], [0x05, "B", "KeyB"], [0x06, "C", "KeyC"], [0x07, "D", "KeyD"], [0x08, "E", "KeyE"],
    [0x09, "F", "KeyF"], [0x0a, "G", "KeyG"], [0x0b, "H", "KeyH"], [0x0c, "I", "KeyI"], [0x0d, "J", "KeyJ"],
    [0x0e, "K", "KeyK"], [0x0f, "L", "KeyL"], [0x10, "M", "KeyM"], [0x11, "N", "KeyN"], [0x12, "O", "KeyO"],
    [0x13, "P", "KeyP"], [0x14, "Q", "KeyQ"], [0x15, "R", "KeyR"], [0x16, "S", "KeyS"], [0x17, "T", "KeyT"],
    [0x18, "U", "KeyU"], [0x19, "V", "KeyV"], [0x1a, "W", "KeyW"], [0x1b, "X", "KeyX"], [0x1c, "Y", "KeyY"],
    [0x1d, "Z", "KeyZ"],
    [0x1e, "1", "Digit1"], [0x1f, "2", "Digit2"], [0x20, "3", "Digit3"], [0x21, "4", "Digit4"], [0x22, "5", "Digit5"],
    [0x23, "6", "Digit6"], [0x24, "7", "Digit7"], [0x25, "8", "Digit8"], [0x26, "9", "Digit9"], [0x27, "0", "Digit0"],
    [0x28, "Enter", "Enter"], [0x29, "Esc", "Escape"], [0x2a, "Backspace", "Backspace"], [0x2b, "Tab", "Tab"],
    [0x2c, "Space", "Space"], [0x2d, "-", "Minus"], [0x2e, "=", "Equal"], [0x2f, "[", "BracketLeft"],
    [0x30, "]", "BracketRight"], [0x31, "\\", "Backslash"], [0x33, ";", "Semicolon"], [0x34, "'", "Quote"],
    [0x35, "`", "Backquote"], [0x36, ",", "Comma"], [0x37, ".", "Period"], [0x38, "/", "Slash"],
    [0x39, "Caps Lock", "CapsLock"],
    [0x3a, "F1", "F1"], [0x3b, "F2", "F2"], [0x3c, "F3", "F3"], [0x3d, "F4", "F4"], [0x3e, "F5", "F5"],
    [0x3f, "F6", "F6"], [0x40, "F7", "F7"], [0x41, "F8", "F8"], [0x42, "F9", "F9"], [0x43, "F10", "F10"],
    [0x44, "F11", "F11"], [0x45, "F12", "F12"],
    [0x46, "Print Screen", "PrintScreen"], [0x47, "Scroll Lock", "ScrollLock"], [0x48, "Pause", "Pause"],
    [0x49, "Insert", "Insert"], [0x4a, "Home", "Home"], [0x4b, "Page Up", "PageUp"], [0x4c, "Delete", "Delete"],
    [0x4d, "End", "End"], [0x4e, "Page Down", "PageDown"],
    [0x4f, "→", "ArrowRight"], [0x50, "←", "ArrowLeft"], [0x51, "↓", "ArrowDown"], [0x52, "↑", "ArrowUp"],
    [0x53, "Num Lock", "NumLock"], [0x54, "Keypad /", "NumpadDivide"], [0x55, "Keypad *", "NumpadMultiply"],
    [0x56, "Keypad -", "NumpadSubtract"], [0x57, "Keypad +", "NumpadAdd"], [0x58, "Keypad Enter", "NumpadEnter"],
    [0x59, "Keypad 1", "Numpad1"], [0x5a, "Keypad 2", "Numpad2"], [0x5b, "Keypad 3", "Numpad3"],
    [0x5c, "Keypad 4", "Numpad4"], [0x5d, "Keypad 5", "Numpad5"], [0x5e, "Keypad 6", "Numpad6"],
    [0x5f, "Keypad 7", "Numpad7"], [0x60, "Keypad 8", "Numpad8"], [0x61, "Keypad 9", "Numpad9"],
    [0x62, "Keypad 0", "Numpad0"], [0x63, "Keypad .", "NumpadDecimal"],
    [0x64, "ISO \\", "IntlBackslash"], [0x65, "Menu", "ContextMenu"],
    [0x68, "F13", "F13"], [0x69, "F14", "F14"], [0x6a, "F15", "F15"], [0x6b, "F16", "F16"], [0x6c, "F17", "F17"],
    [0x6d, "F18", "F18"], [0x6e, "F19", "F19"], [0x6f, "F20", "F20"], [0x70, "F21", "F21"], [0x71, "F22", "F22"],
    [0x72, "F23", "F23"], [0x73, "F24", "F24"],
    [0xe0, "Left Ctrl", "ControlLeft"], [0xe1, "Left Shift", "ShiftLeft"], [0xe2, "Left Alt/Option", "AltLeft"],
    [0xe3, "Left Win/Cmd", "MetaLeft"], [0xe4, "Right Ctrl", "ControlRight"], [0xe5, "Right Shift", "ShiftRight"],
    [0xe6, "Right Alt/Option", "AltRight"], [0xe7, "Right Win/Cmd", "MetaRight"],
  ];
  const hidName = new Map(HID.map(([c, n]) => [c, n]));
  const codeToHid = new Map(HID.map(([c, , k]) => [k, c]));
  const MODS = [
    { bit: 0xe0, label: "Ctrl" }, { bit: 0xe1, label: "Shift" }, { bit: 0xe2, label: "Alt/Option" }, { bit: 0xe3, label: "Win/Cmd" },
  ];

  // Non-keyboard actions: [label, group, bytes]
  const SPECIAL = [
    ["Play / Pause", "Media", [0x04, 0xcd, 0x00]], ["Next track", "Media", [0x04, 0xb5, 0x00]],
    ["Previous track", "Media", [0x04, 0xb6, 0x00]], ["Stop", "Media", [0x04, 0xb7, 0x00]],
    ["Volume up", "Media", [0x04, 0xe9, 0x00]], ["Volume down", "Media", [0x04, 0xea, 0x00]],
    ["Mute", "Media", [0x04, 0xe2, 0x00]],
    ["Screen brightness +", "Media", [0x04, 0x6f, 0x00]], ["Screen brightness −", "Media", [0x04, 0x70, 0x00]],
    ["Media player", "Apps", [0x04, 0x83, 0x01]], ["Mail", "Apps", [0x04, 0x8a, 0x01]],
    ["Calculator", "Apps", [0x04, 0x92, 0x01]], ["My Computer", "Apps", [0x04, 0x94, 0x01]],
    ["Browser search", "Browser", [0x04, 0x21, 0x02]], ["Browser home", "Browser", [0x04, 0x23, 0x02]],
    ["Browser back", "Browser", [0x04, 0x24, 0x02]], ["Browser forward", "Browser", [0x04, 0x25, 0x02]],
    ["Browser stop", "Browser", [0x04, 0x26, 0x02]], ["Browser refresh", "Browser", [0x04, 0x27, 0x02]],
    ["Browser favorites", "Browser", [0x04, 0x2a, 0x02]],
    ["Mouse wheel up", "Mouse", [0x05, 0x01, 0x00]], ["Mouse wheel down", "Mouse", [0x05, 0x81, 0x00]],
    ["Mouse wheel left", "Mouse", [0x0b, 0x01, 0x00]], ["Mouse wheel right", "Mouse", [0x0b, 0x81, 0x00]],
    ["Power", "System", [0x03, 0x01, 0x00]], ["Sleep", "System", [0x03, 0x02, 0x00]], ["Wake", "System", [0x03, 0x04, 0x00]],
    ["LED mode cycle", "Lighting", [0x07, 0x01, 0x00]], ["LED speed cycle", "Lighting", [0x07, 0x02, 0x00]],
    ["LED brightness cycle", "Lighting", [0x07, 0x03, 0x00]], ["LED on/off", "Lighting", [0x07, 0x04, 0x00]],
    ["LED brightness +", "Lighting", [0x07, 0x03, 0x01]], ["LED brightness −", "Lighting", [0x07, 0x03, 0x02]],
    ["LED speed +", "Lighting", [0x07, 0x02, 0x01]], ["LED speed −", "Lighting", [0x07, 0x02, 0x02]],
    ["LED color cycle", "Lighting", [0x07, 0x06, 0x00]], ["LED color +", "Lighting", [0x07, 0x06, 0x01]],
    ["LED color −", "Lighting", [0x07, 0x06, 0x02]], ["LED color select", "Lighting", [0x07, 0x06, 0x03]],
    ["Next profile", "Profile", [0x09, 0x01, 0x00]], ["Previous profile", "Profile", [0x09, 0x02, 0x00]],
    ["Profile cycle", "Profile", [0x09, 0x03, 0x00]], ["Profile 1", "Profile", [0x09, 0x04, 0x00]],
    ["Profile 2", "Profile", [0x09, 0x04, 0x01]],
    ["Fn", "Keyboard", [0x0c, 0x01, 0x00]],
    ["Win key unlock", "Locks", [0x0d, 0x01, 0x01]], ["Win key lock", "Locks", [0x0d, 0x01, 0x02]],
    ["Win key lock toggle", "Locks", [0x0d, 0x01, 0x03]], ["Alt+F4 unlock", "Locks", [0x0d, 0x02, 0x01]],
    ["Alt+F4 lock", "Locks", [0x0d, 0x02, 0x02]], ["Alt+F4 lock toggle", "Locks", [0x0d, 0x02, 0x03]],
    ["All keys unlock", "Locks", [0x0d, 0x03, 0x01]], ["All keys lock", "Locks", [0x0d, 0x03, 0x02]],
    ["All keys lock toggle", "Locks", [0x0d, 0x03, 0x03]],
    ["Windows mode", "Locks", [0x0e, 0x01, 0x00]], ["Mac mode", "Locks", [0x0e, 0x02, 0x00]],
    ["Win/Mac toggle", "Locks", [0x0e, 0x03, 0x00]],
  ];

  const TYPE = { NONE: 0x00, KEY: 0x02, MACRO: 0x0a };

  function same(a, b) {
    return a[0] === b[0] && a[1] === b[1] && (a[2] || 0) === (b[2] || 0);
  }

  function describe(v) {
    if (!v || (v[0] === 0 && v[1] === 0 && v[2] === 0)) return { label: "—", kind: "none" };
    if (v[0] === TYPE.KEY) return { label: hidName.get(v[1]) || `Key 0x${v[1].toString(16)}`, kind: "key" };
    if (v[0] === TYPE.MACRO) return { label: "Macro", kind: "macro", slot: v[2] };
    const s = SPECIAL.find(([, , b]) => same(v, b));
    if (s) return { label: s[0], kind: "special", group: s[1] };
    return { label: Array.from(v.slice(0, 4), (x) => x.toString(16).padStart(2, "0")).join(" "), kind: "unknown" };
  }

  // ---- Macro event stream ----
  // Key event: [hid, (release ? 0x80 : 0) | delay]  (delay 0..126)
  // Long delay: [hid, release ? 0xff : 0x7f, 0xff, d0, d1, d2] with d = delay - 0x7f
  // 0xfb..0xfe are mouse events (not created by this page, but decoded so they can be shown).
  function encodeEvents(events) {
    const out = [];
    for (const e of events) {
      const d = Math.max(0, Math.round(e.delay || 0));
      if (d < 0x7f) {
        out.push(e.hid, (e.up ? 0x80 : 0) | d);
      } else {
        const x = d - 0x7f;
        out.push(e.hid, e.up ? 0xff : 0x7f, 0xff, x & 0xff, (x >> 8) & 0xff, (x >> 16) & 0xff);
      }
    }
    return new Uint8Array(out);
  }

  function decodeEvents(bytes) {
    const ev = [];
    let i = 0;
    while (i < bytes.length) {
      const t = bytes[i];
      if (t >= 0xfb) return { events: ev, complex: true };
      const b = bytes[i + 1];
      if ((b & 0x7f) === 0x7f && bytes[i + 2] === 0xff) {
        const d = bytes[i + 3] | (bytes[i + 4] << 8) | (bytes[i + 5] << 16);
        ev.push({ hid: t, up: !!(b & 0x80), delay: d + 0x7f });
        i += 6;
      } else {
        ev.push({ hid: t, up: !!(b & 0x80), delay: b & 0x7f });
        i += 2;
      }
    }
    return { events: ev, complex: false };
  }

  const isMod = (h) => h >= 0xe0 && h <= 0xe7;
  const modLabel = (h) => ["Ctrl", "Shift", "Alt", "Win/Cmd"][(h - 0xe0) % 4];

  // Human summary: "Ctrl+C", or "Ctrl+C, Ctrl+V", or "type: hello"
  function summarizeEvents(events) {
    const parts = [];
    const held = [];
    let pressed = [];
    for (const e of events) {
      if (!e.up) {
        if (isMod(e.hid)) held.push(e.hid);
        else pressed.push(e.hid);
      } else if (isMod(e.hid)) {
        const i = held.indexOf(e.hid);
        if (i >= 0) held.splice(i, 1);
      } else if (pressed.includes(e.hid)) {
        parts.push([...held.map(modLabel), hidName.get(e.hid) || "?"].join("+"));
        pressed = pressed.filter((h) => h !== e.hid);
      }
    }
    return parts.join(", ");
  }

  function shortcutEvents(mods, hid, delay = 10) {
    const ev = [];
    for (const m of mods) ev.push({ hid: m, up: false, delay });
    ev.push({ hid, up: false, delay }, { hid, up: true, delay });
    for (const m of [...mods].reverse()) ev.push({ hid: m, up: true, delay });
    return ev;
  }

  // US layout text -> events
  const SHIFTED = { "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
    "_": "-", "+": "=", "{": "[", "}": "]", "|": "\\", ":": ";", "\"": "'", "~": "`", "<": ",", ">": ".", "?": "/" };
  const CHAR = new Map(HID.filter(([c]) => c < 0x39).map(([c, n]) => [n.length === 1 ? n.toLowerCase() : n, c]));
  CHAR.set(" ", 0x2c); CHAR.set("\n", 0x28); CHAR.set("\t", 0x2b);
  function textEvents(text, delay = 10) {
    const ev = [];
    for (const ch of text) {
      let shift = false;
      let base = ch;
      if (SHIFTED[ch]) { shift = true; base = SHIFTED[ch]; }
      else if (ch >= "A" && ch <= "Z") { shift = true; base = ch.toLowerCase(); }
      const hid = CHAR.get(base);
      if (hid === undefined) throw new Error(`Can't type "${ch}" (US layout only)`);
      ev.push(...shortcutEvents(shift ? [0xe1] : [], hid, delay));
    }
    return ev;
  }

  // Factory default settings of profile 1 (read from an untouched W909; matches the printed keycaps).
  const FACTORY = {
    keys: [[0, [2, 0x5e]], [1, [2, 0x58]], [2, [7, 1]], [8, [2, 0x5d]], [9, [2, 0x63]], [10, [2, 0x56]],
      [16, [2, 0x5c]], [17, [2, 0x62]], [18, [2, 0x57]], [24, [2, 0x5b]], [25, [2, 0x61]], [26, [2, 0x2c]],
      [32, [2, 0x5a]], [33, [2, 0x60]], [34, [9, 3]], [40, [2, 0x59]], [41, [2, 0x5f]], [42, [2, 0x28]],
      [50, [2, 0x50]], [58, [2, 0x4f]], [66, [2, 0x51]], [74, [2, 0x52]]],
    knob: [[4, 0xea, 0, 0, 4, 0xe9, 0, 0], [7, 3, 2, 0, 7, 3, 1, 0]],
    // Lighting: header [mode 8 = Ambilight, LED mask 0x1ff] and the eight per-mode records (hex).
    lightHeader: [0x88, 0xff, 0x01],
    lightModes: {
      1: "0400000000ff00000000000000000000000000000000000000",
      2: "0400007f00ff00ff00000000ffffff00008080ff00ffffffff",
      3: "04000000000000000000000000000000000000000000000000",
      4: "0400000000ff00000000000000000000000000000000000000",
      5: "0400007f00ff00ff00000000ffffff00008080ff00ffffffff",
      6: "0300007f00ff00ff00000000ffffff00008080ff00ffffffff",
      7: "04000000000000000000000000000000000000000000000000",
      8: "04000000000000000000000000000000000000000000000000"
    },
    sleepSeconds: 60,
  };

  return { FACTORY, HID, hidName, codeToHid, MODS, SPECIAL, TYPE, describe, encodeEvents, decodeEvents, summarizeEvents,
    shortcutEvents, textEvents };
})();
