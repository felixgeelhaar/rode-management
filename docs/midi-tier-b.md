# Tier B — Official RØDECaster MIDI

Status: **mock transport default (CI)** · **hardware via `@julusian/midi` when env is set**

## Why this path exists

RØDE publishes a MIDI control surface for RØDECaster Duo / Pro II. That is the first **documented, first-party** control path in this repo that does not require reverse-engineered HID or a public REST API.

It is **Tier B**: useful console actions, not full mixer automation.

## Supported over official MIDI

| Capability | MIDI | Notes |
|------------|------|-------|
| Mute | CC 27 per strip channel | Bidirectional |
| Listen | CC 24 per strip channel | Bidirectional |
| SMART Pad trigger | CC 35 per pad channel | Host → device |
| SMART Pad bank | CC 0, channel 1, values 0–7 | Host → device (banks 1–8). Absolute, not a pulse |
| Record | CC 17, channel 1 | Bidirectional |

Official RØDE MIDI uses **value `1` press pulses** (often followed by `0`). Hardware mode enables `pulseToggle` so outbound mute/listen/record send `1`, inbound `1` toggles, and inbound `0` is ignored.

## Explicitly unsupported over official MIDI

- Fader / channel **Level**
- Input **Gain**
- Monitoring mix, compression, gate, HPF, EQ

Those remain on the Duo **simulator** (`RodecasterDuoSimAdapter`) or future proprietary protocol work. PodMic USB still has **no** public MIDI/API path.

## Code

| Piece | Role |
|-------|------|
| `midi-map.ts` | Official CC map + support matrix |
| `midi-transport.ts` | `MidiTransport` + `MockMidiTransport` + `createHardwareMidiTransport()` |
| `midi-port.ts` | Port name matching + CC encode/decode |
| `node-midi-transport.ts` | OS MIDI via `@julusian/midi` |
| `RodecasterDuoMidiAdapter` | Capability adapter over the transport |
| `demo:midi` | Mute / pad / record smoke demo without hardware |

## Stream Deck / CLI

```bash
# Mock MIDI (default — no hardware, CI-safe)
RODE_CONTROL_ADAPTER=rodecaster-midi

# Real Duo / Pro II MIDI Function port
RODE_CONTROL_ADAPTER=rodecaster-midi
RODE_CONTROL_MIDI_HARDWARE=1
# Optional: narrow the OS port name
RODE_CONTROL_MIDI_PORT="RØDECaster"
# Optional: Pro II strip/pad counts
RODE_CONTROL_MIDI_MODEL=pro-ii
# Optional: virtual loopback when no console is present (dev only)
RODE_CONTROL_MIDI_VIRTUAL=1
```

Setting `RODE_CONTROL_MIDI_PORT` alone also enables hardware (substring match, then RØDE port-name hints).

### Bring-up CLI

```bash
# List OS MIDI inputs/outputs (does not open the console)
npm run cli -- midi ports

# Confirm mock vs hardware + transport name
RODE_CONTROL_ADAPTER=rodecaster-midi npm run cli -- status

# Explain N/A vs OFFLINE / ownership for a binding
RODE_CONTROL_ADAPTER=rodecaster-midi npm run cli -- diagnose game-level
RODE_CONTROL_ADAPTER=rodecaster-midi npm run cli -- diagnose mic-mute
```

| Action | Behavior in MIDI mode |
|--------|------------------------|
| Mic Gain dial | Bound to **Mute** — press toggles mute; rotate shows `MUTE ONLY`; display `MUTED` / `LIVE` |
| Mute Toggle key | `ToggleMute` on `mic-mute` |
| Listen Toggle key | `ToggleListen` on `game-listen` |
| SMART Pad key | `TriggerPad` on `pad-1` (override via settings `bindingId`) |
| Pad Bank key | Cycles banks 1–8 (`SetPadBank` on `pad-bank`) |
| Record key | Start/stop on `record` |
| Channel Level dial | Surfaces **`N/A`** (Level not on official MIDI — not OFFLINE) |

Stable bindings: `my-mic-gain` (Mute), `mic-mute`, `game-listen`, `pad-1`, `pad-bank`, `record`.
