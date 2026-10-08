import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyDhMik7cS_SQmYH8ZJsQmPmZ1qJZN40AL4',
  authDomain: 'amor-772d4.firebaseapp.com',
  projectId: 'amor-772d4',
  storageBucket: 'amor-772d4.firebasestorage.app',
  messagingSenderId: '562513608783',
  appId: '1:562513608783:web:65dbba6dbe1fb5a62c6a3a'
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Spark: no se inicializa Storage, Analytics ni Authentication aquí.