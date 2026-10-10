/* ========================================================
   PCF - pwa.js — Registro do Service Worker e botão "Instalar"
   ======================================================== */
window.PCF = window.PCF || {};

PCF.PWA = (() => {
  let deferredPrompt = null;
  const listeners = new Set();

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const notify = () => listeners.forEach(fn => { try { fn(); } catch (_) {} });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('[PCF] Service Worker:', err.message));
    });
  }

  const showInstructions = () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const steps = isIOS()
      ? `<ol class="pwa-steps">
           <li>Toque no botão <strong>Compartilhar</strong> <span aria-hidden="true">⎋</span> do Safari.</li>
           <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
           <li>Confirme em <strong>Adicionar</strong>.</li>
         </ol>`
      : `<ol class="pwa-steps">
           <li>Abra o menu do navegador (<strong>⋮</strong> ou <strong>…</strong>).</li>
           <li>Escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
           <li>Confirme a instalação.</li>
         </ol>
         <p class="text-muted">Se a opção não aparecer, use o Chrome, Edge ou Samsung Internet com o site aberto em HTTPS.</p>`;
    overlay.innerHTML = `
      <div class="modal pwa-modal">
        <h3>📲 Instalar o PCF</h3>
        <p>Instale o PCF para abri-lo como um aplicativo, direto da tela inicial.</p>
        ${steps}
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" id="pwa-ok">Entendi</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#pwa-ok').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  };

  const install = async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      prompt.prompt();
      try { await prompt.userChoice; } catch (_) {}
      notify();
      return;
    }
    showInstructions();
  };

  /* Liga um botão: fica oculto quando o app já está rodando instalado. */
  const bindInstallButton = (btn) => {
    if (!btn) return;
    const sync = () => {
      if (!document.body.contains(btn)) { listeners.delete(sync); return; }
      btn.hidden = isStandalone();
    };
    listeners.add(sync);
    btn.onclick = install;
    sync();
  };

  return { install, bindInstallButton, isStandalone, canPrompt: () => !!deferredPrompt };
})();
