/**
 * @file View-Navigation.
 */
import { appState } from './state.js';


/**
 * Wechselt zur angegebenen Ansicht.
 * @param {string} viewName
 * @returns {void}
 */
export function showView(viewName) {
    if (appState.firebaseReady && !appState.currentUser && viewName !== 'auth') {
        viewName = 'auth';
    }

    const konfiguratorActive = document.getElementById('view-konfigurator')?.classList.contains('active');
    if (konfiguratorActive && viewName !== 'konfigurator') {
        import('./konfigurator-stecker.js').then(m => m.handleLeaveKonfigurator());
    }

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + viewName);
    if (view) view.classList.add('active');
    runViewHandler(viewName);
}


/**
 * Lädt View-spezifische Inhalte per dynamischem Import.
 * @param {string} viewName
 * @returns {void}
 */
function runViewHandler(viewName) {
    const handlers = {
        auth: () => import('./firebase.js').then(m => m.showAuthMode('login')),
        home: () => import('./projects.js').then(m => m.loadProjects()),
        admin: () => import('./admin.js').then(m => m.renderAdminView()),
        katalog: () => import('./katalog-view.js').then(m => m.renderKatalogView()),
        'projekt-form': () => {},
        'projekt-wizard': () => import('./wizard-ui.js').then(m => m.renderProjektWizard()),
        konfigurator: () => import('./konfigurator-core.js').then(m => m.initKonfigurator()),
        uebersicht: () => import('./overview.js').then(m => m.renderUebersicht()),
        'projekt-freigabe': () => import('./project-access.js').then(m => m.renderProjectSharingView()),
        stueckliste: () => import('./stueckliste.js').then(m => m.renderStueckliste())
    };
    handlers[viewName]?.();
}
