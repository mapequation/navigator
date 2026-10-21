import localforage from "localforage";

interface StoredNetwork {
  name?: string;
  ftree?: string;
  ftree_states?: string;
}

/**
 * Infomap Online (mapequation.org/infomap) stores its full result under
 * localforage db "infomap", key "network" — ftree/ftree_states as top-level
 * string fields. States output preferred, as in v1.
 */
export async function loadInfomapOnline(): Promise<{
  text: string;
  filename: string;
} | null> {
  localforage.config({ name: "infomap" });
  const item = await localforage.getItem<StoredNetwork>("network");
  const text = item?.ftree_states ?? item?.ftree;
  if (!text) return null;
  const base = item?.name
    ? item.name.replace(/\.[^.]+$/, "")
    : "infomap-online";
  return { text, filename: `${base}.ftree` };
}
