import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const QASTOR_EVENTS = {
  CASES_CHANGED: "qastor:cases-changed",
  HOTKEY: "qastor:hotkey",
  SESSION_ADVANCED: "qastor:session-advanced",
  CAPTURE_COMPLETE: "qastor:capture-complete",
} as const;

export type HotkeyKind =
  | "capture-and-advance"
  | "paste-text-and-advance"
  | "attach-file-and-advance"
  | "mark-pass"
  | "mark-fail"
  | "mark-blocked"
  | "end-session";

export function onCasesChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(QASTOR_EVENTS.CASES_CHANGED, cb);
}

export function onHotkey(cb: (kind: HotkeyKind) => void): Promise<UnlistenFn> {
  return listen<HotkeyKind>(QASTOR_EVENTS.HOTKEY, (e) => cb(e.payload));
}
