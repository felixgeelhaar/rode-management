import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import type { CapabilityType } from "@rode-control/core";
import { BindingFeedbackSession } from "../binding-feedback.js";
import {
  getCapabilityCore,
  MIC_COMP_BINDING_ID,
  MIC_HPF_BINDING_ID,
} from "../core-host.js";

type ProcessingSettings = {
  bindingId?: string;
};

/**
 * Shared boolean processing toggle (HPF / compressor / …).
 */
abstract class ProcessingToggleKeyAction extends SingletonAction<ProcessingSettings> {
  protected abstract readonly defaultBindingId: string;
  protected abstract readonly capabilityType: CapabilityType;
  protected abstract readonly onTitle: string;
  protected abstract readonly offTitle: string;

  private readonly feedback = new BindingFeedbackSession();

  override async onWillAppear(
    ev: WillAppearEvent<ProcessingSettings>,
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? this.defaultBindingId;
    await this.feedback.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<ProcessingSettings>,
  ): Promise<void> {
    await this.feedback.onDidReceiveSettings(ev, {
      defaultBindingId: this.defaultBindingId,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<ProcessingSettings>,
  ): Promise<void> {
    this.feedback.onWillDisappear(ev);
  }

  override async onKeyDown(ev: KeyDownEvent<ProcessingSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? this.defaultBindingId;
    const result = await core.execute({
      type: "ToggleProcessing",
      bindingId,
      capabilityType: this.capabilityType,
    });
    if (!result.ok) {
      await ev.action.setTitle(result.error ?? "ERR");
      return;
    }
    await this.render(ev.action, bindingId);
  }

  private async render(
    actionRef: WillAppearEvent<ProcessingSettings>["action"],
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
    const on = surface.valueText.toUpperCase() === "ON";
    await actionRef.setTitle(on ? this.onTitle : this.offTitle);
  }
}

@action({ UUID: "com.felixgeelhaar.rode-control.hpf-toggle" })
export class HpfToggleKeyAction extends ProcessingToggleKeyAction {
  protected readonly defaultBindingId = MIC_HPF_BINDING_ID;
  protected readonly capabilityType = "HighPassFilter" as const;
  protected readonly onTitle = "HPF ●";
  protected readonly offTitle = "HPF";
}

@action({ UUID: "com.felixgeelhaar.rode-control.compressor-toggle" })
export class CompressorToggleKeyAction extends ProcessingToggleKeyAction {
  protected readonly defaultBindingId = MIC_COMP_BINDING_ID;
  protected readonly capabilityType = "Compression" as const;
  protected readonly onTitle = "COMP ●";
  protected readonly offTitle = "COMP";
}
