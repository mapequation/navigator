import { Alert, Button, Input, Link, TextField } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { type ReactNode, useMemo } from "react";
import { buildInfomapArgs, infomapArgString } from "../../lib/infomap-args";
import { computeModuleStats, formatNumber } from "../../lib/network-stats";
import { runInfomap } from "../../lib/run-infomap";
import { useStores } from "../../stores";
import { ConsoleButton, InfomapProgressBar } from "../InfomapConsole";
import { Row, Stats, Toggle } from "./controls";

export const ModulesPanel = observer(function ModulesPanel() {
  const { network: store, ui } = useStores();
  const cur = store.current;
  const moduleStats = useMemo(
    () =>
      cur?.modules
        ? computeModuleStats(cur.modules, {
            codelength: cur.infomap?.codelength,
            ftree: cur.ftree,
          })
        : null,
    [cur],
  );
  if (!cur) return null;

  const args = buildInfomapArgs({
    directed: cur.directed,
    twoLevel: ui.twoLevel,
    noInfomap: false,
    regularized: ui.regularized,
  });
  const command = `infomap ${infomapArgString(args, ui.infomapFlags)}`;

  const cluster = async (): Promise<void> => {
    if (!cur.networkText) return;
    let error: string | null = null;
    try {
      ui.startInfomap(command);
      const { tree, flow } = await runInfomap({
        network: cur.networkText,
        filename: cur.filename,
        args,
        flags: ui.infomapFlags,
        onLog: ui.onInfomapLog,
      });
      store.applyClustering(tree, flow);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      ui.setInfomapError(error);
    } finally {
      ui.finishInfomap(error);
    }
  };
  const progress = ui.infomapProgress;

  const rows: [string, ReactNode][] = [];
  if (moduleStats) {
    rows.push(["Top modules", moduleStats.topModules.toLocaleString()]);
    rows.push(["Levels", moduleStats.levels.toLocaleString()]);
    if (moduleStats.levels > 2)
      rows.push(["Leaf modules", moduleStats.leafModules.toLocaleString()]);
    if (moduleStats.codelength !== null)
      rows.push(["Codelength", `${formatNumber(moduleStats.codelength)} bits`]);
  }

  return (
    <div className="flex flex-col gap-3">
      {moduleStats ? (
        <Stats rows={rows} />
      ) : (
        <p className="text-xs text-neutral-500">
          Not clustered yet. Run Infomap to find modules.
        </p>
      )}

      {cur.networkText ? (
        <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
          <Row label="Two-level" hint="--two-level: no hierarchy">
            <Toggle
              label="Two-level"
              isSelected={ui.twoLevel}
              onChange={ui.setTwoLevel}
              isDisabled={ui.infomapRunning}
            />
          </Row>
          <Row
            label="Regularized"
            hint="--regularized: Bayesian prior against overfitting sparse networks"
          >
            <Toggle
              label="Regularized"
              isSelected={ui.regularized}
              onChange={ui.setRegularized}
              isDisabled={ui.infomapRunning}
            />
          </Row>
          <TextField
            aria-label="Extra Infomap flags"
            value={ui.infomapFlags}
            onChange={ui.setInfomapFlags}
            isDisabled={ui.infomapRunning}
          >
            <Input
              placeholder="More flags, e.g. -N 5"
              className="font-mono text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !ui.infomapRunning) void cluster();
              }}
            />
          </TextField>
          <code
            className="block break-all text-[11px] leading-snug text-neutral-500"
            title="Command sent to Infomap"
          >
            {command}
          </code>
          <Link
            href="https://www.mapequation.org/infomap/#Parameters"
            target="_blank"
            className="text-[11px]"
          >
            All Infomap options
            <Link.Icon />
          </Link>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onPress={cluster}
              isPending={ui.infomapRunning}
            >
              {ui.infomapRunning
                ? `Running Infomap…${progress === null ? "" : ` ${Math.round(progress)}%`}`
                : moduleStats
                  ? "Re-run Infomap"
                  : "Run Infomap"}
            </Button>
            <ConsoleButton />
          </div>
          {ui.infomapRunning && (
            <>
              <InfomapProgressBar size="sm" />
              <p
                className="truncate font-mono text-[11px] text-neutral-400"
                title={ui.infomapStage ?? undefined}
              >
                {ui.infomapStage ?? "Starting…"}
              </p>
            </>
          )}
          {ui.infomapError && (
            <Alert status="danger" role="alert">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description className="text-xs break-words">
                  {ui.infomapError}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </div>
      ) : (
        <p className="text-[11px] leading-snug text-neutral-400">
          Load the network file (not only the .ftree) to re-run Infomap.
        </p>
      )}
    </div>
  );
});
