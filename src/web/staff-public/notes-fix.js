(() => {
  function install() {
    if (typeof window.openP !== 'function' || typeof window.api !== 'function') return false;
    if (window.__dnNotesFixInstalled) return true;
    window.__dnNotesFixInstalled = true;

    const originalOpenP = window.openP;

    window.saveNotes = async function(id) {
      const field = document.querySelector('#detail textarea[data-person-notes]');
      if (!field) return;
      await window.api('/api/people/' + id, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({notes: field.value})
      });
      if (typeof window.load === 'function') await window.load();
      await originalOpenP(id);
    };

    window.openP = async function(id) {
      const person = await originalOpenP(id);
      const field = document.querySelector('#detail textarea#notes');
      if (field) {
        field.id = 'personNotes';
        field.setAttribute('data-person-notes', '1');
      }

      try {
        const p = person || await window.api('/api/people/' + id);
        const items = document.querySelectorAll('#detail .item');
        p.warnings.forEach((w, i) => {
          const item = items[i];
          if (!item || !w.notes) return;
          if (item.querySelector('[data-warning-note]')) return;
          const note = document.createElement('div');
          note.setAttribute('data-warning-note', '1');
          note.className = 'muted';
          note.style.marginTop = '6px';
          note.textContent = '📝 ' + w.notes;
          item.appendChild(note);
        });
      } catch (_) {}
      return person;
    };

    return true;
  }

  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 100);
  install();
})();
