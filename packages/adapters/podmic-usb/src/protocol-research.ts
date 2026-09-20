/**
 * Real PodMic USB protocol research stub.
 *
 * Phase 0 question (from product intent §73):
 *   How does PodMic USB expose control?
 *
 * Known facts (public):
 * - USB vendor/product commonly reported as 19f7:004a (HID class)
 * - RØDE Central / Connect / UNIFY configure gain, monitor, DSP
 * - Settings persist on-device after companion apps close
 * - No public third-party control API is documented by RØDE
 *
 * This module intentionally does not reverse-engineer proprietary traffic.
 * It defines the seam where a validated protocol implementation would plug in.
 */

export const PODMIC_USB_USB_IDS = {
  vendorId: 0x19f7,
  productId: 0x004a,
  notes: "Reported by public USB databases; confirm on local hardware.",
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
  nonGoals: string[];
}

export const PODMIC_USB_PROTOCOL_NOTES: PodMicUsbProtocolAdapterNotes = {
  transportCandidates: [
    "usb-hid",
    "usb-control-transfer",
    "local-ipc",
    "os-audio-api",
    "unknown",
  ],
  nonGoals: [
    "Screen automation of RØDE Central",
    "Synthetic mouse/keyboard control of companion apps",
    "Recreating DSP in software",
  ],
};
