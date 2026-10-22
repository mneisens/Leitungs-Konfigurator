/**
 * @file View-Navigation.
 */
import { appState } from './state.js';

const PROJECT_VIEWS = new Set([
    'uebersicht',
    'ea-liste',
    'gruppen',
    'stueckliste',
    'beschriftung',
    'topologie',
    'projekt-freigabe',
    'projekt-form',
    'zeiterfassung'
]);

const VIEW_TITLES = {
    auth: 'Anmeldung',
    home: 'Projekte',
    katalog: 'Katalog',
    'projekt-form': 'Projekt',
    gruppen: 'Gruppen',
    uebersicht: 'Übersicht',
    'ea-liste': 'EA-Liste',
    'projekt-freigabe': 'Freigaben',
    stueckliste: 'Stückliste',
    beschriftung: 'Beschriftung',
    topologie: 'Topologie',
    zeiterfassung: 'Zeiterfassung'
};

const NAV_ALIAS = {
    'projekt-form': 'home'
};


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
    appState.currentView = viewName;

    updateShellNav(viewName);
    closeSidebar();
    runViewHandler(viewName);
}


/**
 * Aktualisiert Sidebar-Active-State, Projekt-Sektion und Topbar.
 * @param {string} viewName
 * @returns {void}
 */
export function updateShellNav(viewName) {
    const isAuth = viewName === 'auth';
    document.body.classList.toggle('auth-layout', isAuth);
    // Der Gruppen-Konfigurator ist ein Vollbild-Arbeitsbereich mit eigener Kopfzeile.
    document.body.classList.toggle('fokus-layout', viewName === 'gruppen');

    const topbarTitle = document.getElementById('topbar-title');
    if (topbarTitle) {
        topbarTitle.textContent = VIEW_TITLES[viewName] || 'Leitungskonfigurator';
    }

    const projectSection = document.getElementById('nav-project-section');
    const projectName = document.getElementById('nav-project-name');
    const showProjectNav = !isAuth && !!appState.currentProjekt && PROJECT_VIEWS.has(viewName);
    projectSection?.classList.toggle('hidden', !showProjectNav);

    if (projectName && appState.currentProjekt) {
        const nummer = appState.currentProjekt.projektnummer || '';
        const name = appState.currentProjekt.name || '';
        projectName.textContent = [nummer, name].filter(Boolean).join(' · ');
    }

    import('./project-access.js').then(m => m.updateSharingButton());

    const activeNav = NAV_ALIAS[viewName] || viewName;
    document.querySelectorAll('.sidebar-link[data-nav]').forEach(link => {
        const isActive = link.dataset.nav === activeNav;
        link.classList.toggle('active', isActive);
        if (isActive) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
}


/**
 * Öffnet/schließt die mobile Sidebar.
 * @returns {void}
 */
export function toggleSidebar() {
    document.body.classList.toggle('sidebar-open');
}


/**
 * Schließt die mobile Sidebar.
 * @returns {void}
 */
export function closeSidebar() {
    document.body.classList.remove('sidebar-open');
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
        katalog: () => import('./katalog-view.js').then(m => m.renderKatalogView()),
        'projekt-form': () => {},
        gruppen: () => import('./gruppen-konfigurator.js').then(m => m.renderGruppenKonfigurator()),
        uebersicht: () => import('./overview.js').then(m => m.renderUebersicht()),
        'ea-liste': () => import('./ea-liste.js').then(m => m.renderEaListe()),
        'projekt-freigabe': () => import('./project-access.js').then(m => m.renderProjectSharingView()),
        stueckliste: () => import('./stueckliste.js').then(m => m.renderStueckliste()),
        beschriftung: () => import('./beschriftung.js').then(m => m.renderBeschriftung()),
        topologie: () => import('./topologie.js').then(m => m.renderTopologie()),
        zeiterfassung: () => import('./zeiterfassung.js').then(m => m.renderZeiterfassung())
    };
    handlers[viewName]?.();
}
