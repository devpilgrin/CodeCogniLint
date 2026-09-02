import { useEffect } from 'react';
import { useI18n } from '../i18n';
import { Button } from './ui/Button';

interface Props {
  visible: boolean;
  progress: number;
  stepLabel: string;
  onCancel?: () => void;
}

export function AnalysisOverlay({ visible, progress, stepLabel, onCancel }: Props) {
  const { t } = useI18n();

  // Закрытие (отмена) по Esc
  useEffect(() => {
    if (!visible || !onCancel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [visible, onCancel]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-(--z-overlay) flex items-center justify-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('overlay.title')}
        className="bg-bg-surface border border-blue-500/30 p-8 rounded-xl shadow-2xl flex flex-col items-center max-w-sm w-full text-center"
      >
        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
        <h3 className="text-white font-bold text-lg mb-2">{t('overlay.title')}</h3>
        <p className="text-text-secondary text-sm mb-4">
          {t('overlay.hint')}
        </p>
        <div className="w-full h-1 bg-border-default rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-[10px] text-text-muted uppercase tracking-widest font-bold">
          {stepLabel}
        </div>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="mt-4">
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}
