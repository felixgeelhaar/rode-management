import {
  action,
  DialDownEvent,
  DialRotateEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { getCapabilityCore, MIC_GAIN_BINDING_ID } from "../core-host.js";

type MicGainSettings = {
  bindingId?: string;
  /** dB change per dial tick */
  sensitivity?: number;
};

/**
 * Stream Deck+ dial for logical "My Mic" / Gain.
 *
 * Rotate → AdjustGain
 * Press  → ToggleMute (same-endpoint retarget)
 * Display → live authoritative state / OFFLINE
 */
@action({ UUID: "com.felixgeelhaar.rode-control.mic-gain" })
export class MicGainDialAction extends SingletonAction<MicGainSettings> {
  private readonly feedbackUnsubscribers = new Map<string, () => void>();

  override async onWillAppear(
    ev: WillAppearEvent<MicGainSettings>,
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? MIC_GAIN_BINDING_ID;
    this.feedbackUnsubscribers.get(ev.action.id)?.();

    const core = await getCapabilityCore();
    const unsubscribe = core.subscribe((event) => {
      if (
        (event.type === "state-changed" &&
          (event.resolved.binding.id === bindingId ||
            (event.resolved.capability.type === "Mute" &&
              event.resolved.endpoint.id ===
                core.resolveBinding(bindingId)?.endpoint.id))) ||
        (event.type === "binding-offline" && event.bindingId === bindingId) ||
        (event.type === "binding-online" && event.bindingId === bindingId)
      ) {
        void this.render(ev.action, bindingId);
      }
    });

    this.feedbackUnsubscribers.set(ev.action.id, unsubscribe);
    await this.render(ev.action, bindingId);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<MicGainSettings>,
  ): Promise<void> {
    this.feedbackUnsubscribers.get(ev.action.id)?.();
    this.feedbackUnsubscribers.delete(ev.action.id);
  }

  override async onDialRotate(
    ev: DialRotateEvent<MicGainSettings>,
  ): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? MIC_GAIN_BINDING_ID;
    const sensitivity = ev.payload.settings.sensitivity ?? 1;

    const result = await core.execute({
      type: "AdjustGain",
      bindingId,
      delta: ev.payload.ticks * sensitivity,
    });

    if (!result.ok) {
      if (ev.action.isDial()) {
        await ev.action.setFeedback({
          title: "MIC",
          value: result.error ?? "ERR",
        });
      }
      return;
    }

    await this.render(ev.action, bindingId);
  }

  override async onDialDown(ev: DialDownEvent<MicGainSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? MIC_GAIN_BINDING_ID;

    const result = await core.execute({
      type: "ToggleMute",
      bindingId,
    });

    if (!result.ok && ev.action.isDial()) {
      await ev.action.setFeedback({
        title: "MIC",
        value: result.error ?? "ERR",
      });
      return;
    }

    await this.render(ev.action, bindingId);
  }

  private async render(
    actionRef: WillAppearEvent<MicGainSettings>["action"],
    bindingId: string,
  ): Promise<void> {
    if (!actionRef.isDial()) {
      return;
    }

    const core = await getCapabilityCore();
    const surface = core.getControlSurface(bindingId);
    const muted = this.isMuted(core, bindingId);

    await actionRef.setFeedback({
      title: surface.label,
      value:
        surface.availability === "offline"
          ? "OFFLINE"
          : muted
            ? `MUTE ${surface.valueText}`
            : surface.valueText,
    });
  }

  private isMuted(
    core: Awaited<ReturnType<typeof getCapabilityCore>>,
    bindingId: string,
  ): boolean {
    return core.getSiblingState(bindingId, "Mute")?.value === true;
  }
}
