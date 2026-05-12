// ========================================
// STATUS PROFILE LOADER
// ========================================
function normalizeStatusKey(key) {
    return String(key || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9._-]/g, '');
}

function cleanStatusValue(value) {
    let cleaned = String(value || '').trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        cleaned = cleaned.slice(1, -1);
    }
    return cleaned.replace(/\\n/g, '\n');
}

function parseTerminalBlockLine(rawLine) {
    const styles = {
        dim: 't-dim',
        bright: 't-bright',
        cyan: 't-cyan',
        amber: 't-amber',
        red: 't-red',
        magenta: 't-magenta'
    };
    const match = String(rawLine ?? '').match(/^@([a-z]+)\s?(.*)$/i);
    if (!match) return { text: String(rawLine ?? ''), className: '' };
    const className = styles[match[1].toLowerCase()];
    return className
        ? { text: match[2], className }
        : { text: String(rawLine ?? ''), className: '' };
}

function parseStatusProfile(content, source) {
    const values = {};
    let section = '';
    let blockSection = '';
    let blockLine = 1;
    let inTextBlock = false;

    String(content || '').replace(/\r/g, '').split('\n').forEach(rawLine => {
        let line = rawLine.trim();

        if (line.startsWith('```')) {
            inTextBlock = !inTextBlock;
            if (inTextBlock) {
                blockSection = section;
                blockLine = 1;
            }
            return;
        }

        if (inTextBlock) {
            if (!blockSection) return;
            const parsed = parseTerminalBlockLine(rawLine);
            values[`${blockSection}.line${blockLine}`] = parsed.text;
            if (parsed.className) values[`${blockSection}.class${blockLine}`] = parsed.className;
            blockLine++;
            return;
        }

        if (!line || line === '---') return;

        const iniSection = line.match(/^\[([a-z0-9_.\-\s]+)\]$/i);
        if (iniSection) {
            section = normalizeStatusKey(iniSection[1]);
            return;
        }

        const markdownSection = line.match(/^#{2,6}\s+([a-z0-9_.-]+)\s*$/i);
        if (markdownSection) {
            section = normalizeStatusKey(markdownSection[1]);
            return;
        }

        if (line.startsWith('#') || line.startsWith('//') || line.startsWith('<!--')) return;
        line = line.replace(/^[-*]\s+/, '');

        const pair = line.match(/^([a-z0-9_.-]+)\s*(?:=|:)\s*(.*)$/i);
        if (!pair) return;

        let key = normalizeStatusKey(pair[1]);
        if (!key) return;
        if (section && !key.includes('.')) key = `${section}.${key}`;
        values[key] = cleanStatusValue(pair[2]);
    });

    return {
        source: source || 'STATUS PROFILE',
        loaded: Object.keys(values).length > 0,
        values
    };
}

function loadStoredStatusProfile() {
    try {
        const stored = JSON.parse(localStorage.getItem(STATUS_PROFILE_STORAGE_KEY) || 'null');
        if (!stored || !stored.content) return;
        const profile = parseStatusProfile(stored.content, stored.source || 'STORED STATUS PROFILE');
        if (profile.loaded) setStatusProfile(profile);
    } catch (error) {
        try { localStorage.removeItem(STATUS_PROFILE_STORAGE_KEY); } catch (storageError) {}
    }
}

function persistStatusProfile(profile, content) {
    try {
        localStorage.setItem(STATUS_PROFILE_STORAGE_KEY, JSON.stringify({
            source: profile.source,
            content
        }));
    } catch (error) {}
}

function clearStoredStatusProfile() {
    try { localStorage.removeItem(STATUS_PROFILE_STORAGE_KEY); } catch (error) {}
}

function statusGet(key, fallback = '') {
    const normalized = normalizeStatusKey(key);
    const value = statusProfile.values[normalized];
    if (value !== undefined && value !== '') return value;
    const contentValue = terminalContent.values[normalized];
    return contentValue === undefined || contentValue === '' ? fallback : contentValue;
}

function statusNumber(key, fallback = 0, min = -Infinity, max = Infinity) {
    const value = Number.parseFloat(statusGet(key, fallback));
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, value));
}

function statusBool(key, fallback = true) {
    const rawValue = statusGet(key, fallback ? 'true' : 'false');
    const value = normalizeStatusKey(rawValue);
    if (['false', '0', 'no', 'off', 'disabled', 'hidden'].includes(value)) return false;
    if (['true', '1', 'yes', 'on', 'enabled', 'visible'].includes(value)) return true;
    return fallback;
}

function statusState(key, fallback = 'ok') {
    const value = normalizeStatusKey(statusGet(key, fallback));
    if (['alert', 'critical', 'danger', 'red', 'fail', 'failed', 'breach', 'unknown', 'offline', 'malfunction', 'disconnected'].includes(value)) return 'alert';
    if (['warn', 'warning', 'amber', 'degraded', 'maintenance', 'service', 'partial', 'low', 'weak', 'intermittent', 'armed'].includes(value)) return 'warn';
    return 'ok';
}

function statusSectionIds(prefix) {
    const prefixKey = `${normalizeStatusKey(prefix)}.`;
    const cached = statusSectionIdCache.get(prefixKey);
    if (cached) return cached.slice();

    const ids = new Set();
    if (!statusProfileKeyCache) {
        statusProfileKeyCache = Array.from(new Set([
            ...Object.keys(terminalContent.values),
            ...Object.keys(statusProfile.values)
        ]));
    }
    statusProfileKeyCache.forEach(key => {
        if (!key.startsWith(prefixKey)) return;
        const id = key.slice(prefixKey.length).split('.')[0];
        if (id) ids.add(id);
    });
    const result = Array.from(ids);
    statusSectionIdCache.set(prefixKey, result);
    return result.slice();
}

function sortStatusIds(a, b) {
    const an = Number.parseInt(a, 10);
    const bn = Number.parseInt(b, 10);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return a.localeCompare(b);
}

async function loadTerminalContent() {
    try {
        const response = await fetch('content/terminal-content.md', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const content = await response.text();
        const profile = parseStatusProfile(content, 'content/terminal-content.md');
        setTerminalContent(profile);
    } catch (error) {
        setTerminalContent({ loaded: false, values: {} });
    }
}

function contentGet(key, fallback = '') {
    const normalized = normalizeStatusKey(key);
    const value = terminalContent.values[normalized];
    return value === undefined || value === '' ? fallback : value;
}

function contentLines(prefix, fallbackLines = []) {
    const lines = [];
    for (let i = 1; i <= 120; i++) {
        const key = normalizeStatusKey(`${prefix}.line${i}`);
        if (Object.prototype.hasOwnProperty.call(terminalContent.values, key)) {
            lines.push(terminalContent.values[key]);
        }
    }
    if (lines.length) return lines;

    const packed = contentGet(`${prefix}.lines`, '');
    if (packed) {
        return packed.split('|').map(line => line.trim()).filter(Boolean);
    }
    return fallbackLines.slice();
}

function contentClass(prefix, index, fallback = '') {
    return contentGet(`${prefix}.class${index + 1}`, fallback);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getBootLogoMarkup(fallbackMarkup) {
    const lines = contentLines('boot.logo', []);
    if (!lines.length) return fallbackMarkup;
    return lines
        .map((line, index) => {
            const className = contentClass('boot.logo', index, '')
                .split(/\s+/)
                .filter(name => /^t-[a-z]+$/i.test(name))
                .join(' ');
            const classAttr = className ? ` class="${escapeHtml(className)}"` : '';
            return `<span${classAttr}>${escapeHtml(line)}</span>`;
        })
        .join('\n');
}

function applyTerminalContentToDom() {
    const title = contentGet('terminal.title', '');
    if (title) {
        document.title = title;
        document.querySelectorAll('.system-title').forEach(element => { element.textContent = title; });
    }

    const build = contentGet('terminal.build', '');
    if (build) {
        document.querySelectorAll('.header-info .hl').forEach((element, index) => {
            if (index === 0) element.textContent = build;
        });
    }

    const diagnosticTitle = contentGet('diagnostic.title', '');
    if (diagnosticTitle) {
        const element = getById('diagnosticTitle');
        if (element) element.textContent = diagnosticTitle;
    }
    const facilityTitle = contentGet('facility.title', '');
    if (facilityTitle) {
        const element = getById('facilityTitle');
        if (element) element.textContent = facilityTitle;
    }
    const accessError = contentGet('admin.access_denied', '');
    if (accessError) {
        const element = getById('accessError');
        if (element) element.textContent = accessError;
    }

    document.querySelectorAll('.menu-item[data-cmd]').forEach(item => {
        const label = contentGet(`commands.${item.dataset.cmd}`, '');
        const labelElement = item.querySelector('span:not(.icon)');
        if (label && labelElement) labelElement.textContent = label.toUpperCase();
    });

    const diagnosticLabels = {
        diagNetworkCard: 'diagnostic.label.network',
        diagSecurityCard: 'diagnostic.label.security',
        diagOutpostCard: 'diagnostic.label.outposts',
        diagGeneratorCard: 'diagnostic.label.generator',
        diagPowerCard: 'diagnostic.label.power',
        diagAlarmCard: 'diagnostic.label.alarm',
        diagLifeCard: 'diagnostic.label.life',
        diagEventsCard: 'diagnostic.label.events',
        diagIntegrityCard: 'diagnostic.label.integrity',
        diagUplinkCard: 'diagnostic.label.uplink'
    };
    Object.entries(diagnosticLabels).forEach(([cardId, key]) => {
        const card = getById(cardId);
        const label = contentGet(key, '');
        const span = card ? card.querySelector('.diagnostic-label span:first-child') : null;
        if (label && span) span.textContent = label.toUpperCase();
    });

    const facilityLabels = {
        facilityOverview: 'facility.label.overview',
        facilityZones: 'facility.label.zones',
        facilityContacts: 'facility.label.contacts'
    };
    Object.entries(facilityLabels).forEach(([readoutId, key]) => {
        const readout = getById(readoutId);
        const label = contentGet(key, '');
        const titleElement = readout ? readout.closest('.facility-card')?.querySelector('.facility-card-title') : null;
        if (label && titleElement) titleElement.textContent = label.toUpperCase();
    });
}

function getBootSequence() {
    const stepIds = statusSectionIds('boot.step').sort(sortStatusIds);
    if (!stepIds.length) return DEFAULT_BOOT_SEQUENCE.map(step => ({ ...step }));

    const sequence = stepIds.map(id => {
        const prefix = `boot.step.${id}`;
        if (!statusBool(`${prefix}.enabled`, true)) return null;
        const type = normalizeStatusKey(statusGet(`${prefix}.type`, 'line'));
        if (type === 'pause') {
            return {
                type: 'pause',
                duration: Math.max(0, Math.round(statusNumber(`${prefix}.duration`, 160, 0, 20000)))
            };
        }
        if (type === 'blank') return { type: 'blank' };
        if (type === 'section') {
            return {
                type: 'section',
                text: statusGet(`${prefix}.text`, '')
            };
        }
        if (type === 'check') {
            return {
                type: 'check',
                label: statusGet(`${prefix}.label`, 'SYSTEM CHECK'),
                result: statusGet(`${prefix}.result`, 'OK'),
                status: normalizeStatusKey(statusGet(`${prefix}.status`, 'ok')),
                final: statusBool(`${prefix}.final`, false)
            };
        }
        return {
            type: 'line',
            text: statusGet(`${prefix}.text`, ''),
            className: statusGet(`${prefix}.class`, statusGet(`${prefix}.className`, ''))
        };
    }).filter(Boolean);

    return sequence.length ? sequence : DEFAULT_BOOT_SEQUENCE.map(step => ({ ...step }));
}

function statusLineGroup(prefix) {
    const cacheKey = normalizeStatusKey(prefix);
    const cached = statusLineGroupCache.get(cacheKey);
    if (cached) return cached.slice();

    const lines = [];
    for (let i = 1; i <= 12; i++) {
        const value = statusGet(`${prefix}.line${i}`, null);
        if (value !== null) lines.push(value);
    }

    if (!lines.length) {
        const packed = statusGet(`${prefix}.lines`, '');
        if (packed) {
            packed.split('|')
                .map(line => line.trim())
                .filter(Boolean)
                .forEach(line => lines.push(line));
        }
    }

    statusLineGroupCache.set(cacheKey, lines);
    return lines.slice();
}

function statusInterpolate(text, frame) {
    return String(text)
        .replace(/\{spinner\}/gi, spinner(frame))
        .replace(/\{sweep(?::(\d+))?\}/gi, (_, width) => asciiSweep(frame, Number(width) || 20))
        .replace(/\{graph(?::(\d+))?\}/gi, (_, width) => asciiGraph(frame, Number(width) || 22))
        .replace(/\{heartbeat(?::(\d+))?\}/gi, (_, width) => heartbeat(frame, Number(width) || 38))
        .replace(/\{bar:([a-z0-9_.-]+)(?::(\d+))?\}/gi, (_, key, width) => asciiBar(statusNumber(key, 0, 0, 100), Number(width) || 18))
        .replace(/\{value:([a-z0-9_.-]+)\}/gi, (_, key) => statusGet(key, ''));
}

function statusBlock(prefix, fallbackLines, frame) {
    const customLines = statusLineGroup(prefix);
    return (customLines.length ? customLines : fallbackLines)
        .map(line => statusInterpolate(line, frame))
        .join('\n');
}

function refreshStatusPanels() {
    if (diagnosticActive) {
        diagnosticFrame = Math.max(diagnosticFrame, 48);
        resetDiagnosticWidgetRegistry();
        renderDiagnosticDashboard(performance.now(), { force: true });
    }
    if (facilityActive) {
        facilityFrame = Math.max(facilityFrame, prefersReducedMotion ? 24 : 10);
        if (window.MapOverlayController?.isActive()) {
            window.MapOverlayController.refreshProfile();
        } else {
            renderFacilityStatus(performance.now());
        }
    }
}

function pauseRealtimePanels() {
    stopSideTelemetryLoop();
    if (window.MapOverlayController?.isActive()) {
        window.MapOverlayController.pause();
    }
    if (diagnosticAnimFrame) {
        cancelAnimationFrame(diagnosticAnimFrame);
        diagnosticAnimFrame = null;
    }
    if (facilityAnimFrame) {
        cancelAnimationFrame(facilityAnimFrame);
        facilityAnimFrame = null;
    }
}

function resumeRealtimePanels() {
    if (prefersReducedMotion || !AppState.networkOnline) return;
    const mapActive = window.MapOverlayController?.isActive();
    if (!mapActive) startSideTelemetryLoop();
    if (diagnosticActive && !diagnosticAnimFrame) {
        diagnosticLastRender = 0;
        diagnosticAnimFrame = requestAnimationFrame(runDiagnosticLoop);
    }
    if (facilityActive && mapActive) {
        window.MapOverlayController.resume();
    } else if (facilityActive && !facilityAnimFrame && !(typeof safeModeActive === 'function' && safeModeActive())) {
        facilityLastRender = 0;
        facilityAnimFrame = requestAnimationFrame(runFacilityLoop);
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        pauseRealtimePanels();
    } else {
        resumeRealtimePanels();
    }
}

function clearStatusProfile() {
    setStatusProfile({
        source: 'INTERNAL DEFAULT',
        loaded: false,
        values: {}
    });
    clearStoredStatusProfile();
    AudioEngine.pageFlip();
    refreshStatusPanels();
    print('');
    print('STATUS PROFILE CLEARED', 't-amber');
    print('Diagnostic and facility panels returned to internal defaults.', 't-dim');
    print('Stored boot/status override removed for the next page load.', 't-dim');
    print('');
}

function showStatusFormatHelp() {
    clearOutput();
    print('═══════════════════════════════════════════════════════', 't-dim');
    print('                STATUS PROFILE FORMAT', 't-bright');
    print('═══════════════════════════════════════════════════════', 't-dim');
    print('');
    print('Use a .txt, .md, or encrypted .dat file with [section] headers and key = value lines.', 't-cyan');
    print('You can also use Markdown headings like ## diagnostic.network.', 't-dim');
    print('Boot overrides are applied on the next page load after STATUS LOAD.', 't-dim');
    print('');
    print('[boot.step.001]', 't-amber');
    print('type = check');
    print('label = EXTERNAL RELAY');
    print('result = FAILED');
    print('status = unknown');
    print('');
    print('[facility.grid]', 't-amber');
    print('id = BDR-01');
    print('structure = 77');
    print('power = 61');
    print('reserve = 34');
    print('repair = 06 OPEN');
    print('');
    print('[facility.zone.lab]', 't-amber');
    print('state = alert');
    print('status = BIO TRACE');
    print('load = 42');
    print('');
    print('[diagnostic.network]', 't-amber');
    print('state = alert');
    print('status = DISCONNECTED');
    print('level = 62');
    print('line1 = FACILITY BUS : LOCAL ONLY {spinner}');
    print('line2 = LOCAL MESH   : {bar:diagnostic.network.level:18}');
    print('line3 = EXT RELAY    : FAILED / NO CARRIER');
    print('');
    print('Tokens: {spinner}, {sweep:20}, {graph:22}, {heartbeat:38},', 't-dim');
    print('        {bar:path.to.number:18}, {value:path.to.key}', 't-dim');
    print('');
    print('Commands: STATUS LOAD, STATUS CLEAR, STATUS FORMAT', 't-cyan');
    print('═══════════════════════════════════════════════════════', 't-dim');
}

// ========================================
// DIAGNOSTIC DASHBOARD
// ========================================
function diagText(id, value) {
    const element = getById(id);
    if (element && element.textContent !== value) element.textContent = value;
}

function diagCardState(id, state = 'ok') {
    const card = getById(id);
    if (!card) return;
    card.classList.toggle('warn', state === 'warn');
    card.classList.toggle('alert', state === 'alert');
}

function asciiBar(value, width = 18) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value)));
    const filled = Math.round((safeValue / 100) * width);
    return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${String(safeValue).padStart(3, '0')}%`;
}

function asciiSweep(frame, width = 24) {
    const pos = Math.abs((frame % (width * 2 - 2)) - (width - 1));
    let output = '';
    for (let i = 0; i < width; i++) output += i === pos ? 'X' : '.';
    return `[${output}]`;
}

function asciiGraph(frame, width = 28) {
    const chars = '._-~=+#';
    let output = '';
    for (let i = 0; i < width; i++) {
        const level = Math.abs(Math.sin((frame + i) * 0.42) + Math.sin((frame * 0.55 + i) * 0.19));
        output += chars[Math.min(chars.length - 1, Math.floor(level * 3.2))];
    }
    return output;
}

function spinner(frame) {
    return ['|', '/', '-', '\\'][frame % 4];
}

function diagnosticLoading(label, frame) {
    const progress = Math.min(99, 16 + frame * 7);
    return [
        `> LOADING ${label}`,
        `  BUS ${asciiBar(progress, 20)}`,
        `  SEEK ${asciiSweep(frame, 22)}`,
        '  WAITING FOR SENSOR ACK...',
        `  DATA ${asciiGraph(frame, 26)}`,
        '  STATUS      : HOLDING'
    ].join('\n');
}

function lifeSignMap(frame) {
    const dots = ['.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.'];
    const liveA = frame % dots.length;
    const liveB = (frame * 2 + 5) % dots.length;
    const unstable = (frame * 3 + 9) % dots.length;
    dots[liveA] = 'o';
    dots[liveB] = 'o';
    dots[unstable] = '!';
    return [
        '+--A-DECK-------------+  +--B-DECK-------------+',
        `| ${dots[0]}  LAB-1   ${dots[1]}  ${dots[2]} |  | ${dots[3]} MED     ${dots[4]}   |`,
        '|    [CORE]     .    |  |    HAB BLOCK       |',
        `| ${dots[5]}  ACCESS  ${dots[6]}  ${dots[7]} |  | ${dots[8]} CRYO    ${dots[9]}  ${dots[10]} |`,
        '+---------------------+  +---------------------+',
        `LOWER SERVICE TUNNEL TRACE: ${dots[11]}`
    ].join('\n');
}

function heartbeat(frame, width = 44) {
    const pattern = '__/\\/\\____/\\___';
    let output = '';
    for (let i = 0; i < width; i++) output += pattern[(frame + i) % pattern.length];
    return output;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const GLYPH_CELL_WIDTH = 8;
const GLYPH_CELL_HEIGHT = 12;
const BLOCK_GLYPHS = '▁▂▃▄▅▆▇█';
const DENSITY_GLYPHS = '░▒▓█';

function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) element.setAttribute(key, String(value));
    });
    return element;
}

function clearSvgLayer(layer) {
    if (layer) layer.replaceChildren();
}

function gridPoint(col, row, cellWidth = GLYPH_CELL_WIDTH, cellHeight = GLYPH_CELL_HEIGHT) {
    return {
        x: Math.round(col) * cellWidth + cellWidth / 2,
        y: Math.round(row) * cellHeight + cellHeight / 2
    };
}

function createSvgWidget(containerOrId, options = {}) {
    const container = typeof containerOrId === 'string' ? getById(containerOrId) : containerOrId;
    if (!container) return null;

    const cols = Math.max(1, Math.round(options.cols || 32));
    const rows = Math.max(1, Math.round(options.rows || 10));
    const cellWidth = Math.max(1, Number(options.cellWidth || GLYPH_CELL_WIDTH));
    const cellHeight = Math.max(1, Number(options.cellHeight || GLYPH_CELL_HEIGHT));
    const width = cols * cellWidth;
    const height = rows * cellHeight;
    const widgetKey = `${cols}x${rows}:${cellWidth}x${cellHeight}:${options.kind || 'glyph'}`;

    let svg = container.firstElementChild?.classList?.contains('telemetry-svg')
        ? container.firstElementChild
        : null;
    if (!svg || svg.dataset.widgetKey !== widgetKey) {
        container.textContent = '';
        svg = svgElement('svg', {
            class: `telemetry-svg ${options.className || ''}`.trim(),
            viewBox: `0 0 ${width} ${height}`,
            preserveAspectRatio: 'none',
            'aria-hidden': 'true',
            focusable: 'false',
            'data-widget-key': widgetKey
        });
        const guide = svgElement('g', { 'data-layer': 'guide' });
        const glyph = svgElement('g', { 'data-layer': 'glyph' });
        const label = svgElement('g', { 'data-layer': 'label' });
        [guide, glyph, label].forEach(layer => {
            layer.dataset.cellWidth = String(cellWidth);
            layer.dataset.cellHeight = String(cellHeight);
        });
        svg.append(guide, glyph, label);
        container.appendChild(svg);
    } else {
        svg.setAttribute('class', `telemetry-svg ${options.className || ''}`.trim());
    }

    const guideLayer = svg.querySelector('[data-layer="guide"]');
    const glyphLayer = svg.querySelector('[data-layer="glyph"]');
    const labelLayer = svg.querySelector('[data-layer="label"]');
    return { container, svg, guideLayer, glyphLayer, labelLayer, cols, rows, cellWidth, cellHeight, width, height };
}

function svgTextGlyph(layer, glyph, col, row, options = {}) {
    if (!layer || glyph === undefined || glyph === null) return null;
    const cellWidth = Number(options.cellWidth || layer.dataset.cellWidth || GLYPH_CELL_WIDTH);
    const cellHeight = Number(options.cellHeight || layer.dataset.cellHeight || GLYPH_CELL_HEIGHT);
    const point = gridPoint(col, row, cellWidth, cellHeight);
    const text = svgElement('text', {
        x: point.x,
        y: point.y,
        class: `telemetry-glyph ${options.className || 'telemetry-green'}`.trim(),
        opacity: options.opacity ?? 1
    });
    if (options.fontSize) text.setAttribute('font-size', options.fontSize);
    text.textContent = String(glyph);
    layer.appendChild(text);
    return text;
}

function svgLabel(layer, text, col, row, options = {}) {
    if (!layer || text === undefined || text === null) return null;
    const cellWidth = Number(options.cellWidth || layer.dataset.cellWidth || GLYPH_CELL_WIDTH);
    const cellHeight = Number(options.cellHeight || layer.dataset.cellHeight || GLYPH_CELL_HEIGHT);
    const point = gridPoint(col, row, cellWidth, cellHeight);
    const label = svgElement('text', {
        x: point.x,
        y: point.y,
        class: `telemetry-label ${options.className || 'telemetry-dim'}`.trim(),
        opacity: options.opacity ?? 1
    });
    if (options.anchor) label.setAttribute('text-anchor', options.anchor);
    if (options.fontSize) label.setAttribute('font-size', options.fontSize);
    label.textContent = String(text);
    layer.appendChild(label);
    return label;
}

function renderGlyphRow(layer, row, glyphs, options = {}) {
    String(glyphs || '').split('').forEach((glyph, index) => {
        svgTextGlyph(layer, glyph, (options.col || 0) + index, row, options);
    });
}

function renderGlyphMatrix(layer, matrix, options = {}) {
    (matrix || []).forEach((rowGlyphs, rowIndex) => {
        renderGlyphRow(layer, (options.row || 0) + rowIndex, rowGlyphs, options);
    });
}

function drawSvgGuideLine(widget, col1, row1, col2, row2, options = {}) {
    const start = gridPoint(col1, row1, widget.cellWidth, widget.cellHeight);
    const end = gridPoint(col2, row2, widget.cellWidth, widget.cellHeight);
    widget.guideLayer.appendChild(svgElement('line', {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        class: `telemetry-guide ${options.className || 'telemetry-dim'}`.trim(),
        opacity: options.opacity ?? 0.16
    }));
}

function drawSvgGuideRect(widget, col, row, cols, rows, options = {}) {
    widget.guideLayer.appendChild(svgElement('rect', {
        x: col * widget.cellWidth,
        y: row * widget.cellHeight,
        width: cols * widget.cellWidth,
        height: rows * widget.cellHeight,
        class: `telemetry-guide ${options.className || 'telemetry-dim'}`.trim(),
        opacity: options.opacity ?? 0.16
    }));
}

function drawSvgGuideCircle(widget, col, row, radiusCols, options = {}) {
    const point = gridPoint(col, row, widget.cellWidth, widget.cellHeight);
    widget.guideLayer.appendChild(svgElement('circle', {
        cx: point.x,
        cy: point.y,
        r: radiusCols * widget.cellWidth,
        class: `telemetry-guide ${options.className || 'telemetry-dim'}`.trim(),
        opacity: options.opacity ?? 0.16
    }));
}

function svgPolyline(layer, points, options = {}) {
    if (!layer || !points?.length) return null;
    const polyline = svgElement('polyline', {
        points: points.map(point => `${Number(point.x).toFixed(1)},${Number(point.y).toFixed(1)}`).join(' '),
        class: `telemetry-trace ${options.className || 'telemetry-green'}`.trim(),
        opacity: options.opacity ?? 0.86
    });
    if (options.strokeWidth) polyline.setAttribute('stroke-width', options.strokeWidth);
    layer.appendChild(polyline);
    return polyline;
}

function svgPath(layer, d, options = {}) {
    if (!layer || !d) return null;
    const path = svgElement('path', {
        d,
        class: `telemetry-trace ${options.className || 'telemetry-green'}`.trim(),
        opacity: options.opacity ?? 0.86
    });
    if (options.strokeWidth) path.setAttribute('stroke-width', options.strokeWidth);
    layer.appendChild(path);
    return path;
}

function svgLayerLine(layer, x1, y1, x2, y2, options = {}) {
    if (!layer) return null;
    const line = svgElement('line', {
        x1,
        y1,
        x2,
        y2,
        class: `telemetry-trace ${options.className || 'telemetry-green'}`.trim(),
        opacity: options.opacity ?? 0.74
    });
    if (options.strokeWidth) line.setAttribute('stroke-width', options.strokeWidth);
    layer.appendChild(line);
    return line;
}

function svgLayerRect(layer, x, y, width, height, options = {}) {
    if (!layer) return null;
    const rect = svgElement('rect', {
        x,
        y,
        width,
        height,
        class: options.className || 'telemetry-fill telemetry-green',
        opacity: options.opacity ?? 0.12
    });
    layer.appendChild(rect);
    return rect;
}

function blockGlyph(value) {
    const index = Math.max(0, Math.min(BLOCK_GLYPHS.length - 1, Math.round(value * (BLOCK_GLYPHS.length - 1))));
    return BLOCK_GLYPHS[index];
}

function densityGlyph(value) {
    const index = Math.max(0, Math.min(DENSITY_GLYPHS.length - 1, Math.floor(value * DENSITY_GLYPHS.length)));
    return DENSITY_GLYPHS[index];
}

function shortTelemetryLine(value, width) {
    return String(value || '').replace(/\s+/g, ' ').slice(0, width).padEnd(width, ' ');
}

function fixedTelemetryLine(value, width) {
    return String(value || '').replace(/\t/g, ' ').slice(0, width).padEnd(width, ' ');
}

function glyphProgressBar(value, width = 10) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value)));
    const filled = Math.round((safeValue / 100) * width);
    return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function shiftedGlyphPattern(pattern, frame, width, step = 1) {
    const glyphs = Array.from(pattern || '');
    if (!glyphs.length) return ''.padEnd(width, ' ');
    let output = '';
    for (let i = 0; i < width; i++) output += glyphs[(frame * step + i) % glyphs.length];
    return output;
}

function renderFixedGlyphLine(layer, row, text, options = {}) {
    renderGlyphRow(layer, row, fixedTelemetryLine(text, options.width || 40), {
        col: options.col || 1,
        className: options.className || 'telemetry-green',
        opacity: options.opacity ?? 0.84
    });
}

function renderWidgetFrame(widget, options = {}) {
    clearSvgLayer(widget.guideLayer);
    clearSvgLayer(widget.glyphLayer);
    clearSvgLayer(widget.labelLayer);
    drawSvgGuideRect(widget, 0, 0, widget.cols, widget.rows, { opacity: 0.2, className: options.className || 'telemetry-green' });
}

function renderDiagnosticBootRouteWidget(id, frame, progress) {
    const widget = createSvgWidget(id, { cols: 42, rows: 10, kind: 'diag-boot-route' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, 'NETWORK TOPOLOGY // BOOT', 1, 1, { className: 'telemetry-amber' });
    [
        '[CORE]─[BUS-A]─[LAB-01]',
        '   │      └──[LAB-02]',
        '   ├─────────[ARCHIVE]',
        '   └─[SEC]─[GATE]─[RELAY]'
    ].forEach((line, index) => renderFixedGlyphLine(widget.glyphLayer, index + 3, line, {
        col: 2,
        width: 32,
        className: index === 3 ? 'telemetry-amber' : 'telemetry-cyan',
        opacity: 0.86
    }));
    const packetPath = [8, 14, 22, 30, 34];
    svgTextGlyph(widget.glyphLayer, frame % 4 < 2 ? '●' : '◆', packetPath[frame % packetPath.length], 3 + Math.min(3, frame % 4), { className: 'telemetry-green' });
    renderFixedGlyphLine(widget.glyphLayer, 8, `PACKET BUS ${glyphProgressBar(progress, 12)} ${String(progress).padStart(2, '0')}%`, {
        col: 2,
        width: 36,
        className: 'telemetry-green'
    });
}

function renderDiagnosticBootProcessWidget(id, frame, progress) {
    const widget = createSvgWidget(id, { cols: 42, rows: 10, kind: 'diag-boot-process' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'PROCESS ARRAY', 1, 1, { className: 'telemetry-amber' });
    const spinner = ['◢', '◐', '◒', '◣'];
    [
        ['INDEXING ARCHIVE', progress + 8],
        ['DECRYPTING SECURITY', progress - 14],
        ['SCANNING RESIDUE', progress + 21],
        ['LOCKING PERIMETER', progress - 4]
    ].forEach(([label, value], index) => {
        const safeValue = Math.max(4, Math.min(99, Math.round(value)));
        const cls = index === 1 ? 'telemetry-amber' : 'telemetry-green';
        renderFixedGlyphLine(widget.glyphLayer, index + 3, `${spinner[(frame + index) % spinner.length]} ${label.padEnd(20, ' ')} ${glyphProgressBar(safeValue, 8)} ${String(safeValue).padStart(2, '0')}%`, {
            col: 2,
            width: 38,
            className: cls
        });
    });
}

function renderDiagnosticBootRadarWidget(id, frame, progress) {
    const widget = createSvgWidget(id, { cols: 34, rows: 11, kind: 'diag-boot-radar' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-cyan' });
    const centerCol = 17;
    const centerRow = 5;
    [2, 4, 6, 8].forEach(radius => drawSvgGuideCircle(widget, centerCol, centerRow, radius, { opacity: 0.11, className: 'telemetry-cyan' }));
    drawSvgGuideLine(widget, centerCol, 1, centerCol, 9, { opacity: 0.13, className: 'telemetry-cyan' });
    drawSvgGuideLine(widget, 5, centerRow, 29, centerRow, { opacity: 0.13, className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, 'TRIANGULATING', 1, 1, { className: 'telemetry-amber' });
    const angle = prefersReducedMotion ? -0.4 : frame * 0.33;
    const trail = '·:+*#';
    for (let step = 1; step <= 8; step++) {
        const col = centerCol + Math.round(Math.cos(angle) * step * 1.25);
        const row = centerRow + Math.round(Math.sin(angle) * step * 0.55);
        svgTextGlyph(widget.glyphLayer, trail[Math.min(trail.length - 1, Math.floor(step / 2))], col, row, { className: 'telemetry-green', opacity: 0.46 + step * 0.05 });
    }
    [
        ['△', 9, 3, 'telemetry-green'],
        ['□', 24, 4, 'telemetry-cyan'],
        ['◇', 21, 7, 'telemetry-red']
    ].forEach(([glyph, col, row, cls]) => svgTextGlyph(widget.glyphLayer, glyph, col, row, { className: cls, opacity: cls === 'telemetry-red' && frame % 6 < 3 ? 0.5 : 1 }));
    renderFixedGlyphLine(widget.glyphLayer, 9, `RELAY LOCK ${glyphProgressBar(progress, 8)} ${String(progress).padStart(2, '0')}%`, {
        col: 2,
        width: 29,
        className: 'telemetry-amber'
    });
}

function renderDiagnosticBootSignalWidget(id, frame, progress) {
    const widget = createSvgWidget(id, { cols: 42, rows: 10, kind: 'diag-boot-signal' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-amber' });
    for (let col = 4; col < widget.cols; col += 4) drawSvgGuideLine(widget, col, 2, col, 7, { opacity: 0.08, className: 'telemetry-green' });
    for (let row = 3; row < 8; row += 2) drawSvgGuideLine(widget, 2, row, 39, row, { opacity: 0.08, className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'SIGNAL OSCILLOSCOPE // CAL', 1, 1, { className: 'telemetry-amber' });
    const signal = shiftedGlyphPattern('▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▁▂▃▄', frame, 28);
    renderFixedGlyphLine(widget.glyphLayer, 4, `MANA ${signal}`, { col: 2, width: 38, className: 'telemetry-green' });
    const pulse = shiftedGlyphPattern('────╮╭────────╮╭──────', frame, 25);
    renderFixedGlyphLine(widget.glyphLayer, 6, `SYNC ${pulse}`, { col: 2, width: 38, className: 'telemetry-cyan' });
    renderFixedGlyphLine(widget.glyphLayer, 8, `BUFFER ${glyphProgressBar(progress, 12)} ${String(progress).padStart(2, '0')}%`, { col: 2, width: 36, className: 'telemetry-amber' });
}

function renderDiagnosticBootStatusWidget(id, frame, progress) {
    const widget = createSvgWidget(id, { cols: 42, rows: 10, kind: 'diag-boot-status' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'SYSTEM STATUS', 1, 1, { className: 'telemetry-amber' });
    [
        ['CORE TEMP', 48, 'telemetry-green'],
        ['POWER GRID', Math.min(100, progress + 21), 'telemetry-green'],
        ['UPLINK', Math.max(9, progress - 18), 'telemetry-amber'],
        ['ARCHIVE BUS', Math.min(100, progress + 8), 'telemetry-cyan'],
        ['SEC LAYER', 100, 'telemetry-green']
    ].forEach(([label, value, cls], index) => {
        const display = label === 'CORE TEMP' ? '048C' : `${String(Math.round(value)).padStart(3, '0')}%`;
        renderFixedGlyphLine(widget.glyphLayer, index + 3, `${label.padEnd(12, ' ')} ${display} [${glyphProgressBar(value, 8)}]`, {
            col: 2,
            width: 37,
            className: cls
        });
    });
}

function renderDiagnosticBootContainmentWidget(id, frame, progress) {
    const widget = createSvgWidget(id, { cols: 42, rows: 10, kind: 'diag-boot-containment' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, 'LIVE TELEMETRY // ARMING', 1, 1, { className: 'telemetry-amber' });
    const gate = shiftedGlyphPattern('▁▂▃▄▅▇█▇▅▃▂▁▂▃▄▆█', frame, 17);
    const noise = shiftedGlyphPattern('░▒▓▒░▒▓█▓▒░▒░▓▒░▒▓', frame, 17);
    const containment = shiftedGlyphPattern('▄▅▆█▇▅▄▃▂▁▂▄▆█▇▅', frame, 17);
    renderFixedGlyphLine(widget.glyphLayer, 3, `GATE STABILITY ${gate} ${String(Math.max(12, progress - 31)).padStart(2, '0')}%`, { col: 2, width: 38, className: 'telemetry-green' });
    renderFixedGlyphLine(widget.glyphLayer, 5, `ENTITY NOISE   ${noise} ${String(Math.min(99, progress + 19)).padStart(2, '0')}%`, { col: 2, width: 38, className: 'telemetry-cyan' });
    renderFixedGlyphLine(widget.glyphLayer, 7, `CONTAINMENT    ${containment} WARN`, { col: 2, width: 38, className: 'telemetry-amber' });
    svgTextGlyph(widget.glyphLayer, ['◢', '◐', '◒', '◣'][frame % 4], 36, 8, { className: 'telemetry-red', opacity: 0.78 });
}

function renderDiagnosticBootBioWidget(id, frame, progress) {
    const widget = createSvgWidget(id, { cols: 82, rows: 10, kind: 'diag-boot-bio' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-red' });
    svgLabel(widget.labelLayer, 'BIO-MONITOR // SUBJECT VITAL TRACE', 1, 1, { className: 'telemetry-amber' });
    const traces = [
        ['SUBJ-01', shiftedGlyphPattern('──────╮╭───────╮╭────────╮╭───────', frame, 44)],
        ['SUBJ-02', shiftedGlyphPattern('───╮╭─╮  ╭──────╮╭─╮     ╭──────', frame + 2, 44)],
        ['SUBJ-03', shiftedGlyphPattern('─────────────╮╭─────────────────', frame + 4, 44)]
    ];
    traces.forEach(([label, trace], index) => {
        renderFixedGlyphLine(widget.glyphLayer, 3 + index * 2, `${label}  ${trace}`, {
            col: 2,
            width: 64,
            className: index === 2 ? 'telemetry-amber' : 'telemetry-green'
        });
    });
    renderFixedGlyphLine(widget.glyphLayer, 9, `NEURAL COHERENCE ${glyphProgressBar(progress, 18)} ${String(progress).padStart(2, '0')}%`, {
        col: 2,
        width: 58,
        className: 'telemetry-cyan'
    });
}

function renderDiagnosticBootWidget(id, label, frame) {
    const progress = Math.max(8, Math.min(99, Math.round(12 + frame * 7.4)));
    if (id === 'diagNetwork') return renderDiagnosticBootRouteWidget(id, frame, progress);
    if (id === 'diagSecurity') return renderDiagnosticBootContainmentWidget(id, frame, progress);
    if (id === 'diagOutpost') return renderDiagnosticBootRadarWidget(id, frame, progress);
    if (id === 'diagGenerator') return renderDiagnosticBootSignalWidget(id, frame, progress);
    if (id === 'diagPower') return renderDiagnosticBootStatusWidget(id, frame, progress);
    if (id === 'diagAlarm') return renderBlackDesertMapDashboardWidget(id, frame, { mode: 'boot', detail: progress / 100, sensorProgress: progress });
    if (id === 'diagLife') return renderDiagnosticBootBioWidget(id, frame, progress);
    renderStatusLinesWidget(id, [`BOOTING ${label}`, `BUS ${glyphProgressBar(progress, 14)} ${progress}%`], frame, { kind: 'diag-boot-fallback' });
}

function renderOscilloscopeWidget(id, frame, generatorValue) {
    const widget = createSvgWidget(id, { cols: 42, rows: 10, kind: 'oscilloscope' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-amber' });
    for (let col = 4; col < widget.cols; col += 4) drawSvgGuideLine(widget, col, 1, col, 8, { opacity: 0.09, className: 'telemetry-green' });
    for (let row = 2; row < 9; row += 2) drawSvgGuideLine(widget, 1, row, 40, row, { opacity: 0.1, className: 'telemetry-green' });
    drawSvgGuideLine(widget, 1, 5, 40, 5, { opacity: 0.2, className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, 'TRACE A', 1, 1, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'TRACE B', 12, 1, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, `SYNC ${statusGet('diagnostic.generator.core', 'LOCKED').toUpperCase().slice(0, 10)}`, 24, 1, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, `RATE ${statusGet('diagnostic.generator.sample_rate', '44.1K')}`, 31, 9, { className: 'telemetry-dim' });

    const load = Math.max(0, Math.min(1, generatorValue / 100));
    for (let col = 2; col < 40; col++) {
        const t = frame * 0.23 + col * 0.34;
        const a = 0.5 + Math.sin(t) * 0.28 + Math.sin(t * 0.43) * 0.1;
        const b = 0.5 + Math.cos(t * 0.74 + load * 2) * 0.22 + Math.sin(t * 0.18) * 0.12;
        const rowA = Math.max(2, Math.min(8, Math.round(8 - a * 6)));
        const rowB = Math.max(2, Math.min(8, Math.round(8 - b * 6)));
        svgTextGlyph(widget.glyphLayer, blockGlyph(a), col, rowA, { className: 'telemetry-green' });
        svgTextGlyph(widget.glyphLayer, rowA === rowB ? '█' : blockGlyph(b), col, rowB, { className: rowA === rowB ? 'telemetry-amber' : 'telemetry-cyan', opacity: rowA === rowB ? 0.95 : 0.86 });
    }
}

function renderRadarWidget(id, frame) {
    const widget = createSvgWidget(id, { cols: 34, rows: 11, kind: 'radar' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-cyan' });
    const centerCol = 17;
    const centerRow = 5;
    [2, 4, 6, 8].forEach(radius => drawSvgGuideCircle(widget, centerCol, centerRow, radius, { opacity: 0.12, className: 'telemetry-cyan' }));
    drawSvgGuideLine(widget, centerCol, 0, centerCol, 10, { opacity: 0.14, className: 'telemetry-cyan' });
    drawSvgGuideLine(widget, 4, centerRow, 30, centerRow, { opacity: 0.14, className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, '000', 16, 0, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, '180', 16, 10, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, 'RELAYS', 1, 1, { className: 'telemetry-amber' });

    const angle = prefersReducedMotion ? -0.6 : frame * 0.16;
    const sweepGlyphs = '·:+*#';
    for (let step = 1; step <= 9; step++) {
        const col = centerCol + Math.round(Math.cos(angle) * step * 1.25);
        const row = centerRow + Math.round(Math.sin(angle) * step * 0.55);
        if (col > 1 && col < widget.cols - 1 && row > 0 && row < widget.rows) {
            svgTextGlyph(widget.glyphLayer, sweepGlyphs[Math.min(sweepGlyphs.length - 1, Math.floor(step / 2))], col, row, { className: 'telemetry-green', opacity: 0.45 + step * 0.05 });
        }
    }

    [
        { glyph: '△', angle: -0.8, radius: 7.5, cls: 'telemetry-amber' },
        { glyph: '□', angle: 0.45, radius: 5.6, cls: 'telemetry-green' },
        { glyph: '◇', angle: 1.9, radius: 6.9, cls: 'telemetry-red' },
        { glyph: '○', angle: 2.9, radius: 4.8, cls: 'telemetry-cyan' }
    ].forEach((contact, index) => {
        const pulse = prefersReducedMotion ? 0 : Math.sin(frame * 0.12 + index) * 0.6;
        const col = centerCol + Math.round(Math.cos(contact.angle + pulse * 0.03) * contact.radius * 1.2);
        const row = centerRow + Math.round(Math.sin(contact.angle + pulse * 0.03) * contact.radius * 0.55);
        svgTextGlyph(widget.glyphLayer, contact.glyph, col, row, { className: contact.cls, opacity: contact.cls === 'telemetry-red' && frame % 8 < 4 ? 0.55 : 1 });
    });
}

function renderHeatmapWidget(id, frame, mainPower, reservePower) {
    const widget = createSvgWidget(id, { cols: 34, rows: 10, kind: 'heatmap' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'MAIN BUS', 1, 1, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, 'RESERVE', 1, 8, { className: 'telemetry-cyan' });
    for (let row = 2; row <= 7; row++) {
        for (let col = 2; col <= 31; col++) {
            const centerBias = 1 - Math.min(1, Math.abs(col - 17) / 16);
            const powerBias = row < 5 ? mainPower / 100 : reservePower / 100;
            const noise = (Math.sin(frame * 0.17 + col * 0.48 + row * 0.91) + 1) * 0.18;
            const value = Math.max(0, Math.min(1, powerBias * 0.64 + centerBias * 0.24 + noise));
            const cls = value > 0.82 ? 'telemetry-red' : value > 0.62 ? 'telemetry-amber' : 'telemetry-green';
            svgTextGlyph(widget.glyphLayer, densityGlyph(value), col, row, { className: cls, opacity: 0.62 + value * 0.38 });
        }
    }
}

function renderWaterfallWidget(id, frame, networkValue) {
    const widget = createSvgWidget(id, { cols: 40, rows: 10, kind: 'waterfall' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, 'SPECTRUM WATERFALL', 1, 1, { className: 'telemetry-amber' });
    for (let row = 2; row < 9; row++) {
        for (let col = 1; col < 39; col++) {
            const band = Math.sin((col + frame * 0.8 - row * 2.4) * 0.34);
            const carrier = Math.sin((col - 20) * 0.18) * 0.24;
            const level = Math.max(0, Math.min(1, networkValue / 120 + band * 0.26 + carrier + Math.sin(row + frame * 0.12) * 0.08));
            const cls = level > 0.82 ? 'telemetry-red' : level > 0.64 ? 'telemetry-amber' : level > 0.42 ? 'telemetry-green' : 'telemetry-dim';
            svgTextGlyph(widget.glyphLayer, densityGlyph(level), col, row, { className: cls, opacity: 0.5 + level * 0.46 });
        }
    }
}

function renderStatusLinesWidget(id, lines, frame, options = {}) {
    const widget = createSvgWidget(id, { cols: options.cols || 40, rows: options.rows || 10, kind: options.kind || 'status-lines' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: options.className || 'telemetry-green' });
    (lines || []).slice(0, widget.rows - 3).forEach((line, index) => {
        renderGlyphRow(widget.glyphLayer, index + 1, shortTelemetryLine(line, widget.cols - 2), {
            col: 1,
            className: index === 0 ? (options.headerClass || 'telemetry-amber') : (options.className || 'telemetry-green'),
            opacity: index === 0 ? 0.96 : 0.78
        });
    });
    const trace = asciiGraph(frame, widget.cols - 6).replace(/[._\-=+#~]/g, char => {
        if (char === '.' || char === '_') return '·';
        if (char === '-' || char === '=') return ':';
        if (char === '~' || char === '+') return '*';
        return '#';
    });
    renderGlyphRow(widget.glyphLayer, widget.rows - 1, trace, { col: 3, className: options.traceClass || 'telemetry-cyan', opacity: 0.82 });
}

function renderBioscanWidget(id, frame, stats = {}) {
    const widget = createSvgWidget(id, { cols: 82, rows: 10, kind: 'bioscan' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-red' });
    const lifeCount = stats.lifeCount || 0;
    const unstableLife = stats.unstableLife || 0;
    const unknownLife = stats.unknownLife || 0;
    renderGlyphRow(widget.glyphLayer, 1, shortTelemetryLine(`BIO COUNT ${String(lifeCount).padStart(2, '0')} // UNSTABLE ${String(unstableLife).padStart(2, '0')} // UNKNOWN ${String(unknownLife).padStart(2, '0')}`, 34), { col: 1, className: 'telemetry-amber' });
    renderGlyphRow(widget.glyphLayer, 3, shortTelemetryLine(`O2 SAT ${statusGet('diagnostic.life.o2', '91%')}  RESP ${statusGet('diagnostic.life.resp', 'ERRATIC')}`, 34), { col: 1, className: 'telemetry-green' });
    renderGlyphRow(widget.glyphLayer, 5, shortTelemetryLine(`NEURAL ${statusGet('diagnostic.life.neural', 'COHERENCE LOW')}`, 34), { col: 1, className: 'telemetry-cyan' });
    drawSvgGuideLine(widget, 37, 5, 78, 5, { opacity: 0.18, className: 'telemetry-red' });
    for (let col = 38; col < 78; col++) {
        const index = (frame + col) % 17;
        const pattern = index < 3 ? '─' : index < 5 ? '╱' : index < 7 ? '╲' : index < 12 ? '─' : index < 14 ? '╱' : '╲';
        const row = 5 + (pattern === '╱' ? -1 : pattern === '╲' ? 1 : 0);
        svgTextGlyph(widget.glyphLayer, pattern, col, row, { className: row === 5 ? 'telemetry-green' : 'telemetry-red' });
    }
    ['○', '│', '│', '△'].forEach((glyph, index) => svgTextGlyph(widget.glyphLayer, glyph, 72, 2 + index, { className: 'telemetry-cyan', opacity: 0.8 }));
}

function clampDiagnostic(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}

function smoothDiagnostic(value) {
    const t = clampDiagnostic(value);
    return t * t * (3 - 2 * t);
}

function mixDiagnostic(from, to, amount) {
    return from + (to - from) * clampDiagnostic(amount);
}

function getDiagnosticPhase(frame) {
    const bootFrames = 24;
    const transitionFrames = 24;
    const liveFrame = bootFrames + transitionFrames;
    const effectiveFrame = prefersReducedMotion ? liveFrame : Math.max(0, frame);
    const bootProgress = smoothDiagnostic(effectiveFrame / bootFrames);
    const transitionProgress = smoothDiagnostic((effectiveFrame - bootFrames) / transitionFrames);
    const detail = prefersReducedMotion ? 1 : smoothDiagnostic((effectiveFrame - 4) / (liveFrame - 4));
    const mode = prefersReducedMotion || effectiveFrame >= liveFrame
        ? 'live'
        : effectiveFrame < bootFrames ? 'boot' : 'transition';
    const sensorProgress = Math.round(mode === 'boot'
        ? mixDiagnostic(8, 66, bootProgress)
        : mixDiagnostic(66, 100, transitionProgress));
    return { mode, bootProgress, transitionProgress, detail, sensorProgress };
}

function diagnosticStatusText(liveText, phase, bootText = 'BOOT', transitionText = 'SYNC') {
    if (phase.mode === 'boot') return bootText;
    if (phase.mode === 'transition') return transitionText;
    return liveText;
}

function diagnosticLiveValue(liveValue, bootValue, phase) {
    return mixDiagnostic(bootValue, liveValue, phase.detail);
}

function drawDashboardGrid(widget, options = {}) {
    renderWidgetFrame(widget, { className: options.className || 'telemetry-green' });
    const colStep = options.colStep || 6;
    const rowStep = options.rowStep || 3;
    for (let col = colStep; col < widget.cols; col += colStep) {
        drawSvgGuideLine(widget, col, 1, col, widget.rows - 2, { className: options.className || 'telemetry-green', opacity: 0.06 });
    }
    for (let row = rowStep; row < widget.rows; row += rowStep) {
        drawSvgGuideLine(widget, 1, row, widget.cols - 2, row, { className: options.className || 'telemetry-green', opacity: 0.06 });
    }
}

function drawDiagnosticPhaseScan(widget, phase, label) {
    if (phase.detail >= 0.98) return;
    const scanCol = Math.round(mixDiagnostic(1, widget.cols - 2, phase.sensorProgress / 100));
    drawSvgGuideLine(widget, scanCol, 1, scanCol, widget.rows - 2, {
        className: 'telemetry-amber',
        opacity: 0.28 - phase.detail * 0.12
    });
    renderFixedGlyphLine(widget.glyphLayer, widget.rows - 1, `READING ${label} ${glyphProgressBar(phase.sensorProgress, 10)} ${String(phase.sensorProgress).padStart(3, '0')}%`, {
        col: 1,
        width: widget.cols - 2,
        className: 'telemetry-amber',
        opacity: 0.9 - phase.detail * 0.18
    });
}

const DIAGNOSTIC_WIDGET_REGISTRY = new Map();

function diagnosticRenderProfile() {
    return typeof getEffectiveRenderProfile === 'function'
        ? getEffectiveRenderProfile()
        : {
            name: 'fallback',
            schedulerMs: 120,
            sideTelemetryMs: 180,
            facilityMs: 220,
            radar: { frameMs: 120, sweepTrail: 5, clutterCount: 8, contactLabels: true, glow: false, pulse: true },
            facility: { backgroundRefreshFrames: 180, packetCount: 3, contactCount: 1, readoutEvery: 8, motion: false, pulse: false }
        };
}

function diagnosticFacilityProfile() {
    const profile = diagnosticRenderProfile();
    return {
        backgroundRefreshFrames: 180,
        packetCount: 3,
        contactCount: 1,
        readoutEvery: 8,
        motion: false,
        pulse: false,
        ...(profile.facility || {})
    };
}

function facilityMotionActive(facilityProfile = diagnosticFacilityProfile()) {
    return Boolean(facilityProfile.motion)
        && !prefersReducedMotion
        && !document.hidden
        && AppState.networkOnline
        && !effectsLowActive()
        && !(typeof safeModeActive === 'function' && safeModeActive());
}

function diagnosticWidgetInterval(widgetId, fallbackMs = 160) {
    return typeof getRenderWidgetInterval === 'function'
        ? getRenderWidgetInterval(widgetId, fallbackMs)
        : fallbackMs;
}

function resetDiagnosticWidgetRegistry() {
    DIAGNOSTIC_WIDGET_REGISTRY.clear();
}

function renderDiagnosticWidget(widgetId, timestamp, renderCallback, options = {}) {
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const record = DIAGNOSTIC_WIDGET_REGISTRY.get(widgetId) || { lastRenderAt: 0, renders: 0 };
    const interval = options.interval ?? diagnosticWidgetInterval(widgetId, 160);
    const force = options.force || record.renders === 0 || prefersReducedMotion;
    if (!force && now - record.lastRenderAt < interval) return false;

    renderCallback();
    record.lastRenderAt = now;
    record.renders++;
    DIAGNOSTIC_WIDGET_REGISTRY.set(widgetId, record);
    return true;
}

function setSvgTextElement(text, glyph, col, row, options = {}) {
    if (!text) return;
    const cellWidth = Number(options.cellWidth || text.parentNode?.dataset?.cellWidth || GLYPH_CELL_WIDTH);
    const cellHeight = Number(options.cellHeight || text.parentNode?.dataset?.cellHeight || GLYPH_CELL_HEIGHT);
    const point = gridPoint(col, row, cellWidth, cellHeight);
    text.setAttribute('x', point.x);
    text.setAttribute('y', point.y);
    text.textContent = String(glyph ?? '');
    if (options.className) text.setAttribute('class', `telemetry-glyph ${options.className}`.trim());
    if (options.opacity !== undefined) text.setAttribute('opacity', String(options.opacity));
}

function setSvgLabelElement(label, text, options = {}) {
    if (!label) return;
    label.textContent = String(text ?? '');
    if (options.className) label.setAttribute('class', `telemetry-label ${options.className}`.trim());
    if (options.opacity !== undefined) label.setAttribute('opacity', String(options.opacity));
}

function widgetGridPixel(widget, col, row) {
    return gridPoint(col, row, widget.cellWidth, widget.cellHeight);
}

function ekgWaveValue(position, intensity = 1) {
    const p = ((position % 1) + 1) % 1;
    const gaussian = (center, width, height) => height * Math.exp(-((p - center) ** 2) / (2 * width * width));
    return intensity * (
        gaussian(0.18, 0.035, 0.18) -
        gaussian(0.36, 0.012, 0.36) +
        gaussian(0.395, 0.009, 1.6) -
        gaussian(0.43, 0.014, 0.7) +
        gaussian(0.68, 0.07, 0.34)
    );
}

function ekgLanePoints(widget, row, startCol, endCol, options = {}) {
    const points = [];
    const cols = Math.max(1, endCol - startCol);
    const cycles = options.cycles || 2.4;
    const intensity = options.intensity || 1;
    const drift = options.drift || 0;
    const samples = cols * (options.samplesPerCol || 4);
    for (let i = 0; i <= samples; i++) {
        const progress = i / samples;
        const col = startCol + progress * cols;
        const wavePosition = progress * cycles + drift;
        const baselineNoise = Math.sin(progress * Math.PI * 8 + (options.noisePhase || 0)) * (options.noise || 0.035);
        points.push(widgetGridPixel(widget, col, row - ekgWaveValue(wavePosition, intensity) + baselineNoise));
    }
    return points;
}

function sliceEkgPoints(points, startRatio, endRatio) {
    const start = Math.max(0, Math.floor(points.length * clampDiagnostic(startRatio)));
    const end = Math.max(start + 2, Math.ceil(points.length * clampDiagnostic(endRatio)));
    return points.slice(start, Math.min(points.length, end));
}

function renderEkgRevealSegment(layer, points, startRatio, endRatio, options = {}) {
    if (!points?.length) return;
    const drawSlice = (from, to) => {
        const segment = sliceEkgPoints(points, from, to);
        if (segment.length > 1) svgPolyline(layer, segment, options);
    };
    if (startRatio < 0) {
        drawSlice(1 + startRatio, 1);
        drawSlice(0, endRatio);
        return;
    }
    drawSlice(startRatio, endRatio);
}

function spectrometerLevel(col, row, frame, base = 0.58) {
    const drift = prefersReducedMotion ? 0 : frame * 0.18;
    const band = Math.sin((col * 0.31) + row * 0.72 - drift) * 0.18;
    const lowBand = Math.cos(col * 0.13 - row * 0.44 + drift * 0.37) * 0.14;
    const carrierA = Math.exp(-((col - 16) ** 2) / 8) * (0.38 + Math.sin(frame * 0.06) * 0.16);
    const carrierB = Math.exp(-((col - 31) ** 2) / 12) * (0.28 + Math.cos(frame * 0.045) * 0.15);
    const carrierC = Math.exp(-((col - 45) ** 2) / 6) * (0.36 + Math.sin(frame * 0.08 + row) * 0.14);
    const grain = ((col * 17 + row * 31 + Math.floor(frame / 3) * 13) % 23) / 90;
    return clampDiagnostic(base + band + lowBand + carrierA + carrierB + carrierC + grain - row * 0.018);
}

function renderGateScopeDashboardWidget(id, frame, generatorValue, phase) {
    const widget = createSvgWidget(id, { cols: 58, rows: 14, cellHeight: 10, kind: 'diag-gate-scope' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-green', colStep: 6, rowStep: 3 });
    svgLabel(widget.labelLayer, 'AMPLITUDE', 1, 2, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, 'TRACE A', 48, 4, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, `${(diagnosticLiveValue(73, 18, phase) + Math.sin(frame * 0.18) * 2).toFixed(1)}mV`, 48, 5, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'TRACE B', 48, 8, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, `${(-11.8 + Math.sin(frame * 0.12) * 1.1).toFixed(1)}mV`, 48, 9, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, `SYNC ${statusGet('diagnostic.generator.core', 'LOCKED').toUpperCase().slice(0, 8)}`, 18, 12, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, `RATE ${statusGet('diagnostic.generator.sample_rate', '10.0 kS/s')}`, 37, 12, { className: 'telemetry-dim' });

    const visible = Math.round(mixDiagnostic(10, 42, phase.detail));
    const load = Math.max(0, Math.min(1, generatorValue / 100));
    const traceA = [];
    const traceB = [];
    for (let i = 0; i < visible; i++) {
        const col = 5 + i;
        const t = frame * 0.105 + i * 0.42;
        const valueA = Math.sin(t) * 0.65 + Math.sin(t * 2.4 + load) * 0.22;
        const valueB = Math.cos(t * 0.78 + load * 2) * 0.52 + Math.sin(t * 1.8) * 0.16;
        traceA.push(widgetGridPixel(widget, col, 5.3 - valueA * 2.1));
        traceB.push(widgetGridPixel(widget, col, 9.1 - valueB * 1.7));
        if (phase.detail > 0.72 && i % 5 === 0) {
            svgTextGlyph(widget.glyphLayer, blockGlyph((valueA + 1) / 2), col, Math.round(5.3 - valueA * 2.1), { className: 'telemetry-green', opacity: 0.72 });
        }
    }
    svgPolyline(widget.glyphLayer, traceA, { className: 'telemetry-green telemetry-trace-bold', opacity: 0.62 + phase.detail * 0.3 });
    svgPolyline(widget.glyphLayer, traceB, { className: 'telemetry-cyan', opacity: 0.48 + phase.detail * 0.3 });
    const cursorCol = 5 + (frame % Math.max(1, visible));
    drawSvgGuideLine(widget, cursorCol, 2, cursorCol, 11, { className: 'telemetry-cyan', opacity: 0.12 + phase.detail * 0.12 });
    svgLabel(widget.labelLayer, 'SAMPLE CURSOR', Math.max(2, cursorCol - 5), 13, { className: 'telemetry-dim', opacity: 0.48 + phase.detail * 0.2 });
    drawDiagnosticPhaseScan(widget, phase, 'GATE');
}

function renderBioscanArrayDashboardWidget(id, frame, stats, phase) {
    const widget = createSvgWidget(id, { cols: 62, rows: 14, cellHeight: 10, kind: 'diag-bioscan-ekg-array' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-green', colStep: 5, rowStep: 3 });
    const heartRate = Math.round(diagnosticLiveValue(132 + Math.sin(frame * 0.12) * 3, 48, phase));
    const startCol = 15;
    const endCol = 50;
    const lanes = [
        { label: 'UNIT-01 PULSE', value: `${heartRate} bpm`, row: 3, cls: 'telemetry-green', speed: 0.031, cycles: 2.45, amp: 1.14, drift: 0.04, noise: 0.018 },
        { label: 'UNIT-02 RESP', value: `${Math.round(16 + Math.sin(frame * 0.055) * 2)} rpm`, row: 6, cls: 'telemetry-cyan', speed: 0.018, cycles: 1.72, amp: 0.78, drift: 0.22, noise: 0.012 },
        { label: 'UNIT-03 NEURAL', value: `${statusGet('diagnostic.life.neural_mv', '2.8 mV')}`, row: 9, cls: 'telemetry-amber', speed: 0.024, cycles: 2.9, amp: 0.54, drift: 0.43, noise: 0.032 },
        { label: 'UNIT-04 STRESS', value: `${Math.round(diagnosticLiveValue(74 + Math.sin(frame * 0.07) * 4, 16, phase))}%`, row: 12, cls: 'telemetry-red', speed: 0.021, cycles: 2.1, amp: 0.68, drift: 0.61, noise: 0.022 }
    ];
    lanes.forEach((lane, laneIndex) => {
        svgLabel(widget.labelLayer, lane.label, 2, lane.row - 1, { className: lane.cls });
        svgLabel(widget.labelLayer, lane.value, 52, lane.row - 1, { className: lane.cls });
        drawSvgGuideRect(widget, startCol - 1, lane.row - 1.55, endCol - startCol + 2, 2.6, { className: lane.cls, opacity: 0.045 });
        drawSvgGuideLine(widget, startCol, lane.row, endCol, lane.row, { className: lane.cls, opacity: 0.1 });
        const points = ekgLanePoints(widget, lane.row, startCol, endCol, {
            cycles: lane.cycles,
            intensity: lane.amp,
            drift: lane.drift,
            noise: lane.noise,
            noisePhase: laneIndex * 1.7,
            samplesPerCol: 5
        });
        svgPolyline(widget.glyphLayer, points, { className: `${lane.cls} telemetry-trace-thin telemetry-ekg-trace`, opacity: 0.12 + phase.detail * 0.12 });
        const reveal = prefersReducedMotion ? 0.86 : (frame * lane.speed + laneIndex * 0.18) % 1;
        const tail = mixDiagnostic(0.08, 0.18, phase.detail);
        const active = mixDiagnostic(0.035, 0.065, phase.detail);
        renderEkgRevealSegment(widget.glyphLayer, points, reveal - tail, reveal, {
            className: `${lane.cls} telemetry-ekg-trace`,
            opacity: 0.28 + phase.detail * 0.24
        });
        renderEkgRevealSegment(widget.glyphLayer, points, reveal - active, reveal, {
            className: `${lane.cls} telemetry-trace-bold telemetry-ekg-trace`,
            opacity: 0.7 + phase.detail * 0.24
        });
        const cursorCol = startCol + reveal * (endCol - startCol);
        drawSvgGuideLine(widget, cursorCol, lane.row - 1.35, cursorCol, lane.row + 1.35, { className: lane.cls, opacity: 0.18 + phase.detail * 0.12 });
        svgTextGlyph(widget.glyphLayer, '▌', Math.round(cursorCol), lane.row, { className: lane.cls, opacity: 0.52 + phase.detail * 0.28 });
    });
    svgLabel(widget.labelLayer, `BIO ${String(stats.lifeCount).padStart(2, '0')} // UNSTABLE ${String(stats.unstableLife).padStart(2, '0')} // UNKNOWN ${String(stats.unknownLife).padStart(2, '0')}`, 2, 13, { className: 'telemetry-amber' });
    if (phase.detail < 0.98) {
        const scanCol = Math.round(mixDiagnostic(startCol, endCol, phase.sensorProgress / 100));
        drawSvgGuideLine(widget, scanCol, 1.4, scanCol, 12.5, { className: 'telemetry-amber', opacity: 0.2 });
        svgLabel(widget.labelLayer, `ACQ ${String(phase.sensorProgress).padStart(3, '0')}%`, 52, 13, { className: 'telemetry-amber' });
    }
}

function renderTacticalRadarDashboardWidget(id, frame, phase) {
    const widget = createSvgWidget(id, { cols: 60, rows: 16, cellHeight: 9, kind: 'diag-tactical-radar-safe' });
    if (!widget) return;
    const profile = diagnosticRenderProfile();
    const radarProfile = profile.radar || {};
    const centerCol = 25;
    const centerRow = 8;
    const staticKey = [
        'radar-v2',
        radarProfile.sweepTrail ?? 5,
        radarProfile.clutterCount ?? 8,
        radarProfile.contactLabels ? 'labels' : 'nolabels',
        radarProfile.glow ? 'glow' : 'noglow'
    ].join(':');
    if (widget.svg.dataset.radarStaticKey !== staticKey) {
        widget.svg.dataset.radarStaticKey = staticKey;
        clearSvgLayer(widget.guideLayer);
        clearSvgLayer(widget.glyphLayer);
        clearSvgLayer(widget.labelLayer);
        drawSvgGuideRect(widget, 0, 0, widget.cols, widget.rows, { opacity: 0.2, className: 'telemetry-cyan' });
        for (let col = 8; col < widget.cols; col += 8) {
            drawSvgGuideLine(widget, col, 1, col, widget.rows - 2, { className: 'telemetry-cyan', opacity: 0.045 });
        }
        for (let row = 4; row < widget.rows; row += 4) {
            drawSvgGuideLine(widget, 1, row, widget.cols - 2, row, { className: 'telemetry-cyan', opacity: 0.045 });
        }
        [2, 3.5, 5, 6.5].forEach(radius => drawSvgGuideCircle(widget, centerCol, centerRow, radius, { opacity: 0.08 + phase.detail * 0.04, className: 'telemetry-green' }));
        drawSvgGuideLine(widget, centerCol, 2, centerCol, 14, { opacity: 0.13, className: 'telemetry-green' });
        drawSvgGuideLine(widget, 8, centerRow, 43, centerRow, { opacity: 0.13, className: 'telemetry-green' });
        svgLabel(widget.labelLayer, '0', centerCol, 2, { className: 'telemetry-dim', anchor: 'middle' });
        svgLabel(widget.labelLayer, '90', 44, centerRow, { className: 'telemetry-dim' });
        svgLabel(widget.labelLayer, '180', centerCol, 14, { className: 'telemetry-dim', anchor: 'middle' });
        svgLabel(widget.labelLayer, '270', 6, centerRow, { className: 'telemetry-dim' });
        svgLabel(widget.labelLayer, 'CONTACTS', 48, 2, { className: 'telemetry-amber' });
        svgLabel(widget.labelLayer, '', 48, 12, { className: 'telemetry-green' })?.setAttribute('data-radar-clutter-label', 'true');

        const sweepGroup = svgElement('g', { 'data-radar-sweep': 'true' });
        sweepGroup.dataset.cellWidth = String(widget.cellWidth);
        sweepGroup.dataset.cellHeight = String(widget.cellHeight);
        widget.glyphLayer.appendChild(sweepGroup);
        const trailGlyphs = '·:+*#';
        const sweepTrailCount = Math.max(1, Math.min(8, Number(radarProfile.sweepTrail || 5)));
        for (let step = 1; step <= sweepTrailCount; step++) {
            svgTextGlyph(sweepGroup, trailGlyphs[Math.min(trailGlyphs.length - 1, Math.floor(step / 3))], centerCol + Math.round(step * 1.55), centerRow, {
                className: `telemetry-green ${radarProfile.glow === false ? 'telemetry-no-glow' : ''}`.trim(),
                opacity: 0.28 + step * 0.04
            })?.setAttribute('data-radar-sweep-glyph', String(step));
        }

        const clutterGroup = svgElement('g', { 'data-radar-clutter': 'true' });
        clutterGroup.dataset.cellWidth = String(widget.cellWidth);
        clutterGroup.dataset.cellHeight = String(widget.cellHeight);
        widget.glyphLayer.appendChild(clutterGroup);
        const clutterCount = Math.max(0, Math.min(20, Number(radarProfile.clutterCount || 0)));
        for (let index = 0; index < clutterCount; index++) {
            svgTextGlyph(clutterGroup, '·', centerCol, centerRow, { className: 'telemetry-dim', opacity: 0.22 })?.setAttribute('data-radar-clutter-dot', String(index));
        }

        const contactGroup = svgElement('g', { 'data-radar-contacts': 'true' });
        contactGroup.dataset.cellWidth = String(widget.cellWidth);
        contactGroup.dataset.cellHeight = String(widget.cellHeight);
        widget.glyphLayer.appendChild(contactGroup);
        for (let index = 0; index < 6; index++) {
            svgTextGlyph(contactGroup, '·', centerCol, centerRow, { className: 'telemetry-dim', opacity: 0 })?.setAttribute('data-radar-contact', String(index));
            svgLabel(widget.labelLayer, '', 48, 3 + index, { className: 'telemetry-dim' })?.setAttribute('data-radar-contact-label', String(index));
        }
    }

    const angle = prefersReducedMotion ? 1.35 : frame * 0.065;
    const sweepGroup = widget.svg.querySelector('[data-radar-sweep="true"]');
    if (sweepGroup) {
        const centerPoint = widgetGridPixel(widget, centerCol, centerRow);
        sweepGroup.setAttribute('transform', `rotate(${(angle * 180 / Math.PI).toFixed(2)} ${centerPoint.x} ${centerPoint.y})`);
        sweepGroup.setAttribute('opacity', String(0.58 + phase.detail * 0.34));
    }

    const contacts = [
        { glyph: '△', angle: -0.98, radius: 5.6, cls: 'telemetry-green', range: '1.2km' },
        { glyph: '□', angle: -2.45, radius: 4.8, cls: 'telemetry-cyan', range: '2.8km' },
        { glyph: '◇', angle: 0.34, radius: 5.8, cls: 'telemetry-red', range: '4.1km' },
        { glyph: '△', angle: 1.92, radius: 4.2, cls: 'telemetry-green', range: '1.7km' },
        { glyph: '□', angle: 2.72, radius: 6.1, cls: 'telemetry-green', range: '3.3km' },
        { glyph: '△', angle: 0.9, radius: 6.4, cls: 'telemetry-red', range: '5.8km' }
    ];
    const visibleContacts = Math.max(2, Math.round(mixDiagnostic(2, contacts.length, phase.detail)));
    const contactNodes = Array.from(widget.svg.querySelectorAll('[data-radar-contact]'));
    const labelNodes = Array.from(widget.svg.querySelectorAll('[data-radar-contact-label]'));
    contactNodes.forEach((node, index) => {
        const contact = contacts[index];
        if (!contact || index >= visibleContacts) {
            node.setAttribute('opacity', '0');
            if (labelNodes[index]) setSvgLabelElement(labelNodes[index], '');
            return;
        }
        const wobble = prefersReducedMotion ? 0 : Math.sin(frame * 0.045 + index) * 0.045;
        const col = centerCol + Math.round(Math.cos(contact.angle + wobble) * contact.radius * 1.55);
        const row = centerRow + Math.round(Math.sin(contact.angle + wobble) * contact.radius * 0.72);
        const contactPulse = contact.cls === 'telemetry-red' ? 0.68 + Math.sin(frame * 0.18 + index) * 0.18 : 0.82 + Math.sin(frame * 0.055 + index) * 0.1;
        setSvgTextElement(node, contact.glyph, col, row, { className: contact.cls, opacity: clampDiagnostic(contactPulse, 0.48, 1), cellWidth: widget.cellWidth, cellHeight: widget.cellHeight });
        if (labelNodes[index]) {
            setSvgLabelElement(labelNodes[index], radarProfile.contactLabels === false ? `${String(index + 1).padStart(2, '0')} ${contact.glyph}` : `${String(index + 1).padStart(2, '0')} ${contact.glyph} ${contact.range}`, {
                className: contact.cls,
                opacity: 0.92
            });
        }
    });
    const clutterNodes = Array.from(widget.svg.querySelectorAll('[data-radar-clutter-dot]'));
    if (!widget.svg.dataset.radarClutterFrame || Math.abs(frame - Number(widget.svg.dataset.radarClutterFrame)) >= 6 || phase.detail < 0.98) {
        widget.svg.dataset.radarClutterFrame = String(frame);
        clutterNodes.forEach((node, index) => {
            const seed = index * 7 + frame;
            const localAngle = ((seed * 37) % 360) * Math.PI / 180;
            const localRadius = 1.4 + ((seed * 19) % 54) / 10;
            const col = centerCol + Math.round(Math.cos(localAngle) * localRadius * 1.55);
            const row = centerRow + Math.round(Math.sin(localAngle) * localRadius * 0.72);
            setSvgTextElement(node, '·', col, row, {
                className: 'telemetry-dim',
                opacity: col > 6 && col < 44 && row > 2 && row < 14 ? 0.14 + ((index % 4) * 0.05) : 0,
                cellWidth: widget.cellWidth,
                cellHeight: widget.cellHeight
            });
        });
    }
    setSvgLabelElement(widget.svg.querySelector('[data-radar-clutter-label="true"]'), `CLUTTER ${Math.round(diagnosticLiveValue(28, 4, phase))}%`, { className: 'telemetry-green' });
    let scanLayer = widget.svg.querySelector('[data-radar-scan="true"]');
    if (!scanLayer) {
        scanLayer = svgElement('g', { 'data-radar-scan': 'true' });
        scanLayer.dataset.cellWidth = String(widget.cellWidth);
        scanLayer.dataset.cellHeight = String(widget.cellHeight);
        widget.glyphLayer.appendChild(scanLayer);
    }
    clearSvgLayer(scanLayer);
    drawDiagnosticPhaseScan({ ...widget, guideLayer: scanLayer, glyphLayer: scanLayer }, phase, 'RADAR');
}

function renderSpectrumDashboardWidget(id, frame, networkValue, phase) {
    const widget = createSvgWidget(id, { cols: 58, rows: 14, cellHeight: 10, kind: 'diag-spectrum-waterfall' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-cyan', colStep: 6, rowStep: 3 });
    svgLabel(widget.labelLayer, 'FREQ', 2, 2, { className: 'telemetry-dim' });
    ['10k', '1k', '100', '10', '1'].forEach((label, index) => svgLabel(widget.labelLayer, label, 2, 4 + index * 2, { className: 'telemetry-green' }));
    const visibleRows = Math.round(mixDiagnostic(2, 9, phase.detail));
    for (let row = 3; row < 12; row++) {
        if (row - 2 > visibleRows) continue;
        for (let col = 6; col < 46; col++) {
            const carrier = Math.sin((col - 23) * 0.18) * 0.24;
            const pulse = Math.sin((col + frame * 0.28 - row * 2.1) * 0.4);
            const isCarrier = [15, 28, 39].includes(col) && (frame + row * 3) % 34 < 17;
            const spike = isCarrier ? 0.58 : ((col + row + Math.floor(frame / 8)) % 29 === 0 ? 0.34 : 0);
            const level = clampDiagnostic(networkValue / 130 + carrier + pulse * 0.22 + spike, 0, 1);
            const cls = level > 0.84 ? 'telemetry-red' : level > 0.66 ? 'telemetry-amber' : level > 0.42 ? 'telemetry-cyan' : 'telemetry-dim';
            svgTextGlyph(widget.glyphLayer, densityGlyph(level), col, row, { className: cls, opacity: 0.38 + level * 0.52 });
        }
    }
    svgLabel(widget.labelLayer, 'PEAK HOLD', 48, 3, { className: 'telemetry-amber' });
    ['-20', '-40', '-60', '-80', '-100'].forEach((label, index) => {
        const cls = index === 0 ? 'telemetry-red' : index === 1 ? 'telemetry-amber' : index === 2 ? 'telemetry-green' : 'telemetry-cyan';
        svgTextGlyph(widget.glyphLayer, '█', 48, 5 + index, { className: cls, opacity: 0.8 });
        svgLabel(widget.labelLayer, label, 50, 5 + index, { className: cls });
    });
    svgLabel(widget.labelLayer, 'CENTER 1.000 kHz', 18, 13, { className: 'telemetry-green' });
    drawDiagnosticPhaseScan(widget, phase, 'SPECTRUM');
}

function renderReactorSyncDashboardWidget(id, frame, values, phase) {
    const widget = createSvgWidget(id, { cols: 60, rows: 14, cellHeight: 10, kind: 'diag-reactor-control' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-amber', colStep: 5, rowStep: 2 });
    drawSvgGuideRect(widget, 1, 1, 16, 7, { className: 'telemetry-green', opacity: 0.16 });
    drawSvgGuideRect(widget, 18, 1, 25, 7, { className: 'telemetry-amber', opacity: 0.16 });
    drawSvgGuideRect(widget, 45, 1, 13, 7, { className: 'telemetry-cyan', opacity: 0.16 });
    drawSvgGuideRect(widget, 1, 9, 57, 4, { className: 'telemetry-amber', opacity: 0.12 });

    const output = diagnosticLiveValue(values.output, 18, phase);
    const pressure = diagnosticLiveValue(2.37 + Math.sin(frame * 0.05) * 0.04, 0.38, phase);
    const sync = diagnosticLiveValue(values.sync, 21, phase);

    svgLabel(widget.labelLayer, 'REACTOR OUTPUT', 2, 2, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, `${output.toFixed(1)}%`, 2, 4, { className: 'telemetry-green', fontSize: 20 });
    svgLabel(widget.labelLayer, `${statusGet('diagnostic.reactor.unit', 'MW-EQUIV')} ${glyphProgressBar(output, 8)}`, 2, 7, { className: 'telemetry-dim' });

    svgLabel(widget.labelLayer, 'CONTAINMENT PRESSURE', 19, 2, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, `${pressure.toFixed(2)} ATM`, 33, 2, { className: 'telemetry-amber' });
    const pressureTrace = [];
    for (let i = 0; i <= 22; i++) {
        const col = 19 + i;
        const harmonic = Math.sin(frame * 0.07 + i * 0.62) * 0.9 + Math.sin(frame * 0.025 + i * 0.18) * 0.42;
        pressureTrace.push(widgetGridPixel(widget, col, 5.3 - harmonic));
    }
    drawSvgGuideLine(widget, 19, 5.3, 42, 5.3, { className: 'telemetry-amber', opacity: 0.12 });
    svgPolyline(widget.glyphLayer, pressureTrace, { className: 'telemetry-amber telemetry-trace-bold', opacity: 0.68 + phase.detail * 0.18 });
    svgLabel(widget.labelLayer, `NOMINAL ${statusGet('diagnostic.power.nominal_pressure', '3.20 ATM')}`, 22, 7, { className: 'telemetry-dim' });

    svgLabel(widget.labelLayer, 'SYNC STACK', 46, 2, { className: 'telemetry-cyan' });
    [
        ['PLL', sync],
        ['MAG', sync - 6 + Math.sin(frame * 0.06) * 2],
        ['RIT', values.mainPower + 20],
        ['BUS', values.reservePower + 36]
    ].forEach(([label, value], index) => {
        const safeValue = clampDiagnostic(value / 100, 0.05, 1) * 100;
        renderFixedGlyphLine(widget.glyphLayer, 4 + index, `${label} ${glyphProgressBar(safeValue, 7)}`, {
            col: 46,
            width: 12,
            className: safeValue < 62 ? 'telemetry-amber' : 'telemetry-green',
            opacity: 0.82 + phase.detail * 0.12
        });
    });

    const tempValue = diagnosticLiveValue(values.mainPower, 8, phase);
    renderFixedGlyphLine(widget.glyphLayer, 10, `CORE TEMP ${String(statusGet('diagnostic.power.temp', '612C')).padEnd(7, ' ')} 0`, {
        col: 2,
        width: 16,
        className: 'telemetry-amber',
        opacity: 0.88
    });
    for (let col = 19; col <= 45; col++) {
        const segment = (col - 19) / 26;
        const active = segment <= tempValue / 100;
        const cls = segment > 0.82 ? 'telemetry-red' : segment > 0.58 ? 'telemetry-amber' : 'telemetry-green';
        svgTextGlyph(widget.glyphLayer, active ? '█' : '░', col, 10, { className: active ? cls : 'telemetry-dim', opacity: active ? 0.86 : 0.28 });
    }
    svgLabel(widget.labelLayer, '1000', 47, 10, { className: 'telemetry-dim' });
    renderFixedGlyphLine(widget.glyphLayer, 12, `NEUTRON FLUX ${statusGet('diagnostic.power.flux', '6.21e13 n/cm/s')}  DELTA ${(Math.sin(frame * 0.05) * 0.8 + 0.6).toFixed(1)}%`, {
        col: 2,
        width: 54,
        className: 'telemetry-cyan',
        opacity: 0.82
    });
    for (let col = 3; col < 15; col++) {
        const level = clampDiagnostic((values.output / 100) * 0.55 + Math.sin(frame * 0.13 + col) * 0.2 + (col - 3) / 22);
        svgTextGlyph(widget.glyphLayer, blockGlyph(level), col, 8 - Math.round(level * 2), { className: level > 0.8 ? 'telemetry-amber' : 'telemetry-green', opacity: 0.66 });
    }
    drawDiagnosticPhaseScan(widget, phase, 'REACTOR');
}

function tomographyHeight(xNorm, yNorm, frame, phase) {
    const dx = xNorm - 0.52;
    const dy = yNorm - 0.52;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const outward = Math.sin(radius * 31 - frame * 0.09) * (1 - Math.min(1, radius * 1.8));
    const angular = Math.sin(angle * 4 + frame * 0.035) * 0.28;
    const peak = Math.exp(-(radius * radius) / 0.035) * 3.1;
    const ridge = Math.exp(-(((xNorm - 0.28) ** 2) / 0.08 + ((yNorm - 0.68) ** 2) / 0.06)) * 0.95;
    return (peak + ridge + outward * 0.9 + angular) * phase.detail;
}

function tomographyClass(yNorm) {
    const centerDistance = Math.abs(yNorm - 0.52);
    if (centerDistance < 0.09) return 'telemetry-red';
    if (centerDistance < 0.2) return 'telemetry-amber';
    if (centerDistance < 0.34) return 'telemetry-green';
    return 'telemetry-cyan';
}

function renderTomographyDashboardWidget(id, frame, phase) {
    const compact = id === 'diagSecurity';
    const widget = createSvgWidget(id, {
        cols: compact ? 72 : 96,
        rows: compact ? 14 : 24,
        cellHeight: compact ? 10 : 8.5,
        kind: compact ? 'diag-anomaly-tomography-compact' : 'diag-anomaly-tomography-fluid'
    });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-cyan', colStep: 6, rowStep: 3 });
    const sliceDepth = Math.round(312 + Math.sin(frame * 0.035) * 18);
    svgLabel(widget.labelLayer, compact ? `FIELD MESH // SLICE ${sliceDepth}m` : `FIELD INTENSITY MESH // DEPTH SLICE ${sliceDepth}m`, 2, 2, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, compact ? 'INT' : 'INTENSITY', compact ? 62 : 84, 3, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, 'MAX', compact ? 65 : 87, compact ? 4.5 : 5, { className: 'telemetry-red' });
    svgLabel(widget.labelLayer, 'MIN', compact ? 65 : 87, compact ? 12 : 20, { className: 'telemetry-cyan' });

    const startCol = compact ? 5 : 7;
    const startRow = compact ? 4 : 6;
    const widthCols = compact ? 52 : 70;
    const heightRows = compact ? 8 : 14;
    const horizontalLines = Math.max(compact ? 6 : 8, Math.round(mixDiagnostic(compact ? 6 : 8, compact ? 15 : 28, phase.detail)));
    const verticalLines = Math.max(compact ? 6 : 8, Math.round(mixDiagnostic(compact ? 6 : 8, compact ? 16 : 30, phase.detail)));
    const horizontalSteps = compact ? 64 : 96;
    const verticalSteps = compact ? 48 : 72;

    for (let rowIndex = 0; rowIndex < horizontalLines; rowIndex++) {
        const yNorm = rowIndex / Math.max(1, horizontalLines - 1);
        const points = [];
        for (let step = 0; step <= horizontalSteps; step++) {
            const xNorm = step / horizontalSteps;
            const height = tomographyHeight(xNorm, yNorm, frame, phase);
            const fluidOffset = Math.sin((xNorm - 0.5) * 8 + frame * 0.045 + yNorm * 5) * 0.55 * phase.detail;
            const col = startCol + xNorm * widthCols + (yNorm - 0.5) * 5 + fluidOffset;
            const row = startRow + yNorm * heightRows - height;
            points.push(widgetGridPixel(widget, col, row));
        }
        svgPolyline(widget.glyphLayer, points, {
            className: `${tomographyClass(yNorm)} telemetry-trace-thin`,
            opacity: 0.18 + phase.detail * 0.34
        });
    }

    for (let colIndex = 0; colIndex < verticalLines; colIndex++) {
        const xNorm = colIndex / Math.max(1, verticalLines - 1);
        const points = [];
        for (let step = 0; step <= verticalSteps; step++) {
            const yNorm = step / verticalSteps;
            const height = tomographyHeight(xNorm, yNorm, frame, phase);
            const fluidOffset = Math.cos((yNorm - 0.5) * 7 + frame * 0.04 + xNorm * 6) * 0.45 * phase.detail;
            const col = startCol + xNorm * widthCols + (yNorm - 0.5) * 5 + fluidOffset;
            const row = startRow + yNorm * heightRows - height;
            points.push(widgetGridPixel(widget, col, row));
        }
        const centerDistance = Math.abs(xNorm - 0.52);
        svgPolyline(widget.glyphLayer, points, {
            className: `${centerDistance < 0.16 ? 'telemetry-amber' : 'telemetry-cyan'} telemetry-trace-thin`,
            opacity: 0.12 + phase.detail * 0.2
        });
    }

    const hotPath = [];
    for (let i = 0; i <= 72; i++) {
        const angle = (Math.PI * 2 * i) / 72;
        const pulse = 1 + Math.sin(frame * 0.06 + angle * 3) * 0.12;
        const col = startCol + widthCols * 0.52 + Math.cos(angle) * 8.8 * pulse;
        const row = startRow + heightRows * 0.52 + Math.sin(angle) * 2.3 * pulse - Math.sin(frame * 0.06) * 0.5;
        hotPath.push(widgetGridPixel(widget, col, row));
    }
    svgPolyline(widget.glyphLayer, hotPath, { className: 'telemetry-red telemetry-trace-bold', opacity: 0.2 + phase.detail * 0.24 });
    const sliceCol = 8 + Math.round(((Math.sin(frame * 0.035) + 1) / 2) * 64);
    drawSvgGuideLine(widget, sliceCol, 5, sliceCol + 5, 18, { className: 'telemetry-amber', opacity: 0.16 + phase.detail * 0.06 });

    [
        ['█', 'telemetry-red'],
        ['█', 'telemetry-amber'],
        ['▓', 'telemetry-amber'],
        ['▓', 'telemetry-green'],
        ['▒', 'telemetry-green'],
        ['▒', 'telemetry-cyan'],
        ['░', 'telemetry-cyan'],
        ['·', 'telemetry-dim']
    ].forEach(([glyph, cls], index) => {
        const legendRow = compact ? 5 + index : 6 + index * 2;
        svgTextGlyph(widget.glyphLayer, glyph, compact ? 63 : 86, legendRow, { className: cls, opacity: 0.92 });
        svgTextGlyph(widget.glyphLayer, glyph, compact ? 64 : 87, legendRow, { className: cls, opacity: 0.78 });
    });
    svgLabel(widget.labelLayer, `GRID ${Math.round(diagnosticLiveValue(128, 24, phase))}x${Math.round(diagnosticLiveValue(128, 24, phase))}`, compact ? 45 : 65, compact ? 12 : 20, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, `DRIFT +${(diagnosticLiveValue(2.1, 0.2, phase)).toFixed(1)}`, 2, compact ? 12 : 20, { className: 'telemetry-amber' });
    drawDiagnosticPhaseScan(widget, phase, 'TOMOGRAPHY');
}

function renderDataFabricDashboardWidget(id, frame, securityValue, phase) {
    const widget = createSvgWidget(id, { cols: 64, rows: 14, cellHeight: 10, kind: 'diag-entity-noise-spectrometer' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-cyan', colStep: 6, rowStep: 3 });
    svgLabel(widget.labelLayer, 'FREQ', 2, 2, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, 'PEAK HOLD', 52, 2, { className: 'telemetry-amber' });
    ['10k', '2k', '500', '100', '25', '5'].forEach((label, index) => svgLabel(widget.labelLayer, label, 2, 3 + index * 1.55, { className: 'telemetry-green' }));

    const visibleRows = Math.round(mixDiagnostic(3, 10, phase.detail));
    const peakPoints = [];
    for (let row = 3; row <= 12; row++) {
        if (row - 2 > visibleRows) continue;
        for (let col = 7; col <= 49; col++) {
            const level = spectrometerLevel(col, row, frame, diagnosticLiveValue(securityValue / 125, 0.12, phase));
            const cls = level > 0.88 ? 'telemetry-red' : level > 0.7 ? 'telemetry-amber' : level > 0.48 ? 'telemetry-green' : level > 0.28 ? 'telemetry-cyan' : 'telemetry-dim';
            svgTextGlyph(widget.glyphLayer, densityGlyph(level), col, row, { className: cls, opacity: 0.34 + level * 0.55 });
            if (row === 4 && col % 2 === 0) {
                const peakRow = 11.5 - level * 7.5;
                peakPoints.push(widgetGridPixel(widget, col, peakRow));
            }
        }
    }
    svgPolyline(widget.glyphLayer, peakPoints, { className: 'telemetry-amber telemetry-trace-thin', opacity: 0.48 + phase.detail * 0.25 });

    [16, 31, 45].forEach((col, index) => {
        const pulse = 0.65 + Math.sin(frame * (0.07 + index * 0.012)) * 0.25;
        drawSvgGuideLine(widget, col, 3, col, 12, { className: index === 2 ? 'telemetry-red' : 'telemetry-cyan', opacity: 0.16 + pulse * 0.12 });
        svgTextGlyph(widget.glyphLayer, index === 2 ? '◆' : '●', col, 3, { className: index === 2 ? 'telemetry-red' : 'telemetry-cyan', opacity: pulse });
    });

    [
        ['-20', 'telemetry-red'],
        ['-40', 'telemetry-amber'],
        ['-60', 'telemetry-green'],
        ['-80', 'telemetry-cyan'],
        ['-100', 'telemetry-dim']
    ].forEach(([label, cls], index) => {
        svgTextGlyph(widget.glyphLayer, '█', 53, 4 + index, { className: cls, opacity: 0.86 });
        svgLabel(widget.labelLayer, label, 55, 4 + index, { className: cls });
    });
    svgLabel(widget.labelLayer, `CLUTTER ${Math.round(diagnosticLiveValue(28, 5, phase))}%`, 52, 11, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, `REF ${statusGet('diagnostic.security.reference', '-20 dBm')}`, 52, 12, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, 'CENTER 1.000 kHz', 18, 13, { className: 'telemetry-green' });
    drawDiagnosticPhaseScan(widget, phase, 'NOISE');
}

function blackDesertGridPoint(widget, col, row) {
    return widgetGridPixel(widget, col, row);
}

const BLACK_DESERT_ISO = {
    centerCol: 48,
    centerRow: 12.7,
    scaleX: 22.5,
    scaleY: 5.15,
    heightScale: 2.15
};

function blackDesertTerrainHeight(x, y, frame, detail = 1) {
    const drift = prefersReducedMotion ? 0 : frame * 0.012;
    const duneA = Math.sin((x * 2.8 + y * 1.15 + drift) * Math.PI) * 0.42;
    const duneB = Math.sin((x * 0.9 - y * 3.1 - drift * 0.7) * Math.PI) * 0.28;
    const ripple = Math.sin((x + y) * 9 + drift * 7) * 0.07;
    const westernRidge = Math.exp(-(((x + 0.52) ** 2) / 0.28 + ((y - 0.28) ** 2) / 0.08)) * 0.74;
    const easternSpines = Math.exp(-(((x - 0.65) ** 2) / 0.1 + ((y + 0.52) ** 2) / 0.05)) * 1.82;
    const vortexLift = Math.exp(-(((x - 0.2) ** 2) / 0.12 + ((y + 0.06) ** 2) / 0.08)) * 0.38;
    const vortexBasin = Math.exp(-(((x - 0.18) ** 2) / 0.06 + ((y + 0.04) ** 2) / 0.06)) * -0.34;
    return Math.max(-0.35, (0.46 + duneA + duneB + ripple + westernRidge + easternSpines + vortexLift + vortexBasin) * detail);
}

function blackDesertSurfacePoint(widget, x, y, frame, detail = 1, lift = 0) {
    const z = blackDesertTerrainHeight(x, y, frame, detail) + lift;
    const col = BLACK_DESERT_ISO.centerCol + (x - y) * BLACK_DESERT_ISO.scaleX;
    const row = BLACK_DESERT_ISO.centerRow + (x + y) * BLACK_DESERT_ISO.scaleY - z * BLACK_DESERT_ISO.heightScale;
    return {
        col,
        row,
        point: blackDesertGridPoint(widget, col, row)
    };
}

function renderBlackDesertMapLabel(widget, lines, col, row, options = {}) {
    const labelLines = Array.isArray(lines) ? lines : [lines];
    labelLines.forEach((line, index) => {
        svgLabel(widget.labelLayer, line, col, row + index * 0.82, {
            className: `${index === 0 ? (options.className || 'telemetry-amber') : (options.subClassName || 'telemetry-dim')} telemetry-map-label-strong`,
            opacity: index === 0 ? 0.98 : 0.9,
            fontSize: index === 0 ? 8.6 : 7.4
        });
    });
}

function renderBlackDesertZoneOverlay(widget, zone, frame, detail) {
    const points = zone.points.map(([x, y]) => blackDesertSurfacePoint(widget, x, y, frame, detail, 0.08).point);
    widget.guideLayer.appendChild(svgElement('polygon', {
        points: points.map(point => `${Number(point.x).toFixed(1)},${Number(point.y).toFixed(1)}`).join(' '),
        class: `telemetry-map-zone ${zone.className}`,
        opacity: zone.opacity ?? 0.28
    }));
    svgPolyline(widget.guideLayer, points.concat(points[0]), {
        className: `${zone.className} telemetry-trace-thin`,
        opacity: 0.16 + detail * 0.1
    });
    renderBlackDesertMapLabel(widget, [zone.label, zone.subLabel], zone.labelCol, zone.labelRow, {
        className: zone.className,
        width: zone.width || 16,
        opacity: 0.72
    });
}

function sampleBlackDesertRoute(route, samplesPerSegment = 9) {
    const samples = [];
    for (let index = 0; index < route.length - 1; index++) {
        const [startX, startY] = route[index];
        const [endX, endY] = route[index + 1];
        for (let step = 0; step < samplesPerSegment; step++) {
            const t = step / samplesPerSegment;
            samples.push([
                mixDiagnostic(startX, endX, t),
                mixDiagnostic(startY, endY, t)
            ]);
        }
    }
    samples.push(route[route.length - 1]);
    return samples;
}

function renderBlackDesertRoute(widget, route, frame, options = {}) {
    const samples = sampleBlackDesertRoute(route, options.samplesPerSegment || 8);
    const points = samples.map(([x, y]) => blackDesertSurfacePoint(widget, x, y, frame, options.detail || 1, options.lift || 0.16).point);
    svgPolyline(widget.glyphLayer, points, {
        className: `${options.className || 'telemetry-amber'} telemetry-trace-thin`,
        opacity: options.opacity ?? 0.36
    });
    if (options.showMarkers === false) return;

    samples.forEach(([x, y], index) => {
        if (index % (options.markerEvery || 4) !== 0) return;
        const active = !options.static && !prefersReducedMotion && (index + Math.floor(frame / 2)) % 18 < 3;
        const projected = blackDesertSurfacePoint(widget, x, y, frame, options.detail || 1, (options.lift || 0.16) + 0.08);
        svgTextGlyph(widget.glyphLayer, active ? (options.activeGlyph || '◆') : (options.routeGlyph || '·'), projected.col, projected.row, {
            className: active ? 'telemetry-red' : options.className || 'telemetry-amber',
            opacity: active ? 0.9 : 0.46
        });
    });
}

function renderBlackDesertSite(widget, site, frame, detail) {
    const projected = blackDesertSurfacePoint(widget, site.x, site.y, frame, detail, site.lift || 0.34);
    const pulse = 0;
    drawSvgGuideCircle(widget, projected.col, projected.row, site.ring || 0.75, {
        className: site.className || 'telemetry-red',
        opacity: 0.09 + detail * 0.08
    });
    svgTextGlyph(widget.glyphLayer, site.glyph || '◆', projected.col, projected.row, {
        className: site.className || 'telemetry-red',
        opacity: 0.66 + detail * 0.24 + pulse * 0.12,
        fontSize: site.fontSize || 10
    });
    drawSvgGuideLine(widget, projected.col, projected.row, site.labelCol - 0.5, site.labelRow, {
        className: site.className || 'telemetry-red',
        opacity: 0.18 + detail * 0.09
    });
    renderBlackDesertMapLabel(widget, [site.id, site.name], site.labelCol, site.labelRow, {
        className: site.className || 'telemetry-red',
        width: site.labelWidth || 12,
        opacity: 0.8
    });
}

function renderBlackDesertTerrainMesh(widget, frame, detail) {
    const meshRows = Math.round(mixDiagnostic(7, 18, detail));
    const meshCols = Math.round(mixDiagnostic(7, 15, detail));
    const sampleCount = Math.round(mixDiagnostic(24, 44, detail));
    for (let rowIndex = 0; rowIndex < meshRows; rowIndex++) {
        const y = mixDiagnostic(-0.96, 0.96, rowIndex / Math.max(1, meshRows - 1));
        const points = [];
        for (let step = 0; step <= sampleCount; step++) {
            const x = mixDiagnostic(-0.96, 0.96, step / sampleCount);
            points.push(blackDesertSurfacePoint(widget, x, y, frame, detail).point);
        }
        const cls = y > 0.42 ? 'telemetry-amber' : y > -0.08 ? 'telemetry-green' : 'telemetry-cyan';
        svgPolyline(widget.guideLayer, points, {
            className: `${cls} telemetry-trace-thin`,
            opacity: 0.08 + detail * 0.16
        });
    }

    for (let colIndex = 0; colIndex < meshCols; colIndex++) {
        const x = mixDiagnostic(-0.96, 0.96, colIndex / Math.max(1, meshCols - 1));
        const points = [];
        for (let step = 0; step <= 34; step++) {
            const y = mixDiagnostic(-0.96, 0.96, step / 34);
            points.push(blackDesertSurfacePoint(widget, x, y, frame, detail).point);
        }
        svgPolyline(widget.guideLayer, points, {
            className: `${x > 0.45 ? 'telemetry-amber' : 'telemetry-cyan'} telemetry-trace-thin`,
            opacity: 0.04 + detail * 0.075
        });
    }

    for (let crest = 0; crest < 7; crest++) {
        const points = [];
        const baseY = -0.76 + crest * 0.26;
        for (let step = 0; step <= 46; step++) {
            const x = mixDiagnostic(-0.88, 0.86, step / 46);
            const y = baseY + Math.sin(x * 5.4 + crest * 1.1 + frame * 0.014) * 0.035;
            points.push(blackDesertSurfacePoint(widget, x, y, frame, detail, 0.13).point);
        }
        svgPolyline(widget.glyphLayer, points, {
            className: `${crest > 4 ? 'telemetry-amber' : 'telemetry-green'} telemetry-trace-thin`,
            opacity: 0.05 + detail * 0.12
        });
    }
}

function renderBlackDesertMapDashboardWidget(id, frame, phase) {
    const widget = createSvgWidget(id, { cols: 96, rows: 24, cellHeight: 7, kind: 'diag-black-desert-iso-terrain-map' });
    if (!widget) return;
    const staticKey = 'black-desert-mesh-map-static-v4';
    if (widget.svg.dataset.blackDesertStaticKey === staticKey) return;
    widget.svg.dataset.blackDesertStaticKey = staticKey;

    const staticFrame = 0;
    const detail = 1;
    drawDashboardGrid(widget, { className: 'telemetry-amber', colStep: 8, rowStep: 3 });
    drawSvgGuideRect(widget, 1, 1, 94, 22, { className: 'telemetry-amber', opacity: 0.12 });

    [
        {
            label: 'ZONE A',
            subLabel: 'CORRIDOR',
            className: 'telemetry-amber',
            labelCol: 31,
            labelRow: 2.3,
            width: 13,
            opacity: 0.19,
            points: [[-0.86, -0.86], [-0.56, -0.96], [0.86, -0.24], [0.92, -0.02], [0.04, 0.12], [-0.72, -0.26]]
        },
        {
            label: 'ZONE B',
            subLabel: 'THE CLAIM',
            className: 'telemetry-green',
            labelCol: 22,
            labelRow: 10.5,
            width: 13,
            opacity: 0.16,
            points: [[-0.92, -0.18], [-0.42, -0.2], [0.34, 0.26], [0.08, 0.8], [-0.72, 0.74], [-0.96, 0.38]]
        },
        {
            label: 'ZONE C',
            subLabel: 'THE BLIND',
            className: 'telemetry-red',
            labelCol: 72,
            labelRow: 5.1,
            width: 13,
            opacity: 0.14,
            points: [[0.24, -0.44], [0.96, -0.26], [0.98, 0.86], [0.3, 0.96], [0.06, 0.18]]
        }
    ].forEach(zone => renderBlackDesertZoneOverlay(widget, zone, staticFrame, detail));

    renderBlackDesertTerrainMesh(widget, staticFrame, detail);

    const routeA = [[-0.72, -0.68], [-0.36, -0.58], [-0.04, -0.3], [0.2, 0.18], [0.38, 0.52], [0.62, 0.86]];
    const routeB = [[-0.72, -0.68], [-0.86, -0.2], [-0.76, 0.12], [-0.52, 0.46], [-0.5, 0.72], [-0.04, 0.78], [0.35, 0.84]];
    const routeC = [[-0.78, 0.12], [-0.38, 0.08], [-0.16, 0.14], [0.22, 0.48], [0.35, 0.84]];
    renderBlackDesertRoute(widget, routeA, staticFrame, { className: 'telemetry-red', opacity: 0.28 + detail * 0.12, detail, samplesPerSegment: 10, static: true, showMarkers: false });
    renderBlackDesertRoute(widget, routeB, staticFrame, { className: 'telemetry-amber', opacity: 0.24 + detail * 0.1, detail, samplesPerSegment: 10, static: true, showMarkers: false });
    renderBlackDesertRoute(widget, routeC, staticFrame, { className: 'telemetry-cyan', opacity: 0.18 + detail * 0.08, detail, samplesPerSegment: 8, markerEvery: 5, static: true, showMarkers: false });

    [
        { id: 'BRE-01', name: 'GATEHEAD', x: -0.72, y: -0.68, labelCol: 4, labelRow: 3.1, labelWidth: 13, className: 'telemetry-cyan', glyph: '◉', col: 0 },
        { id: 'BRE-02', name: 'RED HARVEST', x: -0.78, y: 0.12, labelCol: 5, labelRow: 13.1, labelWidth: 15, className: 'telemetry-red', glyph: '◆', col: 2 },
        { id: 'BRE-03', name: 'FIREWATCH', x: -0.16, y: 0.14, labelCol: 37, labelRow: 4.9, labelWidth: 14, className: 'telemetry-amber', glyph: '◇', col: 3 },
        { id: 'BRE-04', name: 'BLACKWATER', x: 0.22, y: 0.48, labelCol: 62, labelRow: 13.7, labelWidth: 15, className: 'telemetry-red', glyph: '▣', col: 4 },
        { id: 'BRE-05', name: 'REFINERY', x: -0.5, y: 0.72, labelCol: 11, labelRow: 20.2, labelWidth: 13, className: 'telemetry-green', glyph: '□', col: 5 },
        { id: 'BRE-06', name: 'STOCKADE', x: 0.35, y: 0.84, labelCol: 48, labelRow: 21, labelWidth: 13, className: 'telemetry-amber', glyph: '▤', col: 6 },
        { id: 'VORTEX', name: 'MANA SINK', x: 0.2, y: -0.06, labelCol: 58, labelRow: 7.8, labelWidth: 12, className: 'telemetry-cyan', glyph: '◎', ring: 1.1, col: 7 },
        { id: 'SPIRES', name: 'LOST SPIRES', x: 0.73, y: 0.56, labelCol: 72, labelRow: 17.4, labelWidth: 14, className: 'telemetry-amber', glyph: '△', col: 8 },
        { id: 'AZTECH', name: 'ACTIVITY', x: 0.72, y: 0.86, labelCol: 73, labelRow: 21, labelWidth: 12, className: 'telemetry-red', glyph: '☠', ring: 1, col: 9 }
    ].forEach(site => renderBlackDesertSite(widget, site, staticFrame, detail));

    [
        { x: -0.68, y: 0.02, glyph: '△', className: 'telemetry-amber' },
        { x: -0.05, y: 0.42, glyph: '△', className: 'telemetry-amber' },
        { x: 0.5, y: 0.66, glyph: '△', className: 'telemetry-red' },
        { x: 0.84, y: 0.36, glyph: '△', className: 'telemetry-red' }
    ].forEach((hazard, index) => {
        const point = blackDesertSurfacePoint(widget, hazard.x, hazard.y, staticFrame, detail, 0.28);
        svgTextGlyph(widget.glyphLayer, hazard.glyph, point.col, point.row, {
            className: hazard.className,
            opacity: 0.64 + detail * 0.22
        });
    });

    renderFixedGlyphLine(widget.glyphLayer, 22.7, '◉/◆ SITE  △ HAZARD  · ROUTE  ◎ MANA SINK  SHADED ZONES = ACCESS REGIONS', {
        col: 3,
        width: 79,
        className: 'telemetry-dim',
        opacity: 0.72
    });

}

function renderLiveEventDashboardWidget(id, frame, values, phase) {
    const widget = createSvgWidget(id, { cols: 58, rows: 14, cellHeight: 10, kind: 'diag-event-log' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-green', colStep: 7, rowStep: 3 });
    drawSvgGuideRect(widget, 1, 1, 49, 9, { className: 'telemetry-green', opacity: 0.12 });
    drawSvgGuideRect(widget, 51, 1, 6, 11, { className: 'telemetry-amber', opacity: 0.12 });
    const bootLines = [
        ['SYS', 'Sensor bus precharge accepted.', 'OK'],
        ['NET', 'Dead-net relay handshake pending...', 'LOCK'],
        ['SEC', 'Perimeter lattice warming.', 'WARN'],
        ['BIO', 'Crew vital channels acquiring.', 'INFO'],
        ['REAC', 'Flux chamber lining up.', 'OK'],
        ['ANOM', 'Tomography solver idle.', 'INFO']
    ];
    const liveLines = [
        ['SYS', 'Gate stabilization field nominal.', 'OK'],
        ['NET', 'Dead-net carrier packet reroute.', 'LOCK'],
        ['SEC', 'Perimeter breach attempt Sector 04.', 'WARN'],
        ['BIO', `Unknown ${String(values.unknownLife).padStart(2, '0')} // unstable ${String(values.unstableLife).padStart(2, '0')}.`, 'INFO'],
        ['REAC', 'Neutron flux variance within limits.', 'OK'],
        ['ANOM', 'Anomaly spike at depth slice 312m.', 'ALERT'],
        ['PSY', 'Psych-AI resonance drift +0.7%.', 'WARN'],
        ['SEC', 'Countermeasures deployed.', 'OK'],
        ['GATE', 'Containment ritual drift corrected.', 'OK'],
        ['NET', 'Packet decay rising on dead-net leg.', 'WARN'],
        ['CORE', 'Archive bus transaction verified.', 'OK']
    ];
    const lines = phase.detail < 0.7 ? bootLines : liveLines;
    const offset = prefersReducedMotion ? 0 : Math.floor(frame / 16) % lines.length;
    const activeRow = prefersReducedMotion ? -1 : Math.floor((frame % 16) / 2);
    for (let index = 0; index < 8; index++) {
        const entry = lines[(offset + index) % lines.length];
        const seconds = String((10 + offset * 3 + index * 2) % 60).padStart(2, '0');
        const cls = entry[2] === 'ALERT' ? 'telemetry-red' : entry[2] === 'WARN' ? 'telemetry-amber' : entry[2] === 'LOCK' ? 'telemetry-cyan' : 'telemetry-green';
        if (index === activeRow) {
            drawSvgGuideRect(widget, 1, 2 + index - 0.45, 49, 1, { className: cls, opacity: 0.08 + phase.detail * 0.08 });
        }
        svgTextGlyph(widget.glyphLayer, entry[2] === 'ALERT' ? '◆' : entry[2] === 'WARN' ? '◇' : '●', 2, 2 + index, {
            className: cls,
            opacity: index === activeRow ? 1 : 0.72
        });
        renderFixedGlyphLine(widget.glyphLayer, 2 + index, `03:17:${seconds} [${entry[0]}] ${entry[1]}`, {
            col: 4,
            width: 45,
            className: cls,
            opacity: index === activeRow ? 0.98 : 0.48 + phase.detail * 0.34
        });
        svgLabel(widget.labelLayer, `[${entry[2]}]`, 51, 2 + index, { className: cls });
    }

    svgLabel(widget.labelLayer, 'PKT', 2, 11, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, 'ERR', 2, 12, { className: 'telemetry-red' });
    for (let col = 7; col < 48; col++) {
        const packet = (col + frame) % 9 === 0;
        const error = (col * 3 + Math.floor(frame / 2)) % 37 === 0;
        svgTextGlyph(widget.glyphLayer, packet ? '●' : '·', col, 11, { className: packet ? 'telemetry-cyan' : 'telemetry-dim', opacity: packet ? 0.9 : 0.24 });
        svgTextGlyph(widget.glyphLayer, error ? '◆' : '·', col, 12, { className: error ? 'telemetry-red' : 'telemetry-dim', opacity: error ? 0.92 : 0.16 });
    }
    for (let row = 2; row <= 10; row++) {
        const level = clampDiagnostic(0.48 + Math.sin(frame * 0.14 + row * 0.8) * 0.38);
        const active = level > (10 - row) / 8;
        svgTextGlyph(widget.glyphLayer, active ? '█' : '░', 55, row, { className: active ? (row < 4 ? 'telemetry-red' : row < 6 ? 'telemetry-amber' : 'telemetry-green') : 'telemetry-dim', opacity: active ? 0.78 : 0.26 });
    }
    svgLabel(widget.labelLayer, `AUTO-SCROLL ${phase.mode === 'live' ? 'ON' : 'CAL'}`, 1, 13, { className: 'telemetry-amber' });
    drawDiagnosticPhaseScan(widget, phase, 'EVENTS');
}

function renderSignalIntegrityDashboardWidget(id, frame, integrityValue, phase) {
    const widget = createSvgWidget(id, { cols: 42, rows: 12, cellHeight: 10, kind: 'diag-signal-strength-bars' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-green', colStep: 6, rowStep: 3 });
    const value = clampDiagnostic(diagnosticLiveValue(integrityValue + Math.sin(frame * 0.08) * 0.7, 18, phase), 0, 100);
    const dbValue = -96 + value * 0.72;
    const snr = diagnosticLiveValue(31 + Math.sin(frame * 0.06) * 2.4, 4, phase);
    const jitter = diagnosticLiveValue(0.8 + Math.sin(frame * 0.09) * 0.2, 6.4, phase);

    svgLabel(widget.labelLayer, 'CARRIER LOCK', 2, 2, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, `${dbValue.toFixed(1)} dBm`, 31, 2, { className: value < 72 ? 'telemetry-amber' : 'telemetry-green' });
    renderFixedGlyphLine(widget.glyphLayer, 4, `PWR ${glyphProgressBar(value, 24)}`, { col: 2, width: 34, className: value < 72 ? 'telemetry-amber' : 'telemetry-green', opacity: 0.9 });
    const markerCol = 7 + Math.round((value / 100) * 23);
    svgTextGlyph(widget.glyphLayer, '▲', markerCol, 5, { className: value < 72 ? 'telemetry-amber' : 'telemetry-cyan', opacity: 0.9 });

    renderFixedGlyphLine(widget.glyphLayer, 7, `SNR ${glyphProgressBar(snr * 2.2, 16)} ${snr.toFixed(1)}dB`, { col: 2, width: 31, className: 'telemetry-cyan', opacity: 0.86 });
    renderFixedGlyphLine(widget.glyphLayer, 9, `JIT ${glyphProgressBar(Math.max(0, 100 - jitter * 10), 16)} ${jitter.toFixed(1)}ms`, { col: 2, width: 31, className: jitter > 3 ? 'telemetry-amber' : 'telemetry-green', opacity: 0.86 });

    for (let col = 3; col <= 36; col++) {
        const pulse = (col + frame) % 11 === 0;
        const drop = (col * 5 + Math.floor(frame / 2)) % 41 === 0;
        svgTextGlyph(widget.glyphLayer, drop ? '◆' : pulse ? '●' : '·', col, 11, {
            className: drop ? 'telemetry-red' : pulse ? 'telemetry-cyan' : 'telemetry-dim',
            opacity: drop ? 0.92 : pulse ? 0.86 : 0.22
        });
    }
    svgLabel(widget.labelLayer, 'RX PULSE RAIL', 2, 10, { className: 'telemetry-dim' });
    if (phase.detail < 0.98) {
        const scanCol = Math.round(mixDiagnostic(2, widget.cols - 3, phase.sensorProgress / 100));
        drawSvgGuideLine(widget, scanCol, 2, scanCol, 10, { className: 'telemetry-amber', opacity: 0.22 });
        svgLabel(widget.labelLayer, `ACQ ${String(phase.sensorProgress).padStart(3, '0')}%`, 29, 10, { className: 'telemetry-amber' });
    }
}

function renderUplinkDashboardWidget(id, frame, values, phase) {
    const widget = createSvgWidget(id, { cols: 48, rows: 14, cellHeight: 10, kind: 'diag-uplink-processor' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-cyan', colStep: 6, rowStep: 4 });
    drawSvgGuideRect(widget, 1, 1, 46, 5, { className: 'telemetry-cyan', opacity: 0.12 });
    drawSvgGuideRect(widget, 1, 7, 46, 2, { className: 'telemetry-green', opacity: 0.12 });
    drawSvgGuideRect(widget, 1, 10, 28, 3, { className: 'telemetry-cyan', opacity: 0.12 });
    drawSvgGuideRect(widget, 32, 10, 15, 3, { className: 'telemetry-green', opacity: 0.12 });
    svgLabel(widget.labelLayer, 'WAVEFORM STRIP', 2, 2, { className: 'telemetry-cyan' });
    const waveform = [];
    for (let i = 0; i < Math.round(mixDiagnostic(8, 38, phase.detail)); i++) {
        const col = 4 + i;
        const noise = Math.sin(frame * 0.28 + i * 1.7) * 0.7 + Math.sin(frame * 0.1 + i * 0.34) * 0.45;
        waveform.push(widgetGridPixel(widget, col, 4.4 + noise));
    }
    svgPolyline(widget.glyphLayer, waveform, { className: 'telemetry-cyan telemetry-trace-bold', opacity: 0.58 + phase.detail * 0.28 });
    renderFixedGlyphLine(widget.glyphLayer, 8, `PHASE LOCK ${glyphProgressBar(diagnosticLiveValue(values.sync, 12, phase), 18)} ${values.sync > 85 ? 'LOCKED' : 'DRIFT'}`, {
        col: 2,
        width: 42,
        className: values.sync > 85 ? 'telemetry-green' : 'telemetry-amber',
        opacity: 0.9
    });
    const processorLoad = diagnosticLiveValue(43 + Math.sin(frame * 0.12) * 4, 9, phase);
    svgLabel(widget.labelLayer, 'PROCESSOR LOAD', 2, 11, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, `${Math.round(processorLoad)}%`, 23, 11, { className: 'telemetry-cyan', fontSize: 18 });
    const spinCenterCol = 39;
    const spinCenterRow = 11.5;
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + (prefersReducedMotion ? 0 : frame * 0.09);
        const col = spinCenterCol + Math.round(Math.cos(angle) * 4);
        const row = spinCenterRow + Math.round(Math.sin(angle) * 2);
        svgTextGlyph(widget.glyphLayer, '·', col, row, { className: 'telemetry-green', opacity: 0.22 + (i / 12) * 0.62 });
    }
    svgLabel(widget.labelLayer, 'SCAN', 35, 13, { className: 'telemetry-green' });
    drawDiagnosticPhaseScan(widget, phase, 'UPLINK');
}

let sideTelemetryFrame = 0;
let sideTelemetryAnimFrame = null;
let sideTelemetryLastRender = 0;

function sideRoutePoint(route, progress) {
    const clamped = clampDiagnostic(progress, 0, 0.999);
    const scaled = clamped * (route.length - 1);
    const index = Math.floor(scaled);
    const local = scaled - index;
    const start = route[index];
    const end = route[Math.min(route.length - 1, index + 1)];
    return {
        col: mixDiagnostic(start[0], end[0], local),
        row: mixDiagnostic(start[1], end[1], local)
    };
}

function renderSidePacket(widget, route, frame, offset, options = {}) {
    const progress = ((frame * (options.speed || 0.035) + offset) % 1 + 1) % 1;
    const point = sideRoutePoint(route, progress);
    svgTextGlyph(widget.glyphLayer, options.glyph || '●', Math.round(point.col), Math.round(point.row), {
        className: options.className || 'telemetry-green',
        opacity: options.opacity ?? 0.88
    });
}

function startSideTelemetryLoop() {
    if (sideTelemetryAnimFrame || prefersReducedMotion || !AppState.networkOnline) {
        renderSideGlyphTelemetry(sideTelemetryFrame);
        return;
    }
    sideTelemetryLastRender = 0;
    sideTelemetryAnimFrame = requestAnimationFrame(runSideTelemetryLoop);
}

function stopSideTelemetryLoop() {
    if (!sideTelemetryAnimFrame) return;
    cancelAnimationFrame(sideTelemetryAnimFrame);
    sideTelemetryAnimFrame = null;
}

function runSideTelemetryLoop(timestamp = 0) {
    if (!AppState.networkOnline || prefersReducedMotion || document.hidden) {
        sideTelemetryAnimFrame = null;
        renderSideGlyphTelemetry(sideTelemetryFrame);
        return;
    }

    const interval = diagnosticRenderProfile().sideTelemetryMs || effectsFrameMs(80, 140, 180);
    if (!sideTelemetryLastRender || timestamp - sideTelemetryLastRender >= interval) {
        sideTelemetryLastRender = timestamp;
        sideTelemetryFrame++;
        renderSideGlyphTelemetry(sideTelemetryFrame);
    }
    sideTelemetryAnimFrame = requestAnimationFrame(runSideTelemetryLoop);
}

function renderSideSignalSpectrum(frame = 0) {
    const widget = createSvgWidget('sideSignalSpectrum', { cols: 40, rows: 10, cellHeight: 9, kind: 'side-signal-spectrum-analyzer' });
    if (!widget) return;
    drawDashboardGrid(widget, {
        className: AppState.networkOnline ? 'telemetry-cyan' : 'telemetry-red',
        colStep: 5,
        rowStep: 2
    });
    svgLabel(widget.labelLayer, 'SPECTRUM ANALYZER', 2, 1, { className: AppState.networkOnline ? 'telemetry-amber' : 'telemetry-red' });

    if (!AppState.networkOnline) {
        renderFixedGlyphLine(widget.glyphLayer, 5, 'NO CARRIER // SIGNAL BUS OFFLINE', {
            col: 3,
            width: 34,
            className: 'telemetry-red',
            opacity: 0.88
        });
        drawSvgGuideLine(widget, 4, 7, 36, 7, { className: 'telemetry-red', opacity: 0.28 });
        return;
    }

    const reduced = prefersReducedMotion || (typeof safeModeActive === 'function' && safeModeActive());
    const activeFrame = reduced ? 12 : frame;
    const peakPoints = [];
    for (let col = 4; col <= 35; col++) {
        const normalized = (col - 4) / 31;
        const carrierA = Math.exp(-((normalized - 0.28) ** 2) / 0.004) * 0.82;
        const carrierB = Math.exp(-((normalized - 0.62) ** 2) / 0.007) * 0.7;
        const carrierC = Math.exp(-((normalized - 0.84) ** 2) / 0.003) * 0.88;
        const drift = Math.sin(activeFrame * 0.12 + col * 0.63) * 0.15;
        const floor = Math.sin(col * 1.7 + activeFrame * 0.04) * 0.08;
        const level = clampDiagnostic(0.18 + carrierA + carrierB + carrierC + drift + floor, 0.06, 1);
        const height = Math.max(1, Math.round(level * 6));
        const cls = level > 0.82 ? 'telemetry-red' : level > 0.64 ? 'telemetry-amber' : level > 0.42 ? 'telemetry-green' : 'telemetry-cyan';
        for (let rowOffset = 0; rowOffset < height; rowOffset++) {
            const row = 8 - rowOffset;
            const glyph = rowOffset === height - 1 ? blockGlyph(level) : '█';
            svgTextGlyph(widget.glyphLayer, glyph, col, row, {
                className: cls,
                opacity: 0.36 + level * 0.5 - rowOffset * 0.025
            });
        }
        peakPoints.push(widgetGridPixel(widget, col, 7.6 - level * 5.8));
    }

    svgPolyline(widget.glyphLayer, peakPoints, { className: 'telemetry-amber telemetry-trace-thin', opacity: 0.52 });
    [12, 24, 33].forEach((col, index) => {
        const pulse = reduced ? 0.68 : 0.56 + Math.sin(activeFrame * (0.11 + index * 0.02)) * 0.22;
        drawSvgGuideLine(widget, col, 2.2, col, 8.5, {
            className: index === 2 ? 'telemetry-red' : 'telemetry-cyan',
            opacity: 0.14 + pulse * 0.16
        });
        svgTextGlyph(widget.glyphLayer, index === 2 ? '◆' : '●', col, 2, {
            className: index === 2 ? 'telemetry-red' : 'telemetry-cyan',
            opacity: pulse
        });
    });
    svgLabel(widget.labelLayer, '10Hz', 3, 9, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, '1k', 18, 9, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, '10k', 33, 9, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, `${Math.round(84 + Math.sin(activeFrame * 0.09) * 4)}%`, 33, 1, { className: 'telemetry-green' });
}

function renderSideDiagnosticPreview(frame = 0) {
    const widget = createSvgWidget('sideDiagnosticTelemetry', { cols: 36, rows: 9, cellHeight: 10, kind: 'side-diagnostic-live-svg' });
    if (!widget) return;
    drawDashboardGrid(widget, {
        className: AppState.networkOnline ? 'telemetry-green' : 'telemetry-red',
        colStep: 4,
        rowStep: 2
    });
    svgLabel(widget.labelLayer, 'DIAGNOSTIC BUS', 2, 1, { className: AppState.networkOnline ? 'telemetry-amber' : 'telemetry-red' });

    if (!AppState.networkOnline) {
        renderFixedGlyphLine(widget.glyphLayer, 4, 'NO CARRIER // SENSOR BUS PAUSED', {
            col: 3,
            width: 31,
            className: 'telemetry-red',
            opacity: 0.86
        });
        drawSvgGuideLine(widget, 3, 6, 33, 6, { className: 'telemetry-red', opacity: 0.28 });
        return;
    }

    const traceA = [];
    const traceB = [];
    for (let index = 0; index <= 29; index++) {
        const col = 3 + index;
        const phase = frame * 0.1 + index * 0.34;
        const a = Math.sin(phase) * 0.74 + Math.sin(phase * 2.1 + 0.8) * 0.22 + Math.sin(index * 1.7 + frame * 0.045) * 0.09;
        const b = Math.cos(phase * 0.83 + 1.4) * 0.58 + Math.sin(phase * 2.7) * 0.18;
        traceA.push(widgetGridPixel(widget, col, 3.05 - a));
        traceB.push(widgetGridPixel(widget, col, 5.55 - b));
    }
    svgPolyline(widget.glyphLayer, traceA, { className: 'telemetry-green telemetry-trace-thin', opacity: 0.92 });
    svgPolyline(widget.glyphLayer, traceB, { className: 'telemetry-cyan telemetry-trace-thin', opacity: 0.86 });
    drawSvgGuideLine(widget, 3, 4.35, 33, 4.35, { className: 'telemetry-amber', opacity: 0.12 });

    const cursorCol = 3 + (frame % 30);
    drawSvgGuideLine(widget, cursorCol, 2, cursorCol, 6.8, { className: 'telemetry-amber', opacity: 0.18 });
    svgTextGlyph(widget.glyphLayer, '◆', cursorCol, 2, { className: 'telemetry-amber', opacity: 0.9 });
    svgLabel(widget.labelLayer, 'A', 33, 3, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'B', 33, 5.6, { className: 'telemetry-cyan' });

    for (let col = 3; col <= 33; col++) {
        const level = clampDiagnostic((Math.sin(frame * 0.08 + col * 0.55) + Math.sin(col * 1.3) + 2) / 4);
        const cls = level > 0.82 ? 'telemetry-red' : level > 0.62 ? 'telemetry-amber' : level > 0.42 ? 'telemetry-green' : 'telemetry-cyan';
        svgTextGlyph(widget.glyphLayer, densityGlyph(level), col, 8, { className: cls, opacity: 0.42 + level * 0.44 });
    }
    svgLabel(widget.labelLayer, `${Math.round(68 + Math.sin(frame * 0.07) * 6)}%`, 29, 1, { className: 'telemetry-green' });
}

function renderSideFacilityPreview(frame = 0) {
    const widget = createSvgWidget('sideFacilityTelemetry', { cols: 36, rows: 9, cellHeight: 10, kind: 'side-facility-live-svg' });
    if (!widget) return;
    drawDashboardGrid(widget, {
        className: AppState.networkOnline ? 'telemetry-amber' : 'telemetry-red',
        colStep: 6,
        rowStep: 2
    });
    svgLabel(widget.labelLayer, 'FACILITY MESH', 2, 1, { className: AppState.networkOnline ? 'telemetry-amber' : 'telemetry-red' });

    const nodes = [
        { id: 'CORE', col: 18, row: 4.4, glyph: '◇', className: 'telemetry-green' },
        { id: 'LAB', col: 8, row: 2.4, glyph: '□', className: 'telemetry-cyan' },
        { id: 'SEC', col: 28, row: 2.6, glyph: '△', className: 'telemetry-amber' },
        { id: 'GEN', col: 7, row: 6.4, glyph: '○', className: 'telemetry-amber' },
        { id: 'GATE', col: 29, row: 6.1, glyph: '◇', className: 'telemetry-red' },
        { id: 'HAB', col: 18, row: 7.1, glyph: '□', className: 'telemetry-green' }
    ];
    const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
    const links = [
        ['CORE', 'LAB', 'telemetry-cyan'],
        ['CORE', 'SEC', 'telemetry-amber'],
        ['CORE', 'GEN', 'telemetry-amber'],
        ['CORE', 'GATE', 'telemetry-red'],
        ['CORE', 'HAB', 'telemetry-green'],
        ['LAB', 'SEC', 'telemetry-cyan'],
        ['GEN', 'HAB', 'telemetry-green']
    ];

    links.forEach(([from, to, cls]) => {
        const start = byId[from];
        const end = byId[to];
        drawSvgGuideLine(widget, start.col, start.row, end.col, end.row, {
            className: AppState.networkOnline ? cls : 'telemetry-red',
            opacity: cls === 'telemetry-red' ? 0.28 : 0.18
        });
    });
    drawSvgGuideCircle(widget, byId.CORE.col, byId.CORE.row, 4.6, { className: AppState.networkOnline ? 'telemetry-green' : 'telemetry-red', opacity: 0.08 });

    nodes.forEach(node => {
        const pulse = AppState.networkOnline && !prefersReducedMotion ? (Math.sin(frame * 0.12 + node.col) + 1) * 0.14 : 0;
        svgTextGlyph(widget.glyphLayer, node.glyph, node.col, node.row, {
            className: AppState.networkOnline ? node.className : 'telemetry-red',
            opacity: AppState.networkOnline ? 0.74 + pulse : 0.44
        });
        svgLabel(widget.labelLayer, node.id, node.col + 1, node.row - 0.35, {
            className: AppState.networkOnline ? node.className : 'telemetry-red',
            opacity: AppState.networkOnline ? 0.78 : 0.48
        });
    });

    if (!AppState.networkOnline) {
        renderFixedGlyphLine(widget.glyphLayer, 8, 'NET OFFLINE // MAP HOLD', {
            col: 4,
            width: 28,
            className: 'telemetry-red',
            opacity: 0.88
        });
        return;
    }

    renderSidePacket(widget, [[8, 2.4], [18, 4.4], [28, 2.6]], frame, 0.0, { glyph: '●', className: 'telemetry-cyan', speed: 0.028 });
    renderSidePacket(widget, [[7, 6.4], [18, 4.4], [29, 6.1]], frame, 0.37, { glyph: '◆', className: 'telemetry-red', speed: 0.022, opacity: 0.72 });
    renderSidePacket(widget, [[18, 7.1], [18, 4.4], [8, 2.4]], frame, 0.68, { glyph: '●', className: 'telemetry-green', speed: 0.033 });

    for (let col = 4; col <= 32; col++) {
        const active = ((col + Math.floor(frame / 2)) % 9) < 5;
        const cls = col > 25 ? 'telemetry-red' : col > 18 ? 'telemetry-amber' : 'telemetry-green';
        svgTextGlyph(widget.glyphLayer, active ? '█' : '░', col, 8, {
            className: active ? cls : 'telemetry-dim',
            opacity: active ? 0.72 : 0.24
        });
    }
}

function renderSideGlyphTelemetry(frame = 0) {
    renderSideSignalSpectrum(frame);
    renderSideDiagnosticPreview(frame);
    renderSideFacilityPreview(frame);
}

function renderDiagnosticDashboard(timestamp = performance.now(), options = {}) {
    const frame = diagnosticFrame;
    const phaseInfo = getDiagnosticPhase(frame);
    const phase = prefersReducedMotion ? 48 : frame;
    const forceWidgets = Boolean(options.force);
    const meta = phaseInfo.mode === 'boot'
        ? `SCAN BUS: READING SENSORS ${asciiBar(phaseInfo.sensorProgress, 12)}`
        : phaseInfo.mode === 'transition'
            ? `SCAN BUS: RESOLVING LIVE TELEMETRY ${asciiBar(phaseInfo.sensorProgress, 12)}`
            : `SCAN BUS: LIVE DASHBOARD // FRAME ${String(frame).padStart(4, '0')}`;
    diagText('diagnosticMeta', meta);

    const network = statusNumber('diagnostic.network.level', 69 + Math.round(Math.sin(phase * 0.31) * 5), 0, 100);
    const generator = statusNumber('diagnostic.generator.level', 62 + Math.round(Math.sin(phase * 0.22) * 6), 0, 100);
    const mainPower = statusNumber('diagnostic.power.main', 61 + Math.round(Math.sin(phase * 0.16) * 4), 0, 100);
    const reservePower = statusNumber('diagnostic.power.reserve', 34 + Math.round(Math.cos(phase * 0.12) * 5), 0, 100);
    const lifeCount = Math.round(statusNumber('diagnostic.life.known', 14 + (phase % 9 === 0 ? 1 : 0), 0, 99));
    const unstableLife = Math.round(statusNumber('diagnostic.life.unstable', 2, 0, 99));
    const unknownLife = Math.round(statusNumber('diagnostic.life.unknown', 3 + (phase % 11 === 0 ? 1 : 0), 0, 99));
    const reactorOutput = statusNumber('diagnostic.reactor.output', 87.6 + Math.sin(phase * 0.12) * 1.8, 0, 100);
    const syncIntegrity = statusNumber('diagnostic.sync.integrity', 94.3 + Math.sin(phase * 0.09) * 1.1, 0, 100);
    const signalIntegrity = statusNumber('diagnostic.signal.integrity', 91.2 + Math.sin(phase * 0.08) * 1.4, 0, 100);

    const networkStatus = statusGet('diagnostic.network.status', 'DISCONNECTED').toUpperCase();
    diagCardState('diagNetworkCard', phaseInfo.mode === 'live' ? statusState('diagnostic.network.state', 'warn') : 'ok');
    diagText('diagNetworkStatus', diagnosticStatusText(networkStatus === 'DISCONNECTED' ? 'NOISE' : networkStatus, phaseInfo, 'SCAN', 'SYNC'));
    renderDiagnosticWidget('network', timestamp, () => renderSpectrumDashboardWidget('diagNetwork', phase, network, phaseInfo), { force: forceWidgets });

    const securityStatus = statusGet('diagnostic.alarm.status', 'DIS DEGRADED').toUpperCase();
    diagCardState('diagSecurityCard', phaseInfo.mode === 'live' ? statusState('diagnostic.alarm.state', 'warn') : 'ok');
    diagText('diagSecurityStatus', diagnosticStatusText(securityStatus === 'DIS DEGRADED' ? 'ELEVATED' : securityStatus, phaseInfo, 'SOLVE', 'MESH'));
    renderDiagnosticWidget('security', timestamp, () => renderTomographyDashboardWidget('diagSecurity', phase, phaseInfo), { force: forceWidgets });

    const outpostStatus = statusGet('diagnostic.outposts.status', 'LINK DEGRADED').toUpperCase();
    diagCardState('diagOutpostCard', phaseInfo.mode === 'live' ? statusState('diagnostic.outposts.state', 'warn') : 'ok');
    diagText('diagOutpostStatus', diagnosticStatusText(outpostStatus, phaseInfo, 'PING', 'SWEEP'));
    renderDiagnosticWidget('outpost', timestamp, () => renderTacticalRadarDashboardWidget('diagOutpost', phase, phaseInfo), { force: forceWidgets, interval: diagnosticRenderProfile().radar?.frameMs });

    const generatorStatus = statusGet('diagnostic.generator.status', 'SERVICE DUE').toUpperCase();
    diagCardState('diagGeneratorCard', phaseInfo.mode === 'live' ? statusState('diagnostic.generator.state', 'warn') : 'ok');
    diagText('diagGeneratorStatus', diagnosticStatusText(generatorStatus, phaseInfo, 'CAL', 'LOCK'));
    renderDiagnosticWidget('generator', timestamp, () => renderGateScopeDashboardWidget('diagGenerator', phase, generator, phaseInfo), { force: forceWidgets });

    const powerStatus = statusGet('diagnostic.power.status', 'LOW RESERVE').toUpperCase();
    diagCardState('diagPowerCard', phaseInfo.mode === 'live' ? statusState('diagnostic.power.state', 'warn') : 'ok');
    diagText('diagPowerStatus', diagnosticStatusText(powerStatus, phaseInfo, 'BUS', 'LOAD'));
    renderDiagnosticWidget('power', timestamp, () => renderReactorSyncDashboardWidget('diagPower', phase, { output: reactorOutput, sync: syncIntegrity, mainPower, reservePower }, phaseInfo), { force: forceWidgets });

    const alarmStatus = statusGet('diagnostic.security.status', 'MESH').toUpperCase();
    diagCardState('diagAlarmCard', phaseInfo.mode === 'live' ? statusState('diagnostic.security.state', 'warn') : 'ok');
    diagText('diagAlarmStatus', diagnosticStatusText(alarmStatus === 'ARMED' ? 'MESH' : alarmStatus, phaseInfo, 'MAP', 'MESH'));
    renderDiagnosticWidget('alarm', timestamp, () => renderBlackDesertMapDashboardWidget('diagAlarm', phase, phaseInfo), { force: forceWidgets });

    const lifeStatus = statusGet('diagnostic.life.status', `${unknownLife} UNKNOWN`).toUpperCase();
    diagCardState('diagLifeCard', phaseInfo.mode === 'live' ? statusState('diagnostic.life.state', 'alert') : 'ok');
    diagText('diagLifeStatus', diagnosticStatusText(lifeStatus, phaseInfo, 'BIO', 'SYNC'));
    renderDiagnosticWidget('life', timestamp, () => renderBioscanArrayDashboardWidget('diagLife', phase, { lifeCount, unstableLife, unknownLife }, phaseInfo), { force: forceWidgets });

    diagCardState('diagEventsCard', phaseInfo.mode === 'live' ? statusState('diagnostic.alarm.state', 'warn') : 'ok');
    diagText('diagEventsStatus', diagnosticStatusText('FEED', phaseInfo, 'BOOT', 'TAIL'));
    renderDiagnosticWidget('events', timestamp, () => renderLiveEventDashboardWidget('diagEvents', phase, { lifeCount, unstableLife, unknownLife }, phaseInfo), { force: forceWidgets });

    diagCardState('diagIntegrityCard', signalIntegrity < 72 ? 'alert' : signalIntegrity < 86 ? 'warn' : 'ok');
    diagText('diagIntegrityStatus', diagnosticStatusText(`${signalIntegrity.toFixed(1)}%`, phaseInfo, 'LOCK', 'CAL'));
    renderDiagnosticWidget('integrity', timestamp, () => renderSignalIntegrityDashboardWidget('diagIntegrity', phase, signalIntegrity, phaseInfo), { force: forceWidgets });

    diagCardState('diagUplinkCard', phaseInfo.mode === 'live' ? statusState('diagnostic.network.state', 'warn') : 'ok');
    diagText('diagUplinkStatus', diagnosticStatusText(syncIntegrity > 88 ? 'LOCKED' : 'DRIFT', phaseInfo, 'PROC', 'SYNC'));
    renderDiagnosticWidget('uplink', timestamp, () => renderUplinkDashboardWidget('diagUplink', phase, { sync: syncIntegrity }, phaseInfo), { force: forceWidgets });

    const defaultTicker = `FACILITY PASS: EXTERNAL COMMS DOWN // DEFENSE ARMED // DIS SENSORS DEGRADED // UNKNOWN LIFE SIGNS ${spinner(phase)} ${asciiSweep(phase, 20)}`;
    const phaseTicker = phaseInfo.mode === 'boot'
        ? `BASE STATUS BOOT ${['◢', '◐', '◒', '◣'][frame % 4]} READING SENSOR ARRAYS // WIREFRAME SOLVER PRECHARGE`
        : phaseInfo.mode === 'transition'
            ? `SENSOR BOOT COMPLETE // BLENDING CALIBRATION GRAPHS INTO LIVE TELEMETRY ${asciiSweep(phase, 18)}`
            : statusInterpolate(statusGet('diagnostic.ticker', defaultTicker), phase);
    diagText('diagnosticTicker', phaseTicker);
    if (!sideTelemetryAnimFrame) renderSideGlyphTelemetry(phase);
}

function runDiagnosticLoop(timestamp = 0) {
    if (!diagnosticActive || !AppState.networkOnline) return;
    if (document.hidden) {
        diagnosticAnimFrame = null;
        return;
    }
    const interval = diagnosticRenderProfile().schedulerMs || effectsFrameMs(80, 140, 180);
    if (!diagnosticLastRender || timestamp - diagnosticLastRender >= interval) {
        diagnosticLastRender = timestamp;
        diagnosticFrame++;
        renderDiagnosticDashboard(timestamp);
        if (diagnosticFrame < 32 && diagnosticFrame % 5 === 0) AudioEngine.keyClick();
    }
    diagnosticAnimFrame = requestAnimationFrame(runDiagnosticLoop);
}

function showDiagnosticDashboard() {
    if (!AppState.networkOnline) {
        printNetworkUnavailable('DIAGNOSTIC');
        return;
    }
    const overlay = document.getElementById('diagnosticOverlay');
    if (!overlay || overlay.classList.contains('active')) return;
    diagnosticActive = true;
    setAppState({ activeOverlay: 'diagnostic' }, { resetSelection: false });
    diagnosticFrame = prefersReducedMotion ? 48 : 0;
    diagnosticLastRender = 0;
    resetDiagnosticWidgetRegistry();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    renderDiagnosticDashboard(performance.now(), { force: true });
    AudioEngine.bootBeep();
    Animator.dialogOpen(overlay);
    if (!prefersReducedMotion) {
        diagnosticAnimFrame = requestAnimationFrame(runDiagnosticLoop);
    }
}

function closeDiagnosticDashboard() {
    const overlay = document.getElementById('diagnosticOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;
    diagnosticActive = false;
    setAppState({ activeOverlay: 'none' }, { resetSelection: false });
    if (diagnosticAnimFrame) {
        cancelAnimationFrame(diagnosticAnimFrame);
        diagnosticAnimFrame = null;
    }
    resetDiagnosticWidgetRegistry();
    AudioEngine.pageFlip();
    Animator.dialogClose(overlay, () => {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    });
}

// ========================================
// FACILITY STATUS WIREFRAME
// ========================================
const FACILITY_ZONES = [
    { id: 'core', label: 'CMD CORE', status: 'NOMINAL', state: 'ok', x: 0.42, y: 0.34, w: 0.17, h: 0.15, load: 78, pulse: 0 },
    { id: 'lab', label: 'LAB ARC', status: 'SEAL DRIFT', state: 'warn', x: 0.18, y: 0.22, w: 0.18, h: 0.14, load: 64, pulse: 1.1 },
    { id: 'med', label: 'MED BAY', status: 'STANDBY', state: 'ok', x: 0.65, y: 0.20, w: 0.16, h: 0.13, load: 71, pulse: 2.2 },
    { id: 'hab', label: 'HAB RING', status: 'LOW HEAT', state: 'warn', x: 0.68, y: 0.48, w: 0.18, h: 0.15, load: 67, pulse: 3.3 },
    { id: 'gen', label: 'GEN PLANT', status: 'SERVICE', state: 'warn', x: 0.19, y: 0.52, w: 0.19, h: 0.15, load: 61, pulse: 4.4 },
    { id: 'contain', label: 'CNTM CELL', status: 'WATCH', state: 'alert', x: 0.44, y: 0.66, w: 0.17, h: 0.15, load: 58, pulse: 5.5 },
    { id: 'storage', label: 'STORAGE', status: 'DARK SECT', state: 'warn', x: 0.09, y: 0.72, w: 0.16, h: 0.13, load: 49, pulse: 6.6 },
    { id: 'uplink', label: 'UPLINK', status: 'WEAK BUS', state: 'warn', x: 0.79, y: 0.73, w: 0.15, h: 0.12, load: 53, pulse: 7.7 },
    { id: 'service', label: 'SVC BUS', status: 'UNK TRACE', state: 'alert', x: 0.43, y: 0.08, w: 0.16, h: 0.11, load: 47, pulse: 8.8 }
];

const FACILITY_LINKS = [
    { from: 'core', to: 'lab', state: 'ok', phase: 0.05 },
    { from: 'core', to: 'med', state: 'ok', phase: 0.16 },
    { from: 'core', to: 'hab', state: 'warn', phase: 0.27 },
    { from: 'core', to: 'gen', state: 'warn', phase: 0.38 },
    { from: 'core', to: 'contain', state: 'alert', phase: 0.49 },
    { from: 'lab', to: 'service', state: 'warn', phase: 0.6 },
    { from: 'med', to: 'service', state: 'ok', phase: 0.71 },
    { from: 'gen', to: 'storage', state: 'warn', phase: 0.82 },
    { from: 'contain', to: 'uplink', state: 'alert', phase: 0.93 },
    { from: 'hab', to: 'uplink', state: 'warn', phase: 0.35 },
    { from: 'storage', to: 'contain', state: 'warn', phase: 0.58 }
];

const FACILITY_CONTACTS = [
    { from: 'service', to: 'contain', phase: 0.12 },
    { from: 'lab', to: 'core', phase: 0.47 },
    { from: 'storage', to: 'gen', phase: 0.78 }
];

function getFacilityZones() {
    if (facilityZoneCache) return facilityZoneCache;

    const defaultIds = new Set(FACILITY_ZONES.map(zone => zone.id));
    const zones = FACILITY_ZONES
        .filter(zone => statusBool(`facility.zone.${zone.id}.enabled`, true))
        .map(zone => ({
        ...zone,
        label: statusGet(`facility.zone.${zone.id}.label`, zone.label).toUpperCase().slice(0, 12),
        status: statusGet(`facility.zone.${zone.id}.status`, zone.status).toUpperCase().slice(0, 12),
        state: statusState(`facility.zone.${zone.id}.state`, zone.state),
        load: statusNumber(`facility.zone.${zone.id}.load`, zone.load, 0, 100),
        x: statusNumber(`facility.zone.${zone.id}.x`, zone.x, 0.02, 0.92),
        y: statusNumber(`facility.zone.${zone.id}.y`, zone.y, 0.04, 0.86),
        w: statusNumber(`facility.zone.${zone.id}.w`, zone.w, 0.08, 0.28),
        h: statusNumber(`facility.zone.${zone.id}.h`, zone.h, 0.08, 0.24)
    }));

    statusSectionIds('facility.zone')
        .filter(id => !defaultIds.has(id) && statusBool(`facility.zone.${id}.enabled`, true))
        .sort(sortStatusIds)
        .forEach((id, index) => {
            const prefix = `facility.zone.${id}`;
            const fallbackX = 0.16 + (index % 3) * 0.24;
            const fallbackY = 0.18 + Math.floor(index / 3) * 0.18;
            zones.push({
                id,
                label: statusGet(`${prefix}.label`, id.replace(/_/g, ' ')).toUpperCase().slice(0, 12),
                status: statusGet(`${prefix}.status`, 'WATCH').toUpperCase().slice(0, 12),
                state: statusState(`${prefix}.state`, 'warn'),
                load: statusNumber(`${prefix}.load`, 50, 0, 100),
                x: statusNumber(`${prefix}.x`, Math.min(0.84, fallbackX), 0.02, 0.92),
                y: statusNumber(`${prefix}.y`, Math.min(0.78, fallbackY), 0.04, 0.86),
                w: statusNumber(`${prefix}.w`, 0.14, 0.08, 0.28),
                h: statusNumber(`${prefix}.h`, 0.12, 0.08, 0.24),
                pulse: statusNumber(`${prefix}.pulse`, index * 0.43, 0, 10)
            });
        });

    facilityZoneCache = zones;
    return facilityZoneCache;
}

function getFacilityLinks() {
    if (facilityLinkCache) return facilityLinkCache;

    const defaultIds = new Set(FACILITY_LINKS.map(link => `${link.from}_${link.to}`));
    const links = FACILITY_LINKS
        .filter(link => statusBool(`facility.link.${link.from}_${link.to}.enabled`, true))
        .map(link => {
            const id = `${link.from}_${link.to}`;
            return {
                ...link,
                from: normalizeStatusKey(statusGet(`facility.link.${id}.from`, link.from)),
                to: normalizeStatusKey(statusGet(`facility.link.${id}.to`, link.to)),
                state: statusState(`facility.link.${id}.state`, link.state)
            };
        });

    statusSectionIds('facility.link')
        .filter(id => !defaultIds.has(id) && statusBool(`facility.link.${id}.enabled`, true))
        .sort(sortStatusIds)
        .forEach((id, index) => {
            const prefix = `facility.link.${id}`;
            const from = normalizeStatusKey(statusGet(`${prefix}.from`, ''));
            const to = normalizeStatusKey(statusGet(`${prefix}.to`, ''));
            if (!from || !to) return;
            links.push({
                from,
                to,
                state: statusState(`${prefix}.state`, 'warn'),
                phase: statusNumber(`${prefix}.phase`, (index * 0.21 + 0.14) % 1, 0, 1)
            });
        });

    facilityLinkCache = links;
    return facilityLinkCache;
}

function getFacilityContacts() {
    if (facilityContactCache) return facilityContactCache;

    const routeText = statusGet('facility.contacts.routes', '');
    const parsedRoutes = routeText
        ? routeText.split(',').map((route, index) => {
            const parts = route.trim().split(/\s*(?:->|>)\s*/);
            if (parts.length !== 2) return null;
            return {
                from: normalizeStatusKey(parts[0]),
                to: normalizeStatusKey(parts[1]),
                phase: (index * 0.27 + 0.12) % 1
            };
        }).filter(Boolean)
        : [];
    const routes = parsedRoutes.length ? parsedRoutes : FACILITY_CONTACTS;
    const count = Math.round(statusNumber('facility.contacts.unknown', routes.length, 0, 8));
    if (count <= 0) {
        facilityContactCache = [];
        return facilityContactCache;
    }

    const contacts = [];
    for (let i = 0; i < count; i++) {
        const route = routes[i % routes.length] || FACILITY_CONTACTS[i % FACILITY_CONTACTS.length];
        contacts.push({
            ...route,
            phase: (route.phase + i * 0.19) % 1
        });
    }
    facilityContactCache = contacts;
    return facilityContactCache;
}

function facilityZoneReadoutLine(zone) {
    const label = zone.label.padEnd(10, ' ').slice(0, 10);
    const status = zone.status.padEnd(9, ' ').slice(0, 9);
    return `${label} ${status} ${String(Math.round(zone.load)).padStart(2, '0')}%`;
}

function facilityReadoutBar(value, width = 10) {
    return glyphProgressBar(Math.max(0, Math.min(100, value)), width);
}

function facilityGridNode(zone, widget, frame) {
    const drift = prefersReducedMotion ? 0 : Math.sin(frame * 0.042 + zone.pulse) * 0.35;
    return {
        col: Math.max(6, Math.min(widget.cols - 7, Math.round(zone.x * (widget.cols - 12) + 6 + drift))),
        row: Math.max(3, Math.min(widget.rows - 4, Math.round(zone.y * (widget.rows - 7) + 3 - drift * 0.45)))
    };
}

function facilityStateClass(state) {
    if (state === 'alert') return 'telemetry-red';
    if (state === 'warn') return 'telemetry-amber';
    if (state === 'ok') return 'telemetry-green';
    return 'telemetry-cyan';
}

function facilityCommandRect(zone, widget) {
    const usableCols = widget.cols - 16;
    const usableRows = widget.rows - 10;
    const col = Math.max(4, Math.min(widget.cols - 13, 5 + zone.x * usableCols));
    const row = Math.max(4, Math.min(widget.rows - 9, 4 + zone.y * usableRows));
    const cols = Math.max(7, Math.min(18, zone.w * usableCols));
    const rows = Math.max(3.2, Math.min(7.5, zone.h * usableRows));
    return { col, row, cols, rows, centerCol: col + cols / 2, centerRow: row + rows / 2 };
}

function drawFacilityZoneShape(widget, zone, rect) {
    const cls = facilityStateClass(zone.state);
    widget.guideLayer.appendChild(svgElement('rect', {
        x: rect.col * widget.cellWidth,
        y: rect.row * widget.cellHeight,
        width: rect.cols * widget.cellWidth,
        height: rect.rows * widget.cellHeight,
        rx: 3,
        class: `facility-zone-shape ${cls}`.trim(),
        opacity: zone.state === 'alert' ? 0.34 : zone.state === 'warn' ? 0.25 : 0.18
    }));
    drawSvgGuideRect(widget, rect.col, rect.row, rect.cols, rect.rows, { className: cls, opacity: 0.44 });
    svgLabel(widget.labelLayer, zone.label, rect.col + 0.8, rect.row + 1.1, { className: cls, fontSize: 8.5 });
    svgLabel(widget.labelLayer, zone.status, rect.col + 0.8, rect.row + 2.2, { className: 'telemetry-dim', fontSize: 7.2 });
}

function renderFacilityAtmosphere(frame, zones) {
    const canvas = getById('facilityAtmosphereCanvas');
    if (!canvas) return;
    const facilityProfile = diagnosticFacilityProfile();
    const refreshEvery = Math.max(30, Number(facilityProfile.backgroundRefreshFrames || 180));

    // The atmospheric layer is static. Avoid forcing a layout read every
    // facility frame; refresh occasionally to catch resize/profile changes.
    if (canvas.dataset.facilityAtmosphereKey && frame % refreshEvery !== 0 && !prefersReducedMotion) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const ctx = canvas.getContext('2d');
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const targetWidth = Math.max(1, Math.round(rect.width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const width = rect.width;
    const height = rect.height;
    const low = effectsLowActive() || prefersReducedMotion || (typeof safeModeActive === 'function' && safeModeActive());
    const atmosphereKey = JSON.stringify({
        width: targetWidth,
        height: targetHeight,
        low,
        zones: zones.map(zone => [zone.id, zone.state, zone.x, zone.y])
    });
    if (canvas.dataset.facilityAtmosphereKey === atmosphereKey) return;
    canvas.dataset.facilityAtmosphereKey = atmosphereKey;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 8, 4, 0.48)';
    ctx.fillRect(0, 0, width, height);

    const gridStep = low ? 32 : 24;
    ctx.strokeStyle = 'rgba(49, 245, 181, 0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x += gridStep) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    for (let y = 0; y < height; y += gridStep) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();

    zones.filter(zone => zone.state !== 'ok').forEach(zone => {
        const x = (0.08 + zone.x * 0.84) * width;
        const y = (0.08 + zone.y * 0.78) * height;
        const radius = (zone.state === 'alert' ? 72 : 54) * (low ? 0.72 : 1);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, zone.state === 'alert' ? 'rgba(255, 48, 48, 0.18)' : 'rgba(255, 173, 0, 0.14)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    });

    const noiseCount = low ? 18 : 46;
    ctx.fillStyle = 'rgba(57, 255, 20, 0.16)';
    for (let i = 0; i < noiseCount; i++) {
        const x = (i * 47) % width;
        const y = (i * 29) % height;
        ctx.fillRect(x, y, 1, 1);
    }
}

function renderFacilityOfflineState(host) {
    const widget = createSvgWidget(host, { cols: 96, rows: 42, cellWidth: 8, cellHeight: 10, kind: 'facility-command-center-offline' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-red' });
    svgLabel(widget.labelLayer, 'NET OFFLINE // FACILITY BUS LOCKED', 25, 18, { className: 'telemetry-red', fontSize: 16 });
    svgLabel(widget.labelLayer, 'RESTORE NET ONLINE TO RE-ACQUIRE MAP TELEMETRY', 22, 22, { className: 'telemetry-amber' });
}

function renderFacilityCommandCenterWidget(host, frame, zones, links, contacts) {
    const widget = createSvgWidget(host, { cols: 96, rows: 42, cellWidth: 8, cellHeight: 10, kind: 'facility-command-center' });
    if (!widget) return;
    const facilityProfile = diagnosticFacilityProfile();
    const motionActive = facilityMotionActive(facilityProfile);
    const staticKey = JSON.stringify({
        zones: zones.map(zone => [zone.id, zone.label, zone.status, zone.state, zone.x, zone.y, zone.w, zone.h]),
        links: links.map(link => [link.from, link.to, link.state])
    });
    const rects = {};
    zones.forEach(zone => {
        rects[zone.id] = facilityCommandRect(zone, widget);
    });

    if (widget.svg.dataset.facilityStaticKey !== staticKey) {
        widget.svg.dataset.facilityStaticKey = staticKey;
        clearSvgLayer(widget.guideLayer);
        clearSvgLayer(widget.labelLayer);
        drawSvgGuideRect(widget, 0, 0, widget.cols, widget.rows, { opacity: 0.22, className: 'telemetry-cyan' });
        for (let col = 6; col < widget.cols; col += 6) drawSvgGuideLine(widget, col, 2, col, widget.rows - 3, { opacity: 0.045, className: 'telemetry-green' });
        for (let row = 4; row < widget.rows; row += 4) drawSvgGuideLine(widget, 2, row, widget.cols - 3, row, { opacity: 0.045, className: 'telemetry-green' });
        drawSvgGuideCircle(widget, 48, 21, 9, { opacity: 0.06, className: 'telemetry-cyan' });
        drawSvgGuideCircle(widget, 48, 21, 18, { opacity: 0.04, className: 'telemetry-cyan' });
        svgLabel(widget.labelLayer, `${statusGet('facility.grid.id', 'BDR-01')} // TACTICAL FACILITY COMMAND CENTER`, 2, 2, { className: 'telemetry-amber' });

        links.forEach(link => {
            const start = rects[link.from];
            const end = rects[link.to];
            if (!start || !end) return;
            const cls = facilityStateClass(link.state);
            drawSvgGuideLine(widget, start.centerCol, start.centerRow, end.centerCol, end.centerRow, { className: cls, opacity: link.state === 'alert' ? 0.34 : 0.2 });
            const midCol = (start.centerCol + end.centerCol) / 2;
            const midRow = (start.centerRow + end.centerRow) / 2;
            svgTextGlyph(widget.labelLayer, link.state === 'alert' ? '▥' : '◇', midCol, midRow, { className: cls, opacity: 0.54 });
        });

        zones.forEach(zone => drawFacilityZoneShape(widget, zone, rects[zone.id]));

        svgLabel(widget.labelLayer, '□ NOMINAL   ◇ WARN   △ ALERT   ◆ UNKNOWN CONTACT', 3, 39, { className: 'telemetry-dim' });
        svgLabel(widget.labelLayer, 'STATIC GRID: CANVAS // MAP LAYER: SVG // STATUS RAIL: HTML', 43, 39, { className: 'telemetry-dim' });
    }

    clearSvgLayer(widget.glyphLayer);
    const loading = !prefersReducedMotion && frame < 14;
    const drawCount = loading ? Math.max(2, Math.round((frame / 14) * zones.length)) : zones.length;
    zones.slice(0, drawCount).forEach(zone => {
        const rect = rects[zone.id];
        if (!rect) return;
        const cls = facilityStateClass(zone.state);
        const loadCells = Math.max(1, Math.min(10, Math.round(zone.load / 10)));
        renderGlyphRow(widget.glyphLayer, rect.row + rect.rows - 0.9, `${'█'.repeat(loadCells)}${'░'.repeat(10 - loadCells)}`, {
            col: rect.col + 0.8,
            className: cls,
            opacity: 0.54 + (zone.load / 100) * 0.38
        });
        svgTextGlyph(widget.glyphLayer, zone.state === 'alert' ? '△' : zone.state === 'warn' ? '◇' : '□', rect.col + rect.cols - 1.2, rect.row + 1.1, {
            className: cls,
            opacity: zone.state === 'alert' && motionActive && facilityProfile.pulse ? 0.74 + Math.sin(frame * 0.16) * 0.18 : 0.88
        });
    });

    const packetLimit = Math.max(0, Math.min(links.length, Number(facilityProfile.packetCount ?? 3)));
    links.slice(0, packetLimit).forEach((link, index) => {
        const start = rects[link.from];
        const end = rects[link.to];
        if (!start || !end) return;
        const cls = facilityStateClass(link.state);
        const t = motionActive ? (frame * (0.006 + index * 0.0005) + link.phase) % 1 : link.phase;
        const col = start.centerCol + (end.centerCol - start.centerCol) * t;
        const row = start.centerRow + (end.centerRow - start.centerRow) * t;
        svgTextGlyph(widget.glyphLayer, link.state === 'alert' ? '◆' : '●', col, row, { className: cls, opacity: link.state === 'alert' ? 0.82 : 0.64 });
    });

    const contactLimit = Math.max(0, Math.min(contacts.length, Number(facilityProfile.contactCount ?? 1)));
    contacts.slice(0, contactLimit).forEach((contact, index) => {
        const start = rects[contact.from];
        const end = rects[contact.to];
        if (!start || !end) return;
        const t = motionActive ? (contact.phase + frame * (0.004 + index * 0.0008)) % 1 : contact.phase;
        const wobble = motionActive ? Math.sin(frame * 0.06 + index) * 0.45 : 0;
        const col = start.centerCol + (end.centerCol - start.centerCol) * t;
        const row = start.centerRow + (end.centerRow - start.centerRow) * t + wobble;
        svgTextGlyph(widget.glyphLayer, '◆', col, row, { className: 'telemetry-red', opacity: motionActive ? 0.82 : 0.68 });
    });

}

function updateFacilityReadouts(frame) {
    const loading = !prefersReducedMotion && frame < 10;
    const phase = prefersReducedMotion ? 24 : frame;
    const zones = getFacilityZones();
    const structure = statusNumber('facility.grid.structure', 77 + Math.round(Math.sin(phase * 0.08) * 2), 0, 100);
    const power = statusNumber('facility.grid.power', 61 + Math.round(Math.sin(phase * 0.1) * 3), 0, 100);
    const reserve = statusNumber('facility.grid.reserve', 34 + Math.round(Math.cos(phase * 0.09) * 4), 0, 100);
    const known = Math.round(statusNumber('facility.contacts.known', 14, 0, 99));
    const unknown = Math.round(statusNumber('facility.contacts.unknown', 3 + (phase % 29 === 0 ? 1 : 0), 0, 99));
    const alerts = zones.filter(zone => zone.state === 'alert').length;
    const warnings = zones.filter(zone => zone.state === 'warn').length;
    const containmentZone = zones.find(zone => zone.id === 'contain') || zones.find(zone => zone.state === 'alert') || zones[0];
    const lifeSupport = statusNumber('facility.life.support', 92 + Math.sin(phase * 0.06) * 2, 0, 100);
    const oxygen = statusNumber('facility.life.oxygen', 97 + Math.sin(phase * 0.05) * 1.2, 0, 100);
    const securityLock = statusNumber('facility.security.lock', 84 - alerts * 7 + Math.sin(phase * 0.07) * 2, 0, 100);
    const containment = statusNumber('facility.containment.integrity', containmentZone?.load || 58, 0, 100);
    const uplink = statusNumber('facility.uplink.sync', 63 + Math.sin(phase * 0.04) * 5, 0, 100);

    if (loading) {
        const progress = Math.min(99, 14 + frame * 9);
        diagText('facilityMeta', `COMMAND CENTER: INDEXING FACILITY GRID ${facilityReadoutBar(progress, 10)}`);
        diagText('facilityScanStatus', `INDEX ${spinner(frame)} ${facilityReadoutBar(progress, 10)}`);
        diagText('facilityOverview', statusBlock('facility.overview', [
            `GRID      ${facilityReadoutBar(progress, 10)}`,
            `POWER     ${facilityReadoutBar(20 + frame * 7, 10)}`,
            'STATE     PRECHARGE'
        ], phase));
        diagText('facilityLifeSupport', statusBlock('facility.life', [
            `O2 BUS    ${facilityReadoutBar(progress, 10)}`,
            `THERMAL   ${facilityReadoutBar(30 + frame * 5, 10)}`,
            'BIO GRID  ACQUIRING'
        ], phase));
        diagText('facilityZones', statusBlock('facility.zones', [
            `LOCKS     ${facilityReadoutBar(progress, 10)}`,
            'DOORS     INDEX',
            'PERIMETER CAL'
        ], phase));
        diagText('facilityContainment', statusBlock('facility.containment', [
            `SEALS     ${facilityReadoutBar(progress - 12, 10)}`,
            'PRESSURE  CAL',
            'RITUAL    WAIT'
        ], phase));
        diagText('facilityUplink', statusBlock('facility.uplink', [
            `DEAD-NET  ${facilityReadoutBar(progress - 24, 10)}`,
            'PACKETS   HOLD',
            'SYNC      CAL'
        ], phase));
        diagText('facilityContacts', statusBlock('facility.contact_readout', [
            'BIO GRID  SYNC',
            'FAULT BUS SYNC',
            'UNKNOWN   HOLD'
        ], phase));
        diagText('facilityTelemetryStrip', `STRUCTURE ${facilityReadoutBar(progress, 8)}  POWER ${facilityReadoutBar(progress - 4, 8)}  RESERVE ${facilityReadoutBar(progress - 16, 8)}  FAULTS --  BIO --`);
        diagText('facilityTicker', `COMMAND CENTER BOOT ${spinner(frame)} DRAWING ZONES // LINKING SENSOR ROUTES`);
        return;
    }

    diagText('facilityMeta', `COMMAND CENTER: LIVE // FRAME ${String(frame).padStart(4, '0')} // ${alerts} ALERT ${warnings} WARN`);
    diagText('facilityScanStatus', `MAP LOCK ${facilityReadoutBar(structure, 8)} ${Math.round(structure)}%`);
    diagText('facilityOverview', statusBlock('facility.overview', [
        `STRUCTURE ${facilityReadoutBar(structure, 10)} ${Math.round(structure)}%`,
        `POWER     ${facilityReadoutBar(power, 10)} ${Math.round(power)}%`,
        `RESERVE   ${facilityReadoutBar(reserve, 10)} ${Math.round(reserve)}%`,
        `REPAIR    ${statusGet('facility.grid.repair', '06 OPEN')}`
    ], phase));
    diagText('facilityLifeSupport', statusBlock('facility.life', [
        `O2 SAT    ${facilityReadoutBar(oxygen, 10)} ${Math.round(oxygen)}%`,
        `THERMAL   ${facilityReadoutBar(lifeSupport - 6, 10)} OK`,
        `BIO GRID  ${String(known).padStart(2, '0')} KNOWN`
    ], phase));
    diagText('facilityZones', statusBlock('facility.zones', [
        `LOCKS     ${facilityReadoutBar(securityLock, 10)} ${Math.round(securityLock)}%`,
        `WARNINGS  ${String(warnings).padStart(2, '0')}`,
        `ALERTS    ${String(alerts).padStart(2, '0')}`
    ], phase));
    diagText('facilityContainment', statusBlock('facility.containment', [
        `INTEGRITY ${facilityReadoutBar(containment, 10)} ${Math.round(containment)}%`,
        `ZONE      ${containmentZone?.label || 'CNTM'}`,
        `STATUS    ${(containmentZone?.status || 'WATCH').slice(0, 10)}`
    ], phase));
    diagText('facilityUplink', statusBlock('facility.uplink', [
        `SYNC      ${facilityReadoutBar(uplink, 10)} ${Math.round(uplink)}%`,
        `CARRIER   ${statusGet('facility.uplink.carrier', 'DEGRADED')}`,
        `PACKET    ${statusGet('facility.uplink.packet_decay', '14% DECAY')}`
    ], phase));
    diagText('facilityContacts', statusBlock('facility.contact_readout', [
        `KNOWN     ${String(known).padStart(2, '0')}`,
        `UNKNOWN   ${String(unknown).padStart(2, '0')} MOVING`,
        `CAMERA    ${statusGet('facility.contacts.camera', '05/12 DIRTY')}`,
        `FAULTS    ${statusGet('facility.contacts.faults', 'PUMP2 DOOR-C RLY04')}`
    ], phase));
    diagText('facilityTelemetryStrip', `STRUCTURE ${facilityReadoutBar(structure, 8)}  POWER ${facilityReadoutBar(power, 8)}  RESERVE ${facilityReadoutBar(reserve, 8)}  FAULTS ${String(alerts + warnings).padStart(2, '0')}  BIO ${String(known).padStart(2, '0')}/${String(unknown).padStart(2, '0')}`);
    const defaultTicker = `MAINTENANCE REQUIRED // ABSTRACT GRID ONLY // UNKNOWN LIFE SIGNS DETECTED ${spinner(phase)}`;
    diagText('facilityTicker', statusInterpolate(statusGet('facility.ticker', defaultTicker), phase));
}

function renderFacilityStatus(timestamp = 0) {
    const host = getById('facilityCanvas');
    if (!host) return;
    const frame = Number.isFinite(facilityFrame) ? facilityFrame : Math.round(timestamp / 33);
    const facilityProfile = diagnosticFacilityProfile();
    const zones = getFacilityZones();
    const links = getFacilityLinks();
    const contacts = getFacilityContacts();
    renderFacilityAtmosphere(frame, zones);
    if (!AppState.networkOnline) {
        renderFacilityOfflineState(host);
    } else {
        renderFacilityCommandCenterWidget(host, frame, zones, links, contacts);
    }

    const readoutEvery = Math.max(1, Number(facilityProfile.readoutEvery || 8));
    const safeMode = typeof safeModeActive === 'function' && safeModeActive();
    if (frame < 3 || frame % readoutEvery === 0 || prefersReducedMotion || safeMode) {
        updateFacilityReadouts(frame);
    }
}

function runFacilityLoop(timestamp = 0) {
    if (!facilityActive || !AppState.networkOnline) return;
    if (document.hidden || (typeof safeModeActive === 'function' && safeModeActive())) {
        facilityAnimFrame = null;
        return;
    }
    const profile = diagnosticRenderProfile();
    const interval = Math.max(profile.facilityMs || effectsFrameMs(34, 80, 140), 120);
    if (!facilityLastRender || timestamp - facilityLastRender >= interval) {
        facilityLastRender = timestamp;
        facilityFrame++;
        renderFacilityStatus(timestamp);
        if (facilityFrame < 12 && facilityFrame % 3 === 0) AudioEngine.keyClick();
    }
    facilityAnimFrame = requestAnimationFrame(runFacilityLoop);
}

function showFacilityStatus() {
    if (!AppState.networkOnline) {
        printNetworkUnavailable('FACILITY STATUS');
        return;
    }
    const overlay = document.getElementById('facilityOverlay');
    if (!overlay || overlay.classList.contains('active')) return;
    facilityActive = true;
    setAppState({ activeOverlay: 'facility' }, { resetSelection: false });
    facilityFrame = prefersReducedMotion ? 24 : 0;
    facilityLastRender = 0;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    AudioEngine.bootBeep();
    if (window.MapOverlayController) {
        // The tactical map is a WebGL iframe. Keep its parent untransformed;
        // GSAP dialog transforms on iframe ancestors can make the map stutter.
        const panel = overlay.querySelector('.facility-panel');
        if (panel) {
            panel.style.opacity = '';
            panel.style.transform = 'none';
            panel.style.willChange = 'auto';
        }
        window.MapOverlayController.open({ trigger: document.activeElement });
    } else {
        Animator.dialogOpen(overlay);
        renderFacilityStatus(performance.now());
        if (!prefersReducedMotion && !(typeof safeModeActive === 'function' && safeModeActive())) {
            facilityAnimFrame = requestAnimationFrame(runFacilityLoop);
        }
    }
}

function closeFacilityStatus() {
    const overlay = document.getElementById('facilityOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;
    facilityActive = false;
    setAppState({ activeOverlay: 'none' }, { resetSelection: false });
    if (facilityAnimFrame) {
        cancelAnimationFrame(facilityAnimFrame);
        facilityAnimFrame = null;
    }
    window.MapOverlayController?.close({ restoreFocus: false });
    AudioEngine.pageFlip();
    Animator.dialogClose(overlay, () => {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    });
}

function getDiagnosticPerformanceSnapshot() {
    const profile = diagnosticRenderProfile();
    const widgetIds = [
        ['network', 'diagNetwork'],
        ['security', 'diagSecurity'],
        ['outpost', 'diagOutpost'],
        ['generator', 'diagGenerator'],
        ['power', 'diagPower'],
        ['alarm', 'diagAlarm'],
        ['life', 'diagLife'],
        ['events', 'diagEvents'],
        ['integrity', 'diagIntegrity'],
        ['uplink', 'diagUplink']
    ];
    return {
        browser: typeof detectBrowserProfile === 'function' ? detectBrowserProfile() : 'unknown',
        profile: profile.name || 'unknown',
        effectsMode,
        effectiveEffects: EffectsController.effectiveLabel(),
        reducedMotion: prefersReducedMotion,
        safeMode: typeof safeModeActive === 'function' ? safeModeActive() : false,
        activeOverlay: AppState.activeOverlay,
        documentHidden: document.hidden,
        diagnosticLoop: Boolean(diagnosticAnimFrame),
        facilityLoop: Boolean(facilityAnimFrame),
        facilityMap: window.MapOverlayController?.getSnapshot?.() || null,
        sideLoop: Boolean(sideTelemetryAnimFrame),
        schedulerMs: profile.schedulerMs,
        facilityMs: profile.facilityMs,
        facilityProfile: profile.facility || null,
        sideTelemetryMs: profile.sideTelemetryMs,
        radarMs: profile.radar?.frameMs,
        widgets: widgetIds.map(([key, id]) => {
            const host = getById(id);
            const runtime = DIAGNOSTIC_WIDGET_REGISTRY.get(key);
            return {
                key,
                id,
                nodes: host ? host.querySelectorAll('svg *').length : 0,
                targetMs: diagnosticWidgetInterval(key, 160),
                renders: runtime?.renders || 0
            };
        })
    };
}

// ========================================
// ACCESS CONTROL
// ========================================
function showAccessDialog() {
    if (hasAccess(ACCESS_LEVELS.admin)) {
        print('');
        print('Administrator access already granted.', 't-dim');
        print('');
        return;
    }
    
    const dialog = document.getElementById('accessDialog');
    const input = document.getElementById('accessPassword');
    const error = document.getElementById('accessError');
    
    accessDialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.classList.add('active');
    dialog.setAttribute('aria-hidden', 'false');
    setAppState({ activeOverlay: 'access' }, { resetSelection: false });
    error.classList.remove('visible');
    input.value = '';
    Animator.dialogOpen(dialog);
    input.focus();
}

function closeAccessDialog() {
    const dialog = document.getElementById('accessDialog');
    if (!dialog.classList.contains('active')) return;
    setAppState({ activeOverlay: 'none' }, { resetSelection: false });
    Animator.dialogClose(dialog, () => {
        dialog.classList.remove('active');
        dialog.setAttribute('aria-hidden', 'true');
        if (accessDialogReturnFocus && accessDialogReturnFocus.isConnected) {
            accessDialogReturnFocus.focus();
        }
        accessDialogReturnFocus = null;
    });
}

function submitAccessPassword() {
    const input = document.getElementById('accessPassword');
    const error = document.getElementById('accessError');
    const password = input.value;
    
    if (password === ADMIN_PASSWORD) {
        closeAccessDialog();
        grantAdminAccess();
    } else if (password.trim().toLowerCase() === ELEVATED_PASSWORD.toLowerCase()) {
        closeAccessDialog();
        grantElevatedAccess();
    } else {
        AudioEngine.errorBuzz();
        error.classList.add('visible');
        Animator.alertShake(document.querySelector('#accessDialog .dialog-box'));
        input.value = '';
        input.focus();
    }
}

function grantElevatedAccess() {
    setAccessLevelState(ACCESS_LEVELS.elevated);
    AudioEngine.accessGranted();

    clearOutput();
    print('');
    print('ELEVATED CLEARANCE GRANTED', 't-amber');
    print('FSEARCH and Elevated database files are now accessible.', 't-dim');
    print('Admin-only status controls remain locked.', 't-dim');
    print('');
}

function grantAdminAccess() {
    setAccessLevelState(ACCESS_LEVELS.admin);
    AudioEngine.accessGranted();
    Animator.adminAccess();
    
    clearOutput();
    print('');
    print('▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓', 't-red');
    const grantedText = contentGet('admin.access_granted', 'ADMINISTRATOR ACCESS GRANTED').toUpperCase();
    print(`▓     ${grantedText.padEnd(35, ' ').slice(0, 35)}▓`, 't-red');
    print('▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓', 't-red');
    print('');
    print('Additional commands unlocked:', 't-amber');
    print('  • LOAD STATUS - Import facility status profile');
    print('  • LIST ALL - View complete database');
    print('  • FUZZY SEARCH - Partial match search');
    print('  • LOGOUT - End admin session');
    print('');
    print('All database entries are now accessible.', 't-magenta');
    print('');
}

function setAccessLevelState(level, options = {}) {
    setAppState({ accessLevel: level }, options);
}

function setAdminAccessState(enabled, options = {}) {
    setAccessLevelState(enabled ? ACCESS_LEVELS.admin : ACCESS_LEVELS.employee, options);
}

function logout() {
    setAccessLevelState(ACCESS_LEVELS.employee);
    AudioEngine.errorBuzz();
    
    clearOutput();
    print('');
    print(contentGet('admin.logout', 'Administrator session terminated.'), 't-red');
    print('Clearance reset to Employee.', 't-dim');
    print('');
}

function forceCloseRuntimeOverlays() {
    closeLiebiGame();

    const accessDialog = document.getElementById('accessDialog');
    if (accessDialog) {
        accessDialog.classList.remove('active');
        accessDialog.setAttribute('aria-hidden', 'true');
    }
    accessDialogReturnFocus = null;

    const diagnosticOverlay = document.getElementById('diagnosticOverlay');
    diagnosticActive = false;
    if (diagnosticAnimFrame) {
        cancelAnimationFrame(diagnosticAnimFrame);
        diagnosticAnimFrame = null;
    }
    if (diagnosticOverlay) {
        diagnosticOverlay.classList.remove('active');
        diagnosticOverlay.setAttribute('aria-hidden', 'true');
    }

    const facilityOverlay = document.getElementById('facilityOverlay');
    facilityActive = false;
    if (facilityAnimFrame) {
        cancelAnimationFrame(facilityAnimFrame);
        facilityAnimFrame = null;
    }
    window.MapOverlayController?.close({ restoreFocus: false });
    if (facilityOverlay) {
        facilityOverlay.classList.remove('active');
        facilityOverlay.setAttribute('aria-hidden', 'true');
    }
    setAppState({ activeOverlay: 'none' }, { resetSelection: false });
}

function restartTerminalAfterStatusLoad() {
    forceCloseRuntimeOverlays();
    setAdminAccessState(false, { resetSelection: false });
    selectedMenuIndex = 0;
    renderedMenuIndex = -1;
    updateMenuSelection();
    menuFocused = true;

    if (terminalKeyHandlerBound) {
        document.removeEventListener('keydown', handleGlobalKeydown);
        terminalKeyHandlerBound = false;
    }

    clearOutput({ force: true });
    const commandInput = document.getElementById('commandInput');
    if (commandInput) {
        commandInput.value = '';
        commandInput.blur();
    }
    const terminal = document.querySelector('.screen-content');
    if (terminal) {
        terminal.style.opacity = '0';
        terminal.style.transform = 'scale(0.995)';
    }

    const gsap = Animator.getGsap();
    if (gsap) gsap.killTweensOf(['#bootScreen', '.screen-content', '.boot-left', '#bootOutput', '.boot-skip']);
    document.body.classList.remove('terminal-ready');
    startBootSequence();
}

