# Terminal Content

// This file controls editable text for index.html.
// Use the section names and key names below. The terminal parser ignores lines
// starting with #, //, or HTML comments, so these instructions never appear in UI.
// For multi-line blocks, edit line1, line2, line3, etc. Keep numbering continuous.
// Class names are optional terminal color classes: t-dim, t-bright, t-cyan, t-amber,
// t-red, t-magenta. Leave a class blank for normal phosphor text.

## terminal
title = BLACK DESERT RESEARCH TERMINAL
name = BLACK DESERT RESEARCH TERMINAL
build = 4.7.2
corporation = ARES MACROTECHNOLOGY

## commands
welcome = WELCOME
help = HELP
diagnostic = DIAGNOSTIC
facility = FACILITY STATUS
load = LOAD DATABASE
search = SEARCH
categories = CATEGORIES
clear = CLEAR
access = ACCESS
loadStatus = LOAD STATUS
list = LIST ALL
fsearch = FUZZY SEARCH
logout = LOGOUT

## welcome
line1 = ═══════════════════════════════════════════════════════
class1 = t-dim
line2 =               ARES MACROTECHNOLOGY
class2 = t-bright
line3 = ═══════════════════════════════════════════════════════
class3 = t-dim
line4 =
line5 = WELCOME, AUTHORIZED PERSONNEL ASSET.
class5 = t-amber
line6 =
line7 = This terminal provides controlled access to Black Desert
line8 = Research Facility database, diagnostic, and status systems.
line9 =
line10 = All employees are reminded that compliance is productivity.
line11 = Productivity is margin. Margin is shareholder confidence.
line12 =
line13 = Obey issued directives, fulfill assigned duties, and report
line14 = facility anomalies before they become expensive.
line15 =
line16 = Ares values dedication, discretion, and replaceable efficiency.
line17 = Use HELP for command guidance.
class17 = t-dim
line18 = ═══════════════════════════════════════════════════════
class18 = t-dim

## help
line1 = ═══════════════════════════════════════════════════════
class1 = t-dim
line2 =                     SYSTEM MANUAL
class2 = t-bright
line3 = ═══════════════════════════════════════════════════════
class3 = t-dim
line4 =
line5 = LOAD DATABASE
class5 = t-cyan
line6 =   Opens the in-terminal database selector.
line7 =   Select a package, then enter that package password.
line8 =   Local .md, .txt, or .dat fallback is still available with LOAD FILE.
line9 =
line10 = SEARCH
class10 = t-cyan
line11 =   Query database by exact entry title or entry id.
line12 =   Example: SEARCH perimeter-drone
line13 =
line14 = CATEGORIES
class14 = t-cyan
line15 =   Displays all available categories and visible entry counts.
line16 =
line17 = CLEAR
class17 = t-cyan
line18 =   Clears the display area. Loaded data remains active.
line19 =
line20 = DIAGNOSTIC
class20 = t-cyan
line21 =   Opens current base diagnostic dashboard.
line22 =
line23 = FACILITY STATUS
class23 = t-cyan
line24 =   Opens abstract wireframe overview of facility zones.
line25 =
line26 = ACCESS
class26 = t-cyan
line27 =   Request elevated administrator privileges.
line28 =
line29 = ───────────────────────────────────────────────────────
class29 = t-dim
line30 = ADMIN COMMANDS (requires ACCESS)
class30 = t-red
line31 = ───────────────────────────────────────────────────────
class31 = t-dim
line32 =
line33 = LOAD STATUS / STATUS LOAD
class33 = t-red
line34 =   Loads a .txt, .md, or encrypted .dat status profile.
line35 =   Restarts the terminal and revokes admin access after loading.
line36 =
line37 = LIST ALL
class37 = t-red
line38 =   Displays complete database index including confidential entries.
line39 =
line40 = FUZZY SEARCH
class40 = t-red
line41 =   Search by partial match in title, id, tags, or body.
line42 =
line43 = LOGOUT
class43 = t-red
line44 =   Terminate administrator session.
line45 =
line46 = ═══════════════════════════════════════════════════════
class46 = t-dim
line47 = Navigation: ↑↓ Menu | ←→ Pages | Enter Select
class47 = t-dim
line48 = ═══════════════════════════════════════════════════════
class48 = t-dim

## errors
no_database = ERROR: No database loaded.
no_database_hint = Use LOAD DATABASE to select a package first.
search_no_result = SEARCH QUERY RETURNED NO RESULT
unknown_command_hint = Use the menu to navigate commands.
database_manifest_fail = DATABASE MANIFEST UNAVAILABLE.
database_package_fail = DATABASE PACKAGE FAILED TO LOAD.
database_password_fail = ACCESS DENIED - INVALID DATABASE PASSWORD

## admin
required_hint = Use ACCESS to authenticate before modifying status systems.
access_granted = ADMINISTRATOR ACCESS GRANTED
access_denied = ACCESS DENIED
logout = ADMINISTRATOR SESSION TERMINATED

## boot.logo
line1 = "        █████╗ ██████╗ ███████╗███████╗"
line2 = "       ██╔══██╗██╔══██╗██╔════╝██╔════╝"
line3 = "       ███████║██████╔╝█████╗  ███████╗"
line4 = "       ██╔══██║██╔══██╗██╔══╝  ╚════██║"
line5 = "       ██║  ██║██║  ██║███████╗███████║"
line6 = "       ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝"
line7 = "         MACROTECHNOLOGY SYSTEMS"

// Boot steps can be edited or reordered by changing the numeric section ids.
// type can be line, blank, pause, section, or check.
// check entries use label, result, and status. final = true marks the last check.

## boot.step.001
type = line
text = ╔════════════════════════════════════════════╗
class = t-dim

## boot.step.002
type = line
text = ║    ARES MACROTECHNOLOGY SYSTEMS v4.7.2     ║
class = t-dim

## boot.step.003
type = line
text = ║       INITIALIZING BOOT SEQUENCE...        ║
class = t-dim

## boot.step.004
type = line
text = ╚════════════════════════════════════════════╝
class = t-dim

## boot.step.005
type = pause
duration = 160

## boot.step.006
type = blank

## boot.step.007
type = section
text = POWER AND FIRMWARE BUS

## boot.step.008
type = check
label = BIOS INIT
result = OK
status = loaded

## boot.step.009
type = check
label = MEMORY 640K BASE
result = OK
status = ok

## boot.step.010
type = check
label = EXT MEMORY 262144K
result = OK
status = ok

## boot.step.011
type = check
label = MEMORY INTEGRITY
result = OK
status = ok

## boot.step.012
type = check
label = CPU CORES
result = OK
status = operational

## boot.step.013
type = check
label = GPU ENGINE
result = OK
status = rendering

## boot.step.014
type = blank

## boot.step.015
type = section
text = KERNEL AND DEVICE CONTROL

## boot.step.016
type = check
label = KERNEL LOAD
result = OK
status = loaded

## boot.step.017
type = check
label = DEVICE DRIVERS
result = OK
status = loaded

## boot.step.018
type = check
label = FILESYSTEM MOUNT
result = OK
status = loaded

## boot.step.019
type = check
label = VIRTUAL MEMORY
result = OK
status = operational

## boot.step.020
type = blank

## boot.step.021
type = section
text = NETWORK CONNECTIONS

## boot.step.022
type = check
label = NET INTERFACE eth0
result = DISCONNECTED
status = malfunction

## boot.step.023
type = check
label = NET INTERFACE eth1
result = OFFLINE
status = unknown

## boot.step.024
type = check
label = EXTERNAL RELAY
result = FAILED
status = unknown

## boot.step.025
type = check
label = DRONE UPLINK
result = DEGRADED 77%
status = warn

## boot.step.026
type = check
label = MESH NETWORK
result = WEAK SIGNAL
status = operational

## boot.step.027
type = blank

## boot.step.028
type = section
text = DATABASE SYSTEMS

## boot.step.029
type = check
label = DATABASE MODULE
result = OK
status = operational

## boot.step.030
type = check
label = INDEX PARSER
result = OK
status = operational

## boot.step.031
type = check
label = INTEGRITY CHECK
result = OK
status = secure

## boot.step.032
type = check
label = QUERY ENGINE
result = OK
status = operational

## boot.step.033
type = blank

## boot.step.034
type = section
text = SECURITY PROTOCOLS

## boot.step.035
type = check
label = SECURITY PROTOCOL
result = ENGAGED
status = active

## boot.step.036
type = check
label = CLEARANCE LEVEL
result = RESTRICTED
status = warn

## boot.step.037
type = check
label = ENCRYPTION MODULE
result = ACTIVE
status = operational

## boot.step.038
type = check
label = CONFIDENTIAL FILES
result = LOCKED
status = warn

## boot.step.039
type = check
label = INTRUSION DETECTION
result = ARMED
status = operational

## boot.step.040
type = check
label = AUTONOMOUS DEFENSE SYSTEMS
result = ARMED
status = operational

## boot.step.041
type = check
label = DIS DETECTION SENSORS
result = DEGRADED
status = malfunction

## boot.step.042
type = blank

## boot.step.043
type = section
text = DISPLAY HANDOFF

## boot.step.044
type = check
label = PHOSPHOR GRID ALIGNMENT
result = SYNC
status = ok

## boot.step.045
type = check
label = TERMINAL READY
result = DONE
status = ok
final = true

## diagnostic
title = BASE DIAGNOSTIC
ticker = FACILITY PASS: EXTERNAL COMMS DOWN // DEFENSE ARMED // DIS SENSORS DEGRADED // UNKNOWN LIFE SIGNS {spinner} {sweep:20}

## diagnostic.label
network = NETWORK STATUS
security = SECURITY INTEGRITY
outposts = OUTPOST LINKS
generator = POWER GENERATOR
power = POWER RESERVES
alarm = ALARM STATUS
life = LIFE SIGNS

## diagnostic.network
state = alert
status = DISCONNECTED
level = 69
surface = DISCONNECTED
relay = FAILED / NO CARRIER
drone = DEGRADED 77%
line1 = FACILITY BUS : LOCAL ONLY {spinner}
line2 = LOCAL MESH   : {bar:diagnostic.network.level:18}
line3 = SURFACE NET  : DISCONNECTED
line4 = EXT RELAY    : FAILED / NO CARRIER
line5 = DRONE UPLINK : DEGRADED 77%

## diagnostic.security
state = warn
status = ARMED
level = 81
protocol = ENGAGED
defense = ARMED
intrusion = ARMED / NO BREACH
vault = SEALED / SERVO-3 SLOW
line1 = PERIMETER    : {bar:diagnostic.security.level:18}
line2 = SEC PROTOCOL : ENGAGED
line3 = AUTO DEFENSE : ARMED
line4 = INTRUSION    : ARMED / NO BREACH
line5 = VAULT DOORS  : SEALED / SERVO-3 SLOW

## diagnostic.outposts
state = warn
status = LINK DEGRADED
drone = DEGRADED 77%
mesh = WEAK SIGNAL
outpost1 = PARTIAL MESH  188ms
outpost4 = NO CARRIER    ----
line1 = LINK SWEEP   : {sweep:22}
line2 = DRONE UPLINK : DEGRADED 77%
line3 = MESH NETWORK : WEAK SIGNAL
line4 = OUTPOST-01   : PARTIAL MESH  188ms
line5 = OUTPOST-04   : NO CARRIER    ----

## diagnostic.generator
state = warn
status = SERVICE DUE
level = 62
core = RUNNING HOT
temp = 451K ABOVE NOMINAL
coolant = FLOW LOW / FILTER CLOG
line1 = CORE-A {spinner}      : RUNNING HOT
line2 = TURBINE RPM  : {bar:diagnostic.generator.level:18}
line3 = TEMP         : 451K ABOVE NOMINAL
line4 = LOAD BUS     : {sweep:22}
line5 = COOLANT      : FLOW LOW / FILTER CLOG

## diagnostic.power
state = warn
status = LOW RESERVE
main = 61
reserve = 34
bat_a = [####------] 3.2h
bat_b = [###-------] 2.6h
capacitor = UNEVEN CHARGE ...
line1 = MAIN GRID    : {bar:diagnostic.power.main:20}
line2 = RESERVE CELL : {bar:diagnostic.power.reserve:20}
line3 = BAT-A        : [####------] 3.2h
line4 = BAT-B        : [###-------] 2.6h
line5 = CAPACITOR    : UNEVEN CHARGE ...

## diagnostic.alarm
state = malfunction
status = DIS DEGRADED
station = AMBER MAINTENANCE
dis = DEGRADED / 02 BLIND
biohazard = CLEAR / SAMPLE LOCK DUE
containment = ZONE C-12 SEAL DRIFT
line1 = STATION ALARM: AMBER MAINTENANCE
line2 = DIS SENSORS  : DEGRADED / 02 BLIND
line3 = BIOHAZARD    : CLEAR / SAMPLE LOCK DUE
line4 = CONTAINMENT  : ZONE C-12 SEAL DRIFT
line5 = SIREN BUS    : {sweep:22}

## diagnostic.life
state = alert
status = 3 UNKNOWN
known = 14
unstable = 2
unknown = 3
line1 = BIO COUNT    : 14 CONFIRMED / 02 UNSTABLE / 03 UNKNOWN
line2 = HEARTBEAT    : {heartbeat:38}
line3 = UNKNOWN TRACE: SERVICE TUNNEL / CONTAINMENT ACCESS

## facility
title = FACILITY STATUS
ticker = MAINTENANCE REQUIRED // ABSTRACT GRID ONLY // UNKNOWN LIFE SIGNS DETECTED {spinner}

## facility.label
overview = GRID OVERVIEW
zones = ZONE READOUT
contacts = BIO / FAULT TRACE

## facility.grid
id = BDR-01
structure = 77
power = 61
reserve = 34
repair = 06 OPEN

## facility.overview
line1 = GRID ID     : BDR-01
line2 = STRUCTURE   : {bar:facility.grid.structure:12}
line3 = POWER BUS   : {bar:facility.grid.power:12}
line4 = RESERVE     : {bar:facility.grid.reserve:12}
line5 = REPAIR IDX  : 06 OPEN

## facility.zones
line1 = CMD CORE   NOMINAL   78%
line2 = LAB ARC    SEAL DRFT 64%
line3 = GEN PLANT  SERVICE   61%
line4 = HAB RING   LOW HEAT  67%
line5 = CNTM CELL  WATCH     58%
line6 = SVC BUS    UNK TRACE 47%

## facility.contact_readout
line1 = KNOWN BIO   : 14
line2 = UNKNOWN BIO : 03 MOVING
line3 = CAM GRID    : 05/12 DIRTY
line4 = FAULTS      : PUMP2 DOOR-C RLY04
line5 = TRACE       : {sweep:16}

## facility.contacts
known = 14
unknown = 3
camera = 05/12 DIRTY
faults = PUMP2 DOOR-C RLY04
routes = service->contain, lab->core, storage->gen
