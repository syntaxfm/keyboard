# W909 Pro configuration protocol (verified on firmware 2.3.0400)

Transport: HID feature report ID 6 (vendor page 0xFF01), 40 data bytes, on the USB-cable interface (VID 0xB6A4, PID 0x4100).
Over the 2.4G receiver (PID 0x4101), reads work while the keyboard is in 2.4G mode, but writes are ignored. While the
keyboard is cabled, the receiver echoes commands and returns no data. Configure over the cable.

Packet: `00 01 cmd seq arg addrLo addrHi len data[0..31]`. `cmd | 0x80` reads. Send the read with SET_FEATURE,
then poll GET_FEATURE until bytes [2..3] echo cmd+seq; the data follows the 8-byte header. The vendor app sleeps 50 ms after writes.

| cmd | arg | addr | len | meaning |
|---|---|---|---|---|
| 02/82 | 2 | 0 | 1 | active profile (0/1); key/light reads and writes apply to the active profile |
| 02/82 | 3 | 0 | 2 | sleep timeout, seconds (LE16) |
| 82 | 4 | 0 | 2 | power-off timeout, seconds (read only from the app's point of view) |
| 04/84 | bank (0: idx<160, 1: idx-160) | idx*4 | 4/key (up to 32) | key action |
| 05/85 | knob table 0/1 | slot*4 | 4 | knob: slot 0 = turn left, 1 = turn right. Table 1 (factory: LED brightness −/+) has an unknown trigger; it is not press+turn, and the page doesn't show it |
| 08/88 | macro slot 0..15 (per profile; writes to 16+ are ignored) | byte offset | ≤32 | macro stream |
| 09/89 | 0 | 0 | 25 | lighting header: [mode (low 6 bits, keep high bits), LED mask LE16] |
| 09/89 | 0 | mode*25 | 25 | per-mode record, mode 1..8: [brightness 0-6, speed 0-7, direction, color-enable mask (7 bits), 7 × (R,G,B)]. Colors are R,G,B (verified red/green/blue with one color enabled). Constant shows the color selected in the mask. Write the mode record first, then the header; the LEDs only refresh on a header write |
| f0 | 1 / 2 | 0 | 8 / 16 | firmware version / board id (ASCII) |

Key matrix: index = row*8 + col. The pad uses rows 0-5 × cols 0-2, plus the joystick at 50 (left), 58 (right), 66 (down), 74 (up).

Key action (4 bytes): `02 hid` = keyboard key; `04 lo hi` = consumer usage; `03 n` = system (1 power, 2 sleep, 4 wake);
`05 01/81` = wheel up/down; `0b 01/81` = wheel left/right; `07 ..` = LED control; `09 ..` = profile; `0c 01` = Fn;
`0d ..` = locks; `0e ..` = Win/Mac mode; `0a 00 slot` = macro (slot 0..15, chosen freely; the key just points at it). The full table is in web/w909-keys.js.

Lighting modes: 1 Constant, 2 Flowing water, 3 Mono water, 4 Breathing, 5 Cycle breathing, 6 Enraptured, 7 Neon, 8 Ambilight, 9 LED off.

Macro stream: `[repeat LE16][event-byte length LE16][events]`, max 512 bytes. A key event is `[hid, (release?0x80:0)|delay]`;
a long delay is `[hid, 0x7f|0xff, 0xff, (delay-0x7f) LE24]`. 0xfb-0xfe are mouse events.
A header of 01 00 plays once (verified by pressing the key).

Physical layout (Syntax W909, from photos plus the factory keymap):
- Top row: knob press = 2; keys 1-6 = 40, 32, 24, 16, 8, 0.
- Middle row: 7 = 41, 8 = 33, 9 = 25, 0 = 17, . = 9, ENTER (2u) = 1.
- Bottom row: − (1.5u) = 10, + = 18, space bar = 26, joystick press = 42.
- Index 34 (factory: profile cycle) has no physical key.
