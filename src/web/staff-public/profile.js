(() => {
  const css = `
    .dn-profile-user{cursor:pointer;position:relative;border-radius:10px;padding:4px 6px;margin:-4px -6px;transition:background .2s}
    .dn-profile-user:hover{background:#12304a}
    .dn-profile-avatar{overflow:hidden;position:relative}
    .dn-profile-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .dn-profile-edit{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:#000d;backdrop-filter:blur(5px)}
    .dn-profile-edit.open{display:flex}
    .dn-profile-box{width:min(420px,100%);background:#11151b;border:1px solid #1769a8;border-radius:14px;padding:20px;box-shadow:0 15px 50px #000b}
    .dn-profile-box h2{margin:0}
    .dn-profile-preview{width:90px;height:90px;margin:18px auto;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#17202b;border:2px solid #1685ed;font-size:30px}
    .dn-profile-preview img{width:100%;height:100%;object-fit:cover}
    .dn-profile-buttons{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
    .dn-profile-note{font-size:12px;color:#888;margin-top:-5px}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  let userId = '';
  let avatar = '';
  let originalAvatar = '';

  const storageKey = () => userId ? `dream-network-avatar-${userId}` : '';

  function makeModal() {
    if (document.getElementById('dnProfileEdit')) return;
    const modal = document.createElement('div');
    modal.id = 'dnProfileEdit';
    modal.className = 'dn-profile-edit';
    modal.innerHTML = `
      <div class="dn-profile-box">
        <div class="title"><h2>🖼️ Profilbillede</h2><button type="button" class="gray" id="dnProfileClose">Luk</button></div>
        <div class="dn-profile-preview" id="dnProfilePreview">👤</div>
        <label>Vælg nyt profilbillede</label>
        <input id="dnProfileFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
        <div class="dn-profile-note">Billedet bliver gjort mindre og gemmes kun på din egen profil i denne browser.</div>
        <div class="dn-profile-buttons">
          <button type="button" class="gray" id="dnProfileReset">Nulstil</button>
          <button type="button" id="dnProfileSave">Gem billede</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.getElementById('dnProfileClose').onclick = closeModal;
    document.getElementById('dnProfileReset').onclick = () => { avatar = originalAvatar; updatePreview(); };
    document.getElementById('dnProfileFile').onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { alert('Billedet må højst være 8 MB.'); e.target.value=''; return; }
      const reader = new FileReader();
      reader.onload = () => resizeImage(reader.result);
      reader.readAsDataURL(file);
    };
    document.getElementById('dnProfileSave').onclick = saveAvatar;
  }

  function resizeImage(source) {
    const img = new Image();
    img.onload = () => {
      const max = 256;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      avatar = canvas.toDataURL('image/jpeg', .82);
      updatePreview();
    };
    img.onerror = () => alert('Kunne ikke læse billedet.');
    img.src = source;
  }

  function updatePreview() {
    const p = document.getElementById('dnProfilePreview');
    if (!p) return;
    p.innerHTML = avatar ? `<img src="${avatar}" alt="Profilbillede">` : '👤';
  }

  function applyAvatar() {
    const el = document.querySelector('.user .avatar');
    if (!el) return false;
    el.classList.add('dn-profile-avatar');
    el.innerHTML = avatar ? `<img src="${avatar}" alt="Profilbillede">` : '👤';
    return true;
  }

  function openModal() {
    makeModal();
    avatar = localStorage.getItem(storageKey()) || originalAvatar;
    document.getElementById('dnProfileFile').value = '';
    updatePreview();
    document.getElementById('dnProfileEdit').classList.add('open');
  }

  function closeModal() { document.getElementById('dnProfileEdit')?.classList.remove('open'); }

  function saveAvatar() {
    try {
      if (avatar) localStorage.setItem(storageKey(), avatar);
      else localStorage.removeItem(storageKey());
      applyAvatar();
      closeModal();
    } catch { alert('Kunne ikke gemme billedet. Prøv et mindre billede.'); }
  }

  function attach() {
    const user = document.querySelector('.user');
    const avatarEl = document.querySelector('.user .avatar');
    const nameEl = document.getElementById('me');
    if (!user || !avatarEl || !nameEl || nameEl.textContent === 'Staff') return false;
    if (user.dataset.profileEditorAttached === '1') return true;
    user.dataset.profileEditorAttached = '1';
    user.classList.add('dn-profile-user');
    user.title = 'Klik for at skifte profilbillede';
    user.addEventListener('click', e => { if (!e.target.closest('button')) openModal(); });
    applyAvatar();
    return true;
  }

  async function init() {
    try {
      const r = await fetch('/api/me');
      const m = await r.json();
      if (!m || !m.loggedIn || !m.user?.id) return;
      userId = String(m.user.id);
      if (m.user.avatar) originalAvatar = `https://cdn.discordapp.com/avatars/${encodeURIComponent(userId)}/${encodeURIComponent(m.user.avatar)}.png?size=128`;
      avatar = localStorage.getItem(storageKey()) || originalAvatar;
      let tries = 0;
      const timer = setInterval(() => { tries++; if (attach() || tries >= 20) clearInterval(timer); }, 250);
    } catch {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
