/* ========================================================
   PCF - app.js — Auth, Router, Sidebar, Inicialização
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

PCF.App = (() => {
  const S = PCF.Store;
  const H = PCF.Helpers;
  let _chartInstances = [];

  /* ---- Destruir gráficos antes de trocar de página ---- */
  const destroyCharts = () => { _chartInstances.forEach(c => c.destroy()); _chartInstances = []; };
  const registerChart = (c) => { _chartInstances.push(c); return c; };

  /* ==================== AUTH ==================== */
  const renderLogin = () => {
    document.getElementById('app').innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <h1>💰 PCF</h1>
          <h2>Controle Financeiro Pessoal</h2>
          <div id="auth-tab-bar" class="auth-tabs">
            <button class="auth-tab active" data-tab="login">Entrar</button>
            <button class="auth-tab" data-tab="register">Cadastrar</button>
          </div>
          <div id="auth-content"></div>
        </div>
      </div>`;
    document.querySelectorAll('.auth-tab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        btn.dataset.tab === 'login' ? renderLoginForm() : renderRegisterForm();
      };
    });
    renderLoginForm();
  };

  const renderLoginForm = () => {
    document.getElementById('auth-content').innerHTML = `
      <form id="login-form" class="auth-form">
        <div class="form-group"><label>Usuário (Login)</label><input type="text" id="login-user" required autocomplete="username"></div>
        <div class="form-group"><label>Senha</label><input type="password" id="login-pass" required autocomplete="current-password"></div>
        <div id="login-error" class="alert alert-error" style="display:none"></div>
        <button type="submit" class="btn btn-primary btn-block">Entrar</button>
      </form>`;
    document.getElementById('login-form').onsubmit = (e) => {
      e.preventDefault();
      const login = document.getElementById('login-user').value.trim();
      const senha = H.hashSenha(document.getElementById('login-pass').value);
      const user = S.getUserByLogin(login);
      if (!user || user.senhaHash !== senha) {
        const el = document.getElementById('login-error');
        el.textContent = 'Usuário ou senha inválidos';
        el.style.display = 'block';
        return;
      }
      S.setSession(user.id, user.login);
      initApp();
    };
  };

  const renderRegisterForm = () => {
    document.getElementById('auth-content').innerHTML = `
      <form id="register-form" class="auth-form">
        <div class="form-row">
          <div class="form-group"><label>Nome Completo</label><input type="text" id="reg-nome" required></div>
          <div class="form-group"><label>CPF</label><input type="text" id="reg-cpf" placeholder="000.000.000-00" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>E-mail</label><input type="email" id="reg-email" required></div>
          <div class="form-group"><label>Telefone</label><input type="text" id="reg-tel" placeholder="(00) 00000-0000"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Data de Nascimento</label><input type="date" id="reg-nasc" required></div>
          <div class="form-group"><label>Usuário (Login)</label><input type="text" id="reg-login" required autocomplete="username"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Senha</label><input type="password" id="reg-pass" required minlength="4" autocomplete="new-password"></div>
          <div class="form-group"><label>Confirmar Senha</label><input type="password" id="reg-pass2" required autocomplete="new-password"></div>
        </div>
        <div id="reg-error" class="alert alert-error" style="display:none"></div>
        <button type="submit" class="btn btn-primary btn-block">Cadastrar</button>
      </form>`;

    document.getElementById('reg-cpf').oninput = function() { this.value = H.formatarCPF(this.value); };
    document.getElementById('reg-tel').oninput = function() { this.value = H.formatarTelefone(this.value); };

    document.getElementById('register-form').onsubmit = (e) => {
      e.preventDefault();
      const errEl = document.getElementById('reg-error');
      const p1 = document.getElementById('reg-pass').value;
      const p2 = document.getElementById('reg-pass2').value;
      if (p1 !== p2) { errEl.textContent = 'As senhas não coincidem'; errEl.style.display = 'block'; return; }
      const res = S.createUser({
        nome: document.getElementById('reg-nome').value.trim(),
        cpf: document.getElementById('reg-cpf').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        telefone: document.getElementById('reg-tel').value.trim(),
        dataNascimento: document.getElementById('reg-nasc').value,
        login: document.getElementById('reg-login').value.trim(),
        senhaHash: H.hashSenha(p1),
      });
      if (!res.ok) { errEl.textContent = res.msg; errEl.style.display = 'block'; return; }
      S.setSession(res.user.id, res.user.login);
      initApp();
    };
  };

  /* ==================== SIDEBAR ==================== */
  const navGroups = [
    {
      id: 'financeiro', label: 'Financeiro', icon: 'wallet',
      items: [
        { hash: '#dashboard',  icon: 'layout-dashboard', label: 'Dashboard Financeiro' },
        { hash: '#inserir',    icon: 'plus-circle',       label: 'Inserir Transação Financeira' },
        { hash: '#base',       icon: 'database',          label: 'Base de Dados Financeira' },
        { hash: '#relatorios', icon: 'trending-up',       label: 'Relatório Financeiro' },
        { hash: '#ciclo',      icon: 'refresh-cw',        label: '4 Forças do Dinheiro' },
        { hash: '#categorias', icon: 'folder',            label: 'Config. Categorias' },
      ]
    },
    {
      id: 'emocoes', label: 'Emoções', icon: 'brain',
      items: [
        { hash: '#emocoes',            icon: 'brain',         label: 'Emoções' },
        { hash: '#emocoes-relatorios', icon: 'trending-down', label: 'Relatório Emoções' },
        { hash: '#emocoes-config',     icon: 'palette',       label: 'Config. Emoções' },
      ]
    },
    {
      id: 'habitos', label: 'Hábitos', icon: 'sprout',
      items: [
        { hash: '#habitos',           icon: 'check-square',  label: 'Hábitos Diários' },
        { hash: '#habitos-mensal',    icon: 'calendar',      label: 'Visão Mensal Hábitos' },
        { hash: '#habitos-relatorio', icon: 'bar-chart-2',   label: 'Relatório Hábitos' },
        { hash: '#frases',            icon: 'message-square',label: 'Base de Mensagens' },
        { hash: '#habitos-config',    icon: 'settings',      label: 'Config. Hábitos' },
      ]
    },
    {
      id: 'rodavida', label: 'Roda da Vida', icon: 'target',
      items: [
        { hash: '#roda-vida',        icon: 'target',   label: 'Roda da Vida' },
        { hash: '#roda-vida-config', icon: 'settings', label: 'Config. Roda da Vida' },
      ]
    },
    {
      id: 'diario', label: 'Diário', icon: 'book-open',
      items: [
        { hash: '#diario',        icon: 'book-open', label: 'Diário' },
        { hash: '#diario-config', icon: 'settings',  label: 'Config. Diário' },
      ]
    },
    { standalone: true, hash: '#agenda',       icon: 'calendar',  label: 'Agenda' },
    { standalone: true, hash: '#imc',          icon: 'heart',     label: 'IMC' },
    { standalone: true, hash: '#contatos',     icon: 'user',      label: 'Contatos Pessoais' },
    { standalone: true, adminOnly: true, hash: '#usuarios',     icon: 'users',  label: 'Conf. Usuários' },
    { standalone: true, adminOnly: true, hash: '#importexport', icon: 'upload', label: 'Importar / Exportar' },
  ];

  const _navCollapsed = () => { try { return JSON.parse(localStorage.getItem('pcf_nav_collapsed') || '{}'); } catch { return {}; } };
  const _navSaveCollapsed = (obj) => { try { localStorage.setItem('pcf_nav_collapsed', JSON.stringify(obj)); } catch {} };

  /* Rotas que exigem perfil Administrador */
  const ADMIN_ROUTES = new Set(['#frases', '#importexport', '#usuarios', '#diario-config', '#roda-vida-config']);

  const renderNav = () => {
    const isAdmin = S.currentUserIsAdmin();
    let sepDone = false;
    return navGroups.map(g => {
      if (g.standalone) {
        if (g.adminOnly && !isAdmin) return '';
        const sep = !sepDone ? '<hr class="nav-sep">' : '';
        sepDone = true;
        return `${sep}<a href="${g.hash}" class="nav-link" data-hash="${g.hash}"><i data-lucide="${g.icon}" class="nav-icon"></i><span class="nav-label">${g.label}</span></a>`;
      }
      const visibleItems = isAdmin ? g.items : g.items.filter(n => !ADMIN_ROUTES.has(n.hash));
      if (visibleItems.length === 0) return '';
      const col = _navCollapsed()[g.id] ? 'collapsed' : '';
      const links = visibleItems.map(n =>
        `<a href="${n.hash}" class="nav-link" data-hash="${n.hash}"><i data-lucide="${n.icon}" class="nav-icon"></i><span class="nav-label">${n.label}</span></a>`
      ).join('');
      return `<div class="nav-group ${col}" id="navgroup-${g.id}"><button class="nav-group-header" data-group="${g.id}"><span class="nav-group-title"><i data-lucide="${g.icon}" class="nav-group-icon"></i> ${g.label}</span><i data-lucide="chevron-down" class="nav-group-arrow"></i></button><div class="nav-group-items">${links}</div></div>`;
    }).join('');
  };

  const initNavGroups = () => {
    document.querySelectorAll('.nav-group-header').forEach(btn => {
      btn.onclick = () => {
        const groupEl = btn.closest('.nav-group');
        groupEl.classList.toggle('collapsed');
        const stored = _navCollapsed();
        if (groupEl.classList.contains('collapsed')) stored[btn.dataset.group] = true;
        else delete stored[btn.dataset.group];
        _navSaveCollapsed(stored);
      };
    });
  };

  const applyTheme = () => {
    const t = localStorage.getItem('pcf_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  };

  const initThemeToggle = () => {
    const inp = document.getElementById('theme-toggle-input');
    if (!inp) return;
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    inp.checked = current === 'light';
    inp.onchange = () => {
      const theme = inp.checked ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('pcf_theme', theme);
    };
  };

  /* ==================== MEU PERFIL (não-admin) ==================== */
  const openMeuPerfil = () => {
    const session = S.getSession();
    const user = S.getUserById(session.userId);
    if (!user) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal-lg">
        <h3><i data-lucide="settings"></i> Meu Perfil</h3>
        <div class="form-row">
          <div class="form-group"><label>Nome Completo</label><input type="text" id="mp-nome" value="${H.esc(user.nome || '')}"></div>
          <div class="form-group"><label>CPF</label><input type="text" id="mp-cpf" value="${H.esc(user.cpf || '')}" disabled></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>E-mail</label><input type="email" id="mp-email" value="${H.esc(user.email || '')}"></div>
          <div class="form-group"><label>Telefone</label><input type="text" id="mp-tel" value="${H.esc(user.telefone || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Data de Nascimento</label><input type="date" id="mp-nasc" value="${H.esc(user.dataNascimento || '')}"></div>
        </div>
        <hr style="margin:14px 0">
        <p style="font-size:.85rem;color:var(--text-muted)">Alterar senha — deixe em branco para não alterar</p>
        <div class="form-row">
          <div class="form-group"><label>Senha Atual</label><input type="password" id="mp-pass-atual" autocomplete="current-password"></div>
          <div class="form-group"><label>Nova Senha</label><input type="password" id="mp-pass-new" autocomplete="new-password" minlength="4"></div>
          <div class="form-group"><label>Confirmar</label><input type="password" id="mp-pass-new2" autocomplete="new-password"></div>
        </div>
        <div id="mp-error" class="alert alert-error" style="display:none"></div>
        <div class="modal-actions">
          <button id="mp-cancel" class="btn btn-secondary">Cancelar</button>
          <button id="mp-save" class="btn btn-primary">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('mp-tel').oninput = function () { this.value = H.formatarTelefone(this.value); };
    const close = () => overlay.remove();
    overlay.onclick = e => { if (e.target === overlay) close(); };
    document.getElementById('mp-cancel').onclick = close;
    document.getElementById('mp-save').onclick = () => {
      const errEl = document.getElementById('mp-error');
      errEl.style.display = 'none';
      const nome = document.getElementById('mp-nome').value.trim();
      const email = document.getElementById('mp-email').value.trim();
      const tel = document.getElementById('mp-tel').value.trim();
      const nasc = document.getElementById('mp-nasc').value;
      const passAtual = document.getElementById('mp-pass-atual').value;
      const passNew = document.getElementById('mp-pass-new').value;
      const passNew2 = document.getElementById('mp-pass-new2').value;
      if (!nome) { errEl.textContent = 'Nome é obrigatório'; errEl.style.display = 'block'; return; }
      const updates = { nome, email, telefone: tel, dataNascimento: nasc };
      if (passNew || passAtual) {
        if (H.hashSenha(passAtual) !== user.senhaHash) { errEl.textContent = 'Senha atual incorreta'; errEl.style.display = 'block'; return; }
        if (passNew.length < 4) { errEl.textContent = 'Nova senha deve ter ao menos 4 caracteres'; errEl.style.display = 'block'; return; }
        if (passNew !== passNew2) { errEl.textContent = 'As senhas não coincidem'; errEl.style.display = 'block'; return; }
        updates.senhaHash = H.hashSenha(passNew);
      }
      S.updateUser({ ...user, ...updates });
      const nameEl = document.querySelector('.user-name');
      if (nameEl) nameEl.textContent = nome;
      close();
    };
  };

  const renderShell = () => {
    const session = S.getSession();
    const user = S.getUserById(session.userId);
    const isAdmin = S.currentUserIsAdmin();
    document.getElementById('app').innerHTML = `
      <div class="app-layout">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <div class="sidebar-header-top">
              <h1><i data-lucide="banknote" class="header-logo-icon"></i> PCF</h1>
              <div class="theme-toggle-wrap">
                <i data-lucide="moon" class="theme-toggle-icon"></i>
                <label class="theme-switch" title="Alternar tema claro/escuro">
                  <input type="checkbox" id="theme-toggle-input">
                  <span class="theme-switch-slider"></span>
                </label>
                <i data-lucide="sun" class="theme-toggle-icon"></i>
              </div>
            </div>
            <div class="user-info">
              <span class="user-name">${H.esc(user?.nome || session.login)}</span>
              ${!isAdmin ? '<button id="btn-meu-perfil" class="btn-link btn-gear" title="Editar meu perfil"><i data-lucide="settings"></i></button>' : ''}
              <button id="btn-logout" class="btn-link" title="Sair"><i data-lucide="log-out"></i> Sair</button>
            </div>
          </div>
          <nav class="sidebar-nav" id="sidebar-nav">
            ${renderNav()}
          </nav>
        </aside>
        <button id="sidebar-toggle" class="sidebar-toggle"><i data-lucide="menu"></i></button>
        <main class="main-content" id="main-content"></main>
      </div>`;
    document.getElementById('btn-logout').onclick = () => { S.clearSession(); renderLogin(); };
    const gearBtn = document.getElementById('btn-meu-perfil');
    if (gearBtn) gearBtn.onclick = openMeuPerfil;
    document.getElementById('sidebar-toggle').onclick = () => {
      document.getElementById('sidebar').classList.toggle('open');
    };
    document.getElementById('sidebar-nav').addEventListener('click', (e) => {
      if (e.target.closest('.nav-link')) {
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  };

  const updateActiveNav = () => {
    const hash = location.hash || '#dashboard';
    document.querySelectorAll('.nav-link').forEach(a => {
      const isActive = a.dataset.hash === hash;
      a.classList.toggle('active', isActive);
      if (isActive) {
        const group = a.closest('.nav-group');
        if (group && group.classList.contains('collapsed')) {
          group.classList.remove('collapsed');
          const stored = _navCollapsed();
          delete stored[group.id.replace('navgroup-', '')];
          _navSaveCollapsed(stored);
        }
      }
    });
  };

  /* ==================== ROUTER ==================== */
  const route = () => {
    if (!S.getSession()) { renderLogin(); return; }
    destroyCharts();
    const hash = location.hash.split('?')[0] || '#dashboard';
    // Guarda rotas exclusivas de administrador
    if (ADMIN_ROUTES.has(hash) && !S.currentUserIsAdmin()) {
      location.hash = '#dashboard';
      return;
    }
    updateActiveNav();
    const mc = document.getElementById('main-content');
    if (!mc) { renderShell(); route(); return; }

    const pages = PCF.Pages;
    const map = {
      '#dashboard': pages.dashboard,
      '#inserir': pages.inserir,
      '#base': pages.base,
      '#relatorios': pages.relatorios,
      '#ciclo': pages.ciclo,
      '#imc': pages.imc,
      '#emocoes': pages.emocoes,
      '#emocoes-relatorios': pages.emocoesRelatorios,
      '#agenda': pages.agenda,
      '#habitos': pages.habitos,
      '#habitos-mensal': pages.habitosMensal,
      '#habitos-relatorio': pages.habitosRelatorio,
      '#habitos-config': pages.habitosConfig,
      '#frases': pages.frases,
      '#categorias': pages.categorias,
      '#emocoes-config': pages.emocoesConfig,
      '#roda-vida':        pages.rodaVida,
      '#roda-vida-config': pages.rodaVidaConfig,
      '#diario': pages.diario,
      '#diario-config': pages.diarioConfig,
      '#usuarios': pages.usuarios,
      '#contatos': pages.contatos,
      '#importexport': pages.importExport,
    };
    const renderFn = map[hash] || pages.dashboard;
    if (renderFn) {
      try { renderFn(mc); }
      catch (err) {
        console.error('[PCF] Erro ao renderizar página', hash, err);
        mc.innerHTML = `<div class="page"><div class="alert alert-error">
          <strong>Erro ao carregar esta página.</strong><br>
          ${err && err.message ? err.message : err}<br>
          <small>Verifique o console para detalhes. Tente recarregar com Ctrl+F5.</small>
        </div></div>`;
      }
    }
  };

  /* ==================== INIT ==================== */
  const initApp = () => {
    if (!S.getSession()) { renderLogin(); return; }
    renderShell();
    if (window.lucide) lucide.createIcons();
    initThemeToggle();
    initNavGroups();
    // Ativa redimensionamento automático de colunas sempre que uma nova página for renderizada
    const mc = document.getElementById('main-content');
    if (mc) {
      new MutationObserver(() => {
        H.initResizableTables(mc);
        if (window.lucide) lucide.createIcons();
      }).observe(mc, { childList: true });
    }
    window.onhashchange = route;
    if (!location.hash) location.hash = '#dashboard';
    else route();
  };

  const boot = () => {
    applyTheme();
    // Cria usuário Administrador inicial se ainda não existir
    if (!S.getUserByLogin('Admin')) {
      S.createUser({
        nome: 'Administrador',
        cpf: '',
        email: '',
        telefone: '',
        dataNascimento: '',
        login: 'Admin',
        senhaHash: H.hashSenha('Silva01'),
        isAdmin: true,
      });
    }
    // Garante que qualquer sessão antiga salva no localStorage seja removida
    try { localStorage.removeItem('pcf_session'); } catch {}
    if (S.getSession()) initApp();
    else renderLogin();
  };

  return { boot, route, registerChart, destroyCharts, applyTheme };
})();

document.addEventListener('DOMContentLoaded', PCF.App.boot);
