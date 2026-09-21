import {
  decodeControlChange,
  encodeControlChange,
  findMidiPortIndex,
} from "./midi-port.js";
import type { MidiCcListener, MidiControlChange, MidiTransport } from "./midi-transport.js";

export interface NodeMidiTransportOptions {
  /** Prefer this port name (exact or substring). */
  portName?: string;
  /** Open virtual loopback ports when no hardware matches (dev only). */
  allowVirtual?: boolean;
}

type MidiInput = {
  getPortCount(): number;
  getPortName(index: number): string;
  openPort(index: number): void;
  openVirtualPort(name: string): void;
  closePort(): void;
  on(
    event: "message",
    listener: (deltaTime: number, message: number[]) => void,
  ): void;
  removeAllListeners(event?: string): void;
};

type MidiOutput = {
  getPortCount(): number;
  getPortName(index: number): string;
  openPort(index: number): void;
  openVirtualPort(name: string): void;
  closePort(): void;
  sendMessage(message: number[]): void;
};

type MidiModule = {
  Input: new () => MidiInput;
  Output: new () => MidiOutput;
};

async function loadMidiModule(): Promise<MidiModule> {
  try {
    const mod = (await import("@julusian/midi")) as unknown as MidiModule;
    return mod;
  } catch (err) {
    throw new Error(
      `Failed to load @julusian/midi (native MIDI). Install build tools and rebuild, or use MockMidiTransport. ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export function listSystemMidiPortNames(midi: {
  Input: new () => MidiInput;
  Output: new () => MidiOutput;
}): { inputs: string[]; outputs: string[] } {
  let input: MidiInput | undefined;
  let output: MidiOutput | undefined;
  try {
    input = new midi.Input();
    output = new midi.Output();
    const inputs = Array.from({ length: input.getPortCount() }, (_, i) =>
      input!.getPortName(i),
    );
    const outputs = Array.from({ length: output.getPortCount() }, (_, i) =>
      output!.getPortName(i),
    );
    return { inputs, outputs };
  } catch (err) {
    throw new Error(
      `System MIDI unavailable (no ALSA/CoreMIDI sequencer?). ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    try {
      input?.closePort();
    } catch {
      /* never opened */
    }
    try {
      output?.closePort();
    } catch {
      /* never opened */
    }
  }
}

/**
 * Real OS MIDI ports via `@julusian/midi` for RØDECaster Duo / Pro II.
 */
export class NodeMidiTransport implements MidiTransport {
  private displayName: string;
  private readonly prefer?: string;
  private readonly allowVirtual: boolean;
  private openState = false;
  private input: MidiInput | undefined;
  private output: MidiOutput | undefined;
  private readonly listeners = new Set<MidiCcListener>();

  constructor(options: NodeMidiTransportOptions = {}) {
    if (options.portName !== undefined) {
      this.prefer = options.portName;
    }
    this.allowVirtual = options.allowVirtual ?? false;
    this.displayName = options.portName
      ? `Hardware MIDI (${options.portName})`
      : "Hardware MIDI (auto)";
  }

  get name(): string {
    return this.displayName;
  }

  async open(): Promise<void> {
    if (this.openState) return;
    const midi = await loadMidiModule();
    const input = new midi.Input();
    const output = new midi.Output();

    const inputNames = Array.from({ length: input.getPortCount() }, (_, i) =>
      input.getPortName(i),
    );
    const outputNames = Array.from({ length: output.getPortCount() }, (_, i) =>
      output.getPortName(i),
    );

    const inIndex = findMidiPortIndex(inputNames, this.prefer);
    const outIndex = findMidiPortIndex(outputNames, this.prefer);

    if (inIndex < 0 || outIndex < 0) {
      if (!this.allowVirtual) {
        throw new Error(
          `No RØDECaster MIDI port found.\n` +
            `  Inputs: ${inputNames.join(", ") || "(none)"}\n` +
            `  Outputs: ${outputNames.join(", ") || "(none)"}\n` +
            `Set RODE_CONTROL_MIDI_PORT to a port name substring, or enable MIDI on the console.`,
        );
      }
      const virtualName = this.prefer ?? "RØDE Control Virtual MIDI";
      input.openVirtualPort(virtualName);
      output.openVirtualPort(virtualName);
      this.displayName = `Virtual MIDI (${virtualName})`;
    } else {
      input.openPort(inIndex);
      output.openPort(outIndex);
      this.displayName = `Hardware MIDI (${inputNames[inIndex]} → ${outputNames[outIndex]})`;
    }

    input.on("message", (_delta, message) => {
      const decoded = decodeControlChange(message);
      if (!decoded) return;
      const stamped: MidiControlChange = {
        ...decoded,
        timestamp: Date.now(),
      };
      for (const listener of this.listeners) {
        listener(stamped);
      }
    });

    this.input = input;
    this.output = output;
    this.openState = true;
  }

  async close(): Promise<void> {
    if (!this.openState) return;
    this.input?.removeAllListeners("message");
    try {
      this.input?.closePort();
    } catch {
      /* already closed */
    }
    try {
      this.output?.closePort();
    } catch {
      /* already closed */
    }
    this.input = undefined;
    this.output = undefined;
    this.openState = false;
  }

  isOpen(): boolean {
    return this.openState;
  }

  sendControlChange(message: MidiControlChange): void {
    if (!this.openState || !this.output) {
      throw new Error("MIDI transport is closed");
    }
    this.output.sendMessage(encodeControlChange(message));
  }

  onControlChange(listener: MidiCcListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/** List system MIDI ports (loads native module). */
export async function listHardwareMidiPorts(): Promise<{
  inputs: string[];
  outputs: string[];
}> {
  const midi = await loadMidiModule();
  return listSystemMidiPortNames(midi);
}
