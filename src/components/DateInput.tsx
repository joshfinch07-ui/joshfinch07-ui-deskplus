import { useRef, type CSSProperties } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
  required?: boolean;
  id?: string;
  'aria-label'?: string;
};

/**
 * Always opens the native calendar when you interact — no typed mm/dd/yyyy entry.
 * Uses a dedicated calendar button + showPicker on every press.
 */
export function DateInput({ value, onChange, className = '', style, required, id, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    try {
      el.showPicker?.();
    } catch {
      // Older browsers: fall back to focusing the native control
    }
  };

  return (
    <div className={`date-input-wrap ${className}`.trim()} style={style}>
      <input
        {...rest}
        id={id}
        ref={ref}
        type="date"
        required={required}
        className="date-input"
        value={value}
        // Discourage typed entry; calendar is the path
        inputMode="none"
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={(e) => {
          // Keep this as a direct user gesture so showPicker works every time
          e.preventDefault();
          openPicker();
        }}
        onClick={(e) => {
          e.preventDefault();
          openPicker();
        }}
        onKeyDown={(e) => {
          // Block typing digits; allow Tab / Esc / arrows for a11y
          if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            openPicker();
          }
        }}
      />
      <button
        type="button"
        className="date-input-btn"
        aria-label="Open calendar"
        tabIndex={-1}
        onMouseDown={(e) => {
          e.preventDefault();
          openPicker();
        }}
      >
        📅
      </button>
    </div>
  );
}
