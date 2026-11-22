import type { ReactNode } from 'react';
import type { Resume } from '../types';
import { inspectResume } from '../lib/workflow';
import { useT } from '../lib/i18n';

/** A master resume can be maintained and exported without choosing an employer. */
export default function WorkflowSteps({ resume, hasJD, hasTargetReview, hasExport, hasApplication, onStep, extra }: {
  resume: Resume; hasJD: boolean; hasTargetReview: boolean; hasExport: boolean;
  hasApplication: boolean; onStep: (step: number) => void; extra?: ReactNode;
}) {
  const t = useT();
  const issues = inspectResume(resume).filter(i => i.severity === 'warning');
  const needsSourceReview = !!resume.data.metadata.source_text && !resume.data.metadata.reviewed_at;
  const steps = [
    { id: 0, label: t('完善内容', 'Complete Content'), done: !issues.length && !needsSourceReview },
    ...(resume.target ? [{ id: 1, label: t('核对岗位', 'Review JD'), done: hasJD && hasTargetReview }] : []),
    { id: 3, label: t('预览与导出', 'Preview & Export'), done: hasExport },
    ...(resume.target ? [{ id: 4, label: t('记录投递', 'Log Application'), done: hasApplication }] : []),
  ];
  const next = steps.find(step => !step.done);
  return <nav aria-label={t('求职流程', 'Resume workflow')} className="shrink-0 bg-page/80 px-3 pb-1.5 pt-0.5 text-[12px] sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <details className="min-w-0">
        <summary className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-subtle px-3 py-1 text-ink-600 transition-colors hover:bg-paper-200 hover:text-ink-900">
          <span>{resume.target ? t('岗位投递', 'Job Application') : t('通用简历', 'Master Resume')}</span>
          <span className="text-ink-400">·</span>
          <span>{next ? t(`下一步：${next.label}`, `Next: ${next.label}`) : t('已完成', 'Done')}</span>
          {issues.length > 0 && <span className="rounded-full bg-seal-100 px-2 py-0.5 text-[11px] font-medium text-seal-700">{t(`${issues.length} 待核对`, `${issues.length} to review`)}</span>}
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5 pb-1">
          {steps.map(step => <button key={step.id} onClick={() => onStep(step.id)}
            aria-current={next?.id === step.id ? 'step' : undefined}
            className={`rounded-full px-3 py-1 text-[12px] transition-colors ${next?.id === step.id ? 'glass-lens font-semibold' : 'bg-subtle text-ink-600 hover:bg-paper-200'}`}>
            {step.label}{step.done ? ' ✓' : ''}
          </button>)}
        </div>
      </details>
      {extra}
    </div>
  </nav>;
}
