/* ========================================================
   PCF - firebase-config.js
   Configuração do Firebase (App, Auth e Firestore)

   INSTRUÇÕES DE CONFIGURAÇÃO:
   1. Acesse https://console.firebase.google.com/
   2. Crie um novo projeto (ou use um existente)
   3. Em "Configurações do projeto" > "Seus aplicativos" > "Web app", copie o objeto firebaseConfig
   4. Substitua os valores de placeholder abaixo pelos seus dados reais
   5. No console Firebase, ative:
      - Authentication > Sign-in method > E-mail/senha
      - Firestore Database (modo produção)
   6. Implante as regras de segurança do arquivo firestore.rules
   ======================================================== */

window.PCF = window.PCF || {};

PCF.Firebase = (() => {
  const config = {
    apiKey: "AIzaSyCjfXX8ZECLhQ56C2iggwsaBd3U3DavlQ4",
    authDomain: "pcf5432.firebaseapp.com",
    databaseURL: "https://pcf5432-default-rtdb.firebaseio.com",
    projectId: "pcf5432",
    storageBucket: "pcf5432.firebasestorage.app",
    messagingSenderId: "1051505050657",
    appId: "1:1051505050657:web:23f3222618dbbd20bc8f60",
    measurementId: "G-Q592W5HCYJ"
  };

  firebase.initializeApp(config);

  const auth = firebase.auth();
  const db   = firebase.firestore();

  // Persistência de sessão: LOCAL = sobrevive ao fechamento do navegador
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

  return { auth, db, config };
})();
