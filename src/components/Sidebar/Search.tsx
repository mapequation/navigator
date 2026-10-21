import { Input } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useStores } from "../../stores";

export const Search = observer(function Search() {
  const { network: store } = useStores();
  const [query, setQuery] = useState("");
  const update = (value: string): void => {
    setQuery(value);
    store.setSearch(value);
  };
  return (
    <div className="flex flex-col gap-1">
      <Input
        aria-label="Search nodes"
        placeholder="Find nodes…"
        value={query}
        onChange={(e) => update(e.target.value)}
      />
      {store.searchHighlight && (
        <p className="text-xs text-neutral-500">
          {store.searchHighlight.length} matching nodes highlighted
        </p>
      )}
    </div>
  );
});
