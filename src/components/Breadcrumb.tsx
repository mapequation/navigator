import { Button } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { pathKey } from "../lib/path-key";
import { useStores } from "../stores";

/**
 * Module path of the last selected/zoomed module. Placeholder: updates on
 * click/double-click only — live viewport tracking needs d3gl#197.
 */
export const Breadcrumb = observer(function Breadcrumb() {
  const { network: store } = useStores();
  const cur = store.current;

  // Without modules the path is empty.
  const crumbs = store.breadcrumb.map((_, k) =>
    store.breadcrumb.slice(0, k + 1),
  );

  // The root fits the whole network, modules or not; its filename is in the
  // sidebar's Data section.
  return (
    <nav
      aria-label="Module path"
      className="flex flex-wrap items-center gap-1 text-sm"
    >
      <Button
        size="sm"
        variant="ghost"
        isIconOnly
        aria-label="Whole network"
        isDisabled={!cur}
        onPress={() => {
          store.resetView();
          store.zoomTo?.(null);
        }}
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        >
          <path d="M2.5 7.5 8 3l5.5 4.5M4 6.5V13h3V9.5h2V13h3V6.5" />
        </svg>
      </Button>
      {crumbs.map((path) => {
        const name =
          cur?.moduleNames?.get(pathKey(path)) ??
          store.moduleName(path, store.leavesOfModule(path));
        return (
          <span key={pathKey(path)} className="flex items-center gap-1">
            <span className="text-neutral-400">›</span>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => store.zoomTo?.(store.leavesOfModule(path))}
            >
              {/* A long name ends in an ellipsis; hover shows it whole. */}
              <span className="max-w-48 min-w-0 truncate" title={name}>
                {name}
              </span>
            </Button>
          </span>
        );
      })}
    </nav>
  );
});
