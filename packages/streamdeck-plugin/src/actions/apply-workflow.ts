import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { getCapabilityCore } from "../core-host.js";

type WorkflowSettings = {
  /** Registered workflow id (default: streaming) */
  workflowId?: string;
};

const DEFAULT_WORKFLOW_ID = "streaming";

/**
 * Key action: apply a product workflow preset (Streaming / Podcast / …).
 */
@action({ UUID: "com.felixgeelhaar.rode-control.apply-workflow" })
export class ApplyWorkflowKeyAction extends SingletonAction<WorkflowSettings> {
  private readonly feedbackUnsubscribers = new Map<string, () => void>();

  override async onWillAppear(
    ev: WillAppearEvent<WorkflowSettings>,
  ): Promise<void> {
    const workflowId = ev.payload.settings.workflowId ?? DEFAULT_WORKFLOW_ID;
    this.feedbackUnsubscribers.get(ev.action.id)?.();

    const core = await getCapabilityCore();
    const unsubscribe = core.subscribe((event) => {
      if (
        event.type === "workflow-applied" &&
        event.workflowId === workflowId
      ) {
        void this.render(ev.action, workflowId, event.ok ? "OK" : "ERR");
      }
    });
    this.feedbackUnsubscribers.set(ev.action.id, unsubscribe);
    await this.render(ev.action, workflowId);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<WorkflowSettings>,
  ): Promise<void> {
    this.feedbackUnsubscribers.get(ev.action.id)?.();
    this.feedbackUnsubscribers.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent<WorkflowSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const workflowId = ev.payload.settings.workflowId ?? DEFAULT_WORKFLOW_ID;
    const result = await core.execute({
      type: "ApplyWorkflow",
      workflowId,
    });
    await this.render(
      ev.action,
      workflowId,
      result.ok ? "OK" : result.error ?? "ERR",
    );
  }

  private async render(
    actionRef: WillAppearEvent<WorkflowSettings>["action"],
    workflowId: string,
    flash?: string,
  ): Promise<void> {
    const core = await getCapabilityCore();
    const workflow = core.getWorkflow(workflowId);
    const title = flash ?? workflow?.label ?? workflowId.toUpperCase();
    await actionRef.setTitle(title);
  }
}
