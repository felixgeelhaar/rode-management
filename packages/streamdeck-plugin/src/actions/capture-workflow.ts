import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { getCapabilityCore } from "../core-host.js";

type CaptureSettings = {
  /** Workflow id to write (default: custom) */
  workflowId?: string;
};

const DEFAULT_WORKFLOW_ID = "custom";

/**
 * Key action: snapshot the live surface into a workflow preset.
 */
@action({ UUID: "com.felixgeelhaar.rode-control.capture-workflow" })
export class CaptureWorkflowKeyAction extends SingletonAction<CaptureSettings> {
  private readonly feedbackUnsubscribers = new Map<string, () => void>();
  private readonly workflowByAction = new Map<string, string>();

  override async onWillAppear(
    ev: WillAppearEvent<CaptureSettings>,
  ): Promise<void> {
    const workflowId = ev.payload.settings.workflowId ?? DEFAULT_WORKFLOW_ID;
    await this.attach(ev.action, workflowId);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<CaptureSettings>,
  ): Promise<void> {
    const workflowId = ev.payload.settings.workflowId ?? DEFAULT_WORKFLOW_ID;
    await this.attach(ev.action, workflowId);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<CaptureSettings>,
  ): Promise<void> {
    this.detach(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent<CaptureSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const workflowId = ev.payload.settings.workflowId ?? DEFAULT_WORKFLOW_ID;
    const existing = core.getWorkflow(workflowId);
    const label = existing?.label ?? titleCase(workflowId);
    const workflow = core.captureWorkflow(
      workflowId,
      label,
      existing?.description,
    );
    await this.render(
      ev.action,
      workflowId,
      `OK ${workflow.steps.length}`,
    );
  }

  private async attach(
    actionRef: WillAppearEvent<CaptureSettings>["action"],
    workflowId: string,
  ): Promise<void> {
    this.detach(actionRef.id);
    this.workflowByAction.set(actionRef.id, workflowId);

    const core = await getCapabilityCore();
    const unsubscribe = core.subscribe((event) => {
      const tracked = this.workflowByAction.get(actionRef.id);
      if (
        tracked &&
        event.type === "workflow-changed" &&
        event.workflowId === tracked
      ) {
        void this.render(actionRef, tracked, "SAVED");
      }
    });
    this.feedbackUnsubscribers.set(actionRef.id, unsubscribe);
    await this.render(actionRef, workflowId);
  }

  private detach(actionId: string): void {
    this.feedbackUnsubscribers.get(actionId)?.();
    this.feedbackUnsubscribers.delete(actionId);
    this.workflowByAction.delete(actionId);
  }

  private async render(
    actionRef: WillAppearEvent<CaptureSettings>["action"],
    workflowId: string,
    flash?: string,
  ): Promise<void> {
    const core = await getCapabilityCore();
    const workflow = core.getWorkflow(workflowId);
    const title =
      flash ??
      (workflow ? `CAP ${workflow.label}` : `CAP ${workflowId.toUpperCase()}`);
    await actionRef.setTitle(title);
  }
}

function titleCase(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
