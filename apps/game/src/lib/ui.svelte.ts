import { load, save } from './save';
import { isMuted, setMuted } from './sound';

export type PanelTab = 'pays' | 'stats' | 'table';
const TABS: readonly PanelTab[] = ['pays', 'stats', 'table'];

function savedTab(): PanelTab {
  const tab = load<PanelTab>('panelTab', 'pays');
  return TABS.includes(tab) ? tab : 'pays';
}

/**
 * Settings that belong to the whole casino rather than one table, and the
 * shell's own view state. Saved in the browser.
 */
class Ui {
  #muted = $state(isMuted());
  #tab = $state<PanelTab>(savedTab());
  /** The global settings dialog is open. */
  settingsOpen = $state(false);
  /** The admin ("pit boss") panel is switched on, and open. Switched on in secret; see SettingsDialog. */
  #admin = $state(load('admin', false));
  adminOpen = $state(false);

  get admin(): boolean {
    return this.#admin;
  }
  set admin(value: boolean) {
    this.#admin = value;
    if (!value) this.adminOpen = false;
    save('admin', value);
  }

  get muted(): boolean {
    return this.#muted;
  }
  set muted(value: boolean) {
    this.#muted = value;
    setMuted(value);
  }

  /** The sidebar tab every table opens on: the last one picked. */
  get tab(): PanelTab {
    return this.#tab;
  }
  set tab(value: PanelTab) {
    this.#tab = value;
    save('panelTab', value);
  }
}

export const ui = new Ui();
