(() => {
  const KEY = 'dreamNetworkThemeV2';
  const defaults = { accent: '#ff1744', background: '#07080c' };
  const backgrounds = { '#07080c':'Carbon', '#0d1117':'Midnight', '#14171d':'Graphite' };
  let theme = { ...defaults };
  try { theme = { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch {}
  const style = document.createElement('style');
  style.id = 'dnThemeOverrides';
  document.head.appendChild(style);
  const validColor = v => /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : null;
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');

  function apply() {
    theme.accent = validColor(theme.accent) || defaults.accent;
    theme.background = backgrounds[theme.background] ? theme.background : defaults.background;
    document.documentElement.style.setProperty('--dn-accent', theme.accent);
    document.documentElement.style.setProperty('--dn-background', theme.background);
    style.textContent = `
      :root{--dn-accent:${theme.accent};--dn-background:${theme.background};--dn-accent-soft:${theme.accent}20;--dn-accent-glow:${theme.accent}55;--dn-red2:#ff4d67;--dn-panel:#0d1016;--dn-panel2:#11151c}
      *{scrollbar-color:${theme.accent}44 #080a0e;scrollbar-width:thin}
      body{background:radial-gradient(circle at 75% 0%,${theme.accent}12,transparent 30%),var(--dn-background)!important;color:#f5f5f7!important}
      .main{background:radial-gradient(circle at 85% 5%,var(--dn-accent-soft),transparent 25%),var(--dn-background)!important}
      header{background:#080a0eeF!important;border-bottom-color:${theme.accent}88!important;box-shadow:0 1px 25px #0008}
      .side{background:linear-gradient(180deg,#080b11,#050609)!important;border-right-color:${theme.accent}88!important;box-shadow:8px 0 35px #0006}
      .logo{border-bottom-color:${theme.accent}88!important}
      .logo span,.crown,.herotext small,.herotext p,.sidebottom,.user small{color:var(--dn-accent)!important}
      .crown{text-shadow:0 0 20px var(--dn-accent)!important}
      .nav a{color:#aeb4be!important;transition:.18s ease}
      .nav a:hover,.nav a.active{background:linear-gradient(90deg,${theme.accent}DD,${theme.accent}28)!important;color:#fff!important;box-shadow:0 0 22px ${theme.accent}35!important;transform:translateX(2px)}
      .hero{border-color:${theme.accent}99!important;box-shadow:0 0 45px ${theme.accent}18, inset 0 0 60px #0008!important;background:radial-gradient(circle at 57% 48%,${theme.accent}35,transparent 20%),linear-gradient(135deg,#090b10,#160b10,#07080c)!important}
      .hero:before{background:repeating-radial-gradient(ellipse at 55% 50%,transparent 0 24px,${theme.accent}16 26px 29px,transparent 31px 55px)!important}
      .heroart{border-color:${theme.accent}55!important;box-shadow:0 0 0 2px var(--dn-accent),0 0 45px ${theme.accent}66!important;background:radial-gradient(circle,${theme.accent}22,#05070a 62%)!important}
      .heroart:after{color:#080a0e!important;text-shadow:0 0 4px var(--dn-accent),0 0 30px var(--dn-accent)!important}
      .herotext h1{text-shadow:3px 4px ${theme.accent}33!important}
      .card{background:linear-gradient(145deg,var(--dn-panel2),var(--dn-panel))!important;border-color:${theme.accent}42!important;box-shadow:0 12px 35px #0009!important}
      .card:before{background:var(--dn-accent)!important;box-shadow:0 0 12px var(--dn-accent)!important}
      .title h2:after{background:var(--dn-accent)!important;box-shadow:0 0 8px ${theme.accent}88}
      .footer b{color:var(--dn-accent)!important}
      .avatar{border-color:${theme.accent}99!important;box-shadow:0 0 14px ${theme.accent}22}
      input,textarea,select{background:#080a0e!important;border-color:${theme.accent}55!important;color:#fff!important}
      input:focus,textarea:focus,select:focus{border-color:var(--dn-accent)!important;box-shadow:0 0 0 2px ${theme.accent}22,0 0 18px ${theme.accent}18!important}
      .modalbox{background:#0c0f15!important;border-color:${theme.accent}99!important;box-shadow:0 20px 70px #000!important}
      .person,.row,.staff-user{background:#0b0e13!important;border-color:${theme.accent}40!important}
      .item{border-top-color:${theme.accent}38!important}
      hr{border-top-color:${theme.accent}38!important}
      button:not(.gray):not(.warnBtn):not(.banBtn):not(.deleteBtn){border-color:var(--dn-accent)!important;background:linear-gradient(135deg,#ff1744,#b7092c)!important;box-shadow:0 0 14px ${theme.accent}22!important}
      button:not(.gray):not(.warnBtn):not(.banBtn):not(.deleteBtn):hover{filter:brightness(1.12)!important;box-shadow:0 0 22px ${theme.accent}55!important}
      .warnBtn{background:linear-gradient(135deg,#ffad19,#d46b00)!important}
      .banBtn,.deleteBtn{background:linear-gradient(135deg,#ff2735,#a9000d)!important}
      .ban{background:${theme.accent}12!important;color:#ff7087!important;border-color:${theme.accent}66!important}
      .warn{color:#ffc34d!important}
      .badge{border-color:#3a414c!important;background:#171b22!important}
      .irl-clock{border-color:${theme.accent}99!important;box-shadow:0 0 20px ${theme.accent}18!important}
      .irl-clock-time{text-shadow:0 0 10px var(--dn-accent)!important}
      .irl-clock-date{color:var(--dn-accent)!important}
      .dn-rule.selected{border-color:var(--dn-accent)!important;box-shadow:0 0 12px ${theme.accent}22!important}
      .dn-rule-code{color:var(--dn-accent)!important}
      .dn-check{background:linear-gradient(${theme.accent},${theme.accent}99)!important;border-color:var(--dn-accent)!important}
      .dn-duration.selected{border-color:var(--dn-accent)!important;box-shadow:0 0 14px ${theme.accent}55!important}
      .dn-rule-info{border-color:var(--dn-accent)!important}
      .dn-selected{border-top-color:var(--dn-accent)!important}
      .stat b[style*="color:#299cff"]{color:var(--dn-accent)!important;text-shadow:0 0 10px var(--dn-accent)!important}
      .dn-brand-mark{display:grid;place-items:center;width:92px;height:92px;margin:0 auto 10px;border-radius:22px;border:2px solid var(--dn-accent);background:radial-gradient(circle at 35% 30%,#ff4d6728,transparent 45%),linear-gradient(145deg,#161923,#080a0e);box-shadow:0 0 22px ${theme.accent}44, inset 0 0 28px ${theme.accent}12;color:#fff;font-weight:1000;font-size:30px;font-style:italic;letter-spacing:-2px;text-shadow:0 0 14px ${theme.accent}}
      .dn-hero-mark{position:absolute;right:48px;top:22px;width:185px;height:185px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#ff4d6720,transparent 48%),#080a0e;border:4px solid var(--dn-accent);box-shadow:0 0 0 2px #650815,0 0 42px ${theme.accent}88;z-index:1;color:#fff;font-weight:1000;font-size:64px;font-style:italic;text-shadow:0 0 22px ${theme.accent}}
      .dn-login-mark{display:grid;place-items:center;width:150px;height:150px;margin:0 auto 10px;border-radius:26px;border:2px solid var(--dn-accent);background:linear-gradient(145deg,#171a23,#080a0e);box-shadow:0 0 28px ${theme.accent}44;color:#fff;font-size:48px;font-weight:1000;font-style:italic;text-shadow:0 0 22px ${theme.accent}}
      @media(max-width:600px){.dn-hero-mark{right:-45px;width:150px;height:150px;opacity:.6}.dn-login-mark{width:120px;height:120px}.dn-brand-mark{width:70px;height:70px;font-size:24px}}
    `;
  }

  function save() { localStorage.setItem(KEY, JSON.stringify(theme)); apply(); }
  function settingsUI() {
    const page = document.getElementById('settings');
    if (!page || page.dataset.themeReady) return;
    page.dataset.themeReady = '1';
    page.innerHTML = `<h1>⚙️ Indstillinger</h1>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="card"><h2>🎨 Accent</h2><p class="muted">Dream Network rød er standard. Du kan stadig vælge din egen accent.</p><input id="dnAccent" type="color" value="${esc(theme.accent)}" style="height:58px;padding:4px;cursor:pointer"><input id="dnAccentText" value="${esc(theme.accent)}" maxlength="7" placeholder="#ff1744"></div>
        <div class="card"><h2>🖥️ Baggrund</h2><p class="muted">Vælg en mørk premium baggrund.</p><select id="dnBgPreset" style="width:100%;padding:12px;margin:6px 0 12px;background:#080a0e;color:#fff;border:1px solid #3d4650;border-radius:8px"><option value="#07080c">Carbon</option><option value="#0d1117">Midnight</option><option value="#14171d">Graphite</option></select></div>
      </div><div class="card" style="margin-top:18px"><h2>💾 Tema</h2><p class="muted">Temaet gemmes i denne browser.</p><button id="dnResetTheme" class="gray">↩️ Nulstil Dream Network tema</button></div>`;
    const ac=document.getElementById('dnAccent'),at=document.getElementById('dnAccentText'),preset=document.getElementById('dnBgPreset');
    preset.value=backgrounds[theme.background]?theme.background:defaults.background;
    ac.oninput=()=>{at.value=ac.value;theme.accent=ac.value;save()};
    at.onchange=()=>{const c=validColor(at.value);if(c){theme.accent=c;ac.value=c;save()}else at.value=theme.accent};
    preset.onchange=()=>{theme.background=preset.value;save()};
    document.getElementById('dnResetTheme').onclick=()=>{theme={...defaults};save();ac.value=theme.accent;at.value=theme.accent;preset.value=theme.background};
  }
  apply();
  new MutationObserver(settingsUI).observe(document.documentElement,{childList:true,subtree:true});
  settingsUI();
})();
