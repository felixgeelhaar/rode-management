# Protocol feasibility — PodMic USB (Phase 0)

Status: **unvalidated** (no hardware attached in this environment)

## Goal

Prove a dependable device adapter can:

1. Discover PodMic USB without manual protocol configuration
2. Read current gain
3. Write gain
4. Observe external changes (Central / hardware) when the device permits
5. Operate without RØDE Central running
6. Preferentially share a protocol family with other Central-compatible mics

## Public facts

- Companion apps (Central, Connect, UNIFY) configure gain, monitoring, and on-board DSP
- Settings persist on the microphone after apps close
- USB identity commonly reported as vendor `0x19f7`, product `0x004a` (HID)
- RØDE does not publish a supported third-party control API for PodMic USB
- RØDECaster Duo / Pro II **do** publish an official MIDI surface (mute / listen / pads / record) — see [midi-tier-b.md](./midi-tier-b.md). That path does **not** cover PodMic USB gain/DSP.

## Non-goals

- Screen scraping / UI automation of RØDE software
- Implementing DSP in our process
- Claiming Tier A support before observation works

## Checklist

Tracked in code as `PODMIC_USB_PROTOCOL_CHECKLIST` in `@rode-control/adapter-podmic-usb`.

| Capability | Status |
|------------|--------|
| Discover | unvalidated |
| Read gain | unvalidated |
| Write gain | unvalidated |
| Observe changes | unvalidated |
| Without Central | unvalidated |
| Shared mic family protocol | unvalidated |

## How to validate on a Mac/Windows machine with hardware

1. Install RØDE Central and confirm gain changes on the PodMic USB.
2. Capture USB HID / control traffic during gain changes (OS-appropriate tooling).
3. Attempt independent get/set without Central running.
4. Implement results as a new adapter class beside `PodMicUsbSimAdapter`.
5. Point the Stream Deck plugin host at the real adapter and re-run Phase 1 behaviors.

Until then, architecture and Stream Deck UX proceed against the simulator.
