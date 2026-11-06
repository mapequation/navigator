import { beforeEach, describe, expect, it, vi } from "vitest";
import { ftreeToNetwork } from "../lib/ftree-graph";
import { loadFiles } from "../lib/load-files";
import { ClusterStore } from "./cluster-store";
import { NetworkStore } from "./network-store";
import { UiStore } from "./ui-store";

// A run that stays in progress until the test settles it: the worker is not what is tested here.
const runs: { resolve: () => void; reject: (e: unknown) => void }[] = [];
vi.mock("../lib/run-infomap", () => ({
  runInfomap: vi.fn(
    () =>
      new Promise((resolve, reject) => {
        runs.push({ resolve: () => resolve(new Promise(() => {})), reject });
      }),
  ),
}));

const PAJEK = `*Vertices 3
1 "a"
2 "b"
3 "c"
*Edges
1 2
2 3
`;

const FTREE = `# path flow name node_id
1:1 0.5 "a" 1
2:1 0.5 "b" 2
*Links undirected
*Links root 0 0 0 2
`;

const raw = () =>
  loadFiles([{ name: "tiny.net", text: PAJEK }], {
    directed: false,
    twoLevel: false,
    noInfomap: false,
  });

function stores() {
  const network = new NetworkStore();
  const ui = new UiStore();
  return { network, ui, cluster: new ClusterStore(network, ui) };
}

describe("ClusterStore", () => {
  beforeEach(() => {
    runs.length = 0;
  });

  it("runs Infomap when a network loads without modules", async () => {
    const { network, ui, cluster } = stores();
    network.setNetwork(await raw());
    expect(cluster.running).toBe(true);
    expect(ui.infomapRunning).toBe(true);
    expect(ui.infomapCommand).toMatch(/^infomap /);
    expect(runs).toHaveLength(1);
  });

  it("leaves a network that has modules as it is", () => {
    const { network, cluster } = stores();
    network.setNetwork(ftreeToNetwork(FTREE, "tiny.ftree"));
    expect(cluster.running).toBe(false);
    expect(runs).toHaveLength(0);
  });

  it("stops at once, keeping the network unclustered", async () => {
    const { network, ui, cluster } = stores();
    const net = await raw();
    network.setNetwork(net);
    cluster.stop();
    expect(cluster.running).toBe(false);
    expect(ui.infomapRunning).toBe(false);
    expect(ui.infomapFailure).toBe("Stopped");
    // The stopped worker's late answer changes nothing.
    runs[0].reject(new DOMException("Aborted", "AbortError"));
    await Promise.resolve();
    expect(ui.infomapError).toBeNull();
    expect(network.current?.modules).toBeUndefined();
  });

  it("stops the run of a network a new load replaced, and clusters the new one", async () => {
    const { network, ui, cluster } = stores();
    network.setNetwork(await raw());
    network.setNetwork(await raw());
    expect(runs).toHaveLength(2);
    expect(cluster.running).toBe(true);
    expect(ui.infomapRunning).toBe(true);
  });
});
