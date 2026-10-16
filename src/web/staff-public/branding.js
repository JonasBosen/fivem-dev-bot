(() => {
  function applyBranding(){
    const sideLogo=document.querySelector('.side .logo');
    if(sideLogo && !sideLogo.querySelector('.dn-brand-mark')){
      sideLogo.innerHTML='<div class="dn-brand-mark">DN</div><b>DREAM</b><b>NETWORK</b><span>MORE THAN A SERVER</span>';
    }
    const login=document.getElementById('login');
    if(login && !login.querySelector('.dn-login-mark')){
      const mark=document.createElement('div');
      mark.className='dn-login-mark';mark.textContent='DN';
      const crown=login.querySelector('.crown');
      if(crown)crown.replaceWith(mark);else login.insertBefore(mark,login.firstChild);
    }
    const hero=document.querySelector('.hero');
    if(hero && !hero.querySelector('.dn-hero-mark')){
      const mark=document.createElement('div');
      mark.className='dn-hero-mark';mark.textContent='DN';
      const old=hero.querySelector('.heroart');
      if(old)old.replaceWith(mark);else hero.prepend(mark);
    }
  }
  const observer=new MutationObserver(applyBranding);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  applyBranding();
})();
