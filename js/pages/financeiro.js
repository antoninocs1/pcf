/* ========================================================
   PCF - pages/financeiro.js — Dashboard, Inserir, Base, Relatórios, Ciclo
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;
  const reg = PCF.App.registerChart;
  const FIN_SUCCESS_KEY = 'pcf_financeiro_success';
  const FINANCE_TABS = [
    { hash: '#dashboard', icon: 'layout-dashboard', label: 'Painel' },
    { hash: '#inserir', icon: 'plus-circle', label: 'Inserir' },
    { hash: '#base', icon: 'database', label: 'Base de Dados' },
    { hash: '#relatorios', icon: 'trending-up', label: 'Relatórios' },
    { hash: '#ciclo', icon: 'circle-dollar-sign', label: '4 Forças' },
    { hash: '#categorias', icon: 'folder', label: 'Categorias' },
  ];

  PCF.renderFinanceTabs = (activeHash) => `
    <div class="finance-tabs gb-tabs" aria-label="Navegação financeira">
      ${FINANCE_TABS.map(tab => `
        <a class="finance-tab gb-tab${tab.hash === activeHash ? ' active' : ''}" href="${tab.hash}">
          <i data-lucide="${tab.icon}"></i> ${tab.label}
        </a>`).join('')}
    </div>`;

  PCF.activateFinanceTabs = (container) => {
    container.querySelector('.finance-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    container.querySelectorAll('.finance-menu-button').forEach(btn => {
      btn.onclick = () => { document.getElementById('sidebar-toggle')?.click(); };
    });
    container.querySelectorAll('.finance-home-button').forEach(btn => {
      btn.onclick = () => { location.hash = '#home'; };
    });
  };

  const financeMenuButton = () => `
    <button type="button" class="finance-header-button finance-menu-button" title="Abrir menu" aria-label="Abrir menu">
      <i data-lucide="menu"></i>
    </button>`;

  const financeHomeButton = () => `
    <button type="button" class="finance-header-button finance-home-button" title="Tela Inicial" aria-label="Tela Inicial">
      <i data-lucide="home"></i>
    </button>`;

  const setFieldError = (targetId, message) => {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.innerHTML = message ? `<div class="alert alert-error">${H.esc(message)}</div>` : '';
  };

  const validateTransacaoForm = ({ data, valor, categoria, tipoOperacao }) => {
    if (!tipoOperacao) return 'Selecione o tipo de operacao.';
    if (!data || Number.isNaN(new Date(data + 'T12:00:00').getTime())) return 'Informe uma data valida.';
    if (!categoria) return 'Selecione uma categoria.';
    if (!Number.isFinite(valor) || valor <= 0) return 'Informe um valor maior que zero.';
    return '';
  };

  const saveFinanceSuccess = (transactionId) => {
    sessionStorage.setItem(FIN_SUCCESS_KEY, JSON.stringify({
      message: 'Transação registrada com sucesso',
      transactionId,
    }));
  };

  const consumeFinanceSuccess = () => {
    const raw = sessionStorage.getItem(FIN_SUCCESS_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FIN_SUCCESS_KEY);
    try { return JSON.parse(raw); }
    catch (_) { return null; }
  };

  /* ==================== DASHBOARD ==================== */
  PCF.Pages.dashboard = (container) => {
    const trans = S.getTransacoes();
    const anos = [...new Set(trans.map(t => t.ano))].sort();
    container.innerHTML = `
      <div class="page">
        <div class="finance-sticky">
          <div class="page-header">
            ${financeMenuButton()}
            <h2><i data-lucide="layout-dashboard"></i> Painel financeiro</h2>
            ${financeHomeButton()}
          </div>
          ${PCF.renderFinanceTabs('#dashboard')}
          <div class="finance-tab-controls filters">
            <select id="dash-ano"><option value="">Todos os Anos</option>${anos.map(a => `<option value="${a}">${a}</option>`).join('')}</select>
            <select id="dash-mes"><option value="">Todos os Meses</option>${H.MESES.map(m => `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="cards-grid" id="dash-cards"></div>
        <div class="charts-grid">
          <div class="chart-container"><h3>Despesas por Categoria</h3><canvas id="chart-pie-desp"></canvas></div>
          <div class="chart-container"><h3>Receitas x Despesas por Mês</h3><canvas id="chart-bar-mes"></canvas></div>
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons();
    PCF.activateFinanceTabs(container);

    const refresh = () => {
      const mes = document.getElementById('dash-mes')?.value || '';
      const ano = document.getElementById('dash-ano')?.value || '';
      let f = trans;
      if (mes) f = f.filter(t => t.mes === mes);
      if (ano) f = f.filter(t => t.ano === Number(ano));

      const r = H.calcularResumo(f);
      document.getElementById('dash-cards').innerHTML = `
        <div class="card card-receita"><div class="card-icon">📈</div><div class="card-info"><span class="card-label">Receitas</span><span class="card-value">${H.formatarMoeda(r.totalReceitas)}</span></div></div>
        <div class="card card-despesa"><div class="card-icon">📉</div><div class="card-info"><span class="card-label">Despesas</span><span class="card-value">${H.formatarMoeda(r.totalDespesas)}</span></div></div>
        <div class="card card-saldo"><div class="card-icon">💰</div><div class="card-info"><span class="card-label">Saldo</span><span class="card-value">${H.formatarMoeda(r.saldo)}</span></div></div>
        <div class="card card-investimento"><div class="card-icon">🐷</div><div class="card-info"><span class="card-label">Investimentos</span><span class="card-value">${H.formatarMoeda(r.totalInvestimentos)}</span></div></div>`;

      // gráfico pizza despesas
      PCF.App.destroyCharts();
      const despCat = H.agruparPorCategoria(f, 'DESPESA');
      if (despCat.length && document.getElementById('chart-pie-desp')) {
        const colors = ['#2563eb','#16a34a','#dc2626','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48'];
        reg(new Chart(document.getElementById('chart-pie-desp'), {
          type: 'pie',
          data: { labels: despCat.map(d => d.categoria), datasets: [{ data: despCat.map(d => d.valor), backgroundColor: colors.slice(0, despCat.length) }] },
          options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${H.formatarMoeda(c.raw)}` } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 12 }, formatter: (val, ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total ? ((val / total) * 100).toFixed(1) + '%' : ''; }, display: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total ? (ctx.dataset.data[ctx.dataIndex] / total) > 0.04 : false; } } } },
        }));
      }
      // gráfico barras por mês
      const porMes = H.agruparPorMes(f);
      if (porMes.length && document.getElementById('chart-bar-mes')) {
        reg(new Chart(document.getElementById('chart-bar-mes'), {
          type: 'bar',
          data: {
            labels: porMes.map(m => m.mes),
            datasets: [
              { label: 'Receitas', data: porMes.map(m => m.receitas), backgroundColor: '#16a34a' },
              { label: 'Despesas', data: porMes.map(m => m.despesas), backgroundColor: '#dc2626' },
              { label: 'Investimentos', data: porMes.map(m => m.investimentos), backgroundColor: '#2563eb' },
            ],
          },
          options: { responsive: true, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8', callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } } }, plugins: { legend: { labels: { color: '#94a3b8' } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 11 }, anchor: 'center', formatter: (val) => val > 0 ? H.formatarMoeda(val) : '', display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0 } } },
        }));
      }
    };

    document.getElementById('dash-ano').onchange = refresh;
    document.getElementById('dash-mes').onchange = refresh;
    refresh();
  };

  /* ==================== INSERIR ==================== */
  PCF.Pages.inserir = (container) => {
    const cats = S.getCategorias();
    container.innerHTML = `
      <div class="page">
        <div class="finance-sticky finance-sticky-compact">
          <div class="page-header">
            ${financeMenuButton()}
            <h2><i data-lucide="plus-circle"></i> Inserir Transação Financeira</h2>
            ${financeHomeButton()}
          </div>
          ${PCF.renderFinanceTabs('#inserir')}
        </div>
        <div id="inserir-msg"></div>
        <form id="form-inserir" class="form" novalidate>
          <div class="form-group"><label>Tipo de Operação</label>
            <div class="radio-group">
              <label class="radio-label selected"><input type="radio" name="tipoOp" value="DESPESA" checked>DESPESA</label>
              <label class="radio-label"><input type="radio" name="tipoOp" value="RECEITA">RECEITA</label>
              <label class="radio-label"><input type="radio" name="tipoOp" value="INVESTIMENTO">INVESTIMENTO</label>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Data</label><input type="date" id="ins-data" value="${H.hoje()}" required></div>
            <div class="form-group"><label>Valor (R$)</label><input type="number" id="ins-valor" step="0.01" min="0" placeholder="0,00" required></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Categoria</label><select id="ins-cat" required><option value="">Selecione...</option></select></div>
            <div class="form-group"><label>Subcategoria</label><select id="ins-subcat"><option value="">N/A</option></select></div>
          </div>
          <div class="form-group"><label>Item / Descrição</label><input type="text" id="ins-item" placeholder="Descrição do lançamento"></div>
          <div class="form-row" id="ins-desp-fields">
            <div class="form-group"><label>Forma de Pagamento</label><select id="ins-pgto"><option value="">Selecione...</option>${H.FORMAS_PAGAMENTO.map(f => `<option value="${f}">${f}</option>`).join('')}</select></div>
            <div class="form-group"><label>Tipo</label><select id="ins-tipo"><option value="">Selecione...</option>${H.TIPOS_DESPESA.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
          </div>
          <button type="submit" class="btn btn-primary">Registrar Transação</button>
        </form>
      </div>`;

    if (window.lucide) lucide.createIcons();
    PCF.activateFinanceTabs(container);

    const updateCats = () => {
      const tipo = document.querySelector('input[name="tipoOp"]:checked').value;
      const filtered = cats.filter(c => c.tipoOperacao === tipo);
      const catSel = document.getElementById('ins-cat');
      catSel.innerHTML = '<option value="">Selecione...</option>' + filtered.map(c => `<option value="${H.esc(c.categoria)}">${H.esc(c.categoria)}</option>`).join('');
      document.getElementById('ins-subcat').innerHTML = '<option value="">N/A</option>';
      document.getElementById('ins-desp-fields').style.display = tipo === 'DESPESA' ? '' : 'none';
    };

    document.querySelectorAll('input[name="tipoOp"]').forEach(r => {
      r.onchange = () => {
        document.querySelectorAll('.radio-label').forEach(l => l.classList.remove('selected'));
        r.parentElement.classList.add('selected');
        updateCats();
      };
    });

    document.getElementById('ins-cat').onchange = () => {
      const tipo = document.querySelector('input[name="tipoOp"]:checked').value;
      const cat = cats.find(c => c.tipoOperacao === tipo && c.categoria === document.getElementById('ins-cat').value);
      const subs = (cat?.subcategorias || []).map(s => typeof s === 'string' ? { nome: s, tipo: '' } : s);
      document.getElementById('ins-subcat').innerHTML = subs.length ? '<option value="">Selecione...</option>' + subs.map(s => `<option value="${H.esc(s.nome)}">${H.esc(s.nome)}</option>`).join('') : '<option value="">N/A</option>';
      const tipoSel = document.getElementById('ins-tipo');
      if (tipoSel) tipoSel.value = '';
    };

    document.getElementById('ins-subcat').onchange = () => {
      const tipo = document.querySelector('input[name="tipoOp"]:checked').value;
      const cat = cats.find(c => c.tipoOperacao === tipo && c.categoria === document.getElementById('ins-cat').value);
      const subcatNome = document.getElementById('ins-subcat').value;
      const subs = cat?.subcategorias || [];
      const subcat = subs.find(s => (typeof s === 'string' ? s : s.nome) === subcatNome);
      const tipoSubcat = (subcat && typeof subcat !== 'string') ? subcat.tipo : '';
      const tipoSel = document.getElementById('ins-tipo');
      if (tipoSel && tipoSubcat) tipoSel.value = tipoSubcat;
    };

    updateCats();

    document.getElementById('form-inserir').onsubmit = (e) => {
      e.preventDefault();
      setFieldError('inserir-msg', '');
      const data = document.getElementById('ins-data').value;
      const tipoOperacao = document.querySelector('input[name="tipoOp"]:checked')?.value || '';
      const categoria = document.getElementById('ins-cat').value;
      const valor = parseFloat(document.getElementById('ins-valor').value);
      const validationError = validateTransacaoForm({ data, valor, categoria, tipoOperacao });
      if (validationError) {
        setFieldError('inserir-msg', validationError);
        return;
      }
      const info = H.extrairInfoData(data);
      try {
        const beforeIds = new Set(S.getTransacoes().map(t => t.id));
        const all = S.addTransacao({
          data, dia: info.dia, mes: info.mes, ano: info.ano,
          tipoOperacao,
          categoria,
          subcategoria: document.getElementById('ins-subcat').value,
          item: document.getElementById('ins-item').value.trim(),
          valor,
          formaPagamento: document.getElementById('ins-pgto').value,
          tipo: document.getElementById('ins-tipo').value,
        });
        const inserted = [...all].reverse().find(t => !beforeIds.has(t.id));
        e.target.reset();
        document.querySelector('input[name="tipoOp"][value="DESPESA"]').checked = true;
        document.querySelectorAll('.radio-label').forEach(l => l.classList.remove('selected'));
        document.querySelector('input[name="tipoOp"][value="DESPESA"]').parentElement.classList.add('selected');
        document.getElementById('ins-data').value = H.hoje();
        updateCats();
        saveFinanceSuccess(inserted?.id || '');
        location.hash = '#base';
      } catch (err) {
        console.error('[PCF] Erro ao registrar transacao:', err);
        setFieldError('inserir-msg', err?.message || 'Erro ao registrar transacao. Verifique os campos e tente novamente.');
      }
    };
  };

  /* ==================== BASE DE DADOS ==================== */
  PCF.Pages.base = (container) => {
    const success = consumeFinanceSuccess();
    const render = () => {
      const trans = S.getTransacoes();
      const categorias = [...new Set(trans.map(t => t.categoria))].sort();
      const anos = [...new Set(trans.map(t => t.ano).filter(Boolean))].sort((a, b) => b - a);
      container.innerHTML = `
        <div class="page">
          <div class="finance-sticky">
            <div class="page-header">
              ${financeMenuButton()}
              <h2><i data-lucide="database"></i> Base de Dados Financeira</h2>
              ${financeHomeButton()}
            </div>
            ${PCF.renderFinanceTabs('#base')}
            <div id="base-msg">${success ? `<div class="farol-banner farol-success"><span class="farol-icon">●</span><span class="farol-msg">${H.esc(success.message)}</span></div>` : ''}</div>
            <div class="finance-tab-controls page-actions">
              <span class="badge" id="base-subtotal"></span>
              <button type="button" class="btn btn-primary" id="base-nova-transacao">
                <i data-lucide="plus"></i> Nova transação financeira
              </button>
            </div>
            <div class="filters">
              <select id="base-tipo"><option value="">Todos os Tipos</option><option value="RECEITA">Receita</option><option value="DESPESA">Despesa</option><option value="INVESTIMENTO">Investimento</option></select>
              <select id="base-mes"><option value="">Todos os Meses</option>${H.MESES.map(m => `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('')}</select>
              <select id="base-ano"><option value="">Todos os Anos</option>${anos.map(a => `<option value="${a}">${a}</option>`).join('')}</select>
              <select id="base-cat"><option value="">Todas as Categorias</option>${categorias.map(c => `<option value="${H.esc(c)}">${H.esc(c)}</option>`).join('')}</select>
            </div>
          </div>
          <div class="table-container finance-data-table"><table class="table">
            <thead><tr><th>Data</th><th class="col-hide-mobile">Dia</th><th class="col-hide-mobile">Mês</th><th class="col-hide-mobile">Ano</th><th>Tipo</th><th>Categoria</th><th class="col-hide-mobile">Subcategoria</th><th class="col-hide-mobile">Item</th><th>Valor</th><th class="col-hide-mobile">Forma de pagamento</th><th class="col-hide-mobile">Fixo/variável</th><th style="width:80px">Ações</th></tr></thead>
            <tbody id="base-tbody"></tbody>
          </table></div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.activateFinanceTabs(container);

      const filterAndRender = () => {
        const tipo = document.getElementById('base-tipo').value;
        const mes = document.getElementById('base-mes').value;
        const ano = document.getElementById('base-ano').value;
        const cat = document.getElementById('base-cat').value;
        let f = trans;
        if (tipo) f = f.filter(t => t.tipoOperacao === tipo);
        if (mes) f = f.filter(t => t.mes === mes);
        if (ano) f = f.filter(t => String(t.ano) === ano);
        if (cat) f = f.filter(t => t.categoria === cat);
        f.sort((a, b) => a.data.localeCompare(b.data));
        if (success?.transactionId && !f.some(t => t.id === success.transactionId)) {
          const inserted = trans.find(t => t.id === success.transactionId);
          if (inserted) f = [inserted, ...f];
        }
        if (success?.transactionId) {
          f.sort((a, b) => {
            if (a.id === success.transactionId) return -1;
            if (b.id === success.transactionId) return 1;
            return a.data.localeCompare(b.data);
          });
        }
        document.getElementById('base-subtotal').textContent = 'Subtotal: ' + H.formatarMoeda(f.reduce((s, t) => s + t.valor, 0));
        document.getElementById('base-tbody').innerHTML = f.length === 0
          ? '<tr><td colspan="12" class="empty-text">Nenhuma transação encontrada</td></tr>'
          : f.map(t => `<tr class="${success?.transactionId === t.id ? 'highlight inserted-highlight' : ''}">
              <td>${H.formatarData(t.data)}</td><td class="col-hide-mobile">${t.dia}</td><td class="col-hide-mobile">${H.esc(t.mes)}</td><td class="col-hide-mobile">${t.ano}</td>
              <td><span class="tipo-badge ${t.tipoOperacao.toLowerCase()}">${t.tipoOperacao}</span></td>
              <td>${H.esc(t.categoria)}</td><td class="col-hide-mobile">${H.esc(t.subcategoria)}</td><td class="col-hide-mobile">${H.esc(t.item)}</td>
              <td class="valor">${H.formatarMoeda(t.valor)}</td><td class="col-hide-mobile">${H.esc(t.formaPagamento)}</td><td class="col-hide-mobile">${H.esc(t.tipo)}</td>
              <td><button class="btn-icon" data-edit="${t.id}" title="Editar"><i data-lucide="pencil"></i></button><button class="btn-icon btn-danger" data-del="${t.id}" title="Remover"><i data-lucide="trash-2"></i></button></td>
            </tr>`).join('');
      };

      ['base-tipo', 'base-mes', 'base-ano', 'base-cat'].forEach(id => document.getElementById(id).onchange = filterAndRender);
      document.getElementById('base-nova-transacao').onclick = () => { location.hash = '#inserir'; };
      container.onclick = (e) => {
        const editBtn = e.target.closest('[data-edit]');
        if (editBtn) { const t = trans.find(t => t.id === editBtn.dataset.edit); if (t) showEditTransModal(t, render); return; }
        const btn = e.target.closest('[data-del]');
        if (btn && confirm('Remover esta transação?')) { S.deleteTransacao(btn.dataset.del); render(); }
      };
      filterAndRender();
      if (success?.transactionId) {
        requestAnimationFrame(() => {
          const row = document.querySelector('.inserted-highlight');
          if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      }
      if (success) setTimeout(() => { const m = document.getElementById('base-msg'); if (m) m.innerHTML = ''; }, 5000);
    };
    render();
  };

  const showEditTransModal = (t, onSave) => {
    const cats = S.getCategorias();
    const tipoAtual = t.tipoOperacao;
    const catsDoTipo = cats.filter(c => c.tipoOperacao === tipoAtual);
    const catObj = catsDoTipo.find(c => c.categoria === t.categoria);
    const subsDoObj = (catObj?.subcategorias || []).map(s => typeof s === 'string' ? { nome: s, tipo: '' } : s);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal-lg">
        <h3>Editar Transação</h3>
        <div id="edit-trans-msg"></div>
        <form id="edit-trans-form" novalidate>
          <div class="form-row">
            <div class="form-group"><label>Data</label><input type="date" id="et-data" value="${t.data}" required></div>
            <div class="form-group"><label>Valor (R$)</label><input type="number" id="et-valor" step="0.01" value="${t.valor}" required></div>
          </div>
          <div class="form-group"><label>Tipo de Operação</label>
            <select id="et-tipo-op">
              <option value="DESPESA" ${tipoAtual==='DESPESA'?'selected':''}>DESPESA</option>
              <option value="RECEITA" ${tipoAtual==='RECEITA'?'selected':''}>RECEITA</option>
              <option value="INVESTIMENTO" ${tipoAtual==='INVESTIMENTO'?'selected':''}>INVESTIMENTO</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Categoria</label><select id="et-cat">${catsDoTipo.map(c=>`<option value="${H.esc(c.categoria)}" ${c.categoria===t.categoria?'selected':''}>${H.esc(c.categoria)}</option>`).join('')}</select></div>
            <div class="form-group"><label>Subcategoria</label><select id="et-subcat">${subsDoObj.length ? '<option value="">Selecione...</option>'+subsDoObj.map(s=>`<option value="${H.esc(s.nome)}" ${s.nome===t.subcategoria?'selected':''}>${H.esc(s.nome)}</option>`).join('') : '<option value="">N/A</option>'}</select></div>
          </div>
          <div class="form-group"><label>Item / Descrição</label><input type="text" id="et-item" value="${H.esc(t.item||'')}"></div>
          <div class="form-row" id="et-desp-fields" style="${tipoAtual==='DESPESA'?'':'display:none'}">
            <div class="form-group"><label>Forma de Pagamento</label>
              <select id="et-pgto">${H.FORMAS_PAGAMENTO.map(f=>`<option value="${f}" ${f===t.formaPagamento?'selected':''}>${f}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label>Tipo</label>
              <select id="et-ftipo">${H.TIPOS_DESPESA.map(f=>`<option value="${f}" ${f===t.tipo?'selected':''}>${f}</option>`).join('')}</select>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="et-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('et-cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    document.getElementById('et-tipo-op').onchange = function() {
      const tipo = this.value;
      const fc = cats.filter(c => c.tipoOperacao === tipo);
      document.getElementById('et-cat').innerHTML = fc.map(c=>`<option value="${H.esc(c.categoria)}">${H.esc(c.categoria)}</option>`).join('');
      document.getElementById('et-subcat').innerHTML = '<option value="">N/A</option>';
      document.getElementById('et-desp-fields').style.display = tipo === 'DESPESA' ? '' : 'none';
    };
    document.getElementById('et-cat').onchange = function() {
      const tipo = document.getElementById('et-tipo-op').value;
      const catObj = cats.find(c => c.tipoOperacao === tipo && c.categoria === this.value);
      const subs = (catObj?.subcategorias || []).map(s => typeof s === 'string' ? { nome: s, tipo: '' } : s);
      document.getElementById('et-subcat').innerHTML = subs.length ? '<option value="">Selecione...</option>'+subs.map(s=>`<option value="${H.esc(s.nome)}">${H.esc(s.nome)}</option>`).join('') : '<option value="">N/A</option>';
      document.getElementById('et-ftipo').value = '';
    };
    document.getElementById('et-subcat').onchange = function() {
      const tipo = document.getElementById('et-tipo-op').value;
      const catObj = cats.find(c => c.tipoOperacao === tipo && c.categoria === document.getElementById('et-cat').value);
      const subs = catObj?.subcategorias || [];
      const subcat = subs.find(s => (typeof s === 'string' ? s : s.nome) === this.value);
      const tipoSubcat = (subcat && typeof subcat !== 'string') ? subcat.tipo : '';
      if (tipoSubcat) document.getElementById('et-ftipo').value = tipoSubcat;
    };

    document.getElementById('edit-trans-form').onsubmit = (e) => {
      e.preventDefault();
      setFieldError('edit-trans-msg', '');
      const data = document.getElementById('et-data').value;
      const tipoOperacao = document.getElementById('et-tipo-op').value;
      const categoria = document.getElementById('et-cat').value;
      const valor = parseFloat(document.getElementById('et-valor').value);
      const validationError = validateTransacaoForm({ data, valor, categoria, tipoOperacao });
      if (validationError) {
        setFieldError('edit-trans-msg', validationError);
        return;
      }
      const info = H.extrairInfoData(data);
      try {
        S.updateTransacao(t.id, {
          data, dia: info.dia, mes: info.mes, ano: info.ano,
          tipoOperacao,
          categoria,
          subcategoria: document.getElementById('et-subcat').value,
          item: document.getElementById('et-item').value.trim(),
          valor,
          formaPagamento: document.getElementById('et-pgto').value,
          tipo: document.getElementById('et-ftipo').value,
        });
        overlay.remove();
        onSave();
      } catch (err) {
        console.error('[PCF] Erro ao salvar edicao da transacao:', err);
        setFieldError('edit-trans-msg', err?.message || 'Erro ao salvar a transacao. Verifique os campos e tente novamente.');
      }
    };
  };

  /* ==================== RELATÓRIOS ==================== */
  PCF.Pages.relatorios = (container) => {
    const trans = S.getTransacoes();
    const anos = [...new Set(trans.map(t => t.ano))].sort();
    const colors = ['#2563eb','#16a34a','#dc2626','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48'];

    container.innerHTML = `
      <div class="page">
        <div class="finance-sticky">
          <div class="page-header">
            ${financeMenuButton()}
            <h2><i data-lucide="trending-up"></i> Relatório Financeiro</h2>
            ${financeHomeButton()}
          </div>
          ${PCF.renderFinanceTabs('#relatorios')}
          <div class="finance-tab-controls filters">
            <select id="rel-ano"><option value="">Todos os Anos</option>${anos.map(a => `<option value="${a}">${a}</option>`).join('')}</select>
            <select id="rel-mes"><option value="">Todos os Meses</option>${H.MESES.map(m => `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="charts-grid">
          <div class="chart-container"><h3>Receitas por Categoria</h3><canvas id="rel-pie-rec"></canvas><div id="rel-tab-rec" class="chart-table"></div></div>
          <div class="chart-container"><h3>Despesas por Categoria</h3><canvas id="rel-pie-desp"></canvas><div id="rel-tab-desp" class="chart-table"></div></div>
          <div class="chart-container"><h3>Top 10 Despesas por Subcategoria</h3><canvas id="rel-bar-sub"></canvas></div>
          <div class="chart-container"><h3>Investimentos</h3><div id="rel-tab-inv" class="chart-table"></div></div>
          <div class="chart-container"><h3>Receitas por Mês</h3><canvas id="rel-bar-rec-mes"></canvas></div>
          <div class="chart-container"><h3>Despesas por Mês</h3><canvas id="rel-bar-desp-mes"></canvas></div>
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons();
    PCF.activateFinanceTabs(container);

    const refresh = () => {
      PCF.App.destroyCharts();
      const mes = document.getElementById('rel-mes')?.value;
      const ano = document.getElementById('rel-ano')?.value;
      let f = trans;
      if (mes) f = f.filter(t => t.mes === mes);
      if (ano) f = f.filter(t => t.ano === Number(ano));

      // receitas por cat
      const recCat = H.agruparPorCategoria(f, 'RECEITA');
      const totalRec = recCat.reduce((s, d) => s + d.valor, 0);
      if (recCat.length) {
        reg(new Chart(document.getElementById('rel-pie-rec'), {
          type: 'pie', data: { labels: recCat.map(d => d.categoria), datasets: [{ data: recCat.map(d => d.valor), backgroundColor: colors }] },
          options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 12 }, formatter: (val, ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total ? ((val / total) * 100).toFixed(1) + '%' : ''; }, display: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total ? (ctx.dataset.data[ctx.dataIndex] / total) > 0.04 : false; } } } },
        }));
      }
      document.getElementById('rel-tab-rec').innerHTML = recCat.map(r =>
        `<div class="chart-table-row"><span>${H.esc(r.categoria)}</span><span>${H.formatarMoeda(r.valor)}</span><span>${totalRec ? ((r.valor/totalRec)*100).toFixed(1) : 0}%</span></div>`
      ).join('') + (totalRec ? `<div class="chart-table-row total"><span>Total</span><span>${H.formatarMoeda(totalRec)}</span><span>100%</span></div>` : '');

      // despesas por cat
      const despCat = H.agruparPorCategoria(f, 'DESPESA');
      const totalDesp = despCat.reduce((s, d) => s + d.valor, 0);
      if (despCat.length) {
        reg(new Chart(document.getElementById('rel-pie-desp'), {
          type: 'pie', data: { labels: despCat.map(d => d.categoria), datasets: [{ data: despCat.map(d => d.valor), backgroundColor: colors }] },
          options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 12 }, formatter: (val, ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total ? ((val / total) * 100).toFixed(1) + '%' : ''; }, display: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total ? (ctx.dataset.data[ctx.dataIndex] / total) > 0.04 : false; } } } },
        }));
      }
      document.getElementById('rel-tab-desp').innerHTML = despCat.map(d =>
        `<div class="chart-table-row"><span>${H.esc(d.categoria)}</span><span>${H.formatarMoeda(d.valor)}</span><span>${totalDesp ? ((d.valor/totalDesp)*100).toFixed(1) : 0}%</span></div>`
      ).join('') + (totalDesp ? `<div class="chart-table-row total"><span>Total</span><span>${H.formatarMoeda(totalDesp)}</span><span>100%</span></div>` : '');

      // top subcategorias
      const despSub = {};
      f.filter(t => t.tipoOperacao === 'DESPESA').forEach(t => {
        const k = t.subcategoria || t.categoria;
        despSub[k] = (despSub[k] || 0) + t.valor;
      });
      const top10 = Object.entries(despSub).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (top10.length) {
        reg(new Chart(document.getElementById('rel-bar-sub'), {
          type: 'bar', data: { labels: top10.map(d => d[0]), datasets: [{ data: top10.map(d => d[1]), backgroundColor: '#dc2626' }] },
          options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, datalabels: { color: '#fff', font: { weight: 'bold', size: 11 }, anchor: 'center', formatter: (val) => H.formatarMoeda(val) } }, scales: { x: { ticks: { color: '#94a3b8', callback: v => 'R$' + v } }, y: { ticks: { color: '#94a3b8' } } } },
        }));
      }

      // investimentos
      const invCat = H.agruparPorCategoria(f, 'INVESTIMENTO');
      const totalInv = invCat.reduce((s, d) => s + d.valor, 0);
      document.getElementById('rel-tab-inv').innerHTML = invCat.map(i =>
        `<div class="chart-table-row"><span>${H.esc(i.categoria)}</span><span>${H.formatarMoeda(i.valor)}</span></div>`
      ).join('') + (totalInv ? `<div class="chart-table-row total"><span>Total</span><span>${H.formatarMoeda(totalInv)}</span></div>` : '<div class="empty-text">Sem dados</div>');

      // receitas por mês
      const recMes = {};
      f.filter(t => t.tipoOperacao === 'RECEITA').forEach(t => { recMes[t.mes] = (recMes[t.mes] || 0) + t.valor; });
      const rmArr = H.MESES.filter(m => recMes[m]).map(m => ({ mes: m, valor: recMes[m] }));
      if (rmArr.length) {
        reg(new Chart(document.getElementById('rel-bar-rec-mes'), {
          type: 'bar', data: { labels: rmArr.map(m => m.mes), datasets: [{ label: 'Receitas', data: rmArr.map(m => m.valor), backgroundColor: '#16a34a' }] },
          options: { responsive: true, plugins: { legend: { display: false }, datalabels: { color: '#fff', font: { weight: 'bold', size: 11 }, anchor: 'center', formatter: (val) => H.formatarMoeda(val) } }, scales: { y: { ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } },
        }));
      }

      // despesas por mês
      const despMes = {};
      f.filter(t => t.tipoOperacao === 'DESPESA').forEach(t => { despMes[t.mes] = (despMes[t.mes] || 0) + t.valor; });
      const dmArr = H.MESES.filter(m => despMes[m]).map(m => ({ mes: m, valor: despMes[m] }));
      if (dmArr.length) {
        reg(new Chart(document.getElementById('rel-bar-desp-mes'), {
          type: 'bar', data: { labels: dmArr.map(m => m.mes), datasets: [{ label: 'Despesas', data: dmArr.map(m => m.valor), backgroundColor: '#dc2626' }] },
          options: { responsive: true, plugins: { legend: { display: false }, datalabels: { color: '#fff', font: { weight: 'bold', size: 11 }, anchor: 'center', formatter: (val) => H.formatarMoeda(val) } }, scales: { y: { ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } },
        }));
      }
    };

    document.getElementById('rel-ano').onchange = refresh;
    document.getElementById('rel-mes').onchange = refresh;
    refresh();
  };

  /* ==================== CICLO DO DINHEIRO ==================== */
  PCF.Pages.ciclo = (container) => {
    const trans = S.getTransacoes();
    const r = H.calcularResumo(trans);
    const pDesp = r.totalReceitas ? ((r.totalDespesas / r.totalReceitas) * 100).toFixed(1) : '0.0';
    const pInv = r.totalReceitas ? ((r.totalInvestimentos / r.totalReceitas) * 100).toFixed(1) : '0.0';
    const pSaldo = r.totalReceitas ? ((r.saldo / r.totalReceitas) * 100).toFixed(1) : '0.0';

    let farolCor, farolIcon, farolMsg;
    if (r.totalReceitas === 0 && r.totalDespesas === 0 && r.totalInvestimentos === 0) {
      farolCor = '#64748b'; // cinza
      farolIcon = '⚪';
      farolMsg = 'Sem informações suficientes para análise.';
    } else if (r.totalReceitas === 0 && r.totalDespesas === 0 && r.totalInvestimentos > 0) {
      farolCor = '#3b82f6'; // azul
      farolIcon = '🔵';
      farolMsg = 'Investimento realizado sem receitas/despesas registradas.';
    } else if (r.totalReceitas > r.totalDespesas) {
      farolCor = '#16a34a';
      farolIcon = '🟢';
      farolMsg = 'Parabéns!!! Você está saudável financeiramente.';
    } else if (r.totalReceitas < r.totalDespesas) {
      farolCor = '#dc2626';
      farolIcon = '🔴';
      farolMsg = 'Alerta!!! Cuidado com os gastos. Busque reorganizar sua vida financeira.';
    } else {
      farolCor = '#f59e0b';
      farolIcon = '🟡';
      farolMsg = 'Atenção!!! Suas receitas são iguais às despesas. Procure economizar.';
    }

    container.innerHTML = `
      <div class="page">
        <div class="finance-sticky">
          <div class="page-header">
            ${financeMenuButton()}
            <h2><i data-lucide="circle-dollar-sign"></i> 4 Forças do Dinheiro</h2>
            ${financeHomeButton()}
          </div>
          ${PCF.renderFinanceTabs('#ciclo')}
        </div>
        <p class="subtitle">Ciclo do Dinheiro — Visão geral das entradas, saídas, investimentos e saldo.</p>

        <div class="farol-banner" style="border-color:${farolCor}; background:${farolCor}15">
          <span class="farol-icon">${farolIcon}</span>
          <span class="farol-msg" style="color:${farolCor}">${farolMsg}</span>
        </div>

        <div class="ciclo-container">
          <div class="ciclo-diagram">
            <div class="ciclo-node ciclo-receita"><span class="ciclo-icon">⬇️</span><span class="ciclo-label">Entrada (Receita)</span><span class="ciclo-valor">${H.formatarMoeda(r.totalReceitas)}</span></div>
            <div class="ciclo-middle">
              <div class="ciclo-node ciclo-investimento"><span class="ciclo-icon">📈</span><span class="ciclo-label">Investimento</span><span class="ciclo-valor">${H.formatarMoeda(r.totalInvestimentos)}</span></div>
              <div class="ciclo-center">⇄</div>
              <div class="ciclo-node ciclo-despesa"><span class="ciclo-icon">⬆️</span><span class="ciclo-label">Saída (Despesas)</span><span class="ciclo-valor">${H.formatarMoeda(r.totalDespesas)}</span></div>
            </div>
            <div class="ciclo-node ciclo-saldo"><span class="ciclo-icon">💰</span><span class="ciclo-label">Saldo</span><span class="ciclo-valor">${H.formatarMoeda(r.saldo)}</span></div>
          </div>
          <div class="ciclo-obs"><strong>Obs.:</strong> A diferença entre o que você ganhou e o que gastou é o seu saldo. Parte pode ser destinada a investimentos.</div>
          <div class="ciclo-percentuais"><h3>Distribuição</h3>
            <div class="percentual-grid">
              <div class="percentual-item"><span class="percentual-label">Despesas / Receitas</span><div class="percentual-bar"><div class="percentual-fill despesa" style="width:${Math.min(pDesp, 100)}%"></div></div><span>${pDesp}%</span></div>
              <div class="percentual-item"><span class="percentual-label">Investimentos / Receitas</span><div class="percentual-bar"><div class="percentual-fill investimento" style="width:${Math.min(pInv, 100)}%"></div></div><span>${pInv}%</span></div>
              <div class="percentual-item"><span class="percentual-label">Saldo / Receitas</span><div class="percentual-bar"><div class="percentual-fill saldo" style="width:${Math.min(Math.max(pSaldo,0), 100)}%"></div></div><span>${pSaldo}%</span></div>
            </div>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
    PCF.activateFinanceTabs(container);
  };
})();
