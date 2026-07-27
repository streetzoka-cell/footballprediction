// src/utils/init.js
import { auth } from './firebase';

export const initApp = async () => {
  if (!auth) return;
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};