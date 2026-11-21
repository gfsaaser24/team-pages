import { useEffect, useState } from "react";
import { cn } from "cn";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import type { Property, Value } from "@/lib/model";

export interface Person {
  id: string;
  email: string;
}

/** A text field that commits on Enter or when it loses focus. */
export function CommitInput({
  value,
  onCommit,
  testId,
  type = "text",
  readOnly,
  className,
  label,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  testId?: string;
  type?: string;
  readOnly?: boolean;
  className?: string;
  label: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <Input
      data-testid={testId}
      aria-label={label}
      type={type}
      value={text}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        if (type === "date") {
          // A date picker commits as soon as a day is picked.
          if (e.target.value !== value) onCommit(e.target.value);
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className={cn("h-8 border-transparent bg-transparent shadow-none hover:border-input focus:border-input", className)}
    />
  );
}

/** The editor for one property value of one row. */
export function PropertyInput({
  property: p,
  value,
  people,
  canEdit,
  testId,
  onChange,
}: {
  property: Property;
  value: Value | undefined;
  people: Person[];
  canEdit: boolean;
  testId: string;
  onChange: (value: Value) => void;
}) {
  switch (p.type) {
    case "checkbox":
      return (
        <Checkbox
          data-testid={testId}
          aria-label={p.name}
          checked={value === true}
          disabled={!canEdit}
          onCheckedChange={(c) => onChange(!!c)}
        />
      );
    case "select":
    case "status":
    case "person": {
      const options =
        p.type === "person"
          ? people.map((u) => ({ value: u.id, label: u.email }))
          : p.options.map((o) => ({ value: o.id, label: o.name }));
      return (
        <SimpleSelect
          testId={testId}
          label={p.name}
          value={typeof value === "string" ? value : null}
          options={[...options, ...(value ? [{ value: "__none", label: "Clear" }] : [])]}
          disabled={!canEdit}
          placeholder="Empty"
          className="border-transparent bg-transparent hover:border-input"
          onChange={(v) => onChange(v === "__none" ? null : v)}
        />
      );
    }
    case "multi_select": {
      const picked = Array.isArray(value) ? value : [];
      const names = p.options.filter((o) => picked.includes(o.id)).map((o) => o.name);
      return (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={!canEdit}
            render={
              <Button data-testid={testId} variant="ghost" size="sm" className="max-w-56 justify-start font-normal">
                <span className={cn("truncate", !names.length && "text-muted-foreground")}>
                  {names.length ? names.join(", ") : "Empty"}
                </span>
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {p.options.length ? (
              p.options.map((o) => (
                <DropdownMenuCheckboxItem
                  key={o.id}
                  checked={picked.includes(o.id)}
                  onCheckedChange={(c) =>
                    onChange(c ? [...picked, o.id] : picked.filter((x) => x !== o.id))
                  }
                >
                  {o.name}
                </DropdownMenuCheckboxItem>
              ))
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Add options in Properties</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    case "number":
      return (
        <CommitInput
          testId={testId}
          label={p.name}
          type="number"
          readOnly={!canEdit}
          value={typeof value === "number" ? String(value) : ""}
          onCommit={(t) => onChange(t === "" ? null : Number(t))}
        />
      );
    case "date":
      return (
        <CommitInput
          testId={testId}
          label={p.name}
          type="date"
          readOnly={!canEdit}
          value={typeof value === "string" ? value : ""}
          onCommit={(t) => onChange(t || null)}
        />
      );
    case "url":
      return (
        <div className="flex items-center gap-1">
          <CommitInput
            testId={testId}
            label={p.name}
            type="url"
            readOnly={!canEdit}
            value={typeof value === "string" ? value : ""}
            onCommit={(t) => onChange(t || null)}
          />
          {typeof value === "string" && /^https?:\/\//.test(value) ? (
            <a href={value} target="_blank" rel="noreferrer noopener" className="text-xs text-primary underline">
              Open
            </a>
          ) : null}
        </div>
      );
    default:
      return (
        <CommitInput
          testId={testId}
          label={p.name}
          readOnly={!canEdit}
          value={typeof value === "string" ? value : ""}
          onCommit={(t) => onChange(t || null)}
        />
      );
  }
}
