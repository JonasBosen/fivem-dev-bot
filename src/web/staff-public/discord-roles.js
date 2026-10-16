(() => {
  const style = document.createElement('style');
  style.id = 'dnDiscordRoleStyles';
  style.textContent = `
    .dn-discord-roles{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .dn-discord-role{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dn-accent,#00ff40) 55%,#303640);background:#0b1016;color:#f1f3f5;font-size:11px;font-weight:700;line-height:1.1;box-shadow:0 0 8px #0004}
    .dn-discord-role-dot{width:7px;height:7px;border-radius:50%;background:var(--role-color,var(--dn-accent,#00ff40));box-shadow:0 0 7px var(--role-color,var(--dn-accent,#00ff40));flex:0 0 7px}
    .dn-discord-role-title{margin-top:14px;font-weight:800;color:var(--dn-accent,#00ff40);font-size:14px}
    .dn-discord-role-empty{font-size:12px;opacity:.7;margin-top:6px}
    .dn-role-manager{margin-top:10px;padding:10px;border:1px solid color-mix(in srgb,var(--dn-accent,#00ff40) 35%,#303640);border-radius:10px;background:#080d12}
    .dn-role-manager-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .dn-role-manager select{flex:1;min-width:220px;background:#0b1016;color:#fff;border:1px solid color-mix(in srgb,var(--dn-accent,#00ff40) 45%,#303640);border-radius:8px;padding:8px}
    .dn-role-add{background:linear-gradient(180deg,#16d63a,#079b20)!important;border-color:#35f65a!important;color:#fff!important}
    .dn-role-remove{background:linear-gradient(180deg,#ff3b4a,#c90012)!important;border-color:#ff5965!important;color:#fff!important}
    .dn-role-status{font-size:11px;margin-top:7px;opacity:.8;min-height:14px}
    .dn-role-manager-label{font-size:11px;font-weight:800;color:var(--dn-accent,#00ff40);margin-bottom:7px}
  `;
  document.head.appendChild(style);

  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  const rolesHtml = roles => {
    if (!roles || !roles.length) return '<div class="dn-discord-role-empty">Ingen Discord-roller.</div>';
    return `<div class="dn-discord-roles">${roles.map(r => `<span class="dn-discord-role" style="--role-color:${esc(r.color || '#99aab5')}"><span class="dn-discord-role-dot"></span>${esc(r.name)}</span>`).join('')}</div>`;
  };

  async function getRoles(id) {
    try {
      const r = await fetch('/api/people/' + encodeURIComponent(id) + '/discord-roles');
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data.roles) ? data.roles : [];
    } catch { return []; }
  }

  async function getAssignableRoles() {
    try {
      const r = await fetch('/api/discord-roles/assignable');
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data.roles) ? data.roles : [];
    } catch { return []; }
  }

  async function changeRole(personId, roleId, action, statusEl) {
    if (!roleId) {
      if (statusEl) statusEl.textContent = 'Vælg en rolle først.';
      return;
    }
    if (statusEl) statusEl.textContent = action === 'add' ? 'Tilføjer rolle…' : 'Fjerner rolle…';
    try {
      const r = await fetch('/api/people/' + encodeURIComponent(personId) + '/discord-roles', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({roleId, action})
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Kunne ikke ændre rollen.');
      if (statusEl) statusEl.textContent = data.message || 'Rollen blev ændret.';
      await refreshProfileRoles(personId);
    } catch (e) {
      if (statusEl) statusEl.textContent = e.message || 'Kunne ikke ændre rollen.';
    }
  }

  function cardId(card) {
    const button = card.querySelector('button[onclick^="openP("]');
    if (!button) return null;
    const m = button.getAttribute('onclick').match(/openP\((\d+)\)/);
    return m ? m[1] : null;
  }

  async function patchCards() {
    const list = document.getElementById('playerList');
    if (!list) return;
    for (const card of list.querySelectorAll('.person')) {
      if (card.dataset.rolesDone === '1') continue;
      const id = cardId(card);
      const title = card.querySelector('.title');
      if (!id || !title) continue;
      card.dataset.rolesDone = '1';
      const roles = await getRoles(id);
      if (title.querySelector('.dn-discord-roles')) continue;
      title.insertAdjacentHTML('afterend', `<div class="dn-discord-role-wrap">${rolesHtml(roles)}</div>`);
    }
  }

  async function buildManager(personId) {
    const manager = document.createElement('div');
    manager.className = 'dn-role-manager';
    manager.setAttribute('data-dn-role-manager','1');
    manager.innerHTML = `<div class="dn-role-manager-label">⚙️ Administrer Discord-roller</div><div class="dn-role-manager-row"><select><option value="">Vælg rolle…</option></select><button type="button" class="dn-role-add">+ Tilføj</button><button type="button" class="dn-role-remove">− Fjern</button></div><div class="dn-role-status"></div>`;
    const select = manager.querySelector('select');
    const status = manager.querySelector('.dn-role-status');

    // Hent både roller botten må administrere og roller personen allerede har.
    // Det gør det muligt at fjerne en eksisterende rolle direkte fra panelet.
    const [assignable, current] = await Promise.all([getAssignableRoles(), getRoles(personId)]);
    const merged = new Map();
    [...assignable, ...current].forEach(r => {
      if (r && r.id) merged.set(String(r.id), r);
    });
    [...merged.values()].sort((a,b) => (b.position||0) - (a.position||0)).forEach(r => {
      const option = document.createElement('option');
      option.value = r.id;
      option.textContent = current.some(c => String(c.id) === String(r.id)) ? `${r.name} ✓` : r.name;
      select.appendChild(option);
    });

    manager.querySelector('.dn-role-add').addEventListener('click', () => changeRole(personId, select.value, 'add', status));
    manager.querySelector('.dn-role-remove').addEventListener('click', () => changeRole(personId, select.value, 'remove', status));
    if (!merged.size) status.textContent = 'Ingen roller kan administreres af botten.';
    return manager;
  }

  async function refreshProfileRoles(personId) {
    const detail = document.getElementById('detail');
    if (!detail) return;
    const roles = await getRoles(personId);
    const block = detail.querySelector('[data-dn-discord-roles]');
    if (!block) return;
    const title = block.querySelector('.dn-discord-role-title');
    block.innerHTML = '';
    if (title) block.appendChild(title);
    block.insertAdjacentHTML('beforeend', rolesHtml(roles));
    // Behold rolle-manageren efter en ændring og opdatér den.
    const oldManager = detail.querySelector('[data-dn-role-manager]');
    if (oldManager) {
      oldManager.remove();
      const manager = await buildManager(personId);
      const roleBlock = detail.querySelector('[data-dn-discord-roles]');
      if (roleBlock) roleBlock.appendChild(manager);
    }
  }

  function installProfileHook() {
    if (typeof window.openP !== 'function' || window.openP.__dnRoles) return;
    const original = window.openP;
    const wrapped = async function(id) {
      await original.apply(this, arguments);
      const detail = document.getElementById('detail');
      if (!detail) return;
      let block = detail.querySelector('[data-dn-discord-roles]');
      if (!block) {
        const roles = await getRoles(id);
        block = document.createElement('div');
        block.setAttribute('data-dn-discord-roles','1');
        block.innerHTML = `<div class="dn-discord-role-title">🎭 Discord roller</div>${rolesHtml(roles)}`;
        const avatar = detail.querySelector('.dn-profile-avatar-large,.dn-profile-avatar-fallback');
        if (avatar && avatar.parentElement) avatar.parentElement.insertBefore(block, avatar.nextSibling);
        else detail.insertBefore(block, detail.firstChild);
      }
      if (!detail.querySelector('[data-dn-role-manager]')) {
        const manager = await buildManager(id);
        const roleBlock = detail.querySelector('[data-dn-discord-roles]');
        if (roleBlock) roleBlock.appendChild(manager);
      }
    };
    wrapped.__dnRoles = true;
    window.openP = wrapped;
  }

  const observer = new MutationObserver(() => { installProfileHook(); patchCards(); });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const timer = setInterval(() => { installProfileHook(); patchCards(); },500);
  setTimeout(() => clearInterval(timer),20000);
  installProfileHook();
  patchCards();
})();
