import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";

export interface Option {
  value: string;
  label: string;
}

/** A Select over plain string options; null means none picked. */
export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder,
  testId,
  size = "sm",
  className,
  disabled,
  label,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  testId?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Select
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        if (typeof v === "string") onChange(v);
      }}
    >
      <SelectTrigger
        data-testid={testId}
        size={size}
        className={className}
        aria-label={label}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
