import { Button, Tooltip } from "@heroui/react";
import { observer } from "mobx-react-lite";
import type { ReactNode } from "react";
import { useStores } from "../stores";
import type { LodMode } from "../stores/settings-store";
import { Breadcrumb } from "./Breadcrumb";
import { Search } from "./Search";
import { Segmented, Toggle } from "./Sidebar/controls";

/** A floating panel over the canvas. */
const PANEL =
  "pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-white/85 px-2 py-1 shadow-sm backdrop-blur";

/**
 * Bar over the canvas: the module path and search on the left, the most used
 * view settings on the right. The settings keep the first row; when both
 * don't fit, the left side wraps below them.
 */
export function TopBar() {
  // `pointer-events-none`: the canvas between the panels stays clickable.
  return (
    <div
      data-overlay
      className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-row-reverse flex-wrap items-start gap-2"
    >
      <SidebarToggle />
      <ViewSettings />
      {/* There from the start, so the bar doesn't change shape on a load. */}
      <div className={`${PANEL} mr-auto`}>
        <Breadcrumb />
        <Search />
      </div>
    </div>
  );
}

/** Shows or hides the sidebar, next to it; the canvas takes its width. */
const SidebarToggle = observer(function SidebarToggle() {
  const { ui } = useStores();
  const label = ui.sidebarOpen ? "Hide sidebar" : "Show sidebar";
  return (
    <div className={PANEL}>
      <Tooltip delay={300}>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={label}
          aria-expanded={ui.sidebarOpen}
          onPress={ui.toggleSidebar}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <path d="M10 3v10" />
          </svg>
        </Button>
        <Tooltip.Content>{label}</Tooltip.Content>
      </Tooltip>
    </div>
  );
});

/** Settings with or without a network: set before a load, they apply to it. */
const ViewSettings = observer(function ViewSettings() {
  const { network: store, settings } = useStores();
  const cur = store.current;
  return (
    <div className={PANEL}>
      <Item
        label="Sizes in"
        hint="screen: constant pixels at any zoom · world: scales with zoom"
      >
        <Segmented
          label="Size mode"
          value={settings.sizeMode}
          options={["screen", "world"] as const}
          onChange={(v) => settings.set("sizeMode", v)}
        />
      </Item>
      <Item
        label="Aggregate by"
        hint="modules: the Infomap module tree (spatial without one) · spatial: nearby nodes"
      >
        <Segmented
          label="LOD mode"
          value={settings.lodMode}
          options={["modules", "spatial", "off"] as const satisfies LodMode[]}
          onChange={(v) => settings.set("lodMode", v)}
        />
      </Item>
      {(!cur || cur.isStates) && (
        <>
          <Item label="State view">
            <Segmented
              label="State view"
              value={settings.stateView}
              options={["physical", "state", "both"] as const}
              onChange={(v) => settings.set("stateView", v)}
            />
          </Item>
          <Item
            label="Lump states"
            hint="A network with modules: one node per physical node in each module, as the map equation codes them"
          >
            <Toggle
              label="Lump states"
              isSelected={settings.lumpStates}
              onChange={(on) => settings.set("lumpStates", on)}
            />
          </Item>
        </>
      )}
    </div>
  );
});

function Item({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-neutral-600" title={hint}>
        {label}
      </span>
      {children}
    </div>
  );
}
