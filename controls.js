export { keyMap, buttonMap, rmap, makeControlHandler, presentKeyMap, commandNames };

import { bindGamepadHandlers, bindKeyHandlers, handleControls, getDeviceInput } from './libs/controlHandling.js';

bindKeyHandlers();
bindGamepadHandlers();

const commandNames = {
    steerLeft:  'Steer left',
    steerRight: 'Steer right',
    gas:        'Gas',
    brake:      'Brake',
    activate:   'Use powerup / Next race',
    pause:      'Pause / Continue',
};

const defaultKeyMap = {
    ArrowLeft:  'steerLeft',
    ArrowRight: 'steerRight',
    ArrowUp:    'gas',
    ArrowDown:  'brake',
    KeyZ:       'activate',
    Space:      'pause',
};

const defaultButtonMap = {
    'a:2,v:-1': 'steerLeft',
    'a:2,v:1':  'steerRight',
    'b:1':      'gas',
    'b:3':      'brake',
    'b:2':      'activate',
    'b:9':      'pause',
};

const stored = localStorage.getItem('race_keyMap');
let keyMap = stored ? JSON.parse(stored) : { ...defaultKeyMap };
if (Object.keys(keyMap).length !== Object.keys(defaultKeyMap).length) keyMap = { ...defaultKeyMap };

const storedBtn = localStorage.getItem('race_buttonMap');
let buttonMap = storedBtn ? JSON.parse(storedBtn) : { ...defaultButtonMap };
if (Object.keys(buttonMap).length !== Object.keys(defaultButtonMap).length) buttonMap = { ...defaultButtonMap };

const rmap = (m) => {
    const r = {};
    for (const k in m) r[m[k]] = k;
    return r;
};

// Returns a function to call each frame; populates the `input` object with boolean flags.
function makeControlHandler(input) {
    const actions = {
        steerLeft:  () => { input.steerLeft  = true; },
        steerRight: () => { input.steerRight = true; },
        gas:        () => { input.gas        = true; },
        brake:      () => { input.brake      = true; },
        activate:   () => { input.activate   = true; },
        pause:      () => { input.pause      = true; },
    };
    return handleControls(actions, keyMap, buttonMap);
}

// Build the remapping UI inside a given container element.
let _remapping = false;
export function isRemapping() { return _remapping; }

function presentKeyMap(container, onBack) {
    if (container.querySelector('.remap-table')) return;
    _remapping = true;

    const rkeymap    = rmap(keyMap);
    const rbuttonmap = rmap(buttonMap);
    const e = (t) => document.createElement(t);

    const desc = e('p');
    desc.textContent = 'Click a cell to remap. Press the new key or button when prompted.';
    desc.style.margin = '0 0 12px 0';
    container.appendChild(desc);

    const table = e('table');
    table.className = 'remap-table';
    table.style.cssText = 'border-collapse:collapse;width:100%';
    container.appendChild(table);

    const header = e('tr');
    ['Action', 'Key', 'Button/Axis'].forEach(h => {
        const th = e('th');
        th.textContent = h;
        th.style.cssText = 'padding:4px 10px;text-align:left;border-bottom:1px solid #00FFFF44';
        header.appendChild(th);
    });
    table.appendChild(header);

    for (const action in commandNames) {
        const row = e('tr');
        const tda = e('td'); tda.textContent = commandNames[action]; tda.style.padding = '4px 10px';
        const tdk = e('td'); tdk.textContent = rkeymap[action] ?? '???'; tdk.style.cssText = 'padding:4px 10px;cursor:pointer;color:#0FF';
        const tdb = e('td'); tdb.textContent = rbuttonmap[action] ?? '???'; tdb.style.cssText = 'padding:4px 10px;cursor:pointer;color:#0FF';

        tdk.addEventListener('click', async () => {
            const old = rmap(keyMap)[action];
            if (old) delete keyMap[old];
            tdk.textContent = '???';
            const nk = await getDeviceInput('keyboard');
            keyMap[nk] = action;
            tdk.textContent = nk;
            localStorage.setItem('race_keyMap', JSON.stringify(keyMap));
        });

        tdb.addEventListener('click', async () => {
            const old = rmap(buttonMap)[action];
            if (old) delete buttonMap[old];
            tdb.textContent = '???';
            const nb = await getDeviceInput('gamepad');
            buttonMap[`${nb}`] = action;
            tdb.textContent = `${nb}`;
            localStorage.setItem('race_buttonMap', JSON.stringify(buttonMap));
        });

        row.append(tda, tdk, tdb);
        table.appendChild(row);
    }

    const back = e('div');
    back.textContent = '← Back';
    back.style.cssText = 'margin-top:16px;cursor:pointer;color:#0FF;text-decoration:underline';
    back.addEventListener('click', () => { _remapping = false; onBack(); });
    container.appendChild(back);
}
