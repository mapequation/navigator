import { Alert, Button, Spinner } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import {
  BUNDLED_EXAMPLES,
  type BundledExample,
  CATALOG_EXAMPLES,
  type CatalogExample,
} from "../../lib/examples";
import { sourceLabel } from "../../lib/netgamut-catalog";
import { useStores } from "../../stores";
import { compact, domainColor } from "./format";
import { ArrowIcon, UploadIcon } from "./icons";
import type { LoadContext } from "./LoadDialog";
import { LoadedBadge } from "./LoadedBadge";
import { LoadProgress } from "./LoadProgress";

/** An example card: its Load button loads it, and so does a click anywhere else on the card. */
function Card({
  title,
  meta,
  about,
  stats,
  hint,
  pending,
  progress,
  loaded = false,
  disabled,
  onLoad,
  extra,
}: {
  title: string;
  /** The network on screen now came from this card. */
  loaded?: boolean;
  meta: React.ReactNode;
  about: React.ReactNode;
  stats?: React.ReactNode;
  /** What to try once it is loaded. */
  hint?: string;
  pending: boolean;
  /** A download in progress for this card, with its Cancel. */
  progress?: boolean;
  disabled: boolean;
  onLoad: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <li
      className={`group relative flex flex-col rounded-xl border bg-white p-4 transition-[border-color,box-shadow,translate] ${
        pending
          ? "border-blue-300 shadow-[0_2px_12px_-4px_rgb(37_99_235/0.25)]"
          : disabled
            ? "border-neutral-200 opacity-60"
            : "border-neutral-200 shadow-xs hover:-translate-y-px hover:border-blue-300 hover:shadow-[0_6px_18px_-8px_rgb(37_99_235/0.35)] has-[button:focus-visible]:border-blue-400"
      }`}
    >
      <div className="mb-1.5 flex min-h-5 items-center gap-2 text-xs text-neutral-600">
        {meta}
      </div>
      <h4 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-neutral-900">
        {title}
        {loaded && <LoadedBadge />}
      </h4>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-600">
        {about}
      </p>
      {stats && (
        <p className="mt-2 text-xs tabular-nums text-neutral-700">{stats}</p>
      )}
      {hint && <p className="mt-2 text-xs text-neutral-500">{hint}</p>}
      <div className="mt-auto pt-3">
        {progress ? (
          // Above the card's button, so Cancel takes the click.
          <div className="relative z-10">
            <LoadProgress compact />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            {extra}
            {/* Not positioned: its ::after covers the card, so a click anywhere on it loads. */}
            <button
              type="button"
              disabled={disabled}
              onClick={onLoad}
              aria-label={`${loaded ? "Load again" : "Load"} ${title}`}
              // The loaded network's card offers it again, quieter, as Browse does.
              className={`ml-auto inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-medium outline-none transition-colors after:absolute after:inset-0 after:rounded-xl enabled:cursor-pointer focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 disabled:opacity-50 ${
                loaded
                  ? "bg-neutral-100 text-neutral-800 enabled:group-hover:bg-neutral-200"
                  : "bg-(--accent) text-(--accent-foreground) enabled:group-hover:bg-(--accent-hover)"
              }`}
            >
              {loaded ? "Load again" : "Load"}
              {pending ? (
                <Spinner size="sm" color="current" />
              ) : (
                <ArrowIcon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/** The catalog networks loaded last in this browser: one click opens one again. */
const Recent = observer(function Recent({ disabled }: { disabled: boolean }) {
  const { library } = useStores();
  if (library.recent.length === 0) return null;
  return (
    <section aria-labelledby="recent-heading" className="-mb-2">
      <h3
        id="recent-heading"
        className="mb-2 text-sm font-semibold text-neutral-900"
      >
        Recently opened
      </h3>
      <ul className="flex flex-wrap gap-2">
        {library.recent.map((key) => {
          const entry = library.byKey.get(key);
          // A classic network goes by its card's title here too.
          const name =
            CATALOG_EXAMPLES.find((ex) => ex.key === key)?.title ??
            entry?.name ??
            key.slice(key.indexOf("/") + 1);
          const loading = library.loadingKey === key;
          return (
            <li key={key}>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={disabled && !loading}
                isPending={loading}
                aria-label={`Load ${name} again`}
                onPress={() => void library.loadNetgamut(key)}
              >
                {name}
                {entry && (
                  <span className="text-[11px] font-normal tabular-nums text-neutral-500">
                    {compact(entry.nodes)} nodes
                  </span>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});

export const ExamplesTab = observer(function ExamplesTab({
  ctx,
}: {
  ctx: LoadContext;
}) {
  const { ui, library, network } = useStores();
  const loadedKey = network.current?.origin?.key;
  const [pending, setPending] = useState<string | null>(null);
  const disabled = ctx.loading || ui.infomapRunning;
  const catalog = library.catalog;

  const loadBundled = async (ex: BundledExample): Promise<void> => {
    setPending(ex.id);
    ctx.setBusy(true);
    try {
      await ctx.finish(await ex.read());
    } catch (err) {
      ctx.fail(err);
    } finally {
      ctx.setBusy(false);
      setPending(null);
    }
  };
  const loadCatalog = (ex: CatalogExample): void => {
    void library.loadNetgamut(ex.key);
  };

  return (
    <div className="flex min-h-full flex-col gap-7 bg-neutral-50/70 p-5">
      <Recent disabled={disabled} />
      <section aria-labelledby="start-heading">
        <h3
          id="start-heading"
          className="mb-1 text-sm font-semibold text-neutral-900"
        >
          Start here
        </h3>
        <p className="mb-3 text-xs text-neutral-500">
          Served with the Navigator: one network already clustered, one to run
          Infomap on.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {BUNDLED_EXAMPLES.map((ex) => (
            <Card
              key={ex.id}
              title={ex.title}
              meta={
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-600">
                  {ex.format}
                </span>
              }
              about={ex.about}
              hint={ex.hint}
              pending={pending === ex.id}
              disabled={disabled}
              onLoad={() => void loadBundled(ex)}
            />
          ))}
        </ul>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
          <UploadIcon className="h-3.5 w-3.5 text-neutral-400" />
          Your own network? Drop the files anywhere on this dialog, or
          <button
            type="button"
            className="font-medium text-blue-600 hover:underline"
            onClick={() => library.setTab("files")}
          >
            open them in Your files
          </button>
        </p>
      </section>

      <section aria-labelledby="classic-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <h3
              id="classic-heading"
              className="mb-1 text-sm font-semibold text-neutral-900"
            >
              Classic networks
            </h3>
            <p className="text-xs text-neutral-500">
              Well-studied networks from the netgamut catalog, small to large.
              They open without modules: run Infomap in the Modules panel.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => library.setTab("browse")}
          >
            Browse all networks
            <ArrowIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
        {library.catalogError && (
          <Alert status="warning" className="mb-3">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                Can’t reach the netgamut mirror, so these networks can’t load
                right now. The two above and your own files still do.
              </Alert.Description>
            </Alert.Content>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => void library.ensureCatalog()}
            >
              Try again
            </Button>
          </Alert>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATALOG_EXAMPLES.map((ex) => {
            const entry = library.byKey.get(ex.key);
            const domain = entry?.domains[0];
            const source = ex.key.slice(0, ex.key.indexOf("/"));
            const loading = library.loadingKey === ex.key;
            return (
              <Card
                key={ex.key}
                title={ex.title}
                meta={
                  <>
                    {domain && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: domainColor(
                            domain,
                            catalog?.domains ?? [],
                          ),
                        }}
                      />
                    )}
                    <span>
                      {[domain, sourceLabel(source)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </>
                }
                about={ex.about}
                stats={
                  entry ? (
                    <>
                      {compact(entry.nodes)} nodes · {compact(entry.links)}{" "}
                      links · {entry.directed ? "directed" : "undirected"}
                    </>
                  ) : library.catalogLoading ? (
                    <span className="inline-block h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
                  ) : undefined
                }
                pending={loading}
                loaded={loadedKey === ex.key}
                progress={loading && library.download !== null}
                disabled={disabled}
                onLoad={() => loadCatalog(ex)}
                extra={
                  entry && (
                    <button
                      type="button"
                      className="relative z-10 text-xs font-medium text-neutral-600 underline-offset-2 hover:text-blue-700 hover:underline"
                      onClick={() => library.browse(ex.key)}
                    >
                      Details
                    </button>
                  )
                }
              />
            );
          })}
        </ul>
      </section>
    </div>
  );
});
