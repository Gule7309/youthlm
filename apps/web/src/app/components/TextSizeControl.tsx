import React from 'react';
import { Type } from 'lucide-react';
import { TEXT_SIZE_OPTIONS, type TextSize } from '../text-size';

type TextSizeControlProps = {
  value: TextSize;
  onChange: (value: TextSize) => void;
  className?: string;
};

export function TextSizeControl({ value, onChange, className = '' }: TextSizeControlProps) {
  return (
    <label className={`flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-slate-600 shadow-sm ${className}`}>
      <Type className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">文字大小</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value as TextSize)}
        className="min-w-14 cursor-pointer bg-transparent text-sm font-medium text-slate-700 outline-none"
        aria-label="文字大小"
        title="調整整體文字與介面大小"
      >
        {TEXT_SIZE_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
