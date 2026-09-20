export { RodecasterDuoSimAdapter } from "./sim-adapter.js";
export type { RodecasterDuoSimOptions } from "./sim-adapter.js";

export { RodecasterDuoMidiAdapter } from "./midi-adapter.js";
export type { RodecasterDuoMidiOptions } from "./midi-adapter.js";

export {
  MockMidiTransport,
  UnconfiguredHardwareMidiTransport,
  createHardwareMidiTransport,
} from "./midi-transport.js";
export type {
  CreateHardwareMidiOptions,
  MidiControlChange,
  MidiTransport,
} from "./midi-transport.js";

export {
  NodeMidiTransport,
  listHardwareMidiPorts,
} from "./node-midi-transport.js";
export type { NodeMidiTransportOptions } from "./node-midi-transport.js";

export {
  decodeControlChange,
  encodeControlChange,
  findMidiPortIndex,
} from "./midi-port.js";

export {
  RODECASTER_DUO_MIDI_MAP,
  RODECASTER_MIDI_PORT_HINTS,
  RODECASTER_MIDI_SUPPORT,
  RODECASTER_PRO_II_MIDI_MAP,
  listenAddress,
  muteAddress,
  padTriggerAddress,
  recordAddress,
} from "./midi-map.js";
export type {
  MidiCcAddress,
  RodecasterMidiMap,
  RodecasterModel,
} from "./midi-map.js";
