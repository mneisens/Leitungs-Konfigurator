/**
 * @file konfigurator-core.js
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
import { getAusrichtung, setAusrichtung, getBaseSteckerTyp, hasAusrichtung } from './konfigurator-stecker.js';
import { getFullSteckerTyp, findArtikel, getUniqueSteckerA, getUniqueSteckerB, getAvailableLaengen, populateHerstellerDropdown, populateKategorieDropdown } from './konfigurator-form.js';

export function initKonfigurator() {
    if (!appState.currentProjekt) {
        showView('home');
        return;
    }
    
    document.getElementById('konfig-projekt-titel').textContent = 
        `${appState.currentProjekt.projektnummer} - ${appState.currentProjekt.name}`;
    
    populateHerstellerDropdown();
    populateKategorieDropdown();
    populateGruppenDropdown();
    
    if (!appState.currentProjekt.leitungen || appState.currentProjekt.leitungen.length === 0) {
        addNewLeitung();
    }
    
    renderLeitungForm();
}


export function populateGruppenDropdown() {
    const select = document.getElementById('leitung-gruppe');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Bitte wählen --</option>';

    appState.leitungGruppen.forEach(gruppe => {
        const option = document.createElement('option');
        option.value = gruppe.code;
        option.textContent = gruppe.label || gruppe.code;
        if (gruppe.bemerkung) {
            option.title = gruppe.bemerkung;
        }
        select.appendChild(option);
    });

    if (currentValue) {
        select.value = currentValue;
    }
}


export function renderKonfigGruppenliste() {
    const container = document.getElementById('konfig-gruppenliste');
    if (!container || !appState.currentProjekt) return;

    const leitungen = appState.currentProjekt.leitungen || [];
    if (leitungen.length === 0) {
        container.innerHTML = '<p class="konfig-list-empty">Noch keine Leitungen vorhanden.</p>';
        return;
    }

    const gruppenMap = new Map();

    leitungen.forEach(leitung => {
        const gruppe = leitung.gruppe || '';
        const artikelnummer = (leitung.artikelnummer || leitung.artikelCustom || '').trim();
        if (!artikelnummer) return;

        if (!gruppenMap.has(gruppe)) {
            gruppenMap.set(gruppe, new Map());
        }

        const artikelMap = gruppenMap.get(gruppe);
        artikelMap.set(artikelnummer, (artikelMap.get(artikelnummer) || 0) + 1);
    });

    if (gruppenMap.size === 0) {
        container.innerHTML = '<p class="konfig-list-empty">Noch keine Artikelnummern vorhanden.</p>';
        return;
    }

    const gruppenCodes = Array.from(gruppenMap.keys()).sort(compareGruppenCode);
    const html = gruppenCodes.map(code => {
        const artikelMap = gruppenMap.get(code);
        const artikelRows = Array.from(artikelMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'de'))
            .map(([artikel, count]) => `
                <li>
                    <span class="artikel">${escapeHtml(artikel)}</span>
                    <span class="count">${count}</span>
                </li>
            `).join('');

        return `
            <div class="konfig-group-block">
                <h4>${escapeHtml(code ? getGruppeDisplay(code) : 'Ohne Gruppe')}</h4>
                <ul>
                    ${artikelRows}
                </ul>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}


export function onKategorieFilterChange() {
    const kategorie = document.getElementById('leitung-kategorie').value;
    const herstellerSelect = document.getElementById('leitung-hersteller');

    // Ölflex-Modus: keine Stecker, sondern Aderzahl + Querschnitt
    if (kategorie === 'oelflex') {
        setOelflexMode(true);
        const oelflexHersteller = getOelflexHersteller();
        if (oelflexHersteller) {
            herstellerSelect.value = oelflexHersteller;
        }
        populateOelflexAdern();
        updateArtikelVorschlag();
        return;
    }

    setOelflexMode(false);

    // Bei EtherCAT, Power und Sensor automatisch Beckhoff auswählen
    if (kategorie === 'ethercat' || kategorie === 'power' || kategorie === 'sensor') {
        herstellerSelect.value = 'Beckhoff';
    }
    
    // Stecker-Dropdowns neu laden (mit Kategorie-Filter)
    onHerstellerChange();

    // Für EtherCAT gewünschte Defaults setzen, sofern verfügbar
    if (kategorie === 'ethercat') {
        const steckerASelect = document.getElementById('leitung-stecker-a');
        const steckerBSelect = document.getElementById('leitung-stecker-b');
        const defaultStecker = 'M8 4-polig';

        const hasSteckerA = Array.from(steckerASelect.options).some(option => option.value === defaultStecker);
        if (hasSteckerA) {
            steckerASelect.value = defaultStecker;
            onSteckerChange();
        }

        const hasSteckerB = Array.from(steckerBSelect.options).some(option => option.value === defaultStecker);
        if (hasSteckerB) {
            steckerBSelect.value = defaultStecker;
        }

        loadLaengen();
        updateArtikelVorschlag();
    }
}


export function onHerstellerChange() {
    const hersteller = document.getElementById('leitung-hersteller').value;
    const selectA = document.getElementById('leitung-stecker-a');
    const selectB = document.getElementById('leitung-stecker-b');
    const laengeSelect = document.getElementById('leitung-laenge-select');
    
    selectA.innerHTML = '<option value="">-- Bitte wählen --</option>';
    selectB.innerHTML = '<option value="">-- Bitte wählen --</option>';
    laengeSelect.innerHTML = '<option value="">-- Länge wählen --</option>';
    
    // Ausrichtung auf Standard (gerade) zurücksetzen
    setAusrichtung('a', false);
    setAusrichtung('b', false);
    
    updateArtikelVorschlag();
    
    if (!hersteller) return;
    
    // Basis-Steckertypen laden (ohne gerade/gewinkelt)
    const steckerA = getUniqueSteckerA(hersteller);
    let defaultSteckerA = '';
    steckerA.forEach(s => {
        const option = document.createElement('option');
        option.value = s;
        option.textContent = s;
        selectA.appendChild(option);
        // Erste Option als Standard
        if (!defaultSteckerA) {
            defaultSteckerA = s;
        }
    });
    
    if (defaultSteckerA) {
        selectA.value = defaultSteckerA;
    }
    
    // Stecker B basierend auf Stecker A laden
    const ausrichtungA = getAusrichtung('a');
    const steckerB = getUniqueSteckerB(hersteller, defaultSteckerA, ausrichtungA);
    let defaultSteckerB = '';
    steckerB.forEach(s => {
        const option = document.createElement('option');
        option.value = s;
        option.textContent = s;
        selectB.appendChild(option);
        if (!defaultSteckerB) {
            defaultSteckerB = s;
        }
    });
    
    if (defaultSteckerB) {
        selectB.value = defaultSteckerB;
    }
    
    // Wenn beide Stecker vorausgewählt, Längen laden
    if (defaultSteckerA && defaultSteckerB) {
        loadLaengen();
    }
    
    updateArtikelVorschlag();
}


export function onSteckerChange() {
    const hersteller = document.getElementById('leitung-hersteller').value;
    const steckerABase = document.getElementById('leitung-stecker-a').value;
    const ausrichtungA = getAusrichtung('a');
    
    console.log('onSteckerChange:', { hersteller, steckerABase, ausrichtungA });
    
    if (hersteller && steckerABase) {
        const selectB = document.getElementById('leitung-stecker-b');
        const currentB = selectB.value;
        
        selectB.innerHTML = '<option value="">-- Bitte wählen --</option>';
        const steckerBOptions = getUniqueSteckerB(hersteller, steckerABase, ausrichtungA);
        let defaultSteckerB = '';
        let foundCurrentB = false;
        
        console.log('SteckerB options:', steckerBOptions, 'currentB:', currentB);
        
        steckerBOptions.forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = s;
            if (s === currentB) {
                option.selected = true;
                foundCurrentB = true;
            }
            selectB.appendChild(option);
            if (!defaultSteckerB) {
                defaultSteckerB = s;
            }
        });
        
        // Wenn vorheriger Wert nicht mehr verfügbar, ersten Wert wählen
        if (!foundCurrentB && defaultSteckerB) {
            selectB.value = defaultSteckerB;
            console.log('Stecker B reset to:', defaultSteckerB);
        }
    }
    
    loadLaengen();
    updateArtikelVorschlag();
}


export function loadLaengen() {
    const hersteller = document.getElementById('leitung-hersteller').value;
    const steckerABase = document.getElementById('leitung-stecker-a').value;
    const steckerBBase = document.getElementById('leitung-stecker-b').value;
    const ausrichtungA = getAusrichtung('a');
    const ausrichtungB = getAusrichtung('b');
    const laengeSelect = document.getElementById('leitung-laenge-select');
    
    laengeSelect.innerHTML = '<option value="">-- Länge wählen --</option>';
    
    if (hersteller && steckerABase && steckerBBase) {
        // Vollständige Steckertypen mit Ausrichtung erstellen
        const fullSteckerA = getFullSteckerTyp(steckerABase, ausrichtungA);
        // Für Stecker B: Wenn keine Ausrichtung relevant (z.B. "offen"), nicht modifizieren
        const fullSteckerB = hasAusrichtung(steckerBBase) 
            ? getFullSteckerTyp(steckerBBase, ausrichtungB)
            : steckerBBase;
        
        console.log('loadLaengen:', { hersteller, fullSteckerA, fullSteckerB });
        
        const laengen = getAvailableLaengen(hersteller, fullSteckerA, fullSteckerB);
        laengen.forEach(l => {
            const option = document.createElement('option');
            option.value = l;
            option.textContent = `${l} m`;
            laengeSelect.appendChild(option);
        });
        
        if (laengen.length === 0) {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "Meterware - Länge eingeben";
            laengeSelect.appendChild(option);
        }
    }
    
    updateArtikelVorschlag();
}


export function onLaengeChange() {
    const laengeSelect = document.getElementById('leitung-laenge-select');
    const laengeInput = document.getElementById('leitung-laenge');
    
    if (laengeSelect.value) {
        laengeInput.value = laengeSelect.value;
    }
    
    updateArtikelVorschlag();
}


export function updateArtikelVorschlag() {
    const hersteller = document.getElementById('leitung-hersteller').value;
    const steckerABase = document.getElementById('leitung-stecker-a').value;
    const steckerBBase = document.getElementById('leitung-stecker-b').value;
    const ausrichtungA = getAusrichtung('a');
    const ausrichtungB = getAusrichtung('b');
    const laengeSelect = document.getElementById('leitung-laenge-select').value;
    const laengeInput = document.getElementById('leitung-laenge').value;
    const laenge = laengeSelect || laengeInput;
    
    const vorschlagDiv = document.getElementById('artikel-vorschlag');
    const kategorieSelect = document.getElementById('leitung-kategorie');

    // Ölflex (Meterware): Artikel über Aderzahl + Querschnitt bestimmen, Länge frei in Metern
    if (kategorieSelect.value === 'oelflex') {
        const adern = document.getElementById('oelflex-adern').value;
        const querschnitt = document.getElementById('oelflex-querschnitt').value;

        if (!adern || !querschnitt) {
            vorschlagDiv.className = 'artikel-vorschlag no-match';
            vorschlagDiv.innerHTML = '<span class="artikel-label">Aderzahl und Querschnitt wählen</span>';
            appState.currentArtikelVorschlag = null;
            return;
        }

        const artikel = findOelflexArtikel(adern, querschnitt);
        if (!artikel) {
            vorschlagDiv.className = 'artikel-vorschlag no-match';
            vorschlagDiv.innerHTML = `
                <span class="artikel-label">Kein passender Artikel gefunden</span>
                <span class="artikel-hinweis">Artikelnummer manuell eingeben</span>
            `;
            appState.currentArtikelVorschlag = null;
            return;
        }

        appState.currentArtikelVorschlag = artikel;
        const laengeHinweis = laenge ? `${laenge} m (Meterware)` : 'Bitte Länge in Metern eingeben';
        vorschlagDiv.className = 'artikel-vorschlag';
        vorschlagDiv.innerHTML = `
            <span class="artikel-nummer">${escapeHtml(artikel.artikelnummer)}</span>
            <span class="artikel-beschreibung">${escapeHtml(artikel.beschreibung)}</span>
            <span class="artikel-hinweis">${escapeHtml(laengeHinweis)}</span>
        `;
        return;
    }

    if (!hersteller || !steckerABase || !steckerBBase || !laenge) {
        vorschlagDiv.className = 'artikel-vorschlag no-match';
        vorschlagDiv.innerHTML = '<span class="artikel-label">Bitte alle Felder ausfüllen</span>';
        appState.currentArtikelVorschlag = null;
        return;
    }
    
    // Vollständige Steckertypen mit Ausrichtung erstellen
    const steckerA = getFullSteckerTyp(steckerABase, ausrichtungA);
    // Für Stecker B: Wenn keine Ausrichtung relevant (z.B. "offen", "RJ45"), nicht modifizieren
    const steckerB = hasAusrichtung(steckerBBase) 
        ? getFullSteckerTyp(steckerBBase, ausrichtungB)
        : steckerBBase;
    
    console.log('updateArtikelVorschlag:', { hersteller, steckerA, steckerB, laenge });
    
    const result = findArtikel(hersteller, steckerA, steckerB, laenge);
    
    if (!result) {
        vorschlagDiv.className = 'artikel-vorschlag no-match';
        vorschlagDiv.innerHTML = `
            <span class="artikel-label">Kein passender Artikel gefunden</span>
            <span class="artikel-hinweis">Artikelnummer manuell eingeben</span>
        `;
        appState.currentArtikelVorschlag = null;
        return;
    }
    
    appState.currentArtikelVorschlag = result.artikel;
    
    if (result.artikel.kategorie && !kategorieSelect.value) {
        kategorieSelect.value = result.artikel.kategorie;
    }
    
    if (result.exact) {
        vorschlagDiv.className = 'artikel-vorschlag';
        vorschlagDiv.innerHTML = `
            <span class="artikel-nummer">${escapeHtml(result.artikel.artikelnummer)}</span>
            <span class="artikel-beschreibung">${escapeHtml(result.artikel.beschreibung)}</span>
        `;
    } else {
        vorschlagDiv.className = 'artikel-vorschlag';
        const availableStr = result.availableLaengen.map(l => l + 'm').join(', ');
        vorschlagDiv.innerHTML = `
            <span class="artikel-nummer">${escapeHtml(result.artikel.artikelnummer)}</span>
            <span class="artikel-beschreibung">${escapeHtml(result.artikel.beschreibung)}</span>
            <span class="artikel-hinweis">Nächste verfügbare Länge: ${result.artikel.laenge}m (verfügbar: ${availableStr})</span>
        `;
    }
}


export function renderLeitungForm() {
    if (!appState.currentProjekt || !appState.currentProjekt.leitungen) return;
    
    const total = appState.currentProjekt.leitungen.length;
    const position = appState.currentLeitungIndex + 1;
    
    document.getElementById('konfig-position').textContent = `Leitung ${position}`;
    document.getElementById('konfig-total').textContent = total;
    
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const hasPrev = appState.currentLeitungIndex > 0;
    const hasNext = appState.currentLeitungIndex < total - 1;

    prevBtn.disabled = !hasPrev;
    nextBtn.disabled = !hasNext;
    prevBtn.style.display = hasPrev ? 'inline-flex' : 'none';
    nextBtn.style.display = hasNext ? 'inline-flex' : 'none';
    
    const leitung = appState.currentProjekt.leitungen[appState.currentLeitungIndex];
    if (leitung) {
        document.getElementById('leitung-id').value = leitung.id || '';
        document.getElementById('leitung-position').value = leitung.position || position;
        document.getElementById('leitung-bezeichnung').value = leitung.bezeichnung || '';
        document.getElementById('leitung-kategorie').value = leitung.kategorie || '';
        document.getElementById('leitung-gruppe').value = leitung.gruppe || '';
        document.getElementById('leitung-hersteller').value = leitung.hersteller || '';

        // Ölflex (Meterware): über Aderzahl + Querschnitt rekonstruieren
        if (leitung.kategorie === 'oelflex') {
            onKategorieFilterChange();
            const art = (appState.katalog.artikel || []).find(a => a.artikelnummer === leitung.artikelnummer);
            const v = art ? parseOelflexVariante(art.beschreibung) : null;
            if (v) {
                populateOelflexAdern(v.adern);
                populateOelflexQuerschnitt(v.adern, v.querschnitt);
            }
            if (leitung.laenge) {
                document.getElementById('leitung-laenge').value = leitung.laenge;
            }
            document.getElementById('leitung-artikel-custom').value = leitung.artikelCustom || '';
            document.getElementById('leitung-notiz').value = leitung.notiz || '';
            updateArtikelVorschlag();
            renderKonfigGruppenliste();
            return;
        }

        // Ausrichtung aus gespeicherten Steckern extrahieren
        let ausrichtungA = 'gerade';
        let ausrichtungB = 'gerade';
        let steckerABase = '';
        let steckerBBase = '';
        
        if (leitung.steckerA) {
            steckerABase = getBaseSteckerTyp(leitung.steckerA);
            if (leitung.steckerA.includes('gewinkelt')) {
                ausrichtungA = 'gewinkelt';
            }
        }
        if (leitung.steckerB) {
            steckerBBase = getBaseSteckerTyp(leitung.steckerB);
            if (leitung.steckerB.includes('gewinkelt')) {
                ausrichtungB = 'gewinkelt';
            }
        }
        
        // Hersteller laden (setzt Ausrichtung auf gerade zurück)
        onHerstellerChange();
        
        // Ausrichtung setzen BEVOR Stecker gesetzt werden
        setAusrichtung('a', ausrichtungA === 'gewinkelt');
        setAusrichtung('b', ausrichtungB === 'gewinkelt');
        
        // Basis-Stecker setzen
        if (steckerABase) {
            document.getElementById('leitung-stecker-a').value = steckerABase;
        }
        
        onSteckerChange();
        
        if (steckerBBase) {
            document.getElementById('leitung-stecker-b').value = steckerBBase;
        }
        
        loadLaengen();
        
        if (leitung.laenge) {
            const laengeSelect = document.getElementById('leitung-laenge-select');
            const laengeInput = document.getElementById('leitung-laenge');
            
            let found = false;
            for (let i = 0; i < laengeSelect.options.length; i++) {
                if (parseFloat(laengeSelect.options[i].value) === leitung.laenge) {
                    laengeSelect.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            
            laengeInput.value = leitung.laenge;
        }
        
        document.getElementById('leitung-artikel-custom').value = leitung.artikelCustom || '';
        document.getElementById('leitung-notiz').value = leitung.notiz || '';
        
        if (leitung.kategorie) {
            document.getElementById('leitung-kategorie').value = leitung.kategorie;
        }
        
        updateArtikelVorschlag();
    } else {
        clearLeitungForm();
    }

    renderKonfigGruppenliste();
}
