import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { getCapabilityCore, RECORD_BINDING_ID } from "../core-host.js";

type RecordSettings = {
  bindingId?: string;
};

/**
 * Key action: start/stop recording on a Recording binding (official MIDI Tier B).
 */
@action({ UUID: "com.felixgeelhaar.rode-control.record-toggle" })
export class RecordToggleKeyAction extends SingletonAction<RecordSettings> {
  private readonly feedbackUnsubscribers = new Map<string, () => void>();

  override async onWillAppear(
    ev: WillAppearEvent<RecordSettings>,
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? RECORD_BINDING_ID;
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
    ev: WillDisappearEvent<RecordSettings>,
  ): Promise<void> {
    this.feedbackUnsubscribers.get(ev.action.id)?.();
    this.feedbackUnsubscribers.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent<RecordSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? RECORD_BINDING_ID;
    const resolved = core.resolveBinding(bindingId);
    const recording = resolved?.state.value === true;
    const result = await core.execute(
      recording
        ? { type: "StopRecording", bindingId }
        : { type: "StartRecording", bindingId },
    );
    if (!result.ok) {
      await ev.action.setTitle(result.error ?? "ERR");
      return;
    }
    await this.render(ev.action, bindingId);
  }

  private async render(
    actionRef: WillAppearEvent<RecordSettings>["action"],
    bindingId: string,
  ): Promise<void> {
    const core = await getCapabilityCore();
    const surface = core.getControlSurface(bindingId);
    if (surface.availability === "offline") {
      await actionRef.setTitle("OFFLINE");
      return;
    }
    const recording = surface.valueText.toUpperCase() === "ON";
    await actionRef.setTitle(recording ? "REC ●" : "REC");
  }
}
