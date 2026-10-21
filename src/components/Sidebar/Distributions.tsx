import { observer } from "mobx-react-lite";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
import { useStores } from "../../stores";

export const Distributions = observer(function Distributions() {
  const { network: store } = useStores();
  const sel = store.selection;
  const graph = store.built;
  if (!sel?.aggregate || !graph) return null;

  const flow = store.current?.graph.nodeFlow as Float32Array | undefined;
  const ranked = [...sel.ids]
    .sort((a, b) =>
      flow ? flow[b] - flow[a] : graph.csr.degree[b] - graph.csr.degree[a],
    )
    .slice(0, 50);
  const data = ranked.map((id) => ({
    name: store.current?.names[id] ?? String(id),
    flow: flow ? flow[id] : 0,
    degree: graph.csr.degree[id],
  }));
  const key = flow ? "flow" : "degree";

  return (
    <div className="mt-1">
      <p className="mb-1 text-xs text-neutral-500">
        Top members by {key}
        {flow && store.current?.kind === "raw" && store.current.directed
          ? " (undirected)"
          : ""}
      </p>
      <BarChart
        width={280}
        height={120}
        data={data}
        margin={{ top: 4, right: 0, bottom: 0, left: -20 }}
      >
        <XAxis dataKey="name" tick={false} />
        <YAxis tick={{ fontSize: 10 }} width={48} />
        <Tooltip />
        <Bar dataKey={key} fill="#4878d0" />
      </BarChart>
    </div>
  );
});
