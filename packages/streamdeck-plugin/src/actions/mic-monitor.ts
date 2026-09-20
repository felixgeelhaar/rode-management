import {
  action,
  DialRotateEvent,
  DidReceiveSettingsEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { BindingFeedbackSession } from "../binding-feedback.js";
import { getCapabilityCore, MIC_MONITOR_BINDING_ID } from "../core-host.js";

type MonitorSettings = {
  bindingId?: string;
  sensitivity?: number;
};

@action({ UUID: "com.felixgeelhaar.rode-control.mic-monitor" })
export class MicMonitorDialAction extends SingletonAction<MonitorSettings> {
  private readonly feedback = new BindingFeedbackSession();

  override async onWillAppear(
    ev: WillAppearEvent<MonitorSettings>,
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? MIC_MONITOR_BINDING_ID;
    await this.feedback.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<MonitorSettings>,
  ): Promise<void> {
    await this.feedback.onDidReceiveSettings(ev, {
      defaultBindingId: MIC_MONITOR_BINDING_ID,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<MonitorSettings>,
  ): Promise<void> {
    this.feedback.onWillDisappear(ev);
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
    if (!actionRef.isDial()) return;
    const core = await getCapabilityCore();
    const surface = core.getControlSurface(bindingId);
    let value = surface.valueText;
    if (surface.availability === "offline") {
      value = "OFFLINE";
    } else if (surface.availability === "unsupported") {
      value = "N/A";
    }
    await actionRef.setFeedback({ title: surface.label, value });
  }
}
