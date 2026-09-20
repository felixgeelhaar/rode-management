/**
 * Real PodMic USB protocol research notes.
 *
 * Phase 0 question (from product intent §73):
 *   How does PodMic USB expose control?
 *
 * Research summary (public sources only — no proprietary capture in-repo):
 * - USB vendor/product commonly reported as 19f7:004a (HID class 03)
 * - RØDE Central / Connect / UNIFY configure gain, monitor, DSP; settings persist
 * - RØDE publishes no third-party PodMic USB control API
 * - Community HID reverse-engineering exists for RØDECaster Pro II (PID 0x0030),
 *   not for PodMic USB (0x004a) — treat PodMic as greenfield capture work
 * - Official RØDECaster MIDI (mute/listen/pads/record) is a separate Tier B path
 *
 * This module intentionally does not reverse-engineer proprietary traffic.
 * It defines the seam where a validated protocol implementation would plug in.
 */

export const PODMIC_USB_USB_IDS = {
  vendorId: 0x19f7,
  productId: 0x004a,
  notes:
    "Reported by public USB databases as HID; confirm on local hardware with lsusb / System Information.",
} as const;

/** Related RØDE USB IDs seen in public / community docs (not PodMic). */
export const RODE_RELATED_USB_IDS = {
  rodecasterProIi: {
    vendorId: 0x19f7,
    productId: 0x0030,
    notes:
      "Community HID reverse-engineering targets this mixer PID — not interchangeable with PodMic USB.",
  },
} as const;

export type ProtocolFeasibilityStatus =
  | "unvalidated"
  | "partial"
  | "validated"
  | "blocked";

export interface ProtocolResearchChecklist {
  discoverWithoutManualIds: ProtocolFeasibilityStatus;
  readGain: ProtocolFeasibilityStatus;
  writeGain: ProtocolFeasibilityStatus;
  observeExternalChanges: ProtocolFeasibilityStatus;
  operateWithoutRodeCentral: ProtocolFeasibilityStatus;
  sharedAcrossCentralMics: ProtocolFeasibilityStatus;
}

export const PODMIC_USB_PROTOCOL_CHECKLIST: ProtocolResearchChecklist = {
  discoverWithoutManualIds: "unvalidated",
  readGain: "unvalidated",
  writeGain: "unvalidated",
  observeExternalChanges: "unvalidated",
  operateWithoutRodeCentral: "unvalidated",
  sharedAcrossCentralMics: "unvalidated",
};

export interface PodMicUsbProtocolAdapterNotes {
  /**
   * A future real adapter must implement DeviceAdapter from @rode-control/core
   * using whatever transport is validated (HID reports, control transfers, IPC, etc.).
   *
   * Until then, use PodMicUsbSimAdapter for architecture and Stream Deck UX work.
   */
  transportCandidates: Array<
    "usb-hid" | "usb-control-transfer" | "local-ipc" | "os-audio-api" | "unknown"
  >;
  /**
   * Ordered research bets based on public evidence (not validated).
   */
  researchBets: string[];
  nearestLiveHardwarePath: string;
  nonGoals: string[];
  references: string[];
}

export const PODMIC_USB_PROTOCOL_NOTES: PodMicUsbProtocolAdapterNotes = {
  transportCandidates: [
    "usb-hid",
    "usb-control-transfer",
    "local-ipc",
    "os-audio-api",
    "unknown",
  ],
  researchBets: [
    "Primary: vendor HID reports used by RØDE Central while adjusting gain/DSP",
    "Secondary: USB control transfers correlated with the same settings",
    "Hypothesis: shared Central-family property framing with other RØDE USB devices (unproven for 004a)",
    "Weak: OS UAC Feature Unit volume — unlikely to map to Revolution Preamp gain / APHEX DSP",
  ],
  nearestLiveHardwarePath:
    "RØDECaster Duo/Pro II official MIDI (mute/listen/pads/record) via RodecasterDuoMidiAdapter + real MidiTransport",
  nonGoals: [
    "Screen automation of RØDE Central",
    "Synthetic mouse/keyboard control of companion apps",
    "Recreating DSP in software",
    "Shipping unofficial RØDECaster HID as a supported Tier A API",
  ],
  references: [
    "https://rode.com/en-us/user-guides/podmic-usb",
    "https://help.rode.com/hc/en-us/articles/8565481010063-MIDI-Triggers-for-R%C3%98DECaster-Pro-II-Duo",
    "https://linux-hardware.org/?id=usb%3A19f7-004a",
    "docs/phase-0-protocol.md",
    "docs/midi-tier-b.md",
  ],
};
