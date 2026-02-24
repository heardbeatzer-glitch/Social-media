// ====== Firebase Configuratie (Vervang DIT met jouw eigen Firebase Config!) ======
const firebaseConfig = {
    apiKey: "JOUW_API_KEY",
    authDomain: "JOUW_PROJECT_ID.firebaseapp.com",
    projectId: "JOUW_PROJECT_ID",
    storageBucket: "JOUW_PROJECT_ID.appspot.com",
    messagingSenderId: "JOUW_MESSAGING_SENDER_ID",
    appId: "JOUW_APP_ID"
};

// Initialiseer Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ====== Global DOM Elementen ======
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const emailForm = document.getElementById('email-form');
const emailInput = document.getElementById('email-input');
const verifyForm = document.getElementById('verify-form');
const codeInput = document.getElementById('code-input');
const authMessage = document.getElementById('auth-message');
const uploadBtn = document.getElementById('upload-btn');
const logoutBtn = document.getElementById('logout-btn');
const mediaUploadInput = document.getElementById('media-upload-input');
const videoFeed = document.getElementById('video-feed');

let currentUser = null; // Houdt de ingelogde gebruiker bij
let actionCodeSettings = null; // Voor de 'magic link' e-mail


// ====== Functies voor Scherm Wisselen ======
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

// ====== AUTHENTICATIE LOGICA ======

// 1. Gebruiker vult e-mail in en vraagt code aan
emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    authMessage.textContent = 'Code versturen...';

    actionCodeSettings = {
        url: window.location.href, // De huidige URL waar de gebruiker wordt geverifieerd
        handleCodeInApp: true,
    };

    try {
        await auth.sendSignInLinkToEmail(email, actionCodeSettings);
        window.localStorage.setItem('emailForSignIn', email); // Opslaan voor verificatie
        authMessage.textContent = `Code verstuurd naar ${email}. Check je inbox!`;
        emailForm.classList.add('hidden');
        verifyForm.classList.remove('hidden');
    } catch (error) {
        console.error("Fout bij versturen code:", error);
        authMessage.textContent = `Fout: ${error.message}`;
    }
});

// 2. Gebruiker vult de code in (of klikt op link in e-mail)
verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = window.localStorage.getItem('emailForSignIn');
    const code = codeInput.value;

    if (!email || !code) {
        authMessage.textContent = 'E-mail of code ontbreekt.';
        return;
    }

    try {
        const result = await auth.signInWithEmailLink(email, window.location.href);
        // Na succesvolle login:
        window.localStorage.removeItem('emailForSignIn'); // Opruimen
        currentUser = result.user;
        authMessage.textContent = `Welkom, ${currentUser.email}!`;
        // Naam kiezen
        await promptForUsername(currentUser.uid); // Roept functie aan om naam te kiezen
        showScreen('main-app');
        loadGiggleContent(); // Laad de filmpjes
    } catch (error) {
        console.error("Fout bij verificatie:", error);
        authMessage.textContent = `Verificatie mislukt: ${error.message}`;
    }
});

// Check bij het laden van de pagina of de gebruiker al is ingelogd of een 'magic link' heeft geklikt
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        // Als de gebruiker is ingelogd, direct naar de app
        showScreen('main-app');
        loadGiggleContent();
    } else {
        // Controleer of de gebruiker via een 'magic link' komt
        if (auth.isSignInWithEmailLink(window.location.href)) {
            let email = window.localStorage.getItem('emailForSignIn');
            if (!email) {
                // Als de e-mail niet is opgeslagen, vraag de gebruiker om deze in te voeren
                email = prompt('Bevestig je e-mailadres voor inloggen:');
                if (!email) {
                    authMessage.textContent = 'Annuleerd. Vul je e-mail opnieuw in.';
                    showScreen('login-screen');
                    return;
                }
            }
            try {
                const result = await auth.signInWithEmailLink(email, window.location.href);
                window.localStorage.removeItem('emailForSignIn');
                currentUser = result.user;
                await promptForUsername(currentUser.uid); // Naam kiezen
                showScreen('main-app');
                loadGiggleContent();
            } catch (error) {
                console.error("Error signing in with email link", error);
                authMessage.textContent = `Inloggen via link mislukt: ${error.message}`;
                showScreen('login-screen');
            }
        } else {
            showScreen('login-screen');
        }
    }
});

// Functie om gebruikersnaam te kiezen
async function promptForUsername(uid) {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || !userDoc.data().username) {
        let username = null;
        while (!username || username.trim() === '') {
            username = prompt('Welkom bij GiggleGrid! Kies een gebruikersnaam:');
            if (username && username.trim() !== '') {
                // Check hier eventueel of username al bestaat
                await db.collection('users').doc(uid).set({ username: username.trim() }, { merge: true });
            }
        }
    }
}

// Uitloggen
logoutBtn.addEventListener('click', async () => {
    await auth.signOut();
    currentUser = null;
    showScreen('login-screen');
    // Clear the video feed
    videoFeed.innerHTML = '';
});

// ====== MEDIA UPLOAD LOGICA ======
uploadBtn.addEventListener('click', () => {
    if (!currentUser) {
        alert("Je moet ingelogd zijn om te uploaden!");
        return;
    }
    mediaUploadInput.click(); // Activeer de file input
});

mediaUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!currentUser) {
        alert("Je moet ingelogd zijn om te uploaden!");
        return;
    }

    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const username = userDoc.data().username || 'Anoniem'; // Haal gebruikersnaam op

        const storageRef = storage.ref(`uploads/${currentUser.uid}/${Date.now()}_${file.name}`);
        const uploadTask = storageRef.put(file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload is ' + progress + '% done');
                // Optioneel: toon upload progress bar aan de gebruiker
            },
            (error) => {
                console.error("Upload failed", error);
                alert("Upload mislukt: " + error.message);
            },
            async () => {
                const downloadURL = await storageRef.getDownloadURL();
                const caption = prompt("Voeg een grappige caption toe:"); // Vraag om caption
                
                await db.collection('giggles').add({
                    userId: currentUser.uid,
                    username: username, // Sla gebruikersnaam op bij de giggle
                    mediaUrl: downloadURL,
                    type: file.type.startsWith('video') ? 'video' : 'image',
                    caption: caption || '',
                    likes: 0,
                    comments: [],
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                alert("Upload succesvol!");
                loadGiggleContent(); // Ververs de feed
            }
        );
    } catch (error) {
        console.error("Fout bij upload of gegevens ophalen", error);
        alert("Er ging iets mis bij het upload
