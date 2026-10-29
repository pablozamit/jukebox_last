import { useState } from 'react';
import { Bell, Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { INVITE_TEXT, SOCIAL_TEXT as T, SOCIAL_ZONE_TEXT } from './socialText.mjs';

export default function SocialInvitationInbox({ invitations, lang, onRespond, onCancel, onMute, muteInvites, isRegistered }) {
  const [open, setOpen] = useState(false);
  const t = T[lang] || T.es;
  const pending = invitations.filter(invitation => invitation.status === 'pending');
  const recentAccepted = invitations.filter(invitation => invitation.status === 'accepted').slice(0, 2);
  const label = (type) => INVITE_TEXT[type]?.[lang] || type;
  return <section className="social-invitation-inbox">
    <button type="button" className="social-inbox-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span><Bell size={16} />{t.invitations}{pending.length > 0 && <b>{pending.length}</b>}</span>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>
    {open && <div className="social-inbox-content">
      {!isRegistered ? <p className="social-empty">{t.register}</p> : pending.length === 0 && recentAccepted.length === 0 ? <p className="social-empty">{lang === 'en' ? 'No pending invitations.' : 'No tienes invitaciones pendientes.'}</p> : <>
        {pending.map(invitation => {
        const incoming = invitation.direction === 'incoming';
        return <article className="social-invitation" key={invitation.id}>
          <div><strong>{incoming ? invitation.senderName || 'DJ' : invitation.recipientName || 'DJ'}</strong><span>{incoming ? t.incoming : t.outgoing} {label(invitation.type)}</span></div>
          {incoming ? <div className="social-invitation-controls"><button type="button" aria-label={t.accept} onClick={() => onRespond(invitation.id, 'accepted')}><Check size={15} />{t.accept}</button><button type="button" aria-label={t.decline} onClick={() => onRespond(invitation.id, 'declined')}><X size={15} />{t.decline}</button></div> : <button type="button" className="social-text-button" onClick={() => onCancel(invitation.id)}>{t.cancel}</button>}
        </article>;
        })}
        {recentAccepted.map(invitation => <article className="social-invitation is-accepted" key={invitation.id}>
          <div><strong>{lang === 'en' ? 'Invitation accepted' : 'Invitación aceptada'}</strong><span>{invitation.direction === 'incoming' ? invitation.senderName || 'DJ' : invitation.recipientName || 'DJ'} · {label(invitation.type)}</span><small>{[invitation.senderZone, invitation.recipientZone].filter(Boolean).map(zone => SOCIAL_ZONE_TEXT[zone]?.[lang] || zone).join(' · ')}</small></div>
          <Check size={16} aria-hidden="true" />
        </article>)}
      </>}
      {isRegistered && <button type="button" className="social-text-button social-mute-toggle" onClick={() => onMute(!muteInvites)}>{muteInvites ? t.unmuted : t.muted}</button>}
      <p className="social-invitation-note">{t.invitationNote}</p>
    </div>}
  </section>;
}
