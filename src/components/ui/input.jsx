import React from 'react';

export function Input(props) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`eh-input ${className}`} />;
}