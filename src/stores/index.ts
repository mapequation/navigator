import { createContext, useContext } from "react";
import { NetworkStore } from "./network-store";
import { SettingsStore } from "./settings-store";
import { UiStore } from "./ui-store";

export class RootStore {
  network = new NetworkStore();
  settings = new SettingsStore();
  ui = new UiStore();
}

export const StoreContext = createContext<RootStore | null>(null);

export function useStores(): RootStore {
  const stores = useContext(StoreContext);
  if (!stores) throw new Error("StoreContext.Provider missing");
  return stores;
}
