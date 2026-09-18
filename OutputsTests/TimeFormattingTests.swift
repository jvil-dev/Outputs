import Testing
@testable import Outputs

struct TimeFormattingTests {
    @Test func zero() {
        #expect(TimeFormatting.clock(0) == "0:00")
    }

    @Test func minutesAndSeconds() {
        #expect(TimeFormatting.clock(65.9) == "1:05")
        #expect(TimeFormatting.clock(600) == "10:00")
    }

    @Test func invalidValuesRenderAsZero() {
        #expect(TimeFormatting.clock(-5) == "0:00")
        #expect(TimeFormatting.clock(.nan) == "0:00")
        #expect(TimeFormatting.clock(.infinity) == "0:00")
    }
}
