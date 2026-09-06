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
| `@rode-control/streamdeck-plugin` | Stream Deck+ Mic Gain (+ mute press) and Channel Level dials |

## Phase alignment

| Phase | Status in repo |
|-------|----------------|
| 0 Protocol feasibility (real PodMic USB) | Stub + checklist only — requires hardware |
| 1 Vertical slice (dial ↔ gain, offline/reconnect) | Implemented against **simulator** |
| 2 Capability depth | Monitor, mute, HPF, compressor wired on PodMic sim; dial press → mute |
| 3 RØDECaster validation | Duo simulator + mix bank + §43 ownership tests |
| 3b Official MIDI (Tier B) | `RodecasterDuoMidiAdapter` + mock transport — mute/listen/pads/record ([midi-tier-b.md](./midi-tier-b.md)) |
| 4+ Creator product / ecosystem | Not started |

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

Optimistic UI is allowed for feel, but displays reconcile to authoritative adapter/device state. Offline bindings remain configured and show `OFFLINE`.

## Stream Deck+ actions

| Action | Rotate | Press | Feedback |
|--------|--------|-------|----------|
| Mic Gain | `AdjustGain` | `ToggleMute` | live value / `MUTE …` / `OFFLINE` |
| Channel Level | `AdjustLevel` | reserved | live level / `OFFLINE` |

Default runtime uses the PodMic simulator (`RODE_CONTROL_ADAPTER=sim`).  
Set `RODE_CONTROL_ADAPTER=rodecaster` for the Duo mix-bank simulator.  
Set `RODE_CONTROL_ADAPTER=rodecaster-midi` for official MIDI Tier B (mute/pads/record; mock transport by default).

## Next hardware steps

1. Capture how RØDE Central talks to PodMic USB while changing gain/monitor/DSP.
2. Implement a real `DeviceAdapter` behind the same interface.
3. Re-run the Phase 1–2 checklist on physical PodMic USB + Stream Deck+.
4. Validate RØDECaster Duo channel control on hardware and prove §43 ownership equivalence.
5. Wire a real MIDI port into `RodecasterDuoMidiAdapter` and verify mute/listen/pads/record on Duo / Pro II.
