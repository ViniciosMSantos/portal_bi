function _populateParentSelect(folders, prefix) {
    folders.forEach(function (f) {
        var opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = prefix + f.name;
        document.getElementById("folder-input-parent").appendChild(opt);
        if (f.children && f.children.length) {
            _populateParentSelect(f.children, prefix + "  ");
        }
    });
}

function _buildParentTree(folders) {
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

function openFolderModal() {
    document.getElementById("folder-modal-overlay").style.display = "block";
    document.getElementById("folder-modal").style.display = "flex";
    document.getElementById("folder-modal-error").textContent = "";
    document.getElementById("folder-form").reset();
    document.getElementById("folder-input-name").focus();

    var sel = document.getElementById("folder-input-parent");
    sel.innerHTML = '<option value="">Nenhuma (pasta raiz)</option>';
    fetch("/api/folders")
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.ok) return;
            _populateParentSelect(_buildParentTree(data.data.folders || []), "");
        });
}

function closeFolderModal() {
    document.getElementById("folder-modal-overlay").style.display = "none";
    document.getElementById("folder-modal").style.display = "none";
}

async function submitFolder(e) {
    e.preventDefault();
    var btn = document.getElementById("folder-btn-submit");
    var errorEl = document.getElementById("folder-modal-error");
    var name = document.getElementById("folder-input-name").value.trim();
    var parent_id = document.getElementById("folder-input-parent").value;
    var description = document.getElementById("folder-input-desc").value.trim();

    btn.disabled = true;
    btn.textContent = "Criando...";
    errorEl.textContent = "";

    try {
        var res = await fetch("/api/folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, parent_id: parent_id, description: description }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "Erro ao criar pasta");
        closeFolderModal();
        reloadFolders();
    } catch (err) {
        errorEl.textContent = err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = "Criar pasta";
    }
}
