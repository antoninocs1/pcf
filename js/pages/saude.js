/* ========================================================
   PCF - pages/saude.js — IMC, Consultas, Medicamentos e Emoções (registro)
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;

  /* ==================== IMC ==================== */
  PCF.Pages.imc = (container) => {
    PCF.App.destroyCharts();
    const saved = S.getIMC();
    const registros = saved.registros || [];
    const ultimo = registros[registros.length - 1] || {};
    const alturaSalva = saved.altura || ultimo.altura || '';
    container.innerHTML = `
      <div class="page">
        <h2>Cálculo do IMC</h2><br>
        <p class="subtitle">IMC é a sigla para índice de Massa Corpórea, parâmetro utilizado para avaliar se o peso está dentro do valor ideal para a altura.</p>
        <p class="subtitle">O índice é calculado da seguinte maneira: IMC = Peso ÷ (Altura × Altura)</p>
        <div class="imc-layout">
          <div class="imc-form">
            <div class="form-group"><label>Data do registro</label><input type="date" id="imc-data" value="${H.hoje()}"></div>
            <div class="form-group"><label>Peso (Kg)</label><input type="number" id="imc-peso" step="0.1" min="0" placeholder="Ex: 65" value="${ultimo.peso || ''}"></div>
            <div class="form-group">
              <label>Altura (m)</label>
              <input type="number" id="imc-altura" step="0.01" min="0" placeholder="Ex: 1.70" value="${alturaSalva || ''}">
              ${alturaSalva ? '<small class="form-hint">Altura preenchida automaticamente a partir do primeiro registro. Edite apenas se precisar corrigir.</small>' : '<small class="form-hint">Informe sua altura no primeiro registro. Depois ela ficará gravada para os próximos pesos.</small>'}
            </div>
            <button id="imc-salvar" class="btn btn-primary">Salvar Registro</button>
            <div id="imc-result"></div>
          </div>
          <div class="imc-table-container">
            <h3>Tabela de Referência</h3>
            <table class="table"><thead><tr><th>IMC</th><th>Classificação</th><th>Grau</th></tr></thead>
            <tbody>${H.IMC_CLASS.map((c, i) => `<tr id="imc-row-${i}"><td>${c.max === Infinity ? 'Maior que ' + c.min : i === 0 ? 'Menor que ' + c.max : 'Entre ' + c.min + ' e ' + c.max}</td><td>${c.nome}</td><td>${c.grau}</td></tr>`).join('')}</tbody></table>
          </div>
        </div>
        <div class="imc-history">
          <div class="chart-container imc-chart-container">
            <h3>Variação de Peso e IMC</h3>
            ${registros.length ? '<canvas id="imc-chart"></canvas>' : '<p class="empty-text">Salve seu primeiro registro para visualizar o gráfico.</p>'}
          </div>
          <div class="imc-table-container">
            <h3>Registros efetuados</h3>
            ${registros.length ? `
              <div class="table-container"><table class="table">
                <thead><tr><th>Data</th><th>Peso</th><th>Altura</th><th>IMC</th><th style="width:70px">Ações</th></tr></thead>
                <tbody>${[...registros].reverse().map(r => `<tr>
                  <td>${H.formatarData(r.data)}</td>
                  <td>${Number(r.peso).toFixed(1)} kg</td>
                  <td>${Number(r.altura).toFixed(2)} m</td>
                  <td>${Number(r.imc || H.calcularIMC(r.peso, r.altura)).toFixed(2)}</td>
                  <td><button class="btn-icon btn-danger" data-del-imc="${H.esc(r.id || r.data)}" title="Remover registro"><i data-lucide="trash-2"></i></button></td>
                </tr>`).join('')}</tbody>
              </table></div>` : '<p class="empty-text">Nenhum registro de IMC salvo ainda.</p>'}
          </div>
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons();
    PCF.App.applyStandardHeader?.(container, '#imc');

    const calcular = () => {
      const peso = parseFloat(document.getElementById('imc-peso').value) || 0;
      const altura = parseFloat(document.getElementById('imc-altura').value) || 0;
      const imc = H.calcularIMC(peso, altura);
      if (imc <= 0) { document.getElementById('imc-result').innerHTML = ''; return; }
      const cl = H.IMC_CLASS.find(c => imc >= c.min && imc < c.max) || H.IMC_CLASS[H.IMC_CLASS.length - 1];
      const idx = H.IMC_CLASS.indexOf(cl);
      const cor = imc < 18.5 ? '#f59e0b' : imc < 25 ? '#16a34a' : imc < 30 ? '#f59e0b' : '#dc2626';
      let msg = '';
      if (imc < 18.5) msg = 'Você está abaixo do peso ideal. Consulte um nutricionista.';
      else if (imc < 25) msg = 'Parabéns! Você está no seu peso ideal! 🎉';
      else if (imc < 30) msg = 'Você está acima do peso. Considere ajustar sua alimentação.';
      else if (imc < 40) msg = 'Atenção! Procure orientação médica.';
      else msg = 'Obesidade grave! Procure ajuda médica urgente.';

      document.getElementById('imc-result').innerHTML = `
        <div class="imc-result-card" style="border-color:${cor}">
          <div class="imc-value" style="color:${cor}">IMC: ${imc.toFixed(2)}</div>
          <div class="imc-class">${cl.nome}${cl.grau > 0 ? ' (Grau ' + cl.grau + ')' : ''}</div>
          <p class="imc-message">${msg}</p>
        </div>`;
      document.querySelectorAll('[id^="imc-row-"]').forEach(r => r.classList.remove('highlight'));
      const row = document.getElementById('imc-row-' + idx);
      if (row) row.classList.add('highlight');
    };

    document.getElementById('imc-salvar').onclick = () => {
      const data = document.getElementById('imc-data').value || H.hoje();
      const peso = parseFloat(document.getElementById('imc-peso').value) || 0;
      const altura = parseFloat(document.getElementById('imc-altura').value) || saved.altura || 0;
      if (peso <= 0 || altura <= 0) { alert('Informe peso e altura válidos para salvar o registro.'); return; }
      const imc = H.calcularIMC(peso, altura);
      const novosRegistros = [...registros.filter(r => r.data !== data), { id: Date.now().toString(36), data, peso, altura, imc }]
        .sort((a, b) => a.data.localeCompare(b.data));
      S.saveIMC({ altura, peso, registros: novosRegistros });
      PCF.Pages.imc(container);
    };
    container.querySelectorAll('[data-del-imc]').forEach(btn => {
      btn.onclick = () => {
        if (!confirm('Remover este registro de IMC?')) return;
        const id = btn.dataset.delImc;
        const novosRegistros = registros.filter(r => (r.id || r.data) !== id);
        const ultimoRegistro = novosRegistros[novosRegistros.length - 1] || {};
        S.saveIMC({
          altura: saved.altura || ultimoRegistro.altura || '',
          peso: ultimoRegistro.peso || 0,
          registros: novosRegistros,
        });
        PCF.Pages.imc(container);
      };
    });
    calcular();

    if (registros.length && window.Chart) {
      const labels = registros.map(r => H.formatarData(r.data));
      PCF.App.registerChart(new Chart(document.getElementById('imc-chart'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Peso (kg)',
              data: registros.map(r => Number(r.peso)),
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59,130,246,.16)',
              yAxisID: 'yPeso',
              tension: .32,
              pointRadius: 4,
            },
            {
              label: 'IMC',
              data: registros.map(r => Number((r.imc || H.calcularIMC(r.peso, r.altura)).toFixed(2))),
              borderColor: '#16a34a',
              backgroundColor: 'rgba(22,163,74,.16)',
              yAxisID: 'yImc',
              tension: .32,
              pointRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            yPeso: { type: 'linear', position: 'left', title: { display: true, text: 'Peso (kg)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.15)' } },
            yImc: { type: 'linear', position: 'right', title: { display: true, text: 'IMC', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { drawOnChartArea: false } },
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.1)' } },
          },
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8' } },
            datalabels: { display: false },
          },
        },
      }));
    }
  };

  /* ==================== CONSULTAS E EXAMES ==================== */
  PCF.Pages.saudeConsultas = (container) => {
    const TIPOS = ['Consultas médicas', 'Consultas odontológicas', 'Exames', 'Procedimento', 'Retorno/Revisão', 'Vacinação', 'Outros'];
    const STATUS = ['Pendente', 'Realizado', 'Cancelado'];
    const STATUS_COLORS = { 'Pendente': '#f59e0b', 'Realizado': '#16a34a', 'Cancelado': '#dc2626' };
    let editingId = null;

    const render = () => {
      const eventos = (S.getSaudeEventos ? S.getSaudeEventos() : [])
        .sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.hora || '').localeCompare(b.hora || ''));
      const contatos = S.getContatos ? S.getContatos() : [];
      const contatoMap = Object.fromEntries(contatos.map(c => [c.id, c]));
      const nomeResponsavel = (evento) => evento.responsavelContatoId
        ? (contatoMap[evento.responsavelContatoId]?.nome || 'Contato removido')
        : 'Própria pessoa';
      const pendentes = eventos.filter(e => e.status === 'Pendente').length;
      const realizados = eventos.filter(e => e.status === 'Realizado').length;
      const vinculados = eventos.filter(e => e.agendaAtivo && e.data).length;

      container.innerHTML = `
        <div class="page saude-page">
          <div class="page-header">
            <div>
              <h2>Saúde - Consultas e Exames</h2>
              <p class="subtitle">Organize consultas, exames, procedimentos e revisões de saúde com vínculo opcional na Agenda.</p>
            </div>
          </div>

          <div class="cards-grid">
            <div class="card"><div class="card-label">Pendentes</div><div class="card-value">${pendentes}</div></div>
            <div class="card"><div class="card-label">Realizados</div><div class="card-value">${realizados}</div></div>
            <div class="card"><div class="card-label">Na Agenda</div><div class="card-value">${vinculados}</div></div>
          </div>

          <div class="card plano-acao-card" id="saude-form-card">
            <h3 id="saude-form-title">Novo registro</h3>
            <form id="saude-evento-form" class="plano-acao-form">
              <div class="form-group">
                <label>Tipo</label>
                <select id="se-tipo" required>${TIPOS.map(t => `<option value="${H.esc(t)}">${H.esc(t)}</option>`).join('')}</select>
              </div>
              <div class="form-group">
                <label>Descrição</label>
                <input type="text" id="se-descricao" placeholder="Ex: Cardiologista, check-up anual, exame de sangue" required>
              </div>
              <div class="form-group">
                <label>Profissional / Clínica / Laboratório</label>
                <input type="text" id="se-local" placeholder="Nome do profissional, clínica ou laboratório">
              </div>
              <div class="form-group">
                <label>Status</label>
                <select id="se-status">${STATUS.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
                <small class="form-hint">Pendente significa agendado ou ainda aguardando realização.</small>
              </div>
              <fieldset class="plano-acao-when plano-acao-form-span-2">
                <legend>Data e horário</legend>
                <div class="plano-acao-when-fields">
                  <div class="form-group"><label>Data</label><input type="date" id="se-data" value="${H.hoje()}"></div>
                  <div class="form-group"><label>Hora</label><input type="time" id="se-hora"></div>
                </div>
              </fieldset>
              <div id="se-sintomas" class="alert sm-estoque-alerta plano-acao-form-span-2" style="display:none"></div>
              <div class="form-group plano-acao-form-span-2">
                <label>Observações / Resultado</label>
                <textarea id="se-observacoes" rows="3" placeholder="Resultado do exame, orientação recebida, preparo, endereço ou documentos necessários"></textarea>
              </div>
              <details class="form-mais plano-acao-form-span-2" id="se-mais">
                <summary>Mais opções</summary>
                <div class="form-mais-campos">
                  <div class="form-group">
                    <label>Para quem?</label>
                    <select id="se-responsavel">
                      <option value="">Própria pessoa</option>
                      ${contatos.map(c => `<option value="${H.esc(c.id)}">${H.esc(c.nome)}</option>`).join('')}
                    </select>
                    <small class="form-hint">Use um contato quando a consulta/exame for de alguém sob sua responsabilidade.</small>
                  </div>
                  <div class="form-group">
                    <label>Próxima revisão</label>
                    <input type="date" id="se-revisao">
                    <small class="form-hint">Para lembrar retornos, repetição de exames ou acompanhamento periódico.</small>
                  </div>
                </div>
              </details>
              <div class="form-group plano-acao-checkbox-group plano-acao-form-span-2">
                <label class="plano-acao-checkbox">
                  <input type="checkbox" id="se-agenda-ativo" checked>
                  <span>Vincular na Agenda e gerar lembrete</span>
                </label>
              </div>
              <div class="form-group plano-acao-form-actions plano-acao-form-span-2">
                <button type="submit" class="btn btn-primary" id="se-submit">Salvar registro</button>
                <button type="button" class="btn btn-secondary" id="se-cancel">Cancelar</button>
              </div>
            </form>
          </div>

          <div class="card plano-acao-card plano-acao-table-card">
            <h3>Registros de saúde (${eventos.length})</h3>
            ${eventos.length === 0 ? '<p class="empty-text">Nenhuma consulta, exame ou procedimento registrado.</p>' : `
              <div class="table-container">
                <table class="table">
                  <thead><tr><th>Tipo</th><th>Descrição</th><th>Para quem</th><th>Data</th><th>Revisão</th><th>Status</th><th>Agenda</th><th style="width:104px">Ações</th></tr></thead>
                  <tbody>${eventos.map(e => `
                    <tr>
                      <td>${H.esc(e.tipo || 'Outros')}</td>
                      <td><strong>${H.esc(e.descricao || '')}</strong>${e.local ? `<br><small>${H.esc(e.local)}</small>` : ''}</td>
                      <td>${H.esc(nomeResponsavel(e))}</td>
                      <td>${e.data ? H.formatarData(e.data) : '—'} ${e.hora || ''}</td>
                      <td>${e.proximaRevisao ? H.formatarData(e.proximaRevisao) : '—'}</td>
                      <td><span class="status-badge" style="background:${STATUS_COLORS[e.status] || '#6b7280'}">${H.esc(e.status || 'Pendente')}</span></td>
                      <td>${e.agendaAtivo ? '<span class="badge badge-info">Sim</span>' : '<span class="badge badge-neutral">Não</span>'}</td>
                      <td class="actions-cell">
                        ${e.status !== 'Realizado' ? `<button class="btn-icon" data-ok-se="${e.id}" title="Marcar como realizado"><i data-lucide="check"></i></button>` : ''}
                        <button class="btn-icon" data-edit-se="${e.id}" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon btn-danger" data-del-se="${e.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                      </td>
                    </tr>`).join('')}</tbody>
                </table>
              </div>`}
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#saude-consultas');
      const painelForm = H.formRecolhivel(document.getElementById('saude-form-card'), 'Novo registro', eventos.length === 0);

      const resetForm = () => {
        editingId = null;
        document.getElementById('saude-form-title').textContent = 'Novo registro';
        document.getElementById('se-submit').textContent = 'Salvar registro';
        document.getElementById('saude-evento-form').reset();
        document.getElementById('se-data').value = H.hoje();
        document.getElementById('se-agenda-ativo').checked = true;
        document.getElementById('se-mais').open = false;
        document.getElementById('se-sintomas').style.display = 'none';
        syncRevisaoMin();
        if (eventos.length) painelForm.fechar();
      };

      // Sintomas registrados desde a última consulta realizada, para levar ao profissional
      const mostrarSintomasDaConsulta = (item) => {
        const box = document.getElementById('se-sintomas');
        const TIPOS_CONSULTA = ['Consultas médicas', 'Consultas odontológicas', 'Retorno/Revisão'];
        box.style.display = 'none';
        if (!TIPOS_CONSULTA.includes(item.tipo) || item.responsavelContatoId) return;
        const dataConsulta = item.data || H.hoje();
        const anterior = eventos
          .filter(ev => ev.id !== item.id && ev.status === 'Realizado' && !ev.responsavelContatoId && TIPOS_CONSULTA.includes(ev.tipo) && ev.data && ev.data < dataConsulta)
          .map(ev => ev.data).sort().pop();
        const limite = item.status === 'Realizado' ? dataConsulta : H.hoje();
        const sintomas = S.getSaudeSintomas()
          .filter(r => (!anterior || r.data >= anterior) && r.data <= limite)
          .sort((a, b) => b.data.localeCompare(a.data));
        if (!sintomas.length) return;
        box.innerHTML = `
          <strong>Sintomas ${anterior ? 'desde a última consulta (' + H.formatarData(anterior) + ')' : 'registrados'}:</strong>
          <ul class="se-sintomas-lista">${sintomas.slice(0, 10).map(r => `<li>${H.formatarData(r.data)} - ${H.esc(r.sintoma)} (${r.intensidade}/10)</li>`).join('')}</ul>
          ${sintomas.length > 10 ? `<small>e mais ${sintomas.length - 10}. Veja em <a href="#saude-sintomas">Sintomas</a>.</small>` : ''}`;
        box.style.display = '';
      };

      const syncRevisaoMin = () => {
        const dataConsulta = document.getElementById('se-data').value;
        const revisaoEl = document.getElementById('se-revisao');
        revisaoEl.min = dataConsulta || '';
        if (dataConsulta && revisaoEl.value && revisaoEl.value < dataConsulta) revisaoEl.value = '';
      };

      document.getElementById('se-cancel').onclick = resetForm;
      document.getElementById('se-data').onchange = syncRevisaoMin;
      syncRevisaoMin();
      document.getElementById('saude-evento-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
          tipo: document.getElementById('se-tipo').value,
          descricao: document.getElementById('se-descricao').value.trim(),
          local: document.getElementById('se-local').value.trim(),
          responsavelContatoId: document.getElementById('se-responsavel').value,
          status: document.getElementById('se-status').value,
          data: document.getElementById('se-data').value,
          hora: document.getElementById('se-hora').value,
          proximaRevisao: document.getElementById('se-revisao').value,
          observacoes: document.getElementById('se-observacoes').value.trim(),
          agendaAtivo: document.getElementById('se-agenda-ativo').checked,
        };
        if (!data.descricao) { alert('Informe a descrição do registro.'); return; }
        if (data.agendaAtivo && !data.data) { alert('Para vincular na Agenda, informe uma data.'); return; }
        if (data.data && data.proximaRevisao && data.proximaRevisao < data.data) {
          alert('A próxima revisão não pode ser anterior à data da consulta/exame.');
          return;
        }
        if (editingId) S.updateSaudeEvento(editingId, data);
        else S.addSaudeEvento(data);
        render();
      };

      container.querySelector('.plano-acao-table-card')?.addEventListener('click', (e) => {
        const okBtn = e.target.closest('[data-ok-se]');
        if (okBtn) {
          S.updateSaudeEvento(okBtn.dataset.okSe, { status: 'Realizado' });
          render();
          return;
        }
        const editBtn = e.target.closest('[data-edit-se]');
        if (editBtn) {
          const item = eventos.find(ev => ev.id === editBtn.dataset.editSe);
          if (!item) return;
          editingId = item.id;
          document.getElementById('saude-form-title').textContent = 'Editando registro';
          document.getElementById('se-submit').textContent = 'Salvar alterações';
          document.getElementById('se-mais').open = !!(item.responsavelContatoId || item.proximaRevisao);
          mostrarSintomasDaConsulta(item);
          painelForm.abrir(false);
          document.getElementById('se-tipo').value = item.tipo || TIPOS[0];
          document.getElementById('se-descricao').value = item.descricao || '';
          document.getElementById('se-local').value = item.local || '';
          document.getElementById('se-responsavel').value = item.responsavelContatoId || '';
          document.getElementById('se-status').value = item.status || 'Pendente';
          document.getElementById('se-data').value = item.data || '';
          document.getElementById('se-hora').value = item.hora || '';
          document.getElementById('se-revisao').value = item.proximaRevisao || '';
          document.getElementById('se-observacoes').value = item.observacoes || '';
          document.getElementById('se-agenda-ativo').checked = !!item.agendaAtivo;
          syncRevisaoMin();
          document.getElementById('saude-evento-form').scrollIntoView({ behavior: 'smooth' });
          return;
        }
        const delBtn = e.target.closest('[data-del-se]');
        if (delBtn && confirm('Remover este registro de saúde?')) {
          S.deleteSaudeEvento(delBtn.dataset.delSe);
          render();
        }
      });
    };

    render();
  };

  /* ==================== MEDICAMENTOS / POSOLOGIA ==================== */
  PCF.Pages.saudeMedicamentos = (container) => {
    const STATUS = ['Em uso', 'Pausado', 'Finalizado'];
    const STATUS_COLORS = { 'Em uso': '#16a34a', 'Pausado': '#f59e0b', 'Finalizado': '#64748b' };
    const DOSE_STATUS = {
      tomado: { label: 'Tomada', cor: '#16a34a' },
      pulado: { label: 'Pulada', cor: '#64748b' },
      atrasada: { label: 'Atrasada', cor: '#dc2626' },
      proxima: { label: 'Próxima', cor: '#3b82f6' },
    };
    const FREQUENCIAS = H.FREQUENCIAS_MEDICAMENTO;
    const CONFORME = 'Conforme necessidade';
    const ESTOQUE_ALERTA_DIAS = 7;
    let editingId = null;

    const extrairHorarios = (texto) => H.extrairHorarios ? H.extrairHorarios(texto) : [];

    const getMedicamentos = () => (S.getSaudeMedicamentos ? [...S.getSaudeMedicamentos()] : [])
      .sort((a, b) => (a.status || '').localeCompare(b.status || '') || (a.nome || '').localeCompare(b.nome || ''));
    const contatos = S.getContatos ? S.getContatos() : [];
    const contatoMap = Object.fromEntries(contatos.map(c => [c.id, c]));
    const responsavelNome = (med) => med.responsavelContatoId
      ? (contatoMap[med.responsavelContatoId]?.nome || 'Contato removido')
      : 'Própria pessoa';

    const htmlResumo = () => {
      const medicamentos = getMedicamentos();
      const doses = S.getSaudeDoses();
      const hoje = H.hoje();
      const agoraHora = H.horaAtual();
      const emUsoLista = medicamentos.filter(m => m.status === 'Em uso');
      const pausados = medicamentos.filter(m => m.status === 'Pausado').length;
      const naAgenda = medicamentos.filter(m => m.agendaAtivo && m.dataInicio).length;
      const inicioAdesao = new Date();
      inicioAdesao.setDate(inicioAdesao.getDate() - 29);
      const adesao = H.adesaoPeriodo(medicamentos, doses, H.dataISO(inicioAdesao), hoje);
      const dosesHoje = emUsoLista
        .flatMap(med => H.dosesDoDia(med, hoje).map(hora => ({
          med, hora, reg: doses.find(d => d.medId === med.id && d.data === hoje && d.hora === hora),
        })))
        .sort((a, b) => a.hora.localeCompare(b.hora) || (a.med.nome || '').localeCompare(b.med.nome || ''));
      const tomadasHoje = dosesHoje.filter(d => d.reg?.status === 'tomado').length;
      const usoLivre = emUsoLista.filter(m => H.normalizarFrequencia(m.frequencia) === CONFORME);
      const avisosEstoque = emUsoLista.map(med => {
        if (typeof med.estoqueQtd !== 'number') return null;
        if (med.estoqueQtd <= 0) return `${med.nome}: estoque zerado`;
        const dias = H.diasEstoqueMedicamento(med);
        if (dias === null || dias > ESTOQUE_ALERTA_DIAS) return null;
        return `${med.nome}: estoque para ${dias} dia${dias === 1 ? '' : 's'}`;
      }).filter(Boolean);

      return `
        <div class="cards-grid">
          <div class="card"><div class="card-label">Em uso</div><div class="card-value">${emUsoLista.length}</div></div>
          <div class="card"><div class="card-label">Pausados</div><div class="card-value">${pausados}</div></div>
          <div class="card"><div class="card-label">Na Agenda</div><div class="card-value">${naAgenda}</div></div>
          <div class="card"><div class="card-label">Doses hoje</div><div class="card-value">${tomadasHoje} / ${dosesHoje.length}</div></div>
          <div class="card"><div class="card-label">Adesão (30 dias)</div><div class="card-value">${adesao === null ? '—' : adesao + '%'}</div></div>
        </div>

        ${avisosEstoque.length ? `<div class="alert alert-warning sm-estoque-alerta"><strong>Reposição:</strong> ${avisosEstoque.map(H.esc).join(' · ')}</div>` : ''}

        <div class="card plano-acao-card">
          <h3>Doses de hoje</h3>
          ${dosesHoje.length === 0 ? '<p class="empty-text">Nenhuma dose prevista para hoje.</p>' : `
            <div class="sm-doses">
              ${dosesHoje.map(({ med, hora, reg }) => {
                const situacao = reg ? reg.status : (hora <= agoraHora ? 'atrasada' : 'proxima');
                return `
                <div class="sm-dose">
                  <strong class="sm-dose-hora">${hora}</strong>
                  <div class="sm-dose-info">
                    <strong>${H.esc(med.nome || '')}</strong>
                    <small>${H.esc(med.dose || '')}${med.responsavelContatoId ? ' · ' + H.esc(responsavelNome(med)) : ''}</small>
                  </div>
                  <span class="status-badge" style="background:${DOSE_STATUS[situacao].cor}">${DOSE_STATUS[situacao].label}</span>
                  <div class="sm-dose-acoes">
                    ${reg
                      ? `<button type="button" class="btn btn-outline btn-sm" data-dose-undo="${reg.id}"><i data-lucide="undo-2"></i> Desfazer</button>`
                      : `<button type="button" class="btn btn-primary btn-sm" data-dose-ok="${med.id}" data-hora="${hora}"><i data-lucide="check"></i> Tomado</button>
                         <button type="button" class="btn btn-outline btn-sm" data-dose-skip="${med.id}" data-hora="${hora}">Pular</button>`}
                  </div>
                </div>`;
              }).join('')}
            </div>`}
          ${usoLivre.length ? `
            <h4 class="sm-subtitulo">Conforme necessidade</h4>
            <div class="sm-doses">
              ${usoLivre.map(med => {
                const qtdHoje = doses.filter(d => d.medId === med.id && d.data === hoje && d.status === 'tomado').length;
                return `
                <div class="sm-dose">
                  <strong class="sm-dose-hora">${qtdHoje}x</strong>
                  <div class="sm-dose-info">
                    <strong>${H.esc(med.nome || '')}</strong>
                    <small>${H.esc(med.dose || '')}${med.responsavelContatoId ? ' · ' + H.esc(responsavelNome(med)) : ''}</small>
                  </div>
                  <span></span>
                  <div class="sm-dose-acoes">
                    <button type="button" class="btn btn-primary btn-sm" data-dose-livre="${med.id}"><i data-lucide="plus"></i> Registrar dose</button>
                  </div>
                </div>`;
              }).join('')}
            </div>` : ''}
        </div>`;
    };

    const htmlLista = () => {
      const medicamentos = getMedicamentos();
      const estoqueTexto = (m) => {
        if (typeof m.estoqueQtd !== 'number') return '—';
        const dias = H.diasEstoqueMedicamento(m);
        return `${m.estoqueQtd}${dias !== null ? `<br><small>para ${dias} dia${dias === 1 ? '' : 's'}</small>` : ''}`;
      };
      return `
        <h3>Medicamentos (${medicamentos.length})</h3>
        ${medicamentos.length === 0 ? '<p class="empty-text">Nenhum medicamento registrado.</p>' : `
          <div class="table-container">
            <table class="table">
              <thead><tr><th>Medicamento</th><th>Dose</th><th>Frequência</th><th>Para quem</th><th>Período</th><th>Estoque</th><th>Status</th><th>Agenda</th><th style="width:104px">Ações</th></tr></thead>
              <tbody>${medicamentos.map(m => {
                const frequencia = H.normalizarFrequencia(m.frequencia);
                const horarios = H.horariosMedicamento(m);
                return `
                <tr>
                  <td><strong>${H.esc(m.nome || '')}</strong>${m.posologia ? `<br><small>${H.esc(m.posologia)}</small>` : ''}</td>
                  <td>${H.esc(m.dose || '')}</td>
                  <td>${H.esc(frequencia)}${frequencia === 'Semanal' ? `<br><small>${H.esc(H.DIAS_SEMANA[H.diaSemanaMedicamento(m)] || '')}</small>` : ''}${horarios.length ? `<br><small>${horarios.join(', ')}</small>` : ''}</td>
                  <td>${H.esc(responsavelNome(m))}</td>
                  <td>${m.dataInicio ? H.formatarData(m.dataInicio) : '-'}${m.dataFim ? '<br><small>até ' + H.formatarData(m.dataFim) + '</small>' : ''}</td>
                  <td>${estoqueTexto(m)}</td>
                  <td><span class="status-badge" style="background:${STATUS_COLORS[m.status] || '#6b7280'}">${H.esc(m.status || 'Em uso')}</span></td>
                  <td>${m.agendaAtivo ? '<span class="badge badge-info">Sim</span>' : '<span class="badge badge-neutral">Não</span>'}</td>
                  <td class="actions-cell">
                    ${m.status !== 'Finalizado' ? `<button class="btn-icon" data-finish-sm="${m.id}" title="Marcar como finalizado"><i data-lucide="check"></i></button>` : ''}
                    <button class="btn-icon" data-edit-sm="${m.id}" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon btn-danger" data-del-sm="${m.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                  </td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>`}`;
    };

    const htmlHistorico = () => {
      const historico = [...S.getSaudeDoses()]
        .sort((a, b) => b.data.localeCompare(a.data) || b.hora.localeCompare(a.hora))
        .slice(0, 30);
      return `
        <h3>Histórico de doses</h3>
        ${historico.length === 0 ? '<p class="empty-text">Nenhuma dose registrada ainda.</p>' : `
          <div class="table-container">
            <table class="table">
              <thead><tr><th>Data</th><th>Hora</th><th>Medicamento</th><th>Dose</th><th>Situação</th><th style="width:60px">Ações</th></tr></thead>
              <tbody>${historico.map(d => `
                <tr>
                  <td>${H.formatarData(d.data)}</td>
                  <td>${d.hora}</td>
                  <td>${H.esc(d.medNome || '')}</td>
                  <td>${H.esc(d.dose || '')}</td>
                  <td><span class="status-badge" style="background:${DOSE_STATUS[d.status]?.cor || '#6b7280'}">${DOSE_STATUS[d.status]?.label || H.esc(d.status)}</span></td>
                  <td class="actions-cell"><button class="btn-icon" data-dose-undo="${d.id}" title="Desfazer registro"><i data-lucide="undo-2"></i></button></td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
          <small class="form-hint">Exibe os 30 registros mais recentes.</small>`}`;
    };

    // Atualiza só os dados, sem perder o que estiver digitado no formulário
    const atualizarDados = () => {
      const resumo = document.getElementById('sm-resumo');
      if (!resumo) return;
      resumo.innerHTML = htmlResumo();
      document.getElementById('sm-lista').innerHTML = htmlLista();
      document.getElementById('sm-historico').innerHTML = htmlHistorico();
      if (window.lucide) lucide.createIcons();
    };

    const render = () => {
      container.innerHTML = `
        <div class="page saude-page">
          <div class="page-header">
            <div>
              <h2>Saúde - Medicamentos e Posologia</h2>
              <p class="subtitle">Registre medicamentos, doses, horários, período de uso, estoque e lembretes vinculados à Agenda.</p>
            </div>
          </div>

          <div id="sm-resumo"></div>

          <div class="card plano-acao-card" id="sm-form-card">
            <h3 id="sm-form-title">Novo medicamento</h3>
            <form id="saude-medicamento-form" class="plano-acao-form">
              <div class="form-group"><label>Medicamento</label><input type="text" id="sm-nome" placeholder="Ex: Losartana, vitamina D, antibiótico" required></div>
              <div class="form-group"><label>Dose</label><input type="text" id="sm-dose" placeholder="Ex: 50 mg, 1 comprimido, 20 gotas" required></div>
              <div class="form-group">
                <label>Frequência</label>
                <select id="sm-frequencia">${FREQUENCIAS.map(f => `<option value="${H.esc(f)}">${H.esc(f)}</option>`).join('')}</select>
              </div>
              <div class="form-group" id="sm-dia-semana-group" style="display:none">
                <label>Dia da semana</label>
                <select id="sm-dia-semana">${H.DIAS_SEMANA.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select>
              </div>
              <div class="form-group" id="sm-hora-inicial-group">
                <label>Horário inicial</label>
                <input type="time" id="sm-hora-inicial">
                <small class="form-hint">Hora da primeira dose. Os demais horários são definidos a partir dela.</small>
              </div>
              <div class="form-group" id="sm-horarios-group">
                <label>Horários</label>
                <input type="text" id="sm-horarios" placeholder="Ex: 08:00, 13:00, 1 PM, 8h30">
                <small class="form-hint">Preenchido pelo horário inicial; você pode ajustar. Use 24h para evitar dúvidas: 13:00 é tarde, 01:00 é madrugada.</small>
              </div>
              <div class="form-group">
                <label>Status</label>
                <select id="sm-status">${STATUS.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
              </div>
              <fieldset class="plano-acao-when plano-acao-form-span-2">
                <legend>Período de uso</legend>
                <div class="plano-acao-when-fields">
                  <div class="form-group"><label>Início</label><input type="date" id="sm-inicio" value="${H.hoje()}"></div>
                  <div class="form-group"><label>Duração (dias)</label><input type="number" id="sm-duracao" min="1" step="1" placeholder="Ex: 7"></div>
                  <div class="form-group"><label>Fim previsto</label><input type="date" id="sm-fim"></div>
                </div>
                <small class="form-hint">Informe a duração para calcular o fim previsto. Deixe em branco para uso sem data de término.</small>
              </fieldset>
              <details class="form-mais plano-acao-form-span-2" id="sm-mais">
                <summary>Mais opções</summary>
                <div class="form-mais-campos">
                  <div class="form-group plano-acao-form-span-2">
                    <label>Para quem?</label>
                    <select id="sm-responsavel">
                      <option value="">Própria pessoa</option>
                      ${contatos.map(c => `<option value="${H.esc(c.id)}">${H.esc(c.nome)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group"><label>Quantidade em estoque</label><input type="number" id="sm-estoque" min="0" step="0.5" placeholder="Ex: 30"></div>
                  <div class="form-group"><label>Quantidade por dose</label><input type="number" id="sm-qtd-dose" min="0.5" step="0.5" value="1"></div>
                  <small class="form-hint plano-acao-form-span-2">Cada dose marcada como tomada desconta do estoque. Com ${ESTOQUE_ALERTA_DIAS} dias ou menos, aparece um aviso de reposição.</small>
                </div>
              </details>
              <div class="form-group plano-acao-form-span-2">
                <label>Posologia / Orientações</label>
                <textarea id="sm-posologia" rows="3" placeholder="Ex: tomar com alimento, evitar leite, completar 7 dias, observações do médico"></textarea>
              </div>
              <div class="form-group plano-acao-checkbox-group plano-acao-form-span-2" id="sm-agenda-group">
                <label class="plano-acao-checkbox">
                  <input type="checkbox" id="sm-agenda-ativo" checked>
                  <span>Vincular na Agenda e gerar lembrete</span>
                </label>
              </div>
              <div class="form-group plano-acao-form-actions plano-acao-form-span-2">
                <button type="submit" class="btn btn-primary" id="sm-submit">Salvar medicamento</button>
                <button type="button" class="btn btn-secondary" id="sm-cancel">Cancelar</button>
              </div>
            </form>
          </div>

          <div class="card plano-acao-card plano-acao-table-card" id="sm-lista"></div>
          <div class="card plano-acao-card plano-acao-table-card" id="sm-historico"></div>
        </div>`;

      atualizarDados();
      PCF.App.applyStandardHeader?.(container, '#saude-medicamentos');
      const temMedicamentos = () => getMedicamentos().length > 0;
      const painelForm = H.formRecolhivel(document.getElementById('sm-form-card'), 'Novo medicamento', !temMedicamentos());

      const el = (id) => document.getElementById(id);

      const preencherHorarios = () => {
        const gerados = H.gerarHorariosDose(el('sm-hora-inicial').value, el('sm-frequencia').value);
        if (gerados.length) el('sm-horarios').value = gerados.join(', ');
      };

      const syncFrequencia = () => {
        const frequencia = el('sm-frequencia').value;
        const livre = frequencia === CONFORME;
        el('sm-dia-semana-group').style.display = frequencia === 'Semanal' ? '' : 'none';
        el('sm-hora-inicial-group').style.display = (livre || frequencia === 'Outro') ? 'none' : '';
        el('sm-horarios-group').style.display = livre ? 'none' : '';
        el('sm-agenda-group').style.display = livre ? 'none' : '';
      };

      const somarDias = (iso, dias) => {
        const d = new Date(`${iso}T12:00:00`);
        d.setDate(d.getDate() + dias);
        return H.dataISO(d);
      };

      const syncFimPelaDuracao = () => {
        const inicio = el('sm-inicio').value;
        const dias = parseInt(el('sm-duracao').value, 10);
        if (inicio && dias > 0) el('sm-fim').value = somarDias(inicio, dias - 1);
      };

      const syncDuracaoPeloFim = () => {
        const inicio = el('sm-inicio').value;
        const fim = el('sm-fim').value;
        el('sm-duracao').value = (inicio && fim && fim >= inicio)
          ? Math.round((new Date(`${fim}T12:00:00`) - new Date(`${inicio}T12:00:00`)) / 86400000) + 1
          : '';
      };

      const syncFimMin = () => {
        const inicio = el('sm-inicio').value;
        const fimEl = el('sm-fim');
        fimEl.min = inicio || '';
        if (inicio && fimEl.value && fimEl.value < inicio) fimEl.value = '';
      };

      const resetForm = () => {
        editingId = null;
        el('sm-form-title').textContent = 'Novo medicamento';
        el('sm-submit').textContent = 'Salvar medicamento';
        el('saude-medicamento-form').reset();
        el('sm-inicio').value = H.hoje();
        el('sm-agenda-ativo').checked = true;
        el('sm-mais').open = false;
        syncFimMin();
        syncFrequencia();
        if (temMedicamentos()) painelForm.fechar();
      };

      el('sm-cancel').onclick = resetForm;
      el('sm-frequencia').onchange = () => { syncFrequencia(); preencherHorarios(); };
      el('sm-hora-inicial').onchange = preencherHorarios;
      el('sm-duracao').oninput = syncFimPelaDuracao;
      el('sm-inicio').onchange = () => {
        if (el('sm-duracao').value) syncFimPelaDuracao();
        syncFimMin();
        syncDuracaoPeloFim();
      };
      el('sm-fim').onchange = syncDuracaoPeloFim;
      syncFimMin();
      syncFrequencia();

      el('saude-medicamento-form').onsubmit = (e) => {
        e.preventDefault();
        const frequencia = el('sm-frequencia').value;
        const livre = frequencia === CONFORME;
        const estoque = el('sm-estoque').value;
        const data = {
          nome: el('sm-nome').value.trim(),
          dose: el('sm-dose').value.trim(),
          frequencia,
          diaSemana: frequencia === 'Semanal' ? Number(el('sm-dia-semana').value) : null,
          horarioInicial: (livre || frequencia === 'Outro') ? '' : el('sm-hora-inicial').value,
          horarios: livre ? '' : el('sm-horarios').value.trim(),
          responsavelContatoId: el('sm-responsavel').value,
          status: el('sm-status').value,
          dataInicio: el('sm-inicio').value,
          dataFim: el('sm-fim').value,
          estoqueQtd: estoque === '' ? null : parseFloat(estoque),
          qtdPorDose: parseFloat(el('sm-qtd-dose').value) || 1,
          posologia: el('sm-posologia').value.trim(),
          agendaAtivo: !livre && el('sm-agenda-ativo').checked,
        };
        data.horariosParsed = extrairHorarios(data.horarios);
        if (!data.nome || !data.dose) { alert('Informe medicamento e dose.'); return; }
        if (data.agendaAtivo && !data.dataInicio) { alert('Para vincular na Agenda, informe a data de início.'); return; }
        if (data.agendaAtivo && !data.horariosParsed.length) { alert('Para avisar por horário, informe o horário inicial ou pelo menos um horário válido, como 08:00 ou 13:00.'); return; }
        if (data.dataInicio && data.dataFim && data.dataFim < data.dataInicio) { alert('O fim previsto não pode ser anterior ao início.'); return; }
        const anterior = editingId ? S.getSaudeMedicamentos().find(m => m.id === editingId) : null;
        const repos = typeof anterior?.estoqueQtd === 'number' && typeof data.estoqueQtd === 'number' && data.estoqueQtd > anterior.estoqueQtd;
        if (editingId) S.updateSaudeMedicamento(editingId, data);
        else S.addSaudeMedicamento(data);
        editingId = null;
        render();
        if (repos && confirm(`O estoque de ${data.nome} aumentou. Deseja lançar a compra como despesa no Financeiro?`)) {
          PCF._inserirPrefill = { categoria: 'Saúde', subcategoria: /^medicamentos/i, item: `Reposição - ${data.nome}` };
          location.hash = '#inserir';
        }
      };

      el('sm-resumo').addEventListener('click', (e) => {
        const hoje = H.hoje();
        const okBtn = e.target.closest('[data-dose-ok]');
        if (okBtn) { S.registrarDose({ medId: okBtn.dataset.doseOk, data: hoje, hora: okBtn.dataset.hora, status: 'tomado' }); return; }
        const skipBtn = e.target.closest('[data-dose-skip]');
        if (skipBtn) { S.registrarDose({ medId: skipBtn.dataset.doseSkip, data: hoje, hora: skipBtn.dataset.hora, status: 'pulado' }); return; }
        const livreBtn = e.target.closest('[data-dose-livre]');
        if (livreBtn) { S.registrarDose({ medId: livreBtn.dataset.doseLivre, data: hoje, hora: H.horaAtual(), status: 'tomado' }); return; }
        const undoBtn = e.target.closest('[data-dose-undo]');
        if (undoBtn) S.desfazerDose(undoBtn.dataset.doseUndo);
      });

      el('sm-historico').addEventListener('click', (e) => {
        const undoBtn = e.target.closest('[data-dose-undo]');
        if (undoBtn && confirm('Desfazer este registro de dose?')) S.desfazerDose(undoBtn.dataset.doseUndo);
      });

      el('sm-lista').addEventListener('click', (e) => {
        const finishBtn = e.target.closest('[data-finish-sm]');
        if (finishBtn) { S.updateSaudeMedicamento(finishBtn.dataset.finishSm, { status: 'Finalizado' }); atualizarDados(); return; }
        const editBtn = e.target.closest('[data-edit-sm]');
        if (editBtn) {
          const item = getMedicamentos().find(m => m.id === editBtn.dataset.editSm);
          if (!item) return;
          editingId = item.id;
          el('sm-form-title').textContent = 'Editando medicamento';
          el('sm-submit').textContent = 'Salvar alterações';
          el('sm-mais').open = !!(item.responsavelContatoId || typeof item.estoqueQtd === 'number');
          painelForm.abrir(false);
          el('sm-nome').value = item.nome || '';
          el('sm-dose').value = item.dose || '';
          el('sm-frequencia').value = H.normalizarFrequencia(item.frequencia);
          el('sm-dia-semana').value = String(H.diaSemanaMedicamento(item) ?? new Date().getDay());
          el('sm-hora-inicial').value = item.horarioInicial || H.horariosMedicamento(item)[0] || '';
          el('sm-horarios').value = item.horarios || '';
          el('sm-responsavel').value = item.responsavelContatoId || '';
          el('sm-status').value = item.status || 'Em uso';
          el('sm-inicio').value = item.dataInicio || '';
          el('sm-fim').value = item.dataFim || '';
          el('sm-estoque').value = typeof item.estoqueQtd === 'number' ? item.estoqueQtd : '';
          el('sm-qtd-dose').value = item.qtdPorDose || 1;
          el('sm-posologia').value = item.posologia || '';
          el('sm-agenda-ativo').checked = !!item.agendaAtivo;
          syncFimMin();
          syncDuracaoPeloFim();
          syncFrequencia();
          el('saude-medicamento-form').scrollIntoView({ behavior: 'smooth' });
          return;
        }
        const delBtn = e.target.closest('[data-del-sm]');
        if (delBtn && confirm('Remover este medicamento?')) { S.deleteSaudeMedicamento(delBtn.dataset.delSm); atualizarDados(); }
      });
    };

    // Doses respondidas no aviso global ou no painel refletem aqui sem recarregar a página
    if (PCF._smDosesListener) window.removeEventListener('pcf:doses-changed', PCF._smDosesListener);
    PCF._smDosesListener = atualizarDados;
    window.addEventListener('pcf:doses-changed', PCF._smDosesListener);

    render();
  };

  /* ==================== EMOÇÕES (REGISTRO) ==================== */

  const EMOCAO_ICONS = {
    'Feliz': '😊', 'Surpreso': '😲', 'Mal': '😰', 'Triste': '😢', 'Temeroso': '😨', 'Irritado': '😠',
  };
  const getEmoIcon = (nome) => {
    const cfg = S.getEmocoesConfig().find(c => c.nome === nome);
    return (cfg && cfg.icon) ? cfg.icon : (EMOCAO_ICONS[nome] || '🔵');
  };

  const getSituacaoDescricao = (em) => (em?.situacaoDescricao || '').trim();

  PCF.Pages.emocoes = (container) => {
    let editingId = null;

    const render = () => {
      const config = S.getEmocoesConfig();
      const emocoes = S.getEmocoes();
      container.innerHTML = `
        <div class="page">
          <h2>Análise das Emoções</h2><br>
          <p class="subtitle">Escolha a emoção que melhor descreve como você está se sentindo agora.</p>
          <div class="emocoes-layout">
            <form id="form-emocao" class="form emocoes-form">
              <h3 id="emo-form-title">Novo registro</h3>
              <div class="form-row">
                <div class="form-group"><label>Data</label><input type="date" id="emo-data" value="${H.hoje()}" required></div>
                <div class="form-group"><label>Hora</label><input type="time" id="emo-hora" value="${H.horaAtual()}"></div>
              </div>
              <div class="form-group"><label>Emoção Principal</label>
                <div class="diario-humor emo-sup-combo" id="emo-sup-combo"></div>
                <small class="form-hint" id="emo-sup-hint" style="display:none">Trazido do Diário desta data.</small>
              </div>
              <div class="form-group" id="emo-med-group" style="display:none"><label>Emoção Nível Médio</label><select id="emo-med"><option value="">Selecione...</option></select></div>
              <div class="form-group" id="emo-inf-group" style="display:none"><label>Emoção Nível Inferior</label><select id="emo-inf"><option value="">Selecione...</option></select></div>
              <div class="form-group"><label>Intensidade: <span id="emo-int-val">5</span>/10</label><input type="range" id="emo-intensidade" min="1" max="10" value="5"></div>
              <div class="form-group"><label>Situação/Descrição</label><textarea id="emo-situacao-descricao" rows="4" placeholder="Descreva a situação e o que você está sentindo..."></textarea></div>
              <div class="form-row">
                <button type="submit" class="btn btn-primary" id="emo-submit-btn">Registrar Emoção</button>
                <button type="button" class="btn btn-secondary" id="emo-cancel-edit" style="display:none">Cancelar Edição</button>
              </div>
            </form>
            <div class="emocoes-lista">
              <h3>Registros</h3>
              <div id="emo-cards">${emocoes.length === 0 ? '<p class="empty-text">Nenhuma emoção registrada ainda.</p>' :
                [...emocoes].reverse().map(em => {
                  const sup = config.find(c => c.nome === em.emocaoSuperior);
                  const cor = sup ? sup.cor : '#6b7280';
                  return `<div class="emocao-card" style="border-left-color:${cor}">
                    <div class="emocao-card-header">
                      <span class="emocao-data">${H.formatarData(em.data)} ${em.hora || ''}</span>
                      <div>
                        <button class="btn-icon" data-edit-emo="${em.id}" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon btn-danger" data-del="${em.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                      </div>
                    </div>
                    <div class="emocao-tags">
                      <span class="chip selected" style="background:${cor};color:#fff">${getEmoIcon(em.emocaoSuperior)} ${H.esc(em.emocaoSuperior)}</span>
                      ${em.emocaoMedia ? `<span class="chip">${H.esc(em.emocaoMedia)}</span>` : ''}
                      ${em.emocaoInferior ? `<span class="chip">${H.esc(em.emocaoInferior)}</span>` : ''}
                      <span class="chip">Intensidade: ${em.intensidade}/10</span>
                    </div>
                    ${getSituacaoDescricao(em) ? `<p class="emocao-descricao"><strong>Situação/Descrição:</strong> ${H.esc(getSituacaoDescricao(em))}</p>` : ''}
                  </div>`;
                }).join('' )}
              </div>
            </div>
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#emocoes');

      let selSup = null;
      let escolhaManual = false;
      document.getElementById('emo-intensidade').oninput = function() { document.getElementById('emo-int-val').textContent = this.value; };

      const comboPergunta = 'Como você está se sentindo?';
      const renderSupCombo = () => {
        const wrap = document.getElementById('emo-sup-combo');
        wrap.innerHTML = `
          <button type="button" class="diario-humor-btn" id="emo-sup-btn" aria-haspopup="listbox" aria-expanded="false">
            ${selSup ? `<span class="diario-humor-icon">${getEmoIcon(selSup.nome)}</span><span>${H.esc(selSup.nome)}</span>` : `<span class="text-muted">${comboPergunta}</span>`}
            <i data-lucide="chevron-down"></i>
          </button>
          <div class="diario-humor-list" role="listbox" hidden>
            <div class="diario-humor-list-title">${comboPergunta}</div>
            ${config.map(e => `
              <button type="button" role="option" class="diario-humor-opt${selSup?.id === e.id ? ' selected' : ''}" data-sup="${e.id}" aria-selected="${selSup?.id === e.id}">
                <span class="diario-humor-icon">${getEmoIcon(e.nome)}</span><span>${H.esc(e.nome)}</span>
                ${selSup?.id === e.id ? '<i data-lucide="check-circle-2" class="diario-humor-check"></i>' : ''}
              </button>`).join('')}
            ${selSup ? '<button type="button" class="diario-humor-opt diario-humor-clear" data-sup=""><span class="text-muted">Limpar seleção</span></button>' : ''}
          </div>`;
        if (window.lucide) lucide.createIcons();
        const btn = document.getElementById('emo-sup-btn');
        const list = wrap.querySelector('.diario-humor-list');
        btn.onclick = (ev) => {
          ev.stopPropagation();
          list.hidden = !list.hidden;
          btn.setAttribute('aria-expanded', String(!list.hidden));
        };
        list.querySelectorAll('[data-sup]').forEach(opt => {
          opt.onclick = () => {
            selectSup(opt.dataset.sup);
            registrarEscolha();
          };
        });
      };

      const selectSup = (id) => {
        selSup = config.find(c => c.id === id) || null;
        renderSupCombo();
        const medSel = document.getElementById('emo-med');
        medSel.innerHTML = '<option value="">Selecione...</option>' + (selSup?.medias || []).map(m => `<option value="${H.esc(m.nome)}">${H.esc(m.nome)}</option>`).join('');
        document.getElementById('emo-med-group').style.display = selSup?.medias?.length ? '' : 'none';
        document.getElementById('emo-inf-group').style.display = 'none';
        document.getElementById('emo-inf').innerHTML = '<option value="">Selecione...</option>';
      };

      const preencherInferiores = () => {
        const med = selSup?.medias?.find(m => m.nome === document.getElementById('emo-med').value);
        const infSel = document.getElementById('emo-inf');
        infSel.innerHTML = '<option value="">Selecione...</option>' + (med?.inferiores || []).map(inf => `<option value="${H.esc(inf.nome)}">${H.esc(inf.nome)}</option>`).join('');
        document.getElementById('emo-inf-group').style.display = med?.inferiores?.length ? '' : 'none';
      };

      const preencherEmocao = (superior, media, inferior) => {
        const sup = config.find(c => c.nome === superior);
        selectSup(sup?.id);
        if (!sup) return;
        document.getElementById('emo-med').value = media || '';
        preencherInferiores();
        document.getElementById('emo-inf').value = inferior || '';
      };

      // Compartilha a escolha com o Diário da mesma data, mesmo antes de salvar
      const registrarEscolha = () => {
        document.getElementById('emo-sup-hint').style.display = 'none';
        if (editingId) return;
        escolhaManual = true;
        H.compartilharSentimento(document.getElementById('emo-data').value, selSup ? {
          emocao: {
            superior: selSup.nome,
            media: document.getElementById('emo-med').value,
            inferior: document.getElementById('emo-inf').value,
          },
        } : null);
      };

      const aplicarPreSelecao = () => {
        if (editingId || escolhaManual) return;
        const sentimento = H.sentimentoParaEmocao(document.getElementById('emo-data').value, config);
        if (sentimento) preencherEmocao(sentimento.superior, sentimento.media, sentimento.inferior);
        else selectSup(null);
        document.getElementById('emo-sup-hint').style.display = sentimento?.origem === 'diario' ? '' : 'none';
      };

      document.getElementById('emo-med').onchange = () => { preencherInferiores(); registrarEscolha(); };
      document.getElementById('emo-inf').onchange = registrarEscolha;
      document.getElementById('emo-data').onchange = () => {
        if (editingId) return;
        if (escolhaManual) registrarEscolha();
        else aplicarPreSelecao();
      };

      if (PCF._emoHumorClose) document.removeEventListener('click', PCF._emoHumorClose);
      PCF._emoHumorClose = (ev) => {
        const w = document.getElementById('emo-sup-combo');
        if (w && !w.contains(ev.target)) { const l = w.querySelector('.diario-humor-list'); if (l) l.hidden = true; }
      };
      document.addEventListener('click', PCF._emoHumorClose);

      aplicarPreSelecao();

      document.getElementById('emo-cancel-edit').onclick = () => {
        editingId = null;
        escolhaManual = false;
        document.getElementById('form-emocao').removeAttribute('data-alterado');
        document.getElementById('emo-form-title').textContent = 'Novo registro';
        document.getElementById('emo-submit-btn').textContent = 'Registrar Emoção';
        document.getElementById('emo-cancel-edit').style.display = 'none';
        document.getElementById('emo-data').value = H.hoje();
        document.getElementById('emo-hora').value = H.horaAtual();
        aplicarPreSelecao();
        document.getElementById('emo-intensidade').value = 5;
        document.getElementById('emo-int-val').textContent = '5';
        document.getElementById('emo-situacao-descricao').value = '';
      };

      document.getElementById('form-emocao').onsubmit = (e) => {
        e.preventDefault();
        if (!selSup) { alert('Selecione uma emoção principal'); return; }
        const data = {
          data: document.getElementById('emo-data').value,
          hora: document.getElementById('emo-hora').value,
          emocaoSuperior: selSup.nome,
          emocaoMedia: document.getElementById('emo-med').value,
          emocaoInferior: document.getElementById('emo-inf').value,
          intensidade: parseInt(document.getElementById('emo-intensidade').value),
          situacaoDescricao: document.getElementById('emo-situacao-descricao').value.trim(),
        };
        if (editingId) { S.updateEmocao(editingId, data); editingId = null; }
        else { S.addEmocao(data); H.compartilharSentimento(data.data, null); }
        render();
      };

      container.querySelector('.emocoes-lista')?.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-edit-emo]');
        if (editBtn) {
          const em = emocoes.find(x => x.id === editBtn.dataset.editEmo);
          if (!em) return;
          editingId = em.id;
          document.getElementById('emo-form-title').textContent = 'Editando Registro';
          document.getElementById('emo-submit-btn').textContent = 'Salvar Alterações';
          document.getElementById('emo-cancel-edit').style.display = '';
          document.getElementById('emo-data').value = em.data;
          document.getElementById('emo-hora').value = em.hora || '';
          preencherEmocao(em.emocaoSuperior, em.emocaoMedia, em.emocaoInferior);
          document.getElementById('emo-sup-hint').style.display = 'none';
          document.getElementById('emo-intensidade').value = em.intensidade || 5;
          document.getElementById('emo-int-val').textContent = em.intensidade || 5;
          document.getElementById('emo-situacao-descricao').value = getSituacaoDescricao(em);
          document.getElementById('form-emocao').scrollIntoView({ behavior: 'smooth' });
          return;
        }
        const btn = e.target.closest('[data-del]');
        if (btn && confirm('Remover este registro?')) { S.deleteEmocao(btn.dataset.del); render(); }
      });
    };
    render();
  };

  /* ==================== RELATÓRIO DE EMOÇÕES (GRÁFICOS) ==================== */
  PCF.Pages.emocoesRelatorios = (container) => {
    const reg = PCF.App.registerChart;
    PCF.App.destroyCharts();
    const config = S.getEmocoesConfig();
    const emocoes = S.getEmocoes();

    container.innerHTML = `
      <div class="page">
        <h2>Relatório de Emoções</h2><br>
        <p class="subtitle">Análise e acompanhamento dos seus registros emocionais.</p>
        ${emocoes.length === 0 ? '<p class="empty-text">Nenhuma emoção registrada ainda. Registre emoções na página <a href="#emocoes">Emoções</a> para visualizar os gráficos.</p>' : `
        <div class="charts-grid">
          <div class="chart-container"><h3>Frequência por Emoção Principal</h3><canvas id="emo-chart-freq"></canvas></div>
          <div class="chart-container"><h3>Intensidade Média por Emoção</h3><canvas id="emo-chart-intens"></canvas></div>
          <div class="chart-container"><h3>Emoções ao Longo do Tempo</h3><canvas id="emo-chart-timeline"></canvas></div>
          <div class="chart-container"><h3>Distribuição de Intensidade</h3><canvas id="emo-chart-dist"></canvas></div>
        </div>`}
      </div>`;

    if (emocoes.length === 0) return;

    // Mapas de cor
    const corMap = {};
    emocoes.forEach(em => {
      if (!corMap[em.emocaoSuperior]) {
        const sc = config.find(c => c.nome === em.emocaoSuperior);
        corMap[em.emocaoSuperior] = sc ? sc.cor : '#6b7280';
      }
    });

    // 1) Frequência por emoção superior (doughnut)
    const freqMap = {};
    emocoes.forEach(em => { freqMap[em.emocaoSuperior] = (freqMap[em.emocaoSuperior] || 0) + 1; });
    const freqLabels = Object.keys(freqMap);
    const ctxFreq = document.getElementById('emo-chart-freq');
    if (ctxFreq) reg(new Chart(ctxFreq, {
      type: 'doughnut',
      data: { labels: freqLabels.map(l => getEmoIcon(l) + ' ' + l), datasets: [{ data: freqLabels.map(l => freqMap[l]), backgroundColor: freqLabels.map(l => corMap[l]) }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 13 } } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 13 }, formatter: (val, ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total ? ((val / total) * 100).toFixed(1) + '%' : ''; }, display: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total ? (ctx.dataset.data[ctx.dataIndex] / total) > 0.04 : false; } } } },
    }));

    // 2) Intensidade média por emoção (bar horizontal)
    const intMap = {}, intCount = {};
    emocoes.forEach(em => {
      intMap[em.emocaoSuperior] = (intMap[em.emocaoSuperior] || 0) + (em.intensidade || 0);
      intCount[em.emocaoSuperior] = (intCount[em.emocaoSuperior] || 0) + 1;
    });
    const intLabels = Object.keys(intMap);
    const ctxInt = document.getElementById('emo-chart-intens');
    if (ctxInt) reg(new Chart(ctxInt, {
      type: 'bar',
      data: { labels: intLabels.map(l => getEmoIcon(l) + ' ' + l), datasets: [{ label: 'Intensidade Média', data: intLabels.map(l => Number((intMap[l] / intCount[l]).toFixed(1))), backgroundColor: intLabels.map(l => corMap[l] || '#6b7280') }] },
      options: { indexAxis: 'y', responsive: true, scales: { x: { min: 0, max: 10, ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } }, plugins: { legend: { display: false }, datalabels: { color: '#fff', font: { weight: 'bold', size: 12 }, anchor: 'center', formatter: (val) => val.toFixed(1) } } },
    }));

    // 3) Timeline (scatter com linhas)
    const sorted = [...emocoes].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    const uniqueEmo = [...new Set(emocoes.map(e => e.emocaoSuperior))];
    const datasets = uniqueEmo.map(nome => {
      const cor = corMap[nome] || '#6b7280';
      const points = sorted.filter(e => e.emocaoSuperior === nome).map(e => ({ x: e.data, y: e.intensidade }));
      return { label: getEmoIcon(nome) + ' ' + nome, data: points, borderColor: cor, backgroundColor: cor, pointRadius: 5, pointHoverRadius: 7, showLine: true, tension: 0.3 };
    });
    const ctxTimeline = document.getElementById('emo-chart-timeline');
    if (ctxTimeline) reg(new Chart(ctxTimeline, {
      type: 'scatter',
      data: { datasets },
      options: { responsive: true, scales: { x: { type: 'category', labels: [...new Set(sorted.map(e => e.data))].map(d => H.formatarData(d)), ticks: { color: '#94a3b8', maxRotation: 45 } }, y: { min: 0, max: 10, title: { display: true, text: 'Intensidade', color: '#94a3b8' }, ticks: { color: '#94a3b8' } } }, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } }, datalabels: { display: false } } },
    }));

    // 4) Distribuição de intensidade por emoção (stacked bar)
    const distMap = {};
    uniqueEmo.forEach(nome => { distMap[nome] = Array(10).fill(0); });
    emocoes.forEach(em => { if (em.intensidade >= 1 && em.intensidade <= 10 && distMap[em.emocaoSuperior]) distMap[em.emocaoSuperior][em.intensidade - 1]++; });
    const distDatasets = uniqueEmo.map(nome => ({
      label: getEmoIcon(nome) + ' ' + nome,
      data: distMap[nome],
      backgroundColor: corMap[nome] || '#6b7280',
    }));
    const ctxDist = document.getElementById('emo-chart-dist');
    if (ctxDist) reg(new Chart(ctxDist, {
      type: 'bar',
      data: { labels: Array.from({length:10}, (_, i) => String(i + 1)), datasets: distDatasets },
      options: { responsive: true, scales: { x: { stacked: true, title: { display: true, text: 'Intensidade', color: '#94a3b8' }, ticks: { color: '#94a3b8' } }, y: { stacked: true, title: { display: true, text: 'Qtd', color: '#94a3b8' }, ticks: { color: '#94a3b8', stepSize: 1 } } }, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 11 }, display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0, formatter: (val) => val } } },
    }));
  };
})();

