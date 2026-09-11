import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  Database,
  MousePointer2,
  Network,
  X,
} from 'lucide-react';

type WorkspaceTourProps = {
  onDismiss: () => void;
  onStartWithSource: () => void;
};

const STEPS = [
  {
    eyebrow: '歡迎使用 YouthLM',
    title: '把政策分析整理成一條清楚的流程',
    description: '白板只負責呈現資料如何變成證據；設定與對話放在兩側，需要時再打開。',
    icon: Network,
    accent: 'bg-slate-950 text-white',
    points: ['來源 → 圖表 → 簡報', '每張成果都保留資料連結'],
  },
  {
    eyebrow: '步驟一',
    title: '先加入可信的資料來源',
    description: '從左側來源按鈕或空白畫面的主要按鈕，選擇官方資料並設定年度、年齡、性別與地區。',
    icon: Database,
    accent: 'bg-blue-100 text-blue-700',
    points: ['選擇資料只建立來源，不會偷跑分析', '設定完成後，可直接從來源建立圖表'],
  },
  {
    eyebrow: '步驟二',
    title: '在右側和 AI 小幫手規劃工作',
    description: '小幫手會讀取目前畫布上的來源與成果。任何新增畫布內容的操作，都會先讓你確認。',
    icon: Bot,
    accent: 'bg-emerald-100 text-emerald-700',
    points: ['目前是前端操作示意，不冒充 AI 分析', '確認草稿後，成果才會加入白板'],
  },
  {
    eyebrow: '操作方式',
    title: '卡片不會因為誤點就跳出面板',
    description: '點鉛筆才編輯、按住右上拖移把手才移動；藍色與紫色端點用來調整流程連線。',
    icon: MousePointer2,
    accent: 'bg-violet-100 text-violet-700',
    points: ['點白板空白處可收合設定', 'Ctrl＋滾輪縮放，全覽可找回所有卡片'],
  },
] as const;

export function WorkspaceTour({ onDismiss, onStartWithSource }: WorkspaceTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const step = STEPS[stepIndex];
  const StepIcon = step.icon;
  const isLastStep = stepIndex === STEPS.length - 1;

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
      if (event.key === 'ArrowLeft' && stepIndex > 0) setStepIndex(current => current - 1);
      if (event.key === 'ArrowRight' && !isLastStep) setStepIndex(current => current + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLastStep, onDismiss, stepIndex]);

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-[2px]">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-tour-title"
        tabIndex={-1}
        className="w-full max-w-[580px] overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl outline-none"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2" aria-label={`導覽進度 ${stepIndex + 1}／${STEPS.length}`}>
            {STEPS.map((item, index) => (
              <span
                key={item.title}
                className={`h-1.5 rounded-full transition-all ${index === stepIndex ? 'w-8 bg-slate-900' : index < stepIndex ? 'w-4 bg-slate-400' : 'w-4 bg-slate-200'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="略過操作教學"
          >
            略過
            <X className="size-3.5" />
          </button>
        </header>

        <div className="px-6 py-8 sm:px-9 sm:py-10">
          <div className={`flex size-12 items-center justify-center rounded-2xl ${step.accent}`}>
            <StepIcon className="size-5" />
          </div>
          <p className="mt-6 text-xs font-semibold tracking-wide text-blue-700">{step.eyebrow}</p>
          <h2 id="workspace-tour-title" className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {step.title}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">{step.description}</p>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {step.points.map((point, index) => (
              <div key={point} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-700">
                {stepIndex === 0 && index === 1
                  ? <BarChart3 className="mt-0.5 size-4 shrink-0 text-violet-600" />
                  : <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue-600" />}
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setStepIndex(current => Math.max(0, current - 1))}
            disabled={stepIndex === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-600 transition hover:bg-white disabled:invisible"
          >
            <ArrowLeft className="size-3.5" />
            上一步
          </button>
          {isLastStep ? (
            <button
              type="button"
              onClick={onStartWithSource}
              className="flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white transition hover:bg-blue-800"
            >
              <Database className="size-4" />
              開始選資料
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIndex(current => Math.min(STEPS.length - 1, current + 1))}
              className="flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              下一步
              <ArrowRight className="size-4" />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
