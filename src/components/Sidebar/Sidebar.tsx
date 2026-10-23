import { observer } from "mobx-react-lite";
import { formatNumber } from "../../lib/network-stats";
import { useStores } from "../../stores";
import { Section } from "./controls";
import { DataPanel } from "./DataPanel";
import { Distributions } from "./Distributions";
import { Export } from "./Export";
import { Header } from "./Header";
import { MetadataOverlap } from "./MetadataOverlap";
import { ModulesPanel } from "./ModulesPanel";
import { SelectedNode } from "./SelectedNode";
import {
  ColorPanel,
  DisplayPanel,
  LayoutPanel,
  LodPanel,
  RenderingPanel,
} from "./SettingsPanel";

export const Sidebar = observer(function Sidebar() {
  const { network: store, ui } = useStores();
  const cur = store.current;
  // `relative`: HeroUI Switch's visually-hidden inputs are position:absolute; without a
  // positioned ancestor they escape the scroll box and stretch the document past the viewport.
  // Hidden, not unmounted: the sections keep their open state.
  return (
    <aside
      className={`relative flex w-84 shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-neutral-200 bg-white ${ui.sidebarOpen ? "" : "hidden"}`}
    >
      <Header />
      {/* Load errors otherwise only render inside the (closed) load modal. */}
      {ui.loadError && !ui.loadOpen && (
        <p role="alert" className="mx-4 mb-3 text-xs text-red-600">
          {ui.loadError}
        </p>
      )}
      {cur && (
        <>
          <Section
            title="Data"
            aside={`${formatNumber(cur.stats.nodes)} nodes`}
          >
            <DataPanel />
          </Section>
          <Section
            title="Modules"
            aside={ui.infomapRunning ? "running…" : undefined}
          >
            <ModulesPanel />
          </Section>
          <Section
            title={
              store.selection?.aggregate && !store.selection.physical
                ? "Selected module"
                : "Selection"
            }
          >
            <SelectedNode />
            <Distributions />
          </Section>
          <Section title="Metadata overlap" defaultOpen={false}>
            <MetadataOverlap />
          </Section>
        </>
      )}
      {/* Settings with or without a network: set before a load, they apply to it. */}
      <Section title="Color">
        <ColorPanel />
      </Section>
      <Section title="Display">
        <DisplayPanel />
      </Section>
      <Section title="Layout">
        <LayoutPanel />
      </Section>
      <Section title="Level of detail">
        <LodPanel />
      </Section>
      <Section title="Rendering">
        <RenderingPanel />
      </Section>
      {cur && (
        <Section title="Export">
          <Export />
        </Section>
      )}
    </aside>
  );
});
