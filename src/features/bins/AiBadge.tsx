import { Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, focusRing } from '@/lib/utils';

interface AiBadgeProps {
	onUndo: () => void;
}

export function AiBadge({ onUndo }: AiBadgeProps) {
	const { t } = useTranslation('bins');
	return (
		<span className="inline-flex items-center gap-1">
			<span
				className="text-[10px] font-semibold text-[var(--ai-accent)] bg-[var(--ai-accent)]/10 px-1.5 py-px rounded-[var(--radius-xs)]"
				aria-hidden="true"
			>
				{t('aiBadge.label', { defaultValue: 'AI' })}
			</span>
			<button
				type="button"
				onClick={onUndo}
				className={cn('p-2 -m-2 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] transition-colors', focusRing)}
				aria-label={t('aiBadge.undo', { defaultValue: 'Undo AI suggestion' })}
			>
				<Undo2 className="h-3 w-3" />
			</button>
		</span>
	);
}
