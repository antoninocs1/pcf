/* ========================================================
   PCF - combobox.js — Lista compacta para todos os <select>
   O <select> continua na página guardando valor, validação e
   layout; só a lista do sistema é substituída por esta.
   ======================================================== */
(() => {
  const MARGEM = 8;
  const LARGURA_MINIMA = 220;
  const TOQUE_TOLERANCIA = 10;
  let aberta = null;
  let toqueInicio = null;

  const elegivel = (el) => el instanceof HTMLSelectElement && !el.disabled && !el.multiple && el.size <= 1;

  const fechar = (devolverFoco = false) => {
    if (!aberta) return;
    const { lista, select } = aberta;
    aberta = null;
    lista.remove();
    if (devolverFoco && select.isConnected) select.focus();
  };

  const tituloDe = (select) => {
    const rotulo = (select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`))
      || select.closest('.form-group')?.querySelector('label');
    return (rotulo?.textContent || select.getAttribute('aria-label') || '').replace(/\s*\*\s*$/, '').trim();
  };

  const posicionar = (lista, select) => {
    const r = select.getBoundingClientRect();
    const larguraTela = document.documentElement.clientWidth;
    const alturaTela = window.innerHeight;
    const largura = Math.min(Math.max(r.width, LARGURA_MINIMA), larguraTela - MARGEM * 2);
    lista.style.width = `${largura}px`;
    lista.style.left = `${Math.max(MARGEM, Math.min(r.left, larguraTela - largura - MARGEM))}px`;
    const abaixo = alturaTela - r.bottom - MARGEM * 2;
    const acima = r.top - MARGEM * 2;
    const altura = lista.scrollHeight;
    if (altura <= abaixo || abaixo >= acima) {
      lista.style.top = `${r.bottom + MARGEM}px`;
      lista.style.maxHeight = `${abaixo}px`;
    } else {
      lista.style.bottom = `${alturaTela - r.top + MARGEM}px`;
      lista.style.maxHeight = `${acima}px`;
    }
  };

  const escolher = (select, valor) => {
    const mudou = select.value !== valor;
    fechar(true);
    if (!mudou || !select.isConnected) return;
    select.value = valor;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const abrir = (select, peloTeclado = false) => {
    if (aberta?.select === select) { fechar(true); return; }
    fechar();
    const lista = document.createElement('div');
    lista.className = 'diario-humor-list pcf-combo-lista';
    lista.setAttribute('role', 'listbox');
    const titulo = tituloDe(select);
    if (titulo) {
      const t = document.createElement('div');
      t.className = 'diario-humor-list-title';
      t.textContent = titulo;
      lista.appendChild(t);
    }
    [...select.options].filter(o => !o.hidden).forEach(o => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = `diario-humor-opt${o.selected ? ' selected' : ''}`;
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-selected', String(o.selected));
      opt.disabled = o.disabled;
      const texto = document.createElement('span');
      texto.textContent = o.textContent;
      opt.appendChild(texto);
      if (o.selected) {
        const marca = document.createElement('i');
        marca.dataset.lucide = 'check-circle-2';
        marca.className = 'diario-humor-check';
        opt.appendChild(marca);
      }
      opt.onclick = () => escolher(select, o.value);
      lista.appendChild(opt);
    });
    document.body.appendChild(lista);
    if (window.lucide) lucide.createIcons();
    posicionar(lista, select);
    aberta = { lista, select };
    const atual = lista.querySelector('.selected');
    if (atual) atual.scrollIntoView({ block: 'nearest' });
    // Com mouse ou toque não há contorno de foco; as setas continuam funcionando
    if (peloTeclado) (atual || lista.querySelector('.diario-humor-opt:not(:disabled)'))?.focus({ preventScroll: true });
  };

  const moverFoco = (e) => {
    const opcoes = [...aberta.lista.querySelectorAll('.diario-humor-opt:not(:disabled)')];
    if (!opcoes.length) return;
    const i = opcoes.indexOf(document.activeElement);
    const destino = { ArrowDown: Math.min(i + 1, opcoes.length - 1), ArrowUp: Math.max(i - 1, 0), Home: 0, End: opcoes.length - 1 }[e.key];
    e.preventDefault();
    opcoes[destino].focus();
  };

  // Mouse: impede a lista do sistema
  document.addEventListener('mousedown', (e) => {
    if (!elegivel(e.target)) return;
    e.preventDefault();
    e.target.focus({ preventScroll: true });
    abrir(e.target);
  });

  // Toque: arrastar sobre a lista é rolagem da página, não abre
  document.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    toqueInicio = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!elegivel(e.target) || !toqueInicio) return;
    const t = e.changedTouches[0];
    if (Math.abs(t.clientX - toqueInicio.x) > TOQUE_TOLERANCIA || Math.abs(t.clientY - toqueInicio.y) > TOQUE_TOLERANCIA) return;
    e.preventDefault();
    abrir(e.target);
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (aberta) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(true); }
      else if (e.key === 'Tab') fechar(true);
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) moverFoco(e);
      return;
    }
    // Setas sem Alt continuam trocando o valor direto no campo
    const abreLista = e.key === 'Enter' || e.key === ' ' || e.key === 'F4'
      || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'));
    if (abreLista && elegivel(e.target)) {
      e.preventDefault();
      abrir(e.target, true);
    }
  }, true);

  document.addEventListener('pointerdown', (e) => {
    if (aberta && !aberta.lista.contains(e.target) && e.target !== aberta.select) fechar();
  }, true);
  // Rolar a página ou redimensionar deixaria a lista longe do campo
  window.addEventListener('scroll', (e) => {
    if (aberta && !aberta.lista.contains(e.target)) fechar();
  }, true);
  window.addEventListener('resize', () => fechar());
  window.addEventListener('hashchange', () => fechar());
})();
