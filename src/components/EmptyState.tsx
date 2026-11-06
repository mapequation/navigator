import { Button, Kbd } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useStores } from "../stores";
import { CatalogIcon, FileIcon, SparkIcon } from "./Load/icons";

/** No network loaded: at startup once the load dialog is dismissed (e.g. to change Settings first), or after a clear. */
export const EmptyState = observer(function EmptyState() {
  const { library } = useStores();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-neutral-50 px-6 text-center">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-neutral-800">
          No network loaded
        </h2>
        <p className="max-w-sm text-sm text-neutral-500">
          Browse hundreds of real networks, open your own files, or start with
          an example.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onPress={() => library.open("browse")}>
          <CatalogIcon />
          Browse networks
        </Button>
        <Button variant="secondary" onPress={() => library.open("files")}>
          <FileIcon />
          Open your files
        </Button>
        <Button variant="ghost" onPress={() => library.open("examples")}>
          <SparkIcon />
          Try an example
        </Button>
      </div>
      <p className="text-xs text-neutral-400">
        Press <Kbd>L</Kbd> to open the load dialog, or drop files on it.
      </p>
    </div>
  );
});
