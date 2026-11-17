import type { JSONValue } from '@lumino/coreutils';

type InputHandler = (name: string, value: unknown) => void;

const inputHandlers = new Map<string, InputHandler>();

export function setInputHandler(
  widgetId: string,
  handler: InputHandler
): void {
  inputHandlers.set(widgetId, handler);
}

export function removeInputHandler(widgetId: string): void {
  inputHandlers.delete(widgetId);
}

function dispatchInput(name: string, value: unknown): void {
  // Match the longest registered widget ID.
  const widgetId = [...inputHandlers.keys()]
    .filter(id => name.startsWith(`${id}_`))
    .sort((a, b) => b.length - a.length)[0];

  if (widgetId) {
    inputHandlers.get(widgetId)?.(name, value);
  }
}

const customMessageHandlers = new Map<
  string,
  (message: unknown) => void
>();

class OutputBinding {
    find(_scope: HTMLElement): HTMLElement[] {
        return [];
    }
}
class OutputBindings {
    private bindings: Array<{
        binding: OutputBinding;
        name: string;
    }> = [];

    register(binding: OutputBinding, name: string): void {
        this.bindings.push({ binding, name });
    }

    getBindings() {
        return this.bindings;
    }
}

interface OutputBinding {
    find(scope: HTMLElement): HTMLElement[];
    renderValue(el: HTMLElement, data: any): void;
}

class InputBinding {
  find(_scope: HTMLElement): HTMLElement[] {
      return [];
  }

  getId(el: HTMLElement): string {
      return el.id;
  }

  getValue(_el: HTMLElement): unknown {
      return null;
  }

  subscribe(
      _el: HTMLElement,
      _callback: (allowDeferred?: boolean) => void
  ): void {}

  unsubscribe(_el: HTMLElement): void {}
}

class InputBindings {
  private bindings: Array<{
      binding: InputBinding;
      name: string;
      priority: number;
  }> = [];

  register(
      binding: InputBinding,
      name: string,
      priority = 0
  ): void {
      this.bindings.push({ binding, name, priority });
  }

  getBindings() {
      return this.bindings;
  }
}

export function ensureShiny(): void {
    if ((window as any).Shiny) {
        return;
    }

    const shiny = {
      InputBinding,
      inputBindings: new InputBindings(),

      OutputBinding,
      outputBindings: new OutputBindings(),

        setInputValue(name: string, value: JSONValue, _options?: unknown) {
            console.log('Shiny input:', name, value);
            dispatchInput(name, value);
        },
          
        onInputChange(name: string, value: unknown) {
            console.log('Shiny input:', name, value);
            dispatchInput(name, value);
        },

        addCustomMessageHandler(
            type: string,
            handler: (message: unknown) => void
          ) {
            customMessageHandlers.set(type, handler);
        },
        
        renderDependencies(_deps: unknown) {
            // Dependencies are already loaded by loadDependencies().
        },
    };

    (window as any).Shiny = shiny;
}

export function getOutputBinding(name: string) {
    return (window as any).Shiny.outputBindings
        .getBindings()
        .find((entry: any) => entry.name === name)?.binding;
}

export function getOutputBindingForElement(
  el: HTMLElement
): OutputBinding | undefined {
  const bindings: Array<{
    binding: OutputBinding;
    name: string;
    priority: number;
  }> = (window as any).Shiny.outputBindings.getBindings();

  return bindings.find(({ binding }) => {
    const parent = el.parentElement;
    if (!parent) return false;

    const $ = (window as any).jQuery;

    if (!$) {
      console.warn('jQuery is not available');
      return false;
    }

    const matches = binding.find($(parent));

    return Array.from(matches).includes(el);
  })?.binding;
}

export function dispatchCustomMessage(
    type: string,
    message: unknown
  ): void {
    const handler = customMessageHandlers.get(type);
  
    if (!handler) {
      console.warn(`No Shiny custom message handler for "${type}"`);
      return;
    }
  
    handler(message);
} 

(window as any).__customMessageHandlers = customMessageHandlers;