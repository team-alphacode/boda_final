import { app } from './firebase.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';

export const auth = getAuth(app);