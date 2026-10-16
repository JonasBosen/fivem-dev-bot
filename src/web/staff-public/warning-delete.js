(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const api = async (url, options) => {
    const r = await fetch(url, options);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Fejl');
    return j;
  };

  async function unlock() {
    const status = await api('/api/staff-management/edit-status');
    if (status.unlocked) return true;
    const code = prompt('Indtast den 4-cifrede kode for at slette en advarsel:');
    if (code === null) return false;
    try {
      await api('/api/staff-management/unlock', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
      return true;
    } catch (e) { alert(e.message); return false; }
  }

  async function loadPersonWarnings(personId) {
    try { return await api('/api/people/' + encodeURIComponent(personId)); } catch { return null; }
  }

  async function deleteWarning(personId, warningId) {
    if (!(await unlock())) return;
    if (!confirm('Er du sikker på, at denne advarsel skal slettes permanent?')) return;
    try {
      await api('/api/people/' + encodeURIComponent(personId) + '/warnings/' + encodeURIComponent(warningId), {method:'DELETE'});
      if (typeof window.load === 'function') await window.load();
      if (typeof window.openP === 'function') window.openP(personId);
      else location.reload();
    } catch (e) { alert(e.message); }
  }

  function addWarningButtons() {
    const detail = document.getElementById('detail');
    if (!detail || !document.getElementById('modal')?.classList.contains('open')) return;
    const heading = [...detail.querySelectorAll('h3')].find(x => x.textContent.includes('Advarsler'));
    if (!heading) return;
    let node = heading.nextElementSibling;
    const rows = [];
    while (node && !(node.tagName === 'H3' && node.textContent.includes('Bans'))) { if (node.classList?.contains('item')) rows.push(node); node = node.nextElementSibling; }
    if (!rows.length || rows.every(row => row.querySelector('[data-delete-player-warning]'))) return;
    const personMatch = [...detail.querySelectorAll('.muted')].map(x => x.textContent).find(t => t.includes('Discord ID:'));
    if (!personMatch) return;
    const personId = window.__dnOpenPersonId;
    if (!personId) return;
    const cached = window.__dnOpenPerson;
    const personRequest = cached && String(cached.id) === String(personId)
      ? Promise.resolve(cached) : loadPersonWarnings(personId);
    personRequest.then(person => {
      if (!person || !person.warnings) return;
      if (window.__dnOpenPersonId !== personId) return;
      rows.forEach(row => {
        if (!row.isConnected) return;
        if (row.querySelector('[data-delete-player-warning]')) return;
        const reason = row.querySelector('b')?.textContent?.replace(/^#\d+\s*/, '').trim();
        const w = person.warnings.find(x => String(x.reason).trim() === String(reason).trim());
        if (!w) return;
        const btn = document.createElement('button');
        btn.className = 'gray';
        btn.style.cssText = 'margin-top:8px;border-color:#ff3344;color:#ff6670';
        btn.textContent = '🗑️ Slet advarsel';
        btn.dataset.deletePlayerWarning = w.id;
        btn.onclick = e => { e.stopPropagation(); deleteWarning(personId, w.id); };
        row.appendChild(btn);
      });
    });
  }

  function patchOpenP() {
    if (typeof window.openP !== 'function' || window.openP.__warningDeletePatched) return;
    const original = window.openP;
    const wrapped = async function(id) {
      window.__dnOpenPersonId = id;
      const result = await original.apply(this, arguments);
      setTimeout(addWarningButtons, 50);
      setTimeout(addWarningButtons, 250);
      return result;
    };
    wrapped.__warningDeletePatched = true;
    window.openP = wrapped;
  }

  const style = document.createElement('style');
  style.textContent = '[data-delete-player-warning]{background:#15181d!important;border-color:#ff3344!important;color:#ff6670!important}';
  document.head.appendChild(style);

  let tries = 0;
  const timer = setInterval(() => { patchOpenP(); tries++; if (tries > 40) clearInterval(timer); }, 250);
  new MutationObserver(() => { patchOpenP(); addWarningButtons(); }).observe(document.body, {childList:true,subtree:true});
})();
