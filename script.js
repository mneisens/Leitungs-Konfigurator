/**
 * @file script.js – Einstiegspunkt der Anwendung.
 */
import { appState } from './js/state.js';
import { loadTemplates } from './js/templates.js';
import { loadKatalog } from './js/catalog.js';
import {
    initFirebase,
    ensureUserProfile,
    loadKatalogAdditions,
    updateAuthUI,
    loginUser,
    registerUser,
    logoutUser,
    showAuthMode,
    resetPassword
} from './js/firebase.js';
import {
    onKatalogKategorieChange,
    onKatalogSearch,
    onKatalogHerstellerChange,
    openKatalogLeitungModal,
    closeKatalogLeitungModal,
    addKatalogArtikel,
    deleteKatalogArtikel,
    setKatalogTab,
    onKatalogBauteilTypChange,
    onKatalogBauteilGruppeChange,
    onKatalogBauteilSearch,
    onKatalogBauteilHerstellerChange,
    addKatalogBauteil,
    deleteKatalogBauteil,
    editKatalogBauteil,
    cancelEditKatalogBauteil,
    revertKatalogBauteil
} from './js/katalog-view.js';
import {
    loadProjects,
    filterProjektListe,
    openNewProjektForm,
    saveProjekt,
    shareProjectWithUser,
    removeProjectShare,
    openProjectSharing,
    toggleProjectVisibility,
    onProjektVorlageChange,
    addCadLinkZeile,
    removeCadLinkZeile
} from './js/projects.js';
import { showView, toggleSidebar, closeSidebar } from './js/navigation.js';
import { closeModal } from './js/modal.js';
import { exportAllProjects, importProjects, exportCSV, exportPDF } from './js/export.js';
import { initTheme, toggleTheme } from './js/theme.js';
import {
    filterGruppenListe,
    selectGruppe,
    gruppeWechseln,
    toggleGruppeNichtBenoetigt,
    gruppeAddLeitung,
    gruppeUpdateLeitung,
    gruppeUpdateLeitungText,
    gruppeAendereAnzahl,
    gruppeDeleteLeitung,
    gruppeEditLeitung,
    gruppeCloseLeitungEditor,
    gruppeCloseAktivenEditor,
    gruppeEditBauteil,
    gruppeCloseBauteilEditor,
    gruppeAddBauteil,
    gruppeUpdateBauteil,
    gruppeUpdateBauteilText,
    gruppeDeleteBauteil,
    gruppeOpenBauteilFormular,
    gruppeCancelBauteilFormular,
    gruppeOnNeuBauteilTypChange,
    gruppeSaveNeuesBauteil,
    gruppeOpenLeitungFormular,
    gruppeOpenLeitungFormularAusLeitung,
    gruppeCancelLeitungFormular,
    gruppeOnNeuLeitungKategorieChange,
    gruppeOnNeuLeitungMeterwareChange,
    gruppeSaveNeuesLeitung,
    gruppeSaveNeueGruppe,
    gruppeDeleteZusaetzlicheGruppe,
    gruppeOpenEigenerButtonFormular,
    gruppeCancelEigenerButtonFormular,
    gruppeOnEigenerButtonField,
    gruppeOnEigenerButtonKategorieChange,
    gruppeOnEigenerButtonHerstellerChange,
    gruppeOnEigenerButtonKatalogSuche,
    gruppeOnEigenerButtonKatalogArtikel,
    gruppeOnEigenerButtonVorgabeTypChange,
    gruppeOnEigenerButtonAlleTypen,
    gruppeOnEigenerButtonWhitelistToggle,
    gruppeSaveEigenerButton,
    gruppeDeleteEigenerButton,
    gruppeSaveLeitungAlsButton,
    toggleBauteilTypSchnellwahl,
    gruppeOpenPicker,
    gruppeClosePicker,
    gruppeOnPickerSuche,
    gruppeOnPickerTaste,
    gruppePickerBauteilTyp,
    gruppePickerZurueck,
    gruppeAddLeitungAusArtikel,
    gruppeAddBauteilAusArtikel,
    gruppeVorschlagUebernehmen,
    gruppeVorschlagAusblenden,
    gruppeVorschlaegeZuruecksetzen,
    gruppeAlleVorschlaegeUebernehmen,
    gruppeBauteilVorschlagUebernehmen,
    gruppeAddLeitungAusReihe,
    gruppeWaehleStecker,
    gruppeOnPickerListeTaste,
    gruppePickerKategorie,
    gruppeAddKatalogArtikelDirekt,
    gruppeAddLeitungMitKategorie,
    gruppeAddLeitungWie,
    gruppeAbschliessen,
    gruppeWiederOeffnen,
    gruppeTogglePruefliste,
    gruppeOeffnePruefliste,
    gruppeSetPrueflisteFilter,
    gruppeZeigePosition,
    gruppeSetBeschaffung,
    gruppeSucheOeffnen,
    gruppeStandardAngebotVerwerfen
} from './js/gruppen-konfigurator.js';
import { editLeitung, deleteLeitung, deleteBauteil, setUebersichtLeitungenSortierung } from './js/overview.js';
import { openBauteilEdit, closeBauteilEdit, saveBauteilEdit, filterBauteilEditHersteller } from './js/bauteil-edit.js';
import { stuecklisteUpdateStatus, stuecklisteSetKategorieFilter, printStueckliste } from './js/stueckliste.js';
import {
    topoSetSchritt,
    topoAendereModulAnzahl,
    topoDreheModul,
    topoVerbindungAbbrechen,
    topoSchliesseLeitungEditor,
    topoUpdateLeitung,
    topoLoescheLeitung,
    topoHebeLeitungHervor,
    topoHebeModulHervor,
    topoOeffneLeitung
} from './js/topologie.js';
document.addEventListener('keydown', e => {
    const bauteilOverlay = document.getElementById('bauteil-edit-overlay');
    if (bauteilOverlay?.classList.contains('active')) {
        if (e.key === 'Escape') closeBauteilEdit();
        return;
    }

    const overlay = document.getElementById('modal-overlay');
    if (overlay?.classList.contains('active')) {
        if (e.key === 'Escape') closeModal(false);
        else if (e.key === 'Enter') closeModal(true);
        return;
    }

    if (e.key === 'Escape' && document.querySelector('.editor-overlay')) {
        e.preventDefault();
        gruppeCloseAktivenEditor();
        return;
    }

    // Enter im Login-/Registrierungs-Formular löst die jeweilige Aktion aus
    if (e.key === 'Enter' && document.getElementById('view-auth')?.classList.contains('active')) {
        const id = e.target?.id;
        if (id === 'auth-email' || id === 'auth-password') {
            loginUser();
        } else if (id === 'reg-email' || id === 'reg-password' || id === 'reg-password-repeat') {
            registerUser();
        } else if (id === 'reset-email') {
            resetPassword();
        }
    }
});


document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await loadTemplates();
    await loadKatalog();
    initFirebase();

    if (appState.firebaseReady) {
        appState.firebaseAuth.onAuthStateChanged(async user => {
            if (!user) {
                appState.currentUser = null;
                appState.currentUserRole = 'user';
                appState.currentProjekt = null;
                appState.projectsCache = [];
                updateAuthUI();
                showView('auth');
                return;
            }

            appState.currentUser = user;
            await ensureUserProfile(user);
            await loadKatalogAdditions();
            await loadProjects();
            updateAuthUI();
            showView('home');
        });
    } else {
        await loadProjects();
        updateAuthUI();
        const { mergeKatalogAdditions } = await import('./js/catalog.js');
        const { loadGruppenPresets } = await import('./js/gruppen-preset-store.js');
        try {
            const raw = localStorage.getItem('leitungskonfigurator_katalog_additions');
            const additions = raw ? JSON.parse(raw) : [];
            if (Array.isArray(additions)) mergeKatalogAdditions(additions);
        } catch { /* ignore */ }
        await loadGruppenPresets();
        showView('home');
        if (window.firebaseConfig?.apiKey) {
            const { showModal } = await import('./js/modal.js');
            showModal(
                `Firebase konnte nicht aktiviert werden.\n\n${appState.firebaseInitError || 'Unbekannter Fehler'}\n\nAktuell läuft die App nur lokal.`,
                { type: 'warning', title: 'Firebase-Problem' }
            );
        }
    }
});


Object.assign(window, {
    showView,
    toggleSidebar,
    closeSidebar,
    toggleTheme,
    logoutUser,
    registerUser,
    loginUser,
    showAuthMode,
    resetPassword,
    exportAllProjects,
    importProjects,
    filterProjektListe,
    openNewProjektForm,
    saveProjekt,
    shareProjectWithUser,
    removeProjectShare,
    openProjectSharing,
    toggleProjectVisibility,
    onProjektVorlageChange,
    addCadLinkZeile,
    removeCadLinkZeile,
    onKatalogKategorieChange,
    onKatalogSearch,
    onKatalogHerstellerChange,
    openKatalogLeitungModal,
    closeKatalogLeitungModal,
    addKatalogArtikel,
    deleteKatalogArtikel,
    setKatalogTab,
    onKatalogBauteilTypChange,
    onKatalogBauteilGruppeChange,
    onKatalogBauteilSearch,
    onKatalogBauteilHerstellerChange,
    addKatalogBauteil,
    deleteKatalogBauteil,
    editKatalogBauteil,
    cancelEditKatalogBauteil,
    revertKatalogBauteil,
    filterGruppenListe,
    selectGruppe,
    gruppeWechseln,
    toggleGruppeNichtBenoetigt,
    gruppeAddLeitung,
    gruppeUpdateLeitung,
    gruppeUpdateLeitungText,
    gruppeAendereAnzahl,
    gruppeDeleteLeitung,
    gruppeEditLeitung,
    gruppeCloseLeitungEditor,
    gruppeCloseAktivenEditor,
    gruppeEditBauteil,
    gruppeCloseBauteilEditor,
    gruppeAddBauteil,
    gruppeUpdateBauteil,
    gruppeUpdateBauteilText,
    gruppeDeleteBauteil,
    gruppeOpenBauteilFormular,
    gruppeCancelBauteilFormular,
    gruppeOnNeuBauteilTypChange,
    gruppeSaveNeuesBauteil,
    gruppeOpenLeitungFormular,
    gruppeOpenLeitungFormularAusLeitung,
    gruppeCancelLeitungFormular,
    gruppeOnNeuLeitungKategorieChange,
    gruppeOnNeuLeitungMeterwareChange,
    gruppeSaveNeuesLeitung,
    gruppeSaveNeueGruppe,
    gruppeDeleteZusaetzlicheGruppe,
    gruppeOpenEigenerButtonFormular,
    gruppeCancelEigenerButtonFormular,
    gruppeOnEigenerButtonField,
    gruppeOnEigenerButtonKategorieChange,
    gruppeOnEigenerButtonHerstellerChange,
    gruppeOnEigenerButtonKatalogSuche,
    gruppeOnEigenerButtonKatalogArtikel,
    gruppeOnEigenerButtonVorgabeTypChange,
    gruppeOnEigenerButtonAlleTypen,
    gruppeOnEigenerButtonWhitelistToggle,
    gruppeSaveEigenerButton,
    gruppeDeleteEigenerButton,
    gruppeSaveLeitungAlsButton,
    toggleBauteilTypSchnellwahl,
    gruppeOpenPicker,
    gruppeClosePicker,
    gruppeOnPickerSuche,
    gruppeOnPickerTaste,
    gruppePickerBauteilTyp,
    gruppePickerZurueck,
    gruppeAddLeitungAusArtikel,
    gruppeAddBauteilAusArtikel,
    gruppeVorschlagUebernehmen,
    gruppeVorschlagAusblenden,
    gruppeVorschlaegeZuruecksetzen,
    gruppeAlleVorschlaegeUebernehmen,
    gruppeBauteilVorschlagUebernehmen,
    gruppeAddLeitungAusReihe,
    gruppeWaehleStecker,
    gruppeOnPickerListeTaste,
    gruppePickerKategorie,
    gruppeAddKatalogArtikelDirekt,
    gruppeAddLeitungMitKategorie,
    gruppeAddLeitungWie,
    gruppeAbschliessen,
    gruppeWiederOeffnen,
    gruppeTogglePruefliste,
    gruppeOeffnePruefliste,
    gruppeSetPrueflisteFilter,
    gruppeZeigePosition,
    gruppeSetBeschaffung,
    gruppeSucheOeffnen,
    gruppeStandardAngebotVerwerfen,
    exportCSV,
    exportPDF,
    closeModal,
    editLeitung,
    deleteLeitung,
    deleteBauteil,
    setUebersichtLeitungenSortierung,
    openBauteilEdit,
    closeBauteilEdit,
    saveBauteilEdit,
    filterBauteilEditHersteller,
    stuecklisteUpdateStatus,
    stuecklisteSetKategorieFilter,
    printStueckliste,
    topoSetSchritt,
    topoAendereModulAnzahl,
    topoDreheModul,
    topoVerbindungAbbrechen,
    topoSchliesseLeitungEditor,
    topoUpdateLeitung,
    topoLoescheLeitung,
    topoHebeLeitungHervor,
    topoHebeModulHervor,
    topoOeffneLeitung
});
