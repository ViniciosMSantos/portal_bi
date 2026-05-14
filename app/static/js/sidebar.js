var _allDashboards = [];
var _allFoldersMap = {};
var _selectedFolderId = null;

function _buildTree(folders) {
    // Monta a estrutura de árvore a partir da lista plana de pastas, preenchendo _allFoldersMap.
    var map = {}, roots = [];
    _allFoldersMap = {};
    folders.forEach(function (f) {
        _allFoldersMap[f.id] = f;
        map[f.id] = Object.assign({}, f, { children: [] });
    });
    folders.forEach(function (f) {
        if (f.parent_id && map[f.parent_id]) {
            map[f.parent_id].children.push(map[f.id]);
        } else {
            roots.push(map[f.id]);
        }
    });
    return roots;
}

function _renderTree(nodes, depth) {
    // Gera o HTML da árvore de pastas com chevrons, ícones e indentação por nível.
    return nodes.map(function (f) {
        var pl = 16 + depth * 16;
        var hasChildren = f.children.length > 0;
        var chevron = hasChildren
            ? '<span class="folder-chevron" data-target="fc-' + f.id + '">›</span>'
            : '<span class="folder-chevron-gap"></span>';
        var item = '<div class="folder-tree-item" style="padding-left:' + pl + 'px" data-folder-id="' + f.id + '" data-folder-name="' + f.name + '">'
            + chevron
            + '<img class="nav-icon" src="' + window._folderIcon + '" alt="" />'
            + '<span class="folder-tree-name">' + f.name + '</span>'
            + '</div>';
        if (hasChildren) {
            item += '<div class="folder-tree-children" id="fc-' + f.id + '">'
                + _renderTree(f.children, depth + 1)
                + '</div>';
        }
        return item;
    }).join('');
}

function _getBreadcrumb(folderId) {
    // Retorna o caminho completo da pasta até a raiz para montar o breadcrumb.
    var crumbs = [], current = _allFoldersMap[folderId];
    while (current) {
        crumbs.unshift(current);
        current = current.parent_id ? _allFoldersMap[current.parent_id] : null;
    }
    return crumbs;
}

function _getSubFolders(folderId) {
    // Retorna as subpastas diretas de uma pasta pelo parent_id.
    return Object.values(_allFoldersMap).filter(function (f) { return f.parent_id === folderId; });
}

function _escHtml(str) {
    // Escapa caracteres HTML especiais para evitar XSS ao inserir strings em innerHTML.
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function goHome(e) {
    // Navega para a tela Início: limpa seleção de pasta e remove estado ativo do config.
    var area = document.getElementById("folder-content");
    if (!area) return;
    e.preventDefault();
    _selectedFolderId = null;
    document.querySelectorAll(".folder-tree-item").forEach(function (el) {
        el.classList.remove("folder-tree-item-active");
    });
    var navHome = document.getElementById("nav-home");
    if (navHome) navHome.classList.add("nav-active");
    var navConfig = document.getElementById("nav-config");
    if (navConfig) navConfig.classList.remove("nav-active");
    area.innerHTML = '<h1 id="folder-content-title">Início</h1>'
        + '<div id="folder-content-area"></div>';
}

function goConfig(e) {
    // Navega para o painel de configuração: limpa seleção de pasta e chama loadConfigPanel().
    var area = document.getElementById("folder-content");
    if (!area) return;
    e.preventDefault();
    _selectedFolderId = null;
    document.querySelectorAll(".folder-tree-item").forEach(function (el) {
        el.classList.remove("folder-tree-item-active");
    });
    var navHome = document.getElementById("nav-home");
    if (navHome) navHome.classList.remove("nav-active");
    var navConfig = document.getElementById("nav-config");
    if (navConfig) navConfig.classList.add("nav-active");
    loadConfigPanel();
}

function loadFolderContent(folderId, folderName) {
    // Renderiza subpastas, dashboards e breadcrumb da pasta selecionada na área principal.
    _selectedFolderId = folderId;

    document.querySelectorAll(".folder-tree-item").forEach(function (el) {
        el.classList.toggle("folder-tree-item-active", el.dataset.folderId === folderId);
    });
    var navHome = document.getElementById("nav-home");
    if (navHome) navHome.classList.remove("nav-active");
    var navConfig = document.getElementById("nav-config");
    if (navConfig) navConfig.classList.remove("nav-active");

    var crumbs = _getBreadcrumb(folderId);
    var subFolders = _getSubFolders(folderId);
    var dashes = _allDashboards.filter(function (d) { return d.folder_id === folderId; });

    var breadcrumbHtml = '<nav id="content-breadcrumb">'
        + '<a id="breadcrumb-home" href="/">Início</a>'
        + crumbs.map(function (f) {
            return '<span class="breadcrumb-sep">/</span><span class="breadcrumb-crumb">' + _escHtml(f.name) + '</span>';
        }).join('')
        + '</nav>';
    var headerHtml = '<h1 id="folder-content-title">' + _escHtml(folderName) + '</h1>'
        + '<hr id="content-separator" />'
        + breadcrumbHtml;

    var foldersHtml = '';
    if (subFolders.length) {
        foldersHtml = '<p class="content-section-label">PASTAS</p>'
            + '<div class="content-folders-grid">'
            + subFolders.map(function (f) {
                return '<div class="content-folder-card" data-folder-id="' + f.id + '" data-folder-name="' + _escHtml(f.name) + '">'
                    + '<img class="content-folder-icon" src="' + window._folderIconDark + '" alt="" />'
                    + '<span class="content-folder-name">' + _escHtml(f.name) + '</span>'
                    + '</div>';
            }).join('')
            + '</div>';
    }

    var dashesHtml = '';
    if (dashes.length) {
        dashesHtml = '<p class="content-section-label">DASHBOARDS</p>'
            + '<div class="content-dashboards-grid">'
            + dashes.map(function (d) {
                return '<div class="dash-card">'
                    + '<div class="dash-card-body">'
                    + '<div class="dash-card-top">'
                    + '<span class="dash-card-title">' + _escHtml(d.title) + '</span>'
                    + '<a class="dash-card-link" href="' + _escHtml(d.url) + '" target="_blank" title="Abrir">&#x2197;</a>'
                    + '</div>'
                    + (d.description ? '<div class="dash-card-desc">' + _escHtml(d.description) + '</div>' : '')
                    + '<div class="dash-card-footer">'
                    + '<span class="dash-card-type">' + _escHtml(d.link_type) + '</span>'
                    + '</div>'
                    + '</div>'
                    + '</div>';
            }).join('')
            + '</div>';
    }

    var empty = '';
    if (!subFolders.length && !dashes.length) {
        empty = '<div id="folder-empty-state">'
            + '<svg id="folder-empty-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">'
            + '<path d="M5 16C5 13.8 6.8 12 9 12H24L30 18H55C57.2 18 59 19.8 59 22V48C59 50.2 57.2 52 55 52H9C6.8 52 5 50.2 5 48V16Z" stroke="#D1D5DB" stroke-width="2.5" fill="none"/>'
            + '<line x1="38" y1="32" x2="46" y2="32" stroke="#D1D5DB" stroke-width="2.5" stroke-linecap="round"/>'
            + '<line x1="42" y1="28" x2="42" y2="36" stroke="#D1D5DB" stroke-width="2.5" stroke-linecap="round"/>'
            + '</svg>'
            + '<p id="folder-empty-title">Pasta vazia</p>'
            + '<p id="folder-empty-subtitle">Use o botão <strong>Adicionar</strong> para criar um dashboard ou pasta aqui.</p>'
            + '</div>';
    }

    var area = document.getElementById("folder-content");
    if (!area) return;
    area.innerHTML = headerHtml + foldersHtml + dashesHtml + empty;
}

function reloadFolders() {
    // Recarrega a árvore de pastas via API e re-renderiza a sidebar, mantendo a pasta ativa selecionada.
    fetch("/api/folders")
        .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        })
        .then(function (data) {
            if (!data.ok) return;
            _allDashboards = data.data.dashboards || [];
            var container = document.getElementById("sidebar-folders");
            container.innerHTML = _renderTree(_buildTree(data.data.folders || []), 0);
            if (_selectedFolderId) {
                var active = container.querySelector('[data-folder-id="' + _selectedFolderId + '"]');
                if (active) active.classList.add("folder-tree-item-active");
            }
        })
        .catch(function (err) {
            console.error("reloadFolders:", err.message);
        });
}

document.addEventListener("DOMContentLoaded", function () {
    var contentEl = document.getElementById("folder-content");
    if (contentEl) {
        contentEl.addEventListener("click", function (e) {
            var card = e.target.closest(".content-folder-card");
            if (!card) return;
            var fid = card.dataset.folderId;
            var fname = card.dataset.folderName;
            loadFolderContent(fid, fname);
            var sidebarItem = document.querySelector('.folder-tree-item[data-folder-id="' + fid + '"]');
            if (sidebarItem) {
                var children = document.getElementById("fc-" + fid);
                if (children && children.style.display === "none") {
                    children.style.display = "block";
                    var chevron = sidebarItem.querySelector(".folder-chevron");
                    if (chevron) chevron.classList.add("folder-chevron-open");
                }
            }
        });
    }

    document.getElementById("sidebar-folders").addEventListener("click", function (e) {
        var item = e.target.closest(".folder-tree-item");
        if (!item) return;

        var childrenId = "fc-" + item.dataset.folderId;
        var children = document.getElementById(childrenId);
        if (children) {
            var open = children.style.display !== "none";
            children.style.display = open ? "none" : "block";
            var chevron = item.querySelector(".folder-chevron");
            if (chevron) chevron.classList.toggle("folder-chevron-open", !open);
        }

        loadFolderContent(item.dataset.folderId, item.dataset.folderName);
    });

    reloadFolders();

    var searchInput = document.getElementById("sidebar-search-input");
    var aiBtn = document.getElementById("sidebar-search-ai-btn");

    if (searchInput) {
        searchInput.addEventListener("input", function () {
            var q = searchInput.value.trim().toLowerCase();
            var area = document.getElementById("folder-content");
            if (!area) return;
            if (!q) { _renderSearchResults(null); return; }
            _renderSearchResults(q);
        });

        searchInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); _triggerGenieQuery(); }
        });
    }

    if (aiBtn) {
        aiBtn.addEventListener("click", function () {
            var q = searchInput ? searchInput.value.trim() : '';
            if (q) { _triggerGenieQuery(); } else { openGenieChat(); }
        });
    }
});

function openGenieChat() {
    // Abre o chat de IA: exibe tela vazia em nova conversa ou re-renderiza histórico se já houver mensagens.
    var area = document.getElementById("folder-content");
    if (!area) return;
    _selectedFolderId = null;
    document.querySelectorAll(".folder-tree-item").forEach(function (el) {
        el.classList.remove("folder-tree-item-active");
    });
    var navHome = document.getElementById("nav-home");
    if (navHome) navHome.classList.remove("nav-active");
    var navConfig = document.getElementById("nav-config");
    if (navConfig) navConfig.classList.remove("nav-active");

    if (_genieHistory.length === 0) {
        area.classList.add("genie-mode");
        area.innerHTML = '<div id="genie-header">'
            + '<h1 id="folder-content-title">✦ IA</h1>'
            + '<button id="genie-new-chat-btn" onclick="_genieReset()">Nova conversa</button>'
            + '</div>'
            + '<hr id="content-separator" />'
            + '<div id="genie-chat"><div id="genie-empty-state">'
            + '<p id="genie-empty-hint">Faça uma pergunta sobre os dados ou dashboards disponíveis.</p>'
            + '</div></div>'
            + '<div id="genie-input-bar">'
            + '<input id="genie-input" type="text" placeholder="Como posso ajudar?" autocomplete="off" />'
            + '<button id="genie-send-btn" onclick="_genieSubmitFromChat()">&#x27A4;</button>'
            + '</div>';
        var inp = document.getElementById("genie-input");
        if (inp) {
            inp.addEventListener("keydown", function (e) {
                if (e.key === "Enter") { e.preventDefault(); _genieSubmitFromChat(); }
            });
            inp.focus();
        }
    } else {
        _renderGenieChat();
    }
}

var _genieConversationId = null;
var _genieHistory = [];

function _mdToHtml(text) {
    // Converte markdown básico (bold, italic, listas, code inline) para HTML seguro.
    if (!text) return '';
    var lines = text.split('\n');
    var html = '';
    var inList = false;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i]
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
        var bullet = line.match(/^[-•*]\s+(.*)/);
        var numbered = line.match(/^\d+\.\s+(.*)/);
        if (bullet || numbered) {
            if (!inList) { html += '<ul class="genie-list">'; inList = true; }
            html += '<li>' + (bullet ? bullet[1] : numbered[1]) + '</li>';
        } else {
            if (inList) { html += '</ul>'; inList = false; }
            if (line.trim() === '') {
                if (html && !html.endsWith('<br>')) html += '<br>';
            } else {
                html += line + '<br>';
            }
        }
    }
    if (inList) html += '</ul>';
    return html;
}

function _genieDataHtml() {
    // Placeholder para tabela de dados do Genie — retorna vazio (tabela desabilitada por decisão de produto).
    return '';
}

function _renderGenieChat() {
    // Re-renderiza toda a interface do chat com histórico atualizado, adiciona genie-mode e rola para o fim.
    var area = document.getElementById("folder-content");
    if (!area) return;

    var historyHtml = _genieHistory.map(function (entry) {
        if (entry.type === 'user') {
            return '<div class="genie-msg genie-msg-user">' + _escHtml(entry.text) + '</div>';
        }
        if (entry.type === 'loading') {
            return '<div class="genie-msg genie-msg-ai" id="genie-msg-loading">'
                + '<span class="genie-ai-label">✦ IA</span>'
                + '<div class="genie-typing"><span></span><span></span><span></span></div>'
                + '</div>';
        }
        var body = '';
        if (entry.answer) body += '<div class="genie-answer-text">' + _mdToHtml(entry.answer) + '</div>';
        if (entry.dataHtml) body += entry.dataHtml;
        return '<div class="genie-msg genie-msg-ai">'
            + '<span class="genie-ai-label">✦ IA</span>'
            + body
            + '</div>';
    }).join('');

    area.classList.add("genie-mode");
    area.innerHTML = '<div id="genie-header">'
        + '<h1 id="folder-content-title">✦ IA</h1>'
        + '<button id="genie-new-chat-btn" onclick="_genieReset()">Nova conversa</button>'
        + '</div>'
        + '<hr id="content-separator" />'
        + '<div id="genie-chat">' + historyHtml + '</div>'
        + '<div id="genie-input-bar">'
        + '<input id="genie-input" type="text" placeholder="Continue a conversa..." autocomplete="off" />'
        + '<button id="genie-send-btn" onclick="_genieSubmitFromChat()">&#x27A4;</button>'
        + '</div>';

    var chat = document.getElementById("genie-chat");
    if (chat) chat.scrollTop = chat.scrollHeight;

    var inp = document.getElementById("genie-input");
    if (inp) {
        inp.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); _genieSubmitFromChat(); }
        });
        inp.focus();
    }
}

function _genieReset() {
    // Reseta a conversa: limpa conversation_id, histórico e campo de busca, volta para a tela Início.
    _genieConversationId = null;
    _genieHistory = [];
    var searchInput = document.getElementById("sidebar-search-input");
    if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    _renderSearchResults(null);
}

async function _genieSubmitFromChat() {
    // Lê o input do chat, limpa o campo e envia a mensagem via _sendGenieMessage().
    var inp = document.getElementById("genie-input");
    if (!inp) return;
    var message = inp.value.trim();
    if (!message) return;
    inp.value = '';
    await _sendGenieMessage(message);
}

async function _triggerGenieQuery() {
    // Lê o campo de busca da sidebar, limpa-o e envia a mensagem via _sendGenieMessage().
    var searchInput = document.getElementById("sidebar-search-input");
    var area = document.getElementById("folder-content");
    if (!area || !searchInput) return;

    var message = searchInput.value.trim();
    if (!message) return;
    searchInput.value = '';
    await _sendGenieMessage(message);
}

async function _sendGenieMessage(message) {
    // Envia mensagem ao Genie via POST /api/genie/query, gerencia histórico (loading → resposta) e re-renderiza.
    var aiBtn = document.getElementById("sidebar-search-ai-btn");

    _genieHistory.push({ type: 'user', text: message });
    _genieHistory.push({ type: 'loading' });
    _renderGenieChat();

    if (aiBtn) aiBtn.classList.add("ai-loading");

    try {
        var res = await fetch("/api/genie/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: message, conversation_id: _genieConversationId }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "Erro na consulta IA");
        _genieConversationId = data.data.conversation_id || _genieConversationId;
        _genieHistory.pop();
        _genieHistory.push({
            type: 'ai',
            answer: data.data.answer,
            dataHtml: _genieDataHtml(data.data),
        });
    } catch (err) {
        _genieHistory.pop();
        _genieHistory.push({ type: 'ai', answer: 'Erro: ' + err.message, dataHtml: '' });
    } finally {
        if (aiBtn) aiBtn.classList.remove("ai-loading");
        _renderGenieChat();
    }
}

function _renderSearchResults(q) {
    // Filtra dashboards e pastas localmente pela query e renderiza os resultados na área principal.
    var area = document.getElementById("folder-content");
    if (!area) return;

    if (!q) {
        area.classList.remove("genie-mode");
        _selectedFolderId = null;
        document.querySelectorAll(".folder-tree-item").forEach(function (el) {
            el.classList.remove("folder-tree-item-active");
        });
        var navHome = document.getElementById("nav-home");
        if (navHome) navHome.classList.add("nav-active");
        area.innerHTML = '<h1 id="folder-content-title">Início</h1><div id="folder-content-area"></div>';
        return;
    }

    var matchedDashes = _allDashboards.filter(function (d) {
        return (d.title || "").toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q);
    });

    var matchedFolders = Object.values(_allFoldersMap).filter(function (f) {
        return (f.name || "").toLowerCase().includes(q);
    });

    var total = matchedDashes.length + matchedFolders.length;

    var foldersHtml = '';
    if (matchedFolders.length) {
        foldersHtml = '<p class="content-section-label">PASTAS</p>'
            + '<div class="content-folders-grid">'
            + matchedFolders.map(function (f) {
                return '<div class="content-folder-card" data-folder-id="' + f.id + '" data-folder-name="' + _escHtml(f.name) + '">'
                    + '<img class="content-folder-icon" src="' + window._folderIconDark + '" alt="" />'
                    + '<span class="content-folder-name">' + _escHtml(f.name) + '</span>'
                    + '</div>';
            }).join('')
            + '</div>';
    }

    var dashesHtml = '';
    if (matchedDashes.length) {
        dashesHtml = '<p class="content-section-label">DASHBOARDS</p>'
            + '<div class="search-results-grid">'
            + matchedDashes.map(function (d) {
                return '<div class="search-result-card">'
                    + '<div class="search-result-left"></div>'
                    + '<div class="search-result-body">'
                    + '<div class="search-result-top">'
                    + '<span class="search-result-title">' + _escHtml(d.title) + '</span>'
                    + '<a class="dash-card-link" href="' + _escHtml(d.url) + '" target="_blank" title="Abrir">&#x2197;</a>'
                    + '</div>'
                    + (d.description ? '<div class="search-result-desc">' + _escHtml(d.description) + '</div>' : '')
                    + '<div class="search-result-footer">'
                    + '<span class="search-result-badge">' + _escHtml(d.link_type) + '</span>'
                    + '</div>'
                    + '</div>'
                    + '</div>';
            }).join('')
            + '</div>';
    }

    var emptyHtml = '';
    if (total === 0) {
        emptyHtml = '<div id="folder-empty-state">'
            + '<p id="folder-empty-title">Nenhum resultado</p>'
            + '<p id="folder-empty-subtitle">Nenhum dashboard ou pasta encontrado para "<strong>' + _escHtml(q) + '</strong>".</p>'
            + '</div>';
    }

    area.innerHTML = '<h1 id="folder-content-title">Resultados <span id="search-result-count">(' + total + ')</span></h1>'
        + '<hr id="content-separator" />'
        + foldersHtml + dashesHtml + emptyHtml;
}
