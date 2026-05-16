/* ========================================================
   PCF - pages/admin.js — Categorias CRUD, Emoções Config CRUD,
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
            <button id="btn-add-cat" class="btn btn-primary">+ Nova Categoria</button>
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
            <thead><tr><th>Tipo Operação</th><th>Categoria</th><th>Subcategorias</th><th style="width:120px">Ações</th></tr></thead>
            <tbody>${filtered.length === 0 ? '<tr><td colspan="4" class="empty-text">Nenhuma categoria</td></tr>' :
              filtered.map(c => `<tr>
                <td><span class="tipo-badge ${c.tipoOperacao.toLowerCase()}">${c.tipoOperacao}</span></td>
                <td>${H.esc(c.categoria)}</td>
                <td><div class="subcats-list">${(c.subcategorias || []).map(s => `<span class="chip-small">${H.esc(s)}</span>`).join(' ') || '<em class="text-muted">Nenhuma</em>'}</div></td>
                <td>
                  <button class="btn-icon" data-edit="${c.id}" title="Editar">✏️</button>
                  <button class="btn-icon btn-danger" data-del="${c.id}" title="Remover">🗑️</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;

      document.getElementById('cat-filtro-tipo').onchange = function() { filtroTipo = this.value; render(); };
      document.getElementById('btn-add-cat').onclick = () => showCatModal();
      container.onclick = (e) => {
        const edit = e.target.closest('[data-edit]');
        if (edit) { const cat = cats.find(c => c.id === edit.dataset.edit); if (cat) showCatModal(cat); }
        const del = e.target.closest('[data-del]');
        if (del && confirm('Remover esta categoria?')) { S.deleteCategoria(del.dataset.del); render(); }
      };
    };

    const showCatModal = (cat) => {
      const isEdit = !!cat;
      const subs = cat ? (cat.subcategorias || []).join('\n') : '';
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>${isEdit ? 'Editar' : 'Nova'} Categoria</h3>
          <form id="cat-modal-form">
            <div class="form-group"><label>Tipo de Operação</label>
              <select id="cat-m-tipo" required ${isEdit ? 'disabled' : ''}>
                <option value="DESPESA" ${cat?.tipoOperacao === 'DESPESA' ? 'selected' : ''}>DESPESA</option>
                <option value="RECEITA" ${cat?.tipoOperacao === 'RECEITA' ? 'selected' : ''}>RECEITA</option>
                <option value="INVESTIMENTO" ${cat?.tipoOperacao === 'INVESTIMENTO' ? 'selected' : ''}>INVESTIMENTO</option>
              </select>
            </div>
            <div class="form-group"><label>Nome da Categoria</label><input type="text" id="cat-m-nome" value="${H.esc(cat?.categoria || '')}" required></div>
            <div class="form-group"><label>Subcategorias (uma por linha)</label><textarea id="cat-m-subs" rows="6" placeholder="Subcategoria 1\nSubcategoria 2\n...">${H.esc(subs)}</textarea></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="cat-m-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById('cat-m-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

      document.getElementById('cat-modal-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
          tipoOperacao: document.getElementById('cat-m-tipo').value,
          categoria: document.getElementById('cat-m-nome').value.trim(),
          subcategorias: document.getElementById('cat-m-subs').value.split('\n').map(s => s.trim()).filter(Boolean),
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
            <button id="btn-add-emo-sup" class="btn btn-primary">+ Nova Emoção Superior</button>
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
                      <button class="btn-icon" data-edit-sup="${sup.id}" title="Editar">✏️</button>
                      <button class="btn-icon btn-danger" data-del-sup="${sup.id}" title="Remover">🗑️</button>
                      <button class="btn btn-sm btn-secondary" data-add-med="${sup.id}">+ Média</button>
                    </div>
                  </div>
                  ${(sup.medias || []).map(med => `
                    <div class="emo-config-sub">
                      <div class="emo-config-sub-header">
                        <div><span class="emo-color-dot" style="background:${med.cor}"></span>${H.esc(med.nome)} <span class="text-muted">(Médio)</span></div>
                        <div>
                          <button class="btn-icon" data-edit-med="${sup.id}|${med.id}" title="Editar">✏️</button>
                          <button class="btn-icon btn-danger" data-del-med="${sup.id}|${med.id}" title="Remover">🗑️</button>
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

  /* ==================== USUÁRIOS CRUD ==================== */
  PCF.Pages.usuarios = (container) => {
    const render = () => {
      const users = S.getUsers();
      container.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h2>Gerenciar Usuários</h2>
            <button id="btn-add-user" class="btn btn-primary">+ Novo Usuário</button>
          </div>
          <div class="table-container"><table class="table">
            <thead><tr><th>Nome</th><th>CPF</th><th>E-mail</th><th>Telefone</th><th>Nascimento</th><th>Login</th><th>Cadastro</th><th style="width:100px">Ações</th></tr></thead>
            <tbody>${users.length === 0 ? '<tr><td colspan="8" class="empty-text">Nenhum usuário</td></tr>' :
              users.map(u => `<tr>
                <td>${H.esc(u.nome)}</td><td>${H.esc(u.cpf)}</td><td>${H.esc(u.email)}</td><td>${H.esc(u.telefone)}</td>
                <td>${H.formatarData(u.dataNascimento)}</td><td>${H.esc(u.login)}</td><td>${H.formatarData(u.dataCadastro)}</td>
                <td>
                  <button class="btn-icon" data-edit="${u.id}" title="Editar">✏️</button>
                  <button class="btn-icon btn-danger" data-del="${u.id}" title="Remover">🗑️</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;

      document.getElementById('btn-add-user').onclick = () => showUserModal();
      container.onclick = (e) => {
        const edit = e.target.closest('[data-edit]');
        if (edit) { const u = users.find(u => u.id === edit.dataset.edit); if (u) showUserModal(u); }
        const del = e.target.closest('[data-del]');
        if (del) {
          const uid = del.dataset.del;
          if (uid === S.currentUserId()) { alert('Não é possível remover o usuário logado.'); return; }
          if (confirm('Remover este usuário e todos os seus dados?')) { S.deleteUser(uid); render(); }
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
              <div class="form-group"><label>E-mail</label><input type="email" id="um-email" value="${H.esc(user?.email || '')}" required></div>
              <div class="form-group"><label>Telefone</label><input type="text" id="um-tel" value="${H.esc(user?.telefone || '')}" placeholder="(00) 00000-0000"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Data de Nascimento</label><input type="date" id="um-nasc" value="${user?.dataNascimento || ''}"></div>
              <div class="form-group"><label>Login</label><input type="text" id="um-login" value="${H.esc(user?.login || '')}" required></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>${isEdit ? 'Nova Senha (deixe vazio para manter)' : 'Senha'}</label><input type="password" id="um-pass" ${isEdit ? '' : 'required'} minlength="4"></div>
              <div class="form-group"><label>Confirmar Senha</label><input type="password" id="um-pass2" ${isEdit ? '' : 'required'}></div>
            </div>
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

      document.getElementById('user-modal-form').onsubmit = (e) => {
        e.preventDefault();
        const errEl = document.getElementById('um-error');
        const p1 = document.getElementById('um-pass').value;
        const p2 = document.getElementById('um-pass2').value;
        if (p1 && p1 !== p2) { errEl.textContent = 'As senhas não coincidem'; errEl.style.display = 'block'; return; }

        const data = {
          nome: document.getElementById('um-nome').value.trim(),
          cpf: document.getElementById('um-cpf').value.trim(),
          email: document.getElementById('um-email').value.trim(),
          telefone: document.getElementById('um-tel').value.trim(),
          dataNascimento: document.getElementById('um-nasc').value,
          login: document.getElementById('um-login').value.trim(),
        };
        if (p1) data.senhaHash = H.hashSenha(p1);

        if (isEdit) {
          const res = S.updateUser(user.id, data);
          if (!res.ok) { errEl.textContent = res.msg; errEl.style.display = 'block'; return; }
        } else {
          if (!p1) { errEl.textContent = 'Senha é obrigatória'; errEl.style.display = 'block'; return; }
          data.senhaHash = H.hashSenha(p1);
          const res = S.createUser(data);
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
        <h2>Importar / Exportar</h2>
        <p class="subtitle">Exporte ou importe dados em formato CSV (compatível com Excel).</p>

        <div class="ie-grid">
          <div class="ie-section">
            <h3>📤 Exportar</h3>
            <div class="ie-buttons">
              <button id="exp-trans" class="btn btn-primary">Exportar Transações (CSV)</button>
              <button id="exp-users" class="btn btn-primary">Exportar Usuários (CSV)</button>
              <button id="exp-cats" class="btn btn-primary">Exportar Categorias (CSV)</button>
              <button id="exp-emocoes" class="btn btn-primary">Exportar Registros de Emoções (CSV)</button>
              <button id="exp-frases" class="btn btn-primary">Exportar Mensagens (CSV)</button>
            </div>
          </div>
          <div class="ie-section">
            <h3>📥 Importar</h3>
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
            <h3>🗑️ Limpar Bases</h3>
            <p class="text-muted">Remove todos os registros da base selecionada. Esta ação não pode ser desfeita.</p>
            <div class="ie-buttons">
              <button id="clear-trans" class="btn btn-danger">Limpar Transações</button>
              <button id="clear-emocoes" class="btn btn-danger">Limpar Registros de Emoções</button>
              <button id="clear-agenda" class="btn btn-danger">Limpar Agenda</button>
              <button id="clear-imc" class="btn btn-danger">Limpar IMC</button>
              <button id="clear-frases" class="btn btn-danger">Limpar Mensagens</button>
            </div>
          </div>
        </div>
      </div>`;

    // EXPORTAR TRANSAÇÕES
    document.getElementById('exp-trans').onclick = () => {
      const trans = S.getTransacoes();
      const headers = ['data','dia','mes','ano','tipoOperacao','categoria','subcategoria','item','valor','formaPagamento','tipo'];
      H.downloadCSV(H.toCSV(trans, headers), 'transacoes.csv');
    };

    // EXPORTAR USUÁRIOS
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

    // EXPORTAR EMOÇÕES
    document.getElementById('exp-emocoes').onclick = () => {
      const emos = S.getEmocoes();
      const headers = ['data','hora','situacao','emocaoSuperior','emocaoMedia','emocaoInferior','intensidade','descricao'];
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

    // IMPORTAR TRANSAÇÕES
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

    // IMPORTAR USUÁRIOS
    document.getElementById('imp-users').onchange = function() {
      const file = this.files[0];
      if (!file) return;
      const inputEl = this;
      H.readFileAutoEncoding(file, (text) => {
        try {
          const rows = H.parseCSV(text);
          let count = 0;
          rows.forEach(r => {
            if (!r.login || !r.nome) return;
            const res = S.createUser({
              nome: r.nome, cpf: r.cpf || '', email: r.email || '', telefone: r.telefone || '',
              dataNascimento: r.dataNascimento || '', login: r.login,
              senhaHash: r.senha ? H.hashSenha(r.senha) : H.hashSenha('1234'),
            });
            if (res.ok) count++;
          });
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
  };
})();
