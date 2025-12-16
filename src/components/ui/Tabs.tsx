import React, { useState } from 'react';

interface TabsProps {
  children: React.ReactElement<TabProps>[];
  defaultTab: string;
}

interface TabProps {
  name: string;
  children: React.ReactNode;
}

export function Tabs({ children, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const activeContent = React.Children.toArray(children).find(
    (child) => (child as React.ReactElement<TabProps>).props.name === activeTab
  );

  return (
    <div>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          {React.Children.map(children, (child) => {
            const tabName = (child as React.ReactElement<TabProps>).props.name;
            return (
              <button
                key={tabName}
                onClick={() => setActiveTab(tabName)}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
                    activeTab === tabName
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tabName}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="pt-5">
        {activeContent}
      </div>
    </div>
  );
}

export function Tab({ name, children }: TabProps) {
  return <div data-tab-name={name}>{children}</div>;
}
