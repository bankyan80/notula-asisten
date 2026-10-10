import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}

function FieldShell({ label, error, hint, htmlFor, children }: FieldShellProps) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>
      )}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  fieldId: string;
}

export function TextField({
  label,
  error,
  hint,
  fieldId,
  className = '',
  ...rest
}: TextFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={fieldId}>
      <input
        id={fieldId}
        className={`w-full rounded-2xl border bg-white px-4 py-3.5 text-base text-ink outline-none placeholder:text-muted/70 focus:border-brand ${
          error ? 'border-danger' : 'border-line'
        } ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  fieldId: string;
}

export function TextAreaField({
  label,
  error,
  hint,
  fieldId,
  className = '',
  ...rest
}: TextAreaFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={fieldId}>
      <textarea
        id={fieldId}
        className={`w-full rounded-2xl border bg-white px-4 py-3.5 text-base text-ink outline-none placeholder:text-muted/70 focus:border-brand ${
          error ? 'border-danger' : 'border-line'
        } ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  fieldId: string;
  options: Array<{ value: string; label: string }>;
}

export function SelectField({
  label,
  error,
  hint,
  fieldId,
  options,
  className = '',
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={fieldId}>
      <select
        id={fieldId}
        className={`w-full appearance-none rounded-2xl border bg-white px-4 py-3.5 text-base text-ink outline-none focus:border-brand ${
          error ? 'border-danger' : 'border-line'
        } ${className}`}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
