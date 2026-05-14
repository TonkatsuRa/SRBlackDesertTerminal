function getById(id) {
    const cached = domByIdCache.get(id);
    if (cached && cached.isConnected) return cached;

    const element = document.getElementById(id);
    if (element) {
        domByIdCache.set(id, element);
    } else {
        domByIdCache.delete(id);
    }
    return element;
}

function clearElement(element) {
    if (element) element.textContent = '';
}

function invalidateStatusCaches() {
    statusProfileKeyCache = null;
    statusSectionIdCache.clear();
    statusLineGroupCache.clear();
    facilityZoneCache = null;
    facilityLinkCache = null;
    facilityContactCache = null;
}

function setStatusProfile(profile) {
    statusProfile = profile;
    invalidateStatusCaches();
}

function setTerminalContent(profile) {
    terminalContent = profile && profile.loaded ? profile : {
        source: 'HARDCODED FALLBACK',
        loaded: false,
        values: {}
    };
    invalidateStatusCaches();
    applyTerminalContentToDom();
}


const ENCRYPTION_KEY = 'Shelby';
function xorCrypt(text) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length));
    }
    return result;
}

