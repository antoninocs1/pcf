/* ========================================================
   PCF - pages/virtudes.js — Controle das Virtudes
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;

  /* ── Categorias de virtudes (para filtragem/agrupamento) ── */
  const CATEGORIAS_VIRTUDES = [
    { id: 'Sabedoria',       label: 'Sabedoria',       cor: '#8b5cf6', icon: 'lightbulb' },
    { id: 'Coragem',         label: 'Coragem',         cor: '#dc2626', icon: 'shield' },
    { id: 'Humanidade',      label: 'Humanidade',      cor: '#ec4899', icon: 'heart' },
    { id: 'Justiça',         label: 'Justiça',         cor: '#16a34a', icon: 'scale' },
    { id: 'Moderação',       label: 'Moderação',       cor: '#0ea5e9', icon: 'gauge' },
    { id: 'Transcendência',  label: 'Transcendência',  cor: '#f59e0b', icon: 'sparkles' },
    { id: 'Paz',             label: 'Paz',             cor: '#06b6d4', icon: 'feather' },
    { id: 'Outro',           label: 'Outro',           cor: '#64748b', icon: 'tag' },
  ];

  const getCatColor = (cat) => CATEGORIAS_VIRTUDES.find(c => c.id === cat)?.cor || '#64748b';

  const getVidaFelizHoje = () => {
    const frases = S.getFrases().filter(f => f.ativo !== false && f.categoria === 'Vida Feliz');
    if (!frases.length) return null;
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86400000);
    return frases[dayOfYear % frases.length];
  };

  const sortearVidaFeliz = (fraseAtual) => {
    const frases = S.getFrases().filter(f => f.ativo !== false && f.categoria === 'Vida Feliz');
    if (frases.length <= 1) return fraseAtual || frases[0] || null;
    let candidata;
    do {
      candidata = frases[Math.floor(Math.random() * frases.length)];
    } while (candidata.id === fraseAtual?.id);
    return candidata;
  };

  const htmlVidaFelizBanner = (frase) => {
    if (!frase) return '';
    return `
      <div class="hab-frase-dia vida-feliz-banner">
        <div class="hab-frase-icon">💬</div>
        <div class="hab-frase-content">
          <div class="hab-frase-label">VIDA FELIZ</div>
          <div class="hab-frase-texto" id="vida-feliz-texto">"${H.esc(frase.texto)}"</div>
          <div class="hab-frase-autor" id="vida-feliz-autor"${frase.autor ? '' : ' style="display:none"'}>${frase.autor ? '— ' + H.esc(frase.autor) : ''}</div>
        </div>
        <button type="button" id="btn-outra-vida-feliz" class="home-msg-refresh" title="Exibir outra mensagem aleatória"><i data-lucide="refresh-cw"></i></button>
      </div>`;
  };

  /* ── Verificar se virtude foi praticada num dia ── */
  const isPraticada = (virtudeId, data) => {
    return S.getVirtudesReg().some(r => r.virtudeId === virtudeId && r.data === data);
  };

  /* ── Contagem de dias consecutivos (streak) ── */
  const calcStreak = (virtudeId) => {
    let streak = 0;
    const d = new Date();
    const hoje = d.toISOString().split('T')[0];
    const temHoje = S.getVirtudesReg().some(r => r.virtudeId === virtudeId && r.data === hoje);
    if (!temHoje) d.setDate(d.getDate() - 1);
    while (true) {
      const iso = d.toISOString().split('T')[0];
      if (!S.getVirtudesReg().some(r => r.virtudeId === virtudeId && r.data === iso)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  };

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     1. CHECK-IN DIÁRIO DE VIRTUDES
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  PCF.Pages.virtudes = (container) => {
    let selectedDate = H.hoje();
    const renderPreservingScroll = () => {
      const x = window.scrollX;
      const y = window.scrollY;
      render();
      requestAnimationFrame(() => window.scrollTo(x, y));
    };

    const render = () => {
      const virtudes = S.getVirtudesConfig().filter(v => v.ativo !== false);
      const hoje = H.hoje();
      const vidaFeliz = getVidaFelizHoje();

      // Agrupar por categoria
      const grupos = {};
      virtudes.forEach(v => {
        const cat = v.categoria || 'Outro';
        if (!grupos[cat]) grupos[cat] = [];
        grupos[cat].push(v);
      });

      const praticadasHoje = virtudes.filter(v => isPraticada(v.id, selectedDate)).length;
      const pct = virtudes.length > 0 ? Math.round((praticadasHoje / virtudes.length) * 100) : 0;

      const htmlGrupos = Object.entries(grupos).map(([cat, vList]) => {
        const catInfo = CATEGORIAS_VIRTUDES.find(c => c.id === cat) || { cor: '#64748b', icon: 'tag', label: cat };
        const cards = vList.map(v => {
          const praticada = isPraticada(v.id, selectedDate);
          const streak = calcStreak(v.id);
          return `
            <button type="button"
              class="virtude-btn ${praticada ? 'praticada' : ''}"
              data-id="${H.esc(v.id)}"
              style="--vcolor:${H.esc(v.cor || catInfo.cor)}"
              title="${H.esc(v.significado || v.nome)}">
              <span class="virtude-icon">${H.esc(v.icone || '✦')}</span>
              <span class="virtude-nome">${H.esc(v.nome)}</span>
              ${streak > 1 ? `<span class="virtude-streak" title="${streak} dias seguidos">🔥${streak}</span>` : ''}
              ${praticada ? '<span class="virtude-check">✓</span>' : ''}
              <span class="virtude-hint">${H.esc(v.significado || '')}</span>
            </button>`;
        }).join('');
        return `
          <div class="virtudes-grupo">
            <div class="virtudes-grupo-header" style="--catcolor:${catInfo.cor}">
              <i data-lucide="${catInfo.icon}"></i>
              <span>${H.esc(catInfo.label || cat)}</span>
              <span class="virtudes-grupo-count">${vList.filter(v => isPraticada(v.id, selectedDate)).length}/${vList.length}</span>
            </div>
            <div class="virtudes-grid">${cards}</div>
          </div>`;
      }).join('');

      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2><i data-lucide="gem"></i> Virtudes</h2>
            <div class="page-header-actions">
              <a href="#virtudes-relatorio" class="btn btn-secondary btn-sm"><i data-lucide="bar-chart-2"></i> Relatório</a>
              <a href="#virtudes-config" class="btn btn-secondary btn-sm"><i data-lucide="settings"></i> Configurar</a>
            </div>
          </div>

          ${htmlVidaFelizBanner(vidaFeliz)}

          <div class="virtudes-date-bar date-nav-controls">
            <button id="virt-prev-day" class="btn btn-ghost btn-sm" title="Dia anterior"><i data-lucide="chevron-left"></i></button>
            <input type="date" id="virt-date" class="form-control-inline" value="${selectedDate}" max="${hoje}">
            <button id="virt-next-day" class="btn btn-ghost btn-sm" title="Próximo dia" ${selectedDate >= hoje ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button>
            <button id="virt-today" class="btn btn-secondary btn-sm">Hoje</button>
          </div>

          <div class="virtudes-progress-wrap">
            <div class="virtudes-progress-label">
              <span>Praticadas hoje: <strong>${praticadasHoje}</strong> de <strong>${virtudes.length}</strong></span>
              <span class="virtudes-progress-pct">${pct}%</span>
            </div>
            <div class="virtudes-progress-bar"><div class="virtudes-progress-fill" style="width:${pct}%"></div></div>
          </div>

          ${virtudes.length === 0
            ? `<div class="empty-state"><i data-lucide="gem"></i><p>Nenhuma virtude configurada.</p><a href="#virtudes-config" class="btn btn-primary">Configurar</a></div>`
            : `<div class="virtudes-grupos">${htmlGrupos}</div>`}
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#virtudes');
      _bindEvents();
    };

    const _bindEvents = () => {
      const dateEl = container.querySelector('#virt-date');
      if (dateEl) {
        dateEl.onchange = () => { selectedDate = dateEl.value; renderPreservingScroll(); };
      }
      container.querySelector('#virt-prev-day')?.addEventListener('click', () => {
        const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 1);
        selectedDate = d.toISOString().split('T')[0]; renderPreservingScroll();
      });
      container.querySelector('#virt-next-day')?.addEventListener('click', () => {
        const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 1);
        const hoje = H.hoje();
        if (d.toISOString().split('T')[0] <= hoje) { selectedDate = d.toISOString().split('T')[0]; renderPreservingScroll(); }
      });
      container.querySelector('#virt-today')?.addEventListener('click', () => {
        selectedDate = H.hoje();
        renderPreservingScroll();
      });

      const btnOutraVidaFeliz = container.querySelector('#btn-outra-vida-feliz');
      if (btnOutraVidaFeliz) {
        let vidaFelizAtual = getVidaFelizHoje();
        btnOutraVidaFeliz.onclick = () => {
          vidaFelizAtual = sortearVidaFeliz(vidaFelizAtual);
          const textoEl = container.querySelector('#vida-feliz-texto');
          const autorEl = container.querySelector('#vida-feliz-autor');
          if (textoEl && vidaFelizAtual) textoEl.textContent = `"${vidaFelizAtual.texto}"`;
          if (autorEl) {
            autorEl.textContent = vidaFelizAtual?.autor ? `— ${vidaFelizAtual.autor}` : '';
            autorEl.style.display = vidaFelizAtual?.autor ? '' : 'none';
          }
        };
      }

      container.querySelectorAll('.virtude-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          S.toggleVirtude(btn.dataset.id, selectedDate);
          render();
        });
      });
    };

    render();
  };

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     2. RELATÓRIO DE VIRTUDES
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  PCF.Pages.virtudesRelatorio = (container) => {
    const hoje = H.hoje();
    let periodo = 30;
    let filtroVirtude = '';

    const render = () => {
      const virtudes = S.getVirtudesConfig().filter(v => v.ativo !== false);
      const regs = S.getVirtudesReg();
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - periodo + 1);
      const cutStr = cutoff.toISOString().split('T')[0];
      const regsPerido = regs.filter(r => r.data >= cutStr && r.data <= hoje);

      // Estatísticas por virtude
      const stats = virtudes.map(v => {
        const total = regsPerido.filter(r => r.virtudeId === v.id).length;
        const streak = calcStreak(v.id);
        const pct = Math.round((total / periodo) * 100);
        return { ...v, total, streak, pct };
      }).sort((a, b) => b.total - a.total);

      // Estatísticas por categoria
      const statsCat = {};
      CATEGORIAS_VIRTUDES.forEach(c => {
        const vids = virtudes.filter(v => v.categoria === c.id).map(v => v.id);
        const total = regsPerido.filter(r => vids.includes(r.virtudeId)).length;
        const max = vids.length * periodo;
        statsCat[c.id] = { total, max, pct: max > 0 ? Math.round((total / max) * 100) : 0, cor: c.cor, label: c.label };
      });

      // Dias com mais virtudes praticadas
      const porDia = {};
      regsPerido.forEach(r => { porDia[r.data] = (porDia[r.data] || 0) + 1; });
      const topDias = Object.entries(porDia).sort((a, b) => b[1] - a[1]).slice(0, 5);

      // Total de dias no período com pelo menos 1 virtude
      const diasAtivos = Object.keys(porDia).length;
      const totalRegistros = regsPerido.length;

      const filtradas = filtroVirtude ? stats.filter(v => v.id === filtroVirtude) : stats;

      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2><i data-lucide="bar-chart-2"></i> Relatório de Virtudes</h2>
            <a href="#virtudes" class="btn btn-secondary btn-sm"><i data-lucide="gem"></i> Check-in</a>
          </div>

          <div class="filtros-bar">
            <div class="form-group-inline">
              <label>Período</label>
              <select id="vrel-periodo" class="form-control-sm">
                <option value="7" ${periodo === 7 ? 'selected' : ''}>7 dias</option>
                <option value="14" ${periodo === 14 ? 'selected' : ''}>14 dias</option>
                <option value="30" ${periodo === 30 ? 'selected' : ''}>30 dias</option>
                <option value="60" ${periodo === 60 ? 'selected' : ''}>60 dias</option>
                <option value="90" ${periodo === 90 ? 'selected' : ''}>90 dias</option>
              </select>
            </div>
            <div class="form-group-inline">
              <label>Virtude</label>
              <select id="vrel-virtude" class="form-control-sm">
                <option value="">Todas</option>
                ${virtudes.map(v => `<option value="${H.esc(v.id)}" ${filtroVirtude === v.id ? 'selected' : ''}>${H.esc(v.nome)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="stats-cards">
            <div class="stat-card"><div class="stat-value">${totalRegistros}</div><div class="stat-label">Práticas no período</div></div>
            <div class="stat-card"><div class="stat-value">${diasAtivos}</div><div class="stat-label">Dias com prática</div></div>
            <div class="stat-card"><div class="stat-value">${virtudes.length > 0 ? Math.round((diasAtivos / periodo) * 100) : 0}%</div><div class="stat-label">Consistência</div></div>
            <div class="stat-card"><div class="stat-value">${stats[0]?.nome || '—'}</div><div class="stat-label">Virtude mais praticada</div></div>
          </div>

          <div class="vrel-section-title">Por Categoria (${periodo} dias)</div>
          <div class="virtudes-cat-bars">
            ${Object.entries(statsCat).filter(([, s]) => s.max > 0).map(([cat, s]) => `
              <div class="vcat-bar-item">
                <span class="vcat-bar-label" style="color:${s.cor}">${H.esc(s.label)}</span>
                <div class="vcat-bar-track">
                  <div class="vcat-bar-fill" style="width:${s.pct}%;background:${s.cor}"></div>
                </div>
                <span class="vcat-bar-pct">${s.pct}%</span>
              </div>`).join('')}
          </div>

          <div class="vrel-section-title">Virtudes — ${periodo} dias</div>
          <div class="vrel-table-wrap">
            <table class="data-table">
              <thead><tr>
                <th>Virtude</th><th>Categoria</th><th>Práticas</th><th>% do período</th><th>Sequência</th>
              </tr></thead>
              <tbody>
                ${filtradas.length === 0
                  ? '<tr><td colspan="5" class="text-center text-muted">Sem registros no período</td></tr>'
                  : filtradas.map(v => `
                    <tr>
                      <td><span style="color:${H.esc(v.cor || '#64748b')};font-size:1.1rem">${H.esc(v.icone || '✦')}</span> ${H.esc(v.nome)}</td>
                      <td><span class="badge" style="background:${getCatColor(v.categoria)}22;color:${getCatColor(v.categoria)}">${H.esc(v.categoria || 'Outro')}</span></td>
                      <td>${v.total}</td>
                      <td>
                        <div class="mini-bar"><div class="mini-bar-fill" style="width:${v.pct}%;background:${H.esc(v.cor || '#64748b')}"></div></div>
                        ${v.pct}%
                      </td>
                      <td>${v.streak > 0 ? `🔥 ${v.streak} dias` : '—'}</td>
                    </tr>`).join('')}
              </tbody>
            </table>
          </div>

          ${topDias.length > 0 ? `
            <div class="vrel-section-title">Dias mais virtuosos</div>
            <div class="top-dias-grid">
              ${topDias.map(([data, qtd]) => `
                <div class="top-dia-card">
                  <div class="top-dia-data">${H.esc(new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }))}</div>
                  <div class="top-dia-qtd">${qtd} virtude${qtd > 1 ? 's' : ''}</div>
                </div>`).join('')}
            </div>` : ''}
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#virtudes-relatorio');

      container.querySelector('#vrel-periodo')?.addEventListener('change', e => { periodo = parseInt(e.target.value); render(); });
      container.querySelector('#vrel-virtude')?.addEventListener('change', e => { filtroVirtude = e.target.value; render(); });
    };

    render();
  };

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     3. CONFIGURAÇÃO DE VIRTUDES
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  PCF.Pages.virtudesConfig = (container) => {
    const render = () => {
      const virtudes = S.getVirtudesConfig();

      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2><i data-lucide="settings"></i> Configurar Virtudes</h2>
            <div class="page-header-actions">
              <a href="#virtudes" class="btn btn-secondary btn-sm"><i data-lucide="gem"></i> Check-in</a>
              <button id="btn-restaurar-virtudes" class="btn btn-outline btn-sm"><i data-lucide="rotate-ccw"></i> Restaurar padrões</button>
              <button id="btn-nova-virtude" class="btn btn-primary btn-sm"><i data-lucide="plus"></i> Nova virtude</button>
            </div>
          </div>

          <div class="info-box">
            <i data-lucide="info"></i>
            Gerencie as virtudes que deseja cultivar diariamente. Clique no ícone de lápis para editar ou no lixo para remover.
          </div>

          <div class="vconfig-table-wrap">
            <table class="data-table">
              <thead><tr>
                <th></th><th>Virtude</th><th>Categoria</th><th>Significado</th><th>Ativo</th><th>Ações</th>
              </tr></thead>
              <tbody id="vconfig-tbody">
                ${virtudes.length === 0
                  ? '<tr><td colspan="6" class="text-center text-muted">Nenhuma virtude cadastrada</td></tr>'
                  : virtudes.map(v => `
                    <tr class="${v.ativo === false ? 'row-inactive' : ''}">
                      <td style="text-align:center;font-size:1.3rem">${H.esc(v.icone || '✦')}</td>
                      <td><strong style="color:${H.esc(v.cor || '#64748b')}">${H.esc(v.nome)}</strong></td>
                      <td><span class="badge" style="background:${getCatColor(v.categoria)}22;color:${getCatColor(v.categoria)}">${H.esc(v.categoria || 'Outro')}</span></td>
                      <td class="text-muted text-sm">${H.esc((v.significado || '').substring(0, 60))}${(v.significado || '').length > 60 ? '…' : ''}</td>
                      <td style="text-align:center">
                        <input type="checkbox" class="virt-ativo-chk" data-id="${H.esc(v.id)}" ${v.ativo !== false ? 'checked' : ''}>
                      </td>
                      <td class="actions-cell">
                        <button class="btn btn-icon btn-ghost btn-edit-virt" data-id="${H.esc(v.id)}" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn btn-icon btn-danger btn-del-virt" data-id="${H.esc(v.id)}" title="Excluir"><i data-lucide="trash-2"></i></button>
                      </td>
                    </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#virtudes-config');
      _bindConfigEvents();
    };

    const _bindConfigEvents = () => {
      container.querySelector('#btn-restaurar-virtudes')?.addEventListener('click', () => {
        if (!confirm('Restaurar as virtudes padrão? As virtudes personalizadas serão removidas.')) return;
        S.restoreDefaultVirtudes();
        render();
      });
      container.querySelector('#btn-nova-virtude')?.addEventListener('click', () => _openModal(null));

      container.querySelectorAll('.btn-edit-virt').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = S.getVirtudesConfig().find(x => x.id === btn.dataset.id);
          if (v) _openModal(v);
        });
      });

      container.querySelectorAll('.btn-del-virt').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!confirm('Excluir esta virtude? Os registros associados permanecerão.')) return;
          S.deleteVirtude(btn.dataset.id);
          render();
        });
      });

      container.querySelectorAll('.virt-ativo-chk').forEach(chk => {
        chk.addEventListener('change', () => {
          S.updateVirtude(chk.dataset.id, { ativo: chk.checked });
          const row = chk.closest('tr');
          if (row) row.classList.toggle('row-inactive', !chk.checked);
        });
      });
    };

    const _openModal = (virtude) => {
      const isEdit = !!virtude;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const catOptions = CATEGORIAS_VIRTUDES.map(c =>
        `<option value="${H.esc(c.id)}" ${virtude?.categoria === c.id ? 'selected' : ''}>${H.esc(c.label)}</option>`
      ).join('');
      overlay.innerHTML = `
        <div class="modal modal-md">
          <h3><i data-lucide="${isEdit ? 'pencil' : 'plus-circle'}"></i> ${isEdit ? 'Editar' : 'Nova'} Virtude</h3>
          <div class="form-row">
            <div class="form-group"><label>Nome *</label>
              <input type="text" id="vm-nome" class="form-control" value="${H.esc(virtude?.nome || '')}" maxlength="60">
            </div>
            <div class="form-group"><label>Ícone</label>
              <input type="text" id="vm-icone" class="form-control" value="${H.esc(virtude?.icone || '✦')}" maxlength="4" style="width:5rem;text-align:center">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Categoria</label>
              <select id="vm-cat" class="form-control">${catOptions}</select>
            </div>
            <div class="form-group"><label>Cor</label>
              <input type="color" id="vm-cor" class="form-control" value="${H.esc(virtude?.cor || '#8b5cf6')}" style="width:4rem;height:2.4rem;padding:2px">
            </div>
          </div>
          <div class="form-group"><label>Significado / Hint</label>
            <textarea id="vm-sig" class="form-control" rows="3" maxlength="300">${H.esc(virtude?.significado || '')}</textarea>
          </div>
          <div id="vm-error" class="alert alert-error" style="display:none"></div>
          <div class="modal-actions">
            <button id="vm-cancel" class="btn btn-secondary">Cancelar</button>
            <button id="vm-save" class="btn btn-primary">Salvar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      if (window.lucide) lucide.createIcons();

      const close = () => overlay.remove();
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
      overlay.querySelector('#vm-cancel').addEventListener('click', close);
      overlay.querySelector('#vm-save').addEventListener('click', () => {
        const nome = overlay.querySelector('#vm-nome').value.trim();
        const errEl = overlay.querySelector('#vm-error');
        if (!nome) { errEl.textContent = 'Nome é obrigatório'; errEl.style.display = 'block'; return; }
        const data = {
          nome,
          icone: overlay.querySelector('#vm-icone').value.trim() || '✦',
          categoria: overlay.querySelector('#vm-cat').value,
          cor: overlay.querySelector('#vm-cor').value,
          significado: overlay.querySelector('#vm-sig').value.trim(),
        };
        if (isEdit) S.updateVirtude(virtude.id, data);
        else S.addVirtude(data);
        close();
        render();
      });
    };

    render();
  };

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     4. BASE DE DADOS (gerenciar registros)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  PCF.Pages.virtudesBase = (container) => {
    let filtroData = '';
    let filtroVirtude = '';

    const render = () => {
      const virtudes = S.getVirtudesConfig();
      const virtMap = {};
      virtudes.forEach(v => { virtMap[v.id] = v; });
      let regs = S.getVirtudesReg().slice().sort((a, b) => b.data.localeCompare(a.data));
      if (filtroData) regs = regs.filter(r => r.data === filtroData);
      if (filtroVirtude) regs = regs.filter(r => r.virtudeId === filtroVirtude);

      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2><i data-lucide="database"></i> Base de Dados — Virtudes</h2>
            <div class="page-header-actions">
              <a href="#virtudes" class="btn btn-secondary btn-sm"><i data-lucide="gem"></i> Check-in</a>
            </div>
          </div>
          <div class="filtros-bar">
            <div class="form-group-inline">
              <label>Data</label>
              <input type="date" id="vbase-date" class="form-control-sm" value="${filtroData}">
            </div>
            <div class="form-group-inline">
              <label>Virtude</label>
              <select id="vbase-virtude" class="form-control-sm">
                <option value="">Todas</option>
                ${virtudes.map(v => `<option value="${H.esc(v.id)}" ${filtroVirtude === v.id ? 'selected' : ''}>${H.esc(v.nome)}</option>`).join('')}
              </select>
            </div>
            <button id="vbase-clear" class="btn btn-ghost btn-sm">Limpar filtros</button>
          </div>
          <p class="vbase-count">${regs.length} registro${regs.length !== 1 ? 's' : ''}</p>
          <div class="table-wrap vbase-table-wrap">
            <table class="data-table">
              <thead><tr>
                <th>Data</th><th>Dia</th><th>Virtude</th><th>Categoria</th><th>Ações</th>
              </tr></thead>
              <tbody>
                ${regs.length === 0
                  ? '<tr><td colspan="5" class="text-center text-muted">Nenhum registro encontrado</td></tr>'
                  : regs.map(r => {
                    const v = virtMap[r.virtudeId] || { nome: 'Virtude removida', icone: '?', cor: '#64748b', categoria: '' };
                    const weekday = new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' });
                    return `
                      <tr>
                        <td>${H.esc(r.data.split('-').reverse().join('/'))}</td>
                        <td class="text-muted text-sm">${weekday}</td>
                        <td><span style="color:${H.esc(v.cor)};margin-right:4px">${H.esc(v.icone || '✦')}</span>${H.esc(v.nome)}</td>
                        <td><span class="badge" style="background:${getCatColor(v.categoria)}22;color:${getCatColor(v.categoria)}">${H.esc(v.categoria || '')}</span></td>
                        <td class="actions-cell"><button class="btn btn-icon btn-danger btn-del-vreg" data-id="${H.esc(r.id)}" title="Excluir registro"><i data-lucide="trash-2"></i></button></td>
                      </tr>`;
                  }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#virtudes-base');
      container.querySelector('#vbase-date')?.addEventListener('change', e => { filtroData = e.target.value; render(); });
      container.querySelector('#vbase-virtude')?.addEventListener('change', e => { filtroVirtude = e.target.value; render(); });
      container.querySelector('#vbase-clear')?.addEventListener('click', () => { filtroData = ''; filtroVirtude = ''; render(); });
      container.querySelectorAll('.btn-del-vreg').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!confirm('Excluir este registro?')) return;
          S.deleteVirtudReg(btn.dataset.id);
          render();
        });
      });
    };

    render();
  };

})();
