(() => {
  const root = document.documentElement;
  const mobileQuery = window.matchMedia('(max-width: 820px), (pointer: coarse)');

  function setVh() {
    root.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  }

  function applyResponsiveState() {
    const isMobile = mobileQuery.matches;

    setVh();

    if (!isMobile) {
      root.classList.remove('is-mobile');
      root.style.removeProperty('--board-size');
      return;
    }

    root.classList.add('is-mobile');

    const header = document.querySelector('header');
    const infoPanel = document.getElementById('info-panel');
    const layout = document.querySelector('.layout');

    const layoutGap = layout ? parseFloat(getComputedStyle(layout).gap || '0') : 0;
    const headerHeight = header ? header.offsetHeight : 0;
    const infoHeight = infoPanel ? infoPanel.offsetHeight : 0;

    const availableWidth = window.innerWidth - 20;
    const boardSize = Math.max(260, Math.min(availableWidth, 560));
    root.style.setProperty('--board-size', `${boardSize}px`);
  }

  function init() {
    applyResponsiveState();
  }

  window.addEventListener('resize', applyResponsiveState);
  window.addEventListener('orientationchange', () => {
    setTimeout(applyResponsiveState, 50);
  });

  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', applyResponsiveState);
  } else if (mobileQuery.addListener) {
    mobileQuery.addListener(applyResponsiveState);
  }

  document.addEventListener('DOMContentLoaded', init);
})();