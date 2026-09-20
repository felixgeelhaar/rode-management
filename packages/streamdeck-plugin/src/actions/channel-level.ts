import {
  action,
  DialDownEvent,
  DialRotateEvent,
  DidReceiveSettingsEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { BindingFeedbackSession } from "../binding-feedback.js";
import {
  CHAT_LEVEL_BINDING_ID,
  GAME_LEVEL_BINDING_ID,
  getCapabilityCore,
  HEADPHONES_LEVEL_BINDING_ID,
  MUSIC_LEVEL_BINDING_ID,
} from "../core-host.js";

type LevelSettings = {
  bindingId?: string;
  sensitivity?: number;
};

@action({ UUID: "com.felixgeelhaar.rode-control.channel-level" })
export class ChannelLevelDialAction extends SingletonAction<LevelSettings> {
  private readonly feedback = new BindingFeedbackSession();

  override async onWillAppear(ev: WillAppearEvent<LevelSettings>): Promise<void> {
    const bindingId = this.resolveBindingId(ev.payload.settings);
    await this.feedback.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      includeMuteSibling: true,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<LevelSettings>,
  ): Promise<void> {
    const bindingId = this.resolveBindingId(ev.payload.settings);
    await this.feedback.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      includeMuteSibling: true,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<LevelSettings>,
  ): Promise<void> {
    this.feedback.onWillDisappear(ev);
  }

  override async onDialRotate(ev: DialRotateEvent<LevelSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = this.resolveBindingId(ev.payload.settings);
    const sensitivity = ev.payload.settings.sensitivity ?? 1;

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
          title: "LVL",
          value: result.error ?? "ERR",
        });
      }
      return;
    }

    await this.render(ev.action, bindingId);
  }

  override async onDialDown(ev: DialDownEvent<LevelSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = this.resolveBindingId(ev.payload.settings);
    const result = await core.execute({ type: "ToggleMute", bindingId });
    if (!result.ok && ev.action.isDial()) {
      await ev.action.setFeedback({
        title: "LVL",
        value: result.error ?? "ERR",
      });
      return;
    }
    await this.render(ev.action, bindingId);
  }

  private resolveBindingId(settings: LevelSettings): string {
    return settings.bindingId ?? GAME_LEVEL_BINDING_ID;
  }

  private async render(
    actionRef: WillAppearEvent<LevelSettings>["action"],
    bindingId: string,
  ): Promise<void> {
    if (!actionRef.isDial()) return;
    const core = await getCapabilityCore();
    const surface = core.getControlSurface(bindingId);
    const muted = core.getSiblingState(bindingId, "Mute")?.value === true;
    let value = surface.valueText;
    if (surface.availability === "offline") {
      value = "OFFLINE";
    } else if (surface.availability === "unsupported") {
      value = "N/A";
    } else if (muted) {
      value = `MUTE ${surface.valueText}`;
    }
    await actionRef.setFeedback({ title: surface.label, value });
  }
}

export const DEFAULT_MIX_BINDING_IDS = {
  game: GAME_LEVEL_BINDING_ID,
  chat: CHAT_LEVEL_BINDING_ID,
  music: MUSIC_LEVEL_BINDING_ID,
  headphones: HEADPHONES_LEVEL_BINDING_ID,
} as const;
