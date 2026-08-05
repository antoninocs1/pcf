/* ========================================================
   PCF - pages/habitos.js — Acompanhamento de Hábitos Diários
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;

  /* ---- Helpers locais ---- */
  const diasNoMes = (ano, mes) => new Date(ano, mes, 0).getDate();

  const calcStreak = (habitoId, registros) => {
    let streak = 0;
    const d = new Date();
    // Se hoje ainda não foi marcado, começa verificando ontem
    const hoje = d.toISOString().split('T')[0];
    const temHoje = registros.find(r => r.habitoId === habitoId && r.data === hoje && r.completo);
    if (!temHoje) d.setDate(d.getDate() - 1);
    while (true) {
      const iso = d.toISOString().split('T')[0];
      const found = registros.find(r => r.habitoId === habitoId && r.data === iso && r.completo);
      if (!found) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    // Se hoje está marcado, conta hoje também
    if (temHoje) streak = streak; // já incluso
    return streak;
  };

  const getFraseHoje = () => {
    const frases = S.getFrases().filter(f => f.ativo !== false);
    if (!frases.length) return null;
    // Selecionar baseado no número do dia do ano para consistência durante o dia
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const dayOfYear = Math.floor(diff / 86400000);
    return frases[dayOfYear % frases.length];
  };

  /* ---- Componente: banner frase do dia ---- */
  const htmlFraseBanner = (frase) => {
    if (!frase) return '<div id="hab-frase-banner"></div>';
    return `
      <div class="hab-frase-dia" id="hab-frase-banner">
        <div class="hab-frase-icon">💬</div>
        <div class="hab-frase-content">
          <div class="hab-frase-label">FRASE DO DIA</div>
          <div class="hab-frase-texto">"${H.esc(frase.texto)}"</div>
          ${frase.autor ? `<div class="hab-frase-autor">— ${H.esc(frase.autor)}</div>` : ''}
        </div>
        <button type="button" id="btn-outra-frase" class="home-msg-refresh" title="Exibir outra frase aleatória"><i data-lucide="refresh-cw"></i></button>
      </div>`;
  };

  const _sortearFrase = (fraseAtual) => {
    const frases = S.getFrases().filter(f => f.ativo !== false);
    if (frases.length <= 1) return fraseAtual || frases[0] || null;
    let candidata;
    do {
      candidata = frases[Math.floor(Math.random() * frases.length)];
    } while (candidata.id === fraseAtual?.id);
    return candidata;
  };

  const formatTempoHabito = (segundos) => {
    const total = Math.max(0, Math.floor(Number(segundos) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const tipoHabito = (habito) =>
    habito.tipoExecucao || (/água|agua/i.test(habito.nome || '') ? 'ocorrencias' : 'duracao');
  const metaOcorrencias = (habito) =>
    Math.max(1, parseInt(habito.metaDiaria, 10) || (/água|agua/i.test(habito.nome || '') ? 8 : 1));
  const duracaoSegundos = (habito) => Math.max(60, (parseInt(habito.duracaoMinutos, 10) || 1) * 60);
  const momentoAtualHabito = () => {
    const hora = new Date().getHours();
    return hora < 12 ? 'manha' : hora < 18 ? 'tarde' : 'noite';
  };

  /* ======================================================
     1. CHECK-IN DIÁRIO (Dashboard de Hábitos)
     ====================================================== */
  PCF.Pages.habitos = (container) => {
    if (container._habTimerInterval) clearInterval(container._habTimerInterval);
    let selectedDate = H.hoje();
    let fraseExibida = getFraseHoje();
    let timerInterval = null;
    const paineisAbertos = new Set();
    const intensidadeDoSlider = (slider) => {
      if (!slider) return 100;
      const max = Math.max(1, Number(slider.max) || 1);
      return Math.min(100, Math.round((Number(slider.value) / max) * 100));
    };

    /* Salva momento e intensidade sem re-renderizar */
    const saveExtras = (habitoId) => {
      const reg = S.getRegistrosHabitos().find(r => r.habitoId === habitoId && r.data === selectedDate);
      if (!reg?.completo) return;
      const obsEl     = container.querySelector(`[data-obs="${habitoId}"]`);
      const momentoEl = container.querySelector(`[data-momento="${habitoId}"]`);
      const sliderEl  = container.querySelector(`.hab-int-slider[data-int="${habitoId}"]`);
      S.upsertRegistroHabito({
        habitoId, data: selectedDate, completo: true,
        observacao:  obsEl?.value.trim() || '',
        momento:     momentoEl?.value || '',
        intensidade: intensidadeDoSlider(sliderEl),
      });
    };

    const atualizarBanner = () => {
      const banner = document.getElementById('hab-frase-banner');
      if (!banner) return;
      const tmp = document.createElement('div');
      tmp.innerHTML = htmlFraseBanner(fraseExibida);
      banner.replaceWith(tmp.firstElementChild);
      if (window.lucide) lucide.createIcons();
      const btn = document.getElementById('btn-outra-frase');
      if (btn) btn.onclick = () => { fraseExibida = _sortearFrase(fraseExibida); atualizarBanner(); };
    };

    const render = () => {
      if (timerInterval) clearInterval(timerInterval);
      const habitos = S.getHabitos().filter(h => h.ativo !== false);
      const registros = S.getRegistrosHabitos();
      const regDia = registros.filter(r => r.data === selectedDate);
      const idsAtivos = new Set(habitos.map(h => h.id));
      const completosHoje = regDia.filter(r => r.completo && idsAtivos.has(r.habitoId)).length;
      const totalHoje = habitos.length;
      const pctHoje = totalHoje > 0 ? Math.round((completosHoje / totalHoje) * 100) : 0;
      const corPct = pctHoje >= 80 ? 'var(--success)' : pctHoje >= 50 ? 'var(--warning)' : 'var(--danger)';

      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2>🌱 Hábitos Diários</h2>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="date" id="hab-data" value="${selectedDate}" style="width:auto">
              <button class="btn btn-secondary btn-sm" id="btn-hab-hoje">Hoje</button>
            </div>
          </div>

          ${htmlFraseBanner(fraseExibida)}

          <div class="cards-grid" style="margin-bottom:20px">
            <div class="card card-saldo">
              <div class="card-icon">📋</div>
              <div class="card-info">
                <span class="card-label">Hábitos do Dia</span>
                <span class="card-value">${completosHoje} / ${totalHoje}</span>
              </div>
            </div>
            <div class="card" style="border-left-color:${corPct}">
              <div class="card-icon">📊</div>
              <div class="card-info">
                <span class="card-label">Conclusão do Dia</span>
                <span class="card-value" style="color:${corPct}">${pctHoje}%</span>
              </div>
            </div>
          </div>

          ${totalHoje === 0 ? `
            <div class="hab-empty">
              <p>Nenhum hábito cadastrado ainda.</p>
              <a href="#habitos-config" class="btn btn-primary" style="display:inline-flex;margin-top:12px">⚙️ Cadastrar Hábitos</a>
            </div>` : `
            <div class="hab-list" id="hab-check-list">
              <div class="hab-list-head" aria-hidden="true">
                <span>Status</span>
                <span>Hábito</span>
                <span>Acompanhamento</span>
                <span>Observação</span>
              </div>
              ${habitos.map(h => {
                const reg         = regDia.find(r => r.habitoId === h.id);
                const done        = reg?.completo || false;
                const streak      = calcStreak(h.id, registros);
                const intensidade = (reg && 'intensidade' in reg) ? reg.intensidade : 100;
                const momento     = reg?.momento || '';
                const tipo        = tipoHabito(h);
                const ocorrencias = Array.isArray(reg?.ocorrencias) ? reg.ocorrencias : [];
                const okCount     = ocorrencias.filter(o => o.resultado === 'ok').length;
                const nokCount    = ocorrencias.filter(o => o.resultado === 'nok').length;
                const metaDia     = metaOcorrencias(h);
                const pctOcorr    = Math.min(100, Math.round((okCount / metaDia) * 100));
                const execucao    = reg?.execucao || null;
                const percentualAutomatico = reg?.modoRegistro === 'execucao';
                const duracao     = duracaoSegundos(h);
                const tempoSalvo  = Math.max(0, Number(execucao?.decorrido) || 0);
                const decorrido   = execucao?.status === 'executando'
                  ? Math.min(duracao, tempoSalvo + Math.max(0, Math.floor((Date.now() - execucao.iniciadoEm) / 1000)))
                  : Math.min(duracao, tempoSalvo);
                const pctTempo    = Math.min(100, Math.round((decorrido / duracao) * 100));
                const painelAberto = paineisAbertos.has(h.id);
                const sliderMax = tipo === 'ocorrencias' ? metaDia : Math.max(1, Math.round(duracao / 60));
                const sliderValorAutomatico = tipo === 'ocorrencias'
                  ? Math.min(sliderMax, okCount)
                  : Math.min(sliderMax, Math.floor(decorrido / 60));
                const sliderValor = percentualAutomatico
                  ? sliderValorAutomatico
                  : Math.min(sliderMax, Math.round((intensidade / 100) * sliderMax));
                const realizadoTexto = tipo === 'ocorrencias'
                  ? `(${okCount}/${metaDia})`
                  : `(${formatTempoHabito(decorrido)} de ${sliderMax} min)`;
                return `
                <div class="hab-item ${done ? 'done' : ''}" data-id="${h.id}">
                  <button type="button" class="hab-check-btn ${done ? 'checked' : ''}" data-toggle="${h.id}" title="${done ? 'Desmarcar registro' : 'Registrar manualmente'}" aria-label="${done ? 'Desmarcar' : 'Marcar'} ${H.esc(h.nome)}">
                    ${done ? '<i data-lucide="check"></i>' : ''}
                  </button>
                  <div class="hab-item-identity">
                    <div class="hab-item-icon" style="background:${h.cor || '#3b82f6'}22;color:${h.cor || '#3b82f6'}">${h.icone || '⭐'}</div>
                    <div class="hab-item-info">
                      <div class="hab-item-nome">${H.esc(h.nome)}</div>
                      ${h.descricao ? `<div class="hab-item-desc">${H.esc(h.descricao)}</div>` : ''}
                      <div class="hab-item-meta">
                        ${h.categoria ? `<span class="hab-item-cat">${H.esc(h.categoria)}</span>` : ''}
                        ${streak > 0 ? `<span class="hab-streak">🔥 ${streak} dia${streak !== 1 ? 's' : ''}</span>` : ''}
                      </div>
                    </div>
                  </div>
                  <div class="hab-item-extras${done ? '' : ' hab-extras-off'}">
                    <div class="hab-momento-control">
                      <span class="hab-extras-label" title="Momento do dia">📍 Momento</span>
                      <select class="hab-momento-sel" data-momento="${h.id}"${done ? '' : ' disabled'}>
                        <option value=""${momento === '' ? ' selected' : ''}>— selecione —</option>
                        <option value="manha"${momento === 'manha' ? ' selected' : ''}>🌅 Manhã</option>
                        <option value="tarde"${momento === 'tarde' ? ' selected' : ''}>☀️ Tarde</option>
                        <option value="noite"${momento === 'noite' ? ' selected' : ''}>🌙 Noite</option>
                        <option value="ao_longo_dia"${momento === 'ao_longo_dia' ? ' selected' : ''}>🔄 Ao longo do dia</option>
                      </select>
                    </div>
                    <div class="hab-realizado-control">
                      <span class="hab-extras-label" title="Quantidade realizada do hábito">✅ Realizado <b data-realizado="${h.id}">${realizadoTexto}</b></span>
                      <div class="hab-int-slider-wrap">
                        <div class="hab-int-track-wrap">
                          <input type="range" class="hab-int-slider" data-int="${h.id}"
                            data-unit="${tipo === 'ocorrencias' ? 'ocorrência' : 'min'}"
                            min="0" max="${sliderMax}" step="1" value="${sliderValor}"${done && !percentualAutomatico ? '' : ' disabled'}
                            title="${percentualAutomatico ? 'Percentual calculado automaticamente pela execução' : 'Percentual informado manualmente'}">
                          <span class="hab-int-bubble" data-bubble="${h.id}"></span>
                        </div>
                      </div>
                    </div>
                    <button type="button" class="btn btn-outline btn-sm hab-controls-toggle" data-controls-toggle="${h.id}" aria-expanded="${painelAberto}">
                      <i data-lucide="sliders-horizontal"></i> Controles
                      <i data-lucide="${painelAberto ? 'chevron-up' : 'chevron-down'}"></i>
                    </button>
                  </div>
                  <div class="hab-item-obs">
                    <input type="text" class="hab-obs-input" data-obs="${h.id}"
                      placeholder="Observação..." value="${H.esc(reg?.observacao || '')}">
                  </div>
                  <div class="hab-exec-panel${painelAberto ? ' is-open' : ''}" data-exec-panel="${h.id}">
                      ${tipo === 'ocorrencias' ? `
                        <div class="hab-exec-summary">
                          <span><strong data-ok-count="${h.id}">${okCount}</strong> / ${metaDia} OK</span>
                          <span class="hab-nok"><strong data-nok-count="${h.id}">${nokCount}</strong> NOK</span>
                          <span><strong data-occ-pct="${h.id}">${pctOcorr}</strong>%</span>
                        </div>
                        <div class="hab-progress"><span data-occ-bar="${h.id}" style="width:${pctOcorr}%;background:${h.cor || '#3b82f6'}"></span></div>
                        <div class="hab-exec-actions">
                          <button type="button" class="btn btn-primary btn-sm" data-occ-ok="${h.id}" ${selectedDate !== H.hoje() ? 'disabled' : ''}><i data-lucide="check"></i> Registrar (OK)</button>
                          <button type="button" class="btn btn-outline btn-sm" data-occ-nok="${h.id}" ${selectedDate !== H.hoje() ? 'disabled' : ''}><i data-lucide="x"></i> Não realizado (NOK)</button>
                        </div>
                      ` : `
                        <div class="hab-timer ${execucao?.status === 'executando' ? 'running' : ''}" data-timer="${h.id}" data-start="${execucao?.iniciadoEm || ''}" data-base="${tempoSalvo}" data-duration="${duracao}">
                          <div class="hab-timer-values">
                            <span><small>Crescente</small><strong data-elapsed="${h.id}">${formatTempoHabito(decorrido)}</strong></span>
                            <span><small>Restante</small><strong data-remaining="${h.id}">${formatTempoHabito(duracao - decorrido)}</strong></span>
                            <span><small>Progresso</small><strong data-time-pct="${h.id}">${pctTempo}%</strong></span>
                          </div>
                          <div class="hab-progress"><span data-time-bar="${h.id}" style="width:${pctTempo}%;background:${h.cor || '#3b82f6'}"></span></div>
                          <div class="hab-exec-actions">
                            ${execucao?.status === 'executando' ? `
                              <button type="button" class="btn btn-success btn-sm" data-finish="${h.id}"><i data-lucide="check"></i> Concluir</button>
                              ${pctTempo < 100 ? `<button type="button" class="btn btn-outline btn-sm" data-pause-exec="${h.id}"><i data-lucide="pause"></i> Pausar</button>` : ''}
                              <button type="button" class="btn btn-danger btn-sm" data-reset-exec="${h.id}"><i data-lucide="rotate-ccw"></i> Zerar/Limpar</button>
                            ` : execucao?.status === 'pausado' ? `
                              ${pctTempo < 100 ? `<button type="button" class="btn btn-primary btn-sm" data-start-exec="${h.id}" ${selectedDate !== H.hoje() ? 'disabled' : ''}><i data-lucide="play"></i> Retomar</button>` : ''}
                              <button type="button" class="btn btn-success btn-sm" data-finish="${h.id}"><i data-lucide="check"></i> Concluir</button>
                              <button type="button" class="btn btn-danger btn-sm" data-reset-exec="${h.id}"><i data-lucide="rotate-ccw"></i> Zerar/Limpar</button>
                            ` : execucao?.status === 'concluido' ? `
                              <button type="button" class="btn btn-success btn-sm" disabled><i data-lucide="check-circle"></i> Concluído</button>
                              <button type="button" class="btn btn-danger btn-sm" data-reset-exec="${h.id}"><i data-lucide="rotate-ccw"></i> Zerar/Limpar</button>
                            ` : `
                              <button type="button" class="btn btn-primary btn-sm" data-start-exec="${h.id}" ${selectedDate !== H.hoje() ? 'disabled title="A execução só pode ser iniciada na data de hoje"' : ''}><i data-lucide="play"></i> Executar</button>
                              ${execucao ? `<button type="button" class="btn btn-danger btn-sm" data-reset-exec="${h.id}"><i data-lucide="rotate-ccw"></i> Zerar/Limpar</button>` : ''}
                            `}
                          </div>
                        </div>
                      `}
                  </div>
                </div>`;
              }).join('')}
            </div>
            <button type="button" class="btn btn-primary" id="btn-salvar-obs" style="margin-top:16px"><i data-lucide="save"></i> Salvar Observações</button>
          `}
        </div>`;

      /* Eventos */
      const _btnOutraFrase = document.getElementById('btn-outra-frase');
      if (_btnOutraFrase) _btnOutraFrase.onclick = () => { fraseExibida = _sortearFrase(fraseExibida); atualizarBanner(); };

      document.getElementById('hab-data').onchange = function () { selectedDate = this.value; render(); };
      const _btnHoje = document.getElementById('btn-hab-hoje'); if (_btnHoje) _btnHoje.onclick = () => { selectedDate = H.hoje(); render(); };

      container.querySelectorAll('[data-controls-toggle]').forEach(btn => {
        btn.onclick = () => {
          const habitoId = btn.dataset.controlsToggle;
          paineisAbertos.has(habitoId) ? paineisAbertos.delete(habitoId) : paineisAbertos.add(habitoId);
          render();
        };
      });

      container.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.onclick = () => {
          const habitoId   = btn.dataset.toggle;
          const reg        = S.getRegistrosHabitos().find(r => r.habitoId === habitoId && r.data === selectedDate);
          const obsEl      = container.querySelector(`[data-obs="${habitoId}"]`);
          const momentoEl  = container.querySelector(`[data-momento="${habitoId}"]`);
          const sliderEl   = container.querySelector(`.hab-int-slider[data-int="${habitoId}"]`);
          const newCompleto = !reg?.completo;
          const execucaoManual = reg?.execucao?.status === 'executando'
            ? { ...reg.execucao, status: 'cancelado', canceladoEm: Date.now() }
            : reg?.execucao;
          S.upsertRegistroHabito({
            habitoId, data: selectedDate, completo: newCompleto,
            observacao:  obsEl?.value.trim() || '',
            momento:     newCompleto ? (momentoEl?.value || reg?.momento || '') : (reg?.momento || ''),
            intensidade: sliderEl ? intensidadeDoSlider(sliderEl) : (reg && 'intensidade' in reg ? reg.intensidade : 100),
            modoRegistro: 'manual',
            ...(execucaoManual ? { execucao: execucaoManual } : {}),
          });
          render();
        };
      });

      const getRegistro = (habitoId) =>
        S.getRegistrosHabitos().find(r => r.habitoId === habitoId && r.data === selectedDate);

      container.querySelectorAll('[data-occ-ok], [data-occ-nok]').forEach(btn => {
        btn.onclick = () => {
          const habitoId = btn.dataset.occOk || btn.dataset.occNok;
          const habito = S.getHabitos().find(h => h.id === habitoId);
          const reg = getRegistro(habitoId);
          const ocorrencias = [...(reg?.ocorrencias || []), {
            id: S._uid(),
            resultado: btn.dataset.occOk ? 'ok' : 'nok',
            registradoEm: new Date().toISOString(),
          }];
          const ok = ocorrencias.filter(o => o.resultado === 'ok').length;
          S.upsertRegistroHabito({
            habitoId,
            data: selectedDate,
            ocorrencias,
            completo: ok >= metaOcorrencias(habito),
            momento: reg?.momento || 'ao_longo_dia',
            intensidade: Math.min(100, Math.round((ok / metaOcorrencias(habito)) * 100)),
            modoRegistro: 'execucao',
          });
          render();
        };
      });

      container.querySelectorAll('[data-start-exec]').forEach(btn => {
        btn.onclick = () => {
          const habitoId = btn.dataset.startExec;
          const reg = getRegistro(habitoId);
          const tempoSalvo = reg?.execucao?.status === 'pausado'
            ? Math.max(0, Number(reg.execucao.decorrido) || 0)
            : 0;
          S.upsertRegistroHabito({
            habitoId,
            data: selectedDate,
            completo: false,
            execucao: { status: 'executando', iniciadoEm: Date.now(), decorrido: tempoSalvo },
            momento: reg?.momento || momentoAtualHabito(),
            intensidade: reg?.execucao?.status === 'pausado' ? (reg.intensidade || 0) : 0,
            modoRegistro: 'execucao',
          });
          render();
        };
      });

      container.querySelectorAll('[data-finish]').forEach(btn => {
        btn.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const habitoId = btn.dataset.finish;
          const habito = S.getHabitos().find(h => h.id === habitoId);
          const reg = getRegistro(habitoId);
          if (!habito || !reg?.execucao) return;
          const tempoSalvo = Math.max(0, Number(reg?.execucao?.decorrido) || 0);
          const tempoAtual = reg?.execucao?.status === 'executando'
            ? Math.max(0, Math.floor((Date.now() - reg.execucao.iniciadoEm) / 1000))
            : 0;
          const decorrido = Math.min(duracaoSegundos(habito), tempoSalvo + tempoAtual);
          const execucaoConcluida = {
            ...reg.execucao,
            status: 'concluido',
            finalizadoEm: Date.now(),
            decorrido,
          };
          S.upsertRegistroHabito({
            habitoId,
            data: selectedDate,
            completo: true,
            execucao: execucaoConcluida,
            momento: reg.momento || momentoAtualHabito(),
            intensidade: Math.min(100, Math.round((decorrido / duracaoSegundos(habito)) * 100)),
            modoRegistro: 'execucao',
          });
          render();
        };
      });

      container.querySelectorAll('[data-pause-exec]').forEach(btn => {
        btn.onclick = () => {
          const habitoId = btn.dataset.pauseExec;
          const reg = getRegistro(habitoId);
          const habito = S.getHabitos().find(h => h.id === habitoId);
          const decorrido = Math.min(
            duracaoSegundos(habito),
            Math.max(0, Number(reg.execucao.decorrido) || 0) + Math.max(0, Math.floor((Date.now() - reg.execucao.iniciadoEm) / 1000))
          );
          S.upsertRegistroHabito({
            habitoId,
            data: selectedDate,
            completo: false,
            execucao: { ...reg.execucao, status: 'pausado', pausadoEm: Date.now(), decorrido },
            intensidade: Math.min(100, Math.round((decorrido / duracaoSegundos(habito)) * 100)),
            modoRegistro: 'execucao',
          });
          render();
        };
      });

      container.querySelectorAll('[data-reset-exec]').forEach(btn => {
        btn.onclick = () => {
          const habitoId = btn.dataset.resetExec;
          S.upsertRegistroHabito({
            habitoId,
            data: selectedDate,
            completo: false,
            execucao: null,
            intensidade: 0,
            modoRegistro: 'execucao',
          });
          render();
        };
      });

      const atualizarTimers = () => {
        const timersAtivos = container.querySelectorAll('.hab-timer.running');
        if (!timersAtivos.length && timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
          container._habTimerInterval = null;
          return;
        }
        timersAtivos.forEach(el => {
          const id = el.dataset.timer;
          const duracao = Number(el.dataset.duration);
          const decorrido = Math.min(duracao, Math.max(0, Number(el.dataset.base) || 0) + Math.max(0, Math.floor((Date.now() - Number(el.dataset.start)) / 1000)));
          const restante = Math.max(0, duracao - decorrido);
          const pct = Math.min(100, Math.round((decorrido / duracao) * 100));
          const elapsedEl = el.querySelector(`[data-elapsed="${id}"]`);
          const remainingEl = el.querySelector(`[data-remaining="${id}"]`);
          const pctEl = el.querySelector(`[data-time-pct="${id}"]`);
          const barEl = el.querySelector(`[data-time-bar="${id}"]`);
          const pauseEl = el.querySelector(`[data-pause-exec="${id}"]`);
          const realizadoEl = container.querySelector(`[data-realizado="${id}"]`);
          if (elapsedEl) elapsedEl.textContent = formatTempoHabito(decorrido);
          if (remainingEl) remainingEl.textContent = formatTempoHabito(restante);
          if (pctEl) pctEl.textContent = pct + '%';
          if (barEl) barEl.style.width = pct + '%';
          if (realizadoEl) realizadoEl.textContent = `(${formatTempoHabito(decorrido)} de ${Math.round(duracao / 60)} min)`;
          if (pauseEl && pct >= 100) pauseEl.remove();
        });
      };
      atualizarTimers();
      if (container.querySelector('.hab-timer.running')) {
        timerInterval = setInterval(atualizarTimers, 1000);
        container._habTimerInterval = timerInterval;
      }

      /* Eventos: momento e intensidade (auto-save sem re-render) */
      container.querySelectorAll('.hab-momento-sel').forEach(sel => {
        sel.onchange = () => saveExtras(sel.dataset.momento);
      });

      container.querySelectorAll('.hab-int-slider').forEach(sl => {
        sl.oninput = () => saveExtras(sl.dataset.int);
      });

      const updateBubble = (sl) => {
        const bubble = container.querySelector(`.hab-int-bubble[data-bubble="${sl.dataset.int}"]`);
        if (!bubble) return;
        const valor = Number(sl.value);
        const max = Math.max(1, Number(sl.max) || 1);
        const pct = valor / max;
        bubble.style.left = `calc(${pct * 100}% + ${(8 - 16 * pct).toFixed(1)}px)`;
        bubble.style.transform = pct >= .8
          ? 'translateX(-100%)'
          : pct <= .2
            ? 'translateX(0)'
            : 'translateX(-50%)';
        const unidade = sl.dataset.unit === 'min'
          ? 'min'
          : `ocorrência${valor === 1 ? '' : 's'}`;
        bubble.textContent = `${valor}/${max} ${unidade} · ${Math.round(pct * 100)}%`;
      };
      container.querySelectorAll('.hab-int-slider').forEach(sl => {
        updateBubble(sl);
        sl.oninput = () => { updateBubble(sl); saveExtras(sl.dataset.int); };
      });
      // remove duplicate bare oninput block below
      void 0;

      const _btnSalvarObs = document.getElementById('btn-salvar-obs'); if (_btnSalvarObs) _btnSalvarObs.onclick = () => {
        const habAtivos = S.getHabitos().filter(h => h.ativo !== false);
        habAtivos.forEach(h => {
          const obsEl     = container.querySelector(`[data-obs="${h.id}"]`);
          if (!obsEl) return;
          const momentoEl = container.querySelector(`[data-momento="${h.id}"]`);
          const sliderEl  = container.querySelector(`.hab-int-slider[data-int="${h.id}"]`);
          const reg       = S.getRegistrosHabitos().find(r => r.habitoId === h.id && r.data === selectedDate);
          S.upsertRegistroHabito({
            habitoId: h.id, data: selectedDate, completo: reg?.completo || false,
            observacao:  obsEl.value.trim(),
            momento:     momentoEl?.value || '',
            intensidade: sliderEl ? intensidadeDoSlider(sliderEl) : (reg && 'intensidade' in reg ? reg.intensidade : 100),
          });
        });
        const msg = document.createElement('div');
        msg.className = 'alert alert-success';
        msg.textContent = '✔ Observações salvas!';
        msg.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;min-width:200px';
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2500);
      };
    };

    render();
  };

  /* ======================================================
     2. VISÃO MENSAL
     ====================================================== */
  PCF.Pages.habitosMensal = (container) => {
    const now = new Date();
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth() + 1;

    const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    const render = () => {
      const habitos = S.getHabitos().filter(h => h.ativo !== false);
      const registros = S.getRegistrosHabitos();
      const totalDias = diasNoMes(viewYear, viewMonth);
      const prefix = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
      const hoje = H.hoje();

      // Dias que já passaram (ou hoje) no mês selecionado
      const hojeDate = new Date(hoje + 'T12:00:00');
      const diasDecorridos = (viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1)
        ? now.getDate()
        : (new Date(`${prefix}-01T12:00:00`) <= hojeDate ? totalDias : 0);

      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2>📅 Visão Mensal</h2>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn btn-secondary btn-sm" id="btn-mes-ant"><i data-lucide="chevron-left"></i></button>
              <span style="font-weight:600;min-width:160px;text-align:center">${MESES_PT[viewMonth - 1]} ${viewYear}</span>
              <button class="btn btn-secondary btn-sm" id="btn-mes-prox"><i data-lucide="chevron-right"></i></button>
            </div>
          </div>

          ${habitos.length === 0 ? `<p class="text-muted">Nenhum hábito cadastrado. <a href="#habitos-config">Cadastre seus hábitos.</a></p>` : `
          <div style="overflow-x:auto">
            <table class="table hab-mensal-table">
              <thead>
                <tr>
                  <th style="min-width:150px;position:sticky;left:0;background:var(--bg-card)">Hábito</th>
                  ${Array.from({ length: totalDias }, (_, i) => {
                    const dayStr = String(i + 1).padStart(2, '0');
                    const dateStr = `${prefix}-${dayStr}`;
                    const isToday = dateStr === hoje;
                    return `<th style="min-width:34px;text-align:center;${isToday ? 'color:var(--accent);' : ''}">${i + 1}</th>`;
                  }).join('')}
                  <th style="min-width:70px;text-align:center">%</th>
                </tr>
              </thead>
              <tbody>
                ${habitos.map(h => {
                  let completos = 0;
                  const cells = Array.from({ length: totalDias }, (_, i) => {
                    const dayStr = String(i + 1).padStart(2, '0');
                    const dateStr = `${prefix}-${dayStr}`;
                    const reg = registros.find(r => r.habitoId === h.id && r.data === dateStr);
                    const done = reg?.completo || false;
                    if (done) completos++;
                    const isToday = dateStr === hoje;
                    return `<td style="text-align:center;padding:4px;${isToday ? 'border:2px solid var(--accent);' : ''}">
                      <span class="hab-cell ${done ? 'done' : ''}" data-toggle="${h.id}" data-date="${dateStr}"
                        title="${dateStr}${reg?.observacao ? ': ' + reg.observacao : ''}">${done ? '✅' : '⬜'}</span>
                    </td>`;
                  }).join('');
                  const pct = diasDecorridos > 0 ? Math.round((completos / diasDecorridos) * 100) : 0;
                  const corPct = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
                  return `<tr>
                    <td style="position:sticky;left:0;background:var(--bg-card)">
                      <span style="color:${h.cor || '#3b82f6'};margin-right:4px">${h.icone || '⭐'}</span>
                      <span style="font-size:.85rem">${H.esc(h.nome)}</span>
                    </td>
                    ${cells}
                    <td style="text-align:center;font-weight:700;color:${corPct}">${pct}%</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <p class="text-muted" style="margin-top:8px;font-size:.8rem">Clique em qualquer célula para marcar/desmarcar o hábito naquele dia.</p>
          `}
        </div>`;

      document.getElementById('btn-mes-ant').onclick = () => {
        viewMonth--; if (viewMonth < 1) { viewMonth = 12; viewYear--; } render();
      };
      document.getElementById('btn-mes-prox').onclick = () => {
        viewMonth++; if (viewMonth > 12) { viewMonth = 1; viewYear++; } render();
      };

      container.querySelectorAll('.hab-cell').forEach(cell => {
        cell.onclick = () => {
          const habitoId = cell.dataset.toggle;
          const data = cell.dataset.date;
          const reg = S.getRegistrosHabitos().find(r => r.habitoId === habitoId && r.data === data);
          S.upsertRegistroHabito({ habitoId, data, completo: !(reg?.completo || false), observacao: reg?.observacao || '' });
          render();
        };
      });
    };

    render();
  };

  /* ======================================================
     3. RELATÓRIO DE HÁBITOS
     ====================================================== */
  PCF.Pages.habitosRelatorio = (container) => {
    const render = () => {
      const habitos = S.getHabitos().filter(h => h.ativo !== false);
      const todosHabitos = S.getHabitos();
      const registros = S.getRegistrosHabitos();

      // Últimos 30 dias
      const labels = [];
      const hoje = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(hoje);
        d.setDate(d.getDate() - i);
        labels.push(d.toISOString().split('T')[0]);
      }

      // Estatísticas gerais
      const totalRegistros = registros.filter(r => r.completo).length;
      const melhorSequencia = todosHabitos.reduce((max, h) => Math.max(max, calcStreak(h.id, registros)), 0);
      const pct30Geral = (() => {
        if (!habitos.length) return 0;
        const soma = habitos.reduce((acc, h) => {
          const c = labels.filter(d => registros.find(r => r.habitoId === h.id && r.data === d && r.completo)).length;
          return acc + c;
        }, 0);
        return Math.round(soma / (habitos.length * 30) * 100);
      })();

      container.innerHTML = `
        <div class="page">
          <h2 style="margin-bottom:20px">📊 Relatório de Hábitos</h2>

          <div class="cards-grid" style="margin-bottom:20px">
            <div class="card card-receita">
              <div class="card-icon">✅</div>
              <div class="card-info">
                <span class="card-label">Total Concluídos</span>
                <span class="card-value">${totalRegistros}</span>
              </div>
            </div>
            <div class="card card-saldo">
              <div class="card-icon">📈</div>
              <div class="card-info">
                <span class="card-label">% Geral (30 dias)</span>
                <span class="card-value">${pct30Geral}%</span>
              </div>
            </div>
            <div class="card card-investimento">
              <div class="card-icon">🔥</div>
              <div class="card-info">
                <span class="card-label">Melhor Sequência Atual</span>
                <span class="card-value">${melhorSequencia} dia${melhorSequencia !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div class="card">
              <div class="card-icon">🌱</div>
              <div class="card-info">
                <span class="card-label">Hábitos Ativos</span>
                <span class="card-value">${habitos.length}</span>
              </div>
            </div>
          </div>

          ${habitos.length === 0 ? `<p class="text-muted">Nenhum hábito ativo para exibir relatório.</p>` : `

          <div class="hab-relat-cards">
            ${habitos.map(h => {
              const streak = calcStreak(h.id, registros);
              const total = registros.filter(r => r.habitoId === h.id && r.completo).length;
              const c30 = labels.filter(d => registros.find(r => r.habitoId === h.id && r.data === d && r.completo)).length;
              const pct30 = Math.round((c30 / 30) * 100);
              const corPct = pct30 >= 80 ? 'var(--success)' : pct30 >= 50 ? 'var(--warning)' : 'var(--danger)';
              return `
              <div class="card" style="border-left-color:${h.cor || '#3b82f6'}">
                <div class="card-icon" style="color:${h.cor || '#3b82f6'}">${h.icone || '⭐'}</div>
                <div class="card-info" style="flex:1">
                  <span class="card-label">${H.esc(h.nome)}</span>
                  <span class="card-value" style="color:${corPct}">${pct30}% <span style="font-size:.75rem;font-weight:400">nos últimos 30d</span></span>
                  <div style="display:flex;gap:12px;margin-top:4px">
                    <span class="text-muted" style="font-size:.8rem">🔥 Sequência: <strong>${streak}</strong></span>
                    <span class="text-muted" style="font-size:.8rem">✅ Total: <strong>${total}</strong></span>
                  </div>
                  <div class="hab-pct-bar" style="margin-top:8px">
                    <div class="hab-pct-fill" style="width:${pct30}%;background:${h.cor || '#3b82f6'}"></div>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>

          <div class="charts-grid" style="margin-top:24px">
            <div class="chart-container">
              <h3>Conclusão diária — últimos 30 dias</h3>
              <canvas id="chart-hab-diario" height="160"></canvas>
            </div>
            <div class="chart-container">
              <h3>Taxa de conclusão por hábito (30 dias)</h3>
              <canvas id="chart-hab-bar" height="160"></canvas>
            </div>
          </div>
          `}
        </div>`;

      if (habitos.length > 0) {
        const dailyData = labels.map(d => {
          const done = habitos.filter(h => registros.find(r => r.habitoId === h.id && r.data === d && r.completo)).length;
          return Math.round((done / habitos.length) * 100);
        });

        PCF.App.registerChart(new Chart(document.getElementById('chart-hab-diario'), {
          type: 'line',
          data: {
            labels: labels.map(d => d.slice(5)),
            datasets: [{
              label: '% Conclusão',
              data: dailyData,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59,130,246,.15)',
              fill: true,
              tension: 0.3,
              pointRadius: 3,
            }],
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false }, datalabels: { display: false } },
            scales: {
              y: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
            },
          },
        }));

        const barData = habitos.map(h => {
          const c = labels.filter(d => registros.find(r => r.habitoId === h.id && r.data === d && r.completo)).length;
          return Math.round((c / 30) * 100);
        });

        PCF.App.registerChart(new Chart(document.getElementById('chart-hab-bar'), {
          type: 'bar',
          data: {
            labels: habitos.map(h => (h.icone || '') + ' ' + h.nome),
            datasets: [{
              label: '% em 30 dias',
              data: barData,
              backgroundColor: habitos.map(h => (h.cor || '#3b82f6') + 'aa'),
              borderColor: habitos.map(h => h.cor || '#3b82f6'),
              borderWidth: 2,
            }],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false }, datalabels: { display: false } },
            scales: {
              x: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
            },
          },
        }));
      }
    };

    render();
  };

  /* ======================================================
     4. CONFIG HÁBITOS — CRUD
     ====================================================== */
  PCF.Pages.habitosConfig = (container) => {
    const CATEGORIAS_HAB = ['Saúde', 'Exercício', 'Alimentação', 'Sono', 'Mente', 'Produtividade', 'Lazer', 'Relacionamentos', 'Finanças', 'Espiritualidade', 'Outros'];
    const ICONES_HAB = ['⭐','💧','🏃','🍎','😴','📚','🧘','💊','🎯','💪','🥗','🧠','✍️','🎨','🎵','🙏','🌱','❤️','💰','🚶','🏋️','🚴','🧹','💆','🌅','☀️','🥤','🍵','🫀','🛌'];

    const render = () => {
      const habitos = S.getHabitos();
      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2>⚙️ Meus Hábitos</h2>
            <div style="display:flex;gap:8px;align-items:center">
              <button id="btn-restaurar-habitos" class="btn btn-outline"><i data-lucide="rotate-ccw"></i> Restaurar padrões</button>
              <button id="btn-add-hab" class="btn btn-primary">+ Novo hábito</button>
            </div>
          </div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Ícone</th>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Tipo</th>
                  <th>Meta / Frequência</th>
                  <th>Status</th>
                  <th style="width:100px">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${habitos.length === 0 ? '<tr><td colspan="7" class="empty-text">Nenhum hábito cadastrado</td></tr>' :
                  habitos.map(h => `
                  <tr>
                    <td><span style="font-size:1.5rem;color:${h.cor || '#3b82f6'}">${h.icone || '⭐'}</span></td>
                    <td>
                      <strong>${H.esc(h.nome)}</strong>
                      ${h.descricao ? `<br><small class="text-muted">${H.esc(h.descricao)}</small>` : ''}
                    </td>
                    <td><span class="chip-small">${H.esc(h.categoria || '—')}</span></td>
                    <td>${tipoHabito(h) === 'ocorrencias' ? 'Por ocorrências' : 'Por duração'}</td>
                    <td>${H.esc(h.meta || '—')}</td>
                    <td><span class="tipo-badge ${h.ativo !== false ? 'receita' : 'despesa'}">${h.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
                    <td>
                      <button class="btn-icon" data-edit="${h.id}" title="Editar"><i data-lucide="pencil"></i></button>
                      <button class="btn-icon btn-danger" data-del="${h.id}" title="Excluir"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;

      document.getElementById('btn-add-hab').onclick = () => showHabitoModal(null, CATEGORIAS_HAB, ICONES_HAB, render);
      document.getElementById('btn-restaurar-habitos').onclick = () => {
        if (confirm('Restaurar hábitos padrão? Os hábitos atuais serão substituídos pelos hábitos padrão.')) {
          S.restoreDefaultHabitos();
          render();
        }
      };
      container.onclick = (e) => {
        const edit = e.target.closest('[data-edit]');
        if (edit) {
          const h = S.getHabitos().find(x => x.id === edit.dataset.edit);
          if (h) showHabitoModal(h, CATEGORIAS_HAB, ICONES_HAB, render);
        }
        const del = e.target.closest('[data-del]');
        if (del && confirm('Remover este hábito? Os registros históricos serão mantidos.')) {
          S.deleteHabito(del.dataset.del);
          render();
        }
      };
    };

    render();
  };

  const showHabitoModal = (hab, CATEGORIAS_HAB, ICONES_HAB, onSave) => {
    const isEdit = !!hab;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal-lg">
        <h3>${isEdit ? 'Editar' : 'Novo'} Hábito</h3>
        <form id="hab-modal-form">
          <div class="form-group">
            <label>Ícone</label>
            <div class="hab-icone-grid" id="hab-icones">
              ${ICONES_HAB.map(ic => `<button type="button" class="hab-icone-btn ${(hab?.icone || '⭐') === ic ? 'selected' : ''}" data-ic="${ic}">${ic}</button>`).join('')}
            </div>
            <input type="hidden" id="hab-icone-val" value="${H.esc(hab?.icone || '⭐')}">
            <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
              <label style="white-space:nowrap;font-size:.82rem;color:var(--text-muted)">Ícone personalizado:</label>
              <input type="text" id="hab-icone-custom" maxlength="4" placeholder="Cole um emoji aqui" style="width:120px;font-size:1.2rem;text-align:center" value="${ICONES_HAB.includes(hab?.icone || '⭐') ? '' : H.esc(hab?.icone || '')}">
              <span id="hab-icone-preview" style="font-size:1.6rem;min-width:2rem;text-align:center">${ICONES_HAB.includes(hab?.icone || '⭐') ? (hab?.icone || '⭐') : (hab?.icone || '⭐')}</span>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Nome do hábito *</label>
              <input type="text" id="hab-nome" value="${H.esc(hab?.nome || '')}" required placeholder="Ex: Beber 2L de água">
            </div>
            <div class="form-group">
              <label>Cor</label>
              <input type="color" id="hab-cor" value="${hab?.cor || '#3b82f6'}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Tipo de acompanhamento *</label>
              <select id="hab-tipo">
                <option value="ocorrencias" ${tipoHabito(hab || {}) === 'ocorrencias' ? 'selected' : ''}>Por ocorrências (contagem OK/NOK)</option>
                <option value="duracao" ${tipoHabito(hab || {}) === 'duracao' ? 'selected' : ''}>Por duração (cronômetro)</option>
              </select>
              <small class="text-muted">Use ocorrências para ações rápidas, como beber água.</small>
            </div>
            <div class="form-group" id="hab-campo-ocorrencias">
              <label>Meta diária de execuções</label>
              <input type="number" id="hab-meta-diaria" min="1" step="1" value="${hab?.metaDiaria || 1}">
            </div>
            <div class="form-group" id="hab-campo-duracao">
              <label>Tempo programado (minutos)</label>
              <input type="number" id="hab-duracao" min="1" step="1" value="${hab?.duracaoMinutos || 30}">
            </div>
          </div>
          <div class="form-group">
            <label>Descrição</label>
            <input type="text" id="hab-desc" value="${H.esc(hab?.descricao || '')}" placeholder="Opcional">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Categoria</label>
              <select id="hab-cat">
                ${CATEGORIAS_HAB.map(c => `<option ${(hab?.categoria || 'Saúde') === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Meta / Frequência</label>
              <input type="text" id="hab-meta" value="${H.esc(hab?.meta || 'Diário')}" placeholder="Ex: Diário, 5x/semana">
            </div>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="hab-ativo" ${hab?.ativo !== false ? 'checked' : ''}>
              Hábito Ativo
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="hab-m-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar Alterações' : 'Criar Hábito'}</button>
          </div>
        </form>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.hab-icone-btn').forEach(btn => {
      btn.onclick = () => {
        overlay.querySelectorAll('.hab-icone-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('hab-icone-val').value = btn.dataset.ic;
        document.getElementById('hab-icone-preview').textContent = btn.dataset.ic;
        document.getElementById('hab-icone-custom').value = '';
      };
    });

    const customInput = document.getElementById('hab-icone-custom');
    customInput.oninput = () => {
      const v = customInput.value.trim();
      if (!v) return;
      // Desseleciona botões do grid
      overlay.querySelectorAll('.hab-icone-btn').forEach(b => b.classList.remove('selected'));
      document.getElementById('hab-icone-val').value = v;
      document.getElementById('hab-icone-preview').textContent = v;
    };

    const atualizarCamposTipo = () => {
      const porOcorrencias = document.getElementById('hab-tipo').value === 'ocorrencias';
      document.getElementById('hab-campo-ocorrencias').style.display = porOcorrencias ? '' : 'none';
      document.getElementById('hab-campo-duracao').style.display = porOcorrencias ? 'none' : '';
    };
    document.getElementById('hab-tipo').onchange = atualizarCamposTipo;
    atualizarCamposTipo();

    document.getElementById('hab-m-cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    document.getElementById('hab-modal-form').onsubmit = (e) => {
      e.preventDefault();
      const data = {
        nome: document.getElementById('hab-nome').value.trim(),
        descricao: document.getElementById('hab-desc').value.trim(),
        categoria: document.getElementById('hab-cat').value,
        meta: document.getElementById('hab-meta').value.trim(),
        icone: document.getElementById('hab-icone-val').value,
        cor: document.getElementById('hab-cor').value,
        ativo: document.getElementById('hab-ativo').checked,
        tipoExecucao: document.getElementById('hab-tipo').value,
        metaDiaria: Math.max(1, parseInt(document.getElementById('hab-meta-diaria').value, 10) || 1),
        duracaoMinutos: Math.max(1, parseInt(document.getElementById('hab-duracao').value, 10) || 1),
      };
      if (isEdit) S.updateHabito(hab.id, data);
      else S.addHabito(data);
      overlay.remove();
      onSave();
    };
  };

  /* ======================================================
     5. BASE DE MENSAGENS / FRASES DO DIA — CRUD
     ====================================================== */
  PCF.Pages.frases = (container) => {
    const CATEGORIAS_FRASE = ['Motivação', 'Saúde', 'Finanças', 'Produtividade', 'Espiritualidade', 'Relacionamentos', 'Vida Feliz', 'Geral'];

    const render = () => {
      const frases = S.getFrases();
      const frase = getFraseHoje();

      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2>💬 Base de Mensagens</h2>
            <div style="display:flex;gap:8px;align-items:center">
              <button id="btn-restaurar-frases" class="btn btn-outline"><i data-lucide="rotate-ccw"></i> Restaurar padrões</button>
              <button id="btn-add-frase" class="btn btn-primary">+ Nova mensagem</button>
            </div>
          </div>

          ${frase ? `
          <div class="hab-frase-dia" style="margin-bottom:20px">
            <div class="hab-frase-icon">📅</div>
            <div class="hab-frase-content">
              <div class="hab-frase-label">FRASE DO DIA (pré-visualização)</div>
              <div class="hab-frase-texto">"${H.esc(frase.texto)}"</div>
              ${frase.autor ? `<div class="hab-frase-autor">— ${H.esc(frase.autor)}</div>` : ''}
            </div>
          </div>` : ''}

          <div class="table-container frases-table-wrap">
            <table class="table frases-table">
              <thead>
                <tr>
                  <th class="frase-col-msg">Mensagem</th>
                  <th class="frase-col-autor">Autor</th>
                  <th class="frase-col-cat">Categoria</th>
                  <th class="frase-col-status">Status</th>
                  <th style="width:100px">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${frases.length === 0 ? '<tr><td colspan="5" class="empty-text">Nenhuma mensagem cadastrada</td></tr>' :
                  frases.map(f => `
                  <tr>
                    <td class="frase-cell-msg">"${H.esc(f.texto)}"</td>
                    <td class="frase-cell-autor">${H.esc(f.autor || '—')}</td>
                    <td class="frase-cell-cat"><span class="chip-small">${H.esc(f.categoria || 'Geral')}</span></td>
                    <td class="frase-cell-status"><span class="tipo-badge ${f.ativo !== false ? 'receita' : 'despesa'}">${f.ativo !== false ? 'Ativa' : 'Inativa'}</span></td>
                    <td class="frase-cell-actions">
                      <button class="btn-icon" data-edit="${f.id}" title="Editar"><i data-lucide="pencil"></i></button>
                      <button class="btn-icon btn-danger" data-del="${f.id}" title="Excluir"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <p class="text-muted" style="margin-top:8px;font-size:.8rem">A frase do dia é selecionada automaticamente com base na data atual, dentre as mensagens ativas.</p>
        </div>`;

      document.getElementById('btn-add-frase').onclick = () => showFraseModal(null, CATEGORIAS_FRASE, render);
      document.getElementById('btn-restaurar-frases').onclick = () => {
        if (confirm('Restaurar base de mensagens padrão? As mensagens atuais serão substituídas pelas mensagens padrão.')) {
          S.restoreDefaultFrases();
          render();
        }
      };
      container.onclick = (e) => {
        const edit = e.target.closest('[data-edit]');
        if (edit) {
          const f = S.getFrases().find(x => x.id === edit.dataset.edit);
          if (f) showFraseModal(f, CATEGORIAS_FRASE, render);
        }
        const del = e.target.closest('[data-del]');
        if (del && confirm('Remover esta mensagem?')) { S.deleteFrase(del.dataset.del); render(); }
      };
    };

    render();
  };

  const showFraseModal = (frase, CATEGORIAS_FRASE, onSave) => {
    const isEdit = !!frase;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${isEdit ? 'Editar' : 'Nova'} Mensagem</h3>
        <form id="frase-modal-form">
          <div class="form-group">
            <label>Texto da Mensagem *</label>
            <textarea id="frase-texto" rows="4" required placeholder="Digite a mensagem motivacional...">${H.esc(frase?.texto || '')}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Autor</label>
              <input type="text" id="frase-autor" value="${H.esc(frase?.autor || '')}" placeholder="Ex: Aristóteles">
            </div>
            <div class="form-group">
              <label>Categoria</label>
              <select id="frase-cat">
                ${CATEGORIAS_FRASE.map(c => `<option ${(frase?.categoria || 'Geral') === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="frase-ativa" ${frase?.ativo !== false ? 'checked' : ''}>
              Mensagem Ativa (inclusa na rotação de frases do dia)
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="frase-m-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar Alterações' : 'Adicionar Mensagem'}</button>
          </div>
        </form>
      </div>`;

    document.body.appendChild(overlay);
    document.getElementById('frase-m-cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    document.getElementById('frase-modal-form').onsubmit = (e) => {
      e.preventDefault();
      const data = {
        texto: document.getElementById('frase-texto').value.trim(),
        autor: document.getElementById('frase-autor').value.trim(),
        categoria: document.getElementById('frase-cat').value,
        ativo: document.getElementById('frase-ativa').checked,
      };
      if (isEdit) S.updateFrase(frase.id, data);
      else S.addFrase(data);
      overlay.remove();
      onSave();
    };
  };

})();
