/**
 * Doubles de test limités aux API utilisées par le module.
 * Ils permettent de tester la logique sous Node, sans prétendre reproduire
 * le moteur graphique, le réseau ou les règles de grille de Foundry.
 */
export function createHooks() {
  const events = new Map();
  let nextId = 1;

  const register = (name, callback, once) => {
    if (!events.has(name)) events.set(name, new Map());
    const id = nextId++;
    events.get(name).set(id, { callback, once });
    return id;
  };

  const dispatch = (name, args, stopOnFalse) => {
    for (const [id, listener] of [...(events.get(name) ?? [])]) {
      if (listener.once) events.get(name).delete(id);
      const result = listener.callback(...args);
      if (result === false && stopOnFalse) return false;
    }
    return true;
  };

  return {
    on: (name, callback) => register(name, callback, false),
    once: (name, callback) => register(name, callback, true),
    off: (name, id) => events.get(name)?.delete(id),
    call: (name, ...args) => dispatch(name, args, true),
    callAll: (name, ...args) => dispatch(name, args, false),
    count: name => events.get(name)?.size ?? 0
  };
}

/** Graphics mémorise les traits : les tests vérifient les couleurs et positions. */
class Graphics {
  children = [];
  strokes = [];
  destroyed = false;

  clear() { this.strokes = []; }
  addChild(child) { this.children.push(child); }
  removeChildren() { this.children = []; }
  lineStyle(width, color, alpha) { this.style = { width, color, alpha }; }
  moveTo(x, y) { this.start = { x, y }; }
  lineTo(x, y) { this.strokes.push({ ...this.style, from: this.start, to: { x, y } }); }
  beginFill() {}
  endFill() {}
  drawCircle() {}
  destroy() {
    this.destroyed = true;
    this.children.forEach(child => child.destroy());
    this.removeChildren();
  }
}

/** Installe un environnement neuf ; chaque fichier de test a son propre processus. */
export function installFoundryEnvironment({ settingsValues = new Map() } = {}) {
  const elements = new Map();
  const settings = new Map();
  const keybindings = new Map();
  globalThis.Hooks = createHooks();
  globalThis.CONST = { KEYBINDING_PRECEDENCE: { NORMAL: 0 } };
  globalThis.ui = { notifications: { info() {} } };
  globalThis.document = {
    getElementById: id => elements.get(id),
    createElement: () => ({
      style: {},
      attributes: {},
      classList: {
        values: new Set(),
        add(value) { this.values.add(value); },
        remove(value) { this.values.delete(value); },
        contains(value) { return this.values.has(value); }
      },
      setAttribute(name, value) { this.attributes[name] = value; }
    }),
    body: { appendChild: element => elements.set(element.id, element) }
  };
  globalThis.PIXI = {
    Point: class { constructor(x, y) { this.x = x; this.y = y; } },
    Graphics,
    TextStyle: class { constructor(style) { Object.assign(this, style); } },
    Text: class {
      anchor = { set() {} };
      position = { set() {} };
      constructor(text) { this.text = text; }
      destroy() { this.destroyed = true; }
    }
  };
  globalThis.game = {
    i18n: { lang: "fr" },
    user: { id: "user-1" },
    combat: null,
    settings: {
      settings,
      register: (moduleId, key, config) => settings.set(`${moduleId}.${key}`, config),
      get: (moduleId, key) => {
        const id = `${moduleId}.${key}`;
        if (!settings.has(id)) throw new Error(`Setting not registered: ${id}`);
        return settingsValues.has(id) ? settingsValues.get(id) : settings.get(id).default;
      },
      set: async (moduleId, key, value) => {
        const id = `${moduleId}.${key}`;
        if (!settings.has(id)) throw new Error(`Setting not registered: ${id}`);
        settingsValues.set(id, value);
        settings.get(id).onChange?.(value);
        return value;
      }
    },
    keybindings: {
      register: (moduleId, key, config) => keybindings.set(`${moduleId}.${key}`, config)
    }
  };
  globalThis.canvas = {
    ready: true,
    scene: { id: "scene-1", grid: { distance: 5, units: "m" } },
    grid: {
      size: 100,
      measurePath: ([a, b]) => ({ distance: Math.hypot(b.x - a.x, b.y - a.y) / 20 })
    },
    tokens: { controlled: [], placeables: [] },
    stage: {
      children: [],
      addChild(child) { this.children.push(child); },
      worldTransform: {
        apply: point => ({ x: point.x, y: point.y }),
        applyInverse: point => ({ x: point.x, y: point.y })
      }
    }
  };
  globalThis.requestAnimationFrame = callback => setImmediate(callback);
  return { elements, settings, settingsValues, keybindings };
}

/** Token dont les mises à jour passent par le hook annulable preUpdateToken. */
export function createToken({ id = "token-1", x = 0, y = 0, w = 100, h = 100 } = {}) {
  const token = {
    x, y, w, h,
    scene: canvas.scene,
    visible: true,
    isOwner: true,
    updates: [],
    get center() { return { x: this.x + this.w / 2, y: this.y + this.h / 2 }; },
    get bounds() {
      return {
        top: this.y,
        contains: (px, py) => px >= this.x && px < this.x + this.w && py >= this.y && py < this.y + this.h
      };
    }
  };
  token.position = { set: (px, py) => Object.assign(token, { x: px, y: py }) };
  token.document = {
    id, x, y,
    documentName: "Token",
    parent: canvas.scene,
    elevation: 0,
    hidden: false,
    async update(change, options = {}) {
      if (!Hooks.call("preUpdateToken", this, change, options, game.user.id)) return;
      token.updates.push({ change: { ...change }, options });
      Object.assign(this, change);
      token.position.set(this.x, this.y);
      Hooks.callAll("updateToken", this, change, options, game.user.id);
      return this;
    }
  };
  return token;
}
