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

| Action | Behavior in MIDI mode |
|--------|------------------------|
| Mic Gain dial | Bound to **Mute** — press toggles mute; rotate shows `MUTE ONLY`; display `MUTED` / `LIVE` |
| Mute Toggle key | `ToggleMute` on `mic-mute` |
| Listen Toggle key | `ToggleListen` on `game-listen` |
| SMART Pad key | `TriggerPad` on `pad-1` (override via settings `bindingId`) |
| Record key | Start/stop on `record` |
| Channel Level dial | Surfaces **`N/A`** (Level not on official MIDI — not OFFLINE) |

Stable bindings: `my-mic-gain` (Mute), `mic-mute`, `game-listen`, `pad-1`, `record`.

## Hardware next step

Implement a real `MidiTransport` (node-midi / Web MIDI / OS MIDI) that opens the RØDECaster MIDI Function port and pass it into `RodecasterDuoMidiAdapter({ transport })`. The mock transport stays the default for CI.
