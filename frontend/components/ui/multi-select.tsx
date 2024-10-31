import React from 'react';
import { Command } from 'cmdk';

interface Option {
  label: string;
  value: string | number;
}

interface MultiSelectProps {
  options: Option[];
  selected: (string | number)[];
  onChange: (selected: (string | number)[]) => void;
  placeholder?: string;
}

export function MultiSelect({ options = [], selected = [], onChange, placeholder = 'Select...' }: MultiSelectProps) {
  const handleSelect = (value: string | number) => {
    const newSelected = selected.includes(value)
      ? selected.filter(item => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  return (
    <Command>
      <Command.Input placeholder={placeholder} />
      <Command.List>
        {options.map((option) => (
          <Command.Item
            key={option.value}
            value={option.value.toString()}
            onSelect={() => handleSelect(option.value)}
          >
            {option.label}
            {selected.includes(option.value) && ' ✓'}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}