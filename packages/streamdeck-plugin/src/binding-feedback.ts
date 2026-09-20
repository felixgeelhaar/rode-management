import type {
  DidReceiveSettingsEvent,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import type { CapabilityCore, CoreEvent } from "@rode-control/core";
import { getCapabilityCore } from "./core-host.js";

type ActionRef = WillAppearEvent["action"];

/**
 * Keeps Stream Deck action feedback subscribed to the live binding id,
 * including when the property inspector changes settings.
 */
export class BindingFeedbackSession {
  private readonly unsubscribers = new Map<string, () => void>();
  private readonly bindingByAction = new Map<string, string>();

  async attach(options: {
    actionId: string;
    bindingId: string;
    action: ActionRef;
    includeMuteSibling?: boolean;
    render: (action: ActionRef, bindingId: string) => Promise<void>;
  }): Promise<void> {
    this.detach(options.actionId);
    this.bindingByAction.set(options.actionId, options.bindingId);

    const core = await getCapabilityCore();
    const unsubscribe = core.subscribe((event) => {
      const bindingId = this.bindingByAction.get(options.actionId);
      if (!bindingId) return;
      if (this.shouldRender(core, event, bindingId, options.includeMuteSibling)) {
        void options.render(options.action, bindingId);
      }
    });

    this.unsubscribers.set(options.actionId, unsubscribe);
    await options.render(options.action, options.bindingId);
  }

  detach(actionId: string): void {
    this.unsubscribers.get(actionId)?.();
    this.unsubscribers.delete(actionId);
    this.bindingByAction.delete(actionId);
  }

  async onDidReceiveSettings<T extends { bindingId?: string }>(
    ev: DidReceiveSettingsEvent<T>,
    options: {
      defaultBindingId: string;
      includeMuteSibling?: boolean;
      render: (action: ActionRef, bindingId: string) => Promise<void>;
    },
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? options.defaultBindingId;
    await this.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      ...(options.includeMuteSibling !== undefined
        ? { includeMuteSibling: options.includeMuteSibling }
        : {}),
      render: options.render,
    });
  }

  onWillDisappear(ev: WillDisappearEvent): void {
    this.detach(ev.action.id);
  }

  private shouldRender(
    core: CapabilityCore,
    event: CoreEvent,
    bindingId: string,
    includeMuteSibling?: boolean,
  ): boolean {
    if (
      event.type === "binding-offline" ||
      event.type === "binding-online"
    ) {
      return event.bindingId === bindingId;
    }
    if (event.type !== "state-changed") {
      return false;
    }
    if (event.resolved.binding.id === bindingId) {
      return true;
    }
    if (!includeMuteSibling || event.resolved.capability.type !== "Mute") {
      return false;
    }
    return (
      event.resolved.endpoint.id ===
      core.resolveBinding(bindingId)?.endpoint.id
    );
  }
}
