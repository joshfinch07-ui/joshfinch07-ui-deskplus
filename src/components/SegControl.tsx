export function SegControl<T extends string | number>({
  options,
  value,
  onChange,
  classNameFor,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  classNameFor?: (v: T) => string;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={`${value === o.value ? 'active' : ''} ${classNameFor?.(o.value) ?? ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
