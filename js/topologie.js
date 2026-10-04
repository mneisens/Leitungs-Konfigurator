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


/** @type {'auswahl'|'anordnen'|'leitungen'} */
let schritt = 'auswahl';

/** @type {{vonId: string|null}} */
let verbindungsModus = { vonId: null };

/** @type {{modulId: string, offsetX: number, offsetY: number}|null} */
let dragState = null;

/** @type {string|null} */
let aktiveVerbindungId = null;


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

    persistCurrentProjekt();
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
                <span>${topo.verbindungen.length} Leitung(en)</span>
            </div>
        </div>

        ${aktiveVerbindungId ? renderLeitungEditor(aktiveVerbindungId, gesperrt) : ''}
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

    return `
        <div class="topo-modul${selected}"
             data-modul-id="${escapeHtml(modul.id)}"
             style="left:${Number(modul.x) || 0}px;top:${Number(modul.y) || 0}px;width:${w}px;height:${h}px;"
             title="${escapeHtml(modul.beschreibung || nr)}">
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
                <button type="button" class="topo-modul-drehen" title="Drehen (90°)"
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
    return {
        x: cx + dx * cos + dy * sin,
        y: cy - dx * sin + dy * cos
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
    zeichneVerbindungen();
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
        persistCurrentProjekt();
    }

    verbindungsModus = { vonId: null };
    renderTopologieInhalt();
}


/**
 * SVG-Leitungen eckig von OUT → IN, um Module herum (nicht durch sie hindurch).
 * @returns {void}
 */
function zeichneVerbindungen() {
    const svg = document.getElementById('topo-edges');
    const canvas = document.getElementById('topo-canvas');
    const wrap = document.getElementById('topo-canvas-wrap');
    if (!svg || !canvas || !wrap) return;

    const topo = getTopo();
    const boxen = topo.module.map(getModulBoundingBox);
    // Kollision nur im Modulkörper (ohne Portleiste), damit OUT/IN angebunden werden können
    const hindernisse = topo.module.map(modul => {
        const box = getModulBoundingBox(modul);
        const rot = normalizeRotation(modul.rotation);
        const margin = 40;
        if (rot === 90) return { ...box, left: box.left + margin };
        if (rot === 180) return { ...box, bottom: box.bottom - margin };
        if (rot === 270) return { ...box, right: box.right - margin };
        return { ...box, top: box.top + margin };
    });

    const geroutet = topo.verbindungen.map((v, index) => {
        const von = topo.module.find(m => m.id === v.vonModulId);
        const nach = topo.module.find(m => m.id === v.nachModulId);
        if (!von || !nach) return null;

        const a = getModulAnschlusspunkt(von, 'out');
        const b = getModulAnschlusspunkt(nach, 'in');
        const route = routeOrthogonalUmModule(a, b, hindernisse, index, boxen);
        return { v, route };
    }).filter(Boolean);

    const width = Math.max(wrap.clientWidth, canvas.scrollWidth, 900);
    const height = Math.max(wrap.clientHeight, canvas.scrollHeight, 600);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    canvas.style.paddingTop = '';
    canvas.style.minHeight = '';

    svg.innerHTML = geroutet.map(({ v, route }) => {
        const path = pointsToPath(route.points);
        const aktiv = v.id === aktiveVerbindungId ? ' aktiv' : '';
        const text = v.laenge
            ? `${formatLaenge(v.laenge)} m`
            : (v.reihe ? 'Typ gewählt' : 'Leitung…');

        return `
            <g class="topo-edge${aktiv}" data-verbindung-id="${escapeHtml(v.id)}">
                <path class="topo-edge-hit" d="${path}" />
                <path class="topo-edge-line" d="${path}" />
                <text class="topo-edge-label" x="${route.label.x}" y="${route.label.y}">${escapeHtml(text)}</text>
            </g>
        `;
    }).join('');

    svg.querySelectorAll('.topo-edge').forEach(g => {
        const id = g.getAttribute('data-verbindung-id');
        const hit = g.querySelector('.topo-edge-hit');
        if (!hit) return;

        hit.addEventListener('pointerenter', () => g.classList.add('hover'));
        hit.addEventListener('pointerleave', () => g.classList.remove('hover'));
        hit.addEventListener('click', event => {
            event.stopPropagation();
            aktiveVerbindungId = id;
            renderTopologieInhalt();
        });
    });
}


/**
 * Modul-Rechteck inkl. Sicherheitsabstand für die Leitungsführung.
 * @param {object} modul
 * @returns {{left: number, right: number, top: number, bottom: number, id: string}}
 */
function getModulBoundingBox(modul) {
    const pad = 18;
    const { w, h } = getModulBasisAbmessungen(modul);
    const x = Number(modul.x) || 0;
    const y = Number(modul.y) || 0;
    const rot = normalizeRotation(modul.rotation);
    const cx = x + w / 2;
    const cy = y + h / 2;

    // Visuelle AABB nach CSS-Rotation um die Mitte
    if (rot === 90 || rot === 270) {
        return {
            id: modul.id,
            left: cx - h / 2 - pad,
            right: cx + h / 2 + pad,
            top: cy - w / 2 - pad,
            bottom: cy + w / 2 + pad
        };
    }

    return {
        id: modul.id,
        left: x - pad,
        right: x + w + pad,
        top: y - pad,
        bottom: y + h + pad
    };
}


/**
 * @param {Array<{x: number, y: number}>} points
 * @returns {string}
 */
function pointsToPath(points) {
    if (!points.length) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`).join(' ');
}


/**
 * Prüft, ob eine achsparallele Strecke ein Rechteck schneidet.
 * @returns {boolean}
 */
function streckeSchneidetBox(x1, y1, x2, y2, box) {
    const eps = 0.5;
    if (Math.abs(x1 - x2) < eps) {
        const x = x1;
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        return x > box.left && x < box.right && maxY > box.top && minY < box.bottom;
    }
    if (Math.abs(y1 - y2) < eps) {
        const y = y1;
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        return y > box.top && y < box.bottom && maxX > box.left && minX < box.right;
    }
    return false;
}


/**
 * @param {Array<{x:number,y:number}>} points
 * @param {Array<object>} hindernisse
 * @returns {boolean}
 */
function pfadSchneidetHindernisse(points, hindernisse) {
    for (let i = 0; i < points.length - 1; i++) {
        const p = points[i];
        const q = points[i + 1];
        if (hindernisse.some(box => streckeSchneidetBox(p.x, p.y, q.x, q.y, box))) {
            return true;
        }
    }
    return false;
}


/**
 * Eckige Route OUT → IN: bevorzugt oberhalb, sonst seitlich/unten um den Block.
 * @param {{x: number, y: number}} a OUT
 * @param {{x: number, y: number}} b IN
 * @param {Array<object>} hindernisse Kollisionskörper
 * @param {number} laneIndex
 * @param {Array<object>} [dachBoxen] volle Modulflächen für die Höhenwahl der Bahn
 * @returns {{points: Array<{x:number,y:number}>, label: {x:number,y:number}}}
 */
function routeOrthogonalUmModule(a, b, hindernisse, laneIndex, dachBoxen = hindernisse) {
    const margen = 24;
    const spur = laneIndex * 12;
    const dächer = dachBoxen.length ? dachBoxen : hindernisse;

    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    dächer.forEach(box => {
        left = Math.min(left, box.left);
        right = Math.max(right, box.right);
        top = Math.min(top, box.top);
        bottom = Math.max(bottom, box.bottom);
    });
    if (!Number.isFinite(top)) {
        top = Math.min(a.y, b.y) - 40;
        bottom = Math.max(a.y, b.y) + 40;
        left = Math.min(a.x, b.x) - 40;
        right = Math.max(a.x, b.x) + 40;
    }

    const xMin = Math.min(a.x, b.x);
    const xMax = Math.max(a.x, b.x);
    let laneTop = top - margen - spur;
    dächer.forEach(box => {
        if (box.right < xMin - margen || box.left > xMax + margen) return;
        laneTop = Math.min(laneTop, box.top - margen - spur);
    });
    laneTop = Math.min(laneTop, Math.min(a.y, b.y) - 48 - spur);

    const laneBottom = bottom + margen + spur;
    const viaLeft = left - margen - spur;
    const viaRight = right + margen + spur;

    const kandidaten = [
        // Über den Modulen
        [
            { x: a.x, y: a.y },
            { x: a.x, y: laneTop },
            { x: b.x, y: laneTop },
            { x: b.x, y: b.y }
        ],
        // Unter den Modulen
        [
            { x: a.x, y: a.y },
            { x: a.x, y: laneBottom },
            { x: b.x, y: laneBottom },
            { x: b.x, y: b.y }
        ],
        // Links herum oben
        [
            { x: a.x, y: a.y },
            { x: a.x, y: laneTop },
            { x: viaLeft, y: laneTop },
            { x: viaLeft, y: b.y },
            { x: b.x, y: b.y }
        ],
        // Rechts herum oben
        [
            { x: a.x, y: a.y },
            { x: a.x, y: laneTop },
            { x: viaRight, y: laneTop },
            { x: viaRight, y: b.y },
            { x: b.x, y: b.y }
        ],
        // Links herum unten
        [
            { x: a.x, y: a.y },
            { x: a.x, y: laneBottom },
            { x: viaLeft, y: laneBottom },
            { x: viaLeft, y: b.y },
            { x: b.x, y: b.y }
        ],
        // Rechts herum unten
        [
            { x: a.x, y: a.y },
            { x: a.x, y: laneBottom },
            { x: viaRight, y: laneBottom },
            { x: viaRight, y: b.y },
            { x: b.x, y: b.y }
        ]
    ];

    const bereinigen = points => points.filter((p, i, arr) => {
        if (i === 0) return true;
        return Math.round(p.x) !== Math.round(arr[i - 1].x)
            || Math.round(p.y) !== Math.round(arr[i - 1].y);
    });

    const pfadLaenge = points => {
        let sum = 0;
        for (let i = 1; i < points.length; i++) {
            sum += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
        }
        return sum;
    };

    let best = null;
    let bestScore = Infinity;
    kandidaten.forEach(raw => {
        const points = bereinigen(raw);
        if (points.length < 2) return;
        const trifft = pfadSchneidetHindernisse(points, hindernisse);
        const score = pfadLaenge(points) + (trifft ? 100000 : 0);
        if (score < bestScore) {
            bestScore = score;
            best = points;
        }
    });

    const points = best || bereinigen(kandidaten[0]);
    // Label auf dem längsten horizontalen Segment
    let label = { x: (a.x + b.x) / 2, y: laneTop - 6 };
    let bestHoriz = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const p = points[i];
        const q = points[i + 1];
        if (Math.abs(p.y - q.y) < 1) {
            const len = Math.abs(q.x - p.x);
            if (len > bestHoriz) {
                bestHoriz = len;
                label = { x: (p.x + q.x) / 2, y: p.y - 6 };
            }
        }
    }

    return { points, label };
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

    persistCurrentProjekt();
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
    persistCurrentProjekt();
    renderTopologieInhalt();
}
