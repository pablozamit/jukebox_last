import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, linkWithCredential, EmailAuthProvider, signOut, signInAnonymously, sendPasswordResetEmail } from 'firebase/auth';
import { doc, runTransaction, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { firebaseErrorMessage } from '../firebaseErrorMessage';
import { initializeUserProfile, registerUserProfile } from '../userProfile.mjs';

export function useUserSession({ toast, t }) {
  const [userId, setUserId] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [userData, setUserData] = useState(null);
  const [userProposals, setUserProposals] = useState([]);
  const [userVotes, setUserVotes] = useState([]);
  const [showRegister, setShowRegister] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDjName, setRegDjName] = useState('');
  const [authErrorMsg, setAuthErrorMsg] = useState('');
  const [authMode, setAuthMode] = useState('register');

  useEffect(() => {
    let unsubUser = null;
    let sessionVersion = 0;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const version = ++sessionVersion;
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }
      setUserData(null);
      setUserProposals([]);
      setUserVotes([]);
      if (user) {
        setUserId(user.uid);
        setIsRegistered(!!user.email);
        const userRef = doc(db, 'users', user.uid);
        try {
          await runTransaction(db, transaction => initializeUserProfile(transaction, userRef));
        } catch (error) {
          if (version !== sessionVersion) return;
          console.error('Firebase user initialization error:', error);
          toast(`Perfil: ${firebaseErrorMessage(error)}`, 'error');
        }
        if (version !== sessionVersion) return;
        unsubUser = onSnapshot(userRef, (docSnap) => {
          if (version !== sessionVersion) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProposals(data.proposals || []);
            setUserVotes(data.votes || []);
            setUserData(data);
          }
        }, (error) => {
          console.error('Firebase user listener error:', error);
          toast(`Perfil: ${firebaseErrorMessage(error)}`, 'error');
        });
      } else {
        setUserId(null);
        setIsRegistered(false);
        setUserProposals([]);
        setUserVotes([]);
        setUserData(null);
      }
    });
    return () => {
      sessionVersion += 1;
      unsubscribe();
      if (unsubUser) unsubUser();
    };
  }, [toast]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthErrorMsg('');
    const djNameClean = regDjName.trim();
    if (!djNameClean) {
      setAuthErrorMsg(t.djNameEmpty);
      return;
    }
    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        await signInAnonymously(auth);
        currentUser = auth.currentUser;
      }
      const credential = EmailAuthProvider.credential(regEmail.trim(), regPassword);
      const linkedCredential = await linkWithCredential(currentUser, credential);
      const registeredUser = linkedCredential.user;
      const userRef = doc(db, 'users', registeredUser.uid);
      await runTransaction(db, transaction => registerUserProfile(transaction, userRef, {
        isRegistered: true,
        email: regEmail.trim(),
        djName: djNameClean.slice(0, 20),
      }));
      setShowRegister(false);
      setShowLogin(false);
      setIsRegistered(true);
      toast(t.registerSuccess, 'success');
    } catch (error) {
      if (error.code === 'auth/email-already-in-use' || error.code === 'auth/credential-already-in-use') {
        setAuthMode('login');
        setAuthErrorMsg(t.registerEmailInUse);
      } else if (error.code === 'auth/invalid-email') {
        setAuthErrorMsg(t.invalidEmail);
      } else {
        console.error('Firebase registration error:', error);
        setAuthErrorMsg(firebaseErrorMessage(error));
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthErrorMsg('');
    try {
      await signInWithEmailAndPassword(auth, regEmail.trim(), regPassword);
      setShowLogin(false);
      setShowRegister(false);
      setIsRegistered(true);
      toast(t.loginSuccess, 'success');
    } catch (error) {
      console.error('Firebase login error:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setAuthErrorMsg(t.wrongCredentials);
      } else {
        setAuthErrorMsg(firebaseErrorMessage(error));
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!regEmail) {
      setAuthErrorMsg(t.enterEmailFirst);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, regEmail);
      toast(t.passwordResetSent, 'success');
    } catch {
      toast(t.passwordResetError, 'error');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setShowProfile(false);
    setShowRegister(false);
    setShowLogin(false);
    setIsRegistered(false);
    signInAnonymously(auth).catch(console.error);
  };

  return {
    userId,
    isRegistered,
    userData,
    userProposals,
    userVotes,
    showRegister,
    setShowRegister,
    showLogin,
    setShowLogin,
    showProfile,
    setShowProfile,
    regEmail,
    setRegEmail,
    regPassword,
    setRegPassword,
    regDjName,
    setRegDjName,
    authErrorMsg,
    setAuthErrorMsg,
    authMode,
    setAuthMode,
    handleRegister,
    handleLogin,
    handleForgotPassword,
    handleLogout,
  };
}
