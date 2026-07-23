/* ========================================================
   PCF - pages/rodavida.js — Roda da Vida
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;

  /* ─────────────────────────────────────────────────────
     INTEGRAÇÃO: calcula sugestões automáticas de score
  ───────────────────────────────────────────────────── */
  const _calcSugestoes = (config) => {
    const sug = {};
    const allCats = config.flatMap(q => q.categorias);

    /* Saúde ← IMC */
    const catSaude = allCats.find(c => c.integracaoFonte === 'imc');
    if (catSaude) {
      const imc = S.getIMC();
      if (imc.peso > 0 && imc.altura > 0) {
        const val = imc.peso / (imc.altura * imc.altura);
        let v = 5;
        if      (val >= 18.5 && val < 25)  v = 9;
        else if ((val >= 17  && val < 18.5) || (val >= 25 && val < 27)) v = 7;
        else if (val >= 27   && val < 30)   v = 5;
        else if ((val >= 30  && val < 35)  || val < 17)  v = 3;
        else    v = 1;
        sug[catSaude.id] = v;
      }
    }

    /* Emoções ← registros dos últimos 7 dias */
    const catEmo = allCats.find(c => c.integracaoFonte === 'emocoes');
    if (catEmo) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
      const cutStr = cutoff.toISOString().split('T')[0];
      const recentes = S.getEmocoes().filter(e => e.data >= cutStr);
      if (recentes.length >= 2) {
        const positivas = new Set(['Feliz', 'Surpreso']);
        let pos = 0, neg = 0;
        recentes.forEach(e => {
          if (positivas.has(e.emocaoPrimaria)) pos++;
          else neg++;
        });
        const total = pos + neg;
        if (total > 0) sug[catEmo.id] = Math.max(1, Math.min(10, Math.round((pos / total) * 9) + 1));
      }
    }

    /* Finanças ← saldo do mês atual */
    const catFin = allCats.find(c => c.integracaoFonte === 'financas');
    if (catFin) {
      const hoje = new Date();
      const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
      const trans = S.getTransacoes().filter(t => t.data && t.data.startsWith(mes));
      const rec  = trans.filter(t => t.tipoOperacao === 'RECEITA').reduce((a, t) => a + (t.valor || 0), 0);
      const desp = trans.filter(t => t.tipoOperacao === 'DESPESA').reduce((a, t) => a + (t.valor || 0), 0);
      if (rec > 0) {
        const pct = (rec - desp) / rec;
        let v = 5;
        if      (pct >= 0.3)  v = 10;
        else if (pct >= 0.2)  v = 8;
        else if (pct >= 0.1)  v = 7;
        else if (pct >= 0)    v = 5;
        else if (pct >= -0.1) v = 3;
        else                  v = 1;
        sug[catFin.id] = v;
      }
    }

    /* Intelecto ← hábitos de mente (últimos 30 dias) */
    const catInt = allCats.find(c => c.integracaoFonte === 'habitos_mente');
    if (catInt) {
      const habitos = S.getHabitos().filter(h => h.ativo && ['Mente', 'Conhecimento'].includes(h.categoria));
      if (habitos.length > 0) {
        const ids = new Set(habitos.map(h => h.id));
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
        const cutStr = cutoff.toISOString().split('T')[0];
        const feitos = S.getRegistrosHabitos().filter(r => ids.has(r.habitoId) && r.data >= cutStr && r.completo);
        const expected = habitos.length * 30;
        sug[catInt.id] = Math.max(1, Math.min(10, Math.round((feitos.length / expected) * 9) + 1));
      }
    }

    /* Virtudes / Caráter ← registros de virtudes (últimos 30 dias) */
    const catVirt = allCats.find(c => c.integracaoFonte === 'virtudes');
    if (catVirt && S.getVirtudesConfig) {
      const virtudes = S.getVirtudesConfig().filter(v => v.ativo !== false);
      if (virtudes.length > 0) {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
        const cutStr = cutoff.toISOString().split('T')[0];
        const regs = (S.getVirtudesReg ? S.getVirtudesReg() : []).filter(r => r.data >= cutStr);
        // Dias únicos com pelo menos 1 virtude praticada
        const diasUnicos = new Set(regs.map(r => r.data)).size;
        sug[catVirt.id] = Math.max(1, Math.min(10, Math.round((diasUnicos / 30) * 9) + 1));
      }
    }

    return sug;
  };

  /* ─────────────────────────────────────────────────────
     CANVAS: desenha a Roda da Vida
  ───────────────────────────────────────────────────── */
  const _desenharRoda = (canvasId, config, scores) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const sz = canvas.offsetWidth || 480;
    const isCompact = window.matchMedia('(max-width: 480px)').matches;
    const drawingH = isCompact ? Math.round(sz * 1.16) : sz;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(sz * dpr);
    canvas.height = Math.round(drawingH * dpr);
    canvas.style.width = `${sz}px`;
    canvas.style.height = `${drawingH}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = sz / 2, cy = drawingH / 2;
    // No celular o círculo usa 86% da largura; a altura adicional reserva
    // faixas exclusivas para os títulos dos quadrantes.
    const maxR = isCompact
      ? Math.max(100, sz * 0.43)
      : Math.max(84, (sz / 2) - Math.max(56, sz * 0.19));
    const allCats = config.flatMap(q => q.categorias);
    const n     = allCats.length;   // normalmente 12
    const step  = (2 * Math.PI) / n;
    const start = -Math.PI / 2;    // começa em cima (12h)

    ctx.clearRect(0, 0, sz, drawingH);

    /* ── fundo dos setores (transparente) ── */
    allCats.forEach((cat, i) => {
      const a1 = start + i * step;
      const a2 = a1 + step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, a1, a2);
      ctx.closePath();
      ctx.fillStyle = cat.cor + '22';
      ctx.fill();
    });

    /* ── anéis de grade ── */
    for (let ring = 1; ring <= 10; ring++) {
      const r = (maxR / 10) * ring;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.strokeStyle = ring % 5 === 0 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.10)';
      ctx.lineWidth   = ring % 5 === 0 ? 1.2 : 0.5;
      ctx.stroke();
    }

    /* ── setores preenchidos ── */
    allCats.forEach((cat, i) => {
      const sc = scores[cat.id] || 0;
      if (!sc) return;
      const r  = (maxR / 10) * sc;
      const a1 = start + i * step;
      const a2 = a1 + step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a1, a2);
      ctx.closePath();
      ctx.fillStyle = cat.cor + 'cc';
      ctx.fill();
    });

    /* ── divisórias dos setores ── */
    for (let i = 0; i < n; i++) {
      const angle   = start + i * step;
      const isQuad  = i % 3 === 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.strokeStyle = isQuad ? 'rgba(255,255,255,.65)' : 'rgba(255,255,255,.2)';
      ctx.lineWidth   = isQuad ? 2 : 0.8;
      ctx.stroke();
    }

    /* ── borda externa ── */
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    /* ── círculo central ── */
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fill();

    /* ── ícones das categorias (dentro do setor) ── */
    const iconR = maxR * 0.58;
    ctx.font = `${Math.max(11, sz * 0.038)}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    allCats.forEach((cat, i) => {
      const angle = start + (i + 0.5) * step;
      ctx.fillText(cat.icon, cx + iconR * Math.cos(angle), cy + iconR * Math.sin(angle));
    });

    /* ── rótulos curtos fora da roda ── */
    const sidePad = Math.max(18, sz * 0.06);
    const lblR = maxR + sz * 0.04;
    ctx.font = `${Math.max(isCompact ? 8 : 9, sz * 0.022)}px 'Inter', sans-serif`;
    const canvasBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0f172a';
    allCats.forEach((cat, i) => {
      const angle = start + (i + 0.5) * step;
      const rawX = cx + lblR * Math.cos(angle);
      const x = isCompact ? Math.max(24, Math.min(sz - 24, rawX)) : rawX;
      const y = cy + lblR * Math.sin(angle);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = cat.cor;
      const lbl = (cat.labelCurto || cat.label.split('–')[0].trim()).split(' ').slice(0, 2).join(' ');
      if (isCompact) {
        // Cria uma pequena área limpa atrás do texto para a borda da roda não
        // atravessar as letras nos pontos em que há pouco espaço lateral.
        ctx.strokeStyle = canvasBg;
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.strokeText(lbl, x, y);
      }
      ctx.fillText(lbl, x, y);
    });

    /* ── rótulos de quadrante nos cantos ── */
    ctx.font = `bold ${Math.max(10, sz * 0.025)}px 'Inter', sans-serif`;
    const quadrantInsetX = isCompact ? 12 : Math.max(28, sz * 0.13);
    const quadrantPadY = isCompact ? 5 : sidePad;
    const quadrantAnchors = [
      { x: sz - quadrantInsetX, y: quadrantPadY, align: 'right', baseline: 'top' },
      { x: sz - quadrantInsetX, y: drawingH - quadrantPadY, align: 'right', baseline: 'bottom' },
      { x: quadrantInsetX, y: drawingH - quadrantPadY, align: 'left', baseline: 'bottom' },
      { x: quadrantInsetX, y: quadrantPadY, align: 'left', baseline: 'top' },
    ];
    config.forEach((q, qi) => {
      const anchor = quadrantAnchors[qi] || quadrantAnchors[0];
      ctx.textAlign = anchor.align;
      ctx.textBaseline = anchor.baseline;
      ctx.fillStyle = q.cor;
      ctx.fillText(q.label.toUpperCase(), anchor.x, anchor.y);
    });
  };

  /* ─────────────────────────────────────────────────────
     PAGE: RODA DA VIDA  (#roda-vida)
  ───────────────────────────────────────────────────── */
  PCF.Pages.rodaVida = (container) => {
    const config   = S.getRodaVidaConfig();
    const sugestoes = _calcSugestoes(config);
    let registros  = S.getRodaVidaRegistros();
    let curDate    = new Date().toISOString().split('T')[0];

    const _getSorted   = () => [...new Set(registros.map(r => r.data))].sort();
    const _regForDate  = (d) => registros.find(r => r.data === d);
    const _fmt         = (d) => { const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; };
    const _scoresFromSliders = () => {
      const s = {};
      document.querySelectorAll('.rv-range').forEach(el => { s[el.dataset.catid] = parseInt(el.value); });
      return s;
    };

    const render = () => {
      registros      = S.getRodaVidaRegistros();
      const sorted   = _getSorted();
      const saved    = _regForDate(curDate);
      const scores   = saved ? { ...saved.scores } : { ...sugestoes };
      const prevDate = sorted[sorted.indexOf(curDate) - 1];
      const nextDate = sorted[sorted.indexOf(curDate) + 1];

      /* conta quantas categorias têm sugestão */
      const allCats  = config.flatMap(q => q.categorias);
      const hasSugg  = !saved && allCats.some(c => sugestoes[c.id] !== undefined);

      container.innerHTML = `
        <div class="page rv-page">
          <div class="rv-topbar">
            <div>
              <h2>🎯 Roda da Vida</h2><br>
              <p class="subtitle">Avalie seu nível de satisfação em cada área de vida</p>
            </div>
            <div class="rv-nav-area">
              <button id="rv-prev" class="btn btn-sm"${!prevDate ? ' disabled' : ''}><i data-lucide="chevron-left"></i></button>
              <span class="rv-date-badge${saved ? ' is-saved' : ''}">
                ${_fmt(curDate)}${saved ? ' ✓' : ''}
              </span>
              <button id="rv-next" class="btn btn-sm"${!nextDate ? ' disabled' : ''}><i data-lucide="chevron-right"></i></button>
              <button id="rv-nova" class="btn btn-primary btn-sm">+ Nova Avaliação</button>
            </div>
          </div>

          ${hasSugg ? `<div class="rv-sugg-info">💡 Alguns valores foram <strong>pré-preenchidos automaticamente</strong> com base nos seus dados de IMC, emoções, hábitos e finanças. Ajuste e salve quando quiser.</div>` : ''}

          <div class="rv-layout">
            <div class="rv-wheel-area">
              <canvas id="rv-canvas" class="rv-canvas"></canvas>
            </div>

            <div class="rv-form-area">
              ${config.map(q => `
                <div class="rv-quad-block">
                  <div class="rv-quad-head" style="border-left:3px solid ${q.cor}">
                    <span class="rv-quad-lbl" style="color:${q.cor}">${q.label}</span>
                  </div>
                  ${q.categorias.map(cat => {
                    const sc = scores[cat.id] !== undefined ? scores[cat.id] : 5;
                    const sg = sugestoes[cat.id];
                    const showSugg = !saved && sg !== undefined;
                    return `
                      <div class="rv-cat-item">
                        <div class="rv-cat-top">
                          <span class="rv-cat-name">${cat.icon} ${H.esc(cat.label)}</span>
                          <div class="rv-cat-right">
                            ${showSugg ? `<span class="rv-sugg-badge" title="Sugestão automática dos seus dados">💡 ${sg}</span>` : ''}
                            <strong class="rv-score-val" id="rv-val-${cat.id}">${sc}</strong>
                          </div>
                        </div>
                        <div class="rv-slider-track">
                          <input type="range" class="rv-range" data-catid="${cat.id}"
                            min="1" max="10" step="1" value="${sc}"
                            style="--rv-fill:${cat.cor}">
                        </div>
                        <div class="rv-range-labels">
                          <small>1 – Não satisfeito</small>
                          <small>Muito satisfeito – 10</small>
                        </div>
                      </div>`;
                  }).join('')}
                </div>`).join('')}

              <div class="rv-btns">
                <button id="rv-salvar" class="btn btn-primary"><i data-lucide="save"></i> Salvar Avaliação</button>
                ${saved ? `<button id="rv-excluir" class="btn btn-outline rv-del-btn"><i data-lucide="trash-2"></i> Excluir</button>` : ''}
              </div>
            </div>
          </div>
        </div>`;

      /* desenha a roda */
      const redrawWheel = () => _desenharRoda('rv-canvas', config, _scoresFromSliders());
      setTimeout(redrawWheel, 20);

      if (container._rvResizeHandler) window.removeEventListener('resize', container._rvResizeHandler);
      container._rvResizeHandler = () => redrawWheel();
      window.addEventListener('resize', container._rvResizeHandler);

      /* atualização ao vivo */
      document.querySelectorAll('.rv-range').forEach(s => {
        s.oninput = () => {
          const el = document.getElementById(`rv-val-${s.dataset.catid}`);
          if (el) el.textContent = s.value;
          redrawWheel();
        };
      });

      /* navegação */
      document.getElementById('rv-prev').onclick = () => {
        const d = _getSorted()[_getSorted().indexOf(curDate) - 1];
        if (d) { curDate = d; render(); }
      };
      document.getElementById('rv-next').onclick = () => {
        const d = _getSorted()[_getSorted().indexOf(curDate) + 1];
        if (d) { curDate = d; render(); }
      };
      document.getElementById('rv-nova').onclick = () => {
        curDate = new Date().toISOString().split('T')[0];
        render();
      };

      /* salvar */
      document.getElementById('rv-salvar').onclick = () => {
        const sc  = _scoresFromSliders();
        const idx = registros.findIndex(r => r.data === curDate);
        if (idx >= 0) registros[idx] = { ...registros[idx], scores: sc };
        else registros.push({ id: S._uid(), data: curDate, scores: sc });
        S.saveRodaVidaRegistros(registros);
        _rvToast('Avaliação salva com sucesso!');
        render();
      };

      /* excluir */
      const delBtn = document.getElementById('rv-excluir');
      if (delBtn) {
        delBtn.onclick = () => {
          if (!confirm(`Excluir avaliação de ${_fmt(curDate)}?`)) return;
          registros = registros.filter(r => r.data !== curDate);
          S.saveRodaVidaRegistros(registros);
          curDate = new Date().toISOString().split('T')[0];
          render();
        };
      }
    };

    render();
  };

  /* ─────────────────────────────────────────────────────
     PAGE: CONFIG. RODA DA VIDA  (#roda-vida-config)
  ───────────────────────────────────────────────────── */
  PCF.Pages.rodaVidaConfig = (container) => {
    let config = S.getRodaVidaConfig();

    const INTEGRACAO_OPTS = [
      { value: '',              label: '—  Nenhuma'          },
      { value: 'imc',           label: '❤️  IMC / Saúde'     },
      { value: 'emocoes',       label: '😊  Emoções recentes' },
      { value: 'financas',      label: '💰  Saldo financeiro' },
      { value: 'habitos_mente', label: '🧠  Hábitos de Mente' },
      { value: 'virtudes',      label: '💎  Virtudes'         },
    ];

    const render = () => {
      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <div>
              <h2>⚙️ Config. Roda da Vida</h2><br>
              <p class="subtitle">Gerencie os quadrantes e categorias da Roda da Vida</p>
            </div>
            <div class="page-actions">
              <button id="rvc-restaurar" class="btn btn-outline btn-sm"><i data-lucide="rotate-ccw"></i> Restaurar Padrões</button>
              <button id="rvc-add-quad" class="btn btn-primary btn-sm">+ Quadrante</button>
            </div>
          </div>

          <div class="rvc-quads">
            ${config.map((q, qi) => `
              <div class="rvc-quad-card card" data-qi="${qi}">
                <div class="rvc-quad-head">
                  <span class="rvc-quad-dot" style="background:${q.cor}"></span>
                  <strong>${H.esc(q.label)}</strong>
                  <div class="rvc-quad-actions">
                    <button class="btn btn-sm btn-outline rvc-edit-quad" data-qi="${qi}" title="Editar quadrante"><i data-lucide="pencil"></i></button>
                    <button class="btn btn-sm btn-outline rvc-move-quad-up" data-qi="${qi}" title="Mover acima" ${qi === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button>
                    <button class="btn btn-sm btn-outline rvc-move-quad-dn" data-qi="${qi}" title="Mover abaixo" ${qi === config.length - 1 ? 'disabled' : ''}><i data-lucide="arrow-down"></i></button>
                    <button class="btn btn-sm btn-outline rvc-del-quad" data-qi="${qi}" title="Remover quadrante" style="color:var(--danger)" ${config.length <= 1 ? 'disabled' : ''}><i data-lucide="trash-2"></i></button>
                  </div>
                </div>
                <table class="table rvc-cat-table">
                  <thead><tr><th>Ícone</th><th>Nome</th><th>Rótulo curto</th><th>Cor</th><th>Integração</th><th></th></tr></thead>
                  <tbody>
                    ${q.categorias.map((cat, ci) => `
                      <tr data-qi="${qi}" data-ci="${ci}">
                        <td>${cat.icon}</td>
                        <td>${H.esc(cat.label)}</td>
                        <td><small>${H.esc(cat.labelCurto || '')}</small></td>
                        <td><span class="rvc-cor-dot" style="background:${cat.cor}"></span></td>
                        <td><small>${INTEGRACAO_OPTS.find(o=>o.value===cat.integracaoFonte)?.label || '—'}</small></td>
                        <td class="rvc-cat-acts">
                          <button class="btn btn-sm btn-outline rvc-edit-cat" data-qi="${qi}" data-ci="${ci}" title="Editar"><i data-lucide="pencil"></i></button>
                          <button class="btn btn-sm btn-outline rvc-del-cat" data-qi="${qi}" data-ci="${ci}" title="Remover" style="color:var(--danger)"><i data-lucide="trash-2"></i></button>
                        </td>
                      </tr>`).join('')}
                  </tbody>
                </table>
                <div class="rvc-add-cat-wrap">
                  <button class="btn btn-sm btn-outline rvc-add-cat" data-qi="${qi}">+ Categoria</button>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Modal quadrante -->
        <div id="rvc-quad-modal" class="modal-overlay" style="display:none">
          <div class="modal-box">
            <h3 id="rvc-qm-title">Quadrante</h3>
            <div class="form-group"><label>Nome do quadrante</label><input id="rvc-qm-nome" class="form-control" type="text"></div>
            <div class="form-group"><label>Cor</label><input id="rvc-qm-cor" class="form-control" type="color"></div>
            <div class="modal-footer">
              <button id="rvc-qm-ok"  class="btn btn-primary">Salvar</button>
              <button id="rvc-qm-cancel" class="btn btn-outline">Cancelar</button>
            </div>
          </div>
        </div>

        <!-- Modal categoria -->
        <div id="rvc-cat-modal" class="modal-overlay" style="display:none">
          <div class="modal-box">
            <h3 id="rvc-cm-title">Categoria</h3>
            <div class="form-row">
              <div class="form-group" style="flex:0 0 70px"><label>Ícone</label><input id="rvc-cm-icon" class="form-control" type="text" maxlength="4" placeholder="🎯"></div>
              <div class="form-group" style="flex:1"><label>Nome</label><input id="rvc-cm-label" class="form-control" type="text"></div>
            </div>
            <div class="form-row">
              <div class="form-group" style="flex:1"><label>Rótulo curto (para a roda)</label><input id="rvc-cm-lcurto" class="form-control" type="text" placeholder="Ex: Saúde" maxlength="14"></div>
              <div class="form-group" style="flex:0 0 90px"><label>Cor</label><input id="rvc-cm-cor" class="form-control" type="color"></div>
            </div>
            <div class="form-group">
              <label>Integração automática</label>
              <select id="rvc-cm-integ" class="form-control">
                ${INTEGRACAO_OPTS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
              </select>
            </div>
            <div class="modal-footer">
              <button id="rvc-cm-ok"     class="btn btn-primary">Salvar</button>
              <button id="rvc-cm-cancel" class="btn btn-outline">Cancelar</button>
            </div>
          </div>
        </div>`;

      /* ── botões quadrante ── */
      document.getElementById('rvc-add-quad').onclick = () => _openQuadModal(-1);

      document.getElementById('rvc-restaurar').onclick = () => {
        if (!confirm('Restaurar configuração padrão? As alterações serão perdidas.')) return;
        S.saveRodaVidaConfig(null);  // null → getRodaVidaConfig retorna o padrão
        config = S.getRodaVidaConfig();
        render();
        _rvToast('Configuração restaurada ao padrão!');
      };

      document.querySelectorAll('.rvc-edit-quad').forEach(btn => btn.onclick = () => _openQuadModal(+btn.dataset.qi));
      document.querySelectorAll('.rvc-del-quad').forEach(btn => btn.onclick  = () => {
        if (!confirm('Remover este quadrante e todas as suas categorias?')) return;
        config.splice(+btn.dataset.qi, 1);
        _saveAndRender();
      });
      document.querySelectorAll('.rvc-move-quad-up').forEach(btn => btn.onclick = () => {
        const i = +btn.dataset.qi;
        if (i > 0) { [config[i-1], config[i]] = [config[i], config[i-1]]; _saveAndRender(); }
      });
      document.querySelectorAll('.rvc-move-quad-dn').forEach(btn => btn.onclick = () => {
        const i = +btn.dataset.qi;
        if (i < config.length - 1) { [config[i+1], config[i]] = [config[i], config[i+1]]; _saveAndRender(); }
      });

      /* ── botões categoria ── */
      document.querySelectorAll('.rvc-add-cat').forEach(btn  => btn.onclick = () => _openCatModal(+btn.dataset.qi, -1));
      document.querySelectorAll('.rvc-edit-cat').forEach(btn => btn.onclick = () => _openCatModal(+btn.dataset.qi, +btn.dataset.ci));
      document.querySelectorAll('.rvc-del-cat').forEach(btn  => btn.onclick  = () => {
        const q = config[+btn.dataset.qi];
        if (!confirm(`Remover categoria "${q.categorias[+btn.dataset.ci].label}"?`)) return;
        q.categorias.splice(+btn.dataset.ci, 1);
        _saveAndRender();
      });

      /* ── modais: botões OK / Cancelar ── */
      document.getElementById('rvc-qm-cancel').onclick = () => { document.getElementById('rvc-quad-modal').style.display = 'none'; };
      document.getElementById('rvc-qm-ok').onclick = () => {
        const nome = document.getElementById('rvc-qm-nome').value.trim();
        const cor  = document.getElementById('rvc-qm-cor').value;
        if (!nome) return;
        if (_qmIdx >= 0) { config[_qmIdx].label = nome; config[_qmIdx].cor = cor; }
        else config.push({ id: S._uid(), label: nome, cor, categorias: [] });
        document.getElementById('rvc-quad-modal').style.display = 'none';
        _saveAndRender();
      };

      document.getElementById('rvc-cm-cancel').onclick = () => { document.getElementById('rvc-cat-modal').style.display = 'none'; };
      document.getElementById('rvc-cm-ok').onclick = () => {
        const icon    = document.getElementById('rvc-cm-icon').value.trim()   || '⭐';
        const label   = document.getElementById('rvc-cm-label').value.trim();
        const lcurto  = document.getElementById('rvc-cm-lcurto').value.trim();
        const cor     = document.getElementById('rvc-cm-cor').value;
        const integ   = document.getElementById('rvc-cm-integ').value;
        if (!label) return;
        const q = config[_cmQi];
        if (_cmCi >= 0) {
          q.categorias[_cmCi] = { ...q.categorias[_cmCi], icon, label, labelCurto: lcurto, cor, integracaoFonte: integ };
        } else {
          q.categorias.push({ id: S._uid(), icon, label, labelCurto: lcurto, cor, integracaoFonte: integ });
        }
        document.getElementById('rvc-cat-modal').style.display = 'none';
        _saveAndRender();
      };
    };

    const _saveAndRender = () => { S.saveRodaVidaConfig(config); render(); };

    /* ── modal quadrante ── */
    let _qmIdx = -1;
    const _openQuadModal = (qi) => {
      _qmIdx = qi;
      const q = qi >= 0 ? config[qi] : null;
      document.getElementById('rvc-qm-title').textContent = q ? 'Editar Quadrante' : 'Novo Quadrante';
      document.getElementById('rvc-qm-nome').value = q ? q.label : '';
      document.getElementById('rvc-qm-cor').value  = q ? q.cor   : '#3b82f6';
      document.getElementById('rvc-quad-modal').style.display = 'flex';
    };
    /* ── modal categoria ── */
    let _cmQi = -1, _cmCi = -1;
    const _openCatModal = (qi, ci) => {
      _cmQi = qi; _cmCi = ci;
      const cat = ci >= 0 ? config[qi].categorias[ci] : null;
      document.getElementById('rvc-cm-title').textContent = cat ? 'Editar Categoria' : 'Nova Categoria';
      document.getElementById('rvc-cm-icon').value   = cat ? cat.icon          : '⭐';
      document.getElementById('rvc-cm-label').value  = cat ? cat.label         : '';
      document.getElementById('rvc-cm-lcurto').value = cat ? (cat.labelCurto || '') : '';
      document.getElementById('rvc-cm-cor').value    = cat ? cat.cor           : '#3b82f6';
      document.getElementById('rvc-cm-integ').value  = cat ? (cat.integracaoFonte || '') : '';
      document.getElementById('rvc-cat-modal').style.display = 'flex';
    };

    render();
  };

  /* ── toast simples ── */
  const _rvToast = (msg) => {
    const t = document.createElement('div');
    t.className = 'rv-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2200);
  };

})();
