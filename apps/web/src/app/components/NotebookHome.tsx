import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Clock3,
  Copy,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Notebook } from '../types';

type NotebookHomeProps = {
  displayName: string;
  notebooks: Notebook[];
  onCreate: (name: string, description: string) => Promise<Notebook>;
  onOpen: (notebook: Notebook) => void;
  onRename: (id: string, name: string, description: string) => void;
  onDuplicate: (notebook: Notebook) => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
};

type EditorState = {
  mode: 'create' | 'rename';
  notebook?: Notebook;
};

export function NotebookHome({
  displayName,
  notebooks,
  onCreate,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onLogout,
}: NotebookHomeProps) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Notebook | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!editor && !deleteTarget) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isSubmitting) return;
      setEditor(null);
      setDeleteTarget(null);
      setNameError('');
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [editor, deleteTarget, isSubmitting]);

  const openEditor = (nextEditor: EditorState) => {
    setEditor(nextEditor);
    setName(nextEditor.notebook?.name ?? '');
    setDescription(nextEditor.notebook?.description ?? '');
    setNameError('');
    setOpenMenuId(null);
  };

  const closeEditor = () => {
    if (isSubmitting) return;
    setEditor(null);
    setNameError('');
  };

  const handleEditorSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('請輸入筆記本名稱');
      return;
    }

    setIsSubmitting(true);
    if (editor?.mode === 'create') {
      const createdNotebook = await onCreate(name.trim(), description.trim());
      setEditor(null);
      setIsSubmitting(false);
      onOpen(createdNotebook);
      return;
    }

    if (editor?.notebook) {
      onRename(editor.notebook.id, name.trim(), description.trim());
    }
    setEditor(null);
    setIsSubmitting(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="font-semibold tracking-tight">YouthLM</p>
              <p className="text-[11px] text-slate-500">青年政策證據工作台</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-[11px] text-slate-500">前端預覽帳號</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">登出</span>
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-700">我的工作空間</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">政策筆記本</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              每本筆記本各自保存資料來源、白板流程、成果與政策雷達紀錄。
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditor({ mode: 'create' })}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Plus className="size-4" />
            建立筆記本
          </button>
        </div>

        {notebooks.length === 0 ? (
          <div className="mt-10 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <BookOpen className="size-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">建立第一本政策筆記本</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
              筆記本建立後，就能在白板中加入來源、成果與小幫手卡片。
            </p>
            <button
              type="button"
              onClick={() => openEditor({ mode: 'create' })}
              className="mt-5 flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Plus className="size-4" />
              建立筆記本
            </button>
          </div>
        ) : (
          <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {notebooks.map(notebook => (
              <article
                key={notebook.id}
                className="group relative flex min-h-56 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <BookOpen className="size-5" />
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(current => (current === notebook.id ? null : notebook.id))}
                      className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`${notebook.name}的其他操作`}
                      aria-expanded={openMenuId === notebook.id}
                    >
                      <MoreHorizontal className="size-5" />
                    </button>
                    {openMenuId === notebook.id && (
                      <div className="absolute right-0 top-10 z-20 w-40 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                        <button
                          type="button"
                          onClick={() => openEditor({ mode: 'rename', notebook })}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <Pencil className="size-4" />
                          編輯筆記本
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onDuplicate(notebook);
                            setOpenMenuId(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <Copy className="size-4" />
                          建立副本
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(notebook);
                            setOpenMenuId(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="size-4" />
                          刪除
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <h2 className="mt-5 line-clamp-1 text-lg font-semibold">{notebook.name}</h2>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">
                  {notebook.description || '尚未加入筆記本說明。'}
                </p>

                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                  <span>{notebook.cardCount} 張卡片</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="size-3.5" />
                    {notebook.updatedAt}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onOpen(notebook)}
                  className="mt-4 h-9 rounded-lg border border-slate-200 bg-white text-sm font-medium transition hover:border-slate-300 hover:bg-slate-50"
                >
                  開啟筆記本
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4" role="presentation">
          <section
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notebook-editor-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="notebook-editor-title" className="text-xl font-semibold">
                  {editor.mode === 'create' ? '建立筆記本' : '編輯筆記本'}
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  {editor.mode === 'create' ? '先替這次的政策分析命名。' : '修改筆記本名稱或說明。'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="關閉視窗"
              >
                <X className="size-5" />
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleEditorSubmit}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">筆記本名稱</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (nameError) setNameError('');
                  }}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  placeholder="例如：青年教育與就業研究"
                  maxLength={60}
                  aria-invalid={Boolean(nameError)}
                />
                {nameError && <span className="mt-1 block text-xs text-red-600" role="alert">{nameError}</span>}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  說明 <span className="font-normal text-slate-400">（選填）</span>
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-24 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-5 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  placeholder="簡短說明這本筆記本要處理的政策問題"
                  maxLength={180}
                />
                <span className="mt-1 block text-right text-[11px] text-slate-400">{description.length}/180</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={isSubmitting}
                  className="h-10 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSubmitting ? '建立中…' : editor.mode === 'create' ? '建立並開啟' : '儲存變更'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4" role="presentation">
          <section
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-notebook-title"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <Trash2 className="size-5" />
            </div>
            <h2 id="delete-notebook-title" className="mt-4 text-lg font-semibold">刪除筆記本？</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              「{deleteTarget.name}」會從目前的前端預覽中移除。這項操作無法復原。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="h-10 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700"
              >
                確認刪除
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
