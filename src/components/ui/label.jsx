import React from 'react';
export function Label({ children, className = '' }) {
  return <label className={`eh-label ${className}`}>{children}</label>;
}