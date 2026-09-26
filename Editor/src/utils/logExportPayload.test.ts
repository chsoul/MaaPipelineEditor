import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/server", () => ({
  localServer: {}, mfwProtocol: {}, interfaceRunProtocol: {}, projectInterfaceProtocol: {},
}));

import { buildMPELogExportPayload } from "./logExportPayload";
import { useLoggerStore } from "@/stores/app/loggerStore";
import { useDebugSessionStore } from "@/stores/debug/debugSessionStore";
import { useInterfaceRunStore } from "@/features/project-interface/interfaceRunStore";
import { useConfigStore } from "@/stores/app/configStore";

describe("diagnostic payload", () => {
  it("redacts credentials without changing the live configuration", () => {
    const configs = useConfigStore.getState().configs;
    useConfigStore.setState({ configs: { ...configs, aiApiKey: "private-diagnostic-test-key" } });
    try {
      const payload = buildMPELogExportPayload();
      expect(JSON.stringify(payload)).not.toContain("private-diagnostic-test-key");
      expect(payload.frontendState.configs).toMatchObject({ aiApiKey: "[REDACTED]" });
      expect(useConfigStore.getState().configs.aiApiKey).toBe("private-diagnostic-test-key");
    } finally {
      useConfigStore.setState({ configs });
    }
  });
  it("includes current backend logs, stop state and PI runtime errors in serializable snapshots", () => {
    useLoggerStore.getState().addLog({ level: "ERROR", module: "MFW", message: "Command still running", timestamp: "2026-09-26T10:03:31Z" });
    useDebugSessionStore.setState({ lastStopRequest: { sessionId: "session", runId: "run", reason: "user_stop" } });
    useInterfaceRunStore.setState({ error: "Agent exited", stopRequested: true });
    const payload = JSON.parse(JSON.stringify(buildMPELogExportPayload()));
    expect(payload.frontendLogs.backend).toEqual(expect.arrayContaining([expect.objectContaining({ message: "Command still running" })]));
    expect(payload.frontendState.debug.lastStopRequest).toMatchObject({ sessionId: "session", runId: "run" });
    expect(payload.frontendState.interfaceRun).toMatchObject({ error: "Agent exited", stopRequested: true });
    expect(payload.frontendState.debug.events).toEqual([]);
  });
});
