/**
 * @file konfigurator-form.js
 */
import { appState } from './state.js';
import { setAusrichtung } from './konfigurator-stecker.js';
import { getBaseSteckerTyp, getFullSteckerTyp, hasAusrichtung } from './stecker-utils.js';
import { onSteckerChange } from './konfigurator-core.js';

export { getFullSteckerTyp } from './stecker-utils.js';

export function toggleAusrichtung(seite) {
    const btn = document.getElementById(`ausrichtung-${seite}`);
    if (!btn) return;
    
    const isGewinkelt = btn.classList.contains('gewinkelt');
    setAusrichtung(seite, !isGewinkelt);
    
    onSteckerChange();
}


export function isSteckerErlaubtFuerKategorie(steckerBase, kategorie) {
    if (!kategorie || kategorie === '') return true;
    
    // Bei EtherCAT nur M8, M12, RJ45 und offen erlaubt
    if (kategorie === 'ethercat') {
        const erlaubt = ['M8 4-polig', 'M12 4-polig', 'RJ45', 'offen'];
        return erlaubt.some(e => steckerBase.includes(e) || steckerBase === e);
    }
    
    return true;
}


/**
 * Liefert die im Katalog hinterlegten Stecker-Basistypen für eine Kategorie.
 * @param {string} kategorie
 * @returns {string[]}
 */
export function getSteckerBasetypenForKategorie(kategorie) {
    const typen = appState.katalog?.steckertypen || [];
    const seen = new Set();

    return typen
        .map(typ => getBaseSteckerTyp(typ))
        .filter(typ => {
            if (!typ || seen.has(typ)) return false;
            if (!isSteckerErlaubtFuerKategorie(typ, kategorie)) return false;
            seen.add(typ);
            return true;
        })
        .sort((a, b) => a.localeCompare(b, 'de'));
}


function mergeSteckerOptions(steckerSet, kategorie) {
    getSteckerBasetypenForKategorie(kategorie).forEach(typ => steckerSet.add(typ));
}


export function getUniqueSteckerA(hersteller) {
    const artikel = getArtikelForHersteller(hersteller);
    const kategorie = document.getElementById('leitung-kategorie').value;
    const stecker = new Set();
    
    artikel.forEach(a => {
        if (a.steckerA) {
            const baseTyp = getBaseSteckerTyp(a.steckerA);
            // Bei Kategorie-Filter nur passende Stecker anzeigen
            if (kategorie && a.kategorie !== kategorie) return;
            if (!isSteckerErlaubtFuerKategorie(baseTyp, kategorie)) return;
            stecker.add(baseTyp);
        }
    });

    mergeSteckerOptions(stecker, kategorie);
    return Array.from(stecker).sort((a, b) => a.localeCompare(b, 'de'));
}


export function getUniqueSteckerB(hersteller, steckerABase, ausrichtungA) {
    const artikel = getArtikelForHersteller(hersteller);
    const kategorie = document.getElementById('leitung-kategorie').value;
    const stecker = new Set();

    artikel.forEach(a => {
        if (!a.steckerB) return;
        
        // Bei Kategorie-Filter nur passende Artikel
        if (kategorie && a.kategorie !== kategorie) return;
        
        // Prüfen ob ausgewählter Stecker auf einer der beiden Seiten passt
        if (steckerABase) {
            const fullSteckerA = hasAusrichtung(steckerABase)
                ? getFullSteckerTyp(steckerABase, ausrichtungA || 'gerade')
                : steckerABase;
            const matchesOnA = a.steckerA === fullSteckerA;
            const matchesOnB = a.steckerB === fullSteckerA;
            if (!matchesOnA && !matchesOnB) return;

            // Gegenstück zur gematchten Seite als mögliche Stecker-B-Option verwenden
            const otherStecker = matchesOnA ? a.steckerB : a.steckerA;
            const baseTypOther = getBaseSteckerTyp(otherStecker);
            if (!isSteckerErlaubtFuerKategorie(baseTypOther, kategorie)) return;
            stecker.add(baseTypOther);
            return;
        }
        
        const baseTypB = getBaseSteckerTyp(a.steckerB);
        if (!isSteckerErlaubtFuerKategorie(baseTypB, kategorie)) return;
        
        // Nur Basis-Typ von Stecker B speichern
        stecker.add(baseTypB);
    });

    mergeSteckerOptions(stecker, kategorie);
    if (steckerABase) {
        stecker.delete(steckerABase);
    }
    return Array.from(stecker).sort((a, b) => a.localeCompare(b, 'de'));
}


export function getAvailableLaengen(hersteller, steckerA, steckerB) {
    const artikel = getArtikelForHersteller(hersteller);
    const kategorie = document.getElementById('leitung-kategorie').value;
    const laengen = new Set();

    artikel.forEach(a => {
        // Kategorie-Filter
        if (kategorie && a.kategorie !== kategorie) return;
        
        const directMatch = (!steckerA || a.steckerA === steckerA) && (!steckerB || a.steckerB === steckerB);
        const swappedMatch = (!steckerA || a.steckerB === steckerA) && (!steckerB || a.steckerA === steckerB);
        
        if ((directMatch || swappedMatch) && a.laenge > 0) {
            laengen.add(a.laenge);
        }
    });

    return Array.from(laengen).sort((a, b) => a - b);
}


export function findArtikel(hersteller, steckerA, steckerB, laenge) {
    if (!appState.katalog || !appState.katalog.artikel) return null;
    
    const kategorie = document.getElementById('leitung-kategorie').value;
    const laengeNum = parseFloat(laenge);

    // Exakte Übereinstimmung suchen (mit Kategorie-Filter)
    const exactMatch = appState.katalog.artikel.find(a => 
        a.hersteller === hersteller &&
        (
            (a.steckerA === steckerA && a.steckerB === steckerB) ||
            (a.steckerA === steckerB && a.steckerB === steckerA)
        ) &&
        a.laenge === laengeNum &&
        (!kategorie || a.kategorie === kategorie)
    );
    
    if (exactMatch) return { artikel: exactMatch, exact: true };
    
    // Partielle Übereinstimmungen (mit Kategorie-Filter)
    const partialMatches = appState.katalog.artikel.filter(a =>
        a.hersteller === hersteller &&
        (
            (a.steckerA === steckerA && a.steckerB === steckerB) ||
            (a.steckerA === steckerB && a.steckerB === steckerA)
        ) &&
        (!kategorie || a.kategorie === kategorie)
    );
    
    if (partialMatches.length > 0) {
        const sorted = partialMatches.sort((a, b) => {
            const diffA = Math.abs(a.laenge - laengeNum);
            const diffB = Math.abs(b.laenge - laengeNum);
            return diffA - diffB;
        });
        
        const closest = sorted[0];
        const nextLarger = sorted.find(a => a.laenge >= laengeNum);
        
        return { 
            artikel: nextLarger || closest, 
            exact: false,
            requestedLaenge: laengeNum,
            availableLaengen: partialMatches.map(a => a.laenge).sort((a,b) => a-b)
        };
    }
    
    return null;
}


export function populateHerstellerDropdown() {
    const select = document.getElementById('leitung-hersteller');
    select.innerHTML = '<option value="">-- Bitte wählen --</option>';
    
    if (appState.katalog && appState.katalog.hersteller) {
        appState.katalog.hersteller.forEach(h => {
            const option = document.createElement('option');
            option.value = h;
            option.textContent = h;
            select.appendChild(option);
        });
    }
}


export function getArtikelForHersteller(hersteller) {
    if (!appState.katalog || !appState.katalog.artikel) return [];
    return appState.katalog.artikel.filter(a => a.hersteller === hersteller);
}


export function populateKategorieDropdown() {
    const select = document.getElementById('leitung-kategorie');
    select.innerHTML = '<option value="">-- Bitte wählen --</option>';
    
    if (appState.katalog && appState.katalog.kategorien) {
        appState.katalog.kategorien.forEach(k => {
            const option = document.createElement('option');
            option.value = k.id;
            option.textContent = `${k.icon} ${k.name}`;
            select.appendChild(option);
        });
    }
}
