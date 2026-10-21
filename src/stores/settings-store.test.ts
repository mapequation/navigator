import { reaction } from "mobx";
import { describe, expect, it } from "vitest";
import { SettingsStore } from "./settings-store";

describe("SettingsStore layout backend", () => {
  it("defaults to auto, apart from the render backend", () => {
    const settings = new SettingsStore();
    expect(settings.layoutBackend).toBe("auto");
    expect(settings.backend).toBe("webgl");
  });

  it("notifies observers of a change and leaves the render backend alone", () => {
    const settings = new SettingsStore();
    const seen: string[] = [];
    const stop = reaction(
      () => settings.layoutBackend,
      (b) => seen.push(b),
    );
    settings.set("layoutBackend", "worker");
    settings.set("layoutBackend", "gpu");
    stop();
    expect(seen).toEqual(["worker", "gpu"]);
    expect(settings.backend).toBe("webgl");
  });
});

describe("SettingsStore nested layout", () => {
  it("defaults to on", () => {
    expect(new SettingsStore().nestedLayout).toBe(true);
  });

  it("notifies observers of a switch and leaves the layout backend alone", () => {
    const settings = new SettingsStore();
    const seen: boolean[] = [];
    const stop = reaction(
      () => settings.nestedLayout,
      (on) => seen.push(on),
    );
    settings.set("nestedLayout", false);
    settings.set("nestedLayout", true);
    stop();
    expect(seen).toEqual([false, true]);
    expect(settings.layoutBackend).toBe("auto");
  });
});

describe("SettingsStore colour", () => {
  it("colours by module by default", () => {
    expect(new SettingsStore().colorBy).toBe("module");
  });
});
