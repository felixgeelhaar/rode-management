#!/usr/bin/env node
/**
 * Second client surface: control the same capability core from a terminal.
 *
 * Examples:
 *   npm run cli -- status
 *   npm run cli -- surface my-mic-gain
 *   RODE_CONTROL_ADAPTER=rodecaster npm run cli -- exec AdjustLevel game-level --delta 2
 *   npm run cli -- export ./layout.json
 *   npm run cli -- import ./layout.json --replace
 */

import { writeFile } from "node:fs/promises";
import type { ControlCommand } from "@rode-control/core";
import {
  createCapabilityCore,
  type AdapterMode,
} from "@rode-control/host";

function usage(): never {
  console.log(`Usage:
  rode-control status
  rode-control devices
  rode-control surface [bindingId]
  rode-control exec <CommandType> <bindingId> [--delta N] [--value V]
  rode-control export [path]
  rode-control import <path> [--replace]

Env:
  RODE_CONTROL_ADAPTER=sim|rodecaster|rodecaster-midi|topology|none
  RODE_CONTROL_BINDINGS_PATH=./layout.json
`);
  process.exit(1);
}

function flagValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (!command) usage();

  const mode = (process.env.RODE_CONTROL_ADAPTER ?? "sim") as AdapterMode;
  const core = await createCapabilityCore({ mode });

  try {
    switch (command) {
      case "status": {
        console.log({
          adapter: mode,
          devices: core.listDevices().map((d) => ({
            id: d.id,
            model: d.model,
            family: d.family,
            status: d.status,
          })),
          bindings: core.listBindings().length,
        });
        break;
      }
      case "devices": {
        for (const device of core.listDevices()) {
          console.log(`${device.model} [${device.family}] ${device.status}`);
          for (const endpoint of device.endpoints) {
            const caps = endpoint.capabilities.map((c) => c.type).join(", ");
            console.log(
              `  ${endpoint.label} (${endpoint.kind}) source=${endpoint.source ?? "—"} → ${caps}`,
            );
          }
        }
        break;
      }
      case "surface": {
        const ids = argv[1]
          ? [argv[1]]
          : core.listBindings().map((b) => b.id);
        for (const id of ids) {
          console.log(id, core.getControlSurface(id));
        }
        break;
      }
      case "exec": {
        const type = argv[1];
        const bindingId = argv[2];
        if (!type || !bindingId) usage();
        const delta = flagValue(argv, "--delta");
        const value = flagValue(argv, "--value");
        const payload = buildCommand(type, bindingId, delta, value);
        const result = await core.execute(payload);
        console.log(result);
        if (result.ok) {
          console.log("surface", core.getControlSurface(bindingId));
        }
        process.exitCode = result.ok ? 0 : 1;
        break;
      }
      case "export": {
        const path = argv[1] ?? "rode-bindings.json";
        const json = core.exportProfileJson(mode);
        await writeFile(path, json, "utf8");
        console.log(`Wrote ${path} (${core.listBindings().length} bindings)`);
        break;
      }
      case "import": {
        const path = argv[1];
        if (!path) usage();
        const replace = hasFlag(argv, "--replace");
        const imported = await createCapabilityCore({
          mode,
          bindingsPath: path,
          bindingsReplace: replace,
        });
        console.log(
          `Loaded profile into fresh core (${imported.listBindings().length} bindings)`,
        );
        for (const binding of imported.listBindings()) {
          console.log(
            " ",
            binding.id,
            imported.getControlSurface(binding.id),
          );
        }
        await imported.stop();
        break;
      }
      default:
        usage();
    }
  } finally {
    await core.stop();
  }
}

function buildCommand(
  type: string,
  bindingId: string,
  delta: string | undefined,
  value: string | undefined,
): ControlCommand {
  switch (type) {
    case "AdjustGain":
    case "AdjustLevel":
      return {
        type,
        bindingId,
        delta: Number(delta ?? "1"),
      };
    case "SetGain":
    case "SetLevel":
      return {
        type,
        bindingId,
        value: Number(value ?? "0"),
      };
    case "SetMute":
      return {
        type,
        bindingId,
        value: value === "true" || value === "1",
      };
    case "ToggleMute":
    case "ToggleListen":
    case "TriggerPad":
    case "StartRecording":
    case "StopRecording":
      return { type, bindingId };
    case "ToggleProcessing":
      return {
        type,
        bindingId,
        capabilityType:
          value === "Compression" ? "Compression" : "HighPassFilter",
      };
    case "SetProcessing":
      return {
        type,
        bindingId,
        capabilityType: "HighPassFilter",
        value: value === "true" || value === "1",
      };
    default:
      throw new Error(`Unsupported command type: ${type}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
