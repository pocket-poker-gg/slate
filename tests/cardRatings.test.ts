import { describe, it, expect } from 'vitest';
import {
  readRtBudget, spendRtBudget, budgetDayOf, RT_CARD_DAILY_CAP, type RtBudget
} from '../src/providers/cardRatings';

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), dump: m };
};

describe('RT daily budget', () => {
  const day = Date.UTC(2026, 8, 11, 12, 0, 0);
  it('spends within the cap and refuses past it', () => {
    const st = memStorage();
    for (let i = 0; i < RT_CARD_DAILY_CAP; i++) expect(spendRtBudget(day, st)).toBe(true);
    expect(spendRtBudget(day, st)).toBe(false);
    expect(readRtBudget(day, st).used).toBe(RT_CARD_DAILY_CAP);
  });

  it('resets on a new day', () => {
    const st = memStorage();
    for (let i = 0; i < RT_CARD_DAILY_CAP; i++) spendRtBudget(day, st);
    expect(spendRtBudget(day + 86400000, st)).toBe(true);
    expect(readRtBudget(day + 86400000, st).used).toBe(1);
  });

  it('treats corrupt storage as a fresh budget', () => {
    const st = memStorage();
    st.setItem('slate.rtCardBudget', '{corrupt');
    expect(readRtBudget(day, st)).toEqual({ day: budgetDayOf(day), used: 0 });
    st.setItem('slate.rtCardBudget', JSON.stringify({ day: '1999-01-01', used: 999 }));
    expect(readRtBudget(day, st).used).toBe(0);
  });

  it('clamps negative/corrupt used counts', () => {
    const st = memStorage();
    st.setItem('slate.rtCardBudget', JSON.stringify({ day: budgetDayOf(day), used: -5 } satisfies RtBudget));
    expect(readRtBudget(day, st).used).toBe(0);
  });
});
