import { load, save } from './save';

/** The games played most recently, newest first, for the lobby's "jump back in" row. Saved. */
class Recent {
  ids = $state<string[]>(load<string[]>('recent', []).filter((id) => typeof id === 'string').slice(0, 6));

  visit(id: string) {
    this.ids = [id, ...this.ids.filter((x) => x !== id)].slice(0, 6);
    save('recent', this.ids);
  }
}

export const recent = new Recent();
