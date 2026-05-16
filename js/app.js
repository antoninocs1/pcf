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
      id: 'financeiro', label: 'Financeiro', icon: '💰',
      items: [
        { hash: '#dashboard',  icon: '📊', label: 'Dashboard Financeiro' },
        { hash: '#inserir',    icon: '➕', label: 'Inserir Transação Financeira' },
        { hash: '#base',       icon: '🗄️', label: 'Base de Dados Financeira' },
        { hash: '#relatorios', icon: '📈', label: 'Relatório Financeiro' },
        { hash: '#ciclo',      icon: '🔄', label: '4 Forças do Dinheiro' },
        { hash: '#categorias', icon: '📁', label: 'Config. Categorias' },
      ]
    },
    {
      id: 'emocoes', label: 'Emoções', icon: '🧠',
      items: [
        { hash: '#emocoes',           icon: '🧠', label: 'Emoções' },
        { hash: '#emocoes-relatorios', icon: '📉', label: 'Relatório Emoções' },
        { hash: '#emocoes-config',    icon: '🎨', label: 'Config. Emoções' },
      ]
    },
    {
      id: 'habitos', label: 'Hábitos', icon: '🌱',
      items: [
        { hash: '#habitos',          icon: '🌱', label: 'Hábitos Diários' },
        { hash: '#habitos-mensal',   icon: '📅', label: 'Visão Mensal Hábitos' },
        { hash: '#habitos-relatorio',icon: '📊', label: 'Relatório Hábitos' },
        { hash: '#frases',           icon: '💬', label: 'Base de Mensagens' },
        { hash: '#habitos-config',   icon: '⚙️', label: 'Config. Hábitos' },
      ]
    },
    { standalone: true, hash: '#agenda',      icon: '📅', label: 'Agenda' },
    { standalone: true, hash: '#imc',         icon: '❤️', label: 'IMC' },
    { standalone: true, hash: '#usuarios',    icon: '👥', label: 'Usuários' },
    { standalone: true, hash: '#importexport',icon: '📤', label: 'Importar / Exportar' },
  ];

  const _navCollapsed = () => { try { return JSON.parse(localStorage.getItem('pcf_nav_collapsed') || '{}'); } catch { return {}; } };
  const _navSaveCollapsed = (obj) => { try { localStorage.setItem('pcf_nav_collapsed', JSON.stringify(obj)); } catch {} };

  const renderNav = () => {
    let sepDone = false;
    return navGroups.map(g => {
      if (g.standalone) {
        const sep = !sepDone ? '<hr class="nav-sep">' : '';
        sepDone = true;
        return `${sep}<a href="${g.hash}" class="nav-link" data-hash="${g.hash}"><span class="nav-icon">${g.icon}</span><span class="nav-label">${g.label}</span></a>`;
      }
      const col = _navCollapsed()[g.id] ? 'collapsed' : '';
      const links = g.items.map(n =>
        `<a href="${n.hash}" class="nav-link" data-hash="${n.hash}"><span class="nav-icon">${n.icon}</span><span class="nav-label">${n.label}</span></a>`
      ).join('');
      return `<div class="nav-group ${col}" id="navgroup-${g.id}"><button class="nav-group-header" data-group="${g.id}"><span class="nav-group-title"><span>${g.icon}</span> ${g.label}</span><span class="nav-group-arrow">▾</span></button><div class="nav-group-items">${links}</div></div>`;
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

  const renderShell = () => {
    const session = S.getSession();
    const user = S.getUserById(session.userId);
    document.getElementById('app').innerHTML = `
      <div class="app-layout">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <div class="sidebar-header-top">
              <h1>💰 PCF</h1>
              <div class="theme-toggle-wrap">
                <span class="theme-toggle-icon">🌙</span>
                <label class="theme-switch" title="Alternar tema claro/escuro">
                  <input type="checkbox" id="theme-toggle-input">
                  <span class="theme-switch-slider"></span>
                </label>
                <span class="theme-toggle-icon">☀️</span>
              </div>
            </div>
            <div class="user-info">
              <span class="user-name">${H.esc(user?.nome || session.login)}</span>
              <button id="btn-logout" class="btn-link" title="Sair">🚪 Sair</button>
            </div>
          </div>
          <nav class="sidebar-nav" id="sidebar-nav">
            ${renderNav()}
          </nav>
        </aside>
        <button id="sidebar-toggle" class="sidebar-toggle">☰</button>
        <main class="main-content" id="main-content"></main>
      </div>`;
    document.getElementById('btn-logout').onclick = () => { S.clearSession(); renderLogin(); };
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
      '#usuarios': pages.usuarios,
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
    initThemeToggle();
    initNavGroups();
    // Ativa redimensionamento automático de colunas sempre que uma nova página for renderizada
    const mc = document.getElementById('main-content');
    if (mc) {
      new MutationObserver(() => H.initResizableTables(mc)).observe(mc, { childList: true });
    }
    window.onhashchange = route;
    if (!location.hash) location.hash = '#dashboard';
    else route();
  };

  const boot = () => {
    applyTheme();
    // Garante que qualquer sessão antiga salva no localStorage seja removida
    try { localStorage.removeItem('pcf_session'); } catch {}
    if (S.getSession()) initApp();
    else renderLogin();
  };

  return { boot, route, registerChart, destroyCharts, applyTheme };
})();

document.addEventListener('DOMContentLoaded', PCF.App.boot);
