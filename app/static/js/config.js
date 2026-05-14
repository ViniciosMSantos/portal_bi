var _currentConfigTab = 'usuarios';

// Cache e estado da tabela de usuários
var _configUsers = [];
var _configUsersPage = 1;
var _configUsersSearch = '';
var _configUsersPageSize = 10;

// Cache e estado do grid de tags
var _configTags = [];
var _configTagsSearch = '';
var _configTagsDashMap = {};
var _configTagsFolderMap = {};

function _renderConfigSummary(totalUsers, totalRequests, totalTags) {
    // Renderiza os cards de resumo com total de usuários, solicitações abertas e tags.
    return '<div id="config-summary">'
        + '<div class="config-summary-card">'
        + '<div class="config-summary-icon config-summary-icon-users">'
        + '<img src="' + (window._usersIcon || '') + '" alt="" style="width:26px;height:26px;object-fit:contain;" />'
        + '</div>'
        + '<div class="config-summary-info">'
        + '<span class="config-summary-value">' + totalUsers + '</span>'
        + '<span class="config-summary-label">Usuários cadastrados</span>'
        + '</div>'
        + '</div>'
        + '<div class="config-summary-card">'
        + '<div class="config-summary-icon config-summary-icon-requests">'
        + '<img src="' + (window._requestsIcon || '') + '" alt="" style="width:22px;height:22px;object-fit:contain;" />'
        + '</div>'
        + '<div class="config-summary-info">'
        + '<span class="config-summary-value">' + totalRequests + '</span>'
        + '<span class="config-summary-label">Solicitações abertas</span>'
        + '</div>'
        + '</div>'
        + '<div class="config-summary-card">'
        + '<div class="config-summary-icon config-summary-icon-tags">'
        + '<img src="' + (window._tagsIcon || '') + '" alt="" style="width:24px;height:24px;object-fit:contain;" />'
        + '</div>'
        + '<div class="config-summary-info">'
        + '<span class="config-summary-value">' + totalTags + '</span>'
        + '<span class="config-summary-label">Tags criadas</span>'
        + '</div>'
        + '</div>'
        + '</div>';
}

function _renderConfigNav(activeTab) {
    // Gera o HTML da barra de navegação do painel de configuração com a aba ativa destacada.
    var tabs = [
        { id: 'usuarios', label: 'Usuários' },
        { id: 'tags', label: 'Tags' },
    ];
    return '<nav id="config-nav">'
        + tabs.map(function (t) {
            return '<button class="config-nav-tab' + (t.id === activeTab ? ' config-nav-tab-active' : '') + '"'
                + ' onclick="switchConfigTab(\'' + t.id + '\')">' + t.label + '</button>';
        }).join('')
        + '</nav>';
}

function switchConfigTab(tab) {
    // Troca a aba ativa do painel de configuração e carrega os dados correspondentes.
    _currentConfigTab = tab;
    document.querySelectorAll('.config-nav-tab').forEach(function (el) {
        el.classList.toggle('config-nav-tab-active', el.getAttribute('onclick').includes("'" + tab + "'"));
    });
    var contentEl = document.getElementById("config-tab-content");
    if (!contentEl) return;
    if (tab === 'usuarios') {
        contentEl.innerHTML = '<p class="config-loading">Carregando...</p>';
        Promise.all([
            fetch("/api/users").then(function (r) { return r.json(); }),
            fetch("/api/requests").then(function (r) { return r.json(); }),
        ]).then(function (results) {
            var users = results[0].ok ? results[0].data : [];
            var requests = results[1].ok ? results[1].data : [];
            contentEl.innerHTML = _renderRequestsSection(requests) + _renderUsersSection(users);
            _refreshUsersTable();
        }).catch(function () {
            contentEl.innerHTML = '<p class="config-error">Erro ao carregar dados.</p>';
        });
    }

    if (tab === 'tags') {
        contentEl.innerHTML = '<p class="config-loading">Carregando...</p>';
        Promise.all([
            fetch("/api/tags").then(function (r) { return r.json(); }),
            fetch("/api/folders").then(function (r) { return r.json(); }),
        ]).then(function (results) {
            var tags = results[0].ok ? results[0].data : [];
            var dashMap = {}, folderMap = {};
            if (results[1].ok && results[1].data.dashboards) {
                results[1].data.dashboards.forEach(function (d) { dashMap[d.id] = d.title; });
            }
            if (results[1].ok && results[1].data.folders) {
                results[1].data.folders.forEach(function (f) { folderMap[f.id] = f.name; });
            }
            contentEl.innerHTML = _renderTagsSection(tags, dashMap, folderMap);
            _refreshTagsGrid();
        }).catch(function () {
            contentEl.innerHTML = '<p class="config-error">Erro ao carregar tags.</p>';
        });
    }
}

function _formatDate(str) {
    // Formata uma string de data ISO para dd/mm/aaaa no locale pt-BR.
    if (!str) return '';
    return new Date(str).toLocaleDateString('pt-BR');
}

function _roleBadge(role) {
    // Gera o HTML de um badge colorido para o perfil do usuário (ADMIN, MANAGER, BA, USER).
    var styles = {
        ADMIN:   'color:#EF4444;background:#FEE2E2',
        MANAGER: 'color:#8B5CF6;background:#EDE9FE',
        BA:      'color:#1B2CC1;background:#EEF0FF',
        USER:    'color:#6B7280;background:#F3F4F6',
    };
    return '<span class="config-badge" style="' + (styles[role] || styles.USER) + '">' + _escHtml(role) + '</span>';
}

function _statusBadge(isActive) {
    // Gera o HTML de um badge verde (Ativo) ou vermelho (Inativo) conforme o status do usuário.
    return isActive
        ? '<span class="config-badge config-badge-active">Ativo</span>'
        : '<span class="config-badge config-badge-inactive">Inativo</span>';
}

function _renderRequestsSection(requests) {
    // Gera o HTML da seção de solicitações pendentes com botões de aprovar/rejeitar.
    var html = '<div class="config-section">'
        + '<p class="content-section-label">Solicitações de Acesso</p>';

    if (!requests.length) {
        html += '<p class="config-empty">Nenhuma solicitação pendente.</p>';
    } else {
        html += '<table class="config-table"><thead><tr>'
            + '<th>Nome</th><th>Email</th><th>Mensagem</th><th>Data</th><th>Ações</th>'
            + '</tr></thead><tbody>'
            + requests.map(function (r) {
                return '<tr>'
                    + '<td>' + _escHtml(r.requester_name) + '</td>'
                    + '<td>' + _escHtml(r.requester_email) + '</td>'
                    + '<td class="config-td-msg">' + _escHtml(r.message || '—') + '</td>'
                    + '<td>' + _formatDate(r.created_at) + '</td>'
                    + '<td class="config-td-actions">'
                    + '<button class="config-btn config-btn-approve" onclick="approveRequest(\'' + r.id + '\')">Aprovar</button>'
                    + '<button class="config-btn config-btn-reject" onclick="rejectRequest(\'' + r.id + '\')">Rejeitar</button>'
                    + '</td>'
                    + '</tr>';
            }).join('')
            + '</tbody></table>';
    }

    return html + '</div>';
}

function _roleSelect(email, currentRole) {
    // Gera o HTML do select de perfil para o usuário, com onchange para chamar changeUserRole().
    var safeEmail = email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var roles = ['USER', 'BA', 'MANAGER', 'ADMIN'];
    return '<select class="config-role-select" onchange="changeUserRole(\'' + safeEmail + '\',this.value)">'
        + roles.map(function (r) {
            return '<option value="' + r + '"' + (r === currentRole ? ' selected' : '') + '>' + r + '</option>';
        }).join('')
        + '</select>';
}

function _iaToggle(email, iaEnabled) {
    // Gera o HTML do toggle switch de IA para o usuário, com onchange para chamar toggleUserIA().
    var safeEmail = email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var checked = iaEnabled ? 'checked' : '';
    return '<label class="config-ia-toggle" title="Habilitar IA">'
        + '<input type="checkbox" ' + checked + ' onchange="toggleUserIA(\'' + safeEmail + '\',this.checked)" />'
        + '<span class="config-ia-slider"></span>'
        + '</label>';
}

function _renderUsersSection(users) {
    // Armazena os usuários no cache e renderiza a seção com toolbar de busca, tabela e paginação.
    _configUsers = users || [];
    _configUsersPage = 1;
    _configUsersSearch = '';

    return '<div class="config-section">'
        + '<p class="content-section-label">Usuários</p>'
        + '<div id="config-users-toolbar">'
        + '<input id="config-users-search" type="text" placeholder="Buscar por nome ou email..." oninput="_onUsersSearch(this.value)" autocomplete="off" />'
        + '</div>'
        + '<table class="config-table"><thead><tr>'
        + '<th>Nome</th><th>Email</th><th>Perfil</th><th>Status</th><th>IA</th><th>Ações</th>'
        + '</tr></thead>'
        + '<tbody id="config-users-tbody"></tbody>'
        + '</table>'
        + '<div id="config-users-pagination"></div>'
        + '</div>';
}

function _getFilteredUsers() {
    // Filtra _configUsers pelo texto de busca (nome ou email, case-insensitive).
    var q = _configUsersSearch.toLowerCase();
    if (!q) return _configUsers;
    return _configUsers.filter(function (u) {
        return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    });
}

function _renderUsersPagination(total, page, pageSize) {
    // Gera o HTML dos controles de paginação com ellipsis para grandes conjuntos de páginas.
    var totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) return '';

    var pages = [];
    for (var i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
            pages.push(i);
        } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
        }
    }

    var html = '<div id="config-users-pagination">';
    html += '<button class="config-page-btn" onclick="_setUsersPage(' + (page - 1) + ')"'
        + (page === 1 ? ' disabled' : '') + '>&#8249;</button>';

    pages.forEach(function (p) {
        if (p === '...') {
            html += '<span class="config-page-ellipsis">…</span>';
        } else {
            html += '<button class="config-page-btn' + (p === page ? ' config-page-btn-active' : '') + '"'
                + ' onclick="_setUsersPage(' + p + ')">' + p + '</button>';
        }
    });

    html += '<button class="config-page-btn" onclick="_setUsersPage(' + (page + 1) + ')"'
        + (page === totalPages ? ' disabled' : '') + '>&#8250;</button>';
    html += '</div>';
    return html;
}

function _refreshUsersTable() {
    // Aplica filtro e paginação e atualiza tbody, contador e controles de paginação sem recriar a seção.
    var filtered = _getFilteredUsers();
    var total = filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / _configUsersPageSize));
    if (_configUsersPage > totalPages) _configUsersPage = totalPages;

    var start = (_configUsersPage - 1) * _configUsersPageSize;
    var page = filtered.slice(start, start + _configUsersPageSize);

    var tbody = document.getElementById('config-users-tbody');
    var countEl = document.getElementById('config-users-count');
    var paginationEl = document.getElementById('config-users-pagination');

    if (tbody) {
        if (page.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="config-empty" style="text-align:center">Nenhum usuário encontrado.</td></tr>';
        } else {
            tbody.innerHTML = page.map(function (u) {
                var safeEmail = u.email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return '<tr>'
                    + '<td>' + _escHtml(u.name) + '</td>'
                    + '<td>' + _escHtml(u.email) + '</td>'
                    + '<td>' + _roleSelect(u.email, u.role) + '</td>'
                    + '<td>' + _statusBadge(u.is_active) + '</td>'
                    + '<td>' + _iaToggle(u.email, u.ia_enabled) + '</td>'
                    + '<td class="config-actions-cell">'
                    + (u.is_active
                        ? '<button class="config-btn config-btn-deactivate" onclick="toggleUserActive(\'' + safeEmail + '\',true)">Desativar</button>'
                        : '<button class="config-btn config-btn-activate" onclick="toggleUserActive(\'' + safeEmail + '\',false)">Ativar</button>')
                    + '<button class="config-btn config-btn-tags" onclick="openUserAccessModal(\'' + safeEmail + '\')">Acesso</button>'
                    + '</td>'
                    + '</tr>';
            }).join('');
        }
    }

    if (paginationEl) {
        paginationEl.outerHTML = _renderUsersPagination(total, _configUsersPage, _configUsersPageSize);
    }
}

function _onUsersSearch(value) {
    // Atualiza o filtro de busca, reseta para a página 1 e re-renderiza a tabela.
    _configUsersSearch = value.trim();
    _configUsersPage = 1;
    _refreshUsersTable();
}

function _setUsersPage(page) {
    // Muda para a página indicada e re-renderiza a tabela.
    var filtered = _getFilteredUsers();
    var totalPages = Math.max(1, Math.ceil(filtered.length / _configUsersPageSize));
    if (page < 1 || page > totalPages) return;
    _configUsersPage = page;
    _refreshUsersTable();
}

// Cache do modal de acesso de usuário
var _accessAllTags = [];
var _accessAllFolders = [];
var _accessAllDashes = [];
var _accessLinkedTags = [];
var _accessLinkedFolders = [];
var _accessLinkedDashes = [];

async function openUserAccessModal(userEmail) {
    // Abre modal de acesso com seções Tags, Pastas e Dashboards.
    var overlay = document.createElement('div');
    overlay.id = 'tag-modal-overlay';
    overlay.onclick = closeUserAccessModal;

    var modal = document.createElement('div');
    modal.id = 'tag-modal';
    modal.dataset.userEmail = userEmail;
    modal.innerHTML = '<div id="tag-modal-header">'
        + '<h2 id="tag-modal-title">Gerenciar Acesso</h2>'
        + '<button id="tag-modal-close" onclick="closeUserAccessModal()">&#x2715;</button>'
        + '</div>'
        + '<div id="tag-modal-error"></div>'
        + '<div id="tag-link-search-wrap">'
        + '<input id="tag-link-search" type="text" placeholder="Buscar tag, pasta ou dashboard..." autocomplete="off" oninput="_filterAccessList(this.value)" />'
        + '</div>'
        + '<div id="user-access-list"><p class="config-loading">Carregando...</p></div>'
        + '<div id="tag-modal-actions">'
        + '<button id="tag-btn-cancel" type="button" onclick="closeUserAccessModal()">Cancelar</button>'
        + '<button id="tag-btn-submit" onclick="submitUserAccess()">Salvar</button>'
        + '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    document.getElementById('tag-link-search').focus();

    try {
        var results = await Promise.all([
            fetch('/api/tags').then(function (r) { return r.json(); }),
            fetch('/api/folders').then(function (r) { return r.json(); }),
            fetch('/api/users/' + encodeURIComponent(userEmail) + '/access').then(function (r) { return r.json(); }),
        ]);

        _accessAllTags = results[0].ok ? results[0].data : [];
        var foldersData = results[1].ok ? results[1].data : { folders: [], dashboards: [] };
        _accessAllFolders = foldersData.folders || [];
        _accessAllDashes = foldersData.dashboards || [];

        var accessData = results[2].ok ? results[2].data : {};
        _accessLinkedTags = accessData.tags || [];
        _accessLinkedDashes = accessData.individual_dashboards || [];
        _accessLinkedFolders = [];

        _renderAccessList('');
    } catch (e) {
        var listEl = document.getElementById('user-access-list');
        if (listEl) listEl.innerHTML = '<p class="config-error">Erro ao carregar dados.</p>';
    }
}

function _renderAccessList(q) {
    // Renderiza as três seções de acesso: tags, pastas e dashboards.
    var listEl = document.getElementById('user-access-list');
    if (!listEl) return;
    var ql = (q || '').toLowerCase();

    var filteredTags = _accessAllTags.filter(function (t) { return !ql || (t.name || '').toLowerCase().includes(ql); });
    var filteredFolders = _accessAllFolders.filter(function (f) { return !ql || (f.name || '').toLowerCase().includes(ql); });
    var filteredDashes = _accessAllDashes.filter(function (d) { return !ql || (d.title || '').toLowerCase().includes(ql); });

    var html = '';

    if (filteredTags.length) {
        html += '<p class="tag-link-section-label">TAGS</p><div class="tag-link-group">'
            + filteredTags.map(function (t) {
                var checked = _accessLinkedTags.includes(t.id) ? 'checked' : '';
                return '<label class="tag-dash-item">'
                    + '<input type="checkbox" class="access-tag-cb" value="' + _escHtml(t.id) + '" ' + checked + ' />'
                    + '<span class="user-tag-dot" style="background:' + _escHtml(t.color || '#1B2CC1') + '"></span>'
                    + '<span class="tag-dash-title">' + _escHtml(t.name) + '</span>'
                    + '</label>';
            }).join('') + '</div>';
    }

    if (filteredFolders.length) {
        html += '<p class="tag-link-section-label">PASTAS</p><div class="tag-link-group">'
            + filteredFolders.map(function (f) {
                var checked = _accessLinkedFolders.includes(f.id) ? 'checked' : '';
                return '<label class="tag-dash-item">'
                    + '<input type="checkbox" class="access-folder-cb" value="' + _escHtml(f.id) + '" ' + checked + ' />'
                    + '<img src="' + (window._folderIconBlack || '') + '" class="tag-link-folder-icon" alt="" />'
                    + '<span class="tag-dash-title">' + _escHtml(f.name) + '</span>'
                    + '</label>';
            }).join('') + '</div>';
    }

    if (filteredDashes.length) {
        html += '<p class="tag-link-section-label">DASHBOARDS</p><div class="tag-link-group">'
            + filteredDashes.map(function (d) {
                var checked = _accessLinkedDashes.includes(d.id) ? 'checked' : '';
                return '<label class="tag-dash-item">'
                    + '<input type="checkbox" class="access-dash-cb" value="' + _escHtml(d.id) + '" ' + checked + ' />'
                    + '<span class="tag-dash-title">&#9632; ' + _escHtml(d.title) + '</span>'
                    + '</label>';
            }).join('') + '</div>';
    }

    if (!html) html = '<p class="config-empty">Nenhum resultado encontrado.</p>';
    listEl.innerHTML = html;
}

function _filterAccessList(q) {
    // Preserva seleções atuais e re-renderiza a lista filtrada.
    _accessLinkedTags = Array.from(document.querySelectorAll('.access-tag-cb:checked')).map(function (c) { return c.value; });
    _accessLinkedFolders = Array.from(document.querySelectorAll('.access-folder-cb:checked')).map(function (c) { return c.value; });
    _accessLinkedDashes = Array.from(document.querySelectorAll('.access-dash-cb:checked')).map(function (c) { return c.value; });
    _renderAccessList(q);
}

function closeUserAccessModal() {
    // Fecha e remove o modal de acesso.
    var overlay = document.getElementById('tag-modal-overlay');
    var modal = document.getElementById('tag-modal');
    if (overlay) overlay.remove();
    if (modal) modal.remove();
}

async function submitUserAccess() {
    // Salva tags, pastas e dashboards do usuário via PUT /api/users/:email/access.
    var modal = document.getElementById('tag-modal');
    var errorEl = document.getElementById('tag-modal-error');
    var btn = document.getElementById('tag-btn-submit');
    var userEmail = modal ? modal.dataset.userEmail : null;
    if (!userEmail) return;

    var tagIds = Array.from(document.querySelectorAll('.access-tag-cb:checked')).map(function (c) { return c.value; });
    var folderIds = Array.from(document.querySelectorAll('.access-folder-cb:checked')).map(function (c) { return c.value; });
    var dashIds = Array.from(document.querySelectorAll('.access-dash-cb:checked')).map(function (c) { return c.value; });

    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
        var res = await fetch('/api/users/' + encodeURIComponent(userEmail) + '/access', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: tagIds, folder_ids: folderIds, dashboard_ids: dashIds }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Erro ao salvar');
        closeUserAccessModal();
        _refreshUsersTable();
    } catch (err) {
        if (errorEl) errorEl.textContent = err.message;
        btn.disabled = false;
        btn.textContent = 'Salvar';
    }
}

function _renderTagsSection(tags, dashMap, folderMap) {
    // Armazena o cache e renderiza a seção de tags com toolbar de busca e grid de cards.
    _configTags = tags || [];
    _configTagsSearch = '';
    _configTagsDashMap = dashMap || {};
    _configTagsFolderMap = folderMap || {};

    var toolbar = '<div id="tags-toolbar">'
        + '<input id="tags-search" type="text" placeholder="Buscar tag..." autocomplete="off" oninput="_onTagsSearch(this.value)" />'
        + '<button class="config-btn config-btn-new-tag" onclick="openTagModal(null)">+ Nova Tag</button>'
        + '</div>';

    if (!_configTags.length) {
        return '<div class="config-section">' + toolbar
            + '<p class="config-empty">Nenhuma tag cadastrada.</p></div>';
    }

    return '<div class="config-section">' + toolbar
        + '<div id="tags-grid"></div></div>';
}

function _buildTagCard(t) {
    // Monta o HTML de um card de tag individual.
    var tagJson = JSON.stringify(t).replace(/'/g, "\\'");
    var safeId = _escHtml(t.id);
    var dashIds = t.dashboard_ids || [];
    var folderIds = t.folder_ids || [];
    var dashNames = dashIds.map(function (id) { return _configTagsDashMap[id]; }).filter(Boolean);
    var folderNames = folderIds.map(function (id) { return _configTagsFolderMap[id]; }).filter(Boolean);
    var hasTooltip = t.description || dashNames.length || folderNames.length;
    var tooltipHtml = '';
    if (hasTooltip) {
        tooltipHtml = '<div class="tag-card-desc">';
        if (t.description) tooltipHtml += '<span class="tag-card-desc-text">' + _escHtml(t.description) + '</span>';
        if (folderNames.length) {
            tooltipHtml += '<p class="tag-card-desc-label">Pastas</p>'
                + '<ul class="tag-card-desc-dashes">'
                + folderNames.map(function (n) { return '<li>' + _escHtml(n) + '</li>'; }).join('')
                + '</ul>';
        }
        if (dashNames.length) {
            tooltipHtml += '<p class="tag-card-desc-label">Dashboards</p>'
                + '<ul class="tag-card-desc-dashes">'
                + dashNames.map(function (n) { return '<li>' + _escHtml(n) + '</li>'; }).join('')
                + '</ul>';
        }
        tooltipHtml += '</div>';
    }
    return '<div class="tag-card" style="border-left-color:' + _escHtml(t.color || '#1B2CC1') + '">'
        + '<div class="tag-card-body">'
        + '<span class="tag-card-name">' + _escHtml(t.name) + '</span>'
        + '<span class="tag-card-count">' + dashIds.length + ' dashboard(s)</span>'
        + '<div class="tag-card-actions">'
        + "<button class=\"tag-action-btn tag-action-btn-edit\" onclick='openTagModal(" + tagJson + ")'>&#9998; Editar</button>"
        + '<button class="tag-action-btn tag-action-btn-dash" onclick="openTagDashModal(\'' + safeId + '\')">+ Dash</button>'
        + '<button class="tag-action-btn tag-action-btn-delete" onclick="deleteTagConfirm(\'' + safeId + '\')">&#128465;</button>'
        + '</div>'
        + '</div>'
        + tooltipHtml
        + '</div>';
}

function _refreshTagsGrid() {
    // Filtra as tags pelo campo de busca e re-renderiza o grid.
    var grid = document.getElementById('tags-grid');
    if (!grid) return;
    var q = (_configTagsSearch || '').toLowerCase();
    var filtered = _configTags.filter(function (t) {
        return !q || (t.name || '').toLowerCase().includes(q);
    });
    if (!filtered.length) {
        grid.innerHTML = '<p class="config-empty">Nenhuma tag encontrada.</p>';
        return;
    }
    grid.innerHTML = filtered.map(_buildTagCard).join('');
}

function _onTagsSearch(value) {
    // Atualiza o filtro de busca de tags e re-renderiza o grid.
    _configTagsSearch = value;
    _refreshTagsGrid();
}

function _reloadTagsTab() {
    // Recarrega a lista de tags na aba ativa.
    var contentEl = document.getElementById('config-tab-content');
    if (!contentEl) return;
    contentEl.innerHTML = '<p class="config-loading">Carregando...</p>';
    Promise.all([
        fetch('/api/tags').then(function (r) { return r.json(); }),
        fetch('/api/folders').then(function (r) { return r.json(); }),
    ]).then(function (results) {
        var tags = results[0].ok ? results[0].data : [];
        var dashMap = {}, folderMap = {};
        if (results[1].ok && results[1].data.dashboards) {
            results[1].data.dashboards.forEach(function (d) { dashMap[d.id] = d.title; });
        }
        if (results[1].ok && results[1].data.folders) {
            results[1].data.folders.forEach(function (f) { folderMap[f.id] = f.name; });
        }
        contentEl.innerHTML = _renderTagsSection(tags, dashMap, folderMap);
        _refreshTagsGrid();
    });
}

async function openTagModal(tag) {
    // Abre o modal de criação (tag=null) ou edição (tag=objeto) de tag, com seção de vínculo.
    var isEdit = tag && tag.id;
    var overlay = document.createElement('div');
    overlay.id = 'tag-modal-overlay';
    overlay.onclick = closeTagModal;

    var modal = document.createElement('div');
    modal.id = 'tag-modal';
    modal.innerHTML = '<div id="tag-modal-header">'
        + '<h2 id="tag-modal-title">' + (isEdit ? 'Editar Tag' : 'Nova Tag') + '</h2>'
        + '<button id="tag-modal-close" onclick="closeTagModal()">&#x2715;</button>'
        + '</div>'
        + '<div id="tag-modal-error"></div>'
        + '<form id="tag-form" onsubmit="submitTagModal(event)">'
        + '<div class="folder-field">'
        + '<label for="tag-input-name">Nome</label>'
        + '<input id="tag-input-name" type="text" name="name" placeholder="Ex: Financeiro" required value="' + _escHtml(isEdit ? tag.name : '') + '" />'
        + '</div>'
        + '<div class="folder-field">'
        + '<label for="tag-input-desc">Descrição <span style="color:var(--text-secondary);font-weight:400">(opcional)</span></label>'
        + '<input id="tag-input-desc" type="text" name="description" placeholder="Descrição da tag" value="' + _escHtml(isEdit ? (tag.description || '') : '') + '" />'
        + '</div>'
        + '<div class="folder-field">'
        + '<label for="tag-input-color">Cor</label>'
        + '<div id="tag-color-row">'
        + '<input id="tag-input-color" type="color" name="color" value="' + (isEdit ? (tag.color || '#1B2CC1') : '#1B2CC1') + '" />'
        + '<span id="tag-color-preview" style="background:' + (isEdit ? (tag.color || '#1B2CC1') : '#1B2CC1') + '"></span>'
        + '</div>'
        + '</div>'
        + '<div id="tag-modal-divider"></div>'
        + '<label class="tag-link-section-label" style="margin-top:4px">VINCULAR</label>'
        + '<div id="tag-link-search-wrap">'
        + '<input id="tag-link-search" type="text" placeholder="Buscar pasta ou dashboard..." autocomplete="off" oninput="_filterTagLinkList(this.value)" />'
        + '</div>'
        + '<div id="tag-dash-list"><p class="config-loading">Carregando...</p></div>'
        + '<div id="tag-modal-actions">'
        + (isEdit ? '<button type="button" class="config-btn config-btn-reject" onclick="deleteTagConfirm(\'' + _escHtml(tag.id) + '\')">Excluir</button>' : '')
        + '<button id="tag-btn-cancel" type="button" onclick="closeTagModal()">Cancelar</button>'
        + '<button id="tag-btn-submit" type="submit">' + (isEdit ? 'Salvar' : 'Criar tag') + '</button>'
        + '</div>'
        + '</form>';

    if (isEdit) modal.dataset.tagId = tag.id;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    var colorInput = document.getElementById('tag-input-color');
    var preview = document.getElementById('tag-color-preview');
    if (colorInput && preview) {
        colorInput.addEventListener('input', function () {
            preview.style.background = colorInput.value;
        });
    }

    document.getElementById('tag-input-name').focus();

    // Carrega pastas e dashboards para a seção de vínculo
    try {
        var res = await fetch('/api/folders').then(function (r) { return r.json(); });
        var folders = res.ok ? (res.data.folders || []) : [];
        var dashes = res.ok ? (res.data.dashboards || []) : [];
        var linkedFolders = isEdit ? (tag.folder_ids || []) : [];
        var linkedDashes = isEdit ? (tag.dashboard_ids || []) : [];
        var listEl = document.getElementById('tag-dash-list');
        if (listEl) listEl.innerHTML = _renderTagLinkList(folders, dashes, linkedFolders, linkedDashes, '');
    } catch (e) {
        var listEl = document.getElementById('tag-dash-list');
        if (listEl) listEl.innerHTML = '<p class="config-error">Erro ao carregar itens.</p>';
    }
}

function closeTagModal() {
    // Fecha e remove o modal de tag do DOM.
    var overlay = document.getElementById('tag-modal-overlay');
    var modal = document.getElementById('tag-modal');
    if (overlay) overlay.remove();
    if (modal) modal.remove();
}

async function submitTagModal(e) {
    // Envia o formulário do modal: cria ou atualiza a tag via API.
    e.preventDefault();
    var modal = document.getElementById('tag-modal');
    var errorEl = document.getElementById('tag-modal-error');
    var btn = document.getElementById('tag-btn-submit');
    var name = document.getElementById('tag-input-name').value.trim();
    var description = document.getElementById('tag-input-desc').value.trim();
    var color = document.getElementById('tag-input-color').value;
    var tagId = modal ? modal.dataset.tagId : null;

    btn.disabled = true;
    btn.textContent = tagId ? 'Salvando...' : 'Criando...';
    errorEl.textContent = '';

    var folderIds = Array.from(document.querySelectorAll('.tag-link-folder-cb:checked')).map(function (c) { return c.value; });
    var dashIds = Array.from(document.querySelectorAll('.tag-link-dash-cb:checked')).map(function (c) { return c.value; });

    try {
        var url = tagId ? '/api/tags/' + encodeURIComponent(tagId) : '/api/tags';
        var method = tagId ? 'PUT' : 'POST';
        var res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, description: description, color: color, dashboard_ids: dashIds, folder_ids: folderIds }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Erro ao salvar tag');
        closeTagModal();
        _reloadTagsTab();
    } catch (err) {
        errorEl.textContent = err.message;
        btn.disabled = false;
        btn.textContent = tagId ? 'Salvar' : 'Criar tag';
    }
}

async function openTagDashModal(tagId) {
    // Abre modal para vincular pastas e dashboards à tag selecionada.
    var overlay = document.createElement('div');
    overlay.id = 'tag-modal-overlay';
    overlay.onclick = closeTagModal;

    var modal = document.createElement('div');
    modal.id = 'tag-modal';
    modal.innerHTML = '<div id="tag-modal-header">'
        + '<h2 id="tag-modal-title">Vincular à Tag</h2>'
        + '<button id="tag-modal-close" onclick="closeTagModal()">&#x2715;</button>'
        + '</div>'
        + '<div id="tag-modal-error"></div>'
        + '<div id="tag-link-search-wrap">'
        + '<input id="tag-link-search" type="text" placeholder="Buscar pasta ou dashboard..." autocomplete="off" oninput="_filterTagLinkList(this.value)" />'
        + '</div>'
        + '<div id="tag-dash-list"><p class="config-loading">Carregando...</p></div>'
        + '<div id="tag-modal-actions">'
        + '<button id="tag-btn-cancel" type="button" onclick="closeTagModal()">Cancelar</button>'
        + '<button id="tag-btn-submit" onclick="submitTagDashes(\'' + tagId + '\')">Salvar</button>'
        + '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    document.getElementById('tag-link-search').focus();

    try {
        var results = await Promise.all([
            fetch('/api/folders').then(function (r) { return r.json(); }),
            fetch('/api/tags').then(function (r) { return r.json(); }),
        ]);

        var foldersData = results[0].ok ? results[0].data : { folders: [], dashboards: [] };
        var folders = foldersData.folders || [];
        var dashes = foldersData.dashboards || [];

        var tag = (results[1].ok ? results[1].data : []).find(function (t) { return t.id === tagId; });
        var linkedDashes = tag ? (tag.dashboard_ids || []) : [];
        var linkedFolders = tag ? (tag.folder_ids || []) : [];

        var listEl = document.getElementById('tag-dash-list');
        if (!listEl) return;

        listEl.innerHTML = _renderTagLinkList(folders, dashes, linkedFolders, linkedDashes, '');

    } catch (e) {
        var listEl = document.getElementById('tag-dash-list');
        if (listEl) listEl.innerHTML = '<p class="config-error">Erro ao carregar dados.</p>';
    }
}

// Cache para filtro do modal de vínculo
var _tagLinkFolders = [];
var _tagLinkDashes = [];
var _tagLinkLinkedFolders = [];
var _tagLinkLinkedDashes = [];

function _renderTagLinkList(folders, dashes, linkedFolders, linkedDashes, q) {
    // Renderiza as seções de pastas e dashboards com checkboxes filtrados pela query.
    _tagLinkFolders = folders;
    _tagLinkDashes = dashes;
    _tagLinkLinkedFolders = linkedFolders;
    _tagLinkLinkedDashes = linkedDashes;

    var ql = (q || '').toLowerCase();

    var filteredFolders = folders.filter(function (f) {
        return !ql || (f.name || '').toLowerCase().includes(ql);
    });
    var filteredDashes = dashes.filter(function (d) {
        return !ql || (d.title || '').toLowerCase().includes(ql);
    });

    var html = '';

    if (filteredFolders.length) {
        html += '<p class="tag-link-section-label">PASTAS</p>'
            + '<div class="tag-link-group">'
            + filteredFolders.map(function (f) {
                var checked = linkedFolders.includes(f.id) ? 'checked' : '';
                return '<label class="tag-dash-item">'
                    + '<input type="checkbox" class="tag-link-folder-cb" value="' + _escHtml(f.id) + '" ' + checked + ' />'
                    + '<img src="' + (window._folderIconBlack || '') + '" class="tag-link-folder-icon" alt="" />'
                    + '<span class="tag-dash-title">' + _escHtml(f.name) + '</span>'
                    + '</label>';
            }).join('')
            + '</div>';
    }

    if (filteredDashes.length) {
        html += '<p class="tag-link-section-label">DASHBOARDS</p>'
            + '<div class="tag-link-group">'
            + filteredDashes.map(function (d) {
                var checked = linkedDashes.includes(d.id) ? 'checked' : '';
                return '<label class="tag-dash-item">'
                    + '<input type="checkbox" class="tag-link-dash-cb" value="' + _escHtml(d.id) + '" ' + checked + ' />'
                    + '<span class="tag-dash-title">&#9632; ' + _escHtml(d.title) + '</span>'
                    + '</label>';
            }).join('')
            + '</div>';
    }

    if (!filteredFolders.length && !filteredDashes.length) {
        html = '<p class="config-empty">Nenhum resultado encontrado.</p>';
    }

    return html;
}

function _filterTagLinkList(q) {
    // Filtra a lista de pastas e dashboards no modal de vínculo em tempo real.
    var listEl = document.getElementById('tag-dash-list');
    if (!listEl) return;

    var checkedFolders = Array.from(document.querySelectorAll('.tag-link-folder-cb:checked')).map(function (c) { return c.value; });
    var checkedDashes = Array.from(document.querySelectorAll('.tag-link-dash-cb:checked')).map(function (c) { return c.value; });

    listEl.innerHTML = _renderTagLinkList(
        _tagLinkFolders, _tagLinkDashes,
        checkedFolders.length ? checkedFolders : _tagLinkLinkedFolders,
        checkedDashes.length ? checkedDashes : _tagLinkLinkedDashes,
        q
    );
}

async function submitTagDashes(tagId) {
    // Salva pastas e dashboards vinculados à tag via PUT /api/tags/:id.
    var folderCbs = document.querySelectorAll('.tag-link-folder-cb');
    var dashCbs = document.querySelectorAll('.tag-link-dash-cb');
    var folderIds = Array.from(folderCbs).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
    var dashIds = Array.from(dashCbs).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });

    var btn = document.getElementById('tag-btn-submit');
    var errorEl = document.getElementById('tag-modal-error');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
        var res = await fetch('/api/tags/' + encodeURIComponent(tagId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dashboard_ids: dashIds, folder_ids: folderIds }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Erro ao salvar');
        closeTagModal();
        _reloadTagsTab();
    } catch (err) {
        if (errorEl) errorEl.textContent = err.message;
        btn.disabled = false;
        btn.textContent = 'Salvar';
    }
}

function deleteTagConfirm(tagId) {
    // Abre modal de confirmação antes de excluir a tag.
    var overlay = document.createElement('div');
    overlay.id = 'tag-delete-overlay';

    var modal = document.createElement('div');
    modal.id = 'tag-delete-modal';
    modal.innerHTML = '<div id="tag-delete-icon">&#128465;</div>'
        + '<div id="tag-delete-title">Excluir tag?</div>'
        + '<div id="tag-delete-msg">Esta ação não pode ser desfeita. A tag será removida permanentemente e desvinculada de todos os dashboards.</div>'
        + '<div id="tag-delete-actions">'
        + '<button id="tag-delete-cancel" onclick="_closeDeleteModal()">Cancelar</button>'
        + '<button id="tag-delete-confirm" onclick="_confirmDeleteTag(\'' + tagId + '\')">Excluir</button>'
        + '</div>';

    overlay.onclick = _closeDeleteModal;
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
}

function _closeDeleteModal() {
    // Fecha e remove o modal de confirmação de exclusão.
    var overlay = document.getElementById('tag-delete-overlay');
    var modal = document.getElementById('tag-delete-modal');
    if (overlay) overlay.remove();
    if (modal) modal.remove();
}

async function _confirmDeleteTag(tagId) {
    // Executa a exclusão da tag via DELETE /api/tags/:id após confirmação no modal.
    var btn = document.getElementById('tag-delete-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Excluindo...'; }
    try {
        var res = await fetch('/api/tags/' + encodeURIComponent(tagId), { method: 'DELETE' });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Erro ao excluir tag');
        _closeDeleteModal();
        closeTagModal();
        _reloadTagsTab();
    } catch (err) {
        _closeDeleteModal();
        var errorEl = document.getElementById('tag-modal-error');
        if (errorEl) errorEl.textContent = err.message;
    }
}

async function loadConfigPanel() {
    // Carrega o painel de configuração: monta o layout e busca usuários + solicitações em paralelo.
    var area = document.getElementById("folder-content");
    if (!area) return;

    _currentConfigTab = 'usuarios';

    area.innerHTML = '<h1 id="folder-content-title">Painel de Configuração</h1>'
        + '<hr id="content-separator" />'
        + '<div id="config-summary-placeholder"></div>'
        + _renderConfigNav(_currentConfigTab)
        + '<div id="config-tab-content"><p class="config-loading">Carregando...</p></div>';

    try {
        var results = await Promise.all([
            fetch("/api/users").then(function (r) { return r.json(); }),
            fetch("/api/requests").then(function (r) { return r.json(); }),
            fetch("/api/tags").then(function (r) { return r.json(); }),
        ]);
        var users = results[0].ok ? results[0].data : [];
        var requests = results[1].ok ? results[1].data : [];
        var tags = results[2].ok ? results[2].data : [];

        var summaryEl = document.getElementById("config-summary-placeholder");
        if (summaryEl) {
            summaryEl.outerHTML = _renderConfigSummary(users.length, requests.length, tags.length);
        }

        var contentEl = document.getElementById("config-tab-content");
        if (contentEl) {
            contentEl.innerHTML = _renderRequestsSection(requests) + _renderUsersSection(users);
            _refreshUsersTable();
        }
    } catch (e) {
        var contentEl = document.getElementById("config-tab-content");
        if (contentEl) contentEl.innerHTML = '<p class="config-error">Erro ao carregar dados.</p>';
    }
}

async function approveRequest(reqId) {
    // Aprova uma solicitação via POST /api/requests/:id/approve e recarrega o painel.
    try {
        var res = await fetch("/api/requests/" + reqId + "/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: [] }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "Erro ao aprovar");
        loadConfigPanel();
    } catch (e) {
        alert(e.message);
    }
}

async function rejectRequest(reqId) {
    // Rejeita uma solicitação via POST /api/requests/:id/reject e recarrega o painel.
    try {
        var res = await fetch("/api/requests/" + reqId + "/reject", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note: "" }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "Erro ao rejeitar");
        loadConfigPanel();
    } catch (e) {
        alert(e.message);
    }
}

async function changeUserRole(email, role) {
    // Atualiza o perfil do usuário via PUT /api/users/:email.
    try {
        var res = await fetch("/api/users/" + encodeURIComponent(email), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: role }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "Erro ao atualizar perfil");
    } catch (e) {
        alert(e.message);
        loadConfigPanel();
    }
}

async function toggleUserIA(email, enabled) {
    // Habilita ou desabilita o acesso à IA para o usuário via PUT /api/users/:email.
    try {
        var res = await fetch("/api/users/" + encodeURIComponent(email), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ia_enabled: enabled }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "Erro ao atualizar IA");
    } catch (e) {
        alert(e.message);
        loadConfigPanel();
    }
}

async function toggleUserActive(email, currentActive) {
    // Ativa ou desativa um usuário via PUT /api/users/:email e recarrega o painel.
    try {
        var res = await fetch("/api/users/" + encodeURIComponent(email), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: !currentActive }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "Erro ao atualizar usuário");
        loadConfigPanel();
    } catch (e) {
        alert(e.message);
    }
}
