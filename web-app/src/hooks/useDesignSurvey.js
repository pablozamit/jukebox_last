import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export function useDesignSurvey({ theme, userId }) {
  const [showDesignSurvey, setShowDesignSurvey] = useState(false);
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const surveyTimerRef = useRef(null);
  const prevThemeRef = useRef(theme);

  useEffect(() => {
    const answered = localStorage.getItem('design-survey-answered');
    if (theme === 'neon' && prevThemeRef.current === 'catrina' && !answered) {
      surveyTimerRef.current = setTimeout(() => {
        setShowDesignSurvey(true);
      }, 60000);
    }
    prevThemeRef.current = theme;
    return () => {
      if (surveyTimerRef.current) clearTimeout(surveyTimerRef.current);
    };
  }, [theme]);

  const submitDesignSurvey = async (preference) => {
    try {
      await addDoc(collection(db, 'design_feedback'), {
        preference,
        theme: 'neon',
        userId: userId || 'anonymous',
        timestamp: serverTimestamp(),
      });
    } catch {
      console.error('Survey save error');
    }
    localStorage.setItem('design-survey-answered', 'true');
    setSurveySubmitted(true);
    setTimeout(() => setShowDesignSurvey(false), 1500);
  };

  const dismissSurvey = () => {
    localStorage.setItem('design-survey-answered', 'true');
    setShowDesignSurvey(false);
  };

  return { showDesignSurvey, surveySubmitted, submitDesignSurvey, dismissSurvey };
}
