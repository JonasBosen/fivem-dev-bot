(() => {
  const style = document.createElement('style');
  style.id = 'dnActionColors';
  style.textContent = `
    /* These three actions are intentionally NOT controlled by the theme picker. */
    #detail button.warnBtn {
      background: linear-gradient(180deg, #ffc928 0%, #e69a00 100%) !important;
      border-color: #ffd54a !important;
      color: #171000 !important;
      box-shadow: 0 0 16px rgba(255, 193, 7, .30) !important;
    }
    #detail button.warnBtn:hover {
      background: linear-gradient(180deg, #ffda4d 0%, #f0a900 100%) !important;
      border-color: #ffd54a !important;
    }
    #detail button.banBtn {
      background: linear-gradient(180deg, #ff3b4a 0%, #c90012 100%) !important;
      border-color: #ff5965 !important;
      color: #fff !important;
      box-shadow: 0 0 16px rgba(255, 35, 55, .32) !important;
    }
    #detail button.banBtn:hover {
      background: linear-gradient(180deg, #ff5662 0%, #df0016 100%) !important;
      border-color: #ff5965 !important;
    }
    #detail button.deleteBtn {
      background: linear-gradient(180deg, #9b111e 0%, #5b0008 100%) !important;
      border-color: #c52a35 !important;
      color: #fff !important;
      box-shadow: 0 0 16px rgba(180, 0, 15, .28) !important;
    }
    #detail button.deleteBtn:hover {
      background: linear-gradient(180deg, #b91625 0%, #72000a 100%) !important;
      border-color: #c52a35 !important;
    }
  `;
  const install = () => {
    if (!document.head.contains(style)) document.head.appendChild(style);
  };
  install();
  new MutationObserver(install).observe(document.documentElement, {childList:true, subtree:true});
})();
