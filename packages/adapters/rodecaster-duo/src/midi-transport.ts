/**
 * Minimal MIDI transport seam for the RØDECaster MIDI adapter.
 *
 * Real hardware can plug in node-midi / easymidi / Web MIDI behind this interface.
 * Tests and CI use {@link MockMidiTransport}.
 */

export interface MidiControlChange {
  /** MIDI channel 1–16 */
  channel: number;
  controller: number;
  value: number;
  timestamp?: number;
}

export type MidiCcListener = (message: MidiControlChange) => void;

export interface MidiTransport {
  readonly name: string;
  open(): Promise<void>;
  close(): Promise<void>;
  isOpen(): boolean;
  sendControlChange(message: MidiControlChange): void;
  onControlChange(listener: MidiCcListener): () => void;
}

/**
 * In-memory MIDI loopback for tests and demos without hardware.
 * Optionally echoes sent CCs back as received messages (device → host).
 */
export class MockMidiTransport implements MidiTransport {
  readonly name: string;
  private openState = false;
  private readonly listeners = new Set<MidiCcListener>();
  readonly sent: MidiControlChange[] = [];
  readonly received: MidiControlChange[] = [];

  constructor(
    name = "Mock RØDECaster MIDI",
    private readonly echoSentAsReceived = false,
  ) {
    this.name = name;
  }

  async open(): Promise<void> {
    this.openState = true;
  }

  async close(): Promise<void> {
    this.openState = false;
  }

  isOpen(): boolean {
    return this.openState;
  }

  sendControlChange(message: MidiControlChange): void {
    if (!this.openState) {
      throw new Error("MIDI transport is closed");
    }
    const stamped = { ...message, timestamp: message.timestamp ?? Date.now() };
    this.sent.push(stamped);
    if (this.echoSentAsReceived) {
      this.injectIncoming(stamped);
    }
  }

  onControlChange(listener: MidiCcListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Simulate a physical mute/listen/record press arriving from the device. */
  injectIncoming(message: MidiControlChange): void {
    if (!this.openState) {
      return;
    }
    const stamped = { ...message, timestamp: message.timestamp ?? Date.now() };
    this.received.push(stamped);
    for (const listener of this.listeners) {
      listener(stamped);
    }
  }

  clearHistory(): void {
    this.sent.length = 0;
    this.received.length = 0;
  }
}

/**
 * Placeholder for a future real MIDI backend (node-midi / Web MIDI).
 * Throws a clear error until a host package is wired and a port is selected.
 * @deprecated Prefer {@link NodeMidiTransport} from `./node-midi-transport.js`.
 */
export class UnconfiguredHardwareMidiTransport implements MidiTransport {
  readonly name = "Unconfigured hardware MIDI";

  async open(): Promise<void> {
    throw new Error(
      "No hardware MIDI transport configured. Use NodeMidiTransport / createHardwareMidiTransport(), or MockMidiTransport for tests.",
    );
  }

  async close(): Promise<void> {}

  isOpen(): boolean {
    return false;
  }

  sendControlChange(): void {
    throw new Error("Hardware MIDI transport is not open");
  }

  onControlChange(): () => void {
    return () => {};
  }
}

export type CreateHardwareMidiOptions = {
  portName?: string;
  allowVirtual?: boolean;
};

/** Factory for OS MIDI ports (lazy-loads `@julusian/midi`). */
export async function createHardwareMidiTransport(
  options: CreateHardwareMidiOptions = {},
): Promise<MidiTransport> {
  const { NodeMidiTransport } = await import("./node-midi-transport.js");
  return new NodeMidiTransport(options);
}
