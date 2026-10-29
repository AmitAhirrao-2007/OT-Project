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
      className={`inline-flex items-center p-1 bg-[#151c24] border border-[#2a3746] rounded-lg ${className}`}
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
            className={`flex-1 flex flex-col items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 relative ${
              isSelected
                ? 'bg-[#2b3a4a] text-white shadow-sm font-semibold border border-[#3b4f66]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#1f2935]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {opt.label}
              {opt.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                    isSelected
                      ? 'bg-[#00b0ff] text-slate-950 font-bold'
                      : 'bg-emerald-900/60 text-emerald-300'
                  }`}
                >
                  {opt.badge}
                </span>
              )}
            </span>
            {opt.subLabel && (
              <span className="text-[10px] text-slate-400 mt-0.5">
                {opt.subLabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
