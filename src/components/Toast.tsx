import { useEffect } from 'react';

export function Toast({
  message,
  onDone,
  action,
  duration = 2400,
}: {
  message: string;
  onDone: () => void;
  action?: { label: string; onClick: () => void };
  duration?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message, onDone, duration]);
  return (
    <div className="toast" role="status">
      {message}
      {action ? (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            action.onClick();
            onDone();
          }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
