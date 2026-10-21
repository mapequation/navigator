import { Button } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { downloadDataUrl, downloadText } from "../../lib/download";
import { useStores } from "../../stores";

export const Export = observer(function Export() {
  const { network: store } = useStores();
  const cur = store.current;
  if (!cur) return null;
  const base = cur.filename.replace(/\.[^.]+$/, "");

  return (
    <div className="flex flex-wrap gap-2">
      {/* Loaded .ftree, or the JSON tree of an in-app Infomap run. */}
      {cur.ftree ? (
        <Button
          size="sm"
          variant="secondary"
          onPress={() => cur.ftree && downloadText(`${base}.ftree`, cur.ftree)}
        >
          Download .ftree
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          isDisabled={!cur.infomapJson}
          onPress={() =>
            cur.infomapJson &&
            downloadText(
              `${base}.json`,
              JSON.stringify(cur.infomapJson),
              "application/json;charset=utf-8",
            )
          }
        >
          Download .json
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        onPress={() => {
          const svg = store.engine?.toSVG();
          if (svg)
            downloadText(`${base}.svg`, svg, "image/svg+xml;charset=utf-8");
        }}
      >
        Download SVG
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onPress={() => {
          const png = store.engine?.toPNG();
          if (png) downloadDataUrl(`${base}.png`, png);
        }}
      >
        Download PNG
      </Button>
    </div>
  );
});
