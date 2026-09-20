import type { LogicalBinding, Topology } from "./types.js";

/** Versioned snapshot of logical bindings (+ optional topology) for persistence/share. */
export interface BindingProfile {
  version: 1;
  exportedAt: string;
  /** Optional hint for which host mode produced this profile. */
  adapterHint?: string;
  topology?: Topology;
  bindings: LogicalBinding[];
}

export function createBindingProfile(
  bindings: LogicalBinding[],
  options: {
    topology?: Topology;
    adapterHint?: string;
    now?: () => Date;
  } = {},
): BindingProfile {
  const profile: BindingProfile = {
    version: 1,
    exportedAt: (options.now ?? (() => new Date()))().toISOString(),
    bindings: bindings.map((binding) => ({ ...binding })),
  };
  if (options.adapterHint !== undefined) {
    profile.adapterHint = options.adapterHint;
  }
  if (options.topology) {
    profile.topology = {
      edges: options.topology.edges.map((edge) => ({ ...edge })),
    };
  }
  return profile;
}

export function serializeBindingProfile(profile: BindingProfile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

export function parseBindingProfile(json: string): BindingProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `Invalid binding profile JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("Binding profile must be an object");
  }

  const candidate = raw as Partial<BindingProfile>;
  if (candidate.version !== 1) {
    throw new Error(
      `Unsupported binding profile version: ${String(candidate.version)}`,
    );
  }
  if (!Array.isArray(candidate.bindings)) {
    throw new Error("Binding profile must include a bindings array");
  }

  const bindings: LogicalBinding[] = candidate.bindings.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`bindings[${index}] must be an object`);
    }
    const binding = item as Partial<LogicalBinding>;
    if (typeof binding.id !== "string" || !binding.id) {
      throw new Error(`bindings[${index}].id must be a non-empty string`);
    }
    if (typeof binding.label !== "string" || !binding.label) {
      throw new Error(`bindings[${index}].label must be a non-empty string`);
    }
    if (typeof binding.capabilityType !== "string" || !binding.capabilityType) {
      throw new Error(
        `bindings[${index}].capabilityType must be a non-empty string`,
      );
    }
    const next: LogicalBinding = {
      id: binding.id,
      label: binding.label,
      capabilityType: binding.capabilityType,
    };
    if (typeof binding.endpointId === "string") {
      next.endpointId = binding.endpointId;
    }
    if (typeof binding.deviceId === "string") {
      next.deviceId = binding.deviceId;
    }
    if (typeof binding.sourceHint === "string") {
      next.sourceHint = binding.sourceHint;
    }
    return next;
  });

  const profile: BindingProfile = {
    version: 1,
    exportedAt:
      typeof candidate.exportedAt === "string"
        ? candidate.exportedAt
        : new Date(0).toISOString(),
    bindings,
  };

  if (typeof candidate.adapterHint === "string") {
    profile.adapterHint = candidate.adapterHint;
  }

  if (candidate.topology && typeof candidate.topology === "object") {
    const edges = Array.isArray(candidate.topology.edges)
      ? candidate.topology.edges
      : [];
    profile.topology = {
      edges: edges
        .filter(
          (edge) =>
            edge &&
            typeof edge === "object" &&
            typeof (edge as { from?: unknown }).from === "string" &&
            typeof (edge as { to?: unknown }).to === "string" &&
            typeof (edge as { relation?: unknown }).relation === "string",
        )
        .map((edge) => {
          const e = edge as {
            from: string;
            to: string;
            relation: Topology["edges"][number]["relation"];
          };
          return { from: e.from, to: e.to, relation: e.relation };
        }),
    };
  }

  return profile;
}
