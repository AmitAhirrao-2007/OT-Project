interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  badge?: string;
  subLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (val: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = ''
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      className={`inline-flex items-center p-1 bg-surface-subtle border border-edge-subtle rounded-lg ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.value)}
            className={`flex-1 flex flex-col items-center justify-center px-3 py-1.5 text-xs rounded-md transition-all duration-150 relative ${
              isSelected
                ? 'bg-surface-panel text-content-primary font-bold shadow-card border border-edge-default'
                : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span>{opt.label}</span>
              {opt.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                    isSelected
                      ? 'bg-status-success text-white'
                      : 'bg-status-successSubtle text-status-success border border-status-success/30'
                  }`}
                >
                  {opt.badge}
                </span>
              )}
            </span>
            {opt.subLabel && (
              <span
                className={`text-[10px] mt-0.5 ${
                  isSelected ? 'text-content-secondary' : 'text-content-muted'
                }`}
              >
                {opt.subLabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
