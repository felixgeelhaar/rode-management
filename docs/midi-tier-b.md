# Tier B — Official RØDECaster MIDI

Status: **implemented against mock MIDI transport** (hardware port optional follow-up)

## Why this path exists

RØDE publishes a MIDI control surface for RØDECaster Duo / Pro II. That is the first **documented, first-party** control path in this repo that does not require reverse-engineered HID or a public REST API.

It is **Tier B**: useful console actions, not full mixer automation.

## Supported over official MIDI

| Capability | MIDI | Notes |
|------------|------|-------|
| Mute | CC 27 per strip channel | Bidirectional |
| Listen | CC 24 per strip channel | Bidirectional |
| SMART Pad trigger | CC 35 per pad channel | Host → device |
| Record | CC 17, channel 1 | Bidirectional |

## Explicitly unsupported over official MIDI

- Fader / channel **Level**
- Input **Gain**
- Monitoring mix, compression, gate, HPF, EQ

Those remain on the Duo **simulator** (`RodecasterDuoSimAdapter`) or future proprietary protocol work. PodMic USB still has **no** public MIDI/API path.

## Code

| Piece | Role |
|-------|------|
| `midi-map.ts` | Official CC map + support matrix |
| `midi-transport.ts` | `MidiTransport` + `MockMidiTransport` |
| `RodecasterDuoMidiAdapter` | Capability adapter over the transport |
| `demo:midi` | Mute / pad / record smoke demo without hardware |

## Stream Deck

```bash
RODE_CONTROL_ADAPTER=rodecaster-midi
```

- Mic dial binding resolves to **Mute** (press = toggle; rotate AdjustGain stays unsupported)
- Channel Level dials stay offline (honest Tier B)
- Stable bindings: `mic-mute`, `pad-1`, `record`

## Hardware next step

Implement a real `MidiTransport` (node-midi / Web MIDI / OS MIDI) that opens the RØDECaster MIDI Function port and pass it into `RodecasterDuoMidiAdapter({ transport })`. The mock transport stays the default for CI.
