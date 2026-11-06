import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { EmptyState } from "./components/EmptyState";
import { HelpModal } from "./components/HelpModal";
import { InfomapConsole } from "./components/InfomapConsole";
import { LoadDialog } from "./components/Load/LoadDialog";
import { NetworkView } from "./components/NetworkView";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { TopBar } from "./components/TopBar";
import { ftreeToNetwork } from "./lib/ftree-graph";
import { loadInfomapOnline } from "./lib/infomap-online";
import { useStores } from "./stores";

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
  const { network: store, ui, library } = useStores();

  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.target instanceof HTMLElement && typesInto(ev.target)) return;
      if (ev.key === "l" && !ui.loadOpen) {
        // The dialog's search field takes focus as it opens: the key must not type into it.
        ev.preventDefault();
        ui.openLoad();
      }
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
    // The netgamut catalog's "Open in the Network Navigator": ?netgamut=<key> loads that dataset from the
    // mirror as if dropped alone (Infomap clusters it as it loads), on the same path as the load dialog's catalog.
    const params = new URLSearchParams(window.location.search);
    const key = params.get("netgamut");
    if (!key) return;
    library.setTab("browse");
    library.select(key);
    // &noInfomap opens it without modules, as the load dialog's No Infomap does.
    void library.loadNetgamut(key, { noInfomap: params.has("noInfomap") });
    // StrictMode runs the effect twice in development: the first download stops.
    return () => library.cancelDownload();
  }, [library]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <main className="relative min-w-0 flex-1">
        {store.current ? <NetworkView /> : <EmptyState />}
        <TopBar />
      </main>
      <Sidebar />
      <LoadDialog />
      <HelpModal />
      <InfomapConsole />
    </div>
  );
});

export default App;
