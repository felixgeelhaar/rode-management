import {
  action,
  DialDownEvent,
  DialRotateEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  CHAT_LEVEL_BINDING_ID,
  GAME_LEVEL_BINDING_ID,
  getCapabilityCore,
  HEADPHONES_LEVEL_BINDING_ID,
  MUSIC_LEVEL_BINDING_ID,
} from "../core-host.js";

type LevelSettings = {
  bindingId?: string;
  /** dB (or %) change per dial tick */
  sensitivity?: number;
};

/**
 * Generic Stream Deck+ level dial for mix sources (Game / Chat / Music / …).
 *
 * Rotate → AdjustLevel
 * Press  → ToggleMute (same-endpoint retarget when Mute exists)
 * Display → live level / OFFLINE / N/A
 */
@action({ UUID: "com.felixgeelhaar.rode-control.channel-level" })
export class ChannelLevelDialAction extends SingletonAction<LevelSettings> {
  private readonly feedbackUnsubscribers = new Map<string, () => void>();

  override async onWillAppear(ev: WillAppearEvent<LevelSettings>): Promise<void> {
    const bindingId = this.resolveBindingId(ev.payload.settings);
    this.feedbackUnsubscribers.get(ev.action.id)?.();

    const core = await getCapabilityCore();
    const unsubscribe = core.subscribe((event) => {
      if (
        (event.type === "state-changed" &&
          (event.resolved.binding.id === bindingId ||
            (event.resolved.capability.type === "Mute" &&
              event.resolved.endpoint.id ===
                core.resolveBinding(bindingId)?.endpoint.id))) ||
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
    ev: WillDisappearEvent<LevelSettings>,
  ): Promise<void> {
    this.feedbackUnsubscribers.get(ev.action.id)?.();
    this.feedbackUnsubscribers.delete(ev.action.id);
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
    if (!actionRef.isDial()) {
      return;
    }
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
    await actionRef.setFeedback({
      title: surface.label,
      value,
    });
  }
}

/** Convenience defaults for property inspector wiring. */
export const DEFAULT_MIX_BINDING_IDS = {
  game: GAME_LEVEL_BINDING_ID,
  chat: CHAT_LEVEL_BINDING_ID,
  music: MUSIC_LEVEL_BINDING_ID,
  headphones: HEADPHONES_LEVEL_BINDING_ID,
} as const;
