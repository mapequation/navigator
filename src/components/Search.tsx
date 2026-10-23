import { Kbd, SearchField } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useStores } from "../stores";

/** On a Mac, Cmd+K focuses the search, elsewhere Ctrl+K, as on documentation sites. */
const MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

/** The search shortcut as its key cap reads. */
export const SEARCH_SHORTCUT = MAC ? "⌘K" : "Ctrl K";

export const Search = observer(function Search() {
  const { network: store } = useStores();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const update = (value: string): void => {
    setQuery(value);
    store.setSearch(value);
  };
  // A click's selection replaces the matches on screen; the query stays, so
  // Enter or the search icon shows them again.
  const search = (): void => store.setSearch(query);
  const matches = store.searchShown ? store.searchHighlight?.length : undefined;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key.toLowerCase() !== "k" || !(MAC ? ev.metaKey : ev.ctrlKey))
        return;
      ev.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <SearchField
        aria-label="Search nodes"
        isDisabled={!store.current}
        value={query}
        onChange={update}
        onSubmit={search}
      >
        <SearchField.Group className="h-8 w-48">
          {/* A plain button: a HeroUI one in a SearchField takes the field's
              clear-button context, and would empty it too. */}
          <button
            type="button"
            aria-label="Search"
            disabled={!store.current}
            onClick={search}
            className="ml-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-500 outline-none hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-neutral-500"
          >
            <SearchField.SearchIcon className="m-0 text-current" />
          </button>
          <SearchField.Input
            ref={input}
            placeholder="Find nodes…"
            className="min-w-0 px-2 py-1 text-xs"
          />
          {query ? (
            <SearchField.ClearButton />
          ) : (
            // As quiet as the placeholder (the browser's: the text colour at
            // half opacity) and its weight, on a lighter cap.
            <Kbd className="mr-1.5 h-5 shrink-0 rounded-md bg-default/50 px-1.5 text-[10px] font-normal text-field-foreground/50">
              {SEARCH_SHORTCUT}
            </Kbd>
          )}
        </SearchField.Group>
      </SearchField>
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
