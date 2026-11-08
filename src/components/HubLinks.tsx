import type { AppData, Prospect } from '../types';
import { useStore } from '../store/StoreContext';
import { useNav } from '../nav';
import { normCompany } from '../utils/company';

/** Everything hanging off a pipeline company (meetings, proposals, sims, same-name cold leads). */
export function hubSummary(data: AppData, p: Prospect) {
  const n = normCompany(p.company);
  const meetings = data.meetings.filter((m) => m.prospectId === p.id || (!m.prospectId && normCompany(m.company) === n));
  const proposals = (data.proposals ?? []).filter((x) => x.prospectId === p.id);
  const sims = (data.simulations ?? []).filter((x) => x.prospectId === p.id);
  const coldLeads = (data.coldLeads ?? []).filter((c) => normCompany(c.company) === n);
  return { meetings, proposals, sims, coldLeads };
}

function statusSummary(list: { status: string }[]): string {
  const c = new Map<string, number>();
  for (const x of list) c.set(x.status, (c.get(x.status) ?? 0) + 1);
  return [...c.entries()].map(([s, k]) => (list.length > 1 && k > 1 ? `${k} ${s}` : s)).join(', ');
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function HubLinks({ prospect, stop = true }: { prospect: Prospect; stop?: boolean }) {
  const { data } = useStore();
  const { go } = useNav();
  const h = hubSummary(data, prospect);
  if (!h.meetings.length && !h.proposals.length && !h.sims.length && !h.coldLeads.length) return null;
  const click = (fn: () => void) => (e: React.MouseEvent) => {
    if (stop) e.stopPropagation();
    fn();
  };
  return (
    <div className="hub-links" aria-label="Linked records">
      {h.meetings.length ? (
        <button type="button" className="hub-link" onClick={click(() => go('meetings', { prospectId: prospect.id }))}>
          📅 {plural(h.meetings.length, 'meeting')}
        </button>
      ) : null}
      {h.proposals.length ? (
        <button type="button" className="hub-link" onClick={click(() => go('proposals', { section: 'proposals', prospectId: prospect.id }))}>
          📄 {plural(h.proposals.length, 'proposal')} ({statusSummary(h.proposals)})
        </button>
      ) : null}
      {h.sims.length ? (
        <button type="button" className="hub-link" onClick={click(() => go('proposals', { section: 'sims', prospectId: prospect.id }))}>
          📈 {plural(h.sims.length, 'sim')} ({statusSummary(h.sims)})
        </button>
      ) : null}
      {h.coldLeads.length ? (
        <button type="button" className="hub-link warn" title="Same company is also a cold lead — merge in Duplicates" onClick={click(() => go('coldleads'))}>
          ⚠ also {plural(h.coldLeads.length, 'cold lead')}
        </button>
      ) : null}
    </div>
  );
}
