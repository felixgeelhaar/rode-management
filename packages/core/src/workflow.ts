import type { LogicalBinding } from "./types.js";

/** One absolute value to apply to a logical binding. */
export interface WorkflowStep {
  bindingId: string;
  value: number | boolean | string;
}

/**
 * Product-level workflow preset spanning multiple bindings
 * (Streaming / Podcast / …) — not a device DSP preset.
 */
export interface WorkflowProfile {
  version: 1;
  id: string;
  label: string;
  description?: string;
  steps: WorkflowStep[];
}

export function createWorkflowProfile(
  id: string,
  label: string,
  steps: WorkflowStep[],
  description?: string,
): WorkflowProfile {
  const profile: WorkflowProfile = {
    version: 1,
    id,
    label,
    steps: steps.map((step) => ({ ...step })),
  };
  if (description !== undefined) {
    profile.description = description;
  }
  return profile;
}

export function serializeWorkflowProfile(profile: WorkflowProfile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

/** Bundle multiple workflows for disk persistence / sharing. */
export function serializeWorkflowBundle(workflows: WorkflowProfile[]): string {
  return `${JSON.stringify(
    {
      version: 1,
      workflows: workflows.map((workflow) => ({
        version: workflow.version,
        id: workflow.id,
        label: workflow.label,
        ...(workflow.description !== undefined
          ? { description: workflow.description }
          : {}),
        steps: workflow.steps.map((step) => ({ ...step })),
      })),
    },
    null,
    2,
  )}\n`;
}

export function parseWorkflowProfile(json: string): WorkflowProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `Invalid workflow JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return normalizeWorkflowProfile(raw);
}

/**
 * Parse one workflow object, an array of workflows, or `{ workflows: [...] }`.
 */
export function parseWorkflowProfiles(json: string): WorkflowProfile[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `Invalid workflow JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (Array.isArray(raw)) {
    return raw.map((item, index) => {
      try {
        return normalizeWorkflowProfile(item);
      } catch (err) {
        throw new Error(
          `workflows[${index}]: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  if (raw && typeof raw === "object" && "workflows" in raw) {
    const bundle = raw as { workflows?: unknown };
    if (!Array.isArray(bundle.workflows)) {
      throw new Error("workflows must be an array");
    }
    return bundle.workflows.map((item, index) => {
      try {
        return normalizeWorkflowProfile(item);
      } catch (err) {
        throw new Error(
          `workflows[${index}]: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  return [normalizeWorkflowProfile(raw)];
}

function normalizeWorkflowProfile(raw: unknown): WorkflowProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Workflow profile must be an object");
  }
  const candidate = raw as Partial<WorkflowProfile>;
  if (candidate.version !== 1) {
    throw new Error(
      `Unsupported workflow version: ${String(candidate.version)}`,
    );
  }
  if (typeof candidate.id !== "string" || !candidate.id) {
    throw new Error("Workflow id is required");
  }
  if (typeof candidate.label !== "string" || !candidate.label) {
    throw new Error("Workflow label is required");
  }
  if (!Array.isArray(candidate.steps)) {
    throw new Error("Workflow steps must be an array");
  }

  const steps: WorkflowStep[] = candidate.steps.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`steps[${index}] must be an object`);
    }
    const step = item as Partial<WorkflowStep>;
    if (typeof step.bindingId !== "string" || !step.bindingId) {
      throw new Error(`steps[${index}].bindingId is required`);
    }
    if (
      typeof step.value !== "number" &&
      typeof step.value !== "boolean" &&
      typeof step.value !== "string"
    ) {
      throw new Error(`steps[${index}].value must be number|boolean|string`);
    }
    return { bindingId: step.bindingId, value: step.value };
  });

  return createWorkflowProfile(
    candidate.id,
    candidate.label,
    steps,
    typeof candidate.description === "string"
      ? candidate.description
      : undefined,
  );
}

/** Capture absolute values for the given bindings from live surface state. */
export function captureWorkflowFromBindings(
  id: string,
  label: string,
  bindings: LogicalBinding[],
  readValue: (bindingId: string) => number | boolean | string | null | undefined,
  description?: string,
): WorkflowProfile {
  const steps: WorkflowStep[] = [];
  for (const binding of bindings) {
    const value = readValue(binding.id);
    if (value === null || value === undefined) {
      continue;
    }
    steps.push({ bindingId: binding.id, value });
  }
  return createWorkflowProfile(id, label, steps, description);
}
