import type { ReactNode } from 'react';
import { Select } from './Select';

type Props = {
  id: string; value: string; options: readonly string[]; placeholder: string; disabled?: boolean;
  'aria-invalid': boolean; 'aria-required'?: boolean; 'aria-describedby'?: string;
  icon: ReactNode; onChange: (value: string) => void;
};

export function LocationSelect({ value, options, placeholder, disabled, ...props }: Props) {
  return <Select {...props} value={value} disabled={disabled || !options.length} options={[{ value: '', label: placeholder }, ...options.map(label => ({ value: label, label }))]} placeholder={placeholder}/>;
}
