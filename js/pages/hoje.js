/* ========================================================
   PCF - pages/hoje.js — Painel "Hoje" (aba da tela inicial) e Busca geral
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;

  /* ==================== PAINEL HOJE ==================== */
  const compromissosDeHoje = () => {
    const hoje = H.hoje();
    const pendente = (s) => !s || s === 'Pendente';
    return [
      ...S.getCompromissos().filter(c => c.data === hoje && pendente(c.status))
        .map(c => ({ origem: 'agenda', id: c.id, titulo: c.compromisso, hora: c.hora || '', hash: '#agenda' })),
      ...S.getSaudeEventos().filter(e => e.data === hoje && pendente(e.status))
        .map(e => ({ origem: 'saude', id: e.id, titulo: e.descricao, hora: e.hora || '', hash: '#saude-consultas' })),
      ...S.getPlanoAcoes().filter(a => a.whenDate === hoje && pendente(a.status))
        .map(a => ({ origem: 'plano', id: a.id, titulo: a.what, hora: a.whenTime || '', hash: '#plano-acao' })),
    ].sort((a, b) => a.hora.localeCompare(b.hora));
  };

  const dosesDeHoje = () => {
    const hoje = H.hoje();
    const registros = S.getSaudeDoses();
    return S.getSaudeMedicamentos().filter(m => m.status === 'Em uso')
      .flatMap(med => H.dosesDoDia(med, hoje).map(hora => ({
        med, hora, reg: registros.find(d => d.medId === med.id && d.data === hoje && d.hora === hora),
      })))
      .sort((a, b) => a.hora.localeCompare(b.hora));
  };

  // Quantidade de itens ainda em aberto, exibida na aba
  PCF.Pages.pendenciasHoje = () => {
    const hoje = H.hoje();
    const registros = S.getRegistrosHabitos().filter(r => r.data === hoje && r.completo);
    const habitos = S.getHabitos().filter(h => h.ativo !== false && !registros.some(r => r.habitoId === h.id)).length;
    return habitos + dosesDeHoje().filter(d => !d.reg).length + compromissosDeHoje().length;
  };

  PCF.Pages.painelHoje = (el, aoAlterar) => {
    const render = () => {
      if (!el.isConnected) return;
      const hoje = H.hoje();
      const agoraHora = H.horaAtual();
      const humorSalvo = S.getDiario().find(e => e.data === hoje && (e.tipo || 'diario') === 'diario')?.humor || null;
      const humorSel = humorSalvo || H.sentimentoParaDiario(hoje);
      const humorAtual = H.getHumor(humorSel);
      const pergunta = 'Como você está se sentindo?';

      const doses = dosesDeHoje();
      const habitos = S.getHabitos().filter(h => h.ativo !== false);
      const registros = S.getRegistrosHabitos().filter(r => r.data === hoje);
      const feitos = habitos.filter(h => registros.find(r => r.habitoId === h.id)?.completo).length;
      const compromissos = compromissosDeHoje();

      el.innerHTML = `
        <section class="card hoje-secao">
          <h3><i data-lucide="smile"></i> Sentimento</h3>
          <div class="hoje-sentimento">
            <div class="diario-humor" id="hoje-humor">
              <button type="button" class="diario-humor-btn" id="hoje-humor-btn" aria-haspopup="listbox" aria-expanded="false">
                ${humorAtual ? `<span class="diario-humor-icon">${humorAtual.icon}</span><span>${humorAtual.label}</span>` : `<span class="text-muted">${pergunta}</span>`}
                <i data-lucide="chevron-down"></i>
              </button>
              <div class="diario-humor-list" role="listbox" hidden>
                <div class="diario-humor-list-title">${pergunta}</div>
                ${H.HUMORES.map(h => `
                  <button type="button" role="option" class="diario-humor-opt${h.id === humorSel ? ' selected' : ''}" data-humor="${h.id}" aria-selected="${h.id === humorSel}">
                    <span class="diario-humor-icon">${h.icon}</span><span>${h.label}</span>
                    ${h.id === humorSel ? '<i data-lucide="check-circle-2" class="diario-humor-check"></i>' : ''}
                  </button>`).join('')}
                ${humorSalvo ? '<button type="button" class="diario-humor-opt diario-humor-clear" data-humor=""><span class="text-muted">Limpar seleção</span></button>' : ''}
              </div>
            </div>
            <small class="text-muted">Fica salvo no <a href="#diario">Diário</a> e já vem selecionado em <a href="#emocoes">Emoções</a>.</small>
          </div>
        </section>

        <section class="card hoje-secao">
          <h3><i data-lucide="pill"></i> Doses <span class="badge badge-neutral">${doses.filter(d => d.reg?.status === 'tomado').length} / ${doses.length}</span></h3>
          ${doses.length === 0 ? '<p class="empty-text">Nenhuma dose prevista para hoje.</p>' : `
            <div class="sm-doses">
              ${doses.map(({ med, hora, reg }) => `
                <div class="sm-dose">
                  <strong class="sm-dose-hora">${hora}</strong>
                  <div class="sm-dose-info">
                    <strong>${H.esc(med.nome || '')}</strong>
                    <small>${H.esc(med.dose || '')}</small>
                  </div>
                  ${reg
                    ? `<span class="status-badge" style="background:${reg.status === 'tomado' ? '#16a34a' : '#64748b'}">${reg.status === 'tomado' ? 'Tomada' : 'Pulada'}</span>`
                    : `<span class="status-badge" style="background:${hora <= agoraHora ? '#dc2626' : '#3b82f6'}">${hora <= agoraHora ? 'Atrasada' : 'Próxima'}</span>`}
                  <div class="sm-dose-acoes">
                    ${reg
                      ? `<button type="button" class="btn btn-outline btn-sm" data-hoje-undo="${reg.id}"><i data-lucide="undo-2"></i> Desfazer</button>`
                      : `<button type="button" class="btn btn-primary btn-sm" data-hoje-dose="${med.id}" data-hora="${hora}" data-status="tomado"><i data-lucide="check"></i> Tomado</button>
                         <button type="button" class="btn btn-outline btn-sm" data-hoje-dose="${med.id}" data-hora="${hora}" data-status="pulado">Pular</button>`}
                  </div>
                </div>`).join('')}
            </div>`}
        </section>

        <section class="card hoje-secao">
          <h3><i data-lucide="check-square"></i> Hábitos <span class="badge badge-neutral">${feitos} / ${habitos.length}</span></h3>
          ${habitos.length === 0 ? '<p class="empty-text">Nenhum hábito ativo. <a href="#habitos-config">Cadastrar hábitos</a></p>' : `
            <div class="hoje-lista">
              ${habitos.map(h => {
                const reg = registros.find(r => r.habitoId === h.id);
                const done = !!reg?.completo;
                const porOcorrencia = H.tipoHabito(h) === 'ocorrencias';
                const ok = (reg?.ocorrencias || []).filter(o => o.resultado === 'ok').length;
                return `
                <div class="hoje-item${done ? ' done' : ''}">
                  <button type="button" class="hab-check-btn ${done ? 'checked' : ''}" data-hoje-hab="${h.id}" aria-label="${done ? 'Desmarcar' : 'Marcar'} ${H.esc(h.nome)}">${done ? '<i data-lucide="check"></i>' : ''}</button>
                  <span class="hoje-item-icone">${h.icone || '⭐'}</span>
                  <span class="hoje-item-nome">${H.esc(h.nome)}</span>
                  ${porOcorrencia ? `
                    <span class="text-muted hoje-item-qtd">${ok}/${H.metaOcorrencias(h)}</span>
                    <button type="button" class="btn btn-outline btn-sm" data-hoje-ocorr="${h.id}" title="Registrar uma ocorrência" aria-label="Registrar uma ocorrência de ${H.esc(h.nome)}">+1</button>` : ''}
                </div>`;
              }).join('')}
            </div>`}
        </section>

        <section class="card hoje-secao">
          <h3><i data-lucide="calendar"></i> Compromissos <span class="badge badge-neutral">${compromissos.length}</span></h3>
          ${compromissos.length === 0 ? '<p class="empty-text">Nenhum compromisso pendente para hoje.</p>' : `
            <div class="hoje-lista">
              ${compromissos.map(c => `
                <div class="hoje-item">
                  <button type="button" class="hab-check-btn" data-hoje-comp="${c.id}" data-origem="${c.origem}" aria-label="Concluir ${H.esc(c.titulo || '')}"></button>
                  <span class="sm-dose-hora">${c.hora || '--:--'}</span>
                  <a class="hoje-item-nome" href="${c.hash}">${H.esc(c.titulo || '')}</a>
                </div>`).join('')}
            </div>`}
        </section>`;

      if (window.lucide) lucide.createIcons();

      const wrap = el.querySelector('#hoje-humor');
      const btn = el.querySelector('#hoje-humor-btn');
      const list = wrap.querySelector('.diario-humor-list');
      btn.onclick = (ev) => {
        ev.stopPropagation();
        list.hidden = !list.hidden;
        btn.setAttribute('aria-expanded', String(!list.hidden));
      };
      list.querySelectorAll('[data-humor]').forEach(opt => {
        opt.onclick = () => { H.salvarHumorDiario(hoje, opt.dataset.humor || null); atualizar(); };
      });
    };

    const atualizar = () => { render(); if (aoAlterar) aoAlterar(); };

    el.onclick = (e) => {
      const hoje = H.hoje();
      const dose = e.target.closest('[data-hoje-dose]');
      if (dose) { S.registrarDose({ medId: dose.dataset.hojeDose, data: hoje, hora: dose.dataset.hora, status: dose.dataset.status }); return; }
      const undo = e.target.closest('[data-hoje-undo]');
      if (undo) { S.desfazerDose(undo.dataset.hojeUndo); return; }
      const hab = e.target.closest('[data-hoje-hab]');
      if (hab) { H.alternarHabito(hab.dataset.hojeHab, hoje); atualizar(); return; }
      const ocorr = e.target.closest('[data-hoje-ocorr]');
      if (ocorr) { H.registrarOcorrenciaHabito(ocorr.dataset.hojeOcorr, hoje, 'ok'); atualizar(); return; }
      const comp = e.target.closest('[data-hoje-comp]');
      if (comp) {
        const id = comp.dataset.hojeComp;
        if (comp.dataset.origem === 'agenda') S.updateCompromisso(id, { status: 'Concluído' });
        else if (comp.dataset.origem === 'saude') S.updateSaudeEvento(id, { status: 'Realizado' });
        else S.updatePlanoAcao(id, { status: 'Concluído' });
        atualizar();
      }
    };

    if (PCF._hojeHumorClose) document.removeEventListener('click', PCF._hojeHumorClose);
    PCF._hojeHumorClose = (ev) => {
      const w = document.getElementById('hoje-humor');
      if (w && !w.contains(ev.target)) { const l = w.querySelector('.diario-humor-list'); if (l) l.hidden = true; }
    };
    document.addEventListener('click', PCF._hojeHumorClose);

    // Doses respondidas no aviso global também atualizam o painel
    if (PCF._hojeDosesListener) window.removeEventListener('pcf:doses-changed', PCF._hojeDosesListener);
    PCF._hojeDosesListener = atualizar;
    window.addEventListener('pcf:doses-changed', PCF._hojeDosesListener);

    render();
  };

  /* ==================== BUSCA GERAL ==================== */
  const LIMITE_POR_FONTE = 6;
  const LIMITE_TOTAL = 30;
  const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dataBR = (iso) => iso ? H.formatarData(iso) : '';
  const trecho = (texto, termo) => {
    const t = String(texto || '');
    const i = normalizar(t).indexOf(termo);
    if (i < 0 || t.length <= 70) return t.slice(0, 70);
    const ini = Math.max(0, i - 25);
    return `${ini > 0 ? '…' : ''}${t.slice(ini, ini + 70)}…`;
  };

  // Cada fonte: tipo exibido, tela de destino, registros e como obter título, data e texto pesquisável
  const fontes = () => [
    { tipo: 'Financeiro', hash: '#base', itens: S.getTransacoes(), titulo: t => t.item || t.subcategoria || t.categoria, data: t => t.data, texto: t => [t.item, t.categoria, t.subcategoria] },
    { tipo: 'Medicamento', hash: '#saude-medicamentos', itens: S.getSaudeMedicamentos(), titulo: m => m.nome, data: m => m.dataInicio, texto: m => [m.nome, m.posologia] },
    { tipo: 'Consulta/Exame', hash: '#saude-consultas', itens: S.getSaudeEventos(), titulo: e => e.descricao, data: e => e.data, texto: e => [e.descricao, e.local, e.observacoes] },
    { tipo: 'Vacina', hash: '#saude-vacinas', itens: S.getSaudeVacinas(), titulo: v => v.nome, data: v => v.dataAplicacao, texto: v => [v.nome, v.local] },
    { tipo: 'Sintoma', hash: '#saude-sintomas', itens: S.getSaudeSintomas(), titulo: r => r.sintoma, data: r => r.data, texto: r => [r.sintoma, r.observacao] },
    { tipo: 'Agenda', hash: '#agenda', itens: S.getCompromissos(), titulo: c => c.compromisso, data: c => c.data, texto: c => [c.compromisso] },
    { tipo: 'Plano de Ação', hash: '#plano-acao', itens: S.getPlanoAcoes(), titulo: a => a.what, data: a => a.whenDate, texto: a => [a.what, a.why, a.where, a.how] },
    { tipo: 'Diário', hash: '#diario', itens: S.getDiario(), titulo: e => e.texto, data: e => e.data, texto: e => [e.texto], abrir: e => { PCF._diarioAbrir = { data: e.data, tipo: e.tipo || 'diario' }; } },
    { tipo: 'Emoção', hash: '#emocoes', itens: S.getEmocoes(), titulo: e => e.emocaoSuperior, data: e => e.data, texto: e => [e.emocaoSuperior, e.emocaoMedia, e.emocaoInferior, e.situacaoDescricao] },
    { tipo: 'Hábito', hash: '#habitos', itens: S.getHabitos(), titulo: h => h.nome, data: () => '', texto: h => [h.nome, h.descricao] },
    { tipo: 'Contato', hash: '#contatos', itens: S.getContatos(), titulo: c => c.nome, data: () => '', texto: c => [c.nome, c.email, c.telefone] },
  ];

  PCF.Pages.buscaGeral = (termoBruto, telas) => {
    const termo = normalizar(termoBruto).trim();
    if (termo.length < 2) return [];
    const resultados = telas
      .filter(t => normalizar(t.label).includes(termo))
      .slice(0, 8)
      .map(t => ({ tipo: 'Tela', titulo: t.label, detalhe: '', hash: t.hash }));
    fontes().forEach(f => {
      const achados = f.itens
        .filter(item => f.texto(item).some(v => normalizar(v).includes(termo)))
        .sort((a, b) => String(f.data(b) || '').localeCompare(String(f.data(a) || '')))
        .slice(0, LIMITE_POR_FONTE);
      achados.forEach(item => resultados.push({
        tipo: f.tipo,
        titulo: trecho(f.texto(item).find(v => normalizar(v).includes(termo)) || f.titulo(item), termo),
        detalhe: dataBR(f.data(item)),
        hash: f.hash,
        abrir: f.abrir ? () => f.abrir(item) : null,
      }));
    });
    return resultados.slice(0, LIMITE_TOTAL);
  };
})();
