import { useState } from 'react';

const categories = ['Learning', 'Coding', 'Work', 'Social', 'Entertainment'];

export default function App() {
  const [activeTab, setActiveTab] = useState<'today' | 'week'>('today');

  return (
    <main className="popup-shell min-h-screen w-[360px] bg-[#111210] p-5 text-[#f2f0e9]">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="brand-mark grid size-8 place-items-center rounded-[11px] text-sm font-bold">F</div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-[-0.03em]">FocusLens</h1>
            <p className="text-[10px] text-[#87877f]">YOUR TIME, IN FOCUS</p>
          </div>
        </div>
        <span className="status-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium">
          <span className="size-1.5 rounded-full bg-[#777870]" /> Setup phase
        </span>
      </header>

      <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[#aaa99f]">Browsing activity</p>
          <div className="flex rounded-lg bg-[#111210] p-0.5 text-[10px]">
            {(['today', 'week'] as const).map((period) => (
              <button key={period} onClick={() => setActiveTab(period)} className={`rounded-md px-2.5 py-1 capitalize transition-colors ${activeTab === period ? 'bg-[#2b2c27] text-white' : 'text-[#777870]'}`}>
                {period}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 text-[32px] font-semibold tracking-[-0.06em] tabular-nums">—<span className="ml-1 text-sm font-normal tracking-normal text-[#777870]">hours</span></p>
        <div className="mt-3 rounded-xl border border-dashed border-white/[0.12] px-3 py-3 text-xs leading-5 text-[#999990]">
          Activity tracking begins in Phase 1. FocusLens has not collected any browsing data.
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-[#282923]" aria-label="No activity data yet" />
        <div className="mt-3 flex justify-between text-[10px] text-[#777870]">
          <span>Productive <b className="ml-1 font-medium text-[#b3d783]">—</b></span>
          <span>Recreational <b className="ml-1 font-medium text-[#e6b278]">—</b></span>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-[#aaa99f]">Current website</h2>
          <span className="text-[10px] text-[#777870]">Not tracked yet</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-[#252620] text-sm text-[#a8aa95]">◎</div>
          <div><p className="text-sm font-medium">—</p><p className="mt-0.5 text-[11px] text-[#777870]">Category not assigned</p></div>
          <span className="ml-auto rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-[#929188]">Unknown</span>
        </div>
      </section>

      <section className="mt-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-xs font-medium text-[#aaa99f]">Your categories</h2>
          <span className="text-[10px] text-[#777870]">Personalized later</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((category) => <span key={category} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-[#929188]">{category}</span>)}
        </div>
      </section>

      <footer className="mt-5 border-t border-white/[0.08] pt-4">
        <button disabled className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c9ee8e] px-4 py-2.5 text-xs font-semibold text-[#20251b] opacity-50" title="Focus sessions arrive in Phase 5">
          <span>✳</span> Start focus session <span className="ml-auto text-[9px] font-medium opacity-70">COMING LATER</span>
        </button>
        <p className="mt-3 text-center text-[10px] text-[#777870]">Private by design · Data stays on this device</p>
      </footer>
    </main>
  );
}
