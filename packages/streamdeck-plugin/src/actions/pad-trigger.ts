import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  PropertyInspectorDidAppearEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { ACTION_UUIDS } from "../action-uuids.js";
import { BindingFeedbackSession } from "../binding-feedback.js";
import { getCapabilityCore, PAD_1_BINDING_ID } from "../core-host.js";
import {
  handlePropertyInspectorDidAppear,
  handleSendToPlugin,
} from "../pi-bridge.js";

type PadSettings = {
  bindingId?: string;
};

@action({ UUID: ACTION_UUIDS.padTrigger })
export class PadTriggerKeyAction extends SingletonAction<PadSettings> {
  private readonly feedback = new BindingFeedbackSession();
  private readonly flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

  override async onWillAppear(ev: WillAppearEvent<PadSettings>): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? PAD_1_BINDING_ID;
    await this.feedback.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<PadSettings>,
  ): Promise<void> {
    this.clearFlash(ev.action.id);
    await this.feedback.onDidReceiveSettings(ev, {
      defaultBindingId: PAD_1_BINDING_ID,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent<PadSettings>,
  ): Promise<void> {
    await handlePropertyInspectorDidAppear(ev, ACTION_UUIDS.padTrigger);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, JsonObject>): Promise<void> {
    await handleSendToPlugin(ev.payload, ACTION_UUIDS.padTrigger);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<PadSettings>,
  ): Promise<void> {
    this.clearFlash(ev.action.id);
    this.feedback.onWillDisappear(ev);
  }

  override async onKeyDown(ev: KeyDownEvent<PadSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? PAD_1_BINDING_ID;
    const result = await core.execute({ type: "TriggerPad", bindingId });
    if (!result.ok) {
      await ev.action.setTitle(result.error ?? "ERR");
      return;
    }

    this.clearFlash(ev.action.id);
    await ev.action.setTitle("FIRE");
    this.flashTimers.set(
      ev.action.id,
      setTimeout(() => {
        this.flashTimers.delete(ev.action.id);
        void this.render(ev.action, bindingId);
      }, 250),
    );
  }

  private clearFlash(actionId: string): void {
    const timer = this.flashTimers.get(actionId);
    if (timer) {
      clearTimeout(timer);
      this.flashTimers.delete(actionId);
    }
  }

  private async render(
    actionRef: WillAppearEvent<PadSettings>["action"],
    bindingId: string,
  ): Promise<void> {
    const core = await getCapabilityCore();
    const surface = core.getControlSurface(bindingId);
    if (surface.availability === "offline") {
      await actionRef.setTitle("OFFLINE");
      return;
    }
    if (surface.availability === "unsupported") {
      await actionRef.setTitle("N/A");
      return;
    }
    await actionRef.setTitle(surface.label);
  }
}
