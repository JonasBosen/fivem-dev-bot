(() => {
  const style = document.createElement('style');
  style.id = 'dnAvatarStyles';
  style.textContent = `
    .dn-person-avatar{width:48px;height:48px;flex:0 0 48px;border-radius:50%;object-fit:cover;border:2px solid var(--dn-accent,#00ff40);box-shadow:0 0 14px var(--dn-accent,#00ff40)55;background:#17202b}
    .dn-person-head{display:flex;align-items:center;gap:12px}
    .dn-profile-avatar-large{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid var(--dn-accent,#00ff40);box-shadow:0 0 24px var(--dn-accent,#00ff40)66;background:#17202b;display:block;margin:0 auto 14px}
    .dn-profile-avatar-fallback{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;margin:0 auto 14px;background:#17202b;border:3px solid var(--dn-accent,#00ff40);font-size:38px}
  `;
  document.head.appendChild(style);

  let people = [];
  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  const avatar = p => p?.discord_avatar || '';
  const img = src => src ? `<img class="dn-person-avatar" src="${esc(src)}" alt="Discord profilbillede" loading="lazy">` : '<div class="dn-person-avatar" style="display:grid;place-items:center;font-size:22px">👤</div>';

  async function refreshPeople() {
    try {
      const r = await fetch('/api/people');
      if (r.ok) people = await r.json();
      patchPlayerCards();
    } catch {}
  }

  function patchPlayerCards() {
    const list = document.getElementById('playerList');
    if (!list) return;
    list.querySelectorAll('.person').forEach(card => {
      if (card.dataset.avatarDone === '1') return;
      const button = card.querySelector('button[onclick^="openP("]');
      if (!button) return;
      const m = button.getAttribute('onclick').match(/openP\((\d+)\)/);
      if (!m) return;
      const p = people.find(x => String(x.id) === m[1]);
      if (!p) return;
      const title = card.querySelector('.title');
      if (!title) return;
      if (title.querySelector('.dn-person-avatar')) { card.dataset.avatarDone = '1'; return; }
      title.insertAdjacentHTML('afterbegin', img(avatar(p)));
      card.dataset.avatarDone = '1';
    });
  }

  function install() {
    if (typeof window.openP === 'function' && !window.openP.__dnAvatar) {
      const originalOpen = window.openP;
      const wrappedOpen = async function(id) {
        await originalOpen.apply(this, arguments);
        try {
          const r = await fetch('/api/people/' + encodeURIComponent(id));
          const p = r.ok ? await r.json() : null;
          const detail = document.getElementById('detail');
          if (!detail || !p) return;

          // Never add a second profile image. Other panel scripts may wrap
          // openP as well, so the DOM itself is the source of truth here.
          if (detail.querySelector('.dn-profile-avatar-large, .dn-profile-avatar-fallback')) return;

          const src = avatar(p);
          const block = src ? `<img class="dn-profile-avatar-large" src="${esc(src)}" alt="Discord profilbillede">` : '<div class="dn-profile-avatar-fallback">👤</div>';
          detail.insertAdjacentHTML('afterbegin', block);
        } catch {}
      };
      wrappedOpen.__dnAvatar = true;
      window.openP = wrappedOpen;
    }
    patchPlayerCards();
  }

  const observer = new MutationObserver(() => { install(); patchPlayerCards(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(install, 300);
  setTimeout(() => clearInterval(timer), 20000);
  refreshPeople();
})();
