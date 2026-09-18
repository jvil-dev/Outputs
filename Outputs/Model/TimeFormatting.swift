import Foundation

enum TimeFormatting {
    /// Formats seconds as m:ss. Negative, NaN, and infinite values render as 0:00.
    static func clock(_ seconds: Double) -> String {
        let safe = seconds.isFinite && seconds >= 0 ? seconds : 0
        let minutes = Int(safe) / 60
        let secs = Int(safe) % 60
        return String(format: "%d:%02d", minutes, secs)
    }
}
