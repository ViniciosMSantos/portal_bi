function _populateFolderSelect(selectId, folders, parentId, prefix) {
    folders.forEach(function (f) {
        var opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = prefix + f.name;
        document.getElementById(selectId).appendChild(opt);
        if (f.children && f.children.length) {
            _populateFolderSelect(selectId, f.children, f.id, prefix + "  ");
        }
    });
}

function _buildFolderTree(folders) {
    var map = {}, roots = [];
    folders.forEach(function (f) { map[f.id] = Object.assign({}, f, { children: [] }); });
    folders.forEach(function (f) {
        if (f.parent_id && map[f.parent_id]) {
            map[f.parent_id].children.push(map[f.id]);
        } else {
            roots.push(map[f.id]);
        }
    });
    return roots;
}

function openDashboardModal() {
    document.getElementById("dashboard-modal-overlay").style.display = "block";
    document.getElementById("dashboard-modal").style.display = "flex";
    document.getElementById("dashboard-modal-error").textContent = "";
    document.getElementById("dashboard-form").reset();
    document.getElementById("dashboard-input-title").focus();

    var sel = document.getElementById("dashboard-input-folder");
    sel.innerHTML = '<option value="">Selecione uma pasta...</option>';
    fetch("/api/folders")
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.ok) return;
            _populateFolderSelect("dashboard-input-folder", _buildFolderTree(data.data.folders || []), null, "");
        });
}

function closeDashboardModal() {
    document.getElementById("dashboard-modal-overlay").style.display = "none";
    document.getElementById("dashboard-modal").style.display = "none";
}

async function submitDashboard(e) {
    e.preventDefault();
    var btn = document.getElementById("dashboard-btn-submit");
    var errorEl = document.getElementById("dashboard-modal-error");
    var title = document.getElementById("dashboard-input-title").value.trim();
    var url = document.getElementById("dashboard-input-url").value.trim();
    var link_type = document.getElementById("dashboard-input-type").value;
    var folder_id = document.getElementById("dashboard-input-folder").value;
    var description = document.getElementById("dashboard-input-desc").value.trim();

    btn.disabled = true;
    btn.textContent = "Criando...";
    errorEl.textContent = "";

    try {
        var res = await fetch("/api/dashboards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: title, url: url, link_type: link_type, folder_id: folder_id, description: description }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "Erro ao criar dashboard");
        closeDashboardModal();
        reloadFolders();
    } catch (err) {
        errorEl.textContent = err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = "Criar dashboard";
    }
}
