/**
 * @file Zentraler Anwendungszustand.
 */

/**
 * Globaler Zustand der Anwendung.
 * @type {object}
 */
export const appState = {
    katalog: null,
    bauteileKatalog: null,
    leitungGruppen: [],
    currentProjekt: null,
    currentLeitungIndex: 0,
    currentArtikelVorschlag: null,
    modalResolve: null,
    projectsCache: [],
    firebaseReady: false,
    firebaseAuth: null,
    firebaseDb: null,
    currentUser: null,
    currentUserRole: 'user',
    firebaseInitError: '',
    firestoreErrorShown: false
};
