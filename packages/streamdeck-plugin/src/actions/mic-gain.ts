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
import { getCapabilityCore, MIC_GAIN_BINDING_ID } from "../core-host.js";
import {
  handlePropertyInspectorDidAppear,
  handleSendToPlugin,
} from "../pi-bridge.js";

type MicGainSettings = {
  bindingId?: string;
  sensitivity?: number;
};

@action({ UUID: ACTION_UUIDS.micGain })
export class MicGainDialAction extends SingletonAction<MicGainSettings> {
  private readonly feedback = new BindingFeedbackSession();

  override async onWillAppear(
    ev: WillAppearEvent<MicGainSettings>,
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? MIC_GAIN_BINDING_ID;
    await this.feedback.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      includeMuteSibling: true,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<MicGainSettings>,
  ): Promise<void> {
    await this.feedback.onDidReceiveSettings(ev, {
      defaultBindingId: MIC_GAIN_BINDING_ID,
      includeMuteSibling: true,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent<MicGainSettings>,
  ): Promise<void> {
    await handlePropertyInspectorDidAppear(ev, ACTION_UUIDS.micGain);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, JsonObject>): Promise<void> {
    await handleSendToPlugin(ev.payload, ACTION_UUIDS.micGain);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<MicGainSettings>,
  ): Promise<void> {
    this.feedback.onWillDisappear(ev);
  }

  override async onTouchTap(ev: TouchTapEvent<MicGainSettings>): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? MIC_GAIN_BINDING_ID;
    await this.renderTouchFocus(ev.action, bindingId);
  }

  override async onDialRotate(
    ev: DialRotateEvent<MicGainSettings>,
  ): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? MIC_GAIN_BINDING_ID;
    const sensitivity = ev.payload.settings.sensitivity ?? 1;

    const resolved = core.resolveBinding(bindingId);
    if (resolved?.capability.type === "Mute") {
      if (ev.action.isDial()) {
        await ev.action.setFeedback({
          title: resolved.binding.label,
          value: "MUTE ONLY",
        });
      }
      return;
    }

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
    const result = await core.execute({ type: "ToggleMute", bindingId });
    if (!result.ok && ev.action.isDial()) {
      await ev.action.setFeedback({
        title: "MIC",
        value: result.error ?? "ERR",
      });
      return;
    }
    await this.render(ev.action, bindingId);
  }

  private async renderTouchFocus(
    actionRef: WillAppearEvent<MicGainSettings>["action"],
    bindingId: string,
  ): Promise<void> {
    if (!actionRef.isDial()) return;
    const core = await getCapabilityCore();
    const surface = core.getControlSurface(bindingId);
    const diagnosis = core.diagnoseBinding(bindingId);
    const owner =
      diagnosis.owner?.endpointLabel ??
      diagnosis.status.toUpperCase();
    await actionRef.setFeedback({
      title: surface.label,
      value: `${surface.valueText} · ${owner}`,
    });
  }

  private async render(
    actionRef: WillAppearEvent<MicGainSettings>["action"],
    bindingId: string,
  ): Promise<void> {
    if (!actionRef.isDial()) return;
    const core = await getCapabilityCore();
    const surface = core.getControlSurface(bindingId);
    const resolved = core.resolveBinding(bindingId);

    let value = surface.valueText;
    if (surface.availability === "offline") {
      value = "OFFLINE";
    } else if (surface.availability === "unsupported") {
      value = "N/A";
    } else if (resolved?.capability.type === "Mute") {
      value = surface.valueText.toUpperCase() === "ON" ? "MUTED" : "LIVE";
    } else if (core.getSiblingState(bindingId, "Mute")?.value === true) {
      value = `MUTE ${surface.valueText}`;
    }

    await actionRef.setFeedback({ title: surface.label, value });
  }
}
