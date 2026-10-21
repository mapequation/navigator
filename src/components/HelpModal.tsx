import { Modal } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useStores } from "../stores";

export const HelpModal = observer(function HelpModal() {
  const { ui } = useStores();
  return (
    <Modal.Backdrop isOpen={ui.helpOpen} onOpenChange={ui.setHelpOpen}>
      <Modal.Container size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Help</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p className="text-sm text-neutral-600">
              Documentation is coming soon. Meanwhile, see{" "}
              <a
                className="text-blue-600 underline"
                href="https://www.mapequation.org"
                target="_blank"
                rel="noreferrer"
              >
                mapequation.org
              </a>{" "}
              for Infomap and the map equation.
            </p>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
});
