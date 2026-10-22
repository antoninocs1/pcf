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

  const pgtoOptions = (selected = '') => H.FORMAS_PAGAMENTO.map(f => `<option value="${f}" ${f === selected ? 'selected' : ''}>${f}</option>`).join('');

  const pgtoFieldsHtml = (prefix, tipoId, t = {}) => {
    const parcelasAtual = Number((/Parcela \d+\/(\d+)/i.exec(t.item || '') || [])[1]) || 1;
    const parcelas = Array.from({ length: 24 }, (_, i) => i + 1)
      .map(n => `<option value="${n}" ${n === parcelasAtual ? 'selected' : ''}>${n === 1 ? 'À vista' : n + 'x'}</option>`).join('');
    return `
      <div class="form-group"><label>Forma de Pagamento</label>
        <div class="pgto-select-wrap">
          <span class="pgto-icon" id="${prefix}-pgto-icon" hidden></span>
          <select id="${prefix}-pgto"><option value="">Selecione...</option>${pgtoOptions(t.formaPagamento)}</select>
        </div>
      </div>
      <div class="form-group"><label>Tipo</label><select id="${tipoId}"><option value="">Selecione...</option>${H.TIPOS_DESPESA.map(f => `<option value="${f}" ${f === t.tipo ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
      <div class="form-group" id="${prefix}-parcelas-group" hidden><label>Parcelamento</label><select id="${prefix}-parcelas">${parcelas}</select></div>`;
  };

  /* Regras do cartão de crédito no formulário de transação:
     - Compra: preenche Item/Descrição com "À vista" ou "Parcela 1/X";
     - Pagamento: fixa a categoria "Pagamento de Fatura de Cartão" com
       subcategoria N/A — e escolher essa categoria seleciona o Pagamento. */
  const bindCartaoCredito = (prefix, setCategoria) => {
    const $ = (id) => document.getElementById(`${prefix}-${id}`);
    const pgto = $('pgto'), parcelas = $('parcelas'), item = $('item'), cat = $('cat');
    let formaAnterior = pgto.value;
    const sync = () => {
      const icon = H.ICONES_PAGAMENTO[pgto.value];
      $('pgto-icon').hidden = !icon;
      if (icon) $('pgto-icon').style.cssText = H.estiloIconePgto(pgto.value);
      $('parcelas-group').hidden = pgto.value !== H.PGTO_CARTAO_COMPRA;
      formaAnterior = pgto.value;
    };
    pgto.addEventListener('change', () => {
      if (pgto.value === H.PGTO_CARTAO_COMPRA) item.value = H.aplicarSufixoParcela(item.value, Number(parcelas.value));
      else if (formaAnterior === H.PGTO_CARTAO_COMPRA) item.value = H.aplicarSufixoParcela(item.value, null);
      if (pgto.value === H.PGTO_CARTAO_PAGAMENTO) setCategoria(H.CAT_PAGAMENTO_FATURA);
      else if (cat.value === H.CAT_PAGAMENTO_FATURA) setCategoria('');
      sync();
    });
    parcelas.addEventListener('change', () => { item.value = H.aplicarSufixoParcela(item.value, Number(parcelas.value)); });
    sync();
    // Chamado sempre que a categoria muda.
    return () => {
      if (cat.value === H.CAT_PAGAMENTO_FATURA && pgto.value !== H.PGTO_CARTAO_PAGAMENTO) {
        if (formaAnterior === H.PGTO_CARTAO_COMPRA) item.value = H.aplicarSufixoParcela(item.value, null);
        pgto.value = H.PGTO_CARTAO_PAGAMENTO;
      } else if (cat.value !== H.CAT_PAGAMENTO_FATURA && pgto.value === H.PGTO_CARTAO_PAGAMENTO) {
        pgto.value = '';
      }
      sync();
    };
  };

  /* Filtros Tipo / Mês / Ano / Categoria: os mesmos no Painel, na Base de Dados
     e no Relatório, salvos por usuário (persistem ao sair e voltar). */
  const filtrosHtml = (prefix, anos, categorias) => {
    const f = S.getFiltrosFinanceiro();
    const opt = (value, label, atual) => `<option value="${H.esc(value)}" ${String(value) === String(atual) ? 'selected' : ''}>${H.esc(label)}</option>`;
    return `
      <select id="${prefix}-tipo"><option value="">Todos os Tipos</option>${[['RECEITA', 'Receita'], ['DESPESA', 'Despesa'], ['INVESTIMENTO', 'Investimento']].map(([v, l]) => opt(v, l, f.tipo)).join('')}</select>
      <select id="${prefix}-mes"><option value="">Todos os Meses</option>${H.MESES.map(m => opt(m, m.charAt(0).toUpperCase() + m.slice(1), f.mes)).join('')}</select>
      <select id="${prefix}-ano"><option value="">Todos os Anos</option>${anos.map(a => opt(a, a, f.ano)).join('')}</select>
      <select id="${prefix}-cat"><option value="">Todas as Categorias</option>${categorias.map(c => opt(c, c, f.cat)).join('')}</select>`;
  };

  const lerFiltros = (prefix) => {
    const v = (k) => document.getElementById(`${prefix}-${k}`)?.value || '';
    return { tipo: v('tipo'), mes: v('mes'), ano: v('ano'), cat: v('cat') };
  };

  const bindFiltros = (prefix, onChange) => {
    ['tipo', 'mes', 'ano', 'cat'].forEach(k => {
      document.getElementById(`${prefix}-${k}`).onchange = () => {
        S.saveFiltrosFinanceiro(lerFiltros(prefix));
        onChange();
      };
    });
  };

  const aplicarFiltros = (lista, { tipo, mes, ano, cat }) => lista.filter(t =>
    (!tipo || t.tipoOperacao === tipo) && (!mes || t.mes === mes) &&
    (!ano || String(t.ano) === String(ano)) && (!cat || t.categoria === cat));

  const categoriasDe = (trans) => [...new Set(trans.map(t => t.categoria).filter(Boolean))].sort();

  /* ---------- Excel (SheetJS, carregado só quando usado) ---------- */
  const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const carregarXLSX = () => window.XLSX ? Promise.resolve(window.XLSX) : new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { s.remove(); reject(new Error('Não foi possível carregar a biblioteca do Excel. Verifique a conexão.')); };
    document.head.appendChild(s);
  });

  const COLUNAS_EXCEL = [
    ['data', 'Data'], ['tipoOperacao', 'Tipo de operação'], ['categoria', 'Categoria'], ['subcategoria', 'Subcategoria'],
    ['item', 'Item'], ['valor', 'Valor'], ['formaPagamento', 'Forma de pagamento'], ['tipo', 'Fixo/variável'],
  ];
  const normalizarCabecalho = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const CAMPO_POR_CABECALHO = {
    ...Object.fromEntries(COLUNAS_EXCEL.map(([campo, titulo]) => [normalizarCabecalho(titulo), campo])),
    tipo: 'tipoOperacao', operacao: 'tipoOperacao', descricao: 'item', itemdescricao: 'item',
    pagamento: 'formaPagamento', fixovariavel: 'tipo',
  };

  const exportarExcel = async () => {
    const XLSX = await carregarXLSX();
    const linhas = [...S.getTransacoes()].sort((a, b) => a.data.localeCompare(b.data)).map(t => ({
      'Data': new Date(t.data + 'T12:00:00'),
      'Tipo de operação': t.tipoOperacao,
      'Categoria': t.categoria || '',
      'Subcategoria': t.subcategoria || '',
      'Item': t.item || '',
      'Valor': t.valor,
      'Forma de pagamento': t.formaPagamento || '',
      'Fixo/variável': t.tipo || '',
    }));
    const ws = XLSX.utils.json_to_sheet(linhas, { header: COLUNAS_EXCEL.map(c => c[1]), dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = [12, 16, 24, 24, 34, 12, 28, 14].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transações');
    XLSX.writeFile(wb, `transacoes-financeiras-${H.hoje()}.xlsx`);
    return linhas.length;
  };

  const lerDataExcel = (XLSX, v) => {
    const pad = (n) => String(n).padStart(2, '0');
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v);
      return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : '';
    }
    const s = String(v || '').trim();
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : '';
  };

  const lerValorExcel = (v) => {
    if (typeof v === 'number') return v;
    let s = String(v || '').replace(/R\$|\s/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s);
  };

  /* Lê a planilha e devolve as transações válidas, as linhas com erro e as
     já existentes na base (puladas para não duplicar ao reimportar). */
  const lerArquivoExcel = async (arquivo) => {
    const XLSX = await carregarXLSX();
    const wb = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhas = ws ? XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }) : [];
    const chave = (t) => [t.data, t.tipoOperacao, t.categoria, t.subcategoria || '', t.item || '', Number(t.valor).toFixed(2), t.formaPagamento || ''].join('|');
    const existentes = new Set(S.getTransacoes().map(chave));
    const novas = [], erros = [];
    let duplicadas = 0;
    linhas.forEach((linha, i) => {
      const r = {};
      Object.entries(linha).forEach(([col, v]) => { const campo = CAMPO_POR_CABECALHO[normalizarCabecalho(col)]; if (campo && !(campo in r)) r[campo] = v; });
      const texto = (v) => String(v ?? '').trim();
      const data = lerDataExcel(XLSX, r.data);
      const tipoOperacao = normalizarCabecalho(r.tipoOperacao).toUpperCase();
      const categoria = texto(r.categoria);
      const valor = lerValorExcel(r.valor);
      const erro = validateTransacaoForm({ data, valor, categoria, tipoOperacao: ['RECEITA', 'DESPESA', 'INVESTIMENTO'].includes(tipoOperacao) ? tipoOperacao : '' });
      if (erro) { erros.push(`Linha ${i + 2}: ${erro}`); return; }
      const info = H.extrairInfoData(data);
      const t = {
        data, dia: info.dia, mes: info.mes, ano: info.ano, tipoOperacao, categoria,
        subcategoria: texto(r.subcategoria), item: texto(r.item), valor: Math.round(valor * 100) / 100,
        formaPagamento: texto(r.formaPagamento), tipo: texto(r.tipo),
      };
      const k = chave(t);
      if (existentes.has(k)) { duplicadas++; return; }
      existentes.add(k);
      novas.push(t);
    });
    return { novas, erros, duplicadas, total: linhas.length };
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
    const todas = S.getTransacoes();
    const trans = H.semPagamentoFatura(todas);
    const faturas = todas.filter(H.ehPagamentoFatura);
    const anos = [...new Set(todas.map(t => t.ano))].sort();
    const salvos = S.getFiltrosFinanceiro();
    const chartVisibility = { receitas: salvos.receitas, despesas: salvos.despesas, investimentos: salvos.investimentos };
    container.innerHTML = `
      <div class="page">
        <div class="finance-sticky">
          <div class="page-header">
            ${financeMenuButton()}
            <h2><i data-lucide="layout-dashboard"></i> Painel financeiro</h2>
            ${financeHomeButton()}
          </div>
          ${PCF.renderFinanceTabs('#dashboard')}
          <div class="finance-tab-controls filters">${filtrosHtml('dash', anos, categoriasDe(todas))}</div>
        </div>
        <div class="cards-grid" id="dash-cards"></div>
        <div class="charts-grid">
          <div class="chart-container"><h3>Despesas por Categoria</h3><canvas id="chart-pie-desp"></canvas></div>
          <div class="chart-container">
            <div class="chart-title-row">
              <h3>Receitas x Despesas por Mês</h3>
              <div class="chart-toggle-group" aria-label="Séries do gráfico mensal">
                <label><input type="checkbox" id="dash-show-receitas" ${chartVisibility.receitas ? 'checked' : ''}> Receitas</label>
                <label><input type="checkbox" id="dash-show-despesas" ${chartVisibility.despesas ? 'checked' : ''}> Despesas</label>
                <label><input type="checkbox" id="dash-show-investimentos" ${chartVisibility.investimentos ? 'checked' : ''}> Investimentos</label>
              </div>
            </div>
            <canvas id="chart-bar-mes"></canvas>
          </div>
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons();
    PCF.activateFinanceTabs(container);

    const refresh = () => {
      const filtros = lerFiltros('dash');
      const f = aplicarFiltros(trans, filtros);

      const r = H.calcularResumo(f);
      document.getElementById('dash-cards').innerHTML = `
        <div class="card card-receita"><div class="card-icon">📈</div><div class="card-info"><span class="card-label">Receitas</span><span class="card-value">${H.formatarMoeda(r.totalReceitas)}</span></div></div>
        <div class="card card-despesa"><div class="card-icon">📉</div><div class="card-info"><span class="card-label">Despesas</span><span class="card-value">${H.formatarMoeda(r.totalDespesas)}</span></div></div>
        <div class="card card-saldo"><div class="card-icon">💰</div><div class="card-info"><span class="card-label">Saldo</span><span class="card-value">${H.formatarMoeda(r.saldo)}</span></div></div>
        <div class="card card-investimento"><div class="card-icon">🐷</div><div class="card-info"><span class="card-label">Investimentos</span><span class="card-value">${H.formatarMoeda(r.totalInvestimentos)}</span></div></div>`;

      // Cartão de crédito: a compra já é a despesa; a fatura paga aparece à parte, fora dos totais.
      const comprasCartao = f.filter(t => t.tipoOperacao === 'DESPESA' && t.formaPagamento === H.PGTO_CARTAO_COMPRA).reduce((s, t) => s + t.valor, 0);
      const faturasPagas = aplicarFiltros(faturas, filtros).reduce((s, t) => s + t.valor, 0);
      if (comprasCartao || faturasPagas) {
        document.getElementById('dash-cards').insertAdjacentHTML('beforeend', `
          <div class="card card-cartao" title="As compras no cartão entram nas Despesas. O pagamento da fatura só quita essas compras, por isso não é somado de novo.">
            <span class="pgto-icon" style="${H.estiloIconePgto(H.PGTO_CARTAO_PAGAMENTO)}"></span>
            <div class="card-info"><span class="card-label">Cartão de crédito</span>
              <span class="card-value">${H.formatarMoeda(comprasCartao)}</span>
              <small class="card-note">compras (já nas despesas) · faturas pagas: ${H.formatarMoeda(faturasPagas)} (fora dos totais)</small>
            </div>
          </div>`);
      }

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
        const datasets = [
          chartVisibility.receitas ? { label: 'Receitas', data: porMes.map(m => m.receitas), backgroundColor: '#16a34a' } : null,
          chartVisibility.despesas ? { label: 'Despesas', data: porMes.map(m => m.despesas), backgroundColor: '#dc2626' } : null,
          chartVisibility.investimentos ? { label: 'Investimentos', data: porMes.map(m => m.investimentos), backgroundColor: '#2563eb' } : null,
        ].filter(Boolean);
        reg(new Chart(document.getElementById('chart-bar-mes'), {
          type: 'bar',
          data: {
            labels: porMes.map(m => m.mes),
            datasets,
          },
          options: { responsive: true, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8', callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } } }, plugins: { legend: { labels: { color: '#94a3b8' } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 11 }, anchor: 'center', formatter: (val) => val > 0 ? H.formatarMoeda(val) : '', display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0 } } },
        }));
      }
    };

    bindFiltros('dash', refresh);
    [
      ['dash-show-receitas', 'receitas'],
      ['dash-show-despesas', 'despesas'],
      ['dash-show-investimentos', 'investimentos'],
    ].forEach(([id, key]) => {
      document.getElementById(id).onchange = (e) => {
        chartVisibility[key] = e.target.checked;
        S.saveFiltrosFinanceiro({ [key]: e.target.checked });
        refresh();
      };
    });
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
          <div class="form-row" id="ins-desp-fields">${pgtoFieldsHtml('ins', 'ins-tipo')}</div>
          <button type="submit" class="btn btn-primary">Registrar Transação</button>
        </form>
      </div>`;

    if (window.lucide) lucide.createIcons();
    PCF.activateFinanceTabs(container);

    const fillSubcats = () => {
      const tipo = document.querySelector('input[name="tipoOp"]:checked').value;
      const cat = cats.find(c => c.tipoOperacao === tipo && c.categoria === document.getElementById('ins-cat').value);
      const subs = (cat?.subcategorias || []).map(s => typeof s === 'string' ? { nome: s, tipo: '' } : s);
      document.getElementById('ins-subcat').innerHTML = subs.length ? '<option value="">Selecione...</option>' + subs.map(s => `<option value="${H.esc(s.nome)}">${H.esc(s.nome)}</option>`).join('') : '<option value="">N/A</option>';
      const tipoSel = document.getElementById('ins-tipo');
      if (tipoSel) tipoSel.value = '';
    };
    const onCategoria = bindCartaoCredito('ins', (nome) => {
      document.getElementById('ins-cat').value = nome;
      fillSubcats();
    });

    const updateCats = () => {
      const tipo = document.querySelector('input[name="tipoOp"]:checked').value;
      const filtered = cats.filter(c => c.tipoOperacao === tipo);
      const catSel = document.getElementById('ins-cat');
      catSel.innerHTML = '<option value="">Selecione...</option>' + filtered.map(c => `<option value="${H.esc(c.categoria)}">${H.esc(c.categoria)}</option>`).join('');
      document.getElementById('ins-subcat').innerHTML = '<option value="">N/A</option>';
      document.getElementById('ins-desp-fields').style.display = tipo === 'DESPESA' ? '' : 'none';
      onCategoria();
    };

    document.querySelectorAll('input[name="tipoOp"]').forEach(r => {
      r.onchange = () => {
        document.querySelectorAll('.radio-label').forEach(l => l.classList.remove('selected'));
        r.parentElement.classList.add('selected');
        updateCats();
      };
    });

    document.getElementById('ins-cat').onchange = () => {
      fillSubcats();
      onCategoria();
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
              <span class="badge finance-count-badge" id="base-count"></span>
              <span class="badge finance-subtotal-badge" id="base-subtotal"></span>
              <div class="base-acoes">
                <button type="button" class="btn btn-primary" id="base-nova-transacao">
                  <i data-lucide="plus"></i> Nova transação financeira
                </button>
                <button type="button" class="btn btn-secondary btn-icon-only" id="base-importar" title="Importar transações de arquivo Excel" aria-label="Importar transações de arquivo Excel">
                  <i data-lucide="file-up"></i>
                </button>
                <button type="button" class="btn btn-secondary btn-icon-only" id="base-exportar" title="Exportar transações para arquivo Excel" aria-label="Exportar transações para arquivo Excel">
                  <i data-lucide="file-down"></i>
                </button>
                <input type="file" id="base-arquivo" accept=".xlsx,.xls,.csv" hidden>
              </div>
            </div>
            <div class="filters">${filtrosHtml('base', anos, categoriasDe(trans))}</div>
          </div>
          <div class="table-container finance-data-table finance-transactions-table"><table class="table">
            <thead><tr><th>Data</th><th class="col-hide-mobile">Dia</th><th class="col-hide-mobile">Mês</th><th class="col-hide-mobile">Ano</th><th>Tipo</th><th>Categoria</th><th class="col-hide-mobile">Subcategoria</th><th class="col-hide-mobile">Item</th><th>Valor</th><th class="col-hide-mobile">Forma de pagamento</th><th class="col-hide-mobile">Fixo/variável</th><th style="width:80px">Ações</th></tr></thead>
            <tbody id="base-tbody"></tbody>
          </table></div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.activateFinanceTabs(container);

      const filterAndRender = () => {
        let f = aplicarFiltros(trans, lerFiltros('base'));
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
        const subtotal = f.reduce((s, t) => s + t.valor, 0);
        const subtotalClass = subtotal < 0 ? 'negative' : subtotal > 0 ? 'positive' : '';
        document.getElementById('base-count').textContent = 'Quant.: ' + f.length;
        document.getElementById('base-subtotal').innerHTML = `Subtotal: <span class="subtotal-value ${subtotalClass}">${H.formatarMoeda(subtotal)}</span>`;
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

      bindFiltros('base', filterAndRender);
      document.getElementById('base-nova-transacao').onclick = () => { location.hash = '#inserir'; };
      const mostrarMsg = (html) => { const m = document.getElementById('base-msg'); if (m) m.innerHTML = html; };
      const msgSucesso = (texto) => `<div class="farol-banner farol-success"><span class="farol-icon">●</span><span class="farol-msg">${H.esc(texto)}</span></div>`;
      const msgErro = (linhas) => `<div class="alert alert-error">${linhas.map(H.esc).join('<br>')}</div>`;
      document.getElementById('base-exportar').onclick = async () => {
        if (!trans.length) { mostrarMsg(msgErro(['Não há transações para exportar.'])); return; }
        try {
          const n = await exportarExcel();
          mostrarMsg(msgSucesso(`${n} transações exportadas para Excel.`));
        } catch (err) {
          console.error('[PCF] Erro ao exportar Excel:', err);
          mostrarMsg(msgErro([err?.message || 'Erro ao exportar para Excel.']));
        }
      };
      const arquivo = document.getElementById('base-arquivo');
      document.getElementById('base-importar').onclick = () => arquivo.click();
      arquivo.onchange = async () => {
        const file = arquivo.files[0];
        arquivo.value = '';
        if (!file) return;
        try {
          const { novas, erros, duplicadas, total } = await lerArquivoExcel(file);
          const avisos = [
            duplicadas ? `${duplicadas} já existente(s) na base, ignorada(s).` : '',
            erros.length ? `${erros.length} linha(s) com erro, ignorada(s).` : '',
          ].filter(Boolean).join('\n');
          const detalheErros = erros.length ? [...erros.slice(0, 5), ...(erros.length > 5 ? [`... e mais ${erros.length - 5} linha(s).`] : [])] : [];
          if (!novas.length) {
            mostrarMsg(msgErro([total ? 'Nenhuma transação nova para importar.' : 'A planilha está vazia.', ...(duplicadas ? [`${duplicadas} já existente(s) na base.`] : []), ...detalheErros]));
            return;
          }
          if (!confirm(`Importar ${novas.length} transação(ões) de "${file.name}"?${avisos ? '\n\n' + avisos : ''}`)) return;
          S.addTransacoesLote(novas);
          render();
          mostrarMsg(msgSucesso(`${novas.length} transação(ões) importada(s) com sucesso.`) + (erros.length ? msgErro(detalheErros) : ''));
        } catch (err) {
          console.error('[PCF] Erro ao importar Excel:', err);
          mostrarMsg(msgErro([err?.message || 'Erro ao ler o arquivo. Verifique se é uma planilha Excel válida.']));
        }
      };
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
          <div class="form-row" id="et-desp-fields" style="${tipoAtual==='DESPESA'?'':'display:none'}">${pgtoFieldsHtml('et', 'et-ftipo', t)}</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="et-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('et-cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const fillEditSubcats = () => {
      const tipo = document.getElementById('et-tipo-op').value;
      const catObj = cats.find(c => c.tipoOperacao === tipo && c.categoria === document.getElementById('et-cat').value);
      const subs = (catObj?.subcategorias || []).map(s => typeof s === 'string' ? { nome: s, tipo: '' } : s);
      document.getElementById('et-subcat').innerHTML = subs.length ? '<option value="">Selecione...</option>'+subs.map(s=>`<option value="${H.esc(s.nome)}">${H.esc(s.nome)}</option>`).join('') : '<option value="">N/A</option>';
      document.getElementById('et-ftipo').value = '';
    };
    const onEditCategoria = bindCartaoCredito('et', (nome) => {
      const catSel = document.getElementById('et-cat');
      if (!nome && !catSel.querySelector('option[value=""]')) catSel.insertAdjacentHTML('afterbegin', '<option value="">Selecione...</option>');
      catSel.value = nome;
      fillEditSubcats();
    });
    document.getElementById('et-tipo-op').onchange = function() {
      const tipo = this.value;
      const fc = cats.filter(c => c.tipoOperacao === tipo);
      document.getElementById('et-cat').innerHTML = fc.map(c=>`<option value="${H.esc(c.categoria)}">${H.esc(c.categoria)}</option>`).join('');
      document.getElementById('et-desp-fields').style.display = tipo === 'DESPESA' ? '' : 'none';
      fillEditSubcats();
      onEditCategoria();
    };
    document.getElementById('et-cat').onchange = () => {
      fillEditSubcats();
      onEditCategoria();
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
    const todas = S.getTransacoes();
    const trans = H.semPagamentoFatura(todas);
    const faturas = todas.filter(H.ehPagamentoFatura);
    const anos = [...new Set(todas.map(t => t.ano))].sort();
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
          <div class="finance-tab-controls filters">${filtrosHtml('rel', anos, categoriasDe(todas))}</div>
        </div>
        <div class="charts-grid">
          <div class="chart-container"><h3>Receitas por Categoria</h3><canvas id="rel-pie-rec"></canvas><div id="rel-tab-rec" class="chart-table"></div></div>
          <div class="chart-container"><h3>Despesas por Categoria</h3><canvas id="rel-pie-desp"></canvas><div id="rel-tab-desp" class="chart-table"></div></div>
          <div class="chart-container"><h3>Top 10 Despesas por Subcategoria</h3><canvas id="rel-bar-sub"></canvas></div>
          <div class="chart-container"><h3>Investimentos</h3><canvas id="rel-pie-inv"></canvas><div id="rel-tab-inv" class="chart-table"></div></div>
          <div class="chart-container"><h3>Receitas por Mês</h3><canvas id="rel-bar-rec-mes"></canvas></div>
          <div class="chart-container"><h3>Despesas por Mês</h3><canvas id="rel-bar-desp-mes"></canvas></div>
          <div class="chart-container"><h3>${H.esc(H.CAT_PAGAMENTO_FATURA)} por Mês</h3><p class="text-muted chart-note">Fora dos totais de despesa: quita compras já lançadas como ${H.esc(H.PGTO_CARTAO_COMPRA)}.</p><canvas id="rel-bar-fatura-mes"></canvas><div id="rel-tab-fatura" class="chart-table"></div></div>
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons();
    PCF.activateFinanceTabs(container);

    const refresh = () => {
      PCF.App.destroyCharts();
      const filtros = lerFiltros('rel');
      const f = aplicarFiltros(trans, filtros);
      const faturasFiltradas = aplicarFiltros(faturas, filtros);

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
      const faturasPagas = faturasFiltradas.reduce((s, t) => s + t.valor, 0);
      if (faturasPagas) {
        document.getElementById('rel-tab-desp').insertAdjacentHTML('beforeend',
          `<div class="chart-table-row text-muted" title="Quita compras já lançadas como despesa (${H.esc(H.PGTO_CARTAO_COMPRA)})"><span>${H.esc(H.CAT_PAGAMENTO_FATURA)} (fora do total)</span><span>${H.formatarMoeda(faturasPagas)}</span><span>—</span></div>`);
      }

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
      const invMap = {};
      f.filter(t => t.tipoOperacao === 'INVESTIMENTO').forEach(t => {
        const key = t.subcategoria ? `${t.categoria} - ${t.subcategoria}` : t.categoria;
        invMap[key] = (invMap[key] || 0) + t.valor;
      });
      const invCatSub = Object.entries(invMap)
        .map(([label, valor]) => ({ label, valor }))
        .sort((a, b) => b.valor - a.valor);
      const totalInv = invCatSub.reduce((s, d) => s + d.valor, 0);
      if (invCatSub.length && document.getElementById('rel-pie-inv')) {
        reg(new Chart(document.getElementById('rel-pie-inv'), {
          type: 'doughnut',
          data: { labels: invCatSub.map(i => i.label), datasets: [{ data: invCatSub.map(i => i.valor), backgroundColor: colors }] },
          options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${H.formatarMoeda(c.raw)}` } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 12 }, formatter: (val, ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total ? ((val / total) * 100).toFixed(1) + '%' : ''; }, display: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total ? (ctx.dataset.data[ctx.dataIndex] / total) > 0.04 : false; } } } },
        }));
      }
      document.getElementById('rel-tab-inv').innerHTML = invCatSub.map(i =>
        `<div class="chart-table-row"><span>${H.esc(i.label)}</span><span>${H.formatarMoeda(i.valor)}</span></div>`
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

      // pagamento de fatura de cartão por mês
      const fatMes = {};
      faturasFiltradas.forEach(t => { fatMes[t.mes] = (fatMes[t.mes] || 0) + t.valor; });
      const fmArr = H.MESES.filter(m => fatMes[m]).map(m => ({ mes: m, valor: fatMes[m] }));
      if (fmArr.length) {
        reg(new Chart(document.getElementById('rel-bar-fatura-mes'), {
          type: 'bar', data: { labels: fmArr.map(m => m.mes), datasets: [{ label: 'Faturas pagas', data: fmArr.map(m => m.valor), backgroundColor: '#8b5cf6' }] },
          options: { responsive: true, plugins: { legend: { display: false }, datalabels: { color: '#fff', font: { weight: 'bold', size: 11 }, anchor: 'center', formatter: (val) => H.formatarMoeda(val) } }, scales: { y: { ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } },
        }));
      }
      const totalFat = fmArr.reduce((s, m) => s + m.valor, 0);
      document.getElementById('rel-tab-fatura').innerHTML = fmArr.map(m =>
        `<div class="chart-table-row"><span>${H.esc(m.mes)}</span><span>${H.formatarMoeda(m.valor)}</span></div>`
      ).join('') + (totalFat ? `<div class="chart-table-row total"><span>Total</span><span>${H.formatarMoeda(totalFat)}</span></div>` : '<div class="empty-text">Nenhum pagamento de fatura no período</div>');
    };

    bindFiltros('rel', refresh);
    refresh();
  };

  /* ==================== CICLO DO DINHEIRO ==================== */
  PCF.Pages.ciclo = (container) => {
    const trans = H.semPagamentoFatura(S.getTransacoes());
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
