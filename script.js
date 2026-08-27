/**
 * @file script.js – Einstiegspunkt der Anwendung.
 */
import { DEFAULT_WIZARD_STEPS } from './js/config.js';
import { appState } from './js/state.js';
import { loadTemplates } from './js/templates.js';
import { loadKatalog } from './js/catalog.js';
import {
    initFirebase,
    ensureUserProfile,
    loadWizardQuestions,
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
    openNewProjektForm,
    saveProjekt,
    startProjektWizard,
    shareProjectWithUser,
    removeProjectShare,
    openProjectSharing,
    toggleProjectVisibility
} from './js/projects.js';
import { showView } from './js/navigation.js';
import { closeModal } from './js/modal.js';
import { exportAllProjects, importProjects, exportCSV, exportPDF } from './js/export.js';
import {
    adminAddWizardStep,
    saveAdminWizardConfig,
    adminLoadFromJson,
    adminMoveWizardStep,
    adminRemoveWizardStep,
    adminSetWizardStepPosition,
    adminFilterSteps,
    adminToggleStep
} from './js/admin.js';
import {
    wizardJumpToQuestion,
    wizardApplyJump,
    wizardCancelJump,
    wizardAddLeitungFromStep,
    wizardPrev,
    wizardNext,
    onWizardLaengeChange,
    toggleWizardStepEditor,
    cancelWizardStepEditor,
    saveWizardStepFromAssistent,
    updateWizardAutoArtikel
} from './js/wizard-ui.js';
import {
    filterWizardBauteilSelect,
    wizardAddBauteilFromStep,
    wizardDeleteBauteil,
    wizardDeleteLeitungenGroup,
    wizardDeleteLeitungFromStep,
    onWizardNichtVorhandenChange
} from './js/wizard-core.js';
import {
    onWizardKategorieChange,
    onWizardHerstellerChange,
    onWizardSteckerAChange,
    onWizardSteckerBChange,
    toggleWizardAusrichtung
} from './js/wizard-leitungen.js';
import { onWizardOelflexChange, onOelflexChange } from './js/oelflex.js';
import {
    backToOverview,
    saveLeitungAndNotify,
    addNewLeitung,
    prevLeitung,
    nextLeitung,
    saveLeitung,
    onKategorieFilterChange,
    onHerstellerChange,
    onSteckerChange,
    onLaengeChange,
    toggleAusrichtung
} from './js/konfigurator.js';
import {
    filterGruppenListe,
    selectGruppe,
    gruppeWechseln,
    toggleGruppeNichtBenoetigt,
    updateGruppeNotiz,
    gruppeAddLeitung,
    gruppeUpdateLeitung,
    gruppeUpdateLeitungText,
    gruppeToggleAusrichtung,
    gruppeToggleFreieLaenge,
    gruppeCopyLeitung,
    gruppeDeleteLeitung,
    gruppeEditLeitung,
    gruppeCloseLeitungEditor,
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
    gruppeSaveNeueGruppe,
    gruppeDeleteZusaetzlicheGruppe
} from './js/gruppen-konfigurator.js';
import { editLeitung, deleteLeitung, deleteBauteil } from './js/overview.js';
import { openBauteilEdit, closeBauteilEdit, saveBauteilEdit, filterBauteilEditHersteller } from './js/bauteil-edit.js';
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
    await loadTemplates();
    await loadKatalog();
    appState.wizardSteps = [...DEFAULT_WIZARD_STEPS];
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
            await loadWizardQuestions();
            await loadKatalogAdditions();
            await loadProjects();
            updateAuthUI();
            showView('home');
        });
    } else {
        await loadProjects();
        updateAuthUI();
        // Lokal: Katalog-Nachträge aus localStorage laden
        const { mergeKatalogAdditions } = await import('./js/catalog.js');
        try {
            const raw = localStorage.getItem('leitungskonfigurator_katalog_additions');
            const additions = raw ? JSON.parse(raw) : [];
            if (Array.isArray(additions)) mergeKatalogAdditions(additions);
        } catch { /* ignore */ }
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
    logoutUser,
    registerUser,
    loginUser,
    showAuthMode,
    resetPassword,
    exportAllProjects,
    importProjects,
    openNewProjektForm,
    saveProjekt,
    shareProjectWithUser,
    removeProjectShare,
    openProjectSharing,
    toggleProjectVisibility,
    adminAddWizardStep,
    saveAdminWizardConfig,
    adminLoadFromJson,
    adminMoveWizardStep,
    adminRemoveWizardStep,
    adminSetWizardStepPosition,
    adminFilterSteps,
    adminToggleStep,
    onKatalogKategorieChange,
    onKatalogSearch,
    onKatalogHerstellerChange,
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
    wizardJumpToQuestion,
    wizardApplyJump,
    wizardCancelJump,
    onWizardKategorieChange,
    onWizardHerstellerChange,
    onWizardSteckerAChange,
    onWizardSteckerBChange,
    toggleWizardAusrichtung,
    onWizardLaengeChange,
    onWizardOelflexChange,
    updateWizardAutoArtikel,
    wizardAddLeitungFromStep,
    wizardPrev,
    wizardNext,
    toggleWizardStepEditor,
    cancelWizardStepEditor,
    saveWizardStepFromAssistent,
    filterWizardBauteilSelect,
    wizardAddBauteilFromStep,
    wizardDeleteBauteil,
    wizardDeleteLeitungenGroup,
    wizardDeleteLeitungFromStep,
    onWizardNichtVorhandenChange,
    backToOverview,
    onKategorieFilterChange,
    onHerstellerChange,
    onSteckerChange,
    toggleAusrichtung,
    onOelflexChange,
    onLaengeChange,
    prevLeitung,
    nextLeitung,
    saveLeitungAndNotify,
    addNewLeitung,
    saveLeitung,
    startProjektWizard,
    filterGruppenListe,
    selectGruppe,
    gruppeWechseln,
    toggleGruppeNichtBenoetigt,
    updateGruppeNotiz,
    gruppeAddLeitung,
    gruppeUpdateLeitung,
    gruppeUpdateLeitungText,
    gruppeToggleAusrichtung,
    gruppeToggleFreieLaenge,
    gruppeCopyLeitung,
    gruppeDeleteLeitung,
    gruppeEditLeitung,
    gruppeCloseLeitungEditor,
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
    gruppeSaveNeueGruppe,
    gruppeDeleteZusaetzlicheGruppe,
    exportCSV,
    exportPDF,
    closeModal,
    editLeitung,
    deleteLeitung,
    deleteBauteil,
    openBauteilEdit,
    closeBauteilEdit,
    saveBauteilEdit,
    filterBauteilEditHersteller
});
