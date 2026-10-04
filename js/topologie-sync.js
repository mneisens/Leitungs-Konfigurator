/**
 * @file topologie-sync.js – Verbindungen der EtherCAT-Topologie als Leitungen in =004.
 *
 * Jede Verbindung OUT → IN ist eine echte Leitung im Projekt (Gruppe =004 Netzwerk und
 * Bustopologie). Die Leitung trägt `topoVerbindungId`, die Verbindung `leitungAngelegt`.
 * Topologie → Leitung: Typ, Länge, Stecker und Artikel werden übernommen.
 * Leitung → Topologie: Änderungen an Länge/Artikel schreibt `uebernehmeLeitungInTopologie`
 * zurück; wird die Leitung gelöscht, entfällt beim nächsten Abgleich auch die Verbindung.
 */
import { appState } from './state.js';
import { generateId } from './utils.js';
import { getArtikelByNummer } from './catalog.js';
import { deriveArtikelPrefix, getKonfektionierteKatalogArtikel } from './leitung-optionen.js';
import { canEditProject } from './project-access.js';

/** Gruppe, in der die Busleitungen der Topologie landen. */
export const TOPOLOGIE_GRUPPE = '=004';


/**
 * Verbindungen in Kettenreihenfolge: vom ersten Modul (ohne Eingang) entlang OUT → IN.
 * @param {object} topo
 * @returns {object[]}
 */
export function getVerbindungenInKette(topo) {
    const verbindungen = Array.isArray(topo?.verbindungen) ? topo.verbindungen : [];
    const ausgehend = new Map();
    const hatEingang = new Set();
    verbindungen.forEach(v => {
        if (!ausgehend.has(v.vonModulId)) ausgehend.set(v.vonModulId, []);
        ausgehend.get(v.vonModulId).push(v);
        hatEingang.add(v.nachModulId);
    });

    const reihenfolge = [];
    const erledigt = new Set();
    const folge = start => {
        let aktuell = start;
        while (aktuell && !erledigt.has(aktuell.id)) {
            erledigt.add(aktuell.id);
            reihenfolge.push(aktuell);
            aktuell = (ausgehend.get(aktuell.nachModulId) || []).find(n => !erledigt.has(n.id));
        }
    };

    verbindungen.filter(v => !hatEingang.has(v.vonModulId)).forEach(folge);
    verbindungen.forEach(folge);
    return reihenfolge;
}


/**
 * Katalogartikel, aus dem Hersteller und Stecker der Leitung stammen.
 * @param {object} verbindung
 * @returns {object|null}
 */
function getReferenzArtikel(verbindung) {
    if (verbindung.artikelnummer) {
        const artikel = getArtikelByNummer(verbindung.artikelnummer);
        if (artikel) return artikel;
    }
    if (!verbindung.reihe) return null;
    return getKonfektionierteKatalogArtikel({ kategorie: 'ethercat', limit: 600 })
        .find(a => (deriveArtikelPrefix(a.artikelnummer) || a.artikelnummer) === verbindung.reihe) || null;
}


/**
 * @param {object} topo
 * @param {string} modulId
 * @returns {string} z. B. „M3 EP3356-0022“
 */
function getModulText(topo, modulId) {
    const index = topo.module.findIndex(m => m.id === modulId);
    if (index < 0) return '?';
    return `M${index + 1} ${topo.module[index].artikelnummer || ''}`.trim();
}


/**
 * Gleicht Topologie-Verbindungen und Leitungen in =004 ab.
 * @param {object} [projekt]
 * @returns {boolean} true, wenn sich etwas geändert hat (dann speichern).
 */
export function syncTopologieLeitungen(projekt = appState.currentProjekt) {
    const topo = projekt?.ethercatTopologie;
    if (!projekt || !topo || !Array.isArray(topo.verbindungen) || !Array.isArray(topo.module)) return false;
    if (!canEditProject(projekt)) return false;
    if (!Array.isArray(projekt.leitungen)) projekt.leitungen = [];
    let geaendert = false;

    // Leitung in der Gruppe gelöscht → Verbindung in der Topologie ebenfalls entfernen.
    const verknuepft = new Set(projekt.leitungen.map(l => l.topoVerbindungId).filter(Boolean));
    const anzahlVerbindungen = topo.verbindungen.length;
    topo.verbindungen = topo.verbindungen.filter(v => !v.leitungAngelegt || verknuepft.has(v.id));
    if (topo.verbindungen.length !== anzahlVerbindungen) geaendert = true;

    // Verbindung entfernt (auch mit ihrem Modul) → Leitung entfernen.
    const verbindungIds = new Set(topo.verbindungen.map(v => v.id));
    const anzahlLeitungen = projekt.leitungen.length;
    projekt.leitungen = projekt.leitungen.filter(l => !l.topoVerbindungId || verbindungIds.has(l.topoVerbindungId));
    if (projekt.leitungen.length !== anzahlLeitungen) geaendert = true;

    getVerbindungenInKette(topo).forEach((verbindung, index) => {
        let leitung = projekt.leitungen.find(l => l.topoVerbindungId === verbindung.id);
        if (!leitung) {
            leitung = {
                id: generateId('ltg'),
                position: 0,
                presetId: '',
                bezeichnung: '',
                kategorie: 'ethercat',
                gruppe: TOPOLOGIE_GRUPPE,
                hersteller: 'Beckhoff',
                artikelnummer: '',
                artikelPrefix: '',
                artikelWhitelist: null,
                artikelCustom: '',
                laenge: 0,
                steckerA: '',
                steckerB: '',
                festLeitungstyp: false,
                notiz: '',
                anzahl: 1,
                erledigt: false,
                topoVerbindungId: verbindung.id
            };
            projekt.leitungen.push(leitung);
            geaendert = true;
        }
        if (!verbindung.leitungAngelegt) {
            verbindung.leitungAngelegt = true;
            geaendert = true;
        }

        const name = `EtherCAT ${index + 1}: ${getModulText(topo, verbindung.vonModulId)} → ${getModulText(topo, verbindung.nachModulId)}`;
        const soll = {
            artikelPrefix: verbindung.reihe || '',
            laenge: Number(verbindung.laenge) || 0,
            topoBezeichnung: name
        };
        // Ohne festen Artikel ermittelt die Gruppe ihn aus Reihe und Länge – nur bei
        // Wechsel der Reihe zurücksetzen, sonst entsteht ein ständiges Hin und Her.
        if (verbindung.artikelnummer) soll.artikelnummer = verbindung.artikelnummer;
        else if ((leitung.artikelPrefix || '') !== (verbindung.reihe || '')) soll.artikelnummer = '';
        // Den automatischen Namen nur nachführen, solange er nicht von Hand geändert wurde.
        if (!leitung.bezeichnung || leitung.bezeichnung === leitung.topoBezeichnung) soll.bezeichnung = name;
        // Ohne gewählten Typ bleiben Stecker, die in der Gruppe gewählt wurden, erhalten.
        const referenz = getReferenzArtikel(verbindung);
        if (referenz) {
            soll.hersteller = referenz.hersteller || leitung.hersteller;
            soll.steckerA = referenz.steckerA || '';
            soll.steckerB = referenz.steckerB || '';
        }

        Object.entries(soll).forEach(([feld, wert]) => {
            if (leitung[feld] !== wert) {
                leitung[feld] = wert;
                geaendert = true;
            }
        });
    });

    if (geaendert) projekt.leitungen.forEach((l, i) => { l.position = i + 1; });
    return geaendert;
}


/**
 * Schreibt Länge und Artikel einer in =004 bearbeiteten Leitung in die Topologie zurück.
 * @param {object} leitung
 * @returns {void}
 */
export function uebernehmeLeitungInTopologie(leitung) {
    if (!leitung?.topoVerbindungId) return;
    const verbindung = appState.currentProjekt?.ethercatTopologie?.verbindungen
        ?.find(v => v.id === leitung.topoVerbindungId);
    if (!verbindung) return;

    const artikelnummer = leitung.artikelCustom || leitung.artikelnummer || '';
    verbindung.laenge = Number(leitung.laenge) || 0;
    verbindung.artikelnummer = artikelnummer;
    verbindung.reihe = leitung.artikelPrefix || deriveArtikelPrefix(artikelnummer) || '';
}
