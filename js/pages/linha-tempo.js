/* ========================================================
   PCF - Linha do Tempo da História de Vida
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;
  const CATEGORIAS = ['Família', 'Educação', 'Carreira', 'Relacionamentos', 'Saúde', 'Desenvolvimento', 'Lazer', 'Conquista', 'Outro'];
  const CORES = {
    'Família': '#ec4899', 'Educação': '#3b82f6', 'Carreira': '#0d9488',
    'Relacionamentos': '#f43f5e', 'Saúde': '#dc2626', 'Desenvolvimento': '#8b5cf6',
    'Lazer': '#f59e0b', 'Conquista': '#16a34a', 'Outro': '#64748b'
  };

  const parseDate = (iso) => iso ? new Date(`${iso}T12:00:00`) : null;
  const idadeNaData = (nasc, data) => {
    const n = parseDate(nasc);
    const d = parseDate(data);
    if (!n || !d || d < n) return null;
    let idade = d.getFullYear() - n.getFullYear();
    if (d.getMonth() < n.getMonth() || (d.getMonth() === n.getMonth() && d.getDate() < n.getDate())) idade--;
    return idade;
  };
  const formatPeriodo = (e) => {
    if (e.origem === 'documento-2017' && e.dataInicio?.endsWith('-01-01') && (!e.dataFim || e.dataFim.endsWith('-12-31'))) {
      const inicio = e.dataInicio.slice(0, 4);
      const fim = e.dataFim ? e.dataFim.slice(0, 4) : '';
      return fim && fim !== inicio ? `${inicio} a ${fim}` : inicio;
    }
    if (!e.dataFim || e.dataFim === e.dataInicio) return H.formatarData(e.dataInicio);
    return `${H.formatarData(e.dataInicio)} a ${H.formatarData(e.dataFim)}`;
  };

  PCF.Pages.linhaTempo = (container) => {
    let filtro = 'Todas';
    let busca = '';

    const perfil = () => S.getUserById(S.currentUserId()) || {};

    const garantirNascimento = () => {
      const user = perfil();
      if (!user.dataNascimento) return;
      const eventos = S.getLinhaTempo();
      const nascimento = eventos.find(e => e.origem === 'cadastro');
      if (!nascimento) {
        S.saveLinhaTempo([{
          id: S._uid(), dataInicio: user.dataNascimento, dataFim: '', titulo: 'Meu nascimento',
          descricao: `Início da história de vida de ${user.nome || 'usuário'}.`,
          categoria: 'Família', local: '', destaque: true, origem: 'cadastro'
        }, ...eventos]);
      } else if (nascimento.dataInicio !== user.dataNascimento) {
        S.updateEventoLinhaTempo(nascimento.id, { dataInicio: user.dataNascimento });
      }
    };

    const render = () => {
      garantirNascimento();
      const user = perfil();
      const nasc = user.dataNascimento || '';
      const todos = [...S.getLinhaTempo()].sort((a, b) =>
        (a.dataInicio || '').localeCompare(b.dataInicio || '') || (a.titulo || '').localeCompare(b.titulo || '')
      );
      const termo = busca.trim().toLowerCase();
      const eventos = todos.filter(e =>
        (filtro === 'Todas' || e.categoria === filtro) &&
        (!termo || [e.titulo, e.descricao, e.local, e.categoria].some(v => (v || '').toLowerCase().includes(termo)))
      );
      const idadeAtual = nasc ? idadeNaData(nasc, new Date().toISOString().slice(0, 10)) : null;
      const anos = new Set(todos.map(e => (e.dataInicio || '').slice(0, 4)).filter(Boolean)).size;

      container.innerHTML = `
        <div class="page timeline-page">
          <div class="page-header">
            <div>
              <h2><i data-lucide="milestone"></i> Minha Linha do Tempo (História de Vida e Memórias)</h2>
              <p class="subtitle">A história de ${H.esc(user.nome || 'vida')}, organizada desde o nascimento.</p>
            </div>
            <button id="lt-add" class="btn btn-primary"><i data-lucide="plus"></i> Novo marco</button>
          </div>

          ${!nasc ? `<div class="alert alert-error lt-birth-alert">
            Cadastre sua data de nascimento em <button type="button" id="lt-open-profile" class="btn-link">Meu Perfil</button>
            para definir o início da linha do tempo.
          </div>` : ''}

          <div class="lt-summary">
            <div><i data-lucide="calendar-days"></i><strong>${todos.length}</strong><span>marcos registrados</span></div>
            <div><i data-lucide="cake"></i><strong>${idadeAtual ?? '—'}</strong><span>anos de história</span></div>
            <div><i data-lucide="calendar-range"></i><strong>${anos}</strong><span>anos com registros</span></div>
          </div>

          <div class="lt-toolbar">
            <div class="contatos-search-wrap">
              <input id="lt-search" class="input-search" type="search" placeholder="Buscar na história..." value="${H.esc(busca)}">
            </div>
            <select id="lt-filter" aria-label="Filtrar por categoria">
              <option value="Todas">Todas as categorias</option>
              ${CATEGORIAS.map(c => `<option value="${c}"${filtro === c ? ' selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>

          ${eventos.length ? `<div class="lt-list">
            ${eventos.map((e, i) => {
              const idade = idadeNaData(nasc, e.dataInicio);
              const ano = (e.dataInicio || '').slice(0, 4) || '—';
              const novoAno = i === 0 || (eventos[i - 1].dataInicio || '').slice(0, 4) !== ano;
              return `
                ${novoAno ? `<div class="lt-year"><span>${ano}</span></div>` : ''}
                <article class="lt-event${e.destaque ? ' is-featured' : ''}" style="--lt-color:${CORES[e.categoria] || CORES.Outro}">
                  <div class="lt-dot"></div>
                  <div class="lt-card">
                    <div class="lt-card-head">
                      <div>
                        <span class="lt-category">${H.esc(e.categoria || 'Outro')}</span>
                        ${idade !== null ? `<span class="lt-age">${idade} ano${idade === 1 ? '' : 's'}</span>` : ''}
                      </div>
                      <div class="lt-actions">
                        <button class="btn-icon" data-lt-edit="${e.id}" title="Editar"><i data-lucide="pencil"></i></button>
                        ${e.origem !== 'cadastro' ? `<button class="btn-icon btn-danger" data-lt-del="${e.id}" title="Excluir"><i data-lucide="trash-2"></i></button>` : ''}
                      </div>
                    </div>
                    <h3>${H.esc(e.titulo)}</h3>
                    <div class="lt-period"><i data-lucide="calendar"></i>${H.esc(formatPeriodo(e))}</div>
                    ${e.local ? `<div class="lt-location"><i data-lucide="map-pin"></i>${H.esc(e.local)}</div>` : ''}
                    ${e.descricao ? `<p>${H.esc(e.descricao).replace(/\n/g, '<br>')}</p>` : ''}
                  </div>
                </article>`;
            }).join('')}
          </div>` : `<div class="hab-empty"><p>Nenhum marco encontrado.</p><button class="btn btn-primary" id="lt-empty-add">Adicionar primeiro marco</button></div>`}
        </div>`;

      if (window.lucide) lucide.createIcons();
      document.getElementById('lt-add').onclick = () => showModal();
      const emptyAdd = document.getElementById('lt-empty-add');
      if (emptyAdd) emptyAdd.onclick = () => showModal();
      const profileBtn = document.getElementById('lt-open-profile');
      if (profileBtn) profileBtn.onclick = () => {
        const meuPerfil = document.getElementById('btn-meu-perfil');
        if (meuPerfil) meuPerfil.click();
        else location.hash = '#usuarios';
      };
      document.getElementById('lt-filter').onchange = e => { filtro = e.target.value; render(); };
      const search = document.getElementById('lt-search');
      search.oninput = e => { busca = e.target.value; };
      search.onkeydown = e => { if (e.key === 'Enter') render(); };
      container.onclick = e => {
        const edit = e.target.closest('[data-lt-edit]');
        if (edit) showModal(todos.find(x => x.id === edit.dataset.ltEdit));
        const del = e.target.closest('[data-lt-del]');
        if (del && confirm('Excluir este marco da sua linha do tempo?')) {
          S.deleteEventoLinhaTempo(del.dataset.ltDel);
          render();
        }
      };
    };

    const showModal = (evento = null) => {
      const isEdit = !!evento;
      const nascimento = perfil().dataNascimento || '';
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal-lg">
          <h3>${isEdit ? 'Editar marco' : 'Novo marco da vida'}</h3>
          <form id="lt-form">
            <div class="form-group"><label>Título</label><input id="lt-title" required maxlength="120" value="${H.esc(evento?.titulo || '')}"></div>
            <div class="form-row">
              <div class="form-group"><label>Data inicial</label><input type="date" id="lt-start" required min="${nascimento}" value="${evento?.dataInicio || ''}"></div>
              <div class="form-group"><label>Data final (opcional)</label><input type="date" id="lt-end" min="${nascimento}" value="${evento?.dataFim || ''}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Categoria</label><select id="lt-category">${CATEGORIAS.map(c => `<option value="${c}"${(evento?.categoria || 'Outro') === c ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
              <div class="form-group"><label>Local (opcional)</label><input id="lt-local" maxlength="120" value="${H.esc(evento?.local || '')}"></div>
            </div>
            <div class="form-group"><label>Descrição</label><textarea id="lt-description" rows="5" maxlength="2000">${H.esc(evento?.descricao || '')}</textarea></div>
            <label class="check-label"><input type="checkbox" id="lt-featured"${evento?.destaque ? ' checked' : ''}> Destacar este marco</label>
            <div id="lt-error" class="alert alert-error" style="display:none"></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="lt-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
      document.getElementById('lt-cancel').onclick = () => overlay.remove();
      document.getElementById('lt-form').onsubmit = e => {
        e.preventDefault();
        const dataInicio = document.getElementById('lt-start').value;
        const dataFim = document.getElementById('lt-end').value;
        const error = document.getElementById('lt-error');
        if (dataFim && dataFim < dataInicio) {
          error.textContent = 'A data final não pode ser anterior à data inicial.';
          error.style.display = 'block';
          return;
        }
        const data = {
          titulo: document.getElementById('lt-title').value.trim(),
          dataInicio, dataFim,
          categoria: document.getElementById('lt-category').value,
          local: document.getElementById('lt-local').value.trim(),
          descricao: document.getElementById('lt-description').value.trim(),
          destaque: document.getElementById('lt-featured').checked
        };
        if (isEdit) S.updateEventoLinhaTempo(evento.id, data);
        else S.addEventoLinhaTempo(data);
        overlay.remove();
        render();
      };
    };

    render();
  };
})();
