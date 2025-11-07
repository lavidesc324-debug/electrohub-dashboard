import React, { createContext, useContext, useState } from 'react';

const TabsContext = createContext({});

export function Tabs({ children, defaultValue }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      {children}
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 p-2 bg-gray-800/30 rounded-xl ${className}`}>
      {children}
    </div>
  );
}

export function TabsTrigger({ children, value, className = '' }) {
  const ctx = useContext(TabsContext);
  const active = ctx.value === value;
  
  return (
    <button
      className={`
        px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
        ${active 
          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        } 
        ${className}
      `}
      onClick={() => ctx.setValue && ctx.setValue(value)}
      aria-selected={active}
    >
      {children}
    </button>
  );
}

export function TabsContent({ children, value, className = '' }) {
  const ctx = useContext(TabsContext);
  if (ctx.value !== value) return null;
  return <div className={`mt-4 ${className}`}>{children}</div>;
}