/**
 * @file gk-bauteile.js – Bauteile der Gruppe: Liste, Karten, Editor und Formular für neue Bauteile.
 */
import { appState } from './state.js';
import {
    escapeHtml,
    escapeAttr,
    jsArg,
    formatLaenge,
    generateId
} from './utils.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit } from './project-access.js';
import { getBauteilTypName, getBauteileFuerGruppenAuswahl, bauteilPasstZuGruppe } from './catalog.js';
import { getGruppenVorgaben } from './gruppen-config.js';
import { addBauteilZumKatalog, bauteilnummerVergeben, bildePlatzhalterNummer } from './katalog-additions.js';
import { showModal } from './modal.js';
import { hinterlegePreis } from './preise.js';
import { getPositionsBeschaffung } from './stueckliste.js';
import {
    gk,
    findBauteil,
    getBauteileDerGruppe,
    getGruppe,
    istSchreibgeschuetzt,
    optionen,
    renderAnzahlStepper
} from './gk-state.js';
import { renderGruppenListe, renderGruppenPanel, renderGruppenRahmen } from './gk-gruppen.js';
import { gruppeBauteilVorschlagUebernehmen } from './gk-vorschlaege.js';
import { preisSuffix, renderPreisKurz } from './gk-picker.js';
import {
    ersetzeKarte,
    passeKommentarHoeheAn,
    renderChip,
    renderStandFelder,
    renderStandKommentar,
    renderStandSelect
} from './gk-leitungen.js';


/**
 * Formular für ein Bauteil, das es noch nicht im Katalog gibt.
 * @returns {string}
 */
export function renderNeuesBauteilFormular() {
    if (!gk.neuesBauteilFormular) return '';

    const typen = appState.bauteileKatalog?.bauteiltypen || [];
    const hersteller = Array.from(new Set(
        (appState.bauteileKatalog?.artikel || []).map(a => a.hersteller).filter(Boolean)
    )).sort((x, y) => x.localeCompare(y, 'de'));
    const zielBauteil = gk.neuesBauteilFormular.bauteilId ? findBauteil(gk.neuesBauteilFormular.bauteilId) : null;
    const vorauswahlTyp = gk.neuesBauteilFormular.typ || '';

    return renderEditorOverlay({
        onClose: 'gruppeCancelBauteilFormular()',
        inhalt: `
        <div class="gruppen-karte bauteil-neu-formular">
            <h5>Neues Bauteil anlegen</h5>
            <p class="text-muted">
                Das Bauteil wird in den Katalog übernommen und steht danach in jedem Projekt zur Verfügung.
                ${zielBauteil ? 'Es wird direkt der bearbeiteten Position zugeordnet.' : ''}
                ${vorauswahlTyp && !zielBauteil ? ` Typ „${escapeHtml(getBauteilTypName(vorauswahlTyp))}" ist noch nicht im Katalog – bitte Artikeldaten ergänzen.` : ''}
            </p>

            <div class="gruppen-karte-grid">
                <div class="form-group">
                    <label for="neu-bauteil-typ">Bauteiltyp *</label>
                    <select id="neu-bauteil-typ" onchange="gruppeOnNeuBauteilTypChange(this.value)">
                        ${optionen([
                            { value: '', label: '-- Bitte wählen --' },
                            ...typen.map(t => ({ value: t.id, label: t.name })),
                            { value: '__neu__', label: '➕ Neuer Bauteiltyp…' }
                        ], gk.neuesBauteilFormular.typ)}
                    </select>
                </div>
                <div class="form-group" id="neu-bauteil-typ-neu-group" hidden>
                    <label for="neu-bauteil-typ-neu">Name des neuen Typs *</label>
                    <input type="text" id="neu-bauteil-typ-neu" placeholder="z. B. Sicherheitsrelais">
                </div>
                <div class="form-group">
                    <label for="neu-bauteil-hersteller">Hersteller *</label>
                    <input type="text" id="neu-bauteil-hersteller" list="neu-bauteil-hersteller-liste" placeholder="z. B. Pilz">
                    <datalist id="neu-bauteil-hersteller-liste">
                        ${hersteller.map(h => `<option value="${escapeHtml(h)}"></option>`).join('')}
                    </datalist>
                </div>
                <div class="form-group">
                    <label for="neu-bauteil-artikelnummer">Artikelnummer</label>
                    <input type="text" id="neu-bauteil-artikelnummer" placeholder="Leer lassen, wenn noch unbekannt">
                </div>
                <div class="form-group gruppen-karte-breit">
                    <label for="neu-bauteil-beschreibung">Bezeichnung *</label>
                    <input type="text" id="neu-bauteil-beschreibung" placeholder="z. B. Sicherheitsrelais PNOZ s3">
                </div>
                <div class="form-group">
                    <label for="neu-bauteil-lieferant">Lieferant</label>
                    <input type="text" id="neu-bauteil-lieferant" placeholder="optional">
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="gruppeCancelBauteilFormular()">Abbrechen</button>
                <button type="button" class="btn btn-primary" onclick="gruppeSaveNeuesBauteil()">In Katalog speichern &amp; übernehmen</button>
            </div>
        </div>
    `
    });
}


/**
 * Öffnet das Anlageformular, optional für eine bestehende Position.
 * @param {string} bauteilId
 * @param {string} typ
 * @returns {void}
 */
export function gruppeOpenBauteilFormular(bauteilId, typ) {
    if (!assertCanEdit('Bauteile anlegen')) return;
    gk.neuesBauteilFormular = { bauteilId: bauteilId || '', typ: typ || '' };
    gk.neuesLeitungFormular = null;
    gk.pickerState = null;
    renderGruppenPanel();

    const select = document.getElementById('neu-bauteil-typ');
    gruppeOnNeuBauteilTypChange(select?.value || '');
    document.getElementById('neu-bauteil-beschreibung')?.focus();
}


/**
 * @returns {void}
 */
export function gruppeCancelBauteilFormular() {
    gk.neuesBauteilFormular = null;
    renderGruppenPanel();
}


/**
 * Blendet das Feld für einen neuen Bauteiltyp ein.
 * @param {string} wert
 * @returns {void}
 */
export function gruppeOnNeuBauteilTypChange(wert) {
    const gruppe = document.getElementById('neu-bauteil-typ-neu-group');
    if (gruppe) gruppe.hidden = wert !== '__neu__';
    if (wert === '__neu__') document.getElementById('neu-bauteil-typ-neu')?.focus();
}


/**
 * Legt das Bauteil im Katalog an und übernimmt es in die aktuelle Gruppe.
 * @returns {Promise<void>}
 */
export async function gruppeSaveNeuesBauteil() {
    if (!gk.neuesBauteilFormular || !assertCanEdit('Bauteile anlegen')) return;

    const typAuswahl = document.getElementById('neu-bauteil-typ')?.value || '';
    const typName = document.getElementById('neu-bauteil-typ-neu')?.value?.trim() || '';
    const hersteller = document.getElementById('neu-bauteil-hersteller')?.value?.trim() || '';
    const beschreibung = document.getElementById('neu-bauteil-beschreibung')?.value?.trim() || '';
    const lieferant = document.getElementById('neu-bauteil-lieferant')?.value?.trim() || '';
    let artikelnummer = document.getElementById('neu-bauteil-artikelnummer')?.value?.trim() || '';

    const typ = typAuswahl === '__neu__' ? typName.toLowerCase().replace(/\s+/g, '-') : typAuswahl;
    if (!typ || !hersteller || !beschreibung) {
        showModal('Bitte Bauteiltyp, Hersteller und Bezeichnung ausfüllen.', {
            type: 'warning',
            title: 'Eingabe unvollständig'
        });
        return;
    }

    const istPlatzhalter = !artikelnummer;
    if (istPlatzhalter) {
        artikelnummer = bildePlatzhalterNummer(typ, beschreibung);
    } else if (bauteilnummerVergeben(artikelnummer)) {
        showModal(`Artikelnummer ${artikelnummer} ist bereits im Katalog.`, {
            type: 'warning',
            title: 'Bereits vorhanden'
        });
        return;
    }

    const artikel = {
        hersteller,
        artikelnummer,
        beschreibung,
        typ,
        typName: typAuswahl === '__neu__' ? typName : undefined,
        gruppe: gk.aktiveGruppe.replace('=', ''),
        custom: true
    };
    if (lieferant) artikel.lieferant = lieferant;
    if (istPlatzhalter) artikel.placeholder = true;
    if (!artikel.typName) delete artikel.typName;

    try {
        await addBauteilZumKatalog(artikel);
    } catch (error) {
        showModal(`Speichern im Katalog fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
        return;
    }

    const zielBauteil = gk.neuesBauteilFormular.bauteilId ? findBauteil(gk.neuesBauteilFormular.bauteilId) : null;
    if (zielBauteil) {
        zielBauteil.typ = typ;
        zielBauteil.hersteller = hersteller;
        zielBauteil.artikelnummer = artikelnummer;
        zielBauteil.bezeichnung = beschreibung;
        gk.aktivesBauteilId = zielBauteil.id;
    } else {
        const bauteil = {
            id: generateId('btl'),
            gruppe: gk.aktiveGruppe,
            typ,
            hersteller,
            artikelnummer,
            bezeichnung: beschreibung,
            notiz: '',
            anzahl: 1
        };
        appState.currentProjekt.bauteile.push(bauteil);
        gk.aktivesBauteilId = bauteil.id;
    }

    gk.neuesBauteilFormular = null;
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();

    showModal(
        istPlatzhalter
            ? `${beschreibung} wurde mit der Platzhalter-Nummer ${artikelnummer} im Katalog angelegt.`
            : `${beschreibung} (${artikelnummer}) wurde im Katalog angelegt.`,
        { type: 'success', title: 'Bauteil gespeichert' }
    );
}


/**
 * Kurzbezeichnung eines Bauteils für Listen und Dialoge.
 * @param {object} bauteil
 * @returns {string}
 */
export function getBauteilLabel(bauteil) {
    const basis = bauteil.bezeichnung
        || bauteil.artikelnummer
        || getBauteilTypName(bauteil.typ)
        || 'Bauteil';
    if (bauteil.laenge) {
        return `${basis} (${formatLaenge(bauteil.laenge)} m)`;
    }
    return basis;
}


/**
 * Bauteile der Gruppe als schlichte Liste (rechte Spalte); ein Klick öffnet das Bauteil.
 * Darunter die offenen Standardbauteile – mit Längen-Chips, falls die Gruppe welche vorgibt.
 * @param {object[]} bauteile
 * @param {string[]} [vorschlaege]
 * @returns {string}
 */
export function renderBauteilListe(bauteile, vorschlaege = []) {
    if (!bauteile.length && !vorschlaege.length) {
        return '<p class="gk-leer-klein">Noch keine Bauteile.</p>';
    }

    const laengen = getGruppenVorgaben(getGruppe(gk.aktiveGruppe)).bauteilLaengen || [];
    const gesperrt = istSchreibgeschuetzt();
    const erfasst = bauteile.map(bauteil => {
        const stand = getPositionsBeschaffung('bauteile', bauteil);
        return `
        <li class="gk-bauteil-zeile">
            <button type="button" class="gk-bauteil${bauteil.artikelnummer ? '' : ' unvollstaendig'}${bauteil.id === gk.aktivesBauteilId ? ' aktiv' : ''}"
                    title="${escapeAttr([getBauteilTypName(bauteil.typ), bauteil.artikelnummer || 'Artikel offen'].filter(Boolean).join(' · '))}"
                    onclick="gruppeEditBauteil('${jsArg(bauteil.id)}')">
                <span class="gk-bauteil-text">
                    <span>${escapeHtml(getBauteilLabel(bauteil))}</span>
                    ${renderPreisKurz(bauteil.artikelnummer)}
                </span>
                <span class="gk-bauteil-anzahl">${Math.max(1, Number(bauteil.anzahl) || 1)}×</span>
            </button>
            ${renderStandSelect('bauteile', bauteil.id, stand.status, gesperrt)}
            ${renderStandKommentar('bauteile', bauteil.id, stand.kommentar, gesperrt)}
        </li>
    `;
    }).join('');

    const offen = vorschlaege.map(typ => {
        const id = jsArg(typ);
        const chips = laengen.map(l => renderChip({
            label: `${formatLaenge(l)} m`,
            onclick: `gruppeBauteilVorschlagUebernehmen('${id}', '${l}')`,
            klasse: 'chip-klein chip-laenge'
        })).join('');
        return `
            <li class="gk-bauteil-vorschlag">
                <button type="button" onclick="gruppeBauteilVorschlagUebernehmen('${id}', '')">+ ${escapeHtml(getBauteilTypName(typ))}</button>
                ${chips}
                <button type="button" class="gk-vorschlag-weg" title="Vorschlag in diesem Projekt ausblenden"
                        aria-label="Vorschlag ausblenden" onclick="toggleBauteilTypSchnellwahl('${id}', false)">×</button>
            </li>
        `;
    }).join('');

    return `<ul class="gk-bauteile">${erfasst}${offen}</ul>`;
}


/**
 * Bauteile stehen in der rechten Spalte – die wird samt Kennzahlen neu gezeichnet.
 * @returns {void}
 */
export function aktualisiereBauteilTabelle() {
    renderGruppenRahmen();
    passeKommentarHoeheAn(document.getElementById('gk-rechts'));
}


/**
 * Zentriertes Bearbeitungsfenster über dem abgedunkelten Hintergrund.
 * Klick neben dem Dialog schließt ihn.
 * @param {{onClose: string, inhalt: string}} options
 * @returns {string}
 */
export function renderEditorOverlay({ onClose, inhalt }) {
    if (!inhalt) return '';
    return `
        <div class="editor-overlay" onclick="${onClose}">
            <div class="editor-dialog" role="dialog" aria-modal="true"
                 onclick="event.stopPropagation()">
                ${inhalt}
            </div>
        </div>
    `;
}


/**
 * Formular für das gerade ausgewählte Bauteil. Es ist immer nur eines geöffnet.
 * @returns {string}
 */
export function renderBauteilEditor() {
    if (gk.neuesBauteilFormular || gk.neuesLeitungFormular || gk.pickerState) return '';
    const bauteil = gk.aktivesBauteilId ? findBauteil(gk.aktivesBauteilId) : null;
    if (!bauteil || bauteil.gruppe !== gk.aktiveGruppe) return '';
    return renderEditorOverlay({
        onClose: 'gruppeCloseBauteilEditor()',
        inhalt: renderBauteilKarte(bauteil)
    });
}


/**
 * Springt zum Bauteilformular und setzt den Fokus.
 * @returns {void}
 */
function fokussiereBauteilEditor() {
    const karte = document.getElementById(`bauteil-karte-${gk.aktivesBauteilId}`);
    if (!karte) return;

    karte.classList.add('gerade-angelegt');
    karte.querySelector('select, input')?.focus({ preventScroll: true });
}


/**
 * Öffnet ein bestehendes Bauteil im Formular.
 * @param {string} id
 * @returns {void}
 */
export function gruppeEditBauteil(id) {
    if (!findBauteil(id)) return;
    gk.aktiveLeitungId = '';
    gk.neuesBauteilFormular = null;
    gk.neuesLeitungFormular = null;
    gk.pickerState = null;
    gk.aktivesBauteilId = id;
    renderGruppenPanel();
    fokussiereBauteilEditor();
}


/**
 * Schließt das Bauteilformular, das Bauteil bleibt in der Übersicht.
 * @returns {void}
 */
export function gruppeCloseBauteilEditor() {
    gk.aktivesBauteilId = '';
    renderGruppenPanel();
}


/**
 * @param {object} bauteil
 * @returns {string}
 */
export function renderBauteilKarte(bauteil) {
    const gesperrt = istSchreibgeschuetzt();
    const disabled = gesperrt ? ' disabled' : '';
    const vorgaben = getGruppenVorgaben(getGruppe(bauteil.gruppe));
    const laengen = vorgaben.bauteilLaengen || [];

    if (laengen.length) {
        return renderBauteilKarteMitLaenge(bauteil, laengen, disabled, gesperrt);
    }

    const typen = getTypenFuerGruppe(gk.aktiveGruppe);
    const artikelliste = bauteil.typ
        ? getArtikelAuswahlFuerGruppe(bauteil.typ, bauteil.artikelnummer)
        : [];

    const artikelOptionen = [
        { value: '', label: artikelliste.length ? '-- Bitte wählen --' : '-- Kein Katalogartikel --' },
        ...artikelliste.map(a => ({
            value: a.artikelnummer,
            label: `${a.beschreibung}${a.hersteller ? ` (${a.hersteller})` : ''}${preisSuffix(a.artikelnummer)}${a.projektOnly ? ' · im Projekt' : ''}`
        })),
        { value: '__neu__', label: '➕ Bauteil neu anlegen…' }
    ];

    const nummer = getBauteileDerGruppe(bauteil.gruppe).findIndex(b => b.id === bauteil.id) + 1;

    return `
        <div class="gruppen-karte bauteil-karte" id="bauteil-karte-${escapeHtml(bauteil.id)}">
            <div class="gruppen-karte-kopf">
                <strong class="gruppen-karte-titel">Bauteil ${nummer} bearbeiten</strong>
            </div>
            <div class="gruppen-karte-grid">
                <div class="form-group">
                    <label>Bauteiltyp</label>
                    <select${disabled} onchange="gruppeUpdateBauteil('${jsArg(bauteil.id)}', 'typ', this.value)">
                        ${optionen([{ value: '', label: '-- Bitte wählen --' },
                            ...typen.map(t => ({ value: t.id, label: t.name }))], bauteil.typ)}
                    </select>
                </div>
                <div class="form-group gruppen-karte-breit">
                    <label>Artikel</label>
                    <select${disabled} onchange="gruppeUpdateBauteil('${jsArg(bauteil.id)}', 'artikelnummer', this.value)">
                        ${optionen(artikelOptionen, bauteil.artikelnummer)}
                    </select>
                </div>
                <div class="form-group gruppen-karte-anzahl">
                    <label>Anzahl</label>
                    ${renderAnzahlStepper('bauteil', bauteil.id, bauteil.anzahl, gesperrt)}
                </div>
            </div>
            <div class="form-group">
                <label>Verwendung / Kommentar</label>
                <input type="text" value="${escapeHtml(bauteil.notiz || '')}" placeholder="z. B. Bedienpult links"${disabled}
                       oninput="gruppeUpdateBauteilText('${jsArg(bauteil.id)}', 'notiz', this.value)">
            </div>
            ${renderStandFelder('bauteile', bauteil, gesperrt)}
            ${bauteil.artikelnummer ? `<p class="gruppen-karte-artikel">${escapeHtml(bauteil.bezeichnung || '')}
                <strong>${escapeHtml(bauteil.artikelnummer)}</strong>${renderPreisKurz(bauteil.artikelnummer)}</p>` : ''}
            <div class="leitung-karte-aktionen leitung-karte-aktionen-unten">
                ${gesperrt ? '' : `<button type="button" class="btn btn-danger"
                    onclick="gruppeDeleteBauteil('${jsArg(bauteil.id)}')">Entfernen</button>`}
                <button type="button" class="btn btn-primary" title="Bearbeitung beenden"
                        onclick="gruppeCloseBauteilEditor()">Fertig</button>
            </div>
        </div>
    `;
}


/**
 * Vereinfachte Bauteil-Karte mit fester Artikelwahl und Längenauswahl (z. B. DMS).
 * @param {object} bauteil
 * @param {number[]} laengen
 * @param {string} disabled
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderBauteilKarteMitLaenge(bauteil, laengen, disabled, gesperrt) {
    const id = escapeHtml(bauteil.id);
    const nummer = getBauteileDerGruppe(bauteil.gruppe).findIndex(b => b.id === bauteil.id) + 1;
    const typName = getBauteilTypName(bauteil.typ);
    const artikelLabel = bauteil.bezeichnung
        ? `${bauteil.bezeichnung} (${bauteil.artikelnummer || ''})`
        : (bauteil.artikelnummer || typName);

    return `
        <div class="gruppen-karte bauteil-karte" id="bauteil-karte-${id}">
            <div class="gruppen-karte-kopf">
                <strong class="gruppen-karte-titel">Bauteil ${nummer} bearbeiten</strong>
            </div>
            <div class="gruppen-karte-grid">
                <div class="form-group gruppen-karte-breit">
                    <label>Bauteil</label>
                    <p class="gruppen-preset-info text-muted">${escapeHtml(typName)} · ${escapeHtml(artikelLabel)}${renderPreisKurz(bauteil.artikelnummer)}</p>
                </div>
                <div class="form-group">
                    <label>Länge</label>
                    <select${disabled} onchange="gruppeUpdateBauteil('${id}', 'laenge', this.value)">
                        ${optionen(laengen.map(l => ({ value: l, label: `${formatLaenge(l)} m` })), bauteil.laenge || '')}
                    </select>
                </div>
                <div class="form-group gruppen-karte-anzahl">
                    <label>Anzahl</label>
                    ${renderAnzahlStepper('bauteil', bauteil.id, bauteil.anzahl, gesperrt)}
                </div>
            </div>
            <div class="form-group">
                <label>Verwendung / Kommentar</label>
                <input type="text" value="${escapeHtml(bauteil.notiz || '')}" placeholder="z. B. Kraftsensor Stößel"${disabled}
                       oninput="gruppeUpdateBauteilText('${id}', 'notiz', this.value)">
            </div>
            ${renderStandFelder('bauteile', bauteil, gesperrt)}
            <div class="leitung-karte-aktionen leitung-karte-aktionen-unten">
                ${gesperrt ? '' : `<button type="button" class="btn btn-danger"
                    onclick="gruppeDeleteBauteil('${id}')">Entfernen</button>`}
                <button type="button" class="btn btn-primary" title="Bearbeitung beenden"
                        onclick="gruppeCloseBauteilEditor()">Fertig</button>
            </div>
        </div>
    `;
}


function getProjektBauteile() {
    return appState.currentProjekt?.bauteile || [];
}


/**
 * Optionen für die Artikelauswahl im Gruppen-Konfigurator.
 * @param {string} typ
 * @param {string} [aktuelleArtikelnummer]
 * @returns {object[]}
 */
export function getArtikelAuswahlFuerGruppe(typ, aktuelleArtikelnummer = '') {
    return getBauteileFuerGruppenAuswahl(typ, gk.aktiveGruppe, {
        projektBauteile: getProjektBauteile(),
        aktuelleArtikelnummer
    });
}


/**
 * Bauteiltypen, die für eine Gruppe im Katalog hinterlegt sind.
 * @param {string} gruppeCode
 * @returns {{ id: string, name: string }[]}
 */
function getTypenFuerGruppe(gruppeCode) {
    const vorgaben = getGruppenVorgaben(getGruppe(gruppeCode));
    const ids = new Set(vorgaben.bauteilTypen || []);
    (appState.bauteileKatalog?.artikel || []).forEach(artikel => {
        if (artikel.typ && bauteilPasstZuGruppe(artikel, gruppeCode)) {
            ids.add(artikel.typ);
        }
    });
    getProjektBauteile().forEach(b => {
        if (b.typ && b.gruppe === gruppeCode) ids.add(b.typ);
    });

    const alleTypen = appState.bauteileKatalog?.bauteiltypen || [];
    return Array.from(ids)
        .map(id => alleTypen.find(t => t.id === id) || { id, name: getBauteilTypName(id) })
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}


/**
 * @param {string} typ
 * @param {{laenge?: number, direkt?: boolean}} [options] - `direkt` übernimmt ohne Formular.
 * @returns {void}
 */
export function gruppeAddBauteil(typ, options = {}) {
    if (!assertCanEdit('Bauteile hinzufügen')) return;
    if (!appState.currentProjekt.bauteile) appState.currentProjekt.bauteile = [];
    gk.pickerState = null;

    if (typ) {
        const artikelListe = getArtikelAuswahlFuerGruppe(typ);
        if (!artikelListe.length) {
            const bauteil = {
                id: generateId('btl'),
                gruppe: gk.aktiveGruppe,
                typ,
                hersteller: '',
                artikelnummer: '',
                bezeichnung: '',
                notiz: '',
                anzahl: 1
            };
            appState.currentProjekt.bauteile.push(bauteil);
            persistCurrentProjekt();
            gruppeOpenBauteilFormular(bauteil.id, typ);
            return;
        }
    }

    const artikel = typ ? getArtikelAuswahlFuerGruppe(typ)[0] : null;
    const vorgaben = getGruppenVorgaben(getGruppe(gk.aktiveGruppe));
    const standardLaenge = vorgaben.bauteilStandardLaenge
        ?? vorgaben.bauteilLaengen?.[0]
        ?? undefined;

    const bauteil = {
        id: generateId('btl'),
        gruppe: gk.aktiveGruppe,
        typ: typ || '',
        hersteller: artikel?.hersteller || '',
        artikelnummer: artikel?.artikelnummer || '',
        bezeichnung: artikel?.beschreibung || '',
        notiz: '',
        anzahl: 1
    };
    const laenge = options.laenge ?? standardLaenge;
    if (laenge != null && !Number.isNaN(laenge)) {
        bauteil.laenge = laenge;
    }
    appState.currentProjekt.bauteile.push(bauteil);
    persistCurrentProjekt();

    if (options.direkt) {
        renderGruppenListe();
        renderGruppenPanel();
        return;
    }

    gk.aktivesBauteilId = bauteil.id;
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereBauteilEditor();
}


/**
 * Übernimmt ein Bauteil direkt aus dem Katalog in die aktive Gruppe.
 * @param {string} artikelnummer
 * @returns {Promise<void>}
 */
export async function gruppeAddBauteilAusArtikel(artikelnummer) {
    if (!assertCanEdit('Bauteile hinzufügen')) return;

    const artikel = (appState.bauteileKatalog?.artikel || [])
        .find(a => a.artikelnummer === artikelnummer);
    if (!artikel) return;

    gk.pickerState = null;
    if (!appState.currentProjekt.bauteile) appState.currentProjekt.bauteile = [];

    const bauteil = {
        id: generateId('btl'),
        gruppe: gk.aktiveGruppe,
        typ: artikel.typ || '',
        hersteller: artikel.hersteller || '',
        artikelnummer: artikel.artikelnummer,
        bezeichnung: artikel.beschreibung || '',
        notiz: '',
        anzahl: 1
    };
    hinterlegePreis(bauteil, bauteil.artikelnummer);
    appState.currentProjekt.bauteile.push(bauteil);

    persistCurrentProjekt();
    gk.aktivesBauteilId = bauteil.id;
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereBauteilEditor();
}


/**
 * Ändert ein Auswahlfeld eines Bauteils und zeichnet die Karte neu.
 * @param {string} id
 * @param {string} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeUpdateBauteil(id, feld, wert) {
    const bauteil = findBauteil(id);
    if (!bauteil || istSchreibgeschuetzt()) return;

    if (feld === 'artikelnummer' && wert === '__neu__') {
        gruppeOpenBauteilFormular(id, bauteil.typ);
        return;
    }

    if (feld === 'typ') {
        bauteil.typ = wert;
        const artikelListe = getArtikelAuswahlFuerGruppe(wert);
        if (wert && !artikelListe.length) {
            persistCurrentProjekt();
            gruppeOpenBauteilFormular(id, wert);
            return;
        }
        const artikel = artikelListe[0] || null;
        bauteil.artikelnummer = artikel?.artikelnummer || '';
        bauteil.hersteller = artikel?.hersteller || '';
        bauteil.bezeichnung = artikel?.beschreibung || '';
        hinterlegePreis(bauteil, bauteil.artikelnummer);
    } else if (feld === 'artikelnummer') {
        const artikel = getArtikelAuswahlFuerGruppe(bauteil.typ, bauteil.artikelnummer)
            .find(a => a.artikelnummer === wert) || null;
        bauteil.artikelnummer = wert;
        bauteil.hersteller = artikel?.hersteller || bauteil.hersteller;
        bauteil.bezeichnung = artikel?.beschreibung || bauteil.bezeichnung;
        hinterlegePreis(bauteil, bauteil.artikelnummer);
    } else if (feld === 'anzahl') {
        const anzahl = parseInt(wert, 10);
        bauteil.anzahl = Number.isNaN(anzahl) || anzahl < 1 ? 1 : anzahl;
    } else if (feld === 'laenge') {
        bauteil.laenge = parseFloat(String(wert).replace(',', '.')) || 0;
    }

    persistCurrentProjekt();
    ersetzeKarte(`bauteil-karte-${id}`, renderBauteilKarte(bauteil));
    aktualisiereBauteilTabelle();
}


/**
 * Übernimmt Texteingaben, ohne die Karte neu zu zeichnen.
 * @param {string} id
 * @param {string} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeUpdateBauteilText(id, feld, wert) {
    const bauteil = findBauteil(id);
    if (!bauteil || istSchreibgeschuetzt()) return;
    bauteil[feld] = wert;
    persistCurrentProjekt();
    aktualisiereBauteilTabelle();
}


/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function gruppeDeleteBauteil(id) {
    if (!assertCanEdit('Bauteile löschen')) return;
    const liste = appState.currentProjekt?.bauteile || [];
    const bauteil = liste.find(b => b.id === id);
    if (!bauteil) return;

    const label = getBauteilLabel(bauteil);
    const confirmed = await showModal(
        `${label} wirklich aus der Gruppe entfernen?`,
        { type: 'warning', title: 'Bauteil entfernen', confirmText: 'Entfernen', cancelText: 'Abbrechen', showCancel: true }
    );
    if (!confirmed) return;

    const index = liste.findIndex(b => b.id === id);
    if (index === -1) return;

    liste.splice(index, 1);
    if (gk.aktivesBauteilId === id) gk.aktivesBauteilId = '';
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();
}


/* -------------------------------------------------------------------------- */
/* Leitungen                                                                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Auswahldialog für Leitungen und Bauteile                                    */
/* -------------------------------------------------------------------------- */
