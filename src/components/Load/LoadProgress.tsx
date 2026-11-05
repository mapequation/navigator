import { Button, ProgressBar } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useStores } from "../../stores";
import { bytes } from "./format";

/**
 * What a load is doing: a catalog download with its bytes and Cancel, then the phases that read the network and
 * build the view, which run on the main thread and cannot be stopped. `compact` drops the Cancel label to fit a
 * card.
 */
export const LoadProgress = observer(function LoadProgress({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { ui, library } = useStores();
  const download = library.download;
  if (download) {
    const percent =
      download.read !== null && download.total > 0
        ? Math.min(100, Math.floor((100 * download.read) / download.total))
        : null;
    const label =
      percent === null
        ? "Looking up the network…"
        : `Downloading ${bytes(download.read ?? 0)} of ${bytes(download.total)}`;
    return (
      <div className="flex items-center gap-3" role="status">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-neutral-700">{label}</span>
            {percent !== null && (
              <span className="font-medium tabular-nums text-neutral-900">
                {percent}%
              </span>
            )}
          </div>
          {/* No width transition: while the bytes stream in, the main thread has few frames for one, and the
              bar would trail the percentage. */}
          <ProgressBar
            size="sm"
            aria-label={label}
            value={percent ?? undefined}
            isIndeterminate={percent === null}
            className="[&_.progress-bar\_\_fill]:transition-none"
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onPress={library.cancelDownload}
          aria-label="Cancel the download"
        >
          {compact ? "✕" : "Cancel"}
        </Button>
      </div>
    );
  }
  if (!ui.viewPhase) return null;
  // The bar's indeterminate animation is a CSS transform, which the browser runs on the compositor: it keeps
  // moving while the main thread is busy parsing, laying out and building the view.
  return (
    <div className="flex flex-col gap-1.5" role="status">
      <span className="text-xs text-neutral-700">{ui.viewPhase}</span>
      <ProgressBar size="sm" aria-label={ui.viewPhase} isIndeterminate>
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
    </div>
  );
});
