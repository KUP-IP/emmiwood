import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { emmiwoodApi } from './api';
import {
  addDays,
  chicagoDate,
  groupSlots,
  INITIAL_TIMES_PER_PERIOD,
  prettyDate,
  prettyTime,
  slotDate,
} from './availability';
import type { Slot } from './types';

type AvailabilityDay = { date: string; slots: Slot[]; unavailable?: boolean };

const SLOT_REQUEST_CONCURRENCY = 2;
const RETRY_DELAY_MS = 250;
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function AvailabilityBrowser({
  serviceId,
  barberId,
  horizonDays,
  selectedSlot,
  onSelect,
  onDateChange,
  onRefresh,
  autoFind = true,
  notice = '',
}: {
  serviceId: string;
  barberId: string;
  horizonDays: number;
  selectedSlot?: Slot;
  onSelect: (slot: Slot, date: string) => void;
  onDateChange?: (date: string) => void;
  onRefresh?: () => void;
  autoFind?: boolean;
  notice?: string;
}) {
  const today = useMemo(() => chicagoDate(), []);
  const maxDate = useMemo(() => addDays(today, horizonDays), [horizonDays, today]);
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const requestId = useRef(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const instanceId = useId();
  const dateChangeRef = useRef(onDateChange);
  useEffect(() => { dateChangeRef.current = onDateChange; }, [onDateChange]);
  const refreshRef = useRef(onRefresh);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  const fetchDays = useCallback(async (startDate: string, count: number) => {
    const dates = Array.from({ length: count }, (_, index) => addDays(startDate, index)).filter((date) => date <= maxDate);
    const results = new Array<AvailabilityDay>(dates.length);
    let nextIndex = 0;

    async function fetchDay(date: string): Promise<AvailabilityDay> {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return { date, slots: await emmiwoodApi.slots(serviceId, date, barberId) };
        } catch {
          if (attempt === 0) await wait(RETRY_DELAY_MS);
        }
      }
      return { date, slots: [], unavailable: true };
    }

    async function worker() {
      while (nextIndex < dates.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await fetchDay(dates[index]);
      }
    }

    await Promise.all(Array.from({ length: Math.min(SLOT_REQUEST_CONCURRENCY, dates.length) }, () => worker()));
    return results;
  }, [barberId, maxDate, serviceId]);

  const selectDate = useCallback((date: string) => {
    setSelectedDate(date);
    dateChangeRef.current?.(date);
  }, []);

  const findNext = useCallback(async () => {
    const currentRequest = ++requestId.current;
    refreshRef.current?.();
    setBusy(true);
    setMessage(`Searching all ${horizonDays} bookable days…`);
    setExpanded({});
    try {
      let lastBatch: AvailabilityDay[] = [];
      let unavailableCount = 0;
      for (let offset = 0; offset <= horizonDays; offset += 7) {
        const batch = await fetchDays(addDays(today, offset), Math.min(7, horizonDays - offset + 1));
        if (currentRequest !== requestId.current) return;
        lastBatch = batch;
        unavailableCount += batch.filter((day) => day.unavailable).length;
        const available = batch.find((day) => !day.unavailable && day.slots.length > 0);
        if (available) {
          setDays(batch);
          selectDate(available.date);
          setMessage(unavailableCount ? `Next opening found. ${unavailableCount} nearby ${unavailableCount === 1 ? 'day could' : 'days could'} not be checked; retry to refresh.` : `Next opening found. Compare ${batch.length} labeled days below.`);
          return;
        }
      }
      if (currentRequest !== requestId.current) return;
      setDays(lastBatch);
      if (lastBatch[0]) selectDate(lastBatch[0].date);
      if (unavailableCount) {
        const firstUsable = lastBatch.find((day) => !day.unavailable);
        if (firstUsable) selectDate(firstUsable.date);
        setMessage(`We could not check every bookable day. Retry the search or call the shop before assuming no appointments remain.`);
      } else {
        setMessage(`No openings through ${prettyDate(maxDate, true)}. Call the shop or use the noon–5 walk-in window.`);
      }
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setDays([]);
      setMessage((error as Error).message);
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }, [fetchDays, horizonDays, maxDate, selectDate, today]);

  const loadFromDate = useCallback(async (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > maxDate) return;
    const currentRequest = ++requestId.current;
    refreshRef.current?.();
    setBusy(true);
    setMessage(`Checking ${prettyDate(date, true)} and nearby days…`);
    setExpanded({});
    try {
      const batch = await fetchDays(date, 7);
      if (currentRequest !== requestId.current) return;
      setDays(batch);
      selectDate(date);
      const chosen = batch.find((day) => day.date === date);
      const unavailableCount = batch.filter((day) => day.unavailable).length;
      if (chosen?.unavailable) setMessage(`${prettyDate(date, true)} could not be checked. Retry that date or compare the nearby days.`);
      else if (chosen?.slots.length) setMessage(unavailableCount ? `Openings below. ${unavailableCount} nearby ${unavailableCount === 1 ? 'day needs' : 'days need'} a retry.` : `Openings below — expand a period for more.`);
      else setMessage(`No openings on ${prettyDate(date, true)}. Compare nearby days.`);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setDays([]);
      setMessage((error as Error).message);
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }, [fetchDays, selectDate, today, maxDate]);

  useEffect(() => {
    requestId.current += 1;
    setDays([]);
    setSelectedDate(today);
    setExpanded({});
    if (autoFind && serviceId) void findNext();
    return () => { requestId.current += 1; };
  }, [autoFind, barberId, findNext, serviceId, today]);

  const activeDay = days.find((day) => day.date === selectedDate) || days[0];
  const groups = groupSlots(activeDay?.slots || []);
  const activeTimeCount = Object.values(groups).reduce((total, slots) => total + slots.length, 0);

  const hasDays = days.length > 0;

  function moveDayFocus(index: number, key: string) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key) || !days.length) return;
    const targetIndex = key === 'Home'
      ? 0
      : key === 'End'
        ? days.length - 1
        : (index + (key === 'ArrowRight' ? 1 : -1) + days.length) % days.length;
    const target = days[targetIndex];
    selectDate(target.date);
    requestAnimationFrame(() => tabRefs.current[targetIndex]?.focus());
  }

  return <section className={`ew-availability-browser${hasDays ? ' has-days' : ''}${busy ? ' is-busy' : ''}`} aria-label="Appointment availability">
    <div className="ew-availability-controls">
      <div className="ew-selected-date">
        <span>Selected date</span>
        <strong>{prettyDate(selectedDate, true)}</strong>
        <small>{activeDay?.unavailable ? "Couldn't check this date · retry" : activeTimeCount ? `${activeTimeCount} times shown` : "No openings this date"}</small>
      </div>
      <div className="ew-date-find-row">
        <label className="ew-date-picker">Jump to date<input type="date" min={today} max={maxDate} value={selectedDate} onChange={(event) => void loadFromDate(event.target.value)} /></label>
        <button className="ew-find-next ew-button secondary" type="button" onClick={() => void findNext()} disabled={busy}>{busy ? 'Searching…' : 'Find next'}</button>
      </div>
    </div>

    <div className="ew-slot-status" aria-live="polite">{busy ? <><span className="ew-spinner" aria-hidden="true" />{message}</> : notice || message}</div>

    {!busy && days.length > 0 && <div className="ew-day-tabs" role="tablist" aria-label="Available days">
      {days.map((day, index) => {
        const curatedCount = Object.values(groupSlots(day.slots)).reduce((total, slots) => total + slots.length, 0);
        const selected = day.date === selectedDate;
        const tabId = `${instanceId}-day-tab-${day.date}`;
        return <button key={day.date} ref={(element) => { tabRefs.current[index] = element; }} id={tabId} type="button" role="tab" tabIndex={selected ? 0 : -1} aria-selected={selected} aria-controls={`${instanceId}-day-panel`} className={`${selected ? 'selected ' : ''}${day.unavailable ? 'unavailable' : ''}`.trim()} onClick={() => selectDate(day.date)} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); moveDayFocus(index, event.key); } }}>
          <span>{prettyDate(day.date)}</span>
          <strong>{day.unavailable ? 'Try again' : curatedCount ? `${curatedCount} times` : 'No openings'}</strong>
        </button>;
      })}
    </div>}

    {!busy && activeDay && <div id={`${instanceId}-day-panel`} className="ew-day-panel" role="tabpanel" aria-labelledby={`${instanceId}-day-tab-${activeDay.date}`}>
      <header><div><span className="ew-eyebrow">Choose a start time</span><h3>{prettyDate(activeDay.date, true)}</h3></div><small>Times shown in Central Time</small></header>
      {activeDay.unavailable ? <div className="ew-empty ew-availability-error"><strong>Couldn't check this day.</strong><p>Retry this date or pick another. Your selections stay as they are.</p><button className="ew-button secondary" type="button" onClick={() => void loadFromDate(activeDay.date)}>Retry {prettyDate(activeDay.date)}</button></div> : activeDay.slots.length === 0 ? <div className="ew-empty"><strong>No openings this day.</strong><p>Pick a nearby day or jump to another date.</p></div> : <div className="ew-period-list">
        {(Object.entries(groups) as Array<[keyof typeof groups, Slot[]]>).filter(([, slots]) => slots.length).map(([period, periodSlots]) => {
          const key = `${instanceId}-${activeDay.date}-${period}`;
          const isExpanded = Boolean(expanded[key]);
          const shown = isExpanded ? periodSlots : periodSlots.slice(0, INITIAL_TIMES_PER_PERIOD);
          return <section className="ew-time-period" key={period} aria-labelledby={`${key}-heading`}>
            <div className="ew-time-period-head"><h4 id={`${key}-heading`}>{period}</h4><span>{periodSlots.length} {periodSlots.length === 1 ? 'time' : 'times'}</span></div>
            <div className="ew-slot-grid">
              {shown.map((opening) => <button type="button" key={`${opening.barberId}-${opening.start}`} aria-pressed={selectedSlot?.start === opening.start && selectedSlot?.barberId === opening.barberId} className={selectedSlot?.start === opening.start && selectedSlot?.barberId === opening.barberId ? 'selected' : ''} onClick={() => onSelect(opening, activeDay.date)}>
                <strong>{prettyTime(opening.start)}</strong>{barberId === 'first' && <small>{opening.barberName}</small>}
              </button>)}
            </div>
            {periodSlots.length > INITIAL_TIMES_PER_PERIOD && <button className="ew-show-times" type="button" onClick={() => setExpanded((current) => ({ ...current, [key]: !isExpanded }))}>{isExpanded ? `Show fewer ${period.toLowerCase()} times` : `Show all ${periodSlots.length} ${period.toLowerCase()} times`}</button>}
          </section>;
        })}
      </div>}
    </div>}

    {selectedSlot && <div className="ew-selected-slot ew-selected-slot-inline" role="status"><span>Selected appointment</span><strong>{prettyDate(slotDate(selectedSlot.start), true)} at {prettyTime(selectedSlot.start)}</strong><small>{selectedSlot.barberName}</small></div>}
  </section>;
}
