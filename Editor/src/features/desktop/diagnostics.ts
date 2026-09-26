import { buildMPELogExportPayload } from "@/utils/logExportPayload";
import { desktopContext } from "./host";
import { mfwProtocol } from "@/services/server";
import { useWSStore } from "@/stores/connection/wsStore";

/** Keep a dated snapshot for export after a native hang or a closed editor. */
export function initializeDiagnosticSnapshots(): () => void {
  if (!desktopContext) return () => {};
  const capture = () => {
    if (useWSStore.getState().connected) mfwProtocol.snapshotLogs(buildMPELogExportPayload());
  };
  const unsubscribe = useWSStore.subscribe(
    (state) => state.connected,
    (connected) => { if (connected) capture(); },
  );
  capture();
  const timer = window.setInterval(capture, 10_000);
  window.addEventListener("pagehide", capture);
  return () => {
    capture();
    unsubscribe();
    window.clearInterval(timer);
    window.removeEventListener("pagehide", capture);
  };
}
