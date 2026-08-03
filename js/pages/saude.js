/* ========================================================
   PCF - pages/saude.js — IMC e Emoções (registro)
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
                <thead><tr><th>Data</th><th>Peso</th><th>Altura</th><th>IMC</th></tr></thead>
                <tbody>${[...registros].reverse().map(r => `<tr>
                  <td>${H.formatarData(r.data)}</td>
                  <td>${Number(r.peso).toFixed(1)} kg</td>
                  <td>${Number(r.altura).toFixed(2)} m</td>
                  <td>${Number(r.imc || H.calcularIMC(r.peso, r.altura)).toFixed(2)}</td>
                </tr>`).join('')}</tbody>
              </table></div>` : '<p class="empty-text">Nenhum registro de IMC salvo ainda.</p>'}
          </div>
        </div>
      </div>`;

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
                <div class="emocao-chips" id="emo-sup-chips">
                  ${config.map(e => `<button type="button" class="chip chip-emocao" data-id="${e.id}" style="border-color:${e.cor}"><span class="chip-icon">${getEmoIcon(e.nome)}</span>${H.esc(e.nome)}</button>`).join('' )}
                </div>
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

      let selSup = null;
      document.getElementById('emo-intensidade').oninput = function() { document.getElementById('emo-int-val').textContent = this.value; };

      const selectSup = (id) => {
        document.querySelectorAll('#emo-sup-chips .chip').forEach(b => { b.classList.remove('selected'); b.style.background = ''; b.style.color = ''; });
        const sup = config.find(c => c.id === id);
        if (!sup) return;
        selSup = sup;
        const btn = document.querySelector(`#emo-sup-chips .chip[data-id="${id}"]`);
        if (btn) { btn.classList.add('selected'); btn.style.background = sup.cor; btn.style.color = '#fff'; }
        const medSel = document.getElementById('emo-med');
        medSel.innerHTML = '<option value="">Selecione...</option>' + (sup.medias || []).map(m => `<option value="${H.esc(m.nome)}">${H.esc(m.nome)}</option>`).join('');
        document.getElementById('emo-med-group').style.display = sup.medias?.length ? '' : 'none';
        document.getElementById('emo-inf-group').style.display = 'none';
        document.getElementById('emo-inf').innerHTML = '<option value="">Selecione...</option>';
      };

      document.querySelectorAll('#emo-sup-chips .chip').forEach(btn => {
        btn.onclick = () => { selectSup(btn.dataset.id); };
      });

      document.getElementById('emo-med').onchange = function() {
        if (!selSup) return;
        const med = selSup.medias?.find(m => m.nome === this.value);
        const infSel = document.getElementById('emo-inf');
        infSel.innerHTML = '<option value="">Selecione...</option>' + (med?.inferiores || []).map(inf => `<option value="${H.esc(inf.nome)}">${H.esc(inf.nome)}</option>`).join('');
        document.getElementById('emo-inf-group').style.display = med?.inferiores?.length ? '' : 'none';
      };

      document.getElementById('emo-cancel-edit').onclick = () => {
        editingId = null;
      document.getElementById('emo-form-title').textContent = 'Novo registro';
        document.getElementById('emo-submit-btn').textContent = 'Registrar Emoção';
        document.getElementById('emo-cancel-edit').style.display = 'none';
        document.getElementById('emo-data').value = H.hoje();
        document.getElementById('emo-hora').value = H.horaAtual();
        document.querySelectorAll('#emo-sup-chips .chip').forEach(b => { b.classList.remove('selected'); b.style.background = ''; b.style.color = ''; });
        selSup = null;
        document.getElementById('emo-med-group').style.display = 'none';
        document.getElementById('emo-inf-group').style.display = 'none';
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
        else { S.addEmocao(data); }
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
          const sup = config.find(c => c.nome === em.emocaoSuperior);
          if (sup) {
            selectSup(sup.id);
            if (em.emocaoMedia) {
              document.getElementById('emo-med').value = em.emocaoMedia;
              document.getElementById('emo-med').dispatchEvent(new Event('change'));
              setTimeout(() => { if (em.emocaoInferior) document.getElementById('emo-inf').value = em.emocaoInferior; }, 0);
            }
          }
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

