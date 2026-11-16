import streamDeck from "@elgato/streamdeck";
import type { PropertyInspectorDidAppearEvent } from "@elgato/streamdeck";
import type { CapabilityCore } from "@rode-control/core";
import { getCapabilityCore } from "./core-host.js";

export type PiCatalogMessage = {
  type: "catalog";
  actionUUID: string;
  bindings: Array<{
    id: string;
    label: string;
    capabilityType: string;
    surface: {
      label: string;
      valueText: string;
      availability: string;
    };
  }>;
  workflows: Array<{
    id: string;
    label: string;
    steps: number;
    description?: string;
  }>;
  adapterHint: string;
};

export type PiRequestMessage = {
  type: "request-catalog";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPiRequest(payload: unknown): payload is PiRequestMessage {
  return isRecord(payload) && payload.type === "request-catalog";
}

export async function buildCatalog(
  core: CapabilityCore,
  actionUUID: string,
): Promise<PiCatalogMessage> {
  const bindings = core.listBindings().map((binding) => ({
    id: binding.id,
    label: binding.label,
    capabilityType: binding.capabilityType,
    surface: core.getControlSurface(binding.id),
  }));

  const workflows = core.listWorkflows().map((workflow) => {
    const entry: PiCatalogMessage["workflows"][number] = {
      id: workflow.id,
      label: workflow.label,
      steps: workflow.steps.length,
    };
    if (workflow.description !== undefined) {
      entry.description = workflow.description;
    }
    return entry;
  });

  return {
    type: "catalog",
    actionUUID,
    bindings,
    workflows,
    adapterHint: process.env.RODE_CONTROL_ADAPTER ?? "sim",
  };
}

export async function pushCatalogToPropertyInspector(
  actionUUID: string,
): Promise<void> {
  const core = await getCapabilityCore();
  await streamDeck.ui.sendToPropertyInspector(
    await buildCatalog(core, actionUUID),
  );
}

/** Shared PI lifecycle for actions that expose binding/workflow settings. */
export async function handlePropertyInspectorDidAppear(
  _ev: PropertyInspectorDidAppearEvent,
  actionUUID: string,
): Promise<void> {
  await pushCatalogToPropertyInspector(actionUUID);
}

export async function handleSendToPlugin(
  payload: unknown,
  actionUUID: string,
): Promise<void> {
  if (!isPiRequest(payload)) return;
  await pushCatalogToPropertyInspector(actionUUID);
}
