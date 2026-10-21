import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { Breadcrumb } from "./components/Breadcrumb";
import { EmptyState } from "./components/EmptyState";
import { HelpModal } from "./components/HelpModal";
import { InfomapConsole } from "./components/InfomapConsole";
import { LoadModal } from "./components/LoadModal";
import { NetworkView } from "./components/NetworkView";
import { Sidebar } from "./components/Sidebar/Sidebar";
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

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <main className="relative min-w-0 flex-1">
        {store.current ? (
          <>
            <NetworkView />
            <Breadcrumb />
          </>
        ) : (
          <EmptyState />
        )}
      </main>
      <Sidebar />
      <LoadModal />
      <HelpModal />
      <InfomapConsole />
    </div>
  );
});

export default App;
