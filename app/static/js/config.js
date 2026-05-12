var _currentConfigTab = 'usuarios';

function _renderConfigNav(activeTab) {
    var tabs = [
        { id: 'usuarios', label: 'Usuários' },
    ];
    return '<nav id="config-nav">'
        + tabs.map(function (t) {
            return '<button class="config-nav-tab' + (t.id === activeTab ? ' config-nav-tab-active' : '') + '"'
                + ' onclick="switchConfigTab(\'' + t.id + '\')">' + t.label + '</button>';
        }).join('')
        + '</nav>';
}

function switchConfigTab(tab) {
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
        }).catch(function () {
            contentEl.innerHTML = '<p class="config-error">Erro ao carregar dados.</p>';
        });
    }
}

function _formatDate(str) {
    if (!str) return '';
    return new Date(str).toLocaleDateString('pt-BR');
}

function _roleBadge(role) {
    var styles = {
        ADMIN:   'color:#EF4444;background:#FEE2E2',
        MANAGER: 'color:#8B5CF6;background:#EDE9FE',
        BA:      'color:#1B2CC1;background:#EEF0FF',
        USER:    'color:#6B7280;background:#F3F4F6',
    };
    return '<span class="config-badge" style="' + (styles[role] || styles.USER) + '">' + _escHtml(role) + '</span>';
}

function _statusBadge(isActive) {
    return isActive
        ? '<span class="config-badge config-badge-active">Ativo</span>'
        : '<span class="config-badge config-badge-inactive">Inativo</span>';
}

function _renderRequestsSection(requests) {
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
    var safeEmail = email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var roles = ['USER', 'BA', 'MANAGER', 'ADMIN'];
    return '<select class="config-role-select" onchange="changeUserRole(\'' + safeEmail + '\',this.value)">'
        + roles.map(function (r) {
            return '<option value="' + r + '"' + (r === currentRole ? ' selected' : '') + '>' + r + '</option>';
        }).join('')
        + '</select>';
}

function _renderUsersSection(users) {
    return '<div class="config-section">'
        + '<p class="content-section-label">Usuários</p>'
        + '<table class="config-table"><thead><tr>'
        + '<th>Nome</th><th>Email</th><th>Perfil</th><th>Status</th><th>Ações</th>'
        + '</tr></thead><tbody>'
        + users.map(function (u) {
            var safeEmail = u.email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return '<tr>'
                + '<td>' + _escHtml(u.name) + '</td>'
                + '<td>' + _escHtml(u.email) + '</td>'
                + '<td>' + _roleSelect(u.email, u.role) + '</td>'
                + '<td>' + _statusBadge(u.is_active) + '</td>'
                + '<td>'
                + (u.is_active
                    ? '<button class="config-btn config-btn-deactivate" onclick="toggleUserActive(\'' + safeEmail + '\',true)">Desativar</button>'
                    : '<button class="config-btn config-btn-activate" onclick="toggleUserActive(\'' + safeEmail + '\',false)">Ativar</button>')
                + '</td>'
                + '</tr>';
        }).join('')
        + '</tbody></table></div>';
}

async function loadConfigPanel() {
    var area = document.getElementById("folder-content");
    if (!area) return;

    _currentConfigTab = 'usuarios';

    area.innerHTML = '<h1 id="folder-content-title">Painel de Configuração</h1>'
        + '<hr id="content-separator" />'
        + _renderConfigNav(_currentConfigTab)
        + '<div id="config-tab-content"><p class="config-loading">Carregando...</p></div>';

    try {
        var results = await Promise.all([
            fetch("/api/users").then(function (r) { return r.json(); }),
            fetch("/api/requests").then(function (r) { return r.json(); }),
        ]);
        var users = results[0].ok ? results[0].data : [];
        var requests = results[1].ok ? results[1].data : [];

        var contentEl = document.getElementById("config-tab-content");
        if (contentEl) {
            contentEl.innerHTML = _renderRequestsSection(requests) + _renderUsersSection(users);
        }
    } catch (e) {
        var contentEl = document.getElementById("config-tab-content");
        if (contentEl) contentEl.innerHTML = '<p class="config-error">Erro ao carregar dados.</p>';
    }
}

async function approveRequest(reqId) {
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

async function toggleUserActive(email, currentActive) {
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
