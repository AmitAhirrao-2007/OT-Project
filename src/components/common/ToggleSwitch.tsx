import React from 'react';

interface ToggleSwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false
}) => {
  return (
    <label
      htmlFor={id}
      className={`flex items-center justify-between gap-4 py-2 cursor-pointer ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <div className="flex flex-col">
        {label && <span className="text-sm font-medium text-slate-200">{label}</span>}
        {description && (
          <span className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            {description}
          </span>
        )}
      </div>
      <div className="relative inline-flex items-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
            checked ? 'bg-[#00b0ff]' : 'bg-[#2b3542]'
          } border border-[#3b4756]`}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out mt-0.5 ${
              checked ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </div>
      </div>
    </label>
  );
};

