/** Stream Deck action UUIDs (must match manifest). */
export const ACTION_UUIDS = {
  micGain: "com.felixgeelhaar.rode-control.mic-gain",
  micMonitor: "com.felixgeelhaar.rode-control.mic-monitor",
  channelLevel: "com.felixgeelhaar.rode-control.channel-level",
  muteToggle: "com.felixgeelhaar.rode-control.mute-toggle",
  listenToggle: "com.felixgeelhaar.rode-control.listen-toggle",
  hpfToggle: "com.felixgeelhaar.rode-control.hpf-toggle",
  compressorToggle: "com.felixgeelhaar.rode-control.compressor-toggle",
  padTrigger: "com.felixgeelhaar.rode-control.pad-trigger",
  padBank: "com.felixgeelhaar.rode-control.pad-bank",
  recordToggle: "com.felixgeelhaar.rode-control.record-toggle",
  applyWorkflow: "com.felixgeelhaar.rode-control.apply-workflow",
  captureWorkflow: "com.felixgeelhaar.rode-control.capture-workflow",
} as const;
