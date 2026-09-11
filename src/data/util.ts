export const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (iso: string) => new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtMinutes = (min: number) => { const h = Math.floor(min / 60); const m = Math.round(min % 60); return h ? `${h}h ${m ? `${m}m` : ''}`.trim() : `${m}m`; };
