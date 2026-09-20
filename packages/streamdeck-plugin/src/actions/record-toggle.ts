import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { BindingFeedbackSession } from "../binding-feedback.js";
import { getCapabilityCore, RECORD_BINDING_ID } from "../core-host.js";

type RecordSettings = {
  bindingId?: string;
};

/**
 * Key action: start/stop recording on a Recording binding (official MIDI Tier B).
 */
@action({ UUID: "com.felixgeelhaar.rode-control.record-toggle" })
export class RecordToggleKeyAction extends SingletonAction<RecordSettings> {
  private readonly feedback = new BindingFeedbackSession();

  override async onWillAppear(
    ev: WillAppearEvent<RecordSettings>,
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? RECORD_BINDING_ID;
    await this.feedback.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<RecordSettings>,
  ): Promise<void> {
    await this.feedback.onDidReceiveSettings(ev, {
      defaultBindingId: RECORD_BINDING_ID,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<RecordSettings>,
  ): Promise<void> {
    this.feedback.onWillDisappear(ev);
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
    if (surface.availability === "unsupported") {
      await actionRef.setTitle("N/A");
      return;
    }
    const recording = surface.valueText.toUpperCase() === "ON";
    await actionRef.setTitle(recording ? "REC ●" : "REC");
  }
}
