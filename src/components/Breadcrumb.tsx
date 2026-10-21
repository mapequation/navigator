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
  if (!cur?.modules) return null;

  const crumbs = store.breadcrumb.map((_, k) =>
    store.breadcrumb.slice(0, k + 1),
  );

  return (
    <nav className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md bg-white/85 px-2 py-1 text-sm shadow-sm backdrop-blur">
      <Button
        size="sm"
        variant="ghost"
        onPress={() => {
          store.resetView();
          store.zoomTo?.(null);
        }}
      >
        {cur.filename}
      </Button>
      {crumbs.map((path) => (
        <span key={pathKey(path)} className="flex items-center gap-1">
          <span className="text-neutral-400">›</span>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => store.zoomTo?.(store.leavesOfModule(path))}
          >
            {cur.moduleNames?.get(pathKey(path)) ??
              store.moduleName(path, store.leavesOfModule(path))}
          </Button>
        </span>
      ))}
    </nav>
  );
});
