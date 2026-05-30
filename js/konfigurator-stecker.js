/**
 * @file konfigurator-stecker.js
 */
import { appState } from './state.js';
import { generateId, escapeHtml, formatDate, formatDateForFile } from './utils.js';
import { showModal, closeModal } from './modal.js';
import { showView } from './navigation.js';
import { cloneTemplate, setText } from './templates.js';
import { getArtikelByNummer } from './catalog.js';
import { persistCurrentProjekt } from './projects.js';
import { compareGruppenCode, getGruppeDisplay } from './overview.js';
import { setOelflexMode, getOelflexHersteller, parseOelflexVariante, findOelflexArtikel, populateOelflexAdern, populateOelflexQuerschnitt } from './oelflex.js';
import { getFullSteckerTyp } from './konfigurator-form.js';
import { renderKonfigGruppenliste } from './konfigurator-list.js';
import { updateArtikelVorschlag, onHerstellerChange, onSteckerChange, loadLaengen, renderLeitungForm } from './konfigurator-core.js';

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


export function saveCurrentLeitung() {
    if (!appState.currentProjekt) return;
    
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
    
    if (!kategorie) {
        kategorie = 'sonstiges';
    }
    
    // Vollständige Steckertypen mit Ausrichtung erstellen
    let fullSteckerA, fullSteckerB;
    if (kategorie === 'oelflex') {
        // Meterware ohne Stecker
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
    
    const leitung = {
        id: document.getElementById('leitung-id').value || generateId('ltg'),
        position: appState.currentLeitungIndex + 1,
        bezeichnung: document.getElementById('leitung-bezeichnung').value.trim(),
        kategorie: kategorie,
        gruppe: document.getElementById('leitung-gruppe').value,
        hersteller: document.getElementById('leitung-hersteller').value,
        artikelnummer: artikelnummer,
        artikelCustom: artikelCustom,
        laenge: laenge,
        steckerA: fullSteckerA,
        steckerB: fullSteckerB,
        notiz: document.getElementById('leitung-notiz').value.trim(),
        erledigt: !!(appState.currentProjekt.leitungen[appState.currentLeitungIndex] && appState.currentProjekt.leitungen[appState.currentLeitungIndex].erledigt)
    };
    
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


export function prevLeitung() {
    if (appState.currentLeitungIndex > 0) {
        saveCurrentLeitung();
        appState.currentLeitungIndex--;
        renderLeitungForm();
    }
}


export function nextLeitung() {
    if (appState.currentLeitungIndex < appState.currentProjekt.leitungen.length - 1) {
        saveCurrentLeitung();
        appState.currentLeitungIndex++;
        renderLeitungForm();
    }
}


export function addNewLeitung() {
    if (!appState.currentProjekt) return;

    const isKonfiguratorActive = document.getElementById('view-konfigurator').classList.contains('active');

    // Nur im aktiven Konfigurator die aktuelle Leitung mitspeichern.
    // So vermeiden wir, dass alte Formularwerte aus anderen Views übernommen werden.
    if (isKonfiguratorActive && appState.currentProjekt.leitungen && appState.currentProjekt.leitungen.length > 0) {
        saveCurrentLeitung();
    }
    
    if (!appState.currentProjekt.leitungen) {
        appState.currentProjekt.leitungen = [];
    }
    
    const newLeitung = {
        id: generateId('ltg'),
        position: appState.currentProjekt.leitungen.length + 1,
        bezeichnung: '',
        kategorie: '',
        gruppe: '',
        hersteller: '',
        artikelnummer: '',
        laenge: 0,
        steckerA: '',
        steckerB: '',
        notiz: '',
        erledigt: false
    };
    
    appState.currentProjekt.leitungen.push(newLeitung);
    appState.currentLeitungIndex = appState.currentProjekt.leitungen.length - 1;
    
    persistCurrentProjekt();

    if (isKonfiguratorActive) {
        renderLeitungForm();
    } else {
        showView('konfigurator');
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
