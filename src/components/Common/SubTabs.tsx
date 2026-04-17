interface SubTabsProps<T extends string> {
  tabs: { key: T; label: string }[];
  activeTab: T;
  onTabChange: (tab: T) => void;
}

const SubTabs = <T extends string>({
  tabs,
  activeTab,
  onTabChange,
}: SubTabsProps<T>) => (
  <div className="mb-6 flex border-b border-gray-600">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        className={`px-4 py-2 text-sm font-medium transition ${
          activeTab === tab.key
            ? 'border-b-2 border-indigo-500 text-indigo-400'
            : 'text-gray-400 hover:text-gray-300'
        }`}
        onClick={() => onTabChange(tab.key)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export default SubTabs;
