import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { X } from 'lucide-react';
import { db } from './firebase';
import { useTheme } from './ThemeContext';
import { useToast } from './Toast';
import { triviaQuestions } from './triviaQuestions';

const WINDOW_MS = 30 * 60 * 1000;       // Cada media hora hay una ronda
// La bolita está visible toda la media hora; desaparece al jugar hasta la siguiente ronda.
// (Reducir este valor, p.ej. a 10*60*1000, haría que solo apareciera 10 min por ronda.)
const GIFT_VISIBLE_MS = WINDOW_MS;
const QUESTION_TIME = 15;               // Segundos para responder
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const OPTION_COLORS = ['red', 'blue', 'yellow', 'green'];

/**
 * Trivia estilo Kahoot: cada media hora aparece una bolita de regalo 3D.
 * Al pulsarla se abre una pregunta sobre los grupos de la playlist.
 * Si aciertas: +1 propuesta de canción y +2 votos extra.
 * Una sola oportunidad por ronda (aunque falles).
 */
export default function TriviaGift({ userId, t, lastTriviaAt }) {
  const { theme } = useTheme();
  const toast = useToast();
  const isCatrina = theme === 'catrina';

  const [now, setNow] = useState(() => Date.now());
  const [showModal, setShowModal] = useState(false);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | playing | revealed
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [won, setWon] = useState(false);
  // Respuesta local por ronda, claveada por ventana (sin refs durante el render)
  const [answeredRound, setAnsweredRound] = useState({ windowId: -1, done: false });
  const [deadline, setDeadline] = useState(0);

  const closeTimerRef = useRef(null);

  const windowId = Math.floor(now / WINDOW_MS);
  const timeInWindow = now % WINDOW_MS;
  const giftVisible = timeInWindow < GIFT_VISIBLE_MS;
  const answeredThisWindow = (answeredRound.windowId === windowId && answeredRound.done)
    || (lastTriviaAt && (now - lastTriviaAt) < WINDOW_MS);

  // Reloj interno para saber cuándo aparece/desaparece la bolita
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  // Limpieza del cierre programado al desmontar
  useEffect(() => () => { if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current); }, []);

  const pickQuestion = useCallback(() => {
    const lastIdx = Number(localStorage.getItem('trivia-last-q') || -1);
    let idx = Math.floor(Math.random() * triviaQuestions.length);
    if (idx === lastIdx) idx = (idx + 1) % triviaQuestions.length;
    localStorage.setItem('trivia-last-q', String(idx));
    setQuestion(triviaQuestions[idx]);
  }, []);

  const openTrivia = () => {
    if (!giftVisible || answeredThisWindow) return;
    if (!userId) return;
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    pickQuestion();
    setSelected(null);
    setPhase('playing');
    setTimeLeft(QUESTION_TIME);
    setWon(false);
    setDeadline(Date.now() + QUESTION_TIME * 1000);
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const finishRound = useCallback((correct, correctArtist) => {
    setPhase('revealed');
    setAnsweredRound({ windowId: Math.floor(Date.now() / WINDOW_MS), done: true });
    if (correct) {
      setWon(true);
      updateDoc(doc(db, 'users', userId), {
        freeProposals: increment(1),
        freeVotes: increment(2),
        lastTriviaAt: Date.now(),
      }).then(() => {
        toast(t.triviaWin, 'success', 4500);
      }).catch(() => toast(t.firebaseError, 'error'));
    } else {
      updateDoc(doc(db, 'users', userId), { lastTriviaAt: Date.now() }).catch(() => {});
      toast(t.triviaLose.replace('{answer}', correctArtist), 'error', 5000);
    }
    closeTimerRef.current = window.setTimeout(closeModal, 2600);
  }, [userId, t, toast]);

  const handleSelect = (idx) => {
    if (phase !== 'playing' || selected !== null || !question) return;
    setSelected(idx);
    finishRound(idx === question.answer, question.options[question.answer]);
  };

  // Cuenta atrás basada en un deadline: el estado se actualiza desde el intervalo (asíncrono)
  useEffect(() => {
    if (!showModal || phase !== 'playing' || !question || !deadline) return undefined;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        window.clearInterval(timer);
        finishRound(false, question.options[question.answer]);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [showModal, phase, deadline, question, finishRound]);

  if (!userId || !giftVisible || answeredThisWindow) return null;

  return (
    <>
      <button
        type="button"
        onClick={openTrivia}
        className="trivia-gift"
        title={t.triviaGiftTitle}
        aria-label={t.triviaGiftTitle}
      >
        <span className="trivia-gift-ring" />
        <span className="trivia-gift-box"><span>🎁</span></span>
        <span className="trivia-gift-label">+1 🎵 · +2 🗳️</span>
      </button>

      {showModal && question && (
        <div className="trivia-overlay" onClick={closeModal}>
          <div
            className={`trivia-modal ${isCatrina ? 'trivia-modal-catrina' : ''}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t.triviaGiftTitle}
          >
            <div className="trivia-head">
              <span className="trivia-badge">🎁 {t.triviaGiftTitle}</span>
              <span className="trivia-timer">{timeLeft}s</span>
              <button type="button" onClick={closeModal} className="trivia-close" aria-label={t.next}>
                <X size={18} />
              </button>
            </div>

            <p className="trivia-question">
              {t.triviaQuestion.replace('{song}', question.song)}
            </p>

            <div className="trivia-options">
              {question.options.map((opt, i) => {
                const isCorrect = i === question.answer;
                const isSelected = selected === i;
                let state = '';
                if (phase === 'revealed') {
                  if (isCorrect) state = ' correct';
                  else if (isSelected) state = ' wrong';
                  else state = ' dim';
                }
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelect(i)}
                    disabled={phase !== 'playing' || selected !== null}
                    className={`trivia-option trivia-opt-${OPTION_COLORS[i]}${state}`}
                  >
                    <span className="trivia-opt-letter">{OPTION_LETTERS[i]}</span>
                    <span className="trivia-opt-text">{opt}</span>
                    {phase === 'revealed' && isCorrect && <span className="trivia-opt-mark">✓</span>}
                    {phase === 'revealed' && isSelected && !isCorrect && <span className="trivia-opt-mark">✗</span>}
                  </button>
                );
              })}
            </div>

            {phase === 'revealed' && (
              <p className={`trivia-result ${won ? 'trivia-result-win' : 'trivia-result-lose'}`}>
                {won ? t.triviaWin : t.triviaLose.replace('{answer}', question.options[question.answer])}
              </p>
            )}

            <p className="trivia-reward">{t.triviaReward}</p>
          </div>
        </div>
      )}
    </>
  );
}
