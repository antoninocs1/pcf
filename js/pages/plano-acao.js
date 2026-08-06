/* ========================================================
   PCF - pages/plano-acao.js - Plano de Acao 5W2H
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;

  const STATUS_OPTS = ['Pendente', 'Concluído', 'Cancelado'];
  const STATUS_COLORS = { 'Pendente': '#f59e0b', 'Concluído': '#16a34a', 'Cancelado': '#dc2626' };

  const getContatoNome = (contatoId) => {
    if (!contatoId) return '';
    const contato = S.getContatos().find(c => c.id === contatoId);
    return contato?.nome || '';
  };

  const getWhoLabel = (acao) => getContatoNome(acao.whoContactId) || acao.who || '—';

  PCF.Pages.planoAcao = (container) => {
    let editingId = null;

    const toggleWhenFields = () => {
      const ativo = document.getElementById('pa-agenda-ativo').checked;
      const dateEl = document.getElementById('pa-when-date');
      const timeEl = document.getElementById('pa-when-time');
      dateEl.required = ativo;
      timeEl.required = ativo;
      document.getElementById('pa-when-hint').textContent = ativo
        ? 'Data e hora são obrigatórias para gerar o lembrete na Agenda.'
        : 'Campos opcionais. Ative o vínculo abaixo para gerar um lembrete na Agenda.';
    };

    const resetForm = () => {
      editingId = null;
      document.getElementById('pa-form').reset();
      document.getElementById('pa-status').value = 'Pendente';
      document.getElementById('pa-when-date').value = H.hoje();
      document.getElementById('pa-when-time').value = H.horaAtual();
      document.getElementById('pa-agenda-ativo').checked = false;
      toggleWhenFields();
      document.getElementById('pa-submit-label').textContent = 'Adicionar ação';
      document.getElementById('pa-cancel-edit').style.display = 'none';
    };

    const render = () => {
      const contatos = S.getContatos().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      const acoes = S.getPlanoAcoes().sort((a, b) => {
        const statusCmp = STATUS_OPTS.indexOf(a.status) - STATUS_OPTS.indexOf(b.status);
        if (statusCmp !== 0) return statusCmp;
        return (a.whenDate || '').localeCompare(b.whenDate || '') || (a.whenTime || '').localeCompare(b.whenTime || '');
      });

      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2><i data-lucide="list-todo"></i> Plano de Ação 5W2H</h2>
          </div>

          <div class="card plano-acao-card">
            <h3>Nova ação</h3>
            <form id="pa-form" class="plano-acao-form">
              <div class="form-group">
                <label>O quê? (What)</label>
                <textarea id="pa-what" rows="2" required placeholder="Descreva a ação"></textarea>
              </div>
              <div class="form-group">
                <label>Por quê? (Why)</label>
                <textarea id="pa-why" rows="2" placeholder="Motivo ou objetivo da ação"></textarea>
              </div>
              <div class="form-group">
                <label>Onde? (Where)</label>
                <input type="text" id="pa-where" placeholder="Local ou contexto">
              </div>
              <div class="form-group">
                <label>Quem? (Who)</label>
                <select id="pa-who-contact">
                  <option value="">Selecione um contato</option>
                  ${contatos.map(c => `<option value="${c.id}">${H.esc(c.nome)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group plano-acao-form-span-2">
                <label>Como? (How)</label>
                <textarea id="pa-how" rows="2" placeholder="Como a ação será executada"></textarea>
              </div>
              <div class="form-group">
                <label>Quanto custa? (How much)</label>
                <input type="text" id="pa-how-much" placeholder="Ex.: R$ 150,00">
              </div>
              <div class="form-group">
                <label>Status</label>
                <select id="pa-status">
                  ${STATUS_OPTS.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
              </div>
              <fieldset class="plano-acao-when plano-acao-form-span-2">
                <legend>Quando? (When)</legend>
                <div class="plano-acao-when-fields">
                  <div class="form-group">
                    <label for="pa-when-date">Data</label>
                    <input type="date" id="pa-when-date" value="${H.hoje()}">
                  </div>
                  <div class="form-group">
                    <label for="pa-when-time">Hora</label>
                    <input type="time" id="pa-when-time" value="${H.horaAtual()}">
                  </div>
                </div>
                <small id="pa-when-hint" class="form-hint"></small>
              </fieldset>
              <div class="form-group plano-acao-checkbox-group plano-acao-form-span-2">
                <label class="plano-acao-checkbox">
                  <input type="checkbox" id="pa-agenda-ativo">
                  <span>Vincular na Agenda e gerar lembrete</span>
                </label>
              </div>
              <div class="form-group plano-acao-form-actions plano-acao-form-span-2">
                <button type="submit" class="btn btn-primary"><span id="pa-submit-label">Adicionar ação</span></button>
                <button type="button" class="btn btn-secondary" id="pa-cancel-edit" style="display:none">Cancelar edição</button>
              </div>
            </form>
          </div>

          <div class="card plano-acao-card plano-acao-table-card">
            <h3>Tabela 5W2H (${acoes.length})</h3>
            ${acoes.length === 0 ? '<p class="empty-text">Nenhuma ação cadastrada</p>' : `
              <div class="table-wrapper">
                <table class="table">
                  <thead>
                    <tr>
                      <th>O quê?</th>
                      <th>Por quê?</th>
                      <th>Onde?</th>
                      <th>Quem?</th>
                      <th>Como?</th>
                      <th>Quanto?</th>
                      <th>Quando?</th>
                      <th>Status</th>
                      <th>Agenda</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${acoes.map(acao => `
                      <tr>
                        <td>${H.esc(acao.what || '—')}</td>
                        <td>${H.esc(acao.why || '—')}</td>
                        <td>${H.esc(acao.where || '—')}</td>
                        <td>${H.esc(getWhoLabel(acao))}</td>
                        <td>${H.esc(acao.how || '—')}</td>
                        <td>${H.esc(acao.howMuch || '—')}</td>
                        <td>${acao.whenDate ? `${H.formatarData(acao.whenDate)} ${acao.whenTime || ''}` : '—'}</td>
                        <td><span class="status-badge" style="background:${STATUS_COLORS[acao.status] || '#6b7280'}">${acao.status}</span></td>
                        <td>${acao.agendaAtivo ? '<span class="badge badge-info">Sim</span>' : '<span class="badge badge-neutral">Não</span>'}</td>
                        <td class="actions-cell">
                          <button class="btn-icon" data-pa-edit="${acao.id}" title="Editar"><i data-lucide="pencil"></i></button>
                          <button class="btn-icon btn-danger" data-pa-del="${acao.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#plano-acao');

      document.getElementById('pa-agenda-ativo').onchange = toggleWhenFields;
      toggleWhenFields();

      document.getElementById('pa-form').onsubmit = (e) => {
        e.preventDefault();
        const agendaAtivo = document.getElementById('pa-agenda-ativo').checked;
        const whoContactId = document.getElementById('pa-who-contact').value;
        const data = {
          what: document.getElementById('pa-what').value.trim(),
          why: document.getElementById('pa-why').value.trim(),
          where: document.getElementById('pa-where').value.trim(),
          whoContactId,
          who: getContatoNome(whoContactId),
          how: document.getElementById('pa-how').value.trim(),
          howMuch: document.getElementById('pa-how-much').value.trim(),
          whenDate: document.getElementById('pa-when-date').value,
          whenTime: document.getElementById('pa-when-time').value,
          agendaAtivo,
          status: document.getElementById('pa-status').value,
        };

        if (agendaAtivo && (!data.whenDate || !data.whenTime)) {
          alert('Para vincular na Agenda, informe data e hora.');
          return;
        }

        if (editingId) S.updatePlanoAcao(editingId, data);
        else S.addPlanoAcao(data);

        render();
        resetForm();
      };

      document.getElementById('pa-cancel-edit').onclick = resetForm;

      container.onclick = (e) => {
        const editBtn = e.target.closest('[data-pa-edit]');
        if (editBtn) {
          const acao = S.getPlanoAcoes().find(a => a.id === editBtn.dataset.paEdit);
          if (!acao) return;
          editingId = acao.id;
          document.getElementById('pa-what').value = acao.what || '';
          document.getElementById('pa-why').value = acao.why || '';
          document.getElementById('pa-where').value = acao.where || '';
          document.getElementById('pa-who-contact').value = acao.whoContactId || '';
          document.getElementById('pa-how').value = acao.how || '';
          document.getElementById('pa-how-much').value = acao.howMuch || '';
          document.getElementById('pa-when-date').value = acao.whenDate || H.hoje();
          document.getElementById('pa-when-time').value = acao.whenTime || H.horaAtual();
          document.getElementById('pa-agenda-ativo').checked = !!acao.agendaAtivo;
          document.getElementById('pa-status').value = acao.status || 'Pendente';
          document.getElementById('pa-submit-label').textContent = 'Salvar ação';
          document.getElementById('pa-cancel-edit').style.display = '';
          toggleWhenFields();
          document.getElementById('pa-what').focus();
          return;
        }

        const delBtn = e.target.closest('[data-pa-del]');
        if (delBtn && confirm('Remover esta ação do plano?')) {
          S.deletePlanoAcao(delBtn.dataset.paDel);
          render();
        }
      };
    };

    render();
    resetForm();
  };
})();
