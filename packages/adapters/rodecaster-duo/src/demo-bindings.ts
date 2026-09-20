/**
 * Demo: export / import a versioned binding profile (persistence seam).
 */

import {
  CapabilityCore,
  createBinding,
  createMicGainBinding,
  serializeBindingProfile,
} from "@rode-control/core";
import { RodecasterDuoSimAdapter } from "./sim-adapter.js";

async function main(): Promise<void> {
  const core = new CapabilityCore();
  core.registerAdapter(new RodecasterDuoSimAdapter());
  await core.start();

  core.upsertBinding(
    createMicGainBinding({ label: "MIC", sourceHint: "PodMic" }),
  );
  core.upsertBinding(
    createBinding("headphones-level", "HP", "Level", {
      sourceHint: "Headphones",
    }),
  );

  const json = core.exportProfileJson("rodecaster");
  console.log("Exported profile:");
  console.log(json);

  const restored = new CapabilityCore();
  restored.registerAdapter(new RodecasterDuoSimAdapter());
  await restored.start();
  restored.importProfile(json, { replace: true });

  console.log("Restored bindings:");
  for (const binding of restored.listBindings()) {
    console.log(
      `  ${binding.id}: ${binding.label} / ${binding.capabilityType}`,
      restored.getControlSurface(binding.id),
    );
  }

  // Prove serialize helper stays stable for file IO consumers.
  console.log(
    "Re-serialize length:",
    serializeBindingProfile(restored.exportProfile()).length,
  );

  await core.stop();
  await restored.stop();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
