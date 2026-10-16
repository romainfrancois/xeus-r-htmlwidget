import type { JSONValue } from '@lumino/coreutils';

type InputHandler = (
  name: string,
  value: unknown
) => void;

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

let inputHandler: InputHandler | undefined;

export function setInputHandler(handler: InputHandler): void {
    inputHandler = handler;
}

export function ensureShiny(): void {
    const shiny = {
        OutputBinding,
        outputBindings: new OutputBindings(),

        setInputValue(
            name: string,
            value: JSONValue,
            _options?: unknown
        ) {
            console.log('Shiny input:', name, value);
            inputHandler?.(name, value);
        },

        onInputChange(name: string, value: unknown) {
            console.log('Shiny input:', name, value);
            inputHandler?.(name, value);
        }, 

        addCustomMessageHandler(
            type: string,
            handler: (message: unknown) => void
          ) {
            customMessageHandlers.set(type, handler);
        },
        
        dispatchCustomMessage(type: string, message: unknown) {
            customMessageHandlers.get(type)?.(message);
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