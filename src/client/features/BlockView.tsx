import { FileText, Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Separator } from "@/client/components/ui/separator";
import { formatSize } from "@/client/lib/format";
import type { Block } from "@/lib/model";

export interface FileInfo {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export const TEXT_CLASS: Record<string, string> = {
  heading_1: "text-3xl font-semibold tracking-tight",
  heading_2: "text-2xl font-semibold tracking-tight",
  heading_3: "text-xl font-semibold",
  quote: "border-l-4 border-border pl-4 italic",
  code: "rounded-md bg-muted px-3 py-2 font-mono text-sm",
};

/** The number shown before a numbered item: its place in the run of numbered items. */
export function listNumber(blocks: Block[], index: number): number {
  let n = 1;
  for (let i = index - 1; i >= 0 && blocks[i]!.type === "numbered"; i--) n++;
  return n;
}

export function FileBlock({ file, href }: { file: FileInfo | undefined; href: string | null }) {
  if (!file || !href) return <p className="text-sm text-muted-foreground">File unavailable</p>;
  if (/^image\/(png|jpeg|gif|webp)$/.test(file.contentType))
    return (
      <figure className="space-y-1">
        <img src={href} alt={file.name} className="max-h-96 rounded-md border border-border" />
        <figcaption className="text-xs text-muted-foreground">{file.name}</figcaption>
      </figure>
    );
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
    >
      <Paperclip className="size-4 text-muted-foreground" aria-hidden />
      {file.name}
      <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
    </a>
  );
}

/** A read-only rendering of a block list. */
export function BlockView({
  blocks,
  files,
  fileHref,
  subpageLink,
}: {
  blocks: Block[];
  files: Record<string, FileInfo>;
  fileHref: (id: string) => string;
  subpageLink: (id: string) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        let body: ReactNode;
        switch (b.type) {
          case "divider":
            body = <Separator className="my-3" />;
            break;
          case "subpage":
            body = b.ref ? subpageLink(b.ref) : null;
            break;
          case "file":
            body = <FileBlock file={b.ref ? files[b.ref] : undefined} href={b.ref ? fileHref(b.ref) : null} />;
            break;
          case "code":
            body = <pre className={cn(TEXT_CLASS.code, "whitespace-pre-wrap")}>{b.text}</pre>;
            break;
          case "heading_1":
            body = <h2 className={TEXT_CLASS.heading_1}>{b.text}</h2>;
            break;
          case "heading_2":
            body = <h3 className={TEXT_CLASS.heading_2}>{b.text}</h3>;
            break;
          case "heading_3":
            body = <h4 className={TEXT_CLASS.heading_3}>{b.text}</h4>;
            break;
          default:
            body = (
              <div className="flex gap-2">
                {b.type === "bulleted" ? <span aria-hidden>•</span> : null}
                {b.type === "numbered" ? <span>{listNumber(blocks, i)}.</span> : null}
                {b.type === "todo" ? (
                  <Checkbox checked={!!b.checked} disabled aria-label="Done" className="mt-1" />
                ) : null}
                <p className={cn("whitespace-pre-wrap", b.type === "quote" && TEXT_CLASS.quote, b.checked && "text-muted-foreground line-through")}>
                  {b.text}
                </p>
              </div>
            );
        }
        return <div key={b.id}>{body}</div>;
      })}
    </div>
  );
}

export function SubpageIcon({ icon }: { icon: string | null | undefined }) {
  return icon ? <span aria-hidden>{icon}</span> : <FileText className="size-4 text-muted-foreground" aria-hidden />;
}
