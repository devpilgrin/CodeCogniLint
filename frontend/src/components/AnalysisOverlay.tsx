import { useI18n } from '../i18n';

interface Props {
  visible: boolean;
  progress: number;
  stepLabel: string;
}

export function AnalysisOverlay({ visible, progress, stepLabel }: Props) {
  const { t } = useI18n();
  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center">
      <div className="bg-[#161b22] border border-blue-500/30 p-8 rounded-xl shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
        <h3 className="text-white font-bold text-lg mb-2">{t('overlay.title')}</h3>
        <p className="text-gray-400 text-sm mb-4">
          {t('overlay.hint')}
        </p>
        <div className="w-full h-1 bg-[#30363d] rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-[10px] text-gray-500 uppercase tracking-widest font-bold">
          {stepLabel}
        </div>
      </div>
    </div>
  );
}
