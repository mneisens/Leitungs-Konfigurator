/**
 * @file topologie.js – EtherCAT-EP-Module anordnen und Busleitungen festlegen.
 *
 * Ablauf: Module wählen → per Drag & Drop anordnen → Verbindungen ziehen
 * und pro Linie Typ/Länge der EtherCAT-Leitung setzen.
 */
import { appState } from './state.js';
import { escapeHtml, generateId } from './utils.js';
import { showView } from './navigation.js';
import { getBauteileByTyp } from './catalog.js';
import { deriveArtikelPrefix, getKonfektionierteKatalogArtikel } from './leitung-optionen.js';
import { persistCurrentProjekt } from './projects.js';
import { canEditProject } from './project-access.js';
import { showModal } from './modal.js';
import { getVerbindungenInKette, syncTopologieLeitungen } from './topologie-sync.js';


/** @type {'auswahl'|'anordnen'|'leitungen'} */
let schritt = 'auswahl';

/** @type {{vonId: string|null}} */
let verbindungsModus = { vonId: null };

/** @type {{modulId: string, offsetX: number, offsetY: number}|null} */
let dragState = null;

/** @type {string|null} */
let aktiveVerbindungId = null;

/** Verhindert mehrere Vorschau-Zeichnungen pro Frame beim Ziehen. */
let vorschauGeplant = false;


/**
 * @returns {object}
 */
function getTopo() {
    const projekt = appState.currentProjekt;
    if (!projekt) return { module: [], verbindungen: [] };
    if (!projekt.ethercatTopologie || typeof projekt.ethercatTopologie !== 'object') {
        projekt.ethercatTopologie = { module: [], verbindungen: [] };
    }
    if (!Array.isArray(projekt.ethercatTopologie.module)) projekt.ethercatTopologie.module = [];
    if (!Array.isArray(projekt.ethercatTopologie.verbindungen)) projekt.ethercatTopologie.verbindungen = [];
    migriereModulRotationZuTransform(projekt.ethercatTopologie);
    return projekt.ethercatTopologie;
}


/**
 * Früher wurde die Box-Größe bei 90°/270° getauscht; jetzt CSS-Transform bei fester Größe.
 * Position so anpassen, dass die visuelle Mitte gleich bleibt.
 * @param {object} topo
 * @returns {void}
 */
function migriereModulRotationZuTransform(topo) {
    if (topo.boxRotationMode === 'transform') return;
    for (const modul of topo.module) {
        const rot = normalizeRotation(modul.rotation);
        if (rot === 90 || rot === 270) {
            const { w, h } = getModulBasisAbmessungen(modul);
            const cx = (Number(modul.x) || 0) + h / 2;
            const cy = (Number(modul.y) || 0) + w / 2;
            modul.x = cx - w / 2;
            modul.y = cy - h / 2;
        }
    }
    topo.boxRotationMode = 'transform';
    persistCurrentProjekt();
}


/**
 * Speichert das Projekt und legt die Verbindungen als Leitungen in =004 an bzw. gleicht sie ab.
 * @returns {void}
 */
function speichereTopologie() {
    syncTopologieLeitungen();
    persistCurrentProjekt();
}


/**
 * @returns {boolean}
 */
function istGesperrt() {
    return !canEditProject(appState.currentProjekt);
}


/**
 * @param {object} artikel
 * @returns {boolean}
 */
function istSafetyModul(artikel) {
    const text = `${artikel?.artikelnummer || ''} ${artikel?.beschreibung || ''}`.toLowerCase();
    return text.includes('1957') || text.includes('safety') || text.includes('twinsafe');
}


/**
 * @returns {object[]}
 */
function getEpKatalog() {
    return getBauteileByTyp('ep-modul')
        .slice()
        .sort((a, b) => (a.artikelnummer || '').localeCompare(b.artikelnummer || '', 'de'));
}


/**
 * EtherCAT-Reihen für die Leitungsauswahl.
 * @returns {Array<{prefix: string, label: string, laengen: number[]}>}
 */
function getEthercatReihen() {
    const reihen = new Map();
    getKonfektionierteKatalogArtikel({ kategorie: 'ethercat', limit: 500 }).forEach(artikel => {
        if (!/beckhoff/i.test(artikel.hersteller || '')) return;
        const prefix = deriveArtikelPrefix(artikel.artikelnummer) || artikel.artikelnummer;
        if (!reihen.has(prefix)) {
            reihen.set(prefix, {
                prefix,
                label: ohneLaenge(artikel.beschreibung) || prefix,
                laengen: []
            });
        }
        if (artikel.laenge > 0) reihen.get(prefix).laengen.push(artikel.laenge);
    });

    return Array.from(reihen.values()).map(r => ({
        ...r,
        laengen: Array.from(new Set(r.laengen)).sort((a, b) => a - b)
    })).sort((a, b) => a.prefix.localeCompare(b.prefix, 'de'));
}


/**
 * @param {string} text
 * @returns {string}
 */
function ohneLaenge(text) {
    return String(text || '').replace(/[\s-]*\d+([.,]\d+)?\s*m\s*$/i, '').trim();
}


/**
 * @param {number} wert
 * @returns {string}
 */
function formatLaenge(wert) {
    if (wert == null || wert === '') return '';
    return String(wert).replace('.', ',');
}


/**
 * Einstieg: Topologie-Ansicht öffnen.
 * @returns {void}
 */
export function renderTopologie() {
    if (!appState.currentProjekt) {
        showView('home');
        return;
    }

    getTopo();
    // Bestehende Verbindungen einmalig als Leitungen in =004 übernehmen.
    if (syncTopologieLeitungen()) persistCurrentProjekt();
    if (!getTopo().module.length) schritt = 'auswahl';
    else if (schritt === 'auswahl' && getTopo().module.length) schritt = 'anordnen';

    const titel = document.getElementById('topologie-titel');
    if (titel) {
        titel.textContent = `EtherCAT-Topologie – ${appState.currentProjekt.projektnummer}`;
    }

    renderTopologieInhalt();
}


/**
 * @returns {void}
 */
function renderTopologieInhalt() {
    const root = document.getElementById('topologie-root');
    if (!root) return;

    root.innerHTML = `
        <div class="topo-schritte">
            ${renderSchrittTab('auswahl', '1. Module', 1)}
            ${renderSchrittTab('anordnen', '2. Anordnen', 2)}
            ${renderSchrittTab('leitungen', '3. Leitungen', 3)}
        </div>
        <div class="topo-inhalt">
            ${schritt === 'auswahl' ? renderAuswahlSchritt() : ''}
            ${schritt === 'anordnen' || schritt === 'leitungen' ? renderCanvasSchritt() : ''}
        </div>
    `;

    if (schritt === 'anordnen' || schritt === 'leitungen') {
        bindCanvasEvents();
        zeichneVerbindungen();
    }
}


/**
 * @param {string} id
 * @param {string} label
 * @param {number} nr
 * @returns {string}
 */
function renderSchrittTab(id, label, nr) {
    const aktiv = schritt === id ? ' aktiv' : '';
    const disabled = id !== 'auswahl' && !getTopo().module.length ? ' disabled' : '';
    return `<button type="button" class="topo-schritt-tab${aktiv}"${disabled}
                    onclick="topoSetSchritt('${id}')">${escapeHtml(label)}</button>`;
}


/**
 * @param {'auswahl'|'anordnen'|'leitungen'} next
 * @returns {void}
 */
export function topoSetSchritt(next) {
    if (next !== 'auswahl' && !getTopo().module.length) {
        showModal('Bitte zuerst mindestens ein EP-Modul auswählen.', {
            type: 'warning',
            title: 'Module fehlen'
        });
        return;
    }
    schritt = next;
    verbindungsModus = { vonId: null };
    aktiveVerbindungId = null;
    renderTopologieInhalt();
}


/**
 * Schritt 1: Module aus dem Katalog wählen.
 * @returns {string}
 */
function renderAuswahlSchritt() {
    const katalog = getEpKatalog();
    const ausgewaehlt = new Map();
    getTopo().module.forEach(m => {
        ausgewaehlt.set(m.artikelnummer, (ausgewaehlt.get(m.artikelnummer) || 0) + 1);
    });
    const gesperrt = istGesperrt();

    if (!katalog.length) {
        return `<div class="form-card"><p class="text-muted">Keine EP-Module im Bauteilkatalog gefunden.</p></div>`;
    }

    return `
        <div class="form-card topo-auswahl-card">
            <h3>EP-Module auswählen</h3>
            <p class="text-muted">Wähle alle EtherCAT-Boxen, die in der Topologie vorkommen. Danach kannst du sie anordnen.</p>
            <div class="topo-modul-liste">
                ${katalog.map(a => {
                    const anzahl = ausgewaehlt.get(a.artikelnummer) || 0;
                    const safety = istSafetyModul(a) ? ' safety' : '';
                    return `
                        <div class="topo-modul-wahl${safety}${anzahl ? ' gewaehlt' : ''}">
                            <div class="topo-modul-wahl-info">
                                <strong>${escapeHtml(a.artikelnummer)}</strong>
                                <span>${escapeHtml(a.beschreibung || '')}</span>
                            </div>
                            <div class="topo-modul-wahl-anzahl">
                                <button type="button" class="btn btn-secondary btn-small btn-icon"
                                        ${gesperrt || anzahl <= 0 ? 'disabled' : ''}
                                        onclick="topoAendereModulAnzahl('${escapeHtml(a.artikelnummer)}', -1)">−</button>
                                <span>${anzahl}</span>
                                <button type="button" class="btn btn-secondary btn-small btn-icon"
                                        ${gesperrt ? 'disabled' : ''}
                                        onclick="topoAendereModulAnzahl('${escapeHtml(a.artikelnummer)}', 1)">+</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="form-actions">
                <span class="text-muted">${getTopo().module.length} Modul(e) ausgewählt</span>
                <button type="button" class="btn btn-primary"
                        ${getTopo().module.length ? '' : 'disabled'}
                        onclick="topoSetSchritt('anordnen')">Weiter: Anordnen →</button>
            </div>
        </div>
    `;
}


/**
 * @param {string} artikelnummer
 * @param {number} delta
 * @returns {void}
 */
export function topoAendereModulAnzahl(artikelnummer, delta) {
    if (istGesperrt()) return;
    const topo = getTopo();
    const artikel = getEpKatalog().find(a => a.artikelnummer === artikelnummer);
    if (!artikel) return;

    if (delta > 0) {
        const index = topo.module.length;
        const spalte = index % 4;
        const zeile = Math.floor(index / 4);
        topo.module.push({
            id: generateId('ep'),
            artikelnummer,
            beschreibung: artikel.beschreibung || artikelnummer,
            safety: istSafetyModul(artikel),
            x: 100 + spalte * 150,
            y: 120 + zeile * 230,
            rotation: 0
        });
    } else {
        const idx = [...topo.module].map((m, i) => ({ m, i }))
            .reverse()
            .find(entry => entry.m.artikelnummer === artikelnummer)?.i;
        if (idx == null) return;
        const entfernt = topo.module[idx];
        topo.module.splice(idx, 1);
        topo.verbindungen = topo.verbindungen.filter(v =>
            v.vonModulId !== entfernt.id && v.nachModulId !== entfernt.id
        );
    }

    speichereTopologie();
    renderTopologieInhalt();
}


/**
 * Schritte 2 und 3: Canvas.
 * @returns {string}
 */
function renderCanvasSchritt() {
    const topo = getTopo();
    const gesperrt = istGesperrt();
    const verbindenAktiv = schritt === 'leitungen';

    return `
        <div class="topo-canvas-layout">
            <div class="topo-canvas-toolbar form-card">
                <div class="topo-toolbar-zeile">
                    <strong>${schritt === 'anordnen' ? 'Module anordnen' : 'Leitungen festlegen'}</strong>
                    <span class="text-muted">
                        ${schritt === 'anordnen'
                            ? 'Module per Drag & Drop verschieben. Mit ↻ um 90° drehen.'
                            : 'Zuerst Modul mit OUT wählen, dann Zielmodul (IN). Leitung läuft immer OUT → IN. Linie anklicken zum Bearbeiten. ↻ dreht das Modul.'}
                    </span>
                </div>
                <div class="topo-toolbar-aktionen">
                    ${schritt === 'anordnen' ? `
                        <button type="button" class="btn btn-primary btn-small"
                                onclick="topoSetSchritt('leitungen')">Weiter: Leitungen →</button>
                    ` : `
                        <button type="button" class="btn btn-secondary btn-small"
                                onclick="topoSetSchritt('anordnen')">← Zurück zum Anordnen</button>
                        <button type="button" class="btn btn-secondary btn-small"
                                ${gesperrt ? 'disabled' : ''}
                                onclick="topoVerbindungAbbrechen()">Verbindung abbrechen</button>
                    `}
                    ${verbindungsModus.vonId ? '<span class="topo-hinweis-aktiv">OUT gewählt – jetzt Zielmodul (IN) klicken</span>' : ''}
                </div>
            </div>

            <div class="topo-canvas-wrap" id="topo-canvas-wrap">
                <svg class="topo-edges" id="topo-edges" aria-hidden="true"></svg>
                <div class="topo-canvas" id="topo-canvas">
                    ${topo.module.map(m => renderModulKarte(m, verbindenAktiv, gesperrt)).join('')}
                </div>
            </div>

            <div class="topo-legende form-card">
                <span><i class="topo-legende-swatch normal"></i> Standard-EP</span>
                <span><i class="topo-legende-swatch safety"></i> Safety / TwinSAFE</span>
                <span><i class="topo-legende-swatch port-in"></i> IN (links)</span>
                <span><i class="topo-legende-swatch port-out"></i> OUT (rechts)</span>
                <span class="topo-legende-richtung">● OUT ─── ▶ IN</span>
                <span>${topo.verbindungen.length} Leitung(en)</span>
            </div>

            ${renderLeitungsliste(topo)}
        </div>

        ${aktiveVerbindungId ? renderLeitungEditor(aktiveVerbindungId, gesperrt) : ''}
    `;
}


/**
 * Alle Leitungen in Kettenreihenfolge – Farbe und Nummer wie auf der Fläche.
 * Hover hebt die Leitung hervor, Klick öffnet sie.
 * @param {object} topo
 * @returns {string}
 */
function renderLeitungsliste(topo) {
    const kette = getVerbindungenInKette(topo);
    if (!kette.length) return '';
    const darstellung = getVerbindungsDarstellung(topo);
    const modulText = id => {
        const modul = topo.module.find(m => m.id === id);
        return `<span class="topo-liste-modul"><b>${escapeHtml(getModulKuerzel(modul))}</b> ${escapeHtml(modul?.artikelnummer || '?')}</span>`;
    };

    return `
        <ol class="topo-leitungsliste form-card">
            ${kette.map(v => {
                const { nr, farbe } = darstellung.get(v.id);
                const id = escapeHtml(v.id);
                const details = [
                    v.laenge ? `${formatLaenge(v.laenge)} m` : 'Länge offen',
                    v.artikelnummer || v.reihe || ''
                ].filter(Boolean).join(' · ');
                return `
                    <li data-verbindung-id="${id}" data-von="${escapeHtml(v.vonModulId)}" data-nach="${escapeHtml(v.nachModulId)}"
                        style="--farbe: ${farbe}" class="${v.id === aktiveVerbindungId ? 'aktiv' : ''}">
                        <button type="button" onclick="topoOeffneLeitung('${id}')"
                                onmouseenter="topoHebeLeitungHervor('${id}')" onmouseleave="topoHebeLeitungHervor('')"
                                onfocus="topoHebeLeitungHervor('${id}')" onblur="topoHebeLeitungHervor('')">
                            <span class="topo-liste-nr">${nr}</span>
                            ${modulText(v.vonModulId)}
                            <span class="topo-liste-pfeil">→</span>
                            ${modulText(v.nachModulId)}
                            <span class="topo-liste-details${v.laenge ? '' : ' offen'}">${escapeHtml(details)}</span>
                        </button>
                    </li>
                `;
            }).join('')}
        </ol>
    `;
}


/**
 * Vereinfachte EP-Box: oben links grün IN, oben rechts grün OUT.
 * @param {object} modul
 * @param {boolean} verbindenAktiv
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderModulKarte(modul, verbindenAktiv, gesperrt) {
    const safety = modul.safety ? ' safety' : '';
    const selected = verbindungsModus.vonId === modul.id ? ' selected' : '';
    const rotation = normalizeRotation(modul.rotation);
    const rotClass = rotation ? ` rot-${rotation}` : '';
    const nr = modul.artikelnummer || '';
    const iopunkte = getModulIoAnzahl(nr);
    const { w, h } = getModulBasisAbmessungen(modul);
    const schmal = istSchmalesModul(nr) ? ' schmal' : '';
    const ioLayout = iopunkte <= 4 ? ' io-einspaltig' : '';
    // Kürzel an die sichtbare obere linke Ecke – bei 90°/270° liegt die Box quer.
    const quer = rotation === 90 || rotation === 270;
    const kuerzelVersatz = quer ? `left:${(w - h) / 2 - 9}px;top:${(h - w) / 2 - 9}px;` : '';
    // ↻ an eine Ecke auf der Seite ohne Ports, damit er die Port-Ringe nicht verdeckt.
    const bw = quer ? h : w;
    const bh = quer ? w : h;
    const ox = (w - bw) / 2;
    const oy = (h - bh) / 2;
    const drehenEcke = {
        0: [ox + bw, oy + bh],
        90: [ox, oy + bh],
        180: [ox + bw, oy],
        270: [ox + bw, oy + bh]
    }[rotation];
    const drehenVersatz = `left:${drehenEcke[0] - 12}px;top:${drehenEcke[1] - 12}px;right:auto;`;

    return `
        <div class="topo-modul${selected}"
             data-modul-id="${escapeHtml(modul.id)}"
             style="left:${Number(modul.x) || 0}px;top:${Number(modul.y) || 0}px;width:${w}px;height:${h}px;"
             title="${escapeHtml(modul.beschreibung || nr)}"
             onmouseenter="topoHebeModulHervor('${escapeHtml(modul.id)}')"
             onmouseleave="topoHebeModulHervor('')">
            <span class="topo-modul-kuerzel" style="${kuerzelVersatz}">${escapeHtml(getModulKuerzel(modul))}</span>
            <div class="topo-modul-face${safety}${rotClass}${schmal}${ioLayout}">
                <div class="topo-modul-ec">
                    <div class="topo-modul-port topo-modul-port-in" data-port="in" title="IN (X40)">
                        <span>IN</span>
                    </div>
                    <div class="topo-modul-ec-leds" aria-hidden="true">
                        <i></i><i></i><i></i>
                    </div>
                    <div class="topo-modul-port topo-modul-port-out" data-port="out" title="OUT (X41)">
                        <span>OUT</span>
                    </div>
                </div>
                <div class="topo-modul-body">
                    <span class="topo-modul-brand">BECKHOFF</span>
                    <span class="topo-modul-nr">${escapeHtml(nr)}</span>
                    <div class="topo-modul-io" aria-hidden="true">
                        ${Array.from({ length: iopunkte }, (_, i) => `<i class="topo-modul-io-dot" title="${i}"></i>`).join('')}
                    </div>
                </div>
                <div class="topo-modul-power" aria-hidden="true">
                    <i class="topo-modul-power-port"></i>
                    <span class="topo-modul-power-leds"><b></b><b></b></span>
                    <i class="topo-modul-power-port"></i>
                </div>
            </div>
            ${!gesperrt ? `
                <button type="button" class="topo-modul-drehen" title="Drehen (90°)" style="${drehenVersatz}"
                        onclick="event.stopPropagation(); topoDreheModul('${escapeHtml(modul.id)}')">↻</button>
            ` : ''}
        </div>
    `;
}


/**
 * EP3204 und ZS2020 sind physisch schmaler (eine I/O-Spalte bzw. schmales Verteilergehäuse).
 * @param {string} artikelnummer
 * @returns {boolean}
 */
function istSchmalesModul(artikelnummer) {
    return /EP3204|ZS2020/i.test(String(artikelnummer || ''));
}


/**
 * Unrotierte Basisgröße der Box (Drehung nur per CSS-Transform).
 * @param {object} modul
 * @returns {{w: number, h: number}}
 */
function getModulBasisAbmessungen(modul) {
    const schmal = istSchmalesModul(modul?.artikelnummer);
    return { w: schmal ? 72 : 108, h: 188 };
}


/**
 * @param {unknown} rotation
 * @returns {0|90|180|270}
 */
function normalizeRotation(rotation) {
    const n = ((Number(rotation) || 0) % 360 + 360) % 360;
    if (n >= 315 || n < 45) return 0;
    if (n < 135) return 90;
    if (n < 225) return 180;
    return 270;
}


/**
 * Punkt um Modulmitte im Uhrzeigersinn drehen (wie CSS rotate).
 * @param {number} px
 * @param {number} py
 * @param {number} cx
 * @param {number} cy
 * @param {0|90|180|270} rot
 * @returns {{x: number, y: number}}
 */
function rotatePointClockwise(px, py, cx, cy, rot) {
    const dx = px - cx;
    const dy = py - cy;
    const rad = (rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Bildschirmkoordinaten (y nach unten): so dreht auch CSS rotate() im Uhrzeigersinn.
    return {
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos
    };
}


/**
 * Grobe I/O-Anzahl für die stilisierte Box (nur Optik).
 * @param {string} artikelnummer
 * @returns {number}
 */
function getModulIoAnzahl(artikelnummer) {
    const nr = String(artikelnummer || '');
    if (/EP1018|EP1809|EP1819|EP2008|EP1957|ZS2020|EP2020/i.test(nr)) return 8;
    if (/EP3204|EP3174|EP3356/i.test(nr)) return 4;
    return 6;
}


/**
 * Modul exakt um 90° drehen (CSS-Transform, Layout bleibt gleich).
 * @returns {void}
 */
export function topoDreheModul(modulId) {
    if (istGesperrt()) return;
    const modul = getTopo().module.find(m => m.id === modulId);
    if (!modul) return;
    modul.rotation = (normalizeRotation(modul.rotation) + 90) % 360;
    persistCurrentProjekt();
    renderTopologieInhalt();
}


/**
 * @returns {void}
 */
export function topoVerbindungAbbrechen() {
    verbindungsModus = { vonId: null };
    renderTopologieInhalt();
}


/**
 * Canvas-Events für Drag und Klick-Verbindungen.
 * @returns {void}
 */
function bindCanvasEvents() {
    const canvas = document.getElementById('topo-canvas');
    const wrap = document.getElementById('topo-canvas-wrap');
    if (!canvas || !wrap) return;

    canvas.querySelectorAll('.topo-modul').forEach(el => {
        el.addEventListener('pointerdown', onModulPointerDown);
        el.addEventListener('click', onModulClick);
    });

    wrap.addEventListener('pointermove', onCanvasPointerMove);
    wrap.addEventListener('pointerup', onCanvasPointerUp);
    wrap.addEventListener('pointercancel', onCanvasPointerUp);
}


/**
 * @param {PointerEvent} event
 * @returns {void}
 */
function onModulPointerDown(event) {
    if (istGesperrt() || schritt !== 'anordnen') return;
    if (event.button !== 0) return;
    if (event.target.closest?.('.topo-modul-drehen')) return;
    const el = event.currentTarget;
    const modulId = el.getAttribute('data-modul-id');
    const modul = getTopo().module.find(m => m.id === modulId);
    if (!modul) return;

    const wrap = document.getElementById('topo-canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    dragState = {
        modulId,
        offsetX: event.clientX - rect.left - (Number(modul.x) || 0) + wrap.scrollLeft,
        offsetY: event.clientY - rect.top - (Number(modul.y) || 0) + wrap.scrollTop,
        moved: false
    };
    el.setPointerCapture?.(event.pointerId);
    el.classList.add('dragging');
    event.preventDefault();
}


/**
 * @param {PointerEvent} event
 * @returns {void}
 */
function onCanvasPointerMove(event) {
    if (!dragState) return;
    const wrap = document.getElementById('topo-canvas-wrap');
    const modul = getTopo().module.find(m => m.id === dragState.modulId);
    const el = wrap?.querySelector(`[data-modul-id="${dragState.modulId}"]`);
    if (!wrap || !modul || !el) return;

    const rect = wrap.getBoundingClientRect();
    const x = Math.max(8, event.clientX - rect.left + wrap.scrollLeft - dragState.offsetX);
    const y = Math.max(8, event.clientY - rect.top + wrap.scrollTop - dragState.offsetY);
    if (Math.abs(x - (modul.x || 0)) > 2 || Math.abs(y - (modul.y || 0)) > 2) {
        dragState.moved = true;
    }
    modul.x = x;
    modul.y = y;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    // Während des Ziehens nur eine schnelle Vorschau je Frame – sauber geroutet wird beim Loslassen.
    if (!vorschauGeplant) {
        vorschauGeplant = true;
        requestAnimationFrame(() => {
            vorschauGeplant = false;
            if (dragState) zeichneVerbindungen({ schnell: true });
        });
    }
}


/**
 * @returns {void}
 */
function onCanvasPointerUp() {
    if (!dragState) return;
    const el = document.querySelector(`.topo-modul[data-modul-id="${dragState.modulId}"]`);
    el?.classList.remove('dragging');
    if (dragState.moved) persistCurrentProjekt();
    dragState = null;
    zeichneVerbindungen();
}


/**
 * @param {MouseEvent} event
 * @returns {void}
 */
function onModulClick(event) {
    if (schritt !== 'leitungen' || istGesperrt()) return;
    if (dragState?.moved) return;
    event.stopPropagation();

    const modulId = event.currentTarget.getAttribute('data-modul-id');
    if (!verbindungsModus.vonId) {
        verbindungsModus = { vonId: modulId };
        renderTopologieInhalt();
        return;
    }

    if (verbindungsModus.vonId === modulId) {
        verbindungsModus = { vonId: null };
        renderTopologieInhalt();
        return;
    }

    const topo = getTopo();
    const existiert = topo.verbindungen.some(v =>
        (v.vonModulId === verbindungsModus.vonId && v.nachModulId === modulId)
        || (v.vonModulId === modulId && v.nachModulId === verbindungsModus.vonId)
    );

    if (!existiert) {
        const verbindung = {
            id: generateId('ec'),
            vonModulId: verbindungsModus.vonId,
            nachModulId: modulId,
            reihe: '',
            laenge: 0,
            artikelnummer: ''
        };
        topo.verbindungen.push(verbindung);
        aktiveVerbindungId = verbindung.id;
        speichereTopologie();
    }

    verbindungsModus = { vonId: null };
    renderTopologieInhalt();
}


/** Gut unterscheidbare Leitungsfarben auf dunklem Grund (Reihenfolge = Kettenreihenfolge). */
const LEITUNGS_FARBEN = ['#4cc9f0', '#f4a641', '#7bd88f', '#ff6b9a', '#b892ff', '#ffd166', '#ff8c5a', '#2ec4b6', '#9ad1ff', '#e4f26b'];

/** Abstand der Leitungsbahnen untereinander bzw. zum Modul. */
const SPUR = 12;
/** Länge des Anschlussstücks vom Port nach außen (Port sitzt 18 px innen). */
const STUMMEL = 34;
/** Sicherheitsabstand der Leitungen zu den Modulen. */
const MODUL_ABSTAND = 8;


/**
 * Nummer, Farbe und Modulbezeichnungen je Verbindung.
 * @param {object} topo
 * @returns {Map<string, {nr: number, farbe: string}>}
 */
function getVerbindungsDarstellung(topo) {
    const darstellung = new Map();
    getVerbindungenInKette(topo).forEach((v, index) => {
        darstellung.set(v.id, { nr: index + 1, farbe: LEITUNGS_FARBEN[index % LEITUNGS_FARBEN.length] });
    });
    return darstellung;
}


/**
 * @param {object} modul
 * @returns {string} z. B. „M3“ – Position in der Modulliste.
 */
function getModulKuerzel(modul) {
    const index = getTopo().module.findIndex(m => m.id === modul?.id);
    return index >= 0 ? `M${index + 1}` : '?';
}


/**
 * Richtung, in die ein Port aus dem Modul herauszeigt. Ports sitzen an der Oberkante;
 * die Drehung im Uhrzeigersinn dreht auch die Richtung.
 * @param {object} modul
 * @returns {{x: number, y: number}}
 */
function getPortRichtung(modul) {
    const richtungen = { 0: { x: 0, y: -1 }, 90: { x: 1, y: 0 }, 180: { x: 0, y: 1 }, 270: { x: -1, y: 0 } };
    return richtungen[normalizeRotation(modul.rotation)];
}


/**
 * SVG-Leitungen: jede Verbindung mit eigener Farbe und Nummer, orthogonal um die Module
 * herum geführt. Beim Ziehen eines Moduls reicht eine schnelle Vorschau.
 * @param {{schnell?: boolean}} [optionen]
 * @returns {void}
 */
function zeichneVerbindungen(optionen = {}) {
    const svg = document.getElementById('topo-edges');
    const canvas = document.getElementById('topo-canvas');
    const wrap = document.getElementById('topo-canvas-wrap');
    if (!svg || !canvas || !wrap) return;

    const topo = getTopo();
    const darstellung = getVerbindungsDarstellung(topo);

    const width = Math.max(wrap.clientWidth, canvas.scrollWidth, 900);
    const height = Math.max(wrap.clientHeight, canvas.scrollHeight, 600);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;

    const hindernisse = topo.module.map(modul => {
        const box = getModulBoundingBox(modul, MODUL_ABSTAND);
        return { ...box };
    });
    const bereich = { left: 6, top: 6, right: width - 6, bottom: height - 6 };
    const belegt = [];

    const geroutet = getVerbindungenInKette(topo).map(v => {
        const von = topo.module.find(m => m.id === v.vonModulId);
        const nach = topo.module.find(m => m.id === v.nachModulId);
        if (!von || !nach) return null;

        const a = getModulAnschlusspunkt(von, 'out');
        const b = getModulAnschlusspunkt(nach, 'in');
        const aRichtung = getPortRichtung(von);
        const bRichtung = getPortRichtung(nach);
        const points = optionen.schnell
            ? routeSchnell(a, aRichtung, b, bRichtung)
            : routeVerbindung(a, aRichtung, b, bRichtung, hindernisse, belegt, bereich);
        for (let i = 0; i < points.length - 1; i++) belegt.push([points[i], points[i + 1]]);
        return { v, points, ...darstellung.get(v.id) };
    }).filter(Boolean);

    svg.innerHTML = geroutet.map(({ v, points, nr, farbe }) => {
        const pfad = abgerundeterPfad(points, 9);
        const aktiv = v.id === aktiveVerbindungId ? ' aktiv' : '';
        const text = v.laenge
            ? `${nr} · ${formatLaenge(v.laenge)} m`
            : `${nr} · ${v.reihe ? 'Länge?' : 'Typ?'}`;
        const label = getLabelPosition(points);
        const breite = Math.round(text.length * 7 + 16);
        const ende = points[points.length - 1];
        const vorEnde = points[points.length - 2] || ende;
        const pfeil = pfeilspitze(vorEnde, ende);

        return `
            <g class="topo-edge${aktiv}" data-verbindung-id="${escapeHtml(v.id)}"
               data-von="${escapeHtml(v.vonModulId)}" data-nach="${escapeHtml(v.nachModulId)}"
               style="--farbe: ${farbe}">
                <path class="topo-edge-hit" d="${pfad}" />
                <path class="topo-edge-kontur" d="${pfad}" />
                <path class="topo-edge-line" d="${pfad}" />
                <circle class="topo-edge-start" cx="${Math.round(points[0].x)}" cy="${Math.round(points[0].y)}" r="4.5" />
                <path class="topo-edge-pfeil" d="${pfeil}" />
                <g class="topo-edge-badge" transform="translate(${Math.round(label.x)} ${Math.round(label.y)})">
                    <rect x="${-breite / 2}" y="-10" width="${breite}" height="20" rx="10" />
                    <text y="4">${escapeHtml(text)}</text>
                </g>
            </g>
        `;
    }).join('');

    markiereVerbundenePorts(geroutet);
    bindeLeitungsHover(svg);
}


/**
 * Ring in Leitungsfarbe um belegte Ports – so sieht man am Modul, welche Leitung ankommt.
 * @param {Array<{v: object, farbe: string}>} geroutet
 * @returns {void}
 */
function markiereVerbundenePorts(geroutet) {
    document.querySelectorAll('#topo-canvas .topo-modul-port.verbunden').forEach(port => {
        port.classList.remove('verbunden');
        port.style.removeProperty('--port-farbe');
    });
    geroutet.forEach(({ v, farbe }) => {
        [[v.vonModulId, 'out'], [v.nachModulId, 'in']].forEach(([modulId, art]) => {
            const port = document.querySelector(
                `#topo-canvas .topo-modul[data-modul-id="${CSS.escape(modulId)}"] .topo-modul-port-${art}`
            );
            if (!port) return;
            port.classList.add('verbunden');
            port.style.setProperty('--port-farbe', farbe);
        });
    });
}


/**
 * Hover auf Leitung, Modul oder Listeneintrag hebt die betroffenen Leitungen hervor.
 * @param {SVGElement} svg
 * @returns {void}
 */
function bindeLeitungsHover(svg) {
    svg.querySelectorAll('.topo-edge').forEach(g => {
        const id = g.getAttribute('data-verbindung-id');
        const hit = g.querySelector('.topo-edge-hit');
        if (!hit) return;
        hit.addEventListener('pointerenter', () => hebeLeitungenHervor(v => v.id === id));
        hit.addEventListener('pointerleave', () => hebeLeitungenHervor(null));
        hit.addEventListener('click', event => {
            event.stopPropagation();
            aktiveVerbindungId = id;
            renderTopologieInhalt();
        });
    });
}


/**
 * @param {((v: {id: string, von: string, nach: string}) => boolean)|null} auswahl
 *        null hebt die Hervorhebung auf.
 * @returns {void}
 */
function hebeLeitungenHervor(auswahl) {
    const svg = document.getElementById('topo-edges');
    if (!svg) return;
    svg.classList.toggle('fokus', Boolean(auswahl));
    svg.querySelectorAll('.topo-edge').forEach(g => {
        const treffer = auswahl?.({
            id: g.getAttribute('data-verbindung-id'),
            von: g.getAttribute('data-von'),
            nach: g.getAttribute('data-nach')
        });
        g.classList.toggle('hover', Boolean(treffer));
    });
    document.querySelectorAll('.topo-leitungsliste li[data-verbindung-id]').forEach(li => {
        li.classList.toggle('hover', Boolean(auswahl?.({ id: li.getAttribute('data-verbindung-id'),
            von: li.getAttribute('data-von'), nach: li.getAttribute('data-nach') })));
    });
}


/**
 * Für die Leitungsliste und die Module (onmouseenter im Markup).
 * @param {string} verbindungId
 * @returns {void}
 */
export function topoHebeLeitungHervor(verbindungId) {
    hebeLeitungenHervor(verbindungId ? v => v.id === verbindungId : null);
}


/**
 * @param {string} modulId
 * @returns {void}
 */
export function topoHebeModulHervor(modulId) {
    hebeLeitungenHervor(modulId ? v => v.von === modulId || v.nach === modulId : null);
}


/**
 * Öffnet den Editor einer Leitung aus der Liste.
 * @param {string} verbindungId
 * @returns {void}
 */
export function topoOeffneLeitung(verbindungId) {
    aktiveVerbindungId = verbindungId;
    renderTopologieInhalt();
}


/**
 * Modul-Rechteck (sichtbare Fläche nach Drehung) plus Abstand.
 * @param {object} modul
 * @param {number} [pad]
 * @returns {{left: number, right: number, top: number, bottom: number, id: string}}
 */
function getModulBoundingBox(modul, pad = 18) {
    const { w, h } = getModulBasisAbmessungen(modul);
    const x = Number(modul.x) || 0;
    const y = Number(modul.y) || 0;
    const rot = normalizeRotation(modul.rotation);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const quer = rot === 90 || rot === 270;
    const breite = quer ? h : w;
    const hoehe = quer ? w : h;

    return {
        id: modul.id,
        left: cx - breite / 2 - pad,
        right: cx + breite / 2 + pad,
        top: cy - hoehe / 2 - pad,
        bottom: cy + hoehe / 2 + pad
    };
}


/**
 * Pfad mit abgerundeten Ecken.
 * @param {Array<{x: number, y: number}>} points
 * @param {number} radius
 * @returns {string}
 */
function abgerundeterPfad(points, radius) {
    if (!points.length) return '';
    const r = n => Math.round(n * 10) / 10;
    let d = `M ${r(points[0].x)} ${r(points[0].y)}`;

    for (let i = 1; i < points.length - 1; i++) {
        const vor = points[i - 1];
        const p = points[i];
        const nach = points[i + 1];
        const l1 = Math.hypot(p.x - vor.x, p.y - vor.y);
        const l2 = Math.hypot(nach.x - p.x, nach.y - p.y);
        const k = Math.min(radius, l1 / 2, l2 / 2);
        if (!l1 || !l2) continue;
        const ein = { x: p.x - ((p.x - vor.x) / l1) * k, y: p.y - ((p.y - vor.y) / l1) * k };
        const aus = { x: p.x + ((nach.x - p.x) / l2) * k, y: p.y + ((nach.y - p.y) / l2) * k };
        d += ` L ${r(ein.x)} ${r(ein.y)} Q ${r(p.x)} ${r(p.y)} ${r(aus.x)} ${r(aus.y)}`;
    }

    const letzter = points[points.length - 1];
    return `${d} L ${r(letzter.x)} ${r(letzter.y)}`;
}


/**
 * Kleine Pfeilspitze kurz vor dem IN-Port – zeigt die Richtung OUT → IN.
 * @param {{x: number, y: number}} von
 * @param {{x: number, y: number}} nach
 * @returns {string}
 */
function pfeilspitze(von, nach) {
    const laenge = Math.hypot(nach.x - von.x, nach.y - von.y) || 1;
    const dx = (nach.x - von.x) / laenge;
    const dy = (nach.y - von.y) / laenge;
    const spitze = { x: nach.x - dx * 11, y: nach.y - dy * 11 };
    const basis = { x: spitze.x - dx * 9, y: spitze.y - dy * 9 };
    const r = n => Math.round(n * 10) / 10;
    return `M ${r(spitze.x)} ${r(spitze.y)} L ${r(basis.x - dy * 5)} ${r(basis.y + dx * 5)} `
        + `L ${r(basis.x + dy * 5)} ${r(basis.y - dx * 5)} Z`;
}


/**
 * Etikett mittig auf dem längsten Teilstück (ohne die Anschlussstummel).
 * @param {Array<{x: number, y: number}>} points
 * @returns {{x: number, y: number}}
 */
function getLabelPosition(points) {
    let beste = { x: (points[0].x + points[points.length - 1].x) / 2, y: (points[0].y + points[points.length - 1].y) / 2 };
    let besteLaenge = -1;
    const start = points.length > 3 ? 1 : 0;
    const ende = points.length > 3 ? points.length - 2 : points.length - 1;
    for (let i = start; i < ende; i++) {
        const p = points[i];
        const q = points[i + 1];
        const laenge = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        if (laenge > besteLaenge) {
            besteLaenge = laenge;
            beste = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        }
    }
    return beste;
}


/**
 * Prüft, ob eine achsparallele Strecke das Innere eines Rechtecks schneidet.
 * @returns {boolean}
 */
function streckeSchneidetBox(x1, y1, x2, y2, box) {
    const eps = 0.5;
    if (Math.abs(x1 - x2) < eps) {
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        return x1 > box.left && x1 < box.right && maxY > box.top && minY < box.bottom;
    }
    if (Math.abs(y1 - y2) < eps) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        return y1 > box.top && y1 < box.bottom && maxX > box.left && minX < box.right;
    }
    return false;
}


/**
 * Entfernt doppelte und auf einer Geraden liegende Zwischenpunkte.
 * @param {Array<{x: number, y: number}>} points
 * @returns {Array<{x: number, y: number}>}
 */
function vereinfachePunkte(points) {
    const ohneDoppelte = points.filter((p, i) => i === 0
        || Math.abs(p.x - points[i - 1].x) > 0.5 || Math.abs(p.y - points[i - 1].y) > 0.5);
    return ohneDoppelte.filter((p, i, arr) => {
        if (i === 0 || i === arr.length - 1) return true;
        const vor = arr[i - 1];
        const nach = arr[i + 1];
        const senkrecht = Math.abs(vor.x - p.x) < 0.5 && Math.abs(nach.x - p.x) < 0.5;
        const waagerecht = Math.abs(vor.y - p.y) < 0.5 && Math.abs(nach.y - p.y) < 0.5;
        return !senkrecht && !waagerecht;
    });
}


/**
 * Schnelle Vorschau beim Ziehen: Anschlussstummel plus ein Knick.
 * @returns {Array<{x: number, y: number}>}
 */
function routeSchnell(a, aRichtung, b, bRichtung) {
    const s = { x: a.x + aRichtung.x * STUMMEL, y: a.y + aRichtung.y * STUMMEL };
    const e = { x: b.x + bRichtung.x * STUMMEL, y: b.y + bRichtung.y * STUMMEL };
    const knick = aRichtung.x === 0 ? { x: e.x, y: s.y } : { x: s.x, y: e.y };
    return vereinfachePunkte([a, s, knick, e, b]);
}


/** Richtungsindex 0 → rechts, 1 → unten, 2 → links, 3 → oben. */
const RICHTUNGEN = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

/**
 * @param {{x: number, y: number}} r
 * @returns {number}
 */
function richtungsIndex(r) {
    return RICHTUNGEN.findIndex(d => d.x === r.x && d.y === r.y);
}


/**
 * Kosten für Strecken, die schon von anderen Leitungen belegt sind: parallel
 * übereinander ist teuer (dann nimmt die Leitung die Nachbarbahn), Kreuzen leicht teurer.
 * @param {{x: number, y: number}} p
 * @param {{x: number, y: number}} q
 * @param {Array<Array<{x: number, y: number}>>} belegt
 * @returns {number}
 */
function belegungsKosten(p, q, belegt) {
    let kosten = 0;
    const senkrecht = Math.abs(p.x - q.x) < 0.5;
    for (const [u, w] of belegt) {
        const uSenkrecht = Math.abs(u.x - w.x) < 0.5;
        if (senkrecht && uSenkrecht && Math.abs(p.x - u.x) < SPUR / 2) {
            const ueberlappung = Math.min(Math.max(p.y, q.y), Math.max(u.y, w.y)) - Math.max(Math.min(p.y, q.y), Math.min(u.y, w.y));
            if (ueberlappung > 0) kosten += 60 + ueberlappung * 6;
        } else if (!senkrecht && !uSenkrecht && Math.abs(p.y - u.y) < SPUR / 2) {
            const ueberlappung = Math.min(Math.max(p.x, q.x), Math.max(u.x, w.x)) - Math.max(Math.min(p.x, q.x), Math.min(u.x, w.x));
            if (ueberlappung > 0) kosten += 60 + ueberlappung * 6;
        } else if (senkrecht !== uSenkrecht) {
            const [v1, v2, h1, h2] = senkrecht ? [p, q, u, w] : [u, w, p, q];
            const x = v1.x;
            const y = h1.y;
            if (x > Math.min(h1.x, h2.x) && x < Math.max(h1.x, h2.x)
                && y > Math.min(v1.y, v2.y) && y < Math.max(v1.y, v2.y)) {
                kosten += 18;
            }
        }
    }
    return kosten;
}


/**
 * Orthogonale Leitungsführung per A* auf einem Raster aus Bahnen um die Module
 * (je Modulseite mehrere parallele Spuren). Gesucht wird der kürzeste Weg mit
 * wenig Knicken, der Module nicht schneidet und belegte Bahnen meidet.
 * @param {{x: number, y: number}} a OUT-Port
 * @param {{x: number, y: number}} aRichtung
 * @param {{x: number, y: number}} b IN-Port
 * @param {{x: number, y: number}} bRichtung
 * @param {Array<object>} hindernisse
 * @param {Array<Array<{x: number, y: number}>>} belegt
 * @param {{left: number, top: number, right: number, bottom: number}} bereich
 * @returns {Array<{x: number, y: number}>}
 */
function routeVerbindung(a, aRichtung, b, bRichtung, hindernisse, belegt, bereich) {
    const s = { x: a.x + aRichtung.x * STUMMEL, y: a.y + aRichtung.y * STUMMEL };
    const e = { x: b.x + bRichtung.x * STUMMEL, y: b.y + bRichtung.y * STUMMEL };

    const xs = new Set([s.x, e.x, bereich.left + SPUR, bereich.right - SPUR]);
    const ys = new Set([s.y, e.y, bereich.top + SPUR, bereich.bottom - SPUR]);
    hindernisse.forEach(box => {
        for (let k = 0; k < 4; k++) {
            xs.add(box.left - 2 - k * SPUR);
            xs.add(box.right + 2 + k * SPUR);
            ys.add(box.top - 2 - k * SPUR);
            ys.add(box.bottom + 2 + k * SPUR);
        }
    });
    const imBereich = (wert, min, max) => wert >= min && wert <= max;
    const X = Array.from(xs).filter(x => imBereich(x, bereich.left, bereich.right)).sort((m, n) => m - n);
    const Y = Array.from(ys).filter(y => imBereich(y, bereich.top, bereich.bottom)).sort((m, n) => m - n);
    const nx = X.length;
    const ny = Y.length;
    const si = X.indexOf(s.x);
    const sj = Y.indexOf(s.y);
    const ei = X.indexOf(e.x);
    const ej = Y.indexOf(e.y);
    if (si < 0 || sj < 0 || ei < 0 || ej < 0) return routeSchnell(a, aRichtung, b, bRichtung);

    const imModul = (x, y) => hindernisse.some(box => x > box.left && x < box.right && y > box.top && y < box.bottom);
    const KNICK = 40;
    const startRichtung = richtungsIndex(aRichtung);
    const zielRichtung = richtungsIndex({ x: -bRichtung.x, y: -bRichtung.y });

    // A* über Zustände (Knoten × Ankunftsrichtung) mit binärem Heap.
    const kosten = new Map();
    const herkunft = new Map();
    const heap = [];
    const push = (f, zustand) => {
        heap.push([f, zustand]);
        let i = heap.length - 1;
        while (i > 0) {
            const eltern = (i - 1) >> 1;
            if (heap[eltern][0] <= heap[i][0]) break;
            [heap[eltern], heap[i]] = [heap[i], heap[eltern]];
            i = eltern;
        }
    };
    const pop = () => {
        const oben = heap[0];
        const letzter = heap.pop();
        if (heap.length) {
            heap[0] = letzter;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let klein = i;
                if (l < heap.length && heap[l][0] < heap[klein][0]) klein = l;
                if (r < heap.length && heap[r][0] < heap[klein][0]) klein = r;
                if (klein === i) break;
                [heap[klein], heap[i]] = [heap[i], heap[klein]];
                i = klein;
            }
        }
        return oben;
    };
    const schaetzung = (i, j) => Math.abs(X[i] - e.x) + Math.abs(Y[j] - e.y);
    const schluessel = (i, j, r) => (i * ny + j) * 4 + r;

    const start = schluessel(si, sj, startRichtung);
    kosten.set(start, 0);
    push(schaetzung(si, sj), start);
    let ziel = null;

    while (heap.length) {
        const [f, zustand] = pop();
        const r = zustand % 4;
        const knoten = (zustand - r) / 4;
        const i = Math.floor(knoten / ny);
        const j = knoten % ny;
        const g = kosten.get(zustand);
        if (f - schaetzung(i, j) > g + 0.001) continue;
        if (i === ei && j === ej) {
            ziel = zustand;
            break;
        }

        for (let nr = 0; nr < 4; nr++) {
            if (nr === (r + 2) % 4) continue;
            const ni = i + (nr === 0 ? 1 : nr === 2 ? -1 : 0);
            const nj = j + (nr === 1 ? 1 : nr === 3 ? -1 : 0);
            if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
            const p = { x: X[i], y: Y[j] };
            const q = { x: X[ni], y: Y[nj] };
            if (imModul(q.x, q.y) || hindernisse.some(box => streckeSchneidetBox(p.x, p.y, q.x, q.y, box))) continue;

            let schritt = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
            if (nr !== r) schritt += KNICK;
            if (ni === ei && nj === ej && nr !== zielRichtung) schritt += KNICK;
            schritt += belegungsKosten(p, q, belegt);

            const folge = schluessel(ni, nj, nr);
            const neu = g + schritt;
            if (neu < (kosten.get(folge) ?? Infinity)) {
                kosten.set(folge, neu);
                herkunft.set(folge, zustand);
                push(neu + schaetzung(ni, nj), folge);
            }
        }
    }

    if (ziel === null) return routeSchnell(a, aRichtung, b, bRichtung);

    const weg = [];
    for (let z = ziel; z !== undefined; z = herkunft.get(z)) {
        const knoten = (z - (z % 4)) / 4;
        weg.push({ x: X[Math.floor(knoten / ny)], y: Y[knoten % ny] });
    }
    weg.reverse();
    return vereinfachePunkte([a, ...weg, b]);
}


/**
 * Anschlusskoordinaten: links oben = IN, rechts oben = OUT.
 * @param {object} modul
 * @param {'in'|'out'} port
 * @returns {{x: number, y: number}}
 */
function getModulAnschlusspunkt(modul, port) {
    const rot = normalizeRotation(modul.rotation);
    const x = Number(modul.x) || 0;
    const y = Number(modul.y) || 0;
    const { w, h } = getModulBasisAbmessungen(modul);
    const inset = istSchmalesModul(modul?.artikelnummer) ? 16 : 22;
    const local = port === 'in'
        ? { x: x + inset, y: y + 18 }
        : { x: x + w - inset, y: y + 18 };

    if (!rot) return local;
    return rotatePointClockwise(local.x, local.y, x + w / 2, y + h / 2, rot);
}


/**
 * Popup-Editor für Typ und Länge einer Leitung.
 * @param {string} verbindungId
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderLeitungEditor(verbindungId, gesperrt) {
    const verbindung = getTopo().verbindungen.find(v => v.id === verbindungId);
    if (!verbindung) return '';

    const von = getTopo().module.find(m => m.id === verbindung.vonModulId);
    const nach = getTopo().module.find(m => m.id === verbindung.nachModulId);
    const reihen = getEthercatReihen();
    const aktuelle = reihen.find(r => r.prefix === verbindung.reihe);
    const laengen = aktuelle?.laengen || [];

    return `
        <div class="modal-overlay active topo-leitung-overlay" onclick="topoSchliesseLeitungEditor()">
            <div class="modal-container topo-leitung-modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <span class="modal-icon">🔌</span>
                    <h3>EtherCAT-Leitung</h3>
                </div>
                <div class="modal-body">
                    <p class="text-muted topo-leitung-route">
                        ${escapeHtml(von?.artikelnummer || '?')} → ${escapeHtml(nach?.artikelnummer || '?')}
                    </p>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="topo-leitung-reihe">Leitungstyp / Reihe</label>
                            <select id="topo-leitung-reihe" ${gesperrt ? 'disabled' : ''}
                                    onchange="topoUpdateLeitung('${escapeHtml(verbindungId)}', 'reihe', this.value)">
                                <option value="">-- Bitte wählen --</option>
                                ${reihen.map(r => `
                                    <option value="${escapeHtml(r.prefix)}"${r.prefix === verbindung.reihe ? ' selected' : ''}>
                                        ${escapeHtml(r.prefix)} · ${escapeHtml(r.label)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="topo-leitung-laenge">Länge (m)</label>
                            ${laengen.length ? `
                                <select id="topo-leitung-laenge" ${gesperrt ? 'disabled' : ''}
                                        onchange="topoUpdateLeitung('${escapeHtml(verbindungId)}', 'laenge', this.value)">
                                    <option value="">-- Länge --</option>
                                    ${laengen.map(l => `
                                        <option value="${l}"${Number(verbindung.laenge) === Number(l) ? ' selected' : ''}>
                                            ${formatLaenge(l)} m
                                        </option>
                                    `).join('')}
                                </select>
                            ` : `
                                <input type="number" id="topo-leitung-laenge" min="0" step="0.1"
                                       value="${verbindung.laenge || ''}" ${gesperrt ? 'disabled' : ''}
                                       placeholder="z. B. 1,5"
                                       onchange="topoUpdateLeitung('${escapeHtml(verbindungId)}', 'laenge', this.value)">
                            `}
                        </div>
                    </div>
                    ${verbindung.artikelnummer ? `
                        <p class="topo-leitung-artikel">Artikel: <strong>${escapeHtml(verbindung.artikelnummer)}</strong></p>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-danger" ${gesperrt ? 'disabled' : ''}
                            onclick="topoLoescheLeitung('${escapeHtml(verbindungId)}')">Leitung entfernen</button>
                    <button type="button" class="btn btn-primary" onclick="topoSchliesseLeitungEditor()">Fertig</button>
                </div>
            </div>
        </div>
    `;
}


/**
 * @returns {void}
 */
export function topoSchliesseLeitungEditor() {
    aktiveVerbindungId = null;
    renderTopologieInhalt();
}


/**
 * @param {string} verbindungId
 * @param {'reihe'|'laenge'} feld
 * @param {string} wert
 * @returns {void}
 */
export function topoUpdateLeitung(verbindungId, feld, wert) {
    if (istGesperrt()) return;
    const verbindung = getTopo().verbindungen.find(v => v.id === verbindungId);
    if (!verbindung) return;

    if (feld === 'reihe') {
        verbindung.reihe = wert;
        verbindung.laenge = 0;
        verbindung.artikelnummer = '';
    } else if (feld === 'laenge') {
        const laenge = parseFloat(String(wert).replace(',', '.')) || 0;
        verbindung.laenge = laenge;
        verbindung.artikelnummer = findeArtikelZuReiheLaenge(verbindung.reihe, laenge) || '';
    }

    speichereTopologie();
    renderTopologieInhalt();
}


/**
 * @param {string} prefix
 * @param {number} laenge
 * @returns {string}
 */
function findeArtikelZuReiheLaenge(prefix, laenge) {
    if (!prefix || !laenge) return '';
    const treffer = getKonfektionierteKatalogArtikel({ kategorie: 'ethercat', limit: 500 })
        .find(a => (deriveArtikelPrefix(a.artikelnummer) || a.artikelnummer) === prefix
            && Number(a.laenge) === Number(laenge));
    return treffer?.artikelnummer || '';
}


/**
 * @param {string} verbindungId
 * @returns {void}
 */
export function topoLoescheLeitung(verbindungId) {
    if (istGesperrt()) return;
    const topo = getTopo();
    topo.verbindungen = topo.verbindungen.filter(v => v.id !== verbindungId);
    if (aktiveVerbindungId === verbindungId) aktiveVerbindungId = null;
    speichereTopologie();
    renderTopologieInhalt();
}
