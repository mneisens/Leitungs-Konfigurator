/**
 * @file wizard-ui.js
 */
import { appState } from './state.js';
import { generateId, escapeHtml } from './utils.js';
import { showModal } from './modal.js';
import { showView } from './navigation.js';
import { getArtikelByNummer } from './catalog.js';
import { persistCurrentProjekt, ensureWizardAnswers } from './projects.js';
import { assertCanEdit, applyReadOnlyUI } from './project-access.js';
import { getGruppeDisplay } from './overview.js';
import {
    setWizardOelflexMode,
    findOelflexArtikel,
    findMotorleitungArtikel,
    isWizardMotorleitungMode,
    isWizardGeberleitungMode
} from './oelflex.js';
import {
    stepHasLeitungen,
    stepIsOelflexWizard,
    stepIsMotorleitungWizard,
    applyWizardStepVisibility,
    renderWizardBauteilForms,
    renderWizardCreatedBauteile,
    getWizardDefaultBezeichnung,
    isWizardStepSatisfied,
    updateWizardSkipCheckbox
} from './wizard-core.js';
import {
    getCurrentWizardStep,
    getWizardDefaultKategorie,
    getWizardKategorie,
    getWizardArtikelByKategorie,
    getWizardPairMatches,
    getWizardAusrichtung,
    setWizardAusrichtung,
    filterWizardMatchesByAusrichtung,
    populateWizardKategorieDropdown,
    populateWizardHerstellerDropdown,
    onWizardKategorieChange,
    onWizardHerstellerChange,
    onWizardSteckerAChange,
    onWizardSteckerBChange,
    renderWizardCreatedLeitungen
} from './wizard-leitungen.js';
import {
    canEditWizardConfig,
    mountWizardStepConfigForm,
    persistWizardSteps
} from './admin.js';

let wizardStepEditorOpen = false;
/** Snapshot der aktuellen Frage beim Öffnen des Editors (für Abbrechen). */
let wizardStepEditorSnapshot = null;
let wizardStepEditorSnapshotIndex = -1;


/**
 * Wählt in einem Dropdown den passenden Eintrag zu einem Wunschwert.
 * Es wird zuerst exakt, dann per Präfix, dann per Teilstring verglichen –
 * so trifft z. B. „M8" auch „M8 4-polig".
 * @param {string} selectId
 * @param {string} wunsch
 * @returns {boolean} true, wenn ein Eintrag ausgewählt wurde
 */
function selectWizardOption(selectId, wunsch) {
    const select = document.getElementById(selectId);
    if (!select || !wunsch) return false;

    const values = Array.from(select.options).map(o => o.value).filter(Boolean);
    const lower = wunsch.toLowerCase();
    const match = values.find(v => v.toLowerCase() === lower)
        || values.find(v => v.toLowerCase().startsWith(lower))
        || values.find(v => v.toLowerCase().includes(lower));

    if (!match) return false;
    select.value = match;
    return true;
}


/**
 * Wendet die in der Frage konfigurierte Vorauswahl
 * (Hersteller, Stecker A/B, Ausrichtung) auf die Leitungs-Dropdowns an.
 * @param {object} step
 * @returns {void}
 */
function applyWizardVorauswahl(step) {
    const vorauswahl = step?.vorauswahl;
    if (!vorauswahl) return;
    if (
        getWizardKategorie() === 'oelflex'
        || getWizardKategorie() === 'geber'
        || stepIsOelflexWizard(step)
        || stepIsMotorleitungWizard(step)
    ) return;

    if (vorauswahl.hersteller && selectWizardOption('wizard-hersteller', vorauswahl.hersteller)) {
        onWizardHerstellerChange();
    }
    if (vorauswahl.steckerA && selectWizardOption('wizard-stecker-a', vorauswahl.steckerA)) {
        onWizardSteckerAChange();
        if (vorauswahl.steckerB && selectWizardOption('wizard-stecker-b', vorauswahl.steckerB)) {
            onWizardSteckerBChange();
        }
    }
    if (vorauswahl.ausrichtungA) setWizardAusrichtung('a', vorauswahl.ausrichtungA);
    if (vorauswahl.ausrichtungB) setWizardAusrichtung('b', vorauswahl.ausrichtungB);
    if (vorauswahl.ausrichtungA || vorauswahl.ausrichtungB) {
        onWizardSteckerBChange();
    }
}

export function onWizardLaengeChange() {
    updateWizardAutoArtikel();
}


function laengeMatches(artikelLaenge, selectedLaenge) {
    return typeof artikelLaenge === 'number'
        && !Number.isNaN(selectedLaenge)
        && Math.abs(artikelLaenge - selectedLaenge) < 0.001;
}


function pickBestArtikelMatch(matches, laenge) {
    const filtered = typeof laenge === 'number' && !Number.isNaN(laenge)
        ? matches.filter(a => laengeMatches(a.laenge, laenge))
        : matches;

    if (filtered.length === 0) return null;

    return filtered.sort((a, b) => {
        const aScore = (a.steckerA.includes('gewinkelt') ? 1 : 0) + (a.steckerB.includes('gewinkelt') ? 1 : 0);
        const bScore = (b.steckerA.includes('gewinkelt') ? 1 : 0) + (b.steckerB.includes('gewinkelt') ? 1 : 0);
        return aScore - bScore;
    })[0];
}


/**
 * Ermittelt den passenden Katalog-Artikel aus den aktuellen Wizard-Auswahlfeldern.
 * @returns {{ artikel: object|null, artikelnummer: string, error?: string }}
 */
export function resolveWizardArtikelFromForm() {
    const step = getCurrentWizardStep();
    const kategorie = getWizardKategorie();

    if (kategorie === 'motor' || stepIsMotorleitungWizard(step)) {
        const artikelnummer = document.getElementById('wizard-oelflex-querschnitt')?.value;
        if (!artikelnummer) {
            return { artikel: null, artikelnummer: '', error: 'Bitte Motorleitungs-Typ wählen.' };
        }
        const artikel = findMotorleitungArtikel(artikelnummer);
        if (!artikel) {
            return { artikel: null, artikelnummer: '', error: 'Kein passender Motorleitungs-Artikel gefunden.' };
        }
        return { artikel, artikelnummer: artikel.artikelnummer || '' };
    }

    if (kategorie === 'geber') {
        const hersteller = document.getElementById('wizard-hersteller')?.value;
        const artikelnummer = document.getElementById('wizard-artikelnummer')?.value?.trim() || '';
        if (!hersteller) {
            return { artikel: null, artikelnummer: '', error: 'Bitte Hersteller wählen.' };
        }
        if (!artikelnummer) {
            return { artikel: null, artikelnummer: '', error: 'Artikelnummer und Länge eingeben (ohne Stecker).' };
        }
        const artikel = getArtikelByNummer(artikelnummer)
            || getWizardArtikelByKategorie().find(a => a.artikelnummer === artikelnummer)
            || null;
        return { artikel, artikelnummer };
    }

    if (kategorie === 'oelflex' || stepIsOelflexWizard(step)) {
        const adern = document.getElementById('wizard-oelflex-adern')?.value;
        const querschnitt = document.getElementById('wizard-oelflex-querschnitt')?.value;
        if (!adern || !querschnitt) {
            return { artikel: null, artikelnummer: '', error: 'Aderzahl und Querschnitt wählen.' };
        }
        const artikel = findOelflexArtikel(adern, querschnitt);
        if (!artikel) {
            return { artikel: null, artikelnummer: '', error: 'Kein passender Ölflex-Artikel gefunden.' };
        }
        return { artikel, artikelnummer: artikel.artikelnummer || '' };
    }

    const hersteller = document.getElementById('wizard-hersteller')?.value;
    const steckerABase = document.getElementById('wizard-stecker-a')?.value;
    const steckerBBase = document.getElementById('wizard-stecker-b')?.value;
    const laengeRaw = document.getElementById('wizard-laenge')?.value;
    const laenge = laengeRaw ? parseFloat(laengeRaw) : null;

    if (!hersteller || !steckerABase || !steckerBBase) {
        return { artikel: null, artikelnummer: '', error: 'Bitte Hersteller, Stecker A und Stecker B wählen.' };
    }

    const ausrA = getWizardAusrichtung('a');
    const ausrB = getWizardAusrichtung('b');
    let matches = getWizardPairMatches(hersteller, steckerABase, steckerBBase);
    matches = filterWizardMatchesByAusrichtung(matches, steckerABase, steckerBBase, ausrA, ausrB);
    if (matches.length === 0) {
        return { artikel: null, artikelnummer: '', error: 'Keine passende Leitung für diese Ausrichtung gefunden.' };
    }

    if (laenge !== null && !Number.isNaN(laenge)) {
        const artikel = pickBestArtikelMatch(matches, laenge);
        if (!artikel) {
            return { artikel: null, artikelnummer: '', error: 'Für diese Länge wurde kein Artikel gefunden.' };
        }
        return { artikel, artikelnummer: artikel.artikelnummer || '' };
    }

    if (matches.length === 1) {
        return { artikel: matches[0], artikelnummer: matches[0].artikelnummer || '' };
    }

    return { artikel: null, artikelnummer: '', error: 'Mehrere Treffer – bitte Länge wählen.' };
}


export function updateWizardAutoArtikel() {
    const resultDiv = document.getElementById('wizard-auto-artikel');
    const artikelInput = document.getElementById('wizard-artikelnummer');
    if (!resultDiv || !artikelInput) return;

    const kategorie = getWizardKategorie();

    if (kategorie === 'geber' || isWizardGeberleitungMode()) {
        const hersteller = document.getElementById('wizard-hersteller')?.value || '';
        const laengeRaw = document.getElementById('wizard-oelflex-laenge')?.value;
        const laengeHinweis = laengeRaw ? `${laengeRaw} m` : 'Länge in Metern eingeben';
        const nr = artikelInput.value.trim();
        resultDiv.className = hersteller ? 'wizard-auto-result' : 'wizard-auto-result no-match';
        resultDiv.innerHTML = hersteller
            ? `
                <span class="artikel-beschreibung">Geberleitung${nr ? `: ${escapeHtml(nr)}` : ''} (ohne Stecker)</span>
                <span class="artikel-hinweis">${escapeHtml(hersteller)} · ${escapeHtml(laengeHinweis)}</span>
            `
            : '<span class="artikel-label">Hersteller wählen, dann Artikelnummer und Länge eingeben</span>';
        return;
    }

    const resolved = resolveWizardArtikelFromForm();

    if (!resolved.artikel) {
        resultDiv.className = 'wizard-auto-result no-match';
        resultDiv.innerHTML = `<span class="artikel-label">${escapeHtml(resolved.error || 'Bitte Auswahl vervollständigen')}</span>`;
        return;
    }

    artikelInput.value = resolved.artikelnummer;

    if (
        kategorie === 'oelflex'
        || stepIsOelflexWizard(getCurrentWizardStep())
        || isWizardMotorleitungMode()
    ) {
        const laengeRaw = document.getElementById('wizard-oelflex-laenge')?.value;
        const laengeHinweis = laengeRaw ? `${laengeRaw} m (Meterware)` : 'Bitte Länge in Metern eingeben';
        resultDiv.className = 'wizard-auto-result';
        resultDiv.innerHTML = `
            <span class="artikel-nummer">${escapeHtml(resolved.artikel.artikelnummer)}</span>
            <span class="artikel-beschreibung">${escapeHtml(resolved.artikel.beschreibung || '')}</span>
            <span class="artikel-hinweis">${escapeHtml(laengeHinweis)}</span>
        `;
        return;
    }

    resultDiv.className = 'wizard-auto-result';
    resultDiv.innerHTML = `
        <span class="artikel-nummer">${escapeHtml(resolved.artikel.artikelnummer || '')}</span>
        <span class="artikel-beschreibung">${escapeHtml(resolved.artikel.beschreibung || '')}</span>
    `;
}


export function populateWizardArtikelVorschlaege() {
    const datalist = document.getElementById('wizard-artikel-vorschlaege');
    if (!datalist || !appState.katalog || !Array.isArray(appState.katalog.artikel)) return;

    const uniqueArtikel = Array.from(new Set(
        appState.katalog.artikel
            .map(a => a.artikelnummer)
            .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'de'));

    datalist.innerHTML = uniqueArtikel
        .map(nr => `<option value="${escapeHtml(nr)}"></option>`)
        .join('');
}


export function wizardAddLeitungFromStep() {
    if (!appState.currentProjekt) return;
    if (!assertCanEdit('Leitungen im Assistenten')) return;
    ensureWizardAnswers(appState.currentProjekt);

    const step = appState.wizardSteps[appState.wizardStepIndex];
    if (!step) return;

    const artikelInput = document.getElementById('wizard-artikelnummer');
    const anzahlInput = document.getElementById('wizard-anzahl');
    const bezInput = document.getElementById('wizard-leitungsbezeichnung');

    const resolved = resolveWizardArtikelFromForm();
    let artikelnummerRaw = artikelInput?.value?.trim() || '';
    if (!artikelnummerRaw && resolved.artikelnummer) {
        artikelnummerRaw = resolved.artikelnummer;
        if (artikelInput) artikelInput.value = artikelnummerRaw;
    }

    if (!artikelnummerRaw) {
        showModal(resolved.error || 'Bitte Hersteller, Stecker und Länge wählen oder eine Artikelnummer eingeben.', {
            type: 'warning',
            title: 'Leitung kann nicht angelegt werden'
        });
        return;
    }

    let anzahl = parseInt(anzahlInput.value, 10);
    if (Number.isNaN(anzahl) || anzahl < 1) anzahl = 1;
    if (anzahl > 200) anzahl = 200;

    const artikel = getArtikelByNummer(artikelnummerRaw) || resolved.artikel;
    const bezeichnung = bezInput.value.trim() || getWizardDefaultBezeichnung(step);
    const kategorie = getWizardKategorie() || artikel?.kategorie || 'sonstiges';

    const meterwareModus = kategorie === 'oelflex'
        || kategorie === 'motor'
        || kategorie === 'geber'
        || artikel?.meterware
        || isWizardMotorleitungMode()
        || isWizardGeberleitungMode();

    let laenge = artikel?.laenge || 0;
    if (meterwareModus) {
        const oelflexLaenge = parseFloat(document.getElementById('wizard-oelflex-laenge')?.value);
        if (!Number.isNaN(oelflexLaenge) && oelflexLaenge > 0) {
            laenge = oelflexLaenge;
        } else {
            showModal('Bitte Länge in Metern angeben.', {
                type: 'warning',
                title: 'Länge fehlt'
            });
            return;
        }
    }

    const herstellerSelect = document.getElementById('wizard-hersteller')?.value || '';
    const ohneStecker = kategorie === 'oelflex' || kategorie === 'motor' || kategorie === 'geber';

    if (!Array.isArray(appState.currentProjekt.leitungen)) {
        appState.currentProjekt.leitungen = [];
    }

    for (let i = 0; i < anzahl; i++) {
        const leitung = {
            id: generateId('ltg'),
            position: appState.currentProjekt.leitungen.length + 1,
            bezeichnung: bezeichnung,
            kategorie: kategorie,
            gruppe: step.gruppe,
            hersteller: artikel?.hersteller || herstellerSelect || '',
            artikelnummer: artikel ? artikel.artikelnummer : artikelnummerRaw,
            artikelCustom: artikel ? '' : (kategorie === 'geber' ? artikelnummerRaw : ''),
            laenge: laenge,
            steckerA: artikel?.steckerA || (ohneStecker ? 'offen' : ''),
            steckerB: artikel?.steckerB || (ohneStecker ? 'offen' : ''),
            notiz: artikel ? '' : 'Im Schaltplan-Assistent ohne Katalogtreffer angelegt',
            erledigt: false,
            wizardStepId: step.id
        };
        appState.currentProjekt.leitungen.push(leitung);
    }

    appState.currentProjekt.leitungen.forEach((l, idx) => {
        l.position = idx + 1;
    });

    persistCurrentProjekt();
    anzahlInput.value = '1';
    renderWizardCreatedLeitungen(step);
    updateWizardSkipCheckbox(step);
}


export function saveCurrentWizardAnswer() {
    if (!appState.currentProjekt) return;
    ensureWizardAnswers(appState.currentProjekt);
    const step = appState.wizardSteps[appState.wizardStepIndex];
    if (!step) return;

    const textarea = document.getElementById('wizard-antwort');
    appState.currentProjekt.wizardAnswers[step.id] = textarea ? textarea.value.trim() : '';
    persistCurrentProjekt();
}


export function renderProjektWizard() {
    if (!appState.currentProjekt) {
        showView('home');
        return;
    }

    ensureWizardAnswers(appState.currentProjekt);

    const total = appState.wizardSteps.length;
    if (total === 0) {
        showModal('Keine Assistent-Fragen vorhanden. Bitte als Admin Fragen konfigurieren.', {
            type: 'warning',
            title: 'Assistent leer'
        });
        showView('uebersicht');
        return;
    }
    if (appState.wizardStepIndex < 0) appState.wizardStepIndex = 0;
    if (appState.wizardStepIndex >= total) appState.wizardStepIndex = total - 1;

    const step = getCurrentWizardStep();
    const answer = appState.currentProjekt.wizardAnswers[step.id] || '';

    document.getElementById('wizard-titel').textContent =
        `Schaltplan-Assistent - ${appState.currentProjekt.projektnummer} - ${appState.currentProjekt.name}`;
    document.getElementById('wizard-progress').textContent = `Frage ${appState.wizardStepIndex + 1} von ${total}`;
    document.getElementById('wizard-gruppe').textContent = getGruppeDisplay(step.gruppe);
    document.getElementById('wizard-frage').textContent = step.frage;
    const hinweisDiv = document.getElementById('wizard-hinweis');
    if (hinweisDiv) {
        hinweisDiv.textContent = step.hinweis || '';
        hinweisDiv.style.display = step.hinweis ? '' : 'none';
    }

    const editBtn = document.getElementById('wizard-edit-step-btn');
    if (editBtn) {
        editBtn.hidden = !canEditWizardConfig();
        editBtn.textContent = wizardStepEditorOpen ? 'Bearbeitung schließen' : 'Frage bearbeiten';
    }
    syncWizardStepEditorVisibility();
    document.getElementById('wizard-antwort').value = answer;
    document.getElementById('wizard-stecker-a').innerHTML = '<option value="">-- Bitte wählen --</option>';
    document.getElementById('wizard-stecker-b').innerHTML = '<option value="">-- Bitte wählen --</option>';
    document.getElementById('wizard-laenge').innerHTML = '<option value="">-- Bitte wählen --</option>';
    document.getElementById('wizard-artikelnummer').value = '';
    document.getElementById('wizard-anzahl').value = '1';
    document.getElementById('wizard-leitungsbezeichnung').value = '';
    document.getElementById('wizard-leitungsbezeichnung').placeholder = getWizardDefaultBezeichnung(step);
    document.getElementById('wizard-oelflex-laenge').value = '';
    document.getElementById('wizard-menge').value = '1';

    const prevBtn = document.getElementById('wizard-prev');
    const nextBtn = document.getElementById('wizard-next');
    prevBtn.style.display = appState.wizardStepIndex > 0 ? 'inline-flex' : 'none';
    nextBtn.textContent = appState.wizardStepIndex === total - 1 ? 'Fertig zur Übersicht' : 'Weiter →';

    applyWizardStepVisibility(step);
    renderWizardBauteilForms(step);
    renderWizardCreatedBauteile(step);
    updateWizardSkipCheckbox(step);

    if (stepHasLeitungen(step)) {
        populateWizardArtikelVorschlaege();
        populateWizardKategorieDropdown();

        // Ausrichtung vor jeder Frage zurücksetzen (Vorauswahl setzt sie ggf. neu)
        setWizardAusrichtung('a', 'gerade');
        setWizardAusrichtung('b', 'gerade');

        // Leitungstyp: Standard-Kategorie der Frage (z. B. EtherCAT)
        const kategorieSelect = document.getElementById('wizard-kategorie');
        const defaultKategorie = getWizardDefaultKategorie(step);
        if (kategorieSelect && defaultKategorie) {
            kategorieSelect.value = defaultKategorie;
        }

        onWizardKategorieChange();

        // Hersteller/Stecker/Ausrichtung laut Vorauswahl der Frage
        applyWizardVorauswahl(step);
        const herstellerSelect = document.getElementById('wizard-hersteller');
        if (herstellerSelect && !herstellerSelect.value) {
            const preferred = ['Beckhoff', 'Murr Elektronik', 'Phoenix Contact'];
            const available = preferred.find(h =>
                Array.from(herstellerSelect.options).some(opt => opt.value === h)
            );
            if (available) {
                herstellerSelect.value = available;
                onWizardHerstellerChange();
            }
        }

        renderWizardCreatedLeitungen(step);
    } else {
        setWizardOelflexMode(false);
        renderWizardCreatedLeitungen(step);
    }

    applyReadOnlyUI();
}


/**
 * Öffnet/schließt den Inline-Editor für die aktuelle Frage.
 * @returns {void}
 */
export function toggleWizardStepEditor() {
    if (!canEditWizardConfig()) {
        showModal('Keine Berechtigung zum Bearbeiten der Assistenten-Fragen.', {
            type: 'warning',
            title: 'Kein Zugriff'
        });
        return;
    }

    if (wizardStepEditorOpen) {
        restoreWizardStepEditorSnapshot();
        wizardStepEditorOpen = false;
    } else {
        captureWizardStepEditorSnapshot();
        wizardStepEditorOpen = true;
    }

    syncWizardStepEditorVisibility();

    const editBtn = document.getElementById('wizard-edit-step-btn');
    if (editBtn) {
        editBtn.textContent = wizardStepEditorOpen ? 'Bearbeitung schließen' : 'Frage bearbeiten';
    }

    if (!wizardStepEditorOpen) {
        renderProjektWizard();
    }
}


/**
 * Speichert eine Kopie der aktuellen Frage zum Verwerfen bei Abbrechen.
 * @returns {void}
 */
function captureWizardStepEditorSnapshot() {
    const index = appState.wizardStepIndex;
    const step = appState.wizardSteps[index];
    wizardStepEditorSnapshotIndex = index;
    wizardStepEditorSnapshot = step ? JSON.parse(JSON.stringify(step)) : null;
}


/**
 * Stellt den Snapshot der Frage wieder her (falls vorhanden).
 * @returns {void}
 */
function restoreWizardStepEditorSnapshot() {
    if (
        wizardStepEditorSnapshot
        && wizardStepEditorSnapshotIndex >= 0
        && wizardStepEditorSnapshotIndex < appState.wizardSteps.length
    ) {
        appState.wizardSteps[wizardStepEditorSnapshotIndex] = wizardStepEditorSnapshot;
    }
    wizardStepEditorSnapshot = null;
    wizardStepEditorSnapshotIndex = -1;
}


/**
 * Zeigt oder versteckt den Fragen-Editor und lädt ggf. das Formular.
 * @returns {void}
 */
function syncWizardStepEditorVisibility() {
    const editor = document.getElementById('wizard-step-editor');
    if (!editor) return;

    if (!wizardStepEditorOpen || !canEditWizardConfig()) {
        editor.hidden = true;
        return;
    }

    editor.hidden = false;
    mountWizardStepConfigForm(appState.wizardStepIndex);
}


/**
 * Verwirft den Editor und lädt die Frage neu.
 * @returns {void}
 */
export function cancelWizardStepEditor() {
    restoreWizardStepEditorSnapshot();
    wizardStepEditorOpen = false;
    renderProjektWizard();
}


/**
 * Speichert die Assistenten-Fragen und wendet die aktuelle Frage neu an.
 * @returns {Promise<void>}
 */
export async function saveWizardStepFromAssistent() {
    if (!canEditWizardConfig()) {
        showModal('Keine Berechtigung zum Speichern der Assistenten-Fragen.', {
            type: 'warning',
            title: 'Kein Zugriff'
        });
        return;
    }

    const ok = await persistWizardSteps({ silent: false });
    if (!ok) return;

    wizardStepEditorSnapshot = null;
    wizardStepEditorSnapshotIndex = -1;
    wizardStepEditorOpen = false;
    renderProjektWizard();
}


export function wizardPrev() {
    if (appState.wizardStepIndex <= 0) return;
    saveCurrentWizardAnswer();
    if (wizardStepEditorOpen) restoreWizardStepEditorSnapshot();
    wizardStepEditorOpen = false;
    appState.wizardStepIndex--;
    renderProjektWizard();
}


export function wizardNext() {
    const total = appState.wizardSteps.length;
    saveCurrentWizardAnswer();

    const step = getCurrentWizardStep();
    if (!isWizardStepSatisfied(step)) {
        showModal(
            'Bitte lege mindestens eine Leitung oder ein Bauteil an – oder setze den Haken „Nicht vorhanden / nicht benötigt", um fortzufahren.',
            { type: 'warning', title: 'Eingabe erforderlich' }
        );
        return;
    }

    if (appState.wizardStepIndex >= total - 1) {
        showView('uebersicht');
        return;
    }

    if (wizardStepEditorOpen) restoreWizardStepEditorSnapshot();
    wizardStepEditorOpen = false;
    appState.wizardStepIndex++;
    renderProjektWizard();
}


export function wizardJumpToQuestion() {
    const jumpBox = document.getElementById('wizard-jump-box');
    const jumpInput = document.getElementById('wizard-jump-input');
    const total = appState.wizardSteps.length;
    if (!jumpBox || !jumpInput || total === 0) return;

    jumpBox.style.display = jumpBox.style.display === 'none' ? 'flex' : 'none';
    if (jumpBox.style.display === 'flex') {
        jumpInput.value = String(appState.wizardStepIndex + 1);
        jumpInput.max = String(total);
        setTimeout(() => jumpInput.focus(), 0);
    }
}


export function wizardCancelJump() {
    const jumpBox = document.getElementById('wizard-jump-box');
    if (!jumpBox) return;
    jumpBox.style.display = 'none';
}


export function wizardApplyJump() {
    const jumpInput = document.getElementById('wizard-jump-input');
    const total = appState.wizardSteps.length;
    if (!jumpInput || total === 0) return;

    const target = parseInt(jumpInput.value, 10);
    if (Number.isNaN(target) || target < 1 || target > total) {
        showModal(`Bitte eine gültige Zahl zwischen 1 und ${total} eingeben.`, {
            type: 'warning',
            title: 'Ungültige Eingabe'
        });
        return;
    }

    saveCurrentWizardAnswer();
    if (wizardStepEditorOpen) restoreWizardStepEditorSnapshot();
    wizardStepEditorOpen = false;
    appState.wizardStepIndex = target - 1;
    wizardCancelJump();
    renderProjektWizard();
}
