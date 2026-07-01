/* ========================================================
   PCF - pages/admin.js â€” Categorias CRUD, EmoÃ§Ãµes Config CRUD,
   Usuários CRUD, Importar/Exportar CSV
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

(() => {
  const S = PCF.Store;
  const H = PCF.Helpers;

  /* ==================== CATEGORIAS CRUD ==================== */
  PCF.Pages.categorias = (container) => {
    let filtroTipo = '';
    const render = () => {
      const cats = S.getCategorias();
      const filtered = filtroTipo ? cats.filter(c => c.tipoOperacao === filtroTipo) : cats;
      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2>Config. Categorias</h2>
            <div style="display:flex;gap:8px;align-items:center">
              <button id="btn-restaurar-cats" class="btn btn-outline"><i data-lucide="rotate-ccw"></i> Restaurar PadrÃµes</button>
              <button id="btn-add-cat" class="btn btn-primary">+ Nova Categoria</button>
            </div>
          </div>
          <div class="filters">
            <select id="cat-filtro-tipo">
              <option value="">Todos os Tipos</option>
              <option value="RECEITA" ${filtroTipo === 'RECEITA' ? 'selected' : ''}>Receita</option>
              <option value="DESPESA" ${filtroTipo === 'DESPESA' ? 'selected' : ''}>Despesa</option>
              <option value="INVESTIMENTO" ${filtroTipo === 'INVESTIMENTO' ? 'selected' : ''}>Investimento</option>
            </select>
          </div>
          <div class="table-container"><table class="table">
            <thead><tr><th>Tipo OperaÃ§Ã£o</th><th>Categoria</th><th>Subcategorias</th><th style="width:120px">Ações</th></tr></thead>
            <tbody>${filtered.length === 0 ? '<tr><td colspan="4" class="empty-text">Nenhuma categoria</td></tr>' :
              filtered.map(c => `<tr>
                <td><span class="tipo-badge ${c.tipoOperacao.toLowerCase()}">${c.tipoOperacao}</span></td>
                <td>${H.esc(c.categoria)}</td>
                <td><div class="subcats-list">${(c.subcategorias || []).map(s => { const n = typeof s === 'string' ? s : s.nome; const tp = typeof s === 'string' ? '' : s.tipo; return `<span class="chip-small">${H.esc(n)}${tp ? ` <small style="opacity:.65;font-style:normal">(${H.esc(tp)})</small>` : ''}</span>`; }).join(' ') || '<em class="text-muted">Nenhuma</em>'}</div></td>
                <td>
                  <button class="btn-icon" data-edit="${c.id}" title="Editar"><i data-lucide="pencil"></i></button>
                  <button class="btn-icon btn-danger" data-del="${c.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;

      document.getElementById('cat-filtro-tipo').onchange = function() { filtroTipo = this.value; render(); };
      document.getElementById('btn-add-cat').onclick = () => showCatModal();
      document.getElementById('btn-restaurar-cats').onclick = () => {
        if (confirm('Restaurar categorias Padrão? As categorias atuais serÃ£o substituÃ­das pelas categorias Padrão.')) {
          S.restoreDefaultCategorias();
          filtroTipo = '';
          render();
        }
      };
      container.onclick = (e) => {
        const edit = e.target.closest('[data-edit]');
        if (edit) { const cat = cats.find(c => c.id === edit.dataset.edit); if (cat) showCatModal(cat); }
        const del = e.target.closest('[data-del]');
        if (del && confirm('Remover esta categoria?')) { S.deleteCategoria(del.dataset.del); render(); }
      };
    };

    const showCatModal = (cat) => {
      const isEdit = !!cat;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>${isEdit ? 'Editar' : 'Nova'} Categoria</h3>
          <form id="cat-modal-form">
            <div class="form-group"><label>Tipo de OperaÃ§Ã£o</label>
              <select id="cat-m-tipo" required ${isEdit ? 'disabled' : ''}>
                <option value="DESPESA" ${cat?.tipoOperacao === 'DESPESA' ? 'selected' : ''}>DESPESA</option>
                <option value="RECEITA" ${cat?.tipoOperacao === 'RECEITA' ? 'selected' : ''}>RECEITA</option>
                <option value="INVESTIMENTO" ${cat?.tipoOperacao === 'INVESTIMENTO' ? 'selected' : ''}>INVESTIMENTO</option>
              </select>
            </div>
            <div class="form-group"><label>Nome da Categoria</label><input type="text" id="cat-m-nome" value="${H.esc(cat?.categoria || '')}" required></div>
            <div class="form-group">
              <label>Subcategorias</label>
              <div id="subcat-list" class="subcat-list"></div>
              <button type="button" id="btn-add-subcat" class="btn btn-secondary" style="margin-top:8px">+ Subcategoria</button>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="cat-m-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);

      const addSubcatRow = (nome = '', tipo = '') => {
        const row = document.createElement('div');
        row.className = 'subcat-row';
        row.innerHTML = `<input type="text" class="subcat-nome" value="${H.esc(nome)}" placeholder="Nome da subcategoria"><select class="subcat-tipo"><option value="">--</option><option value="Fixo" ${tipo === 'Fixo' ? 'selected' : ''}>Fixo</option><option value="VariÃ¡vel" ${tipo === 'VariÃ¡vel' ? 'selected' : ''}>VariÃ¡vel</option></select><button type="button" class="btn-icon btn-danger subcat-del" title="Remover"><i data-lucide="trash-2"></i></button>`;
        row.querySelector('.subcat-del').onclick = () => row.remove();
        document.getElementById('subcat-list').appendChild(row);
      };

      (cat?.subcategorias || []).forEach(s => {
        const nome = typeof s === 'string' ? s : s.nome;
        const tipo = typeof s === 'string' ? '' : (s.tipo || '');
        addSubcatRow(nome, tipo);
      });

      document.getElementById('btn-add-subcat').onclick = () => addSubcatRow();
      document.getElementById('cat-m-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

      document.getElementById('cat-modal-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
          tipoOperacao: document.getElementById('cat-m-tipo').value,
          categoria: document.getElementById('cat-m-nome').value.trim(),
          subcategorias: [...document.querySelectorAll('#subcat-list .subcat-row')].map(row => ({
            nome: row.querySelector('.subcat-nome').value.trim(),
            tipo: row.querySelector('.subcat-tipo').value,
          })).filter(s => s.nome),
        };
        if (isEdit) S.updateCategoria(cat.id, data);
        else S.addCategoria(data);
        overlay.remove();
        render();
      };
    };
    render();
  };

  /* ==================== EMOÇÕES CONFIG CRUD ==================== */
  PCF.Pages.emocoesConfig = (container) => {
    const render = () => {
      const config = S.getEmocoesConfig();
      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2>Configuração de Emoções</h2>
            <div style="display:flex;gap:8px;align-items:center">
              <button id="btn-restaurar-emocoes" class="btn btn-outline"><i data-lucide="rotate-ccw"></i> Restaurar Padrões</button>
              <button id="btn-add-emo-sup" class="btn btn-primary">+ Nova Emoção Superior</button>
            </div>
          </div>
          <p class="subtitle">Gerencie as emoções em 3 níveis: Superior → Médio → Inferior. Defina cores para cada nível.</p>
          <div class="emo-config-list">
            ${config.length === 0 ? '<p class="empty-text">Nenhuma emoção configurada</p>' :
              config.map(sup => `
                <div class="emo-config-card">
                  <div class="emo-config-header">
                    <div class="emo-config-title">
                      <span class="emo-color-dot" style="background:${sup.cor}"></span>
                      ${sup.icon ? `<span class="emo-icon-label">${H.esc(sup.icon)}</span>` : ''}
                      <strong>${H.esc(sup.nome)}</strong>
                      <span class="text-muted">(Superior)</span>
                    </div>
                    <div>
                      <button class="btn-icon" data-edit-sup="${sup.id}" title="Editar"><i data-lucide="pencil"></i></button>
                      <button class="btn-icon btn-danger" data-del-sup="${sup.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                      <button class="btn btn-sm btn-secondary" data-add-med="${sup.id}">+ Média</button>
                    </div>
                  </div>
                  ${(sup.medias || []).map(med => `
                    <div class="emo-config-sub">
                      <div class="emo-config-sub-header">
                        <div><span class="emo-color-dot" style="background:${med.cor}"></span>${H.esc(med.nome)} <span class="text-muted">(Médio)</span></div>
                        <div>
                          <button class="btn-icon" data-edit-med="${sup.id}|${med.id}" title="Editar"><i data-lucide="pencil"></i></button>
                          <button class="btn-icon btn-danger" data-del-med="${sup.id}|${med.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                          <button class="btn btn-sm btn-secondary" data-add-inf="${sup.id}|${med.id}">+ Inferior</button>
                        </div>
                      </div>
                      <div class="emo-config-inf-list">
                        ${(med.inferiores || []).map(inf => `
                          <span class="chip-emo" style="background:${inf.cor};color:#fff">
                            ${H.esc(inf.nome)}
                            <button class="chip-del" data-del-inf="${sup.id}|${med.id}|${inf.id}">×</button>
                          </span>
                        `).join('')}
                        ${(med.inferiores || []).length === 0 ? '<em class="text-muted">Nenhuma inferior</em>' : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              `).join('')}
          </div>
        </div>`;

      document.getElementById('btn-add-emo-sup').onclick = () => showEmoModal('sup');
      document.getElementById('btn-restaurar-emocoes').onclick = () => {
        if (confirm('Restaurar emoções padrão? A configuração atual de emoções será substituída pela padrão.')) {
          S.restoreDefaultEmocoesConfig();
          render();
        }
      };

      container.onclick = (e) => {
        const t = e.target.closest('[data-edit-sup]');
        if (t) { const sup = config.find(s => s.id === t.dataset.editSup); if (sup) showEmoModal('sup', sup); return; }
        const ds = e.target.closest('[data-del-sup]');
        if (ds && confirm('Remover esta emoção e todas as sub-emoções?')) {
          S.saveEmocoesConfig(config.filter(s => s.id !== ds.dataset.delSup)); render(); return;
        }
        const am = e.target.closest('[data-add-med]');
        if (am) { showEmoModal('med', null, am.dataset.addMed); return; }
        const em = e.target.closest('[data-edit-med]');
        if (em) {
          const [supId, medId] = em.dataset.editMed.split('|');
          const sup = config.find(s => s.id === supId);
          const med = sup?.medias.find(m => m.id === medId);
          if (med) showEmoModal('med', med, supId);
          return;
        }
        const dm = e.target.closest('[data-del-med]');
        if (dm) {
          const [supId, medId] = dm.dataset.delMed.split('|');
          const sup = config.find(s => s.id === supId);
          if (sup && confirm('Remover esta emoção média?')) {
            sup.medias = sup.medias.filter(m => m.id !== medId);
            S.saveEmocoesConfig(config); render();
          }
          return;
        }
        const ai = e.target.closest('[data-add-inf]');
        if (ai) { const [supId, medId] = ai.dataset.addInf.split('|'); showEmoModal('inf', null, supId, medId); return; }
        const di = e.target.closest('[data-del-inf]');
        if (di) {
          const [supId, medId, infId] = di.dataset.delInf.split('|');
          const sup = config.find(s => s.id === supId);
          const med = sup?.medias.find(m => m.id === medId);
          if (med) { med.inferiores = med.inferiores.filter(i => i.id !== infId); S.saveEmocoesConfig(config); render(); }
        }
      };
    };

    const showEmoModal = (level, item, parentSupId, parentMedId) => {
      const isEdit = !!item;
      const labels = { sup: 'Emoção Superior', med: 'Emoção Média', inf: 'Emoção Inferior' };
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>${isEdit ? 'Editar' : 'Nova'} ${labels[level]}</h3>
          <form id="emo-modal-form">
            <div class="form-group"><label>Nome</label><input type="text" id="emo-m-nome" value="${H.esc(item?.nome || '')}" required></div>
            <div class="form-group"><label>Cor</label><input type="color" id="emo-m-cor" value="${item?.cor || (level === 'sup' ? '#6b7280' : level === 'med' ? '#9ca3af' : '#d1d5db')}"></div>
            ${level === 'sup' ? `<div class="form-group"><label>Ícone (emoji)</label><input type="text" id="emo-m-icon" value="${H.esc(item?.icon || '')}" placeholder="Ex: 😊" maxlength="4"></div>` : ''}
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="emo-m-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById('emo-m-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

      document.getElementById('emo-modal-form').onsubmit = (e) => {
        e.preventDefault();
        const nome = document.getElementById('emo-m-nome').value.trim();
        const cor = document.getElementById('emo-m-cor').value;
        const iconEl = document.getElementById('emo-m-icon');
        const icon = iconEl ? iconEl.value.trim() : '';
        const config = S.getEmocoesConfig();

        if (level === 'sup') {
          if (isEdit) { const s = config.find(s => s.id === item.id); if (s) { s.nome = nome; s.cor = cor; s.icon = icon; } }
          else { config.push({ id: S._uid(), nome, cor, icon, medias: [] }); }
        } else if (level === 'med') {
          const sup = config.find(s => s.id === parentSupId);
          if (sup) {
            if (isEdit) { const m = sup.medias.find(m => m.id === item.id); if (m) { m.nome = nome; m.cor = cor; } }
            else { sup.medias.push({ id: S._uid(), nome, cor, inferiores: [] }); }
          }
        } else {
          const sup = config.find(s => s.id === parentSupId);
          const med = sup?.medias.find(m => m.id === parentMedId);
          if (med) {
            if (isEdit) { const i = med.inferiores.find(i => i.id === item.id); if (i) { i.nome = nome; i.cor = cor; } }
            else { med.inferiores.push({ id: S._uid(), nome, cor }); }
          }
        }
        S.saveEmocoesConfig(config);
        overlay.remove();
        render();
      };
    };
    render();
  };

  /* ==================== USUÃRIOS CRUD ==================== */
  PCF.Pages.usuarios = (container) => {
    let _searchTerm = '';

    const render = () => {
      const todos = S.getUsers();
      const term = _searchTerm.trim().toLowerCase();
      const users = term
        ? todos.filter(u =>
            (u.nome  && u.nome.toLowerCase().includes(term)) ||
            (u.email && u.email.toLowerCase().includes(term))
          )
        : todos;
      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2>Gerenciar Usuários</h2>
            <div class="contatos-search-wrap">
              <input type="text" id="usuarios-search" class="input-search" placeholder="Buscar por nome ou e-mail" value="${H.esc(_searchTerm)}">
              <button id="btn-usuarios-search" class="btn btn-secondary" title="Buscar"><i data-lucide="search"></i></button>
              ${_searchTerm ? `<button id="btn-usuarios-clear" class="btn btn-secondary" title="Limpar busca"><i data-lucide="x"></i></button>` : ''}
            </div>
            <button id="btn-add-user" class="btn btn-primary">+ Novo Usuário</button>
          </div>
          <div class="table-container"><table class="table">
            <thead><tr><th>Nome</th><th class="col-hide-mobile">CPF</th><th>E-mail</th><th class="col-hide-mobile">Telefone</th><th class="col-hide-mobile">Nascimento</th><th class="col-hide-mobile">Cadastro</th><th>Perfil</th><th style="width:100px">Ações</th></tr></thead>
            <tbody>${users.length === 0 ? `<tr><td colspan="8" class="empty-text">${term ? 'Nenhum Usuário encontrado para "' + H.esc(term) + '"' : 'Nenhum Usuário'}</td></tr>` :
              users.map(u => `<tr>
                <td>${H.esc(u.nome)}</td><td class="col-hide-mobile">${H.esc(u.cpf)}</td><td>${H.esc(u.email)}</td><td class="col-hide-mobile">${H.esc(u.telefone)}</td>
                <td class="col-hide-mobile">${H.formatarData(u.dataNascimento)}</td><td class="col-hide-mobile">${H.formatarData(u.dataCadastro)}</td>
                <td>${u.isAdmin ? '<span class="badge-admin">Admin</span>' : '<span class="badge-padrao">Padrão</span>'}</td>
                <td>
                  <button class="btn-icon" data-edit="${u.id}" title="Editar"><i data-lucide="pencil"></i></button>
                  <button class="btn-icon btn-danger" data-del="${u.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;

      const searchInput = document.getElementById('usuarios-search');
      const doSearch = () => { _searchTerm = searchInput.value; render(); };
      document.getElementById('btn-usuarios-search').onclick = doSearch;
      searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
      const clearBtn = document.getElementById('btn-usuarios-clear');
      if (clearBtn) clearBtn.onclick = () => { _searchTerm = ''; render(); };

      document.getElementById('btn-add-user').onclick = () => showUserModal();
      container.onclick = (e) => {
        if (e.target.closest('#btn-usuarios-search') || e.target.closest('#btn-usuarios-clear') || e.target.closest('#btn-add-user')) return;
        const edit = e.target.closest('[data-edit]');
        if (edit) { const u = todos.find(u => u.id === edit.dataset.edit); if (u) showUserModal(u); }
        const del = e.target.closest('[data-del]');
        if (del) {
          const uid = del.dataset.del;
          if (uid === S.currentUserId()) { alert('NÃ£o Ã© possÃ­vel remover o Usuário logado.'); return; }
          if (confirm('Remover este Usuário e todos os seus dados?')) { S.deleteUser(uid).then(() => render()); }
        }
      };
    };

    const showUserModal = (user) => {
      const isEdit = !!user;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal-lg">
          <h3>${isEdit ? 'Editar' : 'Novo'} Usuário</h3>
          <form id="user-modal-form">
            <div class="form-row">
              <div class="form-group"><label>Nome Completo</label><input type="text" id="um-nome" value="${H.esc(user?.nome || '')}" required></div>
              <div class="form-group"><label>CPF</label><input type="text" id="um-cpf" value="${H.esc(user?.cpf || '')}" placeholder="000.000.000-00" required></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Telefone</label><input type="text" id="um-tel" value="${H.esc(user?.telefone || '')}" placeholder="(00) 00000-0000"></div>
              <div class="form-group"><label>Data de Nascimento</label><input type="date" id="um-nasc" value="${user?.dataNascimento || ''}"></div>
            </div>
            <div class="form-group">
              <label>E-mail</label><input type="email" id="um-email" value="${H.esc(user?.email || '')}" required>
            </div>
            <div class="form-row">
              <div class="form-group"><label>${isEdit ? 'Nova Senha (deixe vazio para manter)' : 'Senha'}</label><input type="password" id="um-pass" ${isEdit ? '' : 'required'} minlength="4"></div>
              <div class="form-group"><label>Confirmar Senha</label><input type="password" id="um-pass2" ${isEdit ? '' : 'required'}></div>
            </div>
            ${S.currentUserIsAdmin() ? `
            <div class="form-row">
              <div class="form-group">
                <label class="check-label"><input type="checkbox" id="um-admin" ${user?.isAdmin ? 'checked' : ''}> Administrador</label>
                <small class="text-muted">Somente administradores podem criar outros administradores.</small>
              </div>
            </div>` : ''}
            <div id="um-error" class="alert alert-error" style="display:none"></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="um-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById('um-cpf').oninput = function() { this.value = H.formatarCPF(this.value); };
      document.getElementById('um-tel').oninput = function() { this.value = H.formatarTelefone(this.value); };
      document.getElementById('um-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

      document.getElementById('user-modal-form').onsubmit = async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('um-error');
        const p1 = document.getElementById('um-pass').value;
        const p2 = document.getElementById('um-pass2').value;
        if (p1 && p1 !== p2) { errEl.textContent = 'As senhas nÃ£o coincidem'; errEl.style.display = 'block'; return; }

        const data = {
          nome: document.getElementById('um-nome').value.trim(),
          cpf: document.getElementById('um-cpf').value.trim(),
          email: document.getElementById('um-email').value.trim(),
          telefone: document.getElementById('um-tel').value.trim(),
          dataNascimento: document.getElementById('um-nasc').value,
          login: document.getElementById('um-email').value.trim(),
        };
        if (p1) data.newPassword = p1;
        if (S.currentUserIsAdmin()) {
          data.isAdmin = !!(document.getElementById('um-admin')?.checked);
        }

        if (isEdit) {
          const res = await S.updateUser(user.id, data);
          if (!res.ok) { errEl.textContent = res.msg; errEl.style.display = 'block'; return; }
        } else {
          if (!p1) { errEl.textContent = 'Senha Ã© obrigatÃ³ria'; errEl.style.display = 'block'; return; }
          const res = await S.createUser(data, p1);
          if (!res.ok) { errEl.textContent = res.msg; errEl.style.display = 'block'; return; }
        }
        overlay.remove();
        render();
      };
    };
    render();
  };

  /* ==================== IMPORTAR / EXPORTAR CSV ==================== */
  PCF.Pages.importExport = (container) => {
    container.innerHTML = `
      <div class="page">
        <h2>Importar / Exportar</h2><br>
        <p class="subtitle">Exporte ou importe dados em formato CSV (compatível com Excel).</p>

        <div class="ie-grid">
          <div class="ie-section">
            <h3><i data-lucide="upload"></i> Exportar</h3>
            <div class="ie-buttons">
              <button id="exp-trans" class="btn btn-primary">Exportar Transações (CSV)</button>
              <button id="exp-users" class="btn btn-primary">Exportar Usuários (CSV)</button>
              <button id="exp-cats" class="btn btn-primary">Exportar Categorias (CSV)</button>
              <button id="exp-emocoes" class="btn btn-primary">Exportar Registros de Emoções (CSV)</button>
              <button id="exp-frases" class="btn btn-primary">Exportar Mensagens (CSV)</button>
            </div>
          </div>
          <div class="ie-section">
            <h3><i data-lucide="download"></i> Importar</h3>
            <div class="ie-import-block">
              <label>Importar Transações (CSV)</label>
              <input type="file" id="imp-trans" accept=".csv" class="input-file">
              <p class="text-muted">Colunas: data, tipoOperacao, categoria, subcategoria, item, valor, formaPagamento, tipo</p>
            </div>
            <div class="ie-import-block">
              <label>Importar Usuários (CSV)</label>
              <input type="file" id="imp-users" accept=".csv" class="input-file">
              <p class="text-muted">Colunas: nome, cpf, email, telefone, dataNascimento, login, senha</p>
            </div>
            <div class="ie-import-block">
              <label>Importar Mensagens (CSV)</label>
              <input type="file" id="imp-frases" accept=".csv" class="input-file">
              <p class="text-muted">Colunas: texto, autor, categoria, ativo (sim/nao)</p>
            </div>
            <div id="ie-msg"></div>
          </div>
          <div class="ie-section">
            <h3><i data-lucide="trash-2"></i> Limpar Bases</h3>
            <p class="text-muted">Remove todos os registros da base selecionada. Esta ação não pode ser desfeita.</p>
            <div class="ie-buttons">
              <button id="clear-trans" class="btn btn-danger">Limpar Transações Financeiras</button>
              <button id="clear-emocoes" class="btn btn-danger">Limpar Registros de Emoções</button>
              <button id="clear-agenda" class="btn btn-danger">Limpar Agenda</button>
              <button id="clear-imc" class="btn btn-danger">Limpar IMC</button>
              <button id="clear-frases" class="btn btn-danger">Limpar Base de Mensagens</button>
              <button id="clear-habitos-def" class="btn btn-danger">Limpar Hábitos (Definições)</button>
              <button id="clear-reg-hab" class="btn btn-danger">Limpar Registros de Hábitos</button>
              <button id="clear-virtudes" class="btn btn-danger">Limpar Registros de Virtudes</button>
              <button id="clear-rodavida" class="btn btn-danger">Limpar Roda da Vida</button>
              <button id="clear-diario" class="btn btn-danger">Limpar Diário</button>
            </div>
          </div>
        </div>
      </div>`;

    // EXPORTAR TRANSAÃ‡Ã•ES
    document.getElementById('exp-trans').onclick = () => {
      const trans = S.getTransacoes();
      const headers = ['data','dia','mes','ano','tipoOperacao','categoria','subcategoria','item','valor','formaPagamento','tipo'];
      H.downloadCSV(H.toCSV(trans, headers), 'transacoes.csv');
    };

    // EXPORTAR USUÃRIOS
    document.getElementById('exp-users').onclick = () => {
      const users = S.getUsers().map(u => ({ ...u, senhaHash: undefined }));
      const headers = ['id','nome','cpf','email','telefone','dataNascimento','login','dataCadastro'];
      H.downloadCSV(H.toCSV(users, headers), 'usuarios.csv');
    };

    // EXPORTAR CATEGORIAS
    document.getElementById('exp-cats').onclick = () => {
      const cats = S.getCategorias();
      const rows = cats.map(c => ({ tipoOperacao: c.tipoOperacao, categoria: c.categoria, subcategorias: (c.subcategorias || []).join('; ') }));
      H.downloadCSV(H.toCSV(rows, ['tipoOperacao', 'categoria', 'subcategorias']), 'categorias.csv');
    };

    // EXPORTAR EMOÃ‡Ã•ES
    document.getElementById('exp-emocoes').onclick = () => {
      const emos = S.getEmocoes();
      const headers = ['data','hora','situacaoDescricao','emocaoSuperior','emocaoMedia','emocaoInferior','intensidade'];
      H.downloadCSV(H.toCSV(emos, headers), 'emocoes.csv');
    };

    // EXPORTAR FRASES
    document.getElementById('exp-frases').onclick = () => {
      const frases = S.getFrases();
      const rows = frases.map(f => ({
        texto: f.texto,
        autor: f.autor || '',
        categoria: f.categoria || 'Geral',
        ativo: f.ativo !== false ? 'sim' : 'nao',
      }));
      H.downloadCSV(H.toCSV(rows, ['texto', 'autor', 'categoria', 'ativo']), 'mensagens.csv');
    };

    const showMsg = (text, type) => {
      const el = document.getElementById('ie-msg');
      if (el) el.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
      setTimeout(() => { if (el) el.innerHTML = ''; }, 4000);
    };

    // IMPORTAR TRANSAÃ‡Ã•ES
    document.getElementById('imp-trans').onchange = function() {
      const file = this.files[0];
      if (!file) return;
      const inputEl = this;
      H.readFileAutoEncoding(file, (text) => {
        try {
          const expectedHeaders = ['data','tipoOperacao','categoria','subcategoria','item','valor','formaPagamento','tipo'];
          const rows = H.parseCSV(text, expectedHeaders);
          const existing = S.getTransacoes();
          let count = 0;
          rows.forEach(r => {
            if (!r.data || !r.tipoOperacao || !r.categoria) return;
            const dataISO = H.parseDateBR(r.data);
            const info = H.extrairInfoData(dataISO);
            existing.push({
              id: S._uid(), data: dataISO, dia: info.dia, mes: info.mes, ano: info.ano,
              tipoOperacao: r.tipoOperacao.trim(), categoria: r.categoria.trim(), subcategoria: (r.subcategoria || '').trim(),
              item: (r.item || '').trim(), valor: H.parseValorBR(r.valor), formaPagamento: (r.formaPagamento || '').trim(), tipo: (r.tipo || '').trim(),
            });
            count++;
          });
          S.saveTransacoes(existing);
          showMsg(`✅ ${count} transações importadas com sucesso!`, 'success');
        } catch (err) { showMsg('❌ Erro ao importar: ' + err.message, 'error'); }
      });
      inputEl.value = '';
    };

    // IMPORTAR USUÃRIOS
    document.getElementById('imp-users').onchange = function() {
      const file = this.files[0];
      if (!file) return;
      const inputEl = this;
      H.readFileAutoEncoding(file, async (text) => {
        try {
          const rows = H.parseCSV(text);
          let count = 0;
          for (const r of rows) {
            if (!r.email || !r.nome) continue;
            const pass = r.senha || '123456';
            const res = await S.createUser({
              nome: r.nome, cpf: r.cpf || '', email: r.email, telefone: r.telefone || '',
              dataNascimento: r.dataNascimento || '', login: r.login || r.email,
            }, pass);
            if (res.ok) count++;
          }
          showMsg(`✅ ${count} usuários importados!`, 'success');
        } catch (err) { showMsg('❌ Erro ao importar: ' + err.message, 'error'); }
      });
      inputEl.value = '';
    };

    // IMPORTAR FRASES
    document.getElementById('imp-frases').onchange = function() {
      const file = this.files[0];
      if (!file) return;
      const inputEl = this;
      H.readFileAutoEncoding(file, (text) => {
        try {
          const rows = H.parseCSV(text);
          const existing = S.getFrases();
          let count = 0;
          rows.forEach(r => {
            if (!r.texto) return;
            existing.push({
              id: S._uid(),
              texto: r.texto.trim(),
              autor: (r.autor || '').trim(),
              categoria: (r.categoria || 'Geral').trim(),
              ativo: (r.ativo || '').toLowerCase() !== 'nao',
            });
            count++;
          });
          S.saveFrases(existing);
          showMsg(`✅ ${count} mensagens importadas com sucesso!`, 'success');
        } catch (err) { showMsg('❌ Erro ao importar: ' + err.message, 'error'); }
      });
      inputEl.value = '';
    };

    // LIMPAR BASES
    const clearBase = (label, countFn, clearFn) => {
      const n = countFn();
      if (!confirm(`Deseja realmente APAGAR todos os registros de "${label}"?\n\n${typeof n === 'number' ? n + ' registro(s) serão removidos.' : ''}\n\nEsta ação não pode ser desfeita.`)) return;
      clearFn();
      showMsg(`✅ Base "${label}" limpa com sucesso!`, 'success');
    };

    const btnClearTrans = document.getElementById('clear-trans');
    if (btnClearTrans) btnClearTrans.onclick = () =>
      clearBase('Transações', () => S.getTransacoes().length, () => S.saveTransacoes([]));
    const btnClearEmocoes = document.getElementById('clear-emocoes');
    if (btnClearEmocoes) btnClearEmocoes.onclick = () =>
      clearBase('Registros de Emoções', () => S.getEmocoes().length, () => S.saveEmocoes([]));
    const btnClearAgenda = document.getElementById('clear-agenda');
    if (btnClearAgenda) btnClearAgenda.onclick = () =>
      clearBase('Agenda', () => S.getCompromissos().length, () => S.saveCompromissos([]));
    const btnClearImc = document.getElementById('clear-imc');
    if (btnClearImc) btnClearImc.onclick = () =>
      clearBase('IMC', () => '', () => S.saveIMC({ peso: 0, altura: 0 }));
    const btnClearFrases = document.getElementById('clear-frases');
    if (btnClearFrases) btnClearFrases.onclick = () =>
      clearBase('Mensagens', () => S.getFrases().length, () => S.saveFrases([]));
    const btnClearHabDef = document.getElementById('clear-habitos-def');
    if (btnClearHabDef) btnClearHabDef.onclick = () =>
      clearBase('Hábitos (Definições + Registros)', () => S.getHabitos().length + S.getRegistrosHabitos().length, () => { S.saveHabitos([]); S.saveRegistrosHabitos([]); });
    const btnClearRegHab = document.getElementById('clear-reg-hab');
    if (btnClearRegHab) btnClearRegHab.onclick = () =>
      clearBase('Registros de Hábitos', () => S.getRegistrosHabitos().length, () => S.saveRegistrosHabitos([]));
    const btnClearVirtudes = document.getElementById('clear-virtudes');
    if (btnClearVirtudes) btnClearVirtudes.onclick = () =>
      clearBase('Registros de Virtudes', () => (S.getVirtudesReg ? S.getVirtudesReg().length : 0), () => S.saveVirtudesReg && S.saveVirtudesReg([]));
    const btnClearRV = document.getElementById('clear-rodavida');
    if (btnClearRV) btnClearRV.onclick = () =>
      clearBase('Roda da Vida', () => S.getRodaVidaRegistros().length, () => S.saveRodaVidaRegistros([]));
    const btnClearDiario = document.getElementById('clear-diario');
    if (btnClearDiario) btnClearDiario.onclick = () =>
      clearBase('Diário', () => S.getDiario().length, () => S.saveDiario([]));
  };

  /* ==================== CONTATOS PESSOAIS ==================== */
  PCF.Pages.contatos = (container) => {
    let _searchTerm = '';

    const render = () => {
      const todos = S.getContatos();
      const term = _searchTerm.trim().toLowerCase();
      const contatos = term ? todos.filter(c => c.nome && c.nome.toLowerCase().includes(term)) : todos;
      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2>Contatos Pessoais</h2>
            <div class="contatos-search-wrap">
              <input type="text" id="contatos-search" class="input-search" placeholder="Buscar pelo nome" value="${H.esc(_searchTerm)}">
              <button id="btn-contatos-search" class="btn btn-secondary" title="Buscar"><i data-lucide="search"></i></button>
              ${_searchTerm ? `<button id="btn-contatos-clear" class="btn btn-secondary" title="Limpar busca"><i data-lucide="x"></i></button>` : ''}
            </div>
            <button id="btn-add-contato" class="btn btn-primary">+ Novo Contato</button>
          </div>
          <div class="table-container"><table class="table">
            <thead><tr><th>Nome</th><th class="col-hide-mobile">CPF</th><th>E-mail</th><th class="col-hide-mobile">Telefone</th><th class="col-hide-mobile">Nascimento</th><th class="col-hide-mobile">Cadastro</th><th style="width:100px">Ações</th></tr></thead>
            <tbody>${contatos.length === 0 ? `<tr><td colspan="7" class="empty-text">${term ? 'Nenhum contato encontrado para "' + H.esc(term) + '"' : 'Nenhum contato cadastrado'}</td></tr>` :
              contatos.map(c => `<tr>
                <td>${H.esc(c.nome)}</td><td class="col-hide-mobile">${H.esc(c.cpf)}</td><td>${H.esc(c.email)}</td><td class="col-hide-mobile">${H.esc(c.telefone)}</td>
                <td class="col-hide-mobile">${H.formatarData(c.dataNascimento)}</td><td class="col-hide-mobile">${H.formatarData(c.dataCadastro)}</td>
                <td>
                  <button class="btn-icon" data-edit="${c.id}" title="Editar"><i data-lucide="pencil"></i></button>
                  <button class="btn-icon btn-danger" data-del="${c.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;

      const searchInput = document.getElementById('contatos-search');
      const doSearch = () => { _searchTerm = searchInput.value; render(); };
      document.getElementById('btn-contatos-search').onclick = doSearch;
      searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
      const clearBtn = document.getElementById('btn-contatos-clear');
      if (clearBtn) clearBtn.onclick = () => { _searchTerm = ''; render(); };

      document.getElementById('btn-add-contato').onclick = () => showContatoModal();
      container.onclick = (e) => {
        if (e.target.closest('#btn-contatos-search') || e.target.closest('#btn-contatos-clear') || e.target.closest('#btn-add-contato')) return;
        const edit = e.target.closest('[data-edit]');
        if (edit) { const ct = todos.find(c => c.id === edit.dataset.edit); if (ct) showContatoModal(ct); }
        const del = e.target.closest('[data-del]');
        if (del && confirm('Remover este contato?')) { S.deleteContato(del.dataset.del); render(); }
      };
    };

    const showContatoModal = (contato) => {
      const isEdit = !!contato;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal-lg">
          <h3>${isEdit ? 'Editar' : 'Novo'} Contato</h3>
          <form id="contato-modal-form">
            <div class="form-row">
              <div class="form-group"><label>Nome Completo</label><input type="text" id="cm-nome" value="${H.esc(contato?.nome || '')}" required></div>
              <div class="form-group"><label>CPF</label><input type="text" id="cm-cpf" value="${H.esc(contato?.cpf || '')}" placeholder="000.000.000-00"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>E-mail</label><input type="email" id="cm-email" value="${H.esc(contato?.email || '')}"></div>
              <div class="form-group"><label>Telefone</label><input type="text" id="cm-tel" value="${H.esc(contato?.telefone || '')}" placeholder="(00) 00000-0000"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Data de Nascimento</label><input type="date" id="cm-nasc" value="${contato?.dataNascimento || ''}"></div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="cm-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById('cm-cpf').oninput = function() { this.value = H.formatarCPF(this.value); };
      document.getElementById('cm-tel').oninput = function() { this.value = H.formatarTelefone(this.value); };
      document.getElementById('cm-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

      document.getElementById('contato-modal-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
          nome: document.getElementById('cm-nome').value.trim(),
          cpf: document.getElementById('cm-cpf').value.trim(),
          email: document.getElementById('cm-email').value.trim(),
          telefone: document.getElementById('cm-tel').value.trim(),
          dataNascimento: document.getElementById('cm-nasc').value,
        };
        if (isEdit) S.updateContato(contato.id, data);
        else S.addContato(data);
        overlay.remove();
        render();
      };
    };
    render();
  };

  /* ==================== DIÃRIO ==================== */
  PCF.Pages.diario = (container) => {
    const userId = S.currentUserId();
    const KEY = `pcf_diario_${userId}`;
    const load = () => S.getDiario();
    const saveDiary = (arr) => S.saveDiario(arr);
    const fmtDate = (d) => { if (!d) return ''; const [y, m, dia] = d.split('-'); return `${dia}/${m}/${y}`; };

    let selectedDate = new Date().toISOString().slice(0, 10);
    let sugestoesTab = '';

    const render = () => {
      const TABS_SUGESTOES = S.getDiarioTabs();
      if (!TABS_SUGESTOES.find(t => t.id === sugestoesTab)) sugestoesTab = TABS_SUGESTOES[0]?.id || '';
      const today = new Date().toISOString().slice(0, 10);
      const entries = load();
      const entry = entries.find(e => e.data === selectedDate);
      const isToday = selectedDate === today;
      const sorted = [...entries].sort((a, b) => b.data.localeCompare(a.data));

      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2><i data-lucide="book-open"></i> Meu Diario</h2>
            <div class="diario-header-controls">
              <input type="date" id="diario-data" value="${selectedDate}" max="${today}">
              <button class="btn btn-secondary btn-sm" id="btn-diario-hoje">Hoje</button>
            </div>
          </div>

          <div class="diario-sugestoes">
            <div class="diario-sugestoes-header">
              <span>ðŸ’¡ <strong>SugestÃµes de reflexÃ£o</strong></span>
              <small class="text-muted">Clique em uma pergunta para inserir no diÃ¡rio</small>
            </div>
            <div class="diario-tabs-bar">
              ${TABS_SUGESTOES.map(t => `<button class="diario-tab${t.id === sugestoesTab ? ' active' : ''}" data-tab="${t.id}">${t.icon} ${t.label}</button>`).join('')}
            </div>
            ${TABS_SUGESTOES.map(t => `<ul class="diario-tab-content${t.id === sugestoesTab ? ' active' : ''}" id="tab-${t.id}">${t.perguntas.map(p => `<li class="diario-question-item" data-question="${H.esc(p)}">${H.esc(p)}</li>`).join('')}</ul>`).join('')}
          </div>

          <div class="card diario-today">
            <div class="diario-day-title">
              <h3>${isToday ? '<i data-lucide="edit-3"></i> Hoje' : '<i data-lucide="calendar"></i> ' + fmtDate(selectedDate)}</h3>
              ${entry && !isToday ? '<span class="badge badge-info">Editando registro salvo</span>' : ''}
            </div>
            <textarea id="diario-texto" class="diario-textarea" rows="8"
              placeholder="Escreva sobre este dia...">${H.esc(entry?.texto || '')}</textarea>
            <div class="diario-today-actions">
              <button id="diario-salvar" class="btn btn-primary"><i data-lucide="save"></i> Salvar</button>
              ${entry ? `<button id="diario-apagar" class="btn btn-danger"><i data-lucide="trash-2"></i> Apagar</button>` : ''}
              <span id="diario-ok" class="diario-saved-msg" style="display:none">âœ“ Salvo!</span>
            </div>
          </div>

          ${sorted.length > 0 ? `
          <h3 style="margin:24px 0 10px">ðŸ“š Dias com Registro <span class="badge badge-neutral">${sorted.length}</span></h3>
          <div class="diario-index">
            ${sorted.map(e => `
              <div class="diario-index-item ${e.data === selectedDate ? 'active' : ''}" data-goto="${e.data}">
                <span class="diario-index-date">${fmtDate(e.data)}${e.data === today ? ' <small>(hoje)</small>' : ''}</span>
                <span class="diario-index-preview">${H.esc((e.texto || '').slice(0, 90))}${(e.texto || '').length > 90 ? 'â€¦' : ''}</span>
              </div>`).join('')}
          </div>` : ''}
        </div>`;

      document.getElementById('diario-data').onchange = (e) => { selectedDate = e.target.value; render(); };
      document.getElementById('btn-diario-hoje').onclick = () => { selectedDate = today; render(); };

      document.getElementById('diario-salvar').onclick = () => {
        const texto = document.getElementById('diario-texto').value;
        const arr = load().filter(e => e.data !== selectedDate);
        if (texto.trim()) arr.push({ data: selectedDate, texto: texto.trim() });
        saveDiary(arr);
        const ok = document.getElementById('diario-ok');
        if (ok) { ok.style.display = 'inline'; setTimeout(() => { if (ok) ok.style.display = 'none'; }, 2000); }
        render();
      };

      const delBtn = document.getElementById('diario-apagar');
      if (delBtn) delBtn.onclick = () => {
        if (!confirm('Apagar este registro?')) return;
        saveDiary(load().filter(e => e.data !== selectedDate));
        render();
      };

      container.querySelectorAll('[data-goto]').forEach(item => {
        item.onclick = () => { selectedDate = item.dataset.goto; render(); };
      });

      container.querySelectorAll('.diario-tab').forEach(tab => {
        tab.onclick = () => {
          sugestoesTab = tab.dataset.tab;
          container.querySelectorAll('.diario-tab').forEach(t => t.classList.remove('active'));
          container.querySelectorAll('.diario-tab-content').forEach(p => p.classList.remove('active'));
          tab.classList.add('active');
          const panel = container.querySelector(`#tab-${sugestoesTab}`);
          if (panel) panel.classList.add('active');
        };
      });

      container.querySelectorAll('.diario-question-item').forEach(item => {
        item.onclick = () => {
          const textarea = document.getElementById('diario-texto');
          if (!textarea) return;
          const q = item.dataset.question;
          textarea.value = textarea.value.trim() ? textarea.value.trimEnd() + '\n\n' + q + '\n' : q + '\n';
          textarea.focus();
          textarea.scrollTop = textarea.scrollHeight;
        };
      });
    };

    render();
  };

  /* ==================== CONFIG DIÃRIO ==================== */
  PCF.Pages.diarioConfig = (container) => {
    const render = () => {
      const tabs = S.getDiarioTabs();
      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2><i data-lucide="settings"></i> Config. DiÃ¡rio</h2>
            <button id="btn-add-dtab" class="btn btn-primary">+ Nova Aba</button>
          </div>
          <p class="subtitle">Configure as abas e perguntas de reflexÃ£o exibidas no banner do DiÃ¡rio.</p>
          <div class="table-container"><table class="table">
            <thead><tr><th style="width:60px">Ãcone</th><th>Nome da Aba</th><th>Perguntas</th><th style="width:150px">Ações</th></tr></thead>
            <tbody>${tabs.length === 0 ? '<tr><td colspan="4" class="empty-text">Nenhuma aba configurada</td></tr>' :
              tabs.map((t, idx) => `<tr>
                <td style="font-size:1.4rem;text-align:center">${H.esc(t.icon || '')}</td>
                <td>${H.esc(t.label)}</td>
                <td><span class="badge badge-neutral">${(t.perguntas || []).length} pergunta(s)</span></td>
                <td>
                  ${idx > 0 ? `<button class="btn-icon" data-up="${idx}" title="Subir"><i data-lucide="arrow-up"></i></button>` : '<span style="display:inline-block;width:28px"></span>'}
                  ${idx < tabs.length - 1 ? `<button class="btn-icon" data-down="${idx}" title="Descer"><i data-lucide="arrow-down"></i></button>` : '<span style="display:inline-block;width:28px"></span>'}
                  <button class="btn-icon" data-edit="${idx}" title="Editar"><i data-lucide="pencil"></i></button>
                  <button class="btn-icon btn-danger" data-del="${idx}" title="Remover"><i data-lucide="trash-2"></i></button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;

      document.getElementById('btn-add-dtab').onclick = () => showTabModal();
      container.onclick = (e) => {
        const up = e.target.closest('[data-up]');
        if (up) {
          const i = parseInt(up.dataset.up);
          const arr = S.getDiarioTabs();
          [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
          S.saveDiarioTabs(arr); render(); return;
        }
        const down = e.target.closest('[data-down]');
        if (down) {
          const i = parseInt(down.dataset.down);
          const arr = S.getDiarioTabs();
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
          S.saveDiarioTabs(arr); render(); return;
        }
        const edit = e.target.closest('[data-edit]');
        if (edit) { showTabModal(S.getDiarioTabs()[parseInt(edit.dataset.edit)], parseInt(edit.dataset.edit)); return; }
        const del = e.target.closest('[data-del]');
        if (del && confirm('Remover esta aba e todas as suas perguntas?')) {
          S.saveDiarioTabs(S.getDiarioTabs().filter((_, i) => i !== parseInt(del.dataset.del)));
          render();
        }
      };
    };

    const showTabModal = (tab, idx) => {
      const isEdit = idx !== undefined;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>${isEdit ? 'Editar' : 'Nova'} Aba de ReflexÃ£o</h3>
          <form id="dtab-form">
            <div class="form-row">
              <div class="form-group" style="flex:0 0 100px"><label>Ãcone</label><input type="text" id="dtab-icon" value="${H.esc(tab?.icon || '')}" placeholder="ðŸ’¡" maxlength="4"></div>
              <div class="form-group"><label>Nome da Aba</label><input type="text" id="dtab-label" value="${H.esc(tab?.label || '')}" required placeholder="Ex: Relacionamentos"></div>
            </div>
            <div class="form-group">
              <label>Perguntas</label>
              <div id="dtab-perg-list" class="subcat-list"></div>
              <button type="button" id="btn-add-perg" class="btn btn-secondary" style="margin-top:8px">+ Pergunta</button>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="dtab-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);

      const addRow = (texto = '') => {
        const row = document.createElement('div');
        row.className = 'subcat-row';
        row.innerHTML = `<input type="text" class="dtab-perg-input" value="${H.esc(texto)}" placeholder="Escreva a pergunta..."><button type="button" class="btn-icon btn-danger" title="Remover"><i data-lucide="trash-2"></i></button>`;
        row.querySelector('.btn-danger').onclick = () => row.remove();
        document.getElementById('dtab-perg-list').appendChild(row);
      };

      (tab?.perguntas || []).forEach(p => addRow(p));
      document.getElementById('btn-add-perg').onclick = () => addRow();
      document.getElementById('dtab-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

      document.getElementById('dtab-form').onsubmit = (e) => {
        e.preventDefault();
        const novaAba = {
          id: tab?.id || S._uid(),
          icon: document.getElementById('dtab-icon').value.trim(),
          label: document.getElementById('dtab-label').value.trim(),
          perguntas: [...document.querySelectorAll('#dtab-perg-list .dtab-perg-input')]
            .map(inp => inp.value.trim()).filter(Boolean),
        };
        const arr = S.getDiarioTabs();
        if (isEdit) arr[idx] = novaAba;
        else arr.push(novaAba);
        S.saveDiarioTabs(arr);
        overlay.remove();
        render();
      };
    };

    render();
  };

  /* ==================== GERENCIAR BASES DE DADOS ==================== */
  PCF.Pages.gerenciarBases = (container) => {
    let activeTab = 'emocoes';

    const TABS = [
      { id: 'emocoes',  icon: '🧠', label: 'Emoções'      },
      { id: 'habitos',  icon: '🌱', label: 'Hábitos'      },
      { id: 'virtudes', icon: '💎', label: 'Virtudes'     },
      { id: 'rodavida', icon: '🎯', label: 'Roda da Vida' },
      { id: 'agenda',   icon: '📅', label: 'Agenda'       },
      { id: 'diario',   icon: '📖', label: 'Diário'       },
    ];

    const _fmtDate = (d) => H.formatarData ? H.formatarData(d) : (d || '—');

    /* ---- Seção: Emoções ---- */
    const renderEmocoes = () => {
      const config = S.getEmocoesConfig();
      const emocoes = [...S.getEmocoes()].reverse();
      const getCorSup = (nome) => { const s = config.find(c => c.nome === nome); return s ? s.cor : '#6b7280'; };
      const getSituacaoDescricao = (em) => em?.situacaoDescricao || '';
      return `
        <div class="gb-section">
          <div class="gb-section-header">
            <h3>🧠 Registros de Emoções <span class="badge badge-neutral">${emocoes.length}</span></h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button id="gb-add-emocao" class="btn btn-primary btn-sm">+ Novo</button>
              <button id="gb-clear-emocoes" class="btn btn-danger btn-sm"${emocoes.length === 0 ? ' disabled' : ''}>🗑 Limpar Tudo</button>
            </div>
          </div>
          ${emocoes.length === 0 ? '<p class="empty-text">Nenhum registro encontrado</p>' : `
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th>Data</th><th class="col-hide-mobile">Hora</th><th>Emoção Principal</th><th class="col-hide-mobile">Média / Inferior</th><th class="col-hide-mobile">Intensidade</th><th class="col-hide-mobile">Situação/Descrição</th><th style="width:90px">Ações</th></tr></thead>
              <tbody>
                ${emocoes.map(em => {
                  const cor = getCorSup(em.emocaoSuperior);
                  const texto = getSituacaoDescricao(em);
                  return `<tr>
                    <td>${_fmtDate(em.data)}</td>
                    <td class="col-hide-mobile">${em.hora || '—'}</td>
                    <td><span class="chip-small" style="background:${cor}22;border-color:${cor}">${H.esc(em.emocaoSuperior || '—')}</span></td>
                    <td class="col-hide-mobile">${em.emocaoMedia ? H.esc(em.emocaoMedia) : ''}${em.emocaoInferior ? ' › ' + H.esc(em.emocaoInferior) : ''}</td>
                    <td class="col-hide-mobile">${em.intensidade || '—'}/10</td>
                    <td class="col-hide-mobile">${H.esc(texto.slice(0, 40))}${texto.length > 40 ? '…' : ''}</td>
                    <td>
                      <button class="btn-icon" data-gb-edit-emo="${em.id}" title="Editar"><i data-lucide="pencil"></i></button>
                      <button class="btn-icon btn-danger" data-gb-del-emo="${em.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
        </div>`;
    };

    /* ---- Seção: Hábitos ---- */
    const renderHabitos = () => {
      const habitos = S.getHabitos();
      const registros = [...S.getRegistrosHabitos()].sort((a, b) => b.data.localeCompare(a.data));
      const habitosMap = Object.fromEntries(habitos.map(h => [h.id, h]));
      return `
        <div class="gb-section">
          <div class="gb-section-header">
            <h3>🌱 Definições de Hábitos <span class="badge badge-neutral">${habitos.length}</span></h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a href="#habitos-config" class="btn btn-secondary btn-sm">⚙️ Gerenciar</a>
              <button id="gb-clear-habitos-def" class="btn btn-danger btn-sm"${habitos.length === 0 ? ' disabled' : ''}>🗑 Limpar Definições</button>
            </div>
          </div>
          ${habitos.length === 0 ? '<p class="empty-text">Nenhum hábito definido</p>' : `
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th style="width:50px">Ícone</th><th>Nome</th><th>Categoria</th><th>Meta</th><th>Status</th><th style="width:60px">Ações</th></tr></thead>
              <tbody>
                ${habitos.map(h => `<tr>
                  <td style="text-align:center;font-size:1.3rem">${h.icone || 'â­'}</td>
                  <td><strong>${H.esc(h.nome)}</strong>${h.descricao ? `<br><small class="text-muted">${H.esc(h.descricao)}</small>` : ''}</td>
                  <td><span class="chip-small">${H.esc(h.categoria || '—')}</span></td>
                  <td>${H.esc(h.meta || '—')}</td>
                  <td><span class="tipo-badge ${h.ativo !== false ? 'receita' : 'despesa'}">${h.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
                  <td><button class="btn-icon btn-danger" data-gb-del-hab="${h.id}" title="Excluir"><i data-lucide="trash-2"></i></button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
          <hr style="margin:20px 0">
          <div class="gb-section-header">
            <h3>📋 Registros Diários de Hábitos <span class="badge badge-neutral">${registros.length}</span></h3>
            <button id="gb-clear-reg-hab" class="btn btn-danger btn-sm"${registros.length === 0 ? ' disabled' : ''}>🗑 Limpar Registros</button>
          </div>
          ${registros.length === 0 ? '<p class="empty-text">Nenhum registro diário</p>' : `
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th>Data</th><th>Hábito</th><th>Concluído</th><th class="col-hide-mobile">Momento</th><th class="col-hide-mobile">Intensidade</th><th class="col-hide-mobile">Observação</th><th style="width:60px">Ações</th></tr></thead>
              <tbody>
                ${registros.map(r => {
                  const h = habitosMap[r.habitoId];
                  return `<tr>
                    <td>${_fmtDate(r.data)}</td>
                    <td>${h ? `${h.icone || 'â­'} ${H.esc(h.nome)}` : '<em class="text-muted">Removido</em>'}</td>
                    <td>${r.completo ? '<span class="tipo-badge receita">✅ Sim</span>' : '<span class="tipo-badge despesa">❌ Não</span>'}</td>
                    <td class="col-hide-mobile">${r.momento ? H.esc(r.momento) : '—'}</td>
                    <td class="col-hide-mobile">${r.intensidade !== undefined ? r.intensidade + '%' : '—'}</td>
                    <td class="col-hide-mobile">${H.esc((r.observacao || '').slice(0, 40))}${(r.observacao || '').length > 40 ? '…' : ''}</td>
                    <td><button class="btn-icon btn-danger" data-gb-del-rh="${r.id}" title="Remover"><i data-lucide="trash-2"></i></button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
        </div>`;
    };

    /* ---- Seção: Roda da Vida ---- */
    const renderRodaVida = () => {
      const config = S.getRodaVidaConfig();
      const registros = [...S.getRodaVidaRegistros()].sort((a, b) => b.data.localeCompare(a.data));
      const allCats = config.flatMap(q => q.categorias);
      return `
        <div class="gb-section">
          <div class="gb-section-header">
            <h3>🎯 Avaliações da Roda da Vida <span class="badge badge-neutral">${registros.length}</span></h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a href="#roda-vida" class="btn btn-secondary btn-sm">+ Nova Avaliação</a>
              <button id="gb-clear-rv" class="btn btn-danger btn-sm"${registros.length === 0 ? ' disabled' : ''}>🗑 Limpar Tudo</button>
            </div>
          </div>
          ${registros.length === 0 ? '<p class="empty-text">Nenhuma avaliação registrada</p>' : `
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th>Data</th><th>Média</th>${allCats.map(c => `<th title="${H.esc(c.label)}">${c.icon}</th>`).join('')}<th style="width:60px">Ações</th></tr></thead>
              <tbody>
                ${registros.map(r => {
                  const scores = r.scores || {};
                  const vals = allCats.map(c => scores[c.id] || 0);
                  const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
                  return `<tr>
                    <td>${_fmtDate(r.data)}</td>
                    <td><strong>${avg}</strong>/10</td>
                    ${allCats.map(c => `<td style="text-align:center;font-size:.8rem">${scores[c.id] || '—'}</td>`).join('')}
                    <td><button class="btn-icon btn-danger" data-gb-del-rv="${r.id}" title="Excluir"><i data-lucide="trash-2"></i></button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
        </div>`;
    };

    /* ---- Seção: Agenda ---- */
    const renderAgenda = () => {
      const STATUS_COLORS = { 'Pendente': '#f59e0b', 'Concluído': '#16a34a', 'Cancelado': '#dc2626' };
      const compromissos = [...S.getCompromissos()].sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''));
      return `
        <div class="gb-section">
          <div class="gb-section-header">
            <h3>📅 Compromissos da Agenda <span class="badge badge-neutral">${compromissos.length}</span></h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button id="gb-add-agenda" class="btn btn-primary btn-sm">+ Novo</button>
              <button id="gb-clear-agenda" class="btn btn-danger btn-sm"${compromissos.length === 0 ? ' disabled' : ''}>🗑 Limpar Tudo</button>
            </div>
          </div>
          ${compromissos.length === 0 ? '<p class="empty-text">Nenhum compromisso cadastrado</p>' : `
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th>Compromisso</th><th>Data</th><th>Hora</th><th>Status</th><th style="width:90px">Ações</th></tr></thead>
              <tbody>
                ${compromissos.map(c => {
                  const cor = STATUS_COLORS[c.status] || '#6b7280';
                  return `<tr>
                    <td>${H.esc(c.compromisso)}</td>
                    <td>${_fmtDate(c.data)}</td>
                    <td>${c.hora || '—'}</td>
                    <td><span class="status-badge" style="background:${cor}">${H.esc(c.status || '—')}</span></td>
                    <td>
                      <button class="btn-icon" data-gb-edit-ag="${c.id}" title="Editar"><i data-lucide="pencil"></i></button>
                      <button class="btn-icon btn-danger" data-gb-del-ag="${c.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
        </div>`;
    };

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

    /* ---- Seção: Diário ---- */
    const renderDiario = () => {
      const entries = [...S.getDiario()].sort((a, b) => b.data.localeCompare(a.data));
      return `
        <div class="gb-section">
          <div class="gb-section-header">
            <h3>📖 Registros do Diário <span class="badge badge-neutral">${entries.length}</span></h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a href="#diario" class="btn btn-secondary btn-sm">✏️ Ir ao Diário</a>
              <button id="gb-clear-diario" class="btn btn-danger btn-sm"${entries.length === 0 ? ' disabled' : ''}>🗑 Limpar Tudo</button>
            </div>
          </div>
          ${entries.length === 0 ? '<p class="empty-text">Nenhum registro no diário</p>' : `
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th style="width:120px">Data</th><th>Prévia do Texto</th><th style="width:90px">Ações</th></tr></thead>
              <tbody>
                ${entries.map(e => `<tr>
                  <td><strong>${_fmtDate(e.data)}</strong></td>
                  <td>${H.esc((e.texto || '').slice(0, 120))}${(e.texto || '').length > 120 ? '…' : ''}</td>
                  <td>
                    <button class="btn-icon" data-gb-edit-diario="${H.esc(e.data)}" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon btn-danger" data-gb-del-diario="${H.esc(e.data)}" title="Remover"><i data-lucide="trash-2"></i></button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>`;
    };

    /* ---- Seção: Virtudes ---- */
    const renderVirtudes = () => {
      const virtudes = S.getVirtudesConfig ? S.getVirtudesConfig() : [];
      const regs = S.getVirtudesReg ? [...S.getVirtudesReg()].sort((a, b) => b.data.localeCompare(a.data)) : [];
      const virtMap = Object.fromEntries(virtudes.map(v => [v.id, v]));
      return `
        <div class="gb-section">
          <div class="gb-section-header">
            <h3>💎 Configurações de Virtudes <span class="badge badge-neutral">${virtudes.length}</span></h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a href="#virtudes-config" class="btn btn-secondary btn-sm">⚙️ Gerenciar</a>
            </div>
          </div>
          ${virtudes.length === 0 ? '<p class="empty-text">Nenhuma virtude configurada</p>' : `
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th>Ícone</th><th>Nome</th><th>Categoria</th><th>Ativo</th></tr></thead>
              <tbody>
                ${virtudes.map(v => `<tr>
                  <td style="text-align:center;font-size:1.2rem">${H.esc(v.icone || 'âœ¦')}</td>
                  <td><strong>${H.esc(v.nome)}</strong></td>
                  <td><span class="chip-small">${H.esc(v.categoria || '—')}</span></td>
                  <td><span class="tipo-badge ${v.ativo !== false ? 'receita' : 'despesa'}">${v.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
          <hr style="margin:20px 0">
          <div class="gb-section-header">
            <h3>📋 Registros de Virtudes <span class="badge badge-neutral">${regs.length}</span></h3>
            <button id="gb-clear-virtudes" class="btn btn-danger btn-sm"${regs.length === 0 ? ' disabled' : ''}>🗑 Limpar Registros</button>
          </div>
          ${regs.length === 0 ? '<p class="empty-text">Nenhum registro de virtude</p>' : `
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th>Data</th><th>Virtude</th><th>Categoria</th><th style="width:60px">Ações</th></tr></thead>
              <tbody>
                ${regs.map(r => {
                  const v = virtMap[r.virtudeId] || { nome: 'Removida', icone: '?', cor: '#64748b', categoria: '' };
                  return `<tr>
                    <td>${_fmtDate(r.data)}</td>
                    <td>${H.esc(v.icone || 'âœ¦')} ${H.esc(v.nome)}</td>
                    <td><span class="chip-small">${H.esc(v.categoria || '—')}</span></td>
                    <td><button class="btn-icon btn-danger" data-gb-del-vr="${r.id}" title="Remover"><i data-lucide="trash-2"></i></button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
        </div>`;
    };

    const RENDERERS = { emocoes: renderEmocoes, habitos: renderHabitos, virtudes: renderVirtudes, rodavida: renderRodaVida, agenda: renderAgenda, diario: renderDiario };

    /* ---- Render principal ---- */
    const render = () => {
      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2><i data-lucide="database"></i> Gerenciar Bases de Dados</h2>
          </div>
          <div class="gb-tabs">
            ${TABS.map(t => `<button class="gb-tab${t.id === activeTab ? ' active' : ''}" data-gbtab="${t.id}">${t.icon} ${t.label}</button>`).join('')}
          </div>
          <div id="gb-content">${RENDERERS[activeTab]?.() || ''}</div>
        </div>`;

      if (window.lucide) lucide.createIcons();

      /* ---- Troca de abas ---- */
      container.querySelectorAll('.gb-tab').forEach(btn => {
        btn.onclick = () => { activeTab = btn.dataset.gbtab; render(); };
      });

      /* ---- Botões de limpar ---- */
      const confirmClear = (label, countFn, clearFn) => {
        const n = countFn();
        if (!confirm(`Deseja realmente APAGAR todos os registros de "${label}"?\n\n${n} registro(s) serão removidos.\n\nEsta ação não pode ser desfeita.`)) return;
        clearFn();
        render();
      };

      const q = (id) => document.getElementById(id);

      if (q('gb-clear-emocoes')) q('gb-clear-emocoes').onclick = () =>
        confirmClear('Registros de Emoções', () => S.getEmocoes().length, () => S.saveEmocoes([]));
      if (q('gb-add-emocao')) q('gb-add-emocao').onclick = () => showEmoModal(null);

      if (q('gb-clear-habitos-def')) q('gb-clear-habitos-def').onclick = () =>
        confirmClear('Hábitos (definições + registros)', () => S.getHabitos().length + S.getRegistrosHabitos().length, () => { S.saveHabitos([]); S.saveRegistrosHabitos([]); });
      if (q('gb-clear-reg-hab')) q('gb-clear-reg-hab').onclick = () =>
        confirmClear('Registros Diários de Hábitos', () => S.getRegistrosHabitos().length, () => S.saveRegistrosHabitos([]));

      if (q('gb-clear-virtudes')) q('gb-clear-virtudes').onclick = () =>
        confirmClear('Registros de Virtudes', () => (S.getVirtudesReg ? S.getVirtudesReg().length : 0), () => S.saveVirtudesReg && S.saveVirtudesReg([]));

      if (q('gb-clear-rv')) q('gb-clear-rv').onclick = () =>
        confirmClear('Avaliações da Roda da Vida', () => S.getRodaVidaRegistros().length, () => S.saveRodaVidaRegistros([]));

      if (q('gb-add-agenda')) q('gb-add-agenda').onclick = () => showAgendaModal(null);
      if (q('gb-clear-agenda')) q('gb-clear-agenda').onclick = () =>
        confirmClear('Agenda', () => S.getCompromissos().length, () => S.saveCompromissos([]));

      if (q('gb-clear-diario')) q('gb-clear-diario').onclick = () =>
        confirmClear('Diário', () => S.getDiario().length, () => S.saveDiario([]));

      /* ---- Delegação de eventos nas linhas da tabela ---- */
      container.onclick = (e) => {
        /* Troca de aba */
        const tabBtn = e.target.closest('.gb-tab');
        if (tabBtn) { activeTab = tabBtn.dataset.gbtab; render(); return; }

        /* Emoções */
        const delEmo = e.target.closest('[data-gb-del-emo]');
        if (delEmo && confirm('Remover este registro de emoção?')) { S.deleteEmocao(delEmo.dataset.gbDelEmo); render(); return; }
        const editEmo = e.target.closest('[data-gb-edit-emo]');
        if (editEmo) { const em = S.getEmocoes().find(x => x.id === editEmo.dataset.gbEditEmo); if (em) showEmoModal(em); return; }

        /* Hábitos */
        const delHab = e.target.closest('[data-gb-del-hab]');
        if (delHab && confirm('Excluir este hábito e seus registros diários?')) {
          const id = delHab.dataset.gbDelHab;
          S.deleteHabito(id);
          S.saveRegistrosHabitos(S.getRegistrosHabitos().filter(r => r.habitoId !== id));
          render(); return;
        }
        const delRh = e.target.closest('[data-gb-del-rh]');
        if (delRh && confirm('Remover este registro diário?')) { S.deleteRegistroHabito(delRh.dataset.gbDelRh); render(); return; }

        /* Virtudes */
        const delVr = e.target.closest('[data-gb-del-vr]');
        if (delVr && confirm('Remover este registro de virtude?')) { S.deleteVirtudReg && S.deleteVirtudReg(delVr.dataset.gbDelVr); render(); return; }

        /* Roda da Vida */
        const delRv = e.target.closest('[data-gb-del-rv]');
        if (delRv && confirm('Excluir esta avaliação da Roda da Vida?')) { S.deleteRodaVidaRegistro(delRv.dataset.gbDelRv); render(); return; }

        /* Agenda */
        const editAg = e.target.closest('[data-gb-edit-ag]');
        if (editAg) { const c = S.getCompromissos().find(x => x.id === editAg.dataset.gbEditAg); if (c) showAgendaModal(c); return; }
        const delAg = e.target.closest('[data-gb-del-ag]');
        if (delAg && confirm('Remover este compromisso?')) { S.deleteCompromisso(delAg.dataset.gbDelAg); render(); return; }

        /* Diário */
        const editDiario = e.target.closest('[data-gb-edit-diario]');
        if (editDiario) { const date = editDiario.dataset.gbEditDiario; const entry = S.getDiario().find(x => x.data === date); showDiarioModal(date, entry?.texto || ''); return; }
        const delDiario = e.target.closest('[data-gb-del-diario]');
        if (delDiario && confirm('Remover este registro do diário?')) { S.saveDiario(S.getDiario().filter(x => x.data !== delDiario.dataset.gbDelDiario)); render(); return; }
      };
    };

    /* ---- Modal: Emoção ---- */
    const showEmoModal = (em) => {
      const isEdit = !!em;
      const config = S.getEmocoesConfig();
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal-lg">
          <h3>${isEdit ? 'Editar' : 'Novo'} Registro de Emoção</h3>
          <form id="gb-emo-form">
            <div class="form-row">
              <div class="form-group"><label>Data</label><input type="date" id="gb-emo-data" value="${em?.data || H.hoje()}" required></div>
              <div class="form-group"><label>Hora</label><input type="time" id="gb-emo-hora" value="${em?.hora || H.horaAtual()}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Emoção Principal</label>
                <select id="gb-emo-sup" required>
                  <option value="">Selecione...</option>
                  ${config.map(c => `<option value="${H.esc(c.nome)}"${em?.emocaoSuperior === c.nome ? ' selected' : ''}>${H.esc(c.nome)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group"><label>Emoção Média</label>
                <select id="gb-emo-med"><option value="">Selecione...</option>
                  ${em?.emocaoMedia ? `<option value="${H.esc(em.emocaoMedia)}" selected>${H.esc(em.emocaoMedia)}</option>` : ''}
                </select>
              </div>
              <div class="form-group"><label>Emoção Inferior</label>
                <select id="gb-emo-inf"><option value="">Selecione...</option>
                  ${em?.emocaoInferior ? `<option value="${H.esc(em.emocaoInferior)}" selected>${H.esc(em.emocaoInferior)}</option>` : ''}
                </select>
              </div>
            </div>
            <div class="form-group"><label>Intensidade: <span id="gb-emo-int-val">${em?.intensidade || 5}</span>/10</label>
              <input type="range" id="gb-emo-int" min="1" max="10" value="${em?.intensidade || 5}">
            </div>
            <div class="form-group"><label>Situação/Descrição</label><textarea id="gb-emo-situacao-descricao" rows="4">${H.esc(em?.situacaoDescricao || '')}</textarea></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="gb-emo-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);

      const supSel = document.getElementById('gb-emo-sup');
      const medSel = document.getElementById('gb-emo-med');
      const infSel = document.getElementById('gb-emo-inf');

      const populateMed = (supNome) => {
        const sup = config.find(c => c.nome === supNome);
        medSel.innerHTML = '<option value="">Selecione...</option>' + (sup?.medias || []).map(m => `<option value="${H.esc(m.nome)}">${H.esc(m.nome)}</option>`).join('');
        infSel.innerHTML = '<option value="">Selecione...</option>';
      };
      const populateInf = (supNome, medNome) => {
        const sup = config.find(c => c.nome === supNome);
        const med = sup?.medias.find(m => m.nome === medNome);
        infSel.innerHTML = '<option value="">Selecione...</option>' + (med?.inferiores || []).map(i => `<option value="${H.esc(i.nome)}">${H.esc(i.nome)}</option>`).join('');
      };

      if (em?.emocaoSuperior) {
        populateMed(em.emocaoSuperior);
        medSel.value = em.emocaoMedia || '';
        if (em.emocaoMedia) { populateInf(em.emocaoSuperior, em.emocaoMedia); infSel.value = em.emocaoInferior || ''; }
      }

      supSel.onchange = () => { populateMed(supSel.value); };
      medSel.onchange = () => { populateInf(supSel.value, medSel.value); };
      document.getElementById('gb-emo-int').oninput = function () { document.getElementById('gb-emo-int-val').textContent = this.value; };
      document.getElementById('gb-emo-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

      document.getElementById('gb-emo-form').onsubmit = (e) => {
        e.preventDefault();
        if (!supSel.value) { alert('Selecione uma emoção principal'); return; }
        const data = {
          data: document.getElementById('gb-emo-data').value,
          hora: document.getElementById('gb-emo-hora').value,
          emocaoSuperior: supSel.value,
          emocaoMedia: medSel.value,
          emocaoInferior: infSel.value,
          intensidade: parseInt(document.getElementById('gb-emo-int').value),
          situacaoDescricao: document.getElementById('gb-emo-situacao-descricao').value.trim(),
        };
        if (isEdit) S.updateEmocao(em.id, data);
        else S.addEmocao(data);
        overlay.remove();
        render();
      };
    };

    /* ---- Modal: Agenda ---- */
    const showAgendaModal = (comp) => {
      const isEdit = !!comp;
      const STATUS_OPTS = ['Pendente', 'ConcluÃ­do', 'Cancelado'];
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>${isEdit ? 'Editar' : 'Novo'} Compromisso</h3>
          <form id="gb-ag-form">
            <div class="form-group"><label>Compromisso</label><input type="text" id="gb-ag-desc" value="${H.esc(comp?.compromisso || '')}" required placeholder="DescriÃ§Ã£o do compromisso"></div>
            <div class="form-row">
              <div class="form-group"><label>Data</label><input type="date" id="gb-ag-data" value="${comp?.data || H.hoje()}" required></div>
              <div class="form-group"><label>Hora</label><input type="time" id="gb-ag-hora" value="${comp?.hora || ''}"></div>
            </div>
            <div class="form-group"><label>Status</label>
              <select id="gb-ag-status">${STATUS_OPTS.map(s => `<option value="${s}"${comp?.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="gb-ag-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar' : 'Adicionar'}</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById('gb-ag-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      document.getElementById('gb-ag-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
          compromisso: document.getElementById('gb-ag-desc').value.trim(),
          data: document.getElementById('gb-ag-data').value,
          hora: document.getElementById('gb-ag-hora').value,
          status: document.getElementById('gb-ag-status').value,
        };
        if (isCompromissoAtrasado(data.data, data.hora)) {
          alert('Data/horÃ¡rio atrasado!');
          return;
        }
        if (isEdit) S.updateCompromisso(comp.id, data);
        else S.addCompromisso(data);
        overlay.remove();
        render();
      };
    };

    /* ---- Modal: DiÃ¡rio ---- */
    const showDiarioModal = (date, texto) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal-lg">
          <h3>ðŸ“– Editar DiÃ¡rio â€” ${_fmtDate(date)}</h3>
          <form id="gb-diario-form">
            <div class="form-group">
              <label>Texto</label>
              <textarea id="gb-diario-texto" rows="12" style="width:100%;resize:vertical">${H.esc(texto)}</textarea>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="gb-diario-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById('gb-diario-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      document.getElementById('gb-diario-form').onsubmit = (e) => {
        e.preventDefault();
        const novoTexto = document.getElementById('gb-diario-texto').value.trim();
        const arr = S.getDiario().filter(x => x.data !== date);
        if (novoTexto) arr.push({ data: date, texto: novoTexto });
        S.saveDiario(arr);
        overlay.remove();
        render();
      };
    };

    render();
  };
})();
