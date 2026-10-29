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
          {label && <div className="text-sm font-medium text-slate-200">{label}</div>}
          {subLabel && <div className="text-xs text-slate-400">{subLabel}</div>}
        </div>
        <span className="text-sm font-semibold text-[#00b0ff] bg-[#1a2533] px-2 py-0.5 rounded border border-[#2c3c50]">
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
        className="w-full h-1.5 bg-[#25303d] rounded-lg appearance-none cursor-pointer accent-[#00b0ff]"
      />
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
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
