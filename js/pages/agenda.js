/* ========================================================
   PCF - pages/agenda.js — Agenda de Compromissos
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

const checkAndShowAlerts = () => {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;

  const STATUS_OPTS = ['Pendente', 'Concluído', 'Cancelado'];
  const STATUS_COLORS = { 'Pendente': '#f59e0b', 'Concluído': '#16a34a', 'Realizado': '#16a34a', 'Cancelado': '#dc2626' };
  const CALENDAR_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const WEEKEND_INDEXES = new Set([0, 6]);
  const MONTH_LABEL = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

  let _clockInterval = null;
  const isCompromissoAtrasado = (data, hora) => {
    if (!data) return false;
    const agora = new Date();
    if (!hora) {
      const hoje = agora.toISOString().split('T')[0];
      return data < hoje;
    }
    const horaCompleta = hora.length === 5 ? `${hora}:00` : hora;
    const dateTime = new Date(`${data}T${horaCompleta}`);
    if (Number.isNaN(dateTime.getTime())) return false;
    return dateTime < agora;
  };

  PCF.Pages.agenda = (container) => {
    const today = new Date();
    let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    let selectedDate = H.hoje();

    const renderPreservingScroll = () => {
      const x = window.scrollX;
      const y = window.scrollY;
      render();
      requestAnimationFrame(() => window.scrollTo(x, y));
    };

    const normalizeDateKey = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const getMonthCounts = (compromissos) => compromissos.reduce((acc, comp) => {
      if (!comp.data) return acc;
      acc[comp.data] = (acc[comp.data] || 0) + 1;
      return acc;
    }, {});

    const getPlanoAcoesVinculadas = () => (S.getPlanoAcoes ? S.getPlanoAcoes() : [])
      .filter(acao => acao.agendaAtivo && acao.whenDate)
      .sort((a, b) => a.whenDate.localeCompare(b.whenDate) || (a.whenTime || '').localeCompare(b.whenTime || ''));

    const getSaudeEventosVinculados = () => (S.getSaudeEventos ? S.getSaudeEventos() : [])
      .filter(evento => evento.agendaAtivo && evento.data)
      .sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''));

    const getSaudeMedicamentosVinculados = () => (S.getSaudeMedicamentos ? S.getSaudeMedicamentos() : [])
      .filter(med => med.agendaAtivo && med.dataInicio)
      .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio) || (a.nome || '').localeCompare(b.nome || ''));

    const getCombinedMonthCounts = (compromissos, acoesVinculadas, saudeVinculados, medicamentosVinculados = []) => {
      const counts = getMonthCounts(compromissos);
      acoesVinculadas.forEach(acao => {
        counts[acao.whenDate] = (counts[acao.whenDate] || 0) + 1;
      });
      saudeVinculados.forEach(evento => {
        counts[evento.data] = (counts[evento.data] || 0) + 1;
      });
      medicamentosVinculados.forEach(med => {
        counts[med.dataInicio] = (counts[med.dataInicio] || 0) + 1;
      });
      return counts;
    };

    const buildCalendarGrid = (monthDate, countsByDate) => {
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const startOffset = firstDay.getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const cells = [];

      for (let i = 0; i < startOffset; i += 1) cells.push(null);
      for (let day = 1; day <= daysInMonth; day += 1) {
        const cellDate = new Date(year, month, day);
        const dateKey = normalizeDateKey(cellDate);
        cells.push({
          day,
          dateKey,
          count: countsByDate[dateKey] || 0,
          isWeekend: WEEKEND_INDEXES.has(cellDate.getDay()),
          isToday: dateKey === H.hoje(),
          isSelected: dateKey === selectedDate,
        });
      }
      while (cells.length % 7 !== 0) cells.push(null);
      return cells;
    };

    const checkAlertas = () => {
      const compromissos = S.getCompromissos();
      const acoesVinculadas = getPlanoAcoesVinculadas();
      const saudeVinculados = getSaudeEventosVinculados();
      const medicamentosVinculados = getSaudeMedicamentosVinculados();
      const agora = new Date();
      const hj = agora.toISOString().split('T')[0];
      const alertas = [];

      compromissos.forEach(c => {
        if (c.status !== 'Pendente') return;
        
        // Verifica se tem hora específica
        if (c.hora) {
          const compDateTime = new Date(c.data + 'T' + c.hora);
          const nowDateTime = new Date();
          const diffMs = compDateTime - nowDateTime;
          const diffHours = diffMs / (1000 * 60 * 60);
          
          // Se for o mesmo dia e a hora passou ou está próxima (dentro de 1 hora)
          if (c.data === hj && diffHours <= 1 && diffHours > -1) {
            alertas.push({ tipo: 'agora', comp: c });
            return;
          }
        }
        
        if (c.data < hj) {
          alertas.push({ tipo: 'atrasado', comp: c });
        } else if (c.data === hj) {
          alertas.push({ tipo: 'hoje', comp: c });
        } else {
          const diff = (new Date(c.data + 'T00:00:00') - new Date(hj + 'T00:00:00')) / (1000 * 60 * 60 * 24);
          if (diff <= 3) alertas.push({ tipo: 'proximo', comp: c });
        }
      });

      acoesVinculadas.forEach(acao => {
        if (acao.status !== 'Pendente') return;
        if (acao.whenTime) {
          const acaoDateTime = new Date(`${acao.whenDate}T${acao.whenTime}`);
          const diffMs = acaoDateTime - agora;
          const diffHours = diffMs / (1000 * 60 * 60);
          if (acao.whenDate === hj && diffHours <= 1 && diffHours > -1) {
            alertas.push({
              tipo: 'agora',
              comp: { compromisso: `[Plano] ${acao.what}`, data: acao.whenDate, hora: acao.whenTime }
            });
            return;
          }
        }
        if (acao.whenDate < hj) {
          alertas.push({
            tipo: 'atrasado',
            comp: { compromisso: `[Plano] ${acao.what}`, data: acao.whenDate, hora: acao.whenTime }
          });
        } else if (acao.whenDate === hj) {
          alertas.push({
            tipo: 'hoje',
            comp: { compromisso: `[Plano] ${acao.what}`, data: acao.whenDate, hora: acao.whenTime }
          });
        }
      });
      saudeVinculados.forEach(evento => {
        if (evento.status !== 'Pendente') return;
        const comp = {
          compromisso: `[Saúde] ${evento.tipo || 'Registro'} - ${evento.descricao || ''}`,
          data: evento.data,
          hora: evento.hora,
        };
        if (evento.hora) {
          const eventoDateTime = new Date(`${evento.data}T${evento.hora}`);
          const diffMs = eventoDateTime - agora;
          const diffHours = diffMs / (1000 * 60 * 60);
          if (evento.data === hj && diffHours <= 1 && diffHours > -1) {
            alertas.push({ tipo: 'agora', comp });
            return;
          }
        }
        if (evento.data < hj) alertas.push({ tipo: 'atrasado', comp });
        else if (evento.data === hj) alertas.push({ tipo: 'hoje', comp });
      });
      medicamentosVinculados.forEach(med => {
        if (med.status !== 'Em uso') return;
        const comp = {
          compromisso: `[Medicamento] ${med.nome || 'Medicamento'} - ${med.dose || ''}`,
          data: med.dataInicio,
          hora: '',
        };
        if (med.dataInicio < hj) alertas.push({ tipo: 'atrasado', comp });
        else if (med.dataInicio === hj) alertas.push({ tipo: 'hoje', comp });
      });
      return alertas;
    };

    const showCompromissoModal = (compromisso, tipo) => {
      // Remove modais existentes
      const existingModals = document.querySelectorAll('.compromisso-modal');
      existingModals.forEach(modal => modal.remove());

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay compromisso-modal';
      overlay.innerHTML = `
        <div class="modal">
          <h3>${tipo === 'atrasado' ? 'Aviso de compromisso em atraso!' : 'Aviso de compromisso!'}</h3>
          <div class="modal-body">
            <p><strong>Descrição do compromisso:</strong></p>
            <p>${H.esc(compromisso.compromisso)}</p>
            <p><strong>Data - Hora:</strong></p>
            <p>${H.formatarData(compromisso.data)} ${compromisso.hora || ''}</p>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="compromisso-cancelar">Cancelar</button>
            <button class="btn btn-primary" id="compromisso-ok">OK</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      // Botão OK
      document.getElementById('compromisso-ok').onclick = () => {
        S.updateCompromisso(compromisso.id, { status: 'Concluído' });
        overlay.remove();
        render();
      };

      // Botão Cancelar
      document.getElementById('compromisso-cancelar').onclick = () => {
        S.updateCompromisso(compromisso.id, { status: 'Cancelado' });
        overlay.remove();
        render();
      };

      // Fechar ao clicar fora
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          // Se fechar sem clicar em botões, mantém como Pendente
          overlay.remove();
        }
      };
    };

    const checkAndShowAlerts = () => {};

    const startAlertChecking = () => {
      checkAndShowAlerts();
    };

    const stopAlertChecking = () => {
      return null;
    };

    const render = () => {
      // Para a verificação de alertes anterior
      stopAlertChecking();
      
      const compromissos = S.getCompromissos().sort((a, b) => {
        const cmpData = a.data.localeCompare(b.data);
        if (cmpData !== 0) return cmpData;
        return (a.hora || '').localeCompare(b.hora || '');
      });
      const contatosMap = Object.fromEntries((S.getContatos ? S.getContatos() : []).map(c => [c.id, c]));
      const acoesVinculadas = getPlanoAcoesVinculadas();
      const saudeVinculados = getSaudeEventosVinculados();
      const medicamentosVinculados = getSaudeMedicamentosVinculados();
      const countsByDate = getCombinedMonthCounts(compromissos, acoesVinculadas, saudeVinculados, medicamentosVinculados);
      const calendarCells = buildCalendarGrid(currentMonth, countsByDate);
      const agendaConfig = S.getAgendaConfig ? S.getAgendaConfig() : { avisoSonoroAtivo: true };
      const alertas = checkAlertas();

      /* ---- Painel de Aniversários ---- */
      const _buildBirthdayPanel = () => {
        const contatosList = S.getContatos ? S.getContatos() : [];
        const session = S.getSession ? S.getSession() : null;
        const userProfile = session ? S.getUserById(session.userId) : null;
        const hojeStr = H.hoje();
        const mmddOf = function(iso) { return iso ? iso.slice(5) : ''; };
        const mmAtual = hojeStr.slice(5, 7);
        const hojeMMDD = hojeStr.slice(5);
        const fmtD = function(iso) { return H.formatarData(iso); };
        const anivHoje = [];
        const anivMes = [];
        if (userProfile && userProfile.dataNascimento) {
          const md = mmddOf(userProfile.dataNascimento);
          if (md.slice(0, 2) === mmAtual) {
            const entry = { nome: (userProfile.nome || 'Você') + ' \uD83D\uDC51', nasc: userProfile.dataNascimento };
            if (md === hojeMMDD) anivHoje.push(entry); else anivMes.push(entry);
          }
        }
        contatosList.forEach(function(c) {
          if (!c.dataNascimento) return;
          const md = mmddOf(c.dataNascimento);
          if (md.slice(0, 2) !== mmAtual) return;
          const entry = { nome: c.nome, nasc: c.dataNascimento };
          if (md === hojeMMDD) anivHoje.push(entry); else anivMes.push(entry);
        });
        if (!anivHoje.length && !anivMes.length) return '';
        let html = '<div class="card" style="margin-top:1rem"><h3>\uD83C\uDF82 Anivers\u00E1rios do M\u00EAs</h3>';
        if (anivHoje.length) {
          html += '<div class="aniversarios-panel aniversarios-hoje-panel"><div class="aniversarios-title">\uD83C\uDF89 Aniversariantes de Hoje</div>';
          anivHoje.forEach(function(a) {
            html += '<div class="aniversario-item aniversario-hoje"><span class="aniversario-icon">\uD83C\uDF81</span><span class="aniversario-nome">' + H.esc(a.nome) + '</span><span class="aniversario-data">' + fmtD(a.nasc) + ' \u2014 <strong>HOJE!</strong></span></div>';
          });
          html += '</div>';
        }
        if (anivMes.length) {
          html += '<div class="aniversarios-panel" style="margin-top:' + (anivHoje.length ? '12px' : '0') + '"><div class="aniversarios-title" style="color:var(--text-muted)">\uD83D\uDCC5 Outros no m\u00EAs</div>';
          anivMes.forEach(function(a) {
            html += '<div class="aniversario-item"><span class="aniversario-icon">\uD83C\uDF88</span><span class="aniversario-nome">' + H.esc(a.nome) + '</span><span class="aniversario-data">' + fmtD(a.nasc) + '</span></div>';
          });
          html += '</div>';
        }
        html += '</div>';
        return html;
      };
      const birthdayHtml = _buildBirthdayPanel();

      container.innerHTML = `
        <div class="page">
          <div class="page-header page-header-agenda">
            <h2>📅 Agenda de Compromissos</h2>
            <label class="agenda-sound-toggle">
              <input type="checkbox" id="ag-sound-toggle" ${agendaConfig.avisoSonoroAtivo ? 'checked' : ''}>
              <span>Ativar aviso sonoro</span>
            </label>
          </div>

          <div class="agenda-top-grid">
            <div class="agenda-top-left">
              <div class="agenda-clock-banner">
                <div class="agenda-clock-main">
                  <div class="agenda-clock-time" id="ag-clock-time">--:--:--</div>
                  <div class="agenda-clock-date" id="ag-clock-date">--/--/----</div>
                  <div class="agenda-clock-tz" id="ag-clock-tz"></div>
                </div>
              </div>
              <div class="agenda-calendar-heading agenda-calendar-heading-side">
                <h3>Calendario Mensal</h3>
                <p class="agenda-calendar-subtitle">Navegue pelos meses e veja quantos compromissos existem em cada dia.</p>
              </div>
            </div>

            <div class="agenda-calendar-panel">
              <div class="agenda-calendar-header">
                <div class="agenda-calendar-toolbar">
                  <button type="button" class="btn btn-secondary" id="ag-cal-today">Hoje</button>
                  <div class="agenda-calendar-nav">
                    <button type="button" class="btn btn-secondary" id="ag-cal-prev" aria-label="Mes anterior">&lsaquo;</button>
                    <div class="agenda-calendar-title">${MONTH_LABEL.format(currentMonth)}</div>
                    <button type="button" class="btn btn-secondary" id="ag-cal-next" aria-label="Proximo mes">&rsaquo;</button>
                  </div>
                </div>
              </div>

              <div class="agenda-calendar-board">
                <div class="agenda-calendar-weekdays">
                  ${CALENDAR_WEEKDAYS.map((day, index) => `<span class="${WEEKEND_INDEXES.has(index) ? 'is-weekend' : ''}">${day}</span>`).join('')}
                </div>
                <div class="agenda-calendar-grid">
                  ${calendarCells.map(cell => {
                    if (!cell) return '<div class="agenda-calendar-cell agenda-calendar-cell-empty" aria-hidden="true"></div>';
                    return `
                      <button
                        type="button"
                        class="agenda-calendar-cell ${cell.isWeekend ? 'is-weekend' : ''} ${cell.isToday ? 'is-today' : ''} ${cell.isSelected ? 'is-selected' : ''} ${cell.count > 0 ? 'has-events' : ''}"
                        data-ag-date="${cell.dateKey}"
                        aria-label="${cell.day} com ${cell.count} compromisso${cell.count === 1 ? '' : 's'}">
                        <span class="agenda-calendar-day">${cell.day}</span>
                        ${cell.count > 0 ? `<span class="agenda-calendar-count">${cell.count}</span>` : ''}
                      </button>`;
                  }).join('')}
                </div>
              </div>
            </div>

            <div class="agenda-top-actions">
              <div class="agenda-clock-btns">
                <button class="btn btn-secondary" id="ag-btn-timer">⏱ Timer</button>
                <button class="btn btn-secondary" id="ag-btn-crono">⏱ Cronômetro</button>
              </div>
            </div>
          </div>

          ${alertas.length > 0 ? `
          <div class="agenda-alertas">
            ${alertas.map(a => {
              const icon = a.tipo === 'atrasado' ? '🔴' : a.tipo === 'hoje' ? '🟡' : '🔵';
              const msg = a.tipo === 'atrasado' ? 'ATRASADO' : a.tipo === 'hoje' ? 'HOJE' : 'Em breve';
              return `<div class="alerta-item alerta-${a.tipo}">
                ${icon} <strong>${msg}:</strong> ${H.esc(a.comp.compromisso)} — ${H.formatarData(a.comp.data)} ${a.comp.hora || ''}
              </div>`;
            }).join('')}
          </div>` : ''}

          <div class="card">
          <h3>Novo compromisso</h3>
            <form id="agenda-form" class="form-grid-agenda">
              <div class="form-group">
                <label>Compromisso</label>
                <input type="text" id="ag-desc" required placeholder="Descrição do compromisso">
              </div>
              <div class="form-group">
                <label>Data</label>
                <input type="date" id="ag-data" required value="${selectedDate}">
              </div>
              <div class="form-group">
                <label>Hora</label>
                <input type="time" id="ag-hora">
              </div>
              <div class="form-group">
                <label>Status</label>
                <select id="ag-status">
                  ${STATUS_OPTS.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
              </div>
              <div class="form-group form-group-btn">
                <button type="submit" class="btn btn-primary">Adicionar</button>
              </div>
            </form>
          </div>

          <div class="card" style="margin-top:1rem">
            <h3>Compromissos (${compromissos.length})</h3>
            ${compromissos.length === 0 ? '<p class="empty-text">Nenhum compromisso cadastrado</p>' : `
            <div class="table-wrapper">
              <table class="table">
                <thead>
                  <tr>
                    <th>Compromisso</th>
                    <th>Data</th>
                    <th>Dia da Semana</th>
                    <th>Hora</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${compromissos.map(c => {
                    const info = H.extrairInfoData(c.data);
                    const statusCor = STATUS_COLORS[c.status] || '#6b7280';
                    return `<tr>
                      <td>${H.esc(c.compromisso)}</td>
                      <td>${H.formatarData(c.data)}</td>
                      <td>${info.diaSemana}</td>
                      <td>${c.hora || '—'}</td>
                      <td><span class="status-badge" style="background:${statusCor}">${c.status}</span></td>
                      <td class="actions-cell">
                        <button class="btn-icon" data-edit-ag="${c.id}" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon btn-danger" data-del-ag="${c.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`}
          </div>

          <div class="card" style="margin-top:1rem">
            <h3>Ações do Plano vinculadas na Agenda (${acoesVinculadas.length})</h3>
            ${acoesVinculadas.length === 0 ? '<p class="empty-text">Nenhuma ação do 5W2H vinculada à Agenda</p>' : `            <div class="table-wrapper">
              <table class="table">
                <thead>
                  <tr>
                    <th>Ação</th>
                    <th>Quando</th>
                    <th>Contato</th>
                    <th>Status</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  ${acoesVinculadas.map(acao => {
                    const contato = (S.getContatos ? S.getContatos() : []).find(c => c.id === acao.whoContactId);
                    const statusCor = STATUS_COLORS[acao.status] || '#6b7280';
                    return `<tr>
                      <td>${H.esc(acao.what)}</td>
                      <td>${H.formatarData(acao.whenDate)} ${acao.whenTime || ''}</td>
                      <td>${H.esc(contato?.nome || '—')}</td>
                      <td><span class="status-badge" style="background:${statusCor}">${acao.status}</span></td>
                      <td><a href="#plano-acao" class="btn-link">Plano de Ação</a></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`}
          </div>

          <div class="card" style="margin-top:1rem">
            <h3>Saúde vinculada na Agenda (${saudeVinculados.length})</h3>
            ${saudeVinculados.length === 0 ? '<p class="empty-text">Nenhuma consulta, exame ou procedimento vinculado à Agenda</p>' : `
            <div class="table-wrapper">
              <table class="table">
                <thead>
                  <tr>
                    <th>Registro</th>
                    <th>Para quem</th>
                    <th>Quando</th>
                    <th>Local</th>
                    <th>Status</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  ${saudeVinculados.map(evento => {
                    const statusCor = STATUS_COLORS[evento.status] || '#6b7280';
                    const responsavel = evento.responsavelContatoId ? (contatosMap[evento.responsavelContatoId]?.nome || 'Contato removido') : 'Própria pessoa';
                    return `<tr>
                      <td>${H.esc(evento.tipo || 'Saúde')} - ${H.esc(evento.descricao || '')}</td>
                      <td>${H.esc(responsavel)}</td>
                      <td>${H.formatarData(evento.data)} ${evento.hora || ''}</td>
                      <td>${H.esc(evento.local || '—')}</td>
                      <td><span class="status-badge" style="background:${statusCor}">${H.esc(evento.status || 'Pendente')}</span></td>
                      <td><a href="#saude-consultas" class="btn-link">Saúde</a></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`}
          </div>

          <div class="card" style="margin-top:1rem">
            <h3>Medicamentos vinculados na Agenda (${medicamentosVinculados.length})</h3>
            ${medicamentosVinculados.length === 0 ? '<p class="empty-text">Nenhum medicamento vinculado à Agenda</p>' : `
            <div class="table-wrapper">
              <table class="table">
                <thead>
                  <tr>
                    <th>Medicamento</th>
                    <th>Posologia</th>
                    <th>Para quem</th>
                    <th>Inicio</th>
                    <th>Status</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  ${medicamentosVinculados.map(med => {
                    const statusCor = STATUS_COLORS[med.status] || '#6b7280';
                    const responsavel = med.responsavelContatoId ? (contatosMap[med.responsavelContatoId]?.nome || 'Contato removido') : 'Propria pessoa';
                    return `<tr>
                      <td><strong>${H.esc(med.nome || '')}</strong><br><small>${H.esc(med.dose || '')}</small></td>
                      <td>${H.esc(med.frequencia || '')}${med.horarios ? `<br><small>${H.esc(med.horarios)}</small>` : ''}</td>
                      <td>${H.esc(responsavel)}</td>
                      <td>${H.formatarData(med.dataInicio)}</td>
                      <td><span class="status-badge" style="background:${statusCor}">${H.esc(med.status || 'Em uso')}</span></td>
                      <td><a href="#saude-medicamentos" class="btn-link">Medicamentos</a></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`}
          </div>

          ${(() => {
            /* ---- Painel de Aniversários ---- */
            const contatos = S.getContatos ? S.getContatos() : [];
            const session = S.getSession ? S.getSession() : null;
            const userProfile = session ? S.getUserById(session.userId) : null;
            const hojeStr = H.hoje();
            const _mmdd = (iso) => iso ? iso.slice(5) : '';
            const mmAtual = hojeStr.slice(5,7);
            const hojeMMDD = hojeStr.slice(5);
            const fmtD = (iso) => H.formatarData(iso);
            const anivHoje = [], anivMes = [];
            if (userProfile && userProfile.dataNascimento) {
              const md = _mmdd(userProfile.dataNascimento);
              if (md.slice(0,2) === mmAtual) {
                const arr = md === hojeMMDD ? anivHoje : anivMes;
                arr.push({ nome: (userProfile.nome || 'Você') + ' 👑', nasc: userProfile.dataNascimento });
              }
            }
            contatos.forEach(function(c) {
              if (!c.dataNascimento) return;
              const md = _mmdd(c.dataNascimento);
              if (md.slice(0,2) !== mmAtual) return;
              const arr = md === hojeMMDD ? anivHoje : anivMes;
              arr.push({ nome: c.nome, nasc: c.dataNascimento });
            });
            if (!anivHoje.length && !anivMes.length) return '';
            const hojeItems = anivHoje.map(function(a) {
              return '<div class="aniversario-item aniversario-hoje"><span class="aniversario-icon">🎁</span><span class="aniversario-nome">' + H.esc(a.nome) + '</span><span class="aniversario-data">' + fmtD(a.nasc) + ' — <strong>HOJE!</strong></span></div>';
            }).join('');
            const mesItems = anivMes.map(function(a) {
              return '<div class="aniversario-item"><span class="aniversario-icon">🎈</span><span class="aniversario-nome">' + H.esc(a.nome) + '</span><span class="aniversario-data">' + fmtD(a.nasc) + '</span></div>';
            }).join('');
            return '<div class="card" style="margin-top:1rem"><h3>🎂 Aniversários do Mês</h3>' +
              (anivHoje.length ? '<div class="aniversarios-panel aniversarios-hoje-panel"><div class="aniversarios-title">🎉 Aniversariantes de Hoje</div>' + hojeItems + '</div>' : '') +
              (anivMes.length ? '<div class="aniversarios-panel" style="margin-top:' + (anivHoje.length?'12px':'0') + '"><div class="aniversarios-title" style="color:var(--text-muted)">📅 Outros no mês</div>' + mesItems + '</div>' : '') +
              '</div>';
          })()}
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#agenda');

      startClock();
      document.getElementById('ag-btn-timer').onclick = () => showTimerModal();
      document.getElementById('ag-btn-crono').onclick = () => showCronoModal();
      document.getElementById('ag-cal-prev').onclick = () => {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        renderPreservingScroll();
      };
      document.getElementById('ag-cal-next').onclick = () => {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        renderPreservingScroll();
      };
      document.getElementById('ag-cal-today').onclick = () => {
        currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        selectedDate = H.hoje();
        renderPreservingScroll();
        const inputData = document.getElementById('ag-data');
        if (inputData) {
          inputData.value = selectedDate;
        }
      };

      // Iniciar verificação de alertas
      document.getElementById('ag-sound-toggle').onchange = (e) => {
        S.saveAgendaConfig({ avisoSonoroAtivo: e.target.checked });
      };
      startAlertChecking();

      // Adicionar compromisso
      document.getElementById('agenda-form').onsubmit = (e) => {
        e.preventDefault();
        const novoCompromisso = {
          compromisso: document.getElementById('ag-desc').value.trim(),
          data: document.getElementById('ag-data').value,
          hora: document.getElementById('ag-hora').value,
          status: document.getElementById('ag-status').value,
        };
        if (isCompromissoAtrasado(novoCompromisso.data, novoCompromisso.hora)) {
          alert('Data/horário atrasado!');
          return;
        }
        selectedDate = novoCompromisso.data;
        currentMonth = new Date(`${novoCompromisso.data}T00:00:00`);
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        S.addCompromisso(novoCompromisso);
        render();
      };

      // Delegação de eventos
      container.onclick = (e) => {
        const editBtn = e.target.closest('[data-edit-ag]');
        if (editBtn) {
          const comp = S.getCompromissos().find(c => c.id === editBtn.dataset.editAg);
          if (comp) showEditModal(comp);
          return;
        }
        const delBtn = e.target.closest('[data-del-ag]');
        if (delBtn && confirm('Remover este compromisso?')) {
          S.deleteCompromisso(delBtn.dataset.delAg);
          render();
          return;
        }
        const dayBtn = e.target.closest('[data-ag-date]');
        if (dayBtn) {
          const inputData = document.getElementById('ag-data');
          selectedDate = dayBtn.dataset.agDate;
          if (inputData) {
            inputData.value = dayBtn.dataset.agDate;
          }
          renderPreservingScroll();
        }
      };
    };

    const showEditModal = (comp) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>Editar Compromisso</h3>
          <form id="ag-edit-form">
            <div class="form-group">
              <label>Compromisso</label>
              <input type="text" id="ag-e-desc" value="${H.esc(comp.compromisso)}" required>
            </div>
            <div class="form-group">
              <label>Data</label>
              <input type="date" id="ag-e-data" value="${comp.data}" required>
            </div>
            <div class="form-group">
              <label>Hora</label>
              <input type="time" id="ag-e-hora" value="${comp.hora || ''}">
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="ag-e-status">
                ${STATUS_OPTS.map(s => `<option value="${s}" ${comp.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="ag-e-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById('ag-e-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

      document.getElementById('ag-edit-form').onsubmit = (e) => {
        e.preventDefault();
        const compromissoAtualizado = {
          compromisso: document.getElementById('ag-e-desc').value.trim(),
          data: document.getElementById('ag-e-data').value,
          hora: document.getElementById('ag-e-hora').value,
          status: document.getElementById('ag-e-status').value,
        };
        if (isCompromissoAtrasado(compromissoAtualizado.data, compromissoAtualizado.hora)) {
          alert('Data/horário atrasado!');
          return;
        }
        S.updateCompromisso(comp.id, compromissoAtualizado);
        overlay.remove();
        render();
      };
    };

    const startClock = () => {
      if (_clockInterval) clearInterval(_clockInterval);
      const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const abrev = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      let tzSet = false;
      const tick = () => {
        const timeEl = document.getElementById('ag-clock-time');
        if (!timeEl) { clearInterval(_clockInterval); _clockInterval = null; return; }
        const now = new Date();
        timeEl.textContent =
          `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        const dd   = String(now.getDate()).padStart(2,'0');
        const mo   = String(now.getMonth() + 1).padStart(2,'0');
        const yyyy = now.getFullYear();
        document.getElementById('ag-clock-date').textContent =
          `${dd}/${mo}/${yyyy} (${abrev[now.getDay()]}) — ${dias[now.getDay()]}`;
        if (!tzSet) {
          const tzEl = document.getElementById('ag-clock-tz');
          if (tzEl) {
            const tz     = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const offset = -now.getTimezoneOffset();
            const sign   = offset >= 0 ? '+' : '-';
            const oh     = String(Math.floor(Math.abs(offset) / 60)).padStart(2,'0');
            const om     = String(Math.abs(offset) % 60).padStart(2,'0');
            tzEl.textContent = `📍 ${tz} — UTC${sign}${oh}:${om}`;
            tzSet = true;
          }
        }
      };
      tick();
      _clockInterval = setInterval(tick, 1000);
    };

    const showTimerModal = () => {
      if (document.getElementById('ag-timer-overlay')) return;
      let timerInterval = null;
      let remaining = 0;
      let running = false;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'ag-timer-overlay';
      overlay.innerHTML = `
        <div class="modal ag-clock-modal">
          <div class="ag-modal-header">
            <span>⏱ Timer</span>
            <button class="btn-icon" id="ag-timer-close"><i data-lucide="x"></i></button>
          </div>
          <div class="ag-timer-display" id="ag-timer-display">00:00:00</div>
          <div class="ag-timer-setup" id="ag-timer-setup">
            <div class="ag-timer-inputs">
              <div class="ag-timer-input-group">
                <input type="number" id="ag-timer-h" min="0" max="23" value="0">
                <span class="ag-timer-input-label">h</span>
              </div>
              <span class="ag-timer-sep">:</span>
              <div class="ag-timer-input-group">
                <input type="number" id="ag-timer-m" min="0" max="59" value="5">
                <span class="ag-timer-input-label">min</span>
              </div>
              <span class="ag-timer-sep">:</span>
              <div class="ag-timer-input-group">
                <input type="number" id="ag-timer-s" min="0" max="59" value="0">
                <span class="ag-timer-input-label">seg</span>
              </div>
            </div>
          </div>
          <div class="ag-modal-actions">
            <button class="btn btn-primary" id="ag-timer-start"><i data-lucide="play"></i> Iniciar</button>
            <button class="btn btn-secondary" id="ag-timer-reset"><i data-lucide="rotate-ccw"></i> Resetar</button>
          </div>
          <div class="ag-timer-status" id="ag-timer-status"></div>
        </div>`;
      document.body.appendChild(overlay);

      const display   = document.getElementById('ag-timer-display');
      const startBtn  = document.getElementById('ag-timer-start');
      const statusEl  = document.getElementById('ag-timer-status');
      const setupEl   = document.getElementById('ag-timer-setup');

      const fmtTime = (secs) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      };

      const stopTimer = () => {
        clearInterval(timerInterval); timerInterval = null; running = false;
        startBtn.innerHTML = '<i data-lucide="play"></i> Retomar'; if(window.lucide) lucide.createIcons();
      };

      startBtn.onclick = () => {
        if (running) { stopTimer(); return; }
        if (remaining === 0) {
          const h = parseInt(document.getElementById('ag-timer-h').value) || 0;
          const m = parseInt(document.getElementById('ag-timer-m').value) || 0;
          const s = parseInt(document.getElementById('ag-timer-s').value) || 0;
          remaining = h * 3600 + m * 60 + s;
          if (remaining <= 0) return;
          display.textContent = fmtTime(remaining);
          setupEl.style.display = 'none';
        }
        running = true;
        startBtn.innerHTML = '<i data-lucide="pause"></i> Pausar'; if(window.lucide) lucide.createIcons();
        statusEl.textContent = '';
        display.classList.remove('ag-timer-done');
        timerInterval = setInterval(() => {
          remaining--;
          if (remaining <= 0) {
            remaining = 0;
            display.textContent = fmtTime(0);
            stopTimer();
            display.classList.add('ag-timer-done');
            statusEl.textContent = '✅ Tempo esgotado!';
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)();
              [0, 0.35, 0.7].forEach(t => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = 880;
                gain.gain.setValueAtTime(0.3, ctx.currentTime + t);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.28);
                osc.start(ctx.currentTime + t);
                osc.stop(ctx.currentTime + t + 0.28);
              });
            } catch(e) {}
            return;
          }
          display.textContent = fmtTime(remaining);
        }, 1000);
      };

      document.getElementById('ag-timer-reset').onclick = () => {
        clearInterval(timerInterval); timerInterval = null; running = false; remaining = 0;
        display.textContent = '00:00:00';
        display.classList.remove('ag-timer-done');
        statusEl.textContent = '';
        startBtn.innerHTML = '<i data-lucide="play"></i> Iniciar'; if(window.lucide) lucide.createIcons();
        setupEl.style.display = '';
      };

      const closeTimer = () => { clearInterval(timerInterval); overlay.remove(); };
      document.getElementById('ag-timer-close').onclick = closeTimer;
      overlay.onclick = (e) => { if (e.target === overlay) closeTimer(); };
    };

    const showCronoModal = () => {
      if (document.getElementById('ag-crono-overlay')) return;
      let cronoInterval = null;
      let elapsed = 0;
      let running = false;
      let laps = [];
      let lapStart = 0;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'ag-crono-overlay';
      overlay.innerHTML = `
        <div class="modal ag-clock-modal">
          <div class="ag-modal-header">
            <span>⏱ Cronômetro</span>
            <button class="btn-icon" id="ag-crono-close"><i data-lucide="x"></i></button>
          </div>
          <div class="ag-crono-display" id="ag-crono-display">00:00:00.00</div>
          <div class="ag-modal-actions">
            <button class="btn btn-primary" id="ag-crono-start"><i data-lucide="play"></i> Iniciar</button>
            <button class="btn btn-secondary" id="ag-crono-lap" disabled><i data-lucide="flag"></i> Volta</button>
            <button class="btn btn-secondary" id="ag-crono-reset"><i data-lucide="rotate-ccw"></i> Resetar</button>
          </div>
          <div class="ag-crono-laps" id="ag-crono-laps"></div>
        </div>`;
      document.body.appendChild(overlay);

      const display  = document.getElementById('ag-crono-display');
      const startBtn = document.getElementById('ag-crono-start');
      const lapBtn   = document.getElementById('ag-crono-lap');
      const lapsEl   = document.getElementById('ag-crono-laps');

      const fmtCrono = (cs) => {
        const h = Math.floor(cs / 360000);
        const m = Math.floor((cs % 360000) / 6000);
        const s = Math.floor((cs % 6000) / 100);
        const c = cs % 100;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(c).padStart(2,'0')}`;
      };

      startBtn.onclick = () => {
        if (running) {
          clearInterval(cronoInterval); cronoInterval = null; running = false;
          startBtn.innerHTML = '<i data-lucide="play"></i> Retomar'; if(window.lucide) lucide.createIcons();
        } else {
          running = true;
          startBtn.innerHTML = '<i data-lucide="pause"></i> Pausar'; if(window.lucide) lucide.createIcons();
          lapBtn.disabled = false;
          cronoInterval = setInterval(() => {
            elapsed++;
            display.textContent = fmtCrono(elapsed);
          }, 10);
        }
      };

      lapBtn.onclick = () => {
        const lapTime = elapsed - lapStart;
        lapStart = elapsed;
        laps.push(lapTime);
        lapsEl.innerHTML = laps.map((l, i) =>
          `<div class="ag-crono-lap-row">
            <span class="ag-crono-lap-num">Volta ${i + 1}</span>
            <span class="ag-crono-lap-time">${fmtCrono(l)}</span>
          </div>`
        ).reverse().join('');
      };

      document.getElementById('ag-crono-reset').onclick = () => {
        clearInterval(cronoInterval); cronoInterval = null; running = false;
        elapsed = 0; lapStart = 0; laps = [];
        display.textContent = '00:00:00.00';
        startBtn.innerHTML = '<i data-lucide="play"></i> Iniciar'; if(window.lucide) lucide.createIcons();
        lapBtn.disabled = true;
        lapsEl.innerHTML = '';
      };

      const closeCrono = () => { clearInterval(cronoInterval); overlay.remove(); };
      document.getElementById('ag-crono-close').onclick = closeCrono;
      overlay.onclick = (e) => { if (e.target === overlay) closeCrono(); };
    };

    render();
    
    // Função de limpeza para quando a página for destruída
    return () => {
      stopAlertChecking();
      if (_clockInterval) {
        clearInterval(_clockInterval);
        _clockInterval = null;
      }
    };
  };
  })();
  
   // Exporta função para verificação de alertas
   PCF.Pages.checkAgendaAlerts = checkAndShowAlerts;
