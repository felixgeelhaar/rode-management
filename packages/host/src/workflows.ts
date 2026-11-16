import { createWorkflowProfile, type WorkflowProfile } from "@rode-control/core";

/** Built-in product workflows for creator setups (sim / Duo). */
export function builtInWorkflows(): WorkflowProfile[] {
  return [
    createWorkflowProfile(
      "streaming",
      "Streaming",
      [
        { bindingId: "my-mic-gain", value: 48 },
        { bindingId: "game-level", value: -8 },
        { bindingId: "chat-level", value: -12 },
        { bindingId: "music-level", value: -18 },
        { bindingId: "headphones-level", value: 70 },
      ],
      "Balanced mix for live streaming",
    ),
    createWorkflowProfile(
      "podcast",
      "Podcast",
      [
        { bindingId: "my-mic-gain", value: 52 },
        { bindingId: "game-level", value: -40 },
        { bindingId: "chat-level", value: -10 },
        { bindingId: "music-level", value: -24 },
        { bindingId: "headphones-level", value: 65 },
      ],
      "Voice-forward mix; game ducked",
    ),
  ];
}
