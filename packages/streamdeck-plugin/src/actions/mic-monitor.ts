import {
  action,
  DialRotateEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { getCapabilityCore, MIC_MONITOR_BINDING_ID } from "../core-host.js";

type MonitorSettings = {
  bindingId?: string;
  /** Percent change per dial tick */
  sensitivity?: number;
};

/**
 * Stream Deck+ dial for mic monitor / headphone cue level.
 *
 * Rotate → AdjustLevel on a Monitoring binding
 * Display → live percent / OFFLINE / N/A
 */
@action({ UUID: "com.felixgeelhaar.rode-control.mic-monitor" })
export class MicMonitorDialAction extends SingletonAction<MonitorSettings> {
  private readonly feedbackUnsubscribers = new Map<string, () => void>();

  override async onWillAppear(
    ev: WillAppearEvent<MonitorSettings>,
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? MIC_MONITOR_BINDING_ID;
    this.feedbackUnsubscribers.get(ev.action.id)?.();

    const core = await getCapabilityCore();
    const unsubscribe = core.subscribe((event) => {
      if (
        (event.type === "state-changed" &&
          event.resolved.binding.id === bindingId) ||
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
    ev: WillDisappearEvent<MonitorSettings>,
  ): Promise<void> {
    this.feedbackUnsubscribers.get(ev.action.id)?.();
    this.feedbackUnsubscribers.delete(ev.action.id);
  }

  override async onDialRotate(
    ev: DialRotateEvent<MonitorSettings>,
  ): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? MIC_MONITOR_BINDING_ID;
    const sensitivity = ev.payload.settings.sensitivity ?? 2;

    const surface = core.getControlSurface(bindingId);
    if (surface.availability === "unsupported") {
      if (ev.action.isDial()) {
        await ev.action.setFeedback({ title: surface.label, value: "N/A" });
      }
      return;
    }

    const result = await core.execute({
      type: "AdjustLevel",
      bindingId,
      delta: ev.payload.ticks * sensitivity,
    });

    if (!result.ok) {
      if (ev.action.isDial()) {
        await ev.action.setFeedback({
          title: "MON",
          value: result.error ?? "ERR",
        });
      }
      return;
    }

    await this.render(ev.action, bindingId);
  }

  private async render(
    actionRef: WillAppearEvent<MonitorSettings>["action"],
    bindingId: string,
  ): Promise<void> {
    if (!actionRef.isDial()) {
      return;
    }
    const core = await getCapabilityCore();
    const surface = core.getControlSurface(bindingId);
    let value = surface.valueText;
    if (surface.availability === "offline") {
      value = "OFFLINE";
    } else if (surface.availability === "unsupported") {
      value = "N/A";
    }
    await actionRef.setFeedback({
      title: surface.label,
      value,
    });
  }
}
