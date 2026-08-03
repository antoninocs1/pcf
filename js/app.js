/* ========================================================
   PCF - app.js — Auth, Router, Sidebar, Inicialização
   ======================================================== */
window.PCF = window.PCF || {};
PCF.Pages = PCF.Pages || {};

PCF.App = (() => {
  const S = PCF.Store;
  const H = PCF.Helpers;
  let _chartInstances = [];
  let _homeClockInterval = null;

  /* ---- Destruir gráficos antes de trocar de página ---- */
  const destroyCharts = () => {
    _chartInstances.forEach(c => c.destroy()); _chartInstances = [];
    if (_homeClockInterval) { clearInterval(_homeClockInterval); _homeClockInterval = null; }
  };
  const registerChart = (c) => { _chartInstances.push(c); return c; };

  /* ==================== AUTH ==================== */

  const _githubSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>`;
  const _githubSvgSm = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>`;
  const _instagramSvgSm = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5zm8.93 1.35a1.07 1.07 0 1 1 0 2.14 1.07 1.07 0 0 1 0-2.14zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.8A3.2 3.2 0 1 0 12 15.2 3.2 3.2 0 0 0 12 8.8z"/></svg>`;

  const _featuresData = [
    { icon: 'wallet',        title: 'Financeiro',    desc: 'Painel, controle de transações, relatórios, categorias e análise das 4 Forças do Dinheiro.' },
    { icon: 'brain',         title: 'Emoções',        desc: 'Registro diário de emoções com relatórios gráficos e configurações personalizadas.' },
    { icon: 'check-square',  title: 'Hábitos',        desc: 'Acompanhe hábitos diários, visualização mensal e relatórios de consistência.' },
    { icon: 'list-todo',     title: 'Plano de Ação',  desc: 'Organize ações em 5W2H, acompanhe status, vincule contatos e gere lembretes na agenda.' },
    { icon: 'target',        title: 'Roda da Vida',   desc: 'Avalie e visualize as principais áreas da sua vida em um gráfico radial interativo.' },
    { icon: 'gem',           title: 'Virtudes',       desc: 'Cultive virtudes diariamente, acompanhe seu crescimento de caráter e receba sugestões integradas.' },
    { icon: 'book-open',     title: 'Diário',          desc: 'Diário pessoal para registrar reflexões, pensamentos e acompanhar sua evolução.' },
    { icon: 'calendar',      title: 'Agenda',          desc: 'Gerencie compromissos e eventos de forma prática em uma agenda interativa.' },
    { icon: 'heart',         title: 'Saúde / IMC',    desc: 'Cálculo de IMC e acompanhamento de métricas de saúde e bem-estar pessoal.' },
    { icon: 'user',          title: 'Contatos',        desc: 'Organize seus contatos pessoais com informações de acesso rápido e fácil consulta.' },
    { icon: 'milestone',     title: 'Linha do Tempo',  desc: 'Registre marcos, memórias e conquistas para visualizar sua história de vida em ordem cronológica.' },
  ];

  let _loginScreenRendered = false;
  let _sidebarKeyboardController = null;

  const renderLogin = () => {
    _loginScreenRendered = true;
    const featureCards = _featuresData.map(f => `
      <div class="landing-feature-card">
        <div class="landing-feature-icon"><i data-lucide="${f.icon}"></i></div>
        <h3>${f.title}</h3>
        <p>${f.desc}</p>
      </div>`).join('');

    const carouselHtml = `
      <section id="apresentacao-section" class="landing-section landing-carousel-section">
        <div class="landing-container landing-carousel-header">
          <span class="landing-badge">Apresentação</span>
          <h2 class="landing-section-title">Conheça o PCF</h2>
          <p class="landing-section-desc" style="margin-bottom:0">Uma visão completa do que o sistema oferece para transformar sua vida pessoal e financeira</p>
        </div>
        <div class="pcf-carousel" id="pcfCarousel">
          <div class="pcf-carousel-track" id="pcfCarouselTrack">
            <div class="pcf-carousel-slide pcf-slide-1">
              <div class="pcf-slide-body">
                <div class="pcf-slide-emoji">💰</div>
                <h2 class="pcf-slide-title">Planejamento para o Sucesso Pessoal</h2>
                <p class="pcf-slide-sub">Organize suas finanças, emoções, hábitos e projetos de vida em uma plataforma completa e integrada.</p>
                <button class="pcf-cta-btn" id="pcf-cta-login">Começar agora →</button>
              </div>
            </div>
            <div class="pcf-carousel-slide pcf-slide-2">
              <div class="pcf-slide-body">
                <h2 class="pcf-slide-title">Funções Existentes</h2>
                <p class="pcf-slide-sub">11 módulos integrados para cobrir planejamento, rotina e desenvolvimento pessoal</p>
                <div class="pcf-modules-grid">
                  <span class="pcf-module-chip">💰 Financeiro</span>
                  <span class="pcf-module-chip">🧠 Emoções</span>
                  <span class="pcf-module-chip">🌱 Hábitos</span>
                  <span class="pcf-module-chip">🗂 Plano de Ação</span>
                  <span class="pcf-module-chip">💎 Virtudes</span>
                  <span class="pcf-module-chip">🎯 Roda da Vida</span>
                  <span class="pcf-module-chip">📖 Diário</span>
                  <span class="pcf-module-chip">📅 Agenda</span>
                  <span class="pcf-module-chip">❤️ Saúde / IMC</span>
                  <span class="pcf-module-chip">👤 Contatos</span>
                  <span class="pcf-module-chip">📍 Linha do Tempo</span>
                </div>
              </div>
            </div>
            <div class="pcf-carousel-slide pcf-slide-3">
              <div class="pcf-slide-body">
                <h2 class="pcf-slide-title">Relatórios e análises</h2>
                <p class="pcf-slide-sub">Visualize sua evolução com gráficos e relatórios detalhados</p>
                <div class="pcf-reports-grid">
                  <div class="pcf-report-card"><span>📊</span><span>Painel financeiro</span></div>
                  <div class="pcf-report-card"><span>📈</span><span>Evolução de Hábitos</span></div>
                  <div class="pcf-report-card"><span>🧠</span><span>Análise de Emoções</span></div>
                  <div class="pcf-report-card"><span>💎</span><span>Sequência de virtudes</span></div>
                  <div class="pcf-report-card"><span>🎯</span><span>Histórico Roda da Vida</span></div>
                  <div class="pcf-report-card"><span>💸</span><span>4 Forças do Dinheiro</span></div>
                </div>
              </div>
            </div>
            <div class="pcf-carousel-slide pcf-slide-4">
              <div class="pcf-slide-body">
                <h2 class="pcf-slide-title">Integração entre módulos</h2>
                <p class="pcf-slide-sub">Os módulos se comunicam para enriquecer sua autoavaliação</p>
                <div class="pcf-int-diagram">
                  <div class="pcf-int-row">
                    <div class="pcf-int-node">🌱 Hábitos</div>
                    <div class="pcf-int-line">───</div>
                    <div class="pcf-int-center-node">🎯 Roda da Vida</div>
                    <div class="pcf-int-line">───</div>
                    <div class="pcf-int-node">💎 Virtudes</div>
                  </div>
                  <div class="pcf-int-arrows">↕</div>
                  <div class="pcf-int-row">
                    <div class="pcf-int-node">🧠 Emoções</div>
                    <div class="pcf-int-line">───</div>
                    <div class="pcf-int-center-node">📊 Análises</div>
                    <div class="pcf-int-line">───</div>
                    <div class="pcf-int-node">💰 Finanças</div>
                  </div>
                  <div class="pcf-int-arrows">↕</div>
                  <div class="pcf-int-row">
                    <div class="pcf-int-center-node">📍 Linha do Tempo</div>
                  </div>
                </div>
                <p class="pcf-int-note">A Linha do Tempo organiza os marcos da sua história, enquanto sugestões automáticas preenchem a Roda da Vida com base nas atividades diárias</p>
              </div>
            </div>
          </div>
          <button class="pcf-carousel-btn pcf-carousel-prev" id="pcfPrev" aria-label="Anterior">&#8249;</button>
          <button class="pcf-carousel-btn pcf-carousel-next" id="pcfNext" aria-label="Próximo">&#8250;</button>
          <div class="pcf-carousel-dots" id="pcfDots">
            <button class="pcf-dot active" data-idx="0"></button>
            <button class="pcf-dot" data-idx="1"></button>
            <button class="pcf-dot" data-idx="2"></button>
            <button class="pcf-dot" data-idx="3"></button>
          </div>
        </div>
      </section>`;

    document.getElementById('app').innerHTML = `
      <div class="landing-page">

        <header class="landing-header" id="landing-header">
          <div class="landing-header-inner">
            <a class="landing-brand" href="#inicio-section">
              <span class="landing-brand-icon">💰</span>
              <span>
                <span class="landing-brand-name">PCF</span>
                <span class="landing-brand-sub">Controle Financeiro Pessoal</span>
              </span>
            </a>
            <nav class="landing-nav" id="landing-nav">
              <a href="#inicio-section"          class="landing-nav-link active" data-section="inicio-section">Início</a>
              <a href="#apresentacao-section"    class="landing-nav-link" data-section="apresentacao-section">Apresentação</a>
              <a href="#funcionalidades-section" class="landing-nav-link" data-section="funcionalidades-section">Funcionalidades</a>
              <a href="#sobre-section"           class="landing-nav-link" data-section="sobre-section">Sobre</a>
              <span class="landing-nav-divider"></span>
              <a href="mailto:antoninocs@yahoo.com.br" class="landing-nav-contact" title="Enviar e-mail para antoninocs@yahoo.com.br">
                <i data-lucide="mail"></i>
              </a>
              <a href="https://github.com/antoninocs1" target="_blank" rel="noopener noreferrer" class="landing-nav-contact" title="Perfil no GitHub">
                ${_githubSvg}
              </a>
              <span class="landing-nav-divider"></span>
              <button id="landing-theme-toggle" class="landing-nav-contact" title="Alternar tema claro/escuro" aria-label="Alternar tema">
                <i data-lucide="sun" id="ltg-sun"></i>
                <i data-lucide="moon" id="ltg-moon"></i>
              </button>
              <button id="landing-glow-toggle" class="landing-nav-contact glow-toggle-button" title="Alternar efeito lanterna" aria-label="Alternar efeito lanterna" aria-pressed="${localStorage.getItem('pcf_particles') === '1'}">
                <i data-lucide="flashlight"></i>
              </button>
            </nav>
            <button class="landing-nav-toggle" id="landing-nav-toggle" aria-label="Abrir menu">
              <i data-lucide="menu"></i>
            </button>
          </div>
        </header>

        <section id="inicio-section" class="landing-hero">
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
          </div>
        </section>

        ${carouselHtml}

        <section id="funcionalidades-section" class="landing-section landing-features-section">
          <div class="landing-container">
            <span class="landing-badge">Funcionalidades</span>
            <h2 class="landing-section-title">Principais módulos do sistema</h2>
            <p class="landing-section-desc">Uma plataforma completa para organizar sua vida financeira, emocional e pessoal — tudo em um só lugar.</p>
            <div class="landing-features-grid">${featureCards}</div>
          </div>
        </section>

        <section id="sobre-section" class="landing-section landing-about-section">
          <div class="landing-container landing-about-inner">
            <div>
              <span class="landing-badge">Sobre</span>
              <h2 class="landing-section-title">Sobre o PCF</h2>
              <p class="landing-about-text">
                O <strong>PCF — Controle Financeiro Pessoal</strong> é uma aplicação web completa desenvolvida
                para ajudar no controle e organização da vida financeira, emocional e de bem-estar.
              </p>
              <p class="landing-about-text">
                O sistema reúne módulos integrados de finanças, hábitos, roda da vida, agenda, saúde e muito mais.
              </p>
              <div class="landing-about-contacts">
                <a href="mailto:antoninocs@yahoo.com.br" class="landing-contact-btn">
                  <i data-lucide="mail"></i> antoninocs@yahoo.com.br
                </a>
                <a href="https://github.com/antoninocs1" target="_blank" rel="noopener noreferrer" class="landing-contact-btn">
                  ${_githubSvgSm} GitHub
                </a>
                <a href="https://promoverobem.blogspot.com/" target="_blank" rel="noopener noreferrer" class="landing-contact-btn">
                  <i data-lucide="globe"></i> Blog
                </a>
                <a href="https://instagram.com/promoverobem" target="_blank" rel="noopener noreferrer" class="landing-contact-btn">
                  ${_instagramSvgSm} @promoverobem
                </a>
              </div>
            </div>
            <div class="landing-about-stats">
              <div class="landing-stat">
                <span class="landing-stat-number">11+</span>
                <span class="landing-stat-label">Módulos</span>
              </div>
              <div class="landing-stat">
                <span class="landing-stat-number">100%</span>
                <span class="landing-stat-label">Amigável</span>
              </div>
              <div class="landing-stat">
                <span class="landing-stat-number">∞</span>
                <span class="landing-stat-label">Registros</span>
              </div>
            </div>
          </div>
        </section>

        <footer class="landing-footer">
          <p>© ${new Date().getFullYear()} PCF — Controle Financeiro Pessoal &nbsp;·&nbsp; Desenvolvido por Antonino</p>
          <a href="#politica-privacidade" class="privacy-link" data-open-privacy>Política de Privacidade</a>
          <p class="landing-visit-counter"><i data-lucide="eye"></i> <span id="visit-count-label"></span></p>
        </footer>

        <div class="privacy-modal" id="privacy-modal" aria-hidden="true">
          <div class="privacy-modal-backdrop" data-close-privacy></div>
          <section class="privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-title" tabindex="-1">
            <header class="privacy-dialog-header">
              <div>
                <span class="landing-badge">Privacidade e LGPD</span>
                <h2 id="privacy-title">Política de Privacidade do PCF</h2>
                <p>Última atualização: 2 de agosto de 2026</p>
              </div>
              <button type="button" class="privacy-close" data-close-privacy aria-label="Fechar Política de Privacidade">
                <i data-lucide="x"></i>
              </button>
            </header>
            <div class="privacy-dialog-content">
              <p>Esta Política explica como o <strong>PCF — Controle Financeiro Pessoal</strong> trata seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD).</p>

              <h3>1. Dados pessoais tratados</h3>
              <p>Para criar e manter sua conta, podemos tratar <strong>nome completo, CPF, e-mail e data de nascimento</strong>. O telefone, quando informado, é opcional. Também são armazenados os conteúdos que você registra nos módulos do PCF e dados técnicos essenciais para autenticação e funcionamento da aplicação.</p>

              <h3>2. Como usamos os dados</h3>
              <p>Os dados são utilizados para identificar e autenticar o usuário, criar e administrar a conta, personalizar funcionalidades, manter a segurança, prestar suporte e permitir o uso dos recursos de planejamento financeiro e pessoal.</p>

              <h3>3. Bases legais</h3>
              <p>O tratamento ocorre principalmente para executar os serviços solicitados pelo usuário e cumprir obrigações legais ou regulatórias. Quando aplicável, poderá se basear no legítimo interesse, respeitados os direitos e as expectativas do titular, ou em seu consentimento.</p>

              <h3>4. Armazenamento, segurança e compartilhamento</h3>
              <p>Os dados da conta e da aplicação são armazenados em serviços do Firebase, fornecidos pelo Google. Se você escolher “Entrar com Google”, os dados necessários à autenticação também serão tratados pelo Google. O PCF não comercializa dados pessoais. O compartilhamento fica limitado a fornecedores essenciais ao funcionamento e segurança da aplicação ou a hipóteses exigidas por lei.</p>
              <p>São adotadas medidas técnicas e administrativas razoáveis para proteger os dados contra acesso, alteração, divulgação ou destruição não autorizados. Nenhum sistema, entretanto, é totalmente isento de riscos.</p>

              <h3>5. Retenção e exclusão</h3>
              <p>Os dados são mantidos enquanto a conta estiver ativa e pelo período necessário para cumprir as finalidades desta Política e eventuais obrigações legais. Após uma solicitação de exclusão, os dados serão eliminados ou anonimizados, salvo quando sua conservação for permitida ou exigida por lei.</p>

              <h3>6. Direitos do titular</h3>
              <p>Nos termos da LGPD, você pode solicitar confirmação e acesso ao tratamento, correção de dados, anonimização, bloqueio ou eliminação, portabilidade, informação sobre compartilhamentos, revogação do consentimento e revisão de decisões automatizadas, quando aplicáveis.</p>

              <h3>7. Contato</h3>
              <p>Para exercer seus direitos, esclarecer dúvidas ou fazer solicitações sobre privacidade, entre em contato pelo e-mail <a href="mailto:antoninocs@yahoo.com.br">antoninocs@yahoo.com.br</a>. Poderemos solicitar informações adicionais para confirmar sua identidade e proteger sua conta.</p>

              <h3>8. Alterações desta Política</h3>
              <p>Esta Política poderá ser atualizada para refletir mudanças legais ou no funcionamento do PCF. A versão vigente e sua data de atualização permanecerão disponíveis nesta tela.</p>
            </div>
            <footer class="privacy-dialog-footer">
              <button type="button" class="btn btn-primary" data-close-privacy>Entendi</button>
            </footer>
          </section>
        </div>

      </div>`;

    /* Política de Privacidade — disponível antes da autenticação */
    const privacyModal = document.getElementById('privacy-modal');
    const privacyDialog = privacyModal?.querySelector('.privacy-dialog');
    let privacyTrigger = null;
    const openPrivacy = (trigger) => {
      if (!privacyModal) return;
      privacyTrigger = trigger || document.activeElement;
      privacyModal.classList.add('open');
      privacyModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('privacy-modal-open');
      requestAnimationFrame(() => privacyDialog?.focus());
    };
    const closePrivacy = () => {
      if (!privacyModal) return;
      privacyModal.classList.remove('open');
      privacyModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('privacy-modal-open');
      if (window.location.hash === '#politica-privacidade') history.replaceState(null, '', window.location.pathname + window.location.search);
      privacyTrigger?.focus?.();
    };
    document.querySelector('.landing-page').addEventListener('click', (e) => {
      const opener = e.target.closest('[data-open-privacy]');
      if (opener) {
        e.preventDefault();
        history.replaceState(null, '', '#politica-privacidade');
        openPrivacy(opener);
        return;
      }
      if (e.target.closest('[data-close-privacy]')) closePrivacy();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && privacyModal?.classList.contains('open')) closePrivacy();
    });
    if (window.location.hash === '#politica-privacidade') openPrivacy();

    /* Contador de acessos globais via Firestore */
    (async () => {
      try {
        const visitsRef = PCF.Firebase.db.collection('meta').doc('visits');
        await visitsRef.set(
          { count: firebase.firestore.FieldValue.increment(1) },
          { merge: true }
        );
        const snap = await visitsRef.get();
        const count = snap.exists ? (snap.data().count || 1) : 1;
        const el = document.getElementById('visit-count-label');
        if (el) el.textContent = count === 1 ? '1 acesso registrado' : `${count.toLocaleString('pt-BR')} acessos registrados`;
      } catch (_) {}
    })();

    /* Tabs */
    document.querySelectorAll('.auth-tab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        btn.dataset.tab === 'login' ? renderLoginForm() : renderRegisterForm();
      };
    });
    renderLoginForm();

    /* Lucide icons */
    if (window.lucide) lucide.createIcons();

    /* ---- Carrossel vanilla JS ---- */
    (function initPcfCarousel() {
      const track = document.getElementById('pcfCarouselTrack');
      const dots  = document.querySelectorAll('#pcfDots .pcf-dot');
      if (!track) return;
      const slides = track.querySelectorAll('.pcf-carousel-slide');
      const total  = slides.length;
      let current  = 0;
      let timer;

      const goTo = (idx) => {
        current = (idx + total) % total;
        track.style.transform = `translateX(-${current * 100}%)`;
        dots.forEach((d, i) => d.classList.toggle('active', i === current));
      };

      const next = () => goTo(current + 1);
      const prev = () => goTo(current - 1);

      const resetTimer = () => { clearInterval(timer); timer = setInterval(next, 5000); };

      document.getElementById('pcfNext').onclick = () => { next(); resetTimer(); };
      document.getElementById('pcfPrev').onclick = () => { prev(); resetTimer(); };
      dots.forEach(d => { d.onclick = () => { goTo(+d.dataset.idx); resetTimer(); }; });

      /* swipe touch */
      let tx = 0;
      track.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
      track.addEventListener('touchend',   e => {
        const dx = e.changedTouches[0].clientX - tx;
        if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); resetTimer(); }
      }, { passive: true });

      resetTimer();
    })();

    /* CTA do carousel → scroll ao login */
    const ctaBtn = document.getElementById('pcf-cta-login');
    if (ctaBtn) ctaBtn.onclick = () => document.getElementById('inicio-section').scrollIntoView({ behavior: 'smooth' });

    /* Toggle tema (landing) */
    const landingThemeBtn = document.getElementById('landing-theme-toggle');
    if (landingThemeBtn) {
      landingThemeBtn.onclick = () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('pcf_theme', next);
      };
    }

    /* Toggle efeito lanterna (landing) */
    const landingGlowBtn = document.getElementById('landing-glow-toggle');
    if (landingGlowBtn) {
      const setLandingGlowState = (enabled) => {
        landingGlowBtn.setAttribute('aria-pressed', String(enabled));
        landingGlowBtn.classList.toggle('active', enabled);
        landingGlowBtn.title = enabled ? 'Desativar efeito lanterna' : 'Ativar efeito lanterna';
      };
      const initiallyEnabled = localStorage.getItem('pcf_particles') === '1';
      setLandingGlowState(initiallyEnabled);
      landingGlowBtn.onclick = () => {
        const enabled = landingGlowBtn.getAttribute('aria-pressed') !== 'true';
        localStorage.setItem('pcf_particles', enabled ? '1' : '0');
        setLandingGlowState(enabled);
        if (enabled) _particleStart(); else _particleStop();
      };
      if (initiallyEnabled) _particleStart();
    }

    /* Mobile nav toggle */
    document.getElementById('landing-nav-toggle').onclick = () => {
      document.getElementById('landing-nav').classList.toggle('open');
    };

    /* Smooth scroll */
    document.querySelectorAll('.landing-nav-link').forEach(a => {
      a.onclick = (e) => {
        e.preventDefault();
        const target = document.getElementById(a.dataset.section);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
        document.getElementById('landing-nav').classList.remove('open');
      };
    });
    document.querySelector('.landing-brand').onclick = (e) => {
      e.preventDefault();
      document.getElementById('inicio-section').scrollIntoView({ behavior: 'smooth' });
    };

    /* Active nav on scroll */
    const _sections = ['inicio-section', 'apresentacao-section', 'funcionalidades-section', 'sobre-section'];
    const _obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          document.querySelectorAll('.landing-nav-link').forEach(a => {
            a.classList.toggle('active', a.dataset.section === e.target.id);
          });
        }
      });
    }, { threshold: 0.35 });
    _sections.forEach(id => { const el = document.getElementById(id); if (el) _obs.observe(el); });

    /* Header shadow on scroll */
    const _onScroll = () => {
      const h = document.getElementById('landing-header');
      if (h) h.classList.toggle('scrolled', window.scrollY > 10);
    };
    window.addEventListener('scroll', _onScroll, { passive: true });
  };

  const _googleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>`;

  const renderLoginForm = () => {
    document.getElementById('auth-content').innerHTML = `
      <form id="login-form" class="auth-form">
        <div class="form-group"><label>E-mail</label><input type="email" id="login-email" required autocomplete="email"></div>
        <div class="form-group"><label>Senha</label><input type="password" id="login-pass" required autocomplete="current-password"></div>
        <div id="login-error" class="alert alert-error" style="display:none"></div>
        <button type="submit" class="btn btn-primary btn-block">Entrar</button>
      </form>
      <div class="auth-divider"><span>ou</span></div>
      <button type="button" id="btn-google-login" class="btn btn-google btn-block">
        ${_googleSvg} Entrar com Google
      </button>
      <p class="auth-privacy">Ao acessar, você declara estar ciente da nossa <a href="#politica-privacidade" data-open-privacy>Política de Privacidade</a>.</p>`;
    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pass  = document.getElementById('login-pass').value;
      try {
        await PCF.Firebase.auth.signInWithEmailAndPassword(email, pass);
        // onAuthStateChanged cuida do loadAll + initApp
      } catch (err) {
        const el = document.getElementById('login-error');
        el.textContent = ['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].includes(err.code)
          ? 'E-mail ou senha inválidos' : err.message;
        el.style.display = 'block';
      }
    };
    document.getElementById('btn-google-login').onclick = async () => {
      const btn      = document.getElementById('btn-google-login');
      const emailEl  = document.getElementById('login-email');
      const passEl   = document.getElementById('login-pass');
      const submitEl = document.querySelector('#login-form button[type="submit"]');
      const formEl   = document.getElementById('login-form');

      const _setDisabled = (v) => {
        btn.disabled = v;
        if (emailEl)  emailEl.disabled  = v;
        if (passEl)   passEl.disabled   = v;
        if (submitEl) submitEl.disabled = v;
      };

      /* Mostra overlay sobre o formulário de e-mail/senha */
      let overlay = document.getElementById('google-auth-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'google-auth-overlay';
        overlay.innerHTML = `
          <div class="google-auth-overlay-inner">
            <div class="spinner" style="width:22px;height:22px;border-width:3px"></div>
            <span>Aguardando autenticação Google…</span>
          </div>`;
        if (formEl) formEl.style.position = 'relative';
        if (formEl) formEl.appendChild(overlay);
      }
      overlay.style.display = 'flex';

      _setDisabled(true);
      btn.innerHTML = `${_googleSvg} <span>Aguarde…</span>`;

      const res = await S.loginWithGoogle();

      /* Remove overlay e reativa se falhou */
      overlay.style.display = 'none';
      if (res.ok || res.msg === '') return; // onAuthStateChanged cuida do restante
      _setDisabled(false);
      btn.innerHTML = `${_googleSvg} Entrar com Google`;
      const el = document.getElementById('login-error');
      el.textContent = res.msg;
      el.style.display = 'block';
    };
  };

  const renderRegisterForm = () => {
    document.getElementById('auth-content').innerHTML = `
      <form id="register-form" class="auth-form">
        <div class="form-row">
          <div class="form-group"><label>Nome completo</label><input type="text" id="reg-nome" required></div>
          <div class="form-group"><label>CPF</label><input type="text" id="reg-cpf" placeholder="Campo desabilitado" disabled aria-disabled="true" title="O CPF não pode ser informado no cadastro pessoal"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Telefone</label><input type="text" id="reg-tel" placeholder="(00) 00000-0000"></div>
          <div class="form-group"><label>Data de nascimento</label><input type="date" id="reg-nasc"></div>
        </div>
        <div class="form-group">
          <label>E-mail</label><input type="email" id="reg-email" required autocomplete="email">
        </div>
        <div class="form-row">
          <div class="form-group"><label>Senha</label><input type="password" id="reg-pass" required minlength="4" autocomplete="new-password"></div>
          <div class="form-group"><label>Confirmar Senha</label><input type="password" id="reg-pass2" required autocomplete="new-password"></div>
        </div>
        <div id="reg-error" class="alert alert-error" style="display:none"></div>
        <button type="submit" class="btn btn-primary btn-block">Cadastrar</button>
        <p class="auth-privacy">Ao se cadastrar, você declara estar ciente da nossa <a href="#politica-privacidade" data-open-privacy>Política de Privacidade</a>.</p>
      </form>`;

    document.getElementById('reg-cpf').oninput = function() { this.value = H.formatarCPF(this.value); };
    document.getElementById('reg-tel').oninput = function() { this.value = H.formatarTelefone(this.value); };

    document.getElementById('register-form').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('reg-error');
      const p1 = document.getElementById('reg-pass').value;
      const p2 = document.getElementById('reg-pass2').value;
      if (p1 !== p2) { errEl.textContent = 'As senhas não coincidem'; errEl.style.display = 'block'; return; }
      const regEmail = document.getElementById('reg-email').value.trim();
      const res = await S.registerSelf({
        nome: document.getElementById('reg-nome').value.trim(),
        cpf: document.getElementById('reg-cpf').value.trim(),
        email: regEmail,
        telefone: document.getElementById('reg-tel').value.trim(),
        dataNascimento: document.getElementById('reg-nasc').value,
        login: regEmail,
      }, p1);
      if (!res.ok) { errEl.textContent = res.msg; errEl.style.display = 'block'; return; }
      // onAuthStateChanged trata loadAll + initApp automaticamente
    };
  };

  /* ==================== HOME PAGE ==================== */
  const renderHome = (mc) => {
    const frases = S.getFrases().filter(f => f.ativo !== false && f.categoria === 'Minutos de Sabedoria');
    const randomFrase = () => frases.length
      ? frases[Math.floor(Math.random() * frases.length)]
      : { texto: 'Que este dia seja repleto de sabedoria e paz.', autor: '' };

    const modules = [
      { icon: 'wallet',       label: 'Financeiro',       hash: '#dashboard', color: '#16a34a' },
      { icon: 'brain',        label: 'Emoções',           hash: '#emocoes',   color: '#8b5cf6' },
      { icon: 'check-square', label: 'Hábitos',           hash: '#habitos',   color: '#f59e0b' },
      { icon: 'book-open',    label: 'Diário',            hash: '#diario',    color: '#3b82f6' },
      { icon: 'milestone',    label: 'Linha do Tempo',     hash: '#linha-tempo', color: '#d97706' },
      { icon: 'list-todo',    label: 'Plano de Ação',     hash: '#plano-acao', color: '#0f766e' },
      { icon: 'calendar',     label: 'Agenda',            hash: '#agenda',    color: '#06b6d4' },
      { icon: 'target',       label: 'Roda da Vida',      hash: '#roda-vida', color: '#ec4899' },
      { icon: 'gem',          label: 'Virtudes',          hash: '#virtudes',  color: '#7c3aed' },
      { icon: 'heart',        label: 'IMC',               hash: '#imc',       color: '#dc2626' },
      { icon: 'users',        label: 'Contatos Pessoais', hash: '#contatos',  color: '#64748b' },
    ];

    const dateStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const frase = randomFrase();

    mc.innerHTML = `
      <div class="page home-page">
        <div class="home-banner">
          <div class="home-clock" id="home-clock"></div>
          <div class="home-date">${H.esc(dateStr.charAt(0).toUpperCase() + dateStr.slice(1))}</div>
          <div class="home-message-wrap">
            <div class="home-message-content">
              <i data-lucide="sparkles" class="home-message-icon"></i>
              <div class="home-message-body">
                <p class="home-message-text" id="home-msg-text"><span class="home-message-cat">Minutos de Sabedoria</span> — ${H.esc(frase.texto)}</p>
                <p class="home-message-author" id="home-msg-author">${frase.autor ? '— ' + H.esc(frase.autor) : ''}</p>
              </div>
            </div>
            <button class="home-msg-refresh" id="home-msg-refresh" title="Outra mensagem aleatória">
              <i data-lucide="refresh-cw"></i>
            </button>
          </div>
        </div>
        <div class="home-modules-title">Módulos</div>
        <div class="home-modules-grid">
          ${modules.map(m => `
            <a href="${m.hash}" class="home-module-btn" style="--module-color:${m.color}">
              <span class="home-module-icon"><i data-lucide="${m.icon}"></i></span>
              <span class="home-module-label">${m.label}</span>
            </a>`).join('')}
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons();

    if (_homeClockInterval) { clearInterval(_homeClockInterval); _homeClockInterval = null; }
    const tick = () => {
      const el = document.getElementById('home-clock');
      if (!el) { clearInterval(_homeClockInterval); _homeClockInterval = null; return; }
      el.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    tick();
    _homeClockInterval = setInterval(tick, 1000);

    document.getElementById('home-msg-refresh').onclick = () => {
      const f = randomFrase();
      const textEl = document.getElementById('home-msg-text');
      const authEl = document.getElementById('home-msg-author');
      if (textEl) textEl.innerHTML = `<span class="home-message-cat">Minutos de Sabedoria</span> \u2014 ${H.esc(f.texto)}`;
      if (authEl) authEl.textContent = f.autor ? '— ' + f.autor : '';
    };
  };

  /* ==================== SIDEBAR ==================== */
  const navGroups = [
    { standalone: true, hash: '#home', icon: 'home', label: 'Início' },
    { standalone: true, hash: '#linha-tempo', icon: 'milestone', label: 'Linha do Tempo' },
    {
      id: 'financeiro', label: 'Financeiro', icon: 'wallet',
      items: [
        { hash: '#dashboard',  icon: 'layout-dashboard', label: 'Painel financeiro' },
        { hash: '#inserir',    icon: 'plus-circle',       label: 'Inserir Transação Financeira' },
        { hash: '#base',       icon: 'database',          label: 'Base de Dados Financeira' },
        { hash: '#relatorios', icon: 'trending-up',       label: 'Relatório financeiro' },
        { hash: '#ciclo',      icon: 'refresh-cw',        label: '4 Forças do Dinheiro' },
        { hash: '#categorias', icon: 'folder',            label: 'Configuração de categorias' },
      ]
    },
    {
      id: 'emocoes', label: 'Emoções', icon: 'brain',
      items: [
        { hash: '#emocoes',            icon: 'brain',         label: 'Emoções' },
        { hash: '#emocoes-relatorios', icon: 'trending-down', label: 'Relatório de emoções' },
        { hash: '#emocoes-config',     icon: 'palette',       label: 'Configuração de emoções' },
      ]
    },
    {
      id: 'habitos', label: 'Hábitos', icon: 'sprout',
      items: [
        { hash: '#habitos',           icon: 'check-square',  label: 'Hábitos diários' },
        { hash: '#habitos-mensal',    icon: 'calendar',      label: 'Visão mensal dos hábitos' },
        { hash: '#habitos-relatorio', icon: 'bar-chart-2',   label: 'Relatório de hábitos' },
        { hash: '#frases',            icon: 'message-square',label: 'Base de Mensagens' },
        { hash: '#habitos-config',    icon: 'settings',      label: 'Configuração de hábitos' },
      ]
    },
    {
      id: 'virtudes', label: 'Virtudes', icon: 'gem',
      items: [
        { hash: '#virtudes',           icon: 'gem',        label: 'Virtudes Diárias' },
        { hash: '#virtudes-relatorio', icon: 'bar-chart-2',label: 'Relatório de virtudes' },
        { hash: '#virtudes-base',      icon: 'database',   label: 'Base de Virtudes' },
        { hash: '#virtudes-config',    icon: 'settings',   label: 'Configuração de virtudes' },
      ]
    },
    {
      id: 'rodavida', label: 'Roda da Vida', icon: 'target',
      items: [
        { hash: '#roda-vida',        icon: 'target',   label: 'Roda da Vida' },
        { hash: '#roda-vida-config', icon: 'settings', label: 'Configuração da Roda da Vida' },
      ]
    },
    {
      id: 'diario', label: 'Diário', icon: 'book-open',
      items: [
        { hash: '#diario',        icon: 'book-open', label: 'Diário' },
        { hash: '#diario-config', icon: 'settings',  label: 'Configuração do diário' },
      ]
    },
    {
      id: 'planoacao', label: 'Plano de Ação', icon: 'list-todo',
      items: [
        { hash: '#plano-acao', icon: 'list-todo', label: 'Plano de Ação 5W2H' },
      ]
    },
    { standalone: true, hash: '#agenda',       icon: 'calendar',  label: 'Agenda' },
    { standalone: true, hash: '#imc',          icon: 'heart',     label: 'IMC' },
    { standalone: true, hash: '#contatos',     icon: 'user',      label: 'Contatos Pessoais' },
    { standalone: true, adminOnly: true, hash: '#usuarios',       icon: 'users',    label: 'Configuração de usuários' },
    { standalone: true, adminOnly: true, hash: '#gerenciar-bases', icon: 'database', label: 'Gerenciar Bases de Dados' },
    { standalone: true, adminOnly: true, hash: '#importexport',    icon: 'upload',   label: 'Importar / Exportar' },
  ];

  const _navExpanded = () => { try { return JSON.parse(localStorage.getItem('pcf_nav_expanded') || '{}'); } catch { return {}; } };
  const _navSaveExpanded = (obj) => { try { localStorage.setItem('pcf_nav_expanded', JSON.stringify(obj)); } catch {} };

  /* Rotas que exigem perfil Administrador */
  const ADMIN_ROUTES = new Set(['#frases', '#importexport', '#usuarios', '#diario-config', '#roda-vida-config', '#gerenciar-bases']);

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
      const col = _navExpanded()[g.id] ? '' : 'collapsed';
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
        const stored = _navExpanded();
        if (groupEl.classList.contains('collapsed')) delete stored[btn.dataset.group];
        else stored[btn.dataset.group] = true;
        _navSaveExpanded(stored);
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
        <h3><i data-lucide="settings"></i> Meu perfil</h3>
        <div class="form-row">
          <div class="form-group"><label>Nome completo</label><input type="text" id="mp-nome" value="${H.esc(user.nome || '')}"></div>
          <div class="form-group"><label>CPF</label><input type="text" id="mp-cpf" value="${H.esc(user.cpf || '')}" disabled></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>E-mail</label><input type="email" id="mp-email" value="${H.esc(user.email || '')}"></div>
          <div class="form-group"><label>Telefone</label><input type="text" id="mp-tel" value="${H.esc(user.telefone || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Data de nascimento</label><input type="date" id="mp-nasc" value="${H.esc(user.dataNascimento || '')}"></div>
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
      if (passNew) {
        if (passNew.length < 6) { errEl.textContent = 'Nova senha deve ter ao menos 6 caracteres'; errEl.style.display = 'block'; return; }
        if (passNew !== passNew2) { errEl.textContent = 'As senhas não coincidem'; errEl.style.display = 'block'; return; }
        updates.newPassword = passNew;
      }
      S.updateUser(session.userId, updates).then(() => {
        const nameEl = document.querySelector('.user-name');
        if (nameEl) nameEl.textContent = nome;
        close();
      }).catch(err => {
        errEl.textContent = err.message || 'Erro ao salvar'; errEl.style.display = 'block';
      });
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
              <div class="sidebar-controls">
                <div class="theme-toggle-wrap">
                  <i data-lucide="moon" class="theme-toggle-icon"></i>
                  <label class="theme-switch" title="Alternar tema claro/escuro">
                    <input type="checkbox" id="theme-toggle-input">
                    <span class="theme-switch-slider"></span>
                  </label>
                  <i data-lucide="sun" class="theme-toggle-icon"></i>
                </div>
                <button id="particle-toggle-button" class="glow-toggle-button" title="Alternar efeito lanterna" aria-label="Alternar efeito lanterna" aria-pressed="${localStorage.getItem('pcf_particles') === '1'}">
                  <i data-lucide="flashlight"></i>
                </button>
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
        <button id="sidebar-backdrop" class="sidebar-backdrop" type="button" aria-label="Fechar menu" tabindex="-1"></button>
        <button id="sidebar-toggle" class="sidebar-toggle" type="button" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false"><i data-lucide="menu"></i></button>
        <button id="btn-home-back" class="btn-home-back" title="Tela Inicial"><i data-lucide="home"></i></button>
        <main class="main-content" id="main-content"></main>
      </div>`;
    document.getElementById('btn-logout').onclick = () => { S.clearSession(); };
    // onAuthStateChanged cuidará do renderLogin após signOut
    const gearBtn = document.getElementById('btn-meu-perfil');
    if (gearBtn) gearBtn.onclick = openMeuPerfil;
    // Toggle do efeito lanterna
    const partBtn = document.getElementById('particle-toggle-button');
    if (partBtn) {
      const setGlowButtonState = (enabled) => {
        partBtn.setAttribute('aria-pressed', String(enabled));
        partBtn.title = enabled ? 'Desativar efeito lanterna' : 'Ativar efeito lanterna';
      };
      const initiallyEnabled = localStorage.getItem('pcf_particles') === '1';
      setGlowButtonState(initiallyEnabled);
      partBtn.onclick = () => {
        const enabled = partBtn.getAttribute('aria-pressed') !== 'true';
        localStorage.setItem('pcf_particles', enabled ? '1' : '0');
        setGlowButtonState(enabled);
        if (enabled) _particleStart(); else _particleStop();
      };
      if (initiallyEnabled) _particleStart();
    }
    document.getElementById('btn-home-back').onclick = () => { location.hash = '#home'; };
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const closeMobileSidebar = () => {
      sidebar.classList.remove('open');
      document.body.classList.remove('sidebar-open');
      sidebarToggle.setAttribute('aria-expanded', 'false');
      sidebarToggle.setAttribute('aria-label', 'Abrir menu');
    };
    sidebarToggle.onclick = () => {
      const isOpen = sidebar.classList.toggle('open');
      document.body.classList.toggle('sidebar-open', isOpen);
      sidebarToggle.setAttribute('aria-expanded', String(isOpen));
      sidebarToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
    };
    document.getElementById('sidebar-backdrop').onclick = closeMobileSidebar;
    _sidebarKeyboardController?.abort();
    _sidebarKeyboardController = new AbortController();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) closeMobileSidebar();
    }, { signal: _sidebarKeyboardController.signal });
    document.getElementById('sidebar-nav').addEventListener('click', (e) => {
      if (e.target.closest('.nav-link')) {
        closeMobileSidebar();
      }
    });
  };

  const updateActiveNav = () => {
    const hash = location.hash || '#home';
    document.querySelectorAll('.nav-link').forEach(a => {
      const isActive = a.dataset.hash === hash;
      a.classList.toggle('active', isActive);
      if (isActive) {
        const group = a.closest('.nav-group');
        if (group && group.classList.contains('collapsed')) {
          group.classList.remove('collapsed');
          const stored = _navExpanded();
          stored[group.id.replace('navgroup-', '')] = true;
          _navSaveExpanded(stored);
        }
      }
    });
    const backBtn = document.getElementById('btn-home-back');
    if (backBtn) backBtn.style.display = hash === '#home' ? 'none' : '';
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
      '#home': (mc) => renderHome(mc),
      '#dashboard': pages.dashboard,
      '#inserir': pages.inserir,
      '#base': pages.base,
      '#relatorios': pages.relatorios,
      '#ciclo': pages.ciclo,
      '#imc': pages.imc,
      '#emocoes': pages.emocoes,
      '#emocoes-relatorios': pages.emocoesRelatorios,
      '#agenda': pages.agenda,
      '#plano-acao': pages.planoAcao,
      '#habitos': pages.habitos,
      '#habitos-mensal': pages.habitosMensal,
      '#habitos-relatorio': pages.habitosRelatorio,
      '#habitos-config': pages.habitosConfig,
      '#frases': pages.frases,
      '#categorias': pages.categorias,
      '#emocoes-config': pages.emocoesConfig,
      '#roda-vida':        pages.rodaVida,
      '#roda-vida-config': pages.rodaVidaConfig,
      '#virtudes':           pages.virtudes,
      '#virtudes-relatorio': pages.virtudesRelatorio,
      '#virtudes-base':      pages.virtudesBase,
      '#virtudes-config':    pages.virtudesConfig,
      '#diario': pages.diario,
      '#linha-tempo': pages.linhaTempo,
      '#diario-config': pages.diarioConfig,
      '#usuarios': pages.usuarios,
      '#contatos': pages.contatos,
      '#importexport': pages.importExport,
      '#gerenciar-bases': pages.gerenciarBases,
    };
    const renderFn = map[hash] || ((mc) => renderHome(mc));
    if (renderFn) {
      try {
        renderFn(mc);
        window.scrollTo(0, 0);
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, 0)));
      }
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

  /* ==================== GLOBAL ALERTAS ==================== */
  
  let _globalAlertInterval = null;
  let _agendaChangeListenerBound = false;

  const getCompromissoAvisoChave = (compromisso) =>
    `${compromisso.id}|${compromisso.data || ''}|${compromisso.hora || ''}`;

  const getCompromissoDateTime = (compromisso) => {
    if (!compromisso.data) return null;
    if (!compromisso.hora) return new Date(`${compromisso.data}T00:00:00`);
    const hora = compromisso.hora.length === 5 ? `${compromisso.hora}:00` : compromisso.hora;
    return new Date(`${compromisso.data}T${hora}`);
  };

  const getCompromissoSortValue = (compromisso) => {
    const dateTime = getCompromissoDateTime(compromisso);
    if (!dateTime || Number.isNaN(dateTime.getTime())) return Number.MAX_SAFE_INTEGER;
    return dateTime.getTime();
  };

  const getCompromissoUrgente = (compromisso, agora = new Date()) => {
    if (compromisso.status !== 'Pendente') return null;

    const hj = agora.toISOString().split('T')[0];
    if (compromisso.hora) {
      const compDateTime = getCompromissoDateTime(compromisso);
      if (!compDateTime || Number.isNaN(compDateTime.getTime())) return null;
      if (compDateTime <= agora) return 'agora';
      return null;
    }

    if (compromisso.data < hj) return 'atrasado';
    return null;
  };

  const markCompromissoAlertShown = (compromisso) => {
    const chave = getCompromissoAvisoChave(compromisso);
    const atual = S.getCompromissos().find(c => c.id === compromisso.id);
    if (!atual || atual.ultimoAvisoChave === chave) return;
    S.updateCompromisso(compromisso.id, { ultimoAvisoChave: chave });
  };

  const getPlanoAcaoAvisoChave = (acao) =>
    `${acao.id}|${acao.whenDate || ''}|${acao.whenTime || ''}|${acao.agendaAtivo ? '1' : '0'}`;

  const getPlanoAcaoDateTime = (acao) => {
    if (!acao.whenDate) return null;
    if (!acao.whenTime) return new Date(`${acao.whenDate}T00:00:00`);
    const hora = acao.whenTime.length === 5 ? `${acao.whenTime}:00` : acao.whenTime;
    return new Date(`${acao.whenDate}T${hora}`);
  };

  const getPlanoAcaoSortValue = (acao) => {
    const dateTime = getPlanoAcaoDateTime(acao);
    if (!dateTime || Number.isNaN(dateTime.getTime())) return Number.MAX_SAFE_INTEGER;
    return dateTime.getTime();
  };

  const getPlanoAcaoUrgente = (acao, agora = new Date()) => {
    if (acao.status !== 'Pendente' || !acao.agendaAtivo || !acao.whenDate) return null;
    const hj = agora.toISOString().split('T')[0];
    if (acao.whenTime) {
      const acaoDateTime = getPlanoAcaoDateTime(acao);
      if (!acaoDateTime || Number.isNaN(acaoDateTime.getTime())) return null;
      if (acaoDateTime <= agora) return 'agora';
      return null;
    }
    if (acao.whenDate < hj) return 'atrasado';
    return null;
  };

  const markPlanoAcaoAlertShown = (acao) => {
    const chave = getPlanoAcaoAvisoChave(acao);
    const atual = S.getPlanoAcoes().find(a => a.id === acao.id);
    if (!atual || atual.ultimoAvisoChave === chave) return;
    S.updatePlanoAcao(acao.id, { ultimoAvisoChave: chave });
  };

  const playCompromissoAlertSound = () => {
    try {
      const agendaConfig = S.getAgendaConfig ? S.getAgendaConfig() : { avisoSonoroAtivo: true };
      if (!agendaConfig.avisoSonoroAtivo) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.setValueAtTime(660, audioCtx.currentTime + 0.16);

      gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.36);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.38);
      oscillator.onended = () => audioCtx.close().catch(() => {});
    } catch (err) {
      console.warn('[PCF] Não foi possível reproduzir o aviso sonoro da agenda:', err);
    }
  };

  const startGlobalAlertSystem = () => {
    if (_globalAlertInterval) clearInterval(_globalAlertInterval);
    
    // Verifica alertas a cada 30 segundos
    _globalAlertInterval = setInterval(() => {
      checkGlobalAlerts();
    }, 30000);
    
    // Verifica alertas imediatamente
    checkGlobalAlerts();
  };

  const stopGlobalAlertSystem = () => {
    if (_globalAlertInterval) {
      clearInterval(_globalAlertInterval);
      _globalAlertInterval = null;
    }
  };

  const checkGlobalAlerts = () => {
    if (!S.getSession()) return;
    
    try {
      const compromissos = S.getCompromissos();
      const planoAcoes = S.getPlanoAcoes ? S.getPlanoAcoes() : [];
      if ((!compromissos || compromissos.length === 0) && (!planoAcoes || planoAcoes.length === 0)) return;

      const agora = new Date();
      const alertaCompromisso = compromissos
        .sort((a, b) => getCompromissoSortValue(a) - getCompromissoSortValue(b))
        .map(comp => ({ comp, tipo: getCompromissoUrgente(comp, agora) }))
        .find(({ comp, tipo }) =>
          (tipo === 'agora' || tipo === 'atrasado') &&
          comp.ultimoAvisoChave !== getCompromissoAvisoChave(comp)
        );

      const alertaPlanoAcao = planoAcoes
        .sort((a, b) => getPlanoAcaoSortValue(a) - getPlanoAcaoSortValue(b))
        .map(acao => ({ acao, tipo: getPlanoAcaoUrgente(acao, agora) }))
        .find(({ acao, tipo }) =>
          (tipo === 'agora' || tipo === 'atrasado') &&
          acao.ultimoAvisoChave !== getPlanoAcaoAvisoChave(acao)
        );

      const compromissoSort = alertaCompromisso ? getCompromissoSortValue(alertaCompromisso.comp) : Number.MAX_SAFE_INTEGER;
      const planoSort = alertaPlanoAcao ? getPlanoAcaoSortValue(alertaPlanoAcao.acao) : Number.MAX_SAFE_INTEGER;

      if (!alertaCompromisso && !alertaPlanoAcao) return;

      if (compromissoSort <= planoSort) {
        markCompromissoAlertShown(alertaCompromisso.comp);
        showCompromissoModalGlobal(alertaCompromisso.comp, alertaCompromisso.tipo);
        return;
      }

      markPlanoAcaoAlertShown(alertaPlanoAcao.acao);
      showPlanoAcaoModalGlobal(alertaPlanoAcao.acao, alertaPlanoAcao.tipo);
    } catch (err) {
      console.error('[PCF] Erro ao verificar alertas globais:', err);
    }
  };

  const showCompromissoModalGlobal = (compromisso, tipo) => {
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
    playCompromissoAlertSound();

    // Botão OK
    document.getElementById('compromisso-ok').onclick = () => {
      S.updateCompromisso(compromisso.id, { status: 'Concluído' });
      overlay.remove();
      setTimeout(checkGlobalAlerts, 200);
    };

    // Botão Cancelar
    document.getElementById('compromisso-cancelar').onclick = () => {
      S.updateCompromisso(compromisso.id, { status: 'Cancelado' });
      overlay.remove();
      setTimeout(checkGlobalAlerts, 200);
    };

    // Fechar ao clicar fora
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    };
  };

  const showPlanoAcaoModalGlobal = (acao, tipo) => {
    const existingModals = document.querySelectorAll('.compromisso-modal');
    existingModals.forEach(modal => modal.remove());

    const contato = (S.getContatos ? S.getContatos() : []).find(c => c.id === acao.whoContactId);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay compromisso-modal';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${tipo === 'atrasado' ? 'Aviso de ação em atraso!' : 'Aviso do Plano de Ação!'}</h3>
        <div class="modal-body">
          <p><strong>O quê?</strong></p>
          <p>${H.esc(acao.what || '')}</p>
          ${acao.why ? `<p><strong>Por quê?</strong></p><p>${H.esc(acao.why)}</p>` : ''}
          ${contato ? `<p><strong>Quem?</strong></p><p>${H.esc(contato.nome)}</p>` : ''}
          ${acao.how ? `<p><strong>Como?</strong></p><p>${H.esc(acao.how)}</p>` : ''}
          <p><strong>Quando?</strong></p>
          <p>${H.formatarData(acao.whenDate)} ${acao.whenTime || ''}</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="planoacao-cancelar">Cancelar</button>
          <button class="btn btn-primary" id="planoacao-ok">Concluir</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    playCompromissoAlertSound();

    document.getElementById('planoacao-ok').onclick = () => {
      S.updatePlanoAcao(acao.id, { status: 'Concluído' });
      overlay.remove();
      setTimeout(checkGlobalAlerts, 200);
    };
    document.getElementById('planoacao-cancelar').onclick = () => {
      S.updatePlanoAcao(acao.id, { status: 'Cancelado' });
      overlay.remove();
      setTimeout(checkGlobalAlerts, 200);
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };
  };

  const bindAgendaAlertListeners = () => {
    if (_agendaChangeListenerBound) return;
    _agendaChangeListenerBound = true;
    window.addEventListener('pcf:agenda-changed', () => {
      if (!S.getSession()) return;
      setTimeout(checkGlobalAlerts, 100);
    });
  };

  const initApp = () => {
    if (!S.getSession()) { renderLogin(); return; }
    if (_loginScreenRendered) {
      _navSaveExpanded({});
      location.hash = '#home';
      _loginScreenRendered = false;
    }
    renderShell();
    if (window.lucide) lucide.createIcons();
    initThemeToggle();
    initNavGroups();
    bindAgendaAlertListeners();
    // Inicia sistema de alertas globais
    startGlobalAlertSystem();
    // Ativa redimensionamento automático de colunas sempre que uma nova página for renderizada
    const mc = document.getElementById('main-content');
    if (mc) {
      new MutationObserver(() => {
        H.initResizableTables(mc);
        if (window.lucide) lucide.createIcons();
      }).observe(mc, { childList: true });
    }
    window.onhashchange = route;
    if (!location.hash) location.hash = '#home';
    else route();
  };

  /* ==================== EFEITO LANTERNA GLOBAL ==================== */
  const _getLuz = () => {
    let luz = document.getElementById('pcf-luz-global');
    if (!luz) {
      luz = document.createElement('div');
      luz.id = 'pcf-luz-global';
      luz.className = 'pcf-luz';
      luz.setAttribute('aria-hidden', 'true');
      document.body.appendChild(luz);
    }
    return luz;
  };

  const _glowMouseMove = (e) => {
    const luz = _getLuz();
    luz.style.setProperty('--glow-x', `${e.clientX}px`);
    luz.style.setProperty('--glow-y', `${e.clientY}px`);
    luz.style.opacity = '1';
  };

  const _glowMouseLeave = () => {
    const luz = document.getElementById('pcf-luz-global');
    if (luz) luz.style.opacity = '0';
  };

  const _particleStart = () => {
    _particleStop();
    /* Ativa efeito lanterna via classe CSS no body */
    document.body.classList.add('glow-effect');
    document.addEventListener('mousemove', _glowMouseMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', _glowMouseLeave);
  };

  const _particleStop = () => {
    document.body.classList.remove('glow-effect');
    document.removeEventListener('mousemove', _glowMouseMove);
    document.documentElement.removeEventListener('mouseleave', _glowMouseLeave);
    /* Remove todas as divs .pcf-luz injetadas */
    document.querySelectorAll('.pcf-luz').forEach(el => el.remove());
  };

  const boot = () => {
    applyTheme();
    document.getElementById('app').innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px"><div class="spinner"></div><p>Carregando...</p></div>`;
    PCF.Firebase.auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          await PCF.Store.loadAll(firebaseUser.uid);
          initApp();
          // Verifica alertas pendentes quando o usuário fizer login
          setTimeout(checkGlobalAlerts, 1000); // Pequeno atraso para garantir que os dados estejam carregados
        } catch (err) {
          document.getElementById('app').innerHTML = `<div style="padding:2rem"><div class="alert alert-error"><strong>Erro ao carregar dados.</strong><br>${err.message}</div></div>`;
        }
      } else {
        stopGlobalAlertSystem();
        renderLogin();
      }
    });
  };

  return { boot, route, registerChart, destroyCharts, applyTheme };
})();

document.addEventListener('DOMContentLoaded', PCF.App.boot);
