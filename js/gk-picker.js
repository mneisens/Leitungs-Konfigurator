/**
 * @file gk-picker.js – Auswahldialog (Picker) für Leitungen und Bauteile aus dem Katalog.
 */
import { appState } from './state.js';
import { escapeHtml, escapeAttr, jsArg, formatLaenge } from './utils.js';
import { assertCanEdit } from './project-access.js';
import { getBauteilTypName } from './catalog.js';
import {
    deriveArtikelPrefix,
    getKategorieName,
    getKategorien,
    getKonfektionierteKatalogArtikel,
    getLaengenOptionen,
    istMeterwareKategorie
} from './leitung-optionen.js';
import { getGruppenVorgaben } from './gruppen-config.js';
import { preisAnzeige, preisSpanne } from './preise.js';
import { gk, getBauteileDerGruppe, getGruppe, getLeitungenDerGruppe } from './gk-state.js';
import { renderGruppenPanel } from './gk-gruppen.js';
import {
    aktualisiereLeitungDropdown,
    getLeitungAusfuehrung,
    getPresetBeschreibung,
    getPresetLaengen,
    gruppeSucheOeffnen,
    gruppeVorschlagUebernehmen,
    presetIstErfasst,
    presetMehrfachMoeglich
} from './gk-vorschlaege.js';
import { getArtikelAuswahlFuerGruppe, gruppeAddBauteil, gruppeAddBauteilAusArtikel } from './gk-bauteile.js';
import {
    gruppeAddKatalogArtikelDirekt,
    gruppeAddLeitung,
    gruppeAddLeitungAusArtikel,
    gruppeAddLeitungAusReihe,
    gruppeAddLeitungMitKategorie,
    gruppeAddLeitungWie,
    renderChip
} from './gk-leitungen.js';


/**
 * Ein Listeneintrag im Auswahldialog.
 * @param {{onclick: string, titel: string, meta: string, marke?: string}} eintrag
 * @returns {string}
 */
/**
 * @param {string} artikelnummer
 * @returns {string}
 */
export function preisSuffix(artikelnummer) {
    const anzeige = preisAnzeige(artikelnummer);
    return anzeige ? ` · ${anzeige.text}` : '';
}


/**
 * @param {string} artikelnummer
 * @returns {string}
 */
export function renderPreisKurz(artikelnummer) {
    const anzeige = preisAnzeige(artikelnummer);
    if (!anzeige) return '';
    return `<span class="preis-badge" title="${escapeAttr(anzeige.titel)}">${escapeHtml(anzeige.text)}</span>`;
}


function renderPickerEintrag(eintrag) {
    const knopf = `
        <button type="button" class="picker-eintrag" onclick="${eintrag.onclick}">
            <span class="picker-eintrag-titel">${markiereSuche(eintrag.titel, gk.pickerState?.suche)}${eintrag.marke || ''}</span>
            <span class="picker-eintrag-meta">${escapeHtml(eintrag.meta)}</span>
        </button>
    `;
    if (!eintrag.laengen?.length) return knopf;

    // Ein Klick auf eine Länge übernimmt die Leitung sofort – ohne Bearbeitungsfenster.
    const chips = eintrag.laengen.map(l => renderChip({
        label: escapeHtml(l.label),
        onclick: l.onclick,
        title: l.title || '',
        klasse: `chip-klein chip-laenge${l.standard ? ' chip-standard' : ''}`
    })).join('');
    return `<div class="picker-zeile">${knopf}<div class="picker-laengen">${chips}</div></div>`;
}


/**
 * Text escapen und die Suchbegriffe darin hervorheben.
 * @param {string} text
 * @param {string} [suche]
 * @returns {string}
 */
function markiereSuche(text, suche) {
    const sicher = escapeHtml(text || '');
    const woerter = String(suche || '').trim().split(/\s+/).filter(w => w.length >= 2);
    if (!woerter.length) return sicher;
    const muster = woerter
        .map(w => escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    return sicher.replace(new RegExp(`(${muster})`, 'gi'), '<mark>$1</mark>');
}


/**
 * Wenige Längen für den Schnellzugriff im Auswahlfenster: die üblichen Katalog-
 * Standardlängen plus die Vorgabe des Presets. Alles Weitere über das Fenster.
 * @param {number[]} laengen
 * @param {number} [vorgabe]
 * @returns {number[]}
 */
function waehleSchnellLaengen(laengen, vorgabe) {
    if (laengen.length <= 5) return laengen;

    const ueblich = appState.katalog?.standardlaengen?.length
        ? appState.katalog.standardlaengen
        : [1, 2, 3, 5, 10, 15, 20];
    const auswahl = new Set(laengen.filter(l => ueblich.includes(l)));
    if (vorgabe && laengen.includes(Number(vorgabe))) auswahl.add(Number(vorgabe));

    const sortiert = Array.from(auswahl).sort((a, b) => a - b).slice(0, 5);
    return sortiert.length ? sortiert : laengen.slice(0, 5);
}


/**
 * Längen-Chips eines Picker-Eintrags inkl. „…“ für alle übrigen Längen.
 * @param {number[]} laengen
 * @param {(laenge: number) => string} onclick
 * @param {string} weitereOnclick - Öffnet die Leitung im Fenster mit allen Längen.
 * @param {number} [vorgabe]
 * @returns {{label: string, onclick: string, standard?: boolean, title?: string}[]}
 */
function bildeLaengenChips(laengen, onclick, weitereOnclick, vorgabe) {
    const schnell = waehleSchnellLaengen(laengen, vorgabe);
    const chips = schnell.map(l => ({
        label: `${formatLaenge(l)} m`,
        onclick: onclick(l),
        standard: Number(vorgabe) === l,
        title: Number(vorgabe) === l ? 'Standardlänge' : `${formatLaenge(l)} m übernehmen`
    }));
    if (laengen.length > schnell.length) {
        chips.push({ label: '…', onclick: weitereOnclick, title: `Alle ${laengen.length} Längen` });
    }
    return chips;
}


/**
 * @param {string} titel
 * @param {string[]} eintraege
 * @returns {string}
 */
function renderPickerSektion(titel, eintraege) {
    if (!eintraege.length) return '';
    return `
        <div class="picker-sektion">
            <h6 class="picker-sektion-titel">${escapeHtml(titel)}</h6>
            ${eintraege.join('')}
        </div>
    `;
}


/**
 * @param {string} text
 * @param {string} suche
 * @returns {boolean}
 */
function passtZurSuche(text, suche) {
    if (!suche) return true;
    // Jedes Wort muss vorkommen – „m12 off“ findet „M12 Buchse → offenes Ende“.
    const heuhaufen = String(text || '').toLowerCase();
    return suche.toLowerCase().split(/\s+/).filter(Boolean).every(wort => heuhaufen.includes(wort));
}


/**
 * Entfernt die Längenangabe am Ende einer Katalog-Beschreibung.
 * @param {string} beschreibung
 * @returns {string}
 */
export function ohneLaengenangabe(beschreibung) {
    return String(beschreibung || '').replace(/[\s-]*\d+([.,]\d+)?\s*m\s*$/i, '').trim();
}


/**
 * @param {object} artikel
 * @returns {boolean}
 */
function istBeckhoffLeitung(artikel) {
    return String(artikel?.hersteller || '').toLowerCase() === 'beckhoff';
}


/**
 * Kurztitel der Kategorie für Beckhoff-Picker (z. B. Powerleitung).
 * @param {string} kategorie
 * @returns {string}
 */
function beckhoffKategorieLabel(kategorie) {
    const labels = {
        power: 'Powerleitung',
        ethercat: 'EtherCAT-Leitung',
        sensor: 'Sensorleitung',
        cplink: 'CP-Link-Leitung',
        motor: 'Motorleitung',
        geber: 'Geberleitung',
        oelflex: 'Ölflexleitung',
        sonstiges: 'Leitung'
    };
    if (labels[kategorie]) return labels[kategorie];
    return getKategorieName(kategorie) || 'Leitung';
}


/**
 * Bezeichnung für neue Katalog-Leitungen, wenn das Feld leer bleibt.
 * @param {{kategorie: string, hersteller: string, artikelnummer: string, steckerA: string, steckerB: string, laenge: number, meterware: boolean}} daten
 * @returns {string}
 */
export function bildeNeueLeitungBezeichnung(daten) {
    const typ = beckhoffKategorieLabel(daten.kategorie);
    const artikel = String(daten.artikelnummer || '').trim();
    const stecker = [
        formatBeckhoffSteckerAnzeige(daten.steckerA),
        formatBeckhoffSteckerAnzeige(daten.steckerB)
    ].filter(Boolean).join(' → ');
    const laengeText = daten.meterware
        ? 'Meterware'
        : (daten.laenge > 0 ? `${formatLaenge(daten.laenge)} m` : '');

    if (String(daten.hersteller || '').toLowerCase() === 'beckhoff' || /^ZK/i.test(artikel)) {
        return [typ && artikel ? `${typ} | ${artikel}` : (typ || artikel), stecker, laengeText]
            .filter(Boolean)
            .join(' · ');
    }

    return [typ, stecker, laengeText, artikel].filter(Boolean).join(' · ') || artikel || typ;
}


/**
 * Steckeranzeige für Beckhoff: „M8 4-polig gerade“ → „M8 gerade“.
 * @param {string} stecker
 * @returns {string}
 */
function formatBeckhoffSteckerAnzeige(stecker) {
    if (!stecker || /^offen$/i.test(stecker)) return 'offen';
    return String(stecker)
        .replace(/\s+\d+-polig/gi, '')
        .replace(/\s+(Stecker|Buchse)/gi, '')
        .replace(/\s+/g, ' ')
        .trim() || stecker;
}


/**
 * Titel und Metazeile eines Katalog-Reiheneintrags im Picker.
 * @param {string} prefix
 * @param {object[]} artikel
 * @returns {{titel: string, meta: string}}
 */
function formatKatalogReihenLabel(prefix, artikel) {
    const erste = artikel[0];
    const laengen = artikel.map(a => a.laenge).filter(l => l > 0).sort((a, b) => a - b);
    const laengenText = !laengen.length
        ? ''
        : (artikel.length === 1
            ? `${formatLaenge(erste.laenge)} m`
            : `${laengen.length} Längen (${formatLaenge(laengen[0])}–${formatLaenge(laengen[laengen.length - 1])} m)`);

    if (istBeckhoffLeitung(erste)) {
        const titel = `${beckhoffKategorieLabel(erste.kategorie)} | ${prefix}-0xxx`;
        const stecker = `${formatBeckhoffSteckerAnzeige(erste.steckerA)} → ${formatBeckhoffSteckerAnzeige(erste.steckerB)}`;
        return {
            titel,
            meta: [stecker, erste.hersteller || '', laengenText, preisSpanne(artikel.map(a => a.artikelnummer))]
                .filter(Boolean).join(' · ')
        };
    }

    if (artikel.length === 1) {
        return {
            titel: erste.beschreibung || erste.artikelnummer,
            meta: `${erste.artikelnummer} · ${erste.hersteller || ''} · ${formatLaenge(erste.laenge)} m${preisSuffix(erste.artikelnummer)}`
        };
    }

    return {
        titel: ohneLaengenangabe(erste.beschreibung) || prefix,
        meta: [`Reihe ${prefix}`, erste.hersteller || '', laengenText, preisSpanne(artikel.map(a => a.artikelnummer))]
            .filter(Boolean).join(' · ')
    };
}


/**
 * Katalogtreffer nach Leitungsreihe zusammenfassen – sonst unterscheiden sich
 * die Einträge nur in der Länge und die Liste wird unlesbar.
 * @param {string} suche
 * @param {string} [kategorie]
 * @returns {string[]}
 */
function renderKatalogReihen(suche, kategorie = '') {
    const reihen = new Map();

    getKonfektionierteKatalogArtikel({ suche, kategorie, limit: 600 }).forEach(artikel => {
        const prefix = deriveArtikelPrefix(artikel.artikelnummer) || artikel.artikelnummer;
        if (!reihen.has(prefix)) reihen.set(prefix, []);
        reihen.get(prefix).push(artikel);
    });

    return Array.from(reihen.entries()).slice(0, 30).map(([prefix, artikel]) => {
        const erste = artikel[0];
        const { titel, meta } = formatKatalogReihenLabel(prefix, artikel);

        if (artikel.length === 1) {
            return renderPickerEintrag({
                onclick: `gruppeAddLeitungAusArtikel('${jsArg(erste.artikelnummer)}')`,
                titel,
                meta
            });
        }

        const reiheOeffnen = `gruppeAddLeitungAusReihe('${jsArg(prefix)}', '${jsArg(erste.artikelnummer)}')`;
        const nachLaenge = new Map(artikel.filter(a => a.laenge > 0).map(a => [Number(a.laenge), a]));
        return renderPickerEintrag({
            onclick: reiheOeffnen,
            titel,
            meta,
            laengen: bildeLaengenChips(
                Array.from(nachLaenge.keys()).sort((a, b) => a - b),
                l => `gruppeAddKatalogArtikelDirekt('${jsArg(nachLaenge.get(l).artikelnummer)}')`,
                reiheOeffnen
            )
        });
    });
}


/**
 * Leitungen, die in diesem Projekt zuletzt erfasst wurden – je Ausführung einmal.
 * In Anlagen wiederholen sich dieselben Leitungen ständig.
 * @param {number} [anzahl]
 * @returns {object[]}
 */
function getZuletztVerwendeteLeitungen(anzahl = 5) {
    const alle = appState.currentProjekt?.leitungen || [];
    const gesehen = new Set();
    const ergebnis = [];

    for (let i = alle.length - 1; i >= 0 && ergebnis.length < anzahl; i--) {
        const leitung = alle[i];
        const artikelnummer = leitung.artikelCustom || leitung.artikelnummer;
        if (!artikelnummer) continue;

        const schluessel = istMeterwareKategorie(leitung.kategorie) || leitung.artikelCustom
            ? artikelnummer
            : [leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, leitung.artikelPrefix].join('|');
        if (gesehen.has(schluessel)) continue;
        gesehen.add(schluessel);
        ergebnis.push(leitung);
    }
    return ergebnis;
}


/**
 * @param {object} leitung
 * @returns {number[]}
 */
function getLaengenFuerLeitung(leitung) {
    if (istMeterwareKategorie(leitung.kategorie) || leitung.artikelCustom) return [];
    if (!leitung.artikelPrefix && !(leitung.steckerA && leitung.steckerB)) return [];
    return getLaengenOptionen(
        leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, leitung.artikelPrefix
    );
}


/**
 * Kategorien, nach denen im Auswahlfenster gefiltert werden kann.
 * @returns {object[]}
 */
function getPickerKategorien() {
    const vorhanden = new Set((appState.katalog?.artikel || []).map(a => a.kategorie));
    return getKategorien().filter(k => vorhanden.has(k.id));
}


/**
 * Filter-Chips über der Trefferliste.
 * @returns {string}
 */
export function renderPickerFilter() {
    if (!gk.pickerState || gk.pickerState.art !== 'leitung') return '';
    const aktiv = gk.pickerState.kategorie || '';

    return [{ id: '', name: 'Alle', icon: '' }, ...getPickerKategorien()].map(k => renderChip({
        label: `${k.icon ? `${escapeHtml(k.icon)} ` : ''}${escapeHtml(k.name)}`,
        onclick: `gruppePickerKategorie('${jsArg(k.id)}')`,
        aktiv: aktiv === k.id,
        klasse: 'chip-klein'
    })).join('');
}


/**
 * Trefferliste für Leitungen: Standard der Gruppe, zuletzt verwendet, weitere
 * übliche Leitungen, Katalog. Ein Klick auf eine Länge übernimmt sofort.
 * @param {string} suche
 * @returns {string}
 */
function renderPickerLeitungen(suche) {
    const vorgaben = getGruppenVorgaben(getGruppe(gk.aktiveGruppe));
    const erfasst = getLeitungenDerGruppe(gk.aktiveGruppe);
    const kategorie = gk.pickerState?.kategorie || '';

    const presetEintrag = preset => {
        const id = jsArg(preset.id);
        const anzahl = erfasst.filter(l => {
            if (l.presetId === preset.id) return true;
            return preset.artikelPrefix && l.artikelPrefix === preset.artikelPrefix;
        }).length;
        let meta = getPresetBeschreibung(preset);
        if (presetMehrfachMoeglich(preset) && anzahl) {
            meta += ` · ${anzahl}× erfasst`;
        } else if (presetIstErfasst(preset, erfasst)) {
            meta += ' · bereits erfasst';
        }
        return renderPickerEintrag({
            onclick: `gruppeAddLeitung('${id}')`,
            titel: preset.label,
            meta,
            marke: preset.custom ? ' <span class="picker-marke">★ eigener Standard</span>' : '',
            laengen: bildeLaengenChips(
                getPresetLaengen(preset),
                l => `gruppeVorschlagUebernehmen('${id}', '${l}')`,
                `gruppeAddLeitung('${id}')`,
                preset.laenge
            )
        });
    };

    const filter = preset => (!kategorie || preset.kategorie === kategorie) && passtZurSuche(
        `${preset.label} ${preset.bezeichnung || ''} ${getPresetBeschreibung(preset)} ${preset.artikelnummer || ''}`,
        suche
    );

    const standard = vorgaben.standardLeitungen.filter(filter).map(presetEintrag);
    const weitere = vorgaben.weitereLeitungen.filter(filter).map(presetEintrag);

    const zuletzt = getZuletztVerwendeteLeitungen()
        .filter(l => !kategorie || l.kategorie === kategorie)
        .filter(l => passtZurSuche(
            `${l.bezeichnung || ''} ${getLeitungAusfuehrung(l)} ${l.artikelnummer || ''} ${l.artikelCustom || ''}`,
            suche
        ))
        .map(l => {
            const id = jsArg(l.id);
            const laenge = Number(l.laenge) || 0;
            return renderPickerEintrag({
                onclick: `gruppeAddLeitungWie('${id}', '')`,
                titel: l.bezeichnung || getLeitungAusfuehrung(l),
                meta: [getLeitungAusfuehrung(l), laenge ? `zuletzt ${formatLaenge(laenge)} m` : '', l.gruppe]
                    .filter(Boolean).join(' · '),
                laengen: bildeLaengenChips(
                    getLaengenFuerLeitung(l),
                    wert => `gruppeAddLeitungWie('${id}', '${wert}')`,
                    `gruppeAddLeitungWie('${id}', '', true)`,
                    laenge
                )
            });
        });

    // Eigene Zusammenstellung: für die gefilterte Kategorie bzw. passende Suchbegriffe.
    const zusammenstellen = getKategorien()
        .filter(k => kategorie
            ? k.id === kategorie
            : suche.length >= 2 && passtZurSuche(`${k.name} ${k.id}`, suche))
        .map(k => renderPickerEintrag({
            onclick: `gruppeAddLeitungMitKategorie('${jsArg(k.id)}')`,
            titel: `${k.icon || ''} ${k.name} selbst zusammenstellen`.trim(),
            meta: istMeterwareKategorie(k.id)
                ? 'Typ / Querschnitt und Länge wählen'
                : 'Stecker A, Stecker B und Länge wählen'
        }));

    const katalog = suche.length >= 2 || kategorie ? renderKatalogReihen(suche, kategorie) : [];

    const treffer = renderPickerSektion(`Standard in ${gk.aktiveGruppe}`, standard)
        + renderPickerSektion('Zuletzt im Projekt verwendet', zuletzt)
        + renderPickerSektion('Weitere übliche Leitungen', weitere)
        + renderPickerSektion('Selbst zusammenstellen', zusammenstellen)
        + renderPickerSektion('Aus dem Katalog', katalog);

    if (treffer) return treffer;

    return `<p class="picker-leer">Kein Treffer${suche ? ` für „${escapeHtml(suche)}“` : ''}.
            Lege die Leitung unten neu im Katalog an.</p>`;
}


/**
 * Artikel eines Bauteiltyps zur Auswahl – wenn ein Typ mehrere Varianten hat.
 * @param {string} typ
 * @param {string} suche
 * @returns {string}
 */
function renderPickerBauteilArtikel(typ, suche) {
    const name = getBauteilTypName(typ);
    const artikelliste = getArtikelAuswahlFuerGruppe(typ)
        .filter(a => passtZurSuche(
            `${a.artikelnummer} ${a.beschreibung || ''} ${a.hersteller || ''}`,
            suche
        ));

    const eintraege = artikelliste.map(artikel => renderPickerEintrag({
        onclick: `gruppeAddBauteilAusArtikel('${escapeHtml(artikel.artikelnummer)}')`,
        titel: artikel.beschreibung || artikel.artikelnummer,
        meta: `${artikel.artikelnummer}${artikel.hersteller ? ` · ${artikel.hersteller}` : ''}${preisSuffix(artikel.artikelnummer)}`
    }));

    const treffer = renderPickerSektion(`${name} – Artikel wählen`, eintraege);
    if (treffer) return treffer;

    return `<p class="picker-leer">Kein Artikel zu „${escapeHtml(name)}“ gefunden.
            Lege das Bauteil unten neu im Katalog an.</p>`;
}


/**
 * Trefferliste für Bauteile: erst die Typen der Gruppe, dann der Bauteilkatalog.
 * @param {string} suche
 * @returns {string}
 */
function renderPickerBauteile(suche) {
    if (gk.pickerState?.typFilter) {
        return renderPickerBauteilArtikel(gk.pickerState.typFilter, suche);
    }

    const vorgaben = getGruppenVorgaben(getGruppe(gk.aktiveGruppe));
    const erfasst = new Set(getBauteileDerGruppe(gk.aktiveGruppe).map(b => b.typ));

    const typEintrag = typ => {
        const name = getBauteilTypName(typ);
        const anzahl = getArtikelAuswahlFuerGruppe(typ).length;
        return renderPickerEintrag({
            onclick: `gruppePickerBauteilTyp('${escapeHtml(typ)}')`,
            titel: name,
            meta: [
                anzahl ? `${anzahl} Artikel im Katalog` : 'noch kein Katalogartikel',
                erfasst.has(typ) ? 'bereits erfasst' : ''
            ].filter(Boolean).join(' · ')
        });
    };

    const filter = typ => passtZurSuche(getBauteilTypName(typ), suche);
    const standard = vorgaben.standardBauteilTypen.filter(filter).map(typEintrag);
    const weitere = vorgaben.weitereBauteilTypen.filter(filter).map(typEintrag);

    const katalog = suche.length >= 2
        ? (appState.bauteileKatalog?.artikel || [])
            .filter(a => passtZurSuche(`${a.artikelnummer} ${a.beschreibung} ${a.hersteller}`, suche))
            .slice(0, 25)
            .map(artikel => renderPickerEintrag({
                onclick: `gruppeAddBauteilAusArtikel('${escapeHtml(artikel.artikelnummer)}')`,
                titel: artikel.beschreibung || artikel.artikelnummer,
                meta: `${artikel.artikelnummer} · ${artikel.hersteller || ''} · ${getBauteilTypName(artikel.typ)}${preisSuffix(artikel.artikelnummer)}`
            }))
        : [];

    const treffer = renderPickerSektion(`Standard in ${gk.aktiveGruppe}`, standard)
        + renderPickerSektion('Weitere Bauteiltypen', weitere)
        + renderPickerSektion('Aus dem Bauteilkatalog', katalog);

    if (treffer) return treffer;

    return `<p class="picker-leer">Kein Treffer für „${escapeHtml(suche)}“.
            Lege das Bauteil unten neu im Katalog an.</p>`;
}


/**
 * @returns {string}
 */
export function renderPickerErgebnisse() {
    if (!gk.pickerState) return '';
    const suche = gk.pickerState.suche.trim().toLowerCase();
    return gk.pickerState.art === 'bauteil'
        ? renderPickerBauteile(suche)
        : renderPickerLeitungen(suche);
}


/**
 * Overlay zur Auswahl einer Leitung bzw. eines Bauteils.
 * @returns {string}
 */
export function renderPicker() {
    // Leitungen werden über das Suchfeld über der Tabelle gewählt (siehe renderLeitungSuche).
    if (gk.pickerState?.art !== 'bauteil') return '';

    const typFilter = gk.pickerState.typFilter || '';
    const gruppe = getGruppe(gk.aktiveGruppe);
    const titel = typFilter ? `${getBauteilTypName(typFilter)} wählen` : 'Bauteil hinzufügen';
    const suchePlaceholder = typFilter
        ? 'Artikel suchen: Nummer, Bezeichnung…'
        : 'Bauteil suchen: Typ, Artikelnummer, Hersteller…';

    return `
        <div class="picker-overlay" onclick="gruppeClosePicker()">
            <div class="picker-dialog" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
                <div class="picker-kopf">
                    <h4>${escapeHtml(titel)}</h4>
                    <span class="picker-gruppe">${escapeHtml(gk.aktiveGruppe)} ${escapeHtml(gruppe?.bezeichnung || '')}</span>
                    <button type="button" class="picker-close" title="Schließen"
                            onclick="gruppeClosePicker()">✕</button>
                </div>
                ${typFilter ? `
                    <button type="button" class="picker-zurueck" onclick="gruppePickerZurueck()">
                        ← Alle Bauteiltypen
                    </button>
                ` : ''}
                <input type="search" id="picker-suche" class="picker-suche" autocomplete="off"
                       value="${escapeHtml(gk.pickerState.suche)}"
                       placeholder="${suchePlaceholder}"
                       oninput="gruppeOnPickerSuche(this.value)"
                       onkeydown="gruppeOnPickerTaste(event)">
                <div class="picker-ergebnisse" id="picker-ergebnisse"
                     onkeydown="gruppeOnPickerListeTaste(event)">${renderPickerErgebnisse()}</div>
                <div class="picker-fuss">
                    <button type="button" class="btn btn-secondary btn-small"
                            onclick="gruppeAddBauteil('')">Leeres Bauteil</button>
                    <button type="button" class="btn btn-primary btn-small"
                            onclick="gruppeOpenBauteilFormular('', '${jsArg(typFilter)}')">+ Neu im Katalog anlegen</button>
                </div>
            </div>
        </div>
    `;
}


/**
 * @param {string} art - 'leitung' oder 'bauteil'.
 * @returns {void}
 */
export function gruppeOpenPicker(art) {
    if (!assertCanEdit('Positionen hinzufügen')) return;
    if (art !== 'bauteil') {
        const input = document.getElementById('gk-suche-input');
        if (!input) return;
        input.focus();
        input.select();
        gruppeSucheOeffnen();
        return;
    }
    gk.pickerState = { art: 'bauteil', suche: '' };
    renderGruppenPanel();
    document.getElementById('picker-suche')?.focus();
}


/**
 * @returns {void}
 */
export function gruppeClosePicker() {
    if (!gk.pickerState) return;
    if (gk.pickerState.art === 'leitung') {
        // Die Suche steht fest über der Tabelle – nur die Trefferliste schließen.
        gk.pickerState = null;
        const input = document.getElementById('gk-suche-input');
        if (input) {
            input.value = '';
            input.blur();
        }
        aktualisiereLeitungDropdown();
        return;
    }
    gk.pickerState = null;
    renderGruppenPanel();
}


/**
 * Container der Trefferliste – Suchfeld über der Tabelle bzw. Bauteil-Dialog.
 * @returns {HTMLElement|null}
 */
function getPickerErgebnisse() {
    return document.getElementById(gk.pickerState?.art === 'leitung' ? 'gk-ergebnisse' : 'picker-ergebnisse');
}


/**
 * Bauteiltyp im Picker gewählt: bei einem Artikel direkt übernehmen,
 * bei mehreren die Artikelliste öffnen, sonst leeres Formular.
 * @param {string} typ
 * @returns {void}
 */
export function gruppePickerBauteilTyp(typ) {
    if (!assertCanEdit('Bauteile hinzufügen')) return;
    if (!gk.pickerState || gk.pickerState.art !== 'bauteil') {
        gruppeAddBauteil(typ);
        return;
    }

    const artikelliste = getArtikelAuswahlFuerGruppe(typ);
    if (artikelliste.length <= 1) {
        gruppeAddBauteil(typ);
        return;
    }

    gk.pickerState = { art: 'bauteil', suche: '', typFilter: typ };
    renderGruppenPanel();
    document.getElementById('picker-suche')?.focus();
}


/**
 * Aus der Artikelauswahl zurück zur Typenliste.
 * @returns {void}
 */
export function gruppePickerZurueck() {
    if (!gk.pickerState) return;
    gk.pickerState = { art: gk.pickerState.art, suche: '' };
    renderGruppenPanel();
    document.getElementById('picker-suche')?.focus();
}


/**
 * Zeichnet nur die Trefferliste neu, damit der Cursor im Suchfeld bleibt.
 * @param {string} wert
 * @returns {void}
 */
export function gruppeOnPickerSuche(wert) {
    if (!gk.pickerState) gruppeSucheOeffnen();
    if (!gk.pickerState) return;
    gk.pickerState.suche = wert;
    if (gk.pickerState.art === 'leitung') {
        aktualisiereLeitungDropdown();
        return;
    }
    const container = getPickerErgebnisse();
    if (container) container.innerHTML = renderPickerErgebnisse();
}


/**
 * Enter übernimmt den ersten Treffer, Escape schließt bzw. geht eine Ebene zurück.
 * @param {KeyboardEvent} event
 * @returns {void}
 */
export function gruppeOnPickerTaste(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        if (gk.pickerState?.typFilter) {
            gruppePickerZurueck();
            return;
        }
        gruppeClosePicker();
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        getPickerErgebnisse()?.querySelector('.picker-eintrag')?.click();
        return;
    }
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        getPickerErgebnisse()?.querySelector('.picker-eintrag')?.focus();
    }
}


/**
 * Pfeiltasten in der Trefferliste: hoch/runter zwischen den Einträgen,
 * links/rechts zu den Längen-Chips. Ganz oben geht es zurück ins Suchfeld.
 * @param {KeyboardEvent} event
 * @returns {void}
 */
export function gruppeOnPickerListeTaste(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        gruppeClosePicker();
        return;
    }

    const container = event.currentTarget;
    if (!container || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const zeile = event.target.closest('.picker-zeile');
        if (!zeile) return;
        const knoepfe = Array.from(zeile.querySelectorAll('button'));
        const index = knoepfe.indexOf(event.target);
        knoepfe[index + (event.key === 'ArrowRight' ? 1 : -1)]?.focus();
        return;
    }

    const eintraege = Array.from(container.querySelectorAll('.picker-eintrag'));
    const aktuell = event.target.closest('.picker-zeile')?.querySelector('.picker-eintrag') || event.target;
    const index = eintraege.indexOf(aktuell);
    const ziel = eintraege[index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (ziel) ziel.focus();
    else if (event.key === 'ArrowUp') {
        document.getElementById(gk.pickerState?.art === 'leitung' ? 'gk-suche-input' : 'picker-suche')?.focus();
    }
}


/**
 * Filtert das Auswahlfenster auf eine Leitungskategorie (erneuter Klick hebt auf).
 * @param {string} kategorie
 * @returns {void}
 */
export function gruppePickerKategorie(kategorie) {
    if (!gk.pickerState || gk.pickerState.art !== 'leitung') return;
    gk.pickerState.kategorie = gk.pickerState.kategorie === kategorie ? '' : kategorie;
    aktualisiereLeitungDropdown();
    const ergebnisse = document.getElementById('gk-ergebnisse');
    if (ergebnisse) ergebnisse.scrollTop = 0;
    document.getElementById('gk-suche-input')?.focus();
}
