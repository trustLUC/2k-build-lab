import { emptyDataset, validateDataset } from './model.js?v=2';

export const DATA_KEY = '2kbl.data.v1';
export const BACKUP_KEY = '2kbl.backups.v1';
const MAX_BACKUPS = 15;

export function createStore(ls = globalThis.localStorage) {
  const read = (k, d) => { try { const v = ls.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  return {
    hasData: () => ls.getItem(DATA_KEY) !== null,
    load() {
      const raw = read(DATA_KEY, null);
      if (!raw) return emptyDataset();
      const v = validateDataset(raw);
      return v.dataset || emptyDataset();
    },
    backups: () => read(BACKUP_KEY, []),
    // Always back up the current data before writing the new data.
    save(next, reason) {
      const cur = ls.getItem(DATA_KEY);
      if (cur !== null) {
        const list = read(BACKUP_KEY, []);
        list.unshift({ at: new Date().toISOString(), reason, data: JSON.parse(cur) });
        ls.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, MAX_BACKUPS)));
      }
      ls.setItem(DATA_KEY, JSON.stringify(next));
    },
  };
}
