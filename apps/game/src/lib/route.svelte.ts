/**
 * Hash routing: `#/` is the lobby, `#/<gameId>` is a table. The hash keeps
 * deep links and the browser's back button working on a static host.
 */
class Route {
  current = $state(read());

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => (this.current = read()));
    }
  }

  go(id: string | null) {
    const hash = id ? `#/${id}` : '#/';
    if (location.hash !== hash) location.hash = hash;
    this.current = id;
  }
}

function read(): string | null {
  if (typeof location === 'undefined') return null;
  const id = location.hash.replace(/^#\/?/, '').trim();
  return id === '' ? null : id;
}

export const route = new Route();
