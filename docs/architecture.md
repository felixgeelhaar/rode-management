# RØDE Control — Architecture

Working title TBD. Repository: `rode-management`.

This codebase implements the product model from [`product-intent.md`](./product-intent.md): a local, capability-driven control layer for RØDE audio ecosystems, initially presented through Stream Deck+.

## Canonical flow

```text
Source → Endpoint → Capability → Device → Adapter → Capability Core → Binding → Logical Control → Stream Deck
```

Example (Phase 1 fixture):

```text
PodMic USB → Microphone Endpoint → Gain → PodMicUsbSimAdapter → CapabilityCore → "My Mic" → Stream Deck+ dial
```

Critical validation (intent §43): the Stream Deck binding `"My Mic" / Gain` must resolve identically whether gain is owned by a USB microphone endpoint or a RØDECaster input channel.

## Packages

| Package | Role |
|---------|------|
| `@rode-control/core` | Domain types, `DeviceAdapter` contract, `CapabilityCore`, binding helpers, layout suggestions |
| `@rode-control/adapter-podmic-usb` | PodMic USB sim adapter (gain / monitor / mute / HPF / compressor) + protocol research stub |
| `@rode-control/adapter-rodecaster-duo` | Duo **sim** (mix levels + §43) and **official MIDI** Tier B adapter (mute / listen / pads / record) |
| `@rode-control/host` | Shared bootstrap (adapter modes, seeds, binding profile load) |
| `@rode-control/cli` | Terminal client over the same core (`npm run cli -- …`) |
| `@rode-control/streamdeck-plugin` | Stream Deck+ dials + keys |

## Phase alignment

| Phase | Status in repo |
|-------|----------------|
| 0 Protocol feasibility (real PodMic USB) | Stub + checklist only — requires hardware |
| 1 Vertical slice (dial ↔ gain, offline/reconnect) | Implemented against **simulator** |
| 2 Capability depth | Monitor, mute, HPF, compressor on PodMic sim **and** Stream Deck (monitor dial + HPF/COMP keys) |
| 3 RØDECaster validation | Duo simulator + mix bank + §43 ownership tests |
| 3b Official MIDI (Tier B) | `RodecasterDuoMidiAdapter` + mock or `NodeMidiTransport` — mute/listen/pads/record ([midi-tier-b.md](./midi-tier-b.md)) |
| 4 Creator surface (software) | Listen, Tier honesty, topology, mic depth, binding profiles, property inspector |
| 5 Second client (CLI) | `@rode-control/cli` + shared `@rode-control/host` bootstrap |
| 5b Workflow presets | Built-in Streaming/Podcast workflows + Apply Workflow key |
| 5c Diagnose / workflow files / key PI | `diagnose` CLI, `RODE_CONTROL_WORKFLOWS_PATH`, key DidReceiveSettings |
| 5d Capture + layout suggest | Capture Workflow key, workflow autosave, `layout suggest` |
| 6 Ecosystem expansion | Later (wireless, interfaces) — not started |

## Adapter contract

Adapters own discovery, identity, connection, protocol, capability negotiation, commands, observation, errors, and reconnection.

They must **not** own Stream Deck UI concepts.

Until a supported protocol path is validated, simulators stand in for interactive development. The **official RØDECaster MIDI surface** is an exception: it is a documented Tier B path (see [midi-tier-b.md](./midi-tier-b.md)). Real proprietary transport candidates for PodMic / full mixer DSP are listed in `protocol-research.ts` (HID, control transfers, IPC, OS audio). Screen automation of RØDE Central is an explicit non-goal.

## Same-endpoint command retargeting

A Mic Gain binding can receive `ToggleMute` / `SetProcessing`. The core retargets those commands to sibling capabilities on the **same endpoint**, so Stream Deck dial press can mute without a separate mute binding.

## State authority

```text
User intent → Adapter command → Device → Observed state → Core → Stream Deck feedback
```

Optimistic UI is allowed for feel, but displays reconcile to authoritative adapter/device state. Offline bindings remain configured and show `OFFLINE`. Bindings that request a capability no live device exposes show `N/A` / `unsupported` (Tier honesty — not the same as disconnect).

## Topology & ownership

`CapabilityCore.setTopology()` records feeds/owns edges. When multiple adapters expose the same logical control (e.g. USB PodMic Gain + RØDECaster Input 1 Gain), resolution prefers **mixer-owned** endpoints by default (`preferMixerOwnership`), boosted further when a `feeds` edge points at the mixer channel.

`RODE_CONTROL_ADAPTER=topology` registers PodMic USB sim + Duo sim together for this path.

## Binding persistence

`CapabilityCore.exportProfile()` / `importProfile()` serialize logical bindings (+ optional topology) as a versioned JSON document (`BindingProfile` v1). The Stream Deck / CLI host loads an optional file from `RODE_CONTROL_BINDINGS_PATH` after seeding (set `RODE_CONTROL_BINDINGS_REPLACE=1` to replace seeds). Set `RODE_CONTROL_BINDINGS_AUTOSAVE` to persist binding changes back to disk. Demo: `npm run demo:bindings`.

## Workflow presets

Product-level workflows (`streaming`, `podcast`) store absolute values across bindings. Apply via `ApplyWorkflow` / Stream Deck **Apply Workflow** key / `npm run cli -- workflow apply streaming`. Capture the live surface with Stream Deck **Capture Workflow**, `workflow capture`, or CLI. Load extra/override workflows from `RODE_CONTROL_WORKFLOWS_PATH` (single profile, array, or `{ workflows: [...] }`). Persist captures with `RODE_CONTROL_WORKFLOWS_AUTOSAVE`. CLI: `workflow import|export|export-all`.

`npm run cli -- diagnose [bindingId]` prints ownership candidates and Tier honesty (`resolved` / `offline` / `unsupported` / `missing`).  
`npm run cli -- layout suggest` prints auto-layout proposals from the discovered device graph.

## Dial coalescing

Rapid `AdjustGain` / `AdjustLevel` ticks for the same binding are batched within ~24 ms into a single adapter write (`dialCoalesceMs`). Non-adjust commands flush pending dial batches first.

## Stream Deck+ actions

| Action | Rotate / Key | Press | Feedback |
|--------|--------------|-------|----------|
| Mic Gain | `AdjustGain` (or mute-only in MIDI mode) | `ToggleMute` | live value / `MUTED` / touch ownership |
| Mic Monitor | `AdjustLevel` on Monitoring | `ToggleMute` (mic) | live % / `CUE` on touch |
| Channel Level | `AdjustLevel` (Game/Chat/Music/**HP**) | `ToggleMute` | live level / touch ownership |
| Mute Toggle | — | `ToggleMute` | `MUTED` / label |
| Listen Toggle | — | `ToggleListen` | `LISTEN ●` / label |
| High-Pass | — | `ToggleProcessing` (HPF) | `HPF ●` / `HPF` |
| Compressor | — | `ToggleProcessing` (Compression) | `COMP ●` / `COMP` |
| SMART Pad | — | `TriggerPad` | pad label / brief `FIRE` |
| Record | — | Start/Stop recording | `REC` / `REC ●` |
| Apply Workflow | — | `ApplyWorkflow` | workflow label / brief `OK` |
| Capture Workflow | — | snapshot surface → workflow id | `CAP …` / `OK N` |

Property Inspector loads live bindings/workflows from the capability core (dropdowns + status). Dial **touch** shows ownership/focus readout; Mic Monitor **press** toggles mic mute.

### Install into Stream Deck

```bash
npm install && npm run build
npm install -g @elgato/cli
streamdeck link packages/streamdeck-plugin/com.felixgeelhaar.rode-control.sdPlugin
streamdeck restart com.felixgeelhaar.rode-control
```

Default runtime uses the PodMic simulator (`RODE_CONTROL_ADAPTER=sim`).  
Set `RODE_CONTROL_ADAPTER=rodecaster` for the Duo mix-bank simulator.  
Set `RODE_CONTROL_ADAPTER=rodecaster-midi` for official MIDI Tier B (mute/listen/pads/record; mock transport by default).  
Set `RODE_CONTROL_MIDI_HARDWARE=1` and/or `RODE_CONTROL_MIDI_PORT=…` to open a real OS MIDI port (`NodeMidiTransport`, pulse-toggle semantics).  
Set `RODE_CONTROL_ADAPTER=topology` for dual-adapter mixer-preferred ownership.

## Next hardware steps

1. Capture how RØDE Central talks to PodMic USB while changing gain/monitor/DSP.
2. Implement a real `DeviceAdapter` behind the same interface.
3. Re-run the Phase 1–2 checklist on physical PodMic USB + Stream Deck+.
4. Validate RØDECaster Duo channel control on hardware and prove §43 ownership equivalence.
5. On a physical Duo / Pro II, verify mute/listen/pads/record with `RODE_CONTROL_MIDI_HARDWARE=1`.
