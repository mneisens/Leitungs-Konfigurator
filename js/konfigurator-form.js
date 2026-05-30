/**
 * @file konfigurator-form.js
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
import { getBaseSteckerTyp, hasAusrichtung, setAusrichtung } from './konfigurator-stecker.js';
import { onSteckerChange } from './konfigurator-core.js';

export function toggleAusrichtung(seite) {
    const btn = document.getElementById(`ausrichtung-${seite}`);
    if (!btn) return;
    
    const isGewinkelt = btn.classList.contains('gewinkelt');
    setAusrichtung(seite, !isGewinkelt);
    
    onSteckerChange();
}


export function getFullSteckerTyp(baseTyp, ausrichtung) {
    if (!baseTyp) return '';
    if (!hasAusrichtung(baseTyp)) return baseTyp;
    return `${baseTyp} ${ausrichtung}`;
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
    return Array.from(stecker).sort();
}


export function getUniqueSteckerB(hersteller, steckerABase, ausrichtungA) {
    const artikel = getArtikelForHersteller(hersteller);
    const kategorie = document.getElementById('leitung-kategorie').value;
    const stecker = new Set();
    
    console.log('getUniqueSteckerB:', { hersteller, steckerABase, ausrichtungA, kategorie });
    
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
    return Array.from(stecker).sort();
}


export function getAvailableLaengen(hersteller, steckerA, steckerB) {
    const artikel = getArtikelForHersteller(hersteller);
    const kategorie = document.getElementById('leitung-kategorie').value;
    const laengen = new Set();
    
    console.log('getAvailableLaengen params:', { hersteller, steckerA, steckerB, kategorie });
    
    // Debug: Zeige alle Power-Artikel mit M8 4-polig gerade + offen
    if (kategorie === 'power') {
        const debugArtikel = artikel.filter(a => 
            a.kategorie === 'power' && 
            a.steckerB === 'offen'
        );
        console.log('Debug - Power + offen Artikel:', debugArtikel.slice(0, 3));
    }
    
    artikel.forEach(a => {
        // Kategorie-Filter
        if (kategorie && a.kategorie !== kategorie) return;
        
        const directMatch = (!steckerA || a.steckerA === steckerA) && (!steckerB || a.steckerB === steckerB);
        const swappedMatch = (!steckerA || a.steckerB === steckerA) && (!steckerB || a.steckerA === steckerB);
        
        if ((directMatch || swappedMatch) && a.laenge > 0) {
            laengen.add(a.laenge);
        }
    });
    
    console.log('getAvailableLaengen result:', Array.from(laengen));
    
    return Array.from(laengen).sort((a, b) => a - b);
}


export function findArtikel(hersteller, steckerA, steckerB, laenge) {
    if (!appState.katalog || !appState.katalog.artikel) return null;
    
    const kategorie = document.getElementById('leitung-kategorie').value;
    const laengeNum = parseFloat(laenge);
    
    console.log('findArtikel params:', { hersteller, steckerA, steckerB, laenge, kategorie });
    
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
