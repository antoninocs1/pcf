/* ========================================================
   PCF - pages/saude-registros.js — Sinais vitais, Sintomas, Sono,
   Vacinas, Ficha médica, Resumo para consulta e Relatório semanal
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;

  const AVISO_REFERENCIA = 'Faixas de referência gerais, apenas para orientação. Não substituem a avaliação de um profissional de saúde.';
  const COR_ALERTA = '#dc2626';
  const COR_OK = '#16a34a';
  const COR_INFO = '#3b82f6';
  const COR_ATENCAO = '#f59e0b';

  const porDataHoraDesc = (a, b) => (b.data || '').localeCompare(a.data || '') || (b.hora || '').localeCompare(a.hora || '');
  const num = (id) => {
    const v = document.getElementById(id).value;
    return v === '' ? null : parseFloat(v);
  };
  const diasAtras = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return H.dataISO(d);
  };
  const ehProprio = (r) => !r.responsavelContatoId;

  /* ==================== SINAIS VITAIS ==================== */
  const MOMENTOS_GLICEMIA = { jejum: 'Jejum', pos: 'Pós-refeição', aleatoria: 'Sem preparo' };

  const pressaoTexto = (r) => (r.sistolica && r.diastolica) ? `${r.sistolica}/${r.diastolica} mmHg` : '';

  const alertasSinal = (r) => {
    const alertas = [];
    if (r.sistolica && r.diastolica) {
      if (r.sistolica >= 140 || r.diastolica >= 90) alertas.push('Pressão alta');
      else if (r.sistolica < 90 || r.diastolica < 60) alertas.push('Pressão baixa');
    }
    if (r.frequencia) {
      if (r.frequencia > 100) alertas.push('Batimentos altos');
      else if (r.frequencia < 50) alertas.push('Batimentos baixos');
    }
    if (r.glicemia) {
      const limite = { jejum: 100, pos: 140, aleatoria: 200 }[r.glicemiaMomento] || 200;
      if (r.glicemia < 70) alertas.push('Glicemia baixa');
      else if (r.glicemia >= limite) alertas.push('Glicemia alta');
    }
    if (r.temperatura) {
      if (r.temperatura >= 37.8) alertas.push('Febre');
      else if (r.temperatura < 35) alertas.push('Temperatura baixa');
    }
    if (r.saturacao && r.saturacao < 95) alertas.push('Saturação baixa');
    return alertas;
  };

  const METRICAS_SINAIS = [
    { id: 'pressao', label: 'Pressão arterial (mmHg)', series: [{ campo: 'sistolica', label: 'Sistólica', cor: '#dc2626' }, { campo: 'diastolica', label: 'Diastólica', cor: '#3b82f6' }] },
    { id: 'frequencia', label: 'Batimentos (bpm)', series: [{ campo: 'frequencia', label: 'Batimentos', cor: '#ec4899' }] },
    { id: 'glicemia', label: 'Glicemia (mg/dL)', series: [{ campo: 'glicemia', label: 'Glicemia', cor: '#f59e0b' }] },
    { id: 'temperatura', label: 'Temperatura (°C)', series: [{ campo: 'temperatura', label: 'Temperatura', cor: '#8b5cf6' }] },
    { id: 'saturacao', label: 'Saturação (%)', series: [{ campo: 'saturacao', label: 'Saturação', cor: '#16a34a' }] },
  ];

  PCF.Pages.saudeSinais = (container) => {
    let editingId = null;
    let metricaSel = 'pressao';

    const desenharGrafico = (registros) => {
      PCF.App.destroyCharts();
      const canvas = document.getElementById('ss-chart');
      if (!canvas || !window.Chart) return;
      const metrica = METRICAS_SINAIS.find(m => m.id === metricaSel);
      const ordenados = [...registros].reverse()
        .filter(r => metrica.series.some(s => r[s.campo]))
        .slice(-30);
      PCF.App.registerChart(new Chart(canvas, {
        type: 'line',
        data: {
          labels: ordenados.map(r => H.formatarData(r.data)),
          datasets: metrica.series.map(s => ({
            label: s.label,
            data: ordenados.map(r => r[s.campo] ?? null),
            borderColor: s.cor,
            backgroundColor: s.cor,
            tension: .3,
            pointRadius: 4,
            spanGaps: true,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.1)' } },
            y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.15)' } },
          },
          plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } }, datalabels: { display: false } },
        },
      }));
    };

    const render = () => {
      const registros = [...S.getSaudeSinais()].sort(porDataHoraDesc);
      const ultimo = registros[0];
      const alertasUltimo = ultimo ? alertasSinal(ultimo) : [];

      container.innerHTML = `
        <div class="page saude-page">
          <div class="page-header">
            <div>
              <h2>Saúde - Sinais vitais</h2>
              <p class="subtitle">Acompanhe pressão, batimentos, glicemia, temperatura e saturação. Preencha apenas o que mediu.</p>
            </div>
          </div>

          ${ultimo ? `
          <div class="cards-grid">
            <div class="card"><div class="card-label">Última medição</div><div class="card-value">${H.formatarData(ultimo.data)}</div></div>
            <div class="card"><div class="card-label">Pressão</div><div class="card-value">${pressaoTexto(ultimo) || '—'}</div></div>
            <div class="card"><div class="card-label">Situação</div><div class="card-value" style="color:${alertasUltimo.length ? COR_ALERTA : COR_OK}">${alertasUltimo.length ? H.esc(alertasUltimo.join(', ')) : 'Dentro das faixas'}</div></div>
          </div>` : ''}

          <div class="card plano-acao-card" id="ss-form-card">
            <h3 id="ss-form-title">Nova medição</h3>
            <form id="ss-form" class="plano-acao-form">
              <div class="form-group"><label>Data</label><input type="date" id="ss-data" value="${H.hoje()}" max="${H.hoje()}" required></div>
              <div class="form-group"><label>Hora</label><input type="time" id="ss-hora" value="${H.horaAtual()}"></div>
              <div class="form-group"><label>Pressão sistólica (mmHg)</label><input type="number" id="ss-sistolica" min="40" max="300" placeholder="Ex: 120"></div>
              <div class="form-group"><label>Pressão diastólica (mmHg)</label><input type="number" id="ss-diastolica" min="20" max="200" placeholder="Ex: 80"></div>
              <div class="form-group"><label>Batimentos (bpm)</label><input type="number" id="ss-frequencia" min="20" max="250" placeholder="Ex: 72"></div>
              <div class="form-group"><label>Saturação (%)</label><input type="number" id="ss-saturacao" min="50" max="100" placeholder="Ex: 98"></div>
              <div class="form-group"><label>Glicemia (mg/dL)</label><input type="number" id="ss-glicemia" min="10" max="800" placeholder="Ex: 95"></div>
              <div class="form-group">
                <label>Momento da glicemia</label>
                <select id="ss-glicemia-momento">${Object.entries(MOMENTOS_GLICEMIA).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select>
              </div>
              <div class="form-group"><label>Temperatura (°C)</label><input type="number" id="ss-temperatura" min="30" max="45" step="0.1" placeholder="Ex: 36.5"></div>
              <div class="form-group"><label>Observação</label><input type="text" id="ss-obs" placeholder="Ex: após caminhada, em repouso"></div>
              <div class="form-group plano-acao-form-actions plano-acao-form-span-2">
                <button type="submit" class="btn btn-primary" id="ss-submit">Salvar medição</button>
                <button type="button" class="btn btn-secondary" id="ss-cancel">Cancelar</button>
              </div>
            </form>
          </div>

          ${registros.length ? `
          <div class="chart-container saude-chart-container">
            <div class="saude-chart-head">
              <h3>Evolução</h3>
              <select id="ss-metrica">${METRICAS_SINAIS.map(m => `<option value="${m.id}"${m.id === metricaSel ? ' selected' : ''}>${m.label}</option>`).join('')}</select>
            </div>
            <div class="saude-chart-area"><canvas id="ss-chart"></canvas></div>
          </div>` : ''}

          <div class="card plano-acao-card plano-acao-table-card">
            <h3>Medições (${registros.length})</h3>
            ${registros.length === 0 ? '<p class="empty-text">Nenhuma medição registrada.</p>' : `
              <div class="table-container">
                <table class="table">
                  <thead><tr><th>Data</th><th>Pressão</th><th>Batimentos</th><th>Saturação</th><th>Glicemia</th><th>Temp.</th><th>Situação</th><th style="width:80px">Ações</th></tr></thead>
                  <tbody>${registros.map(r => {
                    const alertas = alertasSinal(r);
                    return `
                    <tr>
                      <td>${H.formatarData(r.data)} ${r.hora || ''}${r.observacao ? `<br><small>${H.esc(r.observacao)}</small>` : ''}</td>
                      <td>${pressaoTexto(r) || '—'}</td>
                      <td>${r.frequencia ? r.frequencia + ' bpm' : '—'}</td>
                      <td>${r.saturacao ? r.saturacao + '%' : '—'}</td>
                      <td>${r.glicemia ? `${r.glicemia} mg/dL<br><small>${MOMENTOS_GLICEMIA[r.glicemiaMomento] || ''}</small>` : '—'}</td>
                      <td>${r.temperatura ? r.temperatura + ' °C' : '—'}</td>
                      <td>${alertas.length ? alertas.map(a => `<span class="status-badge" style="background:${COR_ALERTA}">${H.esc(a)}</span>`).join(' ') : `<span class="status-badge" style="background:${COR_OK}">OK</span>`}</td>
                      <td class="actions-cell">
                        <button class="btn-icon" data-edit-ss="${r.id}" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon btn-danger" data-del-ss="${r.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                      </td>
                    </tr>`;
                  }).join('')}</tbody>
                </table>
              </div>
              <small class="form-hint">${AVISO_REFERENCIA}</small>`}
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#saude-sinais');
      const painelForm = H.formRecolhivel(document.getElementById('ss-form-card'), 'Nova medição', registros.length === 0);
      desenharGrafico(registros);

      const el = (id) => document.getElementById(id);
      const metricaEl = el('ss-metrica');
      if (metricaEl) metricaEl.onchange = () => { metricaSel = metricaEl.value; desenharGrafico(registros); };
      el('ss-cancel').onclick = () => { editingId = null; render(); };

      el('ss-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
          data: el('ss-data').value,
          hora: el('ss-hora').value,
          sistolica: num('ss-sistolica'),
          diastolica: num('ss-diastolica'),
          frequencia: num('ss-frequencia'),
          saturacao: num('ss-saturacao'),
          glicemia: num('ss-glicemia'),
          glicemiaMomento: el('ss-glicemia-momento').value,
          temperatura: num('ss-temperatura'),
          observacao: el('ss-obs').value.trim(),
        };
        if (!!data.sistolica !== !!data.diastolica) { alert('Informe os dois valores da pressão: sistólica e diastólica.'); return; }
        if (!data.sistolica && !data.frequencia && !data.saturacao && !data.glicemia && !data.temperatura) {
          alert('Informe pelo menos uma medição.');
          return;
        }
        if (editingId) S.updateSaudeSinal(editingId, data);
        else S.addSaudeSinal(data);
        editingId = null;
        render();
      };

      container.querySelector('.plano-acao-table-card').addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-edit-ss]');
        if (editBtn) {
          const r = registros.find(x => x.id === editBtn.dataset.editSs);
          if (!r) return;
          editingId = r.id;
          el('ss-form-title').textContent = 'Editando medição';
          el('ss-submit').textContent = 'Salvar alterações';
          painelForm.abrir(false);
          el('ss-data').value = r.data || '';
          el('ss-hora').value = r.hora || '';
          ['sistolica', 'diastolica', 'frequencia', 'saturacao', 'glicemia', 'temperatura'].forEach(campo => {
            el(`ss-${campo}`).value = r[campo] ?? '';
          });
          el('ss-glicemia-momento').value = r.glicemiaMomento || 'jejum';
          el('ss-obs').value = r.observacao || '';
          el('ss-form').scrollIntoView({ behavior: 'smooth' });
          return;
        }
        const delBtn = e.target.closest('[data-del-ss]');
        if (delBtn && confirm('Remover esta medição?')) { S.deleteSaudeSinal(delBtn.dataset.delSs); render(); }
      });
    };

    render();
  };

  /* ==================== SINTOMAS ==================== */
  PCF.Pages.saudeSintomas = (container) => {
    let editingId = null;

    const render = () => {
      const registros = [...S.getSaudeSintomas()].sort(porDataHoraDesc);
      const recentes = registros.filter(r => r.data >= diasAtras(30));
      const contagem = {};
      recentes.forEach(r => { contagem[r.sintoma] = (contagem[r.sintoma] || 0) + 1; });
      const maisFrequente = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
      const intensidadeMedia = recentes.length
        ? (recentes.reduce((acc, r) => acc + (r.intensidade || 0), 0) / recentes.length).toFixed(1)
        : null;
      const conhecidos = [...new Set(registros.map(r => r.sintoma))];

      container.innerHTML = `
        <div class="page saude-page">
          <div class="page-header">
            <div>
              <h2>Saúde - Sintomas</h2>
              <p class="subtitle">Anote o que sentiu, a intensidade e a duração para informar ao profissional de saúde.</p>
            </div>
          </div>

          <div class="cards-grid">
            <div class="card"><div class="card-label">Registros (30 dias)</div><div class="card-value">${recentes.length}</div></div>
            <div class="card"><div class="card-label">Mais frequente</div><div class="card-value">${maisFrequente ? H.esc(maisFrequente[0]) : '—'}</div></div>
            <div class="card"><div class="card-label">Intensidade média</div><div class="card-value">${intensidadeMedia ? intensidadeMedia + '/10' : '—'}</div></div>
          </div>

          <div class="card plano-acao-card" id="st-form-card">
            <h3 id="st-form-title">Novo sintoma</h3>
            <form id="st-form" class="plano-acao-form">
              <div class="form-group"><label>Data</label><input type="date" id="st-data" value="${H.hoje()}" max="${H.hoje()}" required></div>
              <div class="form-group"><label>Hora</label><input type="time" id="st-hora" value="${H.horaAtual()}"></div>
              <div class="form-group">
                <label>O que você sentiu?</label>
                <input type="text" id="st-sintoma" list="st-conhecidos" placeholder="Ex: dor de cabeça, tontura, náusea" required>
                <datalist id="st-conhecidos">${conhecidos.map(s => `<option value="${H.esc(s)}"></option>`).join('')}</datalist>
              </div>
              <div class="form-group"><label>Duração</label><input type="text" id="st-duracao" placeholder="Ex: 2 horas, o dia todo"></div>
              <div class="form-group plano-acao-form-span-2">
                <label>Intensidade: <span id="st-int-val">5</span>/10</label>
                <input type="range" id="st-intensidade" min="1" max="10" value="5">
              </div>
              <div class="form-group plano-acao-form-span-2">
                <label>Observações</label>
                <textarea id="st-obs" rows="2" placeholder="O que estava fazendo, o que melhorou ou piorou"></textarea>
              </div>
              <div class="form-group plano-acao-form-actions plano-acao-form-span-2">
                <button type="submit" class="btn btn-primary" id="st-submit">Salvar sintoma</button>
                <button type="button" class="btn btn-secondary" id="st-cancel">Cancelar</button>
              </div>
            </form>
          </div>

          <div class="card plano-acao-card plano-acao-table-card">
            <h3>Registros (${registros.length})</h3>
            ${registros.length === 0 ? '<p class="empty-text">Nenhum sintoma registrado.</p>' : `
              <div class="table-container">
                <table class="table">
                  <thead><tr><th>Data</th><th>Sintoma</th><th>Intensidade</th><th>Duração</th><th style="width:80px">Ações</th></tr></thead>
                  <tbody>${registros.map(r => `
                    <tr>
                      <td>${H.formatarData(r.data)} ${r.hora || ''}</td>
                      <td><strong>${H.esc(r.sintoma)}</strong>${r.observacao ? `<br><small>${H.esc(r.observacao)}</small>` : ''}</td>
                      <td>${r.intensidade}/10</td>
                      <td>${H.esc(r.duracao || '—')}</td>
                      <td class="actions-cell">
                        <button class="btn-icon" data-edit-st="${r.id}" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon btn-danger" data-del-st="${r.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                      </td>
                    </tr>`).join('')}</tbody>
                </table>
              </div>`}
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#saude-sintomas');
      const painelForm = H.formRecolhivel(document.getElementById('st-form-card'), 'Novo sintoma', registros.length === 0);

      const el = (id) => document.getElementById(id);
      el('st-intensidade').oninput = () => { el('st-int-val').textContent = el('st-intensidade').value; };
      el('st-cancel').onclick = () => { editingId = null; render(); };

      el('st-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
          data: el('st-data').value,
          hora: el('st-hora').value,
          sintoma: el('st-sintoma').value.trim(),
          duracao: el('st-duracao').value.trim(),
          intensidade: parseInt(el('st-intensidade').value, 10),
          observacao: el('st-obs').value.trim(),
        };
        if (!data.sintoma) { alert('Informe o que você sentiu.'); return; }
        if (editingId) S.updateSaudeSintoma(editingId, data);
        else S.addSaudeSintoma(data);
        editingId = null;
        render();
      };

      container.querySelector('.plano-acao-table-card').addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-edit-st]');
        if (editBtn) {
          const r = registros.find(x => x.id === editBtn.dataset.editSt);
          if (!r) return;
          editingId = r.id;
          el('st-form-title').textContent = 'Editando sintoma';
          el('st-submit').textContent = 'Salvar alterações';
          painelForm.abrir(false);
          el('st-data').value = r.data || '';
          el('st-hora').value = r.hora || '';
          el('st-sintoma').value = r.sintoma || '';
          el('st-duracao').value = r.duracao || '';
          el('st-intensidade').value = r.intensidade || 5;
          el('st-int-val').textContent = r.intensidade || 5;
          el('st-obs').value = r.observacao || '';
          el('st-form').scrollIntoView({ behavior: 'smooth' });
          return;
        }
        const delBtn = e.target.closest('[data-del-st]');
        if (delBtn && confirm('Remover este registro?')) { S.deleteSaudeSintoma(delBtn.dataset.delSt); render(); }
      });
    };

    render();
  };

  /* ==================== SONO ==================== */
  const QUALIDADE_SONO = ['', 'Muito ruim', 'Ruim', 'Regular', 'Boa', 'Muito boa'];

  const duracaoSono = (dormiu, acordou) => {
    if (!dormiu || !acordou) return 0;
    const minutos = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    return ((minutos(acordou) - minutos(dormiu) + 1440) % 1440) / 60;
  };
  const formatarHoras = (horas) => {
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return `${h}h${String(m).padStart(2, '0')}`;
  };

  // Noite registrada que cumpre a meta marca o hábito de sono; nunca desmarca
  const marcarHabitoSono = (data, horas) => {
    const habito = S.getHabitos().find(h => h.ativo !== false && (h.categoria === 'Sono' || /dormir|sono/i.test(h.nome || '')));
    if (!habito) return null;
    const meta = parseInt((habito.nome || '').match(/\d+/)?.[0], 10) || 7;
    if (horas < meta) return null;
    const reg = S.getRegistrosHabitos().find(r => r.habitoId === habito.id && r.data === data);
    if (reg?.completo) return null;
    S.upsertRegistroHabito({ habitoId: habito.id, data, completo: true, momento: reg?.momento || 'noite', intensidade: 100, modoRegistro: 'manual' });
    return habito.nome;
  };

  PCF.Pages.saudeSono = (container) => {
    let avisoHabito = '';
    const render = () => {
      PCF.App.destroyCharts();
      const registros = [...S.getSaudeSono()].sort(porDataHoraDesc);
      const semana = registros.filter(r => r.data >= diasAtras(6));
      const media = (lista, campo) => lista.length ? lista.reduce((acc, r) => acc + (r[campo] || 0), 0) / lista.length : null;
      const mediaHoras = media(semana, 'horas');
      const mediaQualidade = media(semana, 'qualidade');
      const sonhos = new Set(S.getDiario().filter(e => e.tipo === 'sonho').map(e => e.data));

      container.innerHTML = `
        <div class="page saude-page">
          <div class="page-header">
            <div>
              <h2>Saúde - Sono</h2>
              <p class="subtitle">Registre a noite de sono pela data em que acordou. Os sonhos ficam no Diário, no modo Sonho.</p>
            </div>
          </div>

          <div class="cards-grid">
            <div class="card"><div class="card-label">Média (7 dias)</div><div class="card-value">${mediaHoras === null ? '—' : formatarHoras(mediaHoras)}</div></div>
            <div class="card"><div class="card-label">Qualidade (7 dias)</div><div class="card-value">${mediaQualidade === null ? '—' : mediaQualidade.toFixed(1) + '/5'}</div></div>
            <div class="card"><div class="card-label">Noites registradas</div><div class="card-value">${registros.length}</div></div>
          </div>

          ${avisoHabito ? `<div class="alert alert-success saude-aviso">Hábito "${H.esc(avisoHabito)}" marcado automaticamente.</div>` : ''}

          <div class="card plano-acao-card" id="sn-form-card">
            <h3>Registrar noite</h3>
            <form id="sn-form" class="plano-acao-form">
              <div class="form-group"><label>Data em que acordou</label><input type="date" id="sn-data" value="${H.hoje()}" max="${H.hoje()}" required></div>
              <div class="form-group">
                <label>Qualidade</label>
                <select id="sn-qualidade">${[5, 4, 3, 2, 1].map(q => `<option value="${q}"${q === 3 ? ' selected' : ''}>${q} - ${QUALIDADE_SONO[q]}</option>`).join('')}</select>
              </div>
              <div class="form-group"><label>Dormiu às</label><input type="time" id="sn-dormiu" required></div>
              <div class="form-group"><label>Acordou às</label><input type="time" id="sn-acordou" required></div>
              <div class="form-group plano-acao-form-span-2"><label>Observação</label><input type="text" id="sn-obs" placeholder="Ex: acordei durante a noite, deitei tarde"></div>
              <div class="form-group plano-acao-form-actions plano-acao-form-span-2">
                <button type="submit" class="btn btn-primary">Salvar noite</button>
                <button type="button" class="btn btn-secondary" id="sn-cancel">Cancelar</button>
                <small class="form-hint">Um novo registro na mesma data substitui o anterior.</small>
              </div>
            </form>
          </div>

          ${registros.length ? `
          <div class="chart-container saude-chart-container">
            <h3>Horas de sono por noite</h3>
            <div class="saude-chart-area"><canvas id="sn-chart"></canvas></div>
          </div>` : ''}

          <div class="card plano-acao-card plano-acao-table-card">
            <h3>Noites (${registros.length})</h3>
            ${registros.length === 0 ? '<p class="empty-text">Nenhuma noite registrada.</p>' : `
              <div class="table-container">
                <table class="table">
                  <thead><tr><th>Data</th><th>Dormiu</th><th>Acordou</th><th>Duração</th><th>Qualidade</th><th>Sonho</th><th style="width:60px">Ações</th></tr></thead>
                  <tbody>${registros.map(r => `
                    <tr>
                      <td>${H.formatarData(r.data)}${r.observacao ? `<br><small>${H.esc(r.observacao)}</small>` : ''}</td>
                      <td>${r.dormiu}</td>
                      <td>${r.acordou}</td>
                      <td>${formatarHoras(r.horas)}</td>
                      <td>${QUALIDADE_SONO[r.qualidade] || '—'}</td>
                      <td>${sonhos.has(r.data) ? '<a href="#diario" class="btn-link" title="Há um sonho registrado no Diário nesta data">🌙 Ver no Diário</a>' : '—'}</td>
                      <td class="actions-cell"><button class="btn-icon btn-danger" data-del-sn="${r.id}" title="Remover"><i data-lucide="trash-2"></i></button></td>
                    </tr>`).join('')}</tbody>
                </table>
              </div>`}
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#saude-sono');
      H.formRecolhivel(document.getElementById('sn-form-card'), 'Registrar noite', registros.length === 0);
      avisoHabito = '';

      const canvas = document.getElementById('sn-chart');
      if (canvas && window.Chart) {
        const ordenados = [...registros].reverse().slice(-30);
        PCF.App.registerChart(new Chart(canvas, {
          type: 'bar',
          data: {
            labels: ordenados.map(r => H.formatarData(r.data)),
            datasets: [{ label: 'Horas de sono', data: ordenados.map(r => Number(r.horas.toFixed(2))), backgroundColor: '#6366f1' }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.1)' } },
              y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.15)' } },
            },
            plugins: { legend: { display: false }, datalabels: { display: false } },
          },
        }));
      }

      const el = (id) => document.getElementById(id);
      el('sn-cancel').onclick = () => render();
      el('sn-form').onsubmit = (e) => {
        e.preventDefault();
        const data = el('sn-data').value;
        const dormiu = el('sn-dormiu').value;
        const acordou = el('sn-acordou').value;
        const novo = {
          id: S._uid(),
          data, dormiu, acordou,
          horas: duracaoSono(dormiu, acordou),
          qualidade: parseInt(el('sn-qualidade').value, 10),
          observacao: el('sn-obs').value.trim(),
        };
        S.saveSaudeSono([...S.getSaudeSono().filter(r => r.data !== data), novo]);
        avisoHabito = marcarHabitoSono(data, novo.horas) || '';
        render();
      };

      container.querySelector('.plano-acao-table-card').addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-del-sn]');
        if (delBtn && confirm('Remover este registro?')) { S.deleteSaudeSono(delBtn.dataset.delSn); render(); }
      });
    };

    render();
  };

  /* ==================== VACINAS ==================== */
  const DOSES_VACINA = ['Dose única', '1ª dose', '2ª dose', '3ª dose', 'Reforço', 'Anual'];

  const situacaoProximaDose = (iso) => {
    if (!iso) return null;
    if (iso < H.hoje()) return { label: 'Vencida', cor: COR_ALERTA };
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);
    return iso <= H.dataISO(limite) ? { label: 'Em breve', cor: COR_ATENCAO } : { label: 'Programada', cor: COR_INFO };
  };

  PCF.Pages.saudeVacinas = (container) => {
    let editingId = null;

    const contatos = S.getContatos ? S.getContatos() : [];
    const contatoMap = Object.fromEntries(contatos.map(c => [c.id, c]));
    const nomePessoa = (r) => r.responsavelContatoId
      ? (contatoMap[r.responsavelContatoId]?.nome || 'Contato removido')
      : 'Própria pessoa';

    // A próxima dose vira um registro de Consultas e Exames, que já alimenta a Agenda e os avisos
    const sincronizarEventoProximaDose = (vacina) => {
      const evento = S.getSaudeEventos().find(ev => ev.vacinaId === vacina.id);
      if (vacina.proximaDose && vacina.agendaAtivo) {
        const dados = {
          tipo: 'Vacinação',
          descricao: `${vacina.nome} - próxima dose`,
          local: vacina.local || '',
          responsavelContatoId: vacina.responsavelContatoId || '',
          status: 'Pendente',
          data: vacina.proximaDose,
          hora: '',
          proximaRevisao: '',
          observacoes: '',
          agendaAtivo: true,
          vacinaId: vacina.id,
        };
        if (evento) S.updateSaudeEvento(evento.id, dados);
        else S.addSaudeEvento(dados);
      } else if (evento && evento.status === 'Pendente') {
        S.deleteSaudeEvento(evento.id);
      }
    };

    const render = () => {
      const vacinas = [...S.getSaudeVacinas()].sort((a, b) => (b.dataAplicacao || '').localeCompare(a.dataAplicacao || ''));
      const deConsultas = S.getSaudeEventos().filter(ev => ev.tipo === 'Vacinação' && !ev.vacinaId);
      const pendentes = vacinas.filter(v => v.proximaDose);
      const vencidas = pendentes.filter(v => v.proximaDose < H.hoje()).length;

      container.innerHTML = `
        <div class="page saude-page">
          <div class="page-header">
            <div>
              <h2>Saúde - Vacinas</h2>
              <p class="subtitle">Mantenha a carteira de vacinação e programe a próxima dose com lembrete na Agenda.</p>
            </div>
          </div>

          <div class="cards-grid">
            <div class="card"><div class="card-label">Aplicadas</div><div class="card-value">${vacinas.length}</div></div>
            <div class="card"><div class="card-label">Próximas doses</div><div class="card-value">${pendentes.length}</div></div>
            <div class="card"><div class="card-label">Vencidas</div><div class="card-value" style="color:${vencidas ? COR_ALERTA : 'inherit'}">${vencidas}</div></div>
          </div>

          <div class="card plano-acao-card" id="vc-form-card">
            <h3 id="vc-form-title">Nova vacina</h3>
            <form id="vc-form" class="plano-acao-form">
              <div class="form-group"><label>Vacina</label><input type="text" id="vc-nome" placeholder="Ex: Gripe, Tétano, Hepatite B" required></div>
              <div class="form-group">
                <label>Dose</label>
                <select id="vc-dose">${DOSES_VACINA.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
              </div>
              <div class="form-group"><label>Data da aplicação</label><input type="date" id="vc-data" value="${H.hoje()}" max="${H.hoje()}" required></div>
              <div class="form-group"><label>Próxima dose</label><input type="date" id="vc-proxima"></div>
              <details class="form-mais plano-acao-form-span-2" id="vc-mais">
                <summary>Mais opções</summary>
                <div class="form-mais-campos">
                  <div class="form-group plano-acao-form-span-2">
                    <label>Para quem?</label>
                    <select id="vc-responsavel">
                      <option value="">Própria pessoa</option>
                      ${contatos.map(c => `<option value="${H.esc(c.id)}">${H.esc(c.nome)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group"><label>Local</label><input type="text" id="vc-local" placeholder="Ex: UBS Centro"></div>
                  <div class="form-group"><label>Lote</label><input type="text" id="vc-lote" placeholder="Opcional"></div>
                </div>
              </details>
              <div class="form-group plano-acao-checkbox-group plano-acao-form-span-2">
                <label class="plano-acao-checkbox">
                  <input type="checkbox" id="vc-agenda" checked>
                  <span>Vincular a próxima dose na Agenda e gerar lembrete</span>
                </label>
              </div>
              <div class="form-group plano-acao-form-actions plano-acao-form-span-2">
                <button type="submit" class="btn btn-primary" id="vc-submit">Salvar vacina</button>
                <button type="button" class="btn btn-secondary" id="vc-cancel">Cancelar</button>
              </div>
            </form>
          </div>

          <div class="card plano-acao-card plano-acao-table-card">
            <h3>Carteira de vacinação (${vacinas.length})</h3>
            ${vacinas.length === 0 ? '<p class="empty-text">Nenhuma vacina registrada.</p>' : `
              <div class="table-container">
                <table class="table">
                  <thead><tr><th>Vacina</th><th>Dose</th><th>Aplicação</th><th>Para quem</th><th>Próxima dose</th><th style="width:80px">Ações</th></tr></thead>
                  <tbody>${vacinas.map(v => {
                    const situacao = situacaoProximaDose(v.proximaDose);
                    return `
                    <tr>
                      <td><strong>${H.esc(v.nome)}</strong>${(v.local || v.lote) ? `<br><small>${H.esc([v.local, v.lote ? 'Lote ' + v.lote : ''].filter(Boolean).join(' · '))}</small>` : ''}</td>
                      <td>${H.esc(v.dose || '')}</td>
                      <td>${H.formatarData(v.dataAplicacao)}</td>
                      <td>${H.esc(nomePessoa(v))}</td>
                      <td>${situacao ? `${H.formatarData(v.proximaDose)} <span class="status-badge" style="background:${situacao.cor}">${situacao.label}</span>` : '—'}</td>
                      <td class="actions-cell">
                        <button class="btn-icon" data-edit-vc="${v.id}" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon btn-danger" data-del-vc="${v.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                      </td>
                    </tr>`;
                  }).join('')}</tbody>
                </table>
              </div>`}
          </div>

          ${deConsultas.length ? `
          <div class="card plano-acao-card">
            <h3>Registradas em Consultas e Exames (${deConsultas.length})</h3>
            <div class="table-container">
              <table class="table">
                <thead><tr><th>Descrição</th><th>Data</th><th>Para quem</th><th>Status</th><th>Origem</th></tr></thead>
                <tbody>${deConsultas.map(ev => `
                  <tr>
                    <td>${H.esc(ev.descricao || '')}</td>
                    <td>${ev.data ? H.formatarData(ev.data) : '—'}</td>
                    <td>${H.esc(nomePessoa(ev))}</td>
                    <td>${H.esc(ev.status || '')}</td>
                    <td><a href="#saude-consultas" class="btn-link">Consultas e Exames</a></td>
                  </tr>`).join('')}</tbody>
              </table>
            </div>
          </div>` : ''}
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#saude-vacinas');
      const painelForm = H.formRecolhivel(document.getElementById('vc-form-card'), 'Nova vacina', vacinas.length === 0);

      const el = (id) => document.getElementById(id);
      el('vc-cancel').onclick = () => { editingId = null; render(); };

      el('vc-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
          nome: el('vc-nome').value.trim(),
          dose: el('vc-dose').value,
          dataAplicacao: el('vc-data').value,
          responsavelContatoId: el('vc-responsavel').value,
          local: el('vc-local').value.trim(),
          lote: el('vc-lote').value.trim(),
          proximaDose: el('vc-proxima').value,
          agendaAtivo: el('vc-agenda').checked,
        };
        if (!data.nome) { alert('Informe a vacina.'); return; }
        if (data.proximaDose && data.proximaDose < data.dataAplicacao) { alert('A próxima dose não pode ser anterior à aplicação.'); return; }
        if (editingId) {
          S.updateSaudeVacina(editingId, data);
          sincronizarEventoProximaDose({ ...data, id: editingId });
        } else {
          sincronizarEventoProximaDose(S.addSaudeVacina(data));
        }
        editingId = null;
        render();
      };

      container.querySelector('.plano-acao-table-card').addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-edit-vc]');
        if (editBtn) {
          const v = vacinas.find(x => x.id === editBtn.dataset.editVc);
          if (!v) return;
          editingId = v.id;
          el('vc-form-title').textContent = 'Editando vacina';
          el('vc-submit').textContent = 'Salvar alterações';
          el('vc-mais').open = !!(v.responsavelContatoId || v.local || v.lote);
          painelForm.abrir(false);
          el('vc-nome').value = v.nome || '';
          el('vc-dose').value = v.dose || DOSES_VACINA[0];
          el('vc-data').value = v.dataAplicacao || '';
          el('vc-responsavel').value = v.responsavelContatoId || '';
          el('vc-local').value = v.local || '';
          el('vc-lote').value = v.lote || '';
          el('vc-proxima').value = v.proximaDose || '';
          el('vc-agenda').checked = v.agendaAtivo !== false;
          el('vc-form').scrollIntoView({ behavior: 'smooth' });
          return;
        }
        const delBtn = e.target.closest('[data-del-vc]');
        if (delBtn && confirm('Remover esta vacina?')) {
          const id = delBtn.dataset.delVc;
          S.deleteSaudeVacina(id);
          sincronizarEventoProximaDose({ id });
          render();
        }
      });
    };

    render();
  };

  /* ==================== FICHA MÉDICA ==================== */
  const TIPOS_SANGUINEOS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  const contatoEmergencia = (ficha) => {
    const contato = ficha.emergenciaContatoId
      ? (S.getContatos ? S.getContatos() : []).find(c => c.id === ficha.emergenciaContatoId)
      : null;
    if (contato) return { nome: contato.nome, telefone: contato.telefone || contato.celular || '' };
    return { nome: ficha.emergenciaNome || '', telefone: ficha.emergenciaTelefone || '' };
  };

  PCF.Pages.saudeFicha = (container) => {
    const ficha = S.getSaudeFicha();
    const contatos = S.getContatos ? S.getContatos() : [];
    const area = (id, label, campo, placeholder) => `
      <div class="form-group plano-acao-form-span-2">
        <label>${label}</label>
        <textarea id="${id}" rows="2" placeholder="${placeholder}">${H.esc(ficha[campo] || '')}</textarea>
      </div>`;

    container.innerHTML = `
      <div class="page saude-page">
        <div class="page-header">
          <div>
            <h2>Saúde - Ficha médica</h2>
            <p class="subtitle">Informações importantes para consultas e emergências. Elas também aparecem no Resumo para consulta.</p>
          </div>
        </div>

        <div class="card plano-acao-card">
          <form id="fm-form" class="plano-acao-form">
            <div class="form-group">
              <label>Tipo sanguíneo</label>
              <select id="fm-sangue">${TIPOS_SANGUINEOS.map(t => `<option value="${t}"${(ficha.tipoSanguineo || '') === t ? ' selected' : ''}>${t || 'Não informado'}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label>Plano de saúde / carteirinha</label><input type="text" id="fm-plano" value="${H.esc(ficha.planoSaude || '')}" placeholder="Ex: Unimed - 0000000"></div>
            ${area('fm-alergias', 'Alergias', 'alergias', 'Ex: dipirona, penicilina, frutos do mar')}
            ${area('fm-condicoes', 'Condições de saúde', 'condicoes', 'Ex: hipertensão, diabetes, asma')}
            ${area('fm-cirurgias', 'Cirurgias e internações', 'cirurgias', 'Ex: apendicectomia em 2015')}
            <div class="form-group plano-acao-form-span-2"><label>Médico de referência</label><input type="text" id="fm-medico" value="${H.esc(ficha.medicoReferencia || '')}" placeholder="Nome, especialidade e telefone"></div>
            <fieldset class="plano-acao-when plano-acao-form-span-2">
              <legend>Contato de emergência</legend>
              <div class="plano-acao-when-fields">
                <div class="form-group">
                  <label>Dos meus contatos</label>
                  <select id="fm-emerg-contato">
                    <option value="">Informar manualmente</option>
                    ${contatos.map(c => `<option value="${H.esc(c.id)}"${ficha.emergenciaContatoId === c.id ? ' selected' : ''}>${H.esc(c.nome)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group fm-emerg-manual"><label>Nome</label><input type="text" id="fm-emerg-nome" value="${H.esc(ficha.emergenciaNome || '')}"></div>
                <div class="form-group fm-emerg-manual"><label>Telefone</label><input type="text" id="fm-emerg-tel" value="${H.esc(ficha.emergenciaTelefone || '')}" placeholder="(00) 00000-0000"></div>
              </div>
            </fieldset>
            <div class="form-group plano-acao-form-actions plano-acao-form-span-2">
              <button type="submit" class="btn btn-primary"><i data-lucide="save"></i> Salvar ficha</button>
              <a href="#saude-resumo" class="btn btn-secondary">Ver Resumo para consulta</a>
              <span id="fm-ok" class="diario-saved-msg" style="display:none">✓ Salvo!</span>
            </div>
          </form>
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons();
    PCF.App.applyStandardHeader?.(container, '#saude-ficha');

    const el = (id) => document.getElementById(id);
    const syncEmergencia = () => {
      container.querySelectorAll('.fm-emerg-manual').forEach(g => { g.style.display = el('fm-emerg-contato').value ? 'none' : ''; });
    };
    el('fm-emerg-contato').onchange = syncEmergencia;
    syncEmergencia();

    el('fm-form').onsubmit = (e) => {
      e.preventDefault();
      S.saveSaudeFicha({
        tipoSanguineo: el('fm-sangue').value,
        planoSaude: el('fm-plano').value.trim(),
        alergias: el('fm-alergias').value.trim(),
        condicoes: el('fm-condicoes').value.trim(),
        cirurgias: el('fm-cirurgias').value.trim(),
        medicoReferencia: el('fm-medico').value.trim(),
        emergenciaContatoId: el('fm-emerg-contato').value,
        emergenciaNome: el('fm-emerg-nome').value.trim(),
        emergenciaTelefone: el('fm-emerg-tel').value.trim(),
      });
      el('fm-form').removeAttribute('data-alterado');
      const ok = el('fm-ok');
      ok.style.display = 'inline';
      setTimeout(() => { ok.style.display = 'none'; }, 2000);
    };
  };

  /* ==================== RELATÓRIO SEMANAL ==================== */
  const SEMANAS_RELATORIO = 8;
  const MIN_SEMANAS_RELACAO = 4;
  const DIFERENCA_RELEVANTE = 10;

  const calcSemanas = () => {
    const emocoes = S.getEmocoes();
    const sono = S.getSaudeSono();
    const habitos = S.getHabitos().filter(h => h.ativo !== false);
    const registros = S.getRegistrosHabitos().filter(r => r.completo && habitos.some(h => h.id === r.habitoId));
    const medicamentos = S.getSaudeMedicamentos().filter(ehProprio);
    const doses = S.getSaudeDoses();
    const media = (lista, campo) => lista.length ? lista.reduce((acc, r) => acc + (r[campo] || 0), 0) / lista.length : null;
    return Array.from({ length: SEMANAS_RELATORIO }, (_, i) => {
      const ate = diasAtras(i * 7);
      const de = diasAtras(i * 7 + 6);
      const naSemana = (r) => r.data >= de && r.data <= ate;
      const emo = emocoes.filter(naSemana);
      const regs = registros.filter(naSemana);
      return {
        de, ate,
        positivas: emo.length ? Math.round((emo.filter(e => H.emocaoPositiva(e.emocaoSuperior)).length / emo.length) * 100) : null,
        sono: media(sono.filter(naSemana), 'horas'),
        habitos: (regs.length && habitos.length) ? Math.round((regs.length / (habitos.length * 7)) * 100) : null,
        adesao: H.adesaoPeriodo(medicamentos, doses, de, ate),
      };
    }).reverse();
  };

  // Compara a emoção positiva entre a metade de semanas com mais e com menos de cada medida
  const relacoesSemanais = (semanas) => {
    const media = (lista) => Math.round(lista.reduce((acc, s) => acc + s.positivas, 0) / lista.length);
    return [
      { campo: 'sono', nome: 'sono' },
      { campo: 'habitos', nome: 'hábitos concluídos' },
      { campo: 'adesao', nome: 'adesão aos medicamentos' },
    ].flatMap(({ campo, nome }) => {
      const validas = semanas.filter(s => s.positivas !== null && s[campo] !== null).sort((a, b) => a[campo] - b[campo]);
      if (validas.length < MIN_SEMANAS_RELACAO) return [];
      const metade = Math.floor(validas.length / 2);
      // Só compara quando as semanas realmente diferem nessa medida
      if (validas[metade - 1][campo] >= validas[validas.length - metade][campo]) return [];
      const menos = media(validas.slice(0, metade));
      const mais = media(validas.slice(-metade));
      if (Math.abs(mais - menos) < DIFERENCA_RELEVANTE) return [];
      return [`Nas semanas com mais ${nome}, ${mais}% das emoções foram positivas, contra ${menos}% nas semanas com menos.`];
    });
  };

  PCF.Pages.saudeSemanal = (container) => {
    PCF.App.destroyCharts();
    const semanas = calcSemanas();
    const atual = semanas[semanas.length - 1];
    const anterior = semanas[semanas.length - 2];
    const METRICAS = [
      { campo: 'positivas', titulo: 'Emoções positivas', fmt: v => `${v}%`, max: 100 },
      { campo: 'sono', titulo: 'Sono por noite', fmt: v => formatarHoras(v), max: 12 },
      { campo: 'habitos', titulo: 'Hábitos concluídos', fmt: v => `${v}%`, max: 100 },
      { campo: 'adesao', titulo: 'Adesão aos medicamentos', fmt: v => `${v}%`, max: 100 },
    ];
    const temDados = (m) => semanas.some(s => s[m.campo] !== null);
    const relacoes = relacoesSemanais(semanas);
    const rotulo = (s) => `${s.de.slice(8)}/${s.de.slice(5, 7)} a ${s.ate.slice(8)}/${s.ate.slice(5, 7)}`;
    const variacao = (m) => {
      const a = atual[m.campo];
      const b = anterior[m.campo];
      if (a === null || b === null) return 'Sem comparação';
      if (a === b) return 'Igual à semana anterior';
      return `${a > b ? 'Acima' : 'Abaixo'} da semana anterior (${m.fmt(b)})`;
    };

    container.innerHTML = `
      <div class="page saude-page">
        <div class="page-header">
          <div>
            <h2>Relatório semanal</h2>
            <p class="subtitle">Junta emoções, sono, hábitos e medicamentos dos últimos 7 dias, comparando com as semanas anteriores.</p>
          </div>
        </div>

        <div class="cards-grid">
          ${METRICAS.map(m => `
            <div class="card saude-semana-card">
              <div class="card-label">${m.titulo}</div>
              <div class="card-value">${atual[m.campo] === null ? '—' : m.fmt(atual[m.campo])}</div>
              <small class="text-muted">${variacao(m)}</small>
            </div>`).join('')}
        </div>

        <div class="card plano-acao-card">
          <h3>O que coincidiu</h3>
          ${relacoes.length
            ? `<ul class="saude-semana-relacoes">${relacoes.map(r => `<li>${H.esc(r)}</li>`).join('')}</ul>
               <small class="form-hint">Mostra coincidências nos seus registros, não causa e efeito.</small>`
            : `<p class="empty-text">Ainda não há diferença clara. São necessárias pelo menos ${MIN_SEMANAS_RELACAO} semanas com registros.</p>`}
        </div>

        <div class="saude-semana-graficos">
          ${METRICAS.filter(temDados).map(m => `
            <div class="chart-container">
              <h3>${m.titulo}</h3>
              <div class="saude-semana-area"><canvas id="sw-${m.campo}"></canvas></div>
            </div>`).join('')}
        </div>

        <div class="card plano-acao-card plano-acao-table-card">
          <h3>Últimas ${SEMANAS_RELATORIO} semanas</h3>
          <div class="table-container">
            <table class="table">
              <thead><tr><th>Período</th>${METRICAS.map(m => `<th>${m.titulo}</th>`).join('')}</tr></thead>
              <tbody>${[...semanas].reverse().map(s => `
                <tr><td>${rotulo(s)}</td>${METRICAS.map(m => `<td>${s[m.campo] === null ? '—' : m.fmt(s[m.campo])}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons();
    PCF.App.applyStandardHeader?.(container, '#saude-semanal');

    if (!window.Chart) return;
    METRICAS.filter(temDados).forEach(m => {
      PCF.App.registerChart(new Chart(document.getElementById(`sw-${m.campo}`), {
        type: 'line',
        data: {
          labels: semanas.map(rotulo),
          datasets: [{
            label: m.titulo,
            data: semanas.map(s => s[m.campo] === null ? null : Number(s[m.campo].toFixed(2))),
            borderColor: COR_INFO,
            backgroundColor: COR_INFO,
            borderWidth: 2,
            pointRadius: 4,
            tension: .3,
            spanGaps: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 4 }, grid: { display: false } },
            y: { min: 0, max: m.max, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.15)' } },
          },
          plugins: {
            legend: { display: false },
            datalabels: { display: false },
            tooltip: { callbacks: { label: (ctx) => `${m.titulo}: ${m.fmt(ctx.parsed.y)}` } },
          },
        },
      }));
    });
  };

  /* ==================== RESUMO PARA CONSULTA ==================== */
  PCF.Pages.saudeResumo = (container) => {
    const session = S.getSession ? S.getSession() : null;
    const usuario = session ? S.getUserById(session.userId) : null;
    const ficha = S.getSaudeFicha();
    const emergencia = contatoEmergencia(ficha);
    const hoje = H.hoje();

    const idade = (() => {
      if (!usuario?.dataNascimento) return null;
      const nasc = new Date(`${usuario.dataNascimento}T12:00:00`);
      const agora = new Date();
      let anos = agora.getFullYear() - nasc.getFullYear();
      if (agora < new Date(agora.getFullYear(), nasc.getMonth(), nasc.getDate())) anos -= 1;
      return anos;
    })();

    const imc = S.getIMC();
    const ultimoPeso = (imc.registros || []).slice(-1)[0];
    const medicamentos = S.getSaudeMedicamentos().filter(m => m.status === 'Em uso' && ehProprio(m));
    const sinais = [...S.getSaudeSinais()].sort(porDataHoraDesc).slice(0, 5);
    const sintomas = [...S.getSaudeSintomas()].sort(porDataHoraDesc).filter(r => r.data >= diasAtras(30));
    const eventos = S.getSaudeEventos().filter(ehProprio);
    const proximos = eventos.filter(e => e.status === 'Pendente' && e.data && e.data >= hoje)
      .sort((a, b) => a.data.localeCompare(b.data)).slice(0, 5);
    const realizados = eventos.filter(e => e.status === 'Realizado')
      .sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, 5);
    const vacinas = S.getSaudeVacinas().filter(ehProprio)
      .sort((a, b) => (b.dataAplicacao || '').localeCompare(a.dataAplicacao || '')).slice(0, 8);
    const sono = S.getSaudeSono().filter(r => r.data >= diasAtras(29));
    const mediaSono = sono.length ? sono.reduce((acc, r) => acc + (r.horas || 0), 0) / sono.length : null;

    const linha = (rotulo, valor) => valor ? `<p class="saude-resumo-linha"><strong>${rotulo}:</strong> ${H.esc(valor)}</p>` : '';
    const secao = (titulo, conteudo) => `
      <section class="card saude-resumo-secao">
        <h3>${titulo}</h3>
        ${conteudo || '<p class="empty-text">Sem registros.</p>'}
      </section>`;
    const tabela = (colunas, linhas) => linhas.length ? `
      <div class="table-container">
        <table class="table">
          <thead><tr>${colunas.map(c => `<th>${c}</th>`).join('')}</tr></thead>
          <tbody>${linhas.map(l => `<tr>${l.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>` : '';
    const emergenciaTexto = [emergencia.nome, emergencia.telefone].filter(Boolean).join(' - ');

    container.innerHTML = `
      <div class="page saude-page saude-resumo">
        <div class="page-header">
          <div>
            <h2>Resumo para consulta</h2>
            <p class="subtitle">Gerado em ${H.formatarData(hoje)}. Reúne as suas informações de saúde para levar à consulta.</p>
          </div>
          <div class="saude-resumo-acoes">
            <button type="button" class="btn btn-primary" id="sr-imprimir"><i data-lucide="printer"></i> Imprimir / salvar PDF</button>
          </div>
        </div>

        ${secao('Identificação e ficha médica', `
          ${linha('Nome', usuario?.nome)}
          ${linha('Idade', idade !== null ? `${idade} anos` : '')}
          ${linha('Tipo sanguíneo', ficha.tipoSanguineo)}
          ${linha('Alergias', ficha.alergias)}
          ${linha('Condições de saúde', ficha.condicoes)}
          ${linha('Cirurgias e internações', ficha.cirurgias)}
          ${linha('Plano de saúde', ficha.planoSaude)}
          ${linha('Médico de referência', ficha.medicoReferencia)}
          ${linha('Contato de emergência', emergenciaTexto)}
          ${(ficha.tipoSanguineo || ficha.alergias || ficha.condicoes) ? '' : '<p class="empty-text saude-resumo-dica">Preencha a <a href="#saude-ficha">Ficha médica</a> para completar este resumo.</p>'}
        `)}

        ${secao('Medicamentos em uso', tabela(['Medicamento', 'Dose', 'Frequência', 'Horários', 'Desde', 'Orientações'], medicamentos.map(m => [
          `<strong>${H.esc(m.nome || '')}</strong>`,
          H.esc(m.dose || ''),
          H.esc(H.normalizarFrequencia(m.frequencia)),
          H.horariosMedicamento(m).join(', ') || '—',
          m.dataInicio ? H.formatarData(m.dataInicio) : '—',
          H.esc(m.posologia || '—'),
        ])))}

        ${secao('Peso e IMC', ultimoPeso ? `
          ${linha('Último registro', H.formatarData(ultimoPeso.data))}
          ${linha('Peso', `${Number(ultimoPeso.peso).toFixed(1)} kg`)}
          ${linha('Altura', `${Number(ultimoPeso.altura).toFixed(2)} m`)}
          ${linha('IMC', Number(ultimoPeso.imc || H.calcularIMC(ultimoPeso.peso, ultimoPeso.altura)).toFixed(2))}
        ` : '')}

        ${secao('Sinais vitais recentes', tabela(['Data', 'Pressão', 'Batimentos', 'Saturação', 'Glicemia', 'Temp.'], sinais.map(r => [
          `${H.formatarData(r.data)} ${r.hora || ''}`,
          pressaoTexto(r) || '—',
          r.frequencia ? `${r.frequencia} bpm` : '—',
          r.saturacao ? `${r.saturacao}%` : '—',
          r.glicemia ? `${r.glicemia} mg/dL (${MOMENTOS_GLICEMIA[r.glicemiaMomento] || ''})` : '—',
          r.temperatura ? `${r.temperatura} °C` : '—',
        ])))}

        ${secao('Sintomas nos últimos 30 dias', tabela(['Data', 'Sintoma', 'Intensidade', 'Duração', 'Observações'], sintomas.map(r => [
          H.formatarData(r.data),
          H.esc(r.sintoma),
          `${r.intensidade}/10`,
          H.esc(r.duracao || '—'),
          H.esc(r.observacao || '—'),
        ])))}

        ${secao('Sono nos últimos 30 dias', mediaSono === null ? '' : `
          ${linha('Média por noite', formatarHoras(mediaSono))}
          ${linha('Noites registradas', String(sono.length))}
        `)}

        ${secao('Consultas e exames', (proximos.length || realizados.length) ? `
          ${proximos.length ? `<h4>Próximos</h4>${tabela(['Data', 'Tipo', 'Descrição', 'Local'], proximos.map(e => [H.formatarData(e.data), H.esc(e.tipo || ''), H.esc(e.descricao || ''), H.esc(e.local || '—')]))}` : ''}
          ${realizados.length ? `<h4>Últimos realizados</h4>${tabela(['Data', 'Tipo', 'Descrição', 'Resultado'], realizados.map(e => [e.data ? H.formatarData(e.data) : '—', H.esc(e.tipo || ''), H.esc(e.descricao || ''), H.esc(e.observacoes || '—')]))}` : ''}
        ` : '')}

        ${secao('Vacinas', tabela(['Vacina', 'Dose', 'Aplicação', 'Próxima dose'], vacinas.map(v => [
          H.esc(v.nome),
          H.esc(v.dose || ''),
          H.formatarData(v.dataAplicacao),
          v.proximaDose ? H.formatarData(v.proximaDose) : '—',
        ])))}
      </div>`;

    if (window.lucide) lucide.createIcons();
    PCF.App.applyStandardHeader?.(container, '#saude-resumo');
    document.getElementById('sr-imprimir').onclick = () => window.print();
  };
})();
