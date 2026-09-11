import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db } from '../../storage/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTitlesMap } from '../hooks';
import { Poster, Empty, ConfirmSheet, Sheet, useToast } from '../components';
import { removeFromList } from '../../storage/repo';
import { IconChevronL, IconTrash } from '../icons';

export default function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const listId = Number(id);
  const nav = useNavigate();
  const toast = useToast();
  const list = useLiveQuery(() => db.lists.get(listId), [listId]);
  const items = useLiveQuery(() => db.listItems.where('listId').equals(listId).sortBy('order'), [listId]);
  const titles = useTitlesMap(items?.map((i) => i.key));
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (list === undefined) return null;
  if (list === null || !list) return <div className="page"><Empty title="List not found" /></div>;

  return (
    <div>
      <div className="topbar"><div className="topbar-row">
        <button className="iconbtn plain" onClick={() => nav(-1)} aria-label="Back"><IconChevronL /></button>
        <div className="title-1" style={{ fontSize: 20 }}>{list.name}</div>
        <button className="iconbtn plain" onClick={() => setDeleteOpen(true)} aria-label="Delete list"><IconTrash /></button>
      </div></div>
      {list.notes && <p className="subhead" style={{ padding: '0 16px' }}>{list.notes}</p>}
      <div className="section" style={{ marginTop: 10 }}>
        {(items ?? []).map((i) => {
          const m = titles?.get(i.key);
          return (
            <div key={i.key} className="cell">
              <Link to={`/title/${m?.mediaType}/${m?.tmdbId}`} style={{ display: 'contents' }}>
                <Poster path={m?.posterPath} title={m?.title ?? ''} size="w154" />
                <div className="cell-main">
                  <div className="cell-title">{m?.title ?? i.key}</div>
                  <div className="cell-sub">{m?.mediaType === 'movie' ? 'Movie' : 'Series'}{m?.year ? ` · ${m.year}` : ''}{i.note ? ` · ${i.note}` : ''}</div>
                </div>
              </Link>
              <button className="iconbtn plain" aria-label="Remove from list" onClick={async () => { await removeFromList(listId, i.key); toast('Removed'); }}><IconX /></button>
            </div>
          );
        })}
        {items && items.length === 0 && <Empty title="Empty list" body="Add titles from any title page's share menu, or long-press cards (coming to title pages as Add to list)." />}
      </div>
      <ConfirmSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete this list?" body="Titles stay in your library; only the list is removed." confirmLabel="Delete list" destructive
        onConfirm={async () => { await db.listItems.where('listId').equals(listId).delete(); await db.lists.delete(listId); nav('/library'); }} />
    </div>
  );
}
const IconX = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;
