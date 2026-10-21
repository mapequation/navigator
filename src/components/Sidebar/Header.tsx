import { Button, Kbd } from "@heroui/react";
import { version as d3glVersion } from "@mapequation/d3gl";
import Infomap from "@mapequation/infomap";
import { observer } from "mobx-react-lite";
import icon from "../../assets/mapequation-icon.svg";
import { useStores } from "../../stores";
import { Cite } from "./Cite";

export const Header = observer(function Header() {
  const { ui } = useStores();
  return (
    <div className="flex flex-col gap-3 p-4">
      <a href="https://www.mapequation.org" className="flex items-center gap-3">
        <img src={icon} alt="MapEquation" className="h-9 w-9" />
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight text-neutral-900">
            Network Navigator{" "}
            <span className="text-xs font-normal text-neutral-400">
              v{import.meta.env.VITE_APP_VERSION}
            </span>
          </h1>
          <p className="truncate text-[11px] text-neutral-400">
            Powered by Infomap v{Infomap.__version__} and d3gl v{d3glVersion}
          </p>
        </div>
      </a>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onPress={ui.openLoad}>
          Load network <Kbd className="ml-1">L</Kbd>
        </Button>
        <Cite />
        <Button size="sm" variant="ghost" onPress={() => ui.setHelpOpen(true)}>
          Help
        </Button>
      </div>
    </div>
  );
});
