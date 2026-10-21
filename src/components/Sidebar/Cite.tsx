import { Button, Popover } from "@heroui/react";

const year = new Date().getFullYear();
const BIBTEX = `@misc{mapequation${year}software,
  title = {{The MapEquation software package}},
  author = {Edler, Daniel and Holmgren, Anton and Rosvall, Martin},
  howpublished = {\\url{https://mapequation.org}},
  year = {${year}},
}`;

export function Cite() {
  return (
    <Popover>
      <Button size="sm" variant="ghost">
        Cite
      </Button>
      <Popover.Content className="max-w-96">
        <Popover.Dialog>
          <Popover.Heading>Please cite</Popover.Heading>
          <pre className="mt-2 overflow-x-auto rounded bg-neutral-100 p-2 text-xs">
            {BIBTEX}
          </pre>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
