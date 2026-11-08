/* Liga o app ao Firebase. Todo o resto do código usa o que é exportado daqui. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, query, where, onSnapshot, getDoc, getDocs, getDocsFromServer, setDoc, updateDoc, deleteDoc,
  writeBatch, arrayUnion, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

export const configurado = !String(firebaseConfig.apiKey).includes("COLE_AQUI");

export const app = configurado ? initializeApp(firebaseConfig) : null;
export const auth = configurado ? getAuth(app) : null;

/* Cache local permanente: o app funciona sem internet e sincroniza quando a conexão volta.
   É também uma cópia extra dos dados em cada celular. */
export const db = configurado
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  : null;

if (auth) setPersistence(auth, browserLocalPersistence).catch(() => {});

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut,
  doc, collection, query, where, onSnapshot, getDoc, getDocs, getDocsFromServer, setDoc, updateDoc, deleteDoc,
  writeBatch, arrayUnion, serverTimestamp
};
