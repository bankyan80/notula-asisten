import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div className={`rounded-2xl bg-white p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}
