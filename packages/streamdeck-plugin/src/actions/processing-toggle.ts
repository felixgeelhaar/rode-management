import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import type { CapabilityType } from "@rode-control/core";
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

  private readonly feedbackUnsubscribers = new Map<string, () => void>();

  override async onWillAppear(
    ev: WillAppearEvent<ProcessingSettings>,
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? this.defaultBindingId;
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
    ev: WillDisappearEvent<ProcessingSettings>,
  ): Promise<void> {
    this.feedbackUnsubscribers.get(ev.action.id)?.();
    this.feedbackUnsubscribers.delete(ev.action.id);
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
