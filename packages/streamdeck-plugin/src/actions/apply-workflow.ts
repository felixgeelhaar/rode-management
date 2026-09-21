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
import { getCapabilityCore } from "../core-host.js";
import {
  handlePropertyInspectorDidAppear,
  handleSendToPlugin,
} from "../pi-bridge.js";

type WorkflowSettings = {
  workflowId?: string;
};

const DEFAULT_WORKFLOW_ID = "streaming";

@action({ UUID: ACTION_UUIDS.applyWorkflow })
export class ApplyWorkflowKeyAction extends SingletonAction<WorkflowSettings> {
  private readonly feedbackUnsubscribers = new Map<string, () => void>();
  private readonly workflowByAction = new Map<string, string>();

  override async onWillAppear(
    ev: WillAppearEvent<WorkflowSettings>,
  ): Promise<void> {
    const workflowId = ev.payload.settings.workflowId ?? DEFAULT_WORKFLOW_ID;
    await this.attach(ev.action, workflowId);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<WorkflowSettings>,
  ): Promise<void> {
    const workflowId = ev.payload.settings.workflowId ?? DEFAULT_WORKFLOW_ID;
    await this.attach(ev.action, workflowId);
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent<WorkflowSettings>,
  ): Promise<void> {
    await handlePropertyInspectorDidAppear(ev, ACTION_UUIDS.applyWorkflow);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, JsonObject>): Promise<void> {
    await handleSendToPlugin(ev.payload, ACTION_UUIDS.applyWorkflow);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<WorkflowSettings>,
  ): Promise<void> {
    this.detach(ev.action.id);
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

  private async attach(
    actionRef: WillAppearEvent<WorkflowSettings>["action"],
    workflowId: string,
  ): Promise<void> {
    this.detach(actionRef.id);
    this.workflowByAction.set(actionRef.id, workflowId);

    const core = await getCapabilityCore();
    const unsubscribe = core.subscribe((event) => {
      const tracked = this.workflowByAction.get(actionRef.id);
      if (
        tracked &&
        event.type === "workflow-applied" &&
        event.workflowId === tracked
      ) {
        void this.render(actionRef, tracked, event.ok ? "OK" : "ERR");
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
