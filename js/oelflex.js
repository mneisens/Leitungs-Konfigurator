/**
 * @file oelflex.js
 */
import { appState } from './state.js';
import { updateArtikelVorschlag } from './konfigurator-core.js';

/**
 * setOelflexMode.
 * @returns {void}
 */
export function setOelflexMode(active) {
    const steckerRow = document.getElementById('stecker-row');
    const oelflexRow = document.getElementById('oelflex-row');
    const laengeSelect = document.getElementById('leitung-laenge-select');
    if (steckerRow) steckerRow.style.display = active ? 'none' : '';
    if (oelflexRow) oelflexRow.style.display = active ? '' : 'none';
    // Bei Meterware nur das Meter-Eingabefeld, keine Längen-Auswahlliste
    if (laengeSelect) laengeSelect.style.display = active ? 'none' : '';
}


/**
 * getOelflexArtikel.
 * @returns {void}
 */
export function getOelflexArtikel() {
    if (!appState.katalog || !appState.katalog.artikel) return [];
    return appState.katalog.artikel.filter(a => a.kategorie === 'oelflex');
}


/**
 * getOelflexHersteller.
 * @returns {void}
 */
export function getOelflexHersteller() {
    const artikel = getOelflexArtikel();
    return artikel.length > 0 ? artikel[0].hersteller : '';
}


/**
 * parseOelflexVariante.
 * @returns {void}
 */
export function parseOelflexVariante(beschreibung) {
    if (!beschreibung) return null;
    const match = beschreibung.match(/(\d+)\s*[GgXx]\s*([\d.,]+)/);
    if (!match) return null;
    return { adern: match[1], querschnitt: match[2].replace('.', ',') };
}


/**
 * findOelflexArtikel.
 * @returns {void}
 */
export function findOelflexArtikel(adern, querschnitt) {
    return getOelflexArtikel().find(a => {
        const v = parseOelflexVariante(a.beschreibung);
        return v && v.adern === String(adern) && v.querschnitt === String(querschnitt);
    }) || null;
}


/**
 * populateOelflexAdern.
 * @returns {void}
 */
export function populateOelflexAdern(selectedAdern) {
    const adernSelect = document.getElementById('oelflex-adern');
    if (!adernSelect) return;
    const adern = new Set();
    getOelflexArtikel().forEach(a => {
        const v = parseOelflexVariante(a.beschreibung);
        if (v) adern.add(v.adern);
    });
    const sorted = Array.from(adern).sort((a, b) => Number(a) - Number(b));

    adernSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    sorted.forEach(n => {
        const option = document.createElement('option');
        option.value = n;
        option.textContent = `${n} Adern`;
        adernSelect.appendChild(option);
    });

    if (selectedAdern && sorted.includes(String(selectedAdern))) {
        adernSelect.value = String(selectedAdern);
    }
    populateOelflexQuerschnitt(adernSelect.value);
}


/**
 * populateOelflexQuerschnitt.
 * @returns {void}
 */
export function populateOelflexQuerschnitt(adern, selectedQuerschnitt) {
    const querschnittSelect = document.getElementById('oelflex-querschnitt');
    if (!querschnittSelect) return;

    const querschnitte = [];
    getOelflexArtikel().forEach(a => {
        const v = parseOelflexVariante(a.beschreibung);
        if (v && (!adern || v.adern === String(adern)) && !querschnitte.includes(v.querschnitt)) {
            querschnitte.push(v.querschnitt);
        }
    });
    querschnitte.sort((a, b) => parseFloat(a.replace(',', '.')) - parseFloat(b.replace(',', '.')));

    querschnittSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    querschnitte.forEach(q => {
        const option = document.createElement('option');
        option.value = q;
        option.textContent = `${q} mm²`;
        querschnittSelect.appendChild(option);
    });

    if (selectedQuerschnitt && querschnitte.includes(String(selectedQuerschnitt))) {
        querschnittSelect.value = String(selectedQuerschnitt);
    }
}


/**
 * onOelflexChange.
 * @returns {void}
 */
export function onOelflexChange() {
    const adern = document.getElementById('oelflex-adern').value;
    populateOelflexQuerschnitt(adern, document.getElementById('oelflex-querschnitt').value);
    updateArtikelVorschlag();
}


/**
 * setWizardOelflexMode.
 * @returns {void}
 */
export function setWizardOelflexMode(active) {
    const steckerRow = document.getElementById('wizard-stecker-row');
    const steckerAGroup = document.getElementById('wizard-stecker-a-group');
    const laengeGroup = document.getElementById('wizard-laenge-group');
    const oelflexRow = document.getElementById('wizard-oelflex-row');
    if (steckerRow) steckerRow.style.display = active ? 'none' : '';
    if (steckerAGroup) steckerAGroup.style.display = active ? 'none' : '';
    if (laengeGroup) laengeGroup.style.display = active ? 'none' : '';
    if (oelflexRow) oelflexRow.style.display = active ? '' : 'none';
}


/**
 * populateWizardOelflexAdern.
 * @returns {void}
 */
export function populateWizardOelflexAdern() {
    const adernSelect = document.getElementById('wizard-oelflex-adern');
    if (!adernSelect) return;
    const adern = new Set();
    getOelflexArtikel().forEach(a => {
        const v = parseOelflexVariante(a.beschreibung);
        if (v) adern.add(v.adern);
    });
    const sorted = Array.from(adern).sort((a, b) => Number(a) - Number(b));
    adernSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    sorted.forEach(n => {
        const option = document.createElement('option');
        option.value = n;
        option.textContent = `${n} Adern`;
        adernSelect.appendChild(option);
    });
    populateWizardOelflexQuerschnitt(adernSelect.value);
}


/**
 * populateWizardOelflexQuerschnitt.
 * @returns {void}
 */
export function populateWizardOelflexQuerschnitt(adern) {
    const querschnittSelect = document.getElementById('wizard-oelflex-querschnitt');
    if (!querschnittSelect) return;
    const querschnitte = [];
    getOelflexArtikel().forEach(a => {
        const v = parseOelflexVariante(a.beschreibung);
        if (v && (!adern || v.adern === String(adern)) && !querschnitte.includes(v.querschnitt)) {
            querschnitte.push(v.querschnitt);
        }
    });
    querschnitte.sort((a, b) => parseFloat(a.replace(',', '.')) - parseFloat(b.replace(',', '.')));
    querschnittSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    querschnitte.forEach(q => {
        const option = document.createElement('option');
        option.value = q;
        option.textContent = `${q} mm²`;
        querschnittSelect.appendChild(option);
    });
}


/**
 * onWizardOelflexChange.
 * @returns {void}
 */
export function onWizardOelflexChange() {
    const adern = document.getElementById('wizard-oelflex-adern')?.value;
    populateWizardOelflexQuerschnitt(adern);
    updateWizardAutoArtikel();
}
