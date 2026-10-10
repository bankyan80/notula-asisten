import { Link } from 'react-router-dom';
import type { Meeting } from '../../core/types/entities';
import { formatDateIdShort, formatClock } from '../../core/utils/time';

export interface MeetingListItemProps {
  meeting: Meeting;
}

export function MeetingListItem({ meeting }: MeetingListItemProps) {
  return (
    <Link
      to={`/rapat/${meeting.id}/transkrip`}
      className="block rounded-2xl bg-white p-4 active:bg-light"
    >
      <h3 className="text-base font-semibold text-ink">{meeting.title}</h3>
      <p className="mt-1 text-sm text-muted">
        {formatDateIdShort(meeting.date)} • {formatClock(meeting.durationSeconds)}
      </p>
    </Link>
  );
}
