import { openUrl } from '@tauri-apps/plugin-opener';

export const HelpButton: React.FC = () => {
  const openDocs = async () => {
    try {
      // Open the GitHub repo docs or a local file if possible
      // For now, we'll point to the GitHub repo as it's the most reliable online source
      await openUrl('https://github.com/ganeshmshetty/scrcpygui/blob/main/docs/USER_GUIDE.md');
    } catch (error) {
      console.error('Failed to open documentation:', error);
    }
  };

  return (
    <button
      onClick={openDocs}
      className="p-2 text-gray-500 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
      title="Open User Guide"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    </button>
  );
};
