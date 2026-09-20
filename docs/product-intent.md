# RØDE × Stream Deck Control — Product Intent Specification

**Status:** Draft 0.1  
**Date:** 6 September 2026  
**Working name:** TBD  
**Primary reference hardware:** RØDE PodMic USB + Elgato Stream Deck+  
**Strategic reference setup:** RØDECaster Duo / Pro II + microphones, application audio, wireless sources, and Stream Deck+

---

## 1. Purpose

This document defines intended product behavior, conceptual model, scope, UX, and boundaries for a control and automation layer connecting RØDE audio hardware with Elgato Stream Deck devices.

It is intentionally broader than an MVP. The stable product model must accommodate USB microphones, RØDECaster consoles, XLR mics through controllable RØDE hardware, wireless systems, interfaces, streaming devices, future RØDE hardware, Stream Deck+, and other Stream Deck models where controls make sense.

The first development fixture is PodMic USB + Stream Deck+. The product must **not** assume the microphone itself is always the controllable device.

## 2. Product intent

Turn Stream Deck into a native-feeling physical control surface for a user’s RØDE audio environment.

Desired mental model: **“Control my audio setup from Stream Deck.”**  
Not: “Send commands to this specific RØDE device.”  
Not: “Control my USB microphone.”

## 3. Product vision

Creator audio environments span mics, interfaces, mixers, wireless, app audio, monitoring, streaming software, chat, music, games, recording, processing, and routing. Controls are fragmented.

Long term: **Stream Deck becomes the programmable physical console for the creator’s RØDE audio environment.**

RØDE hardware continues capture/mixing/routing/monitoring/DSP. This product owns discovery, abstraction, control, state sync, orchestration, presets, automation, Stream Deck interaction, and topology awareness. It should generally **not** become an audio-processing engine.

## 4. Product principles

1. **Control the signal path, not merely the product** — same coherent experience for PodMic USB→Computer vs PodMic XLR→RØDECaster→Computer.
2. **Capabilities over device-specific actions** — `Set level`, `Mute`, `Set gain`, etc.; adapters implement capabilities; Stream Deck consumes them.
3. **Hardware remains authoritative for audio** — control device DSP/mix/route; don’t recreate them.
4. **State must be bidirectional** — Stream Deck displays current state, not last command sent.
5. **Hardware topology matters** — choose the appropriate control owner.
6. **Graceful degradation** — don’t fake unsupported capabilities.

## 5. Target users

Primary: creators/streamers with Stream Deck + RØDE gear.  
High-value segment: complex RØDECaster setups (Mic / Game / Discord / Music / Browser / Wireless / Headphones).

## 6. Jobs to be done

Primary: immediate physical control over RØDE audio without interrupting creation.

Supporting: change levels, mute confidently, control monitoring, adjust mic processing, change workflow, manage multiple sources, trigger production functions.

## 7–12. Supported families

- Digital/USB mics (PodMic USB, NT-USB+, NT1 5th Gen, …) — capability-discovered
- Passive XLR mics — controlled via host endpoint; user-attached labels (“My Mic”)
- RØDECaster Duo / Pro II — channels, processing, outputs, mixer, SMART Pads, recording where safe
- Virtual application sources — Game, Chat, Music, Browser as first-class concepts
- Wireless PRO/GO/ME/Interview PRO — not required for first vertical slice
- Interfaces / Streamer X — later investigation

## 13–19. Domain model

**Device** — physical/logical RØDE product with endpoints and capabilities.  
**Endpoint** — meaningful source/destination/channel (`input`, `output`, `channel`, `monitor`, `virtual-source`, …).  
**Source** — semantic signal origin; not necessarily controllable.  
**Capability** — queryable/changeable behavior with readable/writable/observable, value type, device-provided ranges.  
**Topology** — relationships answering “who owns this capability?”  
**Capability ownership** — `Change My Mic Gain` resolves to USB mic endpoint or RØDECaster input as appropriate.  
**Logical controls** — `My Mic`, `Game`, `Chat`, … resolve dynamically to endpoints.

## 20–24. Stream Deck integration

Exploit Stream Deck+ dials, press, touch, keys, and live feedback.

Default dial model: rotate = continuous adjust; press = binary/secondary; touch = focus; display = live state.

Banks are conceptual (Mix / Mic / Outputs / Wireless), not hard-coded mandatory layouts. Auto-generated configurations from discovered hardware are a later goal.

## 25–29. Discovery & state

Automatic discovery where possible. Configured actions survive temporary disappearance (`OFFLINE`). Device state is authoritative; optimistic UI must reconcile. Two-way sync is a core requirement.

## 30–35. Commands, presets, profiles, automation

Commands express intent (`SetGain`, `AdjustGain`, `ToggleMute`, …). Adapters translate relative dial ticks ↔ absolute device units.

Distinguish device presets vs product presets spanning devices. Profiles map workflows (Streaming, Podcast, …). Application awareness and general automation are later layers.

## 36–38. Architecture

```text
Stream Deck → Interaction Intents → Control Core (graph, capabilities, state, bindings)
                                  → Adapter Layer (digital mic / RØDECaster / OS audio / …)
```

Adapters own protocol details. Core must not depend on one universal RØDE API.

## 39–43. Feasibility & vertical slice

Public Central UI ≠ supported third-party API. Protocol feasibility must be validated first.

**Phase 1 vertical slice:** PodMic USB ↔ adapter ↔ core ↔ Stream Deck+ for **Mic Gain**: discover, read, display, dial adjust, reflect, observe external changes, offline, reconnect without profile recreation.

**Critical validation:** Setup A (USB mic) and Setup B (XLR→RØDECaster Input 1) expose identical Stream Deck `My Mic / Gain` semantics; only resolution differs.

## 44–56. UX, safety, operations

Human-readable device trees; semantic naming; non-destructive offline controls; predictable failures; respect hardware safety limits; local-first (no cloud required for mute/gain/mix/monitor); no access to audio content; coalesce rapid dial events; persist bindings; handle firmware variance via capability detection.

## 57–58. Scope & non-goals

In scope long-term: discovery, semantic control, sync, Stream Deck UI, logical mappings, presets, topology, automation, extensible adapters.

Non-goals: competing software mixer; performing DSP ourselves; universal all-brand mic control; founding architecture on RØDE Central screen automation.

## 59–61. Differentiation & support tiers

Differentiate via unified semantic controls, native Stream Deck+ interaction, deep RØDE awareness, state sync, topology awareness, extensible adapters.

Tiers: A Full / B Control / C Basic / Unsupported — prefer honesty over vague “supported.”

Capability matrices are hypotheses until experimentally verified.

## 62–65. Phased intent & MVP

0 Protocol feasibility → 1 Vertical slice → 2 Capability depth → 3 RØDECaster validation → 4 Useful creator surface → 5 Ecosystem expansion → 6 Workflow layer.

MVP proves three assumptions: reliable control, good Stream Deck+ feel, one abstraction across setups. Strong MVP target: PodMic USB + RØDECaster Duo + Stream Deck+ with focused capabilities.

Early exclusions unless easy: wireless, SMART Pad programming, recording mgmt, complex routing editor, preset authoring, automation engine, cloud, mobile, every device.

## 66–71. Success, metrics, risks

Success = utility, speed, confidence, reliability, discoverability, extensibility.

Critical risks: proprietary/unstable protocols; one-way state; fragmented families; ambiguous ownership; audible safety; market may already feel solved by RØDECaster hardware; USB-mic-only TAM may be weak; Stream Deck may be first client not final boundary.

## 72–76. Open questions & naming

Commercial model, companion service, first segment, config UI host, topology inference depth, processing-on-dials demand, SMART Pads priority, wireless demand, profile locality, vendor-neutral expansion — deliberately open.

Naming must not imply USB-only or mics-only, and must not imply official RØDE endorsement unless that exists.

Positioning: **Control your RØDE setup from Stream Deck.**

Control core should allow future clients (CLI, OBS, automation, …) without distracting from Stream Deck first.

## 77–79. Canonical model & north star

```text
PodMic → RØDECaster Duo / Input 1 → Gain → "My Mic" → Stream Deck+ Dial
# or
PodMic USB → Microphone Endpoint → Gain → "My Mic" → Stream Deck+ Dial
```

North star: discover the user’s RØDE world; present `MIC GAME CHAT MUSIC`; dial/mute/touch deeper controls; reflect hardware changes; adapt with workflows — without exposing USB IDs, proprietary commands, or ownership trivia.

**Final intent:** a local capability-driven control and orchestration layer for RØDE audio ecosystems, initially via Stream Deck+, optimized for Stream Deck+. PodMic USB is the simplest fixture; architecture assumes RØDECaster-centered topologies from day one.
