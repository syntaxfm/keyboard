// Line-based bridge to the W909 feature report 6, for testing web/w909-protocol.js under Node.
// stdin:  "S <80 hex chars>"  -> SET_FEATURE(6, 40 bytes)      stdout: "OK" | "ERR <code>"
//         "G"                 -> GET_FEATURE(6)                 stdout: "<hex of 41 bytes incl. report id>"
import Foundation
import IOKit.hid

let mgr = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
IOHIDManagerSetDeviceMatching(mgr, [kIOHIDVendorIDKey: 0xB6A4, kIOHIDProductIDKey: 0x4100] as CFDictionary)
IOHIDManagerOpen(mgr, IOOptionBits(kIOHIDOptionsTypeNone))
guard let dev = ((IOHIDManagerCopyDevices(mgr) as? Set<IOHIDDevice>) ?? []).first(where: {
    (IOHIDDeviceGetProperty($0, kIOHIDMaxFeatureReportSizeKey as CFString) as? Int ?? 0) >= 41
}) else { print("ERR nodevice"); exit(1) }
IOHIDDeviceOpen(dev, IOOptionBits(kIOHIDOptionsTypeNone))
setvbuf(stdout, nil, _IOLBF, 0)
print("READY")

while let line = readLine() {
    if line.hasPrefix("S ") {
        let h = Array(line.dropFirst(2))
        var buf = [UInt8](repeating: 0, count: 41)
        buf[0] = 6
        for i in 0..<min(40, h.count / 2) { buf[i + 1] = UInt8(String(h[i * 2...i * 2 + 1]), radix: 16) ?? 0 }
        let r = IOHIDDeviceSetReport(dev, kIOHIDReportTypeFeature, 6, buf, 41)
        print(r == kIOReturnSuccess ? "OK" : "ERR \(r)")
    } else if line == "G" {
        var buf = [UInt8](repeating: 0, count: 41)
        var n = CFIndex(41)
        let r = IOHIDDeviceGetReport(dev, kIOHIDReportTypeFeature, 6, &buf, &n)
        print(r == kIOReturnSuccess ? buf.prefix(n).map { String(format: "%02x", $0) }.joined() : "ERR \(r)")
    }
}
