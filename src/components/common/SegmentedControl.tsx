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
      className={`inline-flex items-center p-1 bg-[#181818] border border-[#2c2c2c] rounded-xl ${className}`}
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
            className={`flex-1 flex flex-col items-center justify-center px-3 py-1.5 text-xs rounded-lg transition-all duration-150 relative ${
              isSelected
                ? 'bg-[#EEEEEE] text-[#121212] font-bold shadow-md'
                : 'text-[#A8A8A8] hover:text-[#EEEEEE] hover:bg-[#222222]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span>{opt.label}</span>
              {opt.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                    isSelected
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/40'
                  }`}
                >
                  {opt.badge}
                </span>
              )}
            </span>
            {opt.subLabel && (
              <span
                className={`text-[10px] mt-0.5 ${
                  isSelected ? 'text-[#444444]' : 'text-[#707070]'
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
