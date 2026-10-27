// W909 protocol probe: sends one 40-byte command on feature report 6 and prints the reply.
// usage: w909 <cmd> <arg> <addr> <len> [data hex bytes...]   (all numbers hex)
// Packet: 00 01 cmd seq arg addrLo addrHi len data...   (cmd | 0x80 = read)
import Foundation
import IOKit.hid

func hex(_ s: String) -> Int { Int(s.hasPrefix("0x") ? String(s.dropFirst(2)) : s, radix: 16) ?? 0 }
let a = Array(CommandLine.arguments.dropFirst())
guard a.count >= 4 else { print("usage: w909 cmd arg addr len [data...]"); exit(2) }
let cmd = hex(a[0]), arg = hex(a[1]), addr = hex(a[2]), len = hex(a[3])
let data = a.dropFirst(4).map { UInt8(hex($0)) }

let mgr = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
IOHIDManagerSetDeviceMatchingMultiple(mgr, [
    [kIOHIDVendorIDKey: 0xB6A4, kIOHIDProductIDKey: 0x4100],
    [kIOHIDVendorIDKey: 0xB6A4, kIOHIDProductIDKey: 0x4101],
] as CFArray)
IOHIDManagerOpen(mgr, IOOptionBits(kIOHIDOptionsTypeNone))
let devs = (IOHIDManagerCopyDevices(mgr) as? Set<IOHIDDevice>) ?? []
let wantPID = ProcessInfo.processInfo.environment["W909_PID"].map { hex($0) } ?? 0x4100
guard let dev = devs.first(where: {
    (IOHIDDeviceGetProperty($0, kIOHIDMaxFeatureReportSizeKey as CFString) as? Int ?? 0) >= 41 &&
    (IOHIDDeviceGetProperty($0, kIOHIDProductIDKey as CFString) as? Int) == wantPID
}) else { print("device not found"); exit(1) }
IOHIDDeviceOpen(dev, IOOptionBits(kIOHIDOptionsTypeNone))

var out = [UInt8](repeating: 0, count: 41)
out[0] = 6
let seq = UInt8(truncatingIfNeeded: Int(Date().timeIntervalSince1970 * 10))
let hdr: [UInt8] = [0x00, 0x01, UInt8(cmd), seq, UInt8(arg), UInt8(addr & 0xff), UInt8((addr >> 8) & 0xff), UInt8(len)]
for (i, b) in (hdr + data).enumerated() where i + 1 < 41 { out[i + 1] = b }
func fmt(_ b: ArraySlice<UInt8>) -> String { b.map { String(format: "%02x", $0) }.joined(separator: " ") }
print("TX", fmt(out[1...]))
let r = IOHIDDeviceSetReport(dev, kIOHIDReportTypeFeature, 6, out, 41)
guard r == kIOReturnSuccess else { print("SetReport failed 0x" + String(UInt32(bitPattern: r), radix: 16)); exit(1) }
let tries = Int(ProcessInfo.processInfo.environment["W909_TRIES"] ?? "5") ?? 5
for attempt in 0..<tries {
    usleep(50_000)
    var buf = [UInt8](repeating: 0, count: 41)
    var n = CFIndex(41)
    let g = IOHIDDeviceGetReport(dev, kIOHIDReportTypeFeature, 6, &buf, &n)
    print("RX\(attempt)", g == kIOReturnSuccess ? fmt(buf[1..<n]) : "err 0x" + String(UInt32(bitPattern: g), radix: 16))
    if g == kIOReturnSuccess && buf[8] != 0 && (tries == 5 || buf[9...].contains { $0 != 0 }) { break }
}
