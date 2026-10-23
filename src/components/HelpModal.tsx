import { Kbd, Modal } from "@heroui/react";
import { observer } from "mobx-react-lite";
import type { ReactNode } from "react";
import { useStores } from "../stores";
import { SEARCH_SHORTCUT } from "./Search";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
      {children}
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-neutral-600">
      {children}
    </ul>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="text-blue-600 underline"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

const KEYS: [ReactNode, string][] = [
  [<Kbd key="l">L</Kbd>, "Load a network"],
  [<Kbd key="k">{SEARCH_SHORTCUT}</Kbd>, "Search nodes"],
];

export const HelpModal = observer(function HelpModal() {
  const { ui } = useStores();
  return (
    <Modal.Backdrop isOpen={ui.helpOpen} onOpenChange={ui.setHelpOpen}>
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Help</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-5">
            <Section title="Load a network">
              <p className="text-sm text-neutral-600">
                Press <Kbd>L</Kbd> or Load network, then drop or pick files:
              </p>
              <List>
                <li>
                  An <code>.ftree</code> file: an Infomap result, with its
                  modules and flow.
                </li>
                <li>
                  A network: Pajek (<code>.net</code>, <code>.paj</code>) or an
                  edge list (<code>.txt</code>, <code>.edges</code>,{" "}
                  <code>.edgelist</code>), a state network with its{" "}
                  <code>*States</code> section too. Add a <code>.tree</code> or{" "}
                  <code>.clu</code> partition for its modules, or find them with
                  Run Infomap in the Modules section.
                </li>
                <li>
                  Metadata: <code>.csv</code> or <code>.tsv</code> lists of node
                  names. Metadata overlap colours each list's nodes and shows
                  how many a selected module holds against chance.
                </li>
              </List>
              <p className="text-sm text-neutral-600">
                The examples are a citation network, an <code>.ftree</code> with
                its modules, and Les Misérables, a <code>.net</code> state
                network without modules, for you to run Infomap on. Open from
                Infomap Online loads a network you ran there. See the{" "}
                <Link href="https://mapequation.org/infomap/">
                  Infomap documentation
                </Link>{" "}
                for the file formats.
              </p>
            </Section>
            <Section title="Navigate">
              <List>
                <li>Scroll or pinch to zoom, drag the background to pan.</li>
                <li>
                  Click a node or module to select it and see it in the sidebar;
                  Shift-click adds to or removes from the highlight. Click the
                  background to clear it.
                </li>
                <li>
                  Double-click a module to zoom to it. The module path at the
                  top goes back up; the home button fits the whole network.
                </li>
                <li>Drag a node to move it.</li>
              </List>
            </Section>
            <Section title="Top bar">
              <List>
                <li>
                  Sizes in: <em>screen</em> keeps node and link sizes in pixels
                  at any zoom, <em>world</em> scales them with the zoom.
                </li>
                <li>
                  Aggregate by: <em>modules</em> draws a module as one node
                  until you zoom in on it, <em>spatial</em> groups nearby nodes,{" "}
                  <em>off</em> draws every node. Level of detail in the sidebar
                  tunes it.
                </li>
                <li>
                  State networks: State view shows the physical nodes, the state
                  nodes, or both; Lump states draws one node per physical node
                  in each module.
                </li>
                <li>The sidebar button hides the sidebar for more room.</li>
              </List>
            </Section>
            <Section title="Keys">
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm text-neutral-600">
                {KEYS.map(([key, what]) => (
                  <div key={what} className="contents">
                    <dt className="justify-self-start">{key}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </Section>
            <p className="text-sm text-neutral-600">
              More on Infomap and the map equation at{" "}
              <Link href="https://www.mapequation.org">mapequation.org</Link>.
              Found a problem?{" "}
              <Link href="https://github.com/mapequation/navigator/issues">
                Open an issue
              </Link>
              .
            </p>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
});
