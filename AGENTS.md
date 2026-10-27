# AGENTS.md

Guidance for coding agents working in this repo.

## What this is
A WebHID configurator for the Syntax W909 macro pad (USB `b6a4:4100` cable, `b6a4:4101` 2.4G receiver).
The protocol reference is `device-info/PROTOCOL.md`; read it before touching device code. Sources, findings and open questions are in `device-info/README.md`.

## Layout
- `web/` is the shipped app: plain HTML/CSS/JS, **no build step, no modules, no dependencies**. Scripts load as classic
  `<script>` tags in this order: `w909-protocol.js` → `w909-keys.js` → `w909-mock.js` → `w909-effects.js` → `app.js`. Each file defines one global
  (`W909`, `W909Keys`, `W909Mock`, `W909Effects`); `app.js` is an IIFE.
- `tools/`: Swift probes (`w909.swift`, `w909-bridge.swift`) and `test-protocol.mjs`, which runs the real web protocol code under Node against the keyboard.
- `device-info/`: the single home for what we know about the device (sources with links, findings, protocol, raw dumps).
  Record new findings there.
- `reverse-engineering/`, `vendor-downloads/` and `xfp-win/` are local-only (vendor software and its disassembly). They're
  git-ignored and must never be committed.

## Device facts that are easy to get wrong
- Packets: feature report 6, `00 01 cmd seq arg addrLo addrHi len data…`; `cmd | 0x80` reads. Writes get no reply; wait ~50 ms.
- Keys, knob, lighting and macros are **per profile** and apply to the *active* profile (`cmd 02 arg 2`).
- **16 macro slots per profile (0..15).** A macro key is `0a 00 <slot> 00`; writes to slot ≥16 are silently dropped.
  The UI allocates slots with `pickMacroSlot()`.
- Lighting colors are **R,G,B**. Constant mode shows the color selected in the enable mask, not necessarily color 1.
  Write the mode record **before** the header; the LEDs only refresh on a header write.
- Light shows stream Constant-mode writes (record + header, ~10 a second). The keyboard keeps every write, so shows are
  time-limited and restore the saved record and header when they stop. Don't make them run indefinitely.
- The 2.4G receiver returns reads but ignores writes. The UI is read-only on PID `0x4101`.
- Physical layout ↔ matrix index mapping is in `LAYOUT` (`web/app.js`) and in PROTOCOL.md. Index 34 has no physical key
  and isn't shown in the UI.
  Knob table 1 (`cmd 05 arg 1`) has an unknown trigger and is deliberately not shown.

## Working with the hardware
- Prefer reads. Before any experimental write, save what you'll change and restore it afterwards. `--write-test` in
  `tools/test-protocol.mjs` does this: it saves and restores key index 3, macro slot 3 and knob table 1, and rewrites the
  active profile's keys, knob tables, macro slots and lighting header with their own values.
- Ask the user before writes that change visible behaviour, and have them confirm physical effects (lights, typed output).
  Record confirmed behaviour in `device-info/README.md` ("Verified on the hardware") and the format details in PROTOCOL.md.
- Configure over the cable. Build the probe with `swiftc -O tools/w909.swift -o tools/w909`, then
  `tools/w909 <cmd> <arg> <addr> <len> [data…]` (all hex), e.g. `tools/w909 84 0 0 20` reads keys 0-7. It targets PID 0x4100
  by default; `W909_PID=4101` uses the receiver. The bridge for the Node tests builds the same way from `w909-bridge.swift`.

## Verifying changes
- `node --check web/*.js` for syntax.
- UI: serve `web/` (`python3 -m http.server 8909`) and screenshot `?demo` (or `?demo=receiver`) with headless Chrome.
  Use a throwaway `--user-data-dir` (e.g. `.chrome-test/`) and delete it afterwards. Check stderr for `CONSOLE`/`Uncaught`.
- Protocol: `node tools/test-protocol.mjs` (read-only) or `--write-test` (needs `tools/w909-bridge` built and the keyboard on the cable).
- Keep `w909-mock.js` behaving like the real firmware (e.g. it rejects macro slots ≥16) so the demo catches the same bugs.

## Conventions
- Match the existing code style: small helpers, `$`/`$$` selectors, `busy()` around device work, `toast()` for feedback, and
  `guardWrite()` before any write.
- Factory defaults live in `W909Keys.FACTORY` (keys, knob, lighting, sleep timer). The disconnected view, factory reset and
  the demo emulator all use them; reuse them rather than duplicating.
- Backup files are `{"format": "w909-backup", "version": 1, …}` (see `backup()` / `parseBackup()` in `app.js`). People will
  keep these files, so stay able to read version 1; bump the version for incompatible changes.
- Platform tips (Windows/Linux panels in `index.html`) are chosen by `platform()`; keep the Linux udev rule identical to the README.
- Put downloaded files in organized folders inside the repo (e.g. `vendor-downloads/<name>/`), never `/tmp`.
