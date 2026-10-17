import { SOCIAL_ZONE_TEXT, activityLabel } from './socialText.mjs';
import SocialAvatar from './SocialAvatar';

export default function SocialPeopleList({ people, lang, onSelect, emptyText }) {
  if (!people.length) return <p className="social-empty">{emptyText}</p>;
  return <ul className="social-people-list">
    {people.map(person => <li key={person.uid}>
      <button type="button" className="social-person-row" onClick={() => onSelect(person.uid)}>
        <SocialAvatar equipped={person.equipped} size={38} />
        <span className="social-person-copy"><strong>{person.name || (lang === 'es' ? 'DJ de La Catrina' : 'La Catrina DJ')}</strong><small>{SOCIAL_ZONE_TEXT[person.zone]?.[lang] || person.zone}</small></span>
        {person.activity && activityLabel(person.activity.kind, lang) && <span className="social-person-activity">{activityLabel(person.activity.kind, lang)}</span>}
      </button>
    </li>)}
  </ul>;
}
