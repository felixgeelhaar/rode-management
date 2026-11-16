import {
  action,
  DialDownEvent,
  DialRotateEvent,
  DidReceiveSettingsEvent,
  PropertyInspectorDidAppearEvent,
  SendToPluginEvent,
  SingletonAction,
  TouchTapEvent,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { ACTION_UUIDS } from "../action-uuids.js";
import { BindingFeedbackSession } from "../binding-feedback.js";
import {
  getCapabilityCore,
  MIC_GAIN_BINDING_ID,
  MIC_MONITOR_BINDING_ID,
} from "../core-host.js";
import {
  handlePropertyInspectorDidAppear,
  handleSendToPlugin,
} from "../pi-bridge.js";

type MonitorSettings = {
  bindingId?: string;
  sensitivity?: number;
};

@action({ UUID: ACTION_UUIDS.micMonitor })
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

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent<MonitorSettings>,
  ): Promise<void> {
    await handlePropertyInspectorDidAppear(ev, ACTION_UUIDS.micMonitor);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, JsonObject>): Promise<void> {
    await handleSendToPlugin(ev.payload, ACTION_UUIDS.micMonitor);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<MonitorSettings>,
  ): Promise<void> {
    this.feedback.onWillDisappear(ev);
  }

  override async onTouchTap(ev: TouchTapEvent<MonitorSettings>): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? MIC_MONITOR_BINDING_ID;
    await this.render(ev.action, bindingId, true);
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

  /** Press mutes the paired mic gain binding (same creator muscle memory as gain dial). */
  override async onDialDown(ev: DialDownEvent<MonitorSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const monitorId = ev.payload.settings.bindingId ?? MIC_MONITOR_BINDING_ID;
    const muteTarget =
      core.resolveBinding(MIC_GAIN_BINDING_ID) !== undefined
        ? MIC_GAIN_BINDING_ID
        : monitorId;
    const result = await core.execute({ type: "ToggleMute", bindingId: muteTarget });
    if (!result.ok && ev.action.isDial()) {
      await ev.action.setFeedback({
        title: "MON",
        value: result.error ?? "ERR",
      });
      return;
    }
    await this.render(ev.action, monitorId);
  }

  private async render(
    actionRef: WillAppearEvent<MonitorSettings>["action"],
    bindingId: string,
    focused = false,
  ): Promise<void> {
    if (!actionRef.isDial()) return;
    const core = await getCapabilityCore();
    const surface = core.getControlSurface(bindingId);
    let value = surface.valueText;
    if (surface.availability === "offline") {
      value = "OFFLINE";
    } else if (surface.availability === "unsupported") {
      value = "N/A";
    } else if (focused) {
      value = `CUE ${surface.valueText}`;
    } else if (core.getSiblingState(MIC_GAIN_BINDING_ID, "Mute")?.value === true) {
      value = `MUTE ${surface.valueText}`;
    }
    await actionRef.setFeedback({ title: surface.label, value });
  }
}
