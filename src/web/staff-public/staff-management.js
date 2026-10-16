(() => {
  const page = document.getElementById('staffManagement');
  if (!page) return;

  const STAFF = [
    ['928689821902331965', 'Ejere'],
    ['928690126211666000', 'Ledelse'],
    ['928690738429050880', 'Administrator [Manager]'],
    ['928691427129561158', 'Administrator'],
    ['928691575431774249', 'Supporter'],
    ['928691655102578769', 'Prøve Supporter']
  ];

  const esc = value => String(value == null ? '' : value).replace(/[&<>\"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#039;' }[ch]));
  const api = async (url, options) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Der opstod en fejl.');
    return data;
  };

  const style = document.createElement('style');
  style.textContent = '.staff-management-card{margin-top:18px}.staff-toolbar{display:flex;gap:10px;flex-wrap:wrap}.staff-toolbar input{flex:1;min-width:250px}.staff-groups{display:grid;grid-template-columns:repeat(3,minmax(250px,1fr));gap:14px;margin-top:16px}.staff-group{background:#0b0e13;border:1px solid #183f62;border-radius:12px;padding:12px}.staff-group h3{margin:4px 0 12px}.staff-member{display:flex;align-items:center;gap:10px;background:#11151b;border:1px solid #1b334a;border-radius:10px;padding:9px;margin:7px 0;cursor:pointer}.staff-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;background:#17202b}.staff-meta{min-width:0;flex:1}.staff-meta b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.staff-meta small{color:#8994a0}.staff-remove{padding:7px 9px;background:#350d13;border-color:#ff3344;color:#ff6670;cursor:pointer}.staff-empty{text-align:center;color:#777;padding:24px}.staff-profile{display:flex;gap:14px;align-items:center;background:#0b0e13;border:1px solid #1b334a;border-radius:12px;padding:14px}.staff-profile img{width:72px;height:72px;border-radius:50%;object-fit:cover}.staff-modal{position:fixed;inset:0;background:#000d;display:flex;align-items:center;justify-content:center;padding:20px;z-index:100}.staff-modal-box{width:min(760px,100%);max-height:90vh;overflow:auto;background:#11151b;border:1px solid #1769a8;border-radius:14px;padding:20px}.staff-results{margin-top:10px}.staff-warning{background:#19160a;border:1px solid #604c13;border-radius:9px;padding:10px;margin:8px 0}.staff-warning-actions{display:flex;gap:8px;margin-top:8px}@media(max-width:1000px){.staff-groups{grid-template-columns:1fr 1fr}}@media(max-width:650px){.staff-groups{grid-template-columns:1fr}}';
  document.head.appendChild(style);

  page.innerHTML = '<div class="title"><div><h1>👔 Staff Ansatte</h1><p class="muted">Ansæt, fyr og håndter staff direkte via Discord.</p></div><button id="hireStaff">➕ Ansæt staff</button></div>' +
    '<div class="card staff-management-card"><div class="staff-toolbar"><input id="staffSearch" placeholder="🔎 Søg navn, brugernavn eller Discord ID"><button class="gray" id="refreshStaff">↻ Opdater</button></div><div id="staffGroups" class="staff-groups"></div></div>' +
    '<div class="card staff-management-card"><h2>⚠️ Staff-advarsler</h2><div id="staffWarningBox" class="staff-empty">Vælg en staff for at se advarsler.</div></div>' +
    '<div class="card staff-management-card"><div class="title"><h2>📜 Staff historik</h2><button class="gray" id="refreshHistory">↻ Opdater</button></div><div id="staffHistory"></div></div>';

  let members = [];
  let unlocked = false;
  let selectedStaffId = null;

  function warningHtml(rows) {
    if (!rows || !rows.length) return '<div class="staff-empty">Ingen staff-advarsler.</div>';
    return rows.map(w => '<div class="staff-warning"><b>⚠️ ' + esc(w.reason) + '</b><div class="muted">' + new Date(w.created_at).toLocaleString('da-DK') + ' · af ' + esc(w.actor_name) + '</div>' + (w.notes ? '<p>' + esc(w.notes) + '</p>' : '') + '<div class="staff-warning-actions"><button class="gray" data-warning-delete="' + esc(w.id) + '">🗑️ Slet advarsel</button></div></div>').join('');
  }

  function bindWarningDeletes(container) {
    if (!container) return;
    container.querySelectorAll('[data-warning-delete]').forEach(button => {
      button.onclick = async event => {
        event.stopPropagation();
        if (!(await unlock())) return;
        if (!confirm('Er du sikker på, at denne staff-advarsel skal slettes?')) return;
        try {
          await api('/api/staff-management/warnings/' + encodeURIComponent(button.dataset.warningDelete), { method:'DELETE' });
          if (selectedStaffId) await loadWarnings(selectedStaffId);
        } catch (error) {
          alert(error.message);
        }
      };
    });
  }

  async function loadWarnings(id) {
    selectedStaffId = id;
    const box = document.getElementById('staffWarningBox');
    if (!box) return;
    const member = members.find(m => m.id === id);
    const name = member ? (member.name || member.username || member.id) : id;
    box.innerHTML = '<div class="staff-empty">⏳ Henter advarsler for <b>' + esc(name) + '</b>...</div>';
    try {
      const warnings = await api('/api/staff-management/warnings/' + encodeURIComponent(id));
      box.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><img class="staff-avatar" src="' + esc(member && member.avatar || '') + '"><div><b>' + esc(name) + '</b><div class="muted">' + esc(member && member.id || id) + '</div></div></div>' + warningHtml(warnings);
      bindWarningDeletes(box);
    } catch (error) {
      box.innerHTML = '<div class="staff-empty">' + esc(error.message) + '</div>';
    }
  }

  const groupsHtml = () => {
    const search = document.getElementById('staffSearch').value.trim().toLowerCase();
    const groups = STAFF.map(role => ({ id: role[0], name: role[1], members: [] }));
    members.filter(m => {
      const text = ((m.name || '') + ' ' + (m.username || '') + ' ' + (m.id || '')).toLowerCase();
      return !search || text.includes(search);
    }).forEach(member => {
      const roles = member.roles || [];
      for (const role of STAFF) {
        if (roles.some(r => String(r.id || r.role_id) === role[0])) {
          const group = groups.find(g => g.id === role[0]);
          if (group) group.members.push(member);
          break;
        }
      }
    });
    return groups.map(group => {
      const body = group.members.length ? group.members.map(member => {
        const name = member.name || member.username || member.id;
        return '<div class="staff-member" data-id="' + esc(member.id) + '"><img class="staff-avatar" src="' + esc(member.avatar || '') + '"><div class="staff-meta"><b>' + esc(name) + '</b><small>@' + esc(member.username || '') + ' · ' + esc(member.id) + '</small></div><button class="staff-remove" data-remove="' + esc(member.id) + '">✕</button></div>';
      }).join('') : '<div class="staff-empty">Ingen ansatte</div>';
      return '<div class="staff-group"><h3>' + esc(group.name) + ' <span class="badge">' + group.members.length + '</span></h3>' + body + '</div>';
    }).join('');
  };

  function render() {
    document.getElementById('staffGroups').innerHTML = groupsHtml();
    document.querySelectorAll('#staffGroups .staff-member').forEach(row => {
      row.onclick = event => {
        if (event.target.closest('[data-remove]')) return;
        loadWarnings(row.dataset.id);
        openProfile(row.dataset.id);
      };
    });
    document.querySelectorAll('[data-remove]').forEach(button => {
      button.onclick = async event => {
        event.stopPropagation();
        const member = members.find(m => m.id === button.dataset.remove);
        if (!member || !(await unlock())) return;
        const reason = prompt('Hvorfor fjernes ' + (member.name || member.username) + ' fra staff?');
        if (!reason || !reason.trim()) return;
        try {
          const result = await api('/api/staff-management/fire', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({discordId:member.id, reason:reason.trim()}) });
          alert(result.message || 'Staff fjernet.');
          if (selectedStaffId === member.id) {
            selectedStaffId = null;
            document.getElementById('staffWarningBox').innerHTML = '<div class="staff-empty">Vælg en staff for at se advarsler.</div>';
          }
          await load(); await loadHistory();
        } catch (error) { alert(error.message); }
      };
    });
  }

  async function load() {
    try {
      const query = document.getElementById('staffSearch').value.trim();
      const result = await api('/api/staff-management/members' + (query ? '?search=' + encodeURIComponent(query) : ''));
      members = result.members || [];
      render();
      if (selectedStaffId && members.some(m => m.id === selectedStaffId)) await loadWarnings(selectedStaffId);
    } catch (error) {
      document.getElementById('staffGroups').innerHTML = '<div class="staff-empty">' + esc(error.message) + '</div>';
    }
  }

  async function unlock() {
    try {
      const status = await api('/api/staff-management/edit-status');
      if (status.unlocked !== true) throw Error('Din staff-adgang kunne ikke bekræftes. Genindlæs siden.');
      return true;
    } catch (error) { alert(error.message); return false; }
  }

  function openModal(html) {
    const modal = document.createElement('div');
    modal.className = 'staff-modal';
    modal.innerHTML = '<div class="staff-modal-box"><div class="title"><h2>Staff administration</h2><button class="gray" id="closeStaffModal">Luk</button></div>' + html + '</div>';
    document.body.appendChild(modal);
    modal.querySelector('#closeStaffModal').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    return modal;
  }

  async function openProfile(id) {
    const member = members.find(m => m.id === id);
    if (!member) return;
    const name = member.name || member.username || member.id;
    let warnings = [];
    try { warnings = await api('/api/staff-management/warnings/' + encodeURIComponent(id)); } catch (_) {}
    const modal = openModal('<div class="staff-profile"><img src="' + esc(member.avatar || '') + '"><div><h2>' + esc(name) + '</h2><p class="muted">@' + esc(member.username || '') + ' · ' + esc(member.id) + '</p></div></div><p><button class="banBtn" id="fireProfile">🔥 Fjern fra staff</button> <button class="warnBtn" id="warnProfile">⚠️ Giv staff-advarsel</button></p><hr><h3>⚠️ Advarsler</h3><div id="profileWarnings">' + warningHtml(warnings) + '</div>');
    bindWarningDeletes(modal.querySelector('#profileWarnings'));
    modal.querySelector('#fireProfile').onclick = async () => {
      if (!(await unlock())) return;
      const reason = prompt('Hvorfor bliver ' + name + ' fjernet fra staff?');
      if (!reason || !reason.trim()) return;
      try { const result = await api('/api/staff-management/fire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({discordId:id,reason:reason.trim()})}); alert(result.message || 'Staff fjernet.'); modal.remove(); await load(); await loadHistory(); } catch(error){alert(error.message);}
    };
    modal.querySelector('#warnProfile').onclick = async () => {
      if (!(await unlock())) return;
      const reason = prompt('Årsag til staff-advarsel:');
      if (!reason || !reason.trim()) return;
      const notes = prompt('Kommentar/noter (valgfrit):') || '';
      try { await api('/api/staff-management/warnings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({discordId:id,discordName:name,reason:reason.trim(),notes})}); alert('Staff-advarsel gemt.'); const result=await api('/api/staff-management/warnings/'+encodeURIComponent(id)); modal.querySelector('#profileWarnings').innerHTML=warningHtml(result); bindWarningDeletes(modal.querySelector('#profileWarnings')); await loadWarnings(id); await loadHistory(); } catch(error){alert(error.message);}
    };
  }

  async function loadHistory() {
    try {
      const rows = await api('/api/staff-management/history');
      document.getElementById('staffHistory').innerHTML = rows.length ? rows.map(row => '<div class="item"><b>' + esc(row.action) + '</b> · ' + esc(row.discord_name) + (row.role_name ? ' · ' + esc(row.role_name) : '') + '<div>' + esc(row.reason || 'Ingen kommentar') + '</div><small class="muted">' + new Date(row.created_at).toLocaleString('da-DK') + ' · ' + esc(row.actor_name) + '</small></div>').join('') : '<div class="staff-empty">Ingen staff-historik endnu.</div>';
    } catch (error) { document.getElementById('staffHistory').innerHTML = '<div class="staff-empty">' + esc(error.message) + '</div>'; }
  }

  async function hire() {
    if (!(await unlock())) return;
    const modal = openModal('<p class="muted">Søg efter en person på Discord-serveren.</p><input id="hireSearch" placeholder="Søg navn, brugernavn eller Discord ID"><div id="hireResults" class="staff-results"></div><div id="hireForm"></div>');
    const input = modal.querySelector('#hireSearch');
    let timer;
    input.oninput = () => { clearTimeout(timer); timer=setTimeout(async()=>{try{const result=await api('/api/staff-management/search-members?search='+encodeURIComponent(input.value.trim()));const rows=result.members||[];modal.querySelector('#hireResults').innerHTML=rows.length?rows.map(p=>'<div class="staff-member" data-person="'+esc(p.id)+'"><img class="staff-avatar" src="'+esc(p.avatar||'')+'"><div class="staff-meta"><b>'+esc(p.name||p.username||p.id)+'</b><small>@'+esc(p.username||'')+' · '+esc(p.id)+'</small></div></div>').join(''):'<div class="staff-empty">Ingen medlemmer fundet.</div>';modal.querySelectorAll('[data-person]').forEach(el=>el.onclick=()=>showHireForm(rows.find(p=>p.id===el.dataset.person),modal));}catch(error){modal.querySelector('#hireResults').innerHTML='<div class="staff-empty">'+esc(error.message)+'</div>'; }},250); };
  }

  function showHireForm(person, modal) {
    if (!person) return;
    modal.querySelector('#hireForm').innerHTML='<hr><div class="staff-profile"><img src="'+esc(person.avatar||'')+'"><div><h2>'+esc(person.name||person.username||person.id)+'</h2><p class="muted">@'+esc(person.username||'')+' · '+esc(person.id)+'</p></div></div><h3>Vælg rolle</h3><select id="hireRole" style="width:100%;padding:12px;background:#080a0e;color:#fff;border:1px solid #183f62;border-radius:8px"><option value="">Vælg staff-rolle...</option>'+STAFF.map(r=>'<option value="'+r[0]+'">'+esc(r[1])+'</option>').join('')+'</select><textarea id="hireReason" placeholder="Kommentar (valgfrit)"></textarea><button id="hireSubmit">Ansæt staff</button>';
    modal.querySelector('#hireSubmit').onclick=async()=>{const role=modal.querySelector('#hireRole').value;if(!role)return alert('Vælg en staff-rolle.');try{const result=await api('/api/staff-management/hire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({discordId:person.id,roleId:role,reason:modal.querySelector('#hireReason').value})});alert(result.message||'Staff ansat.');modal.remove();await load();await loadHistory();}catch(error){alert(error.message);}};
  }

  document.getElementById('staffSearch').oninput = () => render();
  document.getElementById('refreshStaff').onclick = load;
  document.getElementById('refreshHistory').onclick = loadHistory;
  document.getElementById('hireStaff').onclick = hire;

  load();
  loadHistory();
})();
