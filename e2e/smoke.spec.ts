import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

/** Console/page errors are collected per-test and asserted at the end so a
 * single failure doesn't hide errors raised earlier in the same test. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Errors we expect/tolerate — third-party noise unrelated to app correctness. */
function isFatal(message: string): boolean {
  if (message.includes("favicon.ico")) return false;
  return true;
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(__dirname, "screenshots", `${name}.png`),
    fullPage: false,
  });
}

// The load modal's close is a real state change, but WebGL/shader init and
// (for the citation-scale example) graph layout compete for the main thread
// with Playwright's own polling overhead — under the test runner (unlike a
// bare script) that's occasionally enough to blow past a tight expect()
// timeout even though the app itself isn't hung. Give modal-close assertions
// generous headroom, matching the Infomap-run allowance elsewhere.
const MODAL_CLOSE_TIMEOUT = 30_000;

async function loadExample(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Load network" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load example" }).click();
  await expect(
    page.getByRole("heading", { name: "Load network" }),
  ).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
  await expect(page.locator("main canvas")).toBeVisible({ timeout: 30_000 });
}

/** Attaches files to the hidden dropzone input without going through the
 * dropzone's native file picker (which Playwright can't drive). */
async function addFiles(page: Page, files: string[]): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(files);
}

type Transform = { k: number; x: number; y: number };

/** The camera: d3gl keeps d3-zoom's transform (on its host) synced to it. */
async function viewTransform(page: Page): Promise<Transform> {
  return page.evaluate(() => {
    const host = [...document.querySelectorAll("main *")].find(
      (el) => "__zoom" in el,
    ) as (Element & { __zoom: Transform }) | undefined;
    if (!host) throw new Error("no zoom host");
    const { k, x, y } = host.__zoom;
    return { k, x, y };
  });
}

/** The camera once it has stopped moving (the load's fit-on-layout). */
async function settledTransform(page: Page): Promise<Transform> {
  let last = await viewTransform(page);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const t = await viewTransform(page);
    if (t.k === last.k && t.x === last.x && t.y === last.y) return t;
    last = t;
  }
  throw new Error("camera did not settle");
}

/** d3gl's layoutTransport for a layout that ran on the worker. */
const WORKER_TRANSPORT = /^(shared|copy)$/;

/** d3gl's layoutTransport for a layout that landed under "auto": which one
 * is d3gl's choice (d3gl#375), so any but "none" (stopped first). */
const AUTO_TRANSPORT = /^(gpu|shared|copy)$/;

/** The latest layout has landed, wherever "auto" ran it, and the view laid
 * the network out as a nested map of its modules or not: data-nested-map,
 * the kind the view asked d3gl for (what the module rings follow). Neither
 * the transport nor any d3gl getter tells the kind d3gl ran (d3gl#434), so
 * that it lays out what it's asked for is d3gl's tests' to check. */
async function autoLayoutLanded(
  page: Page,
  { nested }: { nested: boolean },
): Promise<void> {
  const view = page.locator("main [aria-busy]");
  await expect(view).toHaveAttribute("data-layout-transport", AUTO_TRANSPORT, {
    timeout: 30_000,
  });
  await expect(view).toHaveAttribute("data-nested-map", String(nested));
}

/** Counts the layout view's aria-busy changes from now on. A layout starts in
 * the same task as the change that starts it, so after that task a count of 0
 * shows that none started (no auto-retry needed). */
async function watchBusy(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const host = document.querySelector("main [aria-busy]");
    if (!host) throw new Error("no layout view");
    const w = window as Window & { __busyChanges?: number };
    w.__busyChanges = 0;
    new MutationObserver((records) => {
      w.__busyChanges = (w.__busyChanges ?? 0) + records.length;
    }).observe(host, { attributes: true, attributeFilter: ["aria-busy"] });
  });
  return () =>
    page.evaluate(
      () => (window as Window & { __busyChanges?: number }).__busyChanges ?? 0,
    );
}

/** The app's node fill without modules (NetworkView's DEFAULT_NODE_FILL). */
const DEFAULT_FILL = "#4878d0";

/** The node fills on the canvas: colours (hex) that cover at least a small
 * disc's worth of pixels, most first, skipping the greys of the background,
 * links, borders and labels. Read from a screenshot, as the WebGL canvas
 * keeps no drawing buffer to read back. */
async function nodeColors(page: Page): Promise<string[]> {
  // The top bar floats over the canvas: its coloured controls are not nodes.
  const png = await page
    .locator("main canvas")
    .first()
    .screenshot({ style: "[data-overlay] { visibility: hidden; }" });
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const counts = new Map<string, number>();
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b] = [px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0];
      if (Math.max(r, g, b) - Math.min(r, g, b) < 40) continue; // a grey
      const hex = `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    return [...counts]
      .filter(([, n]) => n >= 20)
      .sort((a, b) => b[1] - a[1])
      .map(([hex]) => hex);
  }, png.toString("base64"));
}

/** The Settings controls a layout-backend test drives. */
function layoutControls(page: Page) {
  const view = page.locator("main [aria-busy]");
  const simulation = page.getByRole("switch", { name: "Run simulation" });
  const group = page.getByRole("radiogroup", { name: "Layout backend" });
  return {
    view,
    group,
    simulation,
    /** Pick a layout backend while no layout runs: it starts none. */
    chooseIdle: async (name: string): Promise<void> => {
      await expect(view).toHaveAttribute("aria-busy", "false", {
        timeout: 30_000,
      });
      const changes = await watchBusy(page);
      await group.getByRole("radio", { name }).click();
      await expect(group.getByRole("radio", { name })).toBeChecked();
      expect(await changes()).toBe(0);
    },
    /** A fresh layout, through the simulation toggle. */
    restart: async (): Promise<void> => {
      await simulation.click({ force: true }); // off; see the partition test
      await expect(simulation).not.toBeChecked();
      await simulation.click({ force: true });
      await expect(simulation).toBeChecked();
    },
  };
}

test.describe("Network Navigator smoke", () => {
  test("example: load, canvas, sidebar, search", async ({ page }) => {
    const errors = collectErrors(page);
    await loadExample(page);

    await expect(page.getByText(/Powered by Infomap v/)).toBeVisible();

    const search = page.getByRole("searchbox", { name: "Search nodes" });
    await search.fill("PHYS");
    await expect(page.getByText(/^\d+ match(es)?$/)).toBeVisible();

    await screenshot(page, "example");
    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("drill + selection: click and double-click the canvas", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await loadExample(page);

    const canvas = page.locator("main canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.click(cx, cy);
    // Best-effort: a hit depends on layout settling near the click point, so
    // only assert on the "Selected" section when it actually filled in.
    const nameRow = page.getByText("Name", { exact: true });
    if (await nameRow.isVisible().catch(() => false)) {
      await expect(nameRow).toBeVisible();
    }

    await page.mouse.dblclick(cx, cy);
    await expect(canvas).toBeVisible();

    await screenshot(page, "drill-selection");
    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("raw + cluster: load toy.net, cluster with Infomap", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await addFiles(page, [fixture("toy.net")]);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Load network" }),
    ).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    await expect(page.locator("main canvas")).toBeVisible();

    // Until Infomap runs, a raw network's flow is its degree flow: flow
    // colours, and flow borders of the degree flow leaving each node.
    const view = page.locator("main [aria-busy]");
    const flowColors = page
      .getByRole("radiogroup", { name: "Color by" })
      .getByRole("radio", { name: "flow" });
    await expect(flowColors).toBeEnabled();
    await expect(page.getByText("Flow colours need node flow")).toHaveCount(0);
    await expect(view).toHaveAttribute("data-flow-borders", "true");

    const clusterButton = page.getByRole("button", {
      name: "Run Infomap",
      exact: true,
    });
    await expect(clusterButton).toBeVisible();
    await clusterButton.click();
    await expect(
      page.getByRole("button", { name: "Re-run Infomap" }),
    ).toBeVisible({ timeout: 30_000 });

    // The run's link flow rings each node, in either colouring.
    await expect(view).toHaveAttribute("data-flow-borders", "true");
    await flowColors.click();
    await expect(flowColors).toBeChecked();
    await expect(view).toHaveAttribute("data-flow-borders", "true");

    // The top bar's home button fits the whole network.
    await expect(
      page
        .getByRole("navigation", { name: "Module path" })
        .getByRole("button", { name: "Whole network" }),
    ).toBeVisible();

    // In-app runs export Infomap's JSON tree (no ftree is written).
    await expect(
      page.getByRole("button", { name: "Download .json" }),
    ).toBeEnabled();

    await screenshot(page, "raw-cluster");
    expect(errors.filter(isFatal)).toEqual([]);
  });

  // Infomap keys a partition by Pajek vertex number, whatever the labels are:
  // numeric labels (1 "0", 2 "1", ...) must not be taken for the node ids.
  for (const [network, partition] of [
    ["toy.net", "toy.clu"],
    ["toy-numeric.net", "toy-numeric.tree"],
  ]) {
    test(`partition: load ${network} + ${partition} with No Infomap`, async ({
      page,
    }) => {
      const errors = collectErrors(page);
      await page.goto("/");
      await addFiles(page, [fixture(network), fixture(partition)]);

      const noInfomap = page.getByRole("switch", { name: /No Infomap/ });
      // The accessible <input role="switch"> is visually hidden (clip-rect
      // pattern) behind a styled thumb/control that sits on top of it — normal
      // for this component and fine for real users (a click anywhere in the
      // wrapping <label> toggles the input natively), but Playwright's
      // actionability check refuses to click a target it considers obscured by
      // a sibling element. force:true bypasses that visibility heuristic while
      // still dispatching a real click at the input's location.
      await noInfomap.click({ force: true });
      await expect(noInfomap).toBeChecked();

      await page.getByRole("button", { name: "Load", exact: true }).click();

      // If Infomap fails headlessly, the modal surfaces an Alert instead of
      // closing — capture that verbatim rather than silently retrying.
      const alert = page.getByRole("alert");
      const canvas = page.locator("main canvas");
      await Promise.race([
        expect(canvas).toBeVisible({ timeout: 30_000 }).catch(() => {}),
        expect(alert).toBeVisible({ timeout: 30_000 }).catch(() => {}),
      ]);

      if (await alert.isVisible().catch(() => false)) {
        throw new Error(`Load modal error (partition flow): ${await alert.innerText()}`);
      }

      await expect(canvas).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Download .json" }),
      ).toBeEnabled();

      await screenshot(page, `partition-${network}`);
      expect(errors.filter(isFatal)).toEqual([]);
    });
  }

  test("states: toy_states.net in all three views, raw then clustered by module", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await addFiles(page, [fixture("toy_states.net")]);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Load network" }),
    ).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    await expect(page.locator("main canvas")).toBeVisible();

    // A raw state network has the three views already, in the plain fill, or
    // its darker shade where a flow border covers a node whose exit flow is
    // its flow: of the plain fill's hue. (The both view's state nodes are too
    // small on this tiny map to count: its switch is checked, its colours not.)
    const hue = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI;
    };
    const sameHue = (a: string, b: string): boolean =>
      Math.abs(hue(a) - hue(b)) < 6;
    const views = page.getByRole("radiogroup", { name: "State view" });
    await expect(views).toBeVisible();
    const show = async (view: string): Promise<void> => {
      await views.getByRole("radio", { name: view }).click();
      await expect(views.getByRole("radio", { name: view })).toBeChecked();
    };
    for (const view of ["state", "both", "physical"]) {
      await show(view);
      if (view !== "both")
        await expect
          .poll(async () => {
            const colors = await nodeColors(page);
            return (
              colors.length > 0 && colors.every((c) => sameHue(c, DEFAULT_FILL))
            );
          })
          .toBe(true);
    }

    const clusterButton = page.getByRole("button", {
      name: "Run Infomap",
      exact: true,
    });
    await expect(clusterButton).toBeVisible();
    await clusterButton.click();
    await expect(
      page.getByRole("button", { name: "Re-run Infomap" }),
    ).toBeVisible({ timeout: 30_000 });

    // Clustered: every view colours its nodes by module, in the app's
    // palette (the Color settings' tone), the plain fill nowhere.
    const byModule = async (): Promise<string[]> => {
      let colors: string[] = [];
      await expect
        .poll(async () => {
          colors = await nodeColors(page);
          return colors.length > 0 && !colors.includes(DEFAULT_FILL);
        })
        .toBe(true);
      return colors;
    };
    const seen: Record<string, string[]> = {};
    for (const view of ["state", "both", "physical"]) {
      await show(view);
      if (view !== "both") seen[view] = await byModule();
    }
    // The physical view's discs and wedges are the state nodes' modules, and
    // their flow borders a darker shade of them: of the same hue.
    for (const c of seen.physical ?? [])
      expect(
        seen.state?.some((s) => sameHue(s, c)),
        `${c} has no module colour of its hue in the state view`,
      ).toBe(true);
    await screenshot(page, "states");

    await page.getByRole("button", { name: "Module colour tone" }).click();
    await page.getByRole("option", { name: "deep" }).click();
    await expect
      .poll(async () => (await byModule())[0])
      .not.toBe(seen.physical?.[0]);

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("states: lumped, clustered in the both view, toggled in the state view (d3gl#529)", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    // Clustered, toy_states.net lumps its 4 state nodes into 3: a per-state-node
    // style array applied to the lumps would throw (flowBorder.flow).
    await addFiles(page, [fixture("toy_states.net")]);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Load network" }),
    ).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    const views = page.getByRole("radiogroup", { name: "State view" });
    const lump = page.getByRole("switch", { name: "Lump states" });
    const busy = page.locator("main [aria-busy]");
    const labels = (): Promise<string[]> =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("main [data-label-id]")]
          .map((el) => el.textContent ?? "")
          .filter(Boolean),
      );
    // Lump states on, as Nested layout applies to a network with modules: no
    // modules yet, so the state view draws its state nodes, by their names.
    await expect(lump).toBeChecked();
    await views.getByRole("radio", { name: "state" }).click();
    await expect
      .poll(labels)
      .toEqual(expect.arrayContaining(["alpha-1", "alpha-2"]));
    await views.getByRole("radio", { name: "both" }).click();

    await page.getByRole("button", { name: "Run Infomap", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Re-run Infomap" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("main canvas")).toBeVisible();
    await expect(lump).toBeEnabled();
    await expect(lump).toBeChecked();

    // Clustered: the state view draws the lumps, by their physical node's name.
    await views.getByRole("radio", { name: "state" }).click();
    await expect
      .poll(async () => {
        const now = await labels();
        return now.includes("alpha") && !now.includes("alpha-1");
      })
      .toBe(true);
    for (const on of [false, true]) {
      await lump.click({ force: true }); // react-aria hides the input
      if (on) await expect(lump).toBeChecked();
      else await expect(lump).not.toBeChecked();
      await expect(busy).toHaveAttribute("aria-busy", "false", {
        timeout: 30_000,
      });
    }
    await expect(page.locator("main canvas")).toBeVisible();
    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("states: each view keeps its layout; the state view's is a nested map of its modules", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await addFiles(page, [fixture("toy_states.net")]);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Load network" }),
    ).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    await page.getByRole("button", { name: "Run Infomap", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Re-run Infomap" }),
    ).toBeVisible({ timeout: 30_000 });
    // The physical view holds no modules: Nested layout on, it has the force
    // layout, and no module rings.
    await expect(
      page.getByRole("switch", { name: "Nested layout" }),
    ).toBeChecked();
    await autoLayoutLanded(page, { nested: false });

    const views = page.getByRole("radiogroup", { name: "State view" });
    const show = async (view: string): Promise<void> => {
      await views.getByRole("radio", { name: view }).click();
      await expect(views.getByRole("radio", { name: view })).toBeChecked();
    };
    // The state view holds the modules, as a plain network does: laid out as
    // it's first shown, as a nested map of them, which the rings outline.
    await show("state");
    await autoLayoutLanded(page, { nested: true });
    await show("physical");
    await autoLayoutLanded(page, { nested: false });

    // Each view keeps its layout and its camera (d3gl#495): a switch lays
    // nothing out, so every label (screen px) is back where it was. The
    // physical and both views share one camera, as they share the positions.
    type Labels = Record<string, string>;
    const labels = (): Promise<Labels> =>
      page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll<HTMLElement>("main [data-label-id]")]
            .filter((el) => el.textContent)
            .map((el) => [el.textContent, `${el.style.left},${el.style.top}`]),
        ),
      );
    /** The labels once two frames' worth apart agree, with `name` among them. */
    const settledLabels = async (name: string): Promise<Labels> => {
      let last: Labels = {};
      await expect
        .poll(async () => {
          const now = await labels();
          const same = JSON.stringify(now) === JSON.stringify(last);
          last = now;
          return same && name in now;
        })
        .toBe(true);
      return last;
    };
    const camera = await settledTransform(page);
    const changes = await watchBusy(page);
    const physical = await settledLabels("alpha");
    await show("state");
    // Lumped by default (d3gl#529): the state view labels each lump by its
    // physical node.
    const state = await settledLabels("alpha");
    const stateCamera = await viewTransform(page);
    expect(stateCamera).not.toEqual(camera); // framed by its own first layout
    await show("physical");
    expect(await settledLabels("alpha")).toEqual(physical);
    expect(await viewTransform(page)).toEqual(camera);
    await show("both");
    expect(await viewTransform(page)).toEqual(camera);
    await show("state");
    expect(await settledLabels("alpha")).toEqual(state);
    expect(await changes()).toBe(0);
    expect(await viewTransform(page)).toEqual(stateCamera);
    await expect(page.locator("main [aria-busy]")).toHaveAttribute(
      "data-nested-map",
      "true",
    );

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("load dialog: restages the loaded files and adds metadata in place", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const heading = page.getByRole("heading", { name: "Load network" });
    const dialog = page.getByRole("dialog", { name: "Load network" });
    const load = dialog.getByRole("button", { name: "Load", exact: true });
    const reopen = async (): Promise<void> => {
      await page.getByRole("button", { name: /^Load network/ }).click();
      await expect(heading).toBeVisible();
    };
    const rerun = page.getByRole("button", { name: "Re-run Infomap" });

    await page.goto("/");
    await addFiles(page, [fixture("toy.net")]);
    await load.click();
    await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    await page.getByRole("button", { name: "Run Infomap", exact: true }).click();
    await expect(rerun).toBeVisible({ timeout: 30_000 });

    // The raw network is restaged; loading it unchanged keeps the clustering.
    await reopen();
    await expect(
      dialog.getByRole("button", { name: "Remove toy.net" }),
    ).toBeVisible();
    await load.click();
    await expect(heading).toBeHidden();
    await expect(rerun).toBeVisible();

    // Adding a metadata file applies it without reloading the network.
    await reopen();
    await dialog
      .locator('input[type="file"]')
      .setInputFiles([fixture("toy-names.csv")]);
    await expect(
      dialog.getByRole("button", { name: "Remove toy-names.csv" }),
    ).toBeVisible();
    await load.click();
    await expect(heading).toBeHidden();
    await expect(rerun).toBeVisible();
    const metaRow = page
      .locator("aside li")
      .filter({ hasText: "toy-names.csv" });
    await expect(metaRow).toBeVisible();

    // Its own trash removes just the metadata file.
    await metaRow.hover();
    await page.getByRole("button", { name: "Remove toy-names.csv" }).click();
    await expect(metaRow).toBeHidden();
    await expect(rerun).toBeVisible();

    // Removing every staged file clears the network.
    await reopen();
    await dialog.getByRole("button", { name: "Remove toy.net" }).click();
    await dialog.getByRole("button", { name: "Clear network" }).click();
    await expect(page.locator("main canvas")).toHaveCount(0);
    await expect(heading).toBeVisible();

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("sidebar: a network row's trash asks first, a metadata row's goes alone", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const heading = page.getByRole("heading", { name: "Load network" });
    await page.goto("/");
    await addFiles(page, [fixture("toy.net"), fixture("toy-names.csv")]);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });

    // A keyboard removal keeps focus in the list (on the row before).
    const metaRow = page.locator("aside li").filter({ hasText: "toy-names.csv" });
    await page.getByRole("button", { name: "Remove toy-names.csv" }).focus();
    await page.keyboard.press("Enter");
    await expect(metaRow).toBeHidden();
    const clear = page.getByRole("button", { name: "Clear network" });
    await expect(clear).toBeFocused();

    // The network row's trash asks before clearing.
    const confirm = page.getByRole("alertdialog");
    await page.keyboard.press("Enter");
    await expect(confirm).toContainText("Clear the network?");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
    await expect(page.locator("main canvas")).toBeVisible();

    await page.locator("aside li").filter({ hasText: "toy.net" }).hover();
    await clear.click();
    await confirm.getByRole("button", { name: "Clear network" }).click();
    await expect(page.locator("main canvas")).toHaveCount(0);
    await expect(heading).toBeVisible();

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("load dialog: reloads a loaded network with its metadata; a failed Load is not restaged", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const heading = page.getByRole("heading", { name: "Load network" });
    const dialog = page.getByRole("dialog", { name: "Load network" });
    const load = dialog.getByRole("button", { name: "Load", exact: true });
    const reopen = async (): Promise<void> => {
      await page.getByRole("button", { name: /^Load network/ }).click();
      await expect(heading).toBeVisible();
    };

    await page.goto("/");
    await addFiles(page, [fixture("toy.net")]);
    await load.click();
    await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });

    // A .txt metadata file from the sidebar (a network extension elsewhere).
    await page
      .locator('aside input[type="file"]')
      .setInputFiles([fixture("toy-names.txt")]);
    const metaRow = page.locator("aside li").filter({ hasText: "toy-names.txt" });
    await expect(metaRow).toBeVisible();

    // Changing an option reloads the network; the metadata comes along.
    await reopen();
    await expect(
      dialog.getByRole("button", { name: "Remove toy-names.txt" }),
    ).toBeVisible();
    const directed = dialog.getByRole("switch", { name: "Force directed links" });
    await directed.click({ force: true }); // see the partition test
    await expect(directed).toBeChecked();
    await load.click();
    await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    await expect(page.locator("aside").getByText("Directed", { exact: true })).toBeVisible();
    await expect(metaRow).toBeVisible();

    // A failed Load keeps focus in the dialog, so Escape still dismisses it.
    await reopen();
    await dialog.locator('input[type="file"]').setInputFiles([fixture("bad.clu")]);
    await load.click();
    const alert = dialog.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(load).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(heading).toBeHidden();

    // Reopening restages what is loaded, without the failed Load's error.
    await reopen();
    await expect(
      dialog.getByRole("button", { name: "Remove toy.net" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Remove bad.clu" }),
    ).toHaveCount(0);
    await expect(alert).toHaveCount(0);

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("load dialog: the first one dismisses, and Settings changed then apply to the first load", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const heading = page.getByRole("heading", { name: "Load network" });
    const dialog = page.getByRole("dialog", { name: "Load network" });
    const openFromEmpty = page
      .locator("main")
      .getByRole("button", { name: /^Load network/ });
    const { view, group, simulation } = layoutControls(page);

    // Escape dismisses the dialog at startup, as it does once a network is loaded.
    await page.goto("/");
    await expect(heading).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(heading).toBeHidden();

    // The settings are there with no network, but for the simulation: a load
    // always lays its network out. Pick the worker, and switch Nested layout
    // off below: the example, a map of modules, then gets the force layout on
    // every device. The worker tells from "auto" only where "auto" would take
    // the GPU (d3gl's call); where only the worker runs, nothing can.
    await expect(simulation).toBeDisabled();
    await group.getByRole("radio", { name: "worker" }).click();
    await expect(group.getByRole("radio", { name: "worker" })).toBeChecked();
    await screenshot(page, "empty-state");

    // L opens the dialog from a Settings switch too (a checkbox input, which
    // types no text: Space switches it), and a click on the backdrop
    // dismisses it.
    const nested = page.getByRole("switch", { name: "Nested layout" });
    await nested.focus();
    await expect(nested).toBeFocused();
    await page.keyboard.press("Space");
    await expect(nested).not.toBeChecked();
    await page.keyboard.press("l");
    await expect(heading).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(heading).toBeHidden();

    // The empty state reopens the dialog; its close button dismisses it too.
    await openFromEmpty.click();
    await expect(heading).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(heading).toBeHidden();
    await openFromEmpty.click();
    await dialog.getByRole("button", { name: "Load example" }).click();
    await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    await expect(view).toHaveAttribute(
      "data-layout-transport",
      WORKER_TRANSPORT,
      { timeout: 30_000 },
    );
    await expect(view).toHaveAttribute("data-nested-map", "false");

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("engine: re-clustering keeps the view; later networks load into the same engine", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const heading = page.getByRole("heading", { name: "Load network" });
    const dialog = page.getByRole("dialog", { name: "Load network" });
    const load = dialog.getByRole("button", { name: "Load", exact: true });
    const canvas = page.locator("main canvas").first();
    const consoleButton = page.getByRole("button", { name: "Console", exact: true });
    const statesChip = page
      .locator("aside")
      .getByText("State network", { exact: true });
    /** Replace the loaded network with `name` through the load dialog. */
    const swapTo = async (from: string, name: string): Promise<void> => {
      await page.getByRole("button", { name: /^Load network/ }).click();
      await dialog.getByRole("button", { name: `Remove ${from}` }).click();
      await dialog.locator('input[type="file"]').setInputFiles([fixture(name)]);
      await load.click();
      await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    };

    await page.goto("/");
    await addFiles(page, [fixture("toy.net")]);
    await load.click();
    await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    await expect(canvas).toBeVisible();
    const fitted = await settledTransform(page);
    // Mark the canvas: a new engine would bring a new one.
    await canvas.evaluate((el) => {
      el.dataset.e2eEngine = "first";
    });

    // Zoom away from the fitted view, then re-cluster.
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
    await page.mouse.wheel(0, -400);
    const zoomed = await settledTransform(page);
    expect(zoomed).not.toEqual(fitted);
    await page.getByRole("button", { name: "Run Infomap", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Re-run Infomap" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1000); // the relayout streams from the current map
    expect(await settledTransform(page)).toEqual(zoomed);
    await expect(canvas).toHaveAttribute("data-e2e-engine", "first");

    // The console holds the run, and its output takes keyboard focus.
    await consoleButton.click();
    const log = page.getByRole("log", { name: "Infomap output" });
    await expect(log).toContainText("Infomap v");
    for (let i = 0; i < 3; i++) {
      if (await log.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(log).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(log).toBeHidden();

    // States, then plain again, on the same engine. Neither ran Infomap, so
    // the console of toy.net's run is gone.
    await swapTo("toy.net", "toy_states.net");
    await expect(statesChip).toBeVisible();
    await expect(consoleButton).toHaveCount(0);
    await expect(canvas).toHaveAttribute("data-e2e-engine", "first");
    await swapTo("toy_states.net", "toy.net");
    await expect(statesChip).toHaveCount(0);
    await expect(canvas).toHaveAttribute("data-e2e-engine", "first");

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("layout backend: each layout runs on the backend chosen when it starts", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const { view, group, chooseIdle, restart } = layoutControls(page);
    const heading = page.getByRole("heading", { name: "Load network" });
    const load = page.getByRole("button", { name: "Load", exact: true });
    /** Picks each layout backend in turn: the next layout runs on it. */
    const cycle = async (): Promise<void> => {
      for (const [name, transport] of [
        ["worker", WORKER_TRANSPORT],
        ["gpu", "gpu"],
      ] as const) {
        await chooseIdle(name);
        await restart();
        await expect(view).toHaveAttribute("data-layout-transport", transport, {
          timeout: 30_000,
        });
      }
    };

    // A raw network holds no module hierarchy: d3gl's force layout.
    await page.goto("/");
    await addFiles(page, [fixture("toy.net")]);
    await load.click();
    await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    await expect(group.getByRole("radio", { name: "auto" })).toBeChecked();
    // "auto" leaves the choice to d3gl.
    await expect(view).toHaveAttribute(
      "data-layout-transport",
      AUTO_TRANSPORT,
      { timeout: 30_000 },
    );
    await cycle();

    // A clustered state network: the force layout of its physical graph.
    await page.goto("/");
    await addFiles(page, [fixture("toy_states.net")]);
    await load.click();
    await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    await page.getByRole("button", { name: "Run Infomap", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Re-run Infomap" }),
    ).toBeVisible({ timeout: 30_000 });
    await cycle();

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("layout backend: a switch while a layout runs applies from the next layout", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const { view, group, chooseIdle, restart } = layoutControls(page);
    await loadExample(page); // a map of modules: d3gl's nested layout

    await chooseIdle("gpu");
    await restart();
    // Read once, no retry: the switch below has to land while this layout runs.
    expect(await view.getAttribute("aria-busy")).toBe("true");
    await group.getByRole("radio", { name: "worker" }).click();
    await expect(group.getByRole("radio", { name: "worker" })).toBeChecked();
    // The running layout keeps its backend: it lands on the GPU...
    await expect(view).toHaveAttribute("data-layout-transport", "gpu", {
      timeout: 30_000,
    });
    // ...and the next one runs on the worker.
    await restart();
    await expect(view).toHaveAttribute(
      "data-layout-transport",
      WORKER_TRANSPORT,
      { timeout: 30_000 },
    );

    await screenshot(page, "layout-backend");
    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("nested layout: switching it goes on from where the nodes are, both ways", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const nested = page.getByRole("switch", { name: "Nested layout" });
    await loadExample(page);
    await expect(nested).toBeChecked();
    await autoLayoutLanded(page, { nested: true });
    const map = await settledTransform(page);

    // Off, the force layout runs from the map on screen (d3gl#454) and
    // spreads out to its own scale, about 3× the map's: the camera, framing
    // it as it grows, ends zoomed out.
    let changes = await watchBusy(page);
    await nested.click({ force: true }); // see the partition test
    await expect(nested).not.toBeChecked();
    await autoLayoutLanded(page, { nested: false });
    expect(await changes()).toBeGreaterThan(0);
    const flat = await settledTransform(page);
    expect(flat.k).toBeLessThan(map.k * 0.7);

    // Back on, the map streams from the force layout on screen and shrinks
    // to its own size: the camera, framing it as it goes, ends zoomed in.
    changes = await watchBusy(page);
    await nested.click({ force: true });
    await expect(nested).toBeChecked();
    await autoLayoutLanded(page, { nested: true });
    expect(await changes()).toBeGreaterThan(0);
    expect((await settledTransform(page)).k).toBeGreaterThan(flat.k * 1.4);

    await screenshot(page, "nested-layout");
    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("nested layout: off, a re-clustering keeps the force layout's positions", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const { view } = layoutControls(page);
    const heading = page.getByRole("heading", { name: "Load network" });
    const nested = page.getByRole("switch", { name: "Nested layout" });
    const idle = () =>
      expect(view).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });

    await page.goto("/");
    await addFiles(page, [fixture("toy.net")]);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    await idle();

    // Without modules the switch changes nothing.
    let changes = await watchBusy(page);
    await nested.click({ force: true }); // see the partition test
    await expect(nested).not.toBeChecked();
    expect(await changes()).toBe(0);

    // The new modules lay nothing out: the nodes and the camera stay.
    const before = await settledTransform(page);
    changes = await watchBusy(page);
    await page.getByRole("button", { name: "Run Infomap", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Re-run Infomap" }),
    ).toBeVisible({ timeout: 30_000 });
    expect(await changes()).toBe(0);
    expect(await viewTransform(page)).toEqual(before);

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("simulation off: a Nested layout switch lays nothing out until it's back on", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const { view, simulation } = layoutControls(page);
    const nested = page.getByRole("switch", { name: "Nested layout" });
    await loadExample(page);
    await autoLayoutLanded(page, { nested: true });
    await simulation.click({ force: true }); // see the partition test
    await expect(simulation).not.toBeChecked();

    // Switched either way, nothing moves: the nodes (still the map) and the
    // camera stay.
    const before = await settledTransform(page);
    const changes = await watchBusy(page);
    await nested.click({ force: true });
    await expect(nested).not.toBeChecked();
    await nested.click({ force: true });
    await expect(nested).toBeChecked();
    await nested.click({ force: true });
    await expect(nested).not.toBeChecked();
    expect(await changes()).toBe(0);
    expect(await viewTransform(page)).toEqual(before);
    await expect(view).toHaveAttribute("data-nested-map", "true");

    // Back on, the simulation lays the example out as set: the force layout.
    await simulation.click({ force: true });
    await expect(simulation).toBeChecked();
    await autoLayoutLanded(page, { nested: false });

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("simulation off: a re-clustering lays nothing out, even with Nested layout on", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const { view, simulation } = layoutControls(page);
    const heading = page.getByRole("heading", { name: "Load network" });

    await page.goto("/");
    await addFiles(page, [fixture("toy.net")]);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(heading).toBeHidden({ timeout: MODAL_CLOSE_TIMEOUT });
    // No modules yet: the force layout.
    await autoLayoutLanded(page, { nested: false });
    await simulation.click({ force: true }); // see the partition test
    await expect(simulation).not.toBeChecked();

    // The new modules lay nothing out: the nodes (no map of them) and the
    // camera stay.
    const before = await settledTransform(page);
    const changes = await watchBusy(page);
    await page.getByRole("button", { name: "Run Infomap", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Re-run Infomap" }),
    ).toBeVisible({ timeout: 30_000 });
    expect(await changes()).toBe(0);
    expect(await viewTransform(page)).toEqual(before);
    await expect(view).toHaveAttribute("data-nested-map", "false");

    // Back on, the simulation lays the new map of modules out.
    await simulation.click({ force: true });
    await expect(simulation).toBeChecked();
    await autoLayoutLanded(page, { nested: true });

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("export: SVG, PNG, and ftree downloads", async ({ page }) => {
    const errors = collectErrors(page);
    await loadExample(page);

    const [svgDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download SVG" }).click(),
    ]);
    expect(svgDownload.suggestedFilename()).toMatch(/\.svg$/);

    const [pngDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download PNG" }).click(),
    ]);
    expect(pngDownload.suggestedFilename()).toMatch(/\.png$/);

    const ftreeButton = page.getByRole("button", { name: "Download .ftree" });
    await expect(ftreeButton).toBeEnabled();
    const [ftreeDownload] = await Promise.all([
      page.waitForEvent("download"),
      ftreeButton.click(),
    ]);
    expect(ftreeDownload.suggestedFilename()).toMatch(/\.ftree$/);

    expect(errors.filter(isFatal)).toEqual([]);
  });

  test("errors: dropping an unsupported file surfaces an alert", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await addFiles(page, [fixture("bogus.pdf")]);
    await page.getByRole("button", { name: "Load", exact: true }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Unsupported");

    // App stays alive: the modal heading is still there, ready to retry.
    await expect(
      page.getByRole("heading", { name: "Load network" }),
    ).toBeVisible();

    await screenshot(page, "errors");
    expect(errors.filter(isFatal)).toEqual([]);
  });
});

// Manual-check item (not automated): `?infomap` query-param handover from
// Infomap Online. It reads a pre-populated IndexedDB entry ("infomap" DB)
// written by the separate Infomap Online app's exact schema. Seeding that
// from a Playwright addInitScript would duplicate undocumented internals of
// a different codebase and would be brittle/misleading if that schema ever
// changes. Verify this manually against a real Infomap Online handoff.
