# rode-management

Local, capability-driven control layer for RØDE audio ecosystems — initially presented through Elgato Stream Deck+.

> **Positioning:** Control your RØDE setup from Stream Deck.  
> Not a PodMic-only controller. Not a software mixer. Not DSP-in-process.

## Current status

**Draft 0.3 / Phases 1–3 on simulators + Tier B official MIDI (mocked transport)**

| Assumption | Evidence in repo |
|------------|------------------|
| Reliable interactive control is possible | Pending real PodMic USB protocol work ([Phase 0](docs/phase-0-protocol.md)) |
| Stream Deck+ can feel like a console | Mic Gain dial (+ mute press) and Channel Level dial |
| One capability model spans USB mic and mixer channel ownership | Covered by core + RØDECaster Duo sim tests |
| Official MIDI is a legitimate Tier B path | [MIDI Tier B](docs/midi-tier-b.md) — mute / listen / pads / record |

## Quick start

```bash
npm install
npm test
npm run demo:vertical-slice
npm run demo:mix-bank
npm run demo:midi
npm run demo:topology
npm run demo:bindings
npm run cli -- status
RODE_CONTROL_ADAPTER=rodecaster npm run cli -- surface headphones-level
npm run e2e
npm run build
```

### PodMic vertical slice (no hardware)

```text
discover → show gain → dial adjust → external change → disconnect OFFLINE → reconnect
+ monitor dial / mute / HPF / compressor keys (Phase 2 on Stream Deck)
```

### RØDECaster mix bank (no hardware)

```text
MIC / GAME / CHAT / MUSIC levels
MIC gain owned by mixer Input 1 (PodMic source)
dial press on MIC → mute retarget
```

### RØDECaster official MIDI (mocked, Tier B)

```text
mute / listen / SMART pads / record over documented MIDI CCs
levels + gain intentionally N/A (not offline)
```

### Dual-adapter topology (no hardware)

```text
PodMic USB sim + Duo sim together
My Mic / Gain prefers mixer ownership when both match
```

### Stream Deck plugin

Built artifact:

`packages/streamdeck-plugin/com.felixgeelhaar.rode-control.sdPlugin`

```bash
npm install && npm run build
npm install -g @elgato/cli
streamdeck link packages/streamdeck-plugin/com.felixgeelhaar.rode-control.sdPlugin
streamdeck restart com.felixgeelhaar.rode-control
```

Then place **RØDE Control** actions on Stream Deck+. Property Inspector offers live binding/workflow pickers.

```bash
# PodMic USB simulator (default)
RODE_CONTROL_ADAPTER=sim

# RØDECaster Duo mix simulator
RODE_CONTROL_ADAPTER=rodecaster

# Official MIDI Tier B (mock transport until a real port is wired)
RODE_CONTROL_ADAPTER=rodecaster-midi

# Dual-adapter topology (mixer-preferred Gain)
RODE_CONTROL_ADAPTER=topology

# Optional: merge/replace bindings from a JSON profile
RODE_CONTROL_BINDINGS_PATH=./my-layout.json
RODE_CONTROL_BINDINGS_REPLACE=1

# Optional: load/override workflow presets from disk
RODE_CONTROL_WORKFLOWS_PATH=./examples/workflow-streaming.json
RODE_CONTROL_WORKFLOWS_AUTOSAVE=./my-workflows.json
```

```bash
npm run cli -- diagnose my-mic-gain
RODE_CONTROL_ADAPTER=rodecaster npm run cli -- layout suggest
RODE_CONTROL_ADAPTER=rodecaster npm run cli -- workflow import ./examples/workflow-streaming.json
```

Key actions (Mute / Listen / SMART Pad / Record / HPF / COMP) work in the appropriate modes. Channel Level dials show `N/A` on Tier B MIDI. Use the property inspector to point a Channel Level instance at `chat-level`, `music-level`, or `headphones-level`.

## Workspace

```text
packages/core                      Capability core + domain model
packages/adapters/podmic-usb       PodMic USB sim + protocol stub
packages/adapters/rodecaster-duo   RØDECaster Duo sim + official MIDI adapter
packages/host                      Shared bootstrap for plugin + CLI
packages/cli                       Terminal client (second surface)
packages/streamdeck-plugin         Stream Deck+ actions
examples/                          Sample binding profiles
docs/                              Product intent, architecture, Phase 0, MIDI Tier B
```

## Product model (short)

```text
Physical/virtual source → Endpoint → Capability → Device adapter
        → Capability core → Logical binding ("My Mic") → Stream Deck
```

See [docs/product-intent.md](docs/product-intent.md) and [docs/architecture.md](docs/architecture.md).

## Explicit non-goals (for now)

- Software audio mixer / Wave Link competitor
- Homegrown compressor/gate/EQ/APHEX
- Universal multi-brand mic control
- RØDE Central UI automation as the control path

## License

MIT
