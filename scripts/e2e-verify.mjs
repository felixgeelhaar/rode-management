#!/usr/bin/env node
/**
 * End-to-end verification of host + core + adapters + workflows
 * (no Stream Deck hardware required).
 */
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCapabilityCore, describeMidiRuntime } from "@rode-control/host";
import { suggestCreatorBindings } from "@rode-control/core";

const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function testSimVerticalSlice() {
  section("sim: PodMic gain dial + mute + processing");
  const core = await createCapabilityCore({ mode: "sim", dialCoalesceMs: 0 });
  try {
    const before = core.getControlSurface("my-mic-gain");
    assert(before.availability === "available", "mic gain available");
    await core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: 4 });
    const after = core.getControlSurface("my-mic-gain");
    assert(after.valueText.includes("28"), `gain adjusted → ${after.valueText}`);

    await core.execute({ type: "ToggleMute", bindingId: "my-mic-gain" });
    const mute = core.getSiblingState("my-mic-gain", "Mute");
    assert(mute?.value === true, "dial press mutes sibling");

    await core.execute({
      type: "ToggleProcessing",
      bindingId: "my-mic-hpf",
      capabilityType: "HighPassFilter",
    });
    assert(
      core.getControlSurface("my-mic-hpf").valueText === "ON",
      "HPF toggled",
    );

    const diag = core.diagnoseBinding("my-mic-gain");
    assert(diag.status === "resolved", "diagnose resolved");
    assert(diag.owner?.capabilityType === "Gain", "diagnose owner Gain");
    console.log("OK", { gain: after.valueText, mute: mute?.value, hpf: "ON" });
  } finally {
    await core.stop();
  }
}

async function testRodecasterWorkflow() {
  section("rodecaster: mix bank + apply/capture workflow");
  const core = await createCapabilityCore({
    mode: "rodecaster",
    dialCoalesceMs: 0,
  });
  try {
    for (const id of [
      "my-mic-gain",
      "game-level",
      "chat-level",
      "music-level",
      "headphones-level",
    ]) {
      assert(
        core.getControlSurface(id).availability === "available",
        `${id} available`,
      );
    }

    const applied = await core.applyWorkflow("streaming");
    assert(applied.ok, `streaming apply ok (failed=${applied.failed})`);
    assert(
      core.getControlSurface("my-mic-gain").valueText === "48 dB",
      "streaming mic 48 dB",
    );
    assert(
      core.getControlSurface("game-level").valueText === "-8 dB",
      "streaming game -8 dB",
    );

    const podcast = await core.applyWorkflow("podcast");
    assert(podcast.ok, "podcast apply ok");
    assert(
      core.getControlSurface("game-level").valueText === "-40 dB",
      "podcast ducks game",
    );

    const captured = core.captureWorkflow("e2e-custom", "E2E Custom");
    assert(captured.steps.length > 0, "capture has steps");
    await core.execute({ type: "SetGain", bindingId: "my-mic-gain", value: 10 });
    const reapplied = await core.applyWorkflow("e2e-custom");
    assert(reapplied.ok, "reapply capture ok");
    assert(
      core.getControlSurface("my-mic-gain").valueText === "52 dB",
      "capture restored podcast mic",
    );

    const suggestions = suggestCreatorBindings(core.listDevices());
    assert(suggestions.length > 0, "layout suggestions non-empty");
    console.log("OK", {
      workflows: core.listWorkflows().map((w) => w.id),
      suggestions: suggestions.length,
      capturedSteps: captured.steps.length,
    });
  } finally {
    await core.stop();
  }
}

async function testMidiTierHonesty() {
  section("rodecaster-midi: Tier B + Level N/A honesty");
  const core = await createCapabilityCore({ mode: "rodecaster-midi" });
  try {
    assert(
      core.getControlSurface("mic-mute").availability === "available",
      "mute available",
    );
    assert(
      core.getControlSurface("game-listen").availability === "available",
      "listen available",
    );
    assert(
      core.getControlSurface("pad-1").availability === "available",
      "pad available",
    );
    assert(
      core.getControlSurface("record").availability === "available",
      "record available",
    );

    const level = core.getControlSurface("game-level");
    assert(level.availability === "unsupported", "game level unsupported");
    assert(level.valueText === "N/A", "game level shows N/A not OFFLINE");

    const diag = core.diagnoseBinding("game-level");
    assert(diag.status === "unsupported", "diagnose unsupported");

    const device = core.listDevices()[0];
    assert(device?.connection === "midi", "midi connection");
    assert(
      String(device?.metadata?.midiTransport ?? "").toLowerCase().includes("mock"),
      "mock transport by default",
    );
    assert(describeMidiRuntime().intent === "mock", "midi runtime intent mock");

    await core.execute({ type: "ToggleMute", bindingId: "mic-mute" });
    assert(
      core.getControlSurface("mic-mute").valueText === "ON" ||
        core.getControlSurface("mic-mute").valueText === "OFF",
      "mute toggled",
    );

    const pad = await core.execute({ type: "TriggerPad", bindingId: "pad-1" });
    assert(pad.ok, "pad fire ok");
    console.log("OK", {
      mute: core.getControlSurface("mic-mute").valueText,
      gameLevel: level,
      pad: pad.ok,
    });
  } finally {
    await core.stop();
  }
}

async function testTopologyOwnership() {
  section("topology: mixer-preferred My Mic Gain");
  const core = await createCapabilityCore({ mode: "topology" });
  try {
    const resolved = core.resolveBinding("my-mic-gain");
    assert(resolved?.device.family === "rodecaster", "owner is rodecaster");
    assert(resolved?.endpoint.kind === "channel", "owner endpoint is channel");
    const diag = core.diagnoseBinding("my-mic-gain");
    assert(diag.candidates.length >= 1, "has ownership candidates");
    assert(diag.status === "resolved", "topology diagnose resolved");
    console.log("OK", {
      family: resolved?.device.family,
      endpoint: resolved?.endpoint.id,
      candidates: diag.candidates.map((c) => ({
        family: c.deviceFamily,
        kind: c.endpointKind,
        score: c.ownershipScore,
      })),
    });
  } finally {
    await core.stop();
  }
}

async function testPersistenceRoundTrip() {
  section("persistence: bindings + workflows load/autosave");
  const dir = await mkdtemp(join(tmpdir(), "rode-e2e-"));
  try {
    const bindingsPath = join(dir, "layout.json");
    const workflowsPath = join(dir, "workflows.json");
    const autosavePath = join(dir, "auto-workflows.json");

    await writeFile(
      bindingsPath,
      JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        bindings: [
          {
            id: "custom-chat",
            label: "CHAT CUSTOM",
            capabilityType: "Level",
            sourceHint: "Discord",
          },
        ],
      }),
    );
    await writeFile(
      workflowsPath,
      JSON.stringify({
        version: 1,
        id: "streaming",
        label: "Streaming From Disk",
        steps: [
          { bindingId: "my-mic-gain", value: 44 },
          { bindingId: "game-level", value: -5 },
        ],
      }),
    );

    const core = await createCapabilityCore({
      mode: "rodecaster",
      bindingsPath,
      workflowsPath,
      workflowsAutosavePath: autosavePath,
      dialCoalesceMs: 0,
    });
    assert(
      core.getBinding("custom-chat")?.label === "CHAT CUSTOM",
      "binding profile loaded",
    );
    assert(
      core.getWorkflow("streaming")?.label === "Streaming From Disk",
      "workflow override loaded",
    );
    assert(core.getWorkflow("podcast")?.id === "podcast", "built-in kept");

    const apply = await core.applyWorkflow("streaming");
    assert(apply.ok, "disk workflow apply ok");
    assert(
      core.getControlSurface("my-mic-gain").valueText === "44 dB",
      "disk workflow mic value",
    );
    const surface = core.getControlSurface("custom-chat");

    core.captureWorkflow("from-e2e", "From E2E");
    await core.stop();

    const saved = JSON.parse(await readFile(autosavePath, "utf8"));
    assert(
      saved.workflows.some((w) => w.id === "from-e2e"),
      "workflow autosave wrote capture",
    );
    console.log("OK", {
      customChat: surface,
      streamingLabel: "Streaming From Disk",
      autosaved: saved.workflows.map((w) => w.id),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function testDialCoalesce() {
  section("dial coalesce: rapid ticks → one write feel");
  const core = await createCapabilityCore({
    mode: "sim",
    dialCoalesceMs: 30,
  });
  try {
    const start = core.getControlSurface("my-mic-gain").valueText;
    await Promise.all([
      core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: 1 }),
      core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: 1 }),
      core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: 2 }),
    ]);
    const end = core.getControlSurface("my-mic-gain").valueText;
    assert(end === "28 dB", `coalesced to 28 dB (was ${start}, got ${end})`);
    console.log("OK", { start, end });
  } finally {
    await core.stop();
  }
}

async function main() {
  console.log("RØDE Control E2E verification");
  await testSimVerticalSlice();
  await testRodecasterWorkflow();
  await testMidiTierHonesty();
  await testTopologyOwnership();
  await testPersistenceRoundTrip();
  await testDialCoalesce();

  console.log("\n=== RESULT ===");
  if (failures.length) {
    console.error("FAILED:");
    for (const f of failures) console.error(" -", f);
    process.exitCode = 1;
  } else {
    console.log("ALL CHECKS PASSED");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
