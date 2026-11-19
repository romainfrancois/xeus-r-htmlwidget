'use strict';
// Hera serves this script directly and Webpack includes it for inline frames.
// Keep it a standalone classic script.
(() => {
  const bootstrap = document.currentScript;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const parentOrigin =
    bootstrap.dataset.parentOrigin ?? params.get('parentOrigin');
  const token = bootstrap.dataset.token ?? params.get('token');
  if (
    !parentOrigin ||
    !token ||
    window.parent === window ||
    window.origin === parentOrigin
  ) {
    return;
  }
  // A public site can embed a loopback URL. Accept a port handshake
  // only with a loopback parent when loaded from the Hera page.
  if (
    bootstrap.hasAttribute('data-loopback-parent-only') &&
    !/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/.test(
      parentOrigin
    )
  ) {
    return;
  }
  const widgetName = new URLSearchParams(window.location.search).get('widget');
  if (widgetName) {
    document.title = widgetName;
  }
  const root = document.getElementById('widget-root');
  const { port1, port2 } = new MessageChannel();
  /** @param {import('../../../src/frameprotocol').FrameMessage} message */
  const post = message => port1.postMessage(message);
  class OutputBinding {
    find(_scope) {
      return [];
    }
  }
  class InputBinding {
    find(_scope) {
      return [];
    }
    getId(element) {
      return element.id;
    }
    getValue(_element) {
      return null;
    }
    subscribe(_element, _callback) {}
    unsubscribe(_element) {}
  }
  let sendInput = () => {};
  const customHandlers = new Map();
  const outputBindings = [];
  const inputBindings = [];
  const globals = window;
  globals.Shiny = {
    InputBinding,
    inputBindings: {
      register(binding, name, priority = 0) {
        inputBindings.push({ binding, name, priority });
      },
      getBindings: () => inputBindings
    },
    OutputBinding,
    outputBindings: {
      register(binding, name) {
        outputBindings.push({ binding, name });
      },
      getBindings: () => outputBindings
    },
    setInputValue: (name, value) => sendInput(name, value),
    onInputChange: (name, value) => sendInput(name, value),
    addCustomMessageHandler(type, handler) {
      customHandlers.set(type, handler);
    },
    // The frame loads dependency scripts and styles before rendering.
    renderDependencies(_dependencies) {}
  };
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Could not load script ${url}`));
      document.head.appendChild(script);
    });
  }
  function loadStylesheet(url) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () =>
        reject(new Error(`Could not load stylesheet ${url}`));
      document.head.appendChild(link);
    });
  }
  /** @param {import('../../../src/frameprotocol').FrameInit} init */
  async function initialize(init) {
    const runtime = URL.createObjectURL(
      new Blob(
        [Uint8Array.from(atob(init.runtime), char => char.charCodeAt(0))],
        {
          type: 'text/javascript'
        }
      )
    );
    try {
      await loadScript(runtime);
    } finally {
      URL.revokeObjectURL(runtime);
    }
    for (const { stylesheets, scripts } of init.dependencies) {
      await Promise.all(stylesheets.map(loadStylesheet));
      for (const url of scripts) {
        await loadScript(url);
      }
    }
    root.innerHTML = init.markup;
    const element = root.querySelector('.html-widget');
    const data = Array.from(
      root.querySelectorAll('script[type="application/json"][data-for]')
    ).find(script => script.getAttribute('data-for') === element?.id);
    if (!element?.id || !data?.textContent) {
      throw new Error('Widget markup is missing an element or render data');
    }
    element.classList.add('html-widget-output', 'shiny-bound-output');
    const scope = globals.jQuery?.(element.parentElement);
    const binding = outputBindings.find(({ binding, name }) =>
      scope
        ? Array.from(binding.find(scope)).includes(element)
        : element.classList.contains(name)
    )?.binding;
    if (!binding) {
      throw new Error(`No output binding for ${element.id}`);
    }
    // Render hooks can emit input before R knows the widget's element ID.
    const pendingInputs = [];
    let ready = false;
    sendInput = (name, value) => {
      if (typeof name !== 'string' || !name.startsWith(`${element.id}_`)) {
        return;
      }
      const json = JSON.stringify(value);
      if (json === undefined) {
        return;
      }
      const message = { kind: 'input', name, value: json };
      if (ready) {
        post(message);
      } else {
        pendingInputs.push(message);
      }
    };
    binding.renderValue(element, { ...JSON.parse(data.textContent), deps: [] });
    post({ kind: 'ready', id: element.id });
    ready = true;
    pendingInputs.forEach(post);
    let previousWidth = 0;
    let previousHeight = 0;
    const observer = new ResizeObserver(() => {
      if (!root.offsetWidth) {
        return;
      }
      const { width, height } = element.getBoundingClientRect();
      if (
        width > 0 &&
        height > 0 &&
        (width !== previousWidth || height !== previousHeight)
      ) {
        previousWidth = width;
        previousHeight = height;
        binding.resize?.(element, width, height);
      }
      post({ kind: 'resize', height: Math.max(1, root.scrollHeight) });
    });
    observer.observe(root);
    observer.observe(element);
  }
  port1.onmessage = (
    /** @type {MessageEvent<import('../../../src/frameprotocol').RendererMessage>} */ {
      data
    }
  ) => {
    if (data.kind === 'init') {
      void initialize(data).catch(error => {
        post({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error)
        });
      });
    } else {
      const handler = customHandlers.get(data.type);
      if (handler) {
        handler(data.message);
      } else {
        console.warn(`No Shiny custom message handler for "${data.type}"`);
      }
    }
  };
  window.parent.postMessage(
    { kind: 'htmlwidget:connect', token },
    parentOrigin,
    [port2]
  );
})();
