/**
 * @file wizard-leitungen.js
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import {
    setWizardOelflexMode,
    getOelflexHersteller,
    populateWizardOelflexAdern,
    populateWizardMotorleitungTypen
} from './oelflex.js';
import { getBaseSteckerTyp } from './konfigurator-stecker.js';
import { getSteckerBasetypenForKategorie } from './konfigurator-form.js';
import { stepIsOelflexWizard, stepIsMotorleitungWizard } from './wizard-core.js';
import { updateWizardAutoArtikel } from './wizard-ui.js';

export function getWizardArtikelPool() {
    return (appState.katalog && Array.isArray(appState.katalog.artikel)) ? appState.katalog.artikel : [];
}


export function getCurrentWizardStep() {
    return appState.wizardSteps[appState.wizardStepIndex] || null;
}


export function getWizardDefaultKategorie(step) {
    if (step?.defaultCategory) return step.defaultCategory;
    if (Array.isArray(step?.allowedCategories) && step.allowedCategories.length === 1) {
        return step.allowedCategories[0];
    }
    const text = (step?.frage || '').toLowerCase();
    if (text.includes('ethercat')) return 'ethercat';
    if (text.includes('power')) return 'power';
    if (text.includes('geber')) return 'geber';
    if (text.includes('sensor') || text.includes('lichtschranken') || text.includes('not-halt')) {
        return 'sensor';
    }
    return '';
}


export function getWizardKategorie() {
    const select = document.getElementById('wizard-kategorie');
    return select ? select.value : '';
}


export function getWizardArtikelByKategorie() {
    const kategorie = getWizardKategorie();
    if (!kategorie) return getWizardArtikelPool();
    return getWizardArtikelPool().filter(a => a.kategorie === kategorie);
}


export function populateWizardKategorieDropdown() {
    const select = document.getElementById('wizard-kategorie');
    if (!select) return;

    const currentValue = select.value;
    const step = getCurrentWizardStep();
    const allowed = Array.isArray(step?.allowedCategories) ? step.allowedCategories : null;
    const kategorien = (appState.katalog?.kategorien || [])
        .map(k => ({ value: k.id, label: k.name }))
        .filter(k => k.value && (!allowed || allowed.includes(k.value)));

    select.innerHTML = '<option value="">-- Bitte wählen --</option>';
    kategorien.forEach(k => {
        const option = document.createElement('option');
        option.value = k.value;
        option.textContent = k.label;
        select.appendChild(option);
    });

    if (currentValue && kategorien.some(k => k.value === currentValue)) {
        select.value = currentValue;
    }
}


export function populateWizardHerstellerDropdown() {
    const select = document.getElementById('wizard-hersteller');
    if (!select) return;

    const currentValue = select.value;
    const hersteller = Array.from(new Set(getWizardArtikelByKategorie().map(a => a.hersteller).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'de'));

    select.innerHTML = '<option value="">-- Bitte wählen --</option>';
    hersteller.forEach(h => {
        const option = document.createElement('option');
        option.value = h;
        option.textContent = h;
        select.appendChild(option);
    });

    if (currentValue && hersteller.includes(currentValue)) {
        select.value = currentValue;
    }
}


/**
 * Hersteller für Geberleitungen (auch ohne Katalogartikel).
 * @returns {void}
 */
export function populateWizardGeberHerstellerDropdown() {
    const select = document.getElementById('wizard-hersteller');
    if (!select) return;

    const fromArtikel = getWizardArtikelByKategorie().map(a => a.hersteller).filter(Boolean);
    const preferred = ['IGUS', 'Baumüller'];
    const hersteller = Array.from(new Set([...preferred, ...fromArtikel]))
        .sort((a, b) => a.localeCompare(b, 'de'));

    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Bitte wählen --</option>';
    hersteller.forEach(h => {
        const option = document.createElement('option');
        option.value = h;
        option.textContent = h;
        select.appendChild(option);
    });

    if (currentValue && hersteller.includes(currentValue)) {
        select.value = currentValue;
    } else if (hersteller.includes('IGUS')) {
        select.value = 'IGUS';
    }
}


export function getWizardArtikelByHersteller(hersteller) {
    return getWizardArtikelByKategorie().filter(a => a.hersteller === hersteller);
}


export function getWizardPairMatches(hersteller, steckerABase, steckerBBase) {
    const artikel = getWizardArtikelByHersteller(hersteller);
    return artikel.filter(a =>
        (getBaseSteckerTyp(a.steckerA) === steckerABase && getBaseSteckerTyp(a.steckerB) === steckerBBase) ||
        (getBaseSteckerTyp(a.steckerA) === steckerBBase && getBaseSteckerTyp(a.steckerB) === steckerABase)
    );
}


/**
 * @param {'a'|'b'} seite
 * @returns {'gerade'|'gewinkelt'}
 */
export function getWizardAusrichtung(seite) {
    const btn = document.getElementById(`wizard-ausrichtung-${seite}`);
    if (!btn) return 'gerade';
    return btn.classList.contains('gewinkelt') ? 'gewinkelt' : 'gerade';
}


/**
 * @param {'a'|'b'} seite
 * @param {'gerade'|'gewinkelt'|string} ausrichtung
 * @returns {void}
 */
export function setWizardAusrichtung(seite, ausrichtung) {
    const btn = document.getElementById(`wizard-ausrichtung-${seite}`);
    if (!btn) return;
    const gewinkelt = ausrichtung === 'gewinkelt';
    btn.classList.toggle('gewinkelt', gewinkelt);
    const text = btn.querySelector('.toggle-text');
    if (text) text.textContent = gewinkelt ? 'gewinkelt' : 'gerade';
}


/**
 * @param {'a'|'b'} seite
 * @returns {void}
 */
export function toggleWizardAusrichtung(seite) {
    const next = getWizardAusrichtung(seite) === 'gewinkelt' ? 'gerade' : 'gewinkelt';
    setWizardAusrichtung(seite, next);
    onWizardSteckerBChange();
}


/**
 * @param {string} stecker
 * @param {string|undefined} ausrichtung
 * @returns {boolean}
 */
function steckerMatchesAusrichtung(stecker, ausrichtung) {
    if (!ausrichtung || !stecker) return true;
    if (!/M8|M12/i.test(stecker)) return true;
    if (ausrichtung === 'gewinkelt') return stecker.includes('gewinkelt');
    return !stecker.includes('gewinkelt');
}


/**
 * @param {object[]} matches
 * @param {string} steckerABase
 * @param {string} steckerBBase
 * @param {string} ausrA
 * @param {string} ausrB
 * @returns {object[]}
 */
export function filterWizardMatchesByAusrichtung(matches, steckerABase, steckerBBase, ausrA, ausrB) {
    if (!ausrA && !ausrB) return matches;
    return matches.filter(a => {
        const baseA = getBaseSteckerTyp(a.steckerA);
        const baseB = getBaseSteckerTyp(a.steckerB);
        const direct = baseA === steckerABase && baseB === steckerBBase
            && steckerMatchesAusrichtung(a.steckerA, ausrA)
            && steckerMatchesAusrichtung(a.steckerB, ausrB);
        const reverse = baseA === steckerBBase && baseB === steckerABase
            && steckerMatchesAusrichtung(a.steckerA, ausrB)
            && steckerMatchesAusrichtung(a.steckerB, ausrA);
        return direct || reverse;
    });
}


export function onWizardKategorieChange() {
    const step = getCurrentWizardStep();
    const kategorie = getWizardKategorie();
    const steckerASelect = document.getElementById('wizard-stecker-a');
    const steckerBSelect = document.getElementById('wizard-stecker-b');
    const laengeSelect = document.getElementById('wizard-laenge');

    if (kategorie === 'motor' || stepIsMotorleitungWizard(step)) {
        setWizardOelflexMode(true, { motorleitung: true });
        populateWizardMotorleitungTypen();
        const herstellerSelect = document.getElementById('wizard-hersteller');
        if (herstellerSelect) herstellerSelect.value = 'Lapp Kabel';
        updateWizardAutoArtikel();
        return;
    }

    if (kategorie === 'geber') {
        setWizardOelflexMode(true, { geberleitung: true });
        populateWizardGeberHerstellerDropdown();
        updateWizardAutoArtikel();
        return;
    }

    if (kategorie === 'oelflex' || stepIsOelflexWizard(step)) {
        setWizardOelflexMode(true, { motorleitung: false });
        populateWizardOelflexAdern();
        const herstellerSelect = document.getElementById('wizard-hersteller');
        const oelflexHersteller = getOelflexHersteller();
        if (oelflexHersteller && herstellerSelect) {
            herstellerSelect.value = oelflexHersteller;
        }
        updateWizardAutoArtikel();
        return;
    }

    setWizardOelflexMode(false);
    steckerASelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    steckerBSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    laengeSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    populateWizardHerstellerDropdown();
    onWizardHerstellerChange();
}


export function onWizardHerstellerChange() {
    const hersteller = document.getElementById('wizard-hersteller').value;
    const steckerASelect = document.getElementById('wizard-stecker-a');
    const steckerBSelect = document.getElementById('wizard-stecker-b');
    const laengeSelect = document.getElementById('wizard-laenge');

    if (getWizardKategorie() === 'geber') {
        updateWizardAutoArtikel();
        return;
    }

    steckerASelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    steckerBSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    laengeSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';

    if (!hersteller) {
        updateWizardAutoArtikel();
        return;
    }

    const steckerAOptions = new Set();
    getWizardArtikelByHersteller(hersteller).forEach(a => {
        if (a.steckerA) steckerAOptions.add(getBaseSteckerTyp(a.steckerA));
        if (a.steckerB) steckerAOptions.add(getBaseSteckerTyp(a.steckerB));
    });
    getSteckerBasetypenForKategorie(getWizardKategorie()).forEach(s => steckerAOptions.add(s));

    Array.from(steckerAOptions).sort((a, b) => a.localeCompare(b, 'de')).forEach(s => {
        const option = document.createElement('option');
        option.value = s;
        option.textContent = s;
        steckerASelect.appendChild(option);
    });

    updateWizardAutoArtikel();
}


export function onWizardSteckerAChange() {
    const hersteller = document.getElementById('wizard-hersteller').value;
    const steckerABase = document.getElementById('wizard-stecker-a').value;
    const steckerBSelect = document.getElementById('wizard-stecker-b');
    const laengeSelect = document.getElementById('wizard-laenge');

    steckerBSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    laengeSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';

    if (!hersteller || !steckerABase) {
        updateWizardAutoArtikel();
        return;
    }

    const steckerBOptions = new Set();
    getWizardArtikelByHersteller(hersteller).forEach(a => {
        const baseA = getBaseSteckerTyp(a.steckerA);
        const baseB = getBaseSteckerTyp(a.steckerB);
        if (baseA === steckerABase && baseB) steckerBOptions.add(baseB);
        if (baseB === steckerABase && baseA) steckerBOptions.add(baseA);
    });
    getSteckerBasetypenForKategorie(getWizardKategorie()).forEach(s => {
        if (s !== steckerABase) steckerBOptions.add(s);
    });

    Array.from(steckerBOptions)
        .sort((a, b) => a.localeCompare(b, 'de'))
        .forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = s;
            steckerBSelect.appendChild(option);
        });

    updateWizardAutoArtikel();
}


export function onWizardSteckerBChange() {
    const hersteller = document.getElementById('wizard-hersteller').value;
    const steckerABase = document.getElementById('wizard-stecker-a').value;
    const steckerBBase = document.getElementById('wizard-stecker-b').value;
    const laengeSelect = document.getElementById('wizard-laenge');

    laengeSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';

    if (!hersteller || !steckerABase || !steckerBBase) {
        updateWizardAutoArtikel();
        return;
    }

    const ausrA = getWizardAusrichtung('a');
    const ausrB = getWizardAusrichtung('b');
    const matches = filterWizardMatchesByAusrichtung(
        getWizardPairMatches(hersteller, steckerABase, steckerBBase),
        steckerABase,
        steckerBBase,
        ausrA,
        ausrB
    );

    const laengen = Array.from(new Set(
        matches
            .map(a => a.laenge)
            .filter(l => typeof l === 'number' && l > 0)
    )).sort((a, b) => a - b);

    laengen.forEach(l => {
        const option = document.createElement('option');
        option.value = String(l);
        option.textContent = `${l} m`;
        laengeSelect.appendChild(option);
    });

    updateWizardAutoArtikel();
}


export function renderWizardCreatedLeitungen(step) {
    const container = document.getElementById('wizard-created-list');
    if (!container || !appState.currentProjekt || !step) return;

    const leitungen = (appState.currentProjekt.leitungen || []).filter(l => l.wizardStepId === step.id);
    if (leitungen.length === 0) {
        container.innerHTML = '<p class="konfig-list-empty">Noch keine Leitungen zu dieser Frage angelegt.</p>';
        return;
    }

    const grouped = new Map();
    leitungen.forEach(l => {
        const artikel = l.artikelnummer || l.artikelCustom || '(ohne Artikelnummer)';
        const bezeichnung = l.bezeichnung || '-';
        const key = `${artikel}|||${bezeichnung}`;
        if (!grouped.has(key)) {
            grouped.set(key, { artikel, bezeichnung, count: 0, ids: [] });
        }
        const g = grouped.get(key);
        g.count += 1;
        g.ids.push(l.id);
    });

    const rows = Array.from(grouped.values())
        .sort((a, b) => a.artikel.localeCompare(b.artikel, 'de'))
        .map(item => `
            <li>
                <span class="artikel">${escapeHtml(item.artikel)}</span>
                <span>${escapeHtml(item.bezeichnung)}</span>
                <span class="count">${item.count}</span>
                <button type="button" class="btn btn-danger btn-small btn-icon" onclick="wizardDeleteLeitungFromStep('${escapeHtml(item.ids[0])}')" title="Eine entfernen">🗑️</button>
            </li>
        `).join('');

    container.innerHTML = `
        <h4>Zu dieser Frage angelegte Leitungen (${leitungen.length})</h4>
        <ul>${rows}</ul>
    `;
}
