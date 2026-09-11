import Dexie, { type Table } from 'dexie';
import type {
  TitleMeta, LibraryEntry, ProgressEntry, DiaryEntry, ListDef, ListItem,
  PairwiseChoice, Settings, MetaCacheRow, RecFeedback, ImportRecord
} from '../data/types';

export class SlateDB extends Dexie {
  titles!: Table<TitleMeta, string>;
  library!: Table<LibraryEntry, string>;
  progress!: Table<ProgressEntry, string>;
  diary!: Table<DiaryEntry, number>;
  lists!: Table<ListDef, number>;
  listItems!: Table<ListItem, [number, string]>;
  pairwise!: Table<PairwiseChoice, number>;
  settings!: Table<Settings, string>;
  metaCache!: Table<MetaCacheRow, string>;
  recFeedback!: Table<RecFeedback, number>;
  imports!: Table<ImportRecord, number>;

  constructor(name = 'slate') {
    super(name);
    this.version(1).stores({
      titles: 'key, mediaType, title, year, fetchedAt',
      library: 'key, status, favorite, rating, addedAt, updatedAt, watchSoon',
      progress: 'key, updatedAt',
      diary: '++id, key, date, mediaType',
      lists: '++id, name, createdAt',
      listItems: '[listId+key], listId, order',
      pairwise: '++id, at',
      settings: 'id',
      metaCache: 'url, expiresAt',
      recFeedback: '++id, key, at',
      imports: '++id, at'
    });
  }
}

export const db = new SlateDB();
