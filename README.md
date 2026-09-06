# rode-management

Local, capability-driven control layer for RØDE audio ecosystems — initially presented through Elgato Stream Deck+.

> **Positioning:** Control your RØDE setup from Stream Deck.  
> Not a PodMic-only controller. Not a software mixer. Not DSP-in-process.

## Current status

**Draft 0.1 / Phase 1 vertical slice on a simulator**

| Assumption | Evidence in repo |
|------------|------------------|
| Reliable interactive control is possible | Pending real PodMic USB protocol work ([Phase 0](docs/phase-0-protocol.md)) |
| Stream Deck+ can feel like a console | Mic Gain dial action scaffolded |
| One capability model spans USB mic and mixer channel ownership | Covered by core tests |

## Quick start

```bash
npm install
npm test
npm run demo:vertical-slice
npm run build
```

### Vertical slice demo (no hardware)

```text
discover → show gain → dial adjust → external change → disconnect OFFLINE → reconnect
```

### Stream Deck plugin

Built artifact:

`packages/streamdeck-plugin/com.felixgeelhaar.rode-control.sdPlugin`

Install via the Elgato Stream Deck app / CLI on a machine with Stream Deck+. Default backend is the PodMic USB **simulator** (`RODE_CONTROL_ADAPTER=sim`).

## Workspace

```text
packages/core                 Capability core + domain model
packages/adapters/podmic-usb  Sim adapter + protocol research stub
packages/streamdeck-plugin    Stream Deck+ Mic Gain dial
docs/                         Product intent, architecture, Phase 0 notes
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
