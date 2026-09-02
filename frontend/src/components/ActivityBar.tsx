import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileCode, faSearch, faCodeMerge,
  faCog, faList, faShieldHalved, faGaugeHigh,
} from '@fortawesome/free-solid-svg-icons';
import { useI18n } from '../i18n';

type Panel = 'explorer' | 'search' | 'git' | 'rules' | 'settings' | 'security' | 'quality';

interface Props {
  activePanel: Panel;
  onSelect: (panel: Panel) => void;
}

export function ActivityBar({ activePanel, onSelect }: Props) {
  const { t } = useI18n();
  const items: { panel: Panel; icon: typeof faFileCode; label: string }[] = [
    { panel: 'explorer', icon: faFileCode, label: t('panel.explorer') },
    { panel: 'search', icon: faSearch, label: t('panel.search') },
    { panel: 'git', icon: faCodeMerge, label: t('panel.git') },
    { panel: 'security', icon: faShieldHalved, label: t('panel.security') },
    { panel: 'quality', icon: faGaugeHigh, label: t('panel.quality') },
    { panel: 'rules', icon: faList, label: t('panel.rules') },
    { panel: 'settings', icon: faCog, label: t('panel.settings') },
  ];

  return (
    <nav className="w-12 border-r border-border-default bg-bg-canvas flex flex-col items-center py-4 space-y-6 text-text-muted flex-shrink-0">
      {items.slice(0, 6).map(({ panel, icon, label }) => (
        <button
          key={panel}
          title={label}
          aria-label={label}
          aria-current={activePanel === panel ? 'page' : undefined}
          onClick={() => onSelect(panel)}
          className={`text-xl cursor-pointer transition-colors ${activePanel === panel ? 'text-gray-200' : 'hover:text-gray-200'}`}
        >
          <FontAwesomeIcon icon={icon} />
        </button>
      ))}
      <div className="flex-1" />
      <button
        title={t('panel.settings')}
        aria-label={t('panel.settings')}
        aria-current={activePanel === 'settings' ? 'page' : undefined}
        onClick={() => onSelect('settings')}
        className={`text-xl cursor-pointer transition-colors ${activePanel === 'settings' ? 'text-gray-200' : 'hover:text-gray-200'}`}
      >
        <FontAwesomeIcon icon={faCog} />
      </button>
    </nav>
  );
}
