interface SubTabsProps<T extends string> {
  tabs: { key: T; label: string }[];
  activeTab: T;
  onTabChange: (tab: T) => void;
}

// Horizontal scroll on narrow viewports so a row of 5+ sub-tabs
// (e.g. Metadata Providers: Movies & TV / Books / Audiobooks / Games
// / Manga / Comics) never overflows the parent. flex-shrink-0 on
// each button keeps labels readable instead of compressing.
const SubTabs = <T extends string>({
  tabs,
  activeTab,
  onTabChange,
}: SubTabsProps<T>) => (
  <div className="hide-scrollbar mb-6 flex overflow-x-auto whitespace-nowrap border-b border-gray-600">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        className={`flex-shrink-0 px-4 py-2 text-sm font-medium transition ${
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
