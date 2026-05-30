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
        auth: () => {},
        home: () => import('./projects.js').then(m => m.loadProjects()),
        admin: () => import('./admin.js').then(m => m.renderAdminView()),
        'projekt-form': () => {},
        'projekt-wizard': () => import('./wizard-ui.js').then(m => m.renderProjektWizard()),
        konfigurator: () => import('./konfigurator-core.js').then(m => m.initKonfigurator()),
        uebersicht: () => import('./overview.js').then(m => m.renderUebersicht()),
        stueckliste: () => import('./stueckliste.js').then(m => m.renderStueckliste()),
        abarbeitung: () => import('./abarbeitung.js').then(m => m.renderAbarbeitung())
    };
    handlers[viewName]?.();
}
