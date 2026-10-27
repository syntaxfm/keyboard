# W909 device notes

Everything we learned about the Syntax W909 macro pad while building the configurator, and where it came from.
The wire protocol itself is in [PROTOCOL.md](PROTOCOL.md).

## Sources

| Source | What it is | What it told us |
|---|---|---|
| The keyboard itself (macOS `ioreg`, IOKit HID) | USB descriptors and live feature-report reads/writes | Device identity, the HID interfaces, and every behaviour marked "verified" below |
| <https://xuanfang.co/xfp-web/#/> | Web configurator the seller pointed to (xuanfang / 炫方 macro pads) | Uses WebHID, but only for VID `0xAF88` / PID `0x6688`, a different product line. Not compatible with the W909 |
| <http://xf.xuanfang.co/xfp-win.zip> (and `xfp-mac.zip`) | xuanfang's Windows/Mac configurator | Also only accepts VID `0xAF88`. Not compatible |
| `SXS-W909_V1.0.5.exe` (Inno Setup installer, signed by Shenzhen Yixintong Electronic Science & Technology Co., Ltd.) | **The W909's own configurator ("DevDock")** | Lists the W909's USB IDs. Its config files and code gave us the protocol, key codes, lighting modes and factory layout |
| [innoextract](https://constexpr.org/innoextract/) (development build, for Inno Setup 6.3) | Unpacks the installer without running it | |
| `llvm-objdump` (Xcode) | Disassembler | Used to read the configurator's HID code |
| Photos of the pad | Physical layout and keycap legends | The key positions used in the web UI |
| Product listings ([Adventurers W909](https://camelcamelcamel.com/product/B0F5431KGD), [MKESPN W909](https://keeb-finder.com/keyboards/filter/brand-MKESPN)) | Retail versions of the same tri-mode pad | Confirms it's a generic tri-mode (USB / Bluetooth / 2.4G) design |

The vendor software is copyrighted and is **not** included in this repository.

## Device identity

| | Cable | 2.4G receiver |
|---|---|---|
| USB vendor / product | `0xB6A4` / `0x4100` | `0xB6A4` / `0x4101` |
| Strings | "YXT" / "W909 Pro USB" | "YXT" / "W909 Pro 2.4G" |
| bcdDevice | 1.00 | 2.00 |

- "YXT" is Shenzhen **Y**i**x**in**t**ong, the maker of the board and the SXS-W909 app.
- Firmware `2.3.0400`, board id `K2005-B01-260915` (read with command `f0`).
- **Not QMK/VIA.** There's no Raw HID collection on usage page `0xFF60`.
- HID interfaces (raw descriptors in [report-descriptors.txt](report-descriptors.txt) and
  [report-descriptors-2.4g-receiver.txt](report-descriptors-2.4g-receiver.txt)):
  - Interface 0: mouse (buttons, 16-bit X/Y, wheel, horizontal pan)
  - Interface 1: boot keyboard (8-byte report, LED output)
  - Interface 2 report IDs:
    - 3 = consumer controls
    - 4 = system control
    - 5 = vendor `0xFF00` 24-byte input
    - **6 = vendor `0xFF01` 40-byte feature report (the configuration channel)**
    - 7 = full-rollover keyboard

## How the protocol was found

1. **Device dump.** The descriptors showed a 40-byte vendor feature report (ID 6), the classic shape of a config channel.
   Reading it while idle returns zeros.
2. **Dead end: xuanfang tools.** The seller's site and app speak a simple `0xAF`-prefixed protocol over output reports,
   but only to VID `0xAF88`. Neither the W909's cable nor its receiver matches.
3. **The right app.** SXS-W909's device list names `b6a4:4100` "W909 Pro USB" and `b6a4:4101` "W909 Pro 2.4G". The app
   talks to the keyboard with `HidD_SetFeature` / `HidD_GetFeature` on report 6.
4. **Packet builder.** One function frames every command as `00 01 cmd seq arg addr(LE16) len data`. Reads are the
   write command with bit `0x80` set; the reply is fetched with GET_FEATURE and echoes the header.
5. **Command map.** Following each caller gave keys (`04`), knob (`05`), macros (`08`), lighting (`09`), settings (`02`)
   and version strings (`f0`).
6. **Key encoding.** The app's key encoder maps its internal key numbers to 4-byte actions. Names for those numbers come
   from the app's default profile file, giving the full action table in `web/w909-keys.js`.
7. **Layout.** The app's default key matrix for the W909 (6 rows × 3 columns plus a joystick) matches the printed
   keycaps (1–6 = Keypad 1–6, …). The photos and two button presses placed every physical control.
8. **Everything was then confirmed on the hardware** (below), which corrected a few guesses.

## Verified on the hardware

- Reads and writes of keys, knob, lighting, macros, profile and sleep timer work over the **cable**, and **persist** across unplug/replug.
- Over the **2.4G receiver**, reads work in 2.4G mode but **writes are ignored**. While the keyboard is cabled, the receiver returns no data.
- Settings are **per profile** (two profiles). Reads and writes apply to the active profile.
- There are **16 macro slots per profile**. Writes to slot 16+ are silently dropped; a key just points at a slot.
- A macro header of `01 00` plays once (typed "hi" and "CJ" on test keys).
- Lighting colors are **R, G, B**: `ff 00 00` / `00 ff 00` / `00 00 ff` showed red / green / blue with one color enabled.
- **Constant** mode shows the color selected in the record's enable mask, not necessarily color 1.
- The LEDs only refresh when the lighting **header** is written, so write the mode record first.
- Knob press = matrix index 2 (factory: LED mode cycle); joystick press = index 42 (factory: Enter).
- Effect names from the app match what the pad does.

## Corrections along the way

- Colors were first guessed as G,R,B (from the app's default palette), then B,G,R (from a test that was actually showing a
  different, still-enabled color). A controlled test settled it: R,G,B.
- Lighting modes are numbered from 1 (Constant) to 9 (off), one more than the app's effect list index.
- Macro slots were first assumed to equal the key index. That only works for keys below 16.

## Open questions

- **Knob table 1** (factory: LED brightness −/+): exists in memory, but it's not triggered by turning while pressed. Trigger unknown.
- **Matrix index 34** (factory: profile cycle) has no physical key. A hidden key combination might trigger it.
- **Macro repeat modes.** The app offers "until released", "until pressed again" and "N times". Only the count (header word) is mapped.
- **Macro delay units** are assumed to be milliseconds.
- **Bank 1 of the key table** (indexes 160+) holds a generic full-keyboard Fn layer that this pad doesn't seem to use.
- **Seven-color effects:** exactly how the enable mask affects each effect.
- **Lighting header high bits** (`0x80`/`0x40` in the mode byte) are preserved but not understood.

## Files here

- [PROTOCOL.md](PROTOCOL.md): the command reference.
- [report-descriptors.txt](report-descriptors.txt), [report-descriptors-2.4g-receiver.txt](report-descriptors-2.4g-receiver.txt): raw HID report descriptors (hex).
- [probe-reads.txt](probe-reads.txt), [probe-lighting-keys.txt](probe-lighting-keys.txt): first raw reads from a keyboard in
  near-factory state. Factory lighting defaults come from here.
