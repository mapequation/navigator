import { Header, ListBox, NumberField, Select, Slider } from "@heroui/react";
import { type SchemeName, type ToneName, tones } from "@mapequation/c3";
import { observer } from "mobx-react-lite";
import { useStores } from "../../stores";
import type {
  ColorBy,
  ColorHue,
  LayoutBackend,
} from "../../stores/settings-store";
import { Group, Row, Segmented, Toggle } from "./controls";

const TONES = Object.keys(tones) as ToneName[];

/** The d3 schemes c3's docs offer as hue sources, by kind. */
const HUE_SCHEMES: Record<string, SchemeName[]> = {
  Cyclical: ["Sinebow", "Rainbow"],
  Sequential: [
    "Turbo",
    "Viridis",
    "Cividis",
    "CubehelixDefault",
    "YlGnBu",
    "YlOrRd",
    "Blues",
    "Greys",
  ],
  Diverging: ["Spectral", "RdYlBu", "RdYlGn", "BrBG", "PiYG", "PuOr"],
};

/** c3's default offset: 245° (blue) on the hue circle, a scheme's start. */
const defaultOffset = (hue: ColorHue) => (hue === "Oklch" ? 245 : 0);

function SliderRow({
  label,
  value,
  format = String,
  min,
  max,
  step,
  onChange,
  isDisabled,
}: {
  label: string;
  value: number;
  format?: (v: number) => string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  isDisabled?: boolean;
}) {
  return (
    <Slider
      aria-label={label}
      isDisabled={isDisabled}
      minValue={min}
      maxValue={max}
      step={step}
      value={value}
      onChange={(v) => onChange(v as number)}
      className="flex flex-col gap-1"
    >
      <div className="flex justify-between text-xs">
        <span className="text-neutral-700">{label}</span>
        <span className="tabular-nums text-neutral-400">{format(value)}</span>
      </div>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  );
}

/** A [min, max] slider with two thumbs. */
function RangeRow({
  label,
  value,
  format = String,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: readonly [number, number];
  format?: (v: number) => string;
  min: number;
  max: number;
  step: number;
  onChange: (v: [number, number]) => void;
}) {
  return (
    <Slider
      aria-label={label}
      minValue={min}
      maxValue={max}
      step={step}
      value={[...value]}
      onChange={(v) => {
        const [lo = min, hi = max] = v as number[];
        onChange([lo, hi]);
      }}
      className="flex flex-col gap-1"
    >
      <div className="flex justify-between text-xs">
        <span className="text-neutral-700">{label}</span>
        <span className="tabular-nums text-neutral-400">
          {format(value[0])} – {format(value[1])}
        </span>
      </div>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb index={0} />
        <Slider.Thumb index={1} />
      </Slider.Track>
    </Slider>
  );
}

/** Node and link colours: by module (c3's hierarchy()) or by flow. */
export const ColorPanel = observer(function ColorPanel() {
  const { network: store, settings } = useStores();
  const cur = store.current;
  const hasFlow = cur ? !!cur.graph.nodeFlow : true;
  const byFlow = hasFlow && settings.colorBy === "flow";
  const scheme = settings.colorHue !== "Oklch";
  const offset = settings.colorOffset ?? defaultOffset(settings.colorHue);

  return (
    <>
      <Row
        label="Color by"
        hint={
          hasFlow
            ? "module: a colour per module · flow: shades of node flow, links by weight"
            : undefined
        }
      >
        <Segmented
          label="Color by"
          value={hasFlow ? settings.colorBy : "module"}
          options={["module", "flow"] as const satisfies ColorBy[]}
          isDisabled={!hasFlow}
          onChange={(v) => settings.set("colorBy", v)}
        />
      </Row>
      {!hasFlow && (
        <p className="text-xs text-neutral-400">
          Flow colours need node flow: run Infomap first.
        </p>
      )}
      <Row label="Tone" hint="Lightness and chroma of the module colours (c3)">
        <Select
          aria-label="Module colour tone"
          // null is c3's default: strong, or inferred from a scheme.
          selectedKey={settings.colorTone ?? (scheme ? "scheme" : "strong")}
          onSelectionChange={(k) =>
            settings.set("colorTone", k === "scheme" ? null : (k as ToneName))
          }
          isDisabled={byFlow}
          className="w-36"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {[
                ...(scheme
                  ? [
                      <ListBox.Item key="scheme" id="scheme">
                        from scheme
                      </ListBox.Item>,
                    ]
                  : []),
                ...TONES.map((t) => (
                  <ListBox.Item key={t} id={t}>
                    {t}
                  </ListBox.Item>
                )),
              ]}
            </ListBox>
          </Select.Popover>
        </Select>
      </Row>
      <Row label="Hue" hint="Where the top modules' hues come from (c3)">
        <Select
          aria-label="Module colour hue source"
          selectedKey={settings.colorHue}
          onSelectionChange={(k) => settings.set("colorHue", k as ColorHue)}
          isDisabled={byFlow}
          className="w-36"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="Oklch">Oklch</ListBox.Item>
              {Object.entries(HUE_SCHEMES).map(([group, names]) => (
                <ListBox.Section key={group}>
                  <Header>{group}</Header>
                  {names.map((name) => (
                    <ListBox.Item key={name} id={name}>
                      {name}
                    </ListBox.Item>
                  ))}
                </ListBox.Section>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </Row>
      <SliderRow
        label="Offset"
        value={offset}
        format={(v) => `${v}°`}
        min={0}
        max={360}
        step={1}
        isDisabled={byFlow}
        onChange={(v) => settings.set("colorOffset", v)}
      />
    </>
  );
});

/** Node, link and label appearance. */
export const DisplayPanel = observer(function DisplayPanel() {
  const { network: store, settings } = useStores();
  const cur = store.current;
  // Without a network nothing rules an option out: each shows as set, for
  // the next load.
  const hasFlow = cur ? !!cur.graph.nodeFlow : true;
  const directed = cur ? !!cur.directed : true;
  const halfArrow = directed && settings.linkStyle === "half-arrow";
  const unit = settings.sizeMode === "screen" ? " px" : "";

  return (
    <>
      <Group title="Nodes">
        <Row label="Size by">
          <Segmented
            label="Node size by"
            value={hasFlow ? settings.nodeSizeBy : "degree"}
            options={["flow", "degree"] as const}
            isDisabled={!hasFlow}
            onChange={(v) => settings.set("nodeSizeBy", v)}
          />
        </Row>
        <Row label="Radius scale">
          <Segmented
            label="Node radius scale"
            value={settings.nodeScale}
            options={
              [
                ["root", "√ root"],
                ["linear", "linear"],
              ] as const
            }
            onChange={(v) => settings.set("nodeScale", v)}
          />
        </Row>
        <RangeRow
          label="Radius"
          value={settings.nodeRadiusRange}
          format={(v) => `${v}${unit}`}
          min={0.5}
          max={40}
          step={0.5}
          onChange={(v) => settings.set("nodeRadiusRange", v)}
        />
      </Group>

      <Group title="Links">
        <Row label="Style">
          <Segmented
            label="Link style"
            value={directed ? settings.linkStyle : "line"}
            options={
              [
                ["half-arrow", "half-arrow"],
                ["line", "line"],
              ] as const
            }
            isDisabled={!directed}
            onChange={(v) => settings.set("linkStyle", v)}
          />
        </Row>
        <Row
          label="Bend links"
          hint={
            halfArrow
              ? "Free for half-arrows"
              : "Bent lines draw ~12× more vertices than straight ones"
          }
        >
          <Toggle
            label="Bend links"
            isSelected={settings.bendLinks}
            onChange={(on) => settings.set("bendLinks", on)}
          />
        </Row>
        <Row label="Width scale">
          <Segmented
            label="Link width scale"
            value={settings.linkScale}
            options={
              [
                ["root", "√ root"],
                ["linear", "linear"],
              ] as const
            }
            onChange={(v) => settings.set("linkScale", v)}
          />
        </Row>
        <RangeRow
          label="Width"
          value={settings.linkWidthRange}
          format={(v) => `${v}${unit}`}
          min={0.1}
          max={20}
          step={0.1}
          onChange={(v) => settings.set("linkWidthRange", v)}
        />
      </Group>

      <Group title="Labels">
        <Row label="Labels">
          <div className="flex items-center gap-2">
            <NumberField
              aria-label="Max labels"
              value={settings.maxLabels}
              minValue={0}
              maxValue={500}
              step={10}
              isDisabled={!settings.labelsVisible}
              onChange={(v) => settings.set("maxLabels", v)}
              className="w-28"
            >
              <NumberField.Group>
                <NumberField.DecrementButton />
                <NumberField.Input className="min-w-0 flex-1 px-0 text-center text-xs tabular-nums" />
                <NumberField.IncrementButton />
              </NumberField.Group>
            </NumberField>
            <Toggle
              label="Show labels"
              isSelected={settings.labelsVisible}
              onChange={(on) => settings.set("labelsVisible", on)}
            />
          </div>
        </Row>
      </Group>
    </>
  );
});

/** The force simulation and where layouts run. */
export const LayoutPanel = observer(function LayoutPanel() {
  const { network: store, settings } = useStores();
  return (
    <>
      {/* A load always lays its network out, so this is there to stop or
          restart a loaded network's layout. */}
      <Row label="Force simulation">
        <Toggle
          label="Run simulation"
          isDisabled={!store.current}
          isSelected={settings.simulation}
          onChange={(on) => settings.set("simulation", on)}
        />
      </Row>
      <Row
        label="Nested layout"
        hint="A network with modules: each module inside its parent's disc · off: the force layout"
      >
        <Toggle
          label="Nested layout"
          isSelected={settings.nestedLayout}
          onChange={(on) => settings.set("nestedLayout", on)}
        />
      </Row>
      <Row
        label="Layout backend"
        hint="auto: chosen for each layout and device · applies from the next layout"
      >
        <Segmented
          label="Layout backend"
          value={settings.layoutBackend}
          options={["auto", "gpu", "worker"] as const satisfies LayoutBackend[]}
          onChange={(v) => settings.set("layoutBackend", v)}
        />
      </Row>
    </>
  );
});

/** d3gl level-of-detail aggregation. */
export const LodPanel = observer(function LodPanel() {
  const { settings } = useStores();
  const off = settings.lodMode === "off";
  return (
    <>
      <SliderRow
        label="Expand at"
        value={settings.expandPx ?? 48}
        format={(v) => (settings.expandPx === null ? "auto" : `${v} px`)}
        min={16}
        max={200}
        step={4}
        isDisabled={off}
        onChange={(v) => settings.set("expandPx", v)}
      />
      <SliderRow
        label="Max aggregate radius"
        value={settings.maxAggregateRadius}
        format={(v) => `${v} px`}
        min={8}
        max={64}
        step={2}
        isDisabled={off}
        onChange={(v) => settings.set("maxAggregateRadius", v)}
      />
      <SliderRow
        label="Cross-fade"
        value={settings.crossFade}
        format={(v) => v.toFixed(1)}
        min={0}
        max={1}
        step={0.1}
        isDisabled={off}
        onChange={(v) => settings.set("crossFade", v)}
      />
      <Row label="Declutter">
        <Toggle
          label="Declutter"
          isDisabled={off}
          isSelected={settings.declutter}
          onChange={(on) => settings.set("declutter", on)}
        />
      </Row>
      <SliderRow
        label="Declutter spacing"
        value={settings.declutterSpacing}
        format={(v) => `${v.toFixed(1)}×`}
        min={1}
        max={10}
        step={0.5}
        isDisabled={off || !settings.declutter}
        onChange={(v) => settings.set("declutterSpacing", v)}
      />
      <Row label="Super-edges">
        <Toggle
          label="Super-edges"
          isDisabled={off}
          isSelected={settings.superEdges}
          onChange={(on) => settings.set("superEdges", on)}
        />
      </Row>
      <Row
        label="Cross-level links"
        hint="Keep links between an expanded module and collapsed ones"
      >
        <Toggle
          label="Cross-level links"
          // Kept or dropped by the super-edge pass, which Super-edges turns off.
          isDisabled={off || !settings.superEdges}
          isSelected={settings.crossLevelEdges}
          onChange={(on) => settings.set("crossLevelEdges", on)}
        />
      </Row>
    </>
  );
});

/** Engine-level rendering options. */
export const RenderingPanel = observer(function RenderingPanel() {
  const { settings } = useStores();
  return (
    <>
      <Row
        label="Render backend"
        hint="Changing the backend recreates the view"
      >
        <Select
          aria-label="Render backend"
          selectedKey={settings.backend}
          onSelectionChange={(k) =>
            settings.set("backend", k as typeof settings.backend)
          }
          className="w-28"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="webgl">webgl</ListBox.Item>
              <ListBox.Item id="auto">auto</ListBox.Item>
              <ListBox.Item id="canvas">canvas</ListBox.Item>
              <ListBox.Item id="svg">svg</ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </Row>
      <Row label="Pick links" hint="Hover and click links (WebGL)">
        <Toggle
          label="Pick links"
          isSelected={settings.pickLinks}
          onChange={(on) => settings.set("pickLinks", on)}
        />
      </Row>
    </>
  );
});
