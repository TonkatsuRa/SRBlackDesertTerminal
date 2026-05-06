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
        diagLifeCard: 'diagnostic.label.life'
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
        diagnosticFrame = Math.max(diagnosticFrame, prefersReducedMotion ? 24 : 12);
        renderDiagnosticDashboard();
    }
    if (facilityActive) {
        facilityFrame = Math.max(facilityFrame, prefersReducedMotion ? 24 : 10);
        renderFacilityStatus(performance.now());
    }
}

function pauseRealtimePanels() {
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
    if (diagnosticActive && !diagnosticAnimFrame) {
        diagnosticLastRender = 0;
        diagnosticAnimFrame = requestAnimationFrame(runDiagnosticLoop);
    }
    if (facilityActive && !facilityAnimFrame) {
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

function renderDiagnosticDashboard() {
    const frame = diagnosticFrame;
    const loading = !prefersReducedMotion && frame < 12;
    const phase = prefersReducedMotion ? 24 : frame;
    const scanProgress = loading ? Math.min(99, frame * 8) : 100;
    const meta = loading
        ? `SCAN BUS: CALIBRATING ${asciiBar(scanProgress, 12)}`
        : `SCAN BUS: LIVE // FRAME ${String(frame).padStart(4, '0')}`;
    diagText('diagnosticMeta', meta);

    if (loading) {
        diagText('diagnosticTicker', `BASE SENSOR HANDSHAKE ${spinner(frame)} ${asciiSweep(frame, 18)}`);
        [
            ['diagNetwork', 'FACILITY COMMS'],
            ['diagSecurity', 'DEFENSE GRID'],
            ['diagOutpost', 'RELAY / DRONE LINKS'],
            ['diagGenerator', 'GENERATOR CORE'],
            ['diagPower', 'POWER RESERVES'],
            ['diagAlarm', 'ALARMS / DIS SENSORS'],
            ['diagLife', 'BIO SIGNATURES']
        ].forEach(([id, label]) => diagText(id, diagnosticLoading(label, frame)));
        ['diagNetworkStatus','diagSecurityStatus','diagOutpostStatus','diagGeneratorStatus','diagPowerStatus','diagAlarmStatus','diagLifeStatus']
            .forEach(id => diagText(id, 'SCAN'));
        ['diagNetworkCard','diagSecurityCard','diagOutpostCard','diagGeneratorCard','diagPowerCard','diagAlarmCard','diagLifeCard']
            .forEach(id => diagCardState(id, 'ok'));
        return;
    }

    const network = statusNumber('diagnostic.network.level', 69 + Math.round(Math.sin(phase * 0.31) * 5), 0, 100);
    const security = statusNumber('diagnostic.security.level', 81 + Math.round(Math.sin(phase * 0.18) * 4), 0, 100);
    const generator = statusNumber('diagnostic.generator.level', 62 + Math.round(Math.sin(phase * 0.22) * 6), 0, 100);
    const mainPower = statusNumber('diagnostic.power.main', 61 + Math.round(Math.sin(phase * 0.16) * 4), 0, 100);
    const reservePower = statusNumber('diagnostic.power.reserve', 34 + Math.round(Math.cos(phase * 0.12) * 5), 0, 100);
    const lifeCount = Math.round(statusNumber('diagnostic.life.known', 14 + (phase % 9 === 0 ? 1 : 0), 0, 99));
    const unstableLife = Math.round(statusNumber('diagnostic.life.unstable', 2, 0, 99));
    const unknownLife = Math.round(statusNumber('diagnostic.life.unknown', 3 + (phase % 11 === 0 ? 1 : 0), 0, 99));

    const networkStatus = statusGet('diagnostic.network.status', 'DISCONNECTED').toUpperCase();
    diagCardState('diagNetworkCard', statusState('diagnostic.network.state', 'alert'));
    diagText('diagNetworkStatus', networkStatus);
    diagText('diagNetwork', statusBlock('diagnostic.network', [
        `FACILITY BUS : LOCAL ONLY ${spinner(phase)}`,
        `LOCAL MESH   : ${asciiBar(network, 18)}`,
        `SURFACE NET  : ${statusGet('diagnostic.network.surface', 'DISCONNECTED')}`,
        `EXT RELAY    : ${statusGet('diagnostic.network.relay', 'FAILED / NO CARRIER')}`,
        `DRONE UPLINK : ${statusGet('diagnostic.network.drone', 'DEGRADED 77%')}`
    ], phase));

    const securityStatus = statusGet('diagnostic.security.status', 'ARMED').toUpperCase();
    diagCardState('diagSecurityCard', statusState('diagnostic.security.state', 'warn'));
    diagText('diagSecurityStatus', securityStatus);
    diagText('diagSecurity', statusBlock('diagnostic.security', [
        `PERIMETER    : ${asciiBar(security, 18)}`,
        `SEC PROTOCOL : ${statusGet('diagnostic.security.protocol', 'ENGAGED')}`,
        `AUTO DEFENSE : ${statusGet('diagnostic.security.defense', 'ARMED')}`,
        `INTRUSION    : ${statusGet('diagnostic.security.intrusion', 'ARMED / NO BREACH')}`,
        `VAULT DOORS  : ${statusGet('diagnostic.security.vault', 'SEALED / SERVO-3 SLOW')}`
    ], phase));

    const outpostStatus = statusGet('diagnostic.outposts.status', 'LINK DEGRADED').toUpperCase();
    diagCardState('diagOutpostCard', statusState('diagnostic.outposts.state', 'warn'));
    diagText('diagOutpostStatus', outpostStatus);
    diagText('diagOutpost', statusBlock('diagnostic.outposts', [
        `LINK SWEEP   : ${asciiSweep(phase, 22)}`,
        `DRONE UPLINK : ${statusGet('diagnostic.outposts.drone', 'DEGRADED 77%')}`,
        `MESH NETWORK : ${statusGet('diagnostic.outposts.mesh', 'WEAK SIGNAL')}`,
        `OUTPOST-01   : ${statusGet('diagnostic.outposts.outpost1', 'PARTIAL MESH  188ms')}`,
        `OUTPOST-04   : ${statusGet('diagnostic.outposts.outpost4', 'NO CARRIER    ----')}`
    ], phase));

    const generatorStatus = statusGet('diagnostic.generator.status', 'SERVICE DUE').toUpperCase();
    diagCardState('diagGeneratorCard', statusState('diagnostic.generator.state', 'warn'));
    diagText('diagGeneratorStatus', generatorStatus);
    diagText('diagGenerator', statusBlock('diagnostic.generator', [
        `CORE-A ${spinner(phase)}      : ${statusGet('diagnostic.generator.core', 'RUNNING HOT')}`,
        `TURBINE RPM  : ${asciiBar(generator, 18)}`,
        `TEMP         : ${statusGet('diagnostic.generator.temp', '451K ABOVE NOMINAL')}`,
        `LOAD BUS     : ${asciiSweep(phase + 6, 22)}`,
        `COOLANT      : ${statusGet('diagnostic.generator.coolant', 'FLOW LOW / FILTER CLOG')}`
    ], phase));

    const powerStatus = statusGet('diagnostic.power.status', 'LOW RESERVE').toUpperCase();
    diagCardState('diagPowerCard', statusState('diagnostic.power.state', 'warn'));
    diagText('diagPowerStatus', powerStatus);
    diagText('diagPower', statusBlock('diagnostic.power', [
        `MAIN GRID    : ${asciiBar(mainPower, 20)}`,
        `RESERVE CELL : ${asciiBar(reservePower, 20)}`,
        `BAT-A        : ${statusGet('diagnostic.power.bat_a', `[${'#'.repeat(4)}${'-'.repeat(6)}] 3.2h`)}`,
        `BAT-B        : ${statusGet('diagnostic.power.bat_b', `[${'#'.repeat(3)}${'-'.repeat(7)}] 2.6h`)}`,
        `CAPACITOR    : ${statusGet('diagnostic.power.capacitor', `UNEVEN CHARGE ${'.'.repeat((phase % 3) + 1).padEnd(3, ' ')}`)}`
    ], phase));

    const alarmStatus = statusGet('diagnostic.alarm.status', 'DIS DEGRADED').toUpperCase();
    diagCardState('diagAlarmCard', statusState('diagnostic.alarm.state', 'malfunction'));
    diagText('diagAlarmStatus', alarmStatus);
    diagText('diagAlarm', statusBlock('diagnostic.alarm', [
        `STATION ALARM: ${statusGet('diagnostic.alarm.station', 'AMBER MAINTENANCE')}`,
        `DIS SENSORS  : ${statusGet('diagnostic.alarm.dis', 'DEGRADED / 02 BLIND')}`,
        `BIOHAZARD    : ${statusGet('diagnostic.alarm.biohazard', 'CLEAR / SAMPLE LOCK DUE')}`,
        `CONTAINMENT  : ${statusGet('diagnostic.alarm.containment', 'ZONE C-12 SEAL DRIFT')}`,
        `SIREN BUS    : ${asciiSweep(phase + 10, 22)}`
    ], phase));

    const lifeStatus = statusGet('diagnostic.life.status', `${unknownLife} UNKNOWN`).toUpperCase();
    diagCardState('diagLifeCard', statusState('diagnostic.life.state', 'alert'));
    diagText('diagLifeStatus', lifeStatus);
    diagText('diagLife', statusBlock('diagnostic.life', [
        `BIO COUNT    : ${String(lifeCount).padStart(2, '0')} CONFIRMED / ${String(unstableLife).padStart(2, '0')} UNSTABLE / ${String(unknownLife).padStart(2, '0')} UNKNOWN`,
        `HEARTBEAT    : ${heartbeat(phase)}`,
        lifeSignMap(phase)
    ], phase));

    const defaultTicker = `FACILITY PASS: EXTERNAL COMMS DOWN // DEFENSE ARMED // DIS SENSORS DEGRADED // UNKNOWN LIFE SIGNS ${spinner(phase)} ${asciiSweep(phase, 20)}`;
    diagText('diagnosticTicker', statusInterpolate(statusGet('diagnostic.ticker', defaultTicker), phase));
}

function runDiagnosticLoop(timestamp = 0) {
    if (!diagnosticActive || !AppState.networkOnline) return;
    const interval = effectsFrameMs(135, 220, 260);
    if (!diagnosticLastRender || timestamp - diagnosticLastRender >= interval) {
        diagnosticLastRender = timestamp;
        diagnosticFrame++;
        renderDiagnosticDashboard();
        if (diagnosticFrame < 16 && diagnosticFrame % 3 === 0) AudioEngine.keyClick();
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
    diagnosticFrame = prefersReducedMotion ? 24 : 0;
    diagnosticLastRender = 0;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    renderDiagnosticDashboard();
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

function facilityColor(state) {
    if (state === 'alert') return '#ff3333';
    if (state === 'warn') return '#ffb000';
    return '#20c20e';
}

function facilityColorNumber(state) {
    return Number.parseInt(facilityColor(state).slice(1), 16);
}

function facilityViewportSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        ratio
    };
}

function getPixi() {
    return window.PIXI && window.PIXI.Application && window.PIXI.Graphics ? window.PIXI : null;
}

function resetFacilityPixiState(options = {}) {
    const app = facilityPixiState.app;
    if (app && typeof app.destroy === 'function') {
        try {
            app.destroy(Boolean(options.removeView), { children: true, texture: false, baseTexture: false });
        } catch (error) {}
    }
    facilityPixiState = {
        app: null,
        graphics: null,
        staticGraphics: null,
        dynamicGraphics: null,
        labelContainer: null,
        labels: [],
        canvas: null,
        staticSignature: '',
        unavailable: Boolean(options.unavailable)
    };
    document.documentElement.classList.remove('has-pixi-active');
}

function ensureFacilityPixi(canvas) {
    const PIXI = getPixi();
    if (!PIXI || facilityPixiState.unavailable) return false;
    if (facilityPixiState.app && facilityPixiState.canvas === canvas) return true;

    resetFacilityPixiState();
    try {
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        const app = new PIXI.Application({
            view: canvas,
            backgroundAlpha: 0,
            antialias: false,
            autoDensity: true,
            resolution: ratio,
            powerPreference: 'low-power',
            clearBeforeRender: true,
            autoStart: false
        });
        if (app.ticker && typeof app.ticker.stop === 'function') app.ticker.stop();
        const staticGraphics = new PIXI.Graphics();
        const dynamicGraphics = new PIXI.Graphics();
        const labelContainer = new PIXI.Container();
        app.stage.addChild(staticGraphics, dynamicGraphics, labelContainer);
        facilityPixiState = {
            app,
            graphics: dynamicGraphics,
            staticGraphics,
            dynamicGraphics,
            labelContainer,
            labels: [],
            canvas,
            staticSignature: '',
            unavailable: false
        };
        document.documentElement.classList.add('has-pixi-active');
        return true;
    } catch (error) {
        resetFacilityPixiState({ unavailable: true });
        document.documentElement.classList.remove('has-pixi-active');
        return false;
    }
}

function resizeFacilityPixi(canvas, width, height) {
    const state = facilityPixiState;
    if (!state.app || !state.app.renderer) return false;
    if (facilityCanvasSize.width !== width || facilityCanvasSize.height !== height) {
        state.app.renderer.resize(width, height);
        state.staticSignature = '';
    }
    facilityCanvasSize.width = width;
    facilityCanvasSize.height = height;
    facilityCanvasSize.ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    return true;
}

function drawPixiDashedLine(graphics, x1, y1, x2, y2, dash = 8, gap = 8) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);
    if (!distance) return;
    const ux = dx / distance;
    const uy = dy / distance;
    let travelled = 0;
    while (travelled < distance) {
        const next = Math.min(distance, travelled + dash);
        graphics.moveTo(x1 + ux * travelled, y1 + uy * travelled);
        graphics.lineTo(x1 + ux * next, y1 + uy * next);
        travelled += dash + gap;
    }
}

function pixiLabel(index, text, x, y, color, size = 11, alpha = 0.9) {
    const PIXI = getPixi();
    if (!PIXI || !facilityPixiState.labelContainer) return;
    let label = facilityPixiState.labels[index];
    if (!label) {
        label = new PIXI.Text('', {
            fontFamily: '"IBM DOS ISO8", "Courier New", monospace',
            fontSize: size,
            fill: color,
            letterSpacing: 0
        });
        label.resolution = Math.min(window.devicePixelRatio || 1, 1.5);
        facilityPixiState.labels[index] = label;
        facilityPixiState.labelContainer.addChild(label);
    }
    if (label.text !== text) label.text = text;
    label.x = x;
    label.y = y;
    label.alpha = alpha;
    if (label.style.fontSize !== size) label.style.fontSize = size;
    if (label.style.fill !== color) label.style.fill = color;
    label.visible = true;
}

function trimPixiLabels(usedCount) {
    for (let i = usedCount; i < facilityPixiState.labels.length; i++) {
        if (facilityPixiState.labels[i]) facilityPixiState.labels[i].visible = false;
    }
}

function resizeFacilityCanvas(canvas, ctx) {
    const { width, height, ratio } = facilityViewportSize(canvas);
    const targetWidth = Math.max(1, Math.round(width * ratio));
    const targetHeight = Math.max(1, Math.round(height * ratio));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    facilityCanvasSize.width = width;
    facilityCanvasSize.height = height;
    facilityCanvasSize.ratio = ratio;
}

function facilityRect(zone, width, height, frame) {
    const drift = prefersReducedMotion ? 0 : Math.sin(frame * 0.042 + zone.pulse) * 1.2;
    const rect = {
        x: Math.round(zone.x * width + drift),
        y: Math.round(zone.y * height - drift * 0.45),
        w: Math.max(52, Math.round(zone.w * width)),
        h: Math.max(38, Math.round(zone.h * height))
    };
    rect.cx = rect.x + rect.w * 0.5;
    rect.cy = rect.y + rect.h * 0.5;
    return rect;
}

function drawFacilityBackdrop(ctx, width, height, frame) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 8, 4, 0.56)';
    ctx.fillRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.48;
    ctx.save();
    ctx.strokeStyle = '#00d4aa';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.08;
    for (let radius = 70; radius < Math.max(width, height); radius += 86) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius, radius * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();

    ctx.restore();
}

function drawFacilityConnection(ctx, link, rects, frame) {
    const start = rects[link.from];
    const end = rects[link.to];
    if (!start || !end) return;

    const color = facilityColor(link.state);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = link.state === 'alert' ? 0.46 : 0.32;
    ctx.lineWidth = link.state === 'alert' ? 1.2 : 1;
    ctx.setLineDash(link.state === 'ok' ? [9, 11] : [5, 8]);
    ctx.lineDashOffset = prefersReducedMotion ? 0 : -frame * (link.state === 'alert' ? 1.3 : 0.75);
    ctx.beginPath();
    ctx.moveTo(start.cx, start.cy);
    ctx.lineTo(end.cx, end.cy);
    ctx.stroke();

    const t = prefersReducedMotion ? link.phase : (frame * 0.012 + link.phase) % 1;
    const px = start.cx + (end.cx - start.cx) * t;
    const py = start.cy + (end.cy - start.cy) * t;
    ctx.setLineDash([]);
    ctx.globalAlpha = link.state === 'alert' ? 0.95 : 0.72;
    ctx.fillStyle = color;
    ctx.fillRect(px - 2, py - 2, 4, 4);
    ctx.restore();
}

function drawFacilityBlock(ctx, zone, rect, frame, width) {
    const color = facilityColor(zone.state);
    const blink = zone.state === 'alert' && !prefersReducedMotion && frame % 24 < 12;
    const offset = Math.max(5, Math.min(10, rect.w * 0.09));
    const labelSize = width < 560 ? 10 : 12;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = zone.state === 'alert' ? 1.35 : 1;
    ctx.globalAlpha = blink ? 0.55 : 0.84;
    ctx.shadowColor = color;
    ctx.shadowBlur = 3;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha *= 0.52;
    ctx.strokeRect(rect.x + offset, rect.y - offset, rect.w, rect.h);
    ctx.beginPath();
    ctx.moveTo(rect.x, rect.y);
    ctx.lineTo(rect.x + offset, rect.y - offset);
    ctx.moveTo(rect.x + rect.w, rect.y);
    ctx.lineTo(rect.x + rect.w + offset, rect.y - offset);
    ctx.moveTo(rect.x, rect.y + rect.h);
    ctx.lineTo(rect.x + offset, rect.y + rect.h - offset);
    ctx.moveTo(rect.x + rect.w, rect.y + rect.h);
    ctx.lineTo(rect.x + rect.w + offset, rect.y + rect.h - offset);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 0.92;
    ctx.font = `${labelSize}px "IBM DOS ISO8", "Courier New", monospace`;
    ctx.fillText(zone.label, rect.x + 7, rect.y + 16);
    ctx.globalAlpha = zone.state === 'ok' ? 0.62 : 0.86;
    ctx.fillText(zone.status, rect.x + 7, rect.y + Math.min(rect.h - 8, 32));

    const barWidth = Math.max(28, rect.w - 14);
    const barY = rect.y + rect.h - 9;
    ctx.globalAlpha = 0.24;
    ctx.fillRect(rect.x + 7, barY, barWidth, 3);
    ctx.globalAlpha = blink ? 0.62 : 0.75;
    ctx.fillRect(rect.x + 7, barY, barWidth * Math.max(0.08, zone.load / 100), 3);
    ctx.restore();
}

function drawFacilityContacts(ctx, rects, frame, contacts) {
    ctx.save();
    ctx.strokeStyle = '#ff3333';
    ctx.fillStyle = '#ff3333';
    ctx.lineWidth = 1;
    contacts.forEach((contact, index) => {
        const start = rects[contact.from];
        const end = rects[contact.to];
        if (!start || !end) return;
        const t = prefersReducedMotion ? contact.phase : (contact.phase + frame * (0.006 + index * 0.001)) % 1;
        const wobble = prefersReducedMotion ? 0 : Math.sin(frame * 0.09 + index) * 7;
        const px = start.cx + (end.cx - start.cx) * t;
        const py = start.cy + (end.cy - start.cy) * t + wobble;
        const radius = 4 + (prefersReducedMotion ? 0 : Math.sin(frame * 0.18 + index) * 1.2);
        ctx.globalAlpha = 0.38;
        ctx.beginPath();
        ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, radius * 0.45), 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function renderFacilityStatusPixi(canvas, width, height, frame, zones, links, contacts, rects) {
    try {
        if (!ensureFacilityPixi(canvas)) return false;
        if (!resizeFacilityPixi(canvas, width, height)) return false;

        const state = facilityPixiState;
        const staticGraphics = state.staticGraphics;
        const graphics = state.dynamicGraphics || state.graphics;
        if (!graphics || !staticGraphics || !state.app || !state.app.renderer) return false;

        const cx = width * 0.5;
        const cy = height * 0.48;
        const staticSignature = `${width}x${height}:${EffectsController.isLow() ? 'low' : 'full'}`;
        if (state.staticSignature !== staticSignature) {
            staticGraphics.clear();
            staticGraphics.beginFill(0x000804, 0.56);
            staticGraphics.drawRect(0, 0, width, height);
            staticGraphics.endFill();
            staticGraphics.lineStyle(1, 0x00d4aa, EffectsController.isLow() ? 0.045 : 0.08);
            for (let radius = 70; radius < Math.max(width, height); radius += 86) {
                staticGraphics.drawEllipse(cx, cy, radius, radius * 0.38);
            }
            staticGraphics.lineStyle(1, 0x00d4aa, EffectsController.isLow() ? 0.06 : 0.1);
            staticGraphics.moveTo(0, cy);
            staticGraphics.lineTo(width, cy);
            staticGraphics.moveTo(cx, 0);
            staticGraphics.lineTo(cx, height);
            state.staticSignature = staticSignature;
        }

        graphics.clear();

    links.forEach(link => {
        const start = rects[link.from];
        const end = rects[link.to];
        if (!start || !end) return;
        const color = facilityColorNumber(link.state);
        graphics.lineStyle(link.state === 'alert' ? 1.2 : 1, color, link.state === 'alert' ? 0.46 : 0.32);
        drawPixiDashedLine(graphics, start.cx, start.cy, end.cx, end.cy, link.state === 'ok' ? 9 : 5, link.state === 'ok' ? 11 : 8);
        const t = prefersReducedMotion ? link.phase : (frame * 0.012 + link.phase) % 1;
        const px = start.cx + (end.cx - start.cx) * t;
        const py = start.cy + (end.cy - start.cy) * t;
        graphics.beginFill(color, link.state === 'alert' ? 0.95 : 0.72);
        graphics.drawRect(px - 2, py - 2, 4, 4);
        graphics.endFill();
    });

    let labelIndex = 0;
    zones.forEach(zone => {
        const rect = rects[zone.id];
        if (!rect) return;
        const color = facilityColorNumber(zone.state);
        const colorText = facilityColor(zone.state);
        const blink = zone.state === 'alert' && !prefersReducedMotion && frame % 24 < 12;
        const offset = Math.max(5, Math.min(10, rect.w * 0.09));
        const labelSize = width < 560 ? 10 : 12;

        graphics.lineStyle(zone.state === 'alert' ? 1.35 : 1, color, blink ? 0.55 : 0.84);
        graphics.drawRect(rect.x, rect.y, rect.w, rect.h);
        graphics.lineStyle(zone.state === 'alert' ? 1.35 : 1, color, blink ? 0.28 : 0.44);
        graphics.drawRect(rect.x + offset, rect.y - offset, rect.w, rect.h);
        graphics.moveTo(rect.x, rect.y);
        graphics.lineTo(rect.x + offset, rect.y - offset);
        graphics.moveTo(rect.x + rect.w, rect.y);
        graphics.lineTo(rect.x + rect.w + offset, rect.y - offset);
        graphics.moveTo(rect.x, rect.y + rect.h);
        graphics.lineTo(rect.x + offset, rect.y + rect.h - offset);
        graphics.moveTo(rect.x + rect.w, rect.y + rect.h);
        graphics.lineTo(rect.x + rect.w + offset, rect.y + rect.h - offset);

        graphics.beginFill(color, 0.24);
        graphics.drawRect(rect.x + 7, rect.y + rect.h - 9, Math.max(28, rect.w - 14), 3);
        graphics.endFill();
        graphics.beginFill(color, blink ? 0.62 : 0.75);
        graphics.drawRect(rect.x + 7, rect.y + rect.h - 9, Math.max(28, rect.w - 14) * Math.max(0.08, zone.load / 100), 3);
        graphics.endFill();

        pixiLabel(labelIndex++, zone.label, rect.x + 7, rect.y + 5, colorText, labelSize, 0.92);
        pixiLabel(labelIndex++, zone.status, rect.x + 7, rect.y + Math.min(rect.h - 19, 21), colorText, labelSize, zone.state === 'ok' ? 0.62 : 0.86);
    });

    graphics.lineStyle(1, 0xff3333, 1);
    contacts.forEach((contact, index) => {
        const start = rects[contact.from];
        const end = rects[contact.to];
        if (!start || !end) return;
        const t = prefersReducedMotion ? contact.phase : (contact.phase + frame * (0.006 + index * 0.001)) % 1;
        const wobble = prefersReducedMotion ? 0 : Math.sin(frame * 0.09 + index) * 7;
        const px = start.cx + (end.cx - start.cx) * t;
        const py = start.cy + (end.cy - start.cy) * t + wobble;
        const radius = 4 + (prefersReducedMotion ? 0 : Math.sin(frame * 0.18 + index) * 1.2);
        graphics.lineStyle(1, 0xff3333, 0.38);
        graphics.drawCircle(px, py, radius + 4);
        graphics.beginFill(0xff3333, 0.95);
        graphics.drawCircle(px, py, Math.max(2, radius * 0.45));
        graphics.endFill();
    });
    trimPixiLabels(labelIndex);

        state.app.renderer.render(state.app.stage);
        return true;
    } catch (error) {
        resetFacilityPixiState({ unavailable: true });
        document.documentElement.classList.remove('has-pixi-active');
        return false;
    }
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

    if (loading) {
        diagText('facilityMeta', `WIREFRAME BUS: ALIGNING ${asciiBar(Math.min(99, 14 + frame * 9), 10)}`);
        diagText('facilityScanStatus', `INDEX ${spinner(frame)} ${asciiBar(Math.min(99, 18 + frame * 8), 14)}`);
        diagText('facilityOverview', statusBlock('facility.overview', [
            '> LOADING FACILITY GRID',
            `  VECTOR BUS ${asciiBar(20 + frame * 7, 12)}`,
            `  TRACE      ${asciiGraph(frame, 16)}`,
            '  STATUS     WAITING'
        ], phase));
        diagText('facilityZones', statusBlock('facility.zones', [
            'CMD CORE    : SCAN',
            'LAB ARC     : SCAN',
            'GEN PLANT   : SCAN',
            'CNTM CELL   : SCAN'
        ], phase));
        diagText('facilityContacts', statusBlock('facility.contact_readout', [
            'BIO GRID    : SYNC',
            'FAULT BUS   : SYNC',
            `TRACE       : ${asciiGraph(frame, 16)}`,
            'UNKNOWN     : HOLD'
        ], phase));
        diagText('facilityTicker', `FACILITY WIREFRAME HANDSHAKE ${spinner(frame)} ${asciiBar(Math.min(99, 12 + frame * 9), 18)}`);
        return;
    }

    diagText('facilityMeta', `WIREFRAME BUS: LIVE // FRAME ${String(frame).padStart(4, '0')}`);
    diagText('facilityScanStatus', `GRID ${String((phase * 7) % 100).padStart(2, '0')}%`);
    diagText('facilityOverview', statusBlock('facility.overview', [
        `GRID ID     : ${statusGet('facility.grid.id', 'BDR-01')}`,
        `STRUCTURE   : ${asciiBar(structure, 12)}`,
        `POWER BUS   : ${asciiBar(power, 12)}`,
        `RESERVE     : ${asciiBar(reserve, 12)}`,
        `REPAIR IDX  : ${statusGet('facility.grid.repair', '06 OPEN')}`
    ], phase));
    diagText('facilityZones', statusBlock('facility.zones', zones
        .filter(zone => ['core', 'lab', 'gen', 'hab', 'contain', 'service'].includes(zone.id))
        .map(facilityZoneReadoutLine), phase));
    diagText('facilityContacts', statusBlock('facility.contact_readout', [
        `KNOWN BIO   : ${String(known).padStart(2, '0')}`,
        `UNKNOWN BIO : ${String(unknown).padStart(2, '0')} MOVING`,
        `CAM GRID    : ${statusGet('facility.contacts.camera', '05/12 DIRTY')}`,
        `FAULTS      : ${statusGet('facility.contacts.faults', 'PUMP2 DOOR-C RLY04')}`,
        `TRACE       : ${asciiGraph(phase, 16)}`
    ], phase));
    const defaultTicker = `MAINTENANCE REQUIRED // ABSTRACT GRID ONLY // UNKNOWN LIFE SIGNS DETECTED ${spinner(phase)}`;
    diagText('facilityTicker', statusInterpolate(statusGet('facility.ticker', defaultTicker), phase));
}

function renderFacilityStatus(timestamp = 0) {
    const canvas = getById('facilityCanvas');
    if (!canvas) return;
    const { width, height } = facilityViewportSize(canvas);
    const frame = facilityFrame || Math.round(timestamp / 33);
    const rects = {};
    const zones = getFacilityZones();
    const links = getFacilityLinks();
    const contacts = getFacilityContacts();

    zones.forEach(zone => {
        rects[zone.id] = facilityRect(zone, width, height, frame);
    });

    if (renderFacilityStatusPixi(canvas, width, height, frame, zones, links, contacts, rects)) {
        if (frame < 3 || frame % 4 === 0 || prefersReducedMotion) {
            updateFacilityReadouts(frame);
        }
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        if (frame < 3 || frame % 4 === 0 || prefersReducedMotion) {
            updateFacilityReadouts(frame);
        }
        return;
    }

    resizeFacilityCanvas(canvas, ctx);
    drawFacilityBackdrop(ctx, width, height, frame);
    links.forEach(link => drawFacilityConnection(ctx, link, rects, frame));
    zones.forEach(zone => drawFacilityBlock(ctx, zone, rects[zone.id], frame, width));
    drawFacilityContacts(ctx, rects, frame, contacts);

    if (frame < 3 || frame % 4 === 0 || prefersReducedMotion) {
        updateFacilityReadouts(frame);
    }
}

function runFacilityLoop(timestamp = 0) {
    if (!facilityActive || !AppState.networkOnline) return;
    const interval = effectsFrameMs(34, 80, 140);
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
    renderFacilityStatus(performance.now());
    if (!getPixi()) {
        loadScriptOnce('pixi')
            .then(() => {
                configureLibrarySupport();
                if (facilityActive) renderFacilityStatus(performance.now());
            })
            .catch(() => {
                facilityPixiState.unavailable = true;
            });
    }
    AudioEngine.bootBeep();
    Animator.dialogOpen(overlay);
    if (!prefersReducedMotion) {
        facilityAnimFrame = requestAnimationFrame(runFacilityLoop);
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
    AudioEngine.pageFlip();
    Animator.dialogClose(overlay, () => {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    });
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

