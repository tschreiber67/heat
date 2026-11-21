HEAT
This personal software project is a two-zone heat controller inside an enclosed space.  There is a browser UI and a JSON API. The backend is Node.js. The UI is JavaScript.

RUN
In the repo root run npm start which serves at http://localhost:8000 (default) or npm test -currently 35 tests with 0 fails
HEAT_SEED sets the seed so a simulator run can be repeated. The HEAT_SETTINGS settings file path (default ./settings.json), HEAT_TICK control period in seconds (default 1), HEAT_PORT server port 8000.

API
Method	Path			Purpose
GET	/api/state		Full snapshot: temps, heater duty/on, vent, fault
GET	/api/readings		Latest four sensor values
GET	/api/fault		Fault flag, reasons, seconds until auto-clear
GET	/api/settings		Current settings
PUT	/api/settings		Partial update (deep-merged), validated, persisted; 422 on bad input
GET	/api/history?limit=N	Ring buffer (last 3600 ticks)
POST	/api/override		vent: 0-100, upper_duty, lower_duty, clear_vent, duty puts that zone in manual mode

ARCHITECTURE
src/hardware.js is the driver interface (read, apply). 
src/simulator.js separates thermal model: heaters, vent, electronics heat, ambient plus random heat/cool events, upper and lower coupling, sensor bias and noise, per-run plant variation. 
src/random.js is the seeded PRNG. 
src/controller.js runs the per-zone PID (src/pid.js), time-proportional heaters, proportional vent past vent_margin, fault handling. 
src/settings.js validates settings, atomic JSON persistence (write temp file, rename). 
src/app.js serves HTTP and control loop;
src/server.js is the entrypoint. static/index.html UI.
tests/node:test tests the server running on an ephemeral port, ticks are driven directly.

Safety behavior
Faults happen when any sensor is missing, stale, out of range, over-temperature, a high or low alarm breach, electronics over limit, or upper and lower difference over max_zone_diff. While faulted: vents 100%, heaters off, the loop keeps running. When faults clear for fault_hold_s, then PID resumes.

REQUIREMENTS
- Node.js 22 or later (package.json engines: >=22).
- No npm install needed: zero dependencies.
- Same commands in Windows PowerShell and the macOS terminal.

LIMITATIONS
- Heat only: the vent exhausts toward ambient and cannot cool below it.
- Exactly two zones, named upper and lower.
- No authentication. The server binds to 127.0.0.1 (HEAT_HOST changes it).
- settings.json is written at runtime and is gitignored.
