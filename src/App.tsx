import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { EmptyState } from "./components/EmptyState";
import { HelpModal } from "./components/HelpModal";
import { InfomapConsole } from "./components/InfomapConsole";
import { LoadModal } from "./components/LoadModal";
import { NetworkView } from "./components/NetworkView";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { TopBar } from "./components/TopBar";
import { ftreeToNetwork } from "./lib/ftree-graph";
import { loadInfomapOnline } from "./lib/infomap-online";
import { loadFiles } from "./lib/load-files";
import { fetchNetgamut } from "./lib/netgamut";
import { useStores } from "./stores";
import { nextPaint } from "./stores/ui-store";

/** Input types a key can't type into: a shortcut still works on them. */
const KEYLESS_INPUTS = new Set([
  "checkbox", // switches too
  "radio",
  "range",
  "button",
  "submit",
  "reset",
  "color",
  "file",
  "image",
]);

/** Whether a key pressed on `el` types into it (a text field or area, editable content). */
function typesInto(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) return !KEYLESS_INPUTS.has(el.type);
  return el.tagName === "TEXTAREA" || el.isContentEditable;
}

const App = observer(function App() {
  const { network: store, ui } = useStores();

  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.target instanceof HTMLElement && typesInto(ev.target)) return;
      if (ev.key === "l" && !ui.loadOpen) ui.openLoad();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui]);

  useEffect(() => {
    // v1 behavior: ?infomap in the URL auto-loads the Infomap Online handover.
    if (!new URLSearchParams(window.location.search).has("infomap")) return;
    loadInfomapOnline()
      .then((item) => {
        if (!item) return;
        store.setNetwork(ftreeToNetwork(item.text, item.filename));
        ui.setLoadOpen(false);
      })
      .catch((err) => ui.setLoadError(String(err)));
  }, [store, ui]);

  useEffect(() => {
    // The netgamut catalog's "Open in the Network Navigator": ?netgamut=<key> loads that dataset from
    // the netgamut mirror as if dropped alone, raw until Infomap runs. The load dialog stays open, busy,
    // until the network is on screen (ui.viewReady).
    const key = new URLSearchParams(window.location.search).get("netgamut");
    if (!key) return;
    // StrictMode runs the effect twice in development: the first download stops.
    const abort = new AbortController();
    const { signal } = abort;
    const load = async (): Promise<void> => {
      const { dataset, name, text } = await fetchNetgamut(key, {
        signal,
        onPhase: ui.setViewPhase,
      });
      if (signal.aborted) return;
      ui.setViewPhase("Reading the network…");
      await nextPaint();
      const net = await loadFiles([{ name, text }], {
        directed: dataset.directed,
        twoLevel: false,
        noInfomap: false,
      });
      if (signal.aborted) return;
      ui.setViewPhase("Laying out and building the view…");
      await nextPaint();
      runInAction(() => {
        store.setNetwork(net);
        ui.clearInfomapRun();
      });
    };
    load().catch((err) => {
      if (signal.aborted) return;
      ui.setViewPhase(null);
      ui.setLoadError(err instanceof Error ? err.message : String(err));
    });
    return () => abort.abort();
  }, [store, ui]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <main className="relative min-w-0 flex-1">
        {store.current ? <NetworkView /> : <EmptyState />}
        <TopBar />
      </main>
      <Sidebar />
      <LoadModal />
      <HelpModal />
      <InfomapConsole />
    </div>
  );
});

export default App;
