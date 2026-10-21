import { autorun } from "mobx";
import { describe, expect, it } from "vitest";
import { CONSOLE_MAX_LINES, UiStore } from "./ui-store";

describe("UiStore Infomap console", () => {
  it("batches stdout lines into one update per flush", () => {
    const ui = new UiStore();
    ui.startInfomap("infomap --output json");
    let updates = 0;
    const stop = autorun(() => {
      void ui.infomapOutput;
      updates++;
    });
    for (const line of ["Infomap v2.14.0", "", "Trial 1/1 started", ""])
      ui.onInfomapLog(line);
    expect(ui.infomapOutput).toEqual([]);
    ui.flushOutput();
    stop();
    expect(updates).toBe(2);
    expect(ui.infomapOutput).toHaveLength(4);
    expect(ui.infomapStage).toBe("Trial 1/1 started");
  });

  it("is indeterminate for one trial and counts done trials otherwise", () => {
    const ui = new UiStore();
    ui.startInfomap("infomap");
    ui.onInfomapLog("Trial 1/1 started 2026-01-01");
    ui.flushOutput();
    expect(ui.infomapProgress).toBeNull();

    ui.startInfomap("infomap -N 4");
    ui.onInfomapLog("Trial 1/4 started 2026-01-01");
    ui.flushOutput();
    expect(ui.infomapProgress).toBe(0);
    ui.onInfomapLog("Done trial 1/4 in 0.5s | codelength 9.1");
    ui.onInfomapLog("Trial 2/4 started 2026-01-01");
    ui.flushOutput();
    expect(ui.infomapProgress).toBe(25);
    ui.onInfomapLog("Done trial 4/4 in 0.5s | codelength 9.1");
    ui.finishInfomap();
    expect(ui.infomapProgress).toBe(100);
    expect(ui.infomapRunning).toBe(false);
  });

  it("caps the output and counts dropped lines", () => {
    const ui = new UiStore();
    ui.startInfomap("infomap");
    const n = CONSOLE_MAX_LINES + 5;
    for (let i = 0; i < n; i++) ui.onInfomapLog(`line ${i}`);
    ui.finishInfomap("Error: Unrecognized option");
    expect(ui.infomapOutput).toHaveLength(CONSOLE_MAX_LINES);
    expect(ui.infomapOutput[0]).toBe("line 5");
    expect(ui.infomapDroppedLines).toBe(5);
    expect(ui.infomapFailure).toBe("Error: Unrecognized option");
    expect(ui.infomapCommand).toBe("infomap");
  });

  it("ignores finish without a run", () => {
    const ui = new UiStore();
    ui.finishInfomap("not an Infomap error");
    expect(ui.infomapFailure).toBeNull();
    expect(ui.infomapCommand).toBeNull();
  });

  it("forgets a finished run, but not one in flight", () => {
    const ui = new UiStore();
    ui.startInfomap("infomap -N 3");
    ui.onInfomapLog("Trial 1/3 started");
    ui.clearInfomapRun();
    expect(ui.infomapCommand).toBe("infomap -N 3");
    ui.finishInfomap("failed");
    ui.setInfomapError("failed");
    ui.clearInfomapRun();
    expect(ui.infomapCommand).toBeNull();
    expect(ui.infomapOutput).toEqual([]);
    expect(ui.infomapFailure).toBeNull();
    expect(ui.infomapError).toBeNull();
    expect(ui.infomapProgress).toBeNull();
  });
});
