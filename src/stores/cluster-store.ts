import { makeAutoObservable, reaction, runInAction } from "mobx";
import { buildInfomapArgs, infomapArgString } from "../lib/infomap-args";
import { runInfomap } from "../lib/run-infomap";
import type { NetworkStore } from "./network-store";
import type { UiStore } from "./ui-store";

/**
 * Clusters the loaded network with Infomap in the browser: by itself when a network loads without modules
 * (a network file without a partition, a catalog network, the Les Misérables example) unless its load said
 * No Infomap, and on Run Infomap in the Modules panel, with that panel's options. A new load stops a run in
 * progress: its network is gone.
 */
export class ClusterStore {
  /** A run of this store is in progress (not one a partition file's load runs itself). */
  running = false;
  private abort: AbortController | null = null;

  constructor(
    private network: NetworkStore,
    private ui: UiStore,
  ) {
    makeAutoObservable<this, "network" | "ui" | "abort" | "args">(this, {
      network: false,
      ui: false,
      abort: false,
      args: false,
    });
    // topologyVersion counts loads; a re-clustering keeps it.
    reaction(
      () => this.network.topologyVersion,
      () => {
        this.stop();
        const cur = this.network.current;
        // No Infomap at load: the network stays as loaded (a partition as is, a network without modules).
        if (
          cur &&
          !cur.modules &&
          cur.networkText &&
          !cur.loadOptions?.noInfomap
        )
          void this.run();
      },
    );
  }

  /** The command line a run uses now, as the Modules panel shows it. */
  get command(): string {
    return `infomap ${infomapArgString(this.args(), this.ui.infomapFlags)}`;
  }

  private args() {
    return buildInfomapArgs({
      directed: this.network.current?.directed ?? false,
      twoLevel: this.ui.twoLevel,
      noInfomap: false,
      regularized: this.ui.regularized,
    });
  }

  /** Cluster the current network; its modules replace any it had. */
  run = async (): Promise<void> => {
    const { network, ui } = this;
    const cur = network.current;
    if (!cur?.networkText || ui.infomapRunning) return;
    const abort = new AbortController();
    this.abort = abort;
    this.running = true;
    let error: string | null = null;
    try {
      ui.startInfomap(this.command);
      const { tree, flow } = await runInfomap({
        network: cur.networkText,
        filename: cur.filename,
        args: this.args(),
        flags: ui.infomapFlags,
        onLog: ui.onInfomapLog,
        signal: abort.signal,
      });
      // Clustered as loaded: a network loaded since is not this run's.
      if (!abort.signal.aborted && network.current === cur)
        network.applyClustering(tree, flow);
    } catch (err) {
      if (abort.signal.aborted) return; // stop() has ended it
      error = err instanceof Error ? err.message : String(err);
      ui.setInfomapError(error);
    } finally {
      if (this.abort === abort) {
        this.abort = null;
        runInAction(() => {
          this.running = false;
        });
        ui.finishInfomap(error);
      }
    }
  };

  /**
   * Stop the run in progress, if any; the network stays as it is. The run ends here, at once, so a load
   * that starts its own Infomap run next finds none in progress.
   */
  stop = (): void => {
    if (!this.abort) return;
    this.abort.abort();
    this.abort = null;
    this.running = false;
    this.ui.finishInfomap("Stopped");
  };
}
