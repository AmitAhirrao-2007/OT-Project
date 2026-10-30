import React from 'react';

interface SliderProps {
  id?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (val: number) => void;
  unit?: string;
  label?: string;
  subLabel?: string;
}

export const Slider: React.FC<SliderProps> = ({
  id,
  min,
  max,
  step = 1,
  value,
  onChange,
  unit = '%',
  label,
  subLabel
}) => {
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          {label && <div className="text-sm font-semibold text-content-primary">{label}</div>}
          {subLabel && <div className="text-xs text-content-secondary">{subLabel}</div>}
        </div>
        <span className="text-sm font-bold text-brand-primary bg-surface-subtle px-2.5 py-0.5 rounded-md border border-edge-subtle">
          {value}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-surface-hover rounded-lg appearance-none cursor-pointer accent-brand-primary"
      />
      <div className="flex justify-between text-[10px] text-content-muted mt-1 font-mono">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
};

