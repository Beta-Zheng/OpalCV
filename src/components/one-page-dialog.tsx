import { useEffect, useMemo, useRef, useState } from 'react';
import type { Resume } from '../types';
import { defaultFitLocks, fitLayoutCost, onePageLayouts, removableFitEntries, visibleFitEntries, withHiddenEntries } from '../lib/one-page';
import { useApp, useAppSlice } from '../lib/store';
import { useT } from '../lib/i18n';
import { stripHtml } from '../lib/utils';
import { createResumeMeasurer, readResumeLayout } from './resume-measure';
import ResumePreview from './resume-preview';
import { Btn, Modal, ModalHeader } from './ui';

type Measurement = ReturnType<typeof readResumeLayout>;
type Analysis = {
  source: Resume; target: number; locks: ReadonlySet<string>;
  before: Measurement; best: Resume; bestMeasure: Measurement;
  suggested: Set<string> | null; reasons: Map<string, string>;
};
const fitsTarget = (m: Measurement, target: number) => m.pages.length <= target &&
  !m.pages.some(p => p.oversized) && (m.pages.length !== 1 || m.fits);
const lastFill = (m: Measurement) => {
  const last = m.pages[m.pages.length - 1];
  return (last?.usedHeight ?? m.contentHeight) / (last?.capacity ?? m.capacity);
};
const titleOf = (block: ReturnType<typeof visibleFitEntries>[number]['block']) =>
  stripHtml(block.title || block.subtitle || block.description || block.bullets[0] || block.skills.join('、') || '未命名条目');

export default function OnePageDialog({ resume, onClose, onEdit }: {
  resume: Resume; onClose: () => void; onEdit?: (sectionId: string, blockId: string) => void;
}) {
  const app = useAppSlice('jds', 'duplicateResume', 'renameResume', 'setResumeOptions', 'setTheme', 'patchBlock', 'captureSnapshot', 'go');
  const t = useT();
  const jd = app.jds[resume.id];
  const terms = useMemo(() => [...(jd?.structured.skills ?? []), ...(jd?.structured.keywords ?? [])], [jd]);
  const [targetPages, setTargetPages] = useState<1 | 2 | null>(null);
  const [locks, setLocks] = useState<ReadonlySet<string>>(() => defaultFitLocks(resume, terms));
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [plan, setPlan] = useState<'all' | 'suggested' | 'custom'>('all');
  const [customHidden, setCustomHidden] = useState<Set<string>>(new Set());
  const [previewOriginal, setPreviewOriginal] = useState(false);
  const [preview, setPreview] = useState<{ source: Resume; measurement: Measurement } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const latest = useRef(resume); latest.current = resume;

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError('');
    async function analyze() {
      const measurer = createResumeMeasurer(controller.signal);
      try {
        const before = await measurer.measure(resume);
        if (targetPages === null) {
          if (!controller.signal.aborted) setTargetPages(before.pages.length === 1 && before.fits ? 1 : 2);
          return;
        }
        let best = resume, bestMeasure = before, bestCost = Infinity;
        if (!fitsTarget(before, targetPages)) {
          const candidates = onePageLayouts(resume)
            .slice(1)
            .sort((a, b) => fitLayoutCost(resume, a) - fitLayoutCost(resume, b));
          for (const candidate of candidates) {
            if (bestCost < Infinity && fitLayoutCost(resume, candidate, 1) >= bestCost) break;
            const measured = await measurer.measure(candidate);
            const cost = fitLayoutCost(resume, candidate, lastFill(measured));
            if (fitsTarget(measured, targetPages)) {
              if (cost < bestCost) { best = candidate; bestMeasure = measured; bestCost = cost; }
            } else if (bestCost === Infinity && measured.contentHeight < bestMeasure.contentHeight) {
              best = candidate; bestMeasure = measured;
            }
          }
        }
        // Recheck the chosen layout after candidate rendering and font/layout settling.
        bestMeasure = await measurer.measure(best);
        const reasons = new Map<string, string>();
        let suggested: Set<string> | null = null;
        if (!fitsTarget(bestMeasure, targetPages)) {
          const hidden = new Set<string>();
          for (const entry of removableFitEntries(resume, terms, locks, bestMeasure.entryHeights)) {
            hidden.add(entry.block.block_id); reasons.set(entry.block.block_id, entry.reason);
            const measured = await measurer.measure(withHiddenEntries(best, hidden));
            if (fitsTarget(measured, targetPages)) {
              // Restore anything that still fits, avoiding redundant exclusions.
              for (const id of [...hidden].reverse()) {
                const restored = new Set(hidden); restored.delete(id);
                if (fitsTarget(await measurer.measure(withHiddenEntries(best, restored)), targetPages)) hidden.delete(id);
              }
              suggested = hidden; break;
            }
          }
        }
        if (!controller.signal.aborted) setAnalysis({ source: resume, target: targetPages, locks, before, best, bestMeasure, suggested, reasons });
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '排版测量失败');
      } finally {
        measurer.dispose();
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void analyze();
    return () => controller.abort();
  }, [resume, terms, targetPages, locks, retry]);

  const current = analysis?.source === resume && analysis.target === targetPages && analysis.locks === locks;
  const entries = useMemo(() => visibleFitEntries(resume), [resume]);
  const hidden = useMemo(() => new Set([...(plan === 'suggested' ? analysis?.suggested ?? [] : plan === 'custom' ? customHidden : [])].filter(id => !locks.has(id))), [plan, analysis, customHidden, locks]);
  const draft = useMemo(() => withHiddenEntries(current ? analysis.best : resume, hidden), [current, analysis, resume, hidden]);
  const shown = previewOriginal ? resume : draft;
  const ready = !busy && !error && current && preview?.source === draft;
  const fits = !!(ready && fitsTarget(preview.measurement, targetPages!));
  const allContentFits = !!(current && ((ready && fits && hidden.size === 0) || fitsTarget(analysis.bestMeasure, targetPages!)));
  const unchanged = !!(current && hidden.size === 0 && JSON.stringify(draft.theme) === JSON.stringify(resume.theme));
  const densityNames = {
    loose: t('宽松', 'Loose'),
    medium: t('适中', 'Medium'),
    compact: t('紧凑', 'Compact'),
  };
  const changes = [
    resume.theme.font_size !== draft.theme.font_size
      ? t(`字号 ${resume.theme.font_size} → ${draft.theme.font_size}px`, `Font size ${resume.theme.font_size} → ${draft.theme.font_size}px`)
      : '',
    (resume.theme.density ?? 'medium') !== (draft.theme.density ?? 'medium')
      ? t(`间距 ${densityNames[resume.theme.density ?? 'medium']} → ${densityNames[draft.theme.density ?? 'medium']}`, `Spacing ${densityNames[resume.theme.density ?? 'medium']} → ${densityNames[draft.theme.density ?? 'medium']}`)
      : '',
    (resume.theme.page_margin ?? 'standard') !== (draft.theme.page_margin ?? 'standard') && draft.theme.page_margin === 'narrow'
      ? t('页边距收窄（标准 → 紧凑）', 'Margins tightened (Standard → Narrow)')
      : '',
    draft.theme.line_height && resume.theme.line_height !== draft.theme.line_height
      ? t(`行高微调为 ${draft.theme.line_height}`, `Line height ${draft.theme.line_height}`)
      : '',
    (resume.theme.header_layout ?? 'row') !== (draft.theme.header_layout ?? 'row')
      ? t('条目标题改为横排', 'Compact inline entry headers')
      : '',
    hidden.size
      ? t(`隐藏 ${hidden.size} 项，原文保留`, `Hide ${hidden.size} entries (originals kept)`)
      : '',
  ].filter(Boolean);
  const oversized = ready ? entries.filter(e => (preview.measurement.entryHeights[e.block.block_id] ?? 0) > preview.measurement.capacity) : [];
  const emptySections = current ? resume.data.sections.filter(s => s.visible && ['work_experience', 'education'].includes(s.type) && entries.some(e => e.section.section_id === s.section_id) && entries.filter(e => e.section.section_id === s.section_id).every(e => hidden.has(e.block.block_id))) : [];

  const chooseTarget = (count: 1 | 2) => {
    setTargetPages(count); setPlan('all'); setCustomHidden(new Set()); setPreviewOriginal(false);
  };
  const toggleContent = (id: string, included: boolean) => {
    const next = new Set(hidden); included ? next.delete(id) : next.add(id);
    setCustomHidden(next); setPlan('custom'); setPreviewOriginal(false);
  };
  const applyToCurrent = () => {
    if (!fits || !analysis || unchanged || latest.current !== analysis.source || useApp.getState().resumes.find(r => r.id === resume.id) !== resume) return;
    const count = preview!.measurement.pages.length;
    app.setTheme(resume.id, draft.theme);
    app.setResumeOptions(resume.id, { page_limit: targetPages! });
    for (const entry of entries) {
      if (hidden.has(entry.block.block_id)) {
        app.patchBlock(resume.id, entry.section.section_id, entry.block.block_id, { visible: false });
      }
    }
    app.captureSnapshot(resume.id, `${count}页篇幅调整完成`);
    onClose();
  };
  const createCopy = () => {
    if (!fits || !analysis || unchanged || latest.current !== analysis.source || useApp.getState().resumes.find(r => r.id === resume.id) !== resume) return;
    const copyId = app.duplicateResume(resume.id); if (!copyId) return;
    const count = preview!.measurement.pages.length;
    app.renameResume(copyId, `${resume.title} · ${count}页版`); app.setTheme(copyId, draft.theme);
    app.setResumeOptions(copyId, { page_limit: targetPages! });
    for (const entry of entries) if (hidden.has(entry.block.block_id)) app.patchBlock(copyId, entry.section.section_id, entry.block.block_id, { visible: false });
    app.captureSnapshot(copyId, `${count}页篇幅调整完成`);
    app.go({ name: 'editor', resumeId: copyId }); onClose();
  };

  return <Modal open onClose={onClose} width="max-w-6xl" bare>
    <ModalHeader
      title={t('智能篇幅调整', 'Smart Page Fit')}
      sub={t('预览调整方案，确认后另存副本。', 'Preview layout adjustments and save as a new copy.')}
      onClose={onClose}
    />
    <div className="grid max-h-[70vh] grid-cols-1 overflow-y-auto lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-4 border-b border-line p-4 lg:border-r">
        <fieldset><legend className="mb-2 text-[13px] font-medium">{t('最多几页', 'Target Page Limit')}</legend>
          <div className="flex gap-2">{([1, 2] as const).map(count => <Btn key={count} size="sm" aria-pressed={targetPages === count} variant={targetPages === count ? 'primary' : 'outline'} onClick={() => chooseTarget(count)}>{t(`${count} 页`, `${count} ${count === 1 ? 'Page' : 'Pages'}`)}</Btn>)}</div>
        </fieldset>
        <p role="status" className="text-[14px] font-medium">
          {busy
            ? t('正在测量实际版式…', 'Measuring actual layout…')
            : error
            ? t('测量失败，请重试', 'Measurement failed, please retry')
            : !ready
            ? previewOriginal
              ? t('正在对照原稿', 'Comparing original…')
              : t('正在更新方案预览…', 'Updating plan preview…')
            : t(
                `原稿 ${analysis!.before.pages.length} 页 → 当前方案 ${preview.measurement.pages.length} 页`,
                `Original ${analysis!.before.pages.length}p → Proposed ${preview.measurement.pages.length}p`
              )}
        </p>
        {error && <div><p role="alert" className="mb-2 text-[13px] text-danger-700">{error}</p><Btn size="sm" onClick={() => setRetry(v => v + 1)}>{t('重新测量', 'Retry')}</Btn></div>}
        {current && !busy && !error && <>
          <div className="rounded-lg bg-subtle p-3 text-[13px]" data-testid="layout-changes">
            {changes.length
              ? <ul className="space-y-1">{changes.map(change => <li key={change}>{change}</li>)}</ul>
              : <p>{fitsTarget(analysis!.before, targetPages!) ? t('原稿无需调整', 'Original already fits') : t('保持原排版，内容仍需调整', 'Layout unchanged; content still needs trimming')}</p>}
          </div>
          {!fitsTarget(analysis!.before, targetPages!) && <fieldset className="space-y-2">
            <legend className="mb-2 text-[13px] font-medium">{t('选择方案', 'Choose Plan')}</legend>
            {([
              ['all', t('保留全部内容', 'Keep all content'), allContentFits ? t('只调整排版', 'Typography & spacing only') : t('仅排版仍超出目标页数', 'Still exceeds target with spacing alone')],
              ['suggested', t('精简部分内容', 'Trim selected entries'), analysis!.suggested ? t(`建议隐藏 ${analysis!.suggested.size} 项，可逐项调整`, `Suggest hiding ${analysis!.suggested.size} entries (customizable)`) : t('没有满足当前锁定条件的精简方案', 'No plan fits under current lock rules')],
            ] as const).filter(([value]) => value === 'all' || !allContentFits).map(([value, label, detail]) => <label key={value} className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-[13px] ${plan === value ? 'border-brand-500 bg-brand-50' : 'border-line'}`}>
              <input type="radio" name="fit-plan" value={value} checked={plan === value} disabled={value === 'suggested' && !analysis!.suggested} onChange={() => { setPlan(value); setPreviewOriginal(false); }} className="mt-1 accent-brand-600" />
              <span><span className="block font-medium">{label}</span><span className="block text-[12px] text-ink-500">{detail}</span></span>
            </label>)}
            {plan === 'custom' && <p className="text-[12px] font-medium">{t('已自定义内容', 'Custom selection')}</p>}
          </fieldset>}
          {ready && fits && hidden.size === 0 && changes.length > 0 && <p className="text-[13px] text-brand-700">{t('全部内容已保留，仅调整排版。', 'All content preserved — layout adjusted only.')}</p>}
          {ready && fits && lastFill(preview.measurement) > 0.97 && <p className="text-[12px] text-seal-700">{t('当前刚好压线贴边（填充 >97%），建议导出 PDF 后抽查页尾。', 'Near bottom margin (>97% full); verify PDF export tail.')}</p>}
          {ready && !fits && <p className="text-[13px] text-seal-700">{oversized.length ? t('以下条目超过单页容量，请先精简或拆成独立经历。', 'Entries below exceed a single page height; trim or split them first.') : t('当前方案未达标。可调整纳入内容、解锁条目，或选择 2 页。', 'Current plan still overflows. Adjust included items, unlock entries, or choose 2 pages.')}</p>}
          {oversized.map(({ section, block }) => <div key={block.block_id} className="rounded-lg border border-line p-2 text-[13px]"><p>{titleOf(block)}</p>{onEdit && <Btn size="sm" onClick={() => { onClose(); onEdit(section.section_id, block.block_id); }}>{t('前往编辑', 'Edit')}</Btn>}</div>)}
          {emptySections.length > 0 && <p role="alert" className="text-[13px] text-seal-700">{t(`此版本将不展示${emptySections.map(s => s.title).join('、')}，请确认符合用途。`, `This copy omits ${emptySections.map(s => s.title).join(', ')}. Verify this fits your goal.`)}</p>}
          {ready && fits && preview.measurement.pages.length === 2 && lastFill(preview.measurement) < .35 && <p className="text-[12px] text-ink-500">{t('第二页内容较少，可尝试 1 页；无需为了铺满纸张删除经历。', 'Page 2 is lightly filled — consider trying 1 page, without forcing unnecessary cuts.')}</p>}
          <details open={hidden.size > 0}>
            <summary className="cursor-pointer text-[13px] font-medium">{t(`纳入此版本 · ${entries.length - hidden.size}/${entries.length} 项`, `Included in copy · ${entries.length - hidden.size}/${entries.length}`)}</summary>
            <p className="my-2 text-[12px] text-ink-500">{t('关键经历默认必须保留，可主动解锁。', 'Key entries are locked by default and can be unlocked.')}{jd ? t('岗位词项仅用于辅助建议。', ' JD terms only assist prioritization.') : t('未关联岗位，建议仅参考时间和篇幅。', ' No JD linked; suggestions use recency & length.')}</p>
            {resume.data.sections.filter(s => entries.some(e => e.section.section_id === s.section_id)).sort((a, b) => a.order - b.order).map(section => <fieldset key={section.section_id} className="mb-3">
              <legend className="text-[12px] font-medium text-ink-500">{section.title}</legend>
              {entries.filter(e => e.section.section_id === section.section_id).sort((a, b) => a.block.order - b.block.order).map(({ block }) => <div key={block.block_id} data-fit-entry={block.block_id} className="border-b border-line py-2 text-[13px]">
                <div className="flex items-start gap-2">
                  <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-2 py-2">
                    <input type="checkbox" aria-label={t(`纳入：${titleOf(block)}`, `Include: ${titleOf(block)}`)} className="mt-1 accent-brand-600" checked={!hidden.has(block.block_id)} disabled={locks.has(block.block_id)} onChange={e => toggleContent(block.block_id, e.target.checked)} />
                    <span className="min-w-0 break-words">{titleOf(block)}</span>
                  </label>
                  <Btn size="sm" aria-label={t(`必须保留：${titleOf(block)}`, `Lock: ${titleOf(block)}`)} aria-pressed={locks.has(block.block_id)} onClick={() => {
                    const next = new Set(locks);
                    if (next.has(block.block_id)) next.delete(block.block_id);
                    else {
                      next.add(block.block_id);
                      setCustomHidden(previous => { const restored = new Set(previous); restored.delete(block.block_id); return restored; });
                    }
                    setLocks(next); setPlan('all'); setPreviewOriginal(false);
                  }}>{locks.has(block.block_id) ? t('已锁定', 'Locked') : t('锁定', 'Lock')}</Btn>
                </div>
                {hidden.has(block.block_id) && <p className="text-[12px] text-seal-700">{plan === 'custom' ? t('手动排除', 'Excluded manually') : analysis!.reasons.get(block.block_id)}{analysis!.bestMeasure.entryHeights[block.block_id] ? t(` · 约占单页 ${Math.round(100 * analysis!.bestMeasure.entryHeights[block.block_id] / analysis!.bestMeasure.capacity)}%`, ` · ~${Math.round(100 * analysis!.bestMeasure.entryHeights[block.block_id] / analysis!.bestMeasure.capacity)}% of page`) : ''}</p>}
                <details className="text-[12px] text-ink-500"><summary className="cursor-pointer py-1">{t('查看原文', 'View original')}</summary><p className="whitespace-pre-wrap break-words">{stripHtml([block.subtitle, block.description, ...block.bullets, ...block.skills, ...block.links].filter(Boolean).join('\n')) || t('无补充描述', 'No additional details')}</p></details>
              </div>)}
            </fieldset>)}
          </details>
        </>}
      </aside>
      <div className="min-w-0">
        <div className="flex gap-2 border-b border-line p-2" role="group" aria-label={t('对照预览', 'Compare preview')}>
          <Btn size="sm" aria-pressed={!previewOriginal} onClick={() => setPreviewOriginal(false)}>{t('调整方案', 'Proposed')}</Btn>
          <Btn size="sm" aria-pressed={previewOriginal} onClick={() => setPreviewOriginal(true)}>{t('查看原稿', 'Original')}</Btn>
        </div>
        <ResumePreview resume={shown} onLayout={(_, measurement) => { if (shown === draft) setPreview({ source: draft, measurement }); }} />
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line p-4">
      <Btn onClick={onClose}>{t('取消', 'Cancel')}</Btn>
      {unchanged && fits
        ? <Btn variant="primary" onClick={onClose}>{t('完成', 'Done')}</Btn>
        : <>
            <Btn variant="outline" disabled={!fits} onClick={applyToCurrent}>
              {t(
                `应用到当前简历（${fits ? preview!.measurement.pages.length : targetPages ?? '—'} 页）`,
                `Apply to Current (${fits ? preview!.measurement.pages.length : targetPages ?? '—'}p)`
              )}
            </Btn>
            <Btn variant="primary" disabled={!fits} onClick={createCopy}>
              {t(
                `创建 ${fits ? preview!.measurement.pages.length : targetPages ?? '—'} 页副本${hidden.size > 0 ? `（隐藏 ${hidden.size} 项）` : ''}`,
                `Save ${fits ? preview!.measurement.pages.length : targetPages ?? '—'}-Page Copy${hidden.size > 0 ? ` (${hidden.size} hidden)` : ''}`
              )}
            </Btn>
          </>}
    </div>
  </Modal>;
}
