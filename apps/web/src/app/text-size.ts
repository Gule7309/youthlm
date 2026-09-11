export type TextSize = 'small' | 'medium' | 'large' | 'extra-large';

export const TEXT_SIZE_STORAGE_KEY = 'youthlm:text-size';

export const TEXT_SIZE_OPTIONS: ReadonlyArray<{ value: TextSize; label: string }> = [
  { value: 'extra-large', label: '特大' },
  { value: 'large', label: '大' },
  { value: 'medium', label: '中' },
  { value: 'small', label: '小' },
];

export function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZE_OPTIONS.some(option => option.value === value);
}

export function readTextSizePreference(storage?: Pick<Storage, 'getItem'> | null): TextSize {
  if (!storage) return 'small';
  try {
    const saved = storage.getItem(TEXT_SIZE_STORAGE_KEY);
    return isTextSize(saved) ? saved : 'small';
  } catch {
    return 'small';
  }
}

export function writeTextSizePreference(storage: Pick<Storage, 'setItem'>, value: TextSize) {
  storage.setItem(TEXT_SIZE_STORAGE_KEY, value);
}
