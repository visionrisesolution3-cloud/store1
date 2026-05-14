// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD-thsNt3Q29Vb09D8pqCraAskEv2g5now",
  authDomain: "store-5b7ea.firebaseapp.com",
  projectId: "store-5b7ea",
  storageBucket: "store-5b7ea.firebasestorage.app",
  messagingSenderId: "690396824037",
  appId: "1:690396824037:web:56e1a41235e8a391526f0c"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Enable Auth persistence
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .then(() => {
    console.log('Firebase Auth persistence enabled');
  })
  .catch((error) => {
    console.error('Error enabling persistence:', error);
  });