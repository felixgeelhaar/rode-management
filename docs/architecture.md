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
| `@rode-control/core` | Domain types, `DeviceAdapter` contract, `CapabilityCore` (graph, bindings, commands, state sync) |
| `@rode-control/adapter-podmic-usb` | PodMic USB sim adapter + protocol research stub |
| `@rode-control/streamdeck-plugin` | Stream Deck+ Mic Gain dial action |

## Phase alignment

| Phase | Status in repo |
|-------|----------------|
| 0 Protocol feasibility (real PodMic USB) | Stub + checklist only — requires hardware |
| 1 Vertical slice (dial ↔ gain, offline/reconnect) | Implemented against **simulator** |
| 2 Capability depth | Monitor capability declared, not wired |
| 3 RØDECaster validation | Ownership topology covered by core tests with fake mixer adapter |
| 4+ Creator product / ecosystem | Not started |

## Adapter contract

Adapters own discovery, identity, connection, protocol, capability negotiation, commands, observation, errors, and reconnection.

They must **not** own Stream Deck UI concepts.

Until a supported protocol path is validated, `PodMicUsbSimAdapter` stands in for interactive development. Real transport candidates are listed in `protocol-research.ts` (HID, control transfers, IPC, OS audio). Screen automation of RØDE Central is an explicit non-goal.

## State authority

```text
User intent → Adapter command → Device → Observed state → Core → Stream Deck feedback
```

Optimistic UI is allowed for feel, but displays reconcile to authoritative adapter/device state. Offline bindings remain configured and show `OFFLINE`.

## Stream Deck+ Mic Gain action

- **Rotate** → `AdjustGain`
- **Press** → reserved for mute when available
- **Feedback** → live value or `OFFLINE`
- Layout: stock `$B1`

Default runtime uses the simulator (`RODE_CONTROL_ADAPTER=sim`).

## Next hardware steps

1. Capture how RØDE Central talks to PodMic USB while changing gain/monitor/DSP.
2. Implement a real `DeviceAdapter` behind the same interface.
3. Re-run the Phase 1 checklist on physical PodMic USB + Stream Deck+.
4. Add RØDECaster Duo adapter and prove §43 ownership equivalence on hardware.
