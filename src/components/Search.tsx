import { Input } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useStores } from "../stores";

export const Search = observer(function Search() {
  const { network: store } = useStores();
  const [query, setQuery] = useState("");
  const update = (value: string): void => {
    setQuery(value);
    store.setSearch(value);
  };
  const matches = store.searchHighlight?.length;
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label="Search nodes"
        placeholder="Find nodes…"
        className="h-8 w-44 py-1 text-xs"
        value={query}
        onChange={(e) => update(e.target.value)}
      />
      {matches !== undefined && (
        <span
          className="text-xs whitespace-nowrap text-neutral-500"
          title={`${matches} matching nodes highlighted`}
        >
          {matches} {matches === 1 ? "match" : "matches"}
        </span>
      )}
    </div>
  );
});
