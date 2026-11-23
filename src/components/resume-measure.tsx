import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Resume } from '../types';
import { paginateResume } from '../lib/pagination';
import { localizedResume } from '../lib/workflow';
import { A4Sheet } from './template';

export function readResumeLayout(root: HTMLElement, resume: Resume) {
  const heights: Record<string,number> = {}, titles: Record<string,number> = {};
  const bulletHeights: Record<string,number[]> = {};
  const outerHeight = (el: HTMLElement) => el.getBoundingClientRect().height + (parseFloat(getComputedStyle(el).marginBottom) || 0);
  const isSwiss = resume.template_id === 'swiss_grid';
  root.querySelectorAll<HTMLElement>('[data-resume-entry]').forEach(el=>{
    const id=el.dataset.resumeEntry!;
    heights[id]=outerHeight(el);
    const list=el.querySelector<HTMLElement>('ul, ol');
    if(list){
      const gap=parseFloat(getComputedStyle(list).rowGap)||0;
      const items=Array.from(list.querySelectorAll<HTMLElement>(':scope > li'));
      if(items.length>0)bulletHeights[id]=items.map((li,idx)=>li.getBoundingClientRect().height+(idx>0?gap:0));
    }
  });
  root.querySelectorAll<HTMLElement>('[data-resume-section]').forEach(el=>{
    const heading=el.querySelector<HTMLElement>('h2');
    const secStyle=getComputedStyle(el);
    const secChrome=(parseFloat(secStyle.marginBottom)||0)+(parseFloat(secStyle.paddingBottom)||0)+(parseFloat(secStyle.borderBottomWidth)||0);
    if(heading)titles[el.dataset.resumeSection!]=(isSwiss ? 0 : outerHeight(heading))+secChrome;
  });
  const header=root.querySelector<HTMLElement>('.resume-sheet header');
  const padded=root.querySelector<HTMLElement>('.resume-sheet-wrap > div');
  const pad=padded ? parseFloat(getComputedStyle(padded).paddingTop)+parseFloat(getComputedStyle(padded).paddingBottom) : 88;
  const capacity=1123-pad-4;
  const sheet=root.querySelector<HTMLElement>('.resume-sheet');
  const sheetHeight=sheet?.getBoundingClientRect().height ?? 0;
  const contentHeight=sheetHeight+pad;
  const isTwoCol = resume.template_id === 'executive_sidebar';
  const r = localizedResume(resume);
  let pages = paginateResume(resume,heights,header ? outerHeight(header) : 0,titles,capacity,bulletHeights);
  if (
    pages.length > 1 &&
    sheetHeight > 0 &&
    contentHeight <= 1122 &&
    (isTwoCol || !Object.values(heights).some((h) => h > capacity))
  ) {
    pages = [
      {
        resume: r,
        oversized: false,
        height: 1123,
        usedHeight: sheetHeight,
        capacity,
      },
    ];
  }
  return { pages, contentHeight, entryHeights: heights, capacity, fits:pages.length===1 && !pages[0].oversized && contentHeight<=1122 };
}

/** One isolated full-size render, reused while testing layout candidates. */
export function createResumeMeasurer(signal: AbortSignal) {
  const host=document.createElement('div');
  host.setAttribute('aria-hidden','true');
  Object.assign(host.style,{position:'fixed',left:'-10000px',top:'0',width:'794px',visibility:'hidden',pointerEvents:'none'});
  document.body.append(host);
  const root=createRoot(host);
  return {
    async measure(resume: Resume) {
      if(signal.aborted)throw new DOMException('Cancelled','AbortError');
      await new Promise<void>(resolve=>requestAnimationFrame(()=>{if(!signal.aborted)flushSync(()=>root.render(<A4Sheet resume={resume}/>));resolve();}));
      // Let the committed render reach layout before observing font readiness.
      // Otherwise a rapid candidate sequence can read the previous frame's size.
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      if(signal.aborted)throw new DOMException('Cancelled','AbortError');
      void host.getBoundingClientRect();
      await document.fonts.ready;
      await Promise.all(Array.from(host.querySelectorAll('img')).map(image=>image.decode().catch(()=>{})));
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      if(signal.aborted)throw new DOMException('Cancelled','AbortError');
      return readResumeLayout(host,resume);
    },
    dispose(){root.unmount();host.remove();},
  };
}
