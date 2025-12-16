import React from 'react';

interface MainLayoutProps {
  header: React.ReactNode;
  children: React.ReactNode;
}

export function MainLayout({ header, children }: MainLayoutProps) {
  return (
    <div className="bg-gray-100 min-h-screen font-sans text-gray-800">
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3">
          {header}
        </div>
      </header>
      <main className="container mx-auto p-4">
        {children}
      </main>
    </div>
  );
}
