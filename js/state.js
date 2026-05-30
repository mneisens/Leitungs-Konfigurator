/**
 * @file Zentraler Anwendungszustand.
 */

/** @typedef {import('./config.js').DEFAULT_WIZARD_STEPS} WizardStep */

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
    wizardStepIndex: 0,
    abarbeitungOrder: [],
    abarbeitungCursor: 0,
    modalResolve: null,
    projectsCache: [],
    wizardSteps: [],
    firebaseReady: false,
    firebaseAuth: null,
    firebaseDb: null,
    currentUser: null,
    currentUserRole: 'user',
    firebaseInitError: '',
    firestoreErrorShown: false
};
