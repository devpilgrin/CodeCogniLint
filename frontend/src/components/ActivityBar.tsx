import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileCode, faSearch, faCodeMerge,
  faCog, faList,
} from '@fortawesome/free-solid-svg-icons';

type Panel = 'explorer' | 'search' | 'git' | 'rules' | 'settings';

interface Props {
  activePanel: Panel;
  onSelect: (panel: Panel) => void;
}

const items: { panel: Panel; icon: typeof faFileCode; label: string }[] = [
  { panel: 'explorer', icon: faFileCode, label: 'Проводник' },
  { panel: 'search', icon: faSearch, label: 'Поиск' },
  { panel: 'git', icon: faCodeMerge, label: 'Git' },
  { panel: 'rules', icon: faList, label: 'Правила' },
  { panel: 'settings', icon: faCog, label: 'Настройки' },
];

export function ActivityBar({ activePanel, onSelect }: Props) {
  return (
    <nav className="w-12 border-r border-[#30363d] bg-[#0d1117] flex flex-col items-center py-4 space-y-6 text-gray-500 flex-shrink-0">
      {items.slice(0, 4).map(({ panel, icon, label }) => (
        <button
          key={panel}
          title={label}
          onClick={() => onSelect(panel)}
          className={`text-xl cursor-pointer transition-colors ${activePanel === panel ? 'text-gray-200' : 'hover:text-gray-200'}`}
        >
          <FontAwesomeIcon icon={icon} />
        </button>
      ))}
      <div className="flex-1" />
      <button
        title="Настройки"
        onClick={() => onSelect('settings')}
        className={`text-xl cursor-pointer transition-colors ${activePanel === 'settings' ? 'text-gray-200' : 'hover:text-gray-200'}`}
      >
        <FontAwesomeIcon icon={faCog} />
      </button>
    </nav>
  );
}
