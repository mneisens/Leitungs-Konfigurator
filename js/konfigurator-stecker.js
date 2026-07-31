/**
 * @file konfigurator-stecker.js
 */
import { appState } from './state.js';
import { generateId } from './utils.js';
import { showView } from './navigation.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit, canEditProject } from './project-access.js';
import { setOelflexMode } from './oelflex.js';
import { getFullSteckerTyp } from './konfigurator-form.js';
import { renderKonfigGruppenliste } from './konfigurator-list.js';
import { renderLeitungForm } from './konfigurator-core.js';


/**
 * @param {object|null} leitung
 * @returns {boolean}
 */
export function isLeitungMeaningful(leitung) {
    if (!leitung) return false;

    const hasBezeichnung = Boolean(leitung.bezeichnung?.trim());
    const hasArtikel = Boolean(leitung.artikelnummer?.trim() || leitung.artikelCustom?.trim());
    const hasGruppe = Boolean(leitung.gruppe?.trim());
    const hasHersteller = Boolean(leitung.hersteller?.trim());
    const hasLaenge = typeof leitung.laenge === 'number' && leitung.laenge > 0;
    const hasStecker = Boolean(leitung.steckerA?.trim() || leitung.steckerB?.trim());
    const hasKategorie = Boolean(leitung.kategorie?.trim() && leitung.kategorie !== 'sonstiges');
    const hasNotiz = Boolean(leitung.notiz?.trim());

    return hasBezeichnung || hasArtikel || hasGruppe
        || (hasHersteller && (hasLaenge || hasStecker))
        || hasKategorie || hasNotiz;
}


/**
 * @returns {boolean}
 */
export function isCurrentLeitungFormEmpty() {
    const bezeichnung = document.getElementById('leitung-bezeichnung')?.value?.trim();
    const hersteller = document.getElementById('leitung-hersteller')?.value;
    const kategorie = document.getElementById('leitung-kategorie')?.value;
    const gruppe = document.getElementById('leitung-gruppe')?.value;
    const artikelCustom = document.getElementById('leitung-artikel-custom')?.value?.trim();
    const laengeSelect = document.getElementById('leitung-laenge-select')?.value;
    const laengeInput = document.getElementById('leitung-laenge')?.value;
    const steckerA = document.getElementById('leitung-stecker-a')?.value;
    const steckerB = document.getElementById('leitung-stecker-b')?.value;
    const oelflexAdern = document.getElementById('oelflex-adern')?.value;
    const notiz = document.getElementById('leitung-notiz')?.value?.trim();

    return !bezeichnung && !hersteller && !kategorie && !gruppe && !artikelCustom
        && !laengeSelect && !laengeInput && !steckerA && !steckerB && !oelflexAdern
        && !notiz && !appState.currentArtikelVorschlag;
}


/**
 * Entfernt die aktuelle Leitung, wenn sie noch leer ist.
 * @returns {void}
 */
export function discardEmptyCurrentLeitung() {
    if (!appState.currentProjekt?.leitungen?.length) return;

    const idx = appState.currentLeitungIndex;
    const leitung = appState.currentProjekt.leitungen[idx];
    if (!leitung || isLeitungMeaningful(leitung)) return;

    appState.currentProjekt.leitungen.splice(idx, 1);
    appState.currentProjekt.leitungen.forEach((l, i) => { l.position = i + 1; });

    if (appState.currentLeitungIndex >= appState.currentProjekt.leitungen.length) {
        appState.currentLeitungIndex = Math.max(0, appState.currentProjekt.leitungen.length - 1);
    }

    persistCurrentProjekt();
}


/**
 * Verlässt den Konfigurator und verwirft unvollständige Leitungen.
 * @returns {void}
 */
export function handleLeaveKonfigurator() {
    if (!document.getElementById('view-konfigurator')?.classList.contains('active')) return;
    if (!canEditProject(appState.currentProjekt)) return;

    if (isCurrentLeitungFormEmpty()) {
        discardEmptyCurrentLeitung();
    } else {
        saveCurrentLeitung();
    }
}


export function clearLeitungForm() {
    document.getElementById('leitung-id').value = '';
    document.getElementById('leitung-bezeichnung').value = '';
    document.getElementById('leitung-kategorie').value = '';
    document.getElementById('leitung-gruppe').value = '';
    document.getElementById('leitung-hersteller').value = '';
    document.getElementById('leitung-stecker-a').innerHTML = '<option value="">-- Bitte wählen --</option>';
    document.getElementById('leitung-stecker-b').innerHTML = '<option value="">-- Bitte wählen --</option>';
    document.getElementById('leitung-laenge-select').innerHTML = '<option value="">-- Länge wählen --</option>';
    document.getElementById('leitung-laenge').value = '';
    document.getElementById('leitung-artikel-custom').value = '';
    document.getElementById('leitung-notiz').value = '';
    resetNewLeitungAnzahl();

    // Ölflex-Felder zurücksetzen und wieder Stecker-Ansicht zeigen
    const oelflexAdern = document.getElementById('oelflex-adern');
    const oelflexQuerschnitt = document.getElementById('oelflex-querschnitt');
    if (oelflexAdern) oelflexAdern.innerHTML = '<option value="">-- Bitte wählen --</option>';
    if (oelflexQuerschnitt) oelflexQuerschnitt.innerHTML = '<option value="">-- Bitte wählen --</option>';
    setOelflexMode(false);
    
    // Ausrichtung auf Standard (gerade) zurücksetzen
    setAusrichtung('a', false);
    setAusrichtung('b', false);
    
    const vorschlagDiv = document.getElementById('artikel-vorschlag');
    vorschlagDiv.className = 'artikel-vorschlag no-match';
    vorschlagDiv.innerHTML = '<span class="artikel-label">Bitte alle Felder ausfüllen</span>';
    
    appState.currentArtikelVorschlag = null;
    renderKonfigGruppenliste();
}


export function getLeitungStueckzahl(leitung) {
    const anzahl = parseInt(leitung?.anzahl, 10);
    if (Number.isNaN(anzahl) || anzahl < 1) return 1;
    return anzahl;
}


function getNewLeitungAnzahl() {
    const input = document.getElementById('konfig-leitung-anzahl')
        || document.getElementById('uebersicht-leitung-anzahl');
    let anzahl = parseInt(input?.value, 10);
    if (Number.isNaN(anzahl) || anzahl < 1) anzahl = 1;
    if (anzahl > 200) anzahl = 200;
    return anzahl;
}


export function resetNewLeitungAnzahl() {
    ['konfig-leitung-anzahl', 'uebersicht-leitung-anzahl'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '1';
    });
}


function renumberLeitungen() {
    (appState.currentProjekt.leitungen || []).forEach((leitung, index) => {
        leitung.position = index + 1;
    });
}


function createEmptyLeitung() {
    return {
        id: generateId('ltg'),
        position: (appState.currentProjekt.leitungen?.length || 0) + 1,
        bezeichnung: '',
        kategorie: '',
        gruppe: '',
        hersteller: '',
        artikelnummer: '',
        laenge: 0,
        steckerA: '',
        steckerB: '',
        notiz: '',
        anzahl: 1,
        erledigt: false
    };
}


function appendLeitungen(leitungen) {
    if (!appState.currentProjekt.leitungen) {
        appState.currentProjekt.leitungen = [];
    }
    leitungen.forEach(leitung => appState.currentProjekt.leitungen.push(leitung));
    renumberLeitungen();
}


/**
 * Liest die aktuellen Formularwerte als Leitungsobjekt.
 * @returns {object}
 */
export function buildLeitungFromForm() {
    const laengeSelect = document.getElementById('leitung-laenge-select').value;
    const laengeInput = document.getElementById('leitung-laenge').value;
    const laenge = parseFloat(laengeSelect || laengeInput) || 0;

    let artikelnummer = '';
    let kategorie = document.getElementById('leitung-kategorie').value;

    if (appState.currentArtikelVorschlag) {
        artikelnummer = appState.currentArtikelVorschlag.artikelnummer;
        if (!kategorie && appState.currentArtikelVorschlag.kategorie) {
            kategorie = appState.currentArtikelVorschlag.kategorie;
        }
    }
    const artikelCustom = document.getElementById('leitung-artikel-custom').value.trim();
    if (artikelCustom) {
        artikelnummer = artikelCustom;
    }

    let fullSteckerA;
    let fullSteckerB;
    if (kategorie === 'oelflex') {
        fullSteckerA = 'offen';
        fullSteckerB = 'offen';
    } else {
        const steckerABase = document.getElementById('leitung-stecker-a').value;
        const steckerBBase = document.getElementById('leitung-stecker-b').value;
        const ausrichtungA = getAusrichtung('a');
        const ausrichtungB = getAusrichtung('b');
        fullSteckerA = getFullSteckerTyp(steckerABase, ausrichtungA);
        fullSteckerB = getFullSteckerTyp(steckerBBase, ausrichtungB);
    }

    const bezeichnung = document.getElementById('leitung-bezeichnung').value.trim();
    const gruppe = document.getElementById('leitung-gruppe').value;
    const hersteller = document.getElementById('leitung-hersteller').value;
    const notiz = document.getElementById('leitung-notiz').value.trim();

    if (!kategorie && (bezeichnung || hersteller || artikelnummer || gruppe || laenge > 0)) {
        kategorie = 'sonstiges';
    }

    return {
        id: document.getElementById('leitung-id').value || generateId('ltg'),
        position: appState.currentLeitungIndex + 1,
        bezeichnung,
        kategorie,
        gruppe,
        hersteller,
        artikelnummer,
        artikelCustom,
        laenge,
        steckerA: fullSteckerA,
        steckerB: fullSteckerB,
        notiz,
        anzahl: getNewLeitungAnzahl(),
        erledigt: !!(appState.currentProjekt.leitungen?.[appState.currentLeitungIndex]?.erledigt)
    };
}


export function saveCurrentLeitung() {
    if (!appState.currentProjekt) return;
    if (!canEditProject(appState.currentProjekt)) return;

    const leitung = buildLeitungFromForm();
    if (!isLeitungMeaningful(leitung)) return;

    if (!appState.currentProjekt.leitungen) {
        appState.currentProjekt.leitungen = [];
    }

    appState.currentProjekt.leitungen[appState.currentLeitungIndex] = leitung;

    persistCurrentProjekt();

    renderKonfigGruppenliste();
}


export function saveLeitung(event) {
    event.preventDefault();
    saveCurrentLeitung();
}


function persistCurrentLeitungOrDiscard() {
    if (isCurrentLeitungFormEmpty()) {
        discardEmptyCurrentLeitung();
    } else {
        saveCurrentLeitung();
    }
}


export function prevLeitung() {
    if (appState.currentLeitungIndex <= 0) return;

    const indexBefore = appState.currentLeitungIndex;
    persistCurrentLeitungOrDiscard();

    appState.currentLeitungIndex = Math.min(indexBefore - 1, Math.max(0, appState.currentProjekt.leitungen.length - 1));
    if (appState.currentProjekt.leitungen.length > 0) {
        renderLeitungForm();
    }
}


export function nextLeitung() {
    if (!appState.currentProjekt.leitungen?.length) return;
    if (appState.currentLeitungIndex >= appState.currentProjekt.leitungen.length - 1) return;

    const indexBefore = appState.currentLeitungIndex;
    persistCurrentLeitungOrDiscard();

    appState.currentLeitungIndex = Math.min(indexBefore + 1, appState.currentProjekt.leitungen.length - 1);
    if (appState.currentProjekt.leitungen.length > 0) {
        renderLeitungForm();
    }
}


export function addNewLeitung() {
    if (!appState.currentProjekt) return;
    if (!assertCanEdit('neue Leitungen')) return;

    const anzahl = getNewLeitungAnzahl();
    const isKonfiguratorActive = document.getElementById('view-konfigurator')?.classList.contains('active');

    if (!appState.currentProjekt.leitungen) {
        appState.currentProjekt.leitungen = [];
    }

    if (isKonfiguratorActive && appState.currentProjekt.leitungen.length > 0) {
        saveCurrentLeitung();
    }

    discardEmptyCurrentLeitung();
    appendLeitungen([createEmptyLeitung()]);
    appState.currentLeitungIndex = appState.currentProjekt.leitungen.length - 1;
    persistCurrentProjekt();

    if (isKonfiguratorActive) {
        renderLeitungForm();
    } else {
        showView('konfigurator');
    }

    const anzahlInput = document.getElementById('konfig-leitung-anzahl');
    if (anzahlInput) {
        anzahlInput.value = String(anzahl);
    }
}


export function getBaseSteckerTyp(stecker) {
    if (!stecker) return '';
    return stecker.replace(/ (gerade|gewinkelt)$/, '');
}


export function hasAusrichtung(stecker) {
    if (!stecker) return false;
    const base = getBaseSteckerTyp(stecker);
    return base.includes('M8') || base.includes('M12');
}


export function getAusrichtung(seite) {
    const btn = document.getElementById(`ausrichtung-${seite}`);
    if (!btn) return 'gerade';
    return btn.classList.contains('gewinkelt') ? 'gewinkelt' : 'gerade';
}


export function setAusrichtung(seite, gewinkelt) {
    const btn = document.getElementById(`ausrichtung-${seite}`);
    if (!btn) return;
    const icon = btn.querySelector('.toggle-icon');
    const text = btn.querySelector('.toggle-text');
    
    if (gewinkelt) {
        btn.classList.add('gewinkelt');
        text.textContent = 'gewinkelt';
    } else {
        btn.classList.remove('gewinkelt');
        text.textContent = 'gerade';
    }
}
