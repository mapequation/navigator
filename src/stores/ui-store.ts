import { makeAutoObservable, observable } from "mobx";

/** The console keeps this many stdout lines of the last Infomap run; older ones are dropped. */
export const CONSOLE_MAX_LINES = 20_000;

/** "Trial k/N started …" (k - 1 done) or "Done trial k/N …" (k done). */
const TRIAL_LINE = /^(Done trial|Trial) (\d+)\/(\d+)/;

interface Trials {
  done: number;
  total: number;
}

/** Next paint; a timer where there is none (tests). */
function onNextFrame(cb: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
  else setTimeout(cb, 16);
}

/** Resolves once the browser has painted a frame: a label set before this shows before the work after it. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => onNextFrame(() => setTimeout(resolve, 0)));
}

export class UiStore {
  loadOpen = true;
  /**
   * What a load is doing until its network is on screen ("Reading the network…", then the layout and the
   * view's one-time builds), shown in the load dialog with an indeterminate bar; null when no load is in
   * flight. The dialog stays open, busy, until the view has drawn its first frame (viewReady).
   */
  viewPhase: string | null = null;
  helpOpen = false;
  consoleOpen = false;
  infomapRunning = false;
  /** Command line of the last Infomap run; null until one starts. */
  infomapCommand: string | null = null;
  /** Stdout of the last run, one entry per line, capped at CONSOLE_MAX_LINES. */
  infomapOutput: readonly string[] = [];
  /** Lines of the last run dropped by the cap. */
  infomapDroppedLines = 0;
  /** Error that ended the last run (Infomap only writes fatal errors to stderr). */
  infomapFailure: string | null = null;
  /** Trial count from the stdout lines; null until the first trial starts. */
  infomapTrials: Trials | null = null;
  loadError: string | null = null;
  /** Error from the sidebar Infomap run (shown in the Modules section). */
  infomapError: string | null = null;
  /** Sidebar Infomap options. */
  twoLevel = false;
  regularized = false;
  infomapFlags = "";

  /** Lines received since the last flush; one MobX update per frame, not per line. */
  private pending: string[] = [];
  private pendingDropped = 0;
  private pendingTrials: Trials | null = null;
  private flushScheduled = false;

  constructor() {
    makeAutoObservable<
      this,
      "pending" | "pendingDropped" | "pendingTrials" | "flushScheduled"
    >(this, {
      infomapOutput: observable.ref,
      infomapTrials: observable.ref,
      pending: false,
      pendingDropped: false,
      pendingTrials: false,
      flushScheduled: false,
    });
  }

  /** Latest non-empty stdout line (Infomap prints many blank ones). */
  get infomapStage(): string | null {
    const out = this.infomapOutput;
    for (let i = out.length - 1; i >= 0; i--) {
      const line = out[i].trim();
      if (line) return line;
    }
    return null;
  }

  /**
   * Percent of trials done. Null (indeterminate) for single-trial runs: Infomap
   * reports nothing finer than its trial lines.
   */
  get infomapProgress(): number | null {
    const t = this.infomapTrials;
    return t && t.total > 1 ? (100 * t.done) / t.total : null;
  }

  openLoad = (): void => {
    this.loadOpen = true;
    this.helpOpen = false;
  };
  setLoadOpen = (open: boolean): void => {
    this.loadOpen = open;
  };
  setHelpOpen = (open: boolean): void => {
    this.helpOpen = open;
  };
  setConsoleOpen = (open: boolean): void => {
    this.consoleOpen = open;
  };
  setLoadError = (message: string | null): void => {
    this.loadError = message;
  };
  setViewPhase = (phase: string | null): void => {
    this.viewPhase = phase;
  };
  /** The loaded network is on screen: the load is done and its dialog closes. */
  viewReady = (): void => {
    if (this.viewPhase === null) return;
    this.viewPhase = null;
    this.loadOpen = false;
  };
  startInfomap = (command: string): void => {
    this.infomapRunning = true;
    this.infomapCommand = command;
    this.infomapOutput = [];
    this.infomapDroppedLines = 0;
    this.infomapFailure = null;
    this.infomapTrials = null;
    this.pending = [];
    this.pendingDropped = 0;
    this.pendingTrials = null;
    this.loadError = null;
    this.infomapError = null;
  };
  /** Forget the last run: the network it clustered was replaced or cleared. */
  clearInfomapRun = (): void => {
    if (this.infomapRunning) return;
    this.consoleOpen = false;
    this.infomapCommand = null;
    this.infomapOutput = [];
    this.infomapDroppedLines = 0;
    this.infomapFailure = null;
    this.infomapTrials = null;
    this.infomapError = null;
    this.pending = [];
    this.pendingDropped = 0;
    this.pendingTrials = null;
  };
  setInfomapError = (message: string | null): void => {
    this.infomapError = message;
  };
  setTwoLevel = (on: boolean): void => {
    this.twoLevel = on;
  };
  setRegularized = (on: boolean): void => {
    this.regularized = on;
  };
  setInfomapFlags = (flags: string): void => {
    this.infomapFlags = flags;
  };
  /** Stdout line from the worker. Buffered; see flushOutput. */
  onInfomapLog = (line: string): void => {
    const trial = TRIAL_LINE.exec(line);
    if (trial) {
      const k = Number(trial[2]);
      this.pendingTrials = {
        done: trial[1] === "Trial" ? k - 1 : k,
        total: Number(trial[3]),
      };
    }
    this.pending.push(line);
    // Keep the buffer bounded while frames are paused (background tab).
    if (this.pending.length >= 2 * CONSOLE_MAX_LINES) {
      this.pendingDropped += this.pending.length - CONSOLE_MAX_LINES;
      this.pending = this.pending.slice(-CONSOLE_MAX_LINES);
    }
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      onNextFrame(() => {
        this.flushScheduled = false;
        this.flushOutput();
      });
    }
  };
  /** Move buffered lines into infomapOutput in one update. */
  flushOutput = (): void => {
    if (this.pendingTrials) this.infomapTrials = this.pendingTrials;
    this.pendingTrials = null;
    if (!this.pending.length) return;
    const merged = this.infomapOutput.concat(this.pending);
    const drop = Math.max(0, merged.length - CONSOLE_MAX_LINES);
    this.infomapOutput = drop ? merged.slice(drop) : merged;
    this.infomapDroppedLines += this.pendingDropped + drop;
    this.pending = [];
    this.pendingDropped = 0;
  };
  /** End the run started by startInfomap; `error` is kept for the console. */
  finishInfomap = (error: string | null = null): void => {
    if (!this.infomapRunning) return;
    this.flushOutput();
    this.infomapRunning = false;
    this.infomapFailure = error;
  };
}
