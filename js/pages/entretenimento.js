/*
  PCF - pages/entretenimento.js
  Jogos leves de autoconhecimento.
*/
PCF.Pages = PCF.Pages || {};

(function() {
  const H = PCF.Helpers;
  const S = PCF.Store;

  const DEFAULT_WORD_BANK = [
    { palavra: 'Gratidao', titulo: 'Gratidão', tipo: 'Virtude', descricao: 'Reconhecer o valor das pessoas, oportunidades e experiências recebidas, cultivando apreciação pela vida.' },
    { palavra: 'Coragem', titulo: 'Coragem', tipo: 'Virtude', descricao: 'Força interior para agir com consciência mesmo diante do medo, da dúvida ou da dificuldade.' },
    { palavra: 'Empatia', titulo: 'Empatia', tipo: 'Virtude', descricao: 'Capacidade de perceber o outro com respeito, imaginando seus sentimentos e necessidades.' },
    { palavra: 'Paciencia', titulo: 'Paciência', tipo: 'Virtude', descricao: 'Saber esperar e perseverar sem perder o equilíbrio diante de processos, pessoas ou limites.' },
    { palavra: 'Disciplina', titulo: 'Disciplina', tipo: 'Virtude', descricao: 'Compromisso constante com pequenas ações que sustentam objetivos importantes.' },
    { palavra: 'Prudencia', titulo: 'Prudência', tipo: 'Virtude', descricao: 'Escolher com cuidado, avaliando consequências antes de agir.' },
    { palavra: 'Humildade', titulo: 'Humildade', tipo: 'Virtude', descricao: 'Reconhecer o próprio valor sem arrogância e aprender com pessoas, erros e circunstâncias.' },
    { palavra: 'Resiliencia', titulo: 'Resiliência', tipo: 'Virtude', descricao: 'Capacidade de se reorganizar depois de dificuldades, mantendo sentido e continuidade.' },
    { palavra: 'Serenidade', titulo: 'Serenidade', tipo: 'Sentimento', descricao: 'Estado de calma consciente que ajuda a responder melhor aos acontecimentos.' },
    { palavra: 'Esperanca', titulo: 'Esperança', tipo: 'Sentimento', descricao: 'Confiança ativa de que a vida pode melhorar quando unimos fé, atitude e paciência.' },
    { palavra: 'Alegria', titulo: 'Alegria', tipo: 'Emoção', descricao: 'Energia positiva que nasce do contato com algo significativo, belo ou satisfatório.' },
    { palavra: 'Confianca', titulo: 'Confiança', tipo: 'Sentimento', descricao: 'Sensação de segurança que fortalece escolhas, vínculos e continuidade.' },
    { palavra: 'Generosidade', titulo: 'Generosidade', tipo: 'Virtude', descricao: 'Disposição de compartilhar tempo, atenção, conhecimento ou recursos com boa vontade.' },
    { palavra: 'Perdao', titulo: 'Perdão', tipo: 'Virtude', descricao: 'Libertar-se do peso da mágoa, sem negar aprendizados ou limites saudáveis.' },
    { palavra: 'Equilibrio', titulo: 'Equilíbrio', tipo: 'Virtude', descricao: 'Harmonizar razão, emoção e ação para viver com mais clareza.' },
    { palavra: 'Amor', titulo: 'Amor', tipo: 'Sentimento', descricao: 'Força de cuidado, vínculo e responsabilidade que amplia o sentido da vida.' },
    { palavra: 'Paz', titulo: 'Paz', tipo: 'Sentimento', descricao: 'Quietude interior que nasce da coerência entre valores, escolhas e atitudes.' },
    { palavra: 'Entusiasmo', titulo: 'Entusiasmo', tipo: 'Emoção', descricao: 'Ânimo vivo para participar, criar e investir energia em algo que faz sentido.' },
  ];

  const SIZE = 13;
  const WORDS_PER_GAME = 8;
  const DIRECTIONS = [
    { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 1, dc: 1 }, { dr: 1, dc: -1 },
    { dr: 0, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: -1 }, { dr: -1, dc: 1 },
  ];

  const normalizeWord = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const normalizeEntry = (entry) => ({
    id: entry.id || S._uid(),
    palavra: normalizeWord(entry.palavra || entry.titulo || ''),
    titulo: (entry.titulo || entry.palavra || '').trim(),
    tipo: (entry.tipo || 'Virtude').trim(),
    descricao: (entry.descricao || '').trim(),
    ativo: entry.ativo !== false,
  });
  const defaultWords = () => DEFAULT_WORD_BANK.map(normalizeEntry);
  const getWordBank = (activeOnly = true) => {
    let words = S.getJogoPalavras();
    if (!words.length) {
      words = defaultWords();
      S.saveJogoPalavras(words);
    }
    words = words.map(normalizeEntry).filter(w => w.palavra && w.titulo);
    return activeOnly ? words.filter(w => w.ativo !== false) : words;
  };
  const restoreDefaultWords = () => S.saveJogoPalavras(defaultWords());
  const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]);
  const randomLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));

  const canPlace = (grid, word, row, col, dir) => {
    for (let i = 0; i < word.length; i++) {
      const r = row + dir.dr * i;
      const c = col + dir.dc * i;
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
      if (grid[r][c] && grid[r][c] !== word[i]) return false;
    }
    return true;
  };

  const placeWord = (grid, entry) => {
    const word = normalizeWord(entry.palavra);
    for (let attempt = 0; attempt < 150; attempt++) {
      const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const row = Math.floor(Math.random() * SIZE);
      const col = Math.floor(Math.random() * SIZE);
      if (!canPlace(grid, word, row, col, dir)) continue;
      const cells = [];
      for (let i = 0; i < word.length; i++) {
        const r = row + dir.dr * i;
        const c = col + dir.dc * i;
        grid[r][c] = word[i];
        cells.push(`${r}-${c}`);
      }
      return { ...entry, word, cells, found: false };
    }
    return null;
  };

  const buildGame = () => {
    const grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ''));
    const placed = [];
    shuffle(getWordBank(true)).forEach(entry => {
      if (placed.length >= WORDS_PER_GAME) return;
      const item = placeWord(grid, entry);
      if (item) placed.push(item);
    });
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) grid[r][c] = randomLetter();
      }
    }
    return { grid, words: placed, selected: null, message: 'Toque na primeira letra e depois na última letra da palavra.' };
  };

  const cellsBetween = (start, end) => {
    const drRaw = end.r - start.r;
    const dcRaw = end.c - start.c;
    const steps = Math.max(Math.abs(drRaw), Math.abs(dcRaw));
    if (!steps) return [`${start.r}-${start.c}`];
    const dr = drRaw === 0 ? 0 : drRaw / Math.abs(drRaw);
    const dc = dcRaw === 0 ? 0 : dcRaw / Math.abs(dcRaw);
    if (!(drRaw === 0 || dcRaw === 0 || Math.abs(drRaw) === Math.abs(dcRaw))) return [];
    return Array.from({ length: steps + 1 }, (_, i) => `${start.r + dr * i}-${start.c + dc * i}`);
  };

  const showDefinition = (entry, onClose) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const close = () => {
      overlay.remove();
      if (typeof onClose === 'function') onClose();
    };
    overlay.innerHTML = `
      <div class="modal word-modal">
        <div class="word-modal-kind">${H.esc(entry.tipo)}</div>
        <h3>${H.esc(entry.titulo)}</h3>
        <p>${H.esc(entry.descricao)}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" id="word-continue">Continuar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#word-continue').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  };

  const showCompletion = (onNewGame) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal word-modal">
        <div class="word-modal-kind">Partida concluída</div>
        <h3>Você encontrou todas as palavras</h3>
        <p>Bom exercício de atenção e autoconhecimento. Cada palavra encontrada é um convite para observar como ela aparece no seu dia.</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="word-close">Fechar</button>
          <button type="button" class="btn btn-primary" id="word-new-game">Novo jogo</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#word-close').onclick = () => overlay.remove();
    overlay.querySelector('#word-new-game').onclick = () => { overlay.remove(); onNewGame(); };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  };

  PCF.Pages.cacaPalavras = (container) => {
    let game = buildGame();

    const render = () => {
      const foundCount = game.words.filter(w => w.found).length;
      container.innerHTML = `
        <div class="page word-game-page">
          <div class="page-header word-game-header">
            <div>
              <h2>✨ Caça-Palavras Interior</h2>
              <p class="subtitle">Encontre bons sentimentos, emoções e virtudes. Ao descobrir uma palavra, veja sua definição.</p>
            </div>
            <button type="button" class="btn btn-primary" id="wg-new"><i data-lucide="refresh-cw"></i> Novo jogo</button>
          </div>

          <div class="word-game-intro">
            <div class="word-game-intro-icon">🔎</div>
            <div>
              <strong>Como jogar</strong>
              <span>Toque na primeira letra da palavra e depois na última. Vale horizontal, vertical e diagonal.</span>
            </div>
          </div>

          <div class="word-game-summary">
            <div class="word-game-score"><strong>${foundCount}</strong><span>de ${game.words.length} encontradas</span></div>
            <div class="word-game-progress"><span style="width:${game.words.length ? (foundCount / game.words.length) * 100 : 0}%"></span></div>
          </div>

          <div class="word-game-layout">
            <section class="word-board-card">
              <div class="word-board" aria-label="Tabuleiro do caça-palavras">
                ${game.grid.map((row, r) => row.map((letter, c) => {
                  const key = `${r}-${c}`;
                  const found = game.words.some(w => w.found && w.cells.includes(key));
                  const selected = game.selected === key;
                  return `<button type="button" class="word-cell ${found ? 'found' : ''} ${selected ? 'selected' : ''}" data-r="${r}" data-c="${c}">${letter}</button>`;
                }).join('')).join('')}
              </div>
              <p class="word-game-tip">${H.esc(game.message)}</p>
            </section>

            <aside class="word-list-card">
              <h3>Palavras da rodada</h3>
              <div class="word-list">
                ${game.words.map(w => `<div class="word-token ${w.found ? 'found' : ''}"><span>${H.esc(w.titulo)}</span><small>${H.esc(w.tipo)}</small></div>`).join('')}
              </div>
            </aside>
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();

      container.querySelector('#wg-new').onclick = () => {
        game = buildGame();
        render();
      };

      container.querySelectorAll('.word-cell').forEach(btn => {
        btn.onclick = () => {
          const point = { r: Number(btn.dataset.r), c: Number(btn.dataset.c) };
          const key = `${point.r}-${point.c}`;
          if (!game.selected) {
            game.selected = key;
            game.message = 'Agora toque na última letra da palavra.';
            render();
            return;
          }

          const [sr, sc] = game.selected.split('-').map(Number);
          const cells = cellsBetween({ r: sr, c: sc }, point);
          const reverse = [...cells].reverse();
          const found = game.words.find(w => !w.found && (w.cells.join('|') === cells.join('|') || w.cells.join('|') === reverse.join('|')));
          game.selected = null;

          if (found) {
            found.found = true;
            game.message = `Você encontrou ${found.titulo}.`;
            render();
            const completed = game.words.every(w => w.found);
            showDefinition(found, completed ? () => {
              showCompletion(() => {
                game = buildGame();
                render();
              });
            } : null);
          } else {
            game.message = 'Ainda não foi dessa vez. Escolha a primeira letra e tente novamente.';
            render();
          }
        };
      });
    };

    render();
  };

  PCF.Pages.cacaPalavrasBase = (container) => {
    let filtro = '';

    const render = () => {
      const all = getWordBank(false);
      const filtered = filtro ? all.filter(item => {
        const haystack = `${item.titulo} ${item.tipo} ${item.descricao}`.toLowerCase();
        return haystack.includes(filtro.toLowerCase());
      }) : all;

      container.innerHTML = `
        <div class="page word-base-page">
          <div class="page-header word-base-header">
            <div>
              <h2><i data-lucide="database"></i> Base do Caça-Palavras</h2>
              <p class="subtitle">Gerencie as palavras, tipos e definições usadas no jogo.</p>
            </div>
            <div class="page-header-actions">
              <a href="#caca-palavras" class="btn btn-secondary btn-sm"><i data-lucide="puzzle"></i> Jogar</a>
              <button type="button" class="btn btn-outline btn-sm" id="wb-restore"><i data-lucide="rotate-ccw"></i> Restaurar padrões</button>
              <button type="button" class="btn btn-primary btn-sm" id="wb-new"><i data-lucide="plus"></i> Nova palavra</button>
            </div>
          </div>

          <div class="base-toolbar word-base-toolbar">
            <input type="search" id="wb-search" class="form-control" placeholder="Buscar palavra, tipo ou definição" value="${H.esc(filtro)}">
            <span class="badge badge-neutral">${filtered.length} de ${all.length}</span>
          </div>

          <div class="table-container word-base-table-wrap">
            <table class="data-table word-base-table">
              <thead>
                <tr>
                  <th>Palavra</th>
                  <th>Tipo</th>
                  <th>Definição</th>
                  <th>Ativa</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length ? filtered.map(item => `
                  <tr class="${item.ativo === false ? 'row-inactive' : ''}">
                    <td><strong>${H.esc(item.titulo)}</strong><small>${H.esc(item.palavra)}</small></td>
                    <td><span class="badge badge-neutral">${H.esc(item.tipo)}</span></td>
                    <td class="text-muted">${H.esc(item.descricao)}</td>
                    <td><input type="checkbox" data-wb-active="${H.esc(item.id)}" ${item.ativo !== false ? 'checked' : ''}></td>
                    <td class="actions-cell">
                      <button type="button" class="btn btn-icon btn-ghost" data-wb-edit="${H.esc(item.id)}" title="Editar"><i data-lucide="pencil"></i></button>
                      <button type="button" class="btn btn-icon btn-danger" data-wb-del="${H.esc(item.id)}" title="Excluir"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`).join('') : '<tr><td colspan="5" class="empty-text">Nenhuma palavra encontrada.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();

      container.querySelector('#wb-search').oninput = (e) => {
        filtro = e.target.value.trim();
        render();
      };
      container.querySelector('#wb-new').onclick = () => openWordModal(null);
      container.querySelector('#wb-restore').onclick = () => {
        if (!confirm('Restaurar a base padrão do Caça-Palavras? As alterações atuais serão substituídas.')) return;
        restoreDefaultWords();
        render();
      };
      container.querySelectorAll('[data-wb-edit]').forEach(btn => {
        btn.onclick = () => openWordModal(all.find(item => item.id === btn.dataset.wbEdit));
      });
      container.querySelectorAll('[data-wb-del]').forEach(btn => {
        btn.onclick = () => {
          if (!confirm('Excluir esta palavra do jogo?')) return;
          S.deleteJogoPalavra(btn.dataset.wbDel);
          render();
        };
      });
      container.querySelectorAll('[data-wb-active]').forEach(chk => {
        chk.onchange = () => {
          S.updateJogoPalavra(chk.dataset.wbActive, { ativo: chk.checked });
          render();
        };
      });
    };

    const openWordModal = (item) => {
      const isEdit = !!item;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal-md word-edit-modal">
          <h3><i data-lucide="${isEdit ? 'pencil' : 'plus-circle'}"></i> ${isEdit ? 'Editar' : 'Nova'} palavra</h3>
          <form id="wb-form">
            <div class="form-row">
              <div class="form-group">
                <label>Palavra *</label>
                <input type="text" id="wb-title" class="form-control" value="${H.esc(item?.titulo || '')}" maxlength="24" required>
              </div>
              <div class="form-group">
                <label>Tipo</label>
                <select id="wb-type" class="form-control">
                  ${['Virtude', 'Sentimento', 'Emoção'].map(type => `<option value="${type}" ${item?.tipo === type ? 'selected' : ''}>${type}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Definição / descrição *</label>
              <textarea id="wb-description" class="form-control" rows="4" maxlength="420" required>${H.esc(item?.descricao || '')}</textarea>
            </div>
            <label class="check-label"><input type="checkbox" id="wb-active" ${item?.ativo === false ? '' : 'checked'}> Palavra ativa no jogo</label>
            <div id="wb-error" class="alert alert-error" style="display:none"></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="wb-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      if (window.lucide) lucide.createIcons();

      const close = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
      overlay.querySelector('#wb-cancel').onclick = close;
      overlay.querySelector('#wb-form').onsubmit = (e) => {
        e.preventDefault();
        const titulo = overlay.querySelector('#wb-title').value.trim();
        const descricao = overlay.querySelector('#wb-description').value.trim();
        const errEl = overlay.querySelector('#wb-error');
        const palavra = normalizeWord(titulo);
        if (!titulo || !palavra) { errEl.textContent = 'Informe uma palavra válida.'; errEl.style.display = 'block'; return; }
        if (palavra.length > SIZE) { errEl.textContent = `Use uma palavra com até ${SIZE} letras para caber no tabuleiro.`; errEl.style.display = 'block'; return; }
        if (!descricao) { errEl.textContent = 'Informe a definição da palavra.'; errEl.style.display = 'block'; return; }
        const data = {
          palavra,
          titulo,
          tipo: overlay.querySelector('#wb-type').value,
          descricao,
          ativo: overlay.querySelector('#wb-active').checked,
        };
        if (isEdit) S.updateJogoPalavra(item.id, data);
        else S.addJogoPalavra(data);
        close();
        render();
      };
    };

    render();
  };
})();
