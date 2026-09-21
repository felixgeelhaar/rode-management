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
import { getCapabilityCore, PAD_BANK_BINDING_ID } from "../core-host.js";
import {
  handlePropertyInspectorDidAppear,
  handleSendToPlugin,
} from "../pi-bridge.js";

type PadBankSettings = {
  bindingId?: string;
};

/**
 * Cycles the official RØDECaster SMART pad bank (1–8).
 * MIDI CC 0 uses values 0–7; the core stores the 1-based bank.
 */
@action({ UUID: ACTION_UUIDS.padBank })
export class PadBankKeyAction extends SingletonAction<PadBankSettings> {
  private readonly feedback = new BindingFeedbackSession();

  override async onWillAppear(ev: WillAppearEvent<PadBankSettings>): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? PAD_BANK_BINDING_ID;
    await this.feedback.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      render: (actionRef, id) => this.render(actionRef, id),
    });
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<PadBankSettings>,
  ): Promise<void> {
    await this.feedback.onDidReceiveSettings(ev, {
      defaultBindingId: PAD_BANK_BINDING_ID,
      render: (actionRef, id) => this.render(actionRef, id),
    });
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent<PadBankSettings>,
  ): Promise<void> {
    await handlePropertyInspectorDidAppear(ev, ACTION_UUIDS.padBank);
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<JsonValue, JsonObject>,
  ): Promise<void> {
    await handleSendToPlugin(ev.payload, ACTION_UUIDS.padBank);
  }

  override onWillDisappear(ev: WillDisappearEvent<PadBankSettings>): void {
    this.feedback.onWillDisappear(ev);
  }

  override async onKeyDown(ev: KeyDownEvent<PadBankSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? PAD_BANK_BINDING_ID;
    const surface = core.getControlSurface(bindingId);
    const current = Number.parseInt(surface.valueText, 10);
    const next = Number.isFinite(current) ? (current % 8) + 1 : 1;
    const result = await core.execute({
      type: "SetPadBank",
      bindingId,
      value: next,
    });
    if (!result.ok) {
      await ev.action.setTitle(result.error ?? "ERR");
      return;
    }
    await this.render(ev.action, bindingId);
  }

  private async render(
    actionRef: WillAppearEvent<PadBankSettings>["action"],
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
    const bank = Number.parseInt(surface.valueText, 10);
    await actionRef.setTitle(
      Number.isFinite(bank) ? `BANK ${bank}` : surface.valueText,
    );
  }
}
