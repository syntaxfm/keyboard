// W909 Pro (YXT, VID 0xB6A4) configuration protocol over WebHID.
//
// Every message is HID feature report 6, 40 data bytes:
//   [0]=0x00 [1]=0x01 [2]=cmd [3]=seq [4]=arg [5..6]=addr (LE16) [7]=len [8..39]=data
// cmd | 0x80 reads what cmd writes. The reply to a read is fetched with GET_FEATURE(6) and
// echoes the header (cmd + seq), followed by `len` data bytes.
//
// See device-info/ for the full reference and how this was worked out.

const W909 = (() => {
  const VID = 0xb6a4;
  const PIDS = { 0x4100: "USB cable", 0x4101: "2.4G receiver" };
  const REPORT_ID = 6;
  const MAX_DATA = 32;

  const CMD = {
    INFO: 0x01,      // 81: 3 bytes
    SETTING: 0x02,   // arg 2 = active profile (1 byte), arg 3 = sleep seconds (LE16), arg 4 = power-off seconds
    KEY: 0x04,       // arg 0 = bank 0 (keys 0..159), addr = index*4, 4 bytes per key
    KNOB: 0x05,      // arg 0 = knob layer 1, arg 1 = knob layer 2; addr = slot*4
    MACRO: 0x08,     // arg = macro slot, addr = byte offset, data = macro stream
    LIGHT: 0x09,     // addr 0 = header (mode, LED mask); addr mode*25 = per-mode record (25 bytes)
    VERSION: 0xf0,   // arg 1 = firmware version string, arg 2 = board id string
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class Device {
    constructor(hid, log) {
      this.hid = hid;
      this.log = log || (() => {});
      this.seq = 0;
      this.queue = Promise.resolve();
    }

    static isSupported() {
      return "hid" in navigator;
    }

    get connectionName() {
      return PIDS[this.hid.productId] || "unknown";
    }

    static hasConfigReport(dev) {
      return dev.collections.some((c) => (c.featureReports || []).some((r) => r.reportId === REPORT_ID));
    }

    static async request(log) {
      const filters = Object.keys(PIDS).map((pid) => ({ vendorId: VID, productId: Number(pid) }));
      const picked = await navigator.hid.requestDevice({ filters });
      return Device.pick(picked, log);
    }

    static async reconnect(log) {
      const granted = await navigator.hid.getDevices();
      return Device.pick(granted.filter((d) => d.vendorId === VID && PIDS[d.productId]), log);
    }

    static async pick(devices, log) {
      // Prefer the cable connection; the 2.4G receiver only relays when the keyboard is in 2.4G mode.
      const candidates = devices.filter(Device.hasConfigReport)
        .sort((a, b) => (a.productId === 0x4100 ? -1 : 0) - (b.productId === 0x4100 ? -1 : 0));
      if (!candidates.length) return null;
      const hid = candidates[0];
      if (!hid.opened) await hid.open();
      return new Device(hid, log);
    }

    async close() {
      if (this.hid.opened) await this.hid.close();
    }

    // Serialize all traffic; the device has a single command buffer.
    run(fn) {
      const p = this.queue.then(fn, fn);
      this.queue = p.catch(() => {});
      return p;
    }

    packet(cmd, arg, addr, len, data) {
      const p = new Uint8Array(40);
      this.seq = (this.seq + 1) & 0xff;
      p.set([0x00, 0x01, cmd, this.seq, arg, addr & 0xff, (addr >> 8) & 0xff, len]);
      if (data) p.set(data.slice(0, MAX_DATA), 8);
      return p;
    }

    async receive() {
      const dv = await this.hid.receiveFeatureReport(REPORT_ID);
      let b = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      if (b.length === 41 && b[0] === REPORT_ID) b = b.subarray(1);
      return b;
    }

    hex(b) {
      return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
    }

    // Read `len` (<= 32) bytes.
    read(cmd, arg, addr, len) {
      return this.run(async () => {
        const p = this.packet(cmd | 0x80, arg, addr, len);
        await this.hid.sendFeatureReport(REPORT_ID, p);
        for (let i = 0; i < 15; i++) {
          await sleep(i === 0 ? 10 : 20);
          const r = await this.receive();
          if (r[2] === p[2] && r[3] === p[3]) {
            this.log(`RD ${this.hex(p.subarray(2, 8))} -> ${this.hex(r.subarray(8, 8 + len))}`);
            return r.slice(8, 8 + len);
          }
        }
        throw new Error(`No reply to read cmd 0x${(cmd | 0x80).toString(16)}`);
      });
    }

    // Read any length by chunking.
    async readLong(cmd, arg, addr, len) {
      const out = new Uint8Array(len);
      for (let off = 0; off < len; off += MAX_DATA) {
        const n = Math.min(MAX_DATA, len - off);
        out.set(await this.read(cmd, arg, addr + off, n), off);
      }
      return out;
    }

    write(cmd, arg, addr, data) {
      return this.run(async () => {
        const p = this.packet(cmd, arg, addr, data.length, data);
        await this.hid.sendFeatureReport(REPORT_ID, p);
        this.log(`WR ${this.hex(p.subarray(2, 8 + data.length))}`);
        await sleep(50); // the vendor app waits 50 ms after every write
      });
    }

    async writeLong(cmd, arg, addr, data) {
      for (let off = 0; off < data.length; off += MAX_DATA) {
        await this.write(cmd, arg, addr + off, data.slice(off, off + MAX_DATA));
      }
    }

    // ---- High-level operations ----

    async readInfo() {
      const str = (b) => new TextDecoder().decode(b.subarray(0, b.indexOf(0) < 0 ? b.length : b.indexOf(0)));
      return {
        firmware: str(await this.read(CMD.VERSION, 1, 0, 8)),
        board: str(await this.read(CMD.VERSION, 2, 0, 16)),
      };
    }

    async readProfile() {
      return (await this.read(CMD.SETTING, 2, 0, 1))[0];
    }

    async setProfile(p) {
      await this.write(CMD.SETTING, 2, 0, [p]);
      await sleep(150);
    }

    async readPowerTimers() {
      const le = (b) => b[0] | (b[1] << 8);
      return {
        sleepSeconds: le(await this.read(CMD.SETTING, 3, 0, 2)),
        powerOffSeconds: le(await this.read(CMD.SETTING, 4, 0, 2)),
      };
    }

    async setSleepSeconds(s) {
      await this.write(CMD.SETTING, 3, 0, [s & 0xff, (s >> 8) & 0xff]);
    }

    // Returns Uint8Array(count*4)
    async readKeys(count) {
      return this.readLong(CMD.KEY, 0, 0, count * 4);
    }

    async readKey(index) {
      const bank = index < 160 ? 0 : 1;
      return this.read(CMD.KEY, bank, (index - bank * 160) * 4, 4);
    }

    async writeKey(index, value4) {
      const bank = index < 160 ? 0 : 1;
      await this.write(CMD.KEY, bank, (index - bank * 160) * 4, value4);
    }

    // Whole key table (bank 0, indexes 0..count-1), 8 keys per packet.
    async writeKeys(bytes) {
      await this.writeLong(CMD.KEY, 0, 0, bytes);
    }

    async writeKnobTable(layer, bytes8) {
      await this.writeLong(CMD.KNOB, layer, 0, bytes8);
    }

    async readKnob(layer) {
      return this.read(CMD.KNOB, layer, 0, 8);
    }

    async writeKnob(layer, slot, value4) {
      await this.write(CMD.KNOB, layer, slot * 4, value4);
    }

    async readLighting() {
      const header = await this.read(CMD.LIGHT, 0, 0, 3);
      const modes = [];
      for (let m = 1; m <= 8; m++) modes[m] = await this.readLong(CMD.LIGHT, 0, m * 25, 25);
      return { header, modes };
    }

    async writeLightingHeader(header3) {
      const b = new Uint8Array(25);
      b.set(header3);
      await this.write(CMD.LIGHT, 0, 0, b);
    }

    async writeLightingMode(mode, record25) {
      await this.write(CMD.LIGHT, 0, mode * 25, record25);
    }

    // Macro stream: [LE16 repeat][LE16 event-byte length][events...], max 512 bytes.
    async readMacro(slot) {
      const head = await this.read(CMD.MACRO, slot, 0, MAX_DATA);
      const len = head[2] | (head[3] << 8);
      if (len === 0 || len > 508) return { repeat: head[0] | (head[1] << 8), events: new Uint8Array(0) };
      const all = len + 4 <= MAX_DATA ? head : await this.readLong(CMD.MACRO, slot, 0, len + 4);
      return { repeat: all[0] | (all[1] << 8), events: all.slice(4, 4 + len) };
    }

    async writeMacro(slot, repeat, events) {
      if (events.length + 4 > 512) throw new Error("Macro too long (max 508 bytes)");
      const b = new Uint8Array(4 + events.length);
      b.set([repeat & 0xff, (repeat >> 8) & 0xff, events.length & 0xff, (events.length >> 8) & 0xff]);
      b.set(events, 4);
      await this.writeLong(CMD.MACRO, slot, 0, b);
    }
  }

  return { Device, CMD, VID, PIDS };
})();
