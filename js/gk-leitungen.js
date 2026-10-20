/**
 * @file gk-leitungen.js – Leitungen der Gruppe: Tabelle, Karten, Editor, Stecker und Längen.
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
import { getArtikelByNummer } from './catalog.js';
import { getBaseSteckerTyp, getFullSteckerTyp, hasAusrichtung } from './stecker-utils.js';
import {
    findArtikel,
    deriveArtikelPrefix,
    formatSteckerKurz,
    getHerstellerFuerKategorie,
    getKategorien,
    getLaengenOptionen,
    getMeterwareArtikel,
    getPassendeArtikel,
    getSteckerAOptionen,
    istMeterwareKategorie
} from './leitung-optionen.js';
import { getLeitungPreset } from './gruppen-config.js';
import { showModal } from './modal.js';
import { syncTopologieLeitungen, uebernehmeLeitungInTopologie } from './topologie-sync.js';
import { hinterlegePreis } from './preise.js';
import { beschaffungStatusOptionen, getPositionsBeschaffung, getStuecklisteStatusInfo } from './stueckliste.js';
import {
    gk,
    findLeitung,
    getGruppe,
    getLeitungenDerGruppe,
    istSchreibgeschuetzt,
    optionen,
    renderAnzahlStepper,
    renumberLeitungen
} from './gk-state.js';
import { renderGruppenListe, renderGruppenPanel, renderGruppenRahmen } from './gk-gruppen.js';
import { getLeitungAusfuehrung, renderLeitungVorschlaege } from './gk-vorschlaege.js';
import { gruppeCancelBauteilFormular, gruppeCloseBauteilEditor, renderEditorOverlay } from './gk-bauteile.js';
import { ohneLaengenangabe, renderPreisKurz } from './gk-picker.js';
import { gruppeCancelLeitungFormular, gruppeOpenLeitungFormular } from './gk-leitung-formular.js';
import {
    anzeigeWegSumme,
    formatWegFormel,
    gruppeCloseWegeDialog,
    hatWeg,
    parseMeter,
    renderWeg,
    summeWegVorlage,
    wegschritte,
    wegVorlagenDerLeitung
} from './gk-wege.js';


/**
 * Längenzelle einer erfassten Leitung – immer direkt in der Liste änderbar.
 * @param {object} leitung
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderLaengeZelle(leitung, gesperrt) {
    if (hatWeg(leitung)) {
        const schritte = wegschritte(leitung).filter(schritt => (schritt.name || '').trim() || Number(schritt.meter) > 0);
        const vorlagen = wegVorlagenDerLeitung(leitung);
        const summe = anzeigeWegSumme(leitung);
        return `
            <div class="gk-weg-kurz" title="Weg im Bearbeitungsfenster ändern">
                <strong>${summe ? `${formatLaenge(summe)} m` : '–'}</strong>
                <ol>
                    ${vorlagen.map(vorlage => `
                        <li>${escapeHtml(vorlage.name)}
                            <span>${formatLaenge(summeWegVorlage(vorlage))} m</span>
                            ${formatWegFormel(vorlage.schritte) ? `<small>${escapeHtml(formatWegFormel(vorlage.schritte))}</small>` : ''}
                        </li>
                    `).join('')}
                    ${schritte.map(schritt => `
                        <li>${escapeHtml((schritt.name || '').trim() || 'Abschnitt')}
                            <span>${Number(schritt.meter) > 0 ? `${formatLaenge(schritt.meter)} m` : ''}</span>
                        </li>
                    `).join('')}
                </ol>
            </div>
        `;
    }

    if (gesperrt) {
        return leitung.laenge ? `${formatLaenge(leitung.laenge)} m` : '–';
    }

    const id = escapeHtml(leitung.id);
    const meterware = istMeterwareKategorie(leitung.kategorie);
    const laengen = meterware
        ? []
        : getLaengenOptionen(
            leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, leitung.artikelPrefix
        );
    const freieEingabe = meterware
        || !laengen.length
        || (leitung.laenge > 0 && !laengen.includes(Number(leitung.laenge)) && !laengen.includes(leitung.laenge));

    if (freieEingabe) {
        return `
            <span class="laenge-zelle" onclick="event.stopPropagation()" ondblclick="event.stopPropagation()">
                <input type="text" inputmode="decimal" class="laenge-zelle-input"
                       value="${leitung.laenge ? formatLaenge(leitung.laenge) : ''}" placeholder="m" aria-label="Länge in Metern"
                       onchange="event.stopPropagation(); gruppeUpdateLeitung('${id}', 'laenge', this.value)"
                       onclick="event.stopPropagation()">
                <span class="laenge-zelle-einheit">m</span>
            </span>
        `;
    }

    return `
        <select class="vorschlag-laenge" aria-label="Länge wählen"
                onclick="event.stopPropagation()"
                ondblclick="event.stopPropagation()"
                onchange="event.stopPropagation(); gruppeUpdateLeitung('${id}', 'laenge', this.value)">
            ${optionen([{ value: '', label: 'Länge…' },
                ...laengen.map(l => ({ value: l, label: `${formatLaenge(l)} m` }))], leitung.laenge || '')}
        </select>
    `;
}


/**
 * Stecker kurz für die Spalte „Verbindung“ (z. B. „M12 Buchse“, „offen“).
 * @param {string} stecker
 * @returns {string}
 */
function formatSteckerTag(stecker) {
    if (!stecker) return '?';
    if (stecker === 'offen') return 'offen';
    return formatSteckerKurz(stecker).replace(/\s+gewinkelt$/, ' ↳');
}


/**
 * Steckerpaar als zwei Etiketten: A gefüllt, B gestrichelt.
 * @param {object} leitung
 * @returns {string}
 */
function renderVerbindung(leitung) {
    const meterware = istMeterwareKategorie(leitung.kategorie);
    const a = meterware ? 'offen' : formatSteckerTag(leitung.steckerA);
    const b = meterware ? 'offen' : formatSteckerTag(leitung.steckerB);
    const klasse = wert => (wert === '?' ? ' fehlt' : '');
    return `
        <span class="gk-stecker gk-stecker-a${klasse(a)}">${escapeHtml(a)}</span>
        <span class="gk-stecker-strich" aria-hidden="true">–</span>
        <span class="gk-stecker gk-stecker-b${klasse(b)}">${escapeHtml(b)}</span>
    `;
}


/**
 * @param {'leitungen'|'bauteile'} art
 * @param {string} id
 * @param {string} status
 * @param {boolean} gesperrt
 * @returns {string}
 */
export function renderStandSelect(art, id, status, gesperrt) {
    const info = getStuecklisteStatusInfo({ status, lieferdatum: '' });
    return `<select class="stueckliste-status-select gk-status-select ${info.klasse}"${gesperrt ? ' disabled' : ''}
                aria-label="Status"
                onchange="gruppeSetBeschaffung('${art}', '${jsArg(id)}', 'status', this.value)">
            ${beschaffungStatusOptionen(status)}
        </select>`;
}


/**
 * @param {'leitungen'|'bauteile'} art
 * @param {string} id
 * @param {string} kommentar
 * @param {boolean} gesperrt
 * @returns {string}
 */
export function renderStandKommentar(art, id, kommentar, gesperrt, placeholder = 'Warum fehlt etwas?') {
    return `<textarea class="gk-kommentar-input" rows="1"${gesperrt ? ' disabled' : ''}
                placeholder="${escapeHtml(placeholder)}" aria-label="Kommentar zum Stand"
                oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
                onchange="gruppeSetBeschaffung('${art}', '${jsArg(id)}', 'kommentar', this.value)">${escapeHtml(kommentar)}</textarea>`;
}


/**
 * Zieht Kommentarfelder auf die Höhe ihres Textes, damit nichts abgeschnitten wird.
 * @param {ParentNode} [root]
 * @returns {void}
 */
export function passeKommentarHoeheAn(root = document) {
    root.querySelectorAll('.gk-kommentar-input').forEach(feld => {
        feld.style.height = 'auto';
        feld.style.height = `${feld.scrollHeight}px`;
    });
}


/**
 * Status und Kommentar im Bearbeitungsdialog.
 * @param {'leitungen'|'bauteile'} art
 * @param {object} item
 * @param {boolean} gesperrt
 * @returns {string}
 */
export function renderStandFelder(art, item, gesperrt) {
    const stand = getPositionsBeschaffung(art, item);
    const disabled = gesperrt ? ' disabled' : '';
    const info = getStuecklisteStatusInfo({ status: stand.status, lieferdatum: '' });
    return `
        <div class="gruppen-karte-stand">
            <div class="form-group">
                <label>Status</label>
                <select class="stueckliste-status-select ${info.klasse}"${disabled}
                        onchange="gruppeSetBeschaffung('${art}', '${jsArg(item.id)}', 'status', this.value)">
                    ${beschaffungStatusOptionen(stand.status)}
                </select>
            </div>
            <div class="form-group gruppen-karte-breit">
                <label>Kommentar zum Stand</label>
                ${renderStandKommentar(art, item.id, stand.kommentar, gesperrt, 'z. B. Länge noch nicht gemessen, wartet auf CAD')}
            </div>
        </div>
    `;
}


/**
 * Leitungen der Gruppe: Verbindung, Leitung, Länge, Stück. Ein Klick auf die Zeile öffnet sie.
 * @param {object[]} leitungen
 * @returns {string}
 */
export function renderLeitungTabelle(leitungen) {
    if (!leitungen.length) {
        return `<p class="gk-tabelle-leer">Noch keine Leitungen in ${escapeHtml(gk.aktiveGruppe)}.
                ${istSchreibgeschuetzt() ? '' : 'Oben suchen oder unten einen Vorschlag übernehmen.'}</p>`;
    }

    const gesperrt = istSchreibgeschuetzt();
    const mitWeg = leitungen.some(hatWeg);
    const zeilen = leitungen.map(leitung => {
        aktualisiereArtikel(leitung);
        const id = jsArg(leitung.id);
        const artikelnummer = leitung.artikelnummer || leitung.artikelCustom;
        const klassen = ['gk-zeile'];
        if (leitung.id === gk.aktiveLeitungId) klassen.push('aktiv');
        if (!artikelnummer) klassen.push('unvollstaendig');
        const name = leitung.bezeichnung || getLeitungAusfuehrung(leitung);
        const meta = [leitung.hersteller, artikelnummer || 'Artikel offen', leitung.topoVerbindungId ? 'aus Topologie' : '']
            .filter(Boolean).join(' · ');
        const stand = getPositionsBeschaffung('leitungen', leitung);

        return `
            <tr class="${klassen.join(' ')}" title="Klicken zum Bearbeiten" onclick="gruppeEditLeitung('${id}')">
                <td class="gk-verbindung">${renderVerbindung(leitung)}</td>
                <td class="gk-leitung">
                    <span class="gk-leitung-name">${escapeHtml(name)}</span>
                    <span class="gk-leitung-meta">${escapeHtml(meta)}</span>
                    ${renderPreisKurz(artikelnummer)}
                </td>
                <td class="gk-laenge">${renderLaengeZelle(leitung, gesperrt)}</td>
                <td class="gk-stueck">${renderAnzahlStepper('leitung', leitung.id, leitung.anzahl, gesperrt)}</td>
                <td class="gk-stand" onclick="event.stopPropagation()">${renderStandSelect('leitungen', leitung.id, stand.status, gesperrt)}</td>
                <td class="gk-aktion">${gesperrt ? '' : `
                    <button type="button" class="gk-kopieren" title="Leitung kopieren" aria-label="Leitung kopieren"
                            onclick="event.stopPropagation(); gruppeKopiereLeitung('${id}')">⧉</button>
                    <button type="button" class="gk-loeschen" title="Leitung löschen" aria-label="Leitung löschen"
                            onclick="event.stopPropagation(); gruppeDeleteLeitung('${id}')">×</button>`}
                </td>
            </tr>
            <tr class="gk-kommentar-zeile" onclick="event.stopPropagation()">
                <td colspan="6">${renderStandKommentar('leitungen', leitung.id, stand.kommentar, gesperrt)}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-container gk-tabelle-wrap">
            <table class="gk-tabelle${mitWeg ? ' hat-weg' : ''}">
                <thead>
                    <tr>
                        <th>Verbindung</th>
                        <th>Leitung</th>
                        <th class="gk-laenge">Länge</th>
                        <th class="gk-stueck">Stück</th>
                        <th>Status</th>
                        <th class="gk-aktion"><span class="sr-only">Aktionen</span></th>
                    </tr>
                </thead>
                <tbody>${zeilen}</tbody>
            </table>
        </div>
    `;
}


/**
 * Zeichnet Leitungstabelle, Vorschläge und Rahmen neu (Suche bleibt unangetastet).
 * @returns {void}
 */
export function aktualisiereLeitungsTabelle() {
    const container = document.getElementById('gruppen-leitungen-tabelle');
    if (container) container.innerHTML = renderLeitungTabelle(getLeitungenDerGruppe(gk.aktiveGruppe));
    const vorschlaege = document.getElementById('gk-vorschlaege');
    const gruppe = getGruppe(gk.aktiveGruppe);
    if (vorschlaege && gruppe) vorschlaege.innerHTML = renderLeitungVorschlaege(gruppe);
    renderGruppenRahmen();
    passeKommentarHoeheAn(container);
}


/**
 * Liest Basistyp und Ausrichtung aus dem gespeicherten Steckertyp.
 * @param {string} stecker
 * @returns {{basis: string, ausrichtung: string}}
 */
function zerlegeStecker(stecker) {
    return {
        basis: getBaseSteckerTyp(stecker),
        ausrichtung: (stecker || '').endsWith('gewinkelt') ? 'gewinkelt' : 'gerade'
    };
}


/**
 * Ermittelt den passenden Katalogartikel und schreibt ihn in die Leitung.
 * @param {object} leitung
 * @returns {{text: string, klasse: string}}
 */
export function aktualisiereArtikel(leitung) {
    if (leitung.artikelCustom) {
        leitung.artikelnummer = leitung.artikelCustom;
        return { text: `Manuell: ${leitung.artikelCustom}`, klasse: 'manuell' };
    }

    if (istMeterwareKategorie(leitung.kategorie)) {
        const whitelist = leitung.presetId === 'oelflex-werkzeugspanner'
            ? null
            : leitung.artikelWhitelist;
        const artikel = getMeterwareArtikel(leitung.kategorie, leitung.hersteller, whitelist)
            .find(a => a.artikelnummer === leitung.artikelnummer);
        if (!artikel) {
            leitung.artikelnummer = leitung.artikelnummer || '';
            return { text: 'Bitte Leitungstyp wählen', klasse: 'no-match' };
        }
        return { text: `${artikel.beschreibung} · ${artikel.artikelnummer}`, klasse: 'match' };
    }

    const treffer = findArtikel({
        kategorie: leitung.kategorie,
        hersteller: leitung.hersteller,
        steckerA: leitung.steckerA,
        steckerB: leitung.steckerB,
        laenge: leitung.laenge,
        bevorzugt: leitung.artikelnummer,
        artikelPrefix: leitung.artikelPrefix
    });

    if (treffer?.artikel) {
        leitung.artikelnummer = treffer.artikel.artikelnummer;
        if (!treffer.exakt) {
            return {
                text: `${treffer.artikel.beschreibung} · ${treffer.artikel.artikelnummer} (nächste Katalog-Länge ${formatLaenge(treffer.artikel.laenge)} m)`,
                klasse: 'partial'
            };
        }
        return { text: `${treffer.artikel.beschreibung} · ${treffer.artikel.artikelnummer}`, klasse: 'match' };
    }

    // Ohne Katalogtreffer bleibt eine bereits erfasste Artikelnummer erhalten.
    if (leitung.artikelnummer) {
        return { text: `Artikelnummer: ${leitung.artikelnummer}`, klasse: 'manuell' };
    }

    if (!leitung.artikelPrefix && leitung.kategorie && !(leitung.steckerA && leitung.steckerB)
        && getSteckerVarianten(leitung.kategorie, leitung.hersteller).length) {
        return {
            text: leitung.steckerA || leitung.steckerB ? 'Bitte den zweiten Stecker wählen' : 'Bitte Stecker A und B wählen',
            klasse: 'laenge-fehlt'
        };
    }

    const laengen = treffer?.verfuegbareLaengen || [];
    if (laengen.length) {
        // Die Leitung steht im Katalog, es fehlt nur die Länge – kein Fall für „neu anlegen“.
        const bereich = laengen.length > 6
            ? `${formatLaenge(laengen[0])}–${formatLaenge(laengen[laengen.length - 1])} m`
            : `${laengen.map(formatLaenge).join(', ')} m`;
        return { text: `Bitte Länge wählen (${bereich})`, klasse: 'laenge-fehlt' };
    }
    return { text: 'Kein Katalogartikel – Artikelnummer manuell eintragen', klasse: 'no-match' };
}


/**
 * @param {object} leitung
 * @returns {string}
 */
export function renderLeitungKarte(leitung) {
    const gesperrt = istSchreibgeschuetzt();
    const disabled = gesperrt ? ' disabled' : '';
    const id = escapeHtml(leitung.id);
    const meterware = istMeterwareKategorie(leitung.kategorie);
    const artikelInfo = aktualisiereArtikel(leitung);
    hinterlegePreis(leitung, leitung.artikelnummer);

    const nummer = getLeitungenDerGruppe(leitung.gruppe).findIndex(l => l.id === leitung.id) + 1;
    const zusatzOffen = leitung.artikelCustom || leitung.notiz ? ' open' : '';
    const typFrei = !(leitung.artikelPrefix || leitung.festLeitungstyp);

    return `
        <div class="gruppen-karte leitung-karte" id="leitung-karte-${id}">
            <div class="leitung-karte-kopf">
                <span class="leitung-karte-nummer">Leitung ${nummer} bearbeiten</span>
            </div>

            ${renderArtikelVorschlagBox(artikelInfo, leitung.artikelnummer, {
                gesperrt,
                leitungId: id
            })}

            <div class="form-group">
                <label>Verwendung</label>
                <input type="text" class="leitung-karte-verwendung" value="${escapeHtml(leitung.bezeichnung || '')}"
                       title="Verwendung / wofür ist die Leitung?"
                       placeholder="z. B. Klemmkasten 1 → EP-Modul Stößel"${disabled}
                       oninput="gruppeUpdateLeitungText('${id}', 'bezeichnung', this.value)">
            </div>
            ${renderStandFelder('leitungen', leitung, gesperrt)}

            <div class="leitung-auswahl">
                ${typFrei ? renderKategorieChips(leitung, disabled) : ''}
                ${typFrei && leitung.kategorie ? renderHerstellerChips(leitung, disabled) : ''}
                ${meterware
                    ? renderMeterwareFelder(leitung, disabled)
                    : (leitung.artikelPrefix
                        ? renderPresetLeitungFelder(leitung, disabled)
                        : (leitung.kategorie ? renderSteckerFelder(leitung, disabled) : ''))}
                <div class="chip-feld">
                    <span class="chip-feld-label">Anzahl</span>
                    ${renderAnzahlStepper('leitung', leitung.id, leitung.anzahl, gesperrt)}
                </div>
            </div>

            ${renderWeg(leitung, gesperrt)}

            ${gesperrt ? '' : renderStandardAngebot(leitung)}

            <details class="gruppen-karte-details"${zusatzOffen}>
                <summary>Artikelnummer überschreiben / Notiz</summary>
                <div class="gruppen-karte-grid">
                    <div class="form-group gruppen-karte-breit">
                        <label>Artikelnummer manuell überschreiben</label>
                        <input type="text" value="${escapeHtml(leitung.artikelCustom || '')}" placeholder="Nur ausfüllen, wenn abweichend"${disabled}
                               oninput="gruppeUpdateLeitungText('${id}', 'artikelCustom', this.value)">
                    </div>
                    <div class="form-group gruppen-karte-breit">
                        <label>Notiz</label>
                        <input type="text" value="${escapeHtml(leitung.notiz || '')}" placeholder="Optionale Bemerkung"${disabled}
                               oninput="gruppeUpdateLeitungText('${id}', 'notiz', this.value)">
                    </div>
                </div>
            </details>

            <div class="leitung-karte-aktionen leitung-karte-aktionen-unten">
                ${gesperrt ? '' : `
                    ${gk.standardAngebotIds.has(leitung.id) ? '' : `
                    <button type="button" class="btn btn-secondary"
                            title="Diese Leitung künftig in dieser Gruppe vorschlagen"
                            onclick="gruppeSaveLeitungAlsButton('${id}')">Als Standard merken</button>
                    `}
                    <button type="button" class="btn btn-secondary" title="Kopie anlegen und direkt anpassen"
                            onclick="gruppeKopiereLeitung('${id}')">Kopieren</button>
                    <button type="button" class="btn btn-danger" title="Leitung löschen"
                            onclick="gruppeDeleteLeitung('${id}')">Löschen</button>
                `}
                <button type="button" class="btn btn-primary" title="Bearbeitung beenden"
                        onclick="gruppeCloseLeitungEditor()">Fertig</button>
            </div>
        </div>
    `;
}


/**
 * Schließt das aktuell offene Bearbeitungs- oder Anlagefenster (Escape / Overlay).
 * @returns {boolean} true, wenn etwas geschlossen wurde.
 */
export function gruppeCloseAktivenEditor() {
    if (gk.wegeDialogOffen) {
        gruppeCloseWegeDialog();
        return true;
    }
    if (gk.neuesLeitungFormular) {
        gruppeCancelLeitungFormular();
        return true;
    }
    if (gk.neuesBauteilFormular) {
        gruppeCancelBauteilFormular();
        return true;
    }
    if (gk.aktiveLeitungId) {
        gruppeCloseLeitungEditor();
        return true;
    }
    if (gk.aktivesBauteilId) {
        gruppeCloseBauteilEditor();
        return true;
    }
    return false;
}


/**
 * Formular für die gerade ausgewählte Leitung. Es ist immer nur eines geöffnet.
 * @returns {string}
 */
export function renderLeitungEditor() {
    if (gk.neuesBauteilFormular || gk.neuesLeitungFormular || gk.pickerState) return '';
    const leitung = gk.aktiveLeitungId ? findLeitung(gk.aktiveLeitungId) : null;
    if (!leitung || leitung.gruppe !== gk.aktiveGruppe) return '';
    return renderEditorOverlay({
        onClose: 'gruppeCloseLeitungEditor()',
        inhalt: renderLeitungKarte(leitung)
    });
}


/**
 * Setzt den Fokus auf das Verwendungsfeld im Leitungseditor.
 * @returns {void}
 */
export function fokussiereLeitungEditor() {
    const karte = document.getElementById(`leitung-karte-${gk.aktiveLeitungId}`);
    if (!karte) return;

    karte.classList.add('gerade-angelegt');
    karte.querySelector('.leitung-karte-verwendung')?.focus({ preventScroll: true });
}


/**
 * Öffnet eine bestehende Leitung im Formular.
 * @param {string} id
 * @returns {void}
 */
export function gruppeEditLeitung(id) {
    if (!findLeitung(id)) return;
    gk.aktivesBauteilId = '';
    gk.neuesBauteilFormular = null;
    gk.neuesLeitungFormular = null;
    gk.pickerState = null;
    gk.aktiveLeitungId = id;
    renderGruppenPanel();
    fokussiereLeitungEditor();
}


/**
 * Schließt das Formular, die Leitung bleibt in der Übersicht.
 * @returns {void}
 */
export function gruppeCloseLeitungEditor() {
    gk.aktiveLeitungId = '';
    renderGruppenPanel();
}


/**
 * @param {string} klasse
 * @param {string} artikelnummer
 * @returns {boolean}
 */
function kannArtikelnummerKopieren(klasse, artikelnummer) {
    return !!(artikelnummer && ['match', 'partial', 'manuell'].includes(klasse));
}


/**
 * Artikelvorschau-Box; bei Treffer/Manuell Klick kopiert die Artikelnummer.
 * @param {{text: string, klasse: string}} artikelInfo
 * @param {string} artikelnummer
 * @param {{gesperrt?: boolean, leitungId?: string}} [opts]
 * @returns {string}
 */
function renderArtikelVorschlagBox(artikelInfo, artikelnummer, opts = {}) {
    const kopierbar = kannArtikelnummerKopieren(artikelInfo.klasse, artikelnummer);
    const anlegen = !opts.gesperrt && artikelInfo.klasse === 'no-match' && opts.leitungId
        ? `<button type="button" class="btn btn-secondary btn-small"
                onclick="event.stopPropagation(); gruppeOpenLeitungFormularAusLeitung('${jsArg(opts.leitungId)}')">
                Im Katalog anlegen…
           </button>`
        : '';
    const copyAttrs = kopierbar
        ? `role="button" tabindex="0"
            title="Artikelnummer kopieren"
            aria-label="Artikelnummer ${escapeAttr(artikelnummer)} kopieren"
            onclick="event.stopPropagation(); gruppeCopyArtikelnummer('${jsArg(artikelnummer)}', this)"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();gruppeCopyArtikelnummer('${jsArg(artikelnummer)}',this);}"`
        : '';

    return `
        <div class="artikel-vorschlag gruppen-karte-artikel-box leitung-ergebnis ${artikelInfo.klasse}${kopierbar ? ' kopierbar' : ''}"
             ${copyAttrs}>
            <span class="artikel-label">${escapeHtml(artikelInfo.text)}</span>
            ${renderPreisKurz(artikelnummer)}
            ${kopierbar ? '<span class="artikel-copy-hint" aria-hidden="true">Kopieren</span>' : ''}
            ${anlegen}
        </div>
    `;
}


/**
 * Kopiert eine Artikelnummer in die Zwischenablage.
 * @param {string} artikelnummer
 * @param {HTMLElement} [el]
 * @returns {Promise<void>}
 */
export async function gruppeCopyArtikelnummer(artikelnummer, el) {
    const nr = String(artikelnummer || '').trim();
    if (!nr) return;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(nr);
        } else {
            const input = document.createElement('textarea');
            input.value = nr;
            input.setAttribute('readonly', '');
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            input.remove();
        }
    } catch (error) {
        console.error('Artikelnummer konnte nicht kopiert werden:', error);
        showModal(`Artikelnummer konnte nicht kopiert werden:\n${nr}`, {
            type: 'warning',
            title: 'Kopieren fehlgeschlagen'
        });
        return;
    }

    if (el) {
        el.classList.add('kopiert');
        const hint = el.querySelector('.artikel-copy-hint');
        const vorher = hint?.textContent;
        if (hint) hint.textContent = 'Kopiert';
        window.setTimeout(() => {
            el.classList.remove('kopiert');
            if (hint && vorher) hint.textContent = vorher;
        }, 1200);
    }
}


/**
 * Eine beschriftete Reihe anklickbarer Chips.
 * @param {string} label
 * @param {string} inhalt - Bereits gerenderte Chips bzw. Hinweis.
 * @returns {string}
 */
function renderChipFeld(label, inhalt) {
    return `
        <div class="chip-feld">
            <span class="chip-feld-label">${escapeHtml(label)}</span>
            <div class="chip-liste">${inhalt}</div>
        </div>
    `;
}


/**
 * @param {{label: string, onclick: string, aktiv?: boolean, gesperrt?: boolean, title?: string, klasse?: string}} chip
 *        `label` wird unverändert übernommen und muss bereits escaped sein.
 * @returns {string}
 */
export function renderChip(chip) {
    const klassen = ['chip', chip.klasse, chip.aktiv ? 'aktiv' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${klassen}"${chip.gesperrt ? ' disabled' : ''}
                    ${chip.title ? `title="${escapeAttr(chip.title)}"` : ''}
                    ${'aktiv' in chip ? `aria-pressed="${chip.aktiv ? 'true' : 'false'}"` : ''}
                    onclick="${chip.onclick}">${chip.label}</button>`;
}


/**
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderKategorieChips(leitung, disabled) {
    const id = escapeHtml(leitung.id);
    const chips = getKategorien().map(k => renderChip({
        label: `${escapeHtml(k.icon || '')} ${escapeHtml(k.name)}`,
        onclick: `gruppeUpdateLeitung('${id}', 'kategorie', '${jsArg(k.id)}')`,
        aktiv: leitung.kategorie === k.id,
        gesperrt: Boolean(disabled)
    })).join('');
    return renderChipFeld('Leitungstyp', chips);
}


/**
 * Hersteller nur anbieten, wenn es überhaupt eine Wahl gibt.
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderHerstellerChips(leitung, disabled) {
    const hersteller = getHerstellerFuerKategorie(leitung.kategorie);
    if (hersteller.length < 2) return '';

    const id = escapeHtml(leitung.id);
    const chips = [{ value: '', label: 'Alle' }, ...hersteller.map(h => ({ value: h, label: h }))]
        .map(h => renderChip({
            label: escapeHtml(h.label),
            onclick: `gruppeUpdateLeitung('${id}', 'hersteller', '${jsArg(h.value)}')`,
            aktiv: (leitung.hersteller || '') === h.value,
            gesperrt: Boolean(disabled)
        })).join('');
    return renderChipFeld('Hersteller', chips);
}


/**
 * Alle Steckervarianten (inkl. gerade/gewinkelt) im Katalog-Pool. Mit `gegenstecker`
 * nur die Stecker, die es zusammen mit diesem Gegenstecker als Artikel gibt.
 * @param {string} kategorie
 * @param {string} hersteller
 * @param {string} [gegenstecker]
 * @returns {string[]}
 */
function getSteckerVarianten(kategorie, hersteller, gegenstecker = '') {
    const erlaubt = new Set(getSteckerAOptionen(kategorie, hersteller));
    const varianten = new Set();

    getPassendeArtikel(kategorie, hersteller, gegenstecker, '', '').forEach(a => {
        if (!gegenstecker) {
            [a.steckerA, a.steckerB].forEach(s => s && varianten.add(s));
            return;
        }
        if (a.steckerA === gegenstecker && a.steckerB) varianten.add(a.steckerB);
        if (a.steckerB === gegenstecker && a.steckerA) varianten.add(a.steckerA);
    });

    return Array.from(varianten)
        .filter(s => erlaubt.has(getBaseSteckerTyp(s)))
        .sort((a, b) => {
            if (a === 'offen') return 1;
            if (b === 'offen') return -1;
            return a.localeCompare(b, 'de');
        });
}


/**
 * Chip-Beschriftung eines Steckers – die Ausrichtung als Symbol, damit es kein
 * eigenes Umschaltfeld mehr braucht.
 * @param {string} stecker
 * @returns {string}
 */
function formatSteckerChip(stecker) {
    if (!stecker || stecker === 'offen') return 'offenes Ende';
    const { basis, ausrichtung } = zerlegeStecker(stecker);
    const kurz = escapeHtml(basis.replace(/-polig\b/, '-pol'));
    if (!hasAusrichtung(basis)) return kurz;
    return ausrichtung === 'gewinkelt'
        ? `${kurz} <span class="chip-sub">↳ gewinkelt</span>`
        : `${kurz} <span class="chip-sub">↑ gerade</span>`;
}


/**
 * Längen als Chips plus Feld für eine abweichende Wunschlänge.
 * Eine Wunschlänge ohne Katalogartikel führt zur nächstgrößeren Katalog-Länge.
 * @param {object} leitung
 * @param {number[]} laengen
 * @param {string} disabled
 * @returns {string}
 */
function renderLaengenChips(leitung, laengen, disabled) {
    if (hatWeg(leitung)) {
        const summe = anzeigeWegSumme(leitung);
        return renderChipFeld('Länge', `<span class="chip-info">${summe ? `${formatLaenge(summe)} m aus dem Weg` : 'ergibt sich aus dem Weg'}</span>`);
    }

    const id = escapeHtml(leitung.id);
    const aktuell = Number(leitung.laenge) || 0;
    const imKatalog = laengen.includes(aktuell);

    const chips = laengen.map(l => renderChip({
        label: `${formatLaenge(l)} m`,
        onclick: `gruppeUpdateLeitung('${id}', 'laenge', '${l}')`,
        aktiv: aktuell === l,
        gesperrt: Boolean(disabled),
        klasse: 'chip-laenge'
    })).join('');

    const eingabe = `
        <span class="chip-eingabe${aktuell && !imKatalog ? ' aktiv' : ''}">
            <input type="text" inputmode="decimal" placeholder="${laengen.length ? 'andere' : 'Meter'}"
                   value="${aktuell && !imKatalog ? formatLaenge(aktuell) : ''}" aria-label="Länge in Metern"${disabled}
                   onchange="gruppeUpdateLeitung('${id}', 'laenge', this.value)">
            <span>m</span>
        </span>
    `;
    return renderChipFeld('Länge', chips + eingabe);
}


/**
 * Felder für vorgegebene Leitungsreihen (=011 Bremse): nur Länge wählen.
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderPresetLeitungFelder(leitung, disabled) {
    const prefix = leitung.artikelPrefix || '';
    const laengen = getLaengenOptionen(
        leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, prefix
    );
    const beispiel = getPassendeArtikel(
        leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, prefix
    )[0];
    const typLabel = beispiel
        ? (beispiel.beschreibung || '').replace(/\s+\d[\d.,]*\s*m\s*$/i, '').trim() || prefix
        : prefix;

    return `
        ${renderChipFeld('Leitung', `<span class="chip-info">${escapeHtml(typLabel)} · ${escapeHtml(leitung.hersteller || '')}</span>`)}
        ${renderLaengenChips(leitung, laengen, disabled)}
    `;
}


/**
 * Stecker A, Stecker B und Länge für konfektionierte Leitungen. Nicht kombinierbare
 * Stecker bleiben sichtbar, sind aber gesperrt – so sieht man, was es gibt.
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderSteckerFelder(leitung, disabled) {
    const id = escapeHtml(leitung.id);
    const alle = getSteckerVarianten(leitung.kategorie, leitung.hersteller);
    const passendZuA = leitung.steckerA
        ? new Set(getSteckerVarianten(leitung.kategorie, leitung.hersteller, leitung.steckerA))
        : null;
    const passendZuB = leitung.steckerB
        ? new Set(getSteckerVarianten(leitung.kategorie, leitung.hersteller, leitung.steckerB))
        : null;

    const steckerChips = (seite, aktuell, passend) => {
        // Gespeicherte Stecker, die nicht (mehr) im Katalog stehen, trotzdem anzeigen.
        const liste = aktuell && !alle.includes(aktuell) ? [aktuell, ...alle] : alle;
        if (!liste.length) return '<span class="chip-hinweis">Keine Stecker im Katalog</span>';
        return liste.map(stecker => renderChip({
            label: formatSteckerChip(stecker),
            onclick: `gruppeWaehleStecker('${id}', '${seite}', '${jsArg(stecker)}')`,
            aktiv: aktuell === stecker,
            gesperrt: Boolean(disabled) || (passend && aktuell !== stecker && !passend.has(stecker)),
            title: passend && !passend.has(stecker) ? 'Mit dem anderen Stecker nicht im Katalog' : ''
        })).join('');
    };

    const beideGewaehlt = Boolean(leitung.steckerA && leitung.steckerB);
    const laengen = beideGewaehlt
        ? getLaengenOptionen(leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, '')
        : [];

    // Artikel ohne feste Länge (Konfektion nach Maß) lassen sich nicht über
    // die Länge unterscheiden – dann braucht es eine eigene Auswahl.
    const ausfuehrungen = beideGewaehlt && !laengen.length
        ? getPassendeArtikel(leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, '')
        : [];
    const ausfuehrungFeld = ausfuehrungen.length > 1
        ? renderChipFeld('Ausführung', ausfuehrungen.map(artikel => renderChip({
            label: escapeHtml(artikel.beschreibung || artikel.artikelnummer),
            title: artikel.artikelnummer,
            onclick: `gruppeUpdateLeitung('${id}', 'artikelnummer', '${jsArg(artikel.artikelnummer)}')`,
            aktiv: leitung.artikelnummer === artikel.artikelnummer,
            gesperrt: Boolean(disabled)
        })).join(''))
        : '';

    return `
        ${renderChipFeld('Stecker A', steckerChips('A', leitung.steckerA, passendZuB))}
        ${renderChipFeld('Stecker B', steckerChips('B', leitung.steckerB, passendZuA))}
        ${ausfuehrungFeld}
        ${beideGewaehlt
            ? renderLaengenChips(leitung, laengen, disabled)
            : renderChipFeld('Länge', '<span class="chip-hinweis">Erst beide Stecker wählen</span>')}
    `;
}


/**
 * Felder für Meterware (Ölflex-, Motor- und Geberleitungen).
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderMeterwareFelder(leitung, disabled) {
    const id = escapeHtml(leitung.id);
    // Frühere Werkzeugspanner-Whitelist (nur 4G1,5/12G1,5/18G1,5) nicht mehr anwenden.
    const whitelist = leitung.presetId === 'oelflex-werkzeugspanner'
        ? null
        : leitung.artikelWhitelist;
    const artikel = getMeterwareArtikel(leitung.kategorie, leitung.hersteller, whitelist);

    const typFeld = artikel.length
        ? `<select${disabled} onchange="gruppeUpdateLeitung('${id}', 'artikelnummer', this.value)">
                ${optionen([{ value: '', label: '-- Leitungstyp --' },
                    ...artikel.map(a => ({ value: a.artikelnummer, label: `${a.beschreibung} (${a.artikelnummer})` }))],
                    leitung.artikelnummer)}
           </select>`
        : `<input type="text" value="${escapeHtml(leitung.artikelnummer || '')}" placeholder="Artikelnummer eintragen"${disabled}
                  oninput="gruppeUpdateLeitungText('${id}', 'artikelCustom', this.value)">`;

    return `
        <div class="chip-feld">
            <span class="chip-feld-label">Typ / Querschnitt</span>
            <div class="chip-feld-eingabe">${typFeld}</div>
        </div>
        ${renderLaengenChips(leitung, [], disabled)}
    `;
}


/**
 * Legt eine neue Leitung anhand eines Presets an.
 * @param {string} presetId
 * @param {{laenge?: number, direkt?: boolean, stillsam?: boolean, kategorie?: string}} [options]
 *        `direkt` übernimmt ohne Editor, `stillsam` unterdrückt das Neuzeichnen (Sammelaktion),
 *        `kategorie` gibt einer Leitung ohne Preset den Leitungstyp vor.
 * @returns {void}
 */
export function gruppeAddLeitung(presetId, options = {}) {
    if (!assertCanEdit('Leitungen hinzufügen')) return;
    if (!appState.currentProjekt.leitungen) appState.currentProjekt.leitungen = [];
    gk.pickerState = null;

    const preset = getLeitungPreset(presetId) || {};
    const kategorie = preset.kategorie || options.kategorie || '';
    const einzigerHersteller = !preset.kategorie && kategorie
        ? getHerstellerFuerKategorie(kategorie)
        : [];
    const leitung = {
        id: generateId('ltg'),
        position: appState.currentProjekt.leitungen.length + 1,
        presetId: presetId || '',
        bezeichnung: preset.bezeichnung || preset.label || '',
        kategorie,
        gruppe: gk.aktiveGruppe,
        hersteller: preset.hersteller || (einzigerHersteller.length === 1 ? einzigerHersteller[0] : ''),
        artikelnummer: preset.artikelnummer || '',
        artikelPrefix: preset.artikelPrefix || '',
        artikelWhitelist: preset.artikelWhitelist || null,
        artikelCustom: '',
        laenge: options.laenge || preset.laenge || 0,
        steckerA: getFullSteckerTyp(preset.steckerA || '', preset.ausrichtungA),
        steckerB: getFullSteckerTyp(preset.steckerB || '', preset.ausrichtungB),
        festLeitungstyp: preset.festLeitungstyp === true,
        notiz: '',
        anzahl: 1,
        erledigt: false
    };

    appState.currentProjekt.leitungen.push(leitung);
    const artikelInfo = aktualisiereArtikel(leitung);
    hinterlegePreis(leitung, leitung.artikelnummer);
    renumberLeitungen();
    persistCurrentProjekt();

    if (options.stillsam) return;

    // Übernehmen / Direktzugabe: immer in der Liste belassen, Editor nur bei Bedarf manuell öffnen.
    if (options.direkt) {
        renderGruppenListe();
        renderGruppenPanel();
        return;
    }

    if (artikelInfo.klasse === 'no-match' && (preset.kategorie || preset.artikelnummer || presetId)) {
        gk.aktiveLeitungId = leitung.id;
        renderGruppenListe();
        gruppeOpenLeitungFormular(leitung.id, presetId);
        return;
    }

    gk.aktiveLeitungId = leitung.id;
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereLeitungEditor();
}


/**
 * Übernimmt eine Katalog-Leitung direkt in die aktive Gruppe und bietet an,
 * sie künftig als Standard dieser Gruppe vorzuschlagen.
 * @param {string} artikelnummer
 * @returns {Promise<void>}
 */
export async function gruppeAddLeitungAusArtikel(artikelnummer) {
    await addLeitungAusKatalog(artikelnummer, '');
}


/**
 * Übernimmt eine ganze Leitungsreihe – die Länge wird danach in der Karte gewählt.
 * @param {string} prefix
 * @param {string} referenzArtikelnummer
 * @returns {Promise<void>}
 */
export async function gruppeAddLeitungAusReihe(prefix, referenzArtikelnummer) {
    await addLeitungAusKatalog(referenzArtikelnummer, prefix);
}


/**
 * Längen-Chip einer Katalogreihe im Auswahlfenster: Artikel sofort übernehmen.
 * @param {string} artikelnummer
 * @returns {Promise<void>}
 */
export async function gruppeAddKatalogArtikelDirekt(artikelnummer) {
    await addLeitungAusKatalog(artikelnummer, '', { direkt: true });
}


/**
 * Neue Leitung eines Leitungstyps, die im Fenster per Chips zusammengestellt wird.
 * @param {string} [kategorie] - Ohne Angabe gilt der Filter im Auswahlfenster.
 * @returns {void}
 */
export function gruppeAddLeitungMitKategorie(kategorie) {
    gruppeAddLeitung('', { kategorie: kategorie ?? gk.pickerState?.kategorie ?? '' });
}


/**
 * Legt eine Kopie einer bereits erfassten Leitung in der aktiven Gruppe an.
 * @param {string} quelleId
 * @param {string|number} laenge - Leer: Länge der Vorlage übernehmen.
 * @param {boolean} [imFenster] - Kopie im Bearbeitungsfenster öffnen statt direkt übernehmen.
 * @returns {void}
 */
export function gruppeAddLeitungWie(quelleId, laenge, imFenster = false) {
    if (!assertCanEdit('Leitungen hinzufügen')) return;
    const quelle = findLeitung(quelleId);
    if (!quelle) return;

    const neueLaenge = parseFloat(String(laenge ?? '').replace(',', '.'));
    const laengeGeaendert = neueLaenge > 0 && neueLaenge !== Number(quelle.laenge);
    // Bei anderer Länge muss der Katalog den Artikel neu bestimmen (außer Meterware).
    const artikelNeu = laengeGeaendert && !istMeterwareKategorie(quelle.kategorie);

    const leitung = {
        id: generateId('ltg'),
        position: appState.currentProjekt.leitungen.length + 1,
        presetId: quelle.presetId || '',
        bezeichnung: quelle.bezeichnung || '',
        kategorie: quelle.kategorie || '',
        gruppe: gk.aktiveGruppe,
        hersteller: quelle.hersteller || '',
        artikelnummer: artikelNeu ? '' : (quelle.artikelnummer || ''),
        artikelPrefix: quelle.artikelPrefix || '',
        artikelWhitelist: quelle.artikelWhitelist || null,
        artikelCustom: artikelNeu ? '' : (quelle.artikelCustom || ''),
        laenge: laengeGeaendert ? neueLaenge : (Number(quelle.laenge) || 0),
        steckerA: quelle.steckerA || '',
        steckerB: quelle.steckerB || '',
        festLeitungstyp: quelle.festLeitungstyp === true,
        notiz: '',
        anzahl: 1,
        erledigt: false,
        wegschritte: laengeGeaendert ? [] : kloneWegschritte(quelle),
        wegVorlagen: laengeGeaendert ? [] : [...wegVorlagenIds(quelle)]
    };

    gk.pickerState = null;
    appState.currentProjekt.leitungen.push(leitung);
    aktualisiereArtikel(leitung);
    renumberLeitungen();
    persistCurrentProjekt();

    if (imFenster) gk.aktiveLeitungId = leitung.id;
    renderGruppenListe();
    renderGruppenPanel();
    if (imFenster) fokussiereLeitungEditor();
}


/**
 * Wegabschnitte mit neuen Kennungen, damit Vorlage und Kopie unabhängig bleiben.
 * @param {object} leitung
 * @returns {object[]}
 */
function kloneWegschritte(leitung) {
    return wegschritte(leitung).map(schritt => ({
        id: generateId('weg'),
        name: schritt.name || '',
        meter: Number(schritt.meter) || 0
    }));
}


/**
 * Legt eine vollständige Kopie direkt hinter der Leitung an und öffnet sie.
 * @param {string} id
 * @returns {void}
 */
export function gruppeKopiereLeitung(id) {
    if (!assertCanEdit('Leitungen kopieren')) return;
    const quelle = findLeitung(id);
    const liste = appState.currentProjekt?.leitungen;
    if (!quelle || !liste) return;

    const kopie = structuredClone(quelle);
    kopie.id = generateId('ltg');
    kopie.erledigt = false;
    delete kopie.topoVerbindungId;
    kopie.wegschritte = kloneWegschritte(quelle);

    const index = liste.indexOf(quelle);
    liste.splice(index + 1, 0, kopie);
    aktualisiereArtikel(kopie);
    renumberLeitungen();
    persistCurrentProjekt();

    gk.aktiveLeitungId = kopie.id;
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereLeitungEditor();
}


/**
 * @param {string} artikelnummer
 * @param {string} reihenPrefix - Gesetzt, wenn nur die Reihe feststeht und die Länge noch fehlt.
 * @param {{direkt?: boolean}} [options] - `direkt` übernimmt ohne Bearbeitungsfenster.
 * @returns {Promise<void>}
 */
async function addLeitungAusKatalog(artikelnummer, reihenPrefix, options = {}) {
    if (!assertCanEdit('Leitungen hinzufügen')) return;

    const artikel = getArtikelByNummer(artikelnummer);
    if (!artikel) return;

    gk.pickerState = null;
    if (!appState.currentProjekt.leitungen) appState.currentProjekt.leitungen = [];

    const gruppenCode = gk.aktiveGruppe;
    const nurReihe = Boolean(reihenPrefix);
    const leitung = {
        id: generateId('ltg'),
        position: appState.currentProjekt.leitungen.length + 1,
        presetId: '',
        bezeichnung: nurReihe || options.direkt
            ? ohneLaengenangabe(artikel.beschreibung) || artikel.artikelnummer
            : (artikel.beschreibung || artikel.artikelnummer),
        kategorie: artikel.kategorie || '',
        gruppe: gruppenCode,
        hersteller: artikel.hersteller || '',
        artikelnummer: nurReihe ? '' : artikel.artikelnummer,
        artikelPrefix: artikel.meterware ? '' : (reihenPrefix || deriveArtikelPrefix(artikel.artikelnummer)),
        artikelWhitelist: null,
        artikelCustom: '',
        laenge: nurReihe ? 0 : (artikel.laenge || 0),
        steckerA: artikel.steckerA || '',
        steckerB: artikel.steckerB || '',
        festLeitungstyp: false,
        notiz: '',
        anzahl: 1,
        erledigt: false
    };

    appState.currentProjekt.leitungen.push(leitung);
    renumberLeitungen();
    persistCurrentProjekt();

    if (options.direkt) {
        renderGruppenListe();
        renderGruppenPanel();
        return;
    }

    gk.standardAngebotIds.add(leitung.id);
    gk.aktiveLeitungId = leitung.id;
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereLeitungEditor();
}


/**
 * Angebot in der Leitungskarte, eine Sonderposition künftig immer vorzuschlagen.
 * @param {object} leitung
 * @returns {string}
 */
function renderStandardAngebot(leitung) {
    if (leitung.presetId || !gk.standardAngebotIds.has(leitung.id)) return '';
    const id = escapeHtml(leitung.id);

    return `
        <div class="standard-angebot">
            <span>Diese Leitung künftig in ${escapeHtml(leitung.gruppe)} immer vorschlagen?</span>
            <div class="standard-angebot-aktionen">
                <button type="button" class="btn btn-primary btn-small"
                        onclick="gruppeSaveLeitungAlsButton('${id}')">Ja, merken</button>
                <button type="button" class="btn btn-secondary btn-small"
                        onclick="gruppeStandardAngebotVerwerfen('${id}')">Nur dieses Projekt</button>
            </div>
        </div>
    `;
}


/**
 * @param {string} leitungId
 * @returns {void}
 */
export function gruppeStandardAngebotVerwerfen(leitungId) {
    gk.standardAngebotIds.delete(leitungId);
    renderGruppenPanel();
}


/**
 * Ändert ein Auswahlfeld einer Leitung und zeichnet die Karte neu.
 * @param {string} id
 * @param {string} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeUpdateLeitung(id, feld, wert) {
    const leitung = findLeitung(id);
    if (!leitung || istSchreibgeschuetzt()) return;

    if (feld === 'kategorie') {
        leitung.kategorie = wert;
        leitung.wegschritte = [];
        leitung.wegVorlagen = [];
        const hersteller = getHerstellerFuerKategorie(wert);
        leitung.hersteller = hersteller.length === 1 ? hersteller[0] : '';
        leitung.steckerA = '';
        leitung.steckerB = '';
        leitung.artikelnummer = '';
        leitung.artikelPrefix = '';
        leitung.laenge = 0;
    } else if (feld === 'hersteller') {
        leitung.hersteller = wert;
        leitung.artikelnummer = '';
        leitung.artikelPrefix = '';
        // Stecker, die es bei diesem Hersteller nicht gibt, verwerfen.
        if (!istMeterwareKategorie(leitung.kategorie)) {
            const varianten = getSteckerVarianten(leitung.kategorie, wert);
            if (!varianten.includes(leitung.steckerA)) leitung.steckerA = '';
            if (!varianten.includes(leitung.steckerB)) leitung.steckerB = '';
            passeLaengeAn(leitung);
        }
    } else if (feld === 'steckerA') {
        const ausrichtung = zerlegeStecker(leitung.steckerA).ausrichtung;
        leitung.steckerA = getFullSteckerTyp(wert, ausrichtung);
        leitung.steckerB = '';
        leitung.laenge = 0;
        leitung.wegschritte = [];
        leitung.wegVorlagen = [];
        leitung.artikelnummer = '';
        leitung.artikelPrefix = '';
    } else if (feld === 'steckerB') {
        const ausrichtung = zerlegeStecker(leitung.steckerB).ausrichtung;
        leitung.steckerB = getFullSteckerTyp(wert, ausrichtung);
        leitung.laenge = 0;
        leitung.wegschritte = [];
        leitung.wegVorlagen = [];
        leitung.artikelnummer = '';
        leitung.artikelPrefix = '';
    } else if (feld === 'laenge') {
        leitung.laenge = parseMeter(wert);
        leitung.wegschritte = [];
        leitung.wegVorlagen = [];
        // Bei Meterware bestimmt die Typauswahl die Artikelnummer, nicht die Länge.
        if (!istMeterwareKategorie(leitung.kategorie)) leitung.artikelnummer = '';
    } else if (feld === 'anzahl') {
        const anzahl = parseInt(wert, 10);
        leitung.anzahl = Number.isNaN(anzahl) || anzahl < 1 ? 1 : anzahl;
    } else if (feld === 'artikelnummer') {
        leitung.artikelnummer = wert;
    }

    aktualisiereArtikel(leitung);
    uebernehmeLeitungInTopologie(leitung);
    persistCurrentProjekt();
    ersetzeKarte(`leitung-karte-${id}`, renderLeitungKarte(leitung));
    aktualisiereLeitungsTabelle();
}


/**
 * Behält die Länge nur, wenn es sie für die neue Steckerkombination gibt.
 * Gibt es genau eine Länge, wird sie gleich gesetzt.
 * @param {object} leitung
 * @returns {void}
 */
function passeLaengeAn(leitung) {
    const vorher = Number(leitung.laenge) || 0;
    if (!leitung.steckerA || !leitung.steckerB) {
        leitung.laenge = 0;
    } else {
        const laengen = getLaengenOptionen(
            leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, leitung.artikelPrefix
        );
        if (laengen.length === 1) leitung.laenge = laengen[0];
        else if (laengen.length && !laengen.includes(Number(leitung.laenge))) leitung.laenge = 0;
    }
    if ((Number(leitung.laenge) || 0) !== vorher) {
        leitung.wegschritte = [];
        leitung.wegVorlagen = [];
    }
}


/**
 * Stecker-Chip angeklickt. Ein zweiter Klick hebt die Auswahl auf. Passt der andere
 * Stecker nicht mehr, wird er verworfen; gibt es nur einen Gegenstecker, wird er gesetzt.
 * @param {string} id
 * @param {string} seite - 'A' oder 'B'.
 * @param {string} stecker - Vollständiger Steckertyp inkl. Ausrichtung.
 * @returns {void}
 */
export function gruppeWaehleStecker(id, seite, stecker) {
    const leitung = findLeitung(id);
    if (!leitung || istSchreibgeschuetzt()) return;

    const feld = seite === 'A' ? 'steckerA' : 'steckerB';
    const anderes = seite === 'A' ? 'steckerB' : 'steckerA';
    leitung[feld] = leitung[feld] === stecker ? '' : stecker;

    if (leitung[feld]) {
        const passend = getSteckerVarianten(leitung.kategorie, leitung.hersteller, leitung[feld]);
        if (leitung[anderes] && !passend.includes(leitung[anderes])) leitung[anderes] = '';
        if (!leitung[anderes] && passend.length === 1) leitung[anderes] = passend[0];
    }

    leitung.artikelnummer = '';
    leitung.artikelPrefix = '';
    passeLaengeAn(leitung);

    aktualisiereArtikel(leitung);
    uebernehmeLeitungInTopologie(leitung);
    persistCurrentProjekt();
    ersetzeKarte(`leitung-karte-${id}`, renderLeitungKarte(leitung));
    aktualisiereLeitungsTabelle();
}


/**
 * Übernimmt Texteingaben, ohne die Karte neu zu zeichnen.
 * @param {string} id
 * @param {string} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeUpdateLeitungText(id, feld, wert) {
    const leitung = findLeitung(id);
    if (!leitung || istSchreibgeschuetzt()) return;

    leitung[feld] = wert;
    if (feld === 'artikelCustom') {
        // Ohne manuelle Nummer soll wieder der Katalog entscheiden.
        if (!wert) leitung.artikelnummer = '';
        const info = aktualisiereArtikel(leitung);
        uebernehmeLeitungInTopologie(leitung);
        const box = document.querySelector(`#leitung-karte-${CSS.escape(id)} .gruppen-karte-artikel-box`);
        if (box) {
            const wrap = document.createElement('div');
            wrap.innerHTML = renderArtikelVorschlagBox(info, leitung.artikelnummer, { gesperrt: false, leitungId: id });
            box.replaceWith(wrap.firstElementChild);
        }
    }
    persistCurrentProjekt();
    aktualisiereLeitungsTabelle();
}


/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function gruppeDeleteLeitung(id) {
    if (!assertCanEdit('Leitungen löschen')) return;
    const liste = appState.currentProjekt?.leitungen || [];
    const index = liste.findIndex(l => l.id === id);
    if (index === -1) return;

    const bezeichnung = liste[index].bezeichnung;
    const frage = bezeichnung ? `Leitung „${bezeichnung}“ wirklich löschen?` : 'Diese Leitung wirklich löschen?';
    const confirmed = await showModal(
        liste[index].topoVerbindungId
            ? `${frage}\n\nDie Verbindung in der EtherCAT-Topologie wird dabei ebenfalls entfernt.`
            : frage,
        { type: 'danger', title: 'Leitung löschen', showCancel: true, confirmText: 'Löschen', cancelText: 'Abbrechen' }
    );
    if (!confirmed) return;
    if (liste[index]?.id !== id) return;

    liste.splice(index, 1);
    if (gk.aktiveLeitungId === id) gk.aktiveLeitungId = '';
    renumberLeitungen();
    // Stammt die Leitung aus der Topologie, entfällt dort auch die Verbindung.
    syncTopologieLeitungen();
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();
}


/**
 * Tauscht eine einzelne Karte aus, damit Scrollposition und Fokus erhalten bleiben.
 * @param {string} elementId
 * @param {string} html
 * @returns {void}
 */
export function ersetzeKarte(elementId, html) {
    const element = document.getElementById(elementId);
    if (element) element.outerHTML = html;
}
