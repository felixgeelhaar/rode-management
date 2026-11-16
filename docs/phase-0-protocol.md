# Protocol feasibility — PodMic USB (Phase 0)

Status: **researched, still unvalidated on hardware** (no PodMic attached in this environment)

## Goal

Prove a dependable device adapter can:

1. Discover PodMic USB without manual protocol configuration
2. Read current gain
3. Write gain
4. Observe external changes (Central / hardware) when the device permits
5. Operate without RØDE Central running
6. Preferentially share a protocol family with other Central-compatible mics

## Public facts (researched)

| Fact | Source / note |
|------|----------------|
| USB identity `19f7:004a` | Public USB databases (linux-hardware.org); class reported as HID (`03`) |
| Gain / DSP / monitor configured by companion apps | RØDE user guide: Central, Connect, UNIFY |
| Settings persist after apps close | RØDE user guide |
| No public third-party PodMic USB control API | RØDE docs; no official SDK |
| Headphone volume is a **physical** control on the mic | User guide; not a host OS mixer story |
| RØDECaster Duo / Pro II have an **official MIDI** surface | RØDE Help “MIDI Triggers…” — mute / listen / pads / record ([midi-tier-b.md](./midi-tier-b.md)) |
| RØDECaster Pro II **HID** has community reverse-engineering | Unofficial projects (e.g. `seanheiney/rodey`, `rcp2-cli`) target mixer PID `0x0030`, not PodMic `0x004a` |
| No mature public PodMic USB HID decode found | As of research pass — treat as greenfield capture work |

## What this means for “does it connect to my mic?”

| Setup | Can we control gain today? | Path |
|-------|----------------------------|------|
| PodMic USB alone into the computer | **No** (sim only) | Need HID/control capture from Central |
| PodMic USB into **RØDECaster** USB/XLR + official MIDI | **Mute / listen / pads / record** only | Wire real MIDI port into `RodecasterDuoMidiAdapter` |
| RØDECaster Pro II full DSP via unofficial HID | Possible in principle | Different device; not PodMic; legal/ToS risk; not in this repo |

**Honest product stance:** Stream Deck UX is ready. PodMic USB **gain/DSP** is blocked on protocol validation. The first **documented** live-hardware path is RØDECaster **MIDI Tier B**, not PodMic HID.

## Transport candidates (PodMic USB)

Ranked by likelihood given public evidence:

1. **USB HID feature/input reports** — device enumerated as HID; Central almost certainly speaks vendor HID
2. **USB control transfers** — common for settings; confirm with capture
3. **Shared “Central family” property protocol** — possible if PodMic shares framing with Wireless / NT-USB / RØDECaster HID trees (hypothesis only; Pro II research suggests a structured property object model on mixers)
4. **OS audio / UAC volume** — weak candidate for *input gain*; companion-app DSP usually bypasses standard UAC Feature Unit volume
5. **Local IPC to Central** — fragile; Central UI automation is an explicit non-goal

## Non-goals

- Screen scraping / UI automation of RØDE software
- Implementing DSP in our process
- Claiming Tier A support before observation works
- Shipping reverse-engineered mixer HID as if it were a RØDE-supported API

## Checklist

Tracked in code as `PODMIC_USB_PROTOCOL_CHECKLIST` in `@rode-control/adapter-podmic-usb`.

| Capability | Status |
|------------|--------|
| Discover | unvalidated |
| Read gain | unvalidated |
| Write gain | unvalidated |
| Observe changes | unvalidated |
| Without Central | unvalidated |
| Shared mic family protocol | unvalidated (hypothesis: possible Central family; unproven for `004a`) |

## How to validate on a Mac/Windows machine with hardware

1. Install RØDE Central and confirm gain / HPF / compressor change on the PodMic USB.
2. Capture USB traffic **while changing only one control at a time** (Wireshark USBPcap / macOS equivalent / `usbhid-dump`).
3. Isolate SET_REPORT / GET_REPORT / control transfers that correlate with gain steps.
4. Attempt independent get/set **without Central running**.
5. Implement results as `PodMicUsbHidAdapter` (name TBD) beside `PodMicUsbSimAdapter`.
6. Point the Stream Deck host at the real adapter (`RODE_CONTROL_ADAPTER=…`) and re-run Phase 1.

### Capture hygiene

- One parameter per capture session (gain only, then monitor, then HPF…)
- Record firmware version from Central
- Note whether Central must stay open for observation events
- Never flash firmware or send unknown bulk payloads that could brick the device

## Parallel hardware win (available sooner)

If the creator desk includes a **RØDECaster Duo / Pro II**:

1. Enable MIDI control on the console.
2. Implement a real `MidiTransport` (node-midi / Web MIDI) opening the “MIDI Function” port.
3. Pass it into `RodecasterDuoMidiAdapter({ transport })`.
4. Run `RODE_CONTROL_ADAPTER=rodecaster-midi` — Stream Deck mute / listen / pads / record become live.

That does **not** unlock PodMic USB gain over USB, but it is the first first-party, documented path to physical RØDE hardware in this architecture.

## Related code

- `packages/adapters/podmic-usb/src/protocol-research.ts` — checklist + USB IDs
- `packages/adapters/podmic-usb/src/sim-adapter.ts` — current stand-in
- `packages/adapters/rodecaster-duo/src/midi-*.ts` — official MIDI Tier B
- [midi-tier-b.md](./midi-tier-b.md)
