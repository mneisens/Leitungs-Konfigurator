/**
 * @file oelflex.js
 */
import { appState } from './state.js';
import { updateArtikelVorschlag } from './konfigurator-core.js';

/**
 * setOelflexMode.
 * @param {boolean} active
 * @param {{ motorleitung?: boolean, geberleitung?: boolean }} [options]
 * @returns {void}
 */
export function setOelflexMode(active, options = {}) {
    const steckerRow = document.getElementById('stecker-row');
    const oelflexRow = document.getElementById('oelflex-row');
    const laengeSelect = document.getElementById('leitung-laenge-select');
    const adernGroup = document.getElementById('oelflex-adern')?.closest('.form-group');
    const qsGroup = document.getElementById('oelflex-querschnitt')?.closest('.form-group');
    const qsLabel = document.querySelector('label[for="oelflex-querschnitt"]');
    const motor = active && options.motorleitung === true;
    const geber = active && options.geberleitung === true;

    if (steckerRow) steckerRow.style.display = active ? 'none' : '';
    // Geber: nur freie Länge, keine Adern/Typ-Felder
    if (oelflexRow) oelflexRow.style.display = active && !geber ? '' : 'none';
    if (laengeSelect) laengeSelect.style.display = active ? 'none' : '';

    if (adernGroup) adernGroup.style.display = motor || geber ? 'none' : '';
    if (qsGroup) qsGroup.style.display = geber ? 'none' : '';
    if (qsLabel) {
        qsLabel.textContent = motor ? '2. Typ / Querschnitt' : '3. Querschnitt';
    }
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
 * Artikel der Kategorie Motorleitungen (ÖLFLEX SERVO 719 CY).
 * @returns {object[]}
 */
export function getMotorleitungArtikel() {
    if (!appState.katalog || !appState.katalog.artikel) return [];
    return appState.katalog.artikel.filter(a =>
        a.kategorie === 'motor'
        || a.serie === 'servo719cy'
        || /SERVO\s*719\s*CY/i.test(a.beschreibung || '')
    );
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
    const kategorie = document.getElementById('leitung-kategorie')?.value;
    if (kategorie === 'motor') {
        updateArtikelVorschlag();
        return;
    }
    const adern = document.getElementById('oelflex-adern').value;
    populateOelflexQuerschnitt(adern, document.getElementById('oelflex-querschnitt').value);
    updateArtikelVorschlag();
}


/**
 * Sortierte Motorleitungs-Artikel.
 * @returns {object[]}
 */
function getSortedMotorleitungArtikel() {
    return getMotorleitungArtikel().slice().sort((a, b) => {
        const va = parseOelflexVariante(a.beschreibung);
        const vb = parseOelflexVariante(b.beschreibung);
        const qa = va ? parseFloat(va.querschnitt.replace(',', '.')) : 0;
        const qb = vb ? parseFloat(vb.querschnitt.replace(',', '.')) : 0;
        return qa - qb;
    });
}


/**
 * Füllt ein Select mit Motorleitungs-Typen (Value = Artikelnummer).
 * @param {HTMLSelectElement|null} select
 * @param {string} [selectedArtikelnummer]
 * @returns {void}
 */
function fillMotorleitungTypSelect(select, selectedArtikelnummer) {
    if (!select) return;
    select.innerHTML = '<option value="">-- Typ wählen --</option>';
    getSortedMotorleitungArtikel().forEach(a => {
        const option = document.createElement('option');
        option.value = a.artikelnummer;
        const typ = (a.beschreibung || '')
            .replace(/^ÖLFLEX\s+SERVO\s+719\s+CY\s+/i, '')
            .replace(/\s*Motorleitung\s*$/i, '')
            .trim();
        option.textContent = `${typ} (${a.artikelnummer})`;
        select.appendChild(option);
    });
    if (selectedArtikelnummer) select.value = selectedArtikelnummer;
}


/**
 * Füllt die Typ-Auswahl im Leitungs-Konfigurator.
 * @param {string} [selectedArtikelnummer]
 * @returns {void}
 */
export function populateMotorleitungTypen(selectedArtikelnummer) {
    fillMotorleitungTypSelect(document.getElementById('oelflex-querschnitt'), selectedArtikelnummer);
}


/**
 * Findet Motorleitungs-Artikel anhand der Artikelnummer aus der Typ-Auswahl.
 * @param {string} artikelnummer
 * @returns {object|null}
 */
export function findMotorleitungArtikel(artikelnummer) {
    if (!artikelnummer) return null;
    return getMotorleitungArtikel().find(a => a.artikelnummer === artikelnummer) || null;
}
