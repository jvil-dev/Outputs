import SwiftUI

/// Placeholder layout mirroring the regions of the legacy Electron UI. No behavior yet.
struct ContentView: View {
    var body: some View {
        VStack(spacing: 16) {
            dropZone
            outputPickers
            transport
            Spacer()
            Text("Not wired up yet")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
    }

    private var dropZone: some View {
        Text("Drop a media file here, or click to choose")
            .frame(maxWidth: .infinity, minHeight: 120)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
    }

    private var outputPickers: some View {
        HStack(spacing: 16) {
            Picker("Output A", selection: .constant(0)) {
                Text("Default").tag(0)
            }
            Picker("Output B", selection: .constant(0)) {
                Text("Default").tag(0)
            }
        }
        .disabled(true)
    }

    private var transport: some View {
        HStack(spacing: 12) {
            Button("Play") {}
            Slider(value: .constant(0.0))
            Text(TimeFormatting.clock(0) + " / " + TimeFormatting.clock(0))
                .monospacedDigit()
        }
        .disabled(true)
    }
}

#Preview {
    ContentView()
}
