export {
  bindGamepadHandlers,
  bindKeyHandlers,
  handleControls,
  touchZoneHandler,
  getDeviceInput,
  resetKeys,
};

const keys = {};

const controllers = [];
const steadyStateAxes = [];

const touchZoneHandler = (elt, kn) => {
  elt.addEventListener("mousedown", (ev) => {
    keys[kn] = true; // Mark the key as pressed
    if (elt.alsoClick) {
      elt.alsoClick();
    }
    ev.preventDefault();
  });
  elt.addEventListener("touchstart", (ev) => {
    keys[kn] = true; // Mark the key as pressed
    if (elt.alsoClick) {
      elt.alsoClick();
    }
    ev.preventDefault();
  });
  elt.addEventListener("mouseup", (ev) => {
    keys[kn] = false; // Mark the key as unpressed
    ev.preventDefault();
  });
  elt.addEventListener("touchend", (ev) => {
    keys[kn] = false; // Mark the key as unpressed
    ev.preventDefault();
  });
};

const bindGamepadHandlers = () => {
  window.addEventListener("gamepadconnected", function (e) {
    gamepadHandler(e, true);
    console.info(
      "Gamepad connected at index %d: %s. %d buttons, %d axes.",
      e.gamepad.index,
      e.gamepad.id,
      e.gamepad.buttons.length,
      e.gamepad.axes.length,
    );
  });
  window.addEventListener("gamepaddisconnected", function (e) {
    console.info(
      "Gamepad disconnected from index %d: %s",
      e.gamepad.index,
      e.gamepad.id,
    );
    gamepadHandler(e, false);
  });
};

const glassVisible = () =>
  Array.from(document.getElementsByClassName("glass")).filter(
    (g) => g.style.display === "block",
  ).length > 0;

const _skipModifiers = (event) => {
  if (event.code.startsWith("Meta")) {
    return true;
  }
  if (event.code.startsWith("Control")) {
    return true;
  }
  if (event.code.startsWith("Alt")) {
    return true;
  }
  if (event.code.startsWith("Shift")) {
    return true;
  }
  return false;
};

const bindKeyHandlers = () => {
  document.addEventListener("keydown", (event) => {
    if (_skipModifiers(event)) {
      return;
    }
    keys[event.code] = true; // Mark the key as pressed
    if (!glassVisible()) {
      event.preventDefault();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (_skipModifiers(event)) {
      return;
    }
    keys[event.code] = false; // Mark the key as released
    if (!glassVisible()) {
      event.preventDefault();
    }
  });
};

const logPads = () => {
  let gamepads = navigator.getGamepads();
  for (let i in controllers) {
    let controller = gamepads[i]; //controllers[i]
    if (controller.buttons) {
      for (let btn = 0; btn < controller.buttons.length; btn++) {
        let val = controller.buttons[btn];
        if (buttonPressed(val)) {
          console.info(btn);
        }
      }
    }
  }
};

const gamepadHandler = (event, connecting) => {
  let gamepad = event.gamepad;
  if (connecting) {
    controllers[gamepad.index] = gamepad;
    steadyStateAxes[gamepad.index] = [...gamepad.axes];
    console.info("Controller added to list:");
    console.info(controllers);
  } else {
    delete controllers[gamepad.index];
  }
};

const getDeviceInput = async (kind) => {
  let input = null;
  while (input === null) {
    input = _getDeviceInput(kind);
    if (input === null) {
      await new Promise((resolve) => setTimeout(resolve, 10)); // Wait 10ms
    }
  }
  return input;
};

const formatAxis = (axis, val) => `a:${axis},v:${Math.floor(val).toFixed(0)}`;
const formatButton = (b) => `b:${b}`;

const _getDeviceInput = (kind) => {
  let gamepads = navigator.getGamepads();
  if (kind == "keyboard") {
    for (let key in keys) {
      if (keys[key]) {
        return key;
      }
    }
    return null;
  }
  if (kind == "gamepad") {
    for (let i in controllers) {
      let controller = gamepads[i];
      if (controller.buttons) {
        for (let b = 0; b < controller.buttons.length; b++) {
          if (buttonPressed(controller.buttons[b])) {
            return formatButton(b);
          }
        }
      }
      if (controller.axes) {
        let axes = controller.axes;
        for (let axis = 0; axis < axes.length; axis++) {
          let val = controller.axes[axis];
          if (val != steadyStateAxes[i][axis]) {
            return formatAxis(axis, val);
          }
        }
      }
    }
    return null;
  }
};

const resetKeys = () => {
  // Reset the controller
  for (let key in keys) {
    keys[key] = false;
  }
};

const buttonPressed = (b) => {
  if (typeof b == "object") {
    return b.pressed; // binary
  }
  return b > 0.9; // analog value
};

const axisActive = (idx, axis, measured, triggerVal) => {
  if (
    measured != steadyStateAxes[idx][axis] &&
    Math.abs(measured - triggerVal) < 0.1
  ) {
    return true;
  }
};

const handleControls = (gameActions, keyMap, buttonMap, controllerIndex = null) => {
  // Debounce state for gamepad GAS only — prevents single-frame flicker on held buttons
  // without making momentary inputs (activate, pause, steer) sticky in menus.
  const btnDebounce = new Map();
  const DEBOUNCE_FRAMES = 2;

  function debouncedPressed(padIdx, btnIdx, rawPressed) {
    let padMap = btnDebounce.get(padIdx);
    if (!padMap) {
      padMap = new Map();
      btnDebounce.set(padIdx, padMap);
    }
    const seen = padMap.has(btnIdx);
    let count = padMap.get(btnIdx) ?? DEBOUNCE_FRAMES;
    if (rawPressed) {
      padMap.set(btnIdx, 0);
      return true;
    }
    // Until the button has been pressed at least once, treat untouched as unpressed
    if (!seen) {
      padMap.set(btnIdx, DEBOUNCE_FRAMES);
      return false;
    }
    count++;
    padMap.set(btnIdx, count);
    return count < DEBOUNCE_FRAMES;
  }

  return () => {
    const gamepads = navigator.getGamepads();

    // ALWAYS process keyboard — never gate it on gamepad presence
    for (let key in keyMap) {
      if (keys[key]) {
        gameActions[keyMap[key]]();
      }
    }

    function processPad(padIdx, controller) {
      if (!controller?.buttons) return;
      for (let button in buttonMap) {
        const action = buttonMap[button];
        if (button.startsWith("b")) {
          const rawPressed = buttonPressed(controller.buttons[button.slice(2)]);
          // Only debounce the held gas button; all other inputs are momentary
          const effectivePressed = action === 'gas'
            ? debouncedPressed(padIdx, button.slice(2), rawPressed)
            : rawPressed;
          if (effectivePressed) {
            gameActions[action]?.();
          }
        }
        if (button.startsWith("a")) {
          const parsed = button.split(",");
          const axis = parseInt(parsed[0].slice(2));
          const val = parseFloat(parsed[1].slice(2));
          if (axisActive(padIdx, axis, controller.axes[axis], val)) {
            gameActions[action]?.();
          }
        }
      }
    }

    if (controllerIndex !== null) {
      processPad(controllerIndex, gamepads[controllerIndex]);
      return;
    }

    for (let i = 0; i < gamepads.length; i++) {
      processPad(i, gamepads[i]);
    }
  };
};
