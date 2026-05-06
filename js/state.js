/* Black Desert Research Terminal app logic. Editable settings and default data are near the top. */
// ========================================
// CONFIG
// ========================================
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const lowPowerQuery = window.matchMedia("(update: slow), (pointer: coarse)");
let prefersReducedMotion = reducedMotionQuery.matches;
let MOTION_SCALE = prefersReducedMotion ? 0.25 : 1;
let mediaPreferenceHandlersBound = false;
const TYPEWRITER_CONFIG = {
    charInterval: prefersReducedMotion ? 0 : 9,
    bootCharInterval: prefersReducedMotion ? 0 : 22,
    terminalCharsPerSecond: prefersReducedMotion ? 0 : 180,
    terminalMaxCharsPerFrame: prefersReducedMotion ? 1 : 3,
    terminalKeyClickMs: 70,
    lineDelay: prefersReducedMotion ? 0 : 0
};
const EFFECTS_STORAGE_KEY = 'aresEffectsMode.v1';
const EFFECTS_MODES = new Set(['auto', 'full', 'low']);
const CDN_SCRIPTS = {
    fuse: 'https://cdn.jsdelivr.net/npm/fuse.js@7.2.0/dist/fuse.min.js',
    pixi: 'https://cdn.jsdelivr.net/npm/pixi.js@7.4.3/dist/pixi.min.js'
};
const lazyScriptPromises = new Map();
let effectsMode = 'auto';

function normalizeEffectsMode(mode) {
    const value = String(mode || '').trim().toLowerCase();
    return EFFECTS_MODES.has(value) ? value : 'auto';
}

function effectsLowActive() {
    return prefersReducedMotion || effectsMode === 'low' || (effectsMode === 'auto' && lowPowerQuery.matches);
}

function effectsFrameMs(fullMs = 33, lowMs = 80, typingMs = 140) {
    if (prefersReducedMotion) return 250;
    if (document.hidden) return 600;
    return effectsLowActive() ? lowMs : fullMs;
}

const EffectsController = {
    load() {
        try {
            effectsMode = normalizeEffectsMode(localStorage.getItem(EFFECTS_STORAGE_KEY) || 'auto');
        } catch (error) {
            effectsMode = 'auto';
        }
        this.apply();
    },

    setMode(mode) {
        effectsMode = normalizeEffectsMode(mode);
        try {
            localStorage.setItem(EFFECTS_STORAGE_KEY, effectsMode);
        } catch (error) {}
        this.apply();
        return effectsMode;
    },

    cycle() {
        const next = effectsMode === 'auto' ? 'full' : effectsMode === 'full' ? 'low' : 'auto';
        return this.setMode(next);
    },

    effectiveLabel() {
        if (prefersReducedMotion) return 'REDUCED';
        if (effectsMode === 'auto') return effectsLowActive() ? 'AUTO-LOW' : 'AUTO';
        return effectsMode.toUpperCase();
    },

    isLow() {
        return effectsLowActive();
    },

    apply() {
        const root = document.documentElement;
        if (root) {
            root.classList.toggle('effects-auto', effectsMode === 'auto');
            root.classList.toggle('effects-full', effectsMode === 'full' && !prefersReducedMotion);
            root.classList.toggle('effects-low', this.isLow());
        }
        if (document.body) {
            document.body.classList.toggle('effects-auto', effectsMode === 'auto');
            document.body.classList.toggle('effects-full', effectsMode === 'full' && !prefersReducedMotion);
            document.body.classList.toggle('effects-low', this.isLow());
        }
        syncLowPowerMode();
        updateEffectsStatus();
        if (facilityActive) renderFacilityStatus(performance.now());
    }
};

function syncLowPowerMode() {
    if (!document.body) return;
    document.body.classList.toggle('low-power', effectsLowActive());
}

function applyMotionPreference(matches = reducedMotionQuery.matches) {
    prefersReducedMotion = Boolean(matches);
    MOTION_SCALE = prefersReducedMotion ? 0.25 : 1;
    TYPEWRITER_CONFIG.charInterval = prefersReducedMotion ? 0 : 9;
    TYPEWRITER_CONFIG.bootCharInterval = prefersReducedMotion ? 0 : 22;
    TYPEWRITER_CONFIG.terminalCharsPerSecond = prefersReducedMotion ? 0 : 180;
    TYPEWRITER_CONFIG.terminalMaxCharsPerFrame = prefersReducedMotion ? 1 : 3;
    TYPEWRITER_CONFIG.lineDelay = prefersReducedMotion ? 0 : 0;
    EffectsController.apply();
    setTerminalTypingState(typeof isTyping === 'boolean' ? isTyping : false);

    if (prefersReducedMotion) {
        pauseRealtimePanels();
    } else {
        resumeRealtimePanels();
    }
}

function typeTextSmooth(element, text, options = {}) {
    const value = String(text ?? '');
    const activeClass = options.activeClass || 'terminal-typewriter-active';
    const interval = Math.max(1, Number(options.interval ?? TYPEWRITER_CONFIG.charInterval));
    const charsPerSecond = Math.max(0, Number(options.charsPerSecond || 0));
    const maxCharsPerFrame = Math.max(1, Number(options.maxCharsPerFrame || 1));
    const shouldCancel = typeof options.shouldCancel === 'function' ? options.shouldCancel : () => false;
    const onFrame = typeof options.onFrame === 'function' ? options.onFrame : null;
    const onChar = typeof options.onChar === 'function' ? options.onChar : null;

    if (!element) return Promise.resolve({ completed: false, cancelled: true });
    element.textContent = '';
    const textNode = document.createTextNode('');
    element.appendChild(textNode);

    if (prefersReducedMotion || !value) {
        textNode.data = value;
        element.classList.remove(activeClass);
        return Promise.resolve({ completed: true, cancelled: false });
    }

    element.classList.add(activeClass);
    let index = 0;
    let lastStepTime = 0;
    let charBudget = 0;

    return new Promise(resolve => {
        const finish = (cancelled = false) => {
            element.classList.remove(activeClass);
            if (onFrame) onFrame(null);
            resolve({ completed: !cancelled, cancelled });
        };

        const tick = (timestamp = 0) => {
            if (shouldCancel()) {
                finish(true);
                return;
            }

            if (!lastStepTime) lastStepTime = timestamp;
            const elapsed = Math.min(50, Math.max(0, timestamp - lastStepTime));
            let charsThisFrame = 0;

            if (charsPerSecond > 0) {
                charBudget += (elapsed * charsPerSecond) / 1000;
                charsThisFrame = Math.min(maxCharsPerFrame, value.length - index, Math.floor(charBudget));
                if (charsThisFrame > 0) charBudget -= charsThisFrame;
                lastStepTime = timestamp;
            } else if (timestamp - lastStepTime >= interval) {
                charsThisFrame = 1;
                lastStepTime = timestamp;
            }

            if (charsThisFrame > 0) {
                const startIndex = index;
                index = Math.min(value.length, index + charsThisFrame);
                textNode.data = value.slice(0, index);
                if (onChar) {
                    for (let i = startIndex; i < index; i++) {
                        onChar(i + 1, value.charAt(i));
                    }
                }
            }

            if (index < value.length) {
                const frame = requestAnimationFrame(tick);
                if (onFrame) onFrame(frame);
            } else {
                finish(false);
            }
        };

        const frame = requestAnimationFrame(tick);
        if (onFrame) onFrame(frame);
    });
}

function bindMediaQueryChange(query, handler) {
    if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', handler);
    } else if (typeof query.addListener === 'function') {
        query.addListener(handler);
    }
}

function bindPreferenceListeners() {
    if (mediaPreferenceHandlersBound) return;
    bindMediaQueryChange(reducedMotionQuery, event => applyMotionPreference(event.matches));
    bindMediaQueryChange(lowPowerQuery, () => EffectsController.apply());
    mediaPreferenceHandlersBound = true;
}

function updateEffectsStatus() {
    const label = getById('effectsStatus');
    const dot = getById('effectsDot');
    const toggle = getById('effectsToggle');
    const display = EffectsController.effectiveLabel();
    if (label) label.textContent = display;
    if (dot) {
        dot.classList.toggle('warn', effectsMode === 'auto' && EffectsController.isLow());
        dot.classList.toggle('err', EffectsController.isLow() && effectsMode !== 'auto');
    }
    if (toggle) {
        toggle.setAttribute('aria-label', `Visual effects mode ${display}. Activate to cycle mode.`);
        toggle.title = `Effects mode: ${display}`;
    }
}

function configureLibrarySupport() {
    const root = document.documentElement;
    root.classList.toggle('has-fuse', typeof window.Fuse === 'function');
    root.classList.toggle('has-pixi', Boolean(window.PIXI && window.PIXI.Application && window.PIXI.Graphics));
}

function loadScriptOnce(key, url = CDN_SCRIPTS[key]) {
    if (!url) return Promise.reject(new Error(`Unknown script: ${key}`));
    if (key === 'fuse' && typeof window.Fuse === 'function') return Promise.resolve();
    if (key === 'pixi' && window.PIXI && window.PIXI.Application && window.PIXI.Graphics) return Promise.resolve();
    if (lazyScriptPromises.has(key)) return lazyScriptPromises.get(key);

    const promise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-lazy-lib="${key}"]`);
        if (existing) {
            existing.addEventListener('load', () => {
                configureLibrarySupport();
                resolve();
            }, { once: true });
            existing.addEventListener('error', () => reject(new Error(`Failed to load ${key}`)), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = url;
        script.defer = true;
        script.dataset.lazyLib = key;
        script.onload = () => {
            configureLibrarySupport();
            resolve();
        };
        script.onerror = () => reject(new Error(`Failed to load ${key}`));
        document.head.appendChild(script);
    }).catch(error => {
        lazyScriptPromises.delete(key);
        throw error;
    });

    lazyScriptPromises.set(key, promise);
    return promise;
}


// ========================================
// STATE
// ========================================
let database = {};
let databaseEntries = [];
let databaseLoaded = false;
let databaseSource = 'NO DATABASE';
const DATABASE_SLOT_COUNT = 3;
let databaseSlots = Array.from({ length: DATABASE_SLOT_COUNT }, (_, index) => ({
    index,
    loaded: false,
    source: '',
    file: '',
    metadata: {},
    entries: []
}));
let databaseManifest = null;
let databaseManifestSource = 'unloaded';
let activeDatabaseSelection = null;
let pendingLocalDatabaseItem = null;
let databaseDecryptFrame = null;
let terminalContent = {
    source: 'HARDCODED FALLBACK',
    loaded: false,
    values: {}
};
const ACCESS_LEVELS = {
    employee: 'employee',
    elevated: 'elevated',
    admin: 'admin'
};
const ACCESS_RANKS = {
    employee: 0,
    elevated: 1,
    admin: 2
};
const CLEARANCE_LEVELS = {
    employee: 'Employee',
    normal: 'Employee',
    elevated: 'Elevated',
    admin: 'Admin'
};
const MENU_ACCESS_REQUIREMENTS = {
    loadStatus: ACCESS_LEVELS.admin,
    list: ACCESS_LEVELS.admin,
    fsearch: ACCESS_LEVELS.elevated,
    logout: ACCESS_LEVELS.elevated
};
const AppState = {
    accessLevel: ACCESS_LEVELS.employee,
    adminMode: false,
    clearanceLevel: CLEARANCE_LEVELS.employee,
    soundEnabled: true,
    networkOnline: true,
    databaseLoaded: false,
    activeOverlay: 'none'
};
let accessLevel = ACCESS_LEVELS.employee;
let adminMode = false;
const ADMIN_PASSWORD = atob("YXBvY2FseXBzZQ==");
const ELEVATED_PASSWORD = 'Shareholdervalue';
const FALLBACK_DATABASE_MANIFEST = [
    {
        id: 'database1',
        displayName: 'Personnel Registry',
        description: 'Employee, contractor, and missing staff notes for Black Desert Research.',
        file: 'database1.md'
    },
    {
        id: 'database2',
        displayName: 'Security Incidents',
        description: 'Patrol reports, alarm events, and defense-grid irregularities.',
        file: 'database2.md'
    },
    {
        id: 'database3',
        displayName: 'Research Assets',
        description: 'Specimen vaults, prototype lockers, and archived lab inventory.',
        file: 'database3.md'
    },
    {
        id: 'database4',
        displayName: 'Outpost Relay Logs',
        description: 'Remote station, drone uplink, and mesh-network records.',
        file: 'database4.md'
    },
    {
        id: 'database5',
        displayName: 'Maintenance Queue',
        description: 'Power, life-support, access, and generator maintenance backlog.',
        file: 'database5.md'
    },
    {
        id: 'database6',
        displayName: 'Confidential Archive',
        description: 'Restricted executive notes, redacted incidents, and sealed directives.',
        file: 'database6.md'
    },
    {
        id: 'ares_01_director_logbook',
        displayName: 'ARES Director Logbook',
        description: 'Private director log entries for the Black Desert operation.',
        file: 'ares_01_direktor_logbuch.md'
    },
    {
        id: 'ares_02_employee_logbook',
        displayName: 'ARES Employee Logbook',
        description: 'Personal and duty logs from staff, mercenaries, technicians, and penal workers.',
        file: 'ares_02_mitarbeiter_logbuch.md'
    },
    {
        id: 'ares_03_shadow_spirits_inhabitants',
        displayName: 'Shadow Spirits and Inhabitants',
        description: 'Field notes and warning reports on entities and inhabitants of the Black Desert.',
        file: 'ares_03_schattengeister_bewohner.md'
    },
    {
        id: 'ares_04_weekly_reports',
        displayName: 'ARES Weekly Reports',
        description: 'Chronological weekly reports from discovery through collapse.',
        file: 'ares_04_woechentliche_rapporte.md'
    },
    {
        id: 'ares_05_security_logbook',
        displayName: 'ARES Security Logbook',
        description: 'Security events, patrol reports, Firewatch protocols, and automated alarms.',
        file: 'ares_05_sicherheitslogbuch.md'
    },
    {
        id: 'ares_06_research_laboratory',
        displayName: 'ARES Research Laboratory',
        description: 'Laboratory logs and internal analysis of portals, black sand, and anomalies.',
        file: 'ares_06_forschungslabor.md'
    },
    {
        id: 'ares_07_psychiatric_ai_reports',
        displayName: 'Psychiatric AI Reports',
        description: 'Automated psychological care, stress, and risk reports from CARE-9.',
        file: 'ares_07_psychiatrische_ki_rapporte.md'
    },
    {
        id: 'ares_database1_metaplanar_access',
        displayName: 'ARES Metaplanar Access Archive',
        description: 'Discovery history, portal construction, and early exploitation records.',
        file: 'ares_database1_metaplanar_access.md'
    },
    {
        id: 'ares_database1_metaplanar_access_de',
        displayName: 'ARES Metaplanar Access Archive (DE)',
        description: 'German-language archive for portal discovery, construction, and exploitation records.',
        file: 'ares_database1_metaplanar_access_de.md'
    },
    {
        id: 'ares_database2_management_pressure_de',
        displayName: 'ARES Executive Pressure Chain (DE)',
        description: 'German-language directives, profitability language, escalation orders, and compliance memos.',
        file: 'ares_database2_management_pressure_de.md'
    },
    {
        id: 'engineer_brandt_personal_log_de',
        displayName: 'Engineer Brandt Personal Log (DE)',
        description: 'German-language personal log entries from an ARES engineer at outpost BRE-07.',
        file: 'ares_engineer_personal_database_de.md'
    }
];
// Menu state
let selectedMenuIndex = 0;
let renderedMenuIndex = -1;
let menuItems = [];
let menuFocused = true;
let terminalKeyHandlerBound = false;
let menuHandlersBound = false;
let accessDialogReturnFocus = null;
let shellTelemetryTimer = null;

// CLI transcript output
let outputBuffer = [];
let outputPages = [[]];
let currentPage = 0;
let linesPerPage = 15;
let totalPages = 1;
let resizeFrame = null;
let hologramStarted = false;
let hologramStartTimer = null;
let diagnosticActive = false;
let diagnosticFrame = 0;
let diagnosticAnimFrame = null;
let diagnosticLastRender = 0;
let facilityActive = false;
let facilityFrame = 0;
let facilityAnimFrame = null;
let facilityLastRender = 0;
const facilityCanvasSize = { width: 0, height: 0, ratio: 1 };
let facilityPixiState = {
    app: null,
    graphics: null,
    staticGraphics: null,
    dynamicGraphics: null,
    labelContainer: null,
    labels: [],
    canvas: null,
    staticSignature: '',
    unavailable: false
};
let facilityZoneCache = null;
let facilityLinkCache = null;
let facilityContactCache = null;
let databaseFuseCache = {
    signature: '',
    includeConfidential: false,
    fuse: null
};
let lastFuzzySearchUsedFuse = false;
let statusProfile = {
    source: 'INTERNAL DEFAULT',
    loaded: false,
    values: {}
};
const STATUS_PROFILE_STORAGE_KEY = 'aresStatusProfile.v1';
const domByIdCache = new Map();
let statusProfileKeyCache = null;
const statusSectionIdCache = new Map();
const statusLineGroupCache = new Map();

function normalizeOverlayName(name) {
    const value = String(name || '').trim().toLowerCase();
    return value || 'none';
}

function normalizeAccessLevel(level) {
    const value = String(level || '').trim().toLowerCase();
    if (['admin', 'administrator', 'omega-admin', 'omega_admin'].includes(value)) return ACCESS_LEVELS.admin;
    if (['elevated', 'shareholder', 'shareholdervalue', 'restricted'].includes(value)) return ACCESS_LEVELS.elevated;
    return ACCESS_LEVELS.employee;
}

function accessRank(level) {
    return ACCESS_RANKS[normalizeAccessLevel(level)] ?? ACCESS_RANKS.employee;
}

function hasAccess(requiredLevel = ACCESS_LEVELS.employee) {
    return accessRank(AppState.accessLevel) >= accessRank(requiredLevel);
}

function accessLevelLabel(level = AppState.accessLevel) {
    return CLEARANCE_LEVELS[normalizeAccessLevel(level)] || CLEARANCE_LEVELS.employee;
}

function accessLevelClass(level = AppState.accessLevel) {
    const normalized = normalizeAccessLevel(level);
    if (normalized === ACCESS_LEVELS.admin) return 't-red';
    if (normalized === ACCESS_LEVELS.elevated) return 't-amber';
    return 't-cyan';
}

function menuItemRequiredAccess(item) {
    if (!item) return ACCESS_LEVELS.employee;
    return MENU_ACCESS_REQUIREMENTS[item.dataset?.cmd] || (item.classList.contains('admin-cmd') ? ACCESS_LEVELS.admin : ACCESS_LEVELS.employee);
}

function setAppState(patch = {}, options = {}) {
    if (!patch || typeof patch !== 'object') return AppState;

    if (Object.prototype.hasOwnProperty.call(patch, 'accessLevel')) {
        AppState.accessLevel = normalizeAccessLevel(patch.accessLevel);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'adminMode')) {
        AppState.accessLevel = patch.adminMode ? ACCESS_LEVELS.admin : ACCESS_LEVELS.employee;
    }
    AppState.adminMode = AppState.accessLevel === ACCESS_LEVELS.admin;
    AppState.clearanceLevel = accessLevelLabel(AppState.accessLevel);
    if (Object.prototype.hasOwnProperty.call(patch, 'soundEnabled')) {
        AppState.soundEnabled = Boolean(patch.soundEnabled);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'networkOnline')) {
        AppState.networkOnline = Boolean(patch.networkOnline);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'databaseLoaded')) {
        AppState.databaseLoaded = Boolean(patch.databaseLoaded);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'activeOverlay')) {
        AppState.activeOverlay = normalizeOverlayName(patch.activeOverlay);
    }

    syncAppUi(options);
    return AppState;
}

function syncAppUi(options = {}) {
    AppState.accessLevel = normalizeAccessLevel(AppState.accessLevel);
    AppState.adminMode = AppState.accessLevel === ACCESS_LEVELS.admin;
    AppState.clearanceLevel = accessLevelLabel(AppState.accessLevel);
    accessLevel = AppState.accessLevel;
    adminMode = Boolean(AppState.adminMode);
    databaseLoaded = Boolean(AppState.databaseLoaded);

    const clearance = typeof getById === 'function' ? getById('clearanceLevel') : document.getElementById('clearanceLevel');
    if (clearance) {
        clearance.textContent = AppState.clearanceLevel;
        clearance.classList.remove('t-cyan', 't-amber', 't-red', 't-magenta');
        clearance.classList.add(accessLevelClass(AppState.accessLevel));
    }

    const badge = typeof getById === 'function' ? getById('adminBadge') : document.getElementById('adminBadge');
    if (badge) badge.classList.toggle('active', adminMode);

    document.querySelectorAll('.menu-item.admin-cmd').forEach(item => {
        const required = menuItemRequiredAccess(item);
        const locked = !hasAccess(required);
        item.classList.toggle('locked', locked);
        item.classList.toggle('elevated-cmd', required === ACCESS_LEVELS.elevated);
        item.classList.toggle('admin-only-cmd', required === ACCESS_LEVELS.admin);
        item.setAttribute('aria-disabled', locked ? 'true' : 'false');
    });

    if (!adminMode && options.resetSelection !== false && menuItems[selectedMenuIndex]?.classList.contains('locked')) {
        selectedMenuIndex = 0;
        if (typeof updateMenuSelection === 'function') updateMenuSelection();
    }

    const soundLabel = typeof getById === 'function' ? getById('soundStatus') : document.getElementById('soundStatus');
    const soundDot = typeof getById === 'function' ? getById('soundDot') : document.getElementById('soundDot');
    const soundToggle = typeof getById === 'function' ? getById('soundToggle') : document.getElementById('soundToggle');
    if (soundLabel) soundLabel.textContent = AppState.soundEnabled ? 'ON' : 'OFF';
    if (soundDot) soundDot.classList.toggle('err', !AppState.soundEnabled);
    if (soundToggle) {
        const soundState = AppState.soundEnabled ? 'on' : 'off';
        soundToggle.classList.toggle('offline', !AppState.soundEnabled);
        soundToggle.setAttribute('aria-label', `Sound ${soundState}. Activate to ${AppState.soundEnabled ? 'mute' : 'unmute'} terminal sound.`);
        soundToggle.title = `Sound: ${soundState.toUpperCase()}`;
    }

    const networkLabel = typeof getById === 'function' ? getById('networkStatus') : document.getElementById('networkStatus');
    const networkDot = typeof getById === 'function' ? getById('networkDot') : document.getElementById('networkDot');
    const networkItem = typeof getById === 'function' ? getById('networkStatusItem') : document.getElementById('networkStatusItem');
    if (networkLabel) networkLabel.textContent = AppState.networkOnline ? 'ONLINE' : 'OFFLINE';
    if (networkDot) networkDot.classList.toggle('err', !AppState.networkOnline);
    if (networkItem) {
        const networkState = AppState.networkOnline ? 'online' : 'offline';
        networkItem.classList.toggle('offline', !AppState.networkOnline);
        networkItem.setAttribute('aria-label', `Network ${networkState}. Activate to toggle network state.`);
        networkItem.title = `Network: ${networkState.toUpperCase()}`;
    }

    document.querySelectorAll('[data-panel-cmd="diagnostic"], [data-panel-cmd="facility"]').forEach(button => {
        button.classList.toggle('network-locked', !AppState.networkOnline);
        button.removeAttribute('aria-disabled');
        const label = button.textContent.replace(/\s+/g, ' ').trim() || 'Network system';
        button.setAttribute('aria-label', AppState.networkOnline
            ? `${label}. Open network-dependent system.`
            : `${label}. Network offline; activate for unavailable-system message.`);
    });

    if (document.body) {
        document.body.classList.toggle('admin-access-active', adminMode);
        document.body.classList.toggle('elevated-access-active', AppState.accessLevel === ACCESS_LEVELS.elevated);
        document.body.classList.toggle('network-offline', !AppState.networkOnline);
        document.body.dataset.accessLevel = AppState.accessLevel;
        document.body.dataset.activeOverlay = AppState.activeOverlay;
    }
}

function syncAppStateFromLegacy(options = {}) {
    if (adminMode) AppState.accessLevel = ACCESS_LEVELS.admin;
    AppState.accessLevel = normalizeAccessLevel(AppState.accessLevel);
    AppState.adminMode = AppState.accessLevel === ACCESS_LEVELS.admin;
    AppState.clearanceLevel = accessLevelLabel(AppState.accessLevel);
    AppState.databaseLoaded = Boolean(databaseLoaded);
    if (typeof AudioEngine !== 'undefined') AppState.soundEnabled = Boolean(AudioEngine.enabled);
    syncAppUi(options);
    return AppState;
}

const DEFAULT_BOOT_SEQUENCE = [
    { type: 'line', text: '╔════════════════════════════════════════════╗', className: 't-dim' },
    { type: 'line', text: '║    ARES MACROTECHNOLOGY SYSTEMS v4.7.2     ║', className: 't-dim' },
    { type: 'line', text: '║       INITIALIZING BOOT SEQUENCE...        ║', className: 't-dim' },
    { type: 'line', text: '╚════════════════════════════════════════════╝', className: 't-dim' },
    { type: 'pause', duration: 160 },
    { type: 'blank' },
    { type: 'section', text: 'POWER AND FIRMWARE BUS' },
    { type: 'check', label: 'BIOS INIT', result: 'OK', status: 'loaded' },
    { type: 'check', label: 'MEMORY 640K BASE', result: 'OK', status: 'ok' },
    { type: 'check', label: 'EXT MEMORY 262144K', result: 'OK', status: 'ok' },
    { type: 'check', label: 'MEMORY INTEGRITY', result: 'OK', status: 'ok' },
    { type: 'check', label: 'CPU CORES', result: 'OK', status: 'operational' },
    { type: 'check', label: 'GPU ENGINE', result: 'OK', status: 'rendering' },
    { type: 'blank' },
    { type: 'section', text: 'KERNEL AND DEVICE CONTROL' },
    { type: 'check', label: 'KERNEL LOAD', result: 'OK', status: 'loaded' },
    { type: 'check', label: 'DEVICE DRIVERS', result: 'OK', status: 'loaded' },
    { type: 'check', label: 'FILESYSTEM MOUNT', result: 'OK', status: 'loaded' },
    { type: 'check', label: 'VIRTUAL MEMORY', result: 'OK', status: 'operational' },
    { type: 'blank' },
    { type: 'section', text: 'NETWORK CONNECTIONS' },
    { type: 'check', label: 'NET INTERFACE eth0', result: 'DISCONNECTED', status: 'malfunction' },
    { type: 'check', label: 'NET INTERFACE eth1', result: 'OFFLINE', status: 'unknown' },
    { type: 'check', label: 'EXTERNAL RELAY', result: 'FAILED', status: 'unknown' },
    { type: 'check', label: 'DRONE UPLINK', result: 'DEGRADED 77%', status: 'warn' },
    { type: 'check', label: 'MESH NETWORK', result: 'WEAK SIGNAL', status: 'operational' },
    { type: 'blank' },
    { type: 'section', text: 'DATABASE SYSTEMS' },
    { type: 'check', label: 'DATABASE MODULE', result: 'OK', status: 'operational' },
    { type: 'check', label: 'INDEX PARSER', result: 'OK', status: 'operational' },
    { type: 'check', label: 'INTEGRITY CHECK', result: 'OK', status: 'secure' },
    { type: 'check', label: 'QUERY ENGINE', result: 'OK', status: 'operational' },
    { type: 'blank' },
    { type: 'section', text: 'SECURITY PROTOCOLS' },
    { type: 'check', label: 'SECURITY PROTOCOL', result: 'ENGAGED', status: 'active' },
    { type: 'check', label: 'CLEARANCE LEVEL', result: 'RESTRICTED', status: 'warn' },
    { type: 'check', label: 'ENCRYPTION MODULE', result: 'ACTIVE', status: 'operational' },
    { type: 'check', label: 'CONFIDENTIAL FILES', result: 'LOCKED', status: 'warn' },
    { type: 'check', label: 'INTRUSION DETECTION', result: 'ARMED', status: 'operational' },
    { type: 'check', label: 'AUTONOMOUS DEFENSE SYSTEMS', result: 'ARMED', status: 'operational' },
    { type: 'check', label: 'DIS DETECTION SENSORS', result: 'DEGRADED', status: 'malfunction' },
    { type: 'blank' },
    { type: 'section', text: 'DISPLAY HANDOFF' },
    { type: 'check', label: 'PHOSPHOR GRID ALIGNMENT', result: 'SYNC', status: 'ok' },
    { type: 'check', label: 'TERMINAL READY', result: 'DONE', status: 'ok', final: true }
];

// Encryption
