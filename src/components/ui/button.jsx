import React from 'react';

export function Button({ children, variant = 'default', className = '', ...props }) {
  const styles = {
    default: 'bg-emerald-600 text-white hover:bg-emerald-500',
    secondary: 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600',
    outline: 'border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white'
  };

  return (
    <button 
      className={`
        inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium 
        transition-colors duration-200 ${styles[variant]} ${className}
      `} 
      {...props}
    >
      {children}
    </button>
  );
}