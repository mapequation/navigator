import { Button, Kbd } from "@heroui/react";
import { useStores } from "../stores";

/** No network loaded: at startup once the load dialog is dismissed (e.g. to change Settings first), or after a clear. */
export function EmptyState() {
  const { ui } = useStores();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-50">
      <p className="text-neutral-400">Load a network to get started</p>
      <Button onPress={ui.openLoad}>
        Load network <Kbd className="ml-1">L</Kbd>
      </Button>
    </div>
  );
}
