import { Button, Switch } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { downloadText } from "../../lib/download";
import { useStores } from "../../stores";

/**
 * Metadata overlap (v1 "occurrences"): each uploaded CSV is a set of node
 * names. Matching nodes are coloured per set, and a selected module shows how
 * many of each set's nodes it holds versus the count expected by chance.
 */
export const MetadataOverlap = observer(function MetadataOverlap() {
  const { network: store } = useStores();
  const input = useRef<HTMLInputElement>(null);
  const sel = store.selection;
  const cur = store.current;

  const addFiles = async (list: FileList | null): Promise<void> => {
    for (const file of Array.from(list ?? [])) {
      store.addOccurrenceFile({
        name: file.name,
        size: file.size,
        text: await file.text(),
      });
    }
  };

  const selSet = new Set(sel?.aggregate ? sel.ids : []);
  const enabled = store.occurrenceFiles.filter((f) => f.enabled);
  const chartData = enabled.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    overlap: f.ids.reduce((n, id) => n + (selSet.has(id) ? 1 : 0), 0),
    expected: cur
      ? Math.round((f.ids.length * selSet.size) / cur.graph.nodeCount)
      : 0,
  }));

  const downloadCsv = (): void => {
    if (!cur || !sel) return;
    const lines = enabled.map((f) => {
      const names = f.ids
        .filter((id) => selSet.has(id))
        .map((id) => cur.names[id]);
      return `"${f.name}",${names.join(",")}`;
    });
    const base = cur.filename.replace(/\.[^.]+$/, "");
    downloadText(
      `${base}-metadata-overlap.csv`,
      lines.join("\n"),
      "text/csv;charset=utf-8",
    );
  };

  return (
    <div className="flex flex-col gap-2 text-xs">
      {store.occurrenceFiles.length === 0 && (
        <p className="leading-snug text-neutral-500">
          Upload CSV files listing node names (first column), one file per node
          set. Matching nodes are coloured, and selecting a module compares its
          overlap with each set against chance.
        </p>
      )}
      {store.occurrenceFiles.map((f, i) => (
        <div key={f.id} className="flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-sm"
            style={{ background: f.color }}
          />
          <span className="min-w-0 flex-1 truncate" title={f.name}>
            {f.name}
          </span>
          <span className="text-neutral-500">{f.ids.length}</span>
          <Switch
            aria-label={`Enable ${f.name}`}
            isSelected={f.enabled}
            onChange={() => store.toggleOccurrenceFile(i)}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => store.removeOccurrenceFile(f.id)}
          >
            ✕
          </Button>
        </div>
      ))}
      <input
        ref={input}
        type="file"
        multiple
        accept=".csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        onPress={() => input.current?.click()}
      >
        Upload CSV of node names…
      </Button>

      {sel?.aggregate && enabled.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-neutral-500">
              Overlap with selected module{" "}
              <span className="text-neutral-400">(grey: expected)</span>
            </p>
            <Button size="sm" variant="ghost" onPress={downloadCsv}>
              CSV
            </Button>
          </div>
          <BarChart
            width={280}
            height={140}
            data={chartData}
            margin={{ top: 4, right: 0, bottom: 0, left: -24 }}
          >
            <XAxis dataKey="name" tick={false} />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip />
            <Bar dataKey="overlap" name="In module">
              {chartData.map((d) => (
                <Cell key={d.id} fill={d.color} />
              ))}
            </Bar>
            <Bar dataKey="expected" name="Expected" fill="#aaaaaa" />
          </BarChart>
        </div>
      )}
    </div>
  );
});
